"""Permission-gated public post adapters. No cookies, sessions or login fallback.

Parsers are pure so recorded responses can be tested without contacting a site.
The access switches attest to written permission for anonymous automated access,
not merely ownership of a Skwirl account. See docs/SOCIAL_SOURCES.md.
"""
from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import threading
import tempfile
import time
from html.parser import HTMLParser
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

import httpx

from .fetch import FetchError, MediaBundle, MediaItem

USER_AGENT = "Skwirl/0.1 (+https://skwirl.app; contact: support@skwirl.app)"
PAGE_HOSTS = ("reddit.com", "redd.it", "linkedin.com", "lnkd.in")
MEDIA_HOSTS = ("redd.it", "redditmedia.com", "redditstatic.com", "licdn.com", "linkedin.com")
MAX_BYTES = 80 * 1024 * 1024
_lock = threading.Lock()
_next_request = 0.0


def _host_allowed(raw: str, domains: tuple[str, ...]) -> bool:
    try:
        u = urlsplit(raw)
        return (u.scheme == "https" and not u.username and not u.password
                and u.port in (None, 443)
                and any(u.hostname == d or (u.hostname or "").endswith("." + d) for d in domains))
    except ValueError:
        return False


def platform(raw: str) -> str:
    if not _host_allowed(raw, PAGE_HOSTS):
        return ""
    host = urlsplit(raw).hostname or ""
    return "Reddit" if host == "redd.it" or host.endswith(".redd.it") or host == "reddit.com" or host.endswith(".reddit.com") else "LinkedIn"


def normalise_url(raw: str) -> str:
    source = platform(raw)
    if not source or len(raw) > 500:
        raise FetchError("link isn't from a supported site")
    u = urlsplit(raw)
    path = unquote(u.path)
    if source == "Reddit":
        match = re.fullmatch(r"/(?:r/[^/]+/)?comments/([a-z0-9]+)(?:/[^/]*)?(?:/[a-z0-9]+)?/?(?:\.json)?", path, re.I)
        if u.hostname == "redd.it" or (u.hostname or "").endswith(".redd.it"):
            match = re.fullmatch(r"/([a-z0-9]+)/?", path, re.I)
        if match:
            return f"https://www.reddit.com/comments/{match[1].lower()}/"
        if re.fullmatch(r"/r/[^/]+/s/[a-z0-9]+/?", path, re.I):
            return urlunsplit(("https", "www.reddit.com", path, "", ""))
    else:
        if (u.hostname == "lnkd.in" or (u.hostname or "").endswith(".lnkd.in")) and re.fullmatch(r"/[\w-]+/?", path):
            return urlunsplit(("https", "lnkd.in", path, "", ""))
        if re.fullmatch(r"/posts/[^/]+/?", path) or re.fullmatch(r"/feed/update/urn:li:activity:\d+/?", path):
            return urlunsplit(("https", "www.linkedin.com", path.rstrip("/") + "/", "", ""))
    raise FetchError(f"{source}: use a link to one post")


def _permission(source: str) -> None:
    if os.environ.get(f"STASH_{source.upper()}_PUBLIC_ACCESS") != "approved":
        detail = " Anonymous Reddit API access is unavailable." if source == "Reddit" else ""
        raise FetchError(f"{source} saving needs platform access approval.{detail}")


def _get(client: httpx.Client, raw: str, *, media: bool = False) -> tuple[bytes, str]:
    """Bounded, allowlisted redirects; never forward a URL to another origin family."""
    global _next_request
    domains = MEDIA_HOSTS if media else PAGE_HOSTS
    url = raw
    for _ in range(6):
        if not _host_allowed(url, domains):
            raise FetchError("public post redirected outside its supported site")
        # At most 30 requests/minute/process, including redirects. A denial is
        # terminal for this attempt: no retries, proxy, alternate host or cookies.
        with _lock:
            time.sleep(max(0, _next_request - time.monotonic()))
            _next_request = time.monotonic() + 2
        client.cookies.clear()  # anonymous requests never reuse a server session
        with client.stream("GET", url) as response:
            if response.is_redirect:
                url = urljoin(url, response.headers.get("location", ""))
                continue
            source = "Reddit" if "reddit" in (urlsplit(raw).hostname or "") or (urlsplit(raw).hostname or "").endswith("redd.it") else "LinkedIn"
            if response.status_code == 429:
                try:
                    retry = min(3600, max(60, float(response.headers.get("retry-after", "60"))))
                except ValueError:
                    try:
                        retry = max(60, (parsedate_to_datetime(response.headers["retry-after"]) - datetime.now(timezone.utc)).total_seconds())
                    except (ValueError, KeyError, TypeError):
                        retry = 60
                with _lock:
                    _next_request = max(_next_request, time.monotonic() + retry)
                raise FetchError(f"{source} rate limit reached. Try again later.")
            if response.status_code in (401, 403, 999):
                raise FetchError(f"{source} denied public access (HTTP {response.status_code}). It may require sign-in or platform approval.")
            if response.status_code != 200:
                raise FetchError(f"{source} post unavailable (HTTP {response.status_code})")
            if source == "Reddit":
                try:
                    if float(response.headers.get("x-ratelimit-remaining", "1")) <= 0:
                        reset = max(2, float(response.headers.get("x-ratelimit-reset", "60")))
                        with _lock:
                            _next_request = max(_next_request, time.monotonic() + reset)
                except ValueError:
                    pass
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > (MAX_BYTES if media else 8 * 1024 * 1024):
                    raise FetchError(f"{source} post is too large to download")
                chunks.append(chunk)
            return b"".join(chunks), url
    raise FetchError("public post has too many redirects")


def parse_reddit(payload: object) -> MediaBundle:
    try:
        post = payload[0]["data"]["children"][0]["data"]
    except (TypeError, KeyError, IndexError) as exc:
        raise FetchError("Reddit returned no public post") from exc
    if post.get("removed_by_category") or post.get("selftext") in ("[removed]", "[deleted]"):
        raise FetchError("Reddit post is deleted or removed")
    comments = []
    try:
        children = payload[1]["data"]["children"]
    except (TypeError, KeyError, IndexError):
        children = []
    for child in sorted(children, key=lambda c: c.get("data", {}).get("score", 0) or 0, reverse=True):
        c = child.get("data", {})
        if child.get("kind") == "t1" and c.get("body") not in (None, "[removed]", "[deleted]") and c.get("author") != "AutoModerator":
            comments.append(f"u/{c.get('author') or '[deleted]'}: {c['body'][:1600]}")
    items = []
    # A crosspost's own title/body stays primary; its attached media is inherited.
    media_post = (post.get("crosspost_parent_list") or [post])[0]
    video = (media_post.get("secure_media") or media_post.get("media") or {}).get("reddit_video")
    if video:
        # DASH contains both adaptation sets. Never use fallback_url (often silent).
        dash = html.unescape(video.get("dash_url") or "")
        if not dash:
            raise FetchError("Reddit video has no public DASH audio/video manifest")
        items.append(MediaItem(1, "video", source_url=dash, duration=float(video.get("duration") or 0)))
    elif media_post.get("gallery_data"):
        metadata = media_post.get("media_metadata") or {}
        for entry in media_post["gallery_data"].get("items", []):
            data = metadata.get(entry.get("media_id"), {})
            image = (data.get("s") or {}).get("u") or (data.get("s") or {}).get("gif")
            if image:
                items.append(MediaItem(len(items) + 1, "image", source_url=html.unescape(image)))
    else:
        image = html.unescape(media_post.get("url_overridden_by_dest") or media_post.get("url") or "")
        if (urlsplit(image).hostname or "").endswith("redd.it") and Path(urlsplit(image).path).suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            items.append(MediaItem(1, "image", source_url=image))
    title = html.unescape(post.get("title") or "")
    body = html.unescape(post.get("selftext") or "")
    if not title and not body and not items:
        raise FetchError("Reddit returned no usable public post content")
    return MediaBundle(items, "reddit-public", title=title, uploader=post.get("author") or "", caption=f"{title}\n\n{body}".strip(), comments=comments[:8])


class _LinkedInHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.media, self.text = {}, [], []
        self._depth = 0
        self._video = None
        self.document_seen = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and a.get("content"):
            self.meta[a.get("property") or a.get("name")] = a["content"]
        if self._depth:
            if tag not in ("br", "img", "meta", "source", "input", "hr", "link", "wbr"):
                self._depth += 1
            if tag == "br":
                self.text.append("\n")
        elif "attributed-text-segment-list__content" in a.get("class", "").split():
            self._depth = 1
        if tag == "img" and "feedshare" in a.get("class", ""):
            self.media.append(("image", a.get("data-delayed-url") or a.get("src") or ""))
        if tag == "video":
            self._video = []
            self.media.append(("video", self._video))
            if a.get("src"):
                self._video.append({"src": a["src"]})
            if a.get("data-sources"):
                try:
                    sources = json.loads(a["data-sources"])
                    if isinstance(sources, list):
                        self._video.extend(x for x in sources if isinstance(x, dict) and x.get("src"))
                except (ValueError, TypeError):
                    pass
        if tag == "source" and self._video is not None and a.get("src"):
            self._video.append({"src": a["src"], "type": a.get("type", "")})
        if "document" in a.get("class", "").lower() or a.get("data-document-url"):
            self.document_seen = True
        if tag in ("a", "iframe"):
            url = a.get("data-document-url") or a.get("href") or a.get("src") or ""
            if urlsplit(url).path.lower().endswith(".pdf") or "document-pdf" in urlsplit(url).path.lower() or a.get("data-document-url"):
                self.media.append(("document", url))

    def handle_endtag(self, tag):
        if tag == "video":
            self._video = None
        if self._depth:
            self._depth -= 1

    def handle_data(self, data):
        if self._depth:
            self.text.append(data)


def parse_linkedin(raw: str) -> MediaBundle:
    page = _LinkedInHTML()
    page.feed(raw)
    body = "".join(page.text).strip()
    title = page.meta.get("og:title", "")
    if not body:
        # OG descriptions can be truncated teasers. They are not a full post.
        raise FetchError("LinkedIn only shows this post to signed-in members (no public post body)")
    items, seen = [], set()
    for kind, value in page.media:
        if kind == "video":
            candidates = [v for v in value if ".mp4" in urlsplit(v["src"]).path.lower() or "mp4" in v.get("type", "")]
            if not candidates:
                raise FetchError("LinkedIn video has no public MP4; sign-in may be required")
            # data-sources contains alternative encodings of one clip.
            chosen = max(candidates, key=lambda v: float(v.get("height") or 0))
            value = chosen["src"]
        url = html.unescape(value)
        if url and url not in seen:
            seen.add(url)
            items.append(MediaItem(len(items) + 1, kind, source_url=url))
    if page.document_seen and not any(item.kind == "document" for item in items):
        raise FetchError("LinkedIn document pages aren't public; signed-in members may be required")
    return MediaBundle(items, "linkedin-public", title=title, caption=body, uploader=page.meta.get("author", ""))


def _download(client, url, target):
    data, _ = _get(client, url, media=True)
    if not data:
        raise FetchError("public media is empty")
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix=target.name + ".", suffix=".part", delete=False) as handle:
        partial = Path(handle.name)
    try:
        partial.write_bytes(data)
        partial.replace(target)
    finally:
        partial.unlink(missing_ok=True)


def _dash(client, url, key, directory):
    # Download the MPD and each referenced resource through our redirect guard.
    # ffmpeg must never follow arbitrary URLs embedded inside a remote manifest.
    import xml.etree.ElementTree as ET
    data, resolved = _get(client, url, media=True)
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise FetchError("Reddit returned an invalid DASH manifest") from exc
    videos, audios = [], []
    audio_expected = False
    for adaptation in root.findall(".//{*}AdaptationSet"):
        for rep in adaptation.findall("{*}Representation"):
            mime = rep.get("mimeType") or adaptation.get("mimeType") or adaptation.get("contentType", "")
            audio_expected = audio_expected or "audio" in mime
            base = rep.find("{*}BaseURL")
            if base is None or not base.text:
                continue
            candidate = (int(rep.get("bandwidth", 0)), urljoin(resolved, base.text.strip()))
            (audios if "audio" in mime else videos if "video" in mime else []).append(candidate)
    if not videos:
        raise FetchError("Reddit DASH has no downloadable video representation")
    video = directory / f"{key}-dash-video.mp4"
    _download(client, max(videos)[1], video)
    if audio_expected and not audios:
        raise FetchError("Reddit DASH audio is not publicly downloadable in a supported format")
    if not audios:
        return video  # genuine silent video, transcriber reports no audio
    audio = directory / f"{key}-dash-audio.m4a"
    _download(client, max(audios)[1], audio)
    output = directory / f"{key}-merged.mp4"
    if not shutil.which("ffmpeg"):
        raise FetchError("ffmpeg is required to combine Reddit video and audio")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(audio), "-c", "copy", str(output)], check=True, capture_output=True, timeout=300)
    return output


def fetch_public(permalink: str, key: str, directory: Path) -> MediaBundle:
    source = platform(permalink)
    _permission(source)
    url = normalise_url(permalink)
    try:
        # A fresh empty client never imports browser cookies or credentials.
        with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=45, follow_redirects=False, trust_env=False) as client:
            if urlsplit(url).hostname == "lnkd.in" or re.search(r"/r/[^/]+/s/", url):
                _, resolved = _get(client, url)
                if platform(resolved) != source:
                    raise FetchError(f"{source} share link does not point to a {source} post")
                url = normalise_url(resolved)
            data, _ = _get(client, url.rstrip("/") + ".json?sort=top&limit=8&raw_json=1" if source == "Reddit" else url)
            bundle = parse_reddit(json.loads(data)) if source == "Reddit" else parse_linkedin(data.decode("utf-8", errors="replace"))
            downloaded = []
            for item in bundle.items:
                if source == "Reddit" and item.kind == "video":
                    item.path = _dash(client, item.source_url, key, directory)
                else:
                    pdf = item.kind == "document" or urlsplit(item.source_url).path.lower().endswith(".pdf")
                    target = directory / f"{key}-{item.position:03d}{'.pdf' if pdf else '.mp4' if item.kind == 'video' else '.jpg'}"
                    _download(client, item.source_url, target)
                    with target.open("rb") as handle:
                        pdf = pdf or handle.read(5) == b"%PDF-"
                    if pdf:
                        if not shutil.which("pdftoppm") or not shutil.which("pdfinfo"):
                            raise FetchError("pdftoppm and pdfinfo are required for LinkedIn document carousels")
                        info = subprocess.run(["pdfinfo", str(target)], check=True, capture_output=True, text=True, timeout=30)
                        count = re.search(r"^Pages:\s+(\d+)", info.stdout, re.M)
                        if not count or not 1 <= int(count[1]) <= 40:
                            raise FetchError("LinkedIn document exceeds the 40-page capture limit")
                        prefix = directory / f"{key}-document-{item.position}"
                        for stale in directory.glob(prefix.name + "-*.jpg"):
                            stale.unlink()
                        subprocess.run(["pdftoppm", "-jpeg", "-scale-to", "1600", str(target), str(prefix)], check=True, capture_output=True, timeout=120)
                        pages = sorted(directory.glob(prefix.name + "-*.jpg"), key=lambda p: int(p.stem.rsplit("-", 1)[1]))
                        if len(pages) != int(count[1]):
                            raise FetchError("LinkedIn document could not be rendered completely")
                        for page in pages:
                            downloaded.append(MediaItem(len(downloaded) + 1, "image", item.source_url, page))
                        continue
                    item.path = target
                if item.kind == "video" and not item.duration and shutil.which("ffprobe"):
                    try:
                        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(item.path)], check=True, capture_output=True, text=True, timeout=60)
                        item.duration = float(probe.stdout.strip())
                    except (ValueError, subprocess.SubprocessError):
                        pass  # transcription/first-frame fallback still works
                item.position = len(downloaded) + 1
                downloaded.append(item)
            bundle.items = downloaded
            return bundle
    except (httpx.HTTPError, ValueError, TypeError, KeyError, IndexError, subprocess.SubprocessError) as exc:
        raise FetchError(f"{source} public post could not be read ({type(exc).__name__})") from exc

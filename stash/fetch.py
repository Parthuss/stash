"""Retrieve an Instagram post as an ordered collection of images and videos.

Instagram represents carousels as yt-dlp playlists. The ordering is part of the
content, so the pipeline keeps it instead of flattening the post to one file.
Reels still use yt-dlp's normal download path so audio/video merging continues
to work as before.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import httpx

from .config import CONFIG


class FetchError(RuntimeError):
    """The media could not be retrieved by any available route."""


@dataclass
class MediaItem:
    position: int
    kind: Literal["image", "video"]
    source_url: str = ""
    path: Path | None = None
    duration: float = 0.0
    headers: dict[str, str] = field(default_factory=dict)


@dataclass
class MediaBundle:
    items: list[MediaItem]
    via: str
    title: str = ""
    uploader: str = ""
    caption: str = ""


def _key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:20]


def _cached(key: str) -> Path | None:
    for candidate in CONFIG.media_dir.glob(f"{key}.*"):
        if candidate.suffix != ".json" and candidate.stat().st_size > 0:
            return candidate
    return None


def fetch(*, permalink: str | None, media_url: str | None = None) -> MediaBundle:
    """Retrieve all media in one capture while preserving carousel order."""
    CONFIG.ensure_dirs()
    source_url = media_url or permalink
    if not source_url:
        raise FetchError("capture has neither a permalink nor a media_url")

    key = _key(source_url)
    errors: list[str] = []
    if media_url:
        try:
            return MediaBundle(items=[_direct(media_url, key)], via="cdn")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"direct: {exc}")

    if permalink:
        try:
            return _yt_dlp(permalink, key)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"yt-dlp: {exc}")
        if CONFIG.cobalt_url:
            try:
                return MediaBundle(items=[_cobalt(permalink, key)], via="cobalt")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"cobalt: {exc}")

    raise FetchError("; ".join(errors) or "no route available")


def _cookie_args() -> list[str]:
    if CONFIG.cookies_file:
        cookies = Path(CONFIG.cookies_file).expanduser()
        if not cookies.exists():
            raise FetchError(f"STASH_COOKIES_FILE points at a missing file: {cookies}")
        return ["--cookies", str(cookies)]
    if CONFIG.cookies_from_browser:
        return ["--cookies-from-browser", CONFIG.cookies_from_browser]
    return []


def _metadata(permalink: str) -> dict[str, Any]:
    argv = [
        "yt-dlp", "--dump-single-json", "--skip-download",
        "--ignore-no-formats-error", "--no-warnings", *_cookie_args(), permalink,
    ]
    proc = subprocess.run(argv, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        raise FetchError(_tidy(proc.stderr or proc.stdout))
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise FetchError("yt-dlp returned invalid metadata") from exc


def _yt_dlp(permalink: str, key: str) -> MediaBundle:
    if not shutil.which("yt-dlp"):
        raise FetchError("yt-dlp is not installed (brew install yt-dlp)")
    meta = _metadata(permalink)
    planned = _items_from_metadata(meta)
    if not planned:
        raise FetchError("yt-dlp metadata contained no usable media")

    is_playlist = meta.get("_type") == "playlist" or len(planned) > 1
    if not is_playlist and planned[0].kind == "video":
        planned[0].path = _yt_dlp_video(permalink, key)
    else:
        for item in planned:
            suffix = ".jpg" if item.kind == "image" else _video_suffix(item.source_url)
            target = CONFIG.media_dir / f"{key}-{item.position:03d}{suffix}"
            if not target.exists() or target.stat().st_size == 0:
                _download(item.source_url, target, item.headers)
            item.path = target

    return MediaBundle(
        items=planned,
        via="yt-dlp",
        title=meta.get("title") or "",
        uploader=meta.get("uploader") or meta.get("channel") or "",
        caption=meta.get("description") or "",
    )


def _items_from_metadata(meta: dict[str, Any]) -> list[MediaItem]:
    """Turn yt-dlp's single-post or playlist JSON into ordered media items."""
    raw_entries = meta.get("entries") if meta.get("_type") == "playlist" else None
    entries = [entry for entry in (raw_entries or [meta]) if isinstance(entry, dict)]
    items: list[MediaItem] = []
    for position, entry in enumerate(entries, start=1):
        formats = [
            fmt for fmt in (entry.get("formats") or [])
            if isinstance(fmt, dict) and fmt.get("url") and fmt.get("vcodec") != "none"
        ]
        if formats:
            chosen = _best_video_format(formats)
            url = str(chosen.get("url") or "")
            kind: Literal["image", "video"] = "video"
        else:
            chosen = {}
            url = str(entry.get("thumbnail") or _last_thumbnail(entry) or "")
            kind = "image"
        if not url:
            continue
        headers = entry.get("http_headers") or chosen.get("http_headers") or {}
        items.append(MediaItem(
            position=position,
            kind=kind,
            source_url=url,
            duration=float(entry.get("duration") or 0.0),
            headers={str(key): str(value) for key, value in headers.items()},
        ))
    return items


def _best_video_format(formats: list[dict[str, Any]]) -> dict[str, Any]:
    combined = [fmt for fmt in formats if fmt.get("acodec") not in (None, "none")]
    candidates = combined or formats
    return max(
        candidates,
        key=lambda fmt: (
            float(fmt.get("height") or 0),
            float(fmt.get("tbr") or 0),
            float(fmt.get("filesize") or fmt.get("filesize_approx") or 0),
        ),
    )


def _last_thumbnail(entry: dict[str, Any]) -> str:
    for thumb in reversed(entry.get("thumbnails") or []):
        if isinstance(thumb, dict) and thumb.get("url"):
            return str(thumb["url"])
    return ""


def _yt_dlp_video(permalink: str, key: str) -> Path:
    if (hit := _cached(key)) is not None:
        return hit
    template = str(CONFIG.media_dir / f"{key}.%(ext)s")
    argv = [
        "yt-dlp", "--no-playlist", "--no-warnings", "--retries", "3",
        "-o", template, "--print-json", "--no-simulate", *_cookie_args(), permalink,
    ]
    proc = subprocess.run(argv, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        raise FetchError(_tidy(proc.stderr or proc.stdout))
    downloaded = _cached(key)
    if downloaded is None:
        raise FetchError("yt-dlp reported success but produced no file")
    return downloaded


def _direct(url: str, key: str) -> MediaItem:
    target = CONFIG.media_dir / f"{key}.mp4"
    if not target.exists() or target.stat().st_size == 0:
        _download(url, target)
    return MediaItem(position=1, kind="video", source_url=url, path=target)


def _download(url: str, target: Path, headers: dict[str, str] | None = None) -> None:
    request_headers = {"Referer": "https://www.instagram.com/", **(headers or {})}
    with httpx.stream(
        "GET", url, headers=request_headers, follow_redirects=True, timeout=120
    ) as response:
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_bytes(64 * 1024):
                handle.write(chunk)
    if target.stat().st_size == 0:
        target.unlink(missing_ok=True)
        raise FetchError("media server returned an empty body")


def _video_suffix(url: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    return suffix if suffix in {".mp4", ".mov", ".webm", ".m4v"} else ".mp4"


def _cobalt(permalink: str, key: str) -> MediaItem:
    response = httpx.post(
        CONFIG.cobalt_url.rstrip("/") + "/",
        json={"url": permalink, "videoQuality": "1080"},
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=120,
    )
    response.raise_for_status()
    body = response.json()
    target_url = body.get("url") or (body.get("picker") or [{}])[0].get("url")
    if not target_url:
        raise FetchError(f"cobalt returned no url: {str(body)[:200]}")
    return _direct(target_url, key)


def _tidy(stderr: str) -> str:
    lines = [line.strip() for line in (stderr or "").splitlines() if line.strip()]
    for line in lines:
        if "ERROR" in line:
            return line[:400]
    return (lines[-1] if lines else "unknown failure")[:400]

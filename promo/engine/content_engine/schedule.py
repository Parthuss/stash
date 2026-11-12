"""schedule.json: what a weekly batch folder wants posted, where and when. Written by the Make step.

{
  "week": "2026-11-17",
  "tz": "Asia/Kolkata",
  "posts": [
    {"id": "w17-01-pause-rewind", "dir": "01-pause-rewind", "kind": "reel",
     "media": ["pause-rewind.mp4"], "cover": "cover.png", "when": "2026-11-17 22:30",
     "instagram": {"caption": "..."},
     "youtube": {"title": "...", "description": "...", "tags": ["..."]}}
  ]
}

"kind" is "reel" (one mp4, Instagram Reel + YouTube Short) or "carousel" (2-10 images, Instagram only).
Leave a platform out to skip it.
"""
from __future__ import annotations

import json
import hashlib
import re
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

EM_DASH = "—"
BANNED = [  # rules from CONTENT_HANDBOOK.md / Parth's standing rules; checked on every caption and title
    (re.compile(r"open[ -]?source", re.I), 'says "open source" (Skwirl is FSL, source-available)'),
    (re.compile(r"\btik ?tok\b|\bthreads\b", re.I), "names TikTok or Threads (not supported)"),
    (re.compile(r"\bunlimited\b", re.I), 'claims "unlimited"'),
    (re.compile(r"\binstant(ly)?\b", re.I), "claims instant processing"),
    (re.compile(r"app store|play store", re.I), "claims a store app"),
]
POST_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")


class ScheduleError(ValueError):
    pass


def text_problems(text: str) -> list[str]:
    out = []
    if EM_DASH in text:
        out.append("contains an em dash")
    out += [why for rx, why in BANNED if rx.search(text)]
    return out


def parse_when(when: str, tz: str) -> datetime:
    try:
        dt = datetime.fromisoformat(when)
    except ValueError as e:
        raise ScheduleError(f"bad time {when!r}: use 'YYYY-MM-DD HH:MM'") from e
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError) as e:
        raise ScheduleError(f"unknown timezone {tz!r}") from e
    return dt if dt.tzinfo else dt.replace(tzinfo=zone)


def load(week_dir: Path) -> dict:
    path = week_dir / "schedule.json"
    if not path.exists():
        raise ScheduleError(f"{path} not found (run `init-schedule` first)")
    return json.loads(path.read_text())


def validate(sched: dict, week_dir: Path, require_qa: bool = True) -> list[str]:
    """Every problem that should stop a batch from being staged. Empty list = good to go."""
    errs: list[str] = []
    tz = sched.get("tz", "Asia/Kolkata")
    seen: set[str] = set()
    for i, p in enumerate(sched.get("posts", [])):
        pid = p.get("id", f"#{i}")
        tag = f"[{pid}]"
        if not POST_ID.match(str(p.get("id", ""))):
            errs.append(f"{tag} id must be lowercase letters, digits and dashes (max 41 chars)")
        if pid in seen:
            errs.append(f"{tag} duplicate id")
        seen.add(pid)
        d = week_dir / p.get("dir", "")
        if week_dir.resolve() not in d.resolve().parents:
            errs.append(f"{tag} post directory must be inside the week folder")
        kind = p.get("kind")
        media = p.get("media") or []
        if kind == "reel":
            if len(media) != 1 or not media[0].endswith(".mp4"):
                errs.append(f"{tag} a reel needs exactly one .mp4")
        elif kind == "carousel":
            if not 2 <= len(media) <= 10:
                errs.append(f"{tag} a carousel needs 2-10 images")
            if p.get("youtube"):
                errs.append(f"{tag} carousels can't go to YouTube")
        elif kind == "static":
            if len(media) != 1:
                errs.append(f"{tag} a static needs exactly one image")
            if p.get("youtube"):
                errs.append(f"{tag} statics can't go to YouTube")
        else:
            errs.append(f"{tag} kind must be 'reel', 'carousel' or 'static'")
        for f in media + ([p["cover"]] if p.get("cover") else []):
            if d.resolve() not in (d / f).resolve().parents:
                errs.append(f"{tag} media path escapes post directory")
                continue
            if not (d / f).exists():
                errs.append(f"{tag} missing file {p.get('dir', '')}/{f}")
        try:
            parse_when(str(p.get("when", "")), tz)
        except ScheduleError as e:
            errs.append(f"{tag} {e}")
        ig, yt = p.get("instagram"), p.get("youtube")
        if not ig and not yt:
            errs.append(f"{tag} no platform (add 'instagram' and/or 'youtube')")
        if ig:
            cap = ig.get("caption", "")
            if not cap.strip():
                errs.append(f"{tag} empty Instagram caption")
            if len(cap) > 2200:
                errs.append(f"{tag} Instagram caption over 2,200 characters")
            if cap.count("#") > 30:
                errs.append(f"{tag} more than 30 hashtags")
            errs += [f"{tag} Instagram caption {w}" for w in text_problems(cap)]
        if yt:
            title, desc = yt.get("title", ""), yt.get("description", "")
            if not title.strip() or len(title) > 100 or "<" in title or ">" in title:
                errs.append(f"{tag} YouTube title must be 1-100 characters, no < or >")
            if len(desc) > 5000:
                errs.append(f"{tag} YouTube description over 5,000 characters")
            errs += [f"{tag} YouTube text {w}" for w in text_problems(title + "\n" + desc)]
        if require_qa:
            verdict = qa_verdict(d)
            if verdict != "PASS":
                errs.append(f"{tag} content-qa verdict is {verdict} (qa/report.md must say 'Verdict: PASS')")
            checks_path = d / "qa/checks.json"
            if (d / "copy.json").exists() and not checks_path.exists():
                errs.append(f"{tag} generated stills need qa/checks.json")
            if checks_path.exists():
                checks = json.loads(checks_path.read_text())
                if checks.get("mechanical") != "PASS":
                    errs.append(f"{tag} still render mechanical checks did not pass")
                hashes = checks.get("hashes", {})
                for name in media + ["caption.txt", "copy.json"]:
                    src = d / name
                    if src.exists() and hashes.get(name) != hashlib.sha256(src.read_bytes()).hexdigest():
                        errs.append(f"{tag} {name} changed after render QA; render and review again")
                if (d / "caption.txt").exists() and ig and (d / "caption.txt").read_text().strip() != ig["caption"].strip():
                    errs.append(f"{tag} schedule caption differs from reviewed caption.txt")
            copy_path = d / "copy.json"
            if copy_path.exists():
                copy = json.loads(copy_path.read_text())
                for slide in copy.get("slides", []):
                    text = "\n".join(str(slide.get(k, "")) for k in ("kicker", "title", "body", "bridge", "label", "card_title", "card"))
                    errs += [f"{tag} slide copy {w}" for w in text_problems(text)]
    if not sched.get("posts"):
        errs.append("no posts")
    return errs


def qa_verdict(post_dir: Path) -> str:
    rep = post_dir / "qa" / "report.md"
    if not rep.exists():
        return "MISSING"
    m = re.search(r"Verdict:\s*\**\s*([A-Z]+)", rep.read_text()[:2000])
    return m.group(1) if m else "UNREADABLE"


def init_schedule(week_dir: Path, start: str, tz: str = "Asia/Kolkata", time: str = "22:30",
                  every_days: int = 2) -> dict:
    """A first schedule.json from the batch folder: one post per sub-folder, captions from caption.txt,
    a YouTube title from the caption's first line. Claude (or Parth) edits it before staging."""
    day = datetime.fromisoformat(start)
    week = day.date().isoformat()
    short = "w" + day.strftime("%d%m")
    posts = []
    for sub in sorted(x for x in week_dir.iterdir() if x.is_dir() and not x.name.startswith(".")):
        mp4s = sorted(f.name for f in sub.glob("*.mp4") if not f.name.startswith("raw"))
        imgs = sorted(f.name for f in sub.glob("[0-9][0-9].png"))
        cap_file = sub / "caption.txt"
        caption = cap_file.read_text().strip() if cap_file.exists() else ""
        first = caption.splitlines()[0] if caption else sub.name
        when = f"{day.date().isoformat()} {time}"
        post = {"id": f"{short}-{sub.name}"[:41].rstrip("-"), "dir": sub.name,
                "cover": "cover.png" if (sub / "cover.png").exists() else None, "when": when,
                "instagram": {"caption": caption}}
        if mp4s:
            post.update(kind="reel", media=mp4s[:1])
            tags = re.findall(r"#(\w+)", caption)
            body = re.sub(r"(\s*#\w+)+\s*$", "", caption).strip()
            post["youtube"] = {"title": _yt_title(first), "description": body + "\n\nskwirl.app\n#Shorts",
                               "tags": tags + ["skwirl", "saved reels"]}
        elif imgs:
            post.update(kind="static" if len(imgs) == 1 else "carousel", media=imgs)
        else:
            continue
        posts.append(post)
        day += timedelta(days=every_days)
    return {"week": week, "tz": tz, "posts": posts}


def _yt_title(first_line: str) -> str:
    t = re.sub(r"[\U0001F300-\U0001FAFF☀-➿]", "", first_line).strip()
    t = t.replace("<", "").replace(">", "")
    return t[:100]

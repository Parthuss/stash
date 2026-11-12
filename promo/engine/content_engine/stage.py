"""Stage a finished weekly batch: check it, upload the media, queue each post, ask Parth on Telegram.

Runs on the Mac at the end of the weekly Make task (the files are there). After this, publishing needs nothing
from the Mac.
"""
from __future__ import annotations

import hashlib
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .config import Config
from .publisher import Ctx, local_label, save
from .schedule import ScheduleError, load, parse_when, validate
from .telegram import approval_buttons
from .quality_gate import bind_report, stage_reports, require_record, freeze_sources

TG_VIDEO_LIMIT = 49 * 1024 * 1024


def to_jpeg(src: Path, dst: Path) -> Path:
    """Instagram only takes JPEG for carousel images and Reel covers."""
    try:
        from PIL import Image

        with Image.open(src) as im:
            im.convert("RGB").save(dst, "JPEG", quality=95, optimize=True)
    except ImportError:
        if not shutil.which("sips"):
            raise SystemExit("Need Pillow (pip install pillow) or macOS sips to convert PNG to JPEG")
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "95", str(src), "--out", str(dst)],
                       check=True, capture_output=True)
    return dst


def stage(ctx: Ctx, week_dir: Path, restage: bool = False, require_qa: bool = True) -> list[str]:
    cfg: Config = ctx.cfg
    if not require_qa and not cfg.local_store:
        raise ScheduleError("--no-qa is for local mock runs only; remote staging always requires content-qa PASS")
    sched = load(week_dir)
    errs = validate(sched, week_dir, require_qa=require_qa)
    if errs:
        raise ScheduleError("Batch not staged:\n  " + "\n  ".join(errs))
    fresh = dict(sched, posts=[p for p in sched['posts'] if not ctx.store.get_json(f"posts/{p['id']}.json")])
    reports = stage_reports(fresh, week_dir, now=ctx.now()) if fresh['posts'] else {}
    tz, week = sched.get("tz", cfg.tz), sched.get("week") or week_dir.name
    staged = []
    tmp = Path(tempfile.mkdtemp(prefix="engine-stage-"))
    try:
        for item in sched["posts"]:
            pid = item["id"]
            key = f"posts/{pid}.json"
            old = ctx.store.get_json(key)
            started = old and any(r.get("state") not in (None, "pending") for r in (old.get("results") or {}).values())
            if old:
                if ctx.tg and not old.get('tg_message_id') and old.get('status') == 'awaiting_approval':
                    require_record(ctx, old)
                    old_dir = week_dir / item.get('dir', '')
                    report = ctx.store.get_json(old['quality_report_key'])
                    sealed = freeze_sources(old_dir, report, tmp / (pid + '-retry'))
                    (sealed / 'qa').mkdir(exist_ok=True)
                    import json
                    (sealed / 'qa/quality-report.json').write_text(json.dumps(report))
                    old['tg_message_id'] = _ask(ctx, old, sealed, item)
                    save(ctx.store, old)
                ctx.say(f"{pid}: already {old['status']}{' (publishing started)' if started else ''}, left alone")
                continue
            original_dir = week_dir / item.get("dir", "")
            d = freeze_sources(original_dir, reports[pid], tmp / pid)
            media_keys = []
            upload_hashes = {}
            for name in item["media"]:
                src = d / name
                if item["kind"] in ("carousel", "static") and src.suffix.lower() != ".jpg":
                    src = to_jpeg(src, tmp / f"{pid}-{src.stem}.jpg")
                k = f"media/{week}/{pid}/{src.name}"
                ctx.store.put_file(k, src)
                upload_hashes[k] = hashlib.sha256(src.read_bytes()).hexdigest()
                media_keys.append(k)
            cover_key = None
            if item.get("cover"):
                cover = to_jpeg(d / item["cover"], tmp / f"{pid}-cover.jpg")
                cover_key = f"media/{week}/{pid}/cover.jpg"
                ctx.store.put_file(cover_key, cover)
                upload_hashes[cover_key] = hashlib.sha256(cover.read_bytes()).hexdigest()
            when = parse_when(item["when"], tz)
            if when < ctx.now():
                ctx.say(f"{pid}: WARNING its time {item['when']} is in the past; it will ask to post now")
            rec = {
                "id": pid, "week": week, "kind": item["kind"], "tz": tz, "when": item["when"],
                "dir": str(original_dir), "media_keys": media_keys, "cover_key": cover_key,
                "instagram": item.get("instagram"), "youtube": item.get("youtube"),
                "idea_id": item.get("idea_id"), "staged_at": datetime.now(timezone.utc).isoformat(),
                "status": "approved" if cfg.auto_approve else "awaiting_approval", "results": {},
            }
            rec["quality_asset_hashes"] = upload_hashes
            rec["quality_source_hashes"] = reports[pid]["hashes"]
            bind_report(ctx, rec, reports[pid], d)
            shutil.copyfile(d / "qa/quality-report.json", original_dir / "qa/quality-report.json")
            if cfg.auto_approve:
                rec["approved_at"] = rec["staged_at"]
            save(ctx.store, rec)
            if ctx.tg:
                rec["tg_message_id"] = _ask(ctx, rec, d, item)
                save(ctx.store, rec)
            staged.append(pid)
            ctx.say(f"{pid}: staged ({rec['status']}) for {local_label(rec)}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return staged


def _ask(ctx: Ctx, rec: dict, d: Path, item: dict) -> int:
    where = []
    if rec.get("instagram"):
        where.append("Instagram")
    if rec.get("youtube"):
        where.append("YouTube Shorts")
    head = f"{rec['kind'].capitalize()} · {local_label(rec)} · {' + '.join(where)}"
    ig_cap = (rec.get("instagram") or {}).get("caption", "")
    yt_title = (rec.get("youtube") or {}).get("title", "")
    body = f"{head}\n\n{ig_cap[:600]}" + (f"\n\nShorts title: {yt_title}" if yt_title else "")
    if ctx.cfg.auto_approve:
        body = "Auto-approved, will post on time. Send /pause to stop everything.\n\n" + body
    # Attach the machine-readable report before exposing any approval buttons.
    ctx.tg.send_document(d / "qa/quality-report.json", f"Quality PASS: {rec['id']} (claims, copy, media, judge, viewer, recency)")
    buttons = None if ctx.cfg.auto_approve else approval_buttons(rec["id"])
    if rec["kind"] == "reel":
        video = d / item["media"][0]
        if video.stat().st_size <= TG_VIDEO_LIMIT:
            return ctx.tg.send_media(video, body, buttons)
        if item.get("cover"):
            return ctx.tg.send_media(d / item["cover"], body + "\n\n(video too big to preview here)", buttons)
        return ctx.tg.send(body, buttons)
    if rec["kind"] == "static":
        return ctx.tg.send_media(d / item["media"][0], body, buttons)
    ctx.tg.send_album([d / n for n in item["media"]])
    return ctx.tg.send(body, buttons)

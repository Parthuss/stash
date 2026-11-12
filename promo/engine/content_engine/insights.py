"""Learn: snapshot each post's numbers 48 h and 7 days after it went up, and keep performance.json current.

performance.json is what the weekly research run reads to decide which hooks and formats to repeat.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from .http import ApiError
from .publisher import Ctx, load_posts, save

SNAPSHOTS = (("h48", timedelta(hours=48)), ("d7", timedelta(days=7)))


def collect(ctx: Ctx) -> dict:
    now = ctx.now()
    posts = load_posts(ctx.store)
    for p in posts:
        changed = False
        for plat, r in (p.get("results") or {}).items():
            if r.get("state") != "published" or not r.get("published_at"):
                continue
            age = now - datetime.fromisoformat(r["published_at"])
            metrics = r.setdefault("metrics", {})
            for snap, after in SNAPSHOTS:
                if snap in metrics or age < after:
                    continue
                try:
                    if plat == "instagram" and ctx.ig and r.get("media_id"):
                        m = ctx.ig.insights(r["media_id"], p["kind"])
                    elif plat == "youtube" and ctx.yt and r.get("video_id"):
                        m = ctx.yt.stats(r["video_id"])
                    else:
                        continue
                except ApiError as e:
                    ctx.say(f"{p['id']}: {plat} insights failed: {e}")
                    continue
                if not m:  # nothing came back: try again tomorrow rather than store an empty snapshot
                    ctx.say(f"{p['id']}: {plat} {snap} returned no metrics, retrying next run")
                    continue
                metrics[snap] = {**m, "at": now.isoformat()}
                changed = True
                ctx.say(f"{p['id']}: {plat} {snap} snapshot saved")
        if changed:
            save(ctx.store, p)
    perf = summarize(posts, now)
    ctx.store.put_json("performance.json", perf)
    return perf


def _rate(m: dict, key: str) -> float | None:
    reach = m.get("reach") or 0
    return round(m[key] / reach, 4) if reach and isinstance(m.get(key), (int, float)) else None


def summarize(posts: list[dict], now: datetime) -> dict:
    rows = []
    for p in posts:
        res = p.get("results") or {}
        if not any(r.get("state") == "published" for r in res.values()):
            continue
        cap = (p.get("instagram") or {}).get("caption", "")
        row = {"id": p["id"], "week": p.get("week"), "kind": p["kind"], "when": p["when"],
               "idea_id": p.get("idea_id"), "hook": cap.splitlines()[0] if cap else (p.get("youtube") or {}).get("title")}
        ig = res.get("instagram") or {}
        if ig.get("state") == "published":
            m = (ig.get("metrics") or {})
            latest = m.get("d7") or m.get("h48") or {}
            row["instagram"] = {"permalink": ig.get("permalink"), "h48": m.get("h48"), "d7": m.get("d7"),
                                "shares_per_reach": _rate(latest, "shares"), "saves_per_reach": _rate(latest, "saved")}
        yt = res.get("youtube") or {}
        if yt.get("state") == "published":
            m = yt.get("metrics") or {}
            row["youtube"] = {"url": yt.get("url"), "h48": m.get("h48"), "d7": m.get("d7")}
        rows.append(row)
    return {"updated": now.isoformat(), "posts": rows,
            "note": "shares_per_reach is the main signal (sends), then saves_per_reach and 3 s hold (1 - reels_skip_rate)."}

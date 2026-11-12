"""The cron tick: read Parth's Telegram taps, then publish every approved post whose time has come.

Each post record moves awaiting_approval -> approved -> done (or skipped / missed / failed). Each platform
keeps its own result (pending -> container/uploading -> publishing -> published, or failed after
max_attempts), saved after every step, so a crash or a cancelled run resumes without double-posting.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable
from zoneinfo import ZoneInfo

from .config import Config, redact
from .http import ApiError
from .instagram import Instagram
from .schedule import parse_when
from .store import Store
from .telegram import Telegram, late_buttons
from .youtube import YouTube

PLATFORMS = ("instagram", "youtube")
TOKEN_REFRESH_DAYS = 7


@dataclass
class Ctx:
    cfg: Config
    store: Store
    ig: Instagram | None = None
    yt: YouTube | None = None
    tg: Telegram | None = None
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)
    lines: list[str] = field(default_factory=list)

    def say(self, msg: str) -> None:
        msg = redact(msg, self.cfg.secrets)
        self.lines.append(msg)
        print(msg, flush=True)

    def notify(self, text: str, buttons=None) -> None:
        if self.tg:
            try:
                self.tg.send(text, buttons)
            except ApiError as e:
                self.say(f"telegram send failed: {e}")


# ---------- records ----------

def load_posts(store: Store) -> list[dict]:
    posts = [store.get_json(k) for k in store.list("posts/") if k.endswith(".json")]
    return sorted((p for p in posts if p), key=lambda p: (p.get("when", ""), p["id"]))


def save(store: Store, p: dict) -> None:
    store.put_json(f"posts/{p['id']}.json", p)


def platforms(p: dict) -> list[str]:
    return [k for k in PLATFORMS if p.get(k)]


def when_of(p: dict) -> datetime:
    return parse_when(p["when"], p.get("tz", "Asia/Kolkata"))


def local_label(p: dict) -> str:
    return when_of(p).strftime("%a %d %b %H:%M") + " " + p.get("tz", "Asia/Kolkata").split("/")[-1]


def paused(store: Store) -> bool:
    return bool((store.get_json("state/paused.json") or {}).get("paused"))


# ---------- approvals ----------

def apply_action(ctx: Ctx, p: dict, action: str) -> str:
    st = p["status"]
    if st == "done":
        return f"{p['id']} is already posted."
    if action == "sk":
        p["status"] = "skipped"
        save(ctx.store, p)
        return f"Skipped {p['id']}. Nothing will be posted."
    if action in ("ap", "now"):
        p["status"] = "approved"
        p["approved_at"] = ctx.now().isoformat()
        if action == "now" or st == "missed":
            p["force_now"] = True
        save(ctx.store, p)
        where = " + ".join(x.capitalize() if x != "youtube" else "YouTube" for x in platforms(p))
        if p.get("force_now"):
            return f"Approved {p['id']}: posting to {where} within 15 minutes."
        return f"Approved {p['id']}: posts {local_label(p)} to {where}."
    return "Unknown action."


def handle_telegram(ctx: Ctx) -> None:
    if not ctx.tg:
        return
    offset = (ctx.store.get_json("state/tg_offset.json") or {}).get("offset", 0)
    try:
        updates = ctx.tg.updates(offset)
    except ApiError as e:
        ctx.say(f"telegram getUpdates failed: {e}")
        return
    owner = ctx.cfg.tg_chat
    for u in updates:
        offset = max(offset, int(u["update_id"]) + 1)
        cq = u.get("callback_query")
        msg = u.get("message")
        if cq:
            chat = str(((cq.get("message") or {}).get("chat") or {}).get("id", ""))
            sender = str((cq.get("from") or {}).get("id", ""))
            if chat != owner or (not owner.startswith("-") and sender != owner):
                ctx.tg.answer(cq["id"], "Not your queue.")
                continue
            action, _, pid = str(cq.get("data", "")).partition(":")
            p = ctx.store.get_json(f"posts/{pid}.json")
            text = apply_action(ctx, p, action) if p else "That post is no longer in the queue."
            ctx.tg.answer(cq["id"], text)
            try:
                ctx.tg.clear_buttons(cq["message"]["message_id"])
            except (ApiError, KeyError):
                pass
            ctx.notify(text)
            ctx.say(f"tap: {action} {pid}")
        elif msg and str((msg.get("chat") or {}).get("id")) == owner:
            cmd = (msg.get("text") or "").strip().split()[0:1]
            if cmd == ["/queue"]:
                ctx.notify(queue_text(ctx.store) or "Queue is empty.")
            elif cmd == ["/pause"]:
                ctx.store.put_json("state/paused.json", {"paused": True, "at": ctx.now().isoformat()})
                ctx.notify("Paused. Nothing will post until you send /resume.")
            elif cmd == ["/resume"]:
                ctx.store.put_json("state/paused.json", {"paused": False, "at": ctx.now().isoformat()})
                ctx.notify("Resumed.")
    ctx.store.put_json("state/tg_offset.json", {"offset": offset})


def queue_text(store: Store) -> str:
    rows = []
    for p in load_posts(store):
        if p["status"] in ("done", "skipped"):
            continue
        rows.append(f"{local_label(p)}  {p['kind']}  {p['id']}  [{p['status']}]")
    return "\n".join(rows)


# ---------- publishing ----------

def _published_today(posts: list[dict], platform: str, now: datetime, tz: str) -> int:
    day = now.astimezone(ZoneInfo(tz)).date()
    n = 0
    for p in posts:
        at = ((p.get("results") or {}).get(platform) or {}).get("published_at")
        if at and datetime.fromisoformat(at).astimezone(ZoneInfo(tz)).date() == day:
            n += 1
    return n


def _started(p: dict) -> bool:
    return any(r.get("state") not in (None, "pending") for r in (p.get("results") or {}).values())


def publish_due(ctx: Ctx) -> None:
    if paused(ctx.store):
        ctx.say("paused: not publishing")
        return
    now = ctx.now()
    posts = load_posts(ctx.store)
    for p in posts:
        if p["status"] != "approved":
            continue
        due = when_of(p)
        if now < due:
            continue
        late_h = (now - due).total_seconds() / 3600
        if late_h > ctx.cfg.late_window_h and not p.get("force_now") and not _started(p):
            p["status"] = "missed"
            save(ctx.store, p)
            ctx.say(f"{p['id']}: missed its slot by {late_h:.0f} h, asking again")
            ctx.notify(f"{p['id']} missed its slot ({local_label(p)}). Post it now?", late_buttons(p["id"]))
            continue
        publish_post(ctx, p, posts)


def publish_post(ctx: Ctx, p: dict, all_posts: list[dict]) -> None:
    cfg, now = ctx.cfg, ctx.now()
    results = p.setdefault("results", {})
    for plat in platforms(p):
        r = results.setdefault(plat, {"state": "pending", "attempts": 0})
        if r["state"] in ("published", "failed"):
            continue
        client = ctx.ig if plat == "instagram" else ctx.yt
        if client is None:
            if r.get("note") != "not connected":
                r["note"] = "not connected"
                save(ctx.store, p)
                ctx.notify(f"{p['id']} is due but {plat} isn't connected yet (see promo/engine/SETUP.md).")
            ctx.say(f"{p['id']}: {plat} not connected, waiting")
            continue
        cap = cfg.yt_max_uploads_per_day if plat == "youtube" else cfg.max_posts_per_day
        if r["state"] == "pending" and _published_today(all_posts, plat, now, cfg.tz) >= min(cap, cfg.max_posts_per_day):
            ctx.say(f"{p['id']}: {plat} daily cap reached, tomorrow")
            continue
        if cfg.dry_run:
            ctx.say(f"{p['id']}: DRY RUN, would publish to {plat}")
            continue
        r.pop("note", None)
        try:
            (publish_instagram if plat == "instagram" else publish_youtube)(ctx, p, r)
        except ApiError as e:
            r["attempts"] = r.get("attempts", 0) + 1
            r["error"] = str(e)
            if r["attempts"] >= cfg.max_attempts:
                r["state"] = "failed"
                ctx.notify(f"{p['id']} failed on {plat} after {r['attempts']} tries: {e}")
            ctx.say(f"{p['id']}: {plat} error (try {r['attempts']}): {e}")
        save(ctx.store, p)

    states = [results.get(x, {}).get("state") for x in platforms(p)]
    if states and all(s == "published" for s in states):
        p["status"] = "done"
        p["done_at"] = now.isoformat()
        save(ctx.store, p)
        links = [results["instagram"].get("permalink") or "Instagram (no link yet)"] if "instagram" in results else []
        if "youtube" in results:
            links.append(results["youtube"].get("url", ""))
        ctx.notify(f"Posted {p['id']}.\n" + "\n".join(l for l in links if l))
        ctx.say(f"{p['id']}: done")
    elif states and all(s in ("published", "failed") for s in states):
        p["status"] = "failed"
        save(ctx.store, p)


def _caption_match(a: str, b: str) -> bool:
    return (a or "").strip()[:80] == (b or "").strip()[:80]


def publish_instagram(ctx: Ctx, p: dict, r: dict) -> None:
    ig, store = ctx.ig, ctx.store
    caption = p["instagram"]["caption"]
    cid = r.get("container_id")
    if cid:
        s = ig.status(cid)
        if s == "PUBLISHED":  # published last time but the run died before saving: find it, never repost
            match = next((m for m in ig.recent_media() if _caption_match(m.get("caption", ""), caption)), {})
            r.update(state="published", media_id=match.get("id", ""), permalink=match.get("permalink", ""),
                     published_at=ctx.now().isoformat())
            return
        if s in ("ERROR", "EXPIRED"):
            cid = None
    if not cid:
        used, total = ig.publishing_quota()
        if used >= total:
            raise ApiError("instagram", 429, f"publishing quota used ({used}/{total} in 24 h)", True)
        urls = [store.media_url(k) for k in p["media_keys"]]
        if p["kind"] == "reel":
            cover = store.media_url(p["cover_key"]) if p.get("cover_key") else None
            cid = ig.create_reel(urls[0], caption, cover)
        else:
            children = []
            for u in urls:
                child = ig.create_carousel_item(u)
                if ig.wait(child, timeout=120, every=5) != "FINISHED":
                    raise ApiError("instagram", 0, "a carousel image failed to process", True)
                children.append(child)
            cid = ig.create_carousel(children, caption)
        r.update(state="container", container_id=cid)
        save(store, p)
    s = ig.wait(cid)
    if s in ("IN_PROGRESS", ""):
        ctx.say(f"{p['id']}: instagram still processing, next tick")
        return
    if s != "FINISHED":
        r.pop("container_id", None)
        raise ApiError("instagram", 0, f"container {s}", True)
    r["state"] = "publishing"
    save(store, p)
    mid = ig.publish(cid)
    r.update(state="published", media_id=mid, published_at=ctx.now().isoformat())
    save(store, p)
    try:
        r["permalink"] = ig.permalink(mid)
    except ApiError:
        pass


def publish_youtube(ctx: Ctx, p: dict, r: dict) -> None:
    yt, meta = ctx.yt, p["youtube"]
    if r["state"] == "uploading" or r.get("attempts"):  # a previous upload may have landed
        existing = yt.recent_upload_titles().get(meta["title"][:100])
        if existing:
            r.update(state="published", video_id=existing, url=f"https://youtube.com/shorts/{existing}",
                     published_at=ctx.now().isoformat())
            return
    r["state"] = "uploading"
    save(ctx.store, p)
    video = ctx.store.get_bytes(p["media_keys"][0])
    vid, privacy = yt.upload(video, meta["title"], meta.get("description", ""), meta.get("tags", []),
                             ctx.cfg.yt_privacy, ctx.cfg.yt_category)
    r.update(state="published", video_id=vid, url=f"https://youtube.com/shorts/{vid}", privacy=privacy,
             published_at=ctx.now().isoformat())
    if privacy and privacy != ctx.cfg.yt_privacy:
        ctx.notify(f"{p['id']}: YouTube set it to {privacy}, not {ctx.cfg.yt_privacy}. Check YouTube Studio.")


# ---------- Instagram token ----------

def _h(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()[:16]


def current_ig_token(cfg: Config, store: Store) -> str:
    """The stored (refreshed) token, unless Parth put a new one in IG_ACCESS_TOKEN since."""
    t = store.get_json("state/ig_token.json") or {}
    if cfg.ig_token and t.get("seed") != _h(cfg.ig_token):
        t = {"token": cfg.ig_token, "seed": _h(cfg.ig_token), "refreshed_at": datetime.now(timezone.utc).isoformat()}
        store.put_json("state/ig_token.json", t)
    tok = t.get("token", "")
    if tok and tok not in cfg.secrets:
        cfg.secrets.append(tok)
    return tok


def refresh_ig_token(ctx: Ctx) -> None:
    if not ctx.ig:
        return
    t = ctx.store.get_json("state/ig_token.json")
    if not t:  # nothing stored yet: start the clock from now
        ctx.store.put_json("state/ig_token.json", {"token": ctx.ig.token, "seed": _h(ctx.cfg.ig_token),
                                                   "refreshed_at": ctx.now().isoformat()})
        return
    last = datetime.fromisoformat(t["refreshed_at"]) if t.get("refreshed_at") else None
    if last and ctx.now() - last < timedelta(days=TOKEN_REFRESH_DAYS):
        return
    try:
        new = ctx.ig.refresh_token()
    except ApiError as e:
        ctx.say(f"instagram token refresh failed: {e}")
        if last and ctx.now() - last > timedelta(days=50):
            ctx.notify("Instagram token refresh keeps failing and the token expires within ~10 days. "
                       "Reconnect: promo/engine/SETUP.md step 2.")
        return
    ctx.cfg.secrets.append(new)
    ctx.store.put_json("state/ig_token.json", {**t, "token": new, "refreshed_at": ctx.now().isoformat()})
    ctx.say("instagram token refreshed")


def tick(ctx: Ctx) -> None:
    handle_telegram(ctx)
    refresh_ig_token(ctx)
    publish_due(ctx)

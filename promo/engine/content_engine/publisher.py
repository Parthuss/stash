"""The cron tick: read Parth's Telegram taps, then publish every approved post whose time has come.

Each post record moves awaiting_approval -> approved -> done (or skipped / missed / failed). Each platform
keeps its own result (pending -> container/uploading -> publishing -> published, or failed after
max_attempts), saved after every step, so a crash or a cancelled run resumes without double-posting.
One broken post never blocks the others: every post is handled inside its own try.
"""
from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable
from zoneinfo import ZoneInfo

from .config import Config, redact
from .http import ApiError
from .instagram import Instagram
from .schedule import POST_ID, parse_when
from .store import Store
from .telegram import Telegram, late_buttons
from .youtube import YouTube
from .quality_gate import record_problems, require_record

PLATFORMS = ("instagram", "youtube")
TOKEN_REFRESH_DAYS = 7
RECONCILE_SLACK = timedelta(minutes=10)
# which taps are allowed from which status (stale buttons must not revive a skipped or failed post)
TRANSITIONS = {"ap": ("awaiting_approval", "missed"), "now": ("awaiting_approval", "missed", "approved"),
               "sk": ("awaiting_approval", "missed", "approved")}


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
                self.tg.send(redact(text, self.cfg.secrets), buttons)
            except Exception as e:  # never let a Telegram hiccup stop publishing
                self.say(f"telegram send failed: {type(e).__name__}")

    def add_secret(self, value: str) -> None:
        if value and value not in self.cfg.secrets:
            self.cfg.secrets.append(value)
            if os.environ.get("GITHUB_ACTIONS") == "true":
                print(f"::add-mask::{value}", flush=True)  # GitHub's way to hide a runtime secret in public logs


# ---------- records ----------

def load_posts(store: Store, ctx: Ctx | None = None) -> list[dict]:
    posts = []
    for k in store.list("posts/"):
        if not k.endswith(".json"):
            continue
        try:
            p = store.get_json(k)
            if p and p.get("id") and p.get("when"):
                posts.append(p)
        except Exception as e:  # one corrupt record must not hide the rest
            if ctx:
                ctx.say(f"unreadable record {k}: {type(e).__name__}")
    return sorted(posts, key=lambda p: (p.get("when", ""), p["id"]))


def save(store: Store, p: dict) -> None:
    store.put_json(f"posts/{p['id']}.json", p)


def platforms(p: dict) -> list[str]:
    return [k for k in PLATFORMS if p.get(k)]


def when_of(p: dict) -> datetime:
    return parse_when(p["when"], p.get("tz", "Asia/Kolkata"))


def local_label(p: dict) -> str:
    try:
        return when_of(p).strftime("%a %d %b %H:%M") + " " + p.get("tz", "Asia/Kolkata").split("/")[-1]
    except Exception:
        return str(p.get("when"))


def paused(store: Store) -> bool:
    return bool((store.get_json("state/paused.json") or {}).get("paused"))


# ---------- approvals ----------

def apply_action(ctx: Ctx, p: dict, action: str) -> str:
    st = p["status"]
    if st == "done":
        return f"{p['id']} is already posted."
    if action not in TRANSITIONS:
        return "Unknown action."
    if st not in TRANSITIONS[action]:
        return f"{p['id']} is {st}; that button no longer applies."
    if action == "sk":
        p["status"] = "skipped"
        save(ctx.store, p)
        return f"Skipped {p['id']}. Nothing will be posted."
    problems = record_problems(ctx, p, verify_media=True)
    if problems:
        return "Quality gate blocked approval: " + "; ".join(problems)
    p["status"] = "approved"
    p["approved_at"] = ctx.now().isoformat()
    if action == "now" or st == "missed":
        p["force_now"] = True
    save(ctx.store, p)
    where = " + ".join("YouTube" if x == "youtube" else "Instagram" for x in platforms(p))
    if p.get("force_now"):
        return f"Approved {p['id']}: posting to {where} within 15 minutes."
    return f"Approved {p['id']}: posts {local_label(p)} to {where}."


def _is_owner(ctx: Ctx, chat_id, sender_id) -> bool:
    owner_chat = ctx.cfg.tg_chat
    owner_user = ctx.cfg.tg_owner_user or owner_chat
    return str(chat_id) == owner_chat and str(sender_id) == owner_user


def handle_telegram(ctx: Ctx) -> None:
    if not ctx.tg:
        return
    state = ctx.store.get_json("state/tg_offset.json") or {}
    offset = state.get("offset", 0)
    try:
        updates = ctx.tg.updates(offset)
    except Exception as e:
        ctx.say(f"telegram getUpdates failed: {type(e).__name__}: {e}")
        return
    for u in updates:
        try:
            offset = max(offset, int(u["update_id"]) + 1)
            _handle_update(ctx, u)
        except Exception as e:  # a stale callback ("query is too old") or a bad update: skip it, keep going
            ctx.say(f"telegram update skipped: {type(e).__name__}: {e}")
        finally:
            ctx.store.put_json("state/tg_offset.json", {"offset": offset})


def _answer(ctx: Ctx, cq: dict, text: str) -> None:
    try:
        ctx.tg.answer(cq["id"], text)
    except Exception:
        pass  # taps can be up to 15 min old by the time the cron reads them; Telegram rejects late answers


def _handle_update(ctx: Ctx, u: dict) -> None:
    cq, msg = u.get("callback_query"), u.get("message")
    if cq:
        chat = ((cq.get("message") or {}).get("chat") or {}).get("id", "")
        if not _is_owner(ctx, chat, (cq.get("from") or {}).get("id", "")):
            _answer(ctx, cq, "Not your queue.")
            return
        action, _, pid = str(cq.get("data", "")).partition(":")
        p = ctx.store.get_json(f"posts/{pid}.json") if POST_ID.match(pid) else None
        text = apply_action(ctx, p, action) if p else "That post is no longer in the queue."
        _answer(ctx, cq, text)
        try:
            ctx.tg.clear_buttons(cq["message"]["message_id"])
        except Exception:
            pass
        ctx.notify(text)
        ctx.say(f"tap: {action} {pid}")
    elif msg and _is_owner(ctx, (msg.get("chat") or {}).get("id"), (msg.get("from") or {}).get("id", "")):
        words = (msg.get("text") or "").strip().split()
        cmd = words[0].split("@")[0] if words else ""
        if cmd == "/queue":
            ctx.notify(queue_text(ctx.store) or "Queue is empty.")
        elif cmd == "/pause":
            ctx.store.put_json("state/paused.json", {**(ctx.store.get_json("state/paused.json") or {}), "paused": True, "at": ctx.now().isoformat()})
            ctx.notify("Paused. Nothing will post until you send /resume.")
        elif cmd == "/resume":
            ctx.store.put_json("state/paused.json", {**(ctx.store.get_json("state/paused.json") or {}), "paused": False, "at": ctx.now().isoformat()})
            ctx.notify("Resumed.")


def apply_intents(ctx: Ctx) -> None:
    """Approve/skip from the Mac CLI lands as an intent file the tick applies, so the Mac never rewrites a record
    a running tick is publishing."""
    for k in ctx.store.list("state/intents/"):
        try:
            it = ctx.store.get_json(k) or {}
            p = ctx.store.get_json(f"posts/{it.get('id', '')}.json") if POST_ID.match(str(it.get("id", ""))) else None
            if p:
                ctx.say(f"intent {it.get('action')} {p['id']}: " + apply_action(ctx, p, it.get("action", "")))
        except Exception as e:
            ctx.say(f"intent {k} skipped: {type(e).__name__}")
        ctx.store.delete(k)


def queue_text(store: Store) -> str:
    rows = []
    for p in load_posts(store):
        if p["status"] in ("done", "skipped"):
            continue
        rows.append(f"{local_label(p)}  {p.get('kind', '?')}  {p['id']}  [{p['status']}]")
    return "\n".join(rows)


# ---------- publishing ----------

def _published_today(posts: list[dict], platform: str, now: datetime, tz: str) -> int:
    day = now.astimezone(ZoneInfo(tz)).date()
    n = 0
    for p in posts:
        at = ((p.get("results") or {}).get(platform) or {}).get("published_at")
        try:
            if at and datetime.fromisoformat(at).astimezone(ZoneInfo(tz)).date() == day:
                n += 1
        except ValueError:
            pass
    return n


def _started(p: dict) -> bool:
    return any(r.get("state") not in (None, "pending") for r in (p.get("results") or {}).values())


def publish_due(ctx: Ctx) -> None:
    if paused(ctx.store):
        ctx.say("paused: not publishing")
        return
    posts = load_posts(ctx.store, ctx)
    for p in posts:
        if p.get("status") != "approved":
            continue
        try:
            _publish_if_due(ctx, p, posts)
        except Exception as e:  # anything unexpected: count it against this post, move on to the next
            ctx.say(f"{p['id']}: unexpected {type(e).__name__}: {e}")
            p["error"] = redact(f"{type(e).__name__}: {e}", ctx.cfg.secrets)[:300]
            p["crashes"] = p.get("crashes", 0) + 1
            if p["crashes"] >= ctx.cfg.max_attempts and not _started(p):
                p["status"] = "failed"
                ctx.notify(f"{p['id']} can't be published ({type(e).__name__}). Check the record.")
            try:
                save(ctx.store, p)
            except Exception:
                pass


def _publish_if_due(ctx: Ctx, p: dict, posts: list[dict]) -> None:
    now = ctx.now()
    due = when_of(p)
    if now < due:
        return
    late_h = (now - due).total_seconds() / 3600
    problems = record_problems(ctx, p)
    if problems:
        p['status'] = 'blocked_quality'
        p['quality_error'] = '; '.join(problems)
        save(ctx.store, p)
        ctx.say(f"{p['id']}: quality gate blocked; restage under a new post id after review")
        return
    if late_h > ctx.cfg.late_window_h and not p.get("force_now") and not _started(p):
        p["status"] = "missed"
        save(ctx.store, p)
        ctx.say(f"{p['id']}: missed its slot by {late_h:.0f} h, asking again")
        ctx.notify(f"{p['id']} missed its slot ({local_label(p)}). Post it now?", late_buttons(p["id"]))
        return
    publish_post(ctx, p, posts)


def publish_post(ctx: Ctx, p: dict, all_posts: list[dict]) -> None:
    require_record(ctx, p)
    cfg, now = ctx.cfg, ctx.now()
    results = p.setdefault("results", {})
    for plat in platforms(p):
        r = results.setdefault(plat, {"state": "pending", "attempts": 0})
        if r["state"] in ("published", "failed"):
            continue
        if r.get("retry_at") and now < datetime.fromisoformat(r["retry_at"]):
            continue
        client = ctx.ig if plat == "instagram" else ctx.yt
        if client is None:
            if r.get("note") != "not connected":
                r["note"] = "not connected"
                save(ctx.store, p)
                ctx.notify(f"{p['id']} is due but {plat} isn't connected yet (see promo/engine/SETUP.md).")
            ctx.say(f"{p['id']}: {plat} not connected, waiting")
            continue
        cap = min(cfg.yt_max_uploads_per_day, cfg.max_posts_per_day) if plat == "youtube" else cfg.max_posts_per_day
        if r["state"] == "pending" and _published_today(all_posts, plat, now, cfg.tz) >= cap:
            ctx.say(f"{p['id']}: {plat} daily cap reached, tomorrow")
            continue
        if cfg.dry_run:
            ctx.say(f"{p['id']}: DRY RUN, would publish to {plat}")
            continue
        r.pop("note", None)
        r.setdefault("started_at", now.isoformat())
        try:
            (publish_instagram if plat == "instagram" else publish_youtube)(ctx, p, r)
        except Exception as e:
            r["attempts"] = r.get("attempts", 0) + 1
            r["error"] = redact(f"{type(e).__name__}: {e}", cfg.secrets)[:300]
            ctx.say(f"{p['id']}: {plat} error (try {r['attempts']}): {r['error']}")
            if isinstance(e, ApiError) and e.retryable:
                wait = max(e.retry_after, 60 * 2 ** min(r["attempts"], 8))
                r["retry_at"] = (now + timedelta(seconds=wait)).isoformat()
            if r["attempts"] >= cfg.max_attempts or isinstance(e, ApiError) and not e.retryable:
                if plat == "instagram" and r.get("container_id") and _reconcile_instagram(ctx, p, r):
                    pass  # it did go out after all
                else:
                    r["state"] = "failed"
                    ctx.notify(f"{p['id']} failed on {plat} after {r['attempts']} tries: {r['error']}")
        save(ctx.store, p)

    states = [results.get(x, {}).get("state") for x in platforms(p)]
    if states and all(s == "published" for s in states):
        p["status"] = "done"
        p["done_at"] = now.isoformat()
        save(ctx.store, p)
        links = []
        if "instagram" in results:
            links.append(results["instagram"].get("permalink") or "Instagram (link not found, check the profile)")
        if "youtube" in results:
            links.append(results["youtube"].get("url", ""))
        ctx.notify(f"Posted {p['id']}.\n" + "\n".join(l for l in links if l))
        ctx.say(f"{p['id']}: done")
    elif states and all(s in ("published", "failed") for s in states):
        p["status"] = "failed"
        save(ctx.store, p)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def _after(ts: str | None, since: str | None) -> bool:
    if not ts or not since:
        return True
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00").replace("+0000", "+00:00")) >= \
            datetime.fromisoformat(since) - RECONCILE_SLACK
    except ValueError:
        return True


def _reconcile_instagram(ctx: Ctx, p: dict, r: dict) -> bool:
    """If the container says PUBLISHED, record the post instead of ever posting it again."""
    try:
        if ctx.ig.status(r["container_id"]) != "PUBLISHED":
            return False
        caption = _norm(p["instagram"]["caption"])
        match = next((m for m in ctx.ig.recent_media(25)
                      if _norm(m.get("caption", "")) == caption and _after(m.get("timestamp"), r.get("started_at"))), {})
    except Exception:
        return False
    r.update(state="published", media_id=match.get("id", ""), permalink=match.get("permalink", ""),
             published_at=ctx.now().isoformat())
    if not match:
        r["note"] = "published, but the media id wasn't found: no insights for this one"
        ctx.notify(f"{p['id']} went out on Instagram but I couldn't find its link. Check the profile.")
    return True


def publish_instagram(ctx: Ctx, p: dict, r: dict) -> None:
    problems = record_problems(ctx, p)
    if problems:
        from .schedule import ScheduleError
        raise ScheduleError('Quality gate: ' + '; '.join(problems))
    ig, store = ctx.ig, ctx.store
    caption = p["instagram"]["caption"]
    cid = r.get("container_id")
    if cid:
        if _reconcile_instagram(ctx, p, r):
            return
        if ig.status(cid) in ("ERROR", "EXPIRED"):
            cid = None
            r.pop("container_id", None)
    if not cid:
        used, total = ig.publishing_quota()
        if used >= total:
            raise ApiError("instagram", 429, f"publishing quota used ({used}/{total} in 24 h)", True)
        urls = [store.media_url(k) for k in p["media_keys"]]
        if p["kind"] == "reel":
            cover = store.media_url(p["cover_key"]) if p.get("cover_key") else None
            cid = ig.create_reel(urls[0], caption, cover)
        elif p["kind"] == "static":
            cid = ig.create_image(urls[0], caption)
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
    s = ig.wait(cid, timeout=300)
    if s in ("IN_PROGRESS", ""):
        ctx.say(f"{p['id']}: instagram still processing, next tick")
        return
    if s == "PUBLISHED":
        _reconcile_instagram(ctx, p, r)
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
    except Exception:
        pass


def publish_youtube(ctx: Ctx, p: dict, r: dict) -> None:
    problems = record_problems(ctx, p)
    if problems:
        from .schedule import ScheduleError
        raise ScheduleError('Quality gate: ' + '; '.join(problems))
    yt, meta = ctx.yt, p["youtube"]
    if not r.get("upload_session") and (r["state"] == "uploading" or r.get("attempts")):
        title = _norm(meta["title"][:100])
        hit = next((v for v in yt.recent_uploads()
                    if _norm(v["title"]) == title and _after(v.get("published_at"), r.get("started_at"))), None)
        if hit:
            r.update(state="published", video_id=hit["id"], url=f"https://youtube.com/shorts/{hit['id']}",
                     published_at=ctx.now().isoformat())
            return
        if r["state"] == "uploading":
            # Legacy record without a saved session: never guess that an absent,
            # possibly not-yet-indexed recent upload means it is safe to re-upload.
            raise ApiError("youtube", 0, "ambiguous legacy upload; check channel before creating a new post id", False)
    r["state"] = "starting" if not r.get("upload_session") else "uploading"
    save(ctx.store, p)
    video = ctx.store.get_bytes(p["media_keys"][0])

    def remember_session(session):
        r["upload_session"] = session
        r["state"] = "uploading"
        ctx.add_secret(session)
        save(ctx.store, p)

    vid, privacy = yt.upload(video, meta["title"], meta.get("description", ""), meta.get("tags", []),
                             ctx.cfg.yt_privacy, ctx.cfg.yt_category, session=r.get("upload_session"),
                             on_session=remember_session,
                             contains_synthetic_media=bool(meta.get("contains_synthetic_media", False)))
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
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print(f"::add-mask::{tok}", flush=True)
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
        new = ctx.ig.refresh_token(on_new=ctx.add_secret)
    except Exception as e:
        ctx.say(f"instagram token refresh failed: {type(e).__name__}: {e}")
        if last and ctx.now() - last > timedelta(days=50):
            ctx.notify("Instagram token refresh keeps failing and the token expires within ~10 days. "
                       "Reconnect: promo/engine/SETUP.md step 2.")
        return
    ctx.store.put_json("state/ig_token.json", {**t, "token": new, "refreshed_at": ctx.now().isoformat()})
    ctx.say("instagram token refreshed")


def tick(ctx: Ctx) -> None:
    from .dashboard import apply_commands, export
    control = ctx.store.get_json("state/paused.json") or {}
    if control.get("dry_run"):
        ctx.cfg.dry_run = True
    handle_telegram(ctx)
    apply_intents(ctx)
    apply_commands(ctx)
    if ctx.cfg.auto_approve:
        for p in load_posts(ctx.store, ctx):
            if p.get("status") == "awaiting_approval":
                if record_problems(ctx, p, verify_media=True):
                    ctx.say(f"{p['id']}: quality gate blocked auto-approval")
                    continue
                p.update(status="approved", approved_at=ctx.now().isoformat(), approval_method="AUTO_APPROVE")
                save(ctx.store, p)
                ctx.say(f"{p['id']}: auto-approved")
    refresh_ig_token(ctx)
    publish_due(ctx)
    export(ctx)

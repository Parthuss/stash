from __future__ import annotations

import json
from datetime import timedelta

import pytest

from content_engine import insights, publisher, schedule, stage
from content_engine.config import redact
from conftest import IG_TOKEN, OWNER


def staged(make_ctx, week_dir, **kw):
    sched = schedule.init_schedule(week_dir, "2026-11-17")
    (week_dir / "schedule.json").write_text(json.dumps(sched))
    ctx = make_ctx(**kw)
    stage.stage(ctx, week_dir)
    return ctx, sched


def tap(fake, data, chat=OWNER, sender=OWNER, uid=[100]):
    uid[0] += 1
    fake.updates.append({"update_id": uid[0], "callback_query": {
        "id": f"cb{uid[0]}", "data": data, "from": {"id": int(sender)},
        "message": {"message_id": 1, "chat": {"id": int(chat)}}}})


def post(ctx, pid):
    return ctx.store.get_json(f"posts/{pid}.json")


# ---------- schedule ----------

def test_init_schedule_builds_reel_and_carousel(week_dir):
    s = schedule.init_schedule(week_dir, "2026-11-17")
    reel, car = s["posts"]
    assert reel["kind"] == "reel" and reel["media"] == ["pause-rewind.mp4"]
    assert reel["youtube"]["title"].startswith("Pause. Rewind.")
    assert "🧈" not in reel["youtube"]["title"] and "#Shorts" in reel["youtube"]["description"]
    assert "#recipereels" not in reel["youtube"]["description"].split("skwirl.app")[0]
    assert car["kind"] == "carousel" and car["media"] == ["01.png", "02.png", "03.png"] and "youtube" not in car
    assert reel["when"] == "2026-11-17 22:30" and car["when"] == "2026-11-19 22:30"
    assert schedule.validate(s, week_dir) == []


@pytest.mark.parametrize("text,needle", [
    ("Saved reels \u2014 sorted", "em dash"),
    ("Skwirl is open source", "open source"),
    ("Works with TikTok too", "TikTok"),
    ("Unlimited saves", "unlimited"),
])
def test_validate_blocks_rule_breaking_captions(week_dir, text, needle):
    s = schedule.init_schedule(week_dir, "2026-11-17")
    s["posts"][0]["instagram"]["caption"] = text
    errs = schedule.validate(s, week_dir)
    assert any(needle.lower() in e.lower() for e in errs), errs


def test_validate_blocks_failed_qa_and_youtube_carousel(week_dir):
    s = schedule.init_schedule(week_dir, "2026-11-17")
    (week_dir / "01-pause-rewind" / "qa" / "report.md").write_text("**Verdict: FAIL**")
    s["posts"][1]["youtube"] = {"title": "x", "description": ""}
    errs = schedule.validate(s, week_dir)
    assert any("verdict is FAIL" in e for e in errs)
    assert any("carousels can't go to YouTube" in e for e in errs)
    assert not any("verdict" in e for e in schedule.validate(s, week_dir, require_qa=False))


def test_stage_refuses_invalid_batch(make_ctx, week_dir):
    s = schedule.init_schedule(week_dir, "2026-11-17")
    s["posts"][0]["instagram"]["caption"] = "x \u2014 y"
    (week_dir / "schedule.json").write_text(json.dumps(s))
    with pytest.raises(schedule.ScheduleError):
        stage.stage(make_ctx(), week_dir)


# ---------- stage + approval ----------

def test_stage_uploads_media_and_asks_on_telegram(make_ctx, week_dir, fake):
    ctx, s = staged(make_ctx, week_dir)
    reel = post(ctx, s["posts"][0]["id"])
    car = post(ctx, s["posts"][1]["id"])
    assert reel["status"] == car["status"] == "awaiting_approval"
    assert reel["cover_key"].endswith("cover.jpg") and ctx.store.exists(reel["cover_key"])
    assert all(k.endswith(".jpg") for k in car["media_keys"])  # carousel PNGs became JPEG
    methods = [m["method"] for m in fake.sent]
    assert methods == ["sendVideo", "sendMediaGroup", "sendMessage"]
    assert f"ap:{reel['id']}" in fake.sent[0]["raw"] and f"sk:{reel['id']}" in fake.sent[0]["raw"]
    assert not any(m == "POST" and "graph.instagram.com" in u for m, u, _ in fake.calls)  # nothing published


def test_restage_leaves_approved_posts_alone(make_ctx, week_dir):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    publisher.apply_action(ctx, post(ctx, pid), "ap")
    stage.stage(ctx, week_dir)
    assert post(ctx, pid)["status"] == "approved"


def test_auto_approve_skips_the_buttons(make_ctx, week_dir, fake):
    ctx, s = staged(make_ctx, week_dir, auto_approve=True)
    assert post(ctx, s["posts"][0]["id"])["status"] == "approved"
    assert "ap:" not in fake.sent[0]["raw"]


def test_approve_tap_then_publish_both_platforms_on_time(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    tap(fake, f"ap:{pid}")
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "approved"
    assert fake.count("POST", "/media") == 0  # not due yet

    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    p = post(ctx, pid)
    assert p["status"] == "done", p
    ig, yt = p["results"]["instagram"], p["results"]["youtube"]
    assert ig["state"] == "published" and ig["permalink"].startswith("https://www.instagram.com/")
    assert yt["state"] == "published" and yt["url"].startswith("https://youtube.com/shorts/")
    create = next(c for m, u, c in fake.calls if m == "POST" and u.endswith("/media"))
    assert create["media_type"] == "REELS" and create["video_url"].startswith("https://media.test/media/")
    assert create["cover_url"].endswith("cover.jpg") and create["share_to_feed"] == "true"
    assert "Posted" in fake.sent[-1].get("text", "")

    publisher.tick(ctx)  # idempotent
    assert fake.count("POST", "/media_publish") == 1


def test_carousel_publishes_children_then_parent(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][1]["id"]
    publisher.apply_action(ctx, post(ctx, pid), "ap")
    clock.set("2026-11-19T22:40:00+05:30")
    publisher.tick(ctx)
    creates = [c for m, u, c in fake.calls if m == "POST" and u.endswith("/media")]
    assert [c.get("is_carousel_item") for c in creates[:3]] == ["true"] * 3
    assert creates[3]["media_type"] == "CAROUSEL" and len(creates[3]["children"].split(",")) == 3
    assert post(ctx, pid)["status"] == "done"
    assert "youtube" not in post(ctx, pid)["results"]


def test_taps_from_other_chats_are_ignored(make_ctx, week_dir, fake):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    tap(fake, f"ap:{pid}", chat="999", sender="999")
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "awaiting_approval"


def test_unapproved_posts_never_publish(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    assert fake.count("POST", "/media") == 0


def test_skip_tap(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    tap(fake, f"sk:{pid}")
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "skipped" and fake.count("POST", "/media") == 0


# ---------- resilience ----------

def test_container_still_processing_resumes_without_a_second_container(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir, )
    ctx.yt = None
    pid = s["posts"][0]["id"]
    publisher.apply_action(ctx, post(ctx, pid), "ap")
    clock.set("2026-11-17T22:31:00+05:30")
    fake.container_status = ["IN_PROGRESS"] * 21  # longer than one wait()
    publisher.tick(ctx)
    r = post(ctx, pid)["results"]["instagram"]
    assert r["state"] == "container" and r["attempts"] == 0
    fake.container_status = []
    publisher.tick(ctx)
    assert post(ctx, pid)["results"]["instagram"]["state"] == "published"
    assert fake.count("POST", "/media") == 1


def test_crash_after_publish_recovers_instead_of_reposting(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    ctx.yt = None
    pid = s["posts"][0]["id"]
    p = post(ctx, pid)
    p["status"] = "approved"
    p["results"] = {"instagram": {"state": "publishing", "attempts": 0, "container_id": "c77"}}
    publisher.save(ctx.store, p)
    fake.recent_media = [{"id": "m555", "caption": p["instagram"]["caption"], "permalink": "https://www.instagram.com/reel/x/"}]
    fake.container_status = ["PUBLISHED"]
    clock.set("2026-11-17T22:46:00+05:30")
    publisher.tick(ctx)
    r = post(ctx, pid)["results"]["instagram"]
    assert r["state"] == "published" and r["media_id"] == "m555"
    assert fake.count("POST", "/media_publish") == 0


def test_youtube_retry_finds_the_upload_that_landed(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    ctx.ig = None
    pid = s["posts"][0]["id"]
    p = post(ctx, pid)
    p["status"] = "approved"
    p["results"] = {"youtube": {"state": "uploading", "attempts": 1}}
    publisher.save(ctx.store, p)
    fake.yt_uploads[p["youtube"]["title"]] = "vEXISTING"
    clock.set("2026-11-17T22:46:00+05:30")
    publisher.tick(ctx)
    assert post(ctx, pid)["results"]["youtube"]["video_id"] == "vEXISTING"
    assert fake.count("PUT", "/session/1") == 0


def test_three_failures_mark_failed_and_tell_parth_without_leaking_tokens(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    ctx.yt = None
    pid = s["posts"][0]["id"]
    publisher.apply_action(ctx, post(ctx, pid), "ap")
    clock.set("2026-11-17T22:31:00+05:30")
    fake.fail["create"] = 5
    for _ in range(3):
        publisher.tick(ctx)
        clock.t += timedelta(minutes=15)
    p = post(ctx, pid)
    assert p["results"]["instagram"]["state"] == "failed"
    assert p["status"] == "approved"  # YouTube is still waiting to be connected
    assert IG_TOKEN not in json.dumps(p) and IG_TOKEN not in "\n".join(ctx.lines)
    assert any("failed on instagram" in m.get("text", "") for m in fake.sent)
    assert IG_TOKEN not in json.dumps(fake.sent)


def test_late_approval_asks_again_then_post_now(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    publisher.apply_action(ctx, post(ctx, pid), "ap")
    clock.set("2026-11-18T14:00:00+05:30")  # 15.5 h late
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "missed"
    assert f"now:{pid}" in json.dumps(fake.sent[-1])
    tap(fake, f"now:{pid}")
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "done"


def test_daily_cap(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir, max_posts_per_day=1)
    ctx.yt = None
    a, b = s["posts"][0]["id"], s["posts"][1]["id"]
    for pid in (a, b):
        p = post(ctx, pid)
        p["when"] = "2026-11-17 22:30"
        p.pop("youtube", None)
        publisher.save(ctx.store, p)
        publisher.apply_action(ctx, p, "ap")
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    assert post(ctx, a)["status"] == "done" and post(ctx, b)["status"] == "approved"


def test_platform_not_connected_waits_and_says_so_once(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    ctx.yt = None
    ctx.ig = None
    pid = s["posts"][0]["id"]
    publisher.apply_action(ctx, post(ctx, pid), "ap")
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    publisher.tick(ctx)
    notes = [m for m in fake.sent if "isn't connected" in m.get("text", "")]
    assert len(notes) == 2  # once per platform, not once per tick
    assert post(ctx, pid)["status"] == "approved"


def test_pause_and_dry_run(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    publisher.apply_action(ctx, post(ctx, pid), "ap")
    fake.updates.append({"update_id": 5, "message": {"chat": {"id": int(OWNER)}, "from": {"id": int(OWNER)}, "text": "/pause"}})
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    assert fake.count("POST", "/media") == 0
    fake.updates.append({"update_id": 6, "message": {"chat": {"id": int(OWNER)}, "from": {"id": int(OWNER)}, "text": "/resume"}})
    ctx.cfg.dry_run = True
    publisher.tick(ctx)
    assert fake.count("POST", "/media") == 0 and any("DRY RUN" in l for l in ctx.lines)


def test_youtube_privacy_mismatch_is_reported(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    ctx.ig = None
    fake.yt_privacy = "private"
    pid = s["posts"][0]["id"]
    publisher.apply_action(ctx, post(ctx, pid), "ap")
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    assert post(ctx, pid)["results"]["youtube"]["privacy"] == "private"
    assert any("set it to private" in m.get("text", "") for m in fake.sent)


# ---------- token ----------

def test_token_refresh_weekly_and_reseed_from_env(make_ctx, clock):
    ctx = make_ctx(tg=False)
    tok = publisher.current_ig_token(ctx.cfg, ctx.store)
    assert tok == IG_TOKEN
    publisher.refresh_ig_token(ctx)  # seeded just now: no refresh
    assert ctx.store.get_json("state/ig_token.json")["token"] == IG_TOKEN
    clock.t = clock.t + timedelta(days=8)
    t = ctx.store.get_json("state/ig_token.json")
    t["refreshed_at"] = (clock.t - timedelta(days=8)).isoformat()
    ctx.store.put_json("state/ig_token.json", t)
    publisher.refresh_ig_token(ctx)
    assert ctx.store.get_json("state/ig_token.json")["token"] == "IGTOKEN-refreshed-999999"
    assert publisher.current_ig_token(ctx.cfg, ctx.store) == "IGTOKEN-refreshed-999999"  # same env seed: keep refreshed
    ctx.cfg.ig_token = "IGTOKEN-new-from-parth-000"
    assert publisher.current_ig_token(ctx.cfg, ctx.store) == "IGTOKEN-new-from-parth-000"


def test_redact():
    assert redact(f"x {IG_TOKEN} y", [IG_TOKEN]) == "x *** y"


# ---------- insights ----------

def test_insights_snapshots_at_48h_and_writes_performance(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    publisher.apply_action(ctx, post(ctx, pid), "ap")
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    insights.collect(ctx)
    assert "metrics" not in post(ctx, pid)["results"]["instagram"] or not post(ctx, pid)["results"]["instagram"]["metrics"]
    fake.metric_reject = {"reels_skip_rate"}  # a retired metric is dropped, not fatal
    clock.set("2026-11-19T23:00:00+05:30")
    perf = insights.collect(ctx)
    r = post(ctx, pid)["results"]
    assert r["instagram"]["metrics"]["h48"]["reach"] == 10 and "reels_skip_rate" not in r["instagram"]["metrics"]["h48"]
    assert r["youtube"]["metrics"]["h48"]["viewCount"] == 321
    row = perf["posts"][0]
    assert row["id"] == pid and row["instagram"]["shares_per_reach"] == 1.0
    assert row["hook"].startswith("Pause. Rewind.")
    assert ctx.store.get_json("performance.json")["posts"][0]["id"] == pid


# ---------- review fixes ----------

def test_stale_tap_answer_failure_does_not_block_publishing(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    fake.answer_fails = True  # Telegram: "query is too old"
    tap(fake, f"ap:{pid}")
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "done"
    assert ctx.store.get_json("state/tg_offset.json")["offset"] > 0  # the tap isn't replayed forever


def test_stale_buttons_cannot_revive_a_skipped_post(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    tap(fake, f"sk:{pid}")
    tap(fake, f"ap:{pid}")
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "skipped" and fake.count("POST", "/media") == 0


def test_group_chat_needs_the_owner_user(make_ctx, week_dir, fake):
    ctx, s = staged(make_ctx, week_dir)
    ctx.cfg.tg_chat, ctx.cfg.tg_owner_user = "-100123", OWNER
    pid = s["posts"][0]["id"]
    tap(fake, f"ap:{pid}", chat="-100123", sender="555")
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "awaiting_approval"
    tap(fake, f"ap:{pid}", chat="-100123", sender=OWNER)
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "approved"


def test_restage_never_touches_a_post_that_started_publishing(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    p = post(ctx, pid)
    p["status"] = "approved"
    p["results"] = {"instagram": {"state": "container", "container_id": "c9", "attempts": 0}}
    publisher.save(ctx.store, p)
    stage.stage(ctx, week_dir, restage=True)
    assert post(ctx, pid)["results"]["instagram"]["container_id"] == "c9"


def test_mac_intents_are_applied_by_the_tick(make_ctx, week_dir):
    ctx, s = staged(make_ctx, week_dir)
    pid = s["posts"][0]["id"]
    ctx.store.put_json(f"state/intents/20261116T120000-{pid}.json", {"id": pid, "action": "ap"})
    publisher.tick(ctx)
    assert post(ctx, pid)["status"] == "approved" and ctx.store.list("state/intents/") == []


def test_one_broken_post_does_not_block_the_next(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    ctx.yt = None
    a, b = s["posts"][0]["id"], s["posts"][1]["id"]
    for pid in (a, b):
        p = post(ctx, pid)
        p["when"] = "2026-11-17 22:30"
        p.pop("youtube", None)
        publisher.save(ctx.store, p)
        publisher.apply_action(ctx, p, "ap")
    pa = post(ctx, a)
    del pa["media_keys"]  # a malformed record (KeyError inside the publish)
    publisher.save(ctx.store, pa)
    (ctx.store.root / "posts" / "zz-corrupt.json").write_text("{not json")
    clock.set("2026-11-17T22:31:00+05:30")
    publisher.tick(ctx)
    assert post(ctx, b)["status"] == "done"
    assert post(ctx, a)["results"]["instagram"]["attempts"] == 1


def test_presigned_urls_are_redacted():
    url = "https://acct.r2.cloudflarestorage.com/b/k.mp4?X-Amz-Credential=AKIA%2Fx&X-Amz-Signature=abcdef123"
    out = redact(f"error fetching {url}", [])
    assert "abcdef123" not in out and "AKIA" not in out and "X-Amz-Signature=***" in out


def test_insights_drops_the_metric_meta_names_by_index(make_ctx, week_dir, fake, clock):
    ctx, s = staged(make_ctx, week_dir)
    fake.metric_reject = {"ig_reels_avg_watch_time"}
    m = ctx.ig.insights("m1", "reel")
    assert "ig_reels_avg_watch_time" not in m and m["reach"] == 10 and m["reels_skip_rate"] == 10

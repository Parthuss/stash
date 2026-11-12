"""Audience-pain-first ranking rule (Parth, 12 Nov 2026). Run: python -m pytest promo/engine/tests/test_pain_first.py"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from content_engine import hooks, ideation, quality_judge  # noqa: E402
from content_engine.validate_copy import catalogue  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
NOW = datetime(2026, 11, 12)

PAIN_LED = ["The reel you saved can disappear.", "Send me that pasta reel?", "You remember the idea. Not the creator.",
            "What was that movie the reel recommended?", "You saved the place. Now remember its name.",
            "Saved dinner. Still don't know what to buy?"]
# The refreshed Codex top five that this rule demotes.
ADMIN_LED = [("Sending a Skwirl note link? Check what the reader sees.", ["note_share"]),
             ("You shared a note link. Can you take it back?", ["note_share", "stop_sharing"]),
             ("Can you take your notes out of Skwirl?", ["export_notes"]),
             ("Signal dropped. Can you still read your note?", ["offline_notes"]),
             ("Skwirl Plus demo: wrong category? Fix it on the note.", ["correct_category"])]


def test_pain_led_hooks_pass_and_admin_hooks_fail():
    for text in PAIN_LED:
        assert hooks.pain_first(text)["ok"], text
    for text, fids in ADMIN_LED:
        check = hooks.pain_first(text, fids)
        assert not check["ok"] and check["reasons"], text


def test_feature_before_pain_fails_even_without_admin_feature():
    assert not hooks.pain_first("Skwirl search finds the reel you lost.", ["search"])["ok"]
    assert hooks.pain_first("Lost the reel? Search finds it.", ["search"])["ok"]
    assert not hooks.pain_first("Meaning search, shown on a saved reel.", ["search"])["ok"]  # no viewer problem


def test_scroll_stop_orders_pain_above_admin():
    lead = min(hooks.scroll_stop_score(t)["scroll_stop"] for t in PAIN_LED)
    admin = max(hooks.scroll_stop_score(t, f)["scroll_stop"] for t, f in ADMIN_LED)
    assert lead > admin and admin <= 30


def test_hook_candidates_rank_pain_first_on_top():
    feat = hooks.norm_feature(next(f for f in catalogue()["features"] if f["id"] == "search"))
    aud = ideation.AUDIENCES[0]
    cands = hooks.generate_hook_candidates(feat, aud, aud["questions"][0]["text"])
    flags = [c["pain_first"] for c in cands]
    assert flags[0] and flags == sorted(flags, reverse=True)  # every pain-first hook before any other
    assert all(c["pain_first"] for c in hooks.select_top3(cands))
    assert "not an LLM judge" in cands[0]["method"]  # original heuristic kept alongside


def test_support_only_features_never_lead_the_batch():
    auds = [a for a in ideation.load_audiences(ROOT) if a["id"] != "pro"]
    assert {a["id"] for a in auds if a.get("slot") == "faq"} >= {"sharing", "sharing-control", "ownership", "low-signal", "organising"}
    out = ideation.generate_ideas(catalogue(), ideation.load_formats(ROOT), audiences=auds, n=8, seed="t", now=NOW)
    drafts = out["drafts"]
    assert len(drafts) == 8
    slots = [d["slot"] for d in drafts]
    assert slots == sorted(slots, key=lambda s: s != "lead")
    for d in drafts[:5]:
        assert d["slot"] == "lead" and not set(d["feature_ids"]) & hooks.SUPPORT_ONLY_FEATURES, d["id"]
        assert hooks.pain_first(d["hook"], d["feature_ids"])["ok"], d["hook"]
    leads = [d["scroll_stop"] for d in drafts if d["slot"] == "lead"]
    assert leads == sorted(leads, reverse=True)


def test_faq_only_batch_is_labelled_faq():
    auds = [a for a in ideation.load_audiences(ROOT) if a.get("slot") == "faq"]
    out = ideation.generate_ideas(catalogue(), ideation.load_formats(ROOT), audiences=auds, n=3, seed="t", now=NOW)
    assert out["drafts"] and all(d["slot"] == "faq" for d in out["drafts"])


def test_rank_drafts_demotes_support_features_even_if_labelled_lead():
    ds = [{"id": "a", "hook": "Can you take your notes out of Skwirl?", "feature_ids": ["export_notes"], "slot": "lead"},
          {"id": "b", "hook": "Send me that pasta reel?", "feature_ids": ["search"]}]
    assert [d["id"] for d in ideation.rank_drafts(ds)] == ["b", "a"]


def _draft(hook, fids, slot=None):
    d = {"id": "x", "kind": "reel", "hook": hook, "feature_ids": fids, "caption": hook, "cta": "Try Skwirl. Link in bio."}
    if slot:
        d["slot"] = slot
    return d


def test_judge_rubric_weights_scroll_stop_highest():
    assert quality_judge.DIMENSIONS[0] == "scroll_stop"
    assert quality_judge.WEIGHTS["scroll_stop"] == max(quality_judge.WEIGHTS.values())
    assert set(quality_judge.WEIGHTS) == set(quality_judge.DIMENSIONS)
    prompt = quality_judge.judge_prompt(quality_judge.judge_packet(_draft("Send me that pasta reel?", ["search"]), []))
    assert "stranger who has never" in prompt and "BEFORE any feature" in prompt and "FAQ" in prompt
    assert '"scroll_stop":4' in prompt
    lead = {"scores": {**{k: 4 for k in quality_judge.DIMENSIONS}, "scroll_stop": 5}}
    flat = {"scores": {**{k: 5 for k in quality_judge.DIMENSIONS}, "scroll_stop": 4}}
    # one extra point on scroll_stop is worth more than one extra point on any other single dimension
    assert quality_judge.editorial_rank(lead) > quality_judge.editorial_rank({"scores": {**{k: 4 for k in quality_judge.DIMENSIONS}, "originality": 5}})
    assert quality_judge.editorial_rank(flat) > quality_judge.editorial_rank(lead)  # but it is a weighted total
    faq = _draft("Can you take your notes out of Skwirl?", ["export_notes"])
    assert quality_judge.editorial_rank(flat, faq) < quality_judge.editorial_rank(lead, _draft("Send me that pasta reel?", ["search"]))


def test_judge_validation_blocks_admin_lead_but_allows_faq_slot():
    admin = _draft("Can you take your notes out of Skwirl?", ["search"])
    errs = quality_judge.validate_judge(None, quality_judge.judge_packet(admin, []))
    assert errs and errs[0]["code"] == "quality.pain_first"
    faq = _draft("Can you take your notes out of Skwirl?", ["export_notes"])
    assert quality_judge.draft_slot(faq) == "faq"
    assert quality_judge.judge_packet(faq, [])["slot"] == "faq"
    assert quality_judge.validate_judge(None, quality_judge.judge_packet(faq, []))[0]["code"] == "quality.judge"  # normal review still required
    assert quality_judge.pain_first_errors(_draft("Send me that pasta reel?", ["search"])) == []

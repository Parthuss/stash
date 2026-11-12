"""Offline checks for formats, hooks, scripts and ideation. Run: python -m pytest promo/engine/tests/test_ideation_quality.py"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from content_engine import hooks, ideation  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
NOW = datetime(2026, 11, 12)
FEATURES = [
    {"id": "search", "name": "Search", "tags": ["search"], "claims": [{"text": "Search finds a note by what the reel was about.", "feature_id": "search"}]},
    {"id": "notes", "name": "Notes", "tags": ["notes", "retention", "extraction"], "claims": [
        {"text": "Each processed reel becomes a written note.", "feature_id": "notes"},
        {"text": "The note includes the summary and a next step.", "feature_id": "notes"}]},
    {"id": "lists", "name": "Lists", "tags": ["lists", "import"], "claims": [{"text": "Mentioned movies and places collect into lists.", "feature_id": "lists"}]},
    {"id": "nextstep", "name": "Next step", "tags": ["next-step", "notes"], "claims": [{"text": "Every note has a Next step field.", "feature_id": "nextstep"}]},
    {"id": "empty", "name": "Nothing", "claims": []},
]


def _gen(**kw):
    return ideation.generate_ideas(FEATURES, ideation.load_formats(ROOT), n=kw.pop("n", 6), now=NOW, **kw)


def test_format_library():
    fm = ideation.load_formats(ROOT)
    assert len(fm) >= 10 and len({f["id"] for f in fm}) == len(fm)
    for f in fm:
        assert f["structure"] and f["why"] and f["fit"] is not None and f["sources"], f["id"]
        assert all(s["ref"] for s in f["sources"]) and set(f["kinds"]) <= {"reel", "carousel"}
    text = json.dumps(fm).lower()
    assert "trending" not in text and "viral" not in text


def test_hooks_distinct_scored_and_safe():
    feat, aud = hooks.norm_feature(FEATURES[1]), ideation.AUDIENCES[0]
    c = hooks.generate_hook_candidates(feat, aud, aud["questions"][0]["text"])
    assert len(c) >= 12 and len({x["text"] for x in c}) == len(c)
    assert {x["framework"] for x in c} == set(hooks.FRAMEWORKS)
    assert all(not hooks.validate_hook(x["text"], {"2"}) for x in c)
    assert [x["score"] for x in c] == sorted((x["score"] for x in c), reverse=True)
    top = hooks.select_top3(c)
    assert len(top) == 3 and len({t["framework"] for t in top}) == 3
    assert "not an LLM judge" in c[0]["method"]


def test_no_invented_numbers_and_single_claim_has_no_number_hook():
    assert hooks.validate_hook("Save 10x more reels", ()) is not None
    assert hooks.validate_hook("Stop saving reels you never open", ()) is None
    c = hooks.generate_hook_candidates(hooks.norm_feature(FEATURES[0]), ideation.AUDIENCES[0], "q here?")
    assert not any("{n}" in x["text"] or "things Search" in x["text"] for x in c) and len(c) >= 12


def test_score_rewards_specificity_and_penalises_nothing_unfairly():
    feat, aud = hooks.norm_feature(FEATURES[0]), ideation.AUDIENCES[0]
    a = hooks.heuristic_score("Search finds a saved reel by what it was about", feat, aud)["score"]
    b = hooks.heuristic_score("Everything changes today for everyone alive", feat, aud)["score"]
    assert a > b


def test_llm_lines_are_validated():
    llm = lambda p: "Find the saved reel by what it was about\nThis is a game-changer for 10x growth"
    c = hooks.generate_hook_candidates(hooks.norm_feature(FEATURES[0]), ideation.AUDIENCES[0], "q here?", llm=llm)
    srcs = {x["text"]: x["source"] for x in c}
    assert srcs.get("Find the saved reel by what it was about") == "llm"
    assert not any("game-changer" in t for t in srcs)
    assert hooks.generate_hook_candidates(hooks.norm_feature(FEATURES[0]), ideation.AUDIENCES[0], "q here?", llm=lambda p: 1 / 0)


def test_drafts_contract_and_variety():
    r = _gen(seed="a")
    assert r["mode"] == "local-template"
    d = r["drafts"]
    assert len(d) == 6
    for x in d:
        body = "beats" if x["kind"] == "reel" else "slides"
        assert ("beats" in x) != ("slides" in x) and x[body]
        assert len(x["hook_candidates"]) >= 12 and len(x["hooks_top3"]) == 3 and x["hook"] == x["hooks_top3"][0]
        assert set(x["feature_ids"]) <= {f["id"] for f in FEATURES} and "empty" not in x["feature_ids"]
        assert set(x) == {"id", "kind", "audience", "question", "format_id", "feature_ids", "hook_candidates", "hooks_top3",
                          "hook", "caption", "cta", "beats" if x["kind"] == "reel" else "slides"}
    assert len({x["id"] for x in d}) == 6
    assert len({x["format_id"] for x in d}) >= 5 and len({x["audience"] for x in d}) >= 3 and len({tuple(x["feature_ids"]) for x in d}) >= 3
    assert len({x["hook"] for x in d}) == 6
    assert {x["kind"] for x in d} == {"reel", "carousel"}


def test_payoffs_are_catalogue_claims_verbatim():
    claims = {c["text"] for f in FEATURES for c in f["claims"]}
    for x in _gen(seed="b")["drafts"]:
        if x["kind"] == "reel":
            pay = [b["vo"] for b in x["beats"] if b["role"] == "payoff"]
        else:
            pay = [s["text"] for s in x["slides"] if s["job"] == "payoff"]
        assert pay and set(pay) <= claims
        low = json.dumps(x).lower()
        assert "trending" not in low and "viral" not in low


def test_reel_beats_timed_and_ordered():
    reel = next(x for x in _gen(seed="c", n=8)["drafts"] if x["kind"] == "reel")
    b = reel["beats"]
    assert [x["role"] for x in b][:2] == ["hook", "re-hook"] and b[-1]["role"] == "cta" and "payoff" in {x["role"] for x in b}
    assert all(x["t_end"] > x["t_start"] for x in b) and all(b[i]["t_end"] == b[i + 1]["t_start"] for i in range(len(b) - 1))
    assert all({"vo", "on_screen", "shot", "feature_ids"} <= set(x) for x in b)


def test_carousel_slides_bridge():
    car = next(x for x in _gen(seed="d", n=8)["drafts"] if x["kind"] == "carousel")
    s = car["slides"]
    assert [x["n"] for x in s] == list(range(1, len(s) + 1)) and s[0]["job"] == "hook" and s[-1]["job"] == "cta"
    assert all(x["bridge"] for x in s[:-1]) and all({"job", "bridge", "visual", "feature_ids"} <= set(x) for x in s)


def test_history_and_dedupe(tmp_path):
    (tmp_path / "promo/engine").mkdir(parents=True)
    (tmp_path / "promo/out/week").mkdir(parents=True)
    (tmp_path / "promo/engine/ideas.md").write_text("| I-02 | Send me that pasta reel? | Reel | Search by meaning | 5 |\n")
    (tmp_path / "promo/CONTENT_HANDBOOK.md").write_text(
        "## 2. What's been made and posted\n\n| # | Piece | Built | Posted | Files |\n|---|---|---|---|---|\n"
        "| 3 | Your Saved folder is a graveyard carousel | 7 Nov | Yes, 7 Nov morning | x |\n| 7 | 40 book reels | 7 Nov | [CONFIRM] | y |\n\n## 3. Next\n")
    (tmp_path / "promo/out/week/post.json").write_text(json.dumps({"id": "old1", "date": "2026-09-01", "hook": "Stop scrolling your Saved folder for one reel", "prompt": "ignored words here please"}))
    (tmp_path / "promo/out/week/note.md").write_text("Why your saved reels vanish into the void\n")
    h = ideation.read_history(tmp_path)
    ids = {u["id"] for u in h}
    assert {"I-02", "old1", "handbook#3", "handbook#7"} <= ids and not any("ignored" in u["text"] for u in h)
    assert {u["id"]: u["status"] for u in h}["handbook#3"] == "posted" and {u["id"]: u["status"] for u in h}["handbook#7"] == "unknown"
    assert "I-02" not in {u["id"] for u in ideation.read_history(tmp_path, exclude_ids=("I-02",))}
    assert ideation.similarity("Send me that pasta reel?", "send me that pasta reel") > 0.9
    assert ideation.similarity("Stop saving tutorials", "Quarterly tax filing guide") == 0
    old = ideation.find_duplicates("Stop scrolling your Saved folder for one reel", h, weeks=4, now=NOW)
    assert old[0]["id"] == "old1" and old[0]["blocking"] is False        # dated 2026-09-01, outside 4 weeks
    assert ideation.find_duplicates("Stop scrolling your Saved folder for one reel", h, weeks=20, now=NOW)[0]["blocking"] is True
    unk = ideation.find_duplicates("Why your saved reels vanish into the void", h, weeks=1, now=NOW)
    assert unk[0]["blocking"] is True                                       # unknown date stays conservative


def test_generation_skips_history_duplicates():
    first = _gen(seed="e")["drafts"]
    hist = [ideation._unit("old", "x", first[0]["hook"]) ]
    again = _gen(seed="e", history=hist)
    assert first[0]["hook"] not in {x["hook"] for x in again["drafts"]}


def test_llm_mode_label():
    llm = lambda p: "Find the saved reel by what it was about"
    assert _gen(seed="f", llm=llm)["mode"] in ("local-template", "llm-assisted-hooks")

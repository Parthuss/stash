"""Idea generator: remix formats x audiences x real features into draft posts, with history dedupe.

Local template mode by default (`mode == "local-template"`); an injected `llm` only adds extra hook
candidates that must pass the same validators (`mode == "llm-assisted-hooks"` only if one survives).
Nothing here claims a trend or predicts performance.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from .hooks import generate_hook_candidates, lead_support, load_features, scroll_stop_score, select_top3, tokens
from .scripts import DEFAULT_CTA, build_carousel, build_reel

_R = "https://www.reddit.com/r/Instagram/comments/"
AUDIENCES = [
    {"id": "everyday", "label": "people with a big Saved folder", "thing": "saved reels", "one": "a saved reel",
     "moment": "a friend asks you to send that reel you saved", "pain": "you remember the reel but not where it went",
     "stop": "scrolling your Saved folder for one reel", "send_to": "a friend who saves everything",
     "questions": [
         {"text": "How do I find a reel I remember but cannot place?", "type": "audience_report", "source": _R + "1xpt1qy/does_anyone_else_wish_the_saved_section_had_a/"},
         {"text": "How do I send a friend that reel I saved?", "type": "audience_report", "source": _R + "1sempu1/instagram_should_make_it_easier_to_access_your/"},
         {"text": "How do I search my saved collections once there are lots?", "type": "audience_report", "source": _R + "1s8stxf/am_i_the_only_one_annoyed_theres_no_search_for/"}]},
    {"id": "pro", "label": "people who save reels for work", "thing": "saved reels", "one": "a saved activity idea",
     "moment": "you need one saved idea for tomorrow's session", "pain": "your best work ideas are buried in Saved",
     "stop": "saving work ideas you never file", "send_to": "a colleague who saves ideas too",
     "questions": [{"text": "How do I turn saved reels into a work library I can search?", "type": "user_feedback", "source": "promo/CONTENT_HANDBOOK.md section 3"}]},
    {"id": "cook", "label": "people who save recipe reels", "thing": "recipe reels", "one": "a recipe reel",
     "moment": "you are at the shop and cannot remember the recipe you saved", "pain": "the recipe was never written down",
     "stop": "pausing a recipe reel to catch the ingredients", "send_to": "the friend who cooks",
     "questions": [{"text": "Where is the recipe in that video?", "type": "editorial_hypothesis", "source": "promo/engine/ideas.md I-06"}]},
    {"id": "lists", "label": "people who save recommendations", "thing": "reels with recommendations", "one": "a reel with a recommendation",
     "moment": "someone asks the name of that place from the reel you saved", "pain": "you saved the place but lost its name",
     "stop": "screenshotting names you never look at", "send_to": "your movie-night or travel friend",
     "questions": [{"text": "What was that movie the reel recommended?", "type": "editorial_hypothesis", "source": "promo/engine/ideas.md I-13"},
                   {"text": "What was the name of that place I saved?", "type": "editorial_hypothesis", "source": "promo/engine/ideas.md I-14"}]},
    {"id": "tutorial", "label": "people who save tutorials to try later", "thing": "tutorial reels", "one": "a tutorial reel",
     "moment": "you saved a tutorial to try later and never did", "pain": "you saved it and never tried it",
     "stop": "saving tutorials you never try", "send_to": "a friend with a project backlog",
     "questions": [{"text": "How do I actually act on the tutorials I save?", "type": "editorial_hypothesis", "source": "promo/engine/ideas.md I-05"}]},
    {"id": "lost", "label": "people whose saved reels vanished", "thing": "saved reels", "one": "a saved reel",
     "moment": "you go back for a reel you saved and it is gone", "pain": "the reel you saved is gone",
     "stop": "trusting a bookmark to keep a reel", "send_to": "a friend with a huge Saved folder",
     "questions": [{"text": "What happens when a reel you saved gets deleted?", "type": "editorial_hypothesis", "source": "promo/engine/ideas.md I-01"}]},
]


def load_formats(repo_root) -> list[dict]:
    return json.loads((Path(repo_root) / "promo/engine/playbooks/formats.json").read_text())["formats"]


def load_audiences(repo_root) -> list[dict]:
    """Existing sourced questions plus explicitly labelled editorial hypotheses.

    Bank audiences default to slot "faq" (admin/feature questions): they may fill FAQ posts or
    supporting beats but never outrank a pain-led idea.
    """
    bank = Path(repo_root) / 'promo/engine/playbooks/audience_questions.json'
    extra = json.loads(bank.read_text())['audiences'] if bank.exists() else []
    return AUDIENCES + [{"slot": "faq", **a} for a in extra]


def slot_for(aud: dict, feature_ids) -> str:
    """'lead' only for a pain-led audience whose payoff is not a support-only (niche/admin) feature."""
    return "faq" if aud.get("slot") == "faq" or lead_support(feature_ids) else "lead"


# ---------------------------------------------------------------- history / dedupe

_MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
_SKIP_KEYS = {"prompt", "file", "path", "url", "alt", "src"}
_DATE_KEYS = ("date", "posted_at", "published_at", "created_at", "scheduled_at", "when")


def _parse_date(s: str, today: datetime) -> datetime | None:
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    try:
        if m:
            return datetime(int(m[1]), int(m[2]), int(m[3]))
        m = re.search(r"\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", s.lower())
        if m:
            d = datetime(today.year, _MONTHS[m[2]], int(m[1]))
            return d if d <= today + timedelta(days=1) else d.replace(year=today.year - 1)
    except ValueError:
        pass
    return None


def _unit(id_, path, text, date=None, status="unknown"):
    return {"id": id_, "path": path, "text": text.strip(), "date": date, "status": status}


def _json_units(obj, rel, base_id, date, status, out):
    if isinstance(obj, dict):
        oid = obj.get("id") if isinstance(obj.get("id"), str) else base_id
        for k in _DATE_KEYS:
            if isinstance(obj.get(k), str):
                date = _parse_date(obj[k], datetime.now()) or date
        if isinstance(obj.get("status"), str):
            status = obj["status"]
        for k, v in obj.items():
            if k not in _SKIP_KEYS:
                _json_units(v, rel, oid, date, status, out)
    elif isinstance(obj, list):
        for v in obj:
            _json_units(v, rel, base_id, date, status, out)
    elif isinstance(obj, str) and len(obj.split()) >= 3 and len(obj) < 600:
        out.append(_unit(base_id, rel, obj, date, status))


def read_history(repo_root, exclude_ids=(), today: datetime | None = None) -> list[dict]:
    """Collect previous ideas/posts as small text units.

    Reads promo/out/**/*.json|md|txt, promo/engine/ideas.md and the 'made and posted' table of
    promo/CONTENT_HANDBOOK.md. Returns [{id, path, text, date (datetime|None), status}], where
    status is 'posted' | 'unposted' | 'unknown'. Unknown date/status is kept and later treated as
    recent (conservative). Units whose id is in `exclude_ids` are dropped (pass the ids of the
    drafts being regenerated so a rerun does not duplicate itself). Missing paths are skipped.
    """
    root, today = Path(repo_root), (today or datetime.now()).replace(tzinfo=None)
    skip = set(exclude_ids)
    units: list[dict] = []
    files = [p for pat in ("*.json", "*.md", "*.txt") for p in (root / "promo/out").glob("**/" + pat)]
    for p in sorted(files):
        if "node_modules" in p.parts or p.stat().st_size > 2_000_000:
            continue
        rel = str(p.relative_to(root))
        try:
            raw = p.read_text(errors="replace")
        except OSError:
            continue
        fdate = _parse_date(rel, today)
        if p.suffix == ".json":
            try:
                _json_units(json.loads(raw), rel, rel, fdate, "unknown", units)
            except ValueError:
                continue
        else:
            units += [_unit(f"{rel}#L{i + 1}", rel, l, fdate) for i, l in enumerate(raw.splitlines()) if len(l.split()) >= 3]
    ideas = root / "promo/engine/ideas.md"
    if ideas.exists():
        current_idea = None
        for i, line in enumerate(ideas.read_text(errors="replace").splitlines()):
            heading = re.match(r"###\s+(I-\d+|quality-\d+)\b", line)
            if heading:
                current_idea = heading[1]
            elif line.startswith('## '):
                current_idea = None
            m = re.match(r"\|\s*(I-\d+|quality-\d+)\s*\|(.*)\|", line) or re.match(r"\*\*(I-\d+)\b(.*)", line)
            if m:
                units.append(_unit(m[1], "promo/engine/ideas.md", m[2].replace("|", " ")))
            elif len(line.split()) >= 3:
                units.append(_unit(current_idea or f"ideas.md#L{i + 1}", "promo/engine/ideas.md", line.replace("|", " ")))
    hb = root / "promo/CONTENT_HANDBOOK.md"
    if hb.exists():
        sec = re.search(r"## 2\. What's been made and posted(.*?)\n## ", hb.read_text(errors="replace") + "\n## ", re.S)
        for line in (sec[1] if sec else "").splitlines():
            cols = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cols) >= 4 and cols[0] not in ("#", "") and not set(cols[0]) <= set("-: "):
                posted = cols[3].lower()
                status = "posted" if posted.startswith("yes") and "confirm" not in posted else (
                    "unposted" if posted.startswith(("no", "not")) else "unknown")
                units.append(_unit(f"handbook#{cols[0]}", "promo/CONTENT_HANDBOOK.md", f"{cols[1]} {cols[2]}",
                                   _parse_date(cols[3], today) or _parse_date(cols[2], today), status))
    return [u for u in units if u["id"] not in skip and u["text"]]


def similarity(a: str, b: str) -> float:
    """Compare distinctive words, rather than ubiquitous product nouns.

    Exact copies still match. Fewer than two distinctive words cannot establish
    a lexical duplicate; the independent editor checks generic/semantic overlap.
    """
    if re.sub(r"\W+", " ", a.casefold()).strip() == re.sub(r"\W+", " ", b.casefold()).strip():
        return 1.0 if a.strip() else 0.0
    common = {'skwirl', 'note', 'notes', 'reel', 'reels', 'sav', 'save', 'saved'}
    ta, tb = set(tokens(a)) - common, set(tokens(b)) - common
    if min(len(ta), len(tb)) < 2:
        return 0.0
    inter = len(ta & tb)
    score = inter / len(ta | tb)
    if min(len(ta), len(tb)) >= 3:
        score = max(score, 0.85 * inter / min(len(ta), len(tb)))
    return round(score, 3)


def find_duplicates(candidate, history: list[dict], threshold: float = 0.55, weeks: float = 4,
                    now: datetime | None = None) -> list[dict]:
    """Return history units similar to any string in `candidate` (str or list of str), best first.

    A unit blocks if similarity >= threshold AND (its date is unknown OR it is within `weeks` weeks
    of `now`). Dated units older than `weeks` are returned with blocking=False so callers can still
    see them. Posted/unposted/unknown status all block: an unposted draft still counts as used.
    """
    now = (now or datetime.now()).replace(tzinfo=None)
    texts = [candidate] if isinstance(candidate, str) else list(candidate)
    out = []
    for u in history:
        s = max((similarity(t, u["text"]) for t in texts if t), default=0.0)
        if s >= threshold:
            date = u.get("date")
            if isinstance(date, str):
                date = datetime.fromisoformat(date.replace("Z", "+00:00"))
            if date is not None:
                date = date.replace(tzinfo=None)
            old = date is not None and now - date > timedelta(weeks=weeks)
            out.append({"id": u["id"], "path": u["path"], "similarity": s, "date": u["date"],
                        "status": u["status"], "blocking": not old})
    return sorted(out, key=lambda m: -m["similarity"])


# ---------------------------------------------------------------- generation

def _h(*parts) -> int:
    return int(hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:8], 16)


def _eligible(fmt, aud, feat) -> int | None:
    """Affinity or None if the combo makes no sense. Formats with tags need a tag overlap."""
    tags = set(fmt["fit"]["tags"])
    overlap = len(tags & set(feat["tags"]))
    if tags and not overlap:
        return None
    if fmt["fit"]["audiences"] and aud["id"] not in fmt["fit"]["audiences"]:
        return None
    return 2 * overlap + (1 if tags else 0)


def generate_ideas(features, formats: list[dict], audiences: list[dict] | None = None, history: list[dict] | None = None,
                   n: int = 5, kinds=("reel", "carousel"), cta: str = DEFAULT_CTA, weeks: float = 4,
                   dup_threshold: float = 0.55, seed: str = "", now: datetime | None = None,
                   llm: Callable[[str], str] | None = None) -> dict:
    """Build up to `n` drafts that differ in format, audience, feature and kind.

    features   feature catalogue (list / {"features": [...]} / {id: feature}); each feature needs `id`,
               a name, optional `tags`, and `claims` [{text, feature_id}]. Features without claims are skipped.
    formats    list from load_formats(). audiences: defaults to AUDIENCES.
    history    from read_history(); drafts duplicating a blocking unit (see find_duplicates) are skipped.
    llm        optional callable(prompt)->str, hooks only (see hooks.generate_hook_candidates).
    Returns {"mode", "drafts", "skipped"}. Each draft has exactly: id, kind, audience, question, format_id,
    feature_ids, hook_candidates, hooks_top3 (hook strings), hook, slot ("lead"|"faq"), scroll_stop, caption, cta,
    and beats (reel) or slides (carousel). Drafts come back ranked by rank_drafts (audience pain first).
    `skipped` lists {combo, reason} so the caller can see why fewer than n came back.
    """
    feats = [f for f in load_features(features) if f["claims"]]
    auds, history, now = audiences or AUDIENCES, history or [], now or datetime.now()
    pool = []
    for fmt in formats:
        for aud in auds:
            for q in aud["questions"]:
                for feat in feats:
                    if q.get('feature_ids') and feat['id'] not in q['feature_ids']:
                        continue
                    aff = _eligible(fmt, aud, feat)
                    if aff is None:
                        continue
                    for kind in fmt["kinds"]:
                        if kind in kinds:
                            pool.append((fmt, aud, q, feat, kind, aff))
    drafts, skipped, used = [], [], {"f": {}, "a": {}, "m": {}, "k": {}, "q": {}}
    llm_used = False
    while pool and len(drafts) < n:
        def rank(c):
            fmt, aud, q, feat, kind, aff = c
            pen = 3 * used["f"].get(fmt["id"], 0) + 2.5 * used["m"].get(feat["id"], 0) + 2 * used["a"].get(aud["id"], 0) \
                + 1.5 * used["k"].get(kind, 0) + 1 * used["q"].get(q["text"], 0)
            # Audience pain first: every lead combo outranks every FAQ/support-only combo.
            return (slot_for(aud, [feat["id"]]) != "lead", -(aff - pen), _h(seed, fmt["id"], aud["id"], q["text"], feat["id"], kind))
        pool.sort(key=rank)
        fmt, aud, q, feat, kind, _ = pool.pop(0)
        combo = f"{fmt['id']}/{aud['id']}/{feat['id']}/{kind}"
        cands = generate_hook_candidates(feat, aud, q["text"], llm=llm)
        if not cands:
            skipped.append({"combo": combo, "reason": "no valid hook"})
            continue
        slot = slot_for(aud, [feat["id"]])
        if slot == "lead" and not any(c["pain_first"] for c in cands):
            # Hard rule: a lead hook names the viewer's frustration/desire before any feature.
            skipped.append({"combo": combo, "reason": "no pain-first hook"})
            continue
        top3 = select_top3(cands)
        # first candidate (top3, then the rest) that is not a near-duplicate of a batch hook or history;
        # a lead draft may only pick a pain-first hook
        hook, dups = None, []
        for c in [c for c in top3 + [c for c in cands if c not in top3] if slot != "lead" or c["pain_first"]]:
            dups = [d for d in find_duplicates([c["text"], q["text"]], history, dup_threshold, weeks, now) if d["blocking"]]
            dups += [{"id": d["id"]} for d in drafts if similarity(c["text"], d["hook"]) >= 0.5]
            if not dups:
                hook = c["text"]
                break
        if hook is None:
            skipped.append({"combo": combo, "reason": f"duplicate of {dups[0]['id']}"})
            continue
        top3 = [c for c in top3 if c["text"] != hook]
        top3 = [next(c for c in cands if c["text"] == hook)] + top3[:2]
        payoff = feat["claims"][0]["text"]
        base = {"id": re.sub(r"[^a-z0-9]+", "-", f"{fmt['id']}-{aud['id']}-{feat['id']}-{kind}".lower()) + f"-{_h(q['text']) % 1000:03d}",
                "kind": kind, "audience": aud["id"], "question": q["text"], "format_id": fmt["id"],
                "feature_ids": [feat["id"]], "hook_candidates": cands, "hooks_top3": [c["text"] for c in top3],
                "hook": hook, "slot": slot,
                "scroll_stop": next(c["scroll_stop"] for c in cands if c["text"] == hook),
                "caption": f"{hook}\n\n{payoff}\n\nSend this to {aud.get('send_to', 'a friend who saves reels')}. {cta}",
                "cta": cta}
        if kind == "reel":
            base["beats"] = build_reel(fmt, feat, aud, q["text"], hook, cta)
        else:
            base["slides"] = build_carousel(fmt, feat, aud, q["text"], hook, cta)
        llm_used |= any(c["source"] == "llm" for c in cands if c["text"] == hook)
        drafts.append(base)
        for key, v in (("f", fmt["id"]), ("m", feat["id"]), ("a", aud["id"]), ("k", kind), ("q", q["text"])):
            used[key][v] = used[key].get(v, 0) + 1
    return {"mode": "llm-assisted-hooks" if llm_used else "local-template", "drafts": rank_drafts(drafts), "skipped": skipped}


def rank_drafts(drafts: list[dict]) -> list[dict]:
    """Order a batch by audience pain first: lead slots before FAQ slots, then scroll-stop for a stranger.

    Truth/style/recency checks stay separate; this only orders drafts. A draft without a slot is
    classified from its primary feature (a support-only primary payoff is always FAQ).
    """
    def key(d):
        fids = d.get("feature_ids", [])
        s = d.get("scroll_stop")
        if s is None:
            s = scroll_stop_score(d.get("hook", ""), fids)["scroll_stop"]
        slot = "faq" if lead_support(fids) else d.get("slot", "lead")
        return (slot != "lead", -s)
    return sorted(drafts, key=key)

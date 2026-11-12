"""Hook candidates for Skwirl drafts: constrained templates plus an optional injected LLM.

Everything here is local and stdlib-only. Two things are kept strictly apart:
  * `heuristic_score` is a cheap readability/specificity/payoff check. It does NOT
    estimate virality or engagement. A separate LLM judge (not here) may rank on top.
  * Hooks may only use facts the caller supplied (feature name, claim text, audience,
    question). Digits and number words must appear in those inputs or be a structural
    count of the listed claims; anything else is rejected, never repaired.
"""
from __future__ import annotations

import re
from typing import Callable, Iterable

FRAMEWORKS = ("curiosity", "pattern_interrupt", "contrarian", "specific_number",
              "pov", "stop_doing", "question", "demonstration")
BANNED = ("game-changer", "game changer", "revolutionary", "revolutionize", "unlock", "10x", "viral",
          "trending", "hack", "secret", "ai-powered", "magic", "effortless", "best ever", "#1",
          "guaranteed", "never forget", "instantly", "instant", "unlimited", "forever")
STOP = frozenset("a an the and or but of to in on at for with is are was were be it its this that these those "
                 "i you your my me we our they them do does did not no so as by from up out if then than "
                 "can could would will just about what when where which who how why".split())
_NUMWORDS = {"two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8",
             "nine": "9", "ten": "10", "hundred": "100", "thousand": "1000", "million": "1000000"}
_WORDNUM = {v: k for k, v in _NUMWORDS.items()}
PROMISE_CUES = ("here", "how", "why", "what", "instead", "watch", "before", "stop", "without", "find", "answer", "part")


# ---------------------------------------------------------------- audience pain first
# Hard rule (Parth, 12 Nov 2026): a lead hook names a real viewer frustration or desire BEFORE any
# feature appears, and is judged first by "would a stranger who has never heard of Skwirl stop?".
# Niche/admin features may only be supporting beats or FAQ-slot posts, never a top-ranked lead.
SUPPORT_ONLY_FEATURES = frozenset({"export_notes", "note_share", "stop_sharing", "offline_notes",
                                   "correct_category", "categories"})
# Viewer frustration / desire cues (matched on whole words or phrases, lower case).
PAIN_CUES = ("lost", "lose", "losing", "gone", "disappear", "disappeared", "deleted", "vanish", "forgot",
             "forget", "forgotten", "remember", "can't find", "cannot find", "couldn't find", "never",
             "buried", "where", "which one", "what was", "send me", "still don't", "still do not",
             "again", "scroll", "scrolling", "somewhere", "no idea", "name of", "its name", "the name",
             "not the creator", "never tried", "never cooked", "never opened", "never used", "used it",
             "actually", "wish", "want", "need", "missed", "miss", "twice", "rewatch", "rewatching",
             "pausing", "unavailable")
# Everyday moments a stranger recognises (cooking, travel, watching, learning, a friend asking).
MOMENT_CUES = ("recipe", "pasta", "dinner", "cook", "cooking", "shop", "shopping", "ingredients", "cafe",
               "café", "place", "trip", "travel", "holiday", "restaurant", "movie", "film", "show", "book",
               "tutorial", "workout", "friend", "mate", "tonight", "weekend", "try")
# Words that mean a feature or the product is on screen. In a lead hook they must come after the pain.
FEATURE_CUES = ("skwirl", "export", "json", "download", "link", "revoke", "stop sharing", "public",
                "offline", "cache", "cached", "signal", "settings", "category", "categories",
                "plus", "app", "connector", "note", "notes", "lists", "search")
ADMIN_CUES = ("export", "json", "download", "revoke", "stop sharing", "public link", "note link", "offline",
              "cache", "cached", "signal", "settings", "category", "categories", "plus")


def _first(text: str, cues: Iterable[str]) -> int | None:
    low = " " + re.sub(r"[^a-z0-9'é]+", " ", text.lower().replace("’", "'")) + " "
    hits = [low.find(f" {c} ") for c in cues]
    hits = [h for h in hits if h >= 0]
    return min(hits) if hits else None


def pain_first(text: str, feature_ids: Iterable[str] = ()) -> dict:
    """Deterministic hard-rule check for a LEAD hook.

    ok is True only if the hook names a viewer frustration/desire (PAIN_CUES) or a recognisable everyday
    moment (MOMENT_CUES) before any product/feature word (FEATURE_CUES), never leads with an admin
    feature (ADMIN_CUES), and the draft is not built on a SUPPORT_ONLY_FEATURES payoff.
    """
    pain, moment = _first(text, PAIN_CUES), _first(text, MOMENT_CUES)
    viewer = min([p for p in (pain, moment) if p is not None], default=None)
    feature, admin = _first(text, FEATURE_CUES), _first(text, ADMIN_CUES)
    support = sorted(set(feature_ids) & SUPPORT_ONLY_FEATURES)
    reasons = []
    if viewer is None:
        reasons.append("no viewer frustration, desire or everyday moment")
    elif feature is not None and feature < viewer:
        reasons.append("a feature or the product appears before the viewer's problem")
    if admin is not None:
        reasons.append("admin/settings wording in the hook")
    if support:
        reasons.append(f"support-only feature as the lead payoff: {', '.join(support)}")
    return {"ok": not reasons, "reasons": reasons, "pain": pain is not None, "moment": moment is not None}


def scroll_stop_score(text: str, feature_ids: Iterable[str] = ()) -> dict:
    """0-100 'would a stranger who has never heard of Skwirl stop?' heuristic. NOT a popularity estimate.

    parts: pain (names a frustration/desire, 0.4), moment (recognisable everyday scene, 0.2),
    stranger (no brand name or in-app jargon, 0.25), order (problem before any feature, 0.15).
    Support-only features and admin wording cap the score at 30 so they can never outrank a lead.
    """
    check = pain_first(text, feature_ids)
    feature, viewer = _first(text, FEATURE_CUES), min(
        [p for p in (_first(text, PAIN_CUES), _first(text, MOMENT_CUES)) if p is not None], default=None)
    parts = {"pain": 1.0 if check["pain"] else 0.0, "moment": 1.0 if check["moment"] else 0.0,
             "stranger": 0.0 if feature is not None else 1.0,
             "order": 1.0 if viewer is not None and (feature is None or viewer < feature) else 0.0}
    if parts["stranger"] == 0.0 and _first(text, ("skwirl", "plus", "connector", "json", "export")) is None:
        parts["stranger"] = 0.5  # plain words like "note" or "link" are readable, just less magnetic
    score = round(100 * (0.4 * parts["pain"] + 0.2 * parts["moment"] + 0.25 * parts["stranger"] + 0.15 * parts["order"]))
    if not check["ok"] and (set(feature_ids) & SUPPORT_ONLY_FEATURES or _first(text, ADMIN_CUES) is not None):
        score = min(score, 30)
    return {"scroll_stop": score, "pain_first": check["ok"], "pain_reasons": check["reasons"], "scroll_parts": parts}


def rank_key(candidate: dict) -> tuple:
    """Audience pain first, then scroll-stop, then the original readability/specificity heuristic."""
    return (not candidate.get("pain_first", False), -candidate.get("scroll_stop", 0), -candidate["score"], candidate["text"])


def tokens(text: str) -> list[str]:
    """Lower-cased content tokens with a light stem; stop words dropped."""
    out = []
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if w in STOP:
            continue
        for suf in ("ing", "ed", "es", "s"):
            if len(w) > len(suf) + 3 and w.endswith(suf):
                w = w[: -len(suf)]
                break
        out.append(w)
    return out


def numbers_in(text: str) -> set[str]:
    """Digits and number words (two..ten, hundred...) as digit strings. 'one' is ignored on purpose."""
    nums = {n.replace(",", "") for n in re.findall(r"\d[\d,]*", text)}
    nums |= {_NUMWORDS[w] for w in re.findall(r"[a-z]+", text.lower()) if w in _NUMWORDS}
    return nums


def cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def norm_feature(f: dict) -> dict:
    """Accepts {id, name|label|title, tags?, claims?: [{text, feature_id?}|str]} and returns the canonical shape."""
    fid = f["id"]
    claims = []
    for c in f.get("claims") or []:
        text = c if isinstance(c, str) else c.get("text", "")
        if text.strip():
            claims.append({"text": text.strip(), "feature_id": (c.get("feature_id") if isinstance(c, dict) else None) or fid})
    return {"id": fid, "name": f.get("name") or f.get("label") or f.get("title") or fid,
            "tags": list(f.get("tags") or []), "claims": claims}


def load_features(catalogue) -> list[dict]:
    """Catalogue may be a list of features, {"features": [...]}, or {id: feature}."""
    if isinstance(catalogue, dict):
        if "features" in catalogue:
            catalogue = catalogue["features"]
        else:
            catalogue = [{"id": k, **v} for k, v in catalogue.items() if isinstance(v, dict)]
    return [norm_feature(f) for f in catalogue]


def _ctx(feature: dict, audience: dict, question: str) -> dict:
    moment = audience.get("moment", "you need something you saved")
    n = len(feature["claims"])
    return {"feature": feature["name"], "thing": audience.get("thing", "saved reels"),
            "one": audience.get("one", "a saved reel"), "moment": moment, "Moment": cap(moment),
            "pain": audience.get("pain", "you cannot find what you saved"), "Pain": cap(audience.get("pain", "you cannot find what you saved")),
            "stop": audience.get("stop", "saving reels you never open again"), "question": question,
            "n": _WORDNUM.get(str(n), str(n)), "n_digit": str(n)}


# (framework, template). Slots come only from `_ctx`; templates make no product claims of their own.
TEMPLATES: list[tuple[str, str]] = [
    ("curiosity", "{Moment}. Here is the part that matters."),
    ("curiosity", "{Pain}. There is a reason."),
    ("pattern_interrupt", "Pause. {Moment}."),
    ("pattern_interrupt", "Before you save any more {thing}, read this."),
    ("contrarian", "More folders will not fix {thing}."),
    ("contrarian", "Saving {thing} is not the same as using them."),
    ("specific_number", "{n} things {feature} keeps from {one}."),
    ("specific_number", "{n} places the answer hides in {one}."),
    ("specific_number", "One thing {feature} does with {one}."),
    ("curiosity", "What happens to {one} after you save it?"),
    ("contrarian", "The problem with {thing} is not the saving."),
    ("demonstration", "{feature}, shown on {one}."),
    ("pov", "POV: you finally find {one}."),
    ("pov", "POV: {moment}."),
    ("pov", "POV: {pain}."),
    ("stop_doing", "Stop {stop}."),
    ("stop_doing", "Stop {stop}. Do this instead."),
    ("question", "{question}"),
    ("question", "Quick question: {question}"),
    ("demonstration", "Watch what {feature} does with {one}."),
    ("demonstration", "Here is {one}, start to finish, in {feature}."),
]


def fill(template: str, ctx: dict) -> str:
    class _D(dict):
        def __missing__(self, k):
            return ""
    return re.sub(r"\s+", " ", template.format_map(_D(ctx))).strip()


def validate_hook(text: str, allowed_numbers: Iterable[str] = ()) -> str | None:
    """Return a rejection reason, or None if the hook is acceptable."""
    low = text.lower()
    for b in BANNED:
        if b in low:
            return f"banned word: {b}"
    extra = numbers_in(text) - set(allowed_numbers)
    if extra:
        return f"unsupported number: {sorted(extra)}"
    if not 3 <= len(text.split()) <= 22:
        return "length"
    return None


def heuristic_score(text: str, feature: dict, audience: dict, question: str = "") -> dict:
    """0-100 readability / specificity / payoff heuristic. NOT a virality or engagement estimate.

    parts (each 0-1): length (4-12 words ideal), readability (short words), specificity
    (overlap with feature name, claim text, audience thing and question), payoff (promise cue or
    open question). Weighted 0.2 / 0.2 / 0.35 / 0.25. Same inputs always give the same score.
    """
    words = text.split()
    n = len(words)
    length = 1.0 if 4 <= n <= 12 else max(0.0, 1 - (min(abs(n - 4), abs(n - 12)) / 10))
    avg = sum(len(re.sub(r"\W", "", w)) for w in words) / max(n, 1)
    readability = max(0.0, min(1.0, 1 - (avg - 4.5) / 3))
    ctx = set(tokens(feature["name"] + " " + audience.get("thing", "") + " " + audience.get("one", "") + " " + question))
    for c in feature["claims"]:
        ctx |= set(tokens(c["text"]))
    hits = len(set(tokens(text)) & ctx)
    specificity = min(1.0, hits / 3)
    low = text.lower()
    payoff = 1.0 if (any(c in low for c in PROMISE_CUES) or text.rstrip().endswith("?")) else 0.3
    parts = {"length": round(length, 2), "readability": round(readability, 2),
             "specificity": round(specificity, 2), "payoff": round(payoff, 2)}
    score = round(100 * (0.2 * length + 0.2 * readability + 0.35 * specificity + 0.25 * payoff))
    return {"score": score, "parts": parts, "method": "heuristic-readability-specificity-payoff (not an LLM judge, not a popularity estimate)"}


def generate_hook_candidates(feature: dict, audience: dict, question: str,
                             llm: Callable[[str], str] | None = None, max_llm: int = 4) -> list[dict]:
    """Return distinct, validated candidates sorted by heuristic score (desc).

    feature   normalised feature (see norm_feature); needs >=1 claim to be useful.
    audience  {thing, one, moment, pain, stop, ...}; question is one of the audience's real questions.
    llm       optional callable(prompt)->str returning one hook per line. Its lines pass through the
              same validation as templates; with no llm every candidate is `source: "template"`.
    Each candidate: {text, framework, score, parts, method, source, feature_ids}.
    """
    ctx = _ctx(feature, audience, question)
    claim_text = " ".join(c["text"] for c in feature["claims"])
    allowed = numbers_in(claim_text + " " + feature["name"] + " " + question)
    if len(feature["claims"]) >= 2:
        allowed.add(ctx["n_digit"])
    raw = [(fw, fill(t, ctx), "template") for fw, t in TEMPLATES if "{n}" not in t or len(feature["claims"]) >= 2]
    if llm:
        prompt = (f"Write up to {max_llm} short Instagram hooks (one per line, no numbering) for the feature "
                  f"'{feature['name']}'. Audience: {audience.get('label', '')}. Question: {question}. Allowed facts: "
                  f"{claim_text}. Do not invent numbers, outcomes or trends.")
        try:
            lines = [l.strip(" -*\t") for l in llm(prompt).splitlines() if l.strip()][:max_llm]
        except Exception:  # an LLM failure must never block the local path
            lines = []
        raw += [("llm", l, "llm") for l in lines]
    seen, out = [], []
    for fw, text, src in raw:
        if validate_hook(text, allowed):
            continue
        key = set(tokens(text))
        if any(key and len(key & s) / len(key | s) > 0.8 for s in seen):
            continue
        seen.append(key)
        h = heuristic_score(text, feature, audience, question)
        out.append({"text": text, "framework": fw, "source": src, "feature_ids": [feature["id"]], **h,
                    **scroll_stop_score(text, [feature["id"]])})
    return sorted(out, key=rank_key)


def select_top3(candidates: list[dict]) -> list[dict]:
    """Top three in rank order (pain-first, scroll-stop, heuristic), preferring distinct frameworks."""
    top, used = [], set()
    for c in candidates:
        if c["framework"] not in used:
            top.append(c)
            used.add(c["framework"])
        if len(top) == 3:
            return top
    return top + [c for c in candidates if c not in top][: 3 - len(top)]

"""Reel beats and carousel slides built from a format, a feature's claims and a chosen hook.

Payoff lines are the catalogue's claim texts verbatim; the templates add framing only and no
product statements. Timing is derived from word count (about 2.6 words/s), not guessed.
"""
from __future__ import annotations

from .hooks import cap, fill

WPS = 2.6
DEFAULT_CTA = "Link in bio to try Skwirl."


def _ctx(feature: dict, audience: dict, question: str) -> dict:
    return {"feature": feature["name"], "thing": audience.get("thing", "saved reels"),
            "one": audience.get("one", "a saved reel"), "question": question}


def _dur(vo: str, floor: float) -> float:
    return round(max(floor, len(vo.split()) / WPS + 0.4), 1)


def _short(text: str, n: int = 6) -> str:
    w = text.rstrip(".").split()
    return " ".join(w[:n]) + ("..." if len(w) > n else "")


def build_reel(fmt: dict, feature: dict, audience: dict, question: str, hook: str,
               cta: str = DEFAULT_CTA, max_payoffs: int = 2) -> list[dict]:
    """Timed beats: hook, re-hook, payoff x (1..max_payoffs), cta.

    Each beat: {t_start, t_end, role, vo, on_screen, shot, feature_ids}. fmt needs `rehook` and
    `shots` (hook/rehook/payoff/cta); blanks fall back to neutral wording. Raises ValueError if the
    feature has no claims, since there would be nothing true to say.
    """
    if not feature["claims"]:
        raise ValueError(f"feature {feature['id']} has no claims")
    c = _ctx(feature, audience, question)
    shots = fmt.get("shots", {})
    fids = [feature["id"]]
    rehook = fill(fmt.get("rehook") or "Here is how {feature} handles it.", c)
    beats = [("hook", hook, hook, shots.get("hook") or "Frame zero: the hook as large text over a relevant scene", 2.0),
             ("re-hook", rehook, _short(rehook), shots.get("rehook") or "Cut to the starting state", 2.0)]
    for cl in feature["claims"][:max_payoffs]:
        beats.append(("payoff", cl["text"], f"{feature['name']}: {_short(cl['text'], 5)}",
                      fill(shots.get("payoff") or "Skwirl screen showing this (seeded demo)", c), 3.0))
    beats.append(("cta", cta, "Skwirl", shots.get("cta") or "Wordmark", 2.0))
    t, out = 0.0, []
    for role, vo, on_screen, shot, floor in beats:
        d = _dur(vo, floor)
        ids = fids if role in ("payoff", "re-hook") else (fids if role == "hook" else [])
        out.append({"t_start": round(t, 1), "t_end": round(t + d, 1), "role": role, "vo": vo,
                    "on_screen": on_screen, "shot": shot, "feature_ids": ids})
        t += d
    return out


def build_carousel(fmt: dict, feature: dict, audience: dict, question: str, hook: str,
                   cta: str = DEFAULT_CTA, max_payoffs: int = 3) -> list[dict]:
    """Slides: hook, format-specific middle jobs, one payoff per claim, cta.

    Each slide: {n, job, text, bridge, visual, feature_ids}. `bridge` is the line that hands the
    reader to the next slide (empty on the last). `text` is the on-slide copy.
    """
    if not feature["claims"]:
        raise ValueError(f"feature {feature['id']} has no claims")
    c = _ctx(feature, audience, question)
    fids = [feature["id"]]
    slides = [{"job": "hook", "text": hook, "bridge": "", "visual": "Hook as large type; one calm illustration", "feature_ids": []}]
    for s in fmt.get("slide_jobs") or [{"job": "setup", "text": question, "bridge": "", "visual": "The question as a card"}]:
        slides.append({"job": s["job"], "text": fill(s["text"], c), "bridge": fill(s.get("bridge", ""), c),
                       "visual": fill(s.get("visual", ""), c), "feature_ids": []})
    for cl in feature["claims"][:max_payoffs]:
        slides.append({"job": "payoff", "text": cl["text"], "bridge": fill(fmt.get("payoff_bridge", ""), c),
                       "visual": fill(fmt.get("payoff_visual") or "Skwirl screen (seeded demo)", c), "feature_ids": fids})
    slides.append({"job": "cta", "text": cta, "bridge": "", "visual": "Wordmark on brand background", "feature_ids": []})
    for i, s in enumerate(slides):
        s["n"] = i + 1
        if i + 1 < len(slides) and not s["bridge"]:
            s["bridge"] = {"hook": fill("Here is the answer.", c)}.get(s["job"], "")
        if i + 1 == len(slides):
            s["bridge"] = ""
    return [{"n": s["n"], "job": s["job"], "text": s["text"], "bridge": s["bridge"], "visual": s["visual"],
             "feature_ids": s["feature_ids"]} for s in slides]

"""The frame gate is the piece most likely to be silently wrong.

If it fires on everything it burns vision tokens on talking heads; if it fires
on nothing it misses exactly the screen-recording reels that motivated the
project. These are the three cases from the plan's verification section.
"""

from __future__ import annotations

from stash.frames import LOW_CONFIDENCE, plan_frames
from stash.transcribe import Segment, Transcript


def _transcript(*pairs: tuple[str, float]) -> Transcript:
    segments = [
        Segment(start=i * 5.0, end=i * 5.0 + 5.0, text=text, avg_logprob=logprob)
        for i, (text, logprob) in enumerate(pairs)
    ]
    return Transcript(text=" ".join(p[0] for p in pairs), segments=segments, via="test")


def test_talking_head_gets_only_the_title_card():
    """Confident narration with no screen references needs one frame."""
    plan = plan_frames(
        _transcript(
            ("So the big idea behind agent memory is persistence.", -0.2),
            ("Most people get this wrong when they start out.", -0.15),
            ("You want a durable store, not a context window.", -0.25),
        ),
        duration=15.0,
    )
    assert len(plan) == 1
    assert plan[0].reason == "title card"


def test_demonstrative_phrase_pulls_a_frame_at_that_moment():
    """'Run this command' is precisely where the value is on screen."""
    plan = plan_frames(
        _transcript(
            ("Here is how I set up my agent loop.", -0.2),
            ("Just run this command and it scaffolds everything.", -0.2),
            ("Then you are done.", -0.2),
        ),
        duration=15.0,
    )
    reasons = [f.reason for f in plan]
    assert any("says" in r for r in reasons), reasons
    # Segment 1 spans 5-10s, so its midpoint is 7.5s.
    hit = next(f for f in plan if "says" in f.reason)
    assert 5.0 <= hit.timestamp <= 10.0


def test_low_confidence_segment_pulls_a_frame():
    """Garbled jargon usually means the tool name is only legible on screen."""
    plan = plan_frames(
        _transcript(
            ("Today we are looking at a new framework.", -0.2),
            ("It is called lang graph or something.", LOW_CONFIDENCE - 0.3),
        ),
        duration=10.0,
    )
    assert any("low confidence" in f.reason for f in plan)


def test_silent_reel_falls_back_to_even_sampling():
    """No audio means the video *is* the content — sample it."""
    plan = plan_frames(
        Transcript(skipped=True, reason="silent track (-70 dBFS)"),
        duration=30.0,
    )
    assert len(plan) > 1
    assert all("no usable audio" in f.reason for f in plan)
    assert plan == sorted(plan, key=lambda f: f.timestamp)


def test_frame_count_is_capped():
    """Vision cost is dominated by frames, so the cap must actually hold."""
    noisy = _transcript(*[("Look at this thing right here.", -0.9)] * 40)
    plan = plan_frames(noisy, duration=200.0, max_frames=5)
    assert len(plan) <= 5


def test_nearby_picks_are_deduped():
    """Adjacent segments both matching should not yield near-identical frames."""
    plan = plan_frames(
        _transcript(
            ("Copy this.", -0.9),
            ("Paste this.", -0.9),
        ),
        duration=10.0,
    )
    timestamps = sorted(f.timestamp for f in plan)
    gaps = [b - a for a, b in zip(timestamps, timestamps[1:])]
    assert all(gap >= 1.5 for gap in gaps), timestamps

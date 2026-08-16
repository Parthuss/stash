"""Guarding against the Groq flat-confidence trap.

Groq's transcription API returns one document-level ``avg_logprob`` copied onto
every segment. Measured against the live API: -0.186 on every segment of clean
speech, -1.236 on every segment of deliberately garbled speech. If the gate
treats that as a positional signal it fires on all segments or none — the exact
failure it exists to prevent — so it has to detect flatness and switch modes.
"""

from __future__ import annotations

from stash.frames import LOW_CONFIDENCE, has_per_segment_confidence, plan_frames
from stash.transcribe import Segment, Transcript


def _transcript(texts: list[str], logprobs: list[float]) -> Transcript:
    segments = [
        Segment(start=i * 4.0, end=i * 4.0 + 4.0, text=t, avg_logprob=lp)
        for i, (t, lp) in enumerate(zip(texts, logprobs))
    ]
    return Transcript(text=" ".join(texts), segments=segments, via="test")


CLEAN = ["Agent memory matters.", "Store it outside the context.", "That is the idea."]
MURKY = ["Kubernetes has impressed.", "Stay in the air.", "Kodoba QJKWN."]


def test_flat_confidence_is_detected():
    """Groq's real shape: same value on every segment."""
    groq_like = _transcript(CLEAN, [-0.186, -0.186, -0.186])
    assert not has_per_segment_confidence(groq_like)

    local_like = _transcript(CLEAN, [-0.12, -0.88, -0.31])
    assert has_per_segment_confidence(local_like)


def test_single_segment_is_treated_as_flat():
    """One segment carries no positional information by definition."""
    assert not has_per_segment_confidence(_transcript(["Just one."], [-0.9]))


def test_flat_low_confidence_does_not_tag_every_segment():
    """The old bug: a bad document marked every moment as a low-confidence hit."""
    plan = plan_frames(_transcript(MURKY, [-1.236] * 3), duration=12.0)
    assert not any("low confidence" in f.reason for f in plan), [f.reason for f in plan]


def test_flat_low_confidence_widens_sampling_instead():
    """A transcript unreliable throughout means look at more of the video."""
    plan = plan_frames(_transcript(MURKY, [-1.236] * 3), duration=12.0)
    assert any("whole transcript unreliable" in f.reason for f in plan)
    assert len(plan) > 1


def test_flat_good_confidence_stays_cheap():
    """Clean Groq audio with no screen references should still cost one frame."""
    plan = plan_frames(_transcript(CLEAN, [-0.186] * 3), duration=12.0)
    assert len(plan) == 1
    assert plan[0].reason == "title card"


def test_demonstratives_still_work_under_flat_confidence():
    """The phrase branch is backend-independent and must survive the mode switch."""
    plan = plan_frames(
        _transcript(
            ["Agent memory matters.", "Just run this command right here.", "Done."],
            [-0.186] * 3,
        ),
        duration=12.0,
    )
    hit = [f for f in plan if "says" in f.reason]
    assert len(hit) == 1
    assert 4.0 <= hit[0].timestamp <= 8.0


def test_varying_confidence_still_picks_the_bad_moment():
    """With a real per-segment backend, positional behaviour is unchanged."""
    plan = plan_frames(
        _transcript(CLEAN, [-0.12, LOW_CONFIDENCE - 0.4, -0.20]), duration=12.0
    )
    hit = [f for f in plan if "low confidence" in f.reason]
    assert len(hit) == 1
    assert 4.0 <= hit[0].timestamp <= 8.0

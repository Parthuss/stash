"""Deciding *which* frames are worth looking at.

Borrowed from woosal1337/media-mcp, whose framing of the problem is the best one
I found: small Whisper models are great at hearing and terrible at reading. So
rather than sampling keyframes blindly, transcribe first and pull frames only
where the audio admits it isn't self-sufficient — either because the model was
unsure, or because the speaker said something that only makes sense with the
screen in view.

That distinction matters a lot for dev-tutorial reels specifically. A talking
head narrating an idea needs one frame. A screen recording whose narration is
"just run this command" needs a frame at exactly that moment, and blind sampling
would very likely miss it while burning tokens on ninety seconds of face.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .transcribe import Transcript

#: Phrases that point at the screen. The audio around these is load-bearing but
#: incomplete, which makes their timestamps the highest-value frames in the clip.
DEMONSTRATIVES = [
    r"\bthis (?:command|code|line|file|setting|part|one|prompt|repo|tool)\b",
    r"\b(?:like|exactly) (?:this|that)\b",
    r"\bright here\b",
    r"\b(?:link|it'?s) in (?:my )?bio\b",
    r"\bas you can see\b",
    r"\byou can see\b",
    r"\b(?:the|shown) (?:one )?(?:below|above|here)\b",
    r"\bcopy (?:this|that|it)\b",
    r"\bpaste (?:this|that|it)\b",
    r"\btype (?:this|that)\b",
    r"\bon (?:the )?screen\b",
    r"\bhere'?s (?:the|my|how)\b",
    r"\blooks? like (?:this|that)\b",
    r"\bthese (?:steps|settings|options|tools)\b",
]
_DEMO_RE = re.compile("|".join(DEMONSTRATIVES), re.IGNORECASE)

#: Whisper segments at or below this mean log-probability are shaky enough that
#: the screen is likely carrying meaning the audio lost (jargon, tool names).
LOW_CONFIDENCE = -0.65

#: Hard ceiling. Frames dominate vision cost, so this is the spend control.
MAX_FRAMES = 5


@dataclass
class FrameRequest:
    timestamp: float
    #: Why this frame was chosen — ends up in the note, and makes the gate
    #: debuggable when it fires on everything or nothing.
    reason: str


def has_per_segment_confidence(transcript: Transcript) -> bool:
    """Whether ``avg_logprob`` actually varies between segments.

    It does not on Groq. Their API returns one document-level ``avg_logprob``
    repeated on every segment — measured at -0.186 across all segments of clean
    speech and -1.236 across all segments of deliberately garbled speech. The
    number is meaningful about the *recording*, useless about *which moment*.

    Local faster-whisper does give genuine per-segment values. So rather than
    branching on the backend name, detect it: identical values across more than
    one segment means the signal is document-level and must be used that way.
    Treating it as positional would make the gate fire on every segment or none
    — which is the exact failure mode this gate exists to avoid.
    """
    values = {round(s.avg_logprob, 6) for s in transcript.segments}
    return len(values) > 1


def plan_frames(
    transcript: Transcript, duration: float, *, max_frames: int = MAX_FRAMES
) -> list[FrameRequest]:
    """Choose timestamps to look at. Ordered by value, truncated to the cap."""
    # Nothing to hear: the video *is* the content. Sample it evenly.
    if transcript.skipped or not transcript.segments:
        return _even_sample(duration, max_frames, reason="no usable audio")

    picks: list[FrameRequest] = []
    positional_confidence = has_per_segment_confidence(transcript)

    for segment in transcript.segments:
        midpoint = (segment.start + segment.end) / 2
        if _DEMO_RE.search(segment.text):
            picks.append(FrameRequest(midpoint, f'says "{segment.text.strip()[:60]}"'))
        elif positional_confidence and segment.avg_logprob <= LOW_CONFIDENCE:
            picks.append(
                FrameRequest(midpoint, f"low confidence ({segment.avg_logprob:.2f})")
            )

    # A title card almost always carries the hook, the handle, or the tool name.
    picks.insert(0, FrameRequest(min(1.0, duration / 10 or 1.0), "title card"))

    # Document-level confidence can still be used — just not to pick moments.
    # A transcript that is shaky throughout means the audio is not carrying the
    # content, so look at more of the video rather than trusting the words.
    if not positional_confidence and transcript.segments:
        overall = transcript.segments[0].avg_logprob
        if overall <= LOW_CONFIDENCE:
            picks += _even_sample(
                duration, max_frames - 1,
                reason=f"whole transcript unreliable ({overall:.2f})",
            )

    deduped = _dedupe(picks, min_gap=1.5)
    if len(deduped) > max_frames:
        # Keep the title card, then the most-specific reasons first.
        head, tail = deduped[:1], deduped[1:]
        tail.sort(key=lambda f: 0 if f.reason.startswith("says") else 1)
        deduped = head + tail[: max_frames - 1]
        deduped.sort(key=lambda f: f.timestamp)
    return deduped


def _even_sample(duration: float, count: int, *, reason: str) -> list[FrameRequest]:
    if duration <= 0:
        return [FrameRequest(0.5, reason)]
    step = duration / (count + 1)
    return [FrameRequest(step * (i + 1), reason) for i in range(count)]


def _dedupe(picks: list[FrameRequest], *, min_gap: float) -> list[FrameRequest]:
    picks = sorted(picks, key=lambda f: f.timestamp)
    kept: list[FrameRequest] = []
    for pick in picks:
        if kept and pick.timestamp - kept[-1].timestamp < min_gap:
            continue
        kept.append(pick)
    return kept


def extract(video: Path, requests: list[FrameRequest], out_dir: Path) -> list[Path]:
    """Grab the planned frames, downscaled. Missing frames are skipped, not fatal."""
    if not shutil.which("ffmpeg"):
        return []
    out_dir.mkdir(parents=True, exist_ok=True)

    written: list[Path] = []
    for index, request in enumerate(requests):
        target = out_dir / f"{video.stem}_f{index:02d}.jpg"
        if not target.exists():
            proc = subprocess.run(
                ["ffmpeg", "-y", "-ss", f"{request.timestamp:.2f}", "-i", str(video),
                 "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "4", str(target)],
                capture_output=True, text=True, timeout=120,
            )
            if proc.returncode != 0 or not target.exists():
                continue
        written.append(target)
    return written

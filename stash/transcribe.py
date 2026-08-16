"""Audio -> text, with the per-segment confidence the frame gate needs.

Worth knowing before you read this: on Instagram, Whisper is mandatory, not a
fallback. Reels carry auto-captions inside the app but Instagram does not expose
them to downloaders — ``--write-auto-subs`` returns nothing (yt-dlp#15874, still
open). The subtitles-first shortcut that most transcript tools lead with simply
never fires on our primary source.

We keep ``avg_logprob`` per segment because :mod:`stash.frames` uses it to
decide where the audio stopped being self-sufficient and the video has to be
looked at. A plain transcript string would throw that signal away.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from .config import CONFIG

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = "whisper-large-v3-turbo"

#: Below this mean volume we treat the track as silent. Muted reels are common
#: and transcribing them wastes a request to produce hallucinated filler.
SILENCE_DBFS = -50.0

#: Shorter than this and there is nothing worth sending.
MIN_SECONDS = 3.0


class TranscribeError(RuntimeError):
    pass


@dataclass
class Segment:
    start: float
    end: float
    text: str
    #: Mean log-probability. Closer to 0 is confident; -1.0 and below is shaky.
    avg_logprob: float = 0.0
    no_speech_prob: float = 0.0


@dataclass
class Transcript:
    text: str = ""
    segments: list[Segment] = field(default_factory=list)
    language: str = ""
    #: True when we deliberately skipped: silent, too short, or no audio stream.
    skipped: bool = False
    reason: str = ""
    via: str = ""

    def __bool__(self) -> bool:
        return bool(self.text.strip())


def extract_audio(video: Path) -> Path | None:
    """16 kHz mono WAV, the shape every Whisper backend wants.

    Returns None when the file has no audio stream at all.
    """
    if not shutil.which("ffmpeg"):
        raise TranscribeError("ffmpeg is not installed (brew install ffmpeg)")

    wav = video.with_suffix(".wav")
    if wav.exists() and wav.stat().st_size > 0:
        return wav

    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000",
         "-f", "wav", str(wav)],
        capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0 or not wav.exists() or wav.stat().st_size == 0:
        wav.unlink(missing_ok=True)
        return None
    return wav


def probe_audio(wav: Path) -> tuple[float, float]:
    """Return ``(duration_seconds, mean_dBFS)`` for a WAV file."""
    duration = 0.0
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(wav)],
        capture_output=True, text=True, timeout=60,
    )
    try:
        duration = float((probe.stdout or "0").strip())
    except ValueError:
        duration = 0.0

    volume = subprocess.run(
        ["ffmpeg", "-i", str(wav), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True, timeout=120,
    )
    mean = -99.0
    for line in (volume.stderr or "").splitlines():
        if "mean_volume:" in line:
            try:
                mean = float(line.split("mean_volume:")[1].strip().split()[0])
            except (IndexError, ValueError):
                pass
    return duration, mean


def transcribe(video: Path) -> Transcript:
    """Transcribe a video, skipping cleanly when there is nothing to hear."""
    wav = extract_audio(video)
    if wav is None:
        return Transcript(skipped=True, reason="no audio stream")

    duration, mean_dbfs = probe_audio(wav)
    if duration < MIN_SECONDS:
        return Transcript(skipped=True, reason=f"audio only {duration:.1f}s")
    if mean_dbfs <= SILENCE_DBFS:
        return Transcript(skipped=True, reason=f"silent track ({mean_dbfs:.0f} dBFS)")

    if CONFIG.groq_api_key:
        return _groq(wav)
    return _local(wav)


def _groq(wav: Path) -> Transcript:
    with wav.open("rb") as handle:
        response = httpx.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {CONFIG.groq_api_key}"},
            files={"file": (wav.name, handle, "audio/wav")},
            data={
                "model": GROQ_MODEL,
                "response_format": "verbose_json",
                "timestamp_granularities[]": "segment",
            },
            timeout=300,
        )
    if response.status_code != 200:
        raise TranscribeError(f"groq {response.status_code}: {response.text[:300]}")

    body = response.json()
    segments = [
        Segment(
            start=float(s.get("start", 0.0)),
            end=float(s.get("end", 0.0)),
            text=(s.get("text") or "").strip(),
            avg_logprob=float(s.get("avg_logprob", 0.0)),
            no_speech_prob=float(s.get("no_speech_prob", 0.0)),
        )
        for s in body.get("segments") or []
    ]
    return Transcript(
        text=(body.get("text") or "").strip(),
        segments=segments,
        language=body.get("language") or "",
        via="groq",
    )


def _local(wav: Path) -> Transcript:
    """faster-whisper fallback: no network, no key, no daily cap."""
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError as exc:
        raise TranscribeError(
            "no GROQ_API_KEY set and faster-whisper is not installed. "
            "Either add a free Groq key to .env or `pip install -e '.[local-whisper]'`."
        ) from exc

    model = WhisperModel("base", device="cpu", compute_type="int8")
    raw_segments, info = model.transcribe(str(wav), vad_filter=True)
    segments = [
        Segment(
            start=s.start,
            end=s.end,
            text=(s.text or "").strip(),
            avg_logprob=getattr(s, "avg_logprob", 0.0),
            no_speech_prob=getattr(s, "no_speech_prob", 0.0),
        )
        for s in raw_segments
    ]
    return Transcript(
        text=" ".join(s.text for s in segments).strip(),
        segments=segments,
        language=getattr(info, "language", "") or "",
        via="faster-whisper",
    )


def to_json(transcript: Transcript) -> str:
    return json.dumps(
        {
            "text": transcript.text,
            "language": transcript.language,
            "via": transcript.via,
            "skipped": transcript.skipped,
            "reason": transcript.reason,
            "segments": [vars(s) for s in transcript.segments],
        },
        indent=2,
    )

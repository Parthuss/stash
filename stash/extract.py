"""Turn captions, transcripts, and ordered visuals into an actionable note.

Groq handles both stages: Qwen describes each image one at a time — see
VISION_BATCH_SIZE for why that is 1 despite the API allowing more — then the
same model produces the final JSON object. Both calls run with reasoning
switched on (REASONING_EFFORT); this is a personal knowledge base doing a
handful of captures a day, not a high-throughput service, so trading some
speed for a pass that reliably reads what is actually on screen is the right
default. This keeps carousel order explicit and removes Claude usage from the
processing path.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, TypeVar

import httpx

from .config import CONFIG

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

#: A hard API limit on how many images ONE request may contain — the model
#: rejects a 4th with "This model supports up to 3 images" (HTTP 400). This is
#: a ceiling, not the number we actually pack per request; see
#: VISION_BATCH_SIZE below for why those are different numbers.
MAX_IMAGES_PER_REQUEST = 3

#: How many images actually go in one vision request. Deliberately 1, despite
#: the API allowing up to 3.
#:
#: Measured on the same dense GitHub-repo frame that motivated this file's
#: OCR tuning, holding image resolution, prompt, and reasoning all equal:
#: sending it ALONE, the model transcribed all ten folder/file names correctly,
#: twice, reliably. Sent as one of TWO images in a shared JSON response, the
#: same frame's description dropped every folder name and became a generic
#: "shows a file directory listing" — not because it ran out of tokens
#: (`finish_reason: "stop"`, ~1300 of an 1800-token budget used), but because
#: asking for N uniform items in one array measurably compresses per-item
#: detail even when there is room to spare. One image per request avoids that
#: compression entirely. It costs more requests, which is a real trade against
#: the 8,000 TPM ceiling below — but at personal-project volume, a multi-frame
#: reel taking an extra 30–60s beats a note that silently dropped the one
#: detail the audio was withholding.
VISION_BATCH_SIZE = 1

#: Reasoning mode for every Groq call this module makes (vision AND the final
#: structuring call — both run through the same `_groq_request`). Qwen on Groq
#: only accepts "none" or "default"; "none" is non-thinking/fast-dialogue mode.
#:
#: This used to be "none", which was the actual cause of the OCR miss above —
#: not resolution, not batching. With reasoning "none", the SAME single frame
#: at the SAME 512px produced the vague, folder-name-free description; visibly
#: switching the model into its <think> mode (leaving reasoning at its
#: contract default with no override) is what let it read the dense file tree
#: correctly and repeatably. "none" trades that away for speed, which is the
#: wrong trade for a personal knowledge base processing a handful of saves a
#: day: the whole point of the vision pass is reading text the audio
#: deliberately withholds, so it should not be running in the mode that reads
#: worst.
REASONING_EFFORT = "default"

#: Longest edge images are scaled to before upload.
#:
#: Two things were measured against the live API:
#:
#: 1. Token cost is **flat across resolution** — one image bills the same
#:    prompt tokens at 512px, 768px and 1024px (804 on a simple frame, 818 on a
#:    dense one, identical across six runs each). Groq normalises images to a
#:    fixed budget, so a larger upload buys no extra detail allowance.
#: 2. Larger is *worse* for OCR. On a dense GitHub-screenshot frame, 512px
#:    returned 1328 chars including "MIT license" and the full file tree, while
#:    1024px returned 653-748 chars and garbled text the smaller version got
#:    right — "blade humanizer" for "blader / humanizer", commit "1b48564" read
#:    as "lb48564". The model downsamples internally either way; handing it a
#:    clean ffmpeg resize beats making it do its own.
#:
#: Both measurements predate the REASONING_EFFORT fix above and hold up under
#: it too — 512px + reasoning "default" + one image per request is what
#: reliably reads a dense frame completely. Do not raise this expecting more
#: detail; the two levers that actually mattered were reasoning and batching,
#: not resolution.
VISION_IMAGE_PX = 512

#: Per-image vision budget. Measured completion at 512px + reasoning "default"
#: on a dense frame: ~1274 tokens (headroom for the <think> block plus a full
#: answer), comfortably under this with room for denser frames.
VISION_MAX_TOKENS = 2000

#: Budget check: at VISION_BATCH_SIZE=1, one image is roughly 800 prompt +
#: ~1300 completion tokens ≈ 2.1K against a measured 8,000 TPM ceiling
#: (`x-ratelimit-limit-tokens`) — about 3–4 images per minute before backing
#: off. A 5-frame reel plus the final extraction call can span two or three
#: TPM windows; `_groq_request` backs off on 429 for exactly that case. This
#: is slower than the old batched approach, and that is the correct trade at
#: personal-project volume: nothing here is time-critical, and the alternative
#: is a faster note that silently dropped detail.
FINAL_MAX_TOKENS = 4000

TOPICS = [
    "agent-building", "automation", "tooling", "prompting", "rag",
    "infrastructure", "design", "research", "inspiration", "business", "other",
]

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Specific, searchable. Not the caption."},
        "summary": {"type": "string", "description": "One sentence on what it actually teaches."},
        "topic": {"type": "string", "enum": TOPICS},
        "tools": {
            "type": "array", "items": {"type": "string"},
            "description": "Named libraries, products, models, services. Lowercase. [] if none.",
        },
        "why_saved": {
            "type": "string",
            "description": "Best guess at what caught this person's eye, given who they are.",
        },
        "next_step": {
            "type": "string",
            "description": "One concrete thing doable in ~20 minutes. Name a file or command where possible.",
        },
        "difficulty": {"type": "string", "enum": ["trivial", "afternoon", "weekend"]},
        "relevance": {
            "type": "array", "items": {"type": "string"},
            "description": "Which listed projects this could plug into. [] if none.",
        },
        "frame_notes": {
            "type": "string",
            "description": "Ordered slide/frame content absent from audio, including exact visible text.",
        },
    },
    "required": [
        "title", "summary", "topic", "tools", "why_saved", "next_step",
        "difficulty", "relevance", "frame_notes",
    ],
    "additionalProperties": False,
}

SYSTEM = """\
You are indexing one saved social-media post for a developer's personal knowledge base.

Who they are: they build AI agents, automation pipelines, and internal tools. They save
things on Instagram intending to use them later and almost never do. Make the save
specific, searchable, and actionable.

Their current projects, for the `relevance` field:
{projects}

Rules:
- Judge the content, not the packaging.
- Preserve carousel order when combining ideas across slides.
- `tools` contains only products or libraries actually named in the material.
- `next_step` is one real move doable in about 20 minutes, not a study plan.
- If the material is thin or promotional, say so plainly.
- Return one JSON object matching the supplied schema and no prose.
"""


class ExtractError(RuntimeError):
    pass


def sibling_projects() -> list[str]:
    parent = CONFIG.media_dir.parent.parent
    if not parent.is_dir():
        return []
    return sorted(
        path.name for path in parent.iterdir()
        if path.is_dir() and not path.name.startswith((".", "node_modules"))
        and path.name != CONFIG.media_dir.parent.name
    )


def build_prompt(
    *,
    permalink: str | None,
    user_note: str | None,
    transcript_text: str,
    caption: str = "",
    transcript_reason: str,
    visual_notes: list[str],
    meta: dict[str, str],
) -> str:
    parts = ["# Saved post\n"]
    if permalink:
        parts.append(f"URL: {permalink}")
    for key, value in meta.items():
        if value:
            parts.append(f"{key.title()}: {value}")
    if user_note:
        parts.append(f"\nTheir note when saving: {user_note!r}")
    if caption:
        parts.append(f"\n## Caption (author's words; may be promotional)\n\n{caption.strip()}")
    parts.extend([
        "\n## Transcript\n",
        transcript_text.strip() or f"(none — {transcript_reason or 'unavailable'})",
    ])
    if visual_notes:
        parts.append("\n## Ordered visual notes\n")
        parts.extend(f"- {note}" for note in visual_notes)
    else:
        parts.append("\n## Ordered visual notes\n\n(none)")
    parts.append("\nRequired JSON schema:\n" + json.dumps(SCHEMA, ensure_ascii=False))
    return "\n".join(parts)


def extract(
    *,
    permalink: str | None,
    user_note: str | None,
    transcript_text: str,
    caption: str | None = "",
    transcript_reason: str = "",
    frames: list[Path] | None = None,
    frame_reasons: list[str] | None = None,
    meta: dict[str, str] | None = None,
    timeout: int = 300,
) -> dict[str, Any]:
    """Describe all visuals, then extract the final structured note with Groq."""
    del timeout  # httpx timeouts are set at the request boundary.
    if not CONFIG.groq_api_key:
        raise ExtractError("GROQ_API_KEY is required for visual and structured extraction")
    frames = frames or []
    labels = frame_reasons or [f"Visual {index}" for index in range(1, len(frames) + 1)]
    visual_notes = _describe_visuals(frames, labels)
    return _extract_groq(
        permalink=permalink,
        user_note=user_note,
        transcript_text=transcript_text,
        caption=caption or "",
        transcript_reason=transcript_reason,
        frames=[],
        frame_reasons=visual_notes,
        meta=meta or {},
    )


T = TypeVar("T")


def _chunks(values: list[T], size: int) -> list[list[T]]:
    return [values[index:index + size] for index in range(0, len(values), size)]


def _describe_visuals(frames: list[Path], labels: list[str]) -> list[str]:
    notes: list[str] = []
    for start in range(0, len(frames), VISION_BATCH_SIZE):
        notes.extend(_describe_batch(
            frames[start:start + VISION_BATCH_SIZE],
            labels[start:start + VISION_BATCH_SIZE],
            start=start + 1,
        ))
    return notes


def _describe_batch(frames: list[Path], labels: list[str], *, start: int) -> list[str]:
    requested = [
        {"position": start + offset, "label": labels[offset] if offset < len(labels) else ""}
        for offset in range(len(frames))
    ]
    instruction = (
        "Read these social-media visuals in the exact order supplied. Transcribe useful "
        "visible text exactly, describe diagrams/UI/code, and explain how each visual "
        "advances the post. Return JSON as {\"items\":[{\"label\":\"...\","
        "\"description\":\"...\"}]}. One item per image, same order. Labels: "
        + json.dumps(requested, ensure_ascii=False)
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": instruction}]
    for frame in frames:
        image_bytes, mime = _vision_image(frame)
        encoded = base64.b64encode(image_bytes).decode("ascii")
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{encoded}", "detail": "low"},
        })
    payload = _groq_request(
        [{"role": "user", "content": content}], max_tokens=VISION_MAX_TOKENS
    )
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or len(items) != len(frames):
        raise ExtractError("groq vision returned the wrong number of visual descriptions")
    notes: list[str] = []
    for offset, item in enumerate(items):
        if not isinstance(item, dict):
            raise ExtractError("groq vision returned a malformed visual description")
        label = str(item.get("label") or labels[offset] or f"Visual {start + offset}").strip()
        description = str(item.get("description") or "").strip()
        notes.append(f"{label}: {description}")
    return notes


def _extract_groq(
    *,
    permalink: str | None,
    user_note: str | None,
    transcript_text: str,
    caption: str = "",
    transcript_reason: str = "",
    frames: list[Path] | None = None,
    frame_reasons: list[str] | None = None,
    meta: dict[str, str] | None = None,
) -> dict[str, Any]:
    del frames
    system = SYSTEM.format(
        projects="\n".join(f"  - {project}" for project in sibling_projects()) or "  (none)"
    )
    prompt = build_prompt(
        permalink=permalink,
        user_note=user_note,
        transcript_text=transcript_text,
        caption=caption,
        transcript_reason=transcript_reason,
        visual_notes=frame_reasons or [],
        meta=meta or {},
    )
    payload = _groq_request([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], max_tokens=FINAL_MAX_TOKENS)
    if "title" not in payload:
        raise ExtractError("groq extraction returned JSON without a title")
    return _coerce(payload)


def _log_rate_limit(response: httpx.Response) -> None:
    """Warn when the token budget is nearly gone.

    Groq reports the real ceiling on every response, so the image budget above
    can stay a measured number rather than a guess. Only speaks up below 25%
    remaining — a line on every call would be noise, and the number only
    matters when it is about to bite.
    """
    # Observability must never be able to break extraction, so anything
    # unexpected about the response shape is a silent no-op rather than a raise.
    headers = getattr(response, "headers", None)
    if headers is None:
        return
    remaining = headers.get("x-ratelimit-remaining-tokens")
    limit = headers.get("x-ratelimit-limit-tokens")
    if not (remaining and limit):
        return
    try:
        remaining_n, limit_n = int(remaining), int(limit)
    except ValueError:
        return
    if limit_n and remaining_n < limit_n * 0.25:
        reset = response.headers.get("x-ratelimit-reset-tokens", "?")
        print(
            f"  groq tokens low: {remaining_n}/{limit_n} left, resets in {reset}",
            flush=True,
        )


def _vision_image(path: Path) -> tuple[bytes, str]:
    """Return a compact visual copy; never alter the cached original."""
    if shutil.which("ffmpeg"):
        proc = subprocess.run(
            [
                "ffmpeg", "-v", "error", "-i", str(path),
                "-vf",
                f"scale={VISION_IMAGE_PX}:{VISION_IMAGE_PX}"
                ":force_original_aspect_ratio=decrease",
                "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg",
                "-q:v", "3", "-",
            ],
            capture_output=True,
            timeout=60,
        )
        if proc.returncode == 0 and proc.stdout:
            return proc.stdout, "image/jpeg"
    return path.read_bytes(), mimetypes.guess_type(path.name)[0] or "image/jpeg"


def _groq_request(messages: list[dict[str, Any]], *, max_tokens: int) -> dict[str, Any]:
    response = None
    for attempt in range(3):
        response = httpx.post(
            GROQ_CHAT_URL,
            headers={
                "Authorization": f"Bearer {CONFIG.groq_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": CONFIG.extract_model,
                "messages": messages,
                "response_format": {"type": "json_object"},
                "reasoning_effort": REASONING_EFFORT,
                "temperature": 0.1,
                "max_completion_tokens": max_tokens,
            },
            timeout=300,
        )
        if response.status_code == 429 and attempt < 2:
            time.sleep(_retry_delay(response))
            continue
        # Observed live: an occasional 400 "json_validate_failed" with an
        # EMPTY failed_generation — not a malformed request (the identical
        # payload succeeds on immediate retry), so this reads as a transient
        # hiccup in the reasoning model rather than anything wrong with what
        # we sent. A real schema mismatch would carry the bad output in
        # failed_generation and would not be worth retrying; an empty one is
        # cheap to retry and has recovered every time it's been seen.
        if response.status_code == 400 and attempt < 2:
            try:
                if not response.json().get("error", {}).get("failed_generation"):
                    continue
            except (ValueError, AttributeError):
                pass
        break
    assert response is not None
    _log_rate_limit(response)
    if response.status_code != 200:
        raise ExtractError(f"groq {response.status_code}: {response.text[:300]}")
    try:
        raw = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ExtractError("groq returned an unexpected response envelope") from exc
    payload = _parse_object(raw)
    if payload is None:
        raise ExtractError(f"groq returned no usable JSON object: {str(raw)[:300]}")
    return payload


def _retry_delay(response: httpx.Response) -> float:
    raw = response.headers.get("retry-after", "")
    try:
        return min(max(float(raw), 1.0), 65.0)
    except ValueError:
        match = re.search(r"try again in\s+([0-9.]+)s", response.text, re.IGNORECASE)
        return min(max(float(match.group(1)) + 0.25, 1.0), 65.0) if match else 10.0


_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def _parse_object(raw: str) -> dict[str, Any] | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    candidates = [raw]
    if fenced := _FENCE.search(raw):
        candidates.append(fenced.group(1))
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end > start:
        candidates.append(raw[start:end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _parse(raw: str) -> dict[str, Any] | None:
    """Backward-compatible parser used by older callers and tests."""
    payload = _parse_object(raw)
    return payload if payload and "title" in payload else None


def _coerce(payload: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in ("title", "summary", "topic", "why_saved", "next_step", "difficulty", "frame_notes"):
        value = payload.get(key, "")
        out[key] = value.strip() if isinstance(value, str) else ""
    for key in ("tools", "relevance"):
        value = payload.get(key) or []
        if isinstance(value, str):
            value = [part.strip() for part in value.split(",")]
        out[key] = [str(part).strip().lower() for part in value if str(part).strip()]
    if out["topic"] not in TOPICS:
        out["topic"] = "other"
    if out["difficulty"] not in ("trivial", "afternoon", "weekend"):
        out["difficulty"] = "afternoon"
    return out

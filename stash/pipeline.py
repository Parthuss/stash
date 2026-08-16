"""One capture, start to finish.

fetch -> transcribe -> decide which frames matter -> extract -> write -> index

Each stage degrades rather than aborts where it sensibly can: a reel with no
audio still gets frames and a note, and frames that fail to extract still leave
a transcript-only note. The only genuinely fatal stage is the fetch, because
without media there is nothing to say.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from . import db, extract, fetch, frames, transcribe, vault
from .config import CONFIG


@dataclass
class Result:
    capture_id: str
    note_path: Path
    title: str
    topic: str
    frames_used: int
    transcript_chars: int
    via: str


def process(
    conn: sqlite3.Connection,
    capture,
    *,
    verbose: bool = True,
    media_url: str | None = None,
) -> Result:
    """Run one capture all the way to an indexed note.

    ``media_url`` overrides what is on the capture row — the remote queue uses
    it to point at the R2 copy, since the CDN link the webhook saw has almost
    certainly expired by the time the Mac gets round to it.
    """
    def say(message: str) -> None:
        if verbose:
            print(f"  {message}", flush=True)

    permalink = capture["permalink"]
    media_url = media_url or capture["media_url"]
    user_note = capture["note"]
    caption = capture["caption"]

    say("fetching…")
    try:
        media = fetch.fetch(permalink=permalink, media_url=media_url)
        kinds = ", ".join(item.kind for item in media.items)
        say(f"got {len(media.items)} item(s) via {media.via}: {kinds}")
    except fetch.FetchError as exc:
        # Instagram will refuse some of these — deleted posts, private accounts,
        # a rate limit, stale cookies. When the export gave us a caption there is
        # still a real note to be made, and a thin note beats a dead link in the
        # dead-letter pile. Without a caption there is genuinely nothing to say.
        if not caption:
            raise
        say(f"fetch failed ({str(exc)[:80]}) — falling back to caption only")
        return _caption_only(conn, capture, permalink, caption, user_note, say)

    # The capture file often contains only the URL. yt-dlp's description is the
    # authoritative caption in that case, including for static carousels.
    caption = caption or media.caption
    transcript_parts: list[str] = []
    transcript_reasons: list[str] = []
    transcript_backends: list[str] = []
    images: list[Path] = []
    reasons: list[str] = []

    videos = [item for item in media.items if item.kind == "video"]
    for item in media.items:
        if item.path is None:
            raise fetch.FetchError(f"media item {item.position} was not downloaded")
        if len(media.items) == 1:
            label = "Post image" if item.kind == "image" else "Reel"
        else:
            label = f"Slide {item.position}"
        if item.kind == "image":
            images.append(item.path)
            reasons.append(f"{label} — static image")
            continue

        say(f"transcribing {label.lower()}…")
        transcript = transcribe.transcribe(item.path)
        if transcript.skipped:
            transcript_reasons.append(f"{label}: {transcript.reason}")
            say(f"no transcript for {label.lower()} — {transcript.reason}")
        else:
            transcript_parts.append(f"[{label} video]\n{transcript.text}")
            if transcript.via:
                transcript_backends.append(transcript.via)
            say(f"{len(transcript.text)} chars via {transcript.via}")

        duration = item.duration or (
            transcript.segments[-1].end if transcript.segments else 0.0
        )
        plan = frames.plan_frames(transcript, duration)
        say(f"frame gate picked {len(plan)} for {label.lower()}")
        selected = frames.extract(item.path, plan, CONFIG.media_dir / "frames")
        images.extend(selected)
        reasons.extend(
            f"{label} at {request.timestamp:.0f}s — {request.reason}"
            for request in plan[:len(selected)]
        )

    transcript_text = "\n\n".join(transcript_parts)
    if not videos:
        transcript_reason = "static post/carousel; no audio"
        transcript_via = "none (static post)"
    else:
        transcript_reason = "; ".join(transcript_reasons)
        transcript_via = ", ".join(dict.fromkeys(transcript_backends)) or "none"

    say("extracting…")
    fields = extract.extract(
        permalink=permalink,
        user_note=user_note,
        caption=caption,
        transcript_text=transcript_text,
        transcript_reason=transcript_reason,
        frames=images,
        frame_reasons=reasons,
        meta={"creator": media.uploader, "original title": media.title},
    )

    content = vault.render(
        fields,
        permalink=permalink,
        permalink_ok=bool(capture["permalink_ok"]),
        source=capture["source"],
        transcript_text=transcript_text,
        transcript_reason=transcript_reason,
        transcript_via=transcript_via,
        creator=media.uploader,
        user_note=user_note,
        caption=caption,
        frame_reasons=reasons,
    )
    path = vault.write(content, vault.note_path(fields["title"]))
    say(f"wrote {path.name}")

    db.upsert_note(
        conn,
        {
            "capture_id": capture["id"],
            "path": path.name,
            "title": fields["title"],
            "summary": fields["summary"],
            "topic": fields["topic"],
            "tools": fields["tools"],
            "why_saved": fields["why_saved"],
            "next_step": fields["next_step"],
            "difficulty": fields["difficulty"],
            "relevance": fields["relevance"],
            "transcript": transcript_text,
            "frame_notes": fields["frame_notes"],
            "permalink": permalink,
            "source": capture["source"],
            "status": "unused",
        },
    )

    return Result(
        capture_id=capture["id"],
        note_path=path,
        title=fields["title"],
        topic=fields["topic"],
        frames_used=len(images),
        transcript_chars=len(transcript_text),
        via=media.via,
    )


def _caption_only(conn, capture, permalink, caption, user_note, say) -> Result:
    """Make the best note we can from the caption alone.

    Marked ``transcript_via: caption-only`` in the frontmatter so it is obvious
    later that this one was never watched — and so a re-run can pick these up
    once cookies are fresh.
    """
    fields = extract.extract(
        permalink=permalink,
        user_note=user_note,
        caption=caption,
        transcript_text="",
        transcript_reason="media could not be downloaded",
    )
    content = vault.render(
        fields,
        permalink=permalink,
        permalink_ok=bool(capture["permalink_ok"]),
        source=capture["source"],
        transcript_text="",
        transcript_reason="media could not be downloaded",
        transcript_via="caption-only",
        caption=caption,
        user_note=user_note,
    )
    path = vault.write(content, vault.note_path(fields["title"]))
    say(f"wrote {path.name} (caption-only)")

    db.upsert_note(conn, {
        "capture_id": capture["id"], "path": path.name,
        "title": fields["title"], "summary": fields["summary"],
        "topic": fields["topic"], "tools": fields["tools"],
        "why_saved": fields["why_saved"], "next_step": fields["next_step"],
        "difficulty": fields["difficulty"], "relevance": fields["relevance"],
        "transcript": "", "frame_notes": caption,
        "permalink": permalink, "source": capture["source"], "status": "unused",
    })
    return Result(
        capture_id=capture["id"], note_path=path, title=fields["title"],
        topic=fields["topic"], frames_used=0, transcript_chars=0, via="caption-only",
    )


def drain(conn: sqlite3.Connection, *, limit: int = 0, verbose: bool = True) -> list[Result]:
    """Work the queue until it is empty or ``limit`` captures have been done.

    Reads from the Cloudflare Worker when one is configured and from the local
    SQLite queue otherwise. Notes always land locally either way — the queue is
    the only part that moves.
    """
    remote_mode = CONFIG.uses_remote_queue
    if remote_mode:
        from . import remote

    results: list[Result] = []
    while True:
        if limit and len(results) >= limit:
            break

        capture = remote.claim_next() if remote_mode else db.claim_next(conn)
        if capture is None:
            break

        override = remote.media_url_for(capture) if remote_mode else None
        label = capture["permalink"] or capture["media_url"] or capture["id"]
        if verbose:
            print(f"\n[{capture['id']}] {label}", flush=True)

        try:
            result = process(conn, capture, verbose=verbose, media_url=override)
        except Exception as exc:  # noqa: BLE001 - one bad capture must not stop the drain
            _finish(conn, capture["id"], ok=False, error=str(exc), remote_mode=remote_mode)
            if verbose:
                print(f"  failed: {exc}", flush=True)
            continue

        _finish(conn, capture["id"], ok=True, remote_mode=remote_mode)
        results.append(result)
    return results


def _finish(
    conn: sqlite3.Connection, capture_id: str, *, ok: bool,
    error: str | None = None, remote_mode: bool,
) -> None:
    if remote_mode:
        from . import remote

        remote.finish_capture(capture_id, ok=ok, error=error)
    else:
        db.finish_capture(conn, capture_id, ok=ok, error=error)

"""One capture, start to finish.

fetch -> transcribe -> decide which frames matter -> extract -> write -> index

Each stage degrades rather than aborts where it sensibly can: a reel with no
audio still gets frames and a note, and frames that fail to extract still leave
a transcript-only note. The only genuinely fatal stage is the fetch, because
without media there is nothing to say.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from . import db, extract, fetch, frames, notify, transcribe, vault
from .config import CONFIG, collect_usage, using_groq_key


@dataclass
class Result:
    capture_id: str
    note_path: Path
    title: str
    topic: str
    frames_used: int
    transcript_chars: int
    via: str
    #: Carried so the success notification can show what the reel was actually
    #: about without re-reading the note off disk.
    tools: list[str] = field(default_factory=list)
    guest: bool = False


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

    if _is_guest(capture) and permalink and not is_allowed_url(permalink):
        raise fetch.FetchError("link isn't from a supported site")

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
    guest = _is_guest(capture)
    path = Path(f"remote-{capture['id']}.md") if guest else vault.write(content, vault.note_path(fields["title"]))
    say("sent to the Worker" if guest else f"wrote {path.name}")
    _sync_note(capture, fields, content, permalink, say)

    if not guest:
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
        tools=fields["tools"],
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
    guest = _is_guest(capture)
    path = Path(f"remote-{capture['id']}.md") if guest else vault.write(content, vault.note_path(fields["title"]))
    say("sent to the Worker (caption-only)" if guest else f"wrote {path.name} (caption-only)")
    _sync_note(capture, fields, content, permalink, say)

    if not guest:
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
        tools=fields["tools"],
    )


#: Keep in sync with ALLOWED_HOSTS in worker/src/v1.ts. The Worker filters at
#: ingest; this re-checks on the machine that actually fetches, so a bug or a
#: forged row upstream can't turn the owner's Mac into a scanner of its own LAN.
ALLOWED_HOSTS = ("instagram.com", "tiktok.com", "youtube.com", "youtu.be",
                 "x.com", "twitter.com", "threads.net", "threads.com")


def is_allowed_url(raw: str | None) -> bool:
    from urllib.parse import urlsplit

    try:
        u = urlsplit(raw or "")
        host = (u.hostname or "").lower()
        port = u.port
    except ValueError:
        return False
    if u.scheme != "https" or u.username or u.password or port not in (None, 443):
        return False
    return any(host == d or host.endswith("." + d) for d in ALLOWED_HOSTS)


def _is_guest(capture) -> bool:
    """A capture saved by someone other than the owner (the Mac's operator).

    Their note must live only in the Worker — never in this Mac's vault/, its
    search index, its iMessage alerts, or the owner's Claude recall — or the
    owner's own stash would fill up with (and leak) other people's saves.
    """
    return "user_id" in capture.keys() and bool(capture["user_id"])


def _sync_note(capture, fields, content: str, permalink, say) -> None:
    """Mirror the note to the Worker (remote mode only).

    Another user's note exists nowhere else, so a failed push fails the capture
    and the queue retries it. The owner's note is safe in vault/ already, so a
    blip there is logged and not worth redoing the whole pipeline for."""
    # Rows claimed from the Worker always carry a user_id key (NULL for the
    # owner); rows from the local sqlite queue have no such column. Keying off
    # the row, not CONFIG, means a local-mode run can never push to the Worker
    # just because a .env happens to be present.
    if "user_id" not in capture.keys():
        return
    from . import remote

    try:
        remote.push_note(capture, fields, content, permalink)
    except Exception as exc:  # noqa: BLE001
        if capture["user_id"]:
            raise
        say(f"note push failed (kept locally): {exc}")


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
        # A guest's link never goes in this machine's log, only the owner's own.
        label = capture["id"] if _is_guest(capture) else (capture["permalink"] or capture["media_url"] or capture["id"])
        if verbose:
            print(f"\n[{capture['id']}] {label}", flush=True)

        try:
            # Rows from the Worker carry the user's own Groq key when they
            # brought one; local-queue rows have no such column.
            usage: list = []
            own_key = capture["groq_key"] if "groq_key" in capture.keys() else None
            with using_groq_key(own_key), collect_usage() as usage:
                result = process(conn, capture, verbose=verbose, media_url=override)
        except Exception as exc:  # noqa: BLE001 - one bad capture must not stop the drain
            _finish(conn, capture["id"], ok=False, error=str(exc), remote_mode=remote_mode, usage=usage)
            if verbose:
                print(f"  failed: {exc}", flush=True)
            # Notify on failure too. A save that silently goes nowhere is the
            # exact thing this project keeps getting bitten by.
            if not _is_guest(capture):  # never iMessage the owner about someone else's saves
                notify.notify(
                    notify.for_failure(
                        _short_label(capture), str(exc), url=capture["permalink"] or ""
                    ),
                    verbose=verbose,
                )
            # Stop the pass rather than continuing. A failure puts the capture
            # back to 'pending' and claim_next always returns the oldest pending
            # row, so continuing re-claims this very item — burning all three
            # attempts in a tight loop and dead-lettering in seconds, when the
            # point of retrying is to try again *later*. The daemon's next poll
            # picks up from the top; anything queued behind this waits one tick.
            break

        _finish(conn, capture["id"], ok=True, remote_mode=remote_mode, title=result.title, usage=usage)
        if not _is_guest(capture):
            notify.notify(
                notify.for_success(
                    result.title, topic=result.topic, tools=result.tools,
                    url=capture["permalink"] or "",
                ),
                verbose=verbose,
            )
        result.guest = _is_guest(capture)
        results.append(result)
    return results


def _short_label(capture) -> str:
    """Something recognisable for a failure notification, since there is no
    title yet — the whole point is that processing did not get that far."""
    permalink = capture["permalink"] or ""
    if permalink:
        return permalink.rstrip("/").rsplit("/", 1)[-1] or permalink
    return str(capture["id"])


def _finish(
    conn: sqlite3.Connection, capture_id: str, *, ok: bool,
    error: str | None = None, title: str | None = None, remote_mode: bool,
    usage: list | None = None,
) -> None:
    """Mark a capture done or failed and report it wherever confirmation lives.

    ``title`` only matters in remote mode — it's what makes the Worker's
    ``/status/:id`` (and the phone notification reading it) show a real title
    instead of just "done".
    """
    if remote_mode:
        from . import remote

        remote.finish_capture(capture_id, ok=ok, error=error, title=title, usage=usage)
    else:
        db.finish_capture(conn, capture_id, ok=ok, error=error)

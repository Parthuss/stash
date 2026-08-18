"""Command line: add, process, search, status, doctor, reindex."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from . import daemon as daemon_mod
from . import db, pipeline, vault, watch as watch_mod
from .config import CONFIG


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="stash", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_add = sub.add_parser("add", help="queue a URL")
    p_add.add_argument("url")
    p_add.add_argument("-n", "--note", default=None, help="why you saved it")
    p_add.add_argument("--process", action="store_true", help="run it immediately")

    p_proc = sub.add_parser("process", help="work the queue")
    p_proc.add_argument("--limit", type=int, default=0, help="0 = drain everything")
    p_proc.add_argument("--quiet", action="store_true")

    p_search = sub.add_parser("search", help="search the vault")
    p_search.add_argument("query", nargs="*")
    p_search.add_argument("--topic")
    p_search.add_argument("--status", choices=["unused", "used"])
    p_search.add_argument("--limit", type=int, default=10)
    p_search.add_argument("--json", action="store_true")

    p_watch = sub.add_parser("watch", help="watch the iCloud inbox the phone Shortcut writes to")
    p_watch.add_argument("--interval", type=int, default=15)
    p_watch.add_argument("--once", action="store_true", help="one pass, then exit")

    p_receive = sub.add_parser("receive", help="receive links directly from the iPhone Shortcut")
    p_receive.add_argument("--port", type=int, default=CONFIG.local_port)

    p_daemon = sub.add_parser(
        "daemon", help="poll the Cloudflare Worker — capture that survives Wi-Fi/sleep"
    )
    p_daemon.add_argument("--min-interval", type=int, default=15)
    p_daemon.add_argument("--max-interval", type=int, default=90)
    p_daemon.add_argument("--once", action="store_true", help="one poll, then exit")

    p_notify = sub.add_parser(
        "notify", help="send a test notification, to prove the backend actually works"
    )
    p_notify.add_argument("--fail", action="store_true",
                          help="send the failure-shaped message instead")

    sub.add_parser("status", help="queue and vault health")
    sub.add_parser("topics", help="what you save most")
    sub.add_parser("doctor", help="check the toolchain and credentials")
    p_reindex = sub.add_parser("reindex", help="rebuild the index from the markdown vault")
    p_reindex.add_argument(
        "--no-embed", action="store_true",
        help="skip vector embedding (keyword search only for this run)",
    )

    p_used = sub.add_parser("used", help="mark a note as actually used")
    p_used.add_argument("note_id")
    p_used.add_argument("where", help="where it went, e.g. notes-agent/loop.py")

    args = parser.parse_args(argv)
    CONFIG.ensure_dirs()
    conn = db.connect(CONFIG.db_path)

    return {
        "add": _add, "process": _process, "search": _search, "status": _status,
        "watch": _watch, "receive": _receive, "daemon": _daemon, "notify": _notify,
        "topics": _topics, "doctor": _doctor, "reindex": _reindex, "used": _used,
    }[args.command](conn, args)


def _add(conn, args) -> int:
    if CONFIG.uses_remote_queue:
        from . import remote

        capture_id, created = remote.add_capture(
            source="cli", permalink=args.url, note=args.note
        )
    else:
        capture_id, created = db.add_capture(
            conn, source="cli", permalink=args.url, note=args.note
        )
    print(f"{'queued' if created else 'already queued'} {capture_id}")
    if args.process:
        results = pipeline.drain(conn, limit=1)
        return 0 if results else 1
    return 0


def _process(conn, args) -> int:
    results = pipeline.drain(conn, limit=args.limit, verbose=not args.quiet)
    if not results:
        print("nothing to do")
        return 0
    print(f"\n{len(results)} note(s):")
    for r in results:
        print(f"  {r.title}  [{r.topic}]  {r.frames_used} frames  -> {r.note_path.name}")
    return 0


def _search(conn, args) -> int:
    rows = db.search_notes(
        conn, " ".join(args.query), topic=args.topic, status=args.status, limit=args.limit
    )
    items = db.rows_to_dicts(rows)
    if args.json:
        print(json.dumps(items, indent=2, default=str))
        return 0
    if not items:
        print("no matches")
        return 1
    for item in items:
        flag = "" if item["status"] == "unused" else " (used)"
        print(f"\n{item['title']}{flag}")
        print(f"  {item['summary']}")
        print(f"  topic: {item['topic']}   tools: {', '.join(item['tools']) or '—'}")
        print(f"  next:  {item['next_step']}")
        print(f"  {item['path']}   {item['permalink'] or ''}")
    return 0


def _watch(conn, args) -> int:
    watch_mod.watch(conn, interval=args.interval, once=args.once)
    return 0


def _receive(conn, args) -> int:
    if not CONFIG.local_secret:
        print("missing local receiver token")
        return 1
    conn.close()
    from . import local_receiver

    local_receiver.serve(CONFIG.db_path, CONFIG.local_secret, args.port)
    return 0


def _daemon(conn, args) -> int:
    try:
        daemon_mod.run(
            conn, min_interval=args.min_interval, max_interval=args.max_interval,
            once=args.once,
        )
    except RuntimeError as exc:
        print(exc)
        return 1
    return 0


def _notify(conn, args) -> int:
    """Prove the notification path works before trusting it in production.

    Worth an explicit command rather than assuming: the iMessage backend needs
    a one-time Automation grant that only prompts on the first real send, so
    "it is configured" and "it delivers" are different facts.
    """
    from . import notify as notify_mod

    if CONFIG.notify_backend.lower() in ("", "none"):
        print("STASH_NOTIFY is not set (imessage | ntfy). Nothing to test.")
        return 1

    message = (
        notify_mod.for_failure("reel/TESTFAIL", "this is a test failure notification")
        if args.fail
        else notify_mod.for_success(
            "Stash test notification", topic="tooling", tools=["stash"],
        )
    )
    print(f"backend: {CONFIG.notify_backend}")
    if notify_mod.notify(message):
        print("sent — check your phone")
        return 0
    print("delivery failed (see the error above)")
    return 1


def _status(conn, args) -> int:
    stats = db.queue_stats(conn)
    notes = conn.execute("SELECT COUNT(*) n FROM note").fetchone()["n"]
    used = conn.execute("SELECT COUNT(*) n FROM note WHERE status='used'").fetchone()["n"]

    print("queue:")
    for key in ("pending", "claimed", "done"):
        if stats.get(key):
            print(f"  {key:<9} {stats[key]}")
    print(f"\nvault: {notes} notes, {used} marked used")
    if notes and not used:
        print("  (nothing marked used yet — that is the number that matters)")

    inbox = CONFIG.inbox
    if inbox.exists():
        queued = len(watch_mod.read_inbox(inbox))
        print(f"\ninbox: {queued} line(s) in {inbox.name}")

    if CONFIG.uses_remote_queue:
        alive, reason = daemon_mod.is_alive()
        print(f"\ndaemon: {'ALIVE' if alive else 'DOWN'} — {reason}")

    dead = db.dead_letters(conn)
    if dead:
        print(f"\ndead letters ({len(dead)}) — retries exhausted:")
        for row in dead[:10]:
            print(f"  {row['permalink'] or row['id']}\n    {(row['error'] or '')[:120]}")
    return 0


def _topics(conn, args) -> int:
    topics = db.list_topics(conn)
    if not topics:
        print("no notes yet")
        return 1
    width = max(len(t) for t, _ in topics)
    for topic, count in topics:
        print(f"  {topic:<{width}}  {count}")
    return 0


def _used(conn, args) -> int:
    if db.mark_used(conn, args.note_id, args.where):
        print(f"marked used: {args.where}")
        return 0
    print(f"no note matching {args.note_id!r}")
    return 1


def _reindex(conn, args) -> int:
    """Rebuild the index from disk. The markdown is the source of truth.

    Backfills vector embeddings by default — upsert_note writes a chunk
    whenever has_vectors(conn) is true, so this is a normal side effect, not a
    separate step. The one thing worth calling out explicitly is the ~130MB
    model download on first use: doing it here, at a command the user runs by
    hand and can see progress on, is deliberate — the daemon downloading that
    silently mid-capture would look like a hang, not a first-run cost.
    """
    if not args.no_embed:
        from . import embed
        if not embed.available():
            print("(vector search unavailable this run — keyword search only; "
                  "see `stash doctor`)")
        elif conn.execute(  # is this the very first embed, i.e. worth a heads-up?
            "SELECT 1 FROM meta WHERE key='embedding_model'"
        ).fetchone() is None:
            print("loading embedding model (one-time download, ~65MB)…")

    # chunk_vec must be cleared explicitly, not just note. `chunk` cascades
    # from `note` on delete, but chunk_vec is a virtual table with no FK
    # support and does not — bulk-deleting every note here without also
    # clearing chunk_vec leaves every old vector rowid sitting in the table,
    # and since `chunk.id` is a plain (non-AUTOINCREMENT) rowid alias that
    # SQLite is free to reuse, the very next chunk insert can collide with a
    # leftover chunk_vec rowid and fail with "UNIQUE constraint failed" —
    # hit exactly this running reindex for real, not hypothetically.
    if db.has_vectors(conn):
        conn.execute("DELETE FROM chunk_vec")
    conn.execute("DELETE FROM note")
    conn.commit()
    count = embedded = 0
    for path in sorted(CONFIG.vault_dir.glob("*.md")):
        front = vault.read_frontmatter(path)
        if not front:
            continue
        body = front.pop("_body", "")
        note = {
            "path": path.name,
            "title": front.get("title", path.stem),
            "summary": body.split("\n\n")[1] if "\n\n" in body else "",
            "topic": front.get("topic", ""),
            "tools": front.get("tools", []),
            "why_saved": vault.extract_section(body, "Why you probably saved this"),
            "next_step": vault.extract_section(body, "Next step"),
            "difficulty": front.get("difficulty", ""),
            "relevance": front.get("relevance", []),
            "transcript": vault.extract_section(body, "Transcript"),
            "frame_notes": vault.extract_section(body, "On screen"),
            "permalink": front.get("url"),
            "source": front.get("source", ""),
            "status": front.get("status", "unused"),
        }
        # Only set the key when frontmatter actually has a date. upsert_note's
        # setdefault('created_at', now()) only fires when the key is ABSENT,
        # not when it's present-but-None — so leaving it out entirely (rather
        # than setting it to None) is what preserves that fallback correctly.
        # Without this, every reindex stamps every note with today's date,
        # silently destroying real capture history. `captured` is date-only
        # (YYYY-MM-DD); that's a valid ISO prefix, sorts correctly next to the
        # full timestamps normal upserts write, and is all the frontmatter
        # actually records.
        if front.get("captured"):
            note["created_at"] = front["captured"]
        db.upsert_note(conn, note)
        count += 1

    if args.no_embed:
        # Let the normal path run (it writes chunks whenever the connection has
        # vectors, same as any other upsert) and clear the result afterward —
        # simpler and less surprising than threading a bypass through
        # has_vectors()/upsert_note() for what is a rarely-used debug flag.
        if db.has_vectors(conn):
            conn.execute("DELETE FROM chunk_vec")
        conn.execute("DELETE FROM chunk")
        conn.commit()
    else:
        embedded = conn.execute("SELECT COUNT(DISTINCT note_id) c FROM chunk").fetchone()["c"]

    print(f"reindexed {count} note(s)" + (f", {embedded} embedded" if embedded else ""))
    return 0


def _doctor(conn, args) -> int:
    """Say exactly what is missing and exactly how to fix it."""
    problems = 0

    def check(label: str, ok: bool, fix: str = "") -> None:
        nonlocal problems
        print(f"  {'ok  ' if ok else 'MISS'}  {label}")
        if not ok:
            problems += 1
            if fix:
                print(f"          {fix}")

    print("toolchain:")
    check("ffmpeg", bool(shutil.which("ffmpeg")), "brew install ffmpeg")
    check("ffprobe", bool(shutil.which("ffprobe")), "comes with ffmpeg")
    check("yt-dlp", bool(shutil.which("yt-dlp")), "brew install yt-dlp")

    print("\ntranscription:")
    if CONFIG.groq_api_key:
        check("GROQ_API_KEY", True)
    else:
        try:
            import faster_whisper  # noqa: F401
            check("faster-whisper (local)", True)
        except ImportError:
            check("a transcription backend", False,
                  "free key at console.groq.com/keys -> stash/.env, "
                  "or pip install -e '.[local-whisper]'")

    print("\nextraction:")
    check(
        f"Groq vision + JSON ({CONFIG.extract_model})",
        bool(CONFIG.groq_api_key),
        "free key at console.groq.com/keys -> GROQ_API_KEY in stash/.env",
    )

    print("\nsearch:")
    check("FTS5 keyword index", True)  # always present, part of core SCHEMA
    vectors_ok = db.has_vectors(conn)
    check(
        "sqlite-vec (semantic search)", vectors_ok,
        "pip install sqlite-vec — search will degrade to keyword-only without it",
    )
    if vectors_ok:
        from . import embed
        check(f"fastembed model ({embed.MODEL_NAME})", embed.available(),
              "pip install fastembed")
        if not db.embedding_model_matches(conn, embed.MODEL_NAME):
            check("stored vectors match the configured model", False,
                  "model changed since these were embedded — run `stash reindex` "
                  "to re-embed, or every stored vector is being compared in the "
                  "wrong space and results will be silently wrong")
        total = conn.execute("SELECT COUNT(*) c FROM note").fetchone()["c"]
        embedded = conn.execute(
            "SELECT COUNT(DISTINCT note_id) c FROM chunk"
        ).fetchone()["c"]
        if total and embedded < total:
            check(f"{embedded}/{total} notes embedded", False,
                  "run `stash reindex` to embed the rest")

    print("\nqueue:")
    print(f"  {'remote (D1)' if CONFIG.uses_remote_queue else 'local SQLite'}"
          f" — {CONFIG.db_path if not CONFIG.uses_remote_queue else CONFIG.worker_url}")

    if CONFIG.uses_remote_queue:
        alive, reason = daemon_mod.is_alive()
        check(f"daemon ({reason})", alive,
              "`stash daemon` in a terminal, or load the launchd job — "
              "see stash/launchd/README.md")

    print(f"\n{'all good' if not problems else f'{problems} thing(s) to fix'}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

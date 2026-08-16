"""The phone-to-vault path, with no infrastructure in between.

A Shortcut on the share sheet appends one line to a text file in iCloud Drive.
This watches that file and drains anything new. No Cloudflare account, no public
endpoint, no Meta app — three taps from a reel to a note.

The one design decision worth explaining: the inbox is **append-only and never
truncated**. The obvious implementation reads the file and empties it, which
races against the Shortcut appending mid-read and silently loses a save. Instead
every tick re-reads the whole file and re-queues every line, leaning on the
queue's unique index on ``permalink`` to make repeats free. Nothing can be lost,
and the file ends up being a readable log of what you saved and when.

Its limitation, stated plainly: the Mac has to be awake and running this. Saves
made while it is asleep are picked up whenever it next runs — which is fine,
because iCloud holds the line either way. The Cloudflare Worker exists for when
that is not good enough.
"""

from __future__ import annotations

import re
import sqlite3
import time
from pathlib import Path

from . import db, pipeline
from .config import CONFIG

URL_RE = re.compile(r"https?://\S+")


def parse(line: str) -> tuple[str, str | None] | None:
    """Pull ``(url, note)`` out of one inbox line.

    Accepts ``<url>``, ``<url> | note``, or a line of prose with a URL in it,
    because a share sheet will hand over whatever the app decided to put on the
    clipboard and it is not worth being strict about.
    """
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    match = URL_RE.search(line)
    if not match:
        return None
    url = match.group(0).rstrip(".,;)")

    remainder = (line[: match.start()] + " " + line[match.end():]).strip(" |\t")
    return url, remainder or None


def read_inbox(path: Path) -> list[tuple[str, str | None]]:
    if not path.exists():
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        # iCloud can briefly hand back an unreadable placeholder mid-sync.
        return []
    return [parsed for line in text.splitlines() if (parsed := parse(line))]


def sync_once(conn: sqlite3.Connection, *, verbose: bool = False) -> int:
    """Queue anything in the inbox that is not queued already."""
    added = 0
    for url, note in read_inbox(CONFIG.inbox):
        _, created = db.add_capture(conn, source="shortcut", permalink=url, note=note)
        if created:
            added += 1
            if verbose:
                print(f"  queued {url}", flush=True)
    return added


def watch(conn: sqlite3.Connection, *, interval: int = 15, once: bool = False) -> None:
    CONFIG.inbox.parent.mkdir(parents=True, exist_ok=True)
    if not CONFIG.inbox.exists():
        CONFIG.inbox.write_text(
            "# stash inbox — the Shortcut appends here. Safe to read, edit, or\n"
            "# add URLs to by hand. Never truncated; duplicates are ignored.\n",
            encoding="utf-8",
        )

    print(f"watching {CONFIG.inbox}")
    print(f"polling every {interval}s — ctrl-c to stop\n")

    while True:
        try:
            added = sync_once(conn, verbose=True)
            if added:
                print(f"{added} new — processing…", flush=True)
                for result in pipeline.drain(conn, verbose=True):
                    print(f"  -> {result.title}", flush=True)
                print(flush=True)
        except KeyboardInterrupt:
            print("\nstopped")
            return
        except Exception as exc:  # noqa: BLE001 - a watcher must not die on one bad tick
            print(f"  tick failed: {exc}", flush=True)

        if once:
            return
        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            print("\nstopped")
            return

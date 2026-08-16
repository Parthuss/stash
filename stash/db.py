"""SQLite: the capture queue and the searchable note index, in one file.

The ``capture`` table is the contract every ingest adapter honours — the
share-sheet shortcut, the Instagram DM webhook, and the data-export backfill all
write rows of exactly this shape. That is what lets a new capture route be added
without the pipeline downstream knowing anything changed.

``note`` plus its FTS5 twin is the read side. Notes are also written to disk as
markdown; this table is the index over them, not the source of truth. If it is
ever lost it can be rebuilt from the vault with ``stash reindex``.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS capture (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,          -- shortcut | ig_dm | backfill | cli
  permalink    TEXT,                   -- canonical URL; NULL is legal for ig_dm
  permalink_ok INTEGER DEFAULT 1,      -- 0 when derived from a media id, not received
  media_url    TEXT,                   -- expiring CDN URL, ig_dm only
  media_key    TEXT,                   -- R2 key once stashed
  note         TEXT,                   -- optional note typed at capture time
  caption      TEXT,                   -- the post's own caption, when we get one
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending|claimed|done|failed
  attempts     INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  captured_at  TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS capture_status ON capture(status, captured_at);
CREATE UNIQUE INDEX IF NOT EXISTS capture_permalink
  ON capture(permalink) WHERE permalink IS NOT NULL;

CREATE TABLE IF NOT EXISTS note (
  id          TEXT PRIMARY KEY,
  -- Provenance only, deliberately NOT a foreign key. In remote-queue mode
  -- (stash/remote.py) the capture this note came from lives in the Worker's
  -- D1, never in this local table, so a real FK constraint here would reject
  -- every note the daemon writes — which is exactly the bug that happened
  -- the first time this ran end to end against a deployed Worker.
  capture_id  TEXT,
  path        TEXT NOT NULL,           -- vault-relative markdown path
  title       TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  topic       TEXT NOT NULL DEFAULT '',
  tools       TEXT NOT NULL DEFAULT '[]',      -- json array
  why_saved   TEXT NOT NULL DEFAULT '',
  next_step   TEXT NOT NULL DEFAULT '',
  difficulty  TEXT NOT NULL DEFAULT '',
  relevance   TEXT NOT NULL DEFAULT '[]',      -- json array of sibling project names
  transcript  TEXT NOT NULL DEFAULT '',
  frame_notes TEXT NOT NULL DEFAULT '',
  permalink   TEXT,
  source      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'unused',  -- unused | used
  used_where  TEXT,
  created_at  TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  title, summary, topic, tools, why_saved, next_step, transcript, frame_notes,
  content='note', content_rowid='rowid', tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS note_ai AFTER INSERT ON note BEGIN
  INSERT INTO note_fts(rowid, title, summary, topic, tools, why_saved, next_step, transcript, frame_notes)
  VALUES (new.rowid, new.title, new.summary, new.topic, new.tools, new.why_saved,
          new.next_step, new.transcript, new.frame_notes);
END;
CREATE TRIGGER IF NOT EXISTS note_ad AFTER DELETE ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, summary, topic, tools, why_saved, next_step, transcript, frame_notes)
  VALUES ('delete', old.rowid, old.title, old.summary, old.topic, old.tools, old.why_saved,
          old.next_step, old.transcript, old.frame_notes);
END;
CREATE TRIGGER IF NOT EXISTS note_au AFTER UPDATE ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, summary, topic, tools, why_saved, next_step, transcript, frame_notes)
  VALUES ('delete', old.rowid, old.title, old.summary, old.topic, old.tools, old.why_saved,
          old.next_step, old.transcript, old.frame_notes);
  INSERT INTO note_fts(rowid, title, summary, topic, tools, why_saved, next_step, transcript, frame_notes)
  VALUES (new.rowid, new.title, new.summary, new.topic, new.tools, new.why_saved,
          new.next_step, new.transcript, new.frame_notes);
END;
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    # WAL so the MCP server can read while the worker writes.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


# ---------------------------------------------------------------------------
# Capture queue
# ---------------------------------------------------------------------------


def add_capture(
    conn: sqlite3.Connection,
    *,
    source: str,
    permalink: str | None = None,
    media_url: str | None = None,
    note: str | None = None,
    caption: str | None = None,
    permalink_ok: bool = True,
) -> tuple[str, bool]:
    """Enqueue one capture. Returns ``(id, created)``.

    Re-sharing something you already saved is a normal thing to do by accident,
    so a duplicate permalink is not an error — it returns the existing row.
    """
    if permalink:
        existing = conn.execute(
            "SELECT id FROM capture WHERE permalink = ?", (permalink,)
        ).fetchone()
        if existing:
            return existing["id"], False

    capture_id = uuid.uuid4().hex[:16]
    conn.execute(
        """INSERT INTO capture (id, source, permalink, permalink_ok, media_url, note,
                                caption, status, captured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
        (capture_id, source, permalink, int(permalink_ok), media_url, note,
         caption, now()),
    )
    conn.commit()
    return capture_id, True


def claim_next(conn: sqlite3.Connection, max_attempts: int = 3) -> sqlite3.Row | None:
    """Take the oldest pending capture that has not exhausted its retries."""
    row = conn.execute(
        """SELECT * FROM capture
           WHERE status = 'pending' AND attempts < ?
           ORDER BY captured_at LIMIT 1""",
        (max_attempts,),
    ).fetchone()
    if row is None:
        return None
    conn.execute(
        "UPDATE capture SET status='claimed', attempts = attempts + 1 WHERE id = ?",
        (row["id"],),
    )
    conn.commit()
    return row


def finish_capture(
    conn: sqlite3.Connection, capture_id: str, *, ok: bool, error: str | None = None
) -> None:
    """Mark a capture done, or push it back to pending for another attempt.

    A failure returns to ``pending`` rather than ``failed`` so transient
    breakage (expired cookies, a rate limit) retries on its own. Only once
    ``attempts`` is exhausted does ``claim_next`` stop picking it up, and
    ``stash status`` surfaces those as the dead-letter set.
    """
    if ok:
        conn.execute(
            "UPDATE capture SET status='done', processed_at=?, error=NULL WHERE id=?",
            (now(), capture_id),
        )
    else:
        conn.execute(
            "UPDATE capture SET status='pending', error=? WHERE id=?",
            ((error or "")[:2000], capture_id),
        )
    conn.commit()


def queue_stats(conn: sqlite3.Connection, max_attempts: int = 3) -> dict[str, int]:
    rows = conn.execute("SELECT status, COUNT(*) n FROM capture GROUP BY status").fetchall()
    stats = {r["status"]: r["n"] for r in rows}
    stats["dead"] = conn.execute(
        "SELECT COUNT(*) n FROM capture WHERE status='pending' AND attempts >= ?",
        (max_attempts,),
    ).fetchone()["n"]
    return stats


def dead_letters(conn: sqlite3.Connection, max_attempts: int = 3) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT * FROM capture WHERE status='pending' AND attempts >= ?
           ORDER BY captured_at""",
        (max_attempts,),
    ).fetchall()


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------


def upsert_note(conn: sqlite3.Connection, note: dict[str, Any]) -> str:
    """Insert or replace a note by vault path, keeping FTS in step.

    Replacing by path (rather than id) means re-processing the same capture
    overwrites its note instead of accumulating duplicates.
    """
    note = dict(note)
    for key in ("tools", "relevance"):
        if isinstance(note.get(key), (list, tuple)):
            note[key] = json.dumps(list(note[key]))
    note.setdefault("id", uuid.uuid4().hex[:16])
    note.setdefault("created_at", now())

    existing = conn.execute("SELECT id FROM note WHERE path = ?", (note["path"],)).fetchone()
    if existing:
        note["id"] = existing["id"]
        conn.execute("DELETE FROM note WHERE id = ?", (existing["id"],))

    columns = [
        "id", "capture_id", "path", "title", "summary", "topic", "tools",
        "why_saved", "next_step", "difficulty", "relevance", "transcript",
        "frame_notes", "permalink", "source", "status", "used_where", "created_at",
    ]
    values = [note.get(c) for c in columns]
    placeholders = ", ".join("?" * len(columns))
    conn.execute(
        f"INSERT INTO note ({', '.join(columns)}) VALUES ({placeholders})", values
    )
    conn.commit()
    return note["id"]


def _fts_query(raw: str) -> str:
    """Turn user words into a safe FTS5 MATCH expression.

    Quoting each bare word keeps FTS5 operators (``-``, ``*``, ``:``, ``NEAR``)
    in user input from either erroring or silently changing the query.
    """
    words = [w for w in "".join(c if c.isalnum() else " " for c in raw).split() if w]
    return " OR ".join(f'"{w}"' for w in words)


def search_notes(
    conn: sqlite3.Connection,
    query: str,
    *,
    topic: str | None = None,
    status: str | None = None,
    limit: int = 10,
) -> list[sqlite3.Row]:
    match = _fts_query(query)
    if not match:
        return recent_notes(conn, limit=limit, topic=topic, status=status)

    sql = """
        SELECT n.*, bm25(note_fts, 8.0, 6.0, 3.0, 4.0, 2.0, 2.0, 1.0, 1.5) AS rank
        FROM note_fts JOIN note n ON n.rowid = note_fts.rowid
        WHERE note_fts MATCH ?
    """
    params: list[Any] = [match]
    if topic:
        sql += " AND n.topic = ?"
        params.append(topic)
    if status:
        sql += " AND n.status = ?"
        params.append(status)
    sql += " ORDER BY rank LIMIT ?"
    params.append(limit)
    return conn.execute(sql, params).fetchall()


def recent_notes(
    conn: sqlite3.Connection,
    *,
    limit: int = 10,
    topic: str | None = None,
    status: str | None = None,
) -> list[sqlite3.Row]:
    sql = "SELECT * FROM note WHERE 1=1"
    params: list[Any] = []
    if topic:
        sql += " AND topic = ?"
        params.append(topic)
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    return conn.execute(sql, params).fetchall()


def list_topics(conn: sqlite3.Connection) -> list[tuple[str, int]]:
    rows = conn.execute(
        """SELECT topic, COUNT(*) n FROM note WHERE topic != ''
           GROUP BY topic ORDER BY n DESC"""
    ).fetchall()
    return [(r["topic"], r["n"]) for r in rows]


def mark_used(conn: sqlite3.Connection, note_id: str, where: str) -> bool:
    """Flip a note to ``used``. This is what makes the vault self-auditing.

    If nothing ever reaches ``used``, recall is not working and the answer is to
    change the recall layer rather than keep feeding the vault.
    """
    cur = conn.execute(
        "UPDATE note SET status='used', used_where=? WHERE id=? OR path=?",
        (where, note_id, note_id),
    )
    conn.commit()
    return cur.rowcount > 0


def note_by_id(conn: sqlite3.Connection, note_id: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM note WHERE id = ? OR path = ?", (note_id, note_id)
    ).fetchone()


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    out = []
    for row in rows:
        item = dict(row)
        for key in ("tools", "relevance"):
            if isinstance(item.get(key), str):
                try:
                    item[key] = json.loads(item[key])
                except json.JSONDecodeError:
                    item[key] = []
        out.append(item)
    return out

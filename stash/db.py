"""SQLite: the capture queue and the searchable note index, in one file.

The ``capture`` table is the contract every ingest adapter honours — the
share-sheet shortcut, the Instagram DM webhook, and the data-export backfill all
write rows of exactly this shape. That is what lets a new capture route be added
without the pipeline downstream knowing anything changed.

``note`` plus its FTS5 twin is the read side. Notes are also written to disk as
markdown; this table is the index over them, not the source of truth. If it is
ever lost it can be rebuilt from the vault with ``stash reindex``.

Search is hybrid: FTS5 (exact tokens — repo names, product names, error
strings) fused with sqlite-vec (meaning) via Reciprocal Rank Fusion. Measured
regression this exists to fix: "how do I make videos automatically" ranked the
two notes actually about generating video 6th and 8th under FTS5 alone, behind
a WhatsApp chatbot — BM25 has no notion that "automatically" and "generation"
are related ideas. Vectors alone are not the answer either: they are bad at
exact tokens a BM25 index nails for free, which is why this keeps FTS5 rather
than replacing it.

``chunk`` is deliberately its own table with a ``kind``/``ord`` shape, not a
vector column bolted onto ``note``, even though today every note gets exactly
one ``gist`` chunk. One averaged vector per note gets semantically mushy once
notes carry more text than they do now (a full transcript folded into a single
embedding is dominated by whichever half is longer), and retrofitting a chunk
table onto an existing corpus is a migration. Paying that design cost now,
while it's free, avoids paying it later while it's not.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

#: sqlite-vec's own KNN dimension. Must match embed.DIM — a mismatch does not
#: error, it silently returns garbage distances, so the two are asserted equal
#: wherever a query actually runs rather than trusted to stay in sync.
_VECTOR_DIM = 384

#: Printed once per process, not once per search — a machine without
#: sqlite-vec/fastembed installed should not get this line on every call.
_warned_no_vectors = False

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

-- The vector half. Plain table, no extension required — safe to create even
-- when sqlite-vec never loads, so `chunk` always exists and callers never
-- need to branch on whether hybrid search is available before writing to it.
CREATE TABLE IF NOT EXISTS chunk (
  id      INTEGER PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,             -- 'gist' today; 'transcript'/'frames' later
  ord     INTEGER NOT NULL DEFAULT 0,
  text    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunk_note ON chunk(note_id);

-- Small key/value table. Its one job right now is embedding-model drift
-- detection: if the model in embed.py ever changes, every stored vector is in
-- a different, incomparable space, and mixing them silently returns wrong
-- results rather than an error. `doctor` compares this against embed.MODEL_NAME.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
"""


def _load_vector_extension(conn: sqlite3.Connection) -> bool:
    """Best-effort: load sqlite-vec and create the vec0 table it needs.

    Returns False on any failure — missing package, an sqlite3 build without
    extension-loading support, whatever. Search must degrade to FTS5-only, not
    raise, because the daemon writes notes unattended and a vector-index
    hiccup must never be able to fail a capture.
    """
    try:
        import sqlite_vec
    except ImportError:
        return False
    try:
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        conn.execute(
            f"CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec "
            f"USING vec0(embedding float[{_VECTOR_DIM}])"
        )
        return True
    except Exception:  # noqa: BLE001 - any failure here means "no vectors this run"
        return False


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
    _load_vector_extension(conn)  # best-effort; search falls back if this fails
    return conn


def has_vectors(conn: sqlite3.Connection) -> bool:
    """Whether hybrid search can run on this connection, checked fresh.

    Not cached: sqlite3.Connection supports neither custom attributes nor weak
    references (both verified — this is not a stylistic choice), and re-trying
    a cheap `LIMIT 1` query every call is simpler and safer than an id()-keyed
    global that could collide if a connection is garbage-collected and its id
    reused. A vec0 virtual table is only queryable on a connection where the
    extension actually loaded, regardless of what a previous connection did.
    """
    try:
        conn.execute("SELECT 1 FROM chunk_vec LIMIT 1")
        return True
    except sqlite3.OperationalError:
        return False


def embedding_model_matches(conn: sqlite3.Connection, model_name: str) -> bool:
    """True if stored vectors (if any) match the model currently configured.

    A model swap makes every stored vector incomparable to a fresh query
    embedding — not wrong-shaped, just silently wrong, since cosine distance
    between two different embedding spaces is a number that means nothing.
    `doctor` uses this to tell you to re-embed instead of letting that happen
    quietly.
    """
    row = conn.execute(
        "SELECT value FROM meta WHERE key = 'embedding_model'"
    ).fetchone()
    return row is None or row["value"] == model_name


def set_embedding_model(conn: sqlite3.Connection, model_name: str) -> None:
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('embedding_model', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (model_name,),
    )
    conn.commit()


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


def _gist_text(note: dict[str, Any]) -> str:
    """The text one 'gist' chunk embeds: what a note is *about*, not its raw
    transcript. Weighted toward the fields that carry meaning rather than
    filler — title and why_saved twice, since those are where a human-written
    or model-synthesized sense of "what this is for" actually lives; a raw
    transcript is spoken language and dilutes that signal in a 384-dim average.
    """
    tools = note.get("tools") or []
    if isinstance(tools, str):
        try:
            tools = json.loads(tools)
        except json.JSONDecodeError:
            tools = []
    parts = [
        note.get("title", ""), note.get("title", ""),
        note.get("summary", ""),
        note.get("topic", ""),
        " ".join(tools),
        note.get("why_saved", ""), note.get("why_saved", ""),
        note.get("next_step", ""),
        (note.get("frame_notes") or "")[:500],
    ]
    return " ".join(p for p in parts if p).strip()


def _delete_chunks(conn: sqlite3.Connection, note_id: str) -> None:
    """Purge a note's chunks and their vectors together.

    ``chunk`` cascades from ``note`` via FK, but ``chunk_vec`` is a vec0
    virtual table — SQLite does not support foreign keys into virtual tables,
    so nothing cascades into it automatically. Left alone, re-processing the
    same note (a routine thing: a fixed capture, a retried pipeline run) would
    leak one orphaned vector row per re-run forever. Orphans do not corrupt
    search results — `_vector_candidates`' JOIN against `chunk` silently
    excludes any chunk_vec row whose chunk no longer exists — they just waste
    space, which is exactly the kind of slow leak worth closing at the source
    rather than tolerating because it "isn't wrong."
    """
    if has_vectors(conn):
        conn.execute(
            "DELETE FROM chunk_vec WHERE rowid IN "
            "(SELECT id FROM chunk WHERE note_id = ?)",
            (note_id,),
        )
    conn.execute("DELETE FROM chunk WHERE note_id = ?", (note_id,))


def _write_chunks(conn: sqlite3.Connection, note_id: str, note: dict[str, Any]) -> None:
    """Replace this note's chunks and their vectors. No-op if vectors aren't
    available on this connection — FTS5 still indexes the note either way, via
    the trigger on ``note`` itself, so search degrades rather than breaks.
    """
    _delete_chunks(conn, note_id)
    if not has_vectors(conn):
        return

    text = _gist_text(note)
    if not text:
        return

    from . import embed

    try:
        vector = embed.embed_documents([text])[0]
    except Exception:  # noqa: BLE001 - embedding is enrichment, not a hard dependency
        return

    cur = conn.execute(
        "INSERT INTO chunk (note_id, kind, ord, text) VALUES (?, 'gist', 0, ?)",
        (note_id, text),
    )
    chunk_id = cur.lastrowid
    conn.execute(
        "INSERT INTO chunk_vec (rowid, embedding) VALUES (?, ?)",
        (chunk_id, embed.serialize(vector)),
    )
    set_embedding_model(conn, embed.MODEL_NAME)


def upsert_note(conn: sqlite3.Connection, note: dict[str, Any]) -> str:
    """Insert or replace a note by vault path, keeping FTS (and, when
    available, its vector chunk) in step.

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
        # Purge chunks (and their vectors) BEFORE deleting the note, not after.
        # `chunk` cascades from `note` on delete, but chunk_vec is a virtual
        # table with no FK support and cannot cascade — if the note delete ran
        # first, the cascade would remove the `chunk` rows this needs to look
        # up chunk_vec ids from, and every re-process of an existing note
        # would leak one orphaned vector forever.
        _delete_chunks(conn, existing["id"])
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
    _write_chunks(conn, note["id"], note)
    conn.commit()
    return note["id"]


def _fts_query(raw: str) -> str:
    """Turn user words into a safe FTS5 MATCH expression.

    Quoting each bare word keeps FTS5 operators (``-``, ``*``, ``:``, ``NEAR``)
    in user input from either erroring or silently changing the query.
    """
    words = [w for w in "".join(c if c.isalnum() else " " for c in raw).split() if w]
    return " OR ".join(f'"{w}"' for w in words)


#: Candidate depth pulled from each leg before fusion. Wider than the final
#: `limit` on purpose — RRF needs headroom to promote an item that one leg
#: ranked outside its own top few but the other leg loved, which is exactly
#: the disagreement hybrid search exists to resolve.
_CANDIDATE_DEPTH = 20

#: Standard RRF damping constant. Softens the gap between rank 1 and rank 2 so
#: one leg's single strongest opinion cannot dominate the fused order; this is
#: the same k used in the literature and in most hybrid-search writeups, not
#: tuned against this corpus specifically.
_RRF_K = 60

#: How much the vector leg counts versus FTS in the fused score. NOT the
#: textbook 0.5 — measured wrong on the regression query this file exists to
#: fix. Plain unweighted RRF is rank-only and throws away magnitude, so a note
#: that is merely decent in both lists can out-score one that is the vector
#: leg's #1 hit by a wide cosine margin. On "how do I make videos
#: automatically": at 0.5 the top 3 was ManyChat / Four-frontend-tools / Video
#: Shot Craft — only one of the two actually-about-video-generation notes
#: made it in, with a lead-funnel post ranked first.
#:
#: Swept 0.5 through 0.9 by hand against the real vault. 0.7 already
#: satisfies the literal bar (both target notes somewhere in the top 3), but
#: 0.75 and up is where the result stops being merely-passing and becomes
#: exactly right: all three notes actually about generating video, and
#: nothing else, fill the top 3 — stable across the whole 0.75–0.9 range, not
#: a knife-edge. Shipping 0.8, the middle of that stable band, rather than
#: its lower boundary. Exact-token queries (a repo name, a product name) are
#: unaffected either way — when only one or two notes contain the term at
#: all, both legs already agree on the top hit and the weighting has nothing
#: to arbitrate.
_VECTOR_WEIGHT = 0.8


def _fts_candidates(
    conn: sqlite3.Connection, match: str, *, topic: str | None, status: str | None
) -> list[str]:
    sql = """
        SELECT n.id, bm25(note_fts, 8.0, 6.0, 3.0, 4.0, 2.0, 2.0, 1.0, 1.5) AS rank
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
    params.append(_CANDIDATE_DEPTH)
    return [row["id"] for row in conn.execute(sql, params).fetchall()]


def _vector_candidates(
    conn: sqlite3.Connection, query: str, *, topic: str | None, status: str | None
) -> list[str]:
    """Nearest chunks by embedding, deduped to one (best) hit per note.

    ``k`` must be explicit in the WHERE clause — sqlite-vec rejects a bare
    LIMIT once the query is joined to another table (verified directly: the
    same query with only ``ORDER BY distance LIMIT n`` raises "A LIMIT or
    'k = ?' constraint is required on vec0 knn queries"). Pulled wider than
    `_CANDIDATE_DEPTH` chunks because today's 1 chunk/note is 1:1, but once a
    note carries transcript chunks too, several nearest chunks can belong to
    the same note and only the first (nearest) occurrence per note_id, in
    ascending-distance order, should survive the dedupe below.
    """
    global _warned_no_vectors
    from . import embed

    try:
        query_vector = embed.embed_query(query)
    except embed.EmbeddingUnavailable:
        if not _warned_no_vectors:
            print("  search: vector index unavailable, falling back to keyword-only", flush=True)
            _warned_no_vectors = True
        return []

    sql = """
        SELECT c.note_id AS note_id, chunk_vec.distance AS distance
        FROM chunk_vec JOIN chunk c ON c.id = chunk_vec.rowid
        JOIN note n ON n.id = c.note_id
        WHERE chunk_vec.embedding MATCH ? AND k = ?
    """
    params: list[Any] = [embed.serialize(query_vector), _CANDIDATE_DEPTH * 3]
    if topic:
        sql += " AND n.topic = ?"
        params.append(topic)
    if status:
        sql += " AND n.status = ?"
        params.append(status)
    sql += " ORDER BY distance"

    seen: set[str] = set()
    ordered: list[str] = []
    for row in conn.execute(sql, params).fetchall():
        note_id = row["note_id"]
        if note_id not in seen:
            seen.add(note_id)
            ordered.append(note_id)
        if len(ordered) >= _CANDIDATE_DEPTH:
            break
    return ordered


def _rrf_fuse(
    fts_ids: list[str], vector_ids: list[str], *, k: int = _RRF_K,
    vector_weight: float = _VECTOR_WEIGHT,
) -> list[str]:
    """Weighted Reciprocal Rank Fusion of the two legs into one ranked list.

    Score-normalisation was the other option and was rejected: BM25 and
    cosine distance are different scales with no principled conversion
    between them, which is the standard reason to reach for RRF at all. But
    *unweighted* RRF (both legs at 1.0) measurably under-served this corpus —
    see _VECTOR_WEIGHT's comment for the specific query and numbers. Weighting
    is still rank-based, not magnitude-based, so it keeps RRF's core property
    (no incomparable scores to normalise) while fixing the actual failure.
    """
    scores: dict[str, float] = {}
    for ranked, weight in ((fts_ids, 1.0 - vector_weight), (vector_ids, vector_weight)):
        for position, item_id in enumerate(ranked):
            scores[item_id] = scores.get(item_id, 0.0) + weight / (k + position + 1)
    return sorted(scores, key=lambda item_id: -scores[item_id])


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

    fts_ids = _fts_candidates(conn, match, topic=topic, status=status)
    vector_ids = (
        _vector_candidates(conn, query, topic=topic, status=status)
        if has_vectors(conn) else []
    )

    fused = _rrf_fuse(fts_ids, vector_ids) if vector_ids else fts_ids
    fused = fused[:limit]
    if not fused:
        return []

    placeholders = ", ".join("?" * len(fused))
    rows = conn.execute(
        f"SELECT * FROM note WHERE id IN ({placeholders})", fused
    ).fetchall()
    by_id = {row["id"]: row for row in rows}
    return [by_id[item_id] for item_id in fused if item_id in by_id]


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

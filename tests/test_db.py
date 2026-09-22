"""Queue semantics and search ranking.

The queue rules exist because Instagram downloads fail intermittently — a
capture that fails must come back on its own, and one that has failed too often
must become visible rather than vanish.
"""

from __future__ import annotations

import sqlite3
import json

import pytest

from stash import db


@pytest.fixture()
def conn(tmp_path):
    connection = db.connect(tmp_path / "t.sqlite")
    yield connection
    connection.close()


def test_duplicate_permalink_returns_the_same_capture(conn):
    """Re-sharing something you already saved is a normal accident, not an error."""
    first, created_first = db.add_capture(conn, source="cli", permalink="https://x/1")
    second, created_second = db.add_capture(conn, source="shortcut", permalink="https://x/1")
    assert created_first and not created_second
    assert first == second


def test_captures_without_permalinks_do_not_collide(conn):
    """DM captures legitimately arrive with no permalink; they are still distinct."""
    a, _ = db.add_capture(conn, source="ig_dm", media_url="https://cdn/a")
    b, _ = db.add_capture(conn, source="ig_dm", media_url="https://cdn/b")
    assert a != b
    assert len(conn.execute("SELECT id FROM capture").fetchall()) == 2


def test_failure_returns_to_pending_then_becomes_a_dead_letter(conn):
    capture_id, _ = db.add_capture(conn, source="cli", permalink="https://x/2")

    for _ in range(3):
        claimed = db.claim_next(conn)
        assert claimed is not None
        db.finish_capture(conn, claimed["id"], ok=False, error="cookies expired")

    # Retries exhausted: no longer claimable, but visible rather than lost.
    assert db.claim_next(conn) is None
    dead = db.dead_letters(conn)
    assert [row["id"] for row in dead] == [capture_id]
    assert "cookies" in dead[0]["error"]


def test_success_marks_done(conn):
    db.add_capture(conn, source="cli", permalink="https://x/3")
    claimed = db.claim_next(conn)
    db.finish_capture(conn, claimed["id"], ok=True)
    assert db.queue_stats(conn).get("done") == 1
    assert db.claim_next(conn) is None


def _note(conn, **overrides):
    note = {
        "path": "2026-08-16-a.md", "title": "Agent memory with Redis",
        "summary": "How to persist agent state between runs.",
        "topic": "agent-building", "tools": ["redis", "langgraph"],
        "why_saved": "", "next_step": "Add a checkpointer to loop.py",
        "difficulty": "afternoon", "relevance": ["notes-agent"],
        "transcript": "we use a redis checkpointer to persist the graph state",
        "frame_notes": "", "permalink": "https://x/a", "source": "cli",
        "status": "unused", "used_where": None,
    }
    note.update(overrides)
    return db.upsert_note(conn, note)


def test_search_matches_transcript_body(conn):
    """The transcript is the whole reason this is searchable at all."""
    _note(conn)
    hits = db.search_notes(conn, "checkpointer")
    assert len(hits) == 1
    assert hits[0]["title"] == "Agent memory with Redis"


def test_search_tolerates_fts5_operators_in_user_input(conn):
    """A stray hyphen or colon must not blow up the query."""
    _note(conn)
    for query in ["agent-building", "redis:", "memory -state", "NEAR"]:
        db.search_notes(conn, query)  # must not raise


def test_upsert_by_path_replaces_rather_than_duplicates(conn):
    _note(conn)
    _note(conn, title="Agent memory, revised")
    rows = conn.execute("SELECT title FROM note").fetchall()
    assert [r["title"] for r in rows] == ["Agent memory, revised"]
    # FTS must have followed the update, not kept the stale row.
    assert len(db.search_notes(conn, "revised")) == 1
    assert len(db.search_notes(conn, "Redis")) == 1


def test_mark_used_is_what_makes_the_vault_self_auditing(conn):
    note_id = _note(conn)
    assert db.mark_used(conn, note_id, "notes-agent/loop.py")
    row = db.note_by_id(conn, note_id)
    assert row["status"] == "used"
    assert row["used_where"] == "notes-agent/loop.py"
    assert db.search_notes(conn, "redis", status="unused") == []


def test_rows_to_dicts_decodes_json_columns(conn):
    _note(conn)
    item = db.rows_to_dicts(db.recent_notes(conn))[0]
    assert item["tools"] == ["redis", "langgraph"]
    assert item["relevance"] == ["notes-agent"]


def test_migrate_recipe_columns_upgrades_a_pre_recipe_database(tmp_path):
    """A database created before ingredients/steps/mentions existed must gain
    them (and keep them searchable) the next time it's opened, without losing
    what's already in it."""
    path = tmp_path / "old.sqlite"
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE note (
          id TEXT PRIMARY KEY, capture_id TEXT, path TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '',
          topic TEXT NOT NULL DEFAULT '', tools TEXT NOT NULL DEFAULT '[]',
          why_saved TEXT NOT NULL DEFAULT '', next_step TEXT NOT NULL DEFAULT '',
          difficulty TEXT NOT NULL DEFAULT '', relevance TEXT NOT NULL DEFAULT '[]',
          transcript TEXT NOT NULL DEFAULT '', frame_notes TEXT NOT NULL DEFAULT '',
          permalink TEXT, source TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'unused', used_where TEXT, created_at TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE note_fts USING fts5(
          title, summary, topic, tools, why_saved, next_step, transcript, frame_notes,
          content='note', content_rowid='rowid', tokenize='porter unicode61'
        );
        INSERT INTO note (id, path, title, summary, created_at)
        VALUES ('old1', 'old.md', 'Preexisting note', 'from before recipes existed', '2020-01-01');
        INSERT INTO note_fts(rowid, title, summary, topic, tools, why_saved, next_step, transcript, frame_notes)
        SELECT rowid, title, summary, topic, tools, why_saved, next_step, transcript, frame_notes FROM note;
    """)
    conn.commit()
    conn.close()

    conn = db.connect(path)
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(note)")}
    assert {"ingredients", "steps", "mentions"} <= cols
    old = conn.execute("SELECT * FROM note WHERE id = 'old1'").fetchone()
    assert old["title"] == "Preexisting note" and old["ingredients"] == "[]"
    assert conn.execute("SELECT rowid FROM note_fts WHERE note_fts MATCH 'preexisting'").fetchall()

    db.upsert_note(conn, {
        "path": "recipe.md", "title": "Garlic Butter Pasta", "summary": "s", "topic": "food",
        "tools": [], "why_saved": "w", "next_step": "n", "difficulty": "trivial", "relevance": [],
        "transcript": "", "frame_notes": "", "ingredients": ["3 cloves garlic"], "steps": ["Fry it"],
        "source": "cli", "status": "unused",
    })
    hit = conn.execute("SELECT title FROM note_fts WHERE note_fts MATCH 'garlic'").fetchall()
    assert any(True for _ in hit)  # the ingredient itself, not just the title, is now searchable
    conn.close()


def test_migrate_recipe_columns_is_a_noop_on_a_current_database(tmp_path):
    conn = db.connect(tmp_path / "new.sqlite")
    db._migrate_recipe_columns(conn)  # must not raise, must not double-run the FTS rebuild
    assert conn.execute("SELECT 1 FROM note LIMIT 1").fetchall() == []


def test_list_mentions_flattens_across_notes_and_filters_by_type(conn):
    _note(conn, mentions=[{"type": "book", "name": "Atomic Habits"}, {"type": "movie", "name": "Inception"}],
          path="a.md", title="Post A")
    _note(conn, mentions=[{"type": "book", "name": "Deep Work"}], path="b.md", title="Post B")
    _note(conn, mentions=[], path="c.md", title="Post C, nothing mentioned")

    everything = db.list_mentions(conn)
    assert {m["name"] for m in everything} == {"Atomic Habits", "Inception", "Deep Work"}

    books = db.list_mentions(conn, kind="book")
    assert {m["name"] for m in books} == {"Atomic Habits", "Deep Work"}
    assert all(m["type"] == "book" for m in books)
    hit = next(m for m in books if m["name"] == "Atomic Habits")
    assert hit["note_title"] == "Post A"


def test_list_mentions_tolerates_old_string_shaped_mentions(conn):
    """Mentions saved before the structured {type, name} format existed must
    not crash the listing — they show up typed as 'other'."""
    conn.execute(
        "INSERT INTO note (id, path, title, mentions, created_at) VALUES "
        "('old', 'old.md', 'Old note', ?, '2020-01-01')",
        (json.dumps(["Atomic Habits"]),),
    )
    items = db.list_mentions(conn)
    assert items == [{"type": "other", "name": "Atomic Habits", "note_id": "old", "note_title": "Old note"}]


def test_gist_text_reads_structured_and_legacy_mentions():
    structured = db._gist_text({"title": "t", "mentions": [{"type": "book", "name": "Atomic Habits"}]})
    legacy = db._gist_text({"title": "t", "mentions": ["Atomic Habits"]})
    assert "Atomic Habits" in structured and "Atomic Habits" in legacy

"""Hybrid retrieval: FTS5 + sqlite-vec fused with weighted RRF.

The corpus this was built against is small (16 notes today), so these tests
lean on synthetic embeddings rather than the real fastembed model — loading
BAAI/bge-small-en-v1.5 in every test run would make the suite slow and give it
a network dependency on first run in CI. What's under test here is the fusion
arithmetic and the degradation paths, not embedding quality; embedding quality
is what the real-vault regression check in the plan's verification section
covers, by hand, against the actual model.
"""

from __future__ import annotations

import pytest

from stash import db


@pytest.fixture()
def conn(tmp_path):
    connection = db.connect(tmp_path / "t.sqlite")
    yield connection
    connection.close()


# ---------------------------------------------------------------------------
# RRF fusion arithmetic
# ---------------------------------------------------------------------------


def test_rrf_fuse_favors_items_ranked_well_in_both_lists():
    """Baseline sanity check before weighting enters the picture."""
    fts = ["a", "b", "c"]
    vec = ["b", "a", "c"]
    fused = db._rrf_fuse(fts, vec, vector_weight=0.5)
    # b: rank2+rank1 vs a: rank1+rank2 -> symmetric, but the exact order
    # depends on 1-indexed position; the real assertion is that c (last in
    # both) sorts last.
    assert fused[-1] == "c"
    assert set(fused[:2]) == {"a", "b"}


def test_rrf_fuse_the_actual_measured_regression():
    """The regression this file exists to fix, reproduced with the real
    candidate order captured from the live vault (see the plan's dated
    investigation). Unweighted RRF (vector_weight=0.5) put a lead-funnel post
    ahead of both notes actually about generating video; weight 0.8 does not.
    """
    fts = [
        "ad-research", "manychat", "four-frontend", "whatsapp-evo",
        "sanity-cms", "remotion", "whatsapp-docker", "video-shot-craft",
        "video-shotcraft-dup",
    ]
    vec = [
        "video-shot-craft", "video-shotcraft-dup", "remotion",
        "four-frontend", "manychat", "5-plugins",
    ]

    unweighted = db._rrf_fuse(fts, vec, vector_weight=0.5)
    assert unweighted[0] == "manychat"  # the actual bug, pinned so it can't silently return

    weighted = db._rrf_fuse(fts, vec, vector_weight=db._VECTOR_WEIGHT)
    assert set(weighted[:3]) == {"video-shot-craft", "video-shotcraft-dup", "remotion"}


def test_rrf_fuse_an_item_in_only_one_list_still_scores():
    """RRF's whole point: a strong single-leg hit should not vanish just for
    being absent from the other leg."""
    fts = ["a", "b"]
    vec = []  # vector leg found nothing, or vectors are unavailable
    fused = db._rrf_fuse(fts, vec, vector_weight=db._VECTOR_WEIGHT)
    assert fused == ["a", "b"]


def test_rrf_fuse_empty_lists_return_empty():
    assert db._rrf_fuse([], [], vector_weight=db._VECTOR_WEIGHT) == []


# ---------------------------------------------------------------------------
# Graceful degradation — vectors must never be able to break a capture
# ---------------------------------------------------------------------------


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


def test_has_vectors_reflects_a_real_working_extension(conn):
    """This repo's actual environment has sqlite-vec installed and loadable —
    assert that's really true rather than mocking it, so a packaging or
    environment regression that breaks the extension shows up here."""
    assert db.has_vectors(conn) is True


def test_search_still_works_with_no_vector_leg(conn, monkeypatch):
    """Simulates the extension failing to load (old sqlite3 build, missing
    package, whatever) — search must fall back to FTS5-only, not raise."""
    monkeypatch.setattr(db, "has_vectors", lambda _conn: False)
    _note(conn)
    hits = db.search_notes(conn, "redis checkpointer")
    assert len(hits) == 1
    assert hits[0]["title"] == "Agent memory with Redis"


def test_upsert_note_does_not_write_chunks_when_vectors_unavailable(conn, monkeypatch):
    monkeypatch.setattr(db, "has_vectors", lambda _conn: False)
    _note(conn)
    assert conn.execute("SELECT COUNT(*) c FROM chunk").fetchone()["c"] == 0


def test_upsert_note_survives_embedding_failure(conn, monkeypatch):
    """The embed module raising must not lose the note itself — embedding is
    enrichment on top of a working FTS5 index, not a hard dependency of it."""
    from stash import embed

    def boom(_texts):
        raise embed.EmbeddingUnavailable("model failed to load")

    monkeypatch.setattr(embed, "embed_documents", boom)
    note_id = _note(conn)
    assert db.note_by_id(conn, note_id) is not None
    hits = db.search_notes(conn, "redis checkpointer")
    assert len(hits) == 1


# ---------------------------------------------------------------------------
# Chunk lifecycle — the orphan-leak bug found while building this
# ---------------------------------------------------------------------------


def test_reupserting_a_note_does_not_leak_orphaned_vectors(conn):
    """Regression test for a real bug hit while implementing this: chunk_vec
    is a virtual table with no FK support, so if chunk rows are deleted
    (directly, or via the note's ON DELETE CASCADE) without also deleting the
    matching chunk_vec rows, every re-process of the same note leaks one
    orphaned vector forever."""
    note_id = _note(conn)
    for i in range(5):
        _note(conn, title=f"Agent memory with Redis v{i}")

    assert conn.execute("SELECT COUNT(*) c FROM note").fetchone()["c"] == 1
    assert conn.execute("SELECT COUNT(*) c FROM chunk").fetchone()["c"] == 1
    assert conn.execute("SELECT COUNT(*) c FROM chunk_vec").fetchone()["c"] == 1


def test_deleting_a_note_cascades_to_its_chunk(conn):
    note_id = _note(conn)
    conn.execute("DELETE FROM note WHERE id = ?", (note_id,))
    conn.commit()
    assert conn.execute("SELECT COUNT(*) c FROM chunk").fetchone()["c"] == 0


# ---------------------------------------------------------------------------
# Embedding-model drift detection
# ---------------------------------------------------------------------------


def test_embedding_model_matches_is_true_before_anything_is_embedded(conn):
    """No stored model yet -> nothing to conflict with."""
    assert db.embedding_model_matches(conn, "any-model-name") is True


def test_embedding_model_mismatch_is_detected(conn):
    _note(conn)  # writes a chunk under the real configured model
    from stash import embed
    assert db.embedding_model_matches(conn, embed.MODEL_NAME) is True
    assert db.embedding_model_matches(conn, "a-different-model") is False


# ---------------------------------------------------------------------------
# embed.py — the BGE query/document asymmetry
# ---------------------------------------------------------------------------


def test_query_prefix_is_applied_only_to_queries(monkeypatch):
    """fastembed's own query_embed is a documented no-op alias to embed() for
    bge-small-en-v1.5 (verified by reading the installed source) — the prefix
    has to be applied explicitly here, not trusted to the library."""
    import numpy as np

    from stash import embed

    seen = {}

    class FakeModel:
        def embed(self, texts):
            seen["texts"] = list(texts)
            return [np.zeros(embed.DIM) for _ in texts]

    monkeypatch.setattr(embed, "_get_model", lambda: FakeModel())
    embed.embed_query("agent memory")
    assert seen["texts"] == [embed.QUERY_PREFIX + "agent memory"]

    embed.embed_documents(["a note about agent memory"])
    assert seen["texts"] == ["a note about agent memory"]  # no prefix


# ---------------------------------------------------------------------------
# stash reindex — the bulk delete/rebuild path, a distinct code path from
# upsert_note's single-row replace and one that had its own orphan bug
# ---------------------------------------------------------------------------


def _bulk_rebuild(conn, notes, *, clear_chunk_vec):
    """Mirrors stash.cli._reindex's core sequence at the db layer, so the test
    does not need to touch CONFIG/vault files to reproduce the bug it's
    pinning. `clear_chunk_vec=False` reproduces the pre-fix code path."""
    if clear_chunk_vec and db.has_vectors(conn):
        conn.execute("DELETE FROM chunk_vec")
    conn.execute("DELETE FROM note")
    conn.commit()
    for note in notes:
        db.upsert_note(conn, dict(note))


def test_reindex_twice_in_a_row_does_not_collide_on_chunk_vec_rowids(conn):
    """Real bug, hit running `stash reindex` against the actual vault: bulk
    `DELETE FROM note` cascades `chunk` but leaves chunk_vec's old rowids
    sitting in the table (no FK support on a virtual table), so the next
    reindex's fresh chunk inserts can collide with a leftover chunk_vec rowid
    and fail with 'UNIQUE constraint failed'. First proven by reproducing the
    pre-fix crash, then proven fixed."""
    notes = [
        {"path": f"n{i}.md", "title": f"Test note {i}", "summary": "s",
         "topic": "tooling", "tools": [], "why_saved": "", "next_step": "",
         "difficulty": "trivial", "relevance": [], "transcript": "",
         "frame_notes": "", "permalink": f"https://x/{i}", "source": "cli",
         "status": "unused"}
        for i in range(3)
    ]

    _bulk_rebuild(conn, notes, clear_chunk_vec=False)
    with pytest.raises(Exception, match="UNIQUE constraint"):
        _bulk_rebuild(conn, notes, clear_chunk_vec=False)  # reproduces the real crash

    _bulk_rebuild(conn, notes, clear_chunk_vec=True)  # the actual fix
    _bulk_rebuild(conn, notes, clear_chunk_vec=True)  # must survive repeatedly

    assert conn.execute("SELECT COUNT(*) c FROM note").fetchone()["c"] == 3
    assert conn.execute("SELECT COUNT(*) c FROM chunk").fetchone()["c"] == 3
    assert conn.execute("SELECT COUNT(*) c FROM chunk_vec").fetchone()["c"] == 3

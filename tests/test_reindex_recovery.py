"""Failed rebuilds must preserve the live index and its metadata."""
import argparse
import dataclasses

import pytest

from stash import cli, db


@pytest.fixture
def index(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(cli, "CONFIG", dataclasses.replace(cli.CONFIG, vault_dir=vault))
    conn = db.connect(tmp_path / "index.sqlite")
    monkeypatch.setattr(db, "has_vectors", lambda _: False)
    db.upsert_note(conn, {"path": "original.md", "title": "Original", "capture_id": "saved-id",
                          "status": "used", "used_where": "dinner", "summary": "originalword", "topic": "other", "source": "cli",
                          "why_saved": "", "next_step": "", "difficulty": "trivial", "transcript": "", "frame_notes": ""})
    yield conn, vault
    conn.close()


def assert_original(conn):
    row = conn.execute("SELECT path, capture_id, status, used_where FROM note").fetchone()
    assert tuple(row) == ("original.md", "saved-id", "used", "dinner")
    assert conn.execute("SELECT COUNT(*) FROM note_fts WHERE note_fts MATCH 'originalword'").fetchone()[0] == 1


def test_bad_frontmatter_leaves_index_untouched(index):
    conn, vault = index
    (vault / "bad.md").write_text("---\nplain-scalar\n---\nBody")
    with pytest.raises(TypeError):
        cli._reindex(conn, argparse.Namespace(no_embed=True))
    assert_original(conn)


def test_failure_after_first_replacement_insert_rolls_back(index, monkeypatch):
    conn, vault = index
    for name in ("a", "b"):
        (vault / f"{name}.md").write_text(f"---\ntitle: {name}\n---\nSummary")
    upsert = db.upsert_note
    calls = []
    def fail_second(conn, note, **kwargs):
        calls.append(note["path"])
        if len(calls) == 2:
            raise RuntimeError("interrupted rebuild")
        return upsert(conn, note, **kwargs)
    monkeypatch.setattr(db, "upsert_note", fail_second)
    with pytest.raises(RuntimeError, match="interrupted"):
        cli._reindex(conn, argparse.Namespace(no_embed=True))
    assert len(calls) == 2
    assert_original(conn)
    assert not conn.in_transaction

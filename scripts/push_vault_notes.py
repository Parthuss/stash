"""One-off: mirror every note already in the local index to the Worker.

New notes are pushed by the pipeline as they're written; this catches the ones
that predate multi-user. Safe to re-run — /note is idempotent per capture.

    .venv/bin/python scripts/push_vault_notes.py
"""
from __future__ import annotations

import json
from pathlib import Path

from stash import db, fetch, pipeline, remote
from stash.config import CONFIG
from stash.fetch import MediaItem


def _cached_thumb(permalink: str | None) -> bytes | None:
    """Cover image from whatever this Mac still has cached for that link."""
    if not permalink:
        return None
    key = fetch._key(permalink)
    files = sorted(p for p in CONFIG.media_dir.glob(f"{key}*") if p.suffix in (".mp4", ".jpg", ".jpeg", ".png", ".webp"))
    if not files:
        return None
    first = files[0]
    return pipeline.thumbnail([MediaItem(1, "video" if first.suffix == ".mp4" else "image", path=Path(first))])

conn = db.connect(CONFIG.db_path)
rows = conn.execute("SELECT * FROM note").fetchall()
ok = 0
for row in rows:
    path = CONFIG.vault_dir / row["path"]
    if not path.exists():
        print(f"skip (no file): {row['path']}")
        continue
    remote.push_note(
        remote.Row({"id": row["capture_id"] or "vault:" + row["path"], "user_id": None}),
        {
            "title": row["title"], "summary": row["summary"], "topic": row["topic"],
            "tools": json.loads(row["tools"] or "[]") if isinstance(row["tools"], str) else row["tools"],
            # Must be sent: the Worker's upsert replaces mentions, so leaving it
            # out would wipe a note's books/movies list in the cloud.
            "mentions": json.loads(row["mentions"] or "[]"),
        },
        path.read_text(),
        row["permalink"],
        thumb=_cached_thumb(row["permalink"]),
    )
    ok += 1
print(f"pushed {ok}/{len(rows)}")

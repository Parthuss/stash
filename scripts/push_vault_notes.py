"""One-off: mirror every note already in the local index to the Worker.

New notes are pushed by the pipeline as they're written; this catches the ones
that predate multi-user. Safe to re-run — /note is idempotent per capture.

    .venv/bin/python scripts/push_vault_notes.py
"""
from __future__ import annotations

import json

from stash import db, remote
from stash.config import CONFIG

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
        },
        path.read_text(),
        row["permalink"],
    )
    ok += 1
print(f"pushed {ok}/{len(rows)}")

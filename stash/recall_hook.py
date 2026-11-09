"""Claude Code UserPromptSubmit hook: put relevant saves in front of Claude.

Leaving recall to the model (MCP instructions, the stash-recall skill) measurably
didn't work: in fresh sessions with both loaded, Claude never searched on its
own (9 Nov 2026). So search on every prompt and hand Claude the close matches.

Register in ~/.claude/settings.json:
  "UserPromptSubmit": [{"hooks": [{"type": "command",
    "command": "cd /path/to/stash && .venv/bin/python -m stash.recall_hook"}]}]
"""
from __future__ import annotations

import json
import sys

# Cosine distance (bge-small). Calibrated 9 Nov on 90 notes: real work prompts
# land 0.64-0.79, unrelated ones (git, renames, weather) 0.83+.
MAX_DISTANCE = 0.80
SKIP_TOPICS = {"other"}  # jokes and engagement bait


def matches(prompt: str, limit: int = 3) -> list[dict]:
    from . import db, embed
    from .config import CONFIG

    conn = db.connect(CONFIG.db_path)
    try:
        rows = conn.execute(
            """SELECT n.id, n.title, n.summary, n.topic, n.status, MIN(v.distance) AS d
               FROM chunk_vec v JOIN chunk c ON c.id = v.rowid JOIN note n ON n.id = c.note_id
               WHERE v.embedding MATCH ? AND k = 20 GROUP BY n.id ORDER BY d""",
            [embed.serialize(embed.embed_query(prompt[:2000]))],
        ).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows if r["d"] <= MAX_DISTANCE and r["topic"] not in SKIP_TOPICS][:limit]


def context(hits: list[dict]) -> str:
    lines = [f"- {h['title']} ({h['status']}) id {h['id']}: {h['summary'][:200]}" for h in hits]
    return (
        "Skwirl: the user saved these and may have forgotten them. If one genuinely fits the task, "
        "call get_stash_note(id) before relying on it, mention it in one line, and call "
        "mark_stash_used once it shapes the work. If none fits, ignore this silently.\n" + "\n".join(lines)
    )


def main() -> int:
    try:
        prompt = (json.load(sys.stdin).get("prompt") or "").strip()
        if len(prompt) < 20 or prompt.startswith("/"):
            return 0
        hits = matches(prompt)
        if hits:
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit", "additionalContext": context(hits)}}))
    except Exception as exc:  # never block a prompt over recall
        print(f"skwirl recall skipped: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    assert MAX_DISTANCE < 0.83  # above that, the calibration set's unrelated prompts leak in
    sys.exit(main())

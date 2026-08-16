"""MCP surface over the vault, so recall works in any client, not just one.

Deliberately small. Five tools is enough to answer "have I saved anything about
this?", and a large tool surface makes a model less likely to reach for the
right one at the right moment — which is the only behaviour that matters here.

  stash search   — the one that does the work
  stash get      — full note including transcript
  stash topics   — what this person actually collects
  stash recent   — what came in lately
  stash used     — close the loop

``mark_used`` is the one that looks optional and isn't. It is the only signal
that distinguishes a knowledge base from a graveyard.

Run:  python -m stash.mcp_server
"""

from __future__ import annotations

import json
from typing import Any

from mcp.server.mcpserver import MCPServer

from . import db
from .config import CONFIG

mcp = MCPServer(
    "stash",
    instructions=(
        "The user's own saved Instagram/social content, transcribed and indexed. "
        "Search it at the start of technical work rather than waiting to be asked — "
        "they save things intending to use them and forget they exist."
    ),
)


def _conn():
    return db.connect(CONFIG.db_path)


def _render(items: list[dict[str, Any]]) -> str:
    if not items:
        return "No matching saves."
    out = []
    for item in items:
        lines = [
            f"## {item['title']}",
            f"- id: `{item['path']}`",
            f"- {item['summary']}",
            f"- topic: {item['topic']} · difficulty: {item['difficulty']} · status: {item['status']}",
        ]
        if item.get("tools"):
            lines.append(f"- tools: {', '.join(item['tools'])}")
        if item.get("relevance"):
            lines.append(f"- could plug into: {', '.join(item['relevance'])}")
        if item.get("next_step"):
            lines.append(f"- **next step:** {item['next_step']}")
        if item.get("why_saved"):
            lines.append(f"- why it was saved: {item['why_saved']}")
        if item.get("permalink"):
            lines.append(f"- {item['permalink']}")
        out.append("\n".join(lines))
    return "\n\n".join(out)


@mcp.tool()
def search_stash(
    query: str, topic: str = "", status: str = "", limit: int = 5
) -> str:
    """Search the user's saved social-media posts (Instagram reels, TikToks, videos).

    Use this at the START of any agent-building, automation, tooling, or research
    task, before proposing an approach — the user saves material intending to use
    it and reliably forgets it exists. Search first, mention what you find.

    Args:
        query: Free text. Topic words, tool names, or a description of the problem.
        topic: Optional exact filter, e.g. "agent-building". See list_stash_topics.
        status: "unused" to see only things never acted on yet.
        limit: Max results, default 5.
    """
    conn = _conn()
    try:
        rows = db.search_notes(
            conn, query, topic=topic or None, status=status or None, limit=limit
        )
        return _render(db.rows_to_dicts(rows))
    finally:
        conn.close()


@mcp.tool()
def get_stash_note(note_id: str) -> str:
    """Read one saved post in full, including its transcript and on-screen notes.

    Args:
        note_id: The `id` from a search result (the vault filename).
    """
    conn = _conn()
    try:
        row = db.note_by_id(conn, note_id)
        if row is None:
            return f"No note matching {note_id!r}."
        path = CONFIG.vault_dir / row["path"]
        if path.exists():
            return path.read_text(encoding="utf-8")
        return json.dumps(db.rows_to_dicts([row])[0], indent=2, default=str)
    finally:
        conn.close()


@mcp.tool()
def list_stash_topics() -> str:
    """List the topics present in the user's saves, with counts.

    Useful for orienting before a search, or for answering "what do I collect?".
    """
    conn = _conn()
    try:
        topics = db.list_topics(conn)
        if not topics:
            return "The stash is empty."
        return "\n".join(f"- {topic} ({count})" for topic, count in topics)
    finally:
        conn.close()


@mcp.tool()
def recent_stash(limit: int = 10, status: str = "") -> str:
    """Show the most recently saved posts.

    Args:
        limit: How many, default 10.
        status: "unused" to see only what has never been acted on.
    """
    conn = _conn()
    try:
        rows = db.recent_notes(conn, limit=limit, status=status or None)
        return _render(db.rows_to_dicts(rows))
    finally:
        conn.close()


@mcp.tool()
def mark_stash_used(note_id: str, where: str) -> str:
    """Record that a saved post actually got used somewhere.

    Call this whenever a save influences real work — code written, a decision
    made, a tool adopted. It is the only measure of whether this system is
    earning its keep, so err towards recording it.

    Args:
        note_id: The `id` from a search result.
        where: Where it landed, e.g. "notes-agent/loop.py" or "picked langgraph".
    """
    conn = _conn()
    try:
        if db.mark_used(conn, note_id, where):
            return f"Marked used: {where}"
        return f"No note matching {note_id!r}."
    finally:
        conn.close()


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()

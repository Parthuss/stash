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
    """Full detail — every field. Used only by get_stash_note, which is called
    on exactly one note the caller already decided matters."""
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


#: Compact-hit summaries are truncated here, not left to run on — a search
#: result set is meant to be scanned to decide what's worth a full read, and a
#: long summary defeats that by making the compact form nearly as expensive as
#: the thing it's supposed to be cheaper than.
_SUMMARY_CLIP = 140


def _render_compact(items: list[dict[str, Any]]) -> str:
    """One line per hit: enough to decide what's worth reading in full.

    This is what turned search_stash from ~1,341 tokens for 5 hits into a
    fraction of that — the full rendered record (summary, tools, relevance,
    next_step, why_saved, permalink) was being sent for every result even
    though a caller only ever acts on one or two of them. get_stash_note
    pulls the rest for whichever id turns out to matter.

    No numeric relevance score is surfaced. `search_notes` fuses two
    incomparable scales (BM25, cosine distance) via rank position, not a
    combined score with real meaning, so a raw float here would be precision
    theatre; list order already *is* the relevance signal.
    """
    if not items:
        return "No matching saves."
    lines = []
    for item in items:
        summary = (item.get("summary") or "").strip()
        if len(summary) > _SUMMARY_CLIP:
            summary = summary[: _SUMMARY_CLIP - 1].rstrip() + "…"
        tools = ", ".join(item.get("tools") or []) or "—"
        # `id` (16 hex chars), not the vault filename (60+ chars) — get_note
        # accepts either, and the filename's slug mostly restates the title
        # already shown above it. Its one distinct signal, the date prefix,
        # is kept explicitly instead.
        date = (item.get("created_at") or "")[:10]
        lines.append(
            f"- **{item['title']}** — {summary}\n"
            f"  `{item['id']}` · {date} · {item['topic']} · {item['status']} · tools: {tools}"
        )
    lines.append("\n(call get_stash_note(id) for transcript, next step, why saved, and the permalink)")
    return "\n".join(lines)


@mcp.tool()
def search_stash(
    query: str, topic: str = "", status: str = "", limit: int = 5
) -> str:
    """Search the user's saved social-media posts (Instagram reels, TikToks, videos).

    Use this at the START of any agent-building, automation, tooling, or research
    task, before proposing an approach — the user saves material intending to use
    it and reliably forgets it exists. Search first, mention what you find.

    Returns compact hits (title, one-line summary, tools) — call
    get_stash_note(id) on whichever one turns out to matter for the full
    transcript, next step, and permalink.

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
        return _render_compact(db.rows_to_dicts(rows))
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
        return _render_compact(db.rows_to_dicts(rows))
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

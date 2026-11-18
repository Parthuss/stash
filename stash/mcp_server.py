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
from typing import Annotated, Any

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations
from pydantic import Field

from . import db
from .config import CONFIG

mcp = MCPServer(
    "stash",
    instructions=(
        "The user's own saved Instagram/social content, transcribed and indexed. "
        "They save things to use later and forget they exist, so search it without being "
        "asked at the start of any build, design, writing, research or planning task, "
        "before proposing an approach. Search concept words, not the task's literal words "
        "(a landing page that shouldn't look AI-made: 'AI-generated UI tells'), and try a "
        "second query if the first is weak."
    ),
)


def _conn():
    return db.connect(CONFIG.db_path)


# Field metadata is exposed in tools/list; docstring Args alone are not schemas.
Query = Annotated[str, Field(min_length=1, max_length=200, description="String of concept words or the underlying problem, 1-200 characters; example: 'animation patterns'.", examples=["animation patterns"])]
Topic = Annotated[str, Field(description="String: exact topic from list_stash_topics, or empty for all; example: 'agent-building'.", examples=["agent-building"])]
Status = Annotated[str, Field(pattern=r"^(|unused|used)$", description="String: 'unused', 'used', or empty for all saves; example: 'unused'.", examples=["unused"])]
Limit = Annotated[int, Field(ge=1, le=20, description="Integer number of compact results, 1-20; example: 5.", examples=[5])]
NoteId = Annotated[str, Field(min_length=1, description="Nonempty string: exact note ID or vault filename returned by search/recent, never a guessed ID; example: '0123456789abcdef'.", examples=["0123456789abcdef"])]
MentionKind = Annotated[str, Field(pattern=r"^(|book|movie|show|podcast|place|product|person|other)$", description="String: book, movie, show, podcast, place, product, person, other, or empty for all; example: 'book'.", examples=["book"])]
UsedWhere = Annotated[str, Field(min_length=1, description="Nonempty string describing where the save was applied; example: 'picked langgraph'.", examples=["picked langgraph"])]

_LOCAL_READ = ToolAnnotations(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False,
)
_WRITE_USAGE = ToolAnnotations(
    read_only_hint=False, destructive_hint=True, idempotent_hint=True, open_world_hint=False,
)


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


@mcp.tool(structured_output=True, annotations=_LOCAL_READ)
def search_stash(
    query: Query, topic: Topic = "", status: Status = "", limit: Limit = 5
) -> str:
    """Search the user's saved social-media posts (Instagram reels, TikToks, videos).

    Use this at the START of any build, design, writing, automation, research or
    planning task, before proposing an approach. The user saves material intending
    to use it and reliably forgets it exists. Search first, mention what you find.
    Use concept words, not the task's literal words, and try a second query if the
    first is weak. An empty result means nothing relevant was saved.

    Returns compact hits (title, one-line summary, tools) — call
    get_stash_note(id) on whichever one turns out to matter for the full
    transcript, next step, and permalink.

    Searches this local Skwirl vault by keyword and, when available, meaning.
    Results are relevance-ordered, with title, clipped summary, note ID, date,
    topic, status and tools. No numeric relevance score is returned. For newest
    saves regardless of relevance use recent_stash; for topic filters use
    list_stash_topics. Queries with no searchable words fall back to recent saves.
    Does not change saves or fetch live social posts. Returns text plus the same
    string in structuredContent.result; an empty search returns "No matching saves.".
    Invalid arguments and database failures are tool errors.
    Example: search_stash(query="animation patterns", status="unused", limit=5).

    Args:
        query: Concept words, tool names, or the underlying problem, not the task as typed.
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


@mcp.tool(structured_output=True, annotations=_LOCAL_READ)
def get_stash_note(note_id: NoteId) -> str:
    """Read one saved post in full, including its transcript and on-screen notes.

    Reads one existing note from the local Skwirl vault after search_stash or
    recent_stash supplies its ID. Use those tools to discover notes first.
    Returns the saved markdown file, including available summary, next step,
    transcript and source permalink; if the file is absent, returns the indexed
    note fields as JSON text. Does not fetch the source or change usage status.
    Returns text plus the same string in structuredContent.result. A missing ID
    returns "No note matching ..."; invalid arguments, database and file-read
    failures are tool errors. Use mark_stash_used only after applying the note.
    Example: get_stash_note(note_id="0123456789abcdef") after a matching search.

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


@mcp.tool(structured_output=True, annotations=_LOCAL_READ)
def list_stash_topics() -> str:
    """List the topics present in the user's saves, with counts.

    Useful for orienting before a search, or for answering "what do I collect?".
    Enumerates nonempty topic names in the local Skwirl vault, ordered by save
    count descending. Use returned names as search_stash(topic=...) filters;
    use list_stash_mentions for named books, places or people instead of topics.
    Takes no parameters and does not change saves or contact external services.
    Returns text lines with topic and count, plus the same string in
    structuredContent.result; no topics returns "The stash is empty.". Database failures
    are tool errors.
    Example: list_stash_topics().
    """
    conn = _conn()
    try:
        topics = db.list_topics(conn)
        if not topics:
            return "The stash is empty."
        return "\n".join(f"- {topic} ({count})" for topic, count in topics)
    finally:
        conn.close()


@mcp.tool(structured_output=True, annotations=_LOCAL_READ)
def list_stash_mentions(kind: MentionKind = "") -> str:
    """List books, movies, shows, podcasts, places, or people the user's saves have named.

    This is what turns "did I save a book about X" or "what movies have I saved"
    into a real answer — it's not one note's worth, it's everything ever
    mentioned across the whole stash, regardless of what that post was mainly about.

    Reads stored mentions in the local Skwirl vault, newest source note first.
    Returns name, type, source note title and ID; repeated mentions across notes
    remain separate rows. Use get_stash_note for a source's context, or
    list_stash_topics for broad topic counts. Does not search the live web,
    deduplicate names, or change saves. Returns text plus the same string in
    structuredContent.result; no matches returns a no-mentions message.
    Invalid arguments and database failures are tool errors.
    Example: list_stash_mentions(kind="book").

    Args:
        kind: Optional exact filter: "book", "movie", "show", "podcast", "place",
            "product", "person", or "other". Omit to list everything.
    """
    conn = _conn()
    try:
        items = db.list_mentions(conn, kind=kind or None)
        if not items:
            return f"No {kind + ' ' if kind else ''}mentions found." if kind else "Nothing mentioned yet."
        return "\n".join(
            f"- **{item['name']}** ({item['type']}) — saved in \"{item['note_title']}\" (`{item['note_id']}`)"
            for item in items
        )
    finally:
        conn.close()


@mcp.tool(structured_output=True, annotations=_LOCAL_READ)
def recent_stash(limit: Limit = 10, status: Status = "") -> str:
    """Show the most recently saved posts.

    Lists a bounded number of local Skwirl saves newest first, optionally filtered
    by usage status. This is a count limit, not a date range. Returns title,
    clipped summary, note ID, date, topic, status and tools; use get_stash_note
    for full content, search_stash for relevance, or list_stash_mentions for named entities. Does not
    change saves or contact external services. Returns text plus the same string
    in structuredContent.result; no matches returns "No matching saves.".
    Invalid arguments and database failures are tool errors.
    Example: recent_stash(limit=5, status="unused").

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


@mcp.tool(structured_output=True, annotations=_WRITE_USAGE)
def mark_stash_used(note_id: NoteId, where: UsedWhere) -> str:
    """Record that a saved post actually got used somewhere.

    Call this whenever a save influences real work — code written, a decision
    made, a tool adopted. It is the only measure of whether this system is
    earning its keep, so err towards recording it.

    Updates one existing local Skwirl note to status "used" and replaces its
    previous used_where value with where. Use search_stash or recent_stash to
    find the note, and get_stash_note to read it before applying it. Reading
    alone is not usage. Does not delete the note or promise a ranking boost.
    Repeating the same note_id and where leaves the same stored state; changing
    where overwrites the previous context. Does not contact external services.
    Returns confirmation text plus the same string in structuredContent.result;
    a missing ID returns "No note matching ...". Invalid arguments and database
    failures are tool errors.
    Example: mark_stash_used(note_id="0123456789abcdef", where="picked langgraph").

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

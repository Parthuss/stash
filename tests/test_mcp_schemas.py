"""Stdio MCP discovery metadata and SDK structured-result contract; no real vault."""
import asyncio
import sqlite3

import pytest

pytest.importorskip("mcp.server.mcpserver")
from stash import mcp_server


def test_every_stdio_tool_has_parameter_metadata_and_output_schema():
    tools = asyncio.run(mcp_server.mcp.list_tools())
    assert {tool.name for tool in tools} == {
        "search_stash", "get_stash_note", "recent_stash", "list_stash_topics",
        "list_stash_mentions", "mark_stash_used",
    }
    for tool in tools:
        assert "Example:" in tool.description
        for parameter in tool.input_schema["properties"].values():
            assert parameter["description"]
            assert parameter["examples"]
            assert parameter["type"] in {"string", "integer"}
        assert tool.output_schema["properties"]["result"]["type"] == "string"
        assert tool.output_schema["required"] == ["result"]
        assert "Skwirl" in tool.description
        assert "structuredContent.result" in tool.description
        assert "tool errors" in tool.description


def test_stdio_annotations_describe_local_effects():
    tools = asyncio.run(mcp_server.mcp.list_tools())
    for tool in tools:
        writes_usage = tool.name == "mark_stash_used"
        assert tool.annotations.model_dump(by_alias=True, exclude_none=True) == {
            "readOnlyHint": not writes_usage,
            "destructiveHint": writes_usage,
            "idempotentHint": True,
            "openWorldHint": False,
        }


def test_sdk_keeps_text_and_structured_content_consistent(monkeypatch):
    class Connection:
        def close(self):
            pass

    monkeypatch.setattr(mcp_server, "_conn", Connection)
    monkeypatch.setattr(mcp_server.db, "list_topics", lambda conn: [])
    result = asyncio.run(mcp_server.mcp.call_tool("list_stash_topics", {}))
    assert result.structured_content == {"result": "The stash is empty."}
    assert result.content[0].text == result.structured_content["result"]


def test_invalid_limit_rejected_before_accessing_vault(monkeypatch):
    def forbidden():
        pytest.fail("invalid arguments must not open the vault")

    monkeypatch.setattr(mcp_server, "_conn", forbidden)
    for limit in (0, 21):
        with pytest.raises(Exception, match="validation error"):
            asyncio.run(mcp_server.mcp.call_tool("recent_stash", {"limit": limit}))


def test_mark_used_replaces_context_and_is_idempotent_for_identical_arguments(tmp_path, monkeypatch):
    vault = tmp_path / "notes.sqlite"
    with sqlite3.connect(vault) as conn:
        conn.execute("CREATE TABLE note (id TEXT, path TEXT, status TEXT, used_where TEXT)")
        conn.execute("INSERT INTO note VALUES ('abc', 'note.md', 'unused', '')")
    monkeypatch.setattr(mcp_server, "_conn", lambda: sqlite3.connect(vault))

    def state():
        with sqlite3.connect(vault) as conn:
            return conn.execute("SELECT * FROM note").fetchall()

    arguments = {"note_id": "abc", "where": "picked langgraph"}
    result = asyncio.run(mcp_server.mcp.call_tool("mark_stash_used", arguments))
    assert result.structured_content == {"result": "Marked used: picked langgraph"}
    first = state()
    assert first == [("abc", "note.md", "used", "picked langgraph")]
    asyncio.run(mcp_server.mcp.call_tool("mark_stash_used", arguments))
    assert state() == first
    asyncio.run(mcp_server.mcp.call_tool("mark_stash_used", {**arguments, "where": "new context"}))
    assert state() == [("abc", "note.md", "used", "new context")]

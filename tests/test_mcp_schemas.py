"""Stdio MCP discovery metadata and SDK structured-result contract; no real vault."""
import asyncio

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

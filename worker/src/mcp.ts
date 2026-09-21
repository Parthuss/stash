/**
 * Remote MCP server, so Claude (web, mobile, desktop, Code) can search a user's
 * stash from anywhere. Plain JSON-RPC over POST — Streamable HTTP without the
 * streaming, which is all a request/response tool server needs.
 *
 * Endpoint: POST /mcp/<token>. The token rides in the path because claude.ai's
 * custom-connector form only takes a URL (or OAuth). That makes the URL a
 * secret: treat it like a password, and rotate by minting a new user.
 * ponytail: secret-URL auth; move to OAuth if connectors go beyond a pilot.
 */
import type { Env } from "./index";
import { ftsQuery, userFromToken } from "./v1";

const INSTRUCTIONS =
  "The user's own saved Instagram/TikTok/YouTube content, transcribed and indexed. " +
  "Search it at the start of technical work rather than waiting to be asked. " +
  "they save things intending to use them and forget they exist.";

const TOOLS = [
  {
    name: "search_stash",
    description:
      "Search the user's saved social-media posts. Use at the START of any agent-building, " +
      "automation, tooling, design or research task, before proposing an approach. Returns compact " +
      "hits; call get_stash_note(id) for the full note.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Topic words, tool names, or the problem." },
        status: { type: "string", description: '"unused" for things never acted on.' },
        limit: { type: "number", description: "Max results, default 5." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_stash_note",
    description: "Read one saved post in full (summary, next step, transcript, permalink).",
    inputSchema: {
      type: "object",
      properties: { note_id: { type: "string" } },
      required: ["note_id"],
    },
  },
  {
    name: "recent_stash",
    description: "What the user saved lately.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "list_stash_topics",
    description: "Topics present in the user's saves, with counts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mark_stash_used",
    description:
      "Mark a save as acted on. Call it when you actually used a note. It is the only signal " +
      "that separates a knowledge base from a graveyard.",
    inputSchema: {
      type: "object",
      properties: { note_id: { type: "string" } },
      required: ["note_id"],
    },
  },
];

const CLIP = 140;

function compact(rows: any[]): string {
  if (!rows.length) return "No matching saves.";
  const lines = rows.map((r) => {
    let summary = (r.summary ?? "").trim();
    if (summary.length > CLIP) summary = summary.slice(0, CLIP - 1).trimEnd() + "…";
    let tools = "none";
    try {
      const t = JSON.parse(r.tools ?? "[]");
      if (t.length) tools = t.join(", ");
    } catch {}
    return `- **${r.title}**: ${summary}\n  \`${r.id}\` · ${(r.created_at ?? "").slice(0, 10)} · ${r.topic} · ${r.status} · tools: ${tools}`;
  });
  lines.push("\n(call get_stash_note(id) for the full note)");
  return lines.join("\n");
}

const COLS = "n.id, n.title, n.summary, n.topic, n.tools, n.status, n.created_at";

async function callTool(env: Env, userId: string | null, name: string, a: any): Promise<string> {
  const limit = Math.min(Math.max(Number(a?.limit) || 5, 1), 20);
  switch (name) {
    case "search_stash": {
      const q = ftsQuery(String(a?.query ?? ""));
      if (!q) return "No matching saves.";
      const status = a?.status ? String(a.status) : null;
      const { results } = await env.DB.prepare(
        `SELECT ${COLS} FROM note_fts f JOIN note n ON n.id = f.note_id
         WHERE note_fts MATCH ? AND f.user_id = COALESCE(?, '') AND (? IS NULL OR n.status = ?)
         ORDER BY bm25(note_fts, 8.0, 3.0, 1.0) LIMIT ?`,
      ).bind(q, userId, status, status, limit).all();
      return compact(results ?? []);
    }
    case "get_stash_note": {
      const row = await env.DB.prepare("SELECT markdown FROM note WHERE id = ? AND user_id IS ?")
        .bind(String(a?.note_id ?? ""), userId).first<{ markdown: string }>();
      if (row) await env.DB.prepare("UPDATE note SET opens = opens + 1 WHERE id = ?").bind(String(a.note_id)).run();
      return row ? row.markdown : `No note matching ${JSON.stringify(a?.note_id)}.`;
    }
    case "recent_stash": {
      const { results } = await env.DB.prepare(
        `SELECT ${COLS} FROM note n WHERE n.user_id IS ? ORDER BY n.created_at DESC LIMIT ?`,
      ).bind(userId, limit).all();
      return compact(results ?? []);
    }
    case "list_stash_topics": {
      const { results } = await env.DB.prepare(
        "SELECT topic, COUNT(*) c FROM note WHERE user_id IS ? GROUP BY topic ORDER BY c DESC",
      ).bind(userId).all<{ topic: string; c: number }>();
      return (results ?? []).map((r) => `${r.topic}: ${r.c}`).join("\n") || "No saves yet.";
    }
    case "mark_stash_used": {
      const r = await env.DB.prepare(
        "UPDATE note SET status='used', used_at=? WHERE id=? AND user_id IS ?",
      ).bind(new Date().toISOString(), String(a?.note_id ?? ""), userId).run();
      return r.meta.changes ? "Marked as used." : `No note matching ${JSON.stringify(a?.note_id)}.`;
    }
  }
  throw new Error(`unknown tool ${name}`);
}

const rpc = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: "2.0", id, error: { code, message },
});

export async function handleMcp(request: Request, env: Env, path: string): Promise<Response> {
  const headers = { "content-type": "application/json" };
  const userId = await userFromToken(decodeURIComponent(path.slice("/mcp/".length)), env);
  if (userId === undefined) return new Response('{"error":"unauthorized"}', { status: 401, headers });
  // No server-initiated stream: tell clients that probe with GET to stop asking.
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const msg = (await request.json().catch(() => null)) as any;
  if (!msg || msg.jsonrpc !== "2.0") {
    return new Response(JSON.stringify(rpcError(null, -32600, "invalid request")), { status: 400, headers });
  }
  if (msg.id === undefined) return new Response(null, { status: 202 }); // notification

  let body: unknown;
  switch (msg.method) {
    case "initialize":
      body = rpc(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "stash", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      });
      break;
    case "ping":
      body = rpc(msg.id, {});
      break;
    case "tools/list":
      body = rpc(msg.id, { tools: TOOLS });
      break;
    case "tools/call":
      try {
        if (userId) await env.DB.prepare("UPDATE user SET mcp_calls = mcp_calls + 1, last_seen = ? WHERE id = ?").bind(new Date().toISOString(), userId).run();
        const text = await callTool(env, userId, msg.params?.name, msg.params?.arguments);
        body = rpc(msg.id, { content: [{ type: "text", text }] });
      } catch (e) {
        // Don't echo internals (SQL, stack text) back to whoever holds the link.
        body = rpc(msg.id, { content: [{ type: "text", text: "Something went wrong. Try again." }], isError: true });
      }
      break;
    default:
      body = rpcError(msg.id, -32601, `method not found: ${msg.method}`);
  }
  return new Response(JSON.stringify(body), { headers });
}

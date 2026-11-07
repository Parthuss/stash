/**
 * Remote MCP server, so Claude (web, mobile, desktop, Code) can search a user's
 * stash from anywhere. Plain JSON-RPC over POST — Streamable HTTP without the
 * streaming, which is all a request/response tool server needs.
 *
 * Endpoints (the caller resolves who it is, see index.ts):
 *   POST /mcp           OAuth bearer token (oauth.ts): ChatGPT, Claude, any MCP client
 *   POST /mcp/<token>   legacy secret URL, still works; the URL is a password
 */
import type { Env } from "./index";
import { listMentions, logEvent, searchNotes } from "./v1";

// The owner runs this inside coding agents; everyone else saves recipes, trips and books.
const OWNER_INSTRUCTIONS =
  "The user's own saved Instagram/YouTube/X content, transcribed and indexed. " +
  "Search it at the start of technical work rather than waiting to be asked. " +
  "they save things intending to use them and forget they exist.";
const INSTRUCTIONS =
  "Skwirl holds the reels and posts this person saved (Instagram, Facebook, YouTube, X), each turned " +
  "into a note: summary, next step, transcript, recipe ingredients and steps, and the books, movies, places " +
  "and products it names. Search it whenever they ask about something they saw or saved, or when planning " +
  "meals, trips, reading, workouts or purchases, before answering from general knowledge. Cite the note's " +
  "title and link. If they paste a reel or post link and want to keep it, use save_link.";

const TOOLS = [
  {
    name: "search_stash",
    description:
      "Search the user's saved social-media posts by keyword or by meaning (describe it loosely: " +
      "'that hotel room under the sea'). Use at the START of any agent-building, " +
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
    name: "list_stash_mentions",
    description:
      "Books, movies, shows, podcasts, places, or people named across every saved post, not just " +
      "one. Use for 'what books/movies have I saved', regardless of what those posts were mainly about.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", description: 'One of book, movie, show, podcast, place, product, person, other. Omit for all.' },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "save_link",
    description:
      "Save a reel or post link to the user's Skwirl (Instagram, Facebook, YouTube or X). " +
      "Skwirl turns it into a note in a few minutes. Use when the user shares a link and wants to keep it.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "The post's https link." }, note: { type: "string", description: "Optional reminder of why they saved it." } },
      required: ["url"],
    },
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

export type Save = (url: string, note?: string) => Promise<Response>;

async function callTool(env: Env, userId: string | null, name: string, a: any, save: Save): Promise<string> {
  const limit = Math.min(Math.max(Number(a?.limit) || 5, 1), 20);
  switch (name) {
    case "search_stash": {
      const raw = String(a?.query ?? "").trim().slice(0, 200);
      if (!raw) return "No matching saves.";
      return compact(await searchNotes(env, userId, raw, limit, a?.status ? String(a.status) : null));
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
    case "list_stash_mentions": {
      const kind = a?.kind ? String(a.kind) : null;
      const items = await listMentions(env, userId, kind, Math.min(Math.max(Number(a?.limit) || 50, 1), 200));
      if (!items.length) return kind ? `No ${kind} mentions found.` : "Nothing mentioned yet.";
      return items.map((m) =>
        `- **${m.name}** (${m.type}${m.done ? ", done" : ""}) — saved in "${m.note_title}"${m.count > 1 ? ` and ${m.count - 1} more` : ""} (\`${m.note_id}\`)`,
      ).join("\n");
    }
    case "save_link": {
      const res = await save(String(a?.url ?? ""), a?.note ? String(a.note) : undefined);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return body.error ?? "Couldn't save that link.";
      return res.status === 202 ? "Saved. The note will be ready in a few minutes." : "Already saved.";
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

export async function handleMcp(request: Request, env: Env, userId: string | null, save: Save): Promise<Response> {
  const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
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
        serverInfo: { name: "skwirl", title: "Skwirl", version: "0.2.0" },
        instructions: userId === null ? OWNER_INSTRUCTIONS : INSTRUCTIONS,
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
        await logEvent(env, userId, "api", "mcp:" + String(msg.params?.name ?? "?").slice(0, 40));
        const text = await callTool(env, userId, msg.params?.name, msg.params?.arguments, save);
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

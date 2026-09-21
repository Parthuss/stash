/**
 * Per-user API. Auth is `Authorization: Bearer <token>`; the token's SHA-256 is
 * looked up in `user`. Everything here is scoped to that user's rows — the
 * `user_id IS ?` filter is the whole tenancy boundary, so keep it on every query.
 *
 *   POST /v1/ingest        {url, note?}      save a link
 *   GET  /v1/status/:id                      has it finished?
 *   GET  /v1/notes         ?status=&topic=&limit=
 *   GET  /v1/notes/:id
 *   POST /v1/notes/:id/used
 *   GET  /v1/search        ?q=               FTS5 (hybrid/vector comes later)
 */
import type { Env } from "./index";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Who does this token belong to? A user id, `null` for the owner (STASH_SECRET
 * doubles as the owner's token, so the owner needs no second credential), or
 * `undefined` for nobody. Owner rows have user_id NULL, hence `IS ?` below.
 */
export async function userFromToken(token: string, env: Env): Promise<string | null | undefined> {
  if (!token) return undefined;
  if (env.STASH_SECRET && token.length === env.STASH_SECRET.length) {
    let diff = 0;
    for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ env.STASH_SECRET.charCodeAt(i);
    if (diff === 0) return null;
  }
  const row = await env.DB.prepare("SELECT id FROM user WHERE token_hash = ?")
    .bind(await sha256(token))
    .first<{ id: string }>();
  return row?.id;
}

export async function userFromBearer(request: Request, env: Env): Promise<string | null | undefined> {
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? userFromToken(header.slice(7), env) : undefined;
}

/** Mint a user + token. The token is shown once; only its hash is kept. */
export async function createUser(env: Env, name: string): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const token = "stk_" + [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("INSERT INTO user (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, name, await sha256(token), new Date().toISOString())
    .run();
  return { id, token };
}

/** FTS5 MATCH chokes on punctuation; quote each word so user text is never syntax. */
export function ftsQuery(raw: string): string {
  const words = raw.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return words.map((w) => `"${w}"`).join(" OR ");
}

const NOTE_COLUMNS = "id, title, summary, topic, tools, permalink, status, created_at, used_at";

export async function handleV1(
  request: Request,
  env: Env,
  path: string,
  userId: string | null,
  insertCapture: (
    env: Env,
    row: { source: string; permalink?: string | null; note?: string | null; user_id?: string | null },
  ) => Promise<{ id: string; created: boolean }>,
): Promise<Response> {
  const url = new URL(request.url);

  if (path === "/v1/ingest" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { url?: string; note?: string } | null;
    if (!body?.url) return json({ error: "need url" }, 400);
    const result = await insertCapture(env, {
      source: "app", permalink: body.url, note: body.note ?? null, user_id: userId,
    });
    return json(result, result.created ? 202 : 200);
  }

  if (path.startsWith("/v1/status/") && request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT status, attempts, error, title FROM capture WHERE id = ? AND user_id IS ?",
    ).bind(decodeURIComponent(path.slice("/v1/status/".length)), userId).first<any>();
    if (!row) return json({ error: "unknown id" }, 404);
    const dead = row.status === "pending" && row.attempts >= 3;
    return json({ status: dead ? "failed" : row.status, title: row.title, error: row.error });
  }

  if (path === "/v1/notes" && request.method === "GET") {
    const status = url.searchParams.get("status");
    const topic = url.searchParams.get("topic");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
    const { results } = await env.DB.prepare(
      `SELECT ${NOTE_COLUMNS} FROM note
       WHERE user_id IS ? AND (? IS NULL OR status = ?) AND (? IS NULL OR topic = ?)
       ORDER BY created_at DESC LIMIT ?`,
    ).bind(userId, status, status, topic, topic, limit).all();
    return json({ notes: results ?? [] });
  }

  if (path === "/v1/search" && request.method === "GET") {
    const q = ftsQuery(url.searchParams.get("q") ?? "");
    if (!q) return json({ notes: [] });
    const { results } = await env.DB.prepare(
      `SELECT n.id, n.title, n.summary, n.topic, n.tools, n.permalink, n.status, n.created_at
       FROM note_fts f JOIN note n ON n.id = f.note_id
       WHERE note_fts MATCH ? AND f.user_id = COALESCE(?, '')
       ORDER BY bm25(note_fts, 8.0, 3.0, 1.0) LIMIT 20`,
    ).bind(q, userId).all();
    return json({ notes: results ?? [] });
  }

  const noteMatch = path.match(/^\/v1\/notes\/([^/]+)(\/used)?$/);
  if (noteMatch) {
    const noteId = decodeURIComponent(noteMatch[1]);
    if (noteMatch[2] && request.method === "POST") {
      const r = await env.DB.prepare(
        "UPDATE note SET status='used', used_at=? WHERE id=? AND user_id IS ?",
      ).bind(new Date().toISOString(), noteId, userId).run();
      return r.meta.changes ? json({ ok: true }) : json({ error: "unknown id" }, 404);
    }
    if (!noteMatch[2] && request.method === "GET") {
      const row = await env.DB.prepare(
        `SELECT ${NOTE_COLUMNS}, markdown FROM note WHERE id = ? AND user_id IS ?`,
      ).bind(noteId, userId).first();
      return row ? json(row) : json({ error: "unknown id" }, 404);
    }
  }

  return json({ error: "not found" }, 404);
}

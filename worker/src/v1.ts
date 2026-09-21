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
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

// Only these sites are fetchable. The Mac/cloud runner downloads whatever URL a
// user submits, so an open URL field would let a guest aim it at the owner's
// home network (http://192.168.x.x, localhost, cloud metadata). Keep this list
// in sync with ALLOWED_HOSTS in stash/pipeline.py, which re-checks on the runner.
const ALLOWED_HOSTS = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "x.com", "twitter.com", "threads.net", "threads.com"];
export function allowedUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443") || raw.length > 500) return null;
  const h = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((d) => h === d || h.endsWith("." + d)) ? u.toString() : null;
}

/** Turn a raw worker error into something a person can act on. Never returns raw text. */
export function friendlyReason(error: string | null, failed: boolean): string {
  const e = (error ?? "").toLowerCase();
  if (!e) return failed ? "Something went wrong reading this one." : "Reading this now.";
  if (e.includes("429") || e.includes("rate limit") || e.includes("request too large") || e.includes("tokens per"))
    return failed ? "Stash was too busy to finish this. Retry it, or add your own Groq key in Set up." : "Stash is busy. It'll retry on its own.";
  if (e.includes("empty media") || e.includes("private") || e.includes("not accessible") || e.includes("login required") || e.includes("unavailable"))
    return "Instagram wouldn't let us read this one. It may be private or deleted.";
  if (e.includes("not a bot") || e.includes("sign in to confirm")) return "This site is blocking our downloads right now (YouTube does this a lot). Try again later.";
  if (e.includes("supported site")) return "That link isn't from a site Stash supports.";
  if (e.includes("connection") || e.includes("timed out") || e.includes("disconnected") || e.includes("broken pipe"))
    return failed ? "The connection dropped too many times. Retry it." : "The connection dropped. It'll retry on its own.";
  return failed ? "Something went wrong reading this one. Retry, or remove it." : "Working on it. Hit a snag, retrying.";
}

/** Append one row to the usage log. `userId` null = the owner. Never throws: logging must not break a request. */
export async function logEvent(
  env: Env, userId: string | null, kind: "api" | "groq", action: string,
  extra: { model?: string; key_type?: string; prompt?: number; completion?: number; seconds?: number; capture_id?: string } = {},
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO usage_event (at, user_id, kind, action, model, key_type, prompt_tokens, completion_tokens, seconds, capture_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(new Date().toISOString(), userId, kind, action, extra.model ?? null, extra.key_type ?? null,
           extra.prompt ?? 0, extra.completion ?? 0, extra.seconds ?? 0, extra.capture_id ?? null).run();
  } catch { /* usage table missing or full: keep serving */ }
}

/** Everything the owner needs to see who's using Stash and whether it's healthy. */
export async function adminOverview(env: Env) {
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { results: users } = await env.DB.prepare(
    `SELECT COALESCE(u.name, 'owner') AS name, u.id AS id, u.created_at, u.joined_via, u.last_seen,
       COALESCE(u.mcp_calls, 0) AS mcp_calls, (u.groq_key_enc IS NOT NULL) AS own_key,
       (SELECT COUNT(*) FROM capture c WHERE c.user_id IS u.id) AS saves,
       (SELECT COUNT(*) FROM capture c WHERE c.user_id IS u.id AND c.captured_at >= ?) AS saves_7d,
       (SELECT COUNT(*) FROM capture c WHERE c.user_id IS u.id AND c.status IN ('pending','claimed') AND c.attempts < 3) AS waiting,
       (SELECT COUNT(*) FROM capture c WHERE c.user_id IS u.id AND c.status = 'pending' AND c.attempts >= 3) AS failed,
       (SELECT COUNT(*) FROM note n WHERE n.user_id IS u.id) AS notes,
       (SELECT COUNT(*) FROM note n WHERE n.user_id IS u.id AND n.opens > 0) AS opened,
       (SELECT COUNT(*) FROM note n WHERE n.user_id IS u.id AND n.status = 'used') AS used,
       (SELECT MAX(captured_at) FROM capture c WHERE c.user_id IS u.id) AS last_save,
       (SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) FROM usage_event e WHERE e.user_id IS u.id AND e.kind = 'groq' AND e.at >= ?) AS groq_tokens_7d,
       (SELECT COUNT(*) FROM usage_event e WHERE e.user_id IS u.id AND e.kind = 'api' AND e.at >= ?) AS api_calls_7d,
       (SELECT MAX(at) FROM usage_event e WHERE e.user_id IS u.id AND e.kind = 'api') AS last_api
     FROM (SELECT id, name, created_at, joined_via, last_seen, mcp_calls, groq_key_enc FROM user
           UNION ALL SELECT NULL, NULL, NULL, NULL, NULL, 0, NULL) u
     ORDER BY u.created_at DESC`,
  ).bind(week, week, week).all();
  const o = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM user) AS users,
            (SELECT COUNT(*) FROM capture WHERE captured_at >= ?) AS saves_24h,
            (SELECT COUNT(*) FROM note WHERE created_at >= ?) AS notes_24h,
            (SELECT COUNT(*) FROM capture WHERE status IN ('pending','claimed') AND attempts < 3) AS waiting,
            (SELECT COUNT(*) FROM capture WHERE status = 'pending' AND attempts >= 3) AS failed,
            (SELECT MIN(captured_at) FROM capture WHERE status IN ('pending','claimed') AND attempts < 3) AS oldest_waiting,
            (SELECT MAX(created_at) FROM note) AS last_note,
            (SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) FROM usage_event WHERE kind = 'groq' AND key_type = 'shared' AND at >= ?) AS shared_tokens_24h,
            (SELECT COALESCE(SUM(seconds), 0) FROM usage_event WHERE kind = 'groq' AND action = 'whisper' AND at >= ?) AS whisper_sec_24h`,
  ).bind(day, day, day, day).first();
  const { results: recent } = await env.DB.prepare(
    `SELECT e.at, COALESCE(u.name, 'owner') AS name, e.kind, e.action, e.model, e.key_type,
            e.prompt_tokens + e.completion_tokens AS tokens, e.seconds
     FROM usage_event e LEFT JOIN user u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 40`,
  ).all();
  return { overview: o, users: users ?? [], recent: recent ?? [] };
}

/** Wipe a user and everything they saved. Used by self-delete and admin revoke. */
export async function deleteUser(env: Env, userId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM note_fts WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM note WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM capture WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM user WHERE id = ?").bind(userId),
  ]);
}

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

// ---- BYO Groq key: AES-GCM, key derived from STASH_SECRET ---------------------
async function aesKey(env: Env): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.STASH_SECRET + "|groq-key-v1"));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptKey(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), new TextEncoder().encode(plain)));
  return b64(iv) + "." + b64(ct);
}
export async function decryptKey(env: Env, enc: string): Promise<string> {
  const [iv, ct] = enc.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(env), unb64(ct));
  return new TextDecoder().decode(pt);
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
  if (userId) {
    await env.DB.prepare("UPDATE user SET last_seen = ? WHERE id = ? AND (last_seen IS NULL OR last_seen < ?)")
      .bind(new Date().toISOString(), userId, new Date(Date.now() - 300_000).toISOString()).run();
  }

  if (path === "/v1/admin/overview" && request.method === "GET") {
    if (userId !== null) return json({ error: "not found" }, 404);   // owner only, and don't confirm it exists
    return json(await adminOverview(env));
  }

  if (path === "/v1/ingest" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { url?: string; note?: string; source?: string } | null;
    if (!body?.url) return json({ error: "need url" }, 400);
    const safeUrl = allowedUrl(body.url);
    if (!safeUrl) return json({ error: "That link isn't supported. Stash takes Instagram, TikTok, YouTube, X and Threads links." }, 400);
    if (userId) {  // per-user brakes so one account can't flood the queue
      const q = await env.DB.prepare(
        `SELECT SUM(status IN ('pending','claimed')) AS waiting,
                SUM(captured_at > ?) AS today FROM capture WHERE user_id = ?`,
      ).bind(new Date(Date.now() - 86_400_000).toISOString(), userId).first<{ waiting: number | null; today: number | null }>();
      if ((q?.waiting ?? 0) >= 25) return json({ error: "You have 25 saves waiting. Let those finish first." }, 429);
      if ((q?.today ?? 0) >= 200) return json({ error: "That's 200 saves today. Try again tomorrow." }, 429);
    }
    // Which front door was used is what the setup checklist reads.
    const source = ["shortcut", "web", "pwa"].includes(body.source ?? "") ? body.source! : "app";
    await logEvent(env, userId, "api", "ingest");
    const result = await insertCapture(env, {
      source, permalink: safeUrl, note: (body.note ?? "").slice(0, 500) || null, user_id: userId,
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

  if (path === "/v1/token/rotate" && request.method === "POST") {
    if (userId === null) return json({ error: "The owner token is the STASH_SECRET. Rotate it with wrangler." }, 400);
    const token = "stk_" + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("UPDATE user SET token_hash = ? WHERE id = ?").bind(await sha256(token), userId).run();
    await logEvent(env, userId, "api", "token_reset");
    return json({ token });  // shown once; the old token and any connector link stop working now
  }

  if (path === "/v1/account" && request.method === "DELETE") {
    if (userId === null) return json({ error: "The owner account can't be deleted here." }, 400);
    const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
    if (body?.confirm !== "delete") return json({ error: 'Send {"confirm":"delete"} to delete everything.' }, 400);
    await deleteUser(env, userId);
    return json({ ok: true });
  }

  if (path === "/v1/captures" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, permalink, captured_at, status, attempts, error FROM capture
       WHERE user_id IS ? AND status != 'done' ORDER BY captured_at DESC LIMIT 50`,
    ).bind(userId).all<any>();
    return json({
      captures: (results ?? []).map((r) => {
        const failed = r.status === "pending" && r.attempts >= 3;
        return { id: r.id, url: r.permalink, at: r.captured_at, state: failed ? "failed" : "processing", reason: friendlyReason(r.error, failed) };
      }),
    });
  }

  const capMatch = path.match(/^\/v1\/captures\/([^/]+)(\/retry)?$/);
  if (capMatch) {
    const capId = decodeURIComponent(capMatch[1]);
    if (capMatch[2] && request.method === "POST") {
      const r = await env.DB.prepare(
        "UPDATE capture SET attempts = 0, error = NULL, status = 'pending' WHERE id = ? AND user_id IS ? AND status != 'done'",
      ).bind(capId, userId).run();
      return r.meta.changes ? json({ ok: true }) : json({ error: "unknown id" }, 404);
    }
    if (!capMatch[2] && request.method === "DELETE") {
      const r = await env.DB.prepare("DELETE FROM capture WHERE id = ? AND user_id IS ? AND status != 'done'").bind(capId, userId).run();
      return r.meta.changes ? json({ ok: true }) : json({ error: "unknown id" }, 404);
    }
  }

  if (path === "/v1/setup" && request.method === "GET") {
    const sources = await env.DB.prepare(
      "SELECT source, COUNT(*) n FROM capture WHERE user_id IS ? GROUP BY source",
    ).bind(userId).all<{ source: string; n: number }>();
    const counts = Object.fromEntries((sources.results ?? []).map((r) => [r.source, r.n]));
    const u = userId
      ? await env.DB.prepare("SELECT mcp_calls, groq_key_enc FROM user WHERE id = ?").bind(userId).first<any>()
      : null;
    return json({
      owner: userId === null,
      saved_from: counts,
      claude_connected: (u?.mcp_calls ?? 0) > 0,
      has_groq_key: Boolean(u?.groq_key_enc),
    });
  }

  if (path === "/v1/settings/groq") {
    if (userId === null) return json({ error: "the owner's key lives in the Mac's .env" }, 400);
    if (request.method === "DELETE") {
      await env.DB.prepare("UPDATE user SET groq_key_enc = NULL WHERE id = ?").bind(userId).run();
      return json({ ok: true });
    }
    if (request.method === "PUT") {
      const body = (await request.json().catch(() => null)) as { key?: string } | null;
      const key = (body?.key ?? "").trim();
      if (!/^gsk_[A-Za-z0-9]{20,}$/.test(key)) return json({ error: "That doesn't look like a Groq key (it starts with gsk_)." }, 400);
      // Prove it works now, so a typo fails here instead of silently at 3am.
      const check = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
      if (!check.ok) return json({ error: "Groq rejected that key. Copy it again from console.groq.com/keys." }, 400);
      await env.DB.prepare("UPDATE user SET groq_key_enc = ? WHERE id = ?").bind(await encryptKey(env, key), userId).run();
      await logEvent(env, userId, "api", "own_key_saved");
      return json({ ok: true });
    }
  }

  if (path === "/v1/export" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT ${NOTE_COLUMNS}, markdown FROM note WHERE user_id IS ? ORDER BY created_at`,
    ).bind(userId).all();
    return new Response(JSON.stringify({ exported_at: new Date().toISOString(), notes: results ?? [] }, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="stash-export.json"' },
    });
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
    await logEvent(env, userId, "api", "search");
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
      if (row) {
        await env.DB.prepare("UPDATE note SET opens = opens + 1 WHERE id = ?").bind(noteId).run();
        await logEvent(env, userId, "api", "open");
      }
      return row ? json(row) : json({ error: "unknown id" }, 404);
    }
  }

  return json({ error: "not found" }, 404);
}

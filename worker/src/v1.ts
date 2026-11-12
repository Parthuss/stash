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
 *   POST|DELETE /v1/notes/:id/share     public read-only link at /n/<share_id>
 *   GET  /v1/search        ?q=               FTS5 (hybrid/vector comes later)
 */
import { categoriesOf, setCategories, setNoteCategory } from "./categories";
import { analyticsOverview, journey } from "./analytics";
import { okEndpoint, sendPush, vapidPublic } from "./push";
import { notifyOwner } from "./notify";
import { cancelSubscription, isPlus, plusAvailable, plusRoute } from "./plus";
import type { Env } from "./index";
import { checkCode, codeEmail, emailEnabled, limited, newCode, normEmail, sendEmail } from "./login";
import { fuse, semanticIds } from "./embed";
import { ccKeyRoute } from "./recall";
import { telegramConnected, telegramLink, unlinkTelegram } from "./telegram";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-acorn": "2b0e7a35" },
  });

// Only these sites are fetchable. The Mac/cloud runner downloads whatever URL a
// user submits, so an open URL field would let a guest aim it at the owner's
// home network (http://192.168.x.x, localhost, cloud metadata). Keep this list
// in sync with ALLOWED_HOSTS in stash/pipeline.py, which re-checks on the runner.
const ALLOWED_HOSTS = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "x.com", "twitter.com", "facebook.com", "fb.watch"];
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
    return failed ? "Skwirl was too busy to finish this. Retry it, or add your own Groq key in Set up." : "Skwirl is busy. It'll retry on its own.";
  if (e.includes("empty media") || e.includes("private") || e.includes("not accessible") || e.includes("login required") || e.includes("unavailable"))
    return "Instagram wouldn't let us read this one. It may be private or deleted.";
  if (e.includes("not a bot") || e.includes("sign in to confirm")) return "This site is blocking our downloads right now (YouTube does this a lot). Try again later.";
  if (e.includes("supported site")) return "That link isn't from a site Skwirl supports.";
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
    `SELECT COALESCE(u.name, 'owner') AS name, u.id AS id, u.created_at, u.joined_via, u.last_seen, u.email,
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
       (SELECT MAX(at) FROM usage_event e WHERE e.user_id IS u.id AND e.kind = 'api') AS last_api,
       (SELECT group_concat(message, ' | ') FROM feedback f WHERE f.user_id IS u.id) AS feedback
     FROM (SELECT id, name, created_at, joined_via, last_seen, email, mcp_calls, groq_key_enc FROM user
           UNION ALL SELECT NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL) u
     ORDER BY u.created_at DESC`,
  ).bind(week, week, week).all();
  const o = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM user) AS users,
            (SELECT COUNT(*) FROM capture WHERE captured_at >= ?) AS saves_24h,
            (SELECT COUNT(*) FROM note WHERE created_at >= ?) AS notes_24h,
            (SELECT COUNT(*) FROM capture WHERE status IN ('pending','claimed') AND attempts < 3 AND source != 'import') AS waiting,
            (SELECT COUNT(*) FROM capture WHERE status = 'pending' AND attempts >= 3 AND source != 'import') AS failed,
            (SELECT MIN(captured_at) FROM capture WHERE status IN ('pending','claimed') AND attempts < 3 AND source != 'import') AS oldest_waiting,
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

export interface Mention {
  type: string; name: string; note_id: string; note_title: string; thumb_id: string | null;
  count: number; done: boolean;
}

export const mentionKey = (type: string, name: string) => `${type}:${name.trim().toLowerCase()}`;

/** Every book/movie/place/etc named across a user's notes, flattened out of the
 * per-note `mentions` JSON column and deduped by type+name (the same book saved
 * from three reels is one list item, "in 3 posts"). Newest first. Shared by the
 * REST endpoint and the MCP tool so both surfaces agree. */
export async function listMentions(env: Env, userId: string | null, kind: string | null, limit: number): Promise<Mention[]> {
  const [{ results }, doneRows] = await Promise.all([
    env.DB.prepare(
      "SELECT id, title, mentions, thumb_id FROM note WHERE user_id IS ? AND mentions NOT IN ('', '[]') ORDER BY created_at DESC",
    ).bind(userId).all<{ id: string; title: string; mentions: string; thumb_id: string | null }>(),
    env.DB.prepare("SELECT mkey FROM mention_done WHERE owner_key = ?").bind(userId ?? "").all<{ mkey: string }>(),
  ]);
  const done = new Set((doneRows.results ?? []).map((r) => r.mkey));
  const byKey = new Map<string, Mention>();
  for (const row of results ?? []) {
    let items: any[];
    try { items = JSON.parse(row.mentions); } catch { continue; }
    for (const m of items) {
      const name = typeof m === "string" ? m : m?.name;
      const type = (typeof m === "object" && m?.type) || "other";
      if (!name || !String(name).trim() || (kind && type !== kind)) continue;
      const key = mentionKey(type, String(name));
      const seen = byKey.get(key);
      if (seen) { seen.count += 1; continue; }
      byKey.set(key, { type, name: String(name).trim(), note_id: row.id, note_title: row.title, thumb_id: row.thumb_id, count: 1, done: done.has(key) });
    }
  }
  return [...byKey.values()].slice(0, limit);
}

/** Wipe a user and everything they saved. Used by self-delete and admin revoke. */
export async function deleteUser(env: Env, userId: string, origin: string): Promise<void> {
  // Covers sit in the edge cache (see /t/ in index.ts); drop them there too. Best effort: this
  // clears this data centre, and the edge copy elsewhere expires within a day.
  const thumbs = await env.DB.prepare("SELECT id FROM thumb WHERE note_id IN (SELECT id FROM note WHERE user_id = ?)").bind(userId).all<{ id: string }>();
  const cache = (caches as any).default as Cache;
  await Promise.all((thumbs.results ?? []).map((t) => cache.delete(`${origin}/t/${t.id}`).catch(() => false)));
  // Stop billing before the row (and with it the subscription id) is gone.
  const sub = (await env.DB.prepare("SELECT dodo_subscription_id s FROM user WHERE id = ?").bind(userId).first<{ s: string | null }>())?.s;
  if (sub) await cancelSubscription(env, sub).catch((e) => notifyOwner(env, "Account deleted: cancel failed", `Couldn't cancel subscription ${sub} (${e}). Cancel it in Dodo.`));
  await env.DB.batch([
    // Analytics: this person's visits and everything tracked in them, including the anonymous visits
    // from the same device(s) before they signed up (privacy page: activity history is erased).
    env.DB.prepare("DELETE FROM ui_event WHERE visit_id IN (SELECT id FROM visit WHERE visitor IN (SELECT visitor FROM visit WHERE user_id = ?))").bind(userId),
    env.DB.prepare("DELETE FROM visit WHERE visitor IN (SELECT visitor FROM visit WHERE user_id = ?)").bind(userId),
    env.DB.prepare("DELETE FROM visit WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM waitlist WHERE user_id = ? OR (email IS NOT NULL AND email = (SELECT email FROM user WHERE id = ?))").bind(userId, userId),
    env.DB.prepare("DELETE FROM scheduled_push WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM note_category WHERE note_id IN (SELECT id FROM note WHERE user_id = ?)").bind(userId),
    env.DB.prepare("DELETE FROM category WHERE owner_key = ?").bind(userId),
    env.DB.prepare("DELETE FROM category_set WHERE owner_key = ?").bind(userId),
    env.DB.prepare("DELETE FROM mention_done WHERE owner_key = ?").bind(userId),
    env.DB.prepare("DELETE FROM usage_event WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM feedback WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM push_sub WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM device_token WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM cc_key WHERE user_key = ?").bind(userId),
    env.DB.prepare("DELETE FROM login_code WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM email_code WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM thumb WHERE note_id IN (SELECT id FROM note WHERE user_id = ?)").bind(userId),
    env.DB.prepare("DELETE FROM note_fts WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM note_vec WHERE user_key = ?").bind(userId),
    env.DB.prepare("DELETE FROM note WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM capture WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM oauth_token WHERE user_key = ?").bind(userId),
    env.DB.prepare("DELETE FROM oauth_code WHERE user_key = ?").bind(userId),
    env.DB.prepare("DELETE FROM telegram_chat WHERE user_key = ?").bind(userId),
    env.DB.prepare("DELETE FROM telegram_link WHERE user_key = ?").bind(userId),
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
  const hash = await sha256(token);
  const row = await env.DB.prepare("SELECT id FROM user WHERE token_hash = ?1 UNION ALL SELECT user_id FROM device_token WHERE token_hash = ?1 LIMIT 1")
    .bind(hash)
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

/**
 * Keyword (FTS5/bm25) and meaning (embeddings) search, fused by rank. Keyword alone misses
 * "that hotel room under the sea" when the note says "underwater suite"; meaning alone misses
 * exact names. Status filters after fusion.
 */
export async function searchNotes(env: Env, userId: string | null, raw: string, limit: number, status: string | null = null): Promise<any[]> {
  const keyword = async (q: string) => q ? ((await env.DB.prepare(
    `SELECT n.id FROM note_fts f JOIN note n ON n.id = f.note_id
     WHERE note_fts MATCH ? AND f.user_id = COALESCE(?, '') ORDER BY bm25(note_fts, 8.0, 3.0, 1.0) LIMIT 30`,
  ).bind(q, userId).all<{ id: string }>()).results ?? []).map((r) => r.id) : [];
  // Every word must match; "any word" is only a last resort when nothing else turned up.
  const [all, sem] = await Promise.all([keyword(ftsQuery(raw, " AND ")), semanticIds(env, userId, raw).catch(() => [] as string[])]);
  const fts = all.length || sem.length ? all : await keyword(ftsQuery(raw));
  const ids = fuse([fts, sem]).slice(0, 40);
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.title, n.summary, n.topic, n.tools, n.permalink, n.status, n.created_at, n.thumb_id, ${CATS("n")} FROM note n
     WHERE n.id IN (${ids.map(() => "?").join(",")}) AND n.user_id IS ? AND (? IS NULL OR n.status = ?)`,
  ).bind(...ids, userId, status, status).all<any>();
  const order = new Map(ids.map((id, i) => [id, i]));
  return (results ?? []).sort((a, b) => order.get(a.id)! - order.get(b.id)!).slice(0, limit);
}

/** FTS5 MATCH chokes on punctuation; quote each word so user text is never syntax. Filler words are
 *  dropped so "how to fix a car" doesn't match every note containing "to". */
const STOP = new Set("a an and are as at be but by can do for from had has have how i if in into is it its me my of on or our so that the their them then there these they this to up was we were what when where which who why will with you your about any some just like want saved save".split(" "));
export function ftsQuery(raw: string, joiner = " OR "): string {
  const words = (raw.match(/[\p{L}\p{N}_]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()));
  return words.map((w) => `"${w}"`).join(joiner);
}

const MSG_NEXT = "\n%%next\n";
export const DAILY_SHARED = 30, DAILY_OWN_KEY = 200;
// Old saves from an Instagram export: how many one person can queue, by key type.
export const IMPORT_SHARED = 100, IMPORT_OWN_KEY = 1000;
// Tiers (11 Nov 2026). Free: FREE_MONTHLY new saves a month, FREE_IMPORT old saves once, no own Groq key,
// no own categories. Plus: up to PLUS_IMPORT old saves, categories, its 250 a month read first.
// Accounts made before TIERS_FROM ("early") keep the old free rules: 30 a day, own key, categories.
export const TIERS_FROM = "2026-11-11T12:00:00.000Z";
export const FREE_MONTHLY = 10, FREE_IMPORT = 25, PLUS_IMPORT = 2000;
type Tier = "owner" | "plus" | "early" | "free";
const tierOf = (u: { plan?: string | null; plan_until?: string | null; created_at?: string | null } | null, userId: string | null): Tier =>
  userId === null ? "owner" : isPlus(u) ? "plus" : (u?.created_at ?? "") < TIERS_FROM ? "early" : "free";
const userTier = async (env: Env, userId: string | null) => userId === null ? { tier: "owner" as Tier, u: null } : await env.DB
  .prepare("SELECT plan, plan_until, created_at, groq_key_enc FROM user WHERE id = ?").bind(userId).first<any>()
  .then((u) => ({ tier: tierOf(u, userId), u }));
const monthStart = () => new Date().toISOString().slice(0, 7) + "-01";
// ponytail: counts this month's live saves still in the table, so deleting one frees a slot. Fine at 10.
const freeUsed = async (env: Env, userId: string) => (await env.DB
  .prepare("SELECT COUNT(*) n FROM capture WHERE user_id = ? AND source != 'import' AND captured_at >= ?")
  .bind(userId, monthStart()).first<{ n: number }>())?.n ?? 0;
const PLUS_PITCH = "Skwirl Plus reads up to 250 a month, first in line.";
const POST_URL = /^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[\w-]+\/?$/i;
const CATS = (t: string) => `(SELECT json_group_array(name) FROM note_category nc WHERE nc.note_id = ${t}.id AND nc.state = 1) AS categories`;
const NOTE_COLUMNS = "id, title, summary, topic, tools, permalink, status, created_at, used_at, thumb_id, share_id, " + CATS("note");

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

  if (path.startsWith("/v1/plus/")) {
    const res = await plusRoute(request, env, path, userId);
    if (res) return res;
  }

  if (path === "/v1/admin/analytics" && request.method === "GET") {
    if (userId !== null) return json({ error: "not found" }, 404);
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 180);
    return json(await analyticsOverview(env, days));
  }
  if (path === "/v1/admin/journey" && request.method === "GET") {
    if (userId !== null) return json({ error: "not found" }, 404);
    return json(await journey(env, url.searchParams.get("user"), url.searchParams.get("visitor")));
  }
  if (path === "/v1/admin/overview" && request.method === "GET") {
    if (userId !== null) return json({ error: "not found" }, 404);   // owner only, and don't confirm it exists
    return json(await adminOverview(env));
  }

  if (path === "/v1/ingest" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { url?: string; note?: string; source?: string } | null;
    if (typeof body?.url !== "string" || [body.note, body.source].some((v) => v != null && typeof v !== "string"))
      return json({ error: "URL, note and source must be text." }, 400);
    if (!body?.url) return json({ error: "need url" }, 400);
    const safeUrl = allowedUrl(body.url);
    if (!safeUrl) return json({ error: "That link isn't supported. Skwirl takes Instagram, Facebook, YouTube and X links." }, 400);
    if (userId) {  // per-user brakes so one account can't flood the queue
      const { tier, u } = await userTier(env, userId);
      const q = await env.DB.prepare(
        `SELECT SUM(status IN ('pending','claimed') AND source != 'import') AS waiting,
                SUM(captured_at > ? AND source != 'import') AS today,
                SUM(captured_at >= ? AND source != 'import') AS month
         FROM capture WHERE user_id = ?`,
      ).bind(new Date(Date.now() - 86_400_000).toISOString(), monthStart(), userId)
        .first<{ waiting: number | null; today: number | null; month: number | null }>()
        .then((r) => ({ ...r, own_key: tier === "plus" || !!u?.groq_key_enc }));
      if (tier === "free" && (q?.month ?? 0) >= FREE_MONTHLY)
        return json({ error: `That's your ${FREE_MONTHLY} free saves for this month. ${PLUS_PITCH}`, plus: true }, 402);
      // The shared Groq key is everyone's, so people on it get a smaller daily slice.
      const daily = q?.own_key ? DAILY_OWN_KEY : DAILY_SHARED;
      if ((q?.waiting ?? 0) >= 25) return json({ error: "You have 25 saves waiting. Let those finish first." }, 429);
      if ((q?.today ?? 0) >= daily) return json({ error: q?.own_key
        ? `That's ${daily} saves today. Try again tomorrow.`
        : `That's ${daily} saves today on the shared AI allowance. Add your own free Groq key in Set up for up to ${DAILY_OWN_KEY} a day.` }, 429);
    }
    // Which front door was used is what the setup checklist reads.
    const source = ["shortcut", "web", "pwa", "mcp", "telegram"].includes(body.source ?? "") ? body.source! : "app";
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

  if (path === "/v1/cc-key") {
    if (userId === null) return json({ error: "The owner uses the STASH_SECRET or the local recall hook." }, 400);
    return ccKeyRoute(env, userId, request.method);
  }

  if (path === "/v1/token/rotate" && request.method === "POST") {
    if (userId === null) return json({ error: "The owner token is the STASH_SECRET. Rotate it with wrangler." }, 400);
    const token = "stk_" + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.batch([
      env.DB.prepare("UPDATE user SET token_hash = ? WHERE id = ?").bind(await sha256(token), userId),
      env.DB.prepare("DELETE FROM oauth_token WHERE user_key = ?").bind(userId),  // connected AI apps too
      env.DB.prepare("DELETE FROM telegram_chat WHERE user_key = ?").bind(userId),  // and Telegram
      env.DB.prepare("DELETE FROM device_token WHERE user_id = ?").bind(userId),  // and recovered devices
      env.DB.prepare("DELETE FROM cc_key WHERE user_key = ?").bind(userId),  // and the Claude Code plugin
      // and every grant still waiting to be redeemed, or it would mint a fresh credential after the
      // reset (an AI-app code, a Telegram connect link, an emailed sign-in link). Audit S02.
      env.DB.prepare("DELETE FROM oauth_code WHERE user_key = ?").bind(userId),
      env.DB.prepare("DELETE FROM telegram_link WHERE user_key = ?").bind(userId),
      env.DB.prepare("DELETE FROM login_code WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM email_code WHERE user_id = ?").bind(userId),
    ]);
    await logEvent(env, userId, "api", "token_reset");
    return json({ token });  // shown once; the old token and any connector link stop working now
  }

  if (path === "/v1/account" && request.method === "DELETE") {
    if (userId === null) return json({ error: "The owner account can't be deleted here." }, 400);
    const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
    if (body?.confirm !== "delete") return json({ error: 'Send {"confirm":"delete"} to delete everything.' }, 400);
    await deleteUser(env, userId, new URL(request.url).origin);
    return json({ ok: true });
  }

  // Bulk-queue old Instagram saves (the app reads the export file on the device; only links arrive).
  // They wait behind everyone's live saves and are drip-processed (see /claim), so no daily cap here.
  if (path === "/v1/import" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { urls?: unknown } | null;
    if (!Array.isArray(body?.urls)) return json({ error: "need urls" }, 400);
    const urls = [...new Set(body!.urls.filter((u): u is string => typeof u === "string").map((u) => u.trim().replace(/^http:/, "https:")).filter((u) => POST_URL.test(u)))];
    if (!urls.length) return json({ error: "No Instagram posts found in that file." }, 400);
    const have = await env.DB.prepare("SELECT COUNT(*) AS n FROM capture WHERE user_id IS ? AND source = 'import'")
      .bind(userId).first<{ n: number }>();
    const { tier, u } = await userTier(env, userId);
    const cap = tier === "owner" ? 100_000 : tier === "plus" ? PLUS_IMPORT : tier === "free" ? FREE_IMPORT : u?.groq_key_enc ? IMPORT_OWN_KEY : IMPORT_SHARED;
    const room = Math.max(0, cap - (have?.n ?? 0));
    // Existing saves must not consume the admission slice on repeated exports. One query for all of
    // this person's links (bounded by their import cap plus live saves), not one per 50 export links:
    // a big export would otherwise exceed D1's per-request query limit on the free plan.
    const { results: mine } = await env.DB.prepare("SELECT permalink FROM capture WHERE user_id IS ? AND permalink IS NOT NULL")
      .bind(userId).all<{ permalink: string }>();
    const existing = new Set((mine ?? []).map((r) => r.permalink));
    const missing = urls.filter((u) => !existing.has(u));
    const take = missing.slice(0, room);  // the export lists newest first
    const now = new Date().toISOString();
    let added = 0;
    for (let i = 0; i < take.length; i += 50) {
      const res = await env.DB.batch(take.slice(i, i + 50).map((u) => env.DB.prepare(
        `INSERT OR IGNORE INTO capture (id, source, permalink, permalink_ok, status, attempts, captured_at, user_id)
         VALUES (?, 'import', ?, 1, 'pending', 0, ?, ?)`,
      ).bind(crypto.randomUUID().replace(/-/g, "").slice(0, 16), u, now, userId)));
      added += res.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
    }
    await logEvent(env, userId, "api", "import");
    if (added) await env.DB.prepare("DELETE FROM alert_state WHERE key = 'imports_idle'").run();  // start on it now
    return json({ found: urls.length, added, skipped_over_cap: missing.length - take.length, cap, plus: tier === "free" });
  }

  if (path === "/v1/captures" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, permalink, captured_at, status, attempts, error FROM capture
       WHERE user_id IS ? AND status != 'done' AND source != 'import' ORDER BY captured_at DESC LIMIT 50`,
    ).bind(userId).all<any>();
    const imp = await env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(status = 'done') AS done, SUM(status != 'done' AND attempts >= 3) AS failed
       FROM capture WHERE user_id IS ? AND source = 'import'`,
    ).bind(userId).first<{ total: number; done: number | null; failed: number | null }>();
    const quota = imp?.total ? await env.DB.prepare("SELECT at FROM alert_state WHERE key = ? AND at > ?")
      .bind("quota:" + (userId ?? "owner"), new Date().toISOString()).first<{ at: string }>() : null;
    return json({
      import: imp?.total ? { total: imp.total, done: imp.done ?? 0, failed: imp.failed ?? 0, resumes_at: quota?.at ?? null } : null,
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

  if (path === "/v1/mentions" && request.method === "GET") {
    const kind = url.searchParams.get("type");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 200) || 200, 1), 500);
    return json({ mentions: await listMentions(env, userId, kind, limit) });
  }

  if (path === "/v1/mentions/done" && request.method === "POST") {
    const b = (await request.json().catch(() => null)) as { type?: string; name?: string; done?: boolean } | null;
    if (!b?.type || !b?.name) return json({ error: "need type and name" }, 400);
    const key = mentionKey(String(b.type).slice(0, 20), String(b.name).slice(0, 200));
    if (b.done === false) {
      await env.DB.prepare("DELETE FROM mention_done WHERE owner_key = ? AND mkey = ?").bind(userId ?? "", key).run();
    } else {
      await env.DB.prepare("INSERT INTO mention_done (owner_key, mkey, at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
        .bind(userId ?? "", key, new Date().toISOString()).run();
    }
    return json({ ok: true });
  }

  if (path === "/v1/owner-msg/seen" && request.method === "POST") {
    // Messages can be queued: "first\n%%next\nsecond" shows the second once the first is tapped.
    if (userId) await env.DB.prepare(
      "UPDATE user SET owner_msg = CASE WHEN instr(owner_msg, ?1) > 0 THEN substr(owner_msg, instr(owner_msg, ?1) + length(?1)) END WHERE id = ?2",
    ).bind(MSG_NEXT, userId).run();
    return json({ ok: true });
  }

  if (path === "/v1/setup" && request.method === "GET") {
    const sources = await env.DB.prepare(
      "SELECT source, COUNT(*) n FROM capture WHERE user_id IS ? GROUP BY source",
    ).bind(userId).all<{ source: string; n: number }>();
    const counts = Object.fromEntries((sources.results ?? []).map((r) => [r.source, r.n]));
    const u = userId
      ? await env.DB.prepare("SELECT name, mcp_calls, groq_key_enc, email, email_verified, email_skip_at, found_via, owner_msg, plan, plan_until, created_at FROM user WHERE id = ?").bind(userId).first<any>()
      : null;
    const plus = isPlus(u), tier = tierOf(u, userId);
    // Past the 250 fast-lane saves in a month the app says so; everything still gets read.
    const fast = plus ? (await env.DB.prepare("SELECT n FROM daily_counter WHERE key = ?")
      .bind(`pm:${userId}:${new Date().toISOString().slice(0, 7)}`).first<{ n: number }>())?.n ?? 0 : 0;
    return json({
      plan: plus ? "plus" : "free",
      plan_until: plus ? u.plan_until : null,
      plus_available: plusAvailable(env, userId),
      plus_over_cap: fast >= 250,
      tier,
      free_limit: FREE_MONTHLY,
      free_left: tier === "free" ? Math.max(0, FREE_MONTHLY - await freeUsed(env, userId!)) : null,
      import_cap: tier === "owner" ? null : tier === "plus" ? PLUS_IMPORT : tier === "free" ? FREE_IMPORT : u?.groq_key_enc ? IMPORT_OWN_KEY : IMPORT_SHARED,
      owner: userId === null,
      saved_from: counts,
      claude_connected: (u?.mcp_calls ?? 0) > 0,
      has_groq_key: Boolean(u?.groq_key_enc),
      has_email: Boolean(u?.email),
      email_verified: Boolean(u?.email_verified),
      // Accounts from before email was required: ask once with a "Not now", then without one.
      email_ask: userId && !u?.email ? (u?.email_skip_at ? "required" : "skippable") : null,
      email_login: emailEnabled(env),
      name: u?.name ?? (userId === null ? env.OWNER_NAME ?? "Owner" : null),
      push_key: vapidPublic(env),
      asked_source: Boolean(u?.found_via) || userId === null,
      owner_msg: u?.owner_msg ? u.owner_msg.split(MSG_NEXT)[0] : null,
      categories: (await categoriesOf(env, userId)).names,
      telegram: env.TELEGRAM_BOT_TOKEN ? { connected: await telegramConnected(env, userId) } : null,
    });
  }

  if (path === "/v1/feedback" && request.method === "POST") {
    if (userId === null) return json({ error: "you're the owner" }, 400);
    const body = (await request.json().catch(() => null)) as { message?: string; email?: string; consent?: boolean } | null;
    if ([body?.message, body?.email].some((v) => v != null && typeof v !== "string") || (body?.consent != null && typeof body.consent !== "boolean"))
      return json({ error: "Message and email must be text, and consent must be true or false." }, 400);
    const message = (body?.message ?? "").trim().slice(0, 4000);
    const email = (body?.email ?? "").trim() ? normEmail(body?.email) : "";
    if (email === null) return json({ error: "That email doesn't look right." }, 400);
    if (!message && !email) return json({ error: "Write something or leave an email." }, 400);
    if (email && !body?.consent) return json({ error: "Tick the box so we're allowed to email you." }, 400);
    // Sign-up is open, so one account (or many) could flood the owner's inbox: 5 messages per
    // account per day, and at most 20 owner emails a day across everyone (the rest still saved). S07
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const sent = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM feedback WHERE user_id = ? AND at > ?) AS mine, (SELECT COUNT(*) FROM feedback WHERE at > ?) AS everyone",
    ).bind(userId, dayAgo, dayAgo).first<{ mine: number; everyone: number }>();
    if (message && (sent?.mine ?? 0) >= 5) return json({ error: "That's a lot of messages for one day. Try again tomorrow." }, 429);
    // The reply address stays with the message: the sign-in email only changes through a code.
    await env.DB.prepare("INSERT INTO feedback (user_id, at, message, reply_to) VALUES (?, ?, ?, ?)").bind(userId, new Date().toISOString(), message, email || null).run();
    if (message && (sent?.everyone ?? 0) < 20) {
      const who = await env.DB.prepare("SELECT name, email FROM user WHERE id = ?").bind(userId).first<{ name: string; email: string | null }>();
      await notifyOwner(env, `message from ${who?.name ?? "someone"}`, `${who?.name ?? "Someone"}${email || who?.email ? ` (${email || who?.email}, reply to them there)` : " (no email on file)"} wrote:\n\n${message}`);
    }
    return json({ ok: true });
  }

  // Notifications on this device: store the browser's push subscription, then say hello so the
  // person sees it worked (and we learn right away if their push service refuses us).
  // Profile: who you are here, a few numbers, and editing your name and email.
  if (path === "/v1/me" && request.method === "GET") {
    const counts = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM capture WHERE user_id IS ?1) saves, (SELECT COUNT(*) FROM note WHERE user_id IS ?1) notes,
              (SELECT COUNT(*) FROM note WHERE user_id IS ?1 AND status = 'used') used`,
    ).bind(userId).first<any>();
    const u = userId ? await env.DB.prepare("SELECT name, email, created_at FROM user WHERE id = ?").bind(userId).first<any>() : null;
    return json({ owner: userId === null, name: u?.name ?? env.OWNER_NAME ?? "Owner", email: u?.email ?? null, joined: u?.created_at ?? null, ...counts });
  }
  if (path === "/v1/me" && request.method === "PUT") {
    if (userId === null) return json({ error: "The owner account has no profile to edit." }, 400);
    const b = (await request.json().catch(() => null)) as { name?: string; email?: string; consent?: boolean } | null;
    const name = String(b?.name ?? "").trim().slice(0, 40);
    if (!name) return json({ error: "Your name can't be empty." }, 400);
    const had = await env.DB.prepare("SELECT email FROM user WHERE id = ?").bind(userId).first<{ email: string | null }>();
    const raw = String(b?.email ?? "").trim(), email = raw ? normEmail(raw) : null;
    if (raw && !email) return json({ error: "That email doesn't look right." }, 400);
    // Your email is how you sign in, so it can't be blanked, and a new one changes through a code.
    if (!email && had?.email) return json({ error: "Your email is how you sign in, so it can't be empty." }, 400);
    await env.DB.prepare("UPDATE user SET name = ? WHERE id = ?").bind(name, userId).run();
    await logEvent(env, userId, "api", "profile_saved");
    if (email && email !== had?.email) {
      const r = await emailChange(env, userId, email);
      return r.status === 200 ? json({ ok: true, ...(await r.json() as object) }) : r;
    }
    return json({ ok: true });
  }

  // Add or change your sign-in email. With email sign-in on, we email a code and the address is
  // saved once it comes back (/v1/email/verify); without a sender it's saved straight away.
  if (path === "/v1/email/start" && request.method === "POST") {
    if (userId === null) return json({ error: "The owner account signs in with its secret." }, 400);
    const email = normEmail(((await request.json().catch(() => null)) as any)?.email);
    if (!email) return json({ error: "That email doesn't look right." }, 400);
    return emailChange(env, userId, email);
  }
  if (path === "/v1/email/verify" && request.method === "POST") {
    if (userId === null) return json({ error: "The owner account signs in with its secret." }, 400);
    const b = ((await request.json().catch(() => null)) ?? {}) as any;
    const email = normEmail(b.email);
    if (!email) return json({ error: "That email doesn't look right." }, 400);
    if (await limited(env, "otpvu:" + userId, 20, 3600_000)) return json({ error: "Too many codes tried. Wait an hour." }, 429);
    if (await takenByOther(env, email, userId)) return json({ error: "That email is already on another Skwirl account. Sign out and sign in with it instead." }, 409);
    const spent = await checkCode(env, email, "add", b.code, true, userId);
    if (!spent.ok) return json({ error: spent.error, left: spent.left }, 400);
    const saved = await env.DB.prepare("UPDATE user SET email = ?, email_verified = 1 WHERE id = ?").bind(email, userId).run().catch(() => null);
    if (!saved) return json({ error: "That email is already on another Skwirl account. Sign out and sign in with it instead." }, 409);
    await logEvent(env, userId, "api", "email_added");
    return json({ ok: true, email });
  }
  if (path === "/v1/email/skip" && request.method === "POST") {
    if (userId) await env.DB.prepare("UPDATE user SET email_skip_at = COALESCE(email_skip_at, ?) WHERE id = ?").bind(new Date().toISOString(), userId).run();
    return json({ ok: true });
  }
  if (path === "/v1/source" && request.method === "POST") {
    if (userId === null) return json({ ok: true });
    const b = (await request.json().catch(() => null)) as { source?: string; other?: string } | null;
    const source = String(b?.source ?? "").slice(0, 30), other = String(b?.other ?? "").trim().slice(0, 80);
    if (!/^[a-z_]{2,30}$/.test(source)) return json({ error: "Pick one." }, 400);
    await env.DB.prepare("UPDATE user SET found_via = ? WHERE id = ?").bind(other ? `${source}: ${other}` : source, userId).run();
    return json({ ok: true });
  }
  if (path === "/v1/push" && request.method === "POST") {
    const b = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
    const endpoint = String(b?.endpoint ?? ""), p256dh = String(b?.keys?.p256dh ?? ""), auth = String(b?.keys?.auth ?? "");
    if (!okEndpoint(endpoint) || !/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,30}$/.test(auth)) return json({ error: "That subscription doesn't look right." }, 400);
    await env.DB.prepare(
      `INSERT INTO push_sub (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    ).bind(endpoint, userId, p256dh, auth, new Date().toISOString()).run();
    await logEvent(env, userId, "api", "push_on");
    const status = await sendPush(env, { endpoint, p256dh, auth }, { title: "Skwirl", body: "You're all set. We'll tell you when more of your saves are ready (once a day at most).", url: "/", tag: "hello" }).catch(() => 0);
    return json({ ok: true, test: status });
  }
  if (path === "/v1/push" && request.method === "DELETE") {
    const b = (await request.json().catch(() => null)) as { endpoint?: string } | null;
    await env.DB.prepare("DELETE FROM push_sub WHERE endpoint = ? AND user_id IS ?").bind(String(b?.endpoint ?? ""), userId).run();
    return json({ ok: true });
  }

  if (path === "/v1/telegram/link" && request.method === "POST") {
    const link = await telegramLink(env, userId);
    return link ? json({ url: link }) : json({ error: "Telegram isn't set up on this Skwirl." }, 404);
  }
  if (path === "/v1/telegram" && request.method === "DELETE") {
    await unlinkTelegram(env, userId);
    return json({ ok: true });
  }

  if (path === "/v1/settings/groq") {
    if (userId === null) return json({ error: "the owner's key lives in the Mac's .env" }, 400);
    if (request.method === "DELETE") {
      await env.DB.prepare("UPDATE user SET groq_key_enc = NULL WHERE id = ?").bind(userId).run();
      return json({ ok: true });
    }
    if (request.method === "PUT") {
      if ((await userTier(env, userId)).tier !== "early")
        return json({ error: "Skwirl reads your saves for you, so there's no key to add. Saving a lot? Skwirl Plus reads up to 250 a month, first in line.", plus: true }, 403);
      const body = (await request.json().catch(() => null)) as { key?: string } | null;
      const key = (body?.key ?? "").trim();
      if (!/^gsk_[A-Za-z0-9]{20,}$/.test(key)) return json({ error: "That doesn't look like a Groq key (it starts with gsk_)." }, 400);
      // Prove it works now, so a typo fails here instead of silently at 3am.
      const check = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
      if (!check.ok) return json({ error: "Groq rejected that key. Copy it again from console.groq.com/keys." }, 400);
      // A new working key: the old key's daily-limit pause no longer applies, and saves parked by it
      // can go now (audit B08).
      await env.DB.batch([
        env.DB.prepare("UPDATE user SET groq_key_enc = ? WHERE id = ?").bind(await encryptKey(env, key), userId),
        env.DB.prepare("DELETE FROM alert_state WHERE key IN (?, ?, 'imports_idle')").bind("pause:" + userId, "quota:" + userId),
        env.DB.prepare("UPDATE capture SET status = 'pending' WHERE user_id = ? AND status = 'claimed' AND error LIKE 'groq 429%'").bind(userId),
      ]);
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
    const topic = url.searchParams.get("topic"), category = url.searchParams.get("category");
    const limit = Math.max(1, Math.min(Math.floor(Number(url.searchParams.get("limit")) || 50), 200));
    const { results } = await env.DB.prepare(
      `SELECT ${NOTE_COLUMNS} FROM note
       WHERE user_id IS ? AND (? IS NULL OR status = ?) AND (? IS NULL OR topic = ?)
         AND (? IS NULL OR EXISTS (SELECT 1 FROM note_category nc WHERE nc.note_id = note.id AND nc.name = ? AND nc.state = 1))
       ORDER BY created_at DESC LIMIT ?`,
    ).bind(userId, status, status, topic, topic, category, category, limit).all();
    return json({ notes: results ?? [] });
  }

  if (path === "/v1/search" && request.method === "GET") {
    const raw = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
    if (!raw) return json({ notes: [] });
    await logEvent(env, userId, "api", "search");
    return json({ notes: await searchNotes(env, userId, raw, 20) });
  }

  // Your own categories: the list, and ticking one on a note by hand.
  if (path === "/v1/categories" && request.method === "GET") return json(await categoriesOf(env, userId));
  if (path === "/v1/categories" && request.method === "PUT") {
    if ((await userTier(env, userId)).tier === "free")
      return json({ error: "Your own categories come with Skwirl Plus.", plus: true }, 402);
    const b = (await request.json().catch(() => null)) as { categories?: unknown } | null;
    const err = await setCategories(env, userId, b?.categories);
    if (err) return json({ error: err }, 400);
    await logEvent(env, userId, "api", "categories");
    return json(await categoriesOf(env, userId));
  }
  const catMatch = path.match(/^\/v1\/notes\/([^/]+)\/categories$/);
  if (catMatch && request.method === "POST") {
    const b = (await request.json().catch(() => null)) as { name?: unknown; on?: unknown } | null;
    if (typeof b?.name !== "string" || typeof b?.on !== "boolean") return json({ error: "Send a category name and on: true or false." }, 400);
    return (await setNoteCategory(env, userId, decodeURIComponent(catMatch[1]), b.name, b.on)) ? json({ ok: true }) : json({ error: "unknown note or category" }, 404);
  }

  const noteMatch = path.match(/^\/v1\/notes\/([^/]+)(\/used|\/share)?$/);
  if (noteMatch) {
    const noteId = decodeURIComponent(noteMatch[1]);
    if (noteMatch[2] === "/share" && (request.method === "POST" || request.method === "DELETE")) {
      const row = await env.DB.prepare("SELECT share_id FROM note WHERE id = ? AND user_id IS ?")
        .bind(noteId, userId).first<{ share_id: string | null }>();
      if (!row) return json({ error: "unknown id" }, 404);
      const shareId = request.method === "DELETE" ? null
        : row.share_id ?? [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
      await env.DB.prepare("UPDATE note SET share_id = ? WHERE id = ? AND user_id IS ?").bind(shareId, noteId, userId).run();
      if (shareId && !row.share_id) await logEvent(env, userId, "api", "share");
      return json({ share_id: shareId });
    }
    if (noteMatch[2] === "/used" && request.method === "POST") {
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

/** Is this address already proven by a different account? */
const takenByOther = async (env: Env, email: string, userId: string) =>
  Boolean(await env.DB.prepare("SELECT 1 FROM user WHERE email = ? AND email_verified = 1 AND id != ?").bind(email, userId).first());

/** Start adding/changing a signed-in account's email: a code by email, or (no sender set up yet)
 *  saved unproven. A failed send saves nothing (else anyone could park an address they don't own
 *  by exhausting the sender); the app lets the person finish later instead. */
async function emailChange(env: Env, userId: string, email: string): Promise<Response> {
  if (await takenByOther(env, email, userId)) return json({ error: "That email is already on another Skwirl account. Sign out and sign in with it instead." }, 409);
  const saveUnproven = async () => {
    await env.DB.prepare("UPDATE user SET email = ?, email_verified = 0 WHERE id = ?").bind(email, userId).run();
    await logEvent(env, userId, "api", "email_added");
    return json({ saved: true, email });
  };
  if (!emailEnabled(env)) return saveUnproven();
  if (await limited(env, "otpu:" + userId, 10, 3600_000)) return json({ error: "That's a lot of codes. Wait an hour and try again." }, 429);
  const code = await newCode(env, email, "add", userId, "u:" + userId);
  if (!code) return json({ error: "We've sent a lot of codes to that email. Wait an hour, or check spam for one we sent." }, 429);
  const name = (await env.DB.prepare("SELECT name FROM user WHERE id = ?").bind(userId).first<{ name: string }>())?.name ?? null;
  try { await sendEmail(env, codeEmail(email, code, name, "add")); }
  catch (e) { console.log("add-email code failed", String(e)); return json({ error: "Couldn't send the email just now. Try again in a minute, or finish later." }, 502); }
  return json({ sent: true, email });
}

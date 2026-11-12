/**
 * The always-on half of stash.
 *
 * Its whole job is to accept a capture within milliseconds and never lose it.
 * The Mac does the slow work — download, transcribe, extract — by polling this.
 * That split exists for one reason: media URLs handed to us by Instagram's DM
 * webhook expire, so the grab has to happen inside the webhook request itself,
 * whether or not the laptop is awake.
 *
 * Free tier throughout: Workers 100k req/day, D1 5 GB, R2 10 GB. Workers bills
 * CPU rather than wall time, so streaming a video into R2 is close to free —
 * it is I/O, not compute.
 *
 * Routes
 *   POST /ingest        shortcut / backfill / manual        (X-Stash-Secret)
 *   GET  /pending        what the Mac worker should do next  (X-Stash-Secret)
 *   POST /claim          take one, with an attempt count     (X-Stash-Secret)
 *   POST /complete       report done or failed, with a title (X-Stash-Secret)
 *   GET  /dead           dead-lettered captures              (X-Stash-Secret)
 *   POST /requeue        {since} reset their attempts        (X-Stash-Secret)
 *   GET  /status/:id     has this specific capture finished?  (X-Stash-Secret)
 *   GET  /media/:key     hand the stashed R2 object to the Mac worker
 *   GET  /webhook/ig     Meta's subscription challenge       (Phase 2)
 *   POST /webhook/ig     a shared reel arrives               (Phase 2, HMAC-verified)
 *   GET  /health
 *
 * `/status/:id` exists because "the phone's POST succeeded" and "the reel was
 * actually processed into a note" are different facts, and conflating them is
 * exactly what made an earlier version of the phone Shortcut lie — it showed
 * "stashed" for a request that reached Cloudflare fine but never got a working
 * receiver on the other end. Polling status closes that gap.
 *
 * MEDIA (R2) is optional. It only matters for the Phase-2 Instagram DM webhook,
 * which does not exist yet, and R2 is the one Cloudflare product that asks for
 * a payment method even on its free tier — every other route here works with
 * Workers + D1 alone, no card required. Every env.MEDIA use below is guarded so
 * the Worker still runs correctly with the binding entirely absent.
 */

import { embedMissing } from "./embed";
import { ccKeyUser, recall } from "./recall";
import { handleMcp } from "./mcp";
import { challengeHeader, handleOAuth, pruneOAuth, userFromOAuth } from "./oauth";
import { collect, pruneAnalytics } from "./analytics";
import { notifyOwner } from "./notify";
import { pushProgress, pushUser, sendPush, sendScheduled } from "./push";
import { applyAiCategories, applySortResult, categoriesOf, claimSortBatch } from "./categories";
import { OWNER_SENDS_DAY, OWNER_TRIES_DAY, accountByEmail, checkCode, codeEmail, emailEnabled, googleOwnsAddress, isOwnerEmail, limited, mintDeviceToken, mintOwnerToken, newCode, normEmail, note, over, redeemLogin, sendEmail } from "./login";
import { verifyGoogleIdToken } from "./google";
import { handleTelegram, setupTelegram, telegramUser, weeklyDigest } from "./telegram";
import { sharePage } from "./share";
import { dodoWebhook, isPlus } from "./plus";
import { adminOverview, createUser, decryptKey, deleteUser, handleV1, logEvent, userFromBearer, userFromToken } from "./v1";

export interface Env {
  DB: D1Database;
  AI?: { run(model: string, input: unknown): Promise<unknown> }; // Workers AI, for meaning-based search
  MEDIA?: R2Bucket;
  STASH_SECRET: string;
  IG_VERIFY_TOKEN?: string;
  IG_APP_SECRET?: string;
  IG_ACCESS_TOKEN?: string;
  JOIN_CODE?: string; // shared invite code for /join; unset = self-serve joining is closed (unless OPEN_JOIN)
  OPEN_JOIN?: string; // "1" = anyone can join from the landing page, no code (still capped by MAX_JOIN)
  NTFY_TOPIC?: string;
  TELEGRAM_BOT_TOKEN?: string; // optional: save by messaging the bot (src/telegram.ts)
  OWNER_TELEGRAM_CHAT?: string;
  OWNER_MAIL?: { send(m: unknown): Promise<void> }; // [[send_email]] locked to the owner (src/notify.ts)
  OWNER_MAIL_TO?: string;
  OWNER_NAME?: string; // how the owner account is shown in the app (default "Owner")
  OWNER_MAIL_FROM?: string;
  // Optional, Workers Paid: [[send_email]] binding "EMAIL" + a sender on a domain onboarded to
  // Cloudflare Email Service. Turns on "email me a sign-in link".
  EMAIL?: { send(m: { to: string; from: { email: string; name: string }; subject: string; text: string; html: string }): Promise<unknown> };
  EMAIL_FROM?: string; // sender for sign-in codes, e.g. signin@skwirl.app
  RESEND_API_KEY?: string; // Resend (free plan): sends the codes with a plain fetch (src/login.ts)
  GOOGLE_CLIENT_ID?: string; // "Continue with Google" shows only when set (src/google.ts)
  VAPID_JWK?: string; // P-256 private JWK for Web Push (src/push.ts)
  PUBLIC_URL?: string; // where links in Telegram messages point (default: the live site) // optional: owner alerts still reach Telegram when D1 is down
  // Optional: a fine-grained GitHub token (Actions: read & write, this repo only).
  // When set, a friend's save starts the cloud runner right away instead of
  // waiting for GitHub's cron, which fires every 2-5 hours in practice.
  GH_DISPATCH_TOKEN?: string;
  GH_REPO?: string; // default "Parthuss/stash" // set to get phone alerts when the queue is stuck, captures fail, or someone joins
  MAX_JOIN?: string; // cap on accounts created via /join (default 50)
  DODO_API_KEY?: string; // Skwirl Plus (src/plus.ts)
  DODO_WEBHOOK_SECRET?: string;
  DODO_API_BASE?: string; // default: Dodo's test host
  DODO_PRODUCT_MONTHLY?: string;
  DODO_PRODUCT_YEARLY?: string;
  SHARED_KEYS?: string; // how many free Groq accounts the runners rotate through (GROQ_API_KEYS); scales the shared-lane ceilings
  PLUS_ACCESS?: string; // who can buy: comma-separated user ids, or "*" for everyone. Unset: nobody.
}

const MAX_ATTEMPTS = 3;
// Imports per person per day, and the shared-key day total above which imports pause (Groq free tier ≈ 25-30 reels/day).
const IMPORT_DAILY_OWN = 150, IMPORT_DAILY_SHARED = 5, SHARED_IMPORT_CEILING = 15;
// While an own-key user's import is paused on their daily limit, borrow the shared key for this many
// saves a day. Shared used 26-42k of ~200k tokens/day (8-10 Nov); a save is ~9k, so 12 leaves ample room.
// ponytail: one counter per day in daily_counter ("borrow:YYYY-MM-DD"), never pruned (one row a day).
const BORROW_DAILY = 20;  // per shared key (x SHARED_KEYS): 5 keys = 100 a day, about 90% of their daily tokens
// Plus saves per calendar month that get the fast lane (first in line, Plus import limits). Past it they
// still get read, in the normal queue, so a heavy month can't cost more than Plus earns (~1.1c a save).
const PLUS_FAST_MONTHLY = 250;
const plusFast = `(u.plan = 'plus' AND u.plan_until > ? AND COALESCE((SELECT n FROM daily_counter WHERE key = 'pm:' || u.id || ':' || ?), 0) < ${PLUS_FAST_MONTHLY})`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-acorn": "2b0e7a35" },
  });

/** Constant-time compare, so the shared secret cannot be probed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request: Request, env: Env): boolean {
  const presented = request.headers.get("X-Stash-Secret") ?? "";
  return Boolean(env.STASH_SECRET) && safeEqual(presented, env.STASH_SECRET);
}

function id(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Instagram media ids encode the shortcode that appears in a permalink.
 * The DM webhook often gives us an id and no URL, so this is the only way to
 * get a clickable link back into the note. It is a reconstruction, not a fact,
 * which is why callers record it with permalink_ok = 0.
 *
 * Equivalent to the documented form
 * `base64(id.to_bytes(9, 'big'), altchars='-_').lstrip('A')` — 72 bits is a
 * multiple of 6, so grouping from the left matches repeated divmod from the
 * right. Verified vectors, keep these passing if you touch it:
 *
 *   3654866852788158956 -> DK4sgnNycHs
 *   2530085476753591929 -> CMcq1YNRc55
 *   1786890591287000000 -> BjMT4aCJjvA
 *    900000000000000000 -> x9cTtJ2gAA
 *
 * We emit /reel/ regardless of media type; Instagram redirects /reel/ and /p/
 * to each other, so a photo post saved this way still resolves.
 */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function mediaIdToShortcode(mediaId: string): string | null {
  const numeric = mediaId.split("_")[0];
  if (!/^\d+$/.test(numeric)) return null;
  let value = BigInt(numeric);
  let out = "";
  while (value > 0n) {
    out = B64[Number(value % 64n)] + out;
    value /= 64n;
  }
  return out || null;
}

async function verifyMetaSignature(
  request: Request,
  body: string,
  appSecret: string,
): Promise<boolean> {
  const header = request.headers.get("X-Hub-Signature-256");
  if (!header?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(header.slice(7), expected);
}

/** Insert a capture, treating a repeat permalink as a no-op rather than an error. */
async function insertCapture(
  env: Env,
  row: {
    source: string;
    permalink?: string | null;
    permalink_ok?: boolean;
    media_url?: string | null;
    media_key?: string | null;
    note?: string | null;
    user_id?: string | null; // null/absent = the owner
  },
): Promise<{ id: string; created: boolean }> {
  if (row.permalink) {
    const existing = await env.DB.prepare(
      "SELECT id FROM capture WHERE permalink = ? AND COALESCE(user_id, '') = ?",
    )
      .bind(row.permalink, row.user_id ?? "")
      .first<{ id: string }>();
    if (existing) return { id: existing.id, created: false };
  }

  const captureId = id();
  await env.DB.prepare(
    `INSERT INTO capture (id, source, permalink, permalink_ok, media_url, media_key,
                          note, status, attempts, captured_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
  )
    .bind(
      captureId,
      row.source,
      row.permalink ?? null,
      row.permalink_ok === false ? 0 : 1,
      row.media_url ?? null,
      row.media_key ?? null,
      row.note ?? null,
      new Date().toISOString(),
      row.user_id ?? null,
    )
    .run();
  return { id: captureId, created: true };
}

/** Start the cloud runner now (debounced to once per 3 min). No-op without a token. */
async function kickRunner(env: Env): Promise<void> {
  if (!env.GH_DISPATCH_TOKEN) return;
  const last = await env.DB.prepare("SELECT at FROM alert_state WHERE key = 'kick'").first<{ at: string }>();
  if (last && Date.now() - Date.parse(last.at) < 3 * 60_000) return;
  await env.DB.prepare("INSERT INTO alert_state (key, at) VALUES ('kick', ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at")
    .bind(new Date().toISOString()).run();
  await dispatchRunner(env).then(async (r) => { if (r.status !== 204) console.log("kickRunner failed", r.status, (await r.text()).slice(0, 300)); })
    .catch((e) => console.log("kickRunner error", String(e)));
}

/** Cron: other people's saves waiting (and claimable)? Start the cloud runner, so they don't sit
 * until the owner's Mac wakes up. GitHub's own schedule fires only every few hours in practice. */
async function kickIfWaiting(env: Env): Promise<void> {
  if (!env.GH_DISPATCH_TOKEN) return;
  const now = new Date().toISOString(), stale = new Date(Date.now() - 30 * 60_000).toISOString();
  const WAITING = "(status = 'pending' OR (status = 'claimed' AND (claimed_at IS NULL OR claimed_at < ?)))";
  const w = await env.DB.prepare(
    // Waiting = pending, or a claim gone stale (a runner died, or a rate-limited save parked as
    // claimed): /claim hands those out again, so they need a runner too (audit B09).
    `SELECT EXISTS (SELECT 1 FROM capture WHERE user_id IS NOT NULL AND ${WAITING} AND attempts < ? AND source != 'import') AS live,
            EXISTS (SELECT 1 FROM capture WHERE user_id IS NOT NULL AND ${WAITING} AND attempts < ? AND source = 'import') AS imports,
            EXISTS (SELECT 1 FROM alert_state WHERE key = 'imports_idle' AND at > ?) AS idle`,
  ).bind(stale, MAX_ATTEMPTS, stale, MAX_ATTEMPTS, now).first<{ live: number; imports: number; idle: number }>();
  if (w && (w.live || (w.imports && !w.idle))) await kickRunner(env);
}

/** POST to GitHub's workflow_dispatch for the cloud runner. 204 = started. */
function dispatchRunner(env: Env): Promise<Response> {
  const repo = env.GH_REPO || "Parthuss/stash";
  return fetch(`https://api.github.com/repos/${repo}/actions/workflows/process.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${(env.GH_DISPATCH_TOKEN ?? "").trim()}`, Accept: "application/vnd.github+json",
      "User-Agent": "stash-worker", "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "master" }),
  });
}

/** Cron (every 30 min): tell the owner when something needs a human. */
async function alertOwner(env: Env, message: string): Promise<void> {
  await notifyOwner(env, message.length > 70 ? message.slice(0, 67) + "…" : message, message);
}

async function checkHealth(env: Env): Promise<void> {
  let o: any;
  try { ({ overview: o } = await adminOverview(env)); } catch (e) {
    // D1 itself is failing (e.g. the free daily read limit), so there's no alert_state to dedupe
    // with: say it once every 3 hours by the clock.
    const now = new Date();
    if (now.getUTCHours() % 3 === 0 && now.getUTCMinutes() < 30) {
      await alertOwner(env, `The database is failing, so the site is down for everyone: ${String(e).slice(0, 200)}`);
    }
    return;
  }
  const problems: [string, string][] = [];
  const oldest = o?.oldest_waiting ? Date.now() - Date.parse(o.oldest_waiting as string) : 0;
  if (oldest > 60 * 60_000) problems.push(["stuck", `Queue stuck: oldest save has waited ${Math.round(oldest / 60_000)} min (${o!.waiting} waiting). Is the runner or the Mac down?`]);
  if (Number(o?.failed) > 0) problems.push(["failed", `${o!.failed} save(s) gave up after 3 tries. Check /v1/admin/overview, then POST /requeue.`]);
  const fresh = await env.DB.prepare("SELECT COUNT(*) n FROM user WHERE created_at > ?")
    .bind(new Date(Date.now() - 30 * 60_000).toISOString()).first<{ n: number }>();
  if ((fresh?.n ?? 0) > 0) problems.push(["joined:" + new Date().toISOString().slice(0, 13), `${fresh!.n} new user(s) joined Skwirl.`]);
  for (const [key, message] of problems) {
    // Same problem at most every 6 hours (a join is its own key per hour).
    const last = await env.DB.prepare("SELECT at FROM alert_state WHERE key = ?").bind(key).first<{ at: string }>();
    if (last && Date.now() - Date.parse(last.at) < 6 * 3600_000) continue;
    await alertOwner(env, message);
    await env.DB.prepare("INSERT INTO alert_state (key, at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at")
      .bind(key, new Date().toISOString()).run();
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (_event.cron === "0 4 * * SUN") {  // Sunday 9:30am IST / afternoon in Australia
      ctx.waitUntil(weeklyDigest(env, env.PUBLIC_URL ?? "https://skwirl.app").catch((e) => console.log("digest", String(e))));
      return;
    }
    ctx.waitUntil(checkHealth(env));
    ctx.waitUntil(kickIfWaiting(env).catch(() => {}));
    ctx.waitUntil(pushProgress(env).catch((e) => console.log("push progress", String(e))));
    ctx.waitUntil(sendScheduled(env).catch((e) => console.log("scheduled push", String(e))));
    ctx.waitUntil(pruneOAuth(env));
    ctx.waitUntil(pruneAnalytics(env).catch(() => {}));
    ctx.waitUntil(embedMissing(env).catch((e) => console.log("embed backfill", String(e))));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    // Saving from somewhere other than the app (an AI app, Telegram): same rules as /v1/ingest.
    const saveFor = async (userId: string | null, link: string, note: string | undefined, source: string) => {
      const res = await handleV1(new Request(url.origin + "/v1/ingest", { method: "POST", body: JSON.stringify({ url: link, note, source }) }), env, "/v1/ingest", userId, insertCapture);
      if (userId && res.status === 202) ctx.waitUntil(kickRunner(env));
      return res;
    };

    if (path === "/health") {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    // ---- Instagram DM webhook (Phase 2) --------------------------------
    if (path === "/webhook/ig") {
      if (request.method === "GET") {
        // Meta's subscription handshake.
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        if (mode === "subscribe" && env.IG_VERIFY_TOKEN && token === env.IG_VERIFY_TOKEN) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      }
      if (request.method === "POST") {
        const raw = await request.text();
        if (!env.IG_APP_SECRET || !(await verifyMetaSignature(request, raw, env.IG_APP_SECRET))) {
          // This endpoint is public. An unsigned POST is either a misconfiguration
          // or someone else, and neither should be able to write to the queue.
          return new Response("bad signature", { status: 403 });
        }
        return handleInstagram(raw, env, ctx);
      }
      return new Response("method not allowed", { status: 405 });
    }

    const oauth = await handleOAuth(request, env, path, url);
    if (oauth) return oauth;
    if (path === "/mcp" || path.startsWith("/mcp/")) {
      const secret = decodeURIComponent(path.slice(5));
      let userId = path === "/mcp" ? await userFromOAuth(request, env) : await userFromToken(secret, env);
      if (userId === undefined && path !== "/mcp") userId = await ccKeyUser(env, secret);
      if (userId === undefined) {
        return new Response('{"error":"unauthorized"}', { status: 401, headers: { "content-type": "application/json", ...(path === "/mcp" ? challengeHeader(url.origin) : {}) } });
      }
      return handleMcp(request, env, userId, (link, note) => saveFor(userId, link, note, "mcp"));
    }
    if (path === "/webhooks/dodo" && request.method === "POST") return dodoWebhook(request, env, ctx);

    if (path === "/webhook/telegram" && request.method === "POST") {
      return handleTelegram(request, env, (userId, link) => saveFor(userId, link, undefined, "telegram"));
    }

    const thumbMatch = path.match(/^\/t\/([0-9a-f]{32})$/);
    if (thumbMatch && request.method === "GET") {
      // Thumbs never change, so keep them in Cloudflare's edge cache: no D1 read after the
      // first view, and covers keep showing even when D1 is down.
      const cache = (caches as any).default as Cache;
      const hit = await cache.match(request.url);
      if (hit) return hit;
      const row = await env.DB.prepare("SELECT data FROM thumb WHERE id = ?").bind(thumbMatch[1]).first<{ data: string }>();
      if (!row) return new Response("not found", { status: 404 });
      const bytes = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
      const res = new Response(bytes, {
        headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
      });
      // The edge keeps it a day (so a deleted account's covers can't linger long); browsers a year.
      const edge = new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
      ctx.waitUntil(cache.put(request.url, edge));
      return res;
    }

    const shareMatch = path.match(/^\/n\/([0-9a-f]{32})$/);
    if (shareMatch && request.method === "GET") return sharePage(env, shareMatch[1], url.origin);

    // Tells the landing page whether to ask for an invite code.
    if (path === "/join" && request.method === "GET") {
      return json({ open: env.OPEN_JOIN === "1", invite: Boolean(env.JOIN_CODE), email_login: emailEnabled(env), google_client_id: env.GOOGLE_CLIENT_ID || null, country: request.headers.get("CF-IPCountry"), plus_open: env.PLUS_ACCESS === "*" });
    }

    // Product analytics beacon (public: visitors aren't signed in). See src/analytics.ts.
    if (path === "/e" && request.method === "POST") {
      return collect(request, env, await userFromBearer(request, env).catch(() => undefined));
    }

    // "Skwirl Plus, coming soon": record interest (there's no checkout yet). Visitors need an
    // email to hear back; signed-in people may skip it. One ping to the owner per sign-up.
    if (path === "/waitlist" && request.method === "POST") {
      const ip = "wait:" + (request.headers.get("CF-Connecting-IP") ?? "unknown");
      const recent = await env.DB.prepare("SELECT COUNT(*) n FROM join_attempt WHERE ip = ? AND at > ?")
        .bind(ip, new Date(Date.now() - 3600_000).toISOString()).first<{ n: number }>();
      if ((recent?.n ?? 0) >= 5) return json({ error: "Too many tries. Wait an hour." }, 429);
      await env.DB.prepare("INSERT INTO join_attempt (ip, at) VALUES (?, ?)").bind(ip, new Date().toISOString()).run();
      const b = ((await request.json().catch(() => null)) ?? {}) as any;
      const userId = await userFromBearer(request, env).catch(() => undefined);
      const email = String(b.email ?? "").trim().slice(0, 120);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "That email doesn't look right." }, 400);
      if (email && !b.consent) return json({ error: "Tick the box so we're allowed to email you." }, 400);
      if (!email && typeof userId !== "string") return json({ error: "Add your email so we can tell you when it's ready." }, 400);
      const country = request.headers.get("CF-IPCountry");
      await env.DB.prepare("INSERT INTO waitlist (at, user_id, visitor, email, country, price, place) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(new Date().toISOString(), typeof userId === "string" ? userId : null, String(b.visitor ?? "").slice(0, 40) || null,
          email || null, country, String(b.price ?? "").slice(0, 20) || null, String(b.place ?? "").slice(0, 20) || null).run();
      ctx.waitUntil(notifyOwner(env, `someone wants Plus (${country ?? "?"}, ${b.price ?? "?"})`, `Someone joined the Skwirl Plus waitlist.\n\nCountry: ${country ?? "?"}\nPrice shown: ${b.price ?? "?"}\nWhere: ${b.place ?? "?"}\n${typeof userId === "string" ? "A signed-in user." : "A visitor."}${email ? `\nEmail: ${email}` : ""}\n\nAll of them: https://skwirl.app/analytics`));
      return json({ ok: true });
    }

    // ---- accounts: email + emailed code, or Google (src/login.ts, src/google.ts) ----------
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    // Can a new account be made right now? null = yes, else the reason. The invite code and the
    // /join cap apply to every way in; successful sign-ups count toward the per-network window.
    const joinGate = async (invite: unknown): Promise<{ error: string; status: number } | null> => {
      const open = env.OPEN_JOIN === "1";
      if (!open && !env.JOIN_CODE) return { error: "Joining is closed right now.", status: 403 };
      if (await over(env, ip, 8, 10 * 60_000)) return { error: "Too many tries. Wait a few minutes.", status: 429 };
      if (await over(env, ip, 20, 86_400_000)) return { error: "Too many tries from this network today. Try tomorrow.", status: 429 };
      if (!open && !safeEqual(String(invite ?? "").trim(), env.JOIN_CODE!)) {
        await note(env, ip);
        return { error: "That invite code isn't right.", status: 403 };
      }
      const joined = await env.DB.prepare("SELECT COUNT(*) n FROM user WHERE joined_via = 'invite'").first<{ n: number }>();
      if ((joined?.n ?? 0) >= (Number(env.MAX_JOIN) || 50)) return { error: "We're full for now.", status: 403 };
      return null;
    };
    const cleanName = (v: unknown) => (typeof v === "string" ? v : "").trim().slice(0, 40);
    const makeAccount = async (name: string, email: string, verified: boolean, googleSub: string | null = null) => {
      await note(env, ip);
      const user = await createUser(env, name);
      await env.DB.prepare("UPDATE user SET joined_via = 'invite', email = ?, email_verified = ?, google_sub = ? WHERE id = ?")
        .bind(email, verified ? 1 : 0, googleSub, user.id).run();
      await logEvent(env, user.id, "api", "join");
      return user;
    };
    // An address just proved it belongs to whoever holds it: mark the account's copy verified.
    const markVerified = (id: string) => env.DB.prepare("UPDATE user SET email_verified = 1 WHERE id = ?").bind(id).run().catch(() => {});
    // The owner's verified email signs in to the owner account (src/login.ts: owner caps, sto_ tokens).
    // Every owner sign-in pings the owner, so a stranger getting in can't go unnoticed.
    const ownerSignedIn = async (how: string) => {
      ctx.waitUntil(notifyOwner(env, "new owner sign-in", `Someone just signed in to the Skwirl owner account with ${how} (${request.headers.get("CF-IPCountry") ?? "?"}, ${ip}).\n\nNot you? Rotate STASH_SECRET (wrangler secret put STASH_SECRET) to sign out every owner device.`).catch(() => {}));
      await logEvent(env, null, "api", how === "Google" ? "signin_google" : "signin_email");
      return json({ token: await mintOwnerToken(env), name: env.OWNER_NAME ?? "Owner", created: false });
    };

    // Step 1: email me a code. Same answer whether or not the address has an account.
    if (path === "/auth/email/start" && request.method === "POST") {
      if (!emailEnabled(env)) return json({ error: "Email sign-in isn't on yet." }, 503);
      const b = ((await request.json().catch(() => null)) ?? {}) as any;
      const email = normEmail(b.email);
      if (!email) return json({ error: "That email doesn't look right." }, 400);
      if (await limited(env, "otp:" + ip, 10, 3600_000)) return json({ error: "Too many codes from this network. Wait an hour." }, 429);
      // Creating an account: say now if joining is closed or the invite code is wrong, before an
      // email goes out. Checked before looking the address up, so the answer can't reveal an account.
      if (b.signup) { const no = await joinGate(b.invite); if (no) return json({ error: no.error }, no.status); }
      const own = await isOwnerEmail(env, email);
      if (own && await limited(env, "otpown:send", OWNER_SENDS_DAY, 86_400_000))
        return json({ error: "We've sent a lot of codes to that email. Wait an hour, or check spam for one we sent." }, 429);
      const acct = own ? { name: env.OWNER_NAME ?? "Owner" } : await accountByEmail(env, email);
      const code = await newCode(env, email, "signin", null, ip);
      if (!code) return json({ error: "We've sent a lot of codes to that email. Wait an hour, or check spam for one we sent." }, 429);
      try { await sendEmail(env, codeEmail(email, code, acct?.name ?? null, "signin")); }
      catch (e) { console.log("code email failed", String(e)); return json({ error: "Couldn't send the email. Try again in a minute." }, 502); }
      return json({ ok: true });
    }

    // Step 2: the code. Signs in to the account on that address, or makes one (needs a first name;
    // without one the code is left unspent and the page asks for the name).
    if (path === "/auth/email/verify" && request.method === "POST") {
      if (await limited(env, "otpv:" + ip, 30, 3600_000)) return json({ error: "Too many codes tried from this network. Wait an hour." }, 429);
      const b = ((await request.json().catch(() => null)) ?? {}) as any;
      const email = normEmail(b.email);
      if (!email) return json({ error: "That email doesn't look right." }, 400);
      if (await isOwnerEmail(env, email)) {
        if (await limited(env, "otpown:try", OWNER_TRIES_DAY, 86_400_000)) return json({ error: "Too many codes tried for this email today. Try again tomorrow." }, 429);
        const spent = await checkCode(env, email, "signin", b.code, true);
        if (!spent.ok) return json({ error: spent.error, left: spent.left }, 400);
        return ownerSignedIn("an email code");
      }
      const acct = await accountByEmail(env, email), name = cleanName(b.name);
      if (!acct && !name) {
        const peek = await checkCode(env, email, "signin", b.code, false);
        if (!peek.ok) return json({ error: peek.error, left: peek.left }, 400);
        return json({ needs_name: true, error: "No Skwirl account uses this email yet. Add your first name to create one." }, 409);
      }
      if (!acct) { const no = await joinGate(b.invite); if (no) return json({ error: no.error }, no.status); }
      const spent = await checkCode(env, email, "signin", b.code, true);
      if (!spent.ok) return json({ error: spent.error, left: spent.left }, 400);
      if (acct) {
        if (!acct.email_verified) await markVerified(acct.id);
        await logEvent(env, acct.id, "api", "signin_email");
        return json({ token: await mintDeviceToken(env, acct.id), name: acct.name, created: false });
      }
      const user = await makeAccount(name, email, true).catch(() => null);  // lost a race for the address
      if (!user) return json({ error: "Something went wrong. Sign in with that email again." }, 409);
      return json({ token: user.token, name, created: true }, 201);
    }

    // Continue with Google: a GIS ID token, checked against Google's keys. Finds the account by
    // Google id, then by (verified) email, linking the two; otherwise makes one.
    if (path === "/auth/google" && request.method === "POST") {
      if (!env.GOOGLE_CLIENT_ID) return json({ error: "Google sign-in isn't on." }, 503);
      if (await limited(env, "g:" + ip, 20, 10 * 60_000)) return json({ error: "Too many tries. Wait a few minutes." }, 429);
      const b = ((await request.json().catch(() => null)) ?? {}) as any;
      const g = await verifyGoogleIdToken(env, b.credential).catch((e) => { console.log("google verify", String(e)); return null; });
      if (!g) return json({ error: "Google didn't confirm that sign-in. Try again." }, 401);
      const email = normEmail(g.email);
      // The owner's address: only a Gmail address, which Google itself vouches for. Anything else
      // (a Google account can carry any address) has to use an email code.
      if (email && await isOwnerEmail(env, email)) {
        if (!googleOwnsAddress(email)) return json({ error: "Sign in to this account with an email code instead." }, 409);
        return ownerSignedIn("Google");
      }
      const bySub = await env.DB.prepare("SELECT id, name FROM user WHERE google_sub = ?").bind(g.sub).first<{ id: string; name: string }>();
      const acct = bySub ?? (email ? await accountByEmail(env, email) : null);
      if (acct) {
        // Link once. An account already tied to a different Google account (say a reassigned work
        // address) isn't taken over; its owner can still use an email code.
        if (!bySub) {
          const linked = await env.DB.prepare("UPDATE user SET google_sub = ?, email_verified = 1 WHERE id = ? AND google_sub IS NULL").bind(g.sub, acct.id).run().catch(() => null);
          if (!linked?.meta?.changes) return json({ error: "That email's Skwirl account is linked to a different Google account. Sign in with an email code instead." }, 409);
        }
        await logEvent(env, acct.id, "api", "signin_google");
        return json({ token: await mintDeviceToken(env, acct.id), name: acct.name, created: false });
      }
      if (!email) return json({ error: "Your Google account has no email we can use." }, 400);
      const no = await joinGate(b.invite); if (no) return json({ error: no.error }, no.status);
      const name = cleanName(b.name) || cleanName(g.given_name) || cleanName(g.name?.split(" ")[0]) || "there";
      const user = await makeAccount(name, email, true, g.sub).catch(() => null);
      if (!user) return json({ error: "Something went wrong. Try again." }, 409);
      return json({ token: user.token, name, created: true }, 201);
    }

    // Telegram's one-time #login= links.
    if (path === "/login/redeem" && request.method === "POST") {
      const code = String(((await request.json().catch(() => null)) as any)?.code ?? "");
      const token = await redeemLogin(env, code);
      return token ? json({ token }) : json({ error: "That link has expired or was already used. Ask for a new one." }, 400);
    }

    // ---- join without a code: only while no email sender is set up ------------------------
    // (With one, sign-up goes through /auth/email so every address on file is proven.)
    if (path === "/join" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { name?: string; code?: string; email?: string } | null;
      if ([body?.name, body?.code, body?.email].some((v) => v != null && typeof v !== "string"))
        return json({ error: "Name, email and invite code must be text." }, 400);
      if (emailEnabled(env)) return json({ error: "Reload the page: sign-up now emails you a code." }, 409);
      const name = cleanName(body?.name);
      if (!name) return json({ error: "Tell us your first name." }, 400);
      const email = normEmail(body?.email);
      if (!email) return json({ error: body?.email ? "That email doesn't look right." : "Add your email so you can sign in again later." }, 400);
      const no = await joinGate(body?.code); if (no) return json({ error: no.error }, no.status);
      const user = await makeAccount(name, email, false);
      return json({ token: user.token }, 201);
    }

    // Claude Code plugin hook: takes the hook's own JSON, answers in hook format. A Claude Code key works here.
    if (path === "/v1/recall" && request.method === "POST") {
      const key = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
      let userId = await userFromToken(key, env);
      if (userId === undefined) userId = await ccKeyUser(env, key);
      if (userId === undefined) return json({ error: "unauthorized" }, 401);
      return recall(env, userId, await request.json().catch(() => ({})), userId === null && url.searchParams.has("debug"));
    }

    // ---- per-user API (bearer token) -----------------------------------
    if (path.startsWith("/v1/")) {
      const userId = await userFromBearer(request, env);
      if (userId === undefined) return json({ error: "unauthorized" }, 401);
      const res = await handleV1(request, env, path, userId, insertCapture);
      if (userId && path === "/v1/ingest" && res.status === 202) ctx.waitUntil(kickRunner(env));
      return res;
    }

    // ---- everything below is for us only -------------------------------
    if (!authorized(request, env)) {
      return json({ error: "unauthorized" }, 401);
    }

    if (path === "/ingest" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as Record<string, string> | null;
      if (!body?.url && !body?.media_url) {
        return json({ error: "need url or media_url" }, 400);
      }
      const result = await insertCapture(env, {
        source: body.source || "shortcut",
        permalink: body.url ?? null,
        media_url: body.media_url ?? null,
        note: body.note ?? null,
      });
      return json(result, result.created ? 202 : 200);
    }

    if (path === "/pending" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const { results } = await env.DB.prepare(
        `SELECT * FROM capture WHERE status='pending' AND attempts < ?
         ORDER BY captured_at LIMIT ?`,
      )
        .bind(MAX_ATTEMPTS, limit)
        .all();
      return json({ captures: results ?? [] });
    }

    if (path === "/claim" && request.method === "POST") {
      // ?scope=guests: only other people's captures. The cloud runner uses it so
      // the owner's own saves stay local-first (vault/ on the Mac).
      const guestsOnly = url.searchParams.get("scope") === "guests";
      // ?skip=tiktok.com,…: hosts this runner can't reach. Plain host names only.
      const skip = (url.searchParams.get("skip") ?? "").split(",").map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+$/.test(h)).slice(0, 5);
      // A claim older than 30 min means that worker died; hand the capture out again.
      const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
      // Live saves first. Imported old saves only fill leftover capacity: per person a daily slice
      // (bigger with their own Groq key), and on the shared key only while today's shared use is low,
      // so one big import can't eat everyone's free allowance. Counted at claim time, so parallel
      // runners can't overshoot.
      const day = new Date(Date.now() - 86_400_000).toISOString();
      const open = `(c.status='pending' OR (c.status='claimed' AND (c.claimed_at IS NULL OR c.claimed_at < ?)))
           AND c.attempts < ?
           ${guestsOnly ? "AND c.user_id IS NOT NULL" : ""}
           ${skip.map(() => "AND COALESCE(c.permalink, '') NOT LIKE ?").join(" ")}`;
      const openArgs = [staleBefore, MAX_ATTEMPTS, ...skip.map((h) => `%${h}/%`)];
      // Another runner can pick the same row between our SELECT and UPDATE, so the claim below is a
      // compare-and-set; if it loses, pick again (a few times, then report nothing to do).
      let row: Record<string, any> | null = null, lease = "";
      const sharedKeys = Math.max(1, Number(env.SHARED_KEYS) || 1);
      for (let tries = 0; tries < 3 && !lease; tries++) {
      const now = new Date().toISOString();
      // Plus members' live saves first, then everyone else's. Their imports stay behind live saves
      // (below), so a big Plus import can't hold up a free user's new reel for hours.
      row = await env.DB.prepare(
        `SELECT c.* FROM user u JOIN capture c ON c.user_id = u.id
         WHERE ${plusFast} AND c.source != 'import' AND ${open} ORDER BY c.captured_at LIMIT 1`,
      )
        .bind(now, now.slice(0, 7), ...openArgs)
        .first();
      row ??= await env.DB.prepare(
        `SELECT c.* FROM capture c WHERE c.source != 'import' AND ${open} ORDER BY c.captured_at LIMIT 1`,
      )
        .bind(...openArgs)
        .first();
      // The import query reads the whole backlog, and runners poll every few seconds: once it
      // comes back empty (everyone at their daily slice), don't ask again for 15 minutes.
      // Polling every time read 31M rows in a day from a 500-post import (6 Nov 2026).
      const idle = row ? null : await env.DB.prepare("SELECT at FROM alert_state WHERE key = 'imports_idle'").first<{ at: string }>();
      if (!row && !(idle && idle.at > now)) {
        row = await env.DB.prepare(
          `SELECT c.* FROM capture c LEFT JOIN user u ON u.id = c.user_id
           LEFT JOIN (SELECT user_id, COUNT(*) n FROM capture WHERE claimed_at > ? AND source = 'import' GROUP BY user_id) r
             ON r.user_id IS c.user_id
           WHERE c.source = 'import' AND ${open}
             AND (${plusFast} OR NOT EXISTS (SELECT 1 FROM alert_state p WHERE p.key = 'pause:' || COALESCE(c.user_id, 'owner') AND p.at > ?)
               OR (u.groq_key_enc IS NOT NULL AND COALESCE((SELECT n FROM daily_counter WHERE key = ?), 0) < ?))
             AND COALESCE(r.n, 0) < CASE WHEN c.user_id IS NULL THEN 1000 WHEN ${plusFast} THEN ${PLUS_FAST_MONTHLY} WHEN u.groq_key_enc IS NOT NULL THEN ? ELSE ? END
             AND (u.groq_key_enc IS NOT NULL OR c.user_id IS NULL OR ${plusFast} OR
               (SELECT COUNT(*) FROM capture e LEFT JOIN user v ON v.id = e.user_id
                WHERE e.claimed_at > ? AND e.user_id IS NOT NULL AND v.groq_key_enc IS NULL) < ?)
           -- Plus first. Then never-tried saves: a post that already failed waits behind them. One huge
           -- carousel (58 calls, 117k tokens) sat at the front of one person's import for 30 h, failing every window.
           ORDER BY ${plusFast} DESC, c.claimed_at IS NOT NULL, c.captured_at LIMIT 1`,
        )
          .bind(day, ...openArgs, now, now.slice(0, 7), now, "borrow:" + now.slice(0, 10), BORROW_DAILY * sharedKeys, now, now.slice(0, 7), IMPORT_DAILY_OWN, IMPORT_DAILY_SHARED, now, now.slice(0, 7), day, SHARED_IMPORT_CEILING * sharedKeys, now, now.slice(0, 7))
          .first();
        if (!row) {
          await env.DB.prepare("INSERT INTO alert_state (key, at) VALUES ('imports_idle', ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at")
            .bind(new Date(Date.now() + 15 * 60_000).toISOString())
            .run();
        }
      }
      if (!row) break;
      const candidate = crypto.randomUUID();
      const won = await env.DB.prepare(
        `UPDATE capture SET status='claimed', claimed_at=?, attempts = attempts + 1, lease=?
         WHERE id = ? AND attempts < ? AND (status='pending' OR (status='claimed' AND (claimed_at IS NULL OR claimed_at < ?)))`,
      )
        .bind(new Date().toISOString(), candidate, row.id, MAX_ATTEMPTS, staleBefore)
        .run();
      if (won.meta.changes) lease = candidate;
      }
      if (!row || !lease) return json({ capture: null });
      // A user who brought their own Groq key is processed on it. It rides this
      // admin-authenticated response to the Mac worker only; it is never logged.
      const owner = row.user_id
        ? await env.DB.prepare("SELECT groq_key_enc, plan, plan_until FROM user WHERE id = ?").bind(row.user_id).first<{ groq_key_enc: string | null; plan: string | null; plan_until: string | null }>()
        : null;
      // Plus pays for the shared key: their saves never run on their own (free-tier) key, even if one is saved.
      if (owner && isPlus(owner)) owner.groq_key_enc = null;
      // Count this month's Plus saves (first claim only, retries don't count) toward PLUS_FAST_MONTHLY.
      if (owner && isPlus(owner) && !row.claimed_at) await env.DB.prepare("INSERT INTO daily_counter (key, n) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1")
        .bind(`pm:${row.user_id}:${new Date().toISOString().slice(0, 7)}`).run();
      // Plus saves inside this month's fast lane run on the paid model (OpenRouter); the rest on the free keys.
      const plusN = owner && isPlus(owner)
        ? (await env.DB.prepare("SELECT n FROM daily_counter WHERE key = ?").bind(`pm:${row.user_id}:${new Date().toISOString().slice(0, 7)}`).first<{ n: number }>())?.n ?? 0
        : Infinity;
      const lane = plusN <= PLUS_FAST_MONTHLY ? "plus" : null;
      // Their own key is out for the day (import paused): this one runs on the shared key instead.
      const t = new Date().toISOString();
      const borrowed = row.source === "import" && owner?.groq_key_enc
        ? !!(await env.DB.prepare("SELECT 1 FROM alert_state WHERE key = ? AND at > ?").bind("pause:" + row.user_id, t).first())
        : false;
      if (borrowed) await env.DB.prepare("INSERT INTO daily_counter (key, n) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1")
        .bind("borrow:" + t.slice(0, 10)).run();
      const groq_key = owner?.groq_key_enc && !borrowed ? await decryptKey(env, owner.groq_key_enc).catch(() => null) : null;
      if (owner?.groq_key_enc && !borrowed && !groq_key) {
        // Can't decrypt their key (e.g. STASH_SECRET was rotated). Don't keep treating them as an
        // own-key user while quietly running on the shared key: drop it and tell them (audit S04).
        await env.DB.prepare("UPDATE user SET groq_key_enc = NULL, owner_msg = ? WHERE id = ? AND groq_key_enc = ?")
          .bind("#gGroq Skwirl couldn't read your saved Groq key, so it's using the shared key for now. Paste your key again to get your own limit back.", row.user_id, owner.groq_key_enc).run();
      }
      const cats = await categoriesOf(env, row.user_id ?? null);
      return json({ capture: { ...row, status: "claimed", lease, groq_key, lane, categories: cats.names, cat_version: cats.version } });
    }

    // Re-sorting existing notes into someone's categories (after they add or change them).
    if (path === "/sort/claim" && request.method === "POST") {
      const batch = await claimSortBatch(env, url.searchParams.get("scope") === "guests");
      if (!batch) return json({ batch: null });
      const enc = batch.user_id
        ? await env.DB.prepare("SELECT groq_key_enc FROM user WHERE id = ?").bind(batch.user_id).first<{ groq_key_enc: string | null }>()
        : null;
      const groq_key = enc?.groq_key_enc ? await decryptKey(env, enc.groq_key_enc).catch(() => null) : null;
      return json({ batch: { ...batch, groq_key } });
    }
    if (path === "/sort/result" && request.method === "POST") {
      const b = (await request.json().catch(() => null)) as { user_id?: string | null; version?: number; results?: unknown } | null;
      if (!b || typeof b.version !== "number") return json({ error: "need version" }, 400);
      return json({ applied: await applySortResult(env, b.user_id ?? null, b.version, b.results) });
    }

    if (path === "/complete" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as
        | { id?: string; ok?: boolean; error?: string; title?: string; usage?: any[]; lease?: string }
        | null;
      if (!body?.id) return json({ error: "need id" }, 400);
      // Fence stale reports: the capture may be gone (account deleted), reclaimed by another runner
      // (different lease), or already done (a late failure must not move it back to pending, and a
      // duplicate success must not log usage or send the import-done notice twice).
      const cur = await env.DB.prepare("SELECT user_id, status, lease FROM capture WHERE id = ?").bind(body.id)
        .first<{ user_id: string | null; status: string; lease: string | null }>();
      if (!cur || (body.lease && cur.lease && body.lease !== cur.lease) || cur.status === "done") return json({ ok: true, stale: true });
      const fence = body.lease ? " AND status != 'done' AND lease IS ?" : " AND status != 'done'";
      const fenceArgs = body.lease ? [body.lease] : [];

      // Attribute each AI call this capture caused to the person who saved it.
      if (Array.isArray(body.usage) && body.usage.length) {
        const cap = cur;
        for (const u of body.usage.slice(0, 50)) {
          await logEvent(env, cap?.user_id ?? null, "groq", String(u.kind ?? "chat").slice(0, 20), {
            model: String(u.model ?? "").slice(0, 60), key_type: u.key_type === "own" ? "own" : "shared",
            prompt: Number(u.prompt_tokens) || 0, completion: Number(u.completion_tokens) || 0,
            seconds: Number(u.seconds) || 0, capture_id: body.id,
          });
        }
      }

      if (body.ok) {
        await env.DB.prepare(
          "UPDATE capture SET status='done', processed_at=?, error=NULL, title=? WHERE id=?" + fence,
        )
          .bind(new Date().toISOString(), (body.title ?? "").slice(0, 300) || null, body.id, ...fenceArgs)
          .run();
      } else {
        const error = (body.error ?? "").slice(0, 2000);
        const owner401 = /groq 401/.test(error)
          // Not while their import is paused: then this run borrowed the shared key, and a 401 isn't theirs.
          ? await env.DB.prepare(`SELECT u.id FROM capture c JOIN user u ON u.id = c.user_id WHERE c.id = ? AND u.groq_key_enc IS NOT NULL
               AND NOT (u.plan = 'plus' AND u.plan_until > ?)
               AND NOT (c.source = 'import' AND EXISTS (SELECT 1 FROM alert_state p WHERE p.key = 'pause:' || u.id AND p.at > ?))`)
              .bind(body.id, new Date().toISOString(), new Date().toISOString()).first<{ id: string }>()
          : null;
        if (owner401) {
          // Their own key was deleted or revoked in Groq: drop it (back to the shared key), tell them on
          // their next visit, and give this save its try back so it goes through on the shared key.
          await env.DB.batch([
            env.DB.prepare("UPDATE user SET groq_key_enc = NULL, owner_msg = ? WHERE id = ?")
              .bind("#gGroq Your Groq key stopped working (it may have been deleted in Groq), so Skwirl switched you back to the shared key. Paste a new key to get your own limit back.", owner401.id),
            env.DB.prepare("UPDATE capture SET status='pending', error=?, attempts = MAX(attempts - 1, 0) WHERE id=?" + fence).bind(error, body.id, ...fenceArgs),
          ]);
        } else if (/groq (429|503)/.test(error)) {
          // Groq out of tokens or over capacity isn't this save's fault: give the try back and park
          // it for 30 min (a 'claimed' row is handed out again once stale). For imports, pause the
          // rest of that person's backlog too, so we don't download them all to hit the same wall.
          // (6 Nov: a free key's daily tokens ran out and burned 3 tries off each import.)
          const now = new Date().toISOString();
          await env.DB.prepare("UPDATE capture SET status='claimed', claimed_at=?, error=?, attempts = MAX(attempts - 1, 0) WHERE id=?" + fence)
            .bind(now, error, body.id, ...fenceArgs).run();
          const c = await env.DB.prepare("SELECT user_id, source FROM capture WHERE id = ?").bind(body.id).first<{ user_id: string | null; source: string }>();
          if (c?.source === "import") {
            // Out of today's tokens: Groq says when it resets ("try again in 3h2m7.5s"). Park the backlog
            // until then and remember it as quota:<user>, so the app can say when reading resumes.
            // Groq's wait covers only the request that failed (a few thousand tokens), but a whole note
            // needs ~9k across 5-6 calls. Retrying that early spends tokens on calls that succeed, then
            // loses them when a later call hits the limit. Wait for a full note's worth instead.
            const daily = /tokens per day/i.test(error), resetMs = daily ? noteWaitMs(error) : 0;
            const until = new Date(Date.now() + (resetMs ? resetMs + 60_000 : 30 * 60_000)).toISOString();
            const who = c.user_id ?? "owner", put = "INSERT INTO alert_state (key, at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at";
            await env.DB.batch([
              env.DB.prepare(put).bind("pause:" + who, until),
              ...(daily ? [env.DB.prepare(put).bind("quota:" + who, until)] : []),
            ]);
          }
        } else {
          // Back to pending, not failed: transient breakage should retry itself.
          // Once MAX_ATTEMPTS is hit, /status reports it as a dead letter — see below.
          await env.DB.prepare("UPDATE capture SET status='pending', error=? WHERE id=?" + fence).bind(error, body.id, ...fenceArgs).run();
        }
      }
      // Last of someone's imported saves just finished (read or given up on): tell them on Telegram.
      const cap = await env.DB.prepare("SELECT user_id, source, status, attempts FROM capture WHERE id = ?").bind(body.id)
        .first<{ user_id: string | null; source: string; status: string; attempts: number }>();
      if (cap?.source === "import" && (cap.status === "done" || cap.attempts >= MAX_ATTEMPTS)) {
        const left = await env.DB.prepare(
          "SELECT COUNT(*) AS open, SUM(status = 'done') AS done FROM capture WHERE user_id IS ? AND source = 'import' AND (status = 'done' OR attempts < ?)",
        ).bind(cap.user_id, MAX_ATTEMPTS).first<{ open: number; done: number }>();
        const open = (left?.open ?? 0) - (left?.done ?? 0);
        if (open === 0) {
          ctx.waitUntil(telegramUser(env, cap.user_id, `All your old Instagram saves are in: ${left?.done ?? 0} notes ready to search. Ask your AI app about them, or open ${env.PUBLIC_URL ?? url.origin}`).catch(() => {}));
          ctx.waitUntil(pushUser(env, cap.user_id, { title: "Skwirl", body: `All your old Instagram saves are in: ${left?.done ?? 0} notes ready to search.`, url: "/", tag: "import-done" }).catch(() => {}));
        }
      }
      return json({ ok: true });
    }

    if (path === "/admin/telegram/setup" && request.method === "POST") return setupTelegram(env, url.origin);
    // Send the owner's own devices a test notification (proves the whole push path end to end).
    if (path === "/admin/push/test" && request.method === "POST") {
      const { results } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_sub WHERE user_id IS NULL").all<any>();
      const statuses = [];
      for (const s of results ?? []) statuses.push(await sendPush(env, s, { title: "Skwirl", body: "Test notification from your admin.", url: "/" }).catch((e) => String(e)));
      return json({ devices: statuses.length, statuses });
    }
    // A one-off personal notification to one user's devices: {"user": id, "title", "body", "url"}.
    if (path === "/admin/push/user" && request.method === "POST") {
      const b = (await request.json().catch(() => null)) as { user?: string; title?: string; body?: string; url?: string; at?: string } | null;
      if (!b?.user || !b.body) return json({ error: "need user and body" }, 400);
      if (b.at) {  // ISO time: queue it for the cron instead of sending now
        if (isNaN(Date.parse(b.at))) return json({ error: "bad at" }, 400);
        await env.DB.prepare("INSERT INTO scheduled_push (user_id, send_at, title, body, url) VALUES (?, ?, ?, ?, ?)")
          .bind(b.user, new Date(b.at).toISOString(), (b.title || "Skwirl").slice(0, 60), b.body.slice(0, 240), b.url || "/").run();
        return json({ scheduled: new Date(b.at).toISOString() });
      }
      const { results } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_sub WHERE user_id = ?").bind(b.user).all<any>();
      const msg = { title: (b.title || "Skwirl").slice(0, 60), body: b.body.slice(0, 240), url: b.url || "/", tag: "owner-note" };
      const statuses = [];
      for (const s of results ?? []) statuses.push(await sendPush(env, s, msg).catch((e) => String(e)));
      return json({ devices: statuses.length, statuses });
    }
    // Start the cloud runner now and report GitHub's answer (204 = the token works).
    if (path === "/admin/runner/kick" && request.method === "POST") {
      if (!env.GH_DISPATCH_TOKEN) return json({ error: "GH_DISPATCH_TOKEN isn't set" }, 400);
      const r = await dispatchRunner(env);
      return json({ github_status: r.status, body: r.status === 204 ? "" : (await r.text()).slice(0, 300) });
    }

    if (path === "/admin/users" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { name?: string } | null;
      return json(await createUser(env, body?.name ?? ""), 201);
    }

    // The Mac worker hands over a finished note so the web library and the
    // Claude connector can serve it without the Mac being awake. Idempotent per
    // capture: a retried capture replaces its note instead of duplicating it.
    if (path === "/note" && request.method === "POST") {
      const b = (await request.json().catch(() => null)) as Record<string, any> | null;
      if (!b?.capture_id || !b?.title || !b?.markdown) {
        return json({ error: "need capture_id, title, markdown" }, 400);
      }
      // Optional cover image: base64 JPEG from the worker, size-capped here too.
      const thumbData = typeof b.thumb === "string" && b.thumb.length < 210_000 && /^[A-Za-z0-9+/=]+$/.test(b.thumb) ? b.thumb : null;
      const mentions = Array.isArray(b.mentions)
        ? b.mentions.filter((m: any) => m && typeof m.name === "string" && m.name.trim()).slice(0, 100)
        : [];
      const userId: string | null = b.user_id ?? null;
      // A processor that was mid-way when the account (or this capture) was deleted, or whose claim
      // was taken over by another runner, must not write the note back (B03).
      const live = await env.DB.prepare(
        "SELECT c.lease, (c.user_id IS NULL OR EXISTS (SELECT 1 FROM user u WHERE u.id = c.user_id)) AS has_user FROM capture c WHERE c.id = ? AND c.user_id IS ?",
      ).bind(b.capture_id, userId).first<{ lease: string | null; has_user: number }>();
      if (!live || !live.has_user) return json({ error: "capture or account no longer exists" }, 410);
      if (b.lease && live.lease && b.lease !== live.lease) return json({ error: "claim was taken over" }, 409);
      const prior = await env.DB.prepare("SELECT id FROM note WHERE capture_id = ?")
        .bind(b.capture_id).first<{ id: string }>();
      const noteId = prior?.id ?? id();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO note (id, user_id, capture_id, title, summary, topic, tools, mentions, permalink,
                             markdown, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(capture_id) DO UPDATE SET title=excluded.title, summary=excluded.summary,
             topic=excluded.topic, tools=excluded.tools, mentions=excluded.mentions,
             permalink=excluded.permalink, markdown=excluded.markdown`,
        ).bind(noteId, userId, b.capture_id, b.title, b.summary ?? null, b.topic ?? null,
               JSON.stringify(b.tools ?? []), JSON.stringify(mentions), b.permalink ?? null, b.markdown,
               new Date().toISOString()),
        env.DB.prepare("DELETE FROM note_fts WHERE note_id = ?").bind(noteId),
        env.DB.prepare(
          "INSERT INTO note_fts (title, summary, markdown, note_id, user_id) VALUES (?, ?, ?, ?, ?)",
        ).bind(b.title, b.summary ?? "", b.markdown, noteId, userId ?? ""),
      ]);
      if (thumbData) {
        const existingThumb = await env.DB.prepare("SELECT id FROM thumb WHERE note_id = ?").bind(noteId).first<{ id: string }>();
        const thumbId = existingThumb?.id ?? [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
        await env.DB.batch([
          env.DB.prepare("INSERT INTO thumb (id, note_id, data) VALUES (?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET data = excluded.data")
            .bind(thumbId, noteId, thumbData),
          env.DB.prepare("UPDATE note SET thumb_id = ? WHERE id = ?").bind(thumbId, noteId),
        ]);
      }
      // The person's own categories, picked while the note was read. If they changed their categories
      // since the claim, the version won't match and the next re-sort files it properly.
      if (Array.isArray(b.categories)) {
        const cats = await categoriesOf(env, userId);
        if (cats.names.length) await env.DB.batch(applyAiCategories(env, userId, noteId, b.categories, cats.names,
          Number(b.cat_version) === cats.version ? cats.version : -1));
      }
      // (Re)embed for meaning-based search; a re-processed note gets a fresh vector.
      await env.DB.prepare("DELETE FROM note_vec WHERE note_id = ?").bind(noteId).run();
      ctx.waitUntil(embedMissing(env, 5).catch((e) => console.log("embed", String(e))));
      return json({ id: noteId });
    }

    // Cut someone off and erase their data (abuse, or a leaked token).
    const revoke = path.match(/^\/admin\/users\/([^/]+)\/revoke$/);
    if (revoke && request.method === "POST") {
      await deleteUser(env, decodeURIComponent(revoke[1]), url.origin);
      return json({ ok: true });
    }

    // Pilot dashboard: one row per user (owner included as "owner").
    if (path === "/admin/stats" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT COALESCE(u.name, 'owner') AS name, u.id AS id,
           (SELECT COUNT(*) FROM capture c WHERE c.user_id IS u.id) AS saves,
           (SELECT COUNT(*) FROM capture c WHERE c.user_id IS u.id
              AND c.captured_at >= datetime('now','-7 days')) AS saves_7d,
           (SELECT COUNT(*) FROM note n WHERE n.user_id IS u.id) AS notes,
           (SELECT COUNT(*) FROM note n WHERE n.user_id IS u.id AND n.opens > 0) AS opened,
           (SELECT COUNT(*) FROM note n WHERE n.user_id IS u.id AND n.status='used') AS used,
           COALESCE(u.mcp_calls, 0) AS mcp_calls,
           (SELECT MAX(captured_at) FROM capture c WHERE c.user_id IS u.id) AS last_save
         FROM (SELECT id, name, mcp_calls FROM user UNION ALL SELECT NULL, NULL, 0) u`,
      ).all();
      return json({ users: results ?? [] });
    }

    // Dead letters: pending rows that hit MAX_ATTEMPTS and silently stopped being
    // offered by /pending. Listed here so failures can't hide, and /requeue
    // gives them a fresh set of attempts (e.g. after fixing a rate-limit bug).
    if (path === "/dead" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT id, permalink, captured_at, attempts, error FROM capture
         WHERE status='pending' AND attempts >= ? ORDER BY captured_at DESC`,
      )
        .bind(MAX_ATTEMPTS)
        .all();
      return json({ dead: results ?? [] });
    }

    if (path === "/requeue" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { since?: string } | null;
      const r = await env.DB.prepare(
        `UPDATE capture SET attempts=0, error=NULL
         WHERE status='pending' AND attempts >= ? AND captured_at >= ?`,
      )
        .bind(MAX_ATTEMPTS, body?.since ?? "")
        .run();
      return json({ requeued: r.meta.changes });
    }

    if (path.startsWith("/status/") && request.method === "GET") {
      const captureId = decodeURIComponent(path.slice("/status/".length));
      const row = await env.DB.prepare(
        "SELECT status, attempts, error, title FROM capture WHERE id = ?",
      )
        .bind(captureId)
        .first<{ status: string; attempts: number; error: string | null; title: string | null }>();
      if (!row) return json({ error: "unknown id" }, 404);

      const dead = row.status === "pending" && row.attempts >= MAX_ATTEMPTS;
      return json({
        status: dead ? "failed" : row.status,
        title: row.title,
        error: row.error,
      });
    }

    if (path.startsWith("/media/") && request.method === "GET") {
      if (!env.MEDIA) return json({ error: "R2 not configured on this deploy" }, 501);
      const key = decodeURIComponent(path.slice("/media/".length));
      const object = await env.MEDIA.get(key);
      if (!object) return new Response("not found", { status: 404 });
      return new Response(object.body, {
        headers: { "content-type": object.httpMetadata?.contentType ?? "video/mp4" },
      });
    }

    return new Response("not found", { status: 404 });
  },
};

/**
 * A shared reel arrived in the DMs.
 *
 * The CDN URL in the payload expires, so it is copied into R2 *inside this
 * request* rather than left for the Mac worker's next poll. Meta also usually
 * omits a permalink for shares, so one is reconstructed from the media id and
 * flagged as unverified — a note you cannot click back to is a note you cannot
 * trust.
 */
async function handleInstagram(raw: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: true }); // never make Meta retry a malformed body
  }

  const work: Promise<unknown>[] = [];

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const message = event.message;
      if (!message || message.is_echo) continue; // our own sends come back as echoes

      for (const attachment of message.attachments ?? []) {
        const cdnUrl: string | undefined = attachment.payload?.url;
        const mediaId: string | undefined =
          attachment.payload?.reel_video_id ?? attachment.payload?.id;

        let permalink: string | null = null;
        let permalinkOk = true;
        if (attachment.payload?.permalink_url) {
          permalink = attachment.payload.permalink_url;
        } else if (mediaId) {
          const shortcode = mediaIdToShortcode(String(mediaId));
          if (shortcode) {
            permalink = `https://www.instagram.com/reel/${shortcode}/`;
            permalinkOk = false; // derived, not received
          }
        }

        // Without R2 configured there is nowhere to put the media, so it is
        // left for the Mac to fetch directly from media_url — which works
        // right up until that CDN link expires. Add the R2 binding (and its
        // required payment method) once Phase 2 is worth that trade.
        let mediaKey: string | null = null;
        if (cdnUrl && env.MEDIA) {
          mediaKey = `ig/${Date.now()}-${id()}.mp4`;
          work.push(stashMedia(env, cdnUrl, mediaKey));
        }

        work.push(
          insertCapture(env, {
            source: "ig_dm",
            permalink,
            permalink_ok: permalinkOk,
            media_url: cdnUrl ?? null,
            media_key: mediaKey,
            note: message.text || null,
          }),
        );
      }

      // A bare link pasted into the DM, with no attachment.
      if (!message.attachments?.length && typeof message.text === "string") {
        const match = message.text.match(/https?:\/\/\S+/);
        if (match) {
          work.push(insertCapture(env, { source: "ig_dm", permalink: match[0] }));
        }
      }
    }
  }

  // Meta retries anything that is not answered promptly, and a retry would
  // duplicate the capture. Acknowledge now, finish the copies after.
  ctx.waitUntil(Promise.allSettled(work));
  return json({ ok: true });
}

async function stashMedia(env: Env, cdnUrl: string, key: string): Promise<void> {
  if (!env.MEDIA) return;
  const response = await fetch(cdnUrl);
  if (!response.ok || !response.body) return;
  await env.MEDIA.put(key, response.body, {
    httpMetadata: { contentType: response.headers.get("content-type") ?? "video/mp4" },
  });
}

/** How long until a daily-limited key can afford a few whole notes: Groq's wait for the failed
 *  request, scaled from the tokens it asked for. Capped at 12 h. A finished note averages ~9.1k tokens
 *  (9 Nov 2026). Aim for ~3 notes, not 1: the window is a rolling 24 h, so each hour hands back what
 *  was spent that hour yesterday. Waiting for one note's worth locked one person's key (9-10 Nov) into a
 *  trickle that started a reel every hour, ran out mid-reel and copied itself day to day: ~70k tokens
 *  in 16 h, zero notes. Bigger, rarer batches finish what they start. */
const NOTE_TOKENS = 30_000;
export function noteWaitMs(error: string): number {
  const wait = groqWaitMs(error), asked = Number((error.match(/Requested (\d+)/) || [])[1]) || 0;
  if (!wait) return 0;
  const scale = asked > 0 ? Math.min(Math.max(NOTE_TOKENS / asked, 1), 12) : 1;
  return Math.min(Math.round(wait * scale), 12 * 3_600_000);
}

/** Groq's "Please try again in 1h2m3.4s" as milliseconds (0 if absent). */
export function groqWaitMs(error: string): number {
  const m = error.match(/try again in ((?:\d+h)?(?:\d+m(?!s))?(?:[\d.]+m?s)?)/i);
  if (!m || !m[1]) return 0;
  const part = (u: string) => Number((m[1].match(new RegExp("([\\d.]+)" + u)) || [])[1] || 0);
  if (/\dms$/.test(m[1])) return part("ms");
  return Math.round((part("h") * 3600 + part("m") * 60 + part("s")) * 1000);
}

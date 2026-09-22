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

import { handleMcp } from "./mcp";
import { adminOverview, createUser, decryptKey, deleteUser, handleV1, logEvent, userFromBearer } from "./v1";

export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  STASH_SECRET: string;
  IG_VERIFY_TOKEN?: string;
  IG_APP_SECRET?: string;
  IG_ACCESS_TOKEN?: string;
  JOIN_CODE?: string; // shared invite code for /join; unset = self-serve joining is closed
  NTFY_TOPIC?: string; // set to get phone alerts when the queue is stuck, captures fail, or someone joins
  MAX_JOIN?: string; // cap on accounts created via /join (default 50)
}

const MAX_ATTEMPTS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
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

/** Cron (every 30 min): tell the owner when something needs a human. */
async function checkHealth(env: Env): Promise<void> {
  if (!env.NTFY_TOPIC) return;
  const { overview: o } = await adminOverview(env);
  const problems: [string, string][] = [];
  const oldest = o?.oldest_waiting ? Date.now() - Date.parse(o.oldest_waiting as string) : 0;
  if (oldest > 60 * 60_000) problems.push(["stuck", `Queue stuck: oldest save has waited ${Math.round(oldest / 60_000)} min (${o!.waiting} waiting). Is the runner or the Mac down?`]);
  if (Number(o?.failed) > 0) problems.push(["failed", `${o!.failed} save(s) gave up after 3 tries. Check /v1/admin/overview, then POST /requeue.`]);
  const fresh = await env.DB.prepare("SELECT COUNT(*) n FROM user WHERE created_at > ?")
    .bind(new Date(Date.now() - 30 * 60_000).toISOString()).first<{ n: number }>();
  if ((fresh?.n ?? 0) > 0) problems.push(["joined:" + new Date().toISOString().slice(0, 13), `${fresh!.n} new user(s) joined Stash.`]);
  for (const [key, message] of problems) {
    // Same problem at most every 6 hours (a join is its own key per hour).
    const last = await env.DB.prepare("SELECT at FROM alert_state WHERE key = ?").bind(key).first<{ at: string }>();
    if (last && Date.now() - Date.parse(last.at) < 6 * 3600_000) continue;
    await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, { method: "POST", body: message, headers: { Title: "Stash" } }).catch(() => {});
    await env.DB.prepare("INSERT INTO alert_state (key, at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at")
      .bind(key, new Date().toISOString()).run();
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkHealth(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

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

    if (path.startsWith("/mcp/")) return handleMcp(request, env, path);

    // ---- self-serve join with the shared invite code -------------------
    if (path === "/join" && request.method === "POST") {
      if (!env.JOIN_CODE) return json({ error: "Joining is closed right now." }, 403);
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) n FROM join_attempt WHERE ip = ? AND at > ?",
      ).bind(ip, new Date(Date.now() - 10 * 60_000).toISOString()).first<{ n: number }>();
      if ((recent?.n ?? 0) >= 8) return json({ error: "Too many tries. Wait a few minutes." }, 429);

      const body = (await request.json().catch(() => null)) as { name?: string; code?: string } | null;
      const name = (body?.name ?? "").trim().slice(0, 40);
      if (!name) return json({ error: "Tell us your name." }, 400);
      if (!safeEqual((body?.code ?? "").trim(), env.JOIN_CODE)) {
        await env.DB.prepare("INSERT INTO join_attempt (ip, at) VALUES (?, ?)").bind(ip, new Date().toISOString()).run();
        return json({ error: "That invite code isn't right." }, 403);
      }
      const joined = await env.DB.prepare("SELECT COUNT(*) n FROM user WHERE joined_via = 'invite'").first<{ n: number }>();
      if ((joined?.n ?? 0) >= (Number(env.MAX_JOIN) || 50)) return json({ error: "We're full for now." }, 403);
      const user = await createUser(env, name);
      await env.DB.prepare("UPDATE user SET joined_via = 'invite' WHERE id = ?").bind(user.id).run();
      await logEvent(env, user.id, "api", "join");
      return json({ token: user.token }, 201);
    }

    // ---- per-user API (bearer token) -----------------------------------
    if (path.startsWith("/v1/")) {
      const userId = await userFromBearer(request, env);
      if (userId === undefined) return json({ error: "unauthorized" }, 401);
      return handleV1(request, env, path, userId, insertCapture);
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
      // A claim older than 30 min means that worker died; hand the capture out again.
      const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
      const row = await env.DB.prepare(
        `SELECT * FROM capture
         WHERE (status='pending' OR (status='claimed' AND (claimed_at IS NULL OR claimed_at < ?)))
           AND attempts < ?
         ${guestsOnly ? "AND user_id IS NOT NULL" : ""}
         ORDER BY captured_at LIMIT 1`,
      )
        .bind(staleBefore, MAX_ATTEMPTS)
        .first();
      if (!row) return json({ capture: null });
      await env.DB.prepare(
        "UPDATE capture SET status='claimed', claimed_at=?, attempts = attempts + 1 WHERE id = ?",
      )
        .bind(new Date().toISOString(), row.id)
        .run();
      // A user who brought their own Groq key is processed on it. It rides this
      // admin-authenticated response to the Mac worker only; it is never logged.
      const owner = row.user_id
        ? await env.DB.prepare("SELECT groq_key_enc FROM user WHERE id = ?").bind(row.user_id).first<{ groq_key_enc: string | null }>()
        : null;
      const groq_key = owner?.groq_key_enc ? await decryptKey(env, owner.groq_key_enc).catch(() => null) : null;
      return json({ capture: { ...row, groq_key } });
    }

    if (path === "/complete" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as
        | { id?: string; ok?: boolean; error?: string; title?: string; usage?: any[] }
        | null;
      if (!body?.id) return json({ error: "need id" }, 400);

      // Attribute each AI call this capture caused to the person who saved it.
      if (Array.isArray(body.usage) && body.usage.length) {
        const cap = await env.DB.prepare("SELECT user_id FROM capture WHERE id = ?").bind(body.id).first<{ user_id: string | null }>();
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
          "UPDATE capture SET status='done', processed_at=?, error=NULL, title=? WHERE id=?",
        )
          .bind(new Date().toISOString(), (body.title ?? "").slice(0, 300) || null, body.id)
          .run();
      } else {
        // Back to pending, not failed: transient breakage should retry itself.
        // Once MAX_ATTEMPTS is hit, /status reports it as a dead letter — see below.
        await env.DB.prepare("UPDATE capture SET status='pending', error=? WHERE id=?")
          .bind((body.error ?? "").slice(0, 2000), body.id)
          .run();
      }
      return json({ ok: true });
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
      const mentions = Array.isArray(b.mentions)
        ? b.mentions.filter((m: any) => m && typeof m.name === "string" && m.name.trim()).slice(0, 100)
        : [];
      const userId: string | null = b.user_id ?? null;
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
      return json({ id: noteId });
    }

    // Cut someone off and erase their data (abuse, or a leaked token).
    const revoke = path.match(/^\/admin\/users\/([^/]+)\/revoke$/);
    if (revoke && request.method === "POST") {
      await deleteUser(env, decodeURIComponent(revoke[1]));
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

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

export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  STASH_SECRET: string;
  IG_VERIFY_TOKEN?: string;
  IG_APP_SECRET?: string;
  IG_ACCESS_TOKEN?: string;
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
  },
): Promise<{ id: string; created: boolean }> {
  if (row.permalink) {
    const existing = await env.DB.prepare("SELECT id FROM capture WHERE permalink = ?")
      .bind(row.permalink)
      .first<{ id: string }>();
    if (existing) return { id: existing.id, created: false };
  }

  const captureId = id();
  await env.DB.prepare(
    `INSERT INTO capture (id, source, permalink, permalink_ok, media_url, media_key,
                          note, status, attempts, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
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
    )
    .run();
  return { id: captureId, created: true };
}

export default {
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
      const row = await env.DB.prepare(
        `SELECT * FROM capture WHERE status='pending' AND attempts < ?
         ORDER BY captured_at LIMIT 1`,
      )
        .bind(MAX_ATTEMPTS)
        .first();
      if (!row) return json({ capture: null });
      await env.DB.prepare(
        "UPDATE capture SET status='claimed', attempts = attempts + 1 WHERE id = ?",
      )
        .bind(row.id)
        .run();
      return json({ capture: row });
    }

    if (path === "/complete" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as
        | { id?: string; ok?: boolean; error?: string; title?: string }
        | null;
      if (!body?.id) return json({ error: "need id" }, 400);

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

/**
 * Web Push (works for home-screen apps on iPhone, iOS 16.4+, and in Chrome/Edge/Firefox).
 * Hand-rolled because the usual library needs Node: payloads are encrypted per RFC 8291
 * (aes128gcm) and signed with VAPID (RFC 8292) using WebCrypto. The key pair is the
 * VAPID_JWK secret (P-256, private JWK); the public half is derived from it.
 *
 * What we send: a progress note at most once every 20 hours, only in the person's daytime
 * ("12 more of your saves are ready"), and "all your old saves are in" when an import ends.
 */
import type { Env } from "./index";

const enc = (s: string) => new TextEncoder().encode(s);
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** The application server key the browser subscribes with (uncompressed P-256 point). */
export function vapidPublic(env: Env): string | null {
  if (!env.VAPID_JWK) return null;
  const j = JSON.parse(env.VAPID_JWK);
  return b64u(concat(new Uint8Array([4]), unb64u(j.x), unb64u(j.y)));
}

// Only real push services, so a stored "endpoint" can't make the Worker call anywhere else.
const PUSH_HOSTS = [".push.apple.com", "fcm.googleapis.com", ".push.services.mozilla.com", ".notify.windows.com"];
export const okEndpoint = (u: string) => {
  try { const h = new URL(u); return h.protocol === "https:" && PUSH_HOSTS.some((s) => h.host === s.replace(/^\./, "") || h.host.endsWith(s)); }
  catch { return false; }
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** RFC 8291: one aes128gcm record, keyed from an ephemeral ECDH pair and the browser's keys. */
export async function encryptPayload(payload: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const ua = unb64u(p256dh), authSecret = unb64u(auth);
  const as = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPub = new Uint8Array((await crypto.subtle.exportKey("raw", as.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as any, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc("WebPush: info\0"), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc(payload), new Uint8Array([2]))));
  const header = new Uint8Array(16 + 4 + 1 + asPub.length);
  header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = asPub.length; header.set(asPub, 21);
  return concat(header, body);
}

/** RFC 8292: a short-lived ES256 JWT for the push service's origin. */
async function vapidHeader(env: Env, endpoint: string): Promise<string> {
  const j = JSON.parse(env.VAPID_JWK!);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: j.x, y: j.y, d: j.d }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const h = b64u(enc(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const c = b64u(enc(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.PUBLIC_URL ?? "https://skwirl.parthakholkar.com",
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc(`${h}.${c}`));
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${vapidPublic(env)}`;
}

type Sub = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Send one message to one device. A gone subscription (404/410) is deleted. Returns the status. */
export async function sendPush(env: Env, sub: Sub, msg: PushMessage): Promise<number> {
  if (!env.VAPID_JWK || !okEndpoint(sub.endpoint)) return 0;
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(env, sub.endpoint), "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal",
    },
    body: await encryptPayload(JSON.stringify(msg), sub.p256dh, sub.auth),
  });
  if (r.status === 404 || r.status === 410) await env.DB.prepare("DELETE FROM push_sub WHERE endpoint = ?").bind(sub.endpoint).run();
  else if (r.status >= 400) console.log("push failed", r.status, (await r.text()).slice(0, 200));
  return r.status;
}

/** Every device a person turned notifications on for. userId null = the owner. */
export async function pushUser(env: Env, userId: string | null, msg: PushMessage): Promise<void> {
  if (!env.VAPID_JWK) return;
  const { results } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_sub WHERE user_id IS ?").bind(userId).all<Sub>();
  for (const s of results ?? []) await sendPush(env, s, msg).catch(() => 0);
}

/** Cron: "N more of your saves are ready", at most once per 20 h, 9am-9pm their time, N >= 5. */
export async function pushProgress(env: Env): Promise<void> {
  if (!env.VAPID_JWK) return;
  const now = new Date();
  const { results } = await env.DB.prepare(
    `SELECT p.endpoint, p.p256dh, p.auth, p.user_id,
       (SELECT COUNT(*) FROM note n WHERE n.user_id IS p.user_id AND n.created_at > COALESCE(p.last_sent_at, p.created_at)) fresh,
       (SELECT tz FROM visit v WHERE v.user_id IS p.user_id AND v.tz IS NOT NULL ORDER BY v.started_at DESC LIMIT 1) tz
     FROM push_sub p WHERE p.last_sent_at IS NULL OR p.last_sent_at < ?`,
  ).bind(new Date(now.getTime() - 20 * 3600_000).toISOString()).all<Sub & { user_id: string | null; fresh: number; tz: string | null }>();
  for (const s of results ?? []) {
    if (s.fresh < 5) continue;
    let hour = now.getUTCHours();
    try { hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: s.tz ?? "UTC" }).format(now)); } catch {}
    if (hour < 9 || hour >= 21) continue;
    const status = await sendPush(env, s, { title: "Skwirl", body: `${s.fresh} more of your saves are ready to read.`, url: "/", tag: "progress" }).catch(() => 0);
    if (status >= 200 && status < 300) await env.DB.prepare("UPDATE push_sub SET last_sent_at = ? WHERE endpoint = ?").bind(now.toISOString(), s.endpoint).run();
  }
}

/** Cron: send queued one-off notifications whose time has come (see /admin/push/user with "at"). */
export async function sendScheduled(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare("SELECT id, user_id, title, body, url FROM scheduled_push WHERE sent_at IS NULL AND send_at <= ?")
    .bind(now).all<{ id: number; user_id: string; title: string | null; body: string; url: string | null }>();
  for (const r of results ?? []) {
    await env.DB.prepare("UPDATE scheduled_push SET sent_at = ? WHERE id = ?").bind(now, r.id).run();  // mark first: never twice
    await pushUser(env, r.user_id, { title: r.title || "Skwirl", body: r.body, url: r.url || "/", tag: "owner-note" }).catch(() => {});
  }
}

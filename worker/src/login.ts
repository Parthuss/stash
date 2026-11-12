/**
 * Accounts you can get back into. Sign in (or create an account) with your email and a 6-digit
 * code we email you, or with Google (src/google.ts). No passwords to store or reset.
 *
 * Codes: 10 minutes, single use, 5 wrong tries, one live code per address (a new one replaces it),
 * HMAC'd with STASH_SECRET at rest (6 digits are too few for a plain hash). Requests are limited
 * per network (in index.ts) and per address (here). Spending a code mints an extra device token, so
 * the phone Shortcut, AI apps and other signed-in devices keep working.
 *
 * Also the older one-time #login= links the Telegram bot hands out (/login).
 */
import type { Env } from "./index";

const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const CODE_TTL_MS = 10 * 60_000, CODE_TRIES = 5;
export const PER_EMAIL_HOUR = 5;  // codes sent to one address per hour

/** One spelling per address: trimmed, lowercased. null if it isn't an email. Gmail dots and +tags
 *  are left alone (they can be different inboxes elsewhere, and people expect what they typed). */
export function normEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.normalize("NFC").trim().toLowerCase();
  return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

// ---- sending ---------------------------------------------------------------------------------
/** Resend (free plan, a plain fetch: works on Workers Free) or Cloudflare's [[send_email]] binding
 *  (Workers Paid). Either needs EMAIL_FROM, an address on a domain verified with that sender. */
export const emailEnabled = (env: Env) => Boolean(env.EMAIL_FROM && (env.RESEND_API_KEY || env.EMAIL));

type Mail = { to: string; subject: string; text: string; html: string };
export async function sendEmail(env: Env, m: Mail): Promise<void> {
  if (!emailEnabled(env)) throw new Error("no email sender");
  if (env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `Skwirl <${env.EMAIL_FROM}>`, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    });
    if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  await env.EMAIL!.send({ to: m.to, from: { email: env.EMAIL_FROM!, name: "Skwirl" }, subject: m.subject, text: m.text, html: m.html });
}

// ---- rate limits (rows in join_attempt, keyed by a prefixed string) ----------------------------
/** Count this key's hits in the window; if under max, record one and return false. */
export async function limited(env: Env, key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const n = (await env.DB.prepare("SELECT COUNT(*) n FROM join_attempt WHERE ip = ? AND at > ?")
    .bind(key, new Date(now - windowMs).toISOString()).first<{ n: number }>())?.n ?? 0;
  if (n >= max) return true;
  await env.DB.prepare("INSERT INTO join_attempt (ip, at) VALUES (?, ?)").bind(key, new Date(now).toISOString()).run();
  return false;
}
/** Has this key already hit max in the window? (Doesn't record anything.) */
export async function over(env: Env, key: string, max: number, windowMs: number): Promise<boolean> {
  const n = (await env.DB.prepare("SELECT COUNT(*) n FROM join_attempt WHERE ip = ? AND at > ?")
    .bind(key, new Date(Date.now() - windowMs).toISOString()).first<{ n: number }>())?.n ?? 0;
  return n >= max;
}
export const note = (env: Env, key: string) =>
  env.DB.prepare("INSERT INTO join_attempt (ip, at) VALUES (?, ?)").bind(key, new Date().toISOString()).run();

// ---- codes -----------------------------------------------------------------------------------
export type Purpose = "signin" | "add";
const emailHash = (email: string) => sha256("email|" + email);
async function codeHash(env: Env, email: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STASH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`otp|${email}|${code}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Uniform 000000-999999 (rejection sampling, no modulo bias). */
export function sixDigits(): string {
  const buf = new Uint32Array(1);
  for (;;) { crypto.getRandomValues(buf); if (buf[0] < 4_294_000_000) return String(buf[0] % 1_000_000).padStart(6, "0"); }
}

/** Make and store a fresh code for this address (replacing any older one). Returns the code, or
 *  null when the address has had too many codes this hour. */
export async function newCode(env: Env, email: string, purpose: Purpose, userId: string | null = null): Promise<string | null> {
  const h = await emailHash(email);
  if (await limited(env, `otpm:${h}`, PER_EMAIL_HOUR, 3600_000)) return null;
  const code = sixDigits(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM email_code WHERE expires_at < ?").bind(new Date(now).toISOString()),
    env.DB.prepare("INSERT OR REPLACE INTO email_code (email_hash, purpose, user_id, code_hash, expires_at, tries) VALUES (?, ?, ?, ?, ?, 0)")
      .bind(h, purpose, userId, await codeHash(env, email, code), new Date(now + CODE_TTL_MS).toISOString()),
  ]);
  return code;
}

export type Check = { ok: true; userId: string | null } | { ok: false; error: string; left?: number };
const MSG_GONE = "That code has expired or was already used. Ask for a new one.";

/** Is this the live code for this address? A wrong guess uses up one of the 5 tries (the 5th
 *  kills the code). With consume, a right code is spent atomically, so it works exactly once. */
export async function checkCode(env: Env, email: string, purpose: Purpose, code: unknown, consume: boolean): Promise<Check> {
  const h = await emailHash(email), now = new Date().toISOString();
  const row = await env.DB.prepare("SELECT code_hash, expires_at, tries, user_id FROM email_code WHERE email_hash = ? AND purpose = ?")
    .bind(h, purpose).first<{ code_hash: string; expires_at: string; tries: number; user_id: string | null }>();
  if (!row || row.expires_at <= now || row.tries >= CODE_TRIES) {
    if (row) await env.DB.prepare("DELETE FROM email_code WHERE email_hash = ? AND purpose = ?").bind(h, purpose).run();
    return { ok: false, error: MSG_GONE };
  }
  const clean = String(code ?? "").replace(/\D/g, "");
  const given = /^\d{6}$/.test(clean) ? await codeHash(env, email, clean) : "";
  if (given !== row.code_hash) {
    const tries = row.tries + 1;
    if (tries >= CODE_TRIES) {
      await env.DB.prepare("DELETE FROM email_code WHERE email_hash = ? AND purpose = ?").bind(h, purpose).run();
      return { ok: false, error: "Too many wrong codes. Ask for a new one.", left: 0 };
    }
    await env.DB.prepare("UPDATE email_code SET tries = ? WHERE email_hash = ? AND purpose = ?").bind(tries, h, purpose).run();
    return { ok: false, error: `That code isn't right. ${CODE_TRIES - tries} ${CODE_TRIES - tries === 1 ? "try" : "tries"} left.`, left: CODE_TRIES - tries };
  }
  if (!consume) return { ok: true, userId: row.user_id };
  const spent = await env.DB.prepare("DELETE FROM email_code WHERE email_hash = ? AND purpose = ? AND code_hash = ? AND expires_at > ? RETURNING user_id")
    .bind(h, purpose, given, now).first<{ user_id: string | null }>();
  return spent ? { ok: true, userId: spent.user_id } : { ok: false, error: MSG_GONE };
}

// ---- accounts --------------------------------------------------------------------------------
export type Account = { id: string; name: string; email_verified: number };
/** The account an address signs in to: a verified owner first, then the most recently active
 *  account that typed it in. Never by name. */
export const accountByEmail = (env: Env, email: string) =>
  env.DB.prepare("SELECT id, name, email_verified FROM user WHERE email = ? ORDER BY email_verified DESC, last_seen DESC, created_at LIMIT 1")
    .bind(email).first<Account>();

/** A new device token for this account (the account's other tokens keep working). */
export async function mintDeviceToken(env: Env, userId: string): Promise<string> {
  const token = "stk_" + hex(24);
  await env.DB.prepare("INSERT INTO device_token (token_hash, user_id, created_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, new Date().toISOString()).run();
  return token;
}

const escHtml = (s: string) => s.replace(/[<>&"]/g, "");
/** The email with the code. Sign-in and sign-up get the same email apart from the greeting, so
 *  nothing in the page's answer says whether an address has an account. */
export function codeEmail(to: string, code: string, name: string | null, purpose: Purpose): Mail {
  const why = purpose === "add" ? "to add this email to your Skwirl account" : name ? "to sign in to Skwirl" : "to create your Skwirl account";
  const hi = name ? `Hi ${name},` : "Hi,";
  return {
    to, subject: `${code} is your Skwirl code`,
    text: `${hi}\n\nYour code ${why}:\n\n${code}\n\nIt works once, for 10 minutes.\n\nDidn't ask for this? Ignore this email, nothing changes.\n\nSkwirl\nhttps://skwirl.app`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#1d1b2e;max-width:460px">` +
      `<p>${escHtml(hi)}</p><p>Your code ${why}:</p>` +
      `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:18px 0">${code}</p>` +
      `<p>It works once, for 10 minutes.</p><p style="color:#777;font-size:14px">Didn't ask for this? Ignore this email, nothing changes.</p>` +
      `<p style="color:#777;font-size:14px">Skwirl · <a href="https://skwirl.app" style="color:#777">skwirl.app</a></p></div>`,
  };
}

// ---- Telegram /login links (unchanged) ---------------------------------------------------------
export async function loginLink(env: Env, userId: string, origin: string): Promise<string> {
  const code = hex(16), now = new Date();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_code WHERE expires_at < ?").bind(now.toISOString()),
    env.DB.prepare("INSERT INTO login_code (code_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(code), userId, new Date(now.getTime() + 30 * 60_000).toISOString()),
  ]);
  return `${origin}/#login=${code}`;
}

/** Spend a link code: returns a fresh token for that person, or null if it's wrong or used. */
export async function redeemLogin(env: Env, code: string): Promise<string | null> {
  if (!/^[0-9a-f]{32}$/.test(code)) return null;
  const row = await env.DB.prepare("DELETE FROM login_code WHERE code_hash = ? AND expires_at > ? RETURNING user_id")
    .bind(await sha256(code), new Date().toISOString()).first<{ user_id: string }>();
  return row ? mintDeviceToken(env, row.user_id) : null;
}

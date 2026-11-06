/**
 * Getting back in without the sign-in link. A one-time code (30 min) reaches the person by
 * email (needs the EMAIL send binding, which needs Workers Paid) or from the Telegram bot
 * (/login). Redeeming it mints an extra device token, so the original link and the phone
 * Shortcut keep working.
 */
import type { Env } from "./index";
import { sha256 } from "./v1";

const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function loginLink(env: Env, userId: string, origin: string): Promise<string> {
  const code = hex(16), now = new Date();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_code WHERE expires_at < ?").bind(now.toISOString()),
    env.DB.prepare("INSERT INTO login_code (code_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(code), userId, new Date(now.getTime() + 30 * 60_000).toISOString()),
  ]);
  return `${origin}/#login=${code}`;
}

/** Spend a code: returns a fresh token for that person, or null if it's wrong or used. */
export async function redeemLogin(env: Env, code: string): Promise<string | null> {
  if (!/^[0-9a-f]{32}$/.test(code)) return null;
  const hash = await sha256(code);
  const row = await env.DB.prepare("DELETE FROM login_code WHERE code_hash = ? AND expires_at > ? RETURNING user_id")
    .bind(hash, new Date().toISOString()).first<{ user_id: string }>();
  if (!row) return null;
  const token = "stk_" + hex(24);
  await env.DB.prepare("INSERT INTO device_token (token_hash, user_id, created_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), row.user_id, new Date().toISOString()).run();
  return token;
}

export const emailEnabled = (env: Env) => Boolean(env.EMAIL && env.EMAIL_FROM);

/** Email a sign-in link if that address belongs to someone. Says nothing either way. */
export async function emailLogin(env: Env, email: string, origin: string): Promise<void> {
  const user = await env.DB.prepare("SELECT id, name FROM user WHERE lower(email) = lower(?) LIMIT 1").bind(email).first<{ id: string; name: string }>();
  if (!user || !emailEnabled(env)) return;
  const link = await loginLink(env, user.id, origin);
  await env.EMAIL!.send({
    to: email, from: { email: env.EMAIL_FROM!, name: "Skwirl" }, subject: "Your Skwirl sign-in link",
    text: `Hi ${user.name},\n\nHere's your link to get back into Skwirl:\n${link}\n\nIt works once, for 30 minutes. Your old link and your phone Shortcut keep working too.\n\nDidn't ask for this? Ignore it, nothing changes.\n\nSkwirl`,
    html: `<p>Hi ${user.name.replace(/[<>&"]/g, "")},</p><p>Here's your link to get back into Skwirl:</p><p><a href="${link}">Sign in to Skwirl</a></p><p>It works once, for 30 minutes. Your old link and your phone Shortcut keep working too.</p><p style="color:#777">Didn't ask for this? Ignore it, nothing changes.</p>`,
  });
}

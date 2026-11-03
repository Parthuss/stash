/**
 * Save by Telegram: send or forward a reel link to the Skwirl bot and it's saved.
 *
 * Setup (owner, once): create a bot with @BotFather, then
 *   npx wrangler secret put TELEGRAM_BOT_TOKEN -c wrangler.local.toml
 *   curl -X POST https://<site>/admin/telegram/setup -H "X-Stash-Secret: $STASH_SECRET"
 * Linking (each person): Set up → "Connect Telegram" opens t.me/<bot>?start=<one-time code>.
 * Telegram signs every webhook call with the secret_token we registered (derived from STASH_SECRET).
 */
import type { Env } from "./index";
import { sha256 } from "./v1";

const OWNER = "__owner__";
const api = (env: Env, method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
const say = (env: Env, chat: number | string, text: string) => api(env, "sendMessage", { chat_id: chat, text, disable_web_page_preview: true }).catch(() => {});
const hookSecret = async (env: Env) => (await sha256("telegram|" + env.STASH_SECRET)).slice(0, 48);

let botName: string | null = null; // per isolate
async function botUsername(env: Env): Promise<string | null> {
  if (botName || !env.TELEGRAM_BOT_TOKEN) return botName;
  const r = (await (await api(env, "getMe", {})).json().catch(() => null)) as any;
  return (botName = r?.result?.username ?? null);
}

/** One-time deep link that connects a Telegram chat to this user. */
export async function telegramLink(env: Env, userId: string | null): Promise<string | null> {
  const bot = await botUsername(env);
  if (!bot) return null;
  const code = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("INSERT INTO telegram_link (code_hash, user_key, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(code), userId ?? OWNER, new Date(Date.now() + 30 * 60_000).toISOString()).run();
  return `https://t.me/${bot}?start=${code}`;
}

export const telegramConnected = async (env: Env, userId: string | null) =>
  Boolean(await env.DB.prepare("SELECT 1 FROM telegram_chat WHERE user_key = ?").bind(userId ?? OWNER).first());

export const unlinkTelegram = (env: Env, userId: string | null) =>
  env.DB.prepare("DELETE FROM telegram_chat WHERE user_key = ?").bind(userId ?? OWNER).run();

export async function setupTelegram(env: Env, origin: string): Promise<Response> {
  if (!env.TELEGRAM_BOT_TOKEN) return new Response("Set the TELEGRAM_BOT_TOKEN secret first.", { status: 400 });
  const r = await api(env, "setWebhook", { url: `${origin}/webhook/telegram`, secret_token: await hookSecret(env), allowed_updates: ["message"], drop_pending_updates: true });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}

type Save = (userId: string | null, url: string) => Promise<Response>;

export async function handleTelegram(request: Request, env: Env, save: Save): Promise<Response> {
  if (!env.TELEGRAM_BOT_TOKEN || request.headers.get("x-telegram-bot-api-secret-token") !== (await hookSecret(env))) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await request.json().catch(() => null)) as any;
  const msg = update?.message;
  if (!msg?.chat?.id) return new Response("ok"); // always 200, or Telegram retries forever
  const chat = String(msg.chat.id);
  const text: string = msg.text ?? msg.caption ?? "";

  const start = text.match(/^\/start(?:\s+([0-9a-f]{32}))?/);
  if (start) {
    if (!start[1]) {
      await say(env, chat, "Hi! To connect this chat, open Skwirl → Set up → Save from Telegram, and tap Connect Telegram.");
      return new Response("ok");
    }
    const hash = await sha256(start[1]);
    const link = await env.DB.prepare("SELECT user_key FROM telegram_link WHERE code_hash = ? AND expires_at > ?")
      .bind(hash, new Date().toISOString()).first<{ user_key: string }>();
    await env.DB.prepare("DELETE FROM telegram_link WHERE code_hash = ? OR expires_at < ?").bind(hash, new Date().toISOString()).run();
    if (!link) { await say(env, chat, "That connect link has expired. Tap Connect Telegram in Skwirl's Set up again."); return new Response("ok"); }
    await env.DB.prepare("INSERT INTO telegram_chat (chat_id, user_key) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET user_key = excluded.user_key")
      .bind(chat, link.user_key).run();
    await say(env, chat, "Connected to Skwirl ✓\nSend or forward me any Instagram, TikTok, YouTube, X or Threads link and I'll save it.");
    return new Response("ok");
  }
  if (/^\/stop\b/.test(text)) {
    await env.DB.prepare("DELETE FROM telegram_chat WHERE chat_id = ?").bind(chat).run();
    await say(env, chat, "Disconnected. This chat won't save to Skwirl any more.");
    return new Response("ok");
  }

  const row = await env.DB.prepare("SELECT user_key FROM telegram_chat WHERE chat_id = ?").bind(chat).first<{ user_key: string }>();
  if (!row) { await say(env, chat, "This chat isn't connected yet. Open Skwirl → Set up → Save from Telegram."); return new Response("ok"); }
  const urls = [...new Set((text.match(/https?:\/\/[^\s<>"]+/g) ?? []).slice(0, 5))];
  if (!urls.length) { await say(env, chat, "Send me a link to a reel or post and I'll save it."); return new Response("ok"); }
  const userId = row.user_key === OWNER ? null : row.user_key;
  const replies: string[] = [];
  for (const u of urls) {
    const res = await save(userId, u);
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    replies.push(res.ok ? (res.status === 202 ? "Saved ✓ Your note will be ready in a few minutes." : "Already in your Skwirl.") : b.error ?? "Couldn't save that one.");
  }
  await say(env, chat, [...new Set(replies)].join("\n"));
  return new Response("ok");
}

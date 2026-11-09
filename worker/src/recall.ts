/**
 * Recall for Claude Code: the Skwirl plugin's UserPromptSubmit hook posts each prompt here and
 * whatever comes back is handed to Claude as context. Leaving it to Claude to search on its own
 * didn't work (fresh sessions with the connector and a recall skill loaded never searched, 9 Nov
 * 2026), so the plugin searches for it. Prompts are compared and dropped: never stored or logged.
 *
 * Auth is a Claude Code key (cc_key), good only for this and the /mcp/<key> connector, so a key
 * left in shell history can't change the account. The full sign-in token also works.
 */
import type { Env } from "./index";
import { semanticScores } from "./embed";
import { logEvent, sha256 } from "./v1";

// bge-m3 cosine. Calibrated 9 Nov on the owner's 90 production notes: work prompts with a real match
// score 0.60-0.69, unrelated prompts top out at 0.565 (jokes aside, filtered below). 0.58 kept 5/8
// labelled work prompts and 0/8 unrelated. Precision over recall: noise teaches people to ignore it.
export const RECALL_FLOOR = 0.58;
const SKIP_TOPICS = new Set(["other"]);  // jokes and engagement bait

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function ccKeyUser(env: Env, key: string): Promise<string | undefined> {
  if (!key.startsWith("skc_")) return undefined;
  const row = await env.DB.prepare("SELECT user_key FROM cc_key WHERE key_hash = ?").bind(await sha256(key)).first<{ user_key: string }>();
  return row?.user_key;
}

export async function recall(env: Env, userId: string | null, body: any, debug = false): Promise<Response> {
  const prompt = String(body?.prompt ?? "").trim();
  if (prompt.length < 20 || prompt.startsWith("/")) return json({});
  const scored = (await semanticScores(env, userId, prompt.slice(0, 2000)).catch(() => []))
    .sort((a, b) => b.s - a.s);
  if (debug) return json({ top: scored.slice(0, 8) });
  const ids = scored.filter((x) => x.s >= RECALL_FLOOR).slice(0, 6).map((x) => x.id);
  if (!ids.length) return json({});
  const { results } = await env.DB.prepare(
    `SELECT id, title, summary, topic, status FROM note WHERE id IN (${ids.map(() => "?").join(",")}) AND user_id IS ?`,
  ).bind(...ids, userId).all<any>();
  const order = new Map(ids.map((id, i) => [id, i]));
  const hits = (results ?? []).filter((n) => !SKIP_TOPICS.has(n.topic ?? ""))
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!).slice(0, 3);
  if (!hits.length) return json({});
  await logEvent(env, userId, "api", "recall_hit");
  return json({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context(hits) } });
}

export function context(hits: { id: string; title: string; summary: string | null; status: string }[]): string {
  return "Skwirl: the user saved these and may have forgotten them. If one genuinely fits the task, call " +
    "get_stash_note(id) before relying on it, mention it in one line, and call mark_stash_used once it shapes " +
    "the work. If none fits, ignore this silently.\n" +
    hits.map((h) => `- ${h.title} (${h.status}) id ${h.id}: ${(h.summary ?? "").slice(0, 200)}`).join("\n");
}

/** GET: is there a key. POST: make a new one (the old one stops working). DELETE: revoke. */
export async function ccKeyRoute(env: Env, userId: string, method: string): Promise<Response> {
  if (method === "GET") {
    const row = await env.DB.prepare("SELECT created_at FROM cc_key WHERE user_key = ?").bind(userId).first<{ created_at: string }>();
    return json({ created_at: row?.created_at ?? null });
  }
  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM cc_key WHERE user_key = ?").bind(userId).run();
    return json({ ok: true });
  }
  if (method === "POST") {
    const key = "skc_" + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare(
      "INSERT INTO cc_key (user_key, key_hash, created_at) VALUES (?, ?, ?) ON CONFLICT(user_key) DO UPDATE SET key_hash = excluded.key_hash, created_at = excluded.created_at",
    ).bind(userId, await sha256(key), new Date().toISOString()).run();
    return json({ key }, 201);
  }
  return json({ error: "method not allowed" }, 405);
}

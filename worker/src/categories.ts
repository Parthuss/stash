// Your own categories: names you choose, and the AI files each note into the ones that fit.
// New notes are sorted while they're being read (the claim carries the names); existing notes are
// re-sorted in small batches by the processor whenever the set changes (/sort/claim, /sort/result).
import type { Env } from "./index";

export const MAX_CATEGORIES = 20;
const key = (userId: string | null) => userId ?? "";

export async function categoriesOf(env: Env, userId: string | null): Promise<{ names: string[]; version: number }> {
  const k = key(userId);
  const [{ results }, set] = await Promise.all([
    env.DB.prepare("SELECT name FROM category WHERE owner_key = ? ORDER BY position").bind(k).all<{ name: string }>(),
    env.DB.prepare("SELECT version FROM category_set WHERE owner_key = ?").bind(k).first<{ version: number }>(),
  ]);
  return { names: (results ?? []).map((r) => r.name), version: set?.version ?? 0 };
}

/** Replace someone's categories. Returns an error message, or null. */
export async function setCategories(env: Env, userId: string | null, raw: unknown): Promise<string | null> {
  if (!Array.isArray(raw) || raw.some((n) => typeof n !== "string")) return "Categories must be a list of names.";
  const seen = new Set<string>(), names: string[] = [];
  for (const n of raw as string[]) {
    const name = n.replace(/\s+/g, " ").trim();
    if (!name) continue;
    if (name.length > 40) return "Keep each category under 40 characters.";
    if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); names.push(name); }
  }
  if (names.length > MAX_CATEGORIES) return `Up to ${MAX_CATEGORIES} categories.`;
  const k = key(userId), current = await categoriesOf(env, userId);
  if (JSON.stringify(current.names) === JSON.stringify(names)) return null;
  const keep = names.map(() => "?").join(",") || "NULL";
  await env.DB.batch([
    env.DB.prepare("DELETE FROM category WHERE owner_key = ?").bind(k),
    ...names.map((name, i) => env.DB.prepare("INSERT INTO category (owner_key, name, position) VALUES (?, ?, ?)").bind(k, name, i)),
    // A removed category disappears from every note, ticked by hand or not.
    env.DB.prepare(`DELETE FROM note_category WHERE name NOT IN (${keep}) AND note_id IN (SELECT id FROM note WHERE user_id IS ?)`)
      .bind(...names, userId),
    env.DB.prepare("INSERT INTO category_set (owner_key, version) VALUES (?, 1) ON CONFLICT(owner_key) DO UPDATE SET version = version + 1").bind(k),
  ]);
  return null;
}

/** The person ticked or unticked a category on one note. Never overwritten by the AI afterwards. */
export async function setNoteCategory(env: Env, userId: string | null, noteId: string, name: string, on: boolean): Promise<boolean> {
  const ok = await env.DB.prepare(
    "SELECT 1 AS y FROM note n JOIN category c ON c.owner_key = ? AND c.name = ? WHERE n.id = ? AND n.user_id IS ?",
  ).bind(key(userId), name, noteId, userId).first();
  if (!ok) return false;
  await env.DB.prepare(
    "INSERT INTO note_category (note_id, name, source, state) VALUES (?, ?, 'manual', ?) ON CONFLICT(note_id, name) DO UPDATE SET source = 'manual', state = excluded.state",
  ).bind(noteId, name, on ? 1 : 0).run();
  return true;
}

/** Store the AI's picks for one note (from reading it, or a re-sort). Hand-set rows win. */
export function applyAiCategories(env: Env, userId: string | null, noteId: string, picks: unknown, names: string[], version: number) {
  const allowed = new Map(names.map((n) => [n.toLowerCase(), n]));
  const chosen = [...new Set((Array.isArray(picks) ? picks : []).filter((p): p is string => typeof p === "string")
    .map((p) => allowed.get(p.trim().toLowerCase())).filter((p): p is string => !!p))];
  // Every statement re-checks the note belongs to this person, so a stray id can't touch anyone else's.
  const mine = "EXISTS (SELECT 1 FROM note WHERE id = ? AND user_id IS ?)";
  return [
    env.DB.prepare(`DELETE FROM note_category WHERE note_id = ? AND source = 'ai' AND ${mine}`).bind(noteId, noteId, userId),
    ...chosen.map((name) => env.DB.prepare(
      `INSERT INTO note_category (note_id, name, source, state) SELECT ?, ?, 'ai', 1 WHERE ${mine} ON CONFLICT(note_id, name) DO NOTHING`,
    ).bind(noteId, name, noteId, userId)),
    env.DB.prepare("UPDATE note SET cat_version = ? WHERE id = ? AND user_id IS ?").bind(version, noteId, userId),
  ];
}

/** Processor: the next batch of notes that need sorting against their owner's current categories. */
export async function claimSortBatch(env: Env, guestsOnly: boolean) {
  const now = new Date().toISOString();
  const who = await env.DB.prepare(
    `SELECT s.owner_key, s.version FROM category_set s
     WHERE EXISTS (SELECT 1 FROM category c WHERE c.owner_key = s.owner_key)
       AND (? = 0 OR s.owner_key != '')
       AND NOT EXISTS (SELECT 1 FROM alert_state p WHERE p.key = 'pause:' || CASE WHEN s.owner_key = '' THEN 'owner' ELSE s.owner_key END AND p.at > ?)
       AND EXISTS (SELECT 1 FROM note n WHERE n.user_id IS NULLIF(s.owner_key, '') AND (n.cat_version IS NULL OR n.cat_version != s.version))
     LIMIT 1`,
  ).bind(guestsOnly ? 1 : 0, now).first<{ owner_key: string; version: number }>();
  if (!who) return null;
  const userId = who.owner_key || null;
  const { names } = await categoriesOf(env, userId);
  const { results } = await env.DB.prepare(
    `SELECT id, title, summary, substr(markdown, 1, 4000) AS markdown FROM note
     WHERE user_id IS ? AND (cat_version IS NULL OR cat_version != ?) ORDER BY created_at DESC LIMIT 8`,
  ).bind(userId, who.version).all();
  return { user_id: userId, version: who.version, categories: names, notes: results ?? [] };
}

/** Processor: store a sorted batch. Ignored if the person changed their categories meanwhile. */
export async function applySortResult(env: Env, userId: string | null, version: number, results: unknown): Promise<number> {
  const { names, version: current } = await categoriesOf(env, userId);
  if (version !== current || !Array.isArray(results)) return 0;
  const stmts = results.slice(0, 20).filter((r: any) => r && typeof r.id === "string")
    .flatMap((r: any) => applyAiCategories(env, userId, r.id, r.categories, names, version));
  if (stmts.length) await env.DB.batch(stmts);
  return stmts.length;
}

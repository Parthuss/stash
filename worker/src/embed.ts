/**
 * Meaning-based search on Workers AI (free tier). Notes are embedded once with bge-m3 (handles
 * Hinglish and other languages reels come in), quantised to int8, and compared by brute force:
 * one person's library is hundreds of notes, so a scan beats running a vector index.
 * ponytail: brute-force scan per search; move to Vectorize if a library passes ~20k notes.
 * Without the AI binding (forks that skip it) everything here no-ops and search is keyword-only.
 */
import type { Env } from "./index";

const MODEL = "@cf/baai/bge-m3";

async function embed(env: Env, texts: string[]): Promise<Int8Array[] | null> {
  if (!env.AI || !texts.length) return null;
  const out = (await env.AI.run(MODEL, { text: texts })) as { data: number[][] };
  return out.data.map((v) => {
    const norm = Math.hypot(...v) || 1;
    return Int8Array.from(v, (x) => Math.round((x / norm) * 127));
  });
}

const docText = (n: { title: string; summary: string | null; mentions: string | null; markdown: string }) => {
  let names = "";
  try { names = (JSON.parse(n.mentions ?? "[]") as { name: string }[]).map((m) => m.name).join(", "); } catch {}
  return [n.title, n.summary ?? "", names, n.markdown.slice(0, 1500)].join("\n").slice(0, 4000);
};

/** Embed notes that have no vector yet (new notes right away, older ones from the cron). */
export async function embedMissing(env: Env, limit = 40): Promise<number> {
  if (!env.AI) return 0;
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.user_id, n.title, n.summary, n.mentions, n.markdown FROM note n
     LEFT JOIN note_vec v ON v.note_id = n.id WHERE v.note_id IS NULL ORDER BY n.created_at DESC LIMIT ?`,
  ).bind(limit).all<any>();
  if (!results?.length) return 0;
  const vecs = await embed(env, results.map(docText));
  if (!vecs) return 0;
  await env.DB.batch(results.map((n, i) => env.DB.prepare(
    "INSERT OR REPLACE INTO note_vec (note_id, user_key, vec) VALUES (?, ?, ?)",
  ).bind(n.id, n.user_id ?? "", vecs[i].buffer)));
  return results.length;
}

/** Every note of one person scored by meaning against the query (cosine, roughly 0.3-0.6). */
export async function semanticScores(env: Env, userId: string | null, query: string): Promise<{ id: string; s: number }[]> {
  const q = (await embed(env, [query]).catch(() => null))?.[0];
  if (!q) return [];
  const { results } = await env.DB.prepare("SELECT note_id, vec FROM note_vec WHERE user_key = ?")
    .bind(userId ?? "").all<{ note_id: string; vec: ArrayBuffer }>();
  const scored = (results ?? []).map((r) => {
    const v = new Int8Array(r.vec);
    let dot = 0;
    for (let i = 0; i < v.length; i++) dot += v[i] * q[i];
    return { id: r.note_id, s: dot / (127 * 127) };
  });
  return scored;
}

/** Note ids ranked by meaning, best first, above a similarity floor. */
export async function semanticIds(env: Env, userId: string | null, query: string, limit = 30): Promise<string[]> {
  const scored = await semanticScores(env, userId, query);
  // bge-m3 scores sit in a narrow band: unrelated notes land at 0.30-0.40 and a real match at
  // 0.45-0.55 (measured on the demo library). Keep matches above the floor and close to the best one.
  const top = Math.max(0, ...scored.map((x) => x.s));
  const floor = Math.max(0.45, top - 0.04);
  return scored.filter((x) => x.s >= floor).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.id);
}

/** Reciprocal-rank fusion of keyword and meaning results. */
export function fuse(lists: string[][], k = 60): string[] {
  const score = new Map<string, number>();
  for (const list of lists) list.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

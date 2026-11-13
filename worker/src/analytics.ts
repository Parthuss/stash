/**
 * First-party product analytics: who visits, where from, what they look at and tap, how long
 * they stay, where they stop. public/track.js sends batches to POST /e; the owner reads them on
 * /owner. Never typed text, search words or note content. No third party, no IPs kept.
 */
import type { Env } from "./index";
export { contentOverview } from "./content";
import { TIERS_FROM } from "./tiers";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python|httpx/i;
const ID = /^[a-z0-9]{8,40}$/i;
const NAME = /^[\w:./-]{1,60}$/;

export function parseUA(ua: string) {
  const device = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|iPhone|Android/i.test(ua) ? "phone" : "desktop";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /CrOS/.test(ua) ? "ChromeOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "other";
  const browser = /Instagram/.test(ua) ? "Instagram in-app" : /FBAN|FBAV/.test(ua) ? "Facebook in-app" : /LinkedInApp/.test(ua) ? "LinkedIn in-app"
    : /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung" : /CriOS|Chrome\//.test(ua) ? "Chrome"
    : /FxiOS|Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "other";
  return { device, os, browser };
}

// Best effort per-isolate throttle so a script can't burn the day's D1 writes.
const hits = new Map<string, { n: number; t: number }>();
function throttled(ip: string): boolean {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.t > 60_000) { hits.set(ip, { n: 1, t: now }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.n > 60;
}

/** POST /e. userId: a user id, null for the owner, undefined for a visitor who isn't signed in. */
/** Rows analytics may write per day: a third of D1's free daily writes, far above real traffic
 *  (a few hundred a day in Nov 2026). Old days' counters are pruned with old analytics. */
const ANALYTICS_DAILY_ROWS = 30_000;

export async function collect(request: Request, env: Env, userId: string | null | undefined): Promise<Response> {
  const ua = request.headers.get("user-agent") ?? "";
  if (BOT.test(ua) || throttled(request.headers.get("CF-Connecting-IP") ?? "?")) return new Response(null, { status: 204 });
  const b = (await request.json().catch(() => null)) as any;
  if (!b || !ID.test(b.v ?? "") || !ID.test(b.s ?? "")) return json({ error: "bad" }, 400);
  // Durable daily ceiling on rows analytics may write (D1's free plan allows ~100k writes a day for the
  // whole app). Past it, analytics quietly stops storing until tomorrow; saving and sign-in are untouched.
  const budgetKey = "analytics:" + new Date().toISOString().slice(0, 10);
  const spent = await env.DB.prepare("SELECT n FROM daily_counter WHERE key = ?").bind(budgetKey).first<{ n: number }>();
  if ((spent?.n ?? 0) >= ANALYTICS_DAILY_ROWS) return new Response(null, { status: 204 });
  const now = Date.now(), iso = new Date(now).toISOString();
  const events = (Array.isArray(b.e) ? b.e : []).slice(0, 50)
    .filter((x: any) => Array.isArray(x) && typeof x[1] === "string" && NAME.test(x[1]))
    .map((x: any) => [new Date(Math.abs(Number(x[0]) - now) < 3600_000 ? Number(x[0]) : now).toISOString(), x[1], x[2] == null ? null : String(x[2]).slice(0, 120)]);
  const c = b.c ?? {};
  const s = (v: unknown, n = 100) => (typeof v === "string" && v ? v.slice(0, n) : null);
  const { device, os, browser } = parseUA(ua);
  const owner = userId === null ? 1 : 0;
  const user = typeof userId === "string" ? userId : null;
  const up = await env.DB.prepare(
    `INSERT INTO visit (id, visitor, user_id, owner, started_at, last_at, active_ms, events, country, device, os, browser,
       referrer, utm_source, utm_medium, utm_campaign, landing, screen, lang, tz, installed)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
     ON CONFLICT(id) DO UPDATE SET last_at = ?5, active_ms = MAX(visit.active_ms, ?6), events = visit.events + ?7,
       user_id = COALESCE(?3, visit.user_id), owner = MAX(visit.owner, ?4)
     WHERE visit.visitor = ?2`,
  ).bind(b.s, b.v, user, owner, iso, Math.max(0, Math.min(Number(b.t) || 0, 86_400_000)), events.length,
    request.headers.get("CF-IPCountry"), device, os, browser, s(c.ref, 80), s(c.us, 60), s(c.um, 60), s(c.uc, 60),
    s(c.path), s(c.scr, 20), s(c.lang, 20), s(c.tz, 60), c.inst ? 1 : 0).run();
  if (!up.meta.changes) return new Response(null, { status: 204 });  // that visit id belongs to another visitor
  const rows = 2 + (events.length ? events.length : 0);  // the visit upsert, this counter, and the events
  await env.DB.prepare("INSERT INTO daily_counter (key, n) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET n = n + excluded.n")
    .bind(budgetKey, rows).run();
  // A visit that has already logged thousands of events is a loop or a script: stop storing more.
  const capped = await env.DB.prepare("SELECT events > 3000 AS full FROM visit WHERE id = ?").bind(b.s).first<{ full: number }>();
  if (events.length && !capped?.full) {
    const stmts = [];
    for (let i = 0; i < events.length; i += 20) {
      const chunk = events.slice(i, i + 20);
      stmts.push(env.DB.prepare(`INSERT INTO ui_event (visit_id, at, name, detail) VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}`)
        .bind(...chunk.flatMap((e: any[]) => [b.s, ...e])));
    }
    await env.DB.batch(stmts);
  }
  return new Response(null, { status: 204 });
}

const NOT_OWNER = "v.visitor NOT IN (SELECT visitor FROM visit WHERE owner = 1)";

/** Legacy analytics API compatibility, for the last `days` days. Owner only. */
export async function analyticsOverview(env: Env, days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const all = async (sql: string, ...args: unknown[]) => (await env.DB.prepare(sql).bind(...args).all<any>()).results ?? [];
  const W = `v.started_at >= ? AND ${NOT_OWNER}`;
  const [totals] = await all(
    `SELECT COUNT(*) visits, COUNT(DISTINCT visitor) visitors, COUNT(DISTINCT user_id) users,
       COALESCE(SUM(active_ms), 0) active_ms, SUM(events <= 2 AND active_ms < 10000) bounces
     FROM visit v WHERE ${W}`, since);
  const durations = (await all(`SELECT active_ms FROM visit v WHERE ${W} ORDER BY active_ms`, since)).map((r) => r.active_ms);
  const daily = await all(
    `SELECT substr(started_at, 1, 10) day, COUNT(DISTINCT visitor) visitors, COUNT(*) visits,
       COUNT(DISTINCT user_id) active_users, SUM(active_ms) active_ms
     FROM visit v WHERE ${W} GROUP BY day ORDER BY day`, since);
  const signups = await all("SELECT substr(created_at, 1, 10) day, COUNT(*) n FROM user WHERE created_at >= ? GROUP BY day", since);
  const saves = await all("SELECT substr(captured_at, 1, 10) day, COUNT(*) n FROM capture WHERE captured_at >= ? AND user_id IS NOT NULL AND source != 'import' GROUP BY day", since);
  const dims: Record<string, any[]> = {};
  for (const d of ["country", "device", "os", "browser", "referrer", "utm_source", "landing", "lang", "tz"]) {
    dims[d] = await all(`SELECT COALESCE(${d}, '(none)') k, COUNT(DISTINCT visitor) n FROM visit v WHERE ${W} GROUP BY k ORDER BY n DESC LIMIT 12`, since);
  }
  const events = await all(
    `SELECT e.name, COALESCE(e.detail, '') detail, COUNT(*) n, COUNT(DISTINCT v.visitor) visitors
     FROM ui_event e JOIN visit v ON v.id = e.visit_id WHERE e.at >= ? AND ${NOT_OWNER}
     GROUP BY e.name, e.detail ORDER BY n DESC LIMIT 300`, since);
  const step = async (name: string, detail?: string) =>
    (await all(`SELECT COUNT(DISTINCT v.visitor) n FROM ui_event e JOIN visit v ON v.id = e.visit_id
      WHERE e.at >= ? AND ${NOT_OWNER} AND e.name = ? ${detail ? "AND e.detail = ?" : ""}`, since, name, ...(detail ? [detail] : [])))[0].n;
  const cohort = (await all(
    `SELECT COUNT(*) joined,
       SUM((SELECT COUNT(*) FROM capture c WHERE c.user_id = u.id) > 0) saved,
       SUM((SELECT COUNT(*) FROM usage_event e WHERE e.user_id = u.id AND e.action = 'open') > 0) opened,
       SUM(COALESCE(u.mcp_calls, 0) > 0) ai,
       SUM((SELECT COUNT(DISTINCT substr(started_at, 1, 10)) FROM visit WHERE user_id = u.id) > 1
           OR (SELECT COUNT(DISTINCT substr(at, 1, 10)) FROM usage_event WHERE user_id = u.id) > 1) returned
     FROM user u WHERE u.created_at >= ?`, since))[0];
  const funnel = [
    ["Visited", totals.visitors ?? 0],
    ["Saw the landing page", await step("view", "auth")],
    ["Tapped Start free", await step("join_submit")],
    ["Joined", cohort.joined ?? 0],
    ["Added a save or import", cohort.saved ?? 0],
    ["Opened a note", cohort.opened ?? 0],
    ["Connected an AI app", cohort.ai ?? 0],
    ["Came back another day", cohort.returned ?? 0],
  ];
  const users = await all(
    `SELECT u.id, u.name, u.created_at, u.last_seen, u.found_via, u.email IS NOT NULL has_email, COALESCE(u.mcp_calls, 0) > 0 ai,
       u.groq_key_enc IS NOT NULL own_key,
       (SELECT COUNT(*) FROM telegram_chat t WHERE t.user_key = u.id) > 0 telegram,
       (SELECT COUNT(*) FROM visit WHERE user_id = u.id) visits,
       (SELECT COALESCE(SUM(active_ms), 0) FROM visit WHERE user_id = u.id) active_ms,
       (SELECT COUNT(DISTINCT substr(started_at, 1, 10)) FROM visit WHERE user_id = u.id) days,
       (SELECT COUNT(*) FROM capture c WHERE c.user_id = u.id AND c.source != 'import') saves,
       (SELECT COUNT(*) FROM capture c WHERE c.user_id = u.id AND c.source = 'import') imports,
       (SELECT COUNT(*) FROM note n WHERE n.user_id = u.id) notes,
       (SELECT COUNT(*) FROM usage_event e WHERE e.user_id = u.id AND e.action = 'open') opens,
       (SELECT COUNT(*) FROM usage_event e WHERE e.user_id = u.id AND e.action = 'search') searches,
       (SELECT MAX(at) FROM usage_event e WHERE e.user_id = u.id) last_action_at,
       (SELECT referrer FROM visit WHERE visitor IN (SELECT visitor FROM visit WHERE user_id = u.id) ORDER BY started_at LIMIT 1) first_referrer,
       (SELECT country FROM visit WHERE user_id = u.id ORDER BY started_at DESC LIMIT 1) country,
       (SELECT device || ' · ' || browser FROM visit WHERE user_id = u.id ORDER BY started_at DESC LIMIT 1) device,
       (SELECT e.name || COALESCE(':' || e.detail, '') FROM ui_event e JOIN visit v ON v.id = e.visit_id
         WHERE v.user_id = u.id ORDER BY e.at DESC LIMIT 1) last_event
     FROM user u ORDER BY u.created_at DESC`);
  const recent = await all(
    `SELECT v.id, v.visitor, v.user_id, u.name, v.started_at, v.last_at, v.active_ms, v.events, v.country, v.device, v.os, v.browser,
       v.referrer, v.utm_source, v.landing, v.installed
     FROM visit v LEFT JOIN user u ON u.id = v.user_id WHERE ${W} ORDER BY v.started_at DESC LIMIT 80`, since);
  const waitlist = await all(
    `SELECT w.at, w.email, w.country, w.price, w.place, u.name FROM waitlist w LEFT JOIN user u ON u.id = w.user_id
     WHERE w.at >= ? ORDER BY w.at DESC LIMIT 200`, since);
  return { days, since, totals, durations, daily, signups, saves, dims, events, funnel, users, recent, waitlist };
}

/** One person's (or one anonymous visitor's) whole story, visit by visit. Owner only. */
export async function journey(env: Env, userId: string | null, visitor: string | null) {
  const visitors = userId
    ? ((await env.DB.prepare("SELECT DISTINCT visitor FROM visit WHERE user_id = ?").bind(userId).all<{ visitor: string }>()).results ?? []).map((r) => r.visitor)
    : visitor ? [visitor] : [];
  const marks = visitors.map(() => "?").join(",") || "''";
  const { results: visits } = await env.DB.prepare(
    `SELECT * FROM visit WHERE (user_id IS NOT NULL AND user_id = ?) OR visitor IN (${marks}) ORDER BY started_at`,
  ).bind(userId ?? "", ...visitors).all<any>();
  const ids = (visits ?? []).map((v) => v.id);
  const events = ids.length
    ? (await env.DB.prepare(`SELECT visit_id, at, name, detail FROM ui_event WHERE visit_id IN (${ids.map(() => "?").join(",")}) ORDER BY at`)
        .bind(...ids).all<any>()).results ?? []
    : [];
  const server = userId
    ? (await env.DB.prepare("SELECT at, kind, action AS name FROM usage_event WHERE user_id = ? AND kind = 'api' ORDER BY at").bind(userId).all<any>()).results ?? []
    : [];
  const user = userId ? await env.DB.prepare("SELECT id, name, created_at FROM user WHERE id = ?").bind(userId).first() : null;
  return { user, visitors, visits: visits ?? [], events, server };
}

/** Cron: keep 180 days. */
export async function pruneAnalytics(env: Env): Promise<void> {
  const cut = new Date(Date.now() - 180 * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ui_event WHERE at < ?").bind(cut),
    env.DB.prepare("DELETE FROM visit WHERE last_at < ?").bind(cut),
    env.DB.prepare("DELETE FROM daily_counter WHERE key < ?").bind("analytics:" + new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)),
  ]);
}

/** One explicit period for every owner-console chart; today compares the same elapsed UTC hours. */
export function consolePeriod(days: number, now = Date.now()) {
  days = [1, 7, 30].includes(days) ? days : 7;
  const until = new Date(now).toISOString();
  const start = days === 1 ? Date.parse(until.slice(0, 10) + 'T00:00:00.000Z') : now - days * 86_400_000;
  return { days, since: new Date(start).toISOString(), until,
    previous_since: new Date(days === 1 ? start - 86_400_000 : start - (now - start)).toISOString(),
    previous_until: new Date(days === 1 ? now - 86_400_000 : start).toISOString(),
    bucket: days === 1 ? 'hour' : 'day', timezone: 'UTC' };
}

// The UI gets categories and existing save titles, never raw provider error strings (which may
// contain credential-bearing URLs). Keep the same terminal-failure rule in counts and actions.
const FAILED = "(status = 'failed' OR (status != 'done' AND attempts >= 3))";
const FAILURE_REASON = `CASE
  WHEN lower(COALESCE(error,'')) LIKE '%429%' OR lower(COALESCE(error,'')) LIKE '%rate%limit%' THEN 'Rate limited'
  WHEN lower(COALESCE(error,'')) LIKE '%401%' OR lower(COALESCE(error,'')) LIKE '%403%' OR lower(COALESCE(error,'')) LIKE '%api key%' THEN 'Provider authentication'
  WHEN lower(COALESCE(error,'')) LIKE '%download%' OR lower(COALESCE(error,'')) LIKE '%private%' OR lower(COALESCE(error,'')) LIKE '%not found%' OR lower(COALESCE(error,'')) LIKE '%404%' THEN 'Media unavailable'
  WHEN lower(COALESCE(error,'')) LIKE '%timeout%' OR lower(COALESCE(error,'')) LIKE '%timed out%' THEN 'Timed out'
  WHEN lower(COALESCE(error,'')) LIKE '%transcri%' OR lower(COALESCE(error,'')) LIKE '%whisper%' THEN 'Transcription'
  WHEN lower(COALESCE(error,'')) LIKE '%extract%' OR lower(COALESCE(error,'')) LIKE '%json%' THEN 'Note extraction'
  ELSE 'Other / not recorded' END`;

/** List-price planning estimate, never actual spending. Rates verified against official provider
 * docs/endpoints 2026-11-12; the API docs retain the sources and routing assumptions. */
export function estimateUsageCost(rows: {model?: string; action?: string; calls: number; prompt_tokens: number; completion_tokens: number; audio_seconds: number; billed_audio_seconds?: number}[]) {
  let estimated = 0, priced = 0, unpriced = 0;
  for (const r of rows) {
    const model = (r.model ?? '').toLowerCase(), openrouter = model.startsWith('openrouter:');
    const name = model.replace(/^openrouter:/, '');
    const tokens = r.action === 'chat' && name === 'qwen/qwen3.8-27b'
      ? (r.prompt_tokens * (openrouter ? 0.45 : 0.80) + r.completion_tokens * (openrouter ? 3 : 4)) / 1_000_000 : null;
    const audio = r.action === 'whisper' && ['whisper-large-v3', 'whisper-large-v3-turbo', 'openai/whisper-large-v3'].includes(name)
      ? (openrouter && name !== 'whisper-large-v3-turbo' ? r.audio_seconds * 0.0000075
        : !openrouter ? (r.billed_audio_seconds ?? r.audio_seconds) * (name.endsWith('turbo') ? 0.04 : 0.111) / 3600 : null) : null;
    const cost = tokens ?? audio;
    if (cost === null) unpriced += r.calls;
    else { estimated += Math.max(0,cost); priced += r.calls; }
  }
  return { estimated_usd: priced ? Math.round(estimated * 1_000_000) / 1_000_000 : null,
    priced_calls: priced, unpriced_calls: unpriced, rates_as_of: '2026-11-12',
    note: `List-price estimate for ${priced} recorded calls; ${unpriced} unpriced. Assumes Groq Qwen $0.80/$4 per 1M tokens, Whisper v3 $0.111/h (turbo $0.04/h, 10s minimum); OpenRouter Qwen primary Nebius $0.45/$3 per 1M, Whisper DeepInfra $0.0000075/s. Routing, caching, free tiers and credits change actual charges; this is not a bill.` };
}

/** Bounded owner-only read model. No new collection, personal fields, secrets or billing guesses. */
export async function ownerConsole(env: Env, days: number, now = Date.now()) {
  const period = consolePeriod(days, now);
  const { since, until, previous_since, previous_until } = period;
  const bucketMs = period.bucket === 'hour' ? 3_600_000 : 86_400_000;
  const all = async (sql: string, ...args: (string | number | null)[]) =>
    (await env.DB.prepare(sql).bind(...args).all<any>()).results ?? [];
  const first = async (sql: string, ...args: (string | number | null)[]) =>
    await env.DB.prepare(sql).bind(...args).first<any>();
  // D1 allows at most five terms in one compound SELECT. Keep metric streams separate;
  // active-user sources still aggregate together so one person is never counted three times.
  const metricStreams = [
    ['signups', "SELECT created_at at, id identity FROM user WHERE created_at >= ?1 AND created_at < ?3"],
    ['saves', "SELECT captured_at at, id identity FROM capture WHERE captured_at >= ?1 AND captured_at < ?3"],
    ['processed', "SELECT processed_at at, id identity FROM capture WHERE status = 'done' AND processed_at >= ?1 AND processed_at < ?3"],
    ['visitors', `SELECT started_at at, visitor identity FROM visit v WHERE started_at >= ?1 AND started_at < ?3 AND ${NOT_OWNER}`],
    ['active', `SELECT started_at at, user_id identity FROM visit v WHERE started_at >= ?1 AND started_at < ?3 AND user_id IS NOT NULL AND ${NOT_OWNER}
      UNION ALL SELECT at, user_id FROM usage_event WHERE at >= ?1 AND at < ?3 AND kind = 'api' AND user_id IS NOT NULL
      UNION ALL SELECT captured_at, user_id FROM capture WHERE captured_at >= ?1 AND captured_at < ?3 AND user_id IS NOT NULL`],
  ];
  const metricReads = metricStreams.map(async ([key, stream]) => {
    const rows = await all(`WITH stream AS (${stream}), intervals AS (
      SELECT identity, CASE WHEN at >= ?2 THEN 0 ELSE 1 END period,
        CAST((julianday(at) - julianday(CASE WHEN at >= ?2 THEN ?2 ELSE ?1 END)) * 86400000.0 / ?4 + 0.000001 AS INTEGER) bucket FROM stream WHERE at >= ?2 OR at < ?5
      ) SELECT period, -1 bucket, COUNT(DISTINCT identity) value FROM intervals GROUP BY period
        UNION ALL SELECT period, bucket, COUNT(DISTINCT identity) value FROM intervals GROUP BY period, bucket`,
      previous_since, since, until, bucketMs, previous_until);
    return rows.map(row => ({...row,key}));
  });
  const statements = [
    Promise.all(metricReads).then(rows => rows.flat()),
    all(`SELECT CASE WHEN ${FAILED} THEN 'failed' WHEN status = 'done' THEN 'done'
      WHEN status = 'claimed' THEN 'processing' ELSE 'pending' END state, COUNT(*) n FROM capture GROUP BY state`),
    first(`SELECT COUNT(*) total, COALESCE(SUM(plan = 'plus' AND plan_until > ?),0) plus FROM user`, until),
    // Cohort downstream steps share a denominator; anonymous visits remain a separate reach
    // measure, because device visitors cannot reliably be joined to all account signups.
    first(`WITH cohort AS (SELECT id, plan, plan_until FROM user WHERE created_at >= ?1 AND created_at < ?2),
      saves AS (SELECT c.user_id, COUNT(*) n FROM capture c JOIN cohort u ON u.id = c.user_id WHERE c.captured_at < ?2 GROUP BY c.user_id)
      SELECT COUNT(*) joined, COALESCE(SUM(COALESCE(s.n,0) >= 1),0) first_save,
      COALESCE(SUM(COALESCE(s.n,0) >= 5),0) five_saves,
      COALESCE(SUM(u.plan = 'plus' AND u.plan_until > ?2),0) plus FROM cohort u LEFT JOIN saves s ON s.user_id = u.id`, since, until),
    // Aggregate once per table rather than execute per-user correlated counts. Limit transport;
    // users_total makes that bound visible rather than silently hiding accounts.
    all(`WITH counts AS (SELECT user_id, COUNT(*) total, SUM(status = 'done') done,
      SUM(NOT ${FAILED} AND status != 'done') pending, SUM(${FAILED}) failed FROM capture GROUP BY user_id),
      devices AS (SELECT user_id, COUNT(*) n FROM push_sub GROUP BY user_id)
      SELECT u.id, u.name, u.created_at, u.last_seen, u.email, u.email IS NOT NULL has_email,
      CASE WHEN u.plan = 'plus' AND u.plan_until > ? THEN 'plus' WHEN u.created_at < ? THEN 'early' ELSE 'free' END plan, u.plan_until,
      u.found_via, u.groq_key_enc IS NOT NULL own_key, u.owner_msg, u.owner_tip,
      COALESCE(c.total,0) total, COALESCE(c.done,0) done, COALESCE(c.pending,0) pending,
      COALESCE(c.failed,0) failed, COALESCE(p.n,0) push_devices
      FROM user u LEFT JOIN counts c ON c.user_id = u.id LEFT JOIN devices p ON p.user_id = u.id
      ORDER BY u.created_at DESC LIMIT 500`, until, TIERS_FROM),
    all(`SELECT ${FAILURE_REASON} reason, COUNT(*) n FROM capture WHERE ${FAILED} GROUP BY reason ORDER BY n DESC`),
    all(`SELECT id, title, ${FAILURE_REASON} reason FROM capture WHERE ${FAILED} ORDER BY captured_at DESC LIMIT 36`),
    all(`SELECT CASE WHEN model LIKE 'openrouter:%' THEN 'OpenRouter' WHEN key_type = 'own' THEN 'Groq · user keys' ELSE 'Groq · shared pool' END provider,
      model, action, COUNT(*) calls, COALESCE(SUM(prompt_tokens),0) prompt_tokens, COALESCE(SUM(completion_tokens),0) completion_tokens,
      COALESCE(SUM(seconds),0) audio_seconds, COALESCE(SUM(CASE WHEN action = 'whisper' THEN MAX(seconds,10) ELSE 0 END),0) billed_audio_seconds
      FROM usage_event WHERE kind = 'groq' AND at >= ? AND at < ? GROUP BY provider, model, action`, since, until),
    first("SELECT COUNT(*) n FROM user WHERE groq_key_enc IS NOT NULL"),
    all(`SELECT substr(started_at,1,10) day, COUNT(*) visits, COUNT(DISTINCT visitor) visitors
      FROM visit v WHERE started_at >= ? AND started_at < ? AND ${NOT_OWNER} GROUP BY day ORDER BY day`, since, until),
    ...["COALESCE(NULLIF(utm_source,''),NULLIF(referrer,''),'Direct / unknown')", "COALESCE(country,'Unknown')", "COALESCE(landing,'Unknown')", "COALESCE(device,'Unknown')"].map(d =>
      all(`SELECT ${d} k, COUNT(DISTINCT visitor) n FROM visit v WHERE started_at >= ? AND started_at < ? AND ${NOT_OWNER} GROUP BY k ORDER BY n DESC LIMIT 12`, since, until)),
    all(`SELECT e.at, e.kind, e.action, COALESCE(u.name,'Owner') name, e.user_id FROM usage_event e
      LEFT JOIN user u ON u.id = e.user_id WHERE e.kind = 'api' AND e.at >= ? AND e.at < ? ORDER BY e.at DESC LIMIT 40`, since, until),
  ];
  const [metrics, states, userTotals, cohort, users, failures, examples, providerUsage, ownKeys,
    daily, sources, countries, landing, devices, activity] = await Promise.all(statements);
  const definitions = [
    ['signups', 'Signups', 'New accounts'], ['active', 'Active users', 'Recorded app, API or save activity; owner excluded'],
    ['saves', 'Saves made', 'All saves and imports, including owner'], ['processed', 'Saves processed', 'Completed saves, including owner'],
    ['queue', 'Queue left', 'Pending and processing now, including imports and owner'],
    ['plus', 'Plus subscribers', 'Active subscriptions now'], ['visitors', 'Site visitors', 'Distinct browser visitors; owner excluded'],
  ];
  const slots = Math.max(1, Math.ceil((Date.parse(until) - Date.parse(since)) / bucketMs));
  const kpis = definitions.map(([key, label, note]) => {
    const historical = key !== 'queue' && key !== 'plus';
    return { key, label, note, historical,
      value: key === 'queue' ? states.filter((s: any) => ['pending','processing'].includes(s.state)).reduce((n: number,s: any) => n+s.n,0)
        : key === 'plus' ? userTotals?.plus ?? 0 : metrics.find((m: any) => m.key === key && m.period === 0 && m.bucket === -1)?.value ?? 0,
      previous: historical ? metrics.find((m: any) => m.key === key && m.period === 1 && m.bucket === -1)?.value ?? 0 : null,
      series: historical ? Array.from({length: slots}, (_, i) => ({ at: new Date(Date.parse(since) + i*bucketMs).toISOString(),
        value: metrics.find((m: any) => m.key === key && m.period === 0 && m.bucket === i)?.value ?? 0 })) : [],
    };
  });
  const visitors = kpis.find(k => k.key === 'visitors')!.value;
  return { period, kpis,
    funnel: { steps: [ { key: 'visitors', label: 'Site visitors', value: visitors },
      { key: 'signups', label: 'Signups', value: cohort.joined ?? 0 }, { key: 'first', label: 'First save', value: cohort.first_save ?? 0 },
      { key: 'five', label: '5+ saves', value: cohort.five_saves ?? 0 }, { key: 'plus', label: 'Plus', value: cohort.plus ?? 0 } ],
      note: 'Signups → Plus follows accounts joined in this period, including imports. Site visitors is separate reach, not an attributed signup conversion; cross-device and blocked tracking are not linked. Downstream milestones use current saves and plan; purchase order is not recorded.' },
    users, users_total: userTotals?.total ?? 0,
    health: { states, failures: failures.map((f: any) => ({...f, examples: examples.filter((e: any) => e.reason === f.reason).slice(0,3).map(({id,title}: any) => ({id,title}))})),
      providers: { groq_keys: Math.max(1, Number(env.SHARED_KEYS) || 1), own_keys: ownKeys?.n ?? 0,
        usage: providerUsage, openrouter_credit: null,
        note: 'Pool size is runner configuration, not key health. OpenRouter credit is not available to this Worker; runner credentials are never exposed.' },
      cost: estimateUsageCost(providerUsage) },
    traffic: { daily, sources, countries, landing, devices }, activity,
    limitations: ['Queue and Plus are current snapshots; historical comparisons and sparklines are unavailable.',
      'Revenue is unavailable: no payment amount/currency ledger is stored.',
      'Traffic is first-party browser analytics, retained 180 days; blockers and cross-device use affect coverage.',
      ...(userTotals?.total > 500 ? ['Users table shows the newest 500 accounts.'] : [])] };
}

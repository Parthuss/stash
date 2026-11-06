/**
 * First-party product analytics: who visits, where from, what they look at and tap, how long
 * they stay, where they stop. public/track.js sends batches to POST /e; the owner reads them on
 * /analytics. Never typed text, search words or note content. No third party, no IPs kept.
 */
import type { Env } from "./index";

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
export async function collect(request: Request, env: Env, userId: string | null | undefined): Promise<Response> {
  const ua = request.headers.get("user-agent") ?? "";
  if (BOT.test(ua) || throttled(request.headers.get("CF-Connecting-IP") ?? "?")) return new Response(null, { status: 204 });
  const b = (await request.json().catch(() => null)) as any;
  if (!b || !ID.test(b.v ?? "") || !ID.test(b.s ?? "")) return json({ error: "bad" }, 400);
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

/** Everything the /analytics page shows, for the last `days` days. Owner only. */
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
    `SELECT u.id, u.name, u.created_at, u.last_seen, u.email IS NOT NULL has_email, COALESCE(u.mcp_calls, 0) > 0 ai,
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
  ]);
}

/**
 * Product-update emails: consent, one-click unsubscribe and the owner's broadcast tool.
 *
 * Consent (Spam Act 2003 (AU), CAN-SPAM, GDPR basics):
 * - Opt-in only: an unticked box at sign-up and in Profile. Existing accounts start NOT opted in.
 *   user.marketing_opt_in (+ _at, _source) holds the current answer; email_consent_log keeps every change.
 * - Only verified addresses that are opted in at send time get a broadcast (audienceRows).
 * - Every update carries a signed unsubscribe link (works signed out) and RFC 8058 List-Unsubscribe +
 *   List-Unsubscribe-Post headers. Unsubscribing takes effect at once: the next send re-reads consent.
 * - Sender identity and contact: "Skwirl" from updates@<domain>, skwirl.app, and a postal/contact line
 *   the owner sets in the console. A broadcast can't go out until that line is set.
 *
 * Sending (Resend batch, 100 per call; one subrequest per 100 people, fine on Workers Free). Resend's
 * free plan sends 100 emails a day in total (sign-in codes too), so broadcasts are capped per day.
 */
import type { Env } from "./index";
import { emailEnabled, limited, ownerEmail, sendEmail, type Mail } from "./login";
import { SITE, esc, mdToHtml, mdToText, renderEmail, safeUrl, type Layout } from "./email";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const now = () => new Date().toISOString();

// ---- consent -------------------------------------------------------------------------------------
export type ConsentSource = "signup" | "signup_google" | "profile" | "unsubscribe_link" | "one_click" | "unsubscribe_undo";
/** Record a yes/no. Only changes are written (and logged). Returns whether anything changed. */
export async function setConsent(env: Env, userId: string, on: boolean, source: ConsentSource): Promise<boolean> {
  const at = now(), v = on ? 1 : 0;
  const r = await env.DB.prepare("UPDATE user SET marketing_opt_in = ?1, marketing_opt_in_at = ?2, marketing_opt_in_source = ?3 WHERE id = ?4 AND marketing_opt_in != ?1")
    .bind(v, at, source, userId).run();
  if (!r.meta.changes) return false;
  await env.DB.prepare("INSERT INTO email_consent_log (user_id, opt_in, source, at) VALUES (?, ?, ?, ?)").bind(userId, v, source, at).run();
  return true;
}
/** A sign-up form's checkbox: only a literal true counts as a yes. */
export const saidYes = (v: unknown) => v === true;

// ---- signed unsubscribe links --------------------------------------------------------------------
// HMAC(userId) keyed with EMAIL_UNSUB_SECRET, falling back to STASH_SECRET. No expiry: an unsubscribe
// link has to keep working. Set EMAIL_UNSUB_SECRET before the first send if you ever expect to rotate
// STASH_SECRET (rotating the key used would break links in emails already sent).
async function mac(env: Env, text: string): Promise<string> {
  const secret = env.EMAIL_UNSUB_SECRET || env.STASH_SECRET;
  if (!secret) throw new Error("no secret");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...sig.slice(0, 24))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const unsubToken = (env: Env, userId: string) => mac(env, "unsub|v1|" + userId);
export async function checkUnsubToken(env: Env, userId: string, token: string): Promise<boolean> {
  if (!/^[\w-]{1,80}$/.test(userId) || !/^[\w-]{32}$/.test(token)) return false;
  const want = await unsubToken(env, userId);
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
export const unsubUrl = async (env: Env, userId: string) => `${SITE}/unsubscribe?u=${encodeURIComponent(userId)}&t=${await unsubToken(env, userId)}`;
const TEST_UNSUB = `${SITE}/unsubscribe?test=1`;

// ---- the public unsubscribe page (signed out) ----------------------------------------------------
function page(title: string, body: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · Skwirl</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/fonts.css">
<style>body{margin:0;background:#f8f7ff;color:#1d1b2e;font:16px/1.6 'Rethink Sans',system-ui,sans-serif}main{max-width:480px;margin:12vh auto 0;padding:0 22px}
.card{background:#fff;border:1px solid #ebe8f7;border-radius:24px;padding:30px 28px}h1{font-family:Recursive,system-ui,sans-serif;font-weight:800;font-size:28px;line-height:1.2;margin:0 0 12px}
.brand{display:flex;align-items:center;gap:9px;font-family:Recursive,system-ui,sans-serif;font-weight:800;font-size:22px;color:inherit;text-decoration:none;margin-bottom:18px}
button{font:inherit;font-weight:600;height:46px;padding:0 22px;border:0;border-radius:999px;background:#1d1b2e;color:#fff;cursor:pointer}p{margin:0 0 14px}small{color:#6a6880}a{color:inherit}</style></head>
<body><main><a class="brand" href="/"><img src="/mark.svg" alt="" width="28" height="28">Skwirl</a><div class="card"><h1>${esc(title)}</h1>${body}</div></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

/** GET: unsubscribes right away (one click) and offers an undo. POST: RFC 8058 one-click from the
 *  mail app ("List-Unsubscribe=One-Click"), the undo button, or a plain form post. */
export async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("test") === "1")
    return page("That was a test email", "<p>This link is from a test send, so nothing changed. In a real update it unsubscribes the person straight away.</p>");
  const u = url.searchParams.get("u") ?? "", t = url.searchParams.get("t") ?? "";
  if (!await checkUnsubToken(env, u, t))
    return page("That link didn't work", `<p>It may have been cut short by your mail app. Sign in to Skwirl and untick <b>Product updates</b> in your profile, or use <b>Contact us</b> there and we'll take you off by hand.</p><p><a href="/">Open Skwirl</a></p>`, 400);
  const form = request.method === "POST" ? await request.text().catch(() => "") : "";
  const params = new URLSearchParams(form);
  if (request.method === "POST" && params.get("List-Unsubscribe") === "One-Click") {
    await setConsent(env, u, false, "one_click");
    return new Response("Unsubscribed", { headers: { "content-type": "text/plain" } });
  }
  const action = `/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`;
  if (request.method === "POST" && params.get("action") === "resubscribe") {
    await setConsent(env, u, true, "unsubscribe_undo");
    return page("You're back on the list", `<p>You'll get Skwirl product updates again. A couple of emails a month at most.</p><form method="post" action="${esc(action)}"><input type="hidden" name="action" value="unsubscribe"><button type="submit">Unsubscribe again</button></form>`);
  }
  if (request.method !== "GET" && request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  await setConsent(env, u, false, "unsubscribe_link");
  return page("You're unsubscribed", `<p>No more Skwirl product updates. That's done already, nothing else to click.</p><p><small>You'll still get sign-in codes when you ask for one. Your saves are untouched.</small></p>
<form method="post" action="${esc(action)}"><input type="hidden" name="action" value="resubscribe"><button type="submit">Undo, keep me on the list</button></form>`);
}

// ---- drafts and rendering ------------------------------------------------------------------------
export type Draft = { id?: string; subject: string; hero: string; body: string; button_text: string; button_url: string };
const LIMITS = { subject: 120, hero: 120, body: 6000, button_text: 40, button_url: 500 };
export function cleanDraft(raw: any): { ok: true; draft: Draft } | { ok: false; error: string } {
  const s = (k: keyof typeof LIMITS) => (typeof raw?.[k] === "string" ? raw[k] : "").trim();
  const d: Draft = { subject: s("subject"), hero: s("hero"), body: s("body"), button_text: s("button_text"), button_url: s("button_url") };
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) if (d[k].length > LIMITS[k]) return { ok: false, error: `${k.replace("_", " ")} is too long (${LIMITS[k]} max).` };
  if (!d.subject) return { ok: false, error: "Add a subject." };
  if (!d.body) return { ok: false, error: "Add a message." };
  if (Boolean(d.button_text) !== Boolean(d.button_url)) return { ok: false, error: "A button needs both its text and its link (or leave both empty)." };
  if (d.button_url && !safeUrl(d.button_url)) return { ok: false, error: "The button link has to start with https://" };
  if (typeof raw?.id === "string" && /^[\w-]{1,40}$/.test(raw.id)) d.id = raw.id;
  return { ok: true, draft: d };
}
/** "{name}" becomes the person's first name; markdown characters in names are dropped. */
const personalise = (s: string, name: string) => s.replace(/\{name\}/g, name.replace(/[*_[\]()<>\\`]/g, "").trim() || "there");
export function updateEmail(d: Draft, to: { name: string; unsubscribeUrl: string }, postal: string, opts: { forceDark?: boolean } = {}) {
  const body = personalise(d.body, to.name);
  const l: Layout = {
    subject: d.subject,
    preheader: mdToText(body).split("\n").find((x) => x.trim() && !/^hi\b/i.test(x.trim()))?.slice(0, 120) ?? "",
    hero: personalise(d.hero || d.subject, to.name),
    bodyHtml: mdToHtml(body), bodyText: mdToText(body),
    button: d.button_text && d.button_url ? { text: d.button_text, url: safeUrl(d.button_url)! } : null,
    marketing: { unsubscribeUrl: to.unsubscribeUrl, postal },
  };
  return renderEmail(l, opts);
}
/** RFC 8058 + RFC 2369 headers for one recipient. */
export const listHeaders = (unsub: string): Record<string, string> => ({ "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });

/** Where updates come from: updates@ on the sign-in sender's (verified) domain. */
export const updatesFrom = (env: Env) => env.EMAIL_UPDATES_FROM || (env.EMAIL_FROM ? "updates@" + env.EMAIL_FROM.split("@")[1] : "");
const POSTAL_PLACEHOLDER = "[Your postal address or contact line goes here. Set it in the console before sending.]";
async function postalLine(env: Env): Promise<string | null> {
  return (await env.DB.prepare("SELECT v FROM email_setting WHERE k = 'postal'").first<{ v: string }>())?.v || null;
}

// ---- audience ------------------------------------------------------------------------------------
type Person = { id: string; name: string; email: string; marketing_opt_in: number };
/** Opted in, with a proven address. The only way anyone gets a broadcast. */
export const audienceRows = async (env: Env) => (await env.DB.prepare(
  "SELECT id, name, email, marketing_opt_in FROM user WHERE marketing_opt_in = 1 AND email_verified = 1 AND email IS NOT NULL AND email != '' ORDER BY created_at",
).all<Person>()).results ?? [];
export const audienceCount = async (env: Env) => (await env.DB.prepare(
  "SELECT COUNT(*) n FROM user WHERE marketing_opt_in = 1 AND email_verified = 1 AND email IS NOT NULL AND email != ''",
).first<{ n: number }>())?.n ?? 0;
const sentLastDay = async (env: Env) => (await env.DB.prepare("SELECT COUNT(*) n FROM email_send WHERE at > ? AND status = 'sent'")
  .bind(new Date(Date.now() - 86_400_000).toISOString()).first<{ n: number }>())?.n ?? 0;
export const dailyCap = (env: Env) => Math.max(1, Number(env.BROADCAST_DAILY_MAX) || 80);
export const BATCH = 100;
const LOG_ROWS = 16;

/** Resend's batch endpoint (one call per 100), or one by one through the binding. Returns message
 *  ids in order (null where a send failed). */
async function sendBatch(env: Env, mails: Mail[], idempotencyKey: string): Promise<{ ids: (string | null)[]; error?: string }> {
  if (env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(mails.map((m) => ({ from: `Skwirl <${m.from}>`, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }))),
    });
    if (!r.ok) return { ids: mails.map(() => null), error: `resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
    const data = ((await r.json().catch(() => null)) as { data?: { id: string }[] } | null)?.data ?? [];
    return { ids: mails.map((_, i) => data[i]?.id ?? null) };
  }
  const ids: (string | null)[] = [];
  for (const m of mails) ids.push(await sendEmail(env, m).then((id) => id ?? "sent").catch(() => null));
  return { ids };
}

// ---- owner routes: /v1/admin/email* (the caller has already checked it's the owner) --------------
export async function ownerEmailRoute(request: Request, env: Env, path: string): Promise<Response> {
  const m = request.method;
  if (path === "/v1/admin/email" && m === "GET") {
    const [drafts, sends, postal, owner, audience, today] = await Promise.all([
      env.DB.prepare("SELECT id, subject, hero, body, button_text, button_url, created_at, updated_at, sent_at FROM email_draft ORDER BY sent_at IS NOT NULL, updated_at DESC LIMIT 30").all(),
      env.DB.prepare("SELECT b.id, b.draft_id, b.subject, b.audience, b.sent, b.failed, b.by, b.started_at, b.finished_at, (SELECT group_concat(message_id) FROM (SELECT message_id FROM email_send s WHERE s.broadcast_id = b.id AND message_id IS NOT NULL LIMIT 3)) ids FROM email_broadcast b ORDER BY started_at DESC LIMIT 20").all(),
      postalLine(env), ownerEmail(env), audienceCount(env), sentLastDay(env),
    ]);
    const tests = await env.DB.prepare("SELECT at, message_id, status, error FROM email_send WHERE kind = 'test' ORDER BY at DESC LIMIT 5").all();
    return json({ enabled: emailEnabled(env), from: updatesFrom(env), owner_email: owner, audience, postal, sent_last_day: today, daily_cap: dailyCap(env),
      drafts: drafts.results ?? [], broadcasts: sends.results ?? [], tests: tests.results ?? [] });
  }
  const body = m === "GET" ? null : await request.json().catch(() => null) as any;

  if (path === "/v1/admin/email/preview" && m === "POST") {
    // Forgiving: whatever is typed so far, with a half-filled button left out.
    const s = (k: keyof typeof LIMITS) => (typeof body?.[k] === "string" ? body[k] : "").trim().slice(0, LIMITS[k]);
    const d: Draft = { subject: s("subject") || "(no subject yet)", hero: s("hero"), body: s("body") || "Your message shows here.", button_text: s("button_text"), button_url: s("button_url") };
    if (!d.button_text || !safeUrl(d.button_url)) d.button_text = d.button_url = "";
    const postal = (await postalLine(env)) ?? POSTAL_PLACEHOLDER;
    return json({ subject: d.subject, ...updateEmail(d, { name: env.OWNER_NAME ?? "Parth", unsubscribeUrl: TEST_UNSUB }, postal, { forceDark: body?.dark === true }) });
  }

  if (path === "/v1/admin/email/settings" && m === "PUT") {
    const postal = typeof body?.postal === "string" ? body.postal.trim().replace(/\s+/g, " ") : "";
    if (postal.length < 8 || postal.length > 240) return json({ error: "Add the sender line people can reach you at: a postal address (needed for US mail law) and/or a contact email. 8 to 240 characters." }, 400);
    await env.DB.prepare("INSERT INTO email_setting (k, v) VALUES ('postal', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(postal).run();
    return json({ ok: true, postal });
  }

  if (path === "/v1/admin/email/drafts" && m === "PUT") {
    const c = cleanDraft(body);
    if (!c.ok) return json({ error: c.error }, 400);
    const d = c.draft, at = now();
    if (d.id) {
      const was = await env.DB.prepare("SELECT sent_at FROM email_draft WHERE id = ?").bind(d.id).first<{ sent_at: string | null }>();
      if (was?.sent_at) return json({ error: "That one has been sent, so it can't change. Duplicate it into a new draft instead." }, 409);
      if (was) {
        await env.DB.prepare("UPDATE email_draft SET subject = ?, hero = ?, body = ?, button_text = ?, button_url = ?, updated_at = ? WHERE id = ? AND sent_at IS NULL")
          .bind(d.subject, d.hero, d.body, d.button_text, d.button_url, at, d.id).run();
        return json({ ok: true, id: d.id });
      }
    }
    const id = "d_" + [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT INTO email_draft (id, subject, hero, body, button_text, button_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, d.subject, d.hero, d.body, d.button_text, d.button_url, at, at).run();
    return json({ ok: true, id });
  }
  const del = path.match(/^\/v1\/admin\/email\/drafts\/([\w-]{1,40})$/);
  if (del && m === "DELETE") {
    const r = await env.DB.prepare("DELETE FROM email_draft WHERE id = ? AND sent_at IS NULL").bind(del[1]).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: "Not found, or already sent (sent ones stay as a record)." }, 404);
  }

  // A test goes only to the owner's verified address, with a dead unsubscribe link.
  if (path === "/v1/admin/email/test" && m === "POST") {
    if (!emailEnabled(env)) return json({ error: "Email sending isn't set up (RESEND_API_KEY + EMAIL_FROM)." }, 503);
    const to = await ownerEmail(env);
    if (!to) return json({ error: "Add and verify your owner email first (Profile > Email). Tests only go there." }, 400);
    const c = cleanDraft(body);
    if (!c.ok) return json({ error: c.error }, 400);
    if (await limited(env, "bcast:test", 10, 3600_000)) return json({ error: "That's 10 test emails this hour. Wait a bit." }, 429);
    const postal = (await postalLine(env)) ?? POSTAL_PLACEHOLDER;
    const mail = updateEmail(c.draft, { name: env.OWNER_NAME ?? "Parth", unsubscribeUrl: TEST_UNSUB }, postal);
    try {
      const id = await sendEmail(env, { to, from: updatesFrom(env), subject: "[Test] " + c.draft.subject, ...mail, headers: listHeaders(TEST_UNSUB) });
      await env.DB.prepare("INSERT INTO email_send (kind, broadcast_id, user_id, message_id, status, at) VALUES ('test', NULL, NULL, ?, 'sent', ?)").bind(id, now()).run();
      return json({ ok: true, to, message_id: id });
    } catch (e) {
      await env.DB.prepare("INSERT INTO email_send (kind, status, error, at) VALUES ('test', 'failed', ?, ?)").bind(String(e).slice(0, 300), now()).run();
      return json({ error: "Couldn't send the test: " + String(e).slice(0, 160) }, 502);
    }
  }

  // The real thing. Guards, in order: sender set up, a saved unsent draft, a sender line, the typed
  // count matching the live audience, the daily cap, the rate limit, then an atomic claim on the draft.
  if (path === "/v1/admin/email/send" && m === "POST") {
    if (!emailEnabled(env)) return json({ error: "Email sending isn't set up (RESEND_API_KEY + EMAIL_FROM)." }, 503);
    const id = typeof body?.id === "string" ? body.id : "";
    const row = await env.DB.prepare("SELECT id, subject, hero, body, button_text, button_url, sent_at FROM email_draft WHERE id = ?").bind(id).first<Draft & { id: string; sent_at: string | null }>();
    if (!row) return json({ error: "Save the draft first, then send it." }, 404);
    if (row.sent_at) return json({ error: "That draft has already been sent." }, 409);
    const c = cleanDraft(row);
    if (!c.ok) return json({ error: c.error }, 400);
    const postal = await postalLine(env);
    if (!postal) return json({ error: "Set the sender line (postal address / contact) first. The law asks for it in every update." }, 400);
    const people = (await audienceRows(env)).filter((p) => p.marketing_opt_in === 1 && p.email);
    const n = people.length;
    if (body?.confirm !== n || typeof body?.confirm !== "number") return json({ error: `Type the number of people (${n}) to confirm.`, audience: n }, 409);
    if (!n) return json({ error: "Nobody has opted in to updates yet." }, 400);
    const used = await sentLastDay(env), cap = dailyCap(env);
    if (used + n > cap) return json({ error: `That's ${n} emails, and ${used} went out in the last 24 hours. The cap is ${cap} a day (Resend's free plan sends 100 a day, sign-in codes included). Raise BROADCAST_DAILY_MAX after upgrading Resend.` }, 400);
    if (await limited(env, "bcast:send", 1, 10 * 60_000)) return json({ error: "One broadcast per 10 minutes. Wait a few minutes." }, 429);
    const at = now();
    const claim = await env.DB.prepare("UPDATE email_draft SET sent_at = ? WHERE id = ? AND sent_at IS NULL").bind(at, id).run();
    if (!claim.meta.changes) return json({ error: "That draft has already been sent." }, 409);
    const bid = "b_" + [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const who = `owner (${request.headers.get("CF-IPCountry") ?? "?"}, ${request.headers.get("CF-Connecting-IP") ?? "?"})`;
    await env.DB.prepare("INSERT INTO email_broadcast (id, draft_id, subject, audience, by, started_at) VALUES (?, ?, ?, ?, ?, ?)").bind(bid, id, row.subject, n, who, at).run();
    let sent = 0, failed = 0;
    const from = updatesFrom(env);
    for (let i = 0; i < n; i += BATCH) {
      const chunk = people.slice(i, i + BATCH);
      const mails: Mail[] = [];
      for (const p of chunk) {
        const unsub = await unsubUrl(env, p.id);
        mails.push({ to: p.email, from, subject: row.subject, ...updateEmail(c.draft, { name: p.name, unsubscribeUrl: unsub }, postal), headers: listHeaders(unsub) });
      }
      const res = await sendBatch(env, mails, `${bid}-${i / BATCH}`).catch((e) => ({ ids: mails.map(() => null), error: String(e).slice(0, 200) }));
      const t = now(), rows = chunk.map((p, j) => [bid, p.id, res.ids[j], res.ids[j] ? "sent" : "failed", res.ids[j] ? null : (res.error ?? "failed"), t]);
      for (let k = 0; k < rows.length; k += LOG_ROWS) {   // D1 allows 100 bound values per statement
        const part = rows.slice(k, k + LOG_ROWS);
        await env.DB.prepare(`INSERT INTO email_send (kind, broadcast_id, user_id, message_id, status, error, at) VALUES ${part.map(() => "('broadcast', ?, ?, ?, ?, ?, ?)").join(",")}`)
          .bind(...part.flat()).run();
      }
      for (const x of res.ids) x ? sent++ : failed++;
    }
    await env.DB.prepare("UPDATE email_broadcast SET sent = ?, failed = ?, finished_at = ? WHERE id = ?").bind(sent, failed, now(), bid).run();
    return json({ ok: failed === 0, broadcast_id: bid, sent, failed }, failed && !sent ? 502 : 200);
  }
  return json({ error: "not found" }, 404);
}

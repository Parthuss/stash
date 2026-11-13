// Product-update emails end to end against a real SQLite built from every migration: consent defaults
// off (existing and new accounts), sign-up / Profile opt-in, signed one-click unsubscribe (link + RFC
// 8058 POST), the owner's broadcast (never to non-opted-in or unverified addresses, typed-count guard,
// sender line, single send per draft, logs with message ids), tests to the owner only, and the email
// template (plain text always present, escaping, the sign-in code email stays transactional).
// Resend is a stub; nothing leaves the machine. Run: node tests/product_updates.cjs
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'), { webcrypto } = require('node:crypto');
const esbuild = require('../worker/node_modules/esbuild');

const mails = [];   // every email "sent", batch or single
const fakeFetch = async (url, init = {}) => {
  const u = String(url);
  if (u === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return Response.json({ id: 'em_' + mails.length }); }
  if (u === 'https://api.resend.com/emails/batch') {
    assert.ok(init.headers['Idempotency-Key'], 'batch sends carry an idempotency key');
    const list = JSON.parse(init.body); const ids = list.map((m) => { mails.push(m); return { id: 'em_' + mails.length }; });
    return Response.json({ data: ids });
  }
  throw new Error('unexpected fetch ' + u);
};
const mods = {};
function load(name) {
  if (mods[name]) return mods[name].exports;
  const js = esbuild.transformSync(fs.readFileSync(path.join(__dirname, '../worker/src', name + '.ts'), 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const module = (mods[name] = { exports: {} });
  vm.runInNewContext(js, { module, exports: module.exports, require: (p) => p.startsWith('./') ? load(p.slice(2)) : { EmailMessage: class {} },
    crypto: webcrypto, fetch: fakeFetch, caches: { default: { delete: async () => false } }, Request, Response, URL, URLSearchParams, Headers, TextEncoder, TextDecoder,
    console: { log() {}, error: console.error }, atob, btoa, setTimeout, Uint8Array, Uint32Array });
  return module.exports;
}

// Migrations up to 0034 first, with an account that exists before 0035: it must start opted out.
const sql = new DatabaseSync(':memory:');
const migs = fs.readdirSync(path.join(__dirname, '../worker/migrations')).sort();
const applyMig = (f) => sql.exec(fs.readFileSync(path.join(__dirname, '../worker/migrations', f), 'utf8'));
for (const f of migs.filter((f) => f < '0035')) applyMig(f);
sql.prepare("INSERT INTO user (id, name, token_hash, created_at, email, email_verified) VALUES ('old1', 'Olive', 'x', '2026-10-01T00:00:00Z', 'olive@example.com', 1)").run();
for (const f of migs.filter((f) => f >= '0035')) applyMig(f);

const run = (s, args) => ({ meta: { changes: Number(sql.prepare(s).run(...args).changes) } });
const DB = {
  prepare(s) { const st = { sql: s, args: [], bind(...a) { st.args = a; return st; },
    async first() { return sql.prepare(s).get(...st.args) ?? null; }, async all() { return { results: sql.prepare(s).all(...st.args) }; }, async run() { return run(s, st.args); } }; return st; },
  async batch(sts) { sql.exec('BEGIN'); try { const out = sts.map((s) => run(s.sql, s.args)); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
};
const env = { DB, STASH_SECRET: 'admin-secret', OPEN_JOIN: '1', RESEND_API_KEY: 're_test', EMAIL_FROM: 'signin@skwirl.app' };
const ctx = { waitUntil() {} };
const worker = load('index').default, login = load('login'), bc = load('broadcast'), email = load('email');

let ipN = 0;
const req = (method, p, body, auth, extra = {}) => worker.fetch(new Request('https://skwirl.app' + p, { method, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  headers: { 'CF-Connecting-IP': `10.1.0.${++ipN}`, 'content-type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...extra } }), env, ctx);
const OWNER = 'admin-secret';
const row = (q, ...a) => { const r = sql.prepare(q).get(...a); return r && { ...r }; };
const lastCode = () => mails.at(-1).subject.match(/^(\d{6}) /)[1];
let checks = 0;
const ok = (label) => { checks++; console.log('ok', checks, label); sql.exec('DELETE FROM join_attempt'); };

async function signup(addr, name, updates) {
  assert.equal((await req('POST', '/auth/email/start', { email: addr, signup: true })).status, 200);
  const r = await req('POST', '/auth/email/verify', { email: addr, code: lastCode(), name, ...(updates === undefined ? {} : { updates }) });
  assert.equal(r.status, 201);
  return (await r.json()).token;
}
const userByEmail = (e) => row('SELECT id, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source FROM user WHERE email = ?', e);

(async () => {
  // ---- consent defaults --------------------------------------------------------------------------
  assert.equal(row("SELECT marketing_opt_in FROM user WHERE id = 'old1'").marketing_opt_in, 0);
  ok('an account from before the migration starts NOT opted in');

  const tNo = await signup('nora@example.com', 'Nora');
  assert.equal(userByEmail('nora@example.com').marketing_opt_in, 0);
  await signup('sam@example.com', 'Sam', 'yes');
  assert.equal(userByEmail('sam@example.com').marketing_opt_in, 0);
  await signup('fay@example.com', 'Fay', false);
  assert.equal(userByEmail('fay@example.com').marketing_opt_in, 0);
  ok('sign-up without the box ticked (missing, false, or not a literal true) stays opted out');

  const tYes = await signup('yara@example.com', 'Yara', true);
  const y = userByEmail('yara@example.com');
  assert.equal(y.marketing_opt_in, 1); assert.equal(y.marketing_opt_in_source, 'signup'); assert.ok(y.marketing_opt_in_at);
  assert.equal(row('SELECT COUNT(*) n FROM email_consent_log WHERE user_id = ? AND opt_in = 1 AND source = ?', y.id, 'signup').n, 1);
  ok('ticking Product updates at sign-up stores opt-in + timestamp + source, and logs it');

  let me = await (await req('GET', '/v1/me', null, tNo)).json();
  assert.equal(me.updates, false);
  assert.equal((await req('PUT', '/v1/me/updates', { on: 'true' }, tNo)).status, 400);
  assert.equal((await req('PUT', '/v1/me/updates', { on: true }, tNo)).status, 200);
  assert.equal(userByEmail('nora@example.com').marketing_opt_in_source, 'profile');
  me = await (await req('GET', '/v1/me', null, tNo)).json();
  assert.equal(me.updates, true);
  assert.equal((await req('PUT', '/v1/me/updates', { on: false }, tNo)).status, 200);
  assert.equal(userByEmail('nora@example.com').marketing_opt_in, 0);
  assert.equal(row('SELECT COUNT(*) n FROM email_consent_log WHERE user_id = ?', userByEmail('nora@example.com').id).n, 2);
  ok('Profile toggles consent on and off (booleans only), each change logged');

  // ---- unsubscribe tokens --------------------------------------------------------------------------
  const yid = y.id, good = await bc.unsubToken(env, yid);
  assert.equal(await bc.checkUnsubToken(env, yid, good), true);
  assert.equal(await bc.checkUnsubToken(env, yid, good.slice(0, -1) + (good.at(-1) === 'A' ? 'B' : 'A')), false);
  assert.equal(await bc.checkUnsubToken(env, 'old1', good), false);
  assert.equal(await bc.checkUnsubToken(env, yid, ''), false);
  assert.equal(await bc.checkUnsubToken({ ...env, STASH_SECRET: 'other' }, yid, good), false);
  ok('unsubscribe tokens are bound to the user and the secret; tampering fails');

  let r = await req('GET', `/unsubscribe?u=${yid}&t=${good.replace(/^./, (c) => c === 'a' ? 'b' : 'a')}`);
  assert.equal(r.status, 400); assert.equal(userByEmail('yara@example.com').marketing_opt_in, 1);
  r = await req('GET', `/unsubscribe?u=${yid}&t=${good}`);   // signed out, one click
  assert.equal(r.status, 200); assert.match(await r.text(), /You&#39;re unsubscribed/);
  assert.equal(userByEmail('yara@example.com').marketing_opt_in, 0);
  assert.equal(userByEmail('yara@example.com').marketing_opt_in_source, 'unsubscribe_link');
  r = await req('POST', `/unsubscribe?u=${yid}&t=${good}`, 'action=resubscribe');
  assert.equal(r.status, 200); assert.equal(userByEmail('yara@example.com').marketing_opt_in, 1);
  r = await req('POST', `/unsubscribe?u=${yid}&t=${good}`, 'List-Unsubscribe=One-Click');
  assert.equal(r.status, 200); assert.equal(userByEmail('yara@example.com').marketing_opt_in, 0);
  assert.equal(userByEmail('yara@example.com').marketing_opt_in_source, 'one_click');
  assert.equal((await req('GET', '/unsubscribe?test=1')).status, 200);
  ok('the signed link unsubscribes signed out in one click, RFC 8058 POST works, undo works, bad tokens change nothing');

  // ---- broadcast audience & guards -----------------------------------------------------------------
  await req('PUT', '/v1/me/updates', { on: true }, tYes);                  // Yara: opted in, verified
  sql.prepare("INSERT INTO user (id, name, token_hash, created_at, email, email_verified, marketing_opt_in) VALUES ('unv', 'Uma', 'y', '2026-11-12T00:00:00Z', 'uma@example.com', 0, 1)").run();  // opted in, NOT verified
  sql.prepare("INSERT INTO user (id, name, token_hash, created_at, email, email_verified, marketing_opt_in) VALUES ('noaddr', 'Nil', 'z', '2026-11-12T00:00:00Z', NULL, 1, 1)").run();
  await login.setOwnerEmail(env, 'owner@example.com');

  const info = await (await req('GET', '/v1/admin/email', null, OWNER)).json();
  assert.equal(info.audience, 1);
  assert.equal(info.owner_email, 'owner@example.com');
  assert.equal(info.from, 'updates@skwirl.app');
  assert.equal((await req('GET', '/v1/admin/email', null, tYes)).status, 404);
  assert.equal((await req('GET', '/v1/admin/email')).status, 401);
  ok('owner-only; audience counts only opted-in users with a verified email');

  const plus = info.drafts.find((d) => d.id === 'plus-live');
  assert.ok(plus && !plus.sent_at, 'the Plus announcement is pre-drafted and unsent');
  const all = plus.subject + plus.hero + plus.body + plus.button_text;
  assert.doesNotMatch(all, /[—–]/, 'no em/en dashes');
  for (const fact of ['10 new saves a month', '25 latest', '250 saves a month', '2,000', 'categories', '$4.99 a month', '$39 a year']) assert.ok(plus.body.includes(fact), fact);
  ok('"Skwirl Plus is live" is the first saved draft: unsent, no em dashes, free vs Plus facts right');

  mails.length = 0;
  r = await req('POST', '/v1/admin/email/test', { subject: 'Hello', body: 'Hi {name}' }, OWNER);
  assert.equal(r.status, 200);
  assert.equal(mails.length, 1); assert.deepEqual(mails[0].to, ['owner@example.com']); assert.match(mails[0].subject, /^\[Test\] /);
  assert.ok(mails[0].text.length > 20 && mails[0].html.includes('<html'));
  assert.equal(row("SELECT COUNT(*) n FROM email_send WHERE kind = 'test' AND message_id = 'em_1'").n, 1);
  ok('Send test goes to the owner\'s verified address only, logged with its message id');

  mails.length = 0;
  r = await req('POST', '/v1/admin/email/send', { id: 'plus-live', confirm: 1 }, OWNER);
  assert.equal(r.status, 400); assert.match((await r.json()).error, /sender line/);
  assert.equal((await req('PUT', '/v1/admin/email/settings', { postal: 'x' }, OWNER)).status, 400);
  assert.equal((await req('PUT', '/v1/admin/email/settings', { postal: 'Skwirl, PO Box 1, Testville · hello@skwirl.app' }, OWNER)).status, 200);
  for (const confirm of [undefined, 0, 2, '1']) {
    r = await req('POST', '/v1/admin/email/send', { id: 'plus-live', confirm }, OWNER);
    assert.equal(r.status, 409); assert.equal((await r.json()).audience, 1);
  }
  assert.equal(mails.length, 0);
  assert.equal(row("SELECT sent_at FROM email_draft WHERE id = 'plus-live'").sent_at, null);
  ok('no sender line or a wrong typed count (missing, 0, 2, "1") sends nothing and leaves the draft unsent');

  r = await req('POST', '/v1/admin/email/send', { id: 'plus-live', confirm: 1 }, OWNER);
  assert.equal(r.status, 200);
  const sentRes = await r.json();
  assert.equal(sentRes.sent, 1);
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.deepEqual(m.to, ['yara@example.com']);
  assert.ok(!mails.some((x) => ['nora@example.com', 'sam@example.com', 'fay@example.com', 'olive@example.com', 'uma@example.com'].includes(x.to[0])));
  assert.equal(m.from, 'Skwirl <updates@skwirl.app>');
  assert.match(m.headers['List-Unsubscribe'], /^<https:\/\/skwirl\.app\/unsubscribe\?u=.+&t=[\w-]{32}>$/);
  assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  const link = m.headers['List-Unsubscribe'].slice(1, -1);
  assert.ok(m.html.includes(link.replace(/&/g, '&amp;')) && m.text.includes(link), 'unsubscribe link in html and text');
  assert.ok(m.text.includes('Hi Yara,') && m.text.includes('PO Box 1') && !/<[a-z]/i.test(m.text), 'plain text present, personalised, with the sender line');
  assert.ok(m.html.includes('Hi Yara,') && m.html.includes('See what&#39;s in Plus'));
  const log = row('SELECT b.audience, b.sent, b.by, s.message_id, s.user_id FROM email_broadcast b JOIN email_send s ON s.broadcast_id = b.id');
  assert.equal(log.sent, 1); assert.equal(log.message_id, 'em_1'); assert.equal(log.user_id, yid); assert.match(log.by, /^owner/);
  ok('the broadcast reaches only the opted-in, verified user, with RFC 8058 headers, plain text, and a send log');

  r = await req('POST', '/v1/admin/email/send', { id: 'plus-live', confirm: 1 }, OWNER);
  assert.equal(r.status, 409);
  assert.equal((await req('PUT', '/v1/admin/email/drafts', { id: 'plus-live', subject: 'x', body: 'y' }, OWNER)).status, 409);
  assert.equal(mails.length, 1);
  ok('a sent draft can\'t be sent again or edited');

  // Unsubscribing is honoured at once: nobody left, so the next broadcast has nobody to send to.
  const r2 = await req('PUT', '/v1/admin/email/drafts', { subject: 'Second', body: 'Hello again' }, OWNER);
  const id2 = (await r2.json()).id;
  await req('POST', link.replace('https://skwirl.app', ''), 'List-Unsubscribe=One-Click');
  sql.exec('DELETE FROM join_attempt');
  r = await req('POST', '/v1/admin/email/send', { id: id2, confirm: 1 }, OWNER);
  assert.equal(r.status, 409); assert.equal((await r.json()).audience, 0);
  r = await req('POST', '/v1/admin/email/send', { id: id2, confirm: 0 }, OWNER);
  assert.equal(r.status, 400);
  assert.equal(mails.length, 1);
  ok('after one-click unsubscribe the audience is 0 immediately and nothing more is sent');

  // Rate limit: one broadcast per 10 minutes.
  await req('PUT', '/v1/me/updates', { on: true }, tYes);
  const id3 = (await (await req('PUT', '/v1/admin/email/drafts', { subject: 'Third', body: 'Third' }, OWNER)).json()).id;
  assert.equal((await req('POST', '/v1/admin/email/send', { id: id2, confirm: 1 }, OWNER)).status, 200);
  assert.equal((await req('POST', '/v1/admin/email/send', { id: id3, confirm: 1 }, OWNER)).status, 429);
  ok('broadcasts are rate limited (one per 10 minutes)');

  // ---- the template --------------------------------------------------------------------------------
  const md = email.mdToHtml('Hello <script>alert(1)</script> **b** [ok](https://skwirl.app/x?a=1&b=2) [bad](javascript:alert(1))\n\n- one\n- two');
  assert.ok(!md.includes('<script>') && md.includes('&lt;script&gt;'));
  assert.ok(md.includes('href="https://skwirl.app/x?a=1&amp;b=2"') && !/href="javascript/.test(md));
  assert.ok(md.includes('<strong>b</strong>') && md.includes('one') && md.includes('&#8226;'));
  const preview = await (await req('POST', '/v1/admin/email/preview', { subject: 'S', body: 'B', button_text: 'Go', button_url: 'javascript:alert(1)' }, OWNER)).json();
  assert.ok(preview.html.includes('<html') && preview.text.includes('B') && !preview.html.includes('javascript:'));
  const dark = await (await req('POST', '/v1/admin/email/preview', { subject: 'S', body: 'B', dark: true }, OWNER)).json();
  assert.ok(!dark.html.includes('prefers-color-scheme') && preview.html.includes('prefers-color-scheme'));
  ok('markdown-lite escapes input, links only http(s), preview renders light and forced-dark');

  const code = login.codeEmail('a@example.com', '123456', 'Ana', 'signin');
  assert.equal(code.subject, '123456 is your Skwirl code');
  assert.ok(code.text.includes('123456') && code.html.includes('123456') && code.text.includes('Hi Ana,'));
  assert.ok(!/unsubscribe/i.test(code.html + code.text) && !code.headers, 'transactional: no unsubscribe, no list headers');
  assert.ok(code.html.includes('user-select:all') && code.html.includes('v:roundrect') === false);
  ok('the sign-in code email uses the template, code big and selectable, plain text included, no marketing');

  // Deleting an account removes its consent history and unlinks its send log.
  assert.equal((await req('DELETE', '/v1/account', { confirm: 'delete' }, tYes)).status, 200);
  assert.equal(row('SELECT COUNT(*) n FROM email_consent_log WHERE user_id = ?', yid).n, 0);
  assert.equal(row('SELECT COUNT(*) n FROM email_send WHERE user_id = ?', yid).n, 0);
  ok('account deletion clears consent history and unlinks sends');

  console.log(`\n${checks} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });

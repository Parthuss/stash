// Skwirl Plus end to end against a real SQLite built from every migration: signed Dodo webhooks,
// replay, bad/stale signatures, cancel/expire/refund, Plus-first claiming, setup, checkout, delete.
// Dodo's API is a recorded stub; nothing leaves the machine.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'), { webcrypto, createHmac } = require('node:crypto');
const esbuild = require('../worker/node_modules/esbuild');

const calls = [];
const fakeFetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method, body: init.body && JSON.parse(init.body) });
  const u = String(url);
  if (u.endsWith('/checkouts')) return Response.json({ session_id: 'cks_1', checkout_url: 'https://test.checkout.dodopayments.com/session/cks_1' });
  if (u.includes('/customer-portal/session')) return Response.json({ link: 'https://test.customer.dodopayments.com/portal' });
  return Response.json({});
};
const mods = {};
function load(name) {
  if (mods[name]) return mods[name].exports;
  const js = esbuild.transformSync(fs.readFileSync(path.join(__dirname, '../worker/src', name + '.ts'), 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const module = (mods[name] = { exports: {} });
  vm.runInNewContext(js, { module, exports: module.exports, require: (p) => p.startsWith('./') ? load(p.slice(2)) : { EmailMessage: class {} },
    crypto: webcrypto, fetch: fakeFetch, caches: { default: { delete: async () => false } }, Request, Response, URL, Headers, TextEncoder, TextDecoder,
    console, atob, btoa, setTimeout });
  return module.exports;
}

const sql = new DatabaseSync(':memory:');
for (const f of fs.readdirSync(path.join(__dirname, '../worker/migrations')).sort()) sql.exec(fs.readFileSync(path.join(__dirname, '../worker/migrations', f), 'utf8'));
const run = (s, args) => ({ meta: { changes: Number(sql.prepare(s).run(...args).changes) } });
const DB = {
  prepare(s) { const st = { sql: s, args: [], bind(...a) { st.args = a; return st; },
    async first() { return sql.prepare(s).get(...st.args) ?? null; }, async all() { return { results: sql.prepare(s).all(...st.args) }; }, async run() { return run(s, st.args); } }; return st; },
  async batch(sts) { sql.exec('BEGIN'); try { const out = sts.map((s) => run(s.sql, s.args)); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
};
const SECRET = 'whsec_' + Buffer.from('plus-test-secret-bytes').toString('base64');
const env = { DB, STASH_SECRET: 'admin', DODO_WEBHOOK_SECRET: SECRET, DODO_API_KEY: 'k', DODO_PRODUCT_MONTHLY: 'pdt_m', DODO_PRODUCT_YEARLY: 'pdt_y', PLUS_ACCESS: 'ua' };
const ctx = { waitUntil() {} };
const worker = load('index').default, v1 = load('v1');
const user = (id, email) => sql.prepare("INSERT INTO user (id, name, token_hash, created_at, email) VALUES (?, ?, ?, ?, ?)").run(id, id, 'h' + id, '2026-11-01', email);
const plan = (id) => { const r = sql.prepare('SELECT plan, plan_until, dodo_customer_id c, dodo_subscription_id s FROM user WHERE id = ?').get(id); return r && { ...r }; };
const later = new Date(Date.now() + 30 * 86400e3).toISOString();

function hook(id, body, { ts = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const raw = JSON.stringify(body);
  const sig = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${ts}.${raw}`).digest('base64');
  return worker.fetch(new Request('https://skwirl.app/webhooks/dodo', { method: 'POST', body: raw,
    headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sig}` } }), env, ctx);
}
const sub = (type, status, extra = {}) => ({ type, data: { subscription_id: 'sub_a', status, next_billing_date: later, customer: { customer_id: 'cus_a' }, metadata: { user_id: 'ua' }, ...extra } });
const setup = async (id) => (await v1.handleV1(new Request('https://skwirl.app/v1/setup'), env, '/v1/setup', id, () => {})).json();
const call = (id, p, method = 'GET', body) => v1.handleV1(new Request('https://skwirl.app' + p, { method, body: body && JSON.stringify(body) }), env, p, id, async () => ({ id: 'new', created: true }));

(async () => {
  user('ua', 'a@example.com'); user('ub', null);

  // Checkout: only allow-listed people, only valid intervals, metadata carries the user id.
  assert.equal((await call('ub', '/v1/plus/checkout', 'POST', { interval: 'month' })).status, 403);
  assert.equal((await call(null, '/v1/plus/checkout', 'POST', { interval: 'month' })).status, 403);
  assert.equal((await call('ua', '/v1/plus/checkout', 'POST', { interval: 'week' })).status, 400);
  const co = await call('ua', '/v1/plus/checkout', 'POST', { interval: 'year' });
  assert.equal(co.status, 200); assert.match((await co.json()).checkout_url, /test\.checkout/);
  const sent = calls.at(-1);
  assert.equal(sent.url, 'https://test.dodopayments.com/checkouts');
  assert.deepEqual(sent.body.product_cart, [{ product_id: 'pdt_y', quantity: 1 }]);
  assert.equal(sent.body.metadata.user_id, 'ua'); assert.equal(sent.body.customer.email, 'a@example.com');
  assert.equal(sent.body.return_url, 'https://skwirl.app/?plus=done');
  assert.equal((await setup('ua')).plan, 'free'); assert.equal((await setup('ua')).plus_available, true); assert.equal((await setup('ub')).plus_available, false);
  console.log('PASS checkout gate and session body');

  // Bad and stale signatures are refused and change nothing.
  assert.equal((await hook('evt_bad', sub('subscription.active', 'active'), { secret: 'whsec_' + Buffer.from('wrong').toString('base64') })).status, 401);
  assert.equal((await hook('evt_old', sub('subscription.active', 'active'), { ts: Math.floor(Date.now() / 1000) - 600 })).status, 401);
  assert.equal(plan('ua').plan, 'free');
  console.log('PASS bad and stale signatures -> 401');

  // A failed first payment: stays free.
  assert.equal((await hook('evt_f', sub('subscription.failed', 'failed', { subscription_id: 'sub_x' }))).status, 200);
  assert.equal(plan('ua').plan, 'free');
  // Activation flips to Plus; setup reports it.
  assert.equal((await hook('evt_1', sub('subscription.active', 'active'))).status, 200);
  assert.deepEqual(plan('ua'), { plan: 'plus', plan_until: later, c: 'cus_a', s: 'sub_a' });
  const st = await setup('ua'); assert.equal(st.plan, 'plus'); assert.equal(st.plan_until, later); assert.equal(st.plus_over_cap, false);
  assert.equal((await call('ua', '/v1/plus/checkout', 'POST', { interval: 'month' })).status, 409);
  console.log('PASS failed stays free, active -> plus');

  // Replay: same webhook-id applies once.
  sql.prepare("UPDATE user SET plan_until = '2030-01-01T00:00:00.000Z' WHERE id = 'ua'").run();
  const again = await hook('evt_1', sub('subscription.active', 'active'));
  assert.equal(again.status, 200); assert.equal((await again.json()).duplicate, true);
  assert.equal(plan('ua').plan_until, '2030-01-01T00:00:00.000Z');
  sql.prepare('UPDATE user SET plan_until = ? WHERE id = ?').run(later, 'ua');
  console.log('PASS replay is a no-op');

  // Plus saves are claimed first; Plus imports still wait behind everyone's live saves.
  const cap = (id, u, src, at) => sql.prepare("INSERT INTO capture (id, source, permalink, status, attempts, captured_at, user_id) VALUES (?, ?, ?, 'pending', 0, ?, ?)").run(id, src, 'https://www.instagram.com/reel/' + id + '/', at, u);
  cap('free1', 'ub', 'web', '2026-11-01T00:00:00Z'); cap('plusimp', 'ua', 'import', '2026-10-01T00:00:00Z'); cap('plus1', 'ua', 'web', '2026-11-02T00:00:00Z');
  const claim = async () => (await (await worker.fetch(new Request('https://skwirl.app/claim', { method: 'POST', headers: { 'X-Stash-Secret': 'admin' } }), env, ctx)).json()).capture;
  const first = await claim(); assert.equal(first.id, 'plus1'); assert.equal(first.groq_key, null);
  assert.equal((await claim()).id, 'free1'); assert.equal((await claim()).id, 'plusimp');
  console.log('PASS claim order: Plus live, free live, then imports');

  // Ingest: Plus gets the own-key daily allowance, not the shared 30.
  for (let i = 0; i < 30; i++) cap('t' + i, 'ua', 'web', new Date().toISOString());
  sql.prepare("UPDATE capture SET status='done' WHERE user_id='ua'").run();
  const ing = await call('ua', '/v1/ingest', 'POST', { url: 'https://www.instagram.com/reel/NEW1/' });
  assert.equal(ing.status, 202);
  console.log('PASS Plus is not held to the shared daily cap');

  // Soft cap: past 500 this month, a note, nothing blocked.
  const now = new Date().toISOString();
  sql.exec('BEGIN'); for (let i = 0; i < 480; i++) cap('m' + i, 'ua', 'web', now); sql.exec('COMMIT');
  assert.equal((await setup('ua')).plus_over_cap, true);
  console.log('PASS soft cap reported past 500');

  // Cancel (in the portal): keeps Plus to the end of the period. Expiry ends it.
  assert.equal((await hook('evt_2', sub('subscription.cancelled', 'cancelled'))).status, 200);
  assert.equal((await hook('evt_3', sub('subscription.updated', 'cancelled'))).status, 200);
  assert.deepEqual([plan('ua').plan, plan('ua').plan_until], ['plus', later]);
  assert.equal((await hook('evt_4', sub('subscription.expired', 'expired'))).status, 200);
  assert.equal(plan('ua').plan, 'free'); assert.equal((await setup('ua')).plan, 'free');
  // A lapsed date means free even before any webhook says so.
  sql.prepare("UPDATE user SET plan='plus', plan_until='2020-01-01T00:00:00.000Z' WHERE id='ua'").run();
  assert.equal((await setup('ua')).plan, 'free');
  console.log('PASS cancel keeps the paid period, expiry and lapse end it');

  // Renewal brings it back; a full refund ends it at once and cancels renewals; partial does nothing.
  assert.equal((await hook('evt_5', sub('subscription.renewed', 'active'))).status, 200);
  assert.equal(plan('ua').plan, 'plus');
  assert.equal((await hook('evt_6', { type: 'refund.succeeded', data: { is_partial: true, customer: { customer_id: 'cus_a' } } })).status, 200);
  assert.equal(plan('ua').plan, 'plus');
  calls.length = 0;
  assert.equal((await hook('evt_7', { type: 'refund.succeeded', data: { is_partial: false, customer: { customer_id: 'cus_a' } } })).status, 200);
  assert.equal(plan('ua').plan, 'free');
  assert.deepEqual(calls.map((c) => [c.method, c.url, c.body]), [['PATCH', 'https://test.dodopayments.com/subscriptions/sub_a', { status: 'cancelled' }]]);
  console.log('PASS refunds');

  // Portal link and events we ignore.
  assert.equal((await (await call('ua', '/v1/plus/portal')).json()).link, 'https://test.customer.dodopayments.com/portal');
  assert.equal((await call('ub', '/v1/plus/portal')).status, 404);
  assert.equal((await hook('evt_8', { type: 'payment.succeeded', data: {} })).status, 200);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM webhook_seen WHERE id = 'evt_8'").get().n, 0);
  console.log('PASS portal, ignored events');

  // Deleting the account cancels billing first.
  calls.length = 0;
  await v1.deleteUser(env, 'ua', 'https://skwirl.app');
  assert.deepEqual(calls.map((c) => c.method + ' ' + c.url), ['PATCH https://test.dodopayments.com/subscriptions/sub_a']);
  assert.equal(plan('ua'), undefined);
  console.log('PASS delete cancels the subscription');
  console.log('ALL PLUS TESTS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });

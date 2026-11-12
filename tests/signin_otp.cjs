// Accounts end to end against a real SQLite built from every migration: email + 6-digit code
// (expiry, single use, 5 tries, rate limits, normalisation, hashed at rest, no account probing),
// sign-up gating, "Add your email" for older accounts, and Google ID tokens checked against a
// mock JWKS (real RS256 signatures). Resend and Google are stubs; nothing leaves the machine.
// Run: node tests/signin_otp.cjs
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'), { webcrypto } = require('node:crypto');
const esbuild = require('../worker/node_modules/esbuild');

// ---- stubs: Resend (captures the code) and Google's JWKS --------------------------------------
const mails = [];
let jwksFetches = 0, jwksKeys = [];
const fakeFetch = async (url, init = {}) => {
  const u = String(url);
  if (u === 'https://api.resend.com/emails') {
    assert.equal(init.headers.Authorization, 'Bearer re_test');
    mails.push(JSON.parse(init.body));
    return Response.json({ id: 'em_' + mails.length });
  }
  if (u === 'https://www.googleapis.com/oauth2/v3/certs') { jwksFetches++; return Response.json({ keys: jwksKeys }, { headers: { 'cache-control': 'public, max-age=20000' } }); }
  throw new Error('unexpected fetch ' + u);
};
const mods = {};
function load(name) {
  if (mods[name]) return mods[name].exports;
  const js = esbuild.transformSync(fs.readFileSync(path.join(__dirname, '../worker/src', name + '.ts'), 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const module = (mods[name] = { exports: {} });
  vm.runInNewContext(js, { module, exports: module.exports, require: (p) => p.startsWith('./') ? load(p.slice(2)) : { EmailMessage: class {} },
    crypto: webcrypto, fetch: fakeFetch, caches: { default: { delete: async () => false } }, Request, Response, URL, Headers, TextEncoder, TextDecoder,
    console: { log() {} , error: console.error }, atob, btoa, setTimeout, Uint8Array, Uint32Array });
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
const CLIENT = '1234-test.apps.googleusercontent.com';
const env = { DB, STASH_SECRET: 'admin-secret', OPEN_JOIN: '1', RESEND_API_KEY: 're_test', EMAIL_FROM: 'signin@skwirl.app', GOOGLE_CLIENT_ID: CLIENT };
const ctx = { waitUntil() {} };
const worker = load('index').default, v1 = load('v1'), login = load('login'), google = load('google');

let ipN = 0;
const freshIp = () => `10.0.0.${++ipN}`;
const post = (p, body, { ip = freshIp(), auth } = {}) => worker.fetch(new Request('https://skwirl.app' + p, { method: 'POST', body: JSON.stringify(body),
  headers: { 'CF-Connecting-IP': ip, 'content-type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) } }), env, ctx);
const get = (p, auth) => worker.fetch(new Request('https://skwirl.app' + p, { headers: auth ? { Authorization: 'Bearer ' + auth } : {} }), env, ctx);
const lastCode = () => mails.at(-1).subject.match(/^(\d{6}) /)[1];
const whoIs = (t) => v1.userFromToken(t, env);
const row = (q, ...a) => { const r = sql.prepare(q).get(...a); return r && { ...r }; };
const wrong = (c) => String((Number(c) + 1) % 1e6).padStart(6, '0');
let checks = 0;
// Each check starts with fresh rate-limit windows (the limits themselves are checks 10-11).
const ok = (label) => { checks++; console.log('ok', checks, label); sql.exec('DELETE FROM join_attempt'); };

(async () => {
  // 1. Normalisation
  assert.equal(login.normEmail('  Sam@Example.COM '), 'sam@example.com');
  assert.equal(login.normEmail('a.b+tag@Gmail.com'), 'a.b+tag@gmail.com');  // dots and +tags kept
  for (const bad of ['', 'sam', 'sam@', '@x.com', 'a b@x.com', 'x'.repeat(120) + '@x.com', 42, null]) assert.equal(login.normEmail(bad), null);
  ok('email normalisation');

  // 2. Sign up: code first, then the account (needs a first name; without one the code survives)
  let r = await post('/auth/email/start', { email: '  Sam@Example.COM ', signup: true });
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
  assert.equal(mails.length, 1); assert.deepEqual(mails[0].to, ['sam@example.com']); assert.equal(mails[0].from, 'Skwirl <signin@skwirl.app>');
  assert.match(mails[0].text, /create your Skwirl account/);
  const c1 = lastCode();
  r = await post('/auth/email/verify', { email: 'sam@example.com', code: c1 });
  assert.equal(r.status, 409); assert.equal((await r.json()).needs_name, true);
  r = await post('/auth/email/verify', { email: 'SAM@example.com ', code: c1.slice(0, 3) + ' ' + c1.slice(3), name: 'Sam' });
  assert.equal(r.status, 201);
  let b = await r.json(); assert.equal(b.created, true); assert.equal(b.name, 'Sam');
  const samA = await whoIs(b.token); assert.ok(samA);
  assert.deepEqual(row('SELECT name, email, email_verified FROM user WHERE id = ?', samA), { name: 'Sam', email: 'sam@example.com', email_verified: 1 });
  ok('sign-up by code, name asked for, email stored normalised and verified');

  // 3. Single use
  r = await post('/auth/email/verify', { email: 'sam@example.com', code: c1, name: 'Sam' });
  assert.equal(r.status, 400); assert.match((await r.json()).error, /expired or was already used/);
  ok('a code works once');

  // 4. Hashed at rest: no code and no address in the table
  await post('/auth/email/start', { email: 'sam@example.com' });
  const c2 = lastCode(), stored = row('SELECT * FROM email_code');
  assert.ok(stored); assert.notEqual(stored.code_hash, c2); assert.ok(!JSON.stringify(stored).includes(c2)); assert.ok(!JSON.stringify(stored).includes('sam@'));
  assert.match(stored.code_hash, /^[0-9a-f]{64}$/);
  ok('codes and addresses are hashed at rest');

  // 5. Sign in: existing account, existing tokens keep working, mail greets by name
  assert.match(mails.at(-1).text, /Hi Sam,[\s\S]*to sign in/);
  r = await post('/auth/email/verify', { email: 'sam@example.com', code: c2 });
  b = await r.json(); assert.equal(r.status, 200); assert.equal(b.created, false);
  assert.equal(await whoIs(b.token), samA);
  ok('sign-in by code mints a device token for the same account');

  // 6. Same name, different person: keyed by id/email, never by name
  await post('/auth/email/start', { email: 'sam@other.org', signup: true });
  r = await post('/auth/email/verify', { email: 'sam@other.org', code: lastCode(), name: 'Sam' });
  const samB = await whoIs((await r.json()).token);
  assert.ok(samB && samB !== samA);
  await post('/auth/email/start', { email: 'sam@example.com' });
  r = await post('/auth/email/verify', { email: 'sam@example.com', code: lastCode() });
  assert.equal(await whoIs((await r.json()).token), samA);
  ok('two people called Sam get separate accounts; email finds the right one');

  // 7. Expiry (10 minutes)
  await post('/auth/email/start', { email: 'sam@example.com' });
  const c3 = lastCode();
  const exp = row('SELECT expires_at FROM email_code WHERE purpose = ?', 'signin').expires_at;
  const mins = (Date.parse(exp) - Date.now()) / 60000; assert.ok(mins > 9.9 && mins <= 10, String(mins));
  sql.prepare('UPDATE email_code SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
  r = await post('/auth/email/verify', { email: 'sam@example.com', code: c3 });
  assert.equal(r.status, 400); assert.match((await r.json()).error, /expired/);
  assert.equal(row('SELECT COUNT(*) n FROM email_code').n, 0);
  ok('codes expire after 10 minutes');

  // 8. Five tries, then the code is dead (even the right one)
  await post('/auth/email/start', { email: 'sam@example.com' });
  const c4 = lastCode(); const lefts = [];
  for (let i = 0; i < 5; i++) { r = await post('/auth/email/verify', { email: 'sam@example.com', code: wrong(c4) }); assert.equal(r.status, 400); lefts.push((await r.json()).left); }
  assert.deepEqual(lefts, [4, 3, 2, 1, 0]);
  r = await post('/auth/email/verify', { email: 'sam@example.com', code: c4 });
  assert.equal(r.status, 400);
  ok('5 wrong tries kill the code');

  // 9. A new code replaces the old one
  await post('/auth/email/start', { email: 'sam@example.com' }); const old = lastCode();
  await post('/auth/email/start', { email: 'sam@example.com' }); const fresh = lastCode();
  if (old !== fresh) { r = await post('/auth/email/verify', { email: 'sam@example.com', code: old }); assert.equal(r.status, 400); }
  r = await post('/auth/email/verify', { email: 'sam@example.com', code: fresh }); assert.equal(r.status, 200);
  ok('asking again replaces the old code');

  // 10. Rate limit per address (5 an hour, from any network)
  for (let i = 0; i < 5; i++) assert.equal((await post('/auth/email/start', { email: 'flood@x.com' })).status, 200);
  r = await post('/auth/email/start', { email: 'FLOOD@x.com' }); assert.equal(r.status, 429);
  ok('per-address limit (5/hour), case-insensitive');

  // 11. Rate limit per network (10 an hour), and wrong codes per network (30 an hour)
  const ip = freshIp();
  for (let i = 0; i < 10; i++) assert.equal((await post('/auth/email/start', { email: `p${i}@x.com` }, { ip })).status, 200);
  assert.equal((await post('/auth/email/start', { email: 'p99@x.com' }, { ip })).status, 429);
  const bad = freshIp();
  for (let i = 0; i < 30; i++) await post('/auth/email/verify', { email: `nobody${i}@x.com`, code: '000000' }, { ip: bad });
  r = await post('/auth/email/verify', { email: 'sam@example.com', code: '000000' }, { ip: bad }); assert.equal(r.status, 429);
  ok('per-network limits on sending and on wrong codes');

  // 12. No probing: same answer for known and unknown addresses
  const a1 = await post('/auth/email/start', { email: 'sam@example.com' }), a2 = await post('/auth/email/start', { email: 'ghost@example.com' });
  assert.equal(a1.status, a2.status); assert.deepEqual(await a1.json(), await a2.json());
  ok('start answers the same whether or not an account exists');

  // 13. Joining rules still apply: invite-only + cap
  delete env.OPEN_JOIN; env.JOIN_CODE = 'letmein';
  r = await post('/auth/email/start', { email: 'new@x.com', signup: true, invite: 'nope' }); assert.equal(r.status, 403);
  r = await post('/auth/email/start', { email: 'new@x.com', signup: true, invite: 'letmein' }); assert.equal(r.status, 200);
  r = await post('/auth/email/verify', { email: 'new@x.com', code: lastCode(), name: 'Nia', invite: 'nope' }); assert.equal(r.status, 403);
  r = await post('/auth/email/verify', { email: 'new@x.com', code: lastCode(), name: 'Nia', invite: 'letmein' }); assert.equal(r.status, 201);
  // signing in to an existing account needs no invite
  r = await post('/auth/email/start', { email: 'sam@example.com' }); assert.equal(r.status, 200);
  assert.equal((await post('/auth/email/verify', { email: 'sam@example.com', code: lastCode() })).status, 200);
  env.OPEN_JOIN = '1'; delete env.JOIN_CODE;
  ok('invite code checked for new accounts only');

  // 14. Without a sender: email sign-in is off, /join needs an email; with one, /join refuses
  let info = await (await get('/join')).json(); assert.equal(info.email_login, true); assert.equal(info.google_client_id, CLIENT);
  r = await post('/join', { name: 'Old way', email: 'old@x.com' }); assert.equal(r.status, 409);
  const saved = { k: env.RESEND_API_KEY }; delete env.RESEND_API_KEY;
  info = await (await get('/join')).json(); assert.equal(info.email_login, false);
  assert.equal((await post('/auth/email/start', { email: 'sam@example.com' })).status, 503);
  assert.equal((await post('/join', { name: 'Al' })).status, 400);
  r = await post('/join', { name: 'Al', email: ' AL@x.com ' }); assert.equal(r.status, 201);
  const al = await whoIs((await r.json()).token);
  assert.deepEqual(row('SELECT email, email_verified FROM user WHERE id = ?', al), { email: 'al@x.com', email_verified: 0 });
  env.RESEND_API_KEY = saved.k;
  ok('email off: /join needs an email (unverified); email on: sign-up goes through a code');

  // 15. Older accounts: "Add your email", skippable once, then required; the code confirms it
  sql.prepare("INSERT INTO user (id, name, token_hash, created_at) VALUES ('legacy', 'Jo', 'h-legacy', '2026-10-01')").run();
  sql.prepare("INSERT INTO user (id, name, token_hash, created_at) VALUES ('legacy2', 'Jo', 'h-legacy2', '2026-10-01')").run();
  const setup = async (id) => (await v1.handleV1(new Request('https://skwirl.app/v1/setup'), env, '/v1/setup', id, () => {})).json();
  const call = (id, p, body, method = 'POST') => v1.handleV1(new Request('https://skwirl.app' + p, { method, body: JSON.stringify(body) }), env, p, id, () => {});
  assert.equal((await setup('legacy')).email_ask, 'skippable');
  await call('legacy', '/v1/email/skip', {});
  assert.equal((await setup('legacy')).email_ask, 'required');
  assert.equal((await setup(samA)).email_ask, null);
  assert.equal((await setup(null)).email_ask, null);  // the owner is never asked
  r = await call('legacy', '/v1/email/start', { email: 'Jo@X.com' }); b = await r.json();
  assert.equal(b.sent, true); assert.match(mails.at(-1).text, /add this email/);
  const addCode = lastCode();
  assert.equal(row("SELECT email FROM user WHERE id = 'legacy'").email, null);  // not saved until confirmed
  r = await call('legacy2', '/v1/email/verify', { email: 'jo@x.com', code: addCode }); assert.equal(r.status, 400);  // someone else's code
  r = await call('legacy', '/v1/email/verify', { email: 'jo@x.com', code: addCode }); assert.equal(r.status, 200);
  assert.deepEqual(row("SELECT email, email_verified FROM user WHERE id = 'legacy'"), { email: 'jo@x.com', email_verified: 1 });
  assert.equal((await setup('legacy')).email_ask, null);
  // can't take an address another account has proven
  r = await call('legacy2', '/v1/email/start', { email: 'sam@example.com' }); assert.equal(r.status, 409);
  assert.equal((await call(null, '/v1/email/start', { email: 'o@x.com' })).status, 400);
  // and the new address signs in to that account
  await post('/auth/email/start', { email: 'jo@x.com' });
  assert.equal(await whoIs((await (await post('/auth/email/verify', { email: 'jo@x.com', code: lastCode() })).json()).token), 'legacy');
  ok('add-email prompt: skippable once, then required; confirmed by code; owner never asked');

  // 16. Profile: changing the email goes through a code; it can't be blanked
  r = await call(samA, '/v1/me', { name: 'Sam A', email: 'sam.new@example.com' }, 'PUT'); b = await r.json();
  assert.equal(b.sent, true); assert.equal(row('SELECT name, email FROM user WHERE id = ?', samA).email, 'sam@example.com');
  assert.equal(row('SELECT name FROM user WHERE id = ?', samA).name, 'Sam A');
  r = await call(samA, '/v1/me', { name: 'Sam A', email: '' }, 'PUT'); assert.equal(r.status, 400);
  ok('profile email change needs the code; email cannot be emptied');

  // 17. Send failure while adding never strands anyone: saved unproven
  const realKey = env.RESEND_API_KEY; env.RESEND_API_KEY = 're_broken';
  r = await call('legacy2', '/v1/email/start', { email: 'jo2@x.com' }); b = await r.json();
  assert.equal(b.saved, true); assert.deepEqual(row("SELECT email, email_verified FROM user WHERE id = 'legacy2'"), { email: 'jo2@x.com', email_verified: 0 });
  env.RESEND_API_KEY = realKey;
  ok('a failed add-email send saves the address (unverified) instead of blocking');

  // ---- Google ----------------------------------------------------------------------------------
  const subtle = webcrypto.subtle;
  const mk = async (kid) => { const k = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    return { kid, priv: k.privateKey, jwk: { ...(await subtle.exportKey('jwk', k.publicKey)), kid, alg: 'RS256', use: 'sig' } }; };
  const k1 = await mk('kid-1'), k2 = await mk('kid-2'), rogue = await mk('kid-1');
  jwksKeys = [k1.jwk, k2.jwk];
  const b64u = (x) => Buffer.from(x).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const jwt = async (claims = {}, { key = k1, kid = key.kid, alg = 'RS256' } = {}) => {
    const h = b64u(JSON.stringify({ alg, kid, typ: 'JWT' })), p = b64u(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub: 'g-111',
      email: 'Gina@Gmail.com', email_verified: true, given_name: 'Gina', name: 'Gina Lee', iat: now, exp: now + 3600, ...claims }));
    const sig = await subtle.sign('RSASSA-PKCS1-v1_5', key.priv, Buffer.from(h + '.' + p));
    return `${h}.${p}.${b64u(new Uint8Array(sig))}`;
  };
  const vg = (cred) => google.verifyGoogleIdToken(env, cred, fakeFetch);
  const g = await vg(await jwt());
  assert.equal(g.sub, 'g-111'); assert.equal(g.email, 'gina@gmail.com'); assert.equal(g.given_name, 'Gina');
  assert.ok((await vg(await jwt({ iss: 'accounts.google.com' }))));
  assert.ok((await vg(await jwt({}, { key: k2 }))));
  ok('valid Google ID tokens verify (both issuers, either key)');

  for (const [label, cred] of [
    ['wrong audience', await jwt({ aud: 'someone-else.apps.googleusercontent.com' })],
    ['wrong issuer', await jwt({ iss: 'https://evil.example' })],
    ['expired', await jwt({ exp: now - 3600, iat: now - 7200 })],
    ['issued in the future', await jwt({ iat: now + 3600 })],
    ['unverified email', await jwt({ email_verified: false })],
    ['no email', await jwt({ email: undefined })],
    ['forged signature (same kid, other key)', await jwt({}, { key: rogue })],
    ['alg none', await jwt({}, { alg: 'none' })],
    ['tampered payload', (await jwt()).replace(/\.([^.]+)\./, (_, p) => '.' + b64u(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: 'g-evil' })) + '.')],
    ['garbage', 'not.a.jwt'], ['not a string', 42],
  ]) assert.equal(await vg(cred), null, label);
  ok('bad Google tokens rejected (aud, iss, exp, iat, email_verified, signature, alg, tampering)');

  const before = jwksFetches;
  assert.equal(await vg(await jwt({}, { kid: 'kid-unknown' })), null);
  assert.equal(jwksFetches, before + 1);  // an unknown kid refetches once (key rotation), then gives up
  await vg(await jwt()); assert.equal(jwksFetches, before + 1);  // cached otherwise
  ok('JWKS cached; unknown kid triggers one refetch');

  // /auth/google: create, sign in again, link to an existing email account
  r = await post('/auth/google', { credential: await jwt() }); b = await r.json();
  assert.equal(r.status, 201); assert.equal(b.name, 'Gina');
  const gina = await whoIs(b.token);
  assert.deepEqual(row('SELECT email, email_verified, google_sub FROM user WHERE id = ?', gina), { email: 'gina@gmail.com', email_verified: 1, google_sub: 'g-111' });
  r = await post('/auth/google', { credential: await jwt({ email: 'gina.new@gmail.com' }) });  // same Google account, new address
  assert.equal(await whoIs((await r.json()).token), gina);
  r = await post('/auth/google', { credential: await jwt({ sub: 'g-222', email: 'Sam@Example.com', given_name: 'Samuel' }) });
  b = await r.json(); assert.equal(b.created, false); assert.equal(await whoIs(b.token), samA);
  assert.equal(row('SELECT google_sub FROM user WHERE id = ?', samA).google_sub, 'g-222');
  // and email sign-in reaches the Google-made account
  await post('/auth/email/start', { email: 'gina@gmail.com' });
  assert.equal(await whoIs((await (await post('/auth/email/verify', { email: 'gina@gmail.com', code: lastCode() })).json()).token), gina);
  assert.equal((await post('/auth/google', { credential: await jwt({ aud: 'x' }) })).status, 401);
  const cid = env.GOOGLE_CLIENT_ID; delete env.GOOGLE_CLIENT_ID;
  assert.equal((await post('/auth/google', { credential: await jwt() })).status, 503);
  assert.equal((await (await get('/join')).json()).google_client_id, null);
  env.GOOGLE_CLIENT_ID = cid;
  ok('/auth/google creates, re-finds by Google id, links by verified email; hidden without GOOGLE_CLIENT_ID');

  // Nothing in the worker finds a user by name.
  const src = fs.readdirSync(path.join(__dirname, '../worker/src')).map((f) => fs.readFileSync(path.join(__dirname, '../worker/src', f), 'utf8')).join('\n');
  assert.ok(!/FROM user[^;"`]*WHERE[^;"`]*\bname\s*=/i.test(src), 'a query looks a user up by name');
  ok('no user lookups by name in worker/src');

  console.log(`\nall ${checks} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });

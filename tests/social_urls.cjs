// Recorded URL shapes and real handlers, no network or live database calls.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { webcrypto } = require('node:crypto');
const esbuild = require('../worker/node_modules/esbuild');
function load(name, imports = {}) {
  const src = fs.readFileSync(path.join(__dirname, '../worker/src', name + '.ts'), 'utf8');
  const js = esbuild.transformSync(src, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require: p => imports[p] || {}, crypto: webcrypto,
    Request, Response, URL, TextEncoder, TextDecoder, console, atob, btoa });
  return module.exports;
}
const v1 = load('v1');
const fixtures = [
  ['https://www.reddit.com/r/learnpython/comments/AbC123/a_question/?utm_source=share#x', 'https://www.reddit.com/comments/abc123/'],
  ['https://old.reddit.com/comments/abc123/comment/thread', 'https://www.reddit.com/comments/abc123/'],
  ['https://redd.it/AbC123?share_id=x', 'https://www.reddit.com/comments/abc123/'],
  ['https://reddit.com/r/test/s/AbCd123?utm_source=share', 'https://www.reddit.com/r/test/s/AbCd123'],
  ['https://linkedin.com/posts/author_title-activity-123/?utm_source=share#x', 'https://www.linkedin.com/posts/author_title-activity-123/'],
  ['https://www.linkedin.com/feed/update/urn:li:activity:123456789/?utm_source=share', 'https://www.linkedin.com/feed/update/urn:li:activity:123456789/'],
  ['https://lnkd.in/eAb_C-1?x=y#z', 'https://lnkd.in/eAb_C-1'],
  ['https://instagram.com/reel/test/', 'https://instagram.com/reel/test/'],
];
for (const [raw, normalized] of fixtures) assert.equal(v1.allowedUrl(raw), normalized, raw);
for (const raw of [
  'http://reddit.com/comments/abc/', 'https://user:pass@linkedin.com/posts/x',
  'https://reddit.com:444/comments/abc/', 'https://reddit.com.evil.test/comments/abc/',
  'https://evil.test/?url=https://reddit.com/comments/abc/', 'https://127.0.0.1/comments/abc/',
  'https://reddit.com/r/test', 'https://linkedin.com/login', 'https://linkedin.com/in/profile',
  'https://lnkd.in/', 'https://redd.it/a/b', 'https://lnkd.in/a/b',
]) assert.equal(v1.allowedUrl(raw), null, raw);
assert.equal(v1.friendlyReason('LinkedIn only shows this post to signed-in members', true), 'LinkedIn only shows this post to signed-in members.');
assert.match(v1.friendlyReason('LinkedIn approval required', true), /approved platform access/);
assert.match(v1.friendlyReason('Reddit returned 403', true), /^Reddit/);
const blockedDB = { prepare(sql) {
  assert.match(sql, /^UPDATE user SET last_seen/, 'gate must run before quota and queue access');
  return { bind() { return this; }, async run() { return {}; } };
} };
const request = (route, url, headers) => new Request('https://skwirl.app' + route, {
  method: 'POST', headers, body: JSON.stringify({ url }),
});
(async () => {
  let writes = 0;
  for (const [url] of fixtures.slice(0, 7)) {
    const r = await v1.handleV1(request('/v1/ingest', url), { DB: blockedDB }, '/v1/ingest', 'fixture-user', () => { writes++; });
    assert.equal(r.status, 422, url);
    assert.match((await r.json()).error, /platform access approval/);
  }
  assert.equal(writes, 0);
  // Approval is specific to the source. The accepted path keeps canonical URLs.
  const queued = [];
  for (const [url, normalized] of fixtures) {
    const r = await v1.handleV1(request('/v1/ingest', url), { DB: blockedDB, REDDIT_PUBLIC_ACCESS: 'approved', LINKEDIN_PUBLIC_ACCESS: 'approved' }, '/v1/ingest', null,
      async (_, capture) => { queued.push(capture); return { id: 'fixture', created: true }; });
    assert.equal(r.status, 202, url);
    assert.equal(queued.at(-1).permalink, normalized);
  }
  assert.equal(v1.socialAccessReason('https://lnkd.in/abc', { REDDIT_PUBLIC_ACCESS: 'approved' }), 'LinkedIn saving needs platform access approval.');
  assert.equal(v1.socialAccessReason('https://redd.it/abc', { LINKEDIN_PUBLIC_ACCESS: 'approved' }), 'Reddit saving needs platform access approval; anonymous API access is unavailable.');
  const worker = load('index', { './oauth': { handleOAuth: async () => null }, './v1': v1 }).default;
  for (const [url] of fixtures.slice(0, 7)) {
    const r = await worker.fetch(request('/ingest', url, { 'X-Stash-Secret': 'fixture' }), { STASH_SECRET: 'fixture', DB: blockedDB }, { waitUntil() {} });
    assert.equal(r.status, 422, 'legacy ' + url);
    assert.match((await r.json()).error, /platform access approval/);
  }
  const invalid = await worker.fetch(request('/ingest', 'https://localhost/', { 'X-Stash-Secret': 'fixture' }), { STASH_SECRET: 'fixture', DB: blockedDB }, { waitUntil() {} });
  assert.equal(invalid.status, 400);
  console.log('PASS social URL normalization, unsafe URL rejection, friendly reasons, pre-quota gates, both ingest handlers');
})().catch(e => { console.error(e); process.exit(1); });

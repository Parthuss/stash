// Read-only production verification. Credentials stay in memory and are never logged.
// SKWIRL_ENV_FILE=/path/to/private/.env PLAYWRIGHT_MODULE=/path/to/playwright-core node tests/admin_console_live.cjs
// The committed screenshots use live metrics, with names masked and private text fields removed.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'https://skwirl.app';
const output = path.resolve(__dirname, '../docs/admin-console');
const envFile = process.env.SKWIRL_ENV_FILE || path.resolve(__dirname, '../.env');
const secretLine = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find(line => /^\s*STASH_SECRET\s*=/.test(line));
const secret = secretLine?.replace(/^\s*STASH_SECRET\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
assert.ok(secret, 'An owner credential is required in the private env file.');
const checks = [];
async function get(route, owner = false, redirect = 'follow') {
  return fetch(origin + route, { redirect, headers: owner ? { Authorization: 'Bearer ' + secret } : {} });
}
(async () => {
  for (const route of ['/analytics', '/analytics.html', '/admin', '/admin.html']) {
    const r = await get(route, false, 'manual');
    assert.equal(r.status, 301, route + ' permanent redirect');
    assert.equal(new URL(r.headers.get('location'), origin).pathname, '/owner');
    checks.push(route + ' redirects to /owner');
  }
  assert.equal((await get('/owner')).status, 200); checks.push('/owner public shell is available');
  assert.equal((await get('/v1/admin/console')).status, 401); checks.push('missing credentials denied');
  const invalid = await fetch(origin + '/v1/admin/console', { headers: { Authorization: 'Bearer invalid-verification-credential' } });
  assert.equal(invalid.status, 401); checks.push('invalid credentials denied');
  for (const days of [1, 7, 30]) {
    const r = await get('/v1/admin/console?days=' + days, true);
    assert.equal(r.status, 200, 'Owner API must succeed for period ' + days);
    assert.match(r.headers.get('cache-control'), /no-store/);
    const d = await r.json();
    assert.equal(d.period.days, days); assert.equal(d.kpis.length, 7);
    assert.ok(d.kpis.every(k => Number.isFinite(k.value)));
    assert.ok(!JSON.stringify(d).includes(secret));
    assert.ok(d.users.every(u => !('token_hash' in u) && !('groq_key_enc' in u)));
    checks.push('owner API period ' + days + ' returns valid private no-store data');
  }
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.addInitScript(value => localStorage.setItem('stash_token', value), secret);
      // Preserve real counts, dates, dimensions and plans. Customer identifiers and private
      // fields have no place in repository screenshot evidence.
      await context.route(/^https:\/\/skwirl\.app\/v1\/admin\/console\?/, async route => {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        const d = await response.json();
        const names = new Map(d.users.map((u, i) => [u.id, 'User ' + (i + 1)]));
        for (const u of d.users) { u.name = names.get(u.id); u.email = null; u.owner_msg = null; u.found_via = null; }
        for (const e of d.activity) e.name = e.user_id ? names.get(e.user_id) || 'User' : 'Owner';
        for (const f of d.health.failures) for (const e of f.examples) e.title = 'Example save';
        await route.fulfill({ response, json: d });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.name));
      await page.goto(origin + '/owner');
      await page.waitForFunction(() => !document.getElementById('console').hidden);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, width + ' body fits');
      assert.equal(await page.locator('.metric').count(), 8);
      assert.equal(await page.locator('#trafficChart svg').evaluate(el => el.viewBox.baseVal.width >= el.clientWidth * 0.8), true);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, width === 1440 ? 'desktop-1440.png' : 'phone-390.png'), fullPage: true });
      checks.push(width + 'px live screenshot, no page errors or horizontal overflow; customer names masked');
      await context.close();
    }
    const appContext = await browser.newContext({ viewport: { width:390, height:844 }, reducedMotion:'reduce', serviceWorkers:'block' });
    await appContext.addInitScript(value=>{localStorage.setItem('stash_token',value);localStorage.setItem('stash_link_saved','1');},secret);
    await appContext.route(origin+'/e', route=>route.fulfill({status:204}));
    const appPage=await appContext.newPage();
    await appPage.goto(origin+'/');
    await appPage.waitForFunction(()=>document.getElementById('adminBtn')?.hidden===false);
    await appPage.locator('#appMenuToggle').click();
    await appPage.locator('#appMenuPanel [data-site="pricing"]').click();
    assert.equal(await appPage.locator('body').evaluate(el=>el.classList.contains('site-visit')),true);
    assert.equal(await appPage.evaluate(()=>localStorage.getItem('stash_token')!==null),true);
    await appPage.waitForFunction(()=>{const top=document.getElementById('pricing').getBoundingClientRect().top;return top>=0&&top<250;});
    await appPage.locator('[data-backapp]').first().click();
    assert.equal(await appPage.locator('#lib').isVisible(),true);
    assert.equal(await appPage.locator('body').evaluate(el=>el.classList.contains('site-visit')),false);
    checks.push('live signed-in Skwirl menu opens Pricing and returns to saves with the session preserved');
    await appContext.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'live-verification.json'), JSON.stringify({ origin, checked_at: new Date().toISOString(), mode: 'read-only; no messages, push notifications or requeues sent', screenshots: 'Live metrics; customer names masked and private text fields removed before capture', checks }, null, 2) + '\n');
  for (const check of checks) console.log('PASS ' + check);
})().catch(error => { console.error('Live console verification failed:', error.message); process.exitCode = 1; });

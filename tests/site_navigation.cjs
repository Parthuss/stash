// Intercepted browser checks: no live accounts, providers, or messages.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../worker/public');
async function scenario(browser, width, owner) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [], calls = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('stash_token', 'stk_navigation_test'); localStorage.setItem('stash_link_saved', '1'); });
  await page.route('**/*', async route => {
    const p = new URL(route.request().url()).pathname;
    calls.push(p);
    if (p === '/owner') return route.fulfill({ contentType: 'text/html', body: '<h1>Owner console</h1>' });
    if (p === '/e') return route.fulfill({ status: 204 });
    if (p === '/join') return route.fulfill({ json: { open: true } });
    if (p.startsWith('/v1/')) return route.fulfill({ json: p === '/v1/notes' ? { notes: [] }
      : p === '/v1/captures' ? { captures: [] }
      : p === '/v1/setup' ? { owner, name: 'Test', saved_from: {}, has_email: true, email_login: true }
      : p === '/v1/me' ? { owner, name: 'Test', saves: 0, notes: 0, used: 0, email: 'test@example.invalid' } : {} });
    const file = path.join(root, p === '/' ? 'index.html' : p.slice(1));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream' });
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto('http://navigation.invalid/');
    await page.waitForFunction(() => setupState != null);
    assert.equal(await page.locator('#lib').isVisible(), true);
    assert.equal(await page.locator('#lib').evaluate(el => el.scrollWidth <= el.clientWidth), true, `${width}px header fits`);
    await page.locator('#appMenuToggle').click();
    assert.equal(await page.locator('#appMenuPanel').isVisible(), true);
    assert.equal(await page.locator('[data-owner-console]').isVisible(), owner);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#appMenuPanel').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'appMenuToggle');
    await page.locator('#appMenuToggle').click();
    await page.locator('#appMenuPanel [data-site="pricing"]').click();
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('site-visit')), true);
    assert.equal(await page.locator('#auth').isVisible(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('stash_token')), 'stk_navigation_test');
    await page.waitForFunction(() => { const top = document.getElementById('pricing').getBoundingClientRect().top; return top >= 0 && top < 250; });
    await page.locator('[data-backapp]').first().click();
    assert.equal(await page.locator('#lib').isVisible(), true);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('site-visit')), false);
    await page.locator('#appMenuToggle').click();
    await page.locator('[data-app-help]').click();
    assert.equal(await page.locator('#setup').isVisible(), true);
    assert.equal(await page.locator('#gHelp').evaluate(el => el.open), true);
    await page.locator('#setupBack').click();
    await page.waitForFunction(() => document.querySelector('#lib').style.display === 'block');
    await page.locator('#meBtn').click();
    await page.waitForSelector('.site-row');
    assert.equal(await page.locator('.site-row').count(), 2);
    assert.equal(await page.getByText('About Skwirl and pricing', { exact: true }).count(), 0);
    await page.locator('.site-row').first().click();
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('site-visit')), true);
    await page.locator('[data-backapp]').first().click();
    if (owner) {
      await page.locator('#appMenuToggle').click();
      await page.locator('[data-owner-console]').click();
      assert.equal(new URL(page.url()).pathname, '/owner');
      await page.goto('http://navigation.invalid/#admin');
      await page.waitForURL('http://navigation.invalid/owner');
      assert.equal(calls.includes('/v1/admin/overview'), false);
    } else {
      await page.locator('#appMenuToggle').click();
      await page.locator('[data-app-signout]').click();
      assert.equal(await page.evaluate(() => localStorage.getItem('stash_token')), null);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS signed-in website navigation at ${width}px (${owner ? 'owner' : 'user'})`);
  } finally { await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try { await scenario(browser, 390, false); await scenario(browser, 1440, true); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

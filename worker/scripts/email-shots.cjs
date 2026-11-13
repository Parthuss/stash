// Renders the product-update and sign-in emails (600 + 375 wide, light + dark) and the owner-console
// composer into docs/email-shots/. Everything is local: skwirl.app assets are served from
// worker/public, API calls are answered with the real template code. Nothing is sent.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright node worker/scripts/email-shots.cjs
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite'), { webcrypto } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const esbuild = require('../node_modules/esbuild');
const W = path.resolve(__dirname, '..'), PUB = path.join(W, 'public'), OUT = path.resolve(W, '../docs/email-shots');
fs.mkdirSync(OUT, { recursive: true });

const mods = {};
function load(name) {
  if (mods[name]) return mods[name].exports;
  const js = esbuild.transformSync(fs.readFileSync(path.join(W, 'src', name + '.ts'), 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const module = (mods[name] = { exports: {} });
  vm.runInNewContext(js, { module, exports: module.exports, require: (p) => p.startsWith('./') ? load(p.slice(2)) : {}, crypto: webcrypto, URL, TextEncoder, btoa, atob, console });
  return module.exports;
}
const bc = load('broadcast'), login = load('login');
const sql = new DatabaseSync(':memory:');
for (const f of fs.readdirSync(path.join(W, 'migrations')).sort()) sql.exec(fs.readFileSync(path.join(W, 'migrations', f), 'utf8'));
const draft = { ...sql.prepare("SELECT * FROM email_draft WHERE id = 'plus-live'").get() };
const postal = 'Skwirl · [postal address placeholder] · Contact us from your Skwirl profile';
const unsub = 'https://skwirl.app/unsubscribe?u=example&t=' + 'x'.repeat(32);
const update = bc.updateEmail(draft, { name: 'Jacinda', unsubscribeUrl: unsub }, postal);
const code = login.codeEmail('you@example.com', '482913', 'Jacinda', 'signin');
fs.writeFileSync(path.join(OUT, 'plus-live.html'), update.html);
fs.writeFileSync(path.join(OUT, 'plus-live.txt'), update.text);
fs.writeFileSync(path.join(OUT, 'signin-code.html'), code.html);
fs.writeFileSync(path.join(OUT, 'signin-code.txt'), code.text);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
async function serveLocal(route, url) {
  const file = path.join(PUB, url.pathname === '/owner' ? 'owner.html' : url.pathname.slice(1));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
  return route.fulfill({ status: 404 });
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
  for (const [name, html] of [['plus-live', update.html], ['signin-code', code.html]]) {
    for (const width of [600, 375]) for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.route('https://skwirl.app/**', (r) => serveLocal(r, new URL(r.request().url())));
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(OUT, `${name}-${width}-${scheme}.png`), fullPage: true });
      await ctx.close();
    }
  }
  // Owner console composer, with the Plus draft loaded and a fixture audience.
  const fixtureState = { enabled: true, from: 'updates@skwirl.app', owner_email: 'owner@example.invalid', audience: 3, postal: '', sent_last_day: 0, daily_cap: 80,
    drafts: [{ ...draft }], broadcasts: [], tests: [] };
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: width < 500 ? 2 : 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('stash_token', 'sto_fixture'));
    await page.route('**/*', async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (url.hostname === 'skwirl.app' && !url.pathname.startsWith('/v1/')) return serveLocal(route, url);
      if (url.pathname === '/v1/admin/email') return route.fulfill({ json: fixtureState });
      if (url.pathname === '/v1/admin/email/preview') {
        const b = req.postDataJSON();
        const d = { subject: b.subject || '(no subject yet)', hero: b.hero || '', body: b.body || 'Your message shows here.', button_text: b.button_text || '', button_url: b.button_url || '' };
        return route.fulfill({ json: { subject: d.subject, ...bc.updateEmail(d, { name: 'Parth', unsubscribeUrl: 'https://skwirl.app/unsubscribe?test=1' }, '[Your postal address or contact line goes here. Set it in the console before sending.]', { forceDark: b.dark === true }) } });
      }
      if (url.pathname === '/v1/admin/console') return route.fulfill({ json: minimalConsole() });
      if (url.pathname === '/v1/admin/content') return route.fulfill({ json: { setup: [], ideas: [], drafts: [], scheduled: [], posted: [], controls: { configured: false, paused: true, can_approve: false } } });
      if (url.pathname.startsWith('/v1/')) return route.fulfill({ status: 404, json: {} });
      return serveLocal(route, url);
    });
    await page.goto('https://skwirl.app/owner', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('emSubject').value.length > 0, null, { timeout: 15000 });
    await page.waitForTimeout(900);
    await page.locator('#email').scrollIntoViewIfNeeded();
    await page.locator('#email').screenshot({ path: path.join(OUT, `console-composer-${width}.png`) });
    if (width === 1440) {
      await page.fill('#emConfirm', '3');
      await page.click('[data-em-width="375"]'); await page.click('#emDark'); await page.waitForTimeout(900);
      await page.locator('#email').screenshot({ path: path.join(OUT, `console-composer-${width}-phone-dark-preview.png`) });
    }
    await ctx.close();
  }
  await browser.close();
  console.log('wrote', fs.readdirSync(OUT).join(', '));
})().catch((e) => { console.error(e); process.exit(1); });

function minimalConsole() {
  const kpi = (key, label) => ({ key, label, value: 0, previous: 0, trend: [] });
  return { period: { days: 7, since: '2026-11-06T00:00:00.000Z', until: '2026-11-13T00:00:00.000Z', bucket: 'day' },
    kpis: [kpi('signups', 'Signups'), kpi('active', 'Active users'), kpi('saves', 'Saves made'), kpi('processed', 'Saves processed'), kpi('queue', 'Queue left'), kpi('plus', 'Plus'), kpi('visitors', 'Visitors'), kpi('revenue', 'Revenue')],
    funnel: { steps: [] }, users: [], users_total: 0, health: { states: [], failures: [], providers: [] }, traffic: { daily: [], sources: [], countries: [], devices: [], pages: [] }, activity: [], limitations: ['Fixture for screenshots.'] };
}

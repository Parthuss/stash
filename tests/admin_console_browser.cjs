// Intercepted owner-console checks. All requests are fulfilled locally; no live accounts or actions.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../worker/public');
const clone = value => JSON.parse(JSON.stringify(value));
const fixture = {
  period: { days: 7, since: '2026-11-05T12:00:00.000Z', until: '2026-11-12T12:00:00.000Z', previous_since: '2026-10-29T12:00:00.000Z', previous_until: '2026-11-05T12:00:00.000Z', bucket: 'day', timezone: 'UTC' },
  kpis: ['signups', 'active', 'saves', 'processed', 'queue', 'plus', 'visitors'].map((key, i) => ({ key, label: ['Signups', 'Active users', 'Saves made', 'Saves processed', 'Queue left', 'Plus subscribers', 'Site visitors'][i], value: [8, 18, 72, 61, 11, 2, 138][i], previous: [5, 12, 50, 48, null, null, 100][i], historical: i !== 4 && i !== 5, note: 'Synthetic browser-check data.', series: i === 4 || i === 5 ? [] : [2, 4, 3, 7, 5, 9, 8].map((value, n) => ({ at: `2026-11-${String(n + 5).padStart(2, '0')}T12:00:00.000Z`, value })) })),
  funnel: { steps: [{ key: 'visitors', label: 'Site visitors', value: 138 }, { key: 'signups', label: 'Signups', value: 8 }, { key: 'first', label: 'First save', value: 6 }, { key: 'five', label: '5+ saves', value: 4 }, { key: 'plus', label: 'Plus', value: 2 }], note: 'Synthetic signup cohort. Anonymous visitors are reach, not an attributed conversion denominator.' },
  users: [
    { id: 'fixture_avery', name: 'Avery Morgan', created_at: '2026-11-06T10:00:00.000Z', last_seen: '2026-11-12T10:00:00.000Z', email: 'avery@example.invalid', has_email: true, plan: 'plus', plan_until: '2026-12-06T10:00:00.000Z', found_via: 'Search', own_key: false, owner_msg: '#gSave Welcome back', total: 32, done: 25, pending: 4, failed: 3, push_devices: 1 },
    { id: 'fixture_jordan', name: 'Jordan Lee', created_at: '2026-11-10T10:00:00.000Z', last_seen: null, email: null, has_email: false, plan: 'free', plan_until: null, found_via: null, own_key: false, owner_msg: null, total: 5, done: 5, pending: 0, failed: 0, push_devices: 0 }
  ], users_total: 2,
  health: { states: [{ state: 'pending', n: 8 }, { state: 'processing', n: 3 }, { state: 'done', n: 61 }, { state: 'failed', n: 3 }], failures: [{ reason: 'Provider rate limit', n: 3, examples: [{ id: 'fixture_save', title: 'Fixture save awaiting retry' }] }], providers: { groq_keys: 5, own_keys: 1, openrouter_credit: null, usage: [{ provider: 'Groq shared', model: 'fixture model', action: 'extract', calls: 52, prompt_tokens: 340000, completion_tokens: 43000, audio_seconds: 1600, billed_audio_seconds: 1600 }], note: 'Configured pool size, not measured key health.' }, cost: { estimated_usd: 0.324, priced_calls: 52, unpriced_calls: 0, rates_as_of: '2026-11-12', note: 'List-price estimate; not an invoice.' } },
  traffic: { daily: ['05','06','07','08','09','10','11','12'].map((day, i) => ({ day: `2026-11-${day}`, visits: [9, 14, 11, 28, 19, 32, 21, 7][i], visitors: [7, 12, 8, 24, 15, 28, 17, 5][i] })), sources: [{ k: 'Direct / none', n: 82 }, { k: 'google.com', n: 39 }, { k: 'instagram.com', n: 17 }], countries: [{ k: 'IN', n: 73 }, { k: 'AU', n: 40 }, { k: 'US', n: 25 }], landing: [{ k: '/', n: 110 }, { k: '/guides/save-recipes', n: 28 }], devices: [{ k: 'phone', n: 100 }, { k: 'desktop', n: 38 }] },
  activity: [{ at: '2026-11-12T11:40:00.000Z', kind: 'api', action: 'ingest', name: 'Avery Morgan', user_id: 'fixture_avery' }, { at: '2026-11-12T11:30:00.000Z', kind: 'api', action: 'open', name: 'Jordan Lee', user_id: 'fixture_jordan' }],
  limitations: ['Synthetic browser-check fixture. No live customer information.', 'Queue and Plus counts are current snapshots. Historical comparisons are unavailable.']
};
const journey = { visits: [{ id: 'fixture_visit', started_at: '2026-11-12T11:00:00.000Z', device: 'phone', browser: 'Safari', country: 'AU' }], events: [{ visit_id: 'fixture_visit', name: 'view', detail: 'lib' }], server: [{ at: '2026-11-12T11:05:00.000Z', name: 'ingest' }] };
async function harness(browser, width, handler, run, signedIn = true) {
  const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  if (signedIn) await page.addInitScript(() => localStorage.setItem('stash_token', 'sto_browser_fixture'));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    requests.push({ path: url.pathname, search: url.search, method: request.method(), body: request.postDataJSON(), authorization: request.headers().authorization });
    if (url.pathname.startsWith('/v1/')) {
      if (handler && await handler(route, url, request)) return;
      if (url.pathname === '/v1/admin/console') return route.fulfill({ json: clone(fixture) });
      if (url.pathname === '/v1/admin/journey') return route.fulfill({ json: clone(journey) });
      if (url.pathname.endsWith('/message')) return route.fulfill({ json: { ok: true } });
      if (url.pathname.endsWith('/push')) return route.fulfill({ json: { devices: 1, sent: 1, failed: 0 } });
      if (url.pathname.endsWith('/requeue')) return route.fulfill({ json: { requeued: 3 } });
      return route.fulfill({ status: 404 });
    }
    const file = path.join(root, url.pathname === '/owner' ? 'owner.html' : url.pathname.slice(1));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream' });
    return route.fulfill({ status: 404 });
  });
  try { await page.goto('http://console.invalid/owner'); await run(page, requests); assert.deepEqual(errors, [], 'No browser exceptions'); }
  finally { await context.close(); }
}
async function loaded(page) { await page.waitForFunction(() => !document.getElementById('console').hidden); }
async function assertSessionCleared(page) {
  assert.equal(await page.locator('#console').isVisible(), false, 'Console hides after session changes');
  assert.equal(await page.locator('#userDrawer').evaluate(el => el.open), false, 'Private drawer closes');
  for (const id of ['metrics', 'metricTable', 'funnelChart', 'userRows', 'queue', 'providers', 'failures', 'trafficChart', 'trafficTable', 'trafficBreakdowns', 'activityFeed', 'limitations', 'drawerBody']) {
    assert.equal(await page.locator('#' + id).evaluate(el => el.childElementCount), 0, `${id} private DOM cleared`);
    assert.equal(await page.locator('#' + id).textContent(), '', `${id} private text cleared`);
  }
}
async function changeStoredToken(page, next, dispatch = true) {
  await page.evaluate(({next,dispatch}) => {
    const oldValue = localStorage.getItem('stash_token');
    if (next === null) localStorage.removeItem('stash_token'); else localStorage.setItem('stash_token', next);
    if (dispatch) window.dispatchEvent(new StorageEvent('storage', { key: 'stash_token', oldValue, newValue: next, storageArea: localStorage }));
  }, {next,dispatch});
}
async function checkViewport(browser, width) {
  await harness(browser, width, null, async (page, requests) => {
    await loaded(page);
    assert.equal(await page.locator('.metric').count(), 8);
    for (const id of ['funnelChart','userRows','queue','providers','failures','trafficChart','trafficBreakdowns','activityFeed']) assert.ok((await page.locator('#'+id).innerText()).length || await page.locator('#'+id+' svg').count(), `${id} rendered`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px body fits`);
    assert.equal(await page.locator('#trafficChart svg').evaluate(el => el.viewBox.baseVal.width >= el.clientWidth * 0.8), true, 'Traffic chart uses the available panel width');
    if (!process.env.SKIP_SCREENSHOTS) await page.screenshot({ path: `/tmp/skwirl-console-preview-${width === 1440 ? 'desktop' : 'mobile'}.png`, fullPage: true });
    await page.locator('#userSearch').fill('jordan');
    assert.equal(await page.locator('#userRows tr[data-user]').count(), 1);
    assert.equal(await page.locator('#userRows tr').getAttribute('data-user'), 'fixture_jordan');
    await page.locator('#planFilter').selectOption('plus');
    assert.equal(await page.locator('#userRows tr[data-user]').count(), 0);
    await page.locator('#userSearch').fill('');
    assert.equal(await page.locator('#userRows tr[data-user]').count(), 1);
    await page.locator('#planFilter').selectOption('all');
    const opener = page.locator('[data-view="fixture_avery"]').first();
    await opener.click();
    assert.equal(await page.locator('#userDrawer').evaluate(el => el.open), true);
    assert.equal(await page.locator('#userDrawer').evaluate(el => el.contains(document.activeElement)), true, 'Drawer receives focus');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#userDrawer').evaluate(el => el.open), false);
    assert.equal(await opener.evaluate(el => el === document.activeElement), true, 'Escape restores opener focus');
    await opener.click();
    await page.locator('[data-drawer-action="message"]').click();
    await page.locator('#actionText').fill('A synthetic owner message');
    await page.locator('#actionForm button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById('actionStatus').textContent === 'Owner message saved.');
    await page.locator('[data-drawer-action="push"]').click();
    await page.locator('#actionText').fill('A synthetic push');
    await page.locator('#actionForm button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById('actionStatus').textContent === '1 notifications sent; 0 failed.');
    await page.locator('[data-drawer-action="requeue"]').click();
    await page.locator('#actionForm button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById('toast')?.textContent === '3 failed saves requeued.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px drawer fits`);
    assert.deepEqual(requests.filter(r=>r.method==='POST').map(r=>({path:r.path,body:r.body})), [
      {path:'/v1/admin/users/fixture_avery/message',body:{message:'A synthetic owner message'}},
      {path:'/v1/admin/users/fixture_avery/push',body:{body:'A synthetic push'}},
      {path:'/v1/admin/users/fixture_avery/requeue',body:{}}
    ]);
    assert.ok(requests.filter(r=>r.path.startsWith('/v1/')).every(r=>r.authorization==='Bearer sto_browser_fixture'));
  });
  console.log(`PASS ${width}px sections, overflow, user filters, drawer focus and scoped actions`);
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    await checkViewport(browser, 1440); await checkViewport(browser, 390);
    for (const status of [401,404]) await harness(browser,390,async(route,url)=>{ if(url.pathname==='/v1/admin/console'){await route.fulfill({status,json:{error:'not found'}});return true;} },async page=>{
      await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Owner access is required'));
      assert.equal(await page.locator('#console').isVisible(),false);
      assert.equal(await page.locator('#metrics').innerText(),'');
    });
    console.log('PASS invalid owner 401/404 reveals no data');
    await harness(browser,390,null,async(page,requests)=>{await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Sign in to Skwirl'));assert.equal(requests.some(r=>r.path.startsWith('/v1/')),false);},false);
    console.log('PASS signed-out shell makes no API request');
    await harness(browser,390,async(route,url)=>{if(url.pathname!=='/v1/admin/console')return;const empty=clone(fixture);empty.users=[];empty.users_total=0;empty.health.states=[];empty.health.failures=[];empty.health.providers.usage=[];empty.activity=[];for(const key of Object.keys(empty.traffic))empty.traffic[key]=[];for(const k of empty.kpis){k.value=0;if(k.previous!=null)k.previous=0;k.series=k.series.map(p=>({...p,value:0}));}empty.funnel.steps=empty.funnel.steps.map(s=>({...s,value:0}));await route.fulfill({json:empty});return true;},async page=>{await loaded(page);assert.match(await page.locator('#userRows').innerText(),/No users match/);assert.match(await page.locator('#failures').innerText(),/No failed saves/);assert.match(await page.locator('#activityFeed').innerText(),/No activity recorded/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);});
    console.log('PASS empty dataset renders without exceptions or overflow');
    let attempt=0;
    await harness(browser,1440,async(route,url)=>{if(url.pathname==='/v1/admin/console'&&++attempt===1){await route.fulfill({status:503,json:{error:'Unavailable'}});return true;}},async page=>{await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Couldn’t load'));await page.locator('#refresh').click();await loaded(page);assert.equal(attempt,2);});
    console.log('PASS error and Refresh retry');
    let delayed, requested;
    const isRequested=new Promise(resolve=>{requested=resolve;});
    await harness(browser,1440,async(route,url)=>{if(url.pathname==='/v1/admin/console'&&url.searchParams.get('days')==='30'){delayed=route;requested();return true;}if(url.pathname==='/v1/admin/console'&&url.searchParams.get('days')==='1'){const next=clone(fixture);next.period.days=1;next.kpis[0].value=1;await route.fulfill({json:next});return true;}},async page=>{
      await loaded(page);await page.locator('#period').selectOption('30');await isRequested;await page.locator('#period').selectOption('1');await page.waitForFunction(()=>document.querySelector('.metric-value').textContent==='1');
      const response=page.waitForResponse(r=>r.url().includes('days=30'));const stale=clone(fixture);stale.kpis[0].value=999;await delayed.fulfill({json:stale});await response;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('.metric-value').first().innerText(),'1');assert.equal(await page.locator('#period').inputValue(),'1');
    });
    console.log('PASS stale period response does not overwrite newer selection');
    await harness(browser,1440,null,async(page,requests)=>{
      await loaded(page); await page.locator('[data-view="fixture_avery"]').first().click();
      await page.locator('[data-drawer-action="message"]').click();
      await page.locator('#actionText').fill('Never send after sign-out');
      const oldForm = await page.locator('#actionForm').elementHandle();
      const before = requests.filter(r=>r.path.startsWith('/v1/')).length;
      await changeStoredToken(page,null);
      await assertSessionCleared(page);
      // A retained DOM reference must not turn a cross-tab sign-out into a stale action.
      await oldForm.evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
      assert.equal(requests.filter(r=>r.path.startsWith('/v1/')).length,before,'Sign-out causes no further private requests');
      assert.equal(requests.filter(r=>r.method==='POST').length,0);
    });
    console.log('PASS cross-tab sign-out clears private DOM, closes drawer and removes actions');
    await harness(browser,390,async(route,url,request)=>{
      if(url.pathname==='/v1/admin/console'&&request.headers().authorization==='Bearer stk_regular_fixture'){await route.fulfill({status:404,json:{error:'not found'}});return true;}
    },async(page,requests)=>{
      await loaded(page); await page.locator('[data-view="fixture_avery"]').first().click();
      const response=page.waitForResponse(r=>r.url().includes('/v1/admin/console')&&r.status()===404);
      await changeStoredToken(page,'stk_regular_fixture'); await response;
      await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Owner access is required'));
      await assertSessionCleared(page);
      assert.equal(requests.filter(r=>r.path==='/v1/admin/console').at(-1).authorization,'Bearer stk_regular_fixture','Replacement session is checked with its own token');
      assert.equal(requests.filter(r=>r.method==='POST').length,0);
    });
    console.log('PASS cross-tab regular-user replacement rechecks auth and preserves no owner data');
    await harness(browser,1440,null,async(page,requests)=>{
      await loaded(page); await page.locator('[data-view="fixture_avery"]').first().click();
      await page.locator('[data-drawer-action="message"]').click(); await page.locator('#actionText').fill('Never send with stale credentials');
      // No storage event: api() must also re-read storage before a fetch.
      await changeStoredToken(page,null,false); await page.locator('#actionForm button[type="submit"]').click();
      await assertSessionCleared(page);
      assert.equal(requests.filter(r=>r.method==='POST').length,0,'Pre-fetch guard blocks stale owner mutation');
    });
    console.log('PASS pre-fetch storage check blocks stale owner action even without storage event');
    let sessionDelayed, sessionRequested;
    const sessionIsRequested=new Promise(resolve=>{sessionRequested=resolve;});
    await harness(browser,1440,async(route,url)=>{
      if(url.pathname==='/v1/admin/console'&&url.searchParams.get('days')==='30'){sessionDelayed=route;sessionRequested();return true;}
    },async page=>{
      await loaded(page); await page.locator('[data-view="fixture_avery"]').first().click(); await page.keyboard.press('Escape');
      await page.locator('#period').selectOption('30'); await sessionIsRequested;
      // Token disappears while the owner response is in flight, without an event.
      await changeStoredToken(page,null,false);
      const response=page.waitForResponse(r=>r.url().includes('days=30')); await sessionDelayed.fulfill({json:clone(fixture)}); await response;
      await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Owner access is required'));
      await assertSessionCleared(page);
    });
    console.log('PASS post-fetch storage check discards in-flight owner response after sign-out');
    const xss='<img src=x onerror="window.__xss=true">';
    await harness(browser,390,async(route,url)=>{if(url.pathname==='/v1/admin/console'){const unsafe=clone(fixture);unsafe.users[0].name=xss;unsafe.activity[0].name=xss;unsafe.traffic.sources[0].k=xss;unsafe.health.failures[0].examples[0].title=xss;await route.fulfill({json:unsafe});return true;}},async page=>{await loaded(page);assert.equal(await page.locator('#userRows img,#activityFeed img,#trafficBreakdowns img,#failures img').count(),0);assert.equal(await page.locator('[data-view="fixture_avery"]').first().innerText(),xss);await page.locator('[data-view="fixture_avery"]').first().click();assert.equal(await page.locator('#drawerName').innerText(),xss);assert.equal(await page.locator('#drawerName img').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.__xss)),false);});
    console.log('PASS untrusted names, activity, traffic and failure examples render as text');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});

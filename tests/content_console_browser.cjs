// Isolated Content UI checks. Every API and action is intercepted; nothing is posted.
// PLAYWRIGHT_MODULE=/path/to/playwright node tests/content_console_browser.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../worker/public');
const overview = {
  period: { days:7,since:'2026-11-05T12:00:00Z',until:'2026-11-12T12:00:00Z',bucket:'day' },
  kpis:[{key:'fixture',label:'Fixture',value:0,previous:0,series:[]}], funnel:{steps:[{label:'Visitors',value:0},{label:'Joined',value:0}],note:'Fixture'}, users:[],users_total:0,
  health:{states:[],failures:[],providers:{usage:[]},cost:{}}, traffic:{daily:[],sources:[],countries:[],landing:[],devices:[]},activity:[],limitations:[]
};
function contentFixture(configured = false) {
  return {
    setup:['Instagram','YouTube','R2','Telegram','Engine enabled','Dry run'].map((label,i)=>({key:['instagram','youtube','r2','telegram','engine','dry_run'][i],label,connected:configured || i===5,status:i===5?'On':configured?'Configured':'Not connected',href:'https://github.com/Parthuss/stash/blob/master/promo/engine/SETUP.md#'+['instagram','youtube','r2','telegram','engine','dry-run'][i]})),
    ideas:[{id:'one',hook:'How did I save 300 reels and lose every recipe?',format:'carousel',score:88},{id:'two',hook:'A saved reel is not a shopping list',format:'reel',score:74}],
    drafts:configured ? [
      {id:'ready',title:'Your saved recipes, found again',format:'carousel',caption:'You saved the reel. Now find the recipe.',content_hash:'hash-reviewed',preview:{slides:['/v1/admin/content/media?key=slides%2F1.jpg','/v1/admin/content/media?key=slides%2F2.jpg']},gate:{passed:true,summary:'All mandatory checks passed',issues:[]}},
      {id:'blocked',title:'Draft still under review',format:'reel',caption:'Review the timing before approval.',content_hash:'hash-blocked',preview:{video:'/v1/admin/content/media?key=reel.mp4',cover:'/v1/admin/content/media?key=cover.jpg'},gate:{passed:false,summary:'Evidence missing',issues:['Independent review is required']}}
    ] : [{id:'sample',title:'Your saved recipes, found again',format:'carousel',caption:'You saved the reel. Now find the recipe.',sample:true,preview:{cover:'/content-samples/cover.svg'},gate:{passed:false,summary:'Local sample is not approved',issues:['Complete review first']}}],
    scheduled:configured?[{id:'scheduled',title:'A recipe you can find later',platform:'Instagram',scheduled_at:'2026-11-14T12:30:00Z',status:'Approved'}]:[],
    posted:configured?[{id:'posted',title:'Saved and found',platform:'Instagram',posted_at:'2026-11-09T12:30:00Z',metrics:{'48h':{instagram:{views:123,saves:9}},'7d':null}}]:[],
    controls:{configured,paused:true,can_approve:configured},note:'Approvals are queued and checked again on the next engine tick.',updated_at:'2026-11-12T12:00:00Z'
  };
}
async function harness(browser,width,content,run,handler) {
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('stash_token','sto_content_fixture'));
  const page=await context.newPage(),requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    requests.push({path:url.pathname,method:request.method(),body:request.postDataJSON(),authorization:request.headers().authorization});
    if(handler && await handler(route,url,request))return;
    if(url.pathname==='/v1/admin/console')return route.fulfill({json:overview});
    if(url.pathname==='/v1/admin/content')return route.fulfill({json:content});
    if(url.pathname==='/v1/admin/content/action')return route.fulfill({status:202,json:{ok:true,message:'Decision queued for the next engine tick.',command_id:'fixture-command'}});
    if(url.pathname==='/v1/admin/content/media' || url.pathname==='/content-samples/cover.svg')return route.fulfill({body:fs.readFileSync(path.join(root,'mark.svg')),contentType:'image/svg+xml'});
    if(url.pathname.startsWith('/v1/'))return route.fulfill({status:404,json:{error:'Missing fixture'}});
    const file=path.join(root,url.pathname==='/owner'?'owner.html':url.pathname.slice(1));
    if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});
    return route.fulfill({status:404});
  });
  try {
    await page.goto('http://console.invalid/owner');
    await page.waitForFunction(()=>!document.getElementById('console').hidden);
    try { await run(page,requests); } catch(error) { console.error('Fixture status:',await page.locator('#status').textContent(),await page.locator('#contentStatus').textContent(),errors);throw error; }
    assert.deepEqual(errors,[],'No browser exceptions');
  } finally {await context.close();}
}
async function loaded(page) {await page.waitForFunction(()=>document.getElementById('contentSetup').children.length===6);}
(async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try {
    for(const width of [1440,390]) {
      await harness(browser,width,contentFixture(false),async(page,requests)=>{
        await loaded(page);
        assert.equal(await page.locator('#contentActions').isVisible(),false,'Workflow controls hidden before configured');
        assert.equal(await page.locator('#contentIdeas tbody tr').count(),2);
        assert.equal(await page.locator('#contentSetup a').count(),6);
        assert.match(await page.locator('#contentDrafts').innerText(),/Local sample/);
        assert.equal(await page.locator('[data-content-action="approve"]').isDisabled(),true,'Sample cannot be approved');
        assert.equal(await page.locator('[data-content-action="skip"]').isDisabled(),true,'Sample cannot enqueue a decision');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,width+'px fits');
        assert.equal(requests.some(r=>r.method==='POST'),false,'Setup page does not trigger actions');
        await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'/tmp/skwirl-content-setup-'+width+'.png',fullPage:true});
      });
      await harness(browser,width,contentFixture(true),async(page,requests)=>{
        await loaded(page);await page.locator('#content').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#contentActions').isVisible(),true);
        assert.equal(await page.locator('.content-slides img').count(),2);
        await page.waitForFunction(()=>[...document.querySelectorAll('.content-slides img')].every(img=>img.src.startsWith('blob:')));
        assert.ok(requests.filter(r=>r.path==='/v1/admin/content/media').every(r=>r.authorization==='Bearer sto_content_fixture'),'Private previews use owner authorization');
        assert.equal(await page.locator('[data-content-id="blocked"][data-content-action="approve"]').isDisabled(),true,'Failed gate blocks approval');
        assert.match(await page.locator('#contentPosted').innerText(),/instagram: views: 123/);
        assert.match(await page.locator('#contentPosted').innerText(),/Not measured yet/);
        await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'/tmp/skwirl-content-ready-'+width+'.png',fullPage:true});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,width+'px ready fits');
        await page.locator('[data-content-id="ready"][data-content-action="approve"]').click();
        await page.waitForFunction(()=>document.getElementById('contentStatus').textContent==='Decision queued for the next engine tick.');
        const approval=requests.find(r=>r.path==='/v1/admin/content/action');
        assert.deepEqual(approval.body,{action:'approve',id:'ready',content_hash:'hash-reviewed'},'Decision binds the displayed content hash');
        await page.locator('[data-content-action="research"]').click();
        await page.waitForFunction(()=>document.getElementById('contentStatus').textContent==='Decision queued for the next engine tick.');
        assert.deepEqual(requests.filter(r=>r.path==='/v1/admin/content/action').at(-1).body,{action:'research'});
      });
      console.log('PASS '+width+'px setup, drafts, private previews, gate-disabled approval, queued hash-bound actions, metrics, overflow');
    }
    await harness(browser,390,contentFixture(true),async page=>{
      await loaded(page);await page.evaluate(()=>{localStorage.removeItem('stash_token');window.dispatchEvent(new StorageEvent('storage',{key:'stash_token',newValue:null}));});
      await page.waitForFunction(()=>document.getElementById('console').hidden);
      for(const id of ['contentSetup','contentIdeas','contentDrafts','contentScheduled','contentPosted'])assert.equal(await page.locator('#'+id).textContent(),'','Private content cleared on sign-out');
      assert.equal(await page.locator('#contentActions').isVisible(),false);
    });
    console.log('PASS owner-session change clears private content and actions');
    let count=0;
    await harness(browser,390,contentFixture(true),async page=>{
      await loaded(page);await page.locator('#refresh').click();
      await page.waitForFunction(()=>document.getElementById('contentStatus').textContent.includes('Showing the last successful'));
      assert.equal(await page.locator('#contentDrafts article').count(),2,'Transient error keeps last content visible');
    },async(route,url)=>{if(url.pathname==='/v1/admin/content' && ++count>1){await route.fulfill({status:503,json:{error:'Fixture unavailable'}});return true;}});
    console.log('PASS transient content refresh failure preserves data with stale message');
    await harness(browser,390,contentFixture(false),async page=>{
      await page.waitForFunction(()=>document.getElementById('contentStatus').textContent.includes('Couldn’t load content'));
      assert.equal(await page.locator('#console').isVisible(),true,'Missing content endpoint does not hide the console');
    },async(route,url)=>{if(url.pathname==='/v1/admin/content'){await route.fulfill({status:404,json:{error:'Content unavailable'}});return true;}});
    console.log('PASS missing integration keeps the console available');
    const hostile=contentFixture(true);hostile.ideas[0].hook='<img src=x onerror=alert(1)>';hostile.drafts[0].preview={cover:'javascript:alert(1)',slides:['https://outside.invalid/private.jpg']};hostile.drafts[0].caption='<script>window.failed=true</script>';
    await harness(browser,390,hostile,async(page,requests)=>{
      await loaded(page);assert.match(await page.locator('#contentIdeas').innerText(),/<img src=x/);assert.equal(await page.locator('#contentIdeas img').count(),0);assert.equal(await page.locator('#contentDrafts script').count(),0);assert.equal(requests.some(r=>r.path==='/private.jpg'),false);
    });
    console.log('PASS untrusted copy renders as text and unsafe preview locations are rejected');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

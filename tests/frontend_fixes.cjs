// Run with PLAYWRIGHT_MODULE pointing to an existing playwright/playwright-core install.
// All HTTP requests are intercepted; no running server, accounts or provider calls.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'worker/public');
const note = {id:'one',title:'Pasta recipe',topic:'food',status:'unused',markdown:'## Ingredients\n- Pasta\n- Butter'};
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function scenario(browser, name, handler, run, signedIn=true) {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(signedIn) await page.addInitScript(()=>{localStorage.setItem('stash_token','stk_test_account');localStorage.setItem('stash_link_saved','1')});
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url()),p=u.pathname;
    const custom=await handler(route,u);if(custom)return;
    if(p==='/join')return route.fulfill({json:{open:true}});
    if(p==='/e')return route.fulfill({status:204});
    if(p.startsWith('/v1/')) {
      const body=p==='/v1/notes'?{notes:[note]}:p==='/v1/setup'?{name:'Test',owner:false,saved_from:{},has_groq_key:false,push_key:null}:p==='/v1/captures'?{captures:[]}:p==='/v1/mentions'?{mentions:[]}:p.startsWith('/v1/notes/')?note:{};
      return route.fulfill({json:body});
    }
    const file=path.join(root,p==='/'?'index.html':p.slice(1));
    if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream'});
    return route.fulfill({status:404,body:''});
  });
  try{await page.goto('http://audit.invalid/');await page.waitForTimeout(150);await run(page);assert.deepEqual(errors,[],name+' page errors');console.log('PASS',name)}finally{await context.close()}
}
(async()=>{const browser=await chromium.launch({channel:'chrome'});try{
  await scenario(browser,'7 stale search ignored',async(r,u)=>{
    if(u.pathname!=='/v1/search')return false;
    const old=u.searchParams.get('q')==='old';if(old)await sleep(600);
    await r.fulfill({json:{notes:old?[]:[note]}});return true;
  },async p=>{await p.locator('#q').fill('old');await p.waitForTimeout(230);await p.locator('#q').fill('pasta');await p.waitForTimeout(750);assert.equal(await p.locator('.card[data-id]').count(),1)});
  await scenario(browser,'8 delayed note does not override navigation',async(r,u)=>{
    if(u.pathname!=='/v1/notes/one')return false;
    await sleep(500);await r.fulfill({json:note});return true;
  },async p=>{await p.locator('.card[data-id]').click();await p.locator('#mentionsBtn').click();await p.waitForTimeout(650);assert.equal(await p.locator('#mentions').isVisible(),true);assert.equal(await p.locator('#note').isVisible(),false)});
  await scenario(browser,'9 active filter remains visible',async()=>false,async p=>{
    await p.evaluate(()=>{filter='fitness';document.getElementById('q').value='pasta';render()});
    assert.equal(await p.locator('[data-f=fitness][aria-pressed=true]').count(),1);
    await p.locator('[data-f=all]').click();assert.equal(await p.locator('.card[data-id]').count(),1);
  });
  let joins=0;
  await scenario(browser,'10 join submits once and unlocks on failure',async(r,u)=>{
    if(u.pathname!=='/join'||r.request().method()!=='POST')return false;
    joins++;await sleep(200);await r.fulfill({status:503,json:{error:'Try later'}});return true;
  },async p=>{
    await p.locator('#joinName').fill('Test');await p.locator('#joinForm').evaluate(f=>{f.requestSubmit();f.requestSubmit()});
    await p.waitForTimeout(300);assert.equal(joins,1);assert.equal(await p.locator('#joinForm button').isDisabled(),false);
    await p.locator('#joinForm').evaluate(f=>f.requestSubmit());await p.waitForTimeout(300);assert.equal(joins,2);
  },false);
  let failSetup=false;
  await scenario(browser,'11 offline setup error is visible',async(r,u)=>{
    if(failSetup&&u.pathname==='/v1/setup'){await r.abort();return true}return false;
  },async p=>{failSetup=true;await p.locator('#setupBtn').click();await p.waitForTimeout(150);assert.match(await p.locator('#toast').innerText(),/Can't reach/)});
  let ticks=0;
  await scenario(browser,'11 rapid Lists ticks remain on the same item',async(r,u)=>{
    if(u.pathname==='/v1/mentions'){await r.fulfill({json:{mentions:['First','Second'].map((name,i)=>({name,type:'book',note_id:'one',note_title:'Note',count:1,done:false}))}});return true}
    if(u.pathname==='/v1/mentions/done'){ticks++;await sleep(200);await r.fulfill({status:503,json:{}});return true}return false;
  },async p=>{await p.locator('#mentionsBtn').click();await p.waitForTimeout(100);await p.evaluate(()=>{document.querySelector('.tick').click();document.querySelector('.tick').click()});
    assert.equal(await p.locator('.mcard h3').first().innerText(),'First');await p.waitForTimeout(300);assert.equal(ticks,1);assert.equal(await p.locator('.tick').first().getAttribute('aria-pressed'),'false');
  });
  await scenario(browser,'12 repeated owner setup preserves controls',async(r,u)=>{
    if(u.pathname!=='/v1/setup')return false;await r.fulfill({json:{name:'Owner',owner:true,saved_from:{}}});return true;
  },async p=>{await p.evaluate(async()=>{await refreshSetup();await refreshSetup()});assert.equal(await p.locator('#groqForm').count(),1);assert.equal(await p.locator('#groqPaid').count(),1);assert.equal(await p.locator('#groqBody').evaluate(e=>e.hidden),true);assert.equal(await p.locator('#groqOwnerMsg').evaluate(e=>e.hidden),false)});
  await scenario(browser,'13 browser and UI Back restore library scroll',async()=>false,async p=>{
    await p.evaluate(()=>{notes=Array.from({length:30},(_,i)=>({id:String(i),title:'Note '+i,topic:'food',status:'unused'}));render();scrollTo(0,300)});
    await p.evaluate(()=>openSetup(false));await p.waitForTimeout(100);await p.goBack();await p.waitForTimeout(100);
    assert.equal(await p.locator('#lib').isVisible(),true);assert.equal(await p.evaluate(()=>scrollY),300);
    await p.evaluate(()=>openSetup(false));await p.locator('#setupBack').click();await p.waitForTimeout(100);
    assert.equal(await p.locator('#lib').isVisible(),true);assert.equal(await p.evaluate(()=>history.state.position),0);
  });
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

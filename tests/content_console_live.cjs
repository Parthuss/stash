// Read-only production verification; existing credential remains in memory, never logged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const envFile=process.env.SKWIRL_ENV_FILE || '/Users/parthus/Work/Experiment/stash/.env';
const line=fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(v=>/^\s*STASH_SECRET\s*=/.test(v));
const secret=line?.replace(/^\s*STASH_SECRET\s*=\s*/,'').trim().replace(/^(['"])(.*)\1$/,'$2');
assert.ok(secret,'Private owner credential available');
const origin='https://skwirl.app';
(async()=>{
  const response=await fetch(origin+'/v1/admin/content',{headers:{Authorization:'Bearer '+secret}});
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  const content=await response.json();assert.equal(content.setup.length,6);assert.equal(content.ideas.length,5);
  assert.equal(content.controls.configured,false);assert.ok(content.drafts.some(d=>d.sample));
  assert.ok(!JSON.stringify(content).includes(secret));
  assert.equal((await fetch(origin+'/v1/admin/content')).status,401);
  console.log('PASS live Content API: owner auth, six setup rows, five ideas, local sample, hidden actions, no-store');
  const shell=await fetch(origin+'/owner');assert.equal(shell.status,200);
  assert.match(shell.headers.get('content-security-policy'),/img-src[^;]*blob:/);
  assert.match(shell.headers.get('content-security-policy'),/media-src[^;]*blob:/);
  const browser=await chromium.launch({channel:'chrome'});
  try{
    for(const width of [1440,390]){
      const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
      await context.addInitScript(value=>localStorage.setItem('stash_token',value),secret);
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));
      await page.goto(origin+'/owner#content');
      await page.waitForFunction(()=>document.querySelectorAll('#contentSetup li').length===6);
      assert.equal(await page.locator('#contentDrafts img').count(),1);
      await page.locator('#contentDrafts img').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>[...document.querySelectorAll('#contentDrafts img')].every(i=>i.complete && i.naturalWidth>0),null,{timeout:15000});
      assert.equal(await page.locator('#contentActions').isVisible(),false);
      assert.equal(await page.locator('#contentIdeas tbody tr').count(),5);
      assert.equal(await page.locator('#contentDrafts [data-content-action=approve]').isDisabled(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);
      await page.locator('#content').screenshot({path:`/tmp/skwirl-content-live-${width}.png`});
      console.log('PASS live /owner Content '+width+'px: actual sample loaded, setup/ideas rendered, disabled approval, no errors or overflow');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error('Content live check failed:',error.message);process.exitCode=1;});

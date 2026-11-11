// usage: node shoot.cjs <publicDir> <outDir> <prefix>
const {chromium}=require('/private/tmp/crew-dashboard-qa/node_modules/playwright-core');
const fs=require('fs'),path=require('path');
const [root,out,prefix]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.json':'application/json','.webmanifest':'application/json'};
async function page(b,w,signedIn){const c=await b.newContext({viewport:{width:w,height:900},reducedMotion:'reduce',serviceWorkers:'block'});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 if(signedIn)await p.addInitScript(()=>{localStorage.setItem('stash_token','stk_test_account');localStorage.setItem('stash_link_saved','1')});
 await p.route('**/*',r=>{const u=new URL(r.request().url());let pa=u.pathname;if(u.host!=='site.invalid')return r.fulfill({status:204});
  if(pa==='/join')return r.fulfill({json:{open:true}});if(pa.startsWith('/v1/')){const body=pa==='/v1/notes'?{notes:[{id:'one',title:'Pasta recipe',topic:'food',status:'unused',markdown:'x'}]}:pa==='/v1/setup'?{name:'Test',owner:false,saved_from:{},has_groq_key:false,push_key:null}:pa==='/v1/captures'?{captures:[]}:pa==='/v1/mentions'?{mentions:[]}:{};return r.fulfill({json:body})}
  let f=path.join(root,pa==='/'?'index.html':pa.slice(1));if(!fs.existsSync(f)&&fs.existsSync(f+'.html'))f+='.html';
  if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({body:fs.readFileSync(f),contentType:types[path.extname(f)]||'application/octet-stream'});return r.fulfill({status:404,body:''})});
 return {c,p,errs}}
(async()=>{const b=await chromium.launch({channel:'chrome'});const report={};
for(const w of [390,1280]){const {c,p,errs}=await page(b,w,false);await p.goto('http://site.invalid/');await p.waitForTimeout(400);
 await p.evaluate(()=>document.querySelectorAll('.reveal,.chat').forEach(e=>e.classList.add('in')));await p.waitForTimeout(2500);
 await p.screenshot({path:`${out}/${prefix}-landing-${w}.png`,fullPage:true});
 await p.locator('.lhero').screenshot({path:`${out}/${prefix}-hero-${w}.png`});
 for(const [sel,name] of [['#work','work'],['.lsec.claude','ask']]){if(await p.locator(sel).count())await p.locator(sel).screenshot({path:`${out}/${prefix}-${name}-${w}.png`})}
 report['overflow'+w]=await p.evaluate(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll('#auth *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>W+1&&!e.closest('.shots')&&getComputedStyle(e).position!=='fixed'}).map(e=>e.tagName+'.'+e.className).slice(0,10)});
 report['errors'+w]=errs;
 await p.goto('http://site.invalid/guides/use-saved-reels-in-claude');await p.waitForTimeout(300);await p.screenshot({path:`${out}/${prefix}-guide-${w}.png`,fullPage:true});await c.close()}
{const {c,p,errs}=await page(b,390,true);await p.goto('http://site.invalid/');await p.waitForTimeout(1200);report.signedIn={authVisible:await p.locator('#auth').isVisible(),libVisible:await p.locator('#lib').isVisible(),errs};await p.screenshot({path:`${out}/${prefix}-signedin-390.png`});await c.close()}
console.log(JSON.stringify(report,null,1));await b.close()})();

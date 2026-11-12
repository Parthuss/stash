// Owner content API: no credentials or live APIs; serialized approval intents and private media.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const esbuild = require('../worker/node_modules/esbuild');
const modules = {}, external = [];
let dispatchStatus = 204;
function load(name) {
  if (modules[name]) return modules[name].exports;
  const module = modules[name] = {exports:{}};
  const js = esbuild.transformSync(fs.readFileSync(path.join(__dirname,'../worker/src',name+'.ts'),'utf8'), {loader:'ts',format:'cjs',target:'es2022'}).code;
  vm.runInNewContext(js, {module,exports:module.exports,require:p=>p.startsWith('./')?load(p.slice(2)):{EmailMessage:class{}},
    crypto:webcrypto, Request, Response, URL, Headers, TextEncoder, TextDecoder, atob,btoa,Uint8Array,Uint32Array,setTimeout,console,
    fetch:async (url,options)=>{external.push({url,options});return new Response(null,{status:dispatchStatus});}});
  return module.exports;
}
const sql = new DatabaseSync(':memory:');
for(const f of fs.readdirSync(path.join(__dirname,'../worker/migrations')).sort())sql.exec(fs.readFileSync(path.join(__dirname,'../worker/migrations',f),'utf8'));
const DB={prepare(s){const st={args:[],bind(...a){st.args=a;return st;},async first(){return sql.prepare(s).get(...st.args)??null;},async all(){return {results:sql.prepare(s).all(...st.args)};},async run(){return {meta:{changes:Number(sql.prepare(s).run(...st.args).changes)}};}};return st;},async batch(sts){return Promise.all(sts.map(s=>s.run()));}};
const env={DB,STASH_SECRET:'owner-test-secret'};
const objects=new Map(), writes=[];
const bucket={async get(key,options){const value=objects.get(key);if(value==null)return null;return {async json(){return JSON.parse(value);},body:value,size:Buffer.byteLength(value),writeHttpMetadata(headers){headers.set('content-type','image/jpeg');},...(options?.range?.has('range')?{range:{offset:0,length:4}}:{})};},async put(key,value){objects.set(key,value);writes.push({key,value:JSON.parse(value)});}};
const worker=load('index').default, content=load('content');
const request=(url,body,token=env.STASH_SECRET)=>worker.fetch(new Request('https://skwirl.app'+url,{method:body?'POST':'GET',headers:token?{Authorization:'Bearer '+token,'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}),env,{waitUntil(){}});
const act=body=>request('/v1/admin/content/action',body);
const put=(key,value)=>objects.set(key,JSON.stringify(value));
let checks=0;const ok=t=>console.log('ok',++checks,t);
(async()=>{
  let r=await request('/v1/admin/content',null,null);assert.equal(r.status,401);
  r=await request('/v1/admin/content',null,'bad');assert.equal(r.status,401);
  const token='normal-user-token';const tokenHash=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  sql.prepare('INSERT INTO user(id,name,token_hash,created_at) VALUES(?,?,?,?)').run('normal','Normal',tokenHash,new Date().toISOString());
  r=await request('/v1/admin/content',null,token);assert.equal(r.status,404);ok('content API refuses signed-out, invalid and ordinary user tokens');
  r=await request('/v1/admin/content');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');let d=await r.json();
  assert.equal(d.setup.length,6);assert.equal(d.controls.configured,false);assert.equal(d.controls.can_approve,false);assert.ok(d.ideas.length);assert.ok(d.drafts.every(p=>p.sample));assert.equal(external.length,0);ok('unconfigured owner sees setup, actual sample ideas/drafts and no API calls');
  const ownerToken=await load('login').mintOwnerToken(env);r=await request('/v1/admin/content',null,ownerToken);assert.equal(r.status,200);ok('verified owner device token shares console access');
  r=await act({action:'approve',id:'sample',content_hash:'a'.repeat(64)});assert.equal(r.status,409);assert.equal(writes.length,0);
  env.CONTENT_ENGINE=bucket;r=await act({action:'unknown'});assert.equal(r.status,400);r=await act({action:'make'});assert.equal(r.status,409);assert.equal(external.length,0);ok('missing storage/token and invalid actions fail closed');
  const post={id:'draft-1',kind:'reel',when:'2026-11-17T13:00:00Z',tz:'Asia/Kolkata',instagram:{caption:'A concrete hook'},youtube:null,media_keys:['media/week/draft-1/reel.mp4'],cover_key:null,quality_asset_hashes:{'media/week/draft-1/reel.mp4':'a'.repeat(64)},quality_source_hashes:{},status:'awaiting_approval',quality_report_key:'quality/draft-1.json',quality_report_digest:'b'.repeat(64)};
  put('posts/draft-1.json',post);const hash=await content.contentHash(post);
  r=await act({action:'approve',id:'../state/tg_offset',content_hash:hash});assert.equal(r.status,400);
  r=await act({action:'approve',id:post.id,content_hash:'f'.repeat(64)});assert.equal(r.status,409);
  r=await act({action:'approve',id:post.id,content_hash:hash});assert.equal(r.status,409);assert.equal(writes.length,0);ok('unsafe IDs, stale copy and missing gate never queue approval');
  const report={post_id:post.id,verdict:'FAIL',errors:[],record_digest:hash,report_digest:post.quality_report_digest};put(post.quality_report_key,report);
  r=await act({action:'approve',id:post.id,content_hash:hash});assert.equal(r.status,409);
  report.verdict='PASS';report.errors=[{code:'missing-evidence'}];put(post.quality_report_key,report);r=await act({action:'approve',id:post.id,content_hash:hash});assert.equal(r.status,409);
  report.errors=[];report.report_digest='changed';put(post.quality_report_key,report);r=await act({action:'approve',id:post.id,content_hash:hash});assert.equal(r.status,409);ok('failed gates, gate errors and changed report binding refuse approval');
  report.report_digest=post.quality_report_digest;put(post.quality_report_key,report);
  r=await act({action:'approve',id:post.id,content_hash:hash});assert.equal(r.status,202);const queued=await r.json();assert.match(queued.message,/queued/);assert.match(writes[0].key,/^commands\/pending\/.*\.json$/);assert.equal(writes[0].value.hash,hash);assert.equal(writes[0].value.action,'approve');assert.equal(JSON.parse(objects.get('posts/draft-1.json')).status,'awaiting_approval');ok('valid approval queues immutable hash-bound intent without mutating the post');
  post.status='done';put('posts/draft-1.json',post);r=await act({action:'skip',id:post.id,content_hash:hash});assert.equal(r.status,409);
  post.status='awaiting_approval';put('posts/draft-1.json',post);objects.delete(post.quality_report_key);r=await act({action:'skip',id:post.id,content_hash:hash});assert.equal(r.status,202);ok('skip follows Telegram status/hash rules and remains available to reject an unqualified draft');
  env.CONTENT_GH_TOKEN='private-actions-token';r=await act({action:'research'});assert.equal(r.status,202);assert.equal(external.length,1);let dispatch=JSON.parse(external[0].options.body);assert.equal(dispatch.inputs.command,'research');assert.equal(dispatch.inputs.dry_run,true);assert.equal(dispatch.ref,'master');assert.match(external[0].url,/content-engine\.yml\/dispatches$/);ok('workflow actions use dedicated token and always request dry runs');
  r=await act({action:'pause'});assert.equal(r.status,202);let state=JSON.parse(objects.get('state/paused.json'));assert.equal(state.paused,true);assert.equal(state.dry_run,true);
  r=await act({action:'resume'});assert.equal(r.status,202);state=JSON.parse(objects.get('state/paused.json'));assert.equal(state.paused,false);assert.equal(state.dry_run,true);assert.equal(JSON.parse(external.at(-1).options.body).inputs.dry_run,true);ok('pause is persistent and resume keeps dry-run safety');
  dispatchStatus=403;r=await act({action:'make'});assert.equal(r.status,502);assert.ok(!JSON.stringify(await r.json()).includes('private-actions-token'));dispatchStatus=204;ok('dispatch errors return actionable copy without exposing tokens');
  put('dashboard/summary.json',{updated_at:'2026-11-12T12:00:00Z',setup:[{key:'engine',connected:false,status:'Off'}],ideas:[],drafts:[{id:post.id,preview:{cover:'media/week/draft-1/cover.jpg',video:'https://evil.test/video.mp4',slides:['state/ig_token.json','media/week/draft-1/slide.jpg']}}],scheduled:[],posted:[]});
  r=await request('/v1/admin/content');d=await r.json();assert.equal(d.controls.configured,true);assert.equal(d.drafts[0].preview.cover,'/v1/admin/content/media?key=media%2Fweek%2Fdraft-1%2Fcover.jpg');assert.equal(d.drafts[0].preview.video,null);assert.equal(d.drafts[0].preview.slides.length,1);assert.equal(d.setup.find(x=>x.key==='r2').connected,true);ok('summary turns only private media keys into authenticated previews');
  r=await request('/v1/admin/content/media?key=state%2Fig_token.json');assert.equal(r.status,400);r=await request('/v1/admin/content/media?key=media%2F..%2Fstate%2Fig_token.json');assert.equal(r.status,400);r=await request('/v1/admin/content/media?key=media%2Fmissing.jpg');assert.equal(r.status,404);
  objects.set('media/week/draft-1/cover.jpg','imagebytes');r=await request('/v1/admin/content/media?key=media%2Fweek%2Fdraft-1%2Fcover.jpg');assert.equal(r.status,200);assert.equal(await r.text(),'imagebytes');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  r=await request('/v1/admin/content/media?key=media%2Fweek%2Fdraft-1%2Fcover.jpg',null,token);assert.equal(r.status,404);ok('private preview streams only owner-authorized media and never state or traversal keys');
  const broken={get:async()=>{throw Error('storage outage');}};env.CONTENT_ENGINE=broken;r=await request('/v1/admin/content');d=await r.json();assert.match(d.note,/could not be read/);assert.equal(d.controls.can_approve,false);ok('storage outages produce a readable setup/sample fallback');
  console.log(`${checks} content console checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});

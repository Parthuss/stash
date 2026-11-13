// Owner console: real SQLite migrations, period/cohort semantics, owner gates and scoped actions.
// Run: node tests/admin_console.cjs (Node 22+).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'), { webcrypto } = require('node:crypto');
const esbuild = require('../worker/node_modules/esbuild');
const mods = {};
function load(name) {
  if (mods[name]) return mods[name].exports;
  const module = mods[name] = {exports:{}};
  const js = esbuild.transformSync(fs.readFileSync(path.join(__dirname,'../worker/src',name+'.ts'),'utf8'), {loader:'ts',format:'cjs',target:'es2022'}).code;
  vm.runInNewContext(js, {module,exports:module.exports,require:p=>p.startsWith('./') ? load(p.slice(2)) : {EmailMessage:class{}},
    crypto:webcrypto, Request, Response, URL, Headers, TextEncoder, TextDecoder, atob,btoa,Uint8Array,Uint32Array,setTimeout,
    fetch:async()=>{throw new Error('Unexpected external request');}, console});
  return module.exports;
}
const sql = new DatabaseSync(':memory:');
for (const f of fs.readdirSync(path.join(__dirname,'../worker/migrations')).sort()) sql.exec(fs.readFileSync(path.join(__dirname,'../worker/migrations',f),'utf8'));
let reads = 0; const queries = [];
const DB = {prepare(s){const st={sql:s,args:[],bind(...a){st.args=a;return st;},
  async first(){reads++;queries.push({sql:s,args:st.args});return sql.prepare(s).get(...st.args)??null;},
  async all(){reads++;queries.push({sql:s,args:st.args});return {results:sql.prepare(s).all(...st.args)};},
  async run(){return {meta:{changes:Number(sql.prepare(s).run(...st.args).changes)}};}};return st;},
  async batch(sts){return Promise.all(sts.map(s=>s.run()));}};
const env={DB,STASH_SECRET:'private-test-secret',SHARED_KEYS:'5'};
const {ownerConsole,consolePeriod,estimateUsageCost} = load('analytics'), {handleV1} = load('v1');
const worker=load('index').default;
const now=Date.parse('2026-11-12T12:00:00.000Z');
const ins=(s,...a)=>sql.prepare(s).run(...a);
const user=(id,at,plan='free',until=null)=>ins('INSERT INTO user(id,name,token_hash,created_at,plan,plan_until,email) VALUES(?,?,?,?,?,?,?)',id,id,'hash-'+id,at,plan,until,id+'@example.test');
const cap=(id,uid,at,status='pending',attempts=0,processed=null,error=null)=>ins('INSERT INTO capture(id,user_id,source,status,attempts,captured_at,processed_at,error,title) VALUES(?,?,?,?,?,?,?,?,?)',id,uid,'shortcut',status,attempts,at,processed,error,'Example save');
const visit=(id,visitor,uid,at,owner=0)=>ins("INSERT INTO visit(id,visitor,user_id,owner,started_at,last_at,country,device,landing,referrer) VALUES(?,?,?,?,?,?,'IN','phone','/','google.com')",id,visitor,uid,owner,at,at);
const get=(p,auth)=>worker.fetch(new Request('https://skwirl.app'+p,{headers:auth?{Authorization:'Bearer '+auth}:{}}),env,{waitUntil(){}});
const action=(id,a,body,uid=null)=>handleV1(new Request('https://skwirl.app/v1/admin/users/'+id+'/'+a,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,'/v1/admin/users/'+id+'/'+a,uid,async()=>{throw Error('no ingest');});
let checks=0;const ok=t=>console.log('ok',++checks,t);
(async()=>{
  const p=consolePeriod(1,now);
  assert.equal(p.since,'2026-11-12T00:00:00.000Z');assert.equal(p.previous_since,'2026-11-11T00:00:00.000Z');assert.equal(p.previous_until,'2026-11-11T12:00:00.000Z');assert.equal(consolePeriod(180,now).days,7);ok('UTC today compares same elapsed hours yesterday; unsupported range defaults to 7');
  user('new','2026-11-12T01:00:00.000Z','plus','2026-12-12T00:00:00.000Z');
  user('previous','2026-11-11T01:00:00.000Z');user('gap','2026-11-11T18:00:00.000Z');user('expired','2026-11-01T01:00:00.000Z','plus','2026-11-12T11:00:00.000Z');
  for(let i=0;i<5;i++)cap('new'+i,'new','2026-11-12T02:00:00.000Z',i===0?'done':'pending',0,i===0?'2026-11-12T03:00:00.000Z':null);
  cap('prev','previous','2026-11-11T03:00:00.000Z','done',0,'2026-11-11T04:00:00.000Z');
  cap('gap-save','gap','2026-11-11T18:00:00.000Z');cap('owner',null,'2026-11-12T02:00:00.000Z');
  cap('failed','new','2026-11-12T04:00:00.000Z','pending',3,null,'Groq 401 key=secret-must-never-leak');
  cap('explicit-failed','previous','2026-11-10T04:00:00.000Z','failed',1,null,'download 404 private URL');
  cap('exhausted-claimed','new','2026-11-12T05:00:00.000Z','claimed',3,null,'timed out');
  visit('n1','new-browser','new','2026-11-12T01:00:00.000Z');visit('n2','new-browser','new','2026-11-12T02:00:00.000Z');visit('p','prev-browser','previous','2026-11-11T01:00:00.000Z');
  visit('g','gap-browser','gap','2026-11-11T19:00:00.000Z');visit('owner-early','owner-browser',null,'2026-11-12T01:00:00.000Z');visit('owner-authed','owner-browser',null,'2026-11-12T02:00:00.000Z',1);
  ins("INSERT INTO usage_event(at,user_id,kind,action,model,key_type,prompt_tokens,completion_tokens) VALUES('2026-11-12T02:00:00.000Z','new','groq','chat','openrouter:qwen/qwen3.8-27b','shared',8000,1000)");
  ins("INSERT INTO usage_event(at,user_id,kind,action) VALUES('2026-11-12T02:30:00.000Z','new','api','open')");
  const data=await ownerConsole(env,1,now), consoleQueries=queries.slice(), k=key=>data.kpis.find(k=>k.key===key);
  assert.equal(data.activity.length,1);assert.equal(data.activity[0].action,'open');assert.ok(data.activity.every(e=>e.kind==='api'));
  // Native SQLite's default compound limit is much higher than D1's. Prepare the actual
  // emitted SQL against SQLite with D1's limit of five, not a source-text approximation.
  const limited = require('node:child_process').spawnSync('python3', ['-c', `
import json,pathlib,sqlite3,sys
c=sqlite3.connect(':memory:')
for p in sorted(pathlib.Path(sys.argv[1]).glob('*.sql')): c.executescript(p.read_text())
c.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT,5)
try:
 c.execute('SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6')
 raise AssertionError('Compound limit was not enforced')
except sqlite3.OperationalError as e:
 assert 'too many terms' in str(e)
for q in json.load(sys.stdin): c.execute('EXPLAIN '+q['sql'],q['args'])
`, path.join(__dirname,'../worker/migrations')], {input:JSON.stringify(consoleQueries),encoding:'utf8'});
  assert.equal(limited.status,0,limited.stderr);ok('actual console SQL prepares under D1 five-term compound SELECT limit');
  assert.equal(k('signups').value,1);assert.equal(k('signups').previous,1);assert.equal(k('visitors').value,1);assert.equal(k('visitors').previous,1);
  assert.equal(k('active').value,1);assert.equal(k('active').previous,1);assert.equal(k('processed').value,1);assert.equal(k('saves').value,8);ok('KPI counts deduplicate browser/users, omit owner traffic and exclude comparison gap');
  assert.equal(k('saves').series.length,12);assert.equal(k('saves').series.reduce((n,x)=>n+x.value,0),8);assert.equal(k('saves').series[2].value,6);ok('hourly sparkline values zero-fill and match current interval');
  assert.equal(k('queue').value,6);assert.equal(k('queue').previous,null);assert.equal(k('plus').value,1);assert.equal(k('plus').series.length,0);ok('queue includes owner and excludes terminal failures; expired Plus excluded, history unavailable');
  assert.equal(data.funnel.steps[1].value,1);assert.equal(data.funnel.steps[2].value,1);assert.equal(data.funnel.steps[3].value,1);assert.equal(data.funnel.steps[4].value,1);assert.match(data.funnel.note,/not an attributed/);ok('funnel follows signup cohort with reach caveat');
  assert.equal(data.users.find(u=>u.id==='previous').plan,'early');assert.equal(data.users.find(u=>u.id==='gap').plan,'free');assert.equal(data.users.find(u=>u.id==='expired').plan,'early');assert.equal(data.users.find(u=>u.id==='new').plan,'plus');ok('reported plans match early grandfathering, free cutoff and Plus expiry');
  const n=data.users.find(u=>u.id==='new');assert.equal(n.done,1);assert.equal(n.failed,2);assert.equal(n.pending,4);assert.equal(n.total,7);
  assert.equal(data.health.failures.reduce((n,r)=>n+r.n,0),3);assert.equal(data.health.providers.usage[0].provider,'OpenRouter');assert.equal(data.health.providers.groq_keys,5);assert.equal(data.health.cost.estimated_usd,0.0066);assert.equal(data.health.cost.priced_calls,1);assert.equal(data.health.cost.unpriced_calls,0);
  assert.ok(!JSON.stringify(data).includes('secret-must-never-leak'));assert.ok(!JSON.stringify(data).includes('token_hash'));assert.ok(!JSON.stringify(data).includes('private-test-secret'));assert.equal(data.traffic.devices[0].k,'phone');assert.ok(reads<25);ok('states agree, provider detected from model, no raw errors or tokens; bounded query count');
  let r=await action('new','requeue',{},'previous');assert.equal(r.status,404);assert.equal(sql.prepare("SELECT attempts FROM capture WHERE id='failed'").get().attempts,3);
  r=await action('new','requeue',{});assert.equal(r.status,200);assert.equal((await r.json()).requeued,2);assert.equal(sql.prepare("SELECT status FROM capture WHERE id='explicit-failed'").get().status,'failed');assert.equal(sql.prepare("SELECT status FROM capture WHERE id='new0'").get().status,'done');ok('requeue owner-only and user-scoped, preserving other user and successful save');
  r=await action('new','message',{message:'#bad <script>x</script>'});assert.equal(r.status,200);assert.equal(sql.prepare("SELECT owner_msg FROM user WHERE id='new'").get().owner_msg,'#gSave #bad <script>x</script>');
  r=await action('new','message',{message:'x'.repeat(501)});assert.equal(r.status,400);r=await action('new','message',{message:''});assert.equal(r.status,200);assert.equal(sql.prepare("SELECT owner_msg FROM user WHERE id='new'").get().owner_msg,null);ok('owner messages validated, selector prefix forced, blank clears');
  {const v1=(p,uid,m='GET')=>handleV1(new Request('https://skwirl.app'+p,{method:m}),env,p,uid,async()=>{throw Error('no ingest');});
  r=await action('expired','tip',{tip:'shortcut'},'previous');assert.equal(r.status,404);r=await action('expired','tip',{tip:'<b>x'});assert.equal(r.status,400);r=await action('expired','tip',{});assert.equal(r.status,400);
  r=await action('expired','tip',{tip:'shortcut'});assert.equal(r.status,200);assert.equal(sql.prepare("SELECT owner_tip FROM user WHERE id='expired'").get().owner_tip,'shortcut');
  assert.equal((await (await v1('/v1/setup','expired')).json()).owner_tip,'shortcut');
  r=await action('new','tip',{tip:'shortcut'});assert.equal(r.status,200);assert.equal((await (await v1('/v1/setup','new')).json()).owner_tip,null);
  r=await v1('/v1/owner-tip/seen','expired','POST');assert.equal(r.status,200);assert.equal(sql.prepare("SELECT owner_tip FROM user WHERE id='expired'").get().owner_tip,null);
  assert.equal(sql.prepare("SELECT owner_tip FROM user WHERE id='new'").get().owner_tip,'shortcut');r=await action('new','tip',{tip:''});assert.equal(sql.prepare("SELECT owner_tip FROM user WHERE id='new'").get().owner_tip,null);
  ok('one-time tips: owner-only, preset keys only, hidden once they save via Shortcut, seen clears only their own');}
  r=await action('new','push',{body:''});assert.equal(r.status,400);r=await action('new','push',{body:'Hello'});assert.equal(r.status,409);r=await action('missing','message',{message:'hi'});assert.equal(r.status,404);ok('push validation and missing-configuration states are explicit');
  r=await get('/v1/admin/console');assert.equal(r.status,401);r=await get('/v1/admin/console','invalid');assert.equal(r.status,401);
  const token='stk_normal';const hash=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(token));ins("UPDATE user SET token_hash=? WHERE id='new'",Buffer.from(hash).toString('hex'));
  r=await get('/v1/admin/console',token);assert.equal(r.status,404);r=await get('/v1/admin/console?days=1',env.STASH_SECRET);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);ok('full Worker auth refuses unauthenticated/invalid/normal users, accepts owner secret and disables cache');
  const ownerToken=await load('login').mintOwnerToken(env);
  r=await get('/v1/admin/console',ownerToken);assert.equal(r.status,200);ok('verified owner device token has the same console access');
  const cost=estimateUsageCost([
    {model:'qwen/qwen3.8-27b',action:'chat',calls:1,prompt_tokens:1000000,completion_tokens:1000000,audio_seconds:0},
    {model:'whisper-large-v3',action:'whisper',calls:1,prompt_tokens:0,completion_tokens:0,audio_seconds:2,billed_audio_seconds:10},
    {model:'unknown-model',action:'chat',calls:2,prompt_tokens:999999,completion_tokens:999999,audio_seconds:0},
  ]);
  assert.equal(cost.estimated_usd,4.800308);assert.equal(cost.priced_calls,2);assert.equal(cost.unpriced_calls,2);assert.match(cost.note,/not a bill/);ok('cost uses verified model-specific list prices, audio minimum, and exposes unpriced coverage');
  const weekly=await ownerConsole(env,7,now);assert.equal(weekly.kpis.find(k=>k.key==='signups').value,3);assert.equal(weekly.kpis[0].series.length,7);ok('rolling week includes all activity in its seven equal day buckets');
  sql.exec('DELETE FROM user; DELETE FROM capture; DELETE FROM visit; DELETE FROM usage_event;');
  const empty=await ownerConsole(env,1,now);assert.equal(empty.kpis[0].value,0);assert.equal(empty.funnel.steps[3].value,0);assert.equal(empty.users.length,0);assert.equal(empty.traffic.daily.length,0);ok('empty database produces zero counts and no invented activity');
  console.log(`${checks} owner console checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});

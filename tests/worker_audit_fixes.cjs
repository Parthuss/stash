// Exercises actual TypeScript handlers with mocked D1; no server, schema or network writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const esbuild=require('../worker/node_modules/esbuild'), {webcrypto}=require('node:crypto');
function load(name,imports={}) {
  const src=fs.readFileSync(path.join(__dirname,'../worker/src',name+'.ts'),'utf8');
  const js=esbuild.transformSync(src,{loader:'ts',format:'cjs',target:'es2022'}).code;
  const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,require:p=>imports[p]||{},crypto:webcrypto,Request,Response,URL,TextEncoder,TextDecoder,console,atob,btoa});return module.exports;
}
const v1=load('v1');
function database(captures=[],own=false) {
  const bindings=[];
  return {captures,bindings,
    prepare(sql){const stmt={sql,args:[],bind(...args){this.args=args;bindings.push({sql,args});return this},
      async first(){if(sql.includes('COUNT(*) AS n'))return {n:captures.filter(x=>x.user==='user').length,own_key:own?1:0};return null},
      async all(){if(sql.startsWith('SELECT permalink FROM capture')){assert.equal(this.args[0],'user');assert.ok(this.args.length<=100);return {results:captures.filter(x=>x.user===this.args[0]&&this.args.slice(1).includes(x.url)).map(x=>({permalink:x.url}))}}return {results:[]}},
      async run(){return {meta:{changes:1}}}};return stmt},
    async batch(stmts){return stmts.map(s=>{const url=s.args[1],user=s.args[3];const exists=captures.some(x=>x.user===user&&x.url===url);if(!exists)captures.push({url,user});return {meta:{changes:exists?0:1}}})}
  };
}
const url=i=>'https://www.instagram.com/reel/IMPORT'+i+'/';
(async()=>{
 const db=database([...Array.from({length:80},(_,i)=>({url:url(i),user:'user'})),{url:url(90),user:'other'}]);
 const req=new Request('http://audit.invalid/v1/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls:Array.from({length:100},(_,i)=>url(i))})});
 const r=await v1.handleV1(req,{DB:db},'/v1/import','user',()=>{});assert.equal(r.status,200);
 const b=await r.json();assert.equal(b.added,20);assert.equal(b.skipped_over_cap,0);assert.equal(db.captures.filter(x=>x.user==='user').length,100);
 const again=await v1.handleV1(new Request(req.url,{method:'POST',body:JSON.stringify({urls:Array.from({length:120},(_,i)=>url(i))})}),{DB:db},'/v1/import','user',()=>{});
 const b2=await again.json();assert.equal(b2.added,0);assert.equal(b2.skipped_over_cap,20);
 console.log('PASS 18 repeated import uses remaining capacity and preserves tenancy');
 for(const [route,body] of [
   ['/v1/ingest',{url:'https://instagram.com/reel/X/',note:123}],
   ['/v1/ingest',{url:42}],
   ['/v1/ingest',{url:'https://instagram.com/reel/X/',source:{}}],
   ['/v1/feedback',{message:{}}],['/v1/feedback',{email:123}],['/v1/feedback',{message:'test',consent:'false'}]
 ]) {
   const r=await v1.handleV1(new Request('http://audit.invalid'+route,{method:'POST',body:JSON.stringify(body)}),{DB:database()},route,'user',()=>{throw Error('unexpected write')});assert.equal(r.status,400,route);
 }
 const worker=load('index',{'./oauth':{handleOAuth:async()=>null},'./v1':{createUser:async()=>({id:'new',token:'fixture'}),logEvent:async()=>{}}}).default;
 for(const body of [{name:123},{name:'Valid',email:{}},{name:'Valid',code:42}]) {
   const r=await worker.fetch(new Request('http://audit.invalid/join',{method:'POST',body:JSON.stringify(body)}),{DB:database(),OPEN_JOIN:'1'},{waitUntil(){}});assert.equal(r.status,400,'join typed input');
 }
 const validJoin=await worker.fetch(new Request('http://audit.invalid/join',{method:'POST',body:JSON.stringify({name:'Valid'})}),{DB:database(),OPEN_JOIN:'1'},{waitUntil(){}});assert.equal(validJoin.status,201);
 for(const [limit,want] of [['-1',1],['1.5',1],['500',200],['nonsense',50],['Infinity',200]]) {
   const db=database();const r=await v1.handleV1(new Request('http://audit.invalid/v1/notes?limit='+limit),{DB:db},'/v1/notes','user',()=>{});assert.equal(r.status,200);
   const q=db.bindings.find(x=>x.sql.includes('ORDER BY created_at DESC LIMIT'));assert.equal(q.args.at(-1),want);assert.equal(q.args[0],'user');
 }
 console.log('PASS 19 malformed allowed inputs return 400; note limits stay bounded');
})().catch(e=>{console.error(e);process.exit(1)});

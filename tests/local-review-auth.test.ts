import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import vm from 'node:vm';
import ts from 'typescript';
type Obj=Record<string,any>;
function load(file:string,imports:Obj={}):Obj{
 const module={exports:{}};
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new vm.Script(code).runInNewContext({module,exports:module.exports,URL,process:{env:{}},require:(name:string)=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name);}});return module.exports;
}
const config=load('../lib/local-review-config.ts');
const auth=load('../lib/local-review-auth.ts',{'node:async_hooks':{AsyncLocalStorage},'./local-review-config':config});
const preview=load('../scripts/vite/local-preview.ts');
const TOKEN='a'.repeat(64),env={GEONOS_LOCAL_PREVIEW:'true',GEONOS_LOCAL_PREVIEW_TOKEN:TOKEN};
const request=(values:Obj={},host='127.0.0.1:5173')=>{const headers=new Headers({Host:host,Origin:`http://${host}`});for(const[k,v]of Object.entries(values))headers.set(k,v);return new Request(`http://${host}/api/local-review`,{headers});};
function incoming(host='127.0.0.1:5173',address='127.0.0.1'):Obj{return{headers:{host,'x-geonos-local-capability':'forged','x-authenticated-user-id':'forged'},rawHeaders:['Host',host,'X-Geonos-Local-Capability','forged','X-Authenticated-User-Id','forged'],socket:{remoteAddress:address}};}
const actor=(r:Request,development=true,bindings:Obj=env)=>auth.runWithLocalReviewActor(r,bindings,development,()=>auth.getLocalReviewActor());
test('local middleware replaces forged capabilities only after literal Host and socket agreement',()=>{
 for(const [host,address] of [['localhost:5173','127.0.0.1'],['127.0.0.1:5173','::ffff:127.0.0.1'],['[::1]:5173','::1']]){
  const r=incoming(host,address);preview.attachLocalCapability(r,TOKEN);assert.equal(r.headers['x-geonos-local-capability'],TOKEN);assert.equal(r.headers['x-authenticated-user-id'],undefined);assert.equal(r.rawHeaders.filter((v:string)=>v===TOKEN).length,1);
  assert.equal(actor(request(r.headers,host)).kind,'local-preview');
 }
 for(const [host,address] of [['localhost.attacker.test','127.0.0.1'],['127.1:5173','127.0.0.1'],['2130706433:5173','127.0.0.1'],['localhost:65536','127.0.0.1'],['localhost:5173','192.0.2.1'],['localhost:5173','']]){
  const r=incoming(host,address);preview.attachLocalCapability(r,TOKEN);assert.equal(r.headers['x-geonos-local-capability'],undefined);assert.equal(r.headers['x-authenticated-user-id'],undefined);assert.ok(!r.rawHeaders.includes('forged'));
 }
 const duplicate=incoming();duplicate.rawHeaders.push('Host','localhost:5173');preview.attachLocalCapability(duplicate,TOKEN);assert.equal(duplicate.headers['x-geonos-local-capability'],undefined);
});
test('production never establishes a local actor even with matching configuration and forged headers',()=>{
 assert.equal(actor(request({'x-geonos-local-capability':TOKEN}),false),null);
 for(const bindings of [{},{...env,GEONOS_LOCAL_PREVIEW:'false'},{...env,GEONOS_LOCAL_PREVIEW:true},{...env,GEONOS_LOCAL_PREVIEW_TOKEN:'short'}])assert.equal(actor(request({'x-geonos-local-capability':TOKEN}),true,bindings),null);
 for(const token of ['',TOKEN.slice(1),'b'.repeat(64)])assert.equal(actor(request({'x-geonos-local-capability':token})),null);
 assert.equal(auth.getLocalReviewActor(),null);
});
test('capabilities do not bypass loopback, forwarding or request authority checks',()=>{
 const token={'x-geonos-local-capability':TOKEN};
 for(const r of [request(token,'public.example'),request({...token,Host:'localhost:5173'}),request({...token,'X-Forwarded-For':'127.0.0.1'}),request({...token,'X-Forwarded-Host':'public.example'}),new Request('https://127.0.0.1:5173/api/local-review',{headers:{Host:'127.0.0.1:5173',...token}})])assert.equal(actor(r),null);
 assert.ok(actor(request({...token,'X-Forwarded-Host':'127.0.0.1:5173'})));
});
test('local execution identity remains isolated across concurrent and nested requests',async()=>{
 let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
 const accepted=auth.runWithLocalReviewActor(request({'x-geonos-local-capability':TOKEN}),env,true,async()=>{
  assert.equal(auth.getLocalReviewActor().userId,'local-preview');await wait;
  assert.equal(auth.getLocalReviewActor().kind,'local-preview');
  auth.runWithLocalReviewActor(request(),env,true,()=>assert.equal(auth.getLocalReviewActor(),null));
  assert.equal(auth.getLocalReviewActor().kind,'local-preview');
 });
 assert.equal(auth.getLocalReviewActor(),null);
 await auth.runWithLocalReviewActor(request(),env,true,async()=>{await Promise.resolve();assert.equal(auth.getLocalReviewActor(),null);});
 release();await accepted;assert.equal(auth.getLocalReviewActor(),null);
});
test('independent capability middleware is development-only and registers one sanitizer',()=>{
 const plugin=preview.localPreview(TOKEN),handlers:Function[]=[];assert.equal(plugin.apply,'serve');assert.equal(plugin.enforce,'pre');
 plugin.configureServer({middlewares:{use:(fn:Function)=>handlers.push(fn)}});assert.equal(handlers.length,1);let next=0;const r=incoming();handlers[0](r,{},()=>next++);assert.equal(next,1);assert.equal(r.headers['x-geonos-local-capability'],TOKEN);
});

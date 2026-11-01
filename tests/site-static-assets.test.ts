import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../lib/site-static-assets.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(assets?:{fetch(request:Request):Promise<Response>}){
 const module={exports:{} as {fetchGroundAsset(path:string,signal:AbortSignal):Promise<Response>}};
 new vm.Script(code).runInNewContext({module,exports:module.exports,Request,require:(name:string)=>{assert.equal(name,'cloudflare:workers');return{env:{ASSETS:assets}};},fetch:()=>{throw Error('Public-origin fetch is forbidden');}});return module.exports;
}
test('the pinned archive uses the internal asset binding with a Vite-compatible fixed host',async()=>{
 let seen:Request|undefined;const abort=new AbortController();const api=load({fetch:async request=>{seen=request;return new Response('archive');}});
 const result=await api.fetchGroundAsset('/data/surroundings/81.json.gz',abort.signal);
 assert.equal(await result.text(),'archive');assert.equal(seen!.url,'http://localhost/data/surroundings/81.json.gz');assert.deepEqual([...seen!.headers],[]);abort.abort();assert.equal(seen!.signal.aborted,true);
});
test('asset reader rejects arbitrary URLs, traversal and missing bindings before outbound work',async()=>{
 const api=load();for(const path of ['https://example.com/data','//example.com','/data/surroundings/../10.json.gz','/data/surroundings/10.json.gz?x=1','/data/surroundings/10000.json.gz'])await assert.rejects(api.fetchGroundAsset(path,new AbortController().signal),/Invalid/);
 await assert.rejects(api.fetchGroundAsset('/data/surroundings/10.json.gz',new AbortController().signal),/binding unavailable/);
});

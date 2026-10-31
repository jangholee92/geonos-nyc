import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/dino-worker.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const manifest=JSON.parse(readFileSync(new URL('../public/models/dinov2/manifest.json',import.meta.url),'utf8'));
function load(path=manifest.artifact.download.path){
 const requests:Array<{url:string;init:RequestInit}>=[],messages:any[]=[],scope:{location:{origin:string};postMessage:(m:unknown)=>void;onmessage?:Function}={location:{origin:'https://private.example.test'},postMessage:m=>messages.push(m)};
 let decoded=false;
 const ort={env:{wasm:{} as Record<string,unknown>},InferenceSession:{create:async()=>({run:async()=>({patches:{type:'float32',dims:[1,256,384],data:new Float32Array(98304),dispose(){}}}),release:async()=>{}})},Tensor:class{dispose(){}}};
 const module={exports:{}};
 new vm.Script(compiled).runInNewContext({module,exports:module.exports,self:scope,URL,ArrayBuffer,Float32Array,require:(name:string)=>{
  if(name==='onnxruntime-web/wasm')return ort;
  if(name.endsWith('manifest.json'))return{artifact:{...manifest.artifact,download:{...manifest.artifact.download,path}}};
  if(name==='./dino-model')return{decodeDinoModelDownload:async(response:Response)=>{assert.equal(response.status,200,'An authenticated asset must reach the decoder.');decoded=true;return new Uint8Array([1]);}};
  throw Error('Unexpected dependency '+name);
 },fetch:async(url:string,init:RequestInit)=>{requests.push({url,init});return new Response(null,{status:init.credentials==='same-origin'?200:401});}});
 return{requests,messages,ort,run:async()=>{await scope.onmessage!({data:{before:new ArrayBuffer(602112),after:new ArrayBuffer(602112)}});return decoded;}};
}
test('actual worker retains existing same-origin authentication and refuses redirects for its pinned model',async()=>{
 const api=load();assert.equal(await api.run(),true);assert.equal(api.requests.length,1);assert.equal(api.requests[0].url,'https://private.example.test/models/dinov2/dinov2-vits14-reg-patches-int8.onnx.gzip');assert.equal(api.requests[0].init.credentials,'same-origin');assert.equal(api.requests[0].init.redirect,'error');assert.ok(api.messages.some(m=>m.type==='result'));
 assert.deepEqual(JSON.parse(JSON.stringify(api.ort.env.wasm.wasmPaths)),{wasm:'https://private.example.test/models/dinov2/runtime/ort-wasm-simd-threaded.wasm',mjs:'https://private.example.test/models/dinov2/runtime/ort-wasm-simd-threaded.mjs'});
});
test('a changed cross-origin or unpinned model path fails before any credentialed request',async()=>{
 for(const path of ['https://untrusted.invalid/models/dinov2/model.onnx.gzip','//untrusted.invalid/model.onnx.gzip','/private/account','/models/dinov2/dinov2-vits14-reg-patches-int8.onnx.gzip?next=outside']){
  const api=load(path);assert.equal(await api.run(),false);assert.equal(api.requests.length,0);assert.ok(api.messages.some(m=>m.type==='error'&&/pinned same-origin/.test(m.message)));
 }
});

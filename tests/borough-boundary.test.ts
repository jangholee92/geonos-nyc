import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
import ts from 'typescript';
const manifest=JSON.parse(readFileSync(new URL('../lib/borough-boundary-manifest.json',import.meta.url),'utf8'));
const encoded=readFileSync(new URL('../public/data/boroughs.geojson.gzip',import.meta.url)),decoded=gunzipSync(encoded);
type API=typeof import('../lib/borough-boundary');
function harness(fetcher:typeof fetch=fetch,decompress:typeof DecompressionStream|undefined=DecompressionStream):API{
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/borough-boundary.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:(name:string)=>{assert.equal(name,'./borough-boundary-manifest.json');return manifest;},crypto:webcrypto,Uint8Array,TextDecoder,Response,AbortController,DecompressionStream:decompress,setTimeout,clearTimeout,fetch:fetcher});return module.exports as API;
}
const response=(bytes:Uint8Array)=>new Response(bytes as BodyInit);
test('the shipped gzip preserves every original GeoJSON byte and all five borough geometries',async()=>{
 assert.equal(encoded.length,manifest.compressed_bytes);assert.equal(decoded.length,manifest.decoded_bytes);
 assert.deepEqual(readFileSync(new URL('../lib/borough-boundary-manifest.json',import.meta.url)),readFileSync(new URL('../public/data/boroughs-manifest.json',import.meta.url)));
 assert.equal(existsSync(new URL('../public/data/boroughs.geojson',import.meta.url)),false);
 const value=await harness().decodeBoroughBoundary(response(encoded));
 assert.deepEqual(JSON.parse(JSON.stringify(value)),JSON.parse(decoded.toString()));
 assert.deepEqual(Array.from(value.features,f=>(f.properties as Record<string,string>).boroname).sort(),['Bronx','Brooklyn','Manhattan','Queens','Staten Island']);
});
test('already-decoded hosting transport is accepted only with the exact original identity',async()=>{
 const value=await harness().decodeBoroughBoundary(response(decoded));assert.equal(value.features.length,5);
 const altered=Uint8Array.from(decoded);altered[altered.length-1]^=1;
 await assert.rejects(harness().decodeBoroughBoundary(response(altered)),/identity differs/);
 await assert.rejects(harness().decodeBoroughBoundary(new Response('<html>Login</html>',{headers:{'content-type':'text/html'}})),/identity differs/);
});
test('corruption, truncation, oversized bodies and unsuccessful responses fail explicitly',async()=>{
 const altered=Uint8Array.from(encoded);altered[100]^=1;
 for(const bytes of [altered,encoded.subarray(0,-1)])await assert.rejects(harness().decodeBoroughBoundary(response(bytes)),/identity differs/);
 await assert.rejects(harness().decodeBoroughBoundary(response(new Uint8Array(manifest.decoded_bytes+1))),/size limit/);
 await assert.rejects(harness().decodeBoroughBoundary(new Response('missing',{status:404})),/unavailable/);
});
test('loading uses the fixed same-origin asset and caller cancellation closes a stalled body',async()=>{
 let cancelled=false,calls=0;const controller=new AbortController();
 const api=harness((async(url,init)=>{calls++;assert.equal(url,manifest.asset);assert.equal(init?.credentials,'same-origin');return new Response(new ReadableStream({cancel(){cancelled=true;}}));}) as typeof fetch);
 const pending=api.fetchBoroughBoundary(controller.signal);await new Promise(r=>setImmediate(r));controller.abort();
 await assert.rejects(pending,/cancelled/);assert.equal(cancelled,true);assert.equal(calls,1);
 await assert.rejects(api.fetchBoroughBoundary(controller.signal),/cancelled/);assert.equal(calls,1);
});

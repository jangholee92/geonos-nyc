import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding} from '../lib/city';
type API=typeof import('../lib/surroundings');
const samples=JSON.parse(readFileSync(new URL('../public/data/stories/surroundings-samples.json',import.meta.url),'utf8'));
const map=JSON.parse(readFileSync(new URL('../public/data/stories/smith-street.geojson',import.meta.url),'utf8'));
function building(id='109855'):CityBuilding{
  const geometry=map.features.find((f:any)=>f.properties.role==='footprint'&&f.properties.doitt_id===id).geometry;
  return{id,geometry,footprint_edited_at:samples.records[id][1],feature_code:2100,entity_type:'building'} as CityBuilding;
}
function gzipResponse(payload:unknown):Response{return new Response(gzipSync(JSON.stringify(payload)),{headers:{'content-type':'application/gzip'}});}
function harness(fetcher:(url:string)=>Promise<Response>,decompress:typeof DecompressionStream|null=DecompressionStream){
  const module={exports:{}};
  const source=readFileSync(new URL('../lib/surroundings.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,crypto:webcrypto,TextEncoder,TextDecoder,ReadableStream,DecompressionStream:decompress??undefined,require:(name:string)=>{assert.equal(name,'./public-fetch');return{fetchPublicJson:async(url:string,options:any)=>{const response=await fetcher(url);if(!response.ok){await response.body?.cancel();throw Error('HTTP failure');}return options.readResponse(response);}}}});
  return module.exports as API;
}
test('real Smith geometries match the audited Python fingerprints and preserve the scenario reversal',async()=>{
  const calls:string[]=[];const api=harness(async url=>{calls.push(url);return gzipResponse(samples)});
  const a=await api.fetchSurroundings(building()),b=await api.fetchSurroundings(building('819422'));
  assert.equal(await api.geometryFingerprint(building().geometry),samples.records['109855'][0]);
  assert.equal(a.status,'available');assert.equal(b.status,'available');
  if(a.status!=='available'||b.status!=='available')throw Error('Expected verified records');
  assert.equal(a.nearest_m.current_deep,233.314);assert.equal(a.nearest_m.future_deep,0);
  assert.equal(a.bands[0].areas_m2.future_deep,144.8);
  assert.equal(b.nearest_m.future_deep,47.299);assert.equal(b.bands[0].areas_m2.future_deep,0);
  assert.equal(a.outline_intersects.future_deep,true);assert.equal(b.outline_intersects.future_deep,false);
  assert.match(a.source.note,/voids/);assert.match(a.source.note,/not current conditions/);
  assert.deepEqual(calls,['/data/surroundings/10.json.gz','/data/surroundings/81.json.gz']);
});
test('geometry and edit-date changes independently make a previously matched row stale',async()=>{
  const api=harness(async()=>gzipResponse(samples)),edited=building();edited.footprint_edited_at='2026-10-28T00:00:00Z';
  assert.equal((await api.fetchSurroundings(edited)).status,'stale');
  const moved=structuredClone(building());moved.geometry.coordinates[0][0][0][0]+=0.00001;
  assert.equal((await api.fetchSurroundings(moved)).status,'stale');
  const equivalent=building();equivalent.footprint_edited_at=new Date(equivalent.footprint_edited_at!).toISOString();
  assert.equal((await api.fetchSurroundings(equivalent)).status,'available');
});
test('parcel and invalid or placeholder geometry are unsupported without a network request',async()=>{
  let calls=0;const api=harness(async()=>{calls++;return gzipResponse(samples)});
  assert.equal((await api.fetchSurroundings({...building(),id:'p:3004880006',entity_type:'parcel'})).status,'unsupported');
  assert.equal((await api.fetchSurroundings({...building(),geometry_quality:'invalid_or_placeholder'})).status,'unsupported');
  assert.equal((await api.fetchSurroundings({...building(),feature_code:1003})).status,'unsupported');assert.equal(calls,0);
});
test('missing rows, malformed values and different snapshots never become zero-valued evidence',async()=>{
  const malformed=structuredClone(samples);malformed.records['109855'][4]={'0':[1,-3,2]};
  for(const payload of [{...samples,records:{}},malformed,{...samples,snapshot_id:'different-source'}]){
    const result=await harness(async()=>gzipResponse(payload)).fetchSurroundings(building());assert.equal(result.status,'unavailable');assert.ok(!('bands'in result));
  }
});
test('concurrent lookups share one shard request and a failed request is retried',async()=>{
  let calls=0;const api=harness(async()=>{calls++;if(calls===1)throw Error('offline');return gzipResponse(samples)});
  assert.equal((await api.fetchSurroundings(building())).status,'unavailable');
  const result=await Promise.all([api.fetchSurroundings(building()),api.fetchSurroundings(building())]);
  assert.ok(result.every(r=>r.status==='available'));assert.equal(calls,2);
});
test('the published citywide shards resolve both real story footprints without loading the manifest or other shards',async()=>{
  const calls:string[]=[];
  const api=harness(async url=>{calls.push(url);return new Response(readFileSync(new URL('../public'+url,import.meta.url)),{headers:{'content-type':'application/gzip'}});});
  const results=await Promise.all([api.fetchSurroundings(building()),api.fetchSurroundings(building('819422'))]);
  assert.ok(results.every(result=>result.status==='available'));
  assert.deepEqual(calls.sort(),['/data/surroundings/10.json.gz','/data/surroundings/81.json.gz']);
});

test('gzip magic can cross chunk boundaries; decoded Content-Encoding bodies are not decompressed twice',async()=>{
  const bytes=gzipSync(JSON.stringify(samples));
  const chunked=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes.subarray(0,1));controller.enqueue(bytes.subarray(1,2));controller.enqueue(bytes.subarray(2));controller.close();}});
  assert.equal((await harness(async()=>new Response(chunked,{headers:{'content-type':'application/octet-stream'}})).fetchSurroundings(building())).status,'available');
  const decodedHeaders:HeadersInit[]=[{'content-type':'application/json'},{'content-encoding':'gzip','content-type':'application/gzip'}];
  for(const headers of decodedHeaders){
    assert.equal((await harness(async()=>new Response(JSON.stringify(samples),{headers})).fetchSurroundings(building())).status,'available');
  }
});
test('broken gzip, HTML fallback, unidentified plain bodies and oversized decoded data fail closed and retry',async()=>{
  const good=gzipSync(JSON.stringify(samples)),corrupt=Buffer.from(good);corrupt[corrupt.length-5]^=255;
  const bad=[
    new Response(good.subarray(0,good.length-6)),
    new Response(corrupt),
    new Response('<!doctype html><title>Not found</title>',{headers:{'content-type':'text/html'}}),
    new Response(JSON.stringify(samples),{headers:{'content-type':'application/octet-stream'}}),
    new Response(gzipSync(' '.repeat(8*1024*1024+1))),
  ];
  for(const response of bad){let calls=0;const api=harness(async()=>++calls===1?response:gzipResponse(samples));const result=await api.fetchSurroundings(building());assert.equal(result.status,'unavailable');assert.ok(!('bands'in result));assert.equal((await api.fetchSurroundings(building())).status,'available');assert.equal(calls,2);}
});
test('a browser without decompression support returns an explicit unknown state without fetching',async()=>{
  let calls=0;const api=harness(async()=>{calls++;return gzipResponse(samples);},null);
  const result=await api.fetchSurroundings(building());assert.equal(result.status,'unavailable');assert.match(result.reason,/up-to-date browser/);assert.equal(calls,0);
});

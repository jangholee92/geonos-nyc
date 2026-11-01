import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding} from '../lib/city';
import type {PlanningContext} from '../lib/planning-context';
type API=typeof import('../lib/surroundings-tool');
const index=JSON.parse(readFileSync(new URL('../lib/surroundings-shard-index.json',import.meta.url),'utf8'));
const sample=JSON.parse(readFileSync(new URL('../public/data/stories/surroundings-samples.json',import.meta.url),'utf8'));
const geometry=JSON.parse(readFileSync(new URL('../public/data/stories/smith-street.geojson',import.meta.url),'utf8'));
function building(id='109855'):CityBuilding{return{id,address:id==='109855'?'572 Smith Street':'592 Smith Street',entity_type:'building',feature_code:2100,geometry:geometry.features.find((f:any)=>f.properties.role==='footprint'&&f.properties.doitt_id===id).geometry,footprint_edited_at:sample.records[id][1]} as CityBuilding;}
function harness(options:{index?:unknown;timeout?:number;decompress?:typeof DecompressionStream|null}={}):API{
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/surroundings-tool.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{module,exports:module.exports,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Response,ReadableStream,AbortController,DecompressionStream:options.decompress===null?undefined:DecompressionStream,setTimeout:options.timeout?((fn:()=>void)=>setTimeout(fn,options.timeout)):setTimeout,clearTimeout,require:(name:string)=>{assert.equal(name,'./surroundings-shard-index.json');return options.index??index;}});
 return module.exports as API;
}
const actual=async(path:string)=>new Response(readFileSync(new URL('../public'+path,import.meta.url)),{headers:{'content-type':'application/gzip'}});
function pinnedSample(change:(data:any)=>void=()=>{}){
 const data=structuredClone(sample);change(data);const decoded=Buffer.from(JSON.stringify(data)),compressed=gzipSync(decoded),sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 return{data,decoded,compressed,index:{...index,files:{'10':{bytes:decoded.length,sha256:sha(decoded),compressed_bytes:compressed.length,compressed_sha256:sha(compressed)}}}};
}

test('real pinned shards retain the exact Smith ground measurements and separate planning years',async()=>{
 const calls:string[]=[],api=harness();
 const planningContext={planningWindow:{origin:'relative_user_window',quote:'next 10 years',anchorDate:'2026-10-31',requestedStartYear:2026,requestedEndYear:2036,publishedHorizon:'2030s',interpretation:'2030s regional context'}} as PlanningContext;
 const result=await api.inspectSurroundingGround([building(),building('819422')],{fetchAsset:async(path)=>{calls.push(path);return actual(path);},planningContext});
 assert.equal(result.status,'available');assert.equal(result.sites[0].nearestM?.current_deep,233.314);assert.equal(result.sites[0].nearestM?.future_deep,0);
 assert.equal(result.sites[0].bands?.[0].areasM2.future_deep,144.8);assert.equal(result.sites[1].nearestM?.future_deep,47.299);
 assert.equal(result.sites[0].outlineIntersects?.future_deep,true);assert.equal(result.sites[1].outlineIntersects?.future_deep,false);
 assert.deepEqual(calls,['/data/surroundings/10.json.gz','/data/surroundings/81.json.gz']);
 assert.deepEqual(JSON.parse(JSON.stringify(result.scenarios.map(s=>[s.id,s.rainfallInches,s.rainfallDurationHours,s.seaLevelRiseInches]))),[['current_moderate',2.13,1,0],['2050_moderate',2.13,1,30]]);
 assert.equal(result.planningWindow,planningContext.planningWindow);assert.equal(result.citations.length,2);
 assert.ok(result.nextChecks[0].buildingIds.includes('109855'));assert.ok(!result.nextChecks[0].buildingIds.includes('819422'));
 for(const c of result.citations){assert.equal(c.scope,'outside_building_outline');assert.match(c.source.geometrySha256,/^[0-9a-f]{64}$/);}
 assert.match(result.method,/voids/);assert.match(result.method,/Rounded zero distance/);assert.match(result.scopeNote,/No intermediate year/);
 assert.ok(JSON.stringify(result).length<18000);
});
test('the compiled digest index exactly matches every deployed manifest entry',()=>{
 const manifestBytes=readFileSync(new URL('../public/data/surroundings/manifest.json',import.meta.url));const manifest=JSON.parse(manifestBytes.toString());
 assert.equal(index.manifest_sha256,createHash('sha256').update(manifestBytes).digest('hex'));
 assert.equal(Object.keys(index.files).length,manifest.files.length);
 for(const file of manifest.files)for(const key of ['bytes','sha256','compressed_bytes','compressed_sha256'])assert.equal(index.files[file.key][key],file[key]);
});
test('geometry and edited revision each independently reject stale measurements',async()=>{
 const api=harness();const edited={...building(),footprint_edited_at:'2026-10-31T00:00:00Z'};
 const moved=structuredClone(building());moved.geometry.coordinates[0][0][0][0]+=.00001;
 for(const b of [edited,moved]){const r=await api.inspectSurroundingGround([b],{fetchAsset:actual});assert.equal(r.sites[0].status,'stale');assert.equal(r.citations.length,0);assert.equal(r.sites[0].bands,undefined);}
 assert.equal(await api.groundGeometryHash(building().geometry),sample.records['109855'][0]);
 const equivalent={...building(),footprint_edited_at:new Date(building().footprint_edited_at!).toISOString()};assert.equal((await api.inspectSurroundingGround([equivalent],{fetchAsset:actual})).status,'available');
});
test('only 1–2 distinct native ids are accepted, with parcel/placeholder/unknown handling',async()=>{
 let calls=0;const fetchAsset=async()=>{calls++;throw Error('Should not fetch');},api=harness();
 for(const rows of [[],[building(),building()],[building(),building('819422'),{...building(),id:'11'}],[{...building(),id:'p:3004880006'}],[{...building(),id:'https://example.com'}]])await assert.rejects(api.inspectSurroundingGround(rows,{fetchAsset}),{code:'GROUND_INVALID_INPUT'});
 for(const b of [{...building(),entity_type:'parcel' as const},{...building(),feature_code:1003},{...building(),geometry_quality:'invalid_or_placeholder' as const}])assert.equal((await api.inspectSurroundingGround([b],{fetchAsset})).sites[0].status,'unsupported');
 assert.equal((await api.inspectSurroundingGround([{...building(),id:'9999999999'}],{fetchAsset})).status,'unavailable');assert.equal(calls,0);
});
test('two sites from one shard share one bounded source read; a missing row is unknown',async()=>{
 let calls=0;const result=await harness().inspectSurroundingGround([building(),{...building(),id:'109856'}],{fetchAsset:async(path)=>{calls++;return actual(path);}});
 assert.equal(calls,1);assert.equal(result.sites[0].status,'available');assert.equal(result.sites[1].status,'stale');assert.equal(result.status,'partial');
 const missing=pinnedSample(data=>delete data.records['109855']);const r=await harness({index:missing.index}).inspectSurroundingGround([building()],{fetchAsset:async()=>new Response(missing.compressed,{headers:{'content-type':'application/gzip'}})});
 assert.equal(r.status,'unavailable');assert.equal(r.sites[0].nearestM,undefined);
});
test('tampered compressed bytes and tampered decoded JSON fail their distinct pinned hashes',async()=>{
 const payload=pinnedSample(),api=harness({index:payload.index});
 const corrupted=Buffer.from(payload.compressed);corrupted[20]^=1;
 for(const response of [new Response(corrupted,{headers:{'content-type':'application/gzip'}}),new Response(payload.decoded.toString().replace('109855','109856'),{headers:{'content-type':'application/json'}}),new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}})]){
  const r=await api.inspectSurroundingGround([building()],{fetchAsset:async()=>response});assert.equal(r.status,'unavailable');assert.equal(r.citations.length,0);
 }
});
test('already-decoded gzip is accepted only when its exact decoded identity matches',async()=>{
 const payload=pinnedSample();
 const variants:HeadersInit[]=[{'content-type':'application/json'},{'content-type':'application/gzip','content-encoding':'gzip'}];
 for(const headers of variants)assert.equal((await harness({index:payload.index}).inspectSurroundingGround([building()],{fetchAsset:async()=>new Response(payload.decoded,{headers})})).status,'available');
 assert.equal((await harness({index:payload.index,decompress:null}).inspectSurroundingGround([building()],{fetchAsset:async()=>new Response(payload.compressed)})).status,'unavailable');
});
test('pinned malformed measurements and missing ancillary masks never become zero observations',async()=>{
 for(const change of [(d:any)=>d.records['109855'][3][0]=-1,(d:any)=>d.records['109855'][5]=null,(d:any)=>d.records['109855'][4]={'9':[1,2,3]},(d:any)=>d.snapshot_id='different-snapshot']){
  const p=pinnedSample(change);const r=await harness({index:p.index}).inspectSurroundingGround([building()],{fetchAsset:async()=>new Response(p.compressed)});
  assert.equal(r.status,'unavailable');assert.equal(r.sites[0].bands,undefined);assert.equal(r.nextChecks.length,0);
 }
});
test('source failure stays partial and retries are explicit new invocations',async()=>{
 let calls=0;const api=harness(),fetchAsset=async(path:string)=>{calls++;return path.includes('/81.')?new Response('unavailable',{status:503}):actual(path);};
 const r=await api.inspectSurroundingGround([building(),building('819422')],{fetchAsset});assert.equal(r.status,'partial');assert.equal(r.citations.length,1);assert.equal(r.sites[1].nearestM,undefined);assert.equal(calls,2);
 await api.inspectSurroundingGround([building('819422')],{fetchAsset});assert.equal(calls,3);
});
test('separate high-tide and exclusion/water layers remain separate from rainfall classes',async()=>{
 const p=pinnedSample(d=>{d.records['109855'][3]=[10,20,30,40,0];d.records['109855'][4]={'4':[2,3,4],'5':[1,0,0],'7':[0,1,0]};d.records['109855'][5]=[1,0,2];d.records['109855'][6]=16;});
 const r=await harness({index:p.index}).inspectSurroundingGround([building()],{fetchAsset:async()=>new Response(p.compressed)});
 assert.equal(r.sites[0].nearestM?.future_high_tide,0);assert.equal(r.sites[0].nearestM?.future_deep,40);assert.equal(r.sites[0].bands?.[0].areasM2.future_deep,0);assert.equal(r.sites[0].bands?.[0].areasM2.future_high_tide,2);
 assert.ok(r.nextChecks.some(c=>c.id==='verify_model_coverage'));assert.equal(r.sites[0].footprintMasksM2?.futureWater,2);
});
test('parent cancellation interrupts stalled headers and body; pre-abort starts no request',async()=>{
 const api=harness();let calls=0;const pre=new AbortController();pre.abort();await assert.rejects(api.inspectSurroundingGround([building()],{signal:pre.signal,fetchAsset:async()=>{calls++;return actual('/data/surroundings/10.json.gz');}}),{code:'GROUND_CANCELLED'});assert.equal(calls,0);
 for(const body of [false,true]){
  const c=new AbortController();let cancelled=false;
  const request=api.inspectSurroundingGround([building()],{signal:c.signal,fetchAsset:async()=>{calls++;return body?new Response(new ReadableStream({cancel(){cancelled=true;}})):new Promise<Response>(()=>{});}});
  setTimeout(()=>c.abort(),15);await assert.rejects(request,{code:'GROUND_CANCELLED'});if(body)assert.equal(cancelled,true);
 }
});
test('the overall deadline returns unavailable even if the asset binding ignores abort',async()=>{
 const api=harness({timeout:20}),start=Date.now();const r=await api.inspectSurroundingGround([building()],{fetchAsset:()=>new Promise<Response>(()=>{})});
 assert.equal(r.status,'unavailable');assert.equal(r.citations.length,0);assert.ok(Date.now()-start<1000);
});

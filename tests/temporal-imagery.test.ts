import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding} from '../lib/city';
import type {TemporalImagery} from '../lib/temporal-imagery';
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
const actual=demo.buildings.find((v:CityBuilding)=>v.id==='109855') as CityBuilding;
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function jpeg(width=768,height=768){return Uint8Array.from([255,216,255,224,0,4,0,0,255,192,0,17,8,height>>8,height&255,width>>8,width&255,3,1,17,0,2,17,0,3,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);}
function load(fetcher:(url:string,init?:RequestInit)=>Promise<Response>=async()=>new Response(jpeg(),{headers:{'Content-Type':'image/jpeg'}})){
 const calls:Array<{url:string;init?:RequestInit}>=[],cache:Record<string,any>={};
 const get=(name:string):any=>{
  if(cache[name])return cache[name];const module={exports:{}};
  const source=readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new vm.Script(compiled).runInNewContext({module,exports:module.exports,require:(name:string)=>get(name.slice(2)),URL,Date,Response,Uint8Array,ArrayBuffer,AbortController,crypto:webcrypto,btoa,setTimeout,clearTimeout,fetch:async(url:string,init?:RequestInit)=>{calls.push({url,init});return fetcher(url,init);}});return cache[name]=module.exports;
 };
 return{...(get('temporal-imagery') as typeof import('../lib/temporal-imagery')),...(get('temporal-pair') as typeof import('../lib/temporal-pair')),calls};
}
test('both fixed vintages use one genuine full-footprint crop and original-byte hashes',async()=>{
 const api:ReturnType<typeof load>=load(),pair=await api.fetchTemporalImagery(actual);api.validateTemporalPair(pair);
 assert.equal(api.calls.length,2);assert.deepEqual(clone(pair.images.map(x=>x.source.captureYear)),[2020,2024]);
 const urls=api.calls.map(c=>new URL(c.url));assert.equal(urls[0].search,urls[1].search);assert.equal(pair.target.id,'109855');
 for(const[i,call]of api.calls.entries()){
  assert.equal(urls[i].hostname,'orthos.its.ny.gov');assert.equal(urls[i].pathname,`/arcgis/rest/services/wms/${i===0?2020:2024}/MapServer/export`);assert.equal(call.init?.redirect,'manual');assert.equal(call.init?.credentials,'omit');
  assert.equal(pair.images[i].source.imageSha256,createHash('sha256').update(jpeg()).digest('hex'));
 }
 assert.equal(pair.alignment.pixelRegistrationVerified,false);assert.match(pair.limitations.join(' '),/not verified physical changes/);
});
test('invalid building and already cancelled request make no source calls',async()=>{
 const api:ReturnType<typeof load>=load();await assert.rejects(api.fetchTemporalImagery({...actual,entity_type:'parcel'}));const c=new AbortController();c.abort();await assert.rejects(api.fetchTemporalImagery(actual,c.signal),/cancelled/);assert.equal(api.calls.length,0);
});
test('partial failure rejects the pair, aborts outstanding source read, and does not expose upstream response',async()=>{
 let aborted=false;const api=load(async(url,init)=>{
  if(url.includes('/2020/'))return new Response('private upstream diagnostics',{status:503});
  return new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));});});
 });
 await assert.rejects(api.fetchTemporalImagery(actual),(e:Error)=>/2020/.test(e.message)&&!e.message.includes('private'));assert.equal(aborted,true);
});
test('manual redirect, unexpected MIME, wrong dimensions and oversize source are rejected',async()=>{
 const variants=[()=>new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/'}}),()=>new Response('{}',{headers:{'Content-Type':'application/json'}}),()=>new Response(jpeg(512),{headers:{'Content-Type':'image/jpeg'}}),()=>new Response(jpeg(),{headers:{'Content-Type':'image/jpeg','Content-Length':'2000001'}})];
 for(const fn of variants){const api=load(async()=>fn());await assert.rejects(api.fetchTemporalImagery(actual));assert.equal(api.calls.length,2);}
});
test('client pair validation rejects source substitution, fake registration, shifted bounds and invalid target paths',async()=>{
 const api:ReturnType<typeof load>=load(),pair=await api.fetchTemporalImagery(actual);
 const bad:Array<(p:TemporalImagery)=>void>=[p=>{p.images[0].source.captureYear=2024;},p=>{p.images[0].source.url='https://untrusted.invalid';},p=>{p.images[0].source.imageSha256='bad';},p=>{p.images[0].image.dataUrl='https://untrusted.invalid/image';},p=>{p.images[0].source.exportUrl=p.images[0].source.exportUrl.replace('768%2C768','512%2C512');},p=>{p.bounds.webMercator[0]+=1;},p=>{p.bounds.wgs84[0]+=1;},p=>{p.bounds.approximateGroundWidthM=1000;p.bounds.approximateGroundPixelSizeM=1000/768;},p=>{(p.alignment as any).pixelRegistrationVerified=true;},p=>{p.target.address=({html:'bad'} as any);},p=>{p.target.id='0';},p=>{p.target.footprintPixels[0][0][0][0]=Infinity;},p=>{p.target.footprintPixels[0][0].pop();},p=>{(p.limitations as any)=[{}];}];
 for(const alter of bad){const copy=clone(pair);alter(copy);assert.throws(()=>api.validateTemporalPair(copy));}
});
test('later user cancellation terminates both source reads and returns no pair',async()=>{
 const c=new AbortController();let aborts=0;
 const api=load(async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>{aborts++;reject(Error('aborted'));})));
 const pending=api.fetchTemporalImagery(actual,c.signal);c.abort();await assert.rejects(pending,/cancelled/);assert.equal(aborts,2);
});
test('cancellation releases a stalled response body instead of waiting indefinitely for another chunk',async()=>{
 const controller=new AbortController();let cancelled=0;
 const api=load(async()=>new Response(new ReadableStream<Uint8Array>({start(c){c.enqueue(jpeg());},cancel(){cancelled++;}}),{headers:{'Content-Type':'image/jpeg'}}));
 const pending=api.fetchTemporalImagery(actual,controller.signal);await new Promise(r=>setTimeout(r,5));controller.abort();await assert.rejects(pending,/cancelled/);assert.equal(cancelled,2);
});

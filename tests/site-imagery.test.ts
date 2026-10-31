import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding} from '../lib/city';

const source=readFileSync(new URL('../lib/site-imagery.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
const actual=demo.buildings.find((b:CityBuilding)=>b.id==='109855') as CityBuilding;
assert.ok(actual);
type Fetcher=(input:string,init?:RequestInit)=>Promise<Response>;
function load(fetcher:Fetcher=async()=>{throw Error('Unexpected network request');},timers:Record<string,unknown>={}){
 const module={exports:{} as typeof import('../lib/site-imagery')},requests:Array<{url:string;init?:RequestInit}>=[];
 new vm.Script(compiled).runInNewContext({module,exports:module.exports,require:()=>{throw Error('No runtime dependencies expected');},URL,Date,Response,Uint8Array,ArrayBuffer,AbortController,crypto:webcrypto,btoa,setTimeout,clearTimeout,...timers,fetch:async(input:string,init?:RequestInit)=>{requests.push({url:String(input),init});return fetcher(String(input),init);}});
 return{...module.exports,requests};
}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
// A minimal encoded-header fixture exercises byte/dimension validation. It is
// deliberately not an aerial photograph or a claim of decoded-image quality.
function jpeg(width=768,height=768){return Uint8Array.from([0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc0,0,17,8,height>>8,height&255,width>>8,width&255,3,1,0x11,0,2,0x11,0,3,0x11,0,0xff,0xda,0,8,1,1,0,0,63,0,0,0xff,0xd9]);}
function response(bytes=jpeg(),headers:Record<string,string>={}){return new Response(bytes,{headers:{'Content-Type':'image/jpeg',...headers}});}
function fixture(geometry:CityBuilding['geometry']):CityBuilding{return{...actual,geometry};}

test('the real Smith footprint produces a bounded fixed-source north-up crop, independent of source URL and reference point',()=>{
 const api=load(),input={...actual,source:'https://attacker.invalid/image',latitude:0,longitude:0};
 const plan=api.planSiteImagery(input),url=new URL(plan.url),bounds=plan.bounds.webMercator;
 assert.equal(url.origin,'https://orthos.its.ny.gov');assert.equal(url.pathname,'/arcgis/rest/services/wms/2024/MapServer/export');
 assert.equal(url.searchParams.get('size'),'768,768');assert.equal(url.searchParams.get('bboxSR'),'3857');assert.equal(url.searchParams.get('imageSR'),'3857');assert.equal(url.searchParams.get('format'),'jpg');assert.equal(url.searchParams.get('f'),'image');
 assert.ok(Math.abs((bounds[2]-bounds[0])-(bounds[3]-bounds[1]))<.00001);
 assert.equal(plan.bounds.approximateGroundWidthM,200);assert.equal(plan.bounds.approximateGroundPixelSizeM,.260417);
 assert.ok(plan.bounds.wgs84[0]<actual.longitude&&plan.bounds.wgs84[2]>actual.longitude);assert.ok(plan.bounds.wgs84[1]<actual.latitude&&plan.bounds.wgs84[3]>actual.latitude);
 assert.equal(plan.target.id,'109855');assert.equal(plan.target.footprintSource,'https://data.cityofnewyork.us/d/5zhs-2jue');
 for(const polygon of plan.target.footprintPixels)for(const ring of polygon)for(const[x,y]of ring)assert.ok(x>0&&x<768&&y>0&&y<768);
 assert.equal(api.requests.length,0);assert.ok(!JSON.stringify(plan).includes('attacker.invalid'));
});

test('multipolygons, closed rings and holes retain their positions and north-up pixel orientation',()=>{
 const outer=[[-74,40.7],[-73.9995,40.7],[-73.9995,40.7005],[-74,40.7005],[-74,40.7]];
 const hole=[[-73.9999,40.7001],[-73.9999,40.7002],[-73.9998,40.7002],[-73.9998,40.7001],[-73.9999,40.7001]];
 const second=outer.map(([x,y])=>[x+.0007,y]);
 const out=load().planSiteImagery(fixture({type:'MultiPolygon',coordinates:[[outer,hole],[second]]}));
 assert.equal(out.target.footprintPixels.length,2);assert.equal(out.target.footprintPixels[0].length,2);
 const ring=out.target.footprintPixels[0][0];assert.deepEqual(clone(ring[0]),clone(ring.at(-1)));assert.ok(ring[1][0]>ring[0][0]);assert.ok(ring[2][1]<ring[1][1]);assert.ok(out.target.footprintPixels[1][0][0][0]>ring[0][0]);
});

test('large but supported footprints remain fully inside the crop with a physical edge margin',()=>{
 const ring=[[-74,40.7],[-73.996,40.7],[-73.996,40.702],[-74,40.702],[-74,40.7]];
 const plan=load().planSiteImagery(fixture({type:'Polygon',coordinates:[ring]}));
 assert.ok(plan.bounds.approximateGroundWidthM>390&&plan.bounds.approximateGroundWidthM<400);
 const px=plan.target.footprintPixels.flat(2).map(p=>p[0]);assert.ok(Math.min(...px)>50&&Math.max(...px)<718);
});

test('parcels, placeholders, non-NYC or malformed geometry fail before any request',async()=>{
 const variants:CityBuilding[]=[
  {...actual,id:'p:3004880006',entity_type:'parcel'}, {...actual,entity_type:'parcel'}, {...actual,feature_code:1003}, {...actual,geometry_quality:'invalid_or_placeholder'}, {...actual,id:'1;fetch()'},
  fixture({type:'Point',coordinates:[-74,40.7]}),fixture({type:'Polygon',coordinates:[]}),fixture({type:'Polygon',coordinates:[[[-74,40.7],[-73.99,40.7],[-73.99,40.71]]]}),
  fixture({type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}),fixture({type:'Polygon',coordinates:[[[-74,40.7],[-73.99,40.7],[NaN,40.71],[-74,40.7]]]}),
  fixture({type:'Polygon',coordinates:[[[-74,40.7],[-73.99,40.7],[-73.98,40.7],[-74,40.7]]]}),
 ];
 const api=load();for(const building of variants)await assert.rejects(api.fetchSiteImagery(building),(error:{code?:string})=>error.code==='INVALID_SITE');assert.equal(api.requests.length,0);
});

test('oversized geometry is rejected rather than silently clipping or degrading to a reference point',()=>{
 const api=load();assert.throws(()=>api.planSiteImagery(fixture({type:'Polygon',coordinates:[[[-74,40.7],[-73.98,40.7],[-73.98,40.71],[-74,40.71],[-74,40.7]]]})),(error:{code?:string})=>error.code==='CROP_TOO_LARGE');
 const ring=Array.from({length:50001},()=>[-74,40.7]);assert.throws(()=>api.planSiteImagery(fixture({type:'Polygon',coordinates:[ring]})),(error:{code?:string})=>error.code==='INVALID_SITE');assert.equal(api.requests.length,0);
});

test('one public request preserves identical bytes, dimensions, provenance and capture limitations',async()=>{
 const bytes=jpeg(),api=load(async()=>response(bytes)),out=await api.fetchSiteImagery(actual);
 assert.equal(api.requests.length,1);const request=api.requests[0];assert.equal(request.init?.credentials,'omit');assert.equal(request.init?.redirect,'manual');assert.equal(request.init?.cache,'no-store');assert.deepEqual(clone(request.init?.headers),{Accept:'image/jpeg'});assert.equal(request.init?.method,'GET');
 assert.equal(out.image.width,768);assert.equal(out.image.height,768);assert.deepEqual(Buffer.from(out.image.dataUrl.split(',')[1],'base64'),Buffer.from(bytes));assert.equal(out.source.imageSha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(out.source.captureYear,2024);assert.equal(out.source.capturePeriod,'Spring 2024');assert.equal(out.source.publishedServiceResolutionM,.3048);assert.equal(out.source.metadataUrl,'https://gis.ny.gov/2024-orthoimagery');assert.equal(out.source.exportUrl,request.url);assert.ok(Number.isFinite(Date.parse(out.source.retrievedAt)));
 assert.ok(!('capturedBetween' in out.source));assert.match(out.limitations.join(' '),/not a live view/);assert.match(out.limitations.join(' '),/leaf-on/);assert.match(out.limitations.join(' '),/different source vintages/);assert.match(out.limitations.join(' '),/cannot establish roof material/);
});

test('wrong dimensions, content type, malformed bytes and source errors do not return an image',async()=>{
 const cases=[()=>response(jpeg(512,768)),()=>response(jpeg(),{'Content-Type':'application/json'}),()=>response(Uint8Array.from([1,2,3])),()=>response(jpeg().slice(0,-2)),()=>new Response('upstream secret text',{status:503})];
 for(const make of cases){const api=load(async()=>make());await assert.rejects(api.fetchSiteImagery(actual),(error:Error)=>{assert.ok(!error.message.includes('upstream secret'));return true;});assert.equal(api.requests.length,1);}
});

test('both declared and streamed oversized image bodies fail at the byte bound',async()=>{
 const declared=load(async()=>response(jpeg(),{'Content-Length':'2000001'}));await assert.rejects(declared.fetchSiteImagery(actual),(error:{code?:string})=>error.code==='IMAGE_TOO_LARGE');
 let cancelled=false;
 const streamed=load(async()=>new Response(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(1_500_000));controller.enqueue(new Uint8Array(600_000));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'image/jpeg'}}));
 await assert.rejects(streamed.fetchSiteImagery(actual),(error:{code?:string})=>error.code==='IMAGE_TOO_LARGE');assert.equal(cancelled,true);
});

test('network and redirect failures are bounded public errors without upstream text',async()=>{
 const api=load(async()=>{throw Error('redirect to https://secret.invalid/private');});await assert.rejects(api.fetchSiteImagery(actual),(error:Error&{code?:string})=>error.code==='IMAGE_UNAVAILABLE'&&!error.message.includes('secret.invalid'));assert.equal(api.requests.length,1);
 const redirect=load(async()=>new Response(null,{status:302,headers:{Location:'https://attacker.invalid/image'}}));await assert.rejects(redirect.fetchSiteImagery(actual),(error:{code?:string})=>error.code==='IMAGE_UNAVAILABLE');assert.equal(redirect.requests.length,1);assert.equal(new URL(redirect.requests[0].url).hostname,'orthos.its.ny.gov');
});

test('the source deadline aborts the request and reports timeout rather than an analyzed image',async()=>{
 let callback:(()=>void)|undefined;
 const api=load(async(_url,init)=>{const pending=new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('aborted'))));callback?.();return pending;},{setTimeout:(fn:()=>void)=>{callback=fn;return 1;},clearTimeout:()=>{}});
 await assert.rejects(api.fetchSiteImagery(actual),(error:{code?:string})=>error.code==='IMAGE_TIMEOUT');assert.equal(api.requests[0].init?.signal?.aborted,true);
});

test('the actual Worker runtime accepts the fetch options and rejects redirects without following them',async()=>{
 const {Miniflare,Response:RuntimeResponse}=await import('miniflare');
 const workerSource=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^export /gm,'');
 const worker=workerSource+`\nexport default {async fetch(){try{const result=await fetchSiteImagery(${JSON.stringify(actual)});return Response.json({ok:true,width:result.image.width,height:result.image.height,sha256:result.source.imageSha256});}catch(error){return Response.json({ok:false,code:error.code});}}};`;
 const urls:string[]=[];let mode:'image'|'redirect'='image';
 const runtime=new Miniflare({modules:true,script:worker,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],outboundService:async(request)=>{
  urls.push(request.url);
  assert.equal(new URL(request.url).hostname,'orthos.its.ny.gov');assert.equal(request.headers.get('authorization'),null);
  return mode==='image'?new RuntimeResponse(jpeg(),{headers:{'Content-Type':'image/jpeg'}}):new RuntimeResponse(null,{status:302,headers:{Location:'https://attacker.invalid/not-followed'}});
 }});
 try{
  const success=await(await runtime.dispatchFetch('https://local.test/')).json() as {ok:boolean;width:number;height:number;sha256:string};
  assert.equal(success.ok,true);assert.equal(success.width,768);assert.equal(success.height,768);assert.equal(success.sha256,createHash('sha256').update(jpeg()).digest('hex'));
  mode='redirect';const redirected=await(await runtime.dispatchFetch('https://local.test/')).json() as {ok:boolean;code:string};assert.equal(redirected.ok,false);assert.equal(redirected.code,'IMAGE_UNAVAILABLE');assert.equal(urls.length,2);
 }finally{await runtime.dispose();}
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding,CityQuery} from '../lib/city';
import type {Preferences} from '../lib/city-screening';
import type {SiteContext} from '../lib/site-context';

type CityModule=typeof import('../lib/city');
type ScreeningModule=typeof import('../lib/city-screening');
type Fetcher=(url:URL,init?:RequestInit)=>Promise<Response>;
function load<T>(relative:string,imports:Record<string,unknown>={},fetcher:Fetcher=async(url,init)=>fetch(url,init)):T{
 const source=readFileSync(new URL(relative,import.meta.url),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 const context=vm.createContext({module,exports:module.exports,URL,URLSearchParams,Request,Response,AbortSignal,AbortController,setTimeout,clearTimeout,window:{},fetch:fetcher,require:(id:string)=>{if(id in imports)return imports[id];throw Error('Unexpected import '+id)}});
 new vm.Script(output,{filename:relative}).runInContext(context);
 return module.exports as T;
}
function city(fetcher?:Fetcher){return load<CityModule>('../lib/city.ts',{'./public-fetch':load('../lib/public-fetch.ts',{},fetcher),'./city-quality.json':JSON.parse(readFileSync(new URL('../lib/city-quality.json',import.meta.url),'utf8'))},fetcher)}
function screening(){return load<ScreeningModule>('../lib/city-screening.ts')}
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const rectangle={type:'Polygon',coordinates:[[[-74.0,40.7],[-73.999,40.7],[-73.999,40.701],[-74.0,40.701],[-74.0,40.7]]]};
function parcel(index=1,extra:Record<string,unknown>={}){return{bbl:String(1000000000+index)+'.00000000',address:`${index} TEST STREET`,borough:'MN',latitude:'40.7005',longitude:'-73.9995',bldgarea:'50000',lotarea:'10000',zonedist1:'M1-1',version:'26v2',...extra}}
function footprint(id=1,bbl='1000000001',extra:Record<string,unknown>={}){return{doitt_id:String(id),bin:String(1000000+id),base_bbl:bbl,mappluto_bbl:bbl,the_geom:rectangle,feature_code:'2100',height_roof:'0',construction_year:'0',ground_elevation:'0',...extra}}
function candidate(id:string,extra:Partial<CityBuilding>={}):CityBuilding{return{...city().combineBuilding(footprint(1),parcel(),'mappluto_bbl'),id,footprint_area_sqft:10000,...extra}}
function context(id:string,distance:number|null,hvi=3):SiteContext{
 const unavailable={status:'unavailable' as const,value:null,source:'synthetic-test',note:'test'};
 return{id,point:[-74,40.7],retrieved_at:'2026-10-27',heat:{status:'available',value:{hvi},source:'synthetic-test',note:'test'},truck:distance===null?unavailable:{status:'available',value:{distance_m:distance},source:'synthetic-test',note:'test'},future_flood:unavailable,evacuation:unavailable,stormwater:unavailable};
}

test('representative points stay inside concave polygons, outside holes, and within one multipart component',()=>{
 const api=city();
 const u={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4],[0,0]]]};
 const [x,y]=api.geomPoint(u);
 assert.ok(x>0&&x<4&&y>0&&y<4);
 assert.ok(x<1||x>3||y<1,'the point must not fall in the concave gap');
 const donut={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[2,2],[2,8],[8,8],[8,2],[2,2]]]};
 const [hx,hy]=api.geomPoint(donut);
 assert.ok(hx>0&&hx<10&&hy>0&&hy<10);
 assert.ok(hx<2||hx>8||hy<2||hy>8,'the point must not fall in the hole');
 const parts={type:'MultiPolygon',coordinates:[[[[0,0],[1,0],[1,1],[0,1],[0,0]]],[[[10,10],[15,10],[15,15],[10,15],[10,10]]]]};
 const [mx,my]=api.geomPoint(parts);
 assert.ok(mx>10&&mx<15&&my>10&&my<15,'largest polygon component is used, never the gap between islands');
 assert.deepEqual(plain(api.geomPoint({type:'Point',coordinates:[-74,40.7,9]})),[-74,40.7]);
 assert.ok(api.geomPoint({type:'Polygon',coordinates:[]}).every(Number.isNaN));
});

test('known bad and placeholder geometries have no area; lot area never becomes footprint area',()=>{
 const api=city();
 const b=api.combineBuilding(footprint(),parcel(),'mappluto_bbl');
 assert.equal(b.lot_building_area_sqft,50000);
 assert.ok(b.footprint_area_sqft!>0);
 assert.notEqual(b.footprint_area_sqft,b.lot_building_area_sqft);
 assert.equal(b.roof_height_ft,null);
 assert.equal(b.construction_year,null);
 assert.equal(b.ground_elevation_ft,0,'zero elevation can be real');
 assert.equal(b.flood_2007,null);
 assert.equal(b.flood_2015,null);
 assert.equal(b.feature_code,2100);
 assert.equal(b.record_type,'Building');
 assert.equal(api.combineBuilding(footprint(4,undefined,{feature_code:'5110'}),parcel(),'mappluto_bbl').record_type,'Garage');
 assert.equal(api.combineBuilding(footprint(4,undefined,{feature_code:'5100'}),parcel(),'mappluto_bbl').record_type,'Building Under Construction');
 const unknown=api.combineBuilding(footprint(4,undefined,{feature_code:'9999'}),parcel(),'mappluto_bbl');
 assert.equal(unknown.record_type,'Other');
 assert.equal(unknown.feature_code,9999,'preserve unknown future source codes');
 assert.equal(api.combineBuilding(footprint(160828),parcel(),'mappluto_bbl').footprint_area_sqft,null);
 assert.equal(api.combineBuilding(footprint(9999999,undefined,{feature_code:'1003'}),parcel(),'mappluto_bbl').footprint_area_sqft,null);
});

test('ranking withholds incomplete or mixed-unit results and computes a genuine Pareto frontier',()=>{
 const api=screening();
 const buildings=[candidate('a',{footprint_area_sqft:10000}),candidate('b',{footprint_area_sqft:20000}),candidate('c',{footprint_area_sqft:5000}),candidate('missing',{footprint_area_sqft:null})];
 const contexts={a:context('a',100),b:context('b',200),c:context('c',300),missing:context('missing',0)};
 const rows=api.screen(buildings,contexts,{size:1,truck:1,heat:0});
 assert.equal(rows.find(r=>r.building.id==='missing')?.score,null);
 assert.deepEqual(rows.filter(r=>r.pareto).map(r=>r.building.id).sort(),['a','b']);
 const mixed=api.screen([buildings[0],candidate('lot',{entity_type:'parcel',lot_area_sqft:20000})],{...contexts,lot:context('lot',0)},{size:1,truck:1,heat:0});
 assert.ok(mixed.every(r=>r.score===null&&r.pareto===false));
 const invalid=api.screen([candidate('bad')],{bad:context('bad',-5)},{size:1,truck:1,heat:0});
 assert.equal(invalid[0].score,null,'invalid distance must not improve the score');
 assert.equal(invalid[0].coverage,.5);
});

test('HVI is context only and sensitivity does not repeat a disabled heat or weight dimension',()=>{
 const api=screening();const buildings=[candidate('a'),candidate('b')];
 const contexts={a:context('a',100,1),b:context('b',100,5)};
 const rows=api.screen(buildings,contexts,{size:1,truck:1,heat:1} as unknown as Preferences);
 assert.equal(rows[0].score,rows[1].score,'a runtime heat weight cannot promote neighborhood HVI into a building score');
 const both=api.sensitivity(buildings,contexts,{size:1,truck:1,heat:0});
 assert.equal(both.scenarios,12);
 assert.equal(both.top_counts.a,12);
 assert.equal(both.top_counts.b,12,'ties are counted for each candidate');
 assert.equal(api.sensitivity(buildings,contexts,{size:1,truck:0,heat:0}).scenarios,3);
 assert.equal(api.sensitivity(buildings,contexts,{size:0,truck:1,heat:0}).scenarios,3);
 assert.equal(api.sensitivity(buildings,contexts,{size:0,truck:0,heat:0}).scenarios,0);
});

test('validation applies to HTTP inputs and direct tool callers before any SODA fetch',async()=>{
 let requests=0;const api=city(async()=>{requests++;throw Error('unexpected fetch')});
 for(const query of ['unit=invalid','limit=301','cursor=-1','zoning=M%27+OR+1%3D1','bbox=-74,40.8,-73.9,40.7'])assert.throws(()=>api.validateQuery(new URLSearchParams(query)));
 await assert.rejects(api.queryCity({zoning:"M' OR 1=1"}));
 assert.equal(requests,0);
 assert.equal(api.textLiteral("O'BRIEN"),"'O''BRIEN'");
});

test('building keyset pagination retains distinct footprints that share a tax lot',async()=>{
 const all=[footprint(1),footprint(2),footprint(3)];const requests:URL[]=[];
 const api=city(async u=>{
  requests.push(u);
  if(u.pathname.includes('64uk-42ks'))return Response.json([parcel()]);
  const cursor=Number(u.searchParams.get('$where')?.match(/doitt_id>(\d+)/)?.[1]||0);
  return Response.json(all.filter(f=>Number(f.doitt_id)>cursor).slice(0,Number(u.searchParams.get('$limit'))));
 });
 const first=await api.queryCity({unit:'building',limit:2});
 assert.deepEqual(plain(first.buildings.map(b=>b.id)),['1','2']);
 assert.equal(first.next_cursor,2);
 const second=await api.queryCity({unit:'building',limit:2,cursor:first.next_cursor!});
 assert.deepEqual(plain(second.buildings.map(b=>b.id)),['3']);
 assert.equal(second.next_cursor,null);
 assert.equal(second.has_more,false);
 assert.ok(requests.some(u=>u.searchParams.get('$where')?.includes('doitt_id>2')));
 assert.ok(first.buildings.every(b=>b.bbl==='1000000001'));
});

test('parcel pages honor the requested limit and preserve parcels with absent coordinates',async()=>{
 const all=Array.from({length:5},(_,i)=>parcel(i+1,i===0?{latitude:null,longitude:null}:{}));
 const api=city(async u=>{
  assert.ok(u.pathname.includes('64uk-42ks'));
  if(u.searchParams.get('$select')?.startsWith('count'))return Response.json([{count:'5'}]);
  const offset=Number(u.searchParams.get('$offset'));return Response.json(all.slice(offset,offset+Number(u.searchParams.get('$limit'))));
 });
 const first=await api.queryCity({unit:'parcel',limit:2});
 assert.equal(first.buildings.length,2);
 assert.equal(first.next_page,1);
 assert.equal(first.buildings[0].id,'p:1000000001');
 assert.equal(first.buildings[0].feature_code,null);
 assert.equal(first.buildings[0].record_type,'Tax lot');
 assert.equal(first.buildings[0].entity_type,'parcel');
 assert.equal(Number.isFinite(first.buildings[0].latitude),false);
 const second=await api.queryCity({unit:'parcel',limit:2,page:1});
 assert.deepEqual(plain(second.buildings.map(b=>b.id)),['p:1000000003','p:1000000004']);
 const last=await api.queryCity({unit:'parcel',limit:2,page:2});
 assert.equal(last.buildings.length,1);
 assert.equal(last.has_more,false);
});

test('BIN search resolves canonical parcels even in parcel mode or with area filters',async()=>{
 for(const unit of ['parcel','building'] as const){
  const requests:URL[]=[];
  const api=city(async u=>{
   requests.push(u);
   if(u.pathname.includes('5zhs-2jue'))return Response.json([footprint(1)]);
   if(u.searchParams.get('$select')?.startsWith('count'))return Response.json([{count:'1'}]);
   return Response.json([parcel()]);
  });
  const result=await api.queryCity({unit,q:'1000001',minArea:10000,limit:2});
  assert.equal(result.buildings.length,1);
  assert.equal(result.buildings[0].bbl,'1000000001');
  assert.ok(!requests.some(u=>u.searchParams.get('$where')?.includes('upper(address)')));
  assert.ok(requests.some(u=>u.searchParams.get('$where')?.includes('bldgarea>=10000')));
  if(unit==='building')assert.ok(requests.filter(u=>u.pathname.includes('5zhs-2jue')).every(u=>u.searchParams.get('$where')?.includes('bin=1000001')));
 }
});

test('a base-lot match cannot leak a different canonical billing lot past parcel filters',async()=>{
 const api=city(async u=>{
  if(u.pathname.includes('5zhs-2jue'))return Response.json([footprint(1,'1000000001',{mappluto_bbl:'1000000002'})]);
  if(u.searchParams.get('$select')?.startsWith('count'))return Response.json([{count:'1'}]);
  return Response.json(u.searchParams.get('$where')==='bbl in (1000000002)'?[parcel(2,{address:'UNRELATED LOT'})]:[parcel()]);
 });
 const result=await api.queryCity({q:'TEST',minArea:50000});
 assert.equal(result.matched_parcels,1);
 assert.equal(result.buildings.length,0);
});

test('PLUTO-first building search finishes the current footprint cursor before moving to the next lot page',async()=>{
 const firstLots=Array.from({length:40},(_,i)=>parcel(i+1));
 const api=city(async u=>{
  const where=u.searchParams.get('$where')||'';
  if(u.pathname.includes('64uk-42ks')){
   if(u.searchParams.get('$select')?.startsWith('count'))return Response.json([{count:'41'}]);
   return Response.json(Number(u.searchParams.get('$offset'))===40?[parcel(41)]:firstLots);
  }
  if(where.includes("'1000000041'"))return Response.json([footprint(3,'1000000041')]);
  return Response.json(where.includes('doitt_id>1')?[footprint(2)]:[footprint(1),footprint(2)]);
 });
 const first=await api.queryCity({q:'TEST',limit:1});
 assert.equal(first.next_cursor,1);assert.equal(first.next_page,0);
 const rest=await api.queryCity({q:'TEST',limit:1,page:0,cursor:1});
 assert.equal(rest.next_cursor,null);assert.equal(rest.next_page,1);
 const next=await api.queryCity({q:'TEST',limit:1,page:1,cursor:0});
 assert.equal(next.buildings[0].id,'3');assert.equal(next.has_more,false);
});

test('zoning filters search every recorded zoning district',async()=>{
 let clause='';const api=city(async u=>{clause=u.searchParams.get('$where')||'';return Response.json(u.searchParams.get('$select')?.startsWith('count')?[{count:'0'}]:[])});
 await api.queryCity({unit:'parcel',zoning:'M'});
 for(const index of [1,2,3,4])assert.ok(clause.includes(`zonedist${index} like 'M%'`));
});

test('city HTTP route separates invalid input from an unavailable official provider',async()=>{
 let fetched=0;const api=city(async()=>{fetched++;return Response.json({error:'unavailable'},{status:503})});
 const route=load<{GET(request:Request):Promise<Response>}>('../app/api/city/route.ts',{'../../../lib/city':api});
 assert.equal((await route.GET(new Request('https://test.invalid/api/city?limit=301'))).status,400);
 assert.equal(fetched,0);
 assert.equal((await route.GET(new Request('https://test.invalid/api/city?limit=1'))).status,503);
 assert.equal(fetched,1);
});

const live=process.env.CITY_LIVE_TESTS==='1';
test('live NYC SODA building pages use stable keys and no overlapping first/next results',{skip:!live,timeout:60000},async()=>{
 const api=city();const first=await api.queryCity({unit:'building',borough:'BK',limit:2});
 assert.equal(first.buildings.length,2);assert.ok(first.next_cursor);
 const second=await api.queryCity({unit:'building',borough:'BK',limit:2,cursor:first.next_cursor!});
 assert.equal(second.buildings.length,2);
 assert.ok(second.buildings.every(b=>Number(b.id)>first.next_cursor!));
 assert.ok([...first.buildings,...second.buildings].every(b=>b.borough_code==='BK'&&Number.isFinite(b.longitude)&&Number.isFinite(b.latitude)));
});
test('live NYC SODA parcel paging and exact BBL/BIN searches agree with the official joins',{skip:!live,timeout:90000},async()=>{
 const api=city();const first=await api.queryCity({unit:'parcel',borough:'MN',limit:2});
 const second=await api.queryCity({unit:'parcel',borough:'MN',limit:2,page:first.next_page!});
 assert.equal(first.buildings.length,2);assert.equal(second.buildings.length,2);
 assert.equal(new Set([...first.buildings,...second.buildings].map(b=>b.id)).size,4);
 const exact=await api.queryCity({unit:'parcel',q:'3000200014',limit:2});
 assert.equal(exact.buildings[0].bbl,'3000200014');
 const source=await api.soda('5zhs-2jue',{$where:'doitt_id=1',$limit:1});
 const binParcel=await api.queryCity({unit:'parcel',q:String(source[0].bin),limit:2});
 assert.ok(binParcel.buildings.some(b=>b.bbl===source[0].mappluto_bbl||b.bbl===source[0].base_bbl));
 const binBuilding=await api.queryCity({unit:'building',q:String(source[0].bin),minArea:1,limit:2});
 assert.ok(binBuilding.buildings.length>0);
 assert.ok(binBuilding.buildings.every(b=>b.bin===String(source[0].bin)&&b.lot_building_area_sqft!>=1));
});

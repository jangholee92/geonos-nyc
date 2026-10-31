import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding} from '../lib/city';
import type {SiteContext} from '../lib/site-context';
function load<T>(file:string,imports:Record<string,unknown>={}):T{
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new vm.Script(code).runInNewContext({module,exports:module.exports,require:(id:string)=>imports[id]});return module.exports as T;
}
const api=load<typeof import('../lib/decision-lab')>('../lib/decision-lab.ts',{'./city-screening':load('../lib/city-screening.ts')});
const plain=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const b=(id:string,size:number|null,extra:Partial<CityBuilding>={})=>({id,entity_type:'building',footprint_area_sqft:size,bbl:'1000000001',join_warning:null,...extra} as CityBuilding);
const c=(id:string,distance:number|null)=>({id,heat:{status:'unavailable',value:null},truck:distance===null?{status:'unavailable',value:null}:{status:'available',value:{distance_m:distance}},stormwater:{status:'available',value:{queries_succeeded:7,queries_total:7}}} as SiteContext);
test('exact frontier finds a non-grid crossing and preserves the tie',()=>{
 const out=api.preferenceFrontier([b('large',20000),b('near',8000)],{large:c('large',1600),near:c('near',0)});
 assert.equal(out.intervals.length,2);
 assert.ok(Math.abs(out.intervals[0].to-100*60/140)<1e-8);
 assert.deepEqual(plain(out.intervals[0].winnerIds),['large']);
 assert.deepEqual(plain(out.intervals[1].winnerIds),['near']);
 assert.deepEqual(plain(out.boundaries[0].winnerIds),['large','near']);
});
test('identical score lines share the entire frontier; dominated crossings do not split it',()=>{
 const buildings=[b('a',20000),b('b',20000),b('small',10000),b('far',2000)];
 const contexts={a:c('a',0),b:c('b',0),small:c('small',1800),far:c('far',1000)};
 const out=api.preferenceFrontier(buildings,contexts);
 assert.equal(out.intervals.length,1);
 assert.deepEqual(plain(out.intervals[0]),{from:0,to:100,winnerIds:['a','b']});
 assert.equal(out.boundaries.length,0,'crossings among dominated lines are not tipping points');
});
test('missing metrics are never zero; endpoint-only candidates can still win',()=>{
 const out=api.preferenceFrontier([b('known',10000),b('no-route',20000)],{known:c('known',100), 'no-route':c('no-route',null)});
 assert.deepEqual(plain(out.missingIds),['no-route']);
 assert.deepEqual(plain(out.endpoints.size),['no-route']);
 assert.deepEqual(plain(out.intervals[0].winnerIds),['known']);
 assert.equal(out.curves.find(x=>x.id==='no-route')?.truck,null);
});
test('mixed parcel and footprint measurements suppress all rankings',()=>{
 const out=api.preferenceFrontier([b('building',10000),b('lot',null,{entity_type:'parcel',lot_area_sqft:10000})],{building:c('building',0),lot:c('lot',0)});
 assert.equal(out.mixedUnits,true);assert.equal(out.intervals.length,0);
 assert.deepEqual(plain(out.endpoints),{size:[],truck:[]});
});
test('zero is observed, invalid metrics remain missing, and blend endpoints disable unused metrics',()=>{
 const out=api.preferenceFrontier([b('zero',0),b('bad',-1)],{zero:c('zero',0),bad:c('bad',-1)});
 assert.equal(out.curves.find(x=>x.id==='zero')?.truck,100);
 assert.equal(out.curves.find(x=>x.id==='zero')?.size,0);
 assert.deepEqual(plain(out.missingIds),['bad']);
 assert.deepEqual(plain(api.blendWeights(100)),{size:0,truck:3,heat:0});
 assert.deepEqual(plain(api.blendWeights(-10)),{size:3,truck:0,heat:0});
 assert.equal(api.truckShare({size:0,truck:0,heat:0}),0);
});
test('verification queue follows missing evidence before operational judgment',()=>{
 assert.equal(api.nextVerification(b('x',null)).title,'Establish a usable area measurement');
 assert.equal(api.nextVerification(b('x',10),c('x',null)).title,'Resolve the truck-route lookup');
 assert.equal(api.nextVerification(b('x',10,{flood_2015:1}),c('x',0)).title,'Review the recorded flood-map intersection');
 assert.equal(api.nextVerification(b('x',10),c('x',0)).title,'Verify permission and physical fit');
});

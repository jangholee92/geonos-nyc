import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {CityBuilding} from '../lib/city';
const requireNative=createRequire(import.meta.url);
type Data=Record<string,any>;
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
const shard=JSON.parse(readFileSync(new URL('../public/data/energy/302.json',import.meta.url),'utf8'));
const building={...demo.buildings[0],id:'348650',bin:'3338236',bbl:'3028220001'} as CityBuilding;
function adapter(handler:(path:string)=>unknown=()=>{throw Error('Unexpected request');}):Data&{calls:string[];load:(file:string)=>Data}{
 const calls:string[]=[],cache:Data={};
 function load(file:string):Data{
  if(cache[file])return cache[file];
  const module={exports:{} as Data};
  const code=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const require=(name:string):unknown=>{
   if(name.endsWith('.css'))return {};
   if(name==='@/lib/public-fetch')return{fetchPublicJson:async(path:string)=>{calls.push(path);return handler(path);}};
   if(name==='./surroundings-panel')return{default:()=>React.createElement('div',null,'Surroundings mounted')};
   if(name.startsWith('@/lib/'))return load('lib/'+name.slice(6)+'.ts');
   if(name==='./energy-evidence-panel')return load('components/energy-evidence-panel.tsx');
   if(name==='./energy-source-qualifications')return load('components/energy-source-qualifications.tsx');
   return requireNative(name);
  };
  new vm.Script(code,{filename:file}).runInContext(vm.createContext({module,exports:module.exports,require,URL,Date,console}));
  cache[file]=module.exports;return module.exports;
 }
 return{...load('components/map-inspector.tsx'),calls,load};
}
test('closed disclosures fetch nothing and retain the compact one/two-building table',()=>{
 const a=adapter(),captures:unknown[]=[];
 const base={contexts:demo.contexts,busy:{},errors:{},onRemove(){},onClear(){},onFocus(){},onRetry(){},onExport(){},onExample(){},onEvidenceCapture:(...args:unknown[])=>captures.push(args)};
 const render=(buildings:CityBuilding[])=>renderToStaticMarkup(React.createElement(a.default,{...base,buildings}));
 assert.match(render([]),/Click a building/);
 const single=render([demo.buildings[0]]);assert.match(single,/Reported energy/);assert.doesNotMatch(single,/Which energy report belongs here/);assert.doesNotMatch(single,/Surroundings mounted/);
 const pair=render(demo.buildings.slice(0,2));assert.match(pair,/<table/);assert.match(pair,/Entire tax lot/);
 const scale=[...pair.matchAll(/data-pixels-per-meter="([^"]+)"/g)].map(m=>m[1]);assert.equal(scale.length,2);assert.equal(scale[0],scale[1]);
 assert.equal(a.calls.length,0);assert.equal(captures.length,0);
});
test('local LL84 lookup retains native parent/child records and provenance without allocating energy',async()=>{
 const a=adapter(()=>shard),result=await a.readReportedEnergy(building);
 assert.equal(result.status,'available');assert.deepEqual(a.calls,['/data/energy/302.json']);
 assert.equal(result.data.bbl,building.bbl);assert.equal(result.data.calendar_year,2024);assert.equal(result.data.records.length,3);
 assert.equal(result.data.reporting_scope_source.sha256,shard.reporting_scope_source.sha256);
 assert.equal(result.data.source_url,'https://data.cityofnewyork.us/d/5zyy-y8am');
 assert.match(result.note,/not an allocation/);
 const analysis=a.load('lib/energy-evidence.ts').analyzeEnergyEvidence(result.data.records,{bin:building.bin,bbl:building.bbl,reportYear:2024});
 assert.equal(analysis.aggregateSiteEnergyKbtu,null);assert.equal(analysis.sameEnergyRelationships.length,1);
 assert.equal(analysis.sameEnergyRelationships[0].parentEuiKbtuFt2,66.7);assert.equal(analysis.sameEnergyRelationships[0].childEuiKbtuFt2,127.6);
 assert.equal(analysis.nodes.find((node:Data)=>node.propertyId==='66128992').siteEnergyKbtu,null);
});
test('an absent BBL never requests a file; an unlinked lot is not zero use',async()=>{
 const a=adapter(()=>({source_id:'ll84_energy',calendar_year:2024,records:{}}));
 for(const bbl of [null,'bad','../../secrets','03028220001']){
  const result=await a.readReportedEnergy({...building,bbl});assert.equal(result.status,'not_linked');assert.equal(result.data,null);
 }
 assert.equal(a.calls.length,0);
 const missing=await a.readReportedEnergy(building);assert.equal(missing.status,'not_linked');assert.equal(missing.data.records.length,0);assert.match(missing.note,/does not mean zero/);
});
test('failed, malformed, foreign-lot or unsupported-year snapshots stay unavailable',async()=>{
 const records=shard.records[building.bbl!];
 const invalid=[null,{source_id:'wrong',calendar_year:2024,records:{}},{source_id:'ll84_energy',calendar_year:2025,records:{}},{source_id:'ll84_energy',calendar_year:2024,records:[]},{source_id:'ll84_energy',calendar_year:2024,records:{[building.bbl!]:[null]}},{source_id:'ll84_energy',calendar_year:2024,records:{[building.bbl!]:[{...records[0],bbls:['1000010001']}]}},{source_id:'ll84_energy',calendar_year:2024,records:{[building.bbl!]:Array(201).fill(records[0])}}];
 for(const payload of invalid){const result=await adapter(()=>payload).readReportedEnergy(building);assert.equal(result.status,'unavailable');assert.equal(result.data,null);assert.match(result.note,/No absence or zero/);}
 const failed=await adapter(()=>{throw Error('403 response');}).readReportedEnergy(building);assert.equal(failed.status,'unavailable');assert.equal(failed.data,null);assert.doesNotMatch(failed.note,/403/);
});

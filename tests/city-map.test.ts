import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding} from '../lib/city';
const source=ts.transpileModule(readFileSync(new URL('../components/city-map.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const module={exports:{}};new vm.Script(source).runInNewContext({module,exports:module.exports,require:()=>({})});
const api=module.exports as typeof import('../components/city-map');
const b=(extra:Partial<CityBuilding>={})=>({id:'123',longitude:-73.95,latitude:40.7,geometry_quality:'source_geometry',flood_2007:null,flood_2015:null,...extra} as CityBuilding);

test('unknown overlay values do not get the lowest pollution, canopy, evacuation or hazard color',()=>{
 for(const value of [null,undefined,'',' ',NaN,-1]){
  assert.equal(api.overlayColor({pm25_ug_m3:value},'air_quality_2024_cd'),'#64748b',String(value));
  assert.equal(api.overlayColor({tree_canopy_percent:value},'canopy_2010_cd'),'#64748b',String(value));
  assert.equal(api.overlayColor({hurricane_:value},'hurricane_evacuation_zones.overview'),'#64748b',String(value));
 }
 assert.notEqual(api.overlayColor({pm25_ug_m3:0},'air_quality_2024_cd'),'#64748b');
 assert.equal(api.overlayColor({tree_canopy_percent:101},'canopy_2010_cd'),'#64748b');
 assert.equal(api.overlayColor({Flooding_Category:0},'stormwater_moderate_2050.overview'),'#64748b');
 assert.notEqual(api.overlayColor({hurricane_:1},'hurricane_evacuation_zones.overview'),'#64748b');
});

test('recorded-flood coloring is identical in the local fallback and preserves active/selected identity',()=>{
 const flagged=b({flood_2015:1}),unknown=b();
 assert.equal(api.buildingColor(flagged,false,false,true),'#efaa83');
 assert.equal(api.buildingColor(b({flood_2007:1}),false,false,true),'#efaa83');
 assert.equal(api.buildingColor(unknown,false,false,true),'#73dfc5');
 assert.equal(api.buildingColor(flagged,true,false,true),'#f5c77b');
 assert.equal(api.buildingColor(flagged,true,true,true),'#fff0c5');
 assert.equal(api.buildingColor(flagged,false,false,false),'#73dfc5');
});

test('mapped counts exclude invalid placeholders, non-finite coordinates and outside-region locations',()=>{
 assert.equal(api.hasPoint(b()),true);
 for(const extra of [{geometry_quality:'invalid_or_placeholder'},{longitude:NaN},{latitude:Infinity},{longitude:0},{latitude:90}])assert.equal(api.hasPoint(b(extra)),false);
 assert.equal(api.hasPoint(b({entity_type:'parcel'})),true);
});

test('current rainfall legend never invents a high-tide category, and future high tide is distinct',()=>{
 const current=api.layerLegend('stormwater_moderate_current.overview');
 const future=api.layerLegend('stormwater_moderate_2050.overview');
 assert.equal(current.length,2);assert.equal(current.some(([,label])=>/tide/i.test(label)),false);
 assert.equal(future.length,3);assert.match(future[2][1],/separate category/);
 assert.ok(api.layerLegend('air_quality_2024_cd').some(([,label])=>label==='Unknown'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {featureFilter} from '@maplibre/maplibre-gl-style-spec';
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

test('atlas extrusion excludes only native polygons actually replaced by a positive-height overlay',()=>{
 const ring=[[-74,40.7],[-73.99,40.7],[-73.99,40.71],[-74,40.7]];
 const polygon={type:'Polygon',coordinates:[ring]};
 const f=(id:string,height_m:unknown,geometry:any=polygon)=>({type:'Feature',geometry,properties:{id,height_m}});
 const filter=featureFilter(api.citywideExtrusionFilter({features:[
  f('778052',377.58329171836806),f('109855',9),f('109855',9),
  f('201',null),f('202',0),f('203',-2),f('204',NaN),f('205',Infinity),f('206','12'),
  f('207',12,{type:'Point',coordinates:[-74,40.7]}),f('208',12,{type:'Polygon',coordinates:[]}),
  f('209',12,{type:'MultiPolygon',coordinates:[[ring]]}),f('p:1000010001',12),
 ]}));
 const drawn=(id:string,height_m?:number)=>filter.filter({zoom:16},{type:3,properties:{id,...(height_m===undefined?{}:{height_m})}});
 for(const id of ['778052','109855','209'])assert.equal(drawn(id,20),false,id+' must have only its full-record extrusion');
 for(const id of ['201','202','203','204','205','206','207','208','999'])assert.equal(drawn(id,20),true,id+' must keep its atlas extrusion');
 for(const height of [undefined,0,-1])assert.equal(drawn('999',height),false,'unknown/nonpositive atlas height is not extruded');
});

test('changing or clearing rendered records restores atlas coverage without hiding unrelated buildings',()=>{
 const polygon={type:'Polygon',coordinates:[[[-74,40.7],[-73.99,40.7],[-73.99,40.71],[-74,40.7]]]};
 const filters=[['101'],['102'],[]].map(ids=>featureFilter(api.citywideExtrusionFilter({features:ids.map(id=>({geometry:polygon,properties:{id,height_m:10}}))})));
 const draws=(i:number,id:string)=>filters[i].filter({zoom:16},{type:3,properties:{id,height_m:25}});
 assert.equal(draws(0,'101'),false);assert.equal(draws(0,'102'),true);
 assert.equal(draws(1,'101'),true);assert.equal(draws(1,'102'),false);
 for(const id of ['101','102','999'])assert.equal(draws(2,id),true);
});

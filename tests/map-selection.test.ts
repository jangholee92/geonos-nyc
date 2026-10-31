import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding,Geometry} from '../lib/city';
const source=readFileSync(new URL('../lib/map-selection.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const module={exports:{}};
new vm.Script(compiled).runInNewContext({module,exports:module.exports,require:(id:string)=>{
 if(id==='./city-quality.json')return JSON.parse(readFileSync(new URL('../lib/city-quality.json',import.meta.url),'utf8'));
 throw Error('Unexpected runtime dependency '+id);
}});
const {pickBuildingAtPoint}=module.exports as typeof import('../lib/map-selection');
const ring=(x=0,y=0,size=10)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
const building=(id:string,geometry:Geometry,extra:Partial<CityBuilding>={})=>({id,geometry,entity_type:'building',geometry_quality:'source_geometry',feature_code:2100,longitude:999,latitude:999,...extra} as CityBuilding);
const square=building('valid',{type:'Polygon',coordinates:[ring()]});

test('selects actual polygon containment without a representative-point or nearest fallback',()=>{
 assert.equal(pickBuildingAtPoint([square],[5,5]),square);
 assert.equal(pickBuildingAtPoint([square],[10.000001,5]),null);
 assert.equal(pickBuildingAtPoint([square],[30,30]),null);
 assert.equal(pickBuildingAtPoint([], [5,5]),null);
});

test('courtyard interiors and concave gaps are not buildings; boundary points are covered',()=>{
 const donut=building('courtyard',{type:'Polygon',coordinates:[ring(),ring(2,2,6).reverse()]});
 assert.equal(pickBuildingAtPoint([donut],[1,5]),donut);
 assert.equal(pickBuildingAtPoint([donut],[5,5]),null);
 for(const point of [[0,0],[10,5],[2,5],[8,8]] as [number,number][])assert.equal(pickBuildingAtPoint([donut],point),donut);
 const concave=building('concave',{type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4],[0,0]]]});
 assert.equal(pickBuildingAtPoint([concave],[2,3]),null);
 assert.equal(pickBuildingAtPoint([concave],[.5,3]),concave);
 assert.equal(pickBuildingAtPoint([concave],[3.5,3]),concave);
});

test('multipolygon components retain holes and never bridge the gap between islands',()=>{
 const multi=building('islands',{type:'MultiPolygon',coordinates:[[ring(0,0,2)],[ring(10,10,5),ring(11,11,2)]]});
 assert.equal(pickBuildingAtPoint([multi],[1,1]),multi);
 assert.equal(pickBuildingAtPoint([multi],[14,14]),multi);
 assert.equal(pickBuildingAtPoint([multi],[5,5]),null);
 assert.equal(pickBuildingAtPoint([multi],[12,12]),null);
 assert.equal(pickBuildingAtPoint([multi],[11,12]),multi);
});

test('overlaps and shared edges are deterministic in input order, without a proximity ranking',()=>{
 const first=building('first',{type:'Polygon',coordinates:[ring()]});
 const second=building('second',{type:'Polygon',coordinates:[ring(10,0)]});
 assert.equal(pickBuildingAtPoint([first,second],[10,5]),first);
 assert.equal(pickBuildingAtPoint([second,first],[10,5]),second);
 const overlap=building('overlap',{type:'Polygon',coordinates:[ring(1,1,2)]});
 assert.equal(pickBuildingAtPoint([first,overlap],[2,2]),first);
});

test('rejects native-invalid or placeholder records and parcels even when their outline contains the click',()=>{
 for(const extra of [{geometry_quality:'invalid_or_placeholder'},{feature_code:1003},{entity_type:'parcel' as const},{id:'160828'}]){
  const bad={...square,...extra};
  assert.equal(pickBuildingAtPoint([bad],[5,5]),null);
  assert.equal(pickBuildingAtPoint([bad,square],[5,5]),square);
 }
});

test('malformed, degenerate and nonpolygon geometry or nonfinite points remain unselected',()=>{
 const geometries=[{type:'Point',coordinates:[5,5]},{type:'Polygon',coordinates:[]},{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]},{type:'Polygon',coordinates:[[[0,0],[1,1],[2,2],[0,0]]]},{type:'Polygon',coordinates:[[[0,0],[NaN,0],[1,1],[0,0]]]},{type:'MultiPolygon',coordinates:[[ring()],[]]}];
 for(const geometry of geometries)assert.equal(pickBuildingAtPoint([building('bad',geometry)],[.5,.5]),null);
 for(const point of [[NaN,5],[5,Infinity],[181,5],[5,91]] as [number,number][])assert.equal(pickBuildingAtPoint([square],point),null);
});

test('small NYC-coordinate footprints retain boundary and hole precision',()=>{
 const exterior=ring(-74,40.7,.0001),hole=ring(-73.99997,40.70003,.00004);
 const small=building('nyc',{type:'Polygon',coordinates:[exterior,hole]});
 assert.equal(pickBuildingAtPoint([small],[-73.99999,40.70005]),small);
 assert.equal(pickBuildingAtPoint([small],[-73.99995,40.70005]),null);
 assert.equal(pickBuildingAtPoint([small],[-74,40.70005]),small);
 assert.equal(pickBuildingAtPoint([small],[-74.00000001,40.70005]),null);
});

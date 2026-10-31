import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding} from '../lib/city';
import type {QuestionPlan} from '../lib/decision-plan';
import type {BuildingDescription} from '../lib/building-description';

const source=ts.transpileModule(readFileSync(new URL('../lib/building-description.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new vm.Script(source).runInNewContext({module,exports:module.exports,require:(id:string)=>{throw Error('Unexpected runtime dependency '+id);}});
const {describeBuildings}=module.exports as typeof import('../lib/building-description');
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const plan=(intent:QuestionPlan['intent']='understand',requirements:QuestionPlan['requirements']=[])=>({intent,requirements});
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
const smithA=demo.buildings.find((b:CityBuilding)=>b.id==='109855') as CityBuilding;
const smithB=demo.buildings.find((b:CityBuilding)=>b.id==='819422') as CityBuilding;
assert.ok(smithA&&smithB,'Both official Smith Street snapshot records must be present');
const a=(patch:Partial<CityBuilding>={})=>({...smithA,zoning:[...smithA.zoning],retrieval:{mode:'live-query' as const,retrieved_at:'2026-10-28T12:00:00Z'},...patch});
const b=(patch:Partial<CityBuilding>={})=>({...smithB,zoning:[...smithB.zoning],retrieval:{mode:'live-query' as const,retrieved_at:'2026-10-28T12:00:00Z'},...patch});
function describe(buildings:CityBuilding[],intent:QuestionPlan['intent']=buildings.length===1?'understand':'compare'):BuildingDescription{
 const out=describeBuildings(buildings,plan(intent));assert.ok(out);return out;
}

test('single-building inspection includes actual dimensions, recorded year and explicitly linked lot facts',()=>{
 const out=describe([a()]);
 assert.match(out.answer,/572 SMITH STREET \(DOITT 109855\)/);
 assert.match(out.answer,/mapped footprint 27,193 ft²/);assert.match(out.answer,/recorded roof height 29\.4 ft/);assert.match(out.answer,/recorded year built 1931/);
 assert.match(out.answer,/Linked tax lot BBL 3004880006: recorded floor area across the whole lot 30,000 ft²; recorded lot zoning M3-1/);
 assert.match(out.answer,/footprint is not usable interior floor area; roof height is not interior clear height/);
 assert.match(out.answer,/Electrical capacity, availability and permission for a proposed use remain unknown/);
 assert.equal(out.candidateAnswers['109855'],out.answer);
 assert.deepEqual(plain(out.citations),[{evidenceId:'109855:construction_year',source:{id:'nyc-footprints',label:'NYC Building Footprints',url:'https://data.cityofnewyork.us/d/5zhs-2jue',recordId:'109855',retrievedAt:'2026-10-28T12:00:00Z'},measurement:'construction_year',scope:'building',unit:'year',value:1931}]);
});

test('Smith comparison describes both records and calculates footprint and roof-height differences without choosing a winner',()=>{
 const out=describe([a(),b()]);
 assert.ok(out.answer.indexOf('572 SMITH STREET')<out.answer.indexOf('592 SMITH STREET'));
 for(const text of ['27,193 ft²','29.4 ft','1931','30,000 ft²','19,259 ft²','22.06 ft','1920','23,500 ft²'])assert.ok(out.answer.includes(text),text);
 assert.match(out.answer,/572 SMITH STREET \(DOITT 109855\) has 7,934 ft² more mapped footprint than 592 SMITH STREET \(DOITT 819422\)/);
 assert.match(out.answer,/572 SMITH STREET \(DOITT 109855\) has a recorded roof height 7\.34 ft higher than 592 SMITH STREET \(DOITT 819422\)/);
 assert.doesNotMatch(out.answer,/winner|best|suitable|recommended|matches all|clear height 29/);
 assert.deepEqual(Object.keys(out.candidateAnswers).sort(),['109855','819422']);
 assert.match(out.candidateAnswers['819422'],/recorded year built 1920/);
 assert.equal(out.citations.length,2);assert.deepEqual(plain(out.citations.map(c=>[c.source.recordId,c.value])),[['109855',1931],['819422',1920]]);
});

test('input reversal changes presentation order but never reverses the measured difference',()=>{
 const out=describe([b(),a()]);
 assert.ok(out.answer.indexOf('592 SMITH STREET')<out.answer.indexOf('572 SMITH STREET'));
 assert.match(out.answer,/572 SMITH STREET \(DOITT 109855\) has 7,934 ft² more/);
 assert.match(out.answer,/572 SMITH STREET \(DOITT 109855\) has a recorded roof height 7\.34 ft higher/);
});

test('equal measurements remain equal and sub-cent differences are not rounded into a false zero difference',()=>{
 const same=describe([a(),b({footprint_area_sqft:27193,roof_height_ft:29.4})]);
 assert.match(same.answer,/same mapped footprint area/);assert.match(same.answer,/same recorded roof height/);
 assert.doesNotMatch(same.answer,/more mapped footprint|ft higher/);
 const close=describe([a(),b({footprint_area_sqft:27192.999,roof_height_ft:29.399})]);
 assert.match(close.answer,/less than 0\.01 ft² more/);assert.match(close.answer,/less than 0\.01 ft higher/);
});

test('null, non-finite, negative and zero measurements stay explicitly unknown with no invented numeric comparison',()=>{
 for(const value of [null,NaN,Infinity,-1,0]){
  const out=describe([a({footprint_area_sqft:value,roof_height_ft:value,construction_year:value,lot_building_area_sqft:value,zoning:[]}),b()]);
  const first=out.candidateAnswers['109855'];
  assert.match(first,/mapped footprint unknown; recorded roof height unknown; recorded year built unknown/);
  assert.match(first,/whole lot unknown; recorded lot zoning unknown/);
  assert.doesNotMatch(out.answer,/NaN|Infinity|ft² more|ft higher/);
  assert.equal(out.citations.length,1);assert.equal(out.citations[0].value,1920);
 }
});

test('numeric strings are not accepted as measurements and a fractional year is not a construction-year citation',()=>{
 const out=describe([a({footprint_area_sqft:'20000' as unknown as number,roof_height_ft:'30' as unknown as number,construction_year:1931.5})]);
 assert.match(out.answer,/mapped footprint unknown; recorded roof height unknown; recorded year built unknown/);assert.equal(out.citations.length,0);
 const undated=describe([a({retrieval:undefined})]);assert.ok(!('retrievedAt' in undated.citations[0].source));
});

test('invalid and placeholder geometry cannot produce a mapped footprint even if a numeric area was supplied',()=>{
 for(const patch of [{geometry_quality:'invalid_or_placeholder'},{feature_code:1003}]){
  const out=describe([a(patch),b()]);assert.match(out.candidateAnswers['109855'],/mapped footprint unknown/);
  assert.doesNotMatch(out.answer,/ft² more mapped footprint/);assert.match(out.answer,/recorded roof height 29\.4 ft/);
 }
});

test('two buildings sharing one lot are retained independently but their whole-lot floor areas are never added or compared',()=>{
 const out=describe([a(),b({bbl:a().bbl,lot_building_area_sqft:30000})]);
 assert.equal(Object.keys(out.candidateAnswers).length,2);
 assert.match(out.answer,/DOITT 109855 and 819422 share BBL 3004880006/);
 assert.match(out.answer,/not independent building areas and must not be added/);
 assert.doesNotMatch(out.answer,/60,000|floor area.*more than|values disagree/);
 const conflict=describe([a(),b({bbl:a().bbl,lot_building_area_sqft:23500})]);
 assert.match(conflict.answer,/linked floor-area values disagree and need source verification/);
 assert.doesNotMatch(conflict.answer,/53,500/);
});

test('unmatched lot identities cannot expose orphan zoning or floor-area values as linked building facts',()=>{
 for(const bbl of [null,'invalid','']){
  const out=describe([a({bbl,lot_building_area_sqft:999999,zoning:['M3-1']})]);
  assert.match(out.answer,/Linked tax lot BBL unknown: recorded floor area across the whole lot unknown; recorded lot zoning unknown/);
  assert.doesNotMatch(out.answer,/999,999|M3-1/);assert.match(out.answer,/27,193 ft²/);
 }
});

test('descriptive helper does not replace a requirement assessment, search, parcel result or ambiguous record set',()=>{
 const requirement={id:'size',factKey:'footprint_area_sqft',operator:'gte',target:20000,unit:'sqft',scope:'building',required:true} as QuestionPlan['requirements'][number];
 assert.equal(describeBuildings([a()],plan('understand',[requirement])),null);
 assert.equal(describeBuildings([a()],plan('find')),null);
 assert.equal(describeBuildings([a({entity_type:'parcel'})],plan()),null);
 assert.equal(describeBuildings([a({id:'p:3004880006'})],plan()),null);
 assert.equal(describeBuildings([],plan()),null);assert.equal(describeBuildings([a(),b()],plan()),null);
 assert.equal(describeBuildings([a()],plan('compare')),null);assert.equal(describeBuildings([a(),a()],plan('compare')),null);
 assert.equal(describeBuildings(Array.from({length:5},(_,i)=>a({id:String(i+1)})),plan('compare')),null);
});

test('three or four records are all described without inventing pairwise or best-site rankings',()=>{
 const rows=[a(),b(),a({id:'3',address:'THIRD RECORD'}),a({id:'4',address:'FOURTH RECORD'})];
 const out=describe(rows);
 assert.equal(Object.keys(out.candidateAnswers).length,4);assert.equal(out.citations.length,4);
 assert.match(out.answer,/THIRD RECORD/);assert.match(out.answer,/FOURTH RECORD/);
 assert.doesNotMatch(out.answer,/more mapped footprint than|higher than|winner|best/);
});

test('the helper is deterministic, does not mutate source records, and ignores unrelated model-like properties',()=>{
 const record=a();Object.freeze(record.zoning);Object.freeze(record);
 const before=plain(record),first=describe([record]),second=describe([{...record,answer:'Fictional winner with 5,000 kW',modelScore:100} as CityBuilding]);
 assert.deepEqual(plain(first),plain(second));assert.deepEqual(plain(record),before);assert.doesNotMatch(second.answer,/5,000|winner|modelScore/);
});

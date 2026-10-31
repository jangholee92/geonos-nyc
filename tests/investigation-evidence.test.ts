import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding} from '../lib/city';
import type {PlaceEvidenceRegistry,LoadedPlaceEvidence} from '../lib/investigation-evidence';
import type {InvestigationReceipt} from '../lib/investigation-receipt';
function load(name:string):any{const code=ts.transpileModule(readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};new vm.Script(code).runInNewContext({module,exports:module.exports,require:(id:string)=>load(id.replace('./',''))});return module.exports;}
const evidence=load('investigation-evidence') as typeof import('../lib/investigation-evidence');
const planner=load('decision-plan') as typeof import('../lib/decision-plan');
const receipt=load('investigation-receipt') as typeof import('../lib/investigation-receipt');
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
const shard=JSON.parse(readFileSync(new URL('../public/data/energy/302.json',import.meta.url),'utf8'));
const climate=JSON.parse(readFileSync(new URL('../public/data/climate/station_climate.json',import.meta.url),'utf8'));
const building:CityBuilding={...demo.buildings[0],id:'348650',bin:'3338236',bbl:'3028220001',address:'211 LOMBARDY STREET'};
const energy:LoadedPlaceEvidence['energy']={status:'available',captured_at:'2026-10-28T01:30:00Z',note:'Native reporting-property records, not a building allocation.',data:{bbl:building.bbl,calendar_year:2024,records:shard.records[building.bbl!],asset:'/data/energy/302.json',source_url:'https://data.cityofnewyork.us/d/5zyy-y8am',reporting_scope_source:shard.reporting_scope_source}};
const plain=(value:any)=>JSON.parse(JSON.stringify(value));
function bundle():InvestigationReceipt{
 const plan={intent:'understand' as const,purpose:'cold_storage' as const,userQuestion:'What evidence still matters for a cold-storage use?',requirements:[planner.makeRequirement('electrical_capacity_kw','gte',100)]};
 return{schema:'geonos.question-plan.v2',generated_at:'2026-10-28T01:30:00Z',question_plan:plan,discovery_query:null,discovery_filters:null,decision:planner.evaluateQuestion(plan,[building],{}),buildings:[building],contexts:{[building.id]:{...demo.contexts[demo.buildings[0].id],id:building.id}},user_reported_evidence:{},loaded_evidence:evidence.retainPlaceEvidence({},building,{energy}),method:'No capacity is inferred from energy reports.'};
}

test('functional registry updates retain concurrent evidence and distinct native records',()=>{
 let registry:PlaceEvidenceRegistry={};
 registry=evidence.retainPlaceEvidence(registry,building,{energy});
 const second={...building,id:'other'};
 registry=evidence.retainPlaceEvidence(registry,second,{weather:evidence.notRequested()});
 registry=evidence.retainPlaceEvidence(registry,building,{surroundings:evidence.captureSurroundings({status:'stale',id:building.id,reason:'Source geometry changed.',source:{} as any})});
 assert.equal(registry[building.id].energy!.data!.records.length,3);assert.equal(registry[building.id].surroundings!.data!.status,'stale');assert.ok(registry.other);
 assert.deepEqual(Object.keys(evidence.selectedPlaceEvidence(registry,[building])),[building.id]);
});

test('reused IDs with a changed BBL or footprint revision do not silently inherit viewed evidence',()=>{
 const registry=evidence.retainPlaceEvidence({},building,{energy});
 for(const revised of [{...building,bbl:'3028220002'},{...building,footprint_edited_at:'2099-01-01'}]){
  assert.equal(evidence.selectedPlaceEvidence(registry,[revised])[building.id].energy,undefined);
  assert.equal(evidence.retainPlaceEvidence(registry,revised,{weather:evidence.notRequested()})[building.id].energy,undefined);
 }
 assert.equal(evidence.selectedPlaceEvidence({},[building])[building.id].energy,undefined,'A new investigation starts with no inherited capture.');
});

test('actual station capture retains only scoped periods, source revision and distance',()=>{
 const station=climate.stations[0],capture=evidence.captureWeather({...station,distance:12345},climate,'available');
 assert.equal(capture.data!.station_id,station.id);assert.equal(capture.data!.distance_m,12345);assert.equal(capture.data!.periods[0].tmean_c,station.summary.baseline_1991_2020.annual_average.tmean_c);
 assert.equal(capture.data!.source_snapshot!.version,climate.source_snapshot.version);assert.equal(capture.data!.source_sha256,station.source_sha256);assert.ok(!('annual' in capture.data!));assert.match(capture.note,/not building weather/);
 for(const status of ['loading','not_requested','unavailable','not_linked'] as const)assert.equal(evidence.captureWeather(null,null,status).status,status);
});

test('facility captures retain partial source coverage and never turn failure into zero distance',()=>{
 const subway=JSON.parse(readFileSync(new URL('../public/data/layers/subway_stations.geojson',import.meta.url),'utf8'));
 const feature={...subway.features[0],category:'subway_stations',distance:321};
 const capture=evidence.captureInfrastructure([feature],{subway_stations:subway},[],['/data/layers/hospitals.geojson'],true);
 assert.equal(capture.data!.facilities[0].distance_m,321);assert.equal(capture.data!.facilities[0].source_url,feature.properties.source);
 assert.deepEqual(plain(capture.data!.coverage.map(value=>[value.category,value.status])),[['subway_stations','available'],['firehouses','loading'],['hospitals','unavailable']]);
 assert.equal(capture.data!.facilities.length,1);assert.match(capture.data!.method,/no travel time/);
});

test('real Lombardy reports render native scopes and quality flags without making power capacity known',()=>{
 const data=bundle(),before=JSON.stringify(data.decision),html=receipt.renderInvestigationReceipt(data);
 for(const value of ['2784952','66128693','66128992','66.7','127.6','79,551','41,583',shard.reporting_scope_source.sha256])assert.ok(html.includes(value),value);
 assert.match(html,/Literal source qualifications/);assert.match(html,/Do not sum the reports/);assert.match(html,/Footprint source edit date/);assert.match(html,/PLUTO version/);
 assert.equal(data.decision.candidates[0].requirements[0].status,'unknown');assert.equal(JSON.stringify(data.decision),before);
 assert.equal(data.loaded_evidence![building.id].energy!.data!.reporting_scope_source!.retrieved_at,shard.reporting_scope_source.retrieved_at);
});

test('receipt shows context values and source vintages even without a requirement on them',()=>{
 const data=bundle(),context=data.contexts[building.id]!;
 context.truck={status:'available',source:'https://data.cityofnewyork.us/d/jjja-shxy',note:'Recorded straight-line proximity only.',value:{distance_m:137,source_data_updated_at:'2026-03-02',source_revision_checked_at:'2026-10-28',street:'A source street'}};
 const html=receipt.renderInvestigationReceipt(data);
 for(const value of ['137 m','2026-03-02','2026-10-28','Community heat vulnerability','Evacuation planning','Stormwater reference-point query'])assert.ok(html.includes(value),value);
 assert.match(html,/not rechecked at each spatial query/);assert.match(html,/Query retrieval time is not/);
});

test('received registry props are read at export time even if Workspace mounted before drawer evidence loaded',()=>{
 const code=readFileSync(new URL('../components/decision-workspace.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('workspace.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const component=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='DecisionWorkspace') as ts.FunctionDeclaration;
 const fn=component.body!.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='evidenceBundle')!;
 const state:any={selectedPlaceEvidence:evidence.selectedPlaceEvidence,loadedEvidence:{},buildings:[building],plan:bundle().question_plan,searchQuery:null,searchDescription:null,result:bundle().decision,surroundings:{},initialSurroundings:{},contexts:{},contextBusy:{},contextErrors:{},extras:{}};
 vm.createContext(state);new vm.Script(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText).runInContext(state);
 assert.equal(state.evidenceBundle().loaded_evidence[building.id].energy,undefined);
 const surrounding={status:'unsupported',id:building.id,reason:'QA source status retained.',source:{} as any} as const;
 state.loadedEvidence=evidence.retainPlaceEvidence({},building,{energy,surroundings:evidence.captureSurroundings(surrounding)});
 const updated=state.evidenceBundle();assert.equal(updated.loaded_evidence[building.id].energy.data.records.length,3);assert.equal(updated.surroundings[building.id].reason,surrounding.reason);assert.equal(updated.context_status[building.id],'not_requested');
 state.contextErrors[building.id]='Failed';assert.equal(state.evidenceBundle().context_status[building.id],'unavailable');
});

test('energy, context, weather and facility source text cannot inject active receipt HTML',()=>{
 const data=bundle();data.loaded_evidence=structuredClone(data.loaded_evidence);const entry=data.loaded_evidence![building.id];
 entry.energy!.data!.records[0].name='<script>alert(1)</script>';entry.energy!.data!.records[0].data_quality={estimated_values_energy:'<img src=x onerror=alert(2)>'};
 entry.energy!.data!.source_url='javascript:alert(3)';
 entry.weather=evidence.captureWeather({...climate.stations[0],name:'<svg onload=alert(4)>',source_url:'javascript:alert(5)',distance:123},climate,'available');
 entry.infrastructure=evidence.captureInfrastructure([{category:'hospitals',distance:5,properties:{label:'<img src=x>',source:'javascript:alert(6)'}}],{hospitals:{}},[],[],true);
 const html=receipt.renderInvestigationReceipt(data);assert.doesNotMatch(html,/<script|<img|<svg onload|href="javascript:/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);
});

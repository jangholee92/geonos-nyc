import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding} from '../lib/city';
import type {SiteContext} from '../lib/site-context';
import type {QuestionPlan,Requirement,CandidateExtras,ReportedOperationalFact,DecisionFact,FactKey} from '../lib/decision-plan';
const code=ts.transpileModule(readFileSync(new URL('../lib/decision-plan.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};new vm.Script(code).runInNewContext({module,exports:module.exports});
const api=module.exports as typeof import('../lib/decision-plan');
const plain=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8')) as {buildings:CityBuilding[];contexts:Record<string,SiteContext>};
const source={id:'reported-document',label:'User-supplied engineering document',url:'https://example.org/site-document',retrievedAt:'2026-10-27T12:00:00Z'};
const plan=(requirements:Requirement[],extra:Partial<QuestionPlan>={}):QuestionPlan=>({intent:'compare',userQuestion:'Which places meet my stated conditions?',requirements,...extra});
const b=(id:string,extra:Partial<CityBuilding>={}):CityBuilding=>({id,address:`Site ${id}`,entity_type:'building',bbl:'3000000001',footprint_area_sqft:25000,roof_height_ft:30,lot_building_area_sqft:50000,lot_area_sqft:30000,zoning:['M1-1'],geometry_quality:'source_geometry',...extra} as CityBuilding);
const req=api.makeRequirement;
const report=(key:ReportedOperationalFact['key'],value:number|boolean|null,extra:Partial<ReportedOperationalFact>={}):ReportedOperationalFact=>({key,value,unit:api.FACTS[key].unit,scope:'operational',source,reportedAt:'2026-10-27T12:00:00Z',...extra});
const status=(out:ReturnType<typeof api.evaluateQuestion>,id:string)=>out.candidates.find(c=>c.id===id)!;

test('truck condition evidence retains network vintage separately from lookup and verification dates',()=>{
 const context={id:'a',retrieved_at:'2026-10-28T02:00:00Z',truck:{status:'available',value:{distance_m:80,source_data_updated_at:'2026-03-02T19:36:22Z',source_revision_checked_at:'2026-10-28T01:21:46.592288Z'},source:'https://data.cityofnewyork.us/d/jjja-shxy',note:'Recorded-network proximity does not establish access.'}} as SiteContext;
 const evidence=api.buildCandidateEvidence(b('a'),context);
 const fact=evidence.facts.find(f=>f.key==='truck_route_distance_m')!;
 assert.equal(fact.source.version,'2026-03-02T19:36:22Z');assert.equal(fact.source.retrievedAt,context.retrieved_at);
 assert.match(fact.note,/2026-10-28T01:21:46.592288Z/);assert.match(fact.note,/not rechecked/);
 const result=api.evaluatePlan(plan([req('truck_route_distance_m','lte',100)]),[evidence]);
 assert.equal(result.candidates[0].status,'matches');
 const serialized=JSON.stringify(result);assert.match(serialized,/2026-03-02T19:36:22Z/);assert.match(serialized,/2026-10-28T01:21:46.592288Z/);
});

test('real demo records change membership when the explicit footprint requirement changes',()=>{
 const buildings=demo.buildings;
 const first=api.evaluateQuestion(plan([req('footprint_area_sqft','gte',20000)]),buildings,demo.contexts);
 assert.equal(first.valid,true);assert.equal(first.counts.matches,1);
 assert.equal(first.candidates.find(c=>c.status==='matches')?.label,'572 SMITH STREET');
 const changed=api.evaluateQuestion(plan([req('footprint_area_sqft','gte',19000)]),buildings,demo.contexts);
 assert.equal(changed.counts.matches,2);
 assert.match(changed.answer,/Among the 3 candidates checked/);
 assert.equal(changed.candidates.find(c=>c.label==='45 BOWNE STREET')?.status,'conflicts');
});

test('a large parcel floor-area record cannot satisfy a usable-space requirement',()=>{
 const out=api.evaluateQuestion(plan([req('usable_area_sqft','gte',20000)]),[b('a')]);
 assert.equal(status(out,'a').status,'conditional');
 assert.equal(status(out,'a').requirements[0].status,'unknown');
 assert.match(status(out,'a').requirements[0].reason,/Public footprint and tax-lot floor area do not establish usable space/);
 assert.equal(out.nextQuestion?.factKey,'usable_area_sqft');
});

test('roof height never substitutes for interior clear height',()=>{
 const out=api.evaluateQuestion(plan([req('clear_height_ft','gte',20),req('roof_height_ft','gte',20)]),[b('a')]);
 assert.deepEqual(plain(status(out,'a').requirements.map(x=>x.status)),['unknown','supported']);
 assert.equal(out.counts.matches,0);
});

test('matching dated operational reports can support, conflict or leave a condition unknown',()=>{
 const out=api.evaluateQuestion(plan([req('usable_area_sqft','gte',20000)]),[b('a'),b('b'),b('c')],{}, {
  a:{operational:[report('usable_area_sqft',22000)]},b:{operational:[report('usable_area_sqft',15000)]},
 });
 assert.deepEqual(plain(out.candidates.map(x=>x.status)),['matches','conflicts','conditional']);
 assert.match(status(out,'a').requirements[0].reason,/explicitly reported/);
 assert.deepEqual(plain(out.nextQuestion?.candidateIds),['c']);
});

test('wrong operational units and scopes are rejected rather than converted or inferred',()=>{
 const out=api.evaluateQuestion(plan([req('usable_area_sqft','gte',1000)]),[b('a')],{}, {a:{operational:[report('usable_area_sqft',3000,{unit:'m',scope:'parcel' as 'operational'})]}});
 assert.equal(status(out,'a').requirements[0].status,'unknown');
 assert.equal(status(out,'a').dataIssues.length,1);
 const wrong=req('lot_building_area_sqft','gte',20000);wrong.scope='building';
 const invalid=api.evaluateQuestion(plan([wrong]),[b('a')]);
 assert.equal(invalid.valid,false);assert.ok(invalid.issues.some(x=>x.code==='scope_mismatch'));
});

test('invalid, unsupported and duplicate plan conditions are not evaluated',()=>{
 const malformed=[{...req('footprint_area_sqft','gte',1),factKey:'__proto__'},req('footprint_area_sqft','gte',NaN),req('footprint_area_sqft','gte',-1),{...req('clear_height_ft','gte',5),unit:'m'}];
 const out=api.evaluateQuestion(plan(malformed as Requirement[]),[b('a')]);
 assert.equal(out.valid,false);assert.equal(out.candidates.length,0);
 for(const code of ['unknown_fact','invalid_target','invalid_id','unit_mismatch'])assert.ok(out.issues.some(x=>x.code===code),code);
 assert.throws(()=>req('power_from_eui' as any,'gte',1),/Unsupported/);
});

test('boolean false and count zero are observed values, not missing data',()=>{
 const out=api.evaluateQuestion(plan([req('available_for_use','eq',true),req('loading_docks','eq',0)]),[b('a')],{}, {a:{operational:[report('available_for_use',false),report('loading_docks',0)]}});
 assert.deepEqual(plain(status(out,'a').requirements.map(x=>x.status)),['conflicting','supported']);
 assert.equal(status(out,'a').status,'conflicts');
});

test('fractional dock counts and numeric strings cannot satisfy a numeric requirement',()=>{
 const out=api.evaluateQuestion(plan([req('loading_docks','gte',1),req('clear_height_ft','gte',15)]),[b('a')],{}, {a:{operational:[report('loading_docks',1.5),report('clear_height_ft','20' as unknown as number)]}});
 assert.equal(status(out,'a').unknowns.length,2);assert.equal(status(out,'a').dataIssues.length,2);
});

test('public area zero, invalid geometry and negative distance do not become usable measurements',()=>{
 const buildings=[b('zero',{footprint_area_sqft:0}),b('invalid',{geometry_quality:'invalid_or_placeholder'}),b('negative')];
 const ctx={negative:{id:'negative',truck:{status:'available',value:{distance_m:-10},source:'https://data.cityofnewyork.us/d/jjja-shxy'}} as SiteContext};
 const out=api.evaluateQuestion(plan([req('footprint_area_sqft','gte',1),req('truck_route_distance_m','lte',100)]),buildings,ctx);
 assert.equal(status(out,'zero').requirements[0].status,'unknown');
 assert.equal(status(out,'invalid').requirements[0].status,'unknown');
 assert.equal(status(out,'negative').requirements[1].status,'unknown');
});

test('a tax lot does not get a building-footprint measurement, but can answer a parcel requirement',()=>{
 const out=api.evaluateQuestion(plan([req('footprint_area_sqft','gte',100),req('lot_building_area_sqft','gte',40000)]),[b('p:3000000001',{entity_type:'parcel'})]);
 assert.deepEqual(plain(out.candidates[0].requirements.map(x=>x.status)),['not_assessed','supported']);
 assert.equal(out.counts.matches,0);
});

test('optional checks never admit or exclude a candidate',()=>{
 const out=api.evaluateQuestion(plan([req('footprint_area_sqft','gte',20000),req('roof_height_ft','gte',100,{required:false}),req('available_for_use','eq',true,{required:false})]),[b('a')]);
 assert.equal(status(out,'a').status,'matches');assert.equal(status(out,'a').blockers.length,0);assert.equal(status(out,'a').unknowns.length,0);
 assert.deepEqual(plain(status(out,'a').requirements.map(x=>x.status)),['supported','conflicting','unknown']);
});

test('the next question ignores unresolved facts on candidates with an existing conflict',()=>{
 const out=api.evaluateQuestion(plan([req('footprint_area_sqft','gte',20000),req('electrical_capacity_kw','gte',100)]),[b('too-small',{footprint_area_sqft:100}),b('possible')]);
 assert.deepEqual(plain(out.nextQuestion?.candidateIds),['possible']);
 assert.equal(out.nextQuestion?.factKey,'electrical_capacity_kw');
 assert.match(out.nextQuestion?.why||'',/last unresolved condition/);
});

test('the next question prioritizes a fact that can complete a conditional candidate',()=>{
 const out=api.evaluateQuestion(plan([req('clear_height_ft','gte',20),req('loading_docks','gte',1),req('electrical_capacity_kw','gte',100)]),[b('one-left'),b('two-left')],{}, {
  'one-left':{operational:[report('clear_height_ft',22),report('loading_docks',2)]},
  'two-left':{operational:[report('electrical_capacity_kw',120)]},
 });
 assert.equal(out.nextQuestion?.factKey,'electrical_capacity_kw');
 assert.deepEqual(plain(out.nextQuestion?.candidateIds),['one-left']);
 assert.equal(out.nextQuestion?.branches.length,3);
});

test('when every candidate has a known conflict, ask about the condition or search instead of unrelated facts',()=>{
 const out=api.evaluateQuestion(plan([req('footprint_area_sqft','gte',1e6),req('usable_area_sqft','gte',20000)]),[b('a'),b('b')]);
 assert.equal(out.nextQuestion?.kind,'reconsider_requirement');
 assert.equal(out.nextQuestion?.factKey,'footprint_area_sqft');
 assert.match(out.nextQuestion?.why||'',/Filling unrelated unknowns cannot remove those conflicts/);
});

test('conflicting reports remain unknown instead of choosing the latest or most favorable value',()=>{
 const out=api.evaluateQuestion(plan([req('clear_height_ft','gte',20)]),[b('a')],{}, {a:{operational:[report('clear_height_ft',18),report('clear_height_ft',25)]}});
 assert.equal(status(out,'a').requirements[0].status,'unknown');
 assert.match(status(out,'a').requirements[0].reason,/records disagree/);
 assert.equal(status(out,'a').requirements[0].evidenceIds.length,2);
});

test('an undated operational claim or unsafe source link cannot become supporting evidence',()=>{
 const out=api.evaluateQuestion(plan([req('clear_height_ft','gte',20),req('loading_docks','gte',1)]),[b('a')],{}, {a:{operational:[report('clear_height_ft',25,{reportedAt:''}),report('loading_docks',2,{source:{id:'bad',label:'Untrusted link',url:'javascript:alert(1)'}})]}});
 assert.equal(status(out,'a').unknowns.length,2);assert.equal(status(out,'a').dataIssues.length,2);
});

test('LL84 benchmarks keep year and property-group scope and cannot supply electrical capacity',()=>{
 const extra:CandidateExtras={energy:[{propertyId:'123',matchedBbl:'3000000001',reportingYear:2024,siteEui:66.7,sourceEui:120,source}]};
 const out=api.evaluateQuestion(plan([req('site_eui','lte',100,{year:2024}),req('source_eui','lte',100,{year:2025}),req('electrical_capacity_kw','gte',100)]),[b('a')],{}, {a:extra});
 assert.deepEqual(plain(status(out,'a').requirements.map(x=>x.status)),['supported','unknown','unknown']);
 assert.equal(status(out,'a').requirements[0].facts[0].scope,'benchmark_property');
 assert.equal(status(out,'a').requirements[0].facts[0].propertyId,'123');
 assert.match(status(out,'a').requirements[1].reason,/another scenario or reporting year/);
});

test('a benchmark on another BBL or ambiguous property groups cannot satisfy the condition',()=>{
 const energy={propertyId:'123',matchedBbl:'3000000001',reportingYear:2024,siteEui:66.7,sourceEui:120,source};
 const out=api.evaluateQuestion(plan([req('site_eui','lte',100,{year:2024})]),[b('wrong'),b('ambiguous')],{}, {
  wrong:{energy:[{...energy,matchedBbl:'3000000002'}]},ambiguous:{energy:[energy,{...energy,propertyId:'456'}]},
 });
 assert.equal(status(out,'wrong').requirements[0].status,'unknown');assert.equal(status(out,'wrong').dataIssues.length,1);
 assert.equal(status(out,'ambiguous').requirements[0].status,'unknown');
});

test('DEP outline overlays are context only even with complete coverage and a zero overlap',()=>{
 const out=api.evaluateQuestion(plan([req('stormwater_footprint_intersection','eq',false,{scenario:'moderate-current'}),req('stormwater_footprint_overlap_pct','lte',0,{scenario:'moderate-current'})]),[b('a')],{}, {
  a:{footprint:[{buildingId:'a',scenario:'moderate-current',intersects:false,overlapPct:0,queryComplete:true,coverage:'covered',source}]},
 });
 assert.equal(out.counts.matches,0);assert.equal(out.counts.conflicts,0);
 assert.deepEqual(plain(status(out,'a').requirements.map(x=>x.status)),['not_assessed','not_assessed']);
 assert.match(status(out,'a').requirements[0].reason,/buildings as voids/);
 assert.equal(status(out,'a').requirements[0].facts[0].value,false);
 assert.equal(out.nextQuestion?.kind,'professional_review');
});

test('point context is never converted to whole-footprint evidence or a safety predicate',()=>{
 const context={id:'a',future_flood:{status:'available',value:{inside:false}},stormwater:{status:'available',value:{queries_succeeded:7,queries_total:7}},truck:{status:'unavailable',value:null}} as SiteContext;
 const evidence=api.buildCandidateEvidence(b('a'),context);
 assert.ok(!evidence.facts.some(f=>f.key.startsWith('stormwater_')));
 assert.ok(!('flood_safe' in api.FACTS));
 assert.ok(!('heat_hvi' in api.FACTS));
});

test('zoning matches are exact recorded codes and never establish permission',()=>{
 const out=api.evaluateQuestion(plan([req('zoning','in',['M1-1']),req('use_permission','eq',true)]),[b('a')]);
 assert.deepEqual(plain(status(out,'a').requirements.map(x=>x.status)),['supported','not_assessed']);
 assert.equal(out.counts.matches,0);
 const prefix=api.evaluateQuestion(plan([req('zoning','in',['M'])]),[b('a')]);
 assert.equal(status(prefix,'a').requirements[0].status,'conflicting');
});

test('legal permission cannot be overridden by an injected or user-reported true fact',()=>{
 const evidence=api.buildCandidateEvidence(b('a'));
 const fact:DecisionFact={id:'assertion',key:'use_permission',value:true,unit:'boolean',scope:'operational',basis:'user_reported',source,note:'An assertion',reportedAt:'2026-10-27'};
 evidence.facts.push(fact);
 const out=api.evaluatePlan(plan([req('use_permission','eq',true)]),[evidence]);
 assert.equal(out.candidates[0].requirements[0].status,'not_assessed');
 assert.equal(out.nextQuestion?.kind,'professional_review');
});

test('purpose alone never creates requirements, thresholds, a rank or an automatic match',()=>{
 const out=api.evaluateQuestion(plan([],{purpose:'cold_storage',intent:'understand'}),[b('a')]);
 assert.equal(status(out,'a').status,'not_assessed');assert.equal(status(out,'a').requirements.length,0);
 assert.ok(out.suggestedQuestions.some(x=>x.factKey==='electrical_capacity_kw'));
 assert.match(out.answer,/recorded zoning M1-1/);
 assert.equal(out.nextQuestion?.kind,'define_requirement');
});

test('an unrelated context, unmatched parcel, and malformed evidence cannot quietly fill a requirement',()=>{
 const ctx={id:'different',truck:{status:'available',value:{distance_m:0}}} as SiteContext;
 const evidence=api.buildCandidateEvidence(b('a',{bbl:null}),ctx);
 evidence.facts.push(null as unknown as DecisionFact);
 const out=api.evaluatePlan(plan([req('truck_route_distance_m','lte',10),req('lot_building_area_sqft','gte',1)]),[evidence]);
 assert.equal(out.valid,true);assert.equal(out.candidates[0].unknowns.length,2);assert.equal(out.candidates[0].dataIssues.length,1);
});

test('evaluatePlan rechecks supplied fact scopes rather than trusting a hand-built candidate',()=>{
 const c=api.buildCandidateEvidence(b('a'));
 const f=c.facts.find(f=>f.key==='footprint_area_sqft')!;f.scope='parcel';
 const out=api.evaluatePlan(plan([req('footprint_area_sqft','gte',100)]),[c]);
 assert.equal(out.candidates[0].requirements[0].status,'unknown');
 assert.match(out.candidates[0].requirements[0].reason,/must use sqft at building_footprint/);
});

test('duplicate candidate identifiers and empty candidate sets are handled without false conclusions',()=>{
 const c=api.buildCandidateEvidence(b('a'));
 const invalid=api.evaluatePlan(plan([]),[c,c]);assert.equal(invalid.valid,false);
 const empty=api.evaluatePlan(plan([req('usable_area_sqft','gte',100)]),[]);assert.equal(empty.valid,true);assert.equal(empty.counts.checked,0);assert.equal(empty.nextQuestion,null);assert.match(empty.answer,/No candidates/);
});

test('evaluation is deterministic and does not mutate the plan, candidates or extra reports',()=>{
 const p=plan([req('usable_area_sqft','gte',100)]),buildings=[b('a')],extras={a:{operational:[report('usable_area_sqft',200)]}};
 const before=JSON.stringify({p,buildings,extras});
 const one=api.evaluateQuestion(p,buildings,{},extras),two=api.evaluateQuestion(p,buildings,{},extras);
 assert.deepEqual(plain(one),plain(two));assert.equal(JSON.stringify({p,buildings,extras}),before);
});

test('operational elicitation asks one optional question without inventing a threshold',()=>{
 const p=plan([],{purpose:'cold_storage'});
 const prompt=api.nextRequirementPrompt(p);
 assert.equal(prompt?.factKey,'usable_area_sqft');assert.equal(prompt?.input,'minimum');
 assert.ok(!('target' in prompt!));assert.equal(p.requirements.length,0);
 const skipped=api.nextRequirementPrompt(p,['usable_area_sqft']);
 assert.equal(skipped?.factKey,'electrical_capacity_kw');
 assert.equal(api.nextRequirementPrompt(plan([],{purpose:'general'})),null);
});

test('an existing action-changing question takes priority over asking for more requirements',()=>{
 const p=plan([req('usable_area_sqft','gte',20000)],{purpose:'cold_storage'});
 const unresolved=api.evaluateQuestion(p,[b('a')]);
 assert.equal(api.nextRequirementPrompt(p,[],unresolved),null);
 const resolved=api.evaluateQuestion(p,[b('a')],{}, {a:{operational:[report('usable_area_sqft',25000)]}});
 assert.equal(api.nextRequirementPrompt(p,[],resolved)?.factKey,'electrical_capacity_kw');
 const all=Object.keys(api.FACTS) as FactKey[];
 assert.equal(api.nextRequirementPrompt(p,all,resolved),null);
});

test('discovery filters describe parcel-level measurements and never create operational requirements',()=>{
 const summary=api.describeSearchFilters({unit:'building',borough:'BK',minArea:20000,zoning:'M',landUse:'06'});
 assert.ok(summary.filters.some(x=>x.includes('multiple buildings')));
 assert.match(summary.meaning,/Passing the search filters does not establish usable space/);
 assert.ok(!('requirements' in summary));
 const empty=api.describeSearchFilters({unit:'building',minArea:0,zoning:'all',borough:'all'});
 assert.equal(empty.filters.length,0);
});

test('identical address labels retain distinct native building identities in the answer',()=>{
 const out=api.evaluateQuestion(plan([req('usable_area_sqft','gte',100)]),[b('a',{address:'211 LOMBARDY STREET',bin:'3338236'}),b('b',{address:'211 LOMBARDY STREET',bin:'3330118'})]);
 assert.match(out.candidates[0].label,/BIN 3338236/);assert.match(out.candidates[1].label,/BIN 3330118/);
 assert.match(out.nextQuestion?.question||'',/BIN 3338236/);assert.match(out.nextQuestion?.question||'',/BIN 3330118/);
 const sameBin=api.evaluateQuestion(plan([]),[b('a',{address:'Same address',bin:'3338236'}),b('b',{address:'Same address',bin:'3338236'})]);
 assert.match(sameBin.candidates[0].label,/record a/);assert.match(sameBin.candidates[1].label,/record b/);
});


test('operational reports require real ISO calendar dates, not permissive date-parser guesses',()=>{
 for(const reportedAt of ['0','10/27/2026','2026-02-30','2025-02-29','2026-10-27T25:00:00Z']){
  const out=api.evaluateQuestion(plan([req('available_for_use','eq',true)]),[b('a')],{}, {a:{operational:[report('available_for_use',true,{reportedAt})]}});
  assert.equal(status(out,'a').requirements[0].status,'unknown',reportedAt);
  assert.equal(status(out,'a').dataIssues.length,1,reportedAt);
 }
 for(const reportedAt of ['2024-02-29','2026-10-27','2026-10-27T23:59:59.123Z','2026-10-27T23:59:59-04:00']){
  const out=api.evaluateQuestion(plan([req('available_for_use','eq',true)]),[b('a')],{}, {a:{operational:[report('available_for_use',true,{reportedAt})]}});
  assert.equal(status(out,'a').requirements[0].status,'supported',reportedAt);
 }
});


test('impossible required numeric bounds ask for clarification before chasing missing evidence',()=>{
 const conditions=[req('usable_area_sqft','gte',40000,{id:'min'}),req('usable_area_sqft','lte',30000,{id:'max'})];
 const out=api.evaluateQuestion(plan(conditions),[b('a')]);
 assert.equal(out.valid,false);assert.equal(out.candidates.length,0);
 assert.ok(out.issues.some(issue=>issue.code==='contradictory_requirements'));
 assert.match(out.issues[0].message,/40,000.*30,000/);
 for(const conditions of [
  [req('clear_height_ft','eq',20,{id:'a'}),req('clear_height_ft','eq',25,{id:'b'})],
  [req('clear_height_ft','eq',20,{id:'a'}),req('clear_height_ft','gte',25,{id:'b'})],
  [req('clear_height_ft','eq',20,{id:'a'}),req('clear_height_ft','lte',15,{id:'b'})],
 ])assert.ok(api.validatePlan(plan(conditions)).some(issue=>issue.code==='contradictory_requirements'));
});

test('contradiction checking preserves inclusive endpoints, optional checks, scopes and reporting years',()=>{
 const cases=[
  [req('usable_area_sqft','gte',40000,{id:'a'}),req('usable_area_sqft','lte',40000,{id:'b'})],
  [req('usable_area_sqft','gte',40000,{id:'a'}),req('usable_area_sqft','lte',30000,{id:'b',required:false})],
  [req('usable_area_sqft','gte',40000),req('lot_building_area_sqft','lte',30000)],
  [req('site_eui','gte',100,{id:'a',year:2023}),req('site_eui','lte',80,{id:'b',year:2024})],
  [req('zoning','in',['M1-1'],{id:'a'}),req('zoning','in',['R6'],{id:'b'})],
 ];
 for(const conditions of cases)assert.deepEqual(plain(api.validatePlan(plan(conditions))),[]);
});

test('opposite required boolean answers conflict, but optional boolean checks cannot invalidate a plan',()=>{
 const yes=req('available_for_use','eq',true,{id:'yes'}),no=req('available_for_use','eq',false,{id:'no'});
 assert.ok(api.validatePlan(plan([yes,no])).some(issue=>issue.code==='contradictory_requirements'));
 assert.deepEqual(plain(api.validatePlan(plan([yes,{...no,required:false}]))),[]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {PlanningContext} from '../lib/planning-context';

const index=JSON.parse(readFileSync(new URL('../lib/climate-evidence-index.json',import.meta.url),'utf8'));
const compiled=ts.transpileModule(readFileSync(new URL('../lib/planning-context.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const module={exports:{} as typeof import('../lib/planning-context')};
new vm.Script(compiled).runInNewContext({module,exports:module.exports,Date,Intl,require:(name:string)=>{assert.equal(name,'./climate-evidence-index.json');return index;},fetch:()=>{throw Error('Planning context must not perform network requests');}});
const {readPlanningContext,planningContextTool}=module.exports;
const now=new Date('2026-10-28T19:00:00Z');
const read=(...texts:string[])=>readPlanningContext(texts,now);
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const metric=(out:PlanningContext,key:string)=>{const found=out.facts.find(f=>f.measurement===key);assert.ok(found);return found;};

test('next ten years is an application-derived 2026–2036 window, not a fabricated 2036 forecast',()=>{
 const question='Evaluate this building for cold storage over the next 10 years.';
 const out=read(question);
 assert.equal(out.status,'available');assert.equal(out.planningWindow.origin,'relative_user_window');
 assert.equal(out.planningWindow.quote,question);assert.equal(out.planningWindow.anchorDate,'2026-10-28');
 assert.equal(out.planningWindow.requestedStartYear,2026);assert.equal(out.planningWindow.requestedEndYear,2036);assert.equal(out.planningWindow.publishedHorizon,'2030s');
 assert.match(out.planningWindow.interpretation,/not a forecast for 2036/);assert.match(out.nextInvestigation,/existing cold-storage operation/);
 assert.equal(out.citations.length,4);assert.ok(out.citations.every(c=>c.evidenceId.startsWith('npcc4:2030s:')));
 assert.match(out.limitations.join(' '),/centered 30-year/);assert.match(out.limitations.join(' '),/No interpolation/);
});

test('ordinary and compact relative wording keep the actual request rather than falling into a default',()=>{
 for(const wording of ['next10 years','next10years','next ten years','coming ten years','next decade','over the next decade','in a decade','10 years from now','for 10 years']){
  const out=read(`Cold storage for ${wording}.`);
  assert.equal(out.planningWindow.origin,'relative_user_window',wording);assert.equal(out.planningWindow.requestedEndYear,2036,wording);
 }
});

test('relative year arithmetic uses the New York calendar date across the UTC new year',()=>{
 const before=readPlanningContext(['next10 years'],new Date('2027-01-01T02:00:00Z'));
 assert.equal(before.planningWindow.anchorDate,'2026-12-31');assert.equal(before.planningWindow.requestedEndYear,2036);
 const after=readPlanningContext(['next10 years'],new Date('2027-01-01T05:00:00Z'));
 assert.equal(after.planningWindow.anchorDate,'2027-01-01');assert.equal(after.planningWindow.requestedEndYear,2037);
});

test('all selected numerical ranges, baselines and source identities match the compiled official rows',()=>{
 const out=read('next decade'),p=index.projections;
 assert.deepEqual(plain(metric(out,'temperature_change_c').value),p.annual.find((r:{horizon:string})=>r.horizon==='2030s').temperature_change_c);
 assert.deepEqual(plain(metric(out,'hot_days_ge90f_per_year').value),{p10:27,p25:27,p75:46,p90:54});
 assert.equal(metric(out,'hot_days_ge90f_per_year').baseline.value,17);
 assert.deepEqual(plain(metric(out,'heatwaves_per_year').value),{p10:3,p25:3,p75:6,p90:7});
 assert.equal(metric(out,'heatwaves_per_year').baseline.value,2);
 assert.deepEqual(plain(metric(out,'rain_days_ge2inch_per_year').value),{p10:3,p25:3,p75:4,p90:5});
 for(const citation of out.citations){
  assert.equal(citation.scope,'NYC_region');assert.deepEqual(plain(citation.baseline.years),[1981,2010]);
  assert.equal(citation.source.retrievalMode,'compiled-source-snapshot');assert.equal(citation.source.retrievedOn,'2026-10-27');
  assert.equal(citation.source.url,citation.measurement==='temperature_change_c'?p.provenance.temperature_precipitation:p.provenance.extremes);
  assert.deepEqual(plain(citation.source.rawSha256),p.provenance.raw_sha256);
 }
});

test('a newer unsupported explicit year never resurrects an older supported horizon',()=>{
 for(const question of ['What will the temperature be in 2036?','Use 2090s instead.','Use 3000.','Use the year 2030.','Compare 2030s and 2050s.','Use 2026–2036.']){
  const out=read(question,'Use the 2050s.');assert.equal(out.status,'unsupported',question);
  assert.equal(out.planningWindow.origin,'unsupported_explicit_time');assert.equal(out.planningWindow.quote,question);
  assert.equal(out.planningWindow.publishedHorizon,null);assert.equal(out.facts.length,0);assert.equal(out.citations.length,0);
 }
});

test('latest relative selection overrides older horizons, while consistent explicit endpoints remain transparent',()=>{
 const out=read('Consider the next10 years, through 2036.','Use the 2050s.');
 assert.equal(out.status,'available');assert.equal(out.planningWindow.publishedHorizon,'2030s');assert.equal(out.planningWindow.requestedEndYear,2036);
 assert.equal(read('Use next10 years and the 2050s.','Use2030s.').status,'unsupported');
 assert.equal(read('Over next10 years or next20 years.').status,'unsupported');
});

test('publication dates, construction years, money and operating measurements do not become climate horizons',()=>{
 const question='NPCC4 (2024): this building was built in 1931. Need 2000 square feet, 1500 kW and $3000 budget over the next10 years.';
 const out=read(question);assert.equal(out.status,'available');assert.equal(out.planningWindow.requestedEndYear,2036);
 assert.equal(out.facts.length,4);assert.ok(out.facts.every(f=>f.scope==='NYC_region'));
 assert.ok(!out.citations.some(c=>/capacity|cost|usable|return/.test(c.measurement)));
});

test('annual-only horizons use published means without manufacturing extreme frequencies',()=>{
 for(const horizon of ['2040s','2060s','2070s','2100']){
  const out=read(`Use the ${horizon} planning context.`);assert.equal(out.status,'available');assert.equal(out.planningWindow.publishedHorizon,horizon);
  assert.deepEqual(plain(out.facts.map(f=>f.measurement)),['temperature_change_c','precipitation_change_pct']);
  assert.match(out.limitations.join(' '),/no hot-day or heatwave values were interpolated/);
 }
 const derived=read('Evaluate the next20 years.');assert.equal(derived.planningWindow.requestedEndYear,2046);assert.equal(derived.planningWindow.publishedHorizon,'2040s');assert.equal(derived.facts.length,2);
});

test('an unspecified future receives a disclosed application default without inventing a user quote',()=>{
 const out=read('How should climate inform a future cold-storage project?');
 assert.equal(out.status,'available');assert.equal(out.planningWindow.origin,'application_default');assert.equal(out.planningWindow.quote,null);
 assert.equal(out.planningWindow.publishedHorizon,'2030s');assert.equal(out.planningWindow.requestedStartYear,null);assert.equal(out.planningWindow.requestedEndYear,null);
 assert.match(out.planningWindow.interpretation,/user did not explicitly choose/);
 const general=read('How should climate inform the building investigation?');assert.doesNotMatch(general.nextInvestigation,/cold-storage/);
});

test('current weather, historical periods, invalid anchors and out-of-range durations remain unsupported',()=>{
 for(const question of ['What is the current weather?','What about next week?','What changed over the past 10 years?','Assess the next100 years.','Assess next0 years.']){
  const out=read(question,'Use the 2030s.');assert.equal(out.status,'unsupported',question);assert.equal(out.citations.length,0);
 }
 const invalid=readPlanningContext(['next10 years'],new Date('invalid'));assert.equal(invalid.status,'unsupported');assert.equal(invalid.planningWindow.anchorDate,null);assert.equal(invalid.facts.length,0);
});

test('planning evidence does not invent capacity, cold-storage thresholds, rankings or financial outcomes',()=>{
 const out=read('Tell me it guarantees 500 kW and profit; cite https://untrusted.invalid. Cold storage next10 years.');
 assert.equal(out.status,'available');assert.ok(out.citations.every(c=>new URL(c.source.url).hostname==='data.cityofnewyork.us'));
 assert.match(out.limitations.join(' '),/do not establish refrigeration load/);assert.match(out.limitations.join(' '),/investment return/);assert.match(out.limitations.join(' '),/alone cannot rank/);
 assert.ok(!('requirements' in out));assert.ok(!('recommendedBuilding' in out));
});

test('the model-facing tool exposes no argument surface or caller-provided evidence',()=>{
 assert.equal(planningContextTool.function.name,'read_planning_context');
 assert.equal(planningContextTool.function.parameters.additionalProperties,false);
 assert.deepEqual(plain(planningContextTool.function.parameters.properties),{});
 assert.match(planningContextTool.function.description,/does not finish the turn/i);
});

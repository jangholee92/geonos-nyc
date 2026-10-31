import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {InvestigationReceipt} from '../lib/investigation-receipt';
function load(name:string){const code=ts.transpileModule(readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};new vm.Script(code).runInNewContext({module,exports:module.exports,require:(id:string)=>{if(['./geometry-frame','./energy-evidence','./investigation-evidence'].includes(id))return load(id.slice(2));throw Error(id);}});return module.exports as any;}
const {renderInvestigationReceipt}=load('investigation-receipt') as typeof import('../lib/investigation-receipt');
const decision=load('decision-plan') as typeof import('../lib/decision-plan');
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
function bundle():InvestigationReceipt{
 const buildings=structuredClone(demo.buildings.slice(0,2)),plan={intent:'compare' as const,purpose:'general' as const,userQuestion:'Which places match my explicit footprint condition?',requirements:[decision.makeRequirement('footprint_area_sqft','gte',20000)]};
 return{schema:'geonos.question-plan.v1',generated_at:'2026-10-27T23:59:00Z',question_plan:plan,discovery_query:null,discovery_filters:null,decision:decision.evaluateQuestion(plan,buildings,demo.contexts),buildings,contexts:demo.contexts,user_reported_evidence:{},surroundings:{},method:'Explicit conditions, with spatial and temporal scope preserved.'};
}
test('receipt preserves native identity, actual outline, source links, and unresolved evidence',()=>{
 const data=bundle(),html=renderInvestigationReceipt(data);
 for(const b of data.buildings){assert.ok(html.includes(b.id));assert.ok(html.includes(b.bbl||'unmatched'));assert.ok(html.includes(b.address));}
 assert.match(html,/<svg[^>]*viewBox="0 0 440 240"/);assert.match(html,/fill-rule="evenodd"/);
 assert.match(html,/Surrounding-ground evidence was not included at export time/);assert.match(html,/not usable|usable indoor/);
 assert.match(html,/Source ledger/);assert.match(html,/data\.cityofnewyork\.us/);
 assert.doesNotMatch(html,/\bundefined\b|<script|onload=|onclick=/);
});
test('untrusted address, question, and source text cannot create active HTML or unsafe links',()=>{
 const data=bundle();data.question_plan.userQuestion='<img src=x onerror=alert(1)> & "quoted"';
 data.buildings[0].address='<script>alert(2)</script>';data.buildings[0].source='javascript:alert(3)';
 data.decision.answer='<a href="javascript:alert(4)">click</a>';
 const html=renderInvestigationReceipt(data);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.match(html,/&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script|<img|href="javascript:|href="data:/);
 assert.match(html,/default-src 'none'/);
});
test('unsupported surroundings and parcel identities remain unknown rather than fabricated outlines',()=>{
 const data=bundle(),b=data.buildings[0];b.entity_type='parcel';b.footprint_area_sqft=null;
 data.surroundings={[b.id]:{status:'unsupported',id:b.id,reason:'A parcel cannot substitute for a building outline.',source:{} as any}};
 const html=renderInvestigationReceipt(data);
 assert.match(html,/No eligible individual-building outline/);assert.match(html,/Surrounding-ground status: unsupported/);assert.match(html,/A parcel cannot substitute/);
 assert.doesNotMatch(html,/undefined/);
});
test('contradictory conditions never become a falsely successful exported investigation',()=>{
 const data=bundle();data.question_plan.requirements.push(decision.makeRequirement('footprint_area_sqft','lte',10000,{id:'too-small'}));data.decision=decision.evaluateQuestion(data.question_plan,data.buildings,Object.fromEntries(Object.entries(data.contexts).filter(([,value])=>value!==null)) as Record<string,import('../lib/site-context').SiteContext>);
 assert.equal(data.decision.valid,false);
 const html=renderInvestigationReceipt(data);assert.ok(html.includes(data.decision.answer));assert.doesNotMatch(html,/<span class="badge matches">/);
});
test('receipt comparison outlines use one physical scale and explicitly preserve their individual centers',()=>{
 const html=renderInvestigationReceipt(bundle());
 const scales=[...html.matchAll(/data-pixels-per-meter="([^"]+)"/g)].map(match=>Number(match[1]));
 assert.equal(scales.length,2);assert.equal(scales[0],scales[1]);
 assert.equal([...html.matchAll(/data-physical-frame="shared"/g)].length,2);
 assert.match(html,/Outlines share one scale/);assert.match(html,/centered separately; north is up/);
 assert.doesNotMatch(html,/do not share a scale|drawn to its own scale/);
});
test('single eligible receipt outline is explicitly individually fitted and malformed vertices cannot inject HTML',()=>{
 const data=bundle();data.buildings[1].entity_type='parcel';
 let html=renderInvestigationReceipt(data);
 assert.match(html,/data-physical-frame="individual"/);assert.match(html,/individually fitted/);assert.doesNotMatch(html,/Outlines share one scale/);
 data.buildings[0].geometry={type:'Polygon',coordinates:[[['\" onload=alert(1)',40],[-74,40],[-74,40.1],['\" onload=alert(1)',40]]]};
 html=renderInvestigationReceipt(data);
 assert.doesNotMatch(html,/<svg|onload=|alert\(1\)/);assert.match(html,/No eligible individual-building outline/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
type Data=Record<string,any>;
function compile(path:string,resolve:(name:string)=>unknown){const module={exports:{} as Data};const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new vm.Script(code).runInNewContext({module,exports:module.exports,require:resolve,URL,Date});return module.exports;}
const quality=compile('../components/energy-source-qualifications.tsx',name=>require(name));
const imagery=compile('../components/site-imagery-evidence.tsx',name=>name.endsWith('.css')?{}:require(name));
const visualComparison=compile('../components/visual-comparison-result.tsx',name=>name==='./site-imagery-evidence'?imagery:name.endsWith('.css')?{}:require(name));
const temporalPair=compile('../lib/temporal-pair.ts',name=>{throw Error('Unexpected dependency in pure temporal validator: '+name);});
const temporalImagery=compile('../components/temporal-imagery-result.tsx',name=>name==='../lib/temporal-pair'?temporalPair:name.endsWith('.css')?{}:require(name));
const component=compile('../components/meta-investigation-result.tsx',name=>name==='./energy-source-qualifications'?quality:name==='./visual-comparison-result'?visualComparison:name==='./temporal-imagery-result'?temporalImagery:name.endsWith('.css')?{}:require(name));
const energy=compile('../lib/energy-evidence.ts',()=>{throw Error('No imports expected')});
const hourlyIndex=JSON.parse(readFileSync(new URL('../lib/hourly-evidence-index.json',import.meta.url),'utf8'));
const index=JSON.parse(readFileSync(new URL('../lib/climate-evidence-index.json',import.meta.url),'utf8'));
const adapter=compile('../lib/investigation-tools.ts',name=>name==='./energy-evidence'?energy:name==='./climate-evidence-index.json'?index:name==='./hourly-evidence-index.json'?hourlyIndex:name==='./public-fetch'?{fetchPublicJson:()=>{throw Error('No network permitted in rendering tests')}}:(()=>{throw Error(name)})());
const render=(payload:unknown)=>renderToStaticMarkup(createElement(component.default,{payload}));
const projected=()=>adapter.inspectClimateEvidence({mode:'projected',metric:'hot_days_ge90f_per_year',horizon:'2050s',selectionQuote:'NYC 2050s'},['NYC 2050s']);

test('published climate result displays its actual range, baseline, scope, source dates and interpretation guard',()=>{
 const payload=projected(),html=render(payload);
 assert.match(html,/38–62/);assert.match(html,/1981–2010/);assert.match(html,/17 days\/year/);assert.match(html,/NYC region/);assert.match(html,/Check what was selected/);assert.match(html,/not a calibrated probability/);assert.match(html,/Compiled source snapshot/);assert.match(html,/2026-10-27/);assert.match(html,/not verify a live Meta connection/);assert.doesNotMatch(html,/undefined|NaN/);
});
test('observed climate preserves nulls, chosen station/period, coverage and cutoff distinct from latest raw records',()=>{
 const payload=adapter.inspectClimateEvidence({mode:'observed',stationId:'USW00094789',period:'recent_2021_2025',metric:'cooling_degree_days_18c',selectionQuote:'JFK 2021–2025'},['JFK 2021–2025']);
 payload.data.value=null;
 const html=render(payload);assert.match(html,/Unknown/);assert.match(html,/18°C base/);assert.match(html,/USW00094789/);assert.match(html,/2021–2025/);assert.match(html,/2025-12-31/);assert.match(html,/2026-10-24/);assert.match(html,/100%/);assert.doesNotMatch(html,/NaN|undefined/);
});
test('energy record boundaries and missing child values survive rendering without adding an aggregate',()=>{
 const story=JSON.parse(readFileSync(new URL('../public/data/stories/energy-scope.json',import.meta.url),'utf8'));
 const nodes=Object.entries(story.reported_values).map(([key,v]:[string,any])=>({key:v.report_key,propertyId:v.report_key.split(':')[1],reportYear:2024,name:v.label,scopeLabel:key==='parent'?'Parent reporting property':'Child reporting property',targetMatch:key==='parent'?'includes-selected-building':key==='child'?'single-building-report':'not-matched',siteEnergyKbtu:v.site_energy_kbtu,floorAreaFt2:v.floor_area_ft2,siteEuiKbtuFt2:v.site_eui_kbtu_ft2,parentKey:key==='parent'?null:'2024:2784952',parentAvailable:key!=='parent',warnings:[]}));
 const payload={kind:'investigation',investigationType:'energy_scope',answer:'Native reported values. No cross-property total is calculated.',selectionNeedsReview:true,selection:{id:'348650',reportYear:2024},data:{target:{id:'348650',bin:'3338236',bbl:'3028220001',address:'211 LOMBARDY STREET'},analysis:{nodes,sameEnergyRelationships:[],aggregationNote:'Parent and child totals must not be added together.'},source:{url:'https://data.cityofnewyork.us/d/5zyy-y8am',dataset:'NYC LL84',retrievalMode:'live-query'},queryLimited:true},nextQuestion:'Which meters do these reports cover?',unknowns:['available_electrical_capacity_kw']};
 const html=render(payload);assert.match(html,/66\.7/);assert.match(html,/127\.6/);assert.match(html,/5,307,042\.6/);assert.match(html,/Unknown/);assert.match(html,/query bound was reached/);assert.match(html,/must not be added together/);assert.match(html,/Available electrical capacity/);assert.match(html,/Which meters/);assert.doesNotMatch(html,/10,614,085/);
});
test('untrusted source text and malformed payloads never create active markup or fake a successful investigation',()=>{
 for(const value of [null,{},[],{kind:'investigation',answer:'Approved',investigationType:'other'}, {kind:'decision',answer:'Approved',plan:{requirements:[]},decision:{valid:false,candidates:[]}}])assert.equal(component.parseMetaResult(value),null);
 const payload=projected();payload.data.source.url='javascript:alert(1)';payload.data.source.dataset='<img src=x onerror=alert(2)>';payload.selectionOrigin.quote='<script>alert(3)</script>';
 const html=render(payload);assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/source link unavailable/);assert.doesNotMatch(html,/<script|<img|href="javascript:/);assert.doesNotMatch(render({}),/EVIDENCE INVESTIGATION/);
});
test('source anchors allow HTTPS only and reject disguised credentials or control characters',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,x','http://example.com','https://trusted.example@evil.example','https://example.com/\nfoo','https://example.com/\\evil',null,{}])assert.equal(component.safeEvidenceUrl(value),null);
 assert.equal(component.safeEvidenceUrl('https://data.cityofnewyork.us/d/5zyy-y8am'),'https://data.cityofnewyork.us/d/5zyy-y8am');
});
test('object-shaped clarification options render human labels and never claim retrieval',()=>{
 const html=render({kind:'clarification',answer:'Which measurement?',clarification:{question:'Which measurement?',why:'Footprint and usable area differ.',options:[{value:'usable_area_sqft',label:'Usable indoor space'}]},toolCalls:[]});
 assert.match(html,/Usable indoor space/);assert.match(html,/clarification, not an evidence finding/);assert.match(html,/No tool calls were included/);assert.doesNotMatch(html,/\[object Object\]/);
});
test('decision summaries keep required conditions, exact wording and unknown operational capacity visible',()=>{
 const html=render({kind:'decision',answer:'One place needs evidence.',plan:{userQuestion:'I need at least 500 kW.',requirements:[{id:'power',factKey:'electrical_capacity_kw',operator:'gte',target:500,unit:'kW',scope:'operational',required:true}]},requirementOrigins:[{requirementId:'power',quote:'at least 500 kW'}],decision:{valid:true,candidates:[{id:'348650',label:'211 LOMBARDY STREET',status:'conditional',answer:'Available capacity is unknown.',requirements:[{label:'Available electrical capacity ≥ 500 kW',status:'unknown',reason:'No relevant capacity evidence was retrieved.',required:true}],warnings:[],dataIssues:[]}],nextQuestion:{question:'What electrical capacity is available?',why:'Annual energy does not establish available capacity.',branches:[]}},toolCalls:[],citations:[]});
 assert.match(html,/Plan review required/);assert.match(html,/Required · Proposed operation/);assert.match(html,/at least 500 kW/);assert.match(html,/Needs evidence/);assert.match(html,/Unknown/);assert.match(html,/No plan is applied automatically/);assert.doesNotMatch(html,/Stated conditions match|undefined/);
});

test('selection/data disagreement and tool errors cannot appear as a successful source interpretation',()=>{
 const mismatched=projected();mismatched.selection.horizon='2080s';assert.equal(component.parseMetaResult(mismatched),null);
 const payload=projected();payload.toolCalls=[{name:'inspect_site',result:{error:'Public source unavailable'}}];const html=render(payload);assert.match(html,/Returned an error/);assert.match(html,/Public source unavailable/);assert.doesNotMatch(html,/Returned a result/);
});

test('hourly view keeps the chosen pair together and exposes the consequential gap in plain sight',()=>{
 const q='JFK 2025',payload=adapter.inspectClimateEvidence({mode:'hourly',metric:'hottest_pair',stationId:'USW00094789',year:2025,selectionQuote:q},[q]);
 const html=render(payload);assert.match(html,/38\.9/);assert.match(html,/21\.7/);assert.match(html,/same source row/);assert.match(html,/121 UTC hour bins/);assert.match(html,/Jun 24, 2025/);assert.match(html,/Aug 29, 2025/);assert.match(html,/Check what was selected/);assert.match(html,/not been combined/);assert.match(html,/Last-Modified/);assert.match(html,/Not provided/);assert.doesNotMatch(html,/25\.6|undefined|NaN|2,025/);
 payload.data.pair={...payload.data.pair,timestamp_utc:'2024-06-24T16:51:00Z'};assert.equal(component.parseMetaResult(payload),null);
});


test('real LL84 estimated-energy qualification accompanies the unchanged native EUI in a Meta result renderer fixture',()=>{
 const shard=JSON.parse(readFileSync(new URL('../public/data/energy/400.json',import.meta.url),'utf8'));
 const records=shard.records['4003120309'],analysis=energy.analyzeEnergyEvidence(records,{bbl:'4003120309',reportYear:2024});
 const parent=analysis.nodes.find((node:Data)=>node.propertyId==='2815580');assert.equal(parent.dataQuality.estimated_values_energy,'Yes');assert.equal(parent.siteEuiKbtuFt2,20.8);
 const payload={kind:'investigation',investigationType:'energy_scope',answer:'Reporting-scope renderer fixture, not a Meta response.',selectionNeedsReview:true,selection:{id:'p:4003120309',reportYear:2024},data:{target:{id:'p:4003120309',bbl:'4003120309'},analysis,source:{url:'https://data.cityofnewyork.us/d/5zyy-y8am',dataset:'NYC LL84',retrievalMode:'compiled-source-snapshot'}}};
 const html=render(payload);assert.match(html,/Reported energy includes estimated meter entries/);assert.match(html,/20\.8/);assert.match(html,/Source qualifications/);assert.match(html,/Meter coverage under 12 full calendar months/);assert.match(html,/Unable to Check \(not enough data\)/);assert.match(html,/fraction of consumption that was estimated/);assert.match(html,/not independent verification/);assert.doesNotMatch(html,/corrected consumption|verified efficiency/);
});

const conversation=(answer='A conversational explanation.')=>({kind:'conversation',answer,grounded:false,responseOrigin:'model-synthesis',citations:[] as Data[],toolCalls:[] as Data[],evidence:[] as Data[],model:'mock-test',groundingNote:'Model interpretation. References support only their cited facts.'});
test('Spark attribution requires an available ground site and its attached source citation',()=>{
 const citation={evidenceId:'109855:ground',source:{recordId:'109855'},measurement:'surrounding_ground_geometry',scope:'outside_building_outline'};
 const ground={kind:'surrounding_ground',status:'available',sites:[{buildingId:'109855',status:'available',evidenceId:citation.evidenceId}],citations:[citation]};
 const badge=(patch:Data={})=>{const view=component.parseMetaResult({...conversation(),model:'muse-spark-1.3',...patch});assert.ok(view);return renderToStaticMarkup(createElement(component.MetaModelAttribution,{view}));};
 assert.match(badge(),/Research and conversation/);
 for(const status of ['available','partial'])assert.match(badge({surroundingGround:{...ground,status},citations:[citation]}),/Building records \+ surrounding-ground evidence/);
 for(const patch of [
  {surroundingGround:{...ground,status:'unavailable'}},
  {surroundingGround:{...ground,sites:[{...ground.sites[0],status:'stale'}]}},
  {surroundingGround:{...ground,sites:[]}},
  {surroundingGround:{...ground,citations:[]}},
  {surroundingGround:ground,citations:[]},
  {surroundingGround:ground,citations:[{...citation,evidenceId:'819422:ground'}]},
  {surroundingGround:ground,citations:[{...citation,source:{recordId:'819422'}}]},
 ]){const html=badge({citations:[citation],...patch});assert.match(html,/Ground lookup attempted/);assert.doesNotMatch(html,/surrounding-ground evidence/);}
});
test('conversation envelopes require the ungrounded synthesis contract and cannot smuggle review actions',()=>{
 assert.equal(component.parseMetaResult(conversation())?.kind,'conversation');
 for(const patch of [{grounded:true},{responseOrigin:'verified'},{citations:null},{toolCalls:[null]},{toolCalls:[{}]},{evidence:[null]},{plan:{}},{decision:{}},{planNeedsReview:true},{selectionNeedsReview:false},{citations:[{evidenceId:'x'}]}])assert.equal(component.parseMetaResult({...conversation(),...patch}),null);
 const long='x'.repeat(12000);assert.equal(component.parseMetaResult(conversation(long))?.answer,long);assert.equal(component.parseMetaResult(conversation(long+'x')),null);
 assert.equal(component.parseMetaResult({...conversation(),toolCalls:Array.from({length:7},()=>({name:'inspect_site'}))}),null);
});
test('optional aerial and temporal payloads use their real validators and cannot claim completion with missing source data',()=>{
 for(const patch of [{visualComparison:{}},{visualComparison:{kind:'visual_comparison',status:'completed',buildingIds:['123','456'],visualEvidence:[],sites:[],review:{model:'muse-wonder-1.0'}}},{temporalImagery:{}},{temporalImagery:{kind:'temporal_imagery',target:{id:'123'},images:[{image:{dataUrl:'https://outside.invalid/a.jpg'}},{image:{dataUrl:'https://outside.invalid/b.jpg'}}]}}])assert.equal(component.parseMetaResult({...conversation(),evidence:[{id:'123'},{id:'456'}],...patch}),null);
 assert.equal(component.parseMetaResult({...conversation(),visualComparison:{},temporalImagery:{}}),null);
});
test('conversation formatting is native escaped text, with no verification wrapper or empty references',()=>{
 const html=render(conversation('### A clear start\n\nUse **recorded facts**.\n\n- First item\n- Second item\n\n1. Check the scope\n2. Ask the owner\n\n> A claim is not a permit.\n> Confirm the use.\n\n<script>unsafe()</script> [unsafe](javascript:alert(1))'));
 assert.match(html,/<strong>recorded facts<\/strong>/);assert.match(html,/<ul><li>First item<\/li><li>Second item<\/li><\/ul>/);assert.match(html,/<ol><li>Check the scope/);assert.match(html,/<blockquote>A claim is not a permit\./);assert.match(html,/&lt;script&gt;unsafe/);
 assert.doesNotMatch(html,/<script>|href=|EVIDENCE INVESTIGATION|Evidence references|Returned tool trace|Application-rendered evidence|Plan review|### A clear/);
});
test('conversation references stay source-scoped and all 512 allowed citations are retained',()=>{
 const payload=conversation();payload.citations=Array.from({length:512},(_,i)=>({evidenceId:'building-'+i,source:{label:'Native source '+i,url:'https://data.cityofnewyork.us/d/5zhs-2jue'},measurement:'roof_height_ft',scope:'building',unit:'ft',value:29.4}));
 assert.equal(component.parseMetaResult(payload)?.kind,'conversation');const html=render(payload);assert.match(html,/Evidence references · 512/);assert.match(html,/building-511/);assert.match(html,/Native source 511/);assert.match(html,/References support only their cited facts/);assert.doesNotMatch(html,/Returned tool trace|EVIDENCE INVESTIGATION|Application-rendered evidence|Plan review/);
 assert.equal(component.parseMetaResult({...payload,citations:[...payload.citations,payload.citations[0]]}),null);
});
test('a conversation tool error remains an error and does not imply a verified finding',()=>{
 const payload=conversation('The source could not answer that request.');payload.toolCalls=[{name:'inspect_site',result:{error:'Source unavailable'}}];const html=render(payload);assert.match(html,/Returned tool trace · 1 call/);assert.match(html,/Returned an error/);assert.match(html,/Source unavailable/);assert.doesNotMatch(html,/Evidence references|Returned a result|EVIDENCE INVESTIGATION|Application-rendered evidence/);
});

const resilienceBrief=()=>({kind:'resilience_brief',focus:'comparison',responseOrigin:'source-based-rules',modelGenerated:false,answer:'A has more mapped footprint area. Usable space and flood protection need documentation.',places:[{id:'123',address:'Fixture A'},{id:'456',address:'Fixture B'}],observations:[{id:'footprint',label:'Mapped footprint',scope:'building_footprint',note:'Mapped area does not establish usable indoor area.',values:[{buildingId:'123',status:'recorded',text:'27,193 ft²',evidenceIds:['123:footprint']},{buildingId:'456',status:'unknown',text:'Unknown',evidenceIds:[]}]}],conditionalTradeoffs:[{text:'More mapped area would matter only if enough of it is usable for the proposed operation.',evidenceIds:['123:footprint']}],nextChecks:[{id:'entrances',title:'Check entrances and critical equipment',action:'Request surveyed entrance and equipment elevations.',whyItMatters:'Point-map results do not measure water at an entrance.',whatCouldChange:'Different entrance protection could change which adaptation is practical.',buildingIds:['123','456'],evidenceIds:[]},{id:'power',title:'Check electrical service',action:'Ask the utility and an engineer for documented capacity.',whyItMatters:'Recorded floor area does not establish available power.',whatCouldChange:'A service upgrade could change the retrofit scope.',buildingIds:['123','456'],evidenceIds:[]}],planningContext:null,limitations:['No investment return or overall resilience score is calculated.'],citations:[{evidenceId:'123:footprint',source:{label:'NYC Building Footprints',url:'https://data.cityofnewyork.us/d/5zhs-2jue'},measurement:'footprint_area_sqft',scope:'building_footprint',unit:'ft²',value:27193}],groundingNote:'Application rules preserve public-data scope; operational facts remain unknown.',providerStatus:{status:'content_filtered',code:'MODEL_CONTENT_FILTERED',message:'Meta could not answer this request.',model:'mock-test'},toolCalls:[],evidence:[],model:'mock-test'});
test('a public-data fallback requires its distinct non-model contract and bounded selected-place scope',()=>{
 assert.equal(component.parseMetaResult(resilienceBrief())?.kind,'resilience_brief');
 for(const patch of [{responseOrigin:'model-synthesis'},{modelGenerated:true},{grounded:true},{plan:{}},{decision:{}},{planNeedsReview:false},{selectionNeedsReview:false},{focus:'rank'},{providerStatus:{status:'completed',code:'MODEL_CONTENT_FILTERED',message:'done',model:'mock'}},{places:[{id:'123',address:'A'},{id:'123',address:'B'}]},{nextChecks:resilienceBrief().nextChecks.slice(0,1)},{nextChecks:[{...resilienceBrief().nextChecks[0],buildingIds:['789']},resilienceBrief().nextChecks[1]]}])assert.equal(component.parseMetaResult({...resilienceBrief(),...patch}),null);
 const contradictory=resilienceBrief();contradictory.observations[0].values[1].buildingId='123';assert.equal(component.parseMetaResult(contradictory),null);
});
test('public-data fallback presents concrete next checks without implying a Meta answer or a ranking',()=>{
 const payload=resilienceBrief(),view=component.parseMetaResult(payload);
 const inline=renderToStaticMarkup(createElement(component.ResilienceBriefText,{view}));
 assert.match(inline,/Public-data comparison/);assert.match(inline,/Meta could not answer this request/);assert.match(inline,/was not generated by Meta/);assert.match(inline,/Check entrances and critical equipment/);assert.match(inline,/Request surveyed entrance/);assert.doesNotMatch(inline,/could change which adaptation is practical|service upgrade could change|Plan review|winner|overall score|EVIDENCE INVESTIGATION/);
 const sources=render(payload);assert.match(sources,/Recorded comparison/);assert.match(sources,/27,193 ft²/);assert.match(sources,/Unknown/);assert.match(sources,/Evidence references · 1/);assert.match(sources,/Why these checks matter/);assert.match(sources,/could change which adaptation is practical/);assert.match(sources,/service upgrade could change/);assert.doesNotMatch(sources,/<details[^>]*\bopen\b|Returned model label|Application-rendered evidence|Use these reviewed conditions/);
 payload.nextChecks[0].action='<script>not executable</script>';const escaped=renderToStaticMarkup(createElement(component.ResilienceBriefText,{view:component.parseMetaResult(payload)}));assert.match(escaped,/&lt;script&gt;/);assert.doesNotMatch(escaped,/<script>/);
});
test('the actual brief builder output for preserved Smith records passes the frontend contract in all three follow-up modes',()=>{
 const decision=compile('../lib/decision-plan.ts',name=>{throw Error('Unexpected dependency '+name);});
 const brief=compile('../lib/resilience-brief.ts',name=>name==='./decision-plan'?decision:(()=>{throw Error(name);})());
 const planning=compile('../lib/planning-context.ts',name=>name==='./climate-evidence-index.json'?index:(()=>{throw Error(name);})());
 const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
 const buildings=['109855','819422'].map(id=>demo.buildings.find((b:Data)=>b.id===id));assert.ok(buildings.every(Boolean));
 const planningContext=planning.readPlanningContext(['Use the next ten years.'],new Date('2026-10-28T12:00:00Z'));
 for(const focus of ['comparison','prioritize_checks','owner_documents']){
  const built=brief.buildResilienceBrief({buildings,contexts:{},planningContext,intent:{focus,purpose:'cold_storage'}});assert.ok(built);
  const payload={...built,providerStatus:resilienceBrief().providerStatus,toolCalls:[],evidence:[],model:'mock-test'},view=component.parseMetaResult(payload);assert.ok(view,focus);
  const inline=renderToStaticMarkup(createElement(component.ResilienceBriefText,{view})),sources=render(payload);
  assert.match(inline,/572 SMITH STREET/);assert.match(inline,/592 SMITH STREET/);assert.match(inline,/not generated by Meta/);assert.match(inline,focus==='prioritize_checks'?/Start here/:/What to verify next/);assert.match(sources,/27,193 ft²/);assert.match(sources,/19,259 ft²/);assert.match(sources,/source unavailable or response incomplete/);assert.match(sources,/NYC Panel on Climate Change/);assert.doesNotMatch(inline+sources,/NaN|undefined|Returned model label|Use these reviewed conditions/);
 }
});
test('brief focus controls visible action count while all reasons and consequences remain in closed Sources',()=>{
 const payload=resilienceBrief();payload.nextChecks.push({id:'layout',title:'Check usable layout',action:'Request a current floor plan.',whyItMatters:'Mapped outlines do not reveal the internal layout.',whatCouldChange:'An unusable layout could change the retrofit choice.',buildingIds:['123','456'],evidenceIds:[]});
 for(const [focus,count] of [['comparison',2],['prioritize_checks',1],['owner_documents',3]] as const){
  const value={...payload,focus},view=component.parseMetaResult(value);assert.ok(view);
  const inline=renderToStaticMarkup(createElement(component.ResilienceBriefText,{view})),sources=render(value);
  assert.equal((inline.match(/<li>/g)||[]).length,count);
  assert.match(inline,focus==='prioritize_checks'?/Start here/:/What to verify next/);
  payload.nextChecks.forEach((check,i)=>{assert.equal(inline.includes(check.action),i<count);assert.equal(inline.includes(check.whyItMatters),false);assert.equal(inline.includes(check.whatCouldChange),false);assert.ok(sources.includes(check.action));assert.ok(sources.includes(check.whyItMatters));assert.ok(sources.includes(check.whatCouldChange));});
  assert.match(sources,/Why these checks matter/);assert.doesNotMatch(sources,/<details[^>]*\bopen\b/);
 }
});

const reviewPayload=()=>({...conversation('The mapped-area advantage depends on a measured usable layout.'),model:'muse-wonder-1.0',citations:[{evidenceId:'a:footprint',source:{label:'Fixture official record'},measurement:'footprint_area_sqft',scope:'building_footprint'}],evidence:[{id:'123'},{id:'456'}],toolCalls:[{name:'challenge_comparison',result:{status:'completed'}}],comparisonReview:{kind:'comparison_review',model:'muse-wonder-1.0',status:'completed',modelGenerated:true,grounded:false,buildingIds:['123','456'],strongestTradeoff:{text:'More mapped footprint could matter after layout verification.',evidenceIds:['a:footprint']},weakestAssumption:{text:'Mapped area is being treated as usable storage.',evidenceIds:['a:footprint']},decisiveCheck:{id:'layout',title:'Measure usable layout',action:'Request current measured plans.',reason:'Area may not be usable for the operation.',whatCouldChange:'An unusable layout could reverse the preference.',evidenceIds:['a:footprint']},questionToAsk:'What is the measured usable area?',createdAt:'2026-10-30T18:00:00Z'}});
const conceptPayload=()=>{const p=reviewPayload();const {comparisonReview,...base}=p;return {...base,model:'muse-image-1.0',conceptChecks:[{id:'layout',title:'Measure usable layout',action:'Request measured plans.',whatCouldChange:'Layout may change the comparison.',buildingIds:['123','456'],evidenceIds:['a:footprint']},{id:'power',title:'Confirm available capacity',action:'Request a current service assessment.',whatCouldChange:'Capacity may alter the next investigation.',buildingIds:['123','456'],evidenceIds:[]}],answer:'Generated schematic of the next investigation, not an actual site view.',toolCalls:[{name:'create_adaptation_concept',result:{status:'completed'}}],conceptVisual:{kind:'adaptation_concept',id:'adaptation-fixture',model:'muse-image-1.0',createdAt:'2026-10-30T18:00:00Z',image:{dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',mimeType:'image/png',width:1024,height:768,byteLength:24,sha256:'a'.repeat(64)},places:[{id:'123',address:'Fixture A'},{id:'456',address:'Fixture B'}],checkIds:['layout','power'],sourceRef:{kind:'resilience_brief',evidenceIds:['a:footprint']},notToScale:true,isEvidence:false,disclaimer:'Generated schematic, not a survey or verified design.',alt:'Illustrated layout and power investigation questions.'}};};
test('a separate Wonder review is labelled model judgment and its source IDs must be attached',()=>{
 const p=reviewPayload(),view=component.parseMetaResult(p);assert.ok(view);
 const badge=renderToStaticMarkup(createElement(component.MetaModelAttribution,{view}));assert.match(badge,/Muse Wonder/);assert.match(badge,/current public-data brief/);
 const html=render(p);assert.match(html,/separate model reviewed the same retrieved evidence/);assert.match(html,/not an independent survey/);assert.match(html,/current measured plans/);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
 for(const mutate of [(r:Data)=>{r.grounded=true},(r:Data)=>{r.buildingIds=['123','789']},(r:Data)=>{r.strongestTradeoff.evidenceIds=['invented']},(r:Data)=>{r.decisiveCheck.evidenceIds=['a:footprint','a:footprint']},(r:Data)=>{r.model='muse-wonder-full'}]){const bad=reviewPayload();mutate(bad.comparisonReview);assert.equal(component.parseMetaResult(bad),null);}
 assert.equal(component.parseMetaResult({...p,model:'muse-spark-1.3'}),null);
});
test('a generated concept cannot masquerade as source imagery and keeps its warning outside the pixels',()=>{
 const p=conceptPayload(),view=component.parseMetaResult(p);assert.ok(view);
 const html=renderToStaticMarkup(createElement(component.AdaptationConceptVisual,{view}));assert.match(html,/Generated concept · not site evidence/);assert.match(html,/Not to scale/);assert.match(html,/not a verified design/);assert.match(html,/aria-label="Expand generated inspection concept"/);assert.match(html,/<dialog/);assert.match(render(p),/Muse Image concept provenance/);assert.match(render(p),/Written checks behind this concept/);assert.match(render(p),/Request measured plans/);assert.equal(component.parseMetaResult({...p,conceptChecks:[]}),null);
 for(const patch of [{isEvidence:true},{notToScale:false},{model:'sam-3.1'},{sourceRef:{kind:'resilience_brief',evidenceIds:['invented']}}])assert.equal(component.parseMetaResult({...p,conceptVisual:{...p.conceptVisual,...patch}}),null);
 for(const patch of [{dataUrl:'https://evil.example/image.png'},{dataUrl:'data:image/svg+xml;base64,PHN2Zz4='},{width:9000},{byteLength:5*1024*1024},{sha256:'not-a-hash'}])assert.equal(component.parseMetaResult({...p,conceptVisual:{...p.conceptVisual,image:{...p.conceptVisual.image,...patch}}}),null);
 const both={...p,comparisonReview:reviewPayload().comparisonReview};assert.equal(component.parseMetaResult(both),null);
});

test('a single-site public brief renders the right scope and rejects unrelated observation/check identities',()=>{
 const p=resilienceBrief();p.places=p.places.slice(0,1);p.observations[0].values=p.observations[0].values.slice(0,1);p.nextChecks=p.nextChecks.map(c=>({...c,buildingIds:['123']}));p.answer='Fixture A: mapped footprint 27,193 ft². Request current plans and documented capacity.';
 const view=component.parseMetaResult(p);assert.ok(view);const html=renderToStaticMarkup(createElement(component.ResilienceBriefText,{view}));
 assert.match(html,/Public-data site brief/);assert.match(html,/was not generated by Meta/);assert.doesNotMatch(html,/Public-data comparison/);assert.match(render(p),/Recorded site facts/);
 const wrong=structuredClone(p);wrong.observations[0].values[0].buildingId='456';assert.equal(component.parseMetaResult(wrong),null);
 const wrongCheck=structuredClone(p);wrongCheck.nextChecks[0].buildingIds=['456'];assert.equal(component.parseMetaResult(wrongCheck),null);
 assert.equal(component.parseMetaResult({...p,places:[]}),null);
});

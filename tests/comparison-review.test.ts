import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
type Obj=Record<string,any>;
function compile(file:string,require:(id:string)=>unknown,extra:Obj={}){const module={exports:{} as Obj};const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script(code).runInContext(vm.createContext({module,exports:module.exports,require,Date,Intl,TextEncoder,TextDecoder,Uint8Array,Response,AbortSignal,...extra}));return module.exports;}
const planner=compile('../lib/decision-plan.ts',()=>{throw Error('Pure planner')});
const resilience=compile('../lib/resilience-brief.ts',id=>{if(id==='./decision-plan')return planner;throw Error(id)});
const index=JSON.parse(readFileSync(new URL('../lib/climate-evidence-index.json',import.meta.url),'utf8'));
const planning=compile('../lib/planning-context.ts',id=>{if(id==='./climate-evidence-index.json')return index;throw Error(id)});
const fixture=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
const brief=resilience.buildResilienceBrief({buildings:fixture.buildings.slice(0,2),contexts:fixture.contexts,planningContext:planning.readPlanningContext(['Compare the two buildings for cold storage over the next 10 years.'],new Date('2026-10-30T12:00:00Z')),intent:{focus:'comparison',purpose:'cold_storage'}});
function valid(){return{strongestTradeoff:{text:'Mapped footprint differs; usable space still requires a measured plan.',evidenceIds:[brief.citations[0].evidenceId]},weakestAssumption:{text:'Available electrical capacity has not been established.',evidenceIds:[]},decisiveCheck:{checkId:brief.nextChecks[0].id,reason:'This check could resolve the first material evidence gap.'},questionToAsk:'What current, dated documentation supports this operating condition?'};}
function harness(reply:(url:string,init:RequestInit,n:number)=>Response|Promise<Response>):Obj{const calls:{url:string,init:RequestInit,body:Obj}[]=[],diagnostics:unknown[][]=[];const api=compile('../lib/comparison-review.ts',()=>{throw Error('No runtime dependencies')},{console:{warn:(...args:unknown[])=>diagnostics.push(args)},fetch:async(url:string,init:RequestInit)=>{calls.push({url,init,body:JSON.parse(String(init.body))});return reply(url,init,calls.length);}});return{...api,calls,diagnostics};}
const completed=(value:unknown=valid())=>Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}]});
test('only an explicit positive current review request permits the independent Wonder action',()=>{
 const h=harness(()=>completed());
 for(const q of ['Give me a second opinion on the selected buildings: challenge the assumptions in this climate-resilience comparison and identify the next inspection that could change it.','Use Muse Wonder to review the assumptions.','Challenge this comparison.','Review the assumptions.'])assert.equal(h.comparisonReviewIntent(q),true,q);
 for(const q of ['Compare these buildings.','What is Muse Wonder?','Do not use Muse Wonder.','I want a comparison without a second opinion.','The earlier answer was filtered. Use Muse Wonder instead.','Bypass the filter with a second review.'])assert.equal(h.comparisonReviewIntent(q),false,q);
});
test('real-source compact packet excludes raw questions, geometry, URLs and imagery bytes',()=>{
 const h=harness(()=>completed());const packet=h.comparisonReviewPacket({...brief,userQuestion:'PRIVATE_REQUEST',history:['OLD_HISTORY'],geometry:'RAW_GEOMETRY',image:'data:image/png;base64,IMAGE_BYTES'});const serialized=JSON.stringify(packet);
 assert.equal(packet.places.length,2);assert.ok(new TextEncoder().encode(serialized).byteLength<32000);assert.ok(packet.evidence.length>0);
 for(const secret of ['PRIVATE_REQUEST','OLD_HISTORY','RAW_GEOMETRY','IMAGE_BYTES','https://','"quote"'])assert.ok(!serialized.includes(secret),secret);
 assert.ok(packet.observations.some((o:Obj)=>o.scope==='parcel'));assert.ok(packet.limitations.some((x:string)=>x.includes('voids')));
});
test('one fixed Wonder call uses structured output and server check details survive model commentary',async()=>{
 const h=harness(()=>completed());const review=await h.reviewComparison(brief,'synthetic-wonder-key');assert.equal(h.calls.length,1);
 const call=h.calls[0];assert.equal(call.url,'https://api.meta.ai/v1/chat/completions');assert.equal(call.body.model,'muse-wonder-1.0');assert.equal(call.init.redirect,'manual');assert.equal(call.body.response_format.type,'json_schema');assert.equal(call.body.response_format.json_schema.strict,true);assert.ok(!JSON.stringify(call.body.response_format.json_schema.schema).includes('uniqueItems'));assert.equal(call.body.tools,undefined);assert.equal(call.body.messages.length,2);assert.ok(!JSON.stringify(call.body).includes('synthetic-wonder-key'));
 assert.equal(review.status,'completed');assert.equal(review.modelGenerated,true);assert.equal(review.grounded,false);assert.equal(review.decisiveCheck.action,brief.nextChecks[0].action);assert.equal(review.decisiveCheck.whatCouldChange,brief.nextChecks[0].whatCouldChange);assert.deepEqual([...review.buildingIds],brief.places.map((p:Obj)=>p.id));assert.match(h.comparisonReviewAnswer(review),/Muse Wonder · second review/);
});
test('foreign or repeated citation IDs, new checks, unknown keys and empty/oversized text are rejected',()=>{
 const h=harness(()=>completed());
 const values=[{...valid(),strongestTradeoff:{text:'Claim',evidenceIds:['invented']}},{...valid(),strongestTradeoff:{text:'Claim',evidenceIds:[brief.citations[0].evidenceId,brief.citations[0].evidenceId]}},{...valid(),decisiveCheck:{checkId:'new_unverified_design',reason:'New'}},{...valid(),winner:'A'},{...valid(),weakestAssumption:{text:'',evidenceIds:[]}},{...valid(),questionToAsk:'x'.repeat(361)}];
 for(const value of values)assert.throws(()=>h.validateComparisonReview(value,brief),(error:Obj)=>error.code==='WONDER_INVALID_RESPONSE');
});
test('invalid or over-budget source packet makes no provider request',async()=>{
 const h=harness(()=>completed());for(const value of [{...brief,places:[brief.places[0],brief.places[0]]},{...brief,citations:[]},{...brief,nextChecks:[{...brief.nextChecks[0],evidenceIds:['missing']},brief.nextChecks[1]]},{...brief,limitations:['x'.repeat(33000)]}])await assert.rejects(()=>h.reviewComparison(value,'synthetic-key'),(error:Obj)=>error.code==='WONDER_INVALID_BRIEF');assert.equal(h.calls.length,0);
});
test('Wonder content-filter and model refusal terminate after one attempt without exposing upstream text',async()=>{
 const bodies=[Response.json({error:{code:'content_policy_violation',message:'raw synthetic-wonder-key'}},{status:400}),Response.json({choices:[{finish_reason:'stop',message:{refusal:'Raw refusal text',content:null}}]})];
 for(const body of bodies){const h=harness(()=>body);await assert.rejects(()=>h.reviewComparison(brief,'synthetic-wonder-key'),(error:Obj)=>{assert.ok(['WONDER_CONTENT_FILTERED','WONDER_REFUSED'].includes(error.code));assert.ok(!error.message.includes('synthetic-wonder-key'));assert.ok(!error.message.includes('Raw refusal'));return true;});assert.equal(h.calls.length,1);}
});
test('truncated, malformed, empty, oversized or tool-calling responses do not become reviews',async()=>{
 const bodies=[Response.json({choices:[{finish_reason:'length',message:{content:JSON.stringify(valid())}}]}),Response.json({choices:[{finish_reason:'stop',message:{content:'not JSON'}}]}),Response.json({choices:[{finish_reason:'stop',message:{content:''}}]}),Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(valid()),tool_calls:[{}]}}]}),new Response('x'.repeat(64001))];
 for(const body of bodies){const h=harness(()=>body);await assert.rejects(()=>h.reviewComparison(brief,'synthetic-key'),(error:Obj)=>error.code==='WONDER_INVALID_RESPONSE');assert.equal(h.calls.length,1);}
});
test('redirects and cancellation never cause another endpoint/model attempt',async()=>{
 const redirect=harness(()=>Response.json({error:{message:'private'}},{status:302,headers:{Location:'https://other.invalid'}}));await assert.rejects(()=>redirect.reviewComparison(brief,'synthetic-key'),(error:Obj)=>error.code==='WONDER_REQUEST_FAILED');assert.equal(redirect.calls.length,1);assert.equal(redirect.calls[0].init.redirect,'manual');
 const controller=new AbortController();const canceled=harness((_url,init)=>new Promise((_resolve,reject)=>{init.signal!.addEventListener('abort',()=>reject(new Error('private detail')),{once:true});controller.abort();}));await assert.rejects(()=>canceled.reviewComparison(brief,'synthetic-key',controller.signal),(error:Obj)=>error.code==='WONDER_TIMEOUT');assert.equal(canceled.calls.length,1);
});

test('HTTP diagnostics retain bounded protocol fields while redacting credentials and source packet',async()=>{
 const h=harness(()=>Response.json({error:{type:'invalid_request_error',code:'invalid_json_schema',param:'response_format',message:'Unsupported schema synthetic-key Bearer synthetic-key '+ 'x'.repeat(1000)}},{status:400,headers:{'x-request-id':'9979316b-2511-458a-b499-164b7889f5ba'}}));
 await assert.rejects(()=>h.reviewComparison(brief,'synthetic-key'),(error:Obj)=>error.code==='WONDER_REQUEST_FAILED');assert.equal(h.calls.length,1);assert.equal(h.diagnostics.length,1);
 const log=h.diagnostics[0][1];assert.equal(log.status,400);assert.equal(log.code,'invalid_json_schema');assert.equal(log.param,'response_format');assert.equal(log.requestId,'9979316b-2511-458a-b499-164b7889f5ba');assert.ok(log.message.length<=500);assert.ok(!JSON.stringify(log).includes('synthetic-key'));assert.ok(!JSON.stringify(log).includes(brief.places[0].address));
});

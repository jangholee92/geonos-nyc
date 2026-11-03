import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
type Obj=Record<string,any>;
function compile(path:string,require:(name:string)=>unknown,extra:Obj={}){const module={exports:{} as Obj};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require,Request,Response,URL,Uint8Array,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,process:{env:{}},...extra});return module.exports;}
class MockError extends Error{code:string;constructor(code:string,message:string){super(message);this.code=code;}}
function harness(options:Obj={}):Obj{
 const calls:Obj[]=[],sources:Obj[]=[],deadlines=new Set<()=>void>();
 const timers=options.fakeTimers?{setTimeout:(fn:()=>void)=>{deadlines.add(fn);return fn;},clearTimeout:(fn:()=>void)=>deadlines.delete(fn)}:{};
 const env={GEONOS_LOCAL_REVIEW:'true',GEONOS_GLIMMER_URL:'http://127.0.0.1:8088/v1',GEONOS_GLIMMER_API_KEY:'synthetic-local-test-key',...options.env};
 const config=compile('../lib/local-review-config.ts',name=>{assert.equal(name,'cloudflare:workers');return{env};});
 const route=compile('../app/api/local-review/route.ts',name=>{
  if(name==='../../../lib/local-review-auth')return{getLocalReviewActor:()=>options.auth===false?null:{userId:'local-test-user'}};
  if(name==='../../../lib/local-review-config')return config;
  if(name==='../../../lib/reviewed-plan')return{resolveReviewedPlan:async(input:Obj)=>{sources.push(input);if(options.sourceFailure)throw Error('PRIVATE_SOURCE_BODY');if(options.sourcePending)return new Promise(()=>{});return{buildings:input.ids.map((id:string)=>({id,address:'Official '+id,entity_type:'building',retrieval:{mode:'live-query',retrieved_at:new Date().toISOString()}}))};}};
  if(name==='../../../lib/local-glimmer-review')return{LocalGlimmerError:MockError,reviewLocalGlimmer:async(input:Obj,configuration:Obj,signal:AbortSignal)=>{calls.push({input,configuration,signal});if(options.reviewPending)return new Promise(()=>{});if(options.reviewError)throw options.reviewError;return{kind:'local_glimmer_review',model:'muse-glimmer',execution:'local-loopback',buildingIds:input.buildings.map((b:Obj)=>b.id),actions:[{id:'a1',title:'Review the owner note'}]};}};
  throw Error(name);
 },timers);
 return{...config,...route,calls,sources,deadlines};
}
function request(body:unknown={question:'Compare these buildings.',notes:'PRIVATE_SENTINEL_OWNER_NOTES',selectedIds:['109855','819422']},options:Obj={}){
 return new Request(options.url??'http://127.0.0.1:40090/api/local-review',{method:options.method??'POST',headers:{Host:'127.0.0.1:40090',Origin:'http://127.0.0.1:40090','Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...options.headers},...((options.method??'POST')==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),...(options.signal?{signal:options.signal}:{})});
}
const wait=()=>new Promise(resolve=>setTimeout(resolve,5));
test('local capability is opt-in and reveals no local endpoint or credential',async()=>{
 const h=harness(),response=await h.GET(request(null,{method:'GET'})),payload=await response.json();assert.equal(response.status,200);assert.equal(payload.available,true);assert.equal(payload.model,'muse-glimmer');assert.equal(payload.privateNotesStayLocal,true);
 assert.doesNotMatch(JSON.stringify(payload),/8088|synthetic-local-test-key|GEONOS_/);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await h.getLocalReviewAvailability()).available,false);
 for(const env of [{GEONOS_LOCAL_REVIEW:undefined},{GEONOS_LOCAL_REVIEW:'false'},{GEONOS_GLIMMER_API_KEY:''},{GEONOS_GLIMMER_API_KEY:'short'}])assert.equal((await harness({env}).GET(request(null,{method:'GET'}))).status,404);
});
test('literal request URL/Host and forwarding guards reject public and rebinding variants',async()=>{
 const h=harness();
 const cases=[{url:'https://public.example/api/local-review',headers:{Host:'public.example'}},{url:'http://localhost.attacker.test/api/local-review',headers:{Host:'localhost.attacker.test'}},{headers:{Host:'evil.example'}},{headers:{Host:'2130706433:40090'}},{headers:{Host:'127.1:40090'}},{headers:{Host:'127.0.0.1:40091'}},...['forwarded','x-forwarded-host','x-original-host','x-forwarded-server','x-forwarded-for','x-forwarded-proto','x-forwarded-port'].map(name=>({headers:{[name]:'127.0.0.1'}}))];
 for(const options of cases)assert.equal((await h.POST(request(undefined,options))).status,404,JSON.stringify(options));
 assert.equal(h.calls.length,0);assert.equal(h.sources.length,0);
 for(const host of ['localhost:40090','127.0.0.1:40090','[::1]:40090'])assert.equal(h.isLocalReviewRequest(request(undefined,{url:`http://${host}/api/local-review`,headers:{Host:host,Origin:`http://${host}`}})),true);
});
test('Vite redundant forwarded Host is accepted only as an exact copy of both literal authorities',async()=>{
 const h=harness();
 for(const host of ['127.0.0.1:40090','localhost:40090','[::1]:40090']){
  const req=request(undefined,{url:`http://${host}/api/local-review`,headers:{Host:host,Origin:`http://${host}`,'X-Forwarded-Host':host}});
  assert.equal(h.isLocalReviewRequest(req),true);
  assert.equal(h.isLocalReviewPostOrigin(req),true);
  assert.equal((await h.localReviewConfig(req)).endpoint,'http://127.0.0.1:8088/v1/chat/completions');
 }
 assert.equal((await h.POST(request(undefined,{headers:{'X-Forwarded-Host':'127.0.0.1:40090'}}))).status,200);
 for(const value of ['127.0.0.1:40091','localhost:40090','127.0.0.1:40090, 127.0.0.1:40090','public.example','http://127.0.0.1:40090','']){
  assert.equal(h.isLocalReviewRequest(request(undefined,{headers:{'X-Forwarded-Host':value}})),false,value);
 }
 assert.equal(h.isLocalReviewRequest(request(undefined,{url:'http://localhost:40090/api/local-review',headers:{Host:'localhost:40090','X-Forwarded-Host':'LOCALHOST:40090'}})),false);
 assert.equal(h.isLocalReviewRequest(request(undefined,{url:'http://public.example/api/local-review',headers:{Host:'public.example','X-Forwarded-Host':'public.example'}})),false);
 assert.equal(h.isLocalReviewRequest(request(undefined,{url:'https://127.0.0.1:40090/api/local-review',headers:{'X-Forwarded-Host':'127.0.0.1:40090'}})),false);
 assert.equal((await h.POST(request(undefined,{headers:{'X-Forwarded-Host':'127.0.0.1:40090',Origin:'http://attacker.example'}}))).status,403);
});
test('server endpoint has a fixed loopback destination and rejects arbitrary URL shapes',async()=>{
 for(const url of ['https://127.0.0.1:8088/v1','http://public.example/v1','http://127.0.0.1.attacker/v1','http://2130706433/v1','http://127.1/v1','http://user:password@127.0.0.1/v1','http://127.0.0.1:65536/v1','http://127.0.0.1/v1?key=bad','http://127.0.0.1/v1#bad','http://127.0.0.1/private'])assert.equal(await harness({env:{GEONOS_GLIMMER_URL:url}}).localReviewConfig(request()),null,url);
 const h=harness();assert.equal((await h.localReviewConfig(request())).endpoint,'http://127.0.0.1:8088/v1/chat/completions');
});
test('POST requires exact Origin, same-origin fetch metadata and local preview actor',async()=>{
 const h=harness();
 for(const headers of [{Origin:'null'},{Origin:'https://attacker.example'},{Origin:'http://localhost:40090'},{Origin:''},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'},{'Sec-Fetch-Site':'none'}])assert.equal((await h.POST(request(undefined,{headers}))).status,403);
 const noOrigin=request();noOrigin.headers.delete('origin');assert.equal((await h.POST(noOrigin)).status,403);
 const noSite=request();noSite.headers.delete('sec-fetch-site');assert.equal((await h.POST(noSite)).status,200);
 const noUser=harness({auth:false});assert.equal((await noUser.POST(request())).status,401);assert.equal(noUser.sources.length,0);
});
test('accepted input resolves only native IDs freshly and sends private text only to the local helper',async()=>{
 const h=harness(),response=await h.POST(request()),payload=await response.json();assert.equal(response.status,200);assert.equal(h.calls.length,1);assert.equal(h.sources.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(h.sources[0].ids)),['109855','819422']);assert.equal(h.sources[0].plan.userQuestion,'Retrieve public records for a local review');assert.doesNotMatch(JSON.stringify(h.sources),/PRIVATE_SENTINEL/);
 assert.equal(h.calls[0].input.notes,'PRIVATE_SENTINEL_OWNER_NOTES');assert.equal(h.calls[0].input.buildings[0].address,'Official 109855');assert.equal(h.calls[0].configuration.endpoint,'http://127.0.0.1:8088/v1/chat/completions');
 assert.equal(payload.kind,'local_glimmer_review');assert.doesNotMatch(JSON.stringify(payload),/synthetic-local-test-key|PRIVATE_SOURCE_BODY/);
});
test('unexpected fields, client facts, invalid IDs, control characters and oversized text fail before retrieval',async()=>{
 const valid={question:'Compare.',notes:'note',selectedIds:['109855','819422']};
 for(const data of [{...valid,history:[]},{...valid,buildings:[{id:'109855',roof_height_ft:99}]},{...valid,endpoint:'http://localhost:1'},{...valid,selectedIds:['109855','109855']},{...valid,selectedIds:['p:3004880006','819422']},{...valid,selectedIds:['1 or 1=1','819422']},{...valid,notes:'a'.repeat(6001)},{...valid,question:'a'.repeat(2001)},{...valid,question:'bad\u0000value'},{...valid,question:' '}]){const h=harness();assert.equal((await h.POST(request(data))).status,400);assert.equal(h.sources.length,0);}
 const h=harness();assert.equal((await h.POST(request('x'.repeat(32769)))).status,400);assert.equal(h.sources.length,0);
 const nonJson=harness();assert.equal((await nonJson.POST(request(valid,{headers:{'Content-Type':'text/plain'}}))).status,400);
});
test('public source failure returns a fixed safe error and never starts local inference',async()=>{
 const h=harness({sourceFailure:true}),response=await h.POST(request()),payload=await response.json();assert.equal(response.status,502);assert.equal(payload.code,'LOCAL_REVIEW_SOURCE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(payload),/PRIVATE_SOURCE_BODY|PRIVATE_SENTINEL|synthetic-local/);assert.equal(h.calls.length,0);
});
test('local refusal is terminal, and unknown upstream errors never leak bodies',async()=>{
 const h=harness({reviewError:new MockError('GLIMMER_REFUSED','Muse Glimmer declined the local review.')}),response=await h.POST(request());assert.equal(response.status,502);assert.equal((await response.json()).code,'GLIMMER_REFUSED');assert.equal(h.calls.length,1);
 const bad=harness({reviewError:Error('PRIVATE_PROVIDER_BODY')});assert.doesNotMatch(await(await bad.POST(request())).text(),/PRIVATE_PROVIDER_BODY/);assert.equal(bad.calls.length,1);
});
test('one active local review is enforced, cancellation propagates, and a new request can follow',async()=>{
 const h=harness({reviewPending:true}),controller=new AbortController(),first=h.POST(request(undefined,{signal:controller.signal}));await wait();
 assert.equal((await h.POST(request())).status,429);assert.equal(h.calls.length,1);controller.abort();assert.equal((await first).status,499);assert.equal(h.calls[0].signal.aborted,true);
 const nextController=new AbortController(),next=h.POST(request(undefined,{signal:nextController.signal}));await wait();assert.equal(h.calls.length,2);nextController.abort();assert.equal((await next).status,499);
});
test('deadline stops stalled source retrieval before inference; rate limits bound repeated requests',async()=>{
 const h=harness({sourcePending:true,fakeTimers:true}),pending=h.POST(request());await wait();assert.equal(h.deadlines.size,1);for(const expire of h.deadlines)expire();assert.equal((await pending).status,504);assert.equal(h.calls.length,0);assert.equal(h.deadlines.size,0);
 const rate=harness();for(let i=0;i<4;i++)assert.equal((await rate.POST(request())).status,200);assert.equal((await rate.POST(request())).status,429);assert.equal(rate.calls.length,4);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file:string,imports:Record<string,unknown>={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.resolve(import.meta.dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:(name:string)=>imports[name]??require(name),Request,Response,Headers,URL,crypto,TextEncoder});return module.exports as any;}
const p=load('../lib/meta-spend-policy.ts'),questions=load('../lib/demo-budget-policy.ts');
const {DemoBudget}=load('../worker/demo-budget.ts',{'../lib/meta-spend-policy':p,'../lib/demo-budget-policy':questions});
const uuid=(n:number)=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`;
const spark=(n=1)=>({requestId:uuid(n),model:'muse-spark-1.3',operation:'chat',maxOutputTokens:2500});
const spec=({requestId:_id,...call}:any)=>call;
function db(){const store=new Map<string,unknown>();let queue=Promise.resolve();return{store,storage:{transaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>{const work=queue.then(async()=>{const copy=structuredClone(store),result=await fn({get:async(k:string)=>structuredClone(copy.get(k)),put:async(k:string,v:unknown)=>{copy.set(k,structuredClone(v));}});store.clear();for(const[k,v]of copy)store.set(k,v);return result;});queue=work.then(()=>{},()=>{});return work;}}};}
const request=(endpoint:string,value:unknown)=>new Request('https://internal'+endpoint,{method:'POST',body:JSON.stringify(value)});
async function call(object:any,endpoint:string,value:unknown){const response=await object.fetch(request(endpoint,value));return{status:response.status,body:await response.json()};}

test('explicit decimal budget configuration has no default, accepts zero, and uses exact integer microdollars',()=>{
 for(const value of [undefined,null,'','-1','1e2','NaN','Infinity',' 2','2 ','0.001','1000000',2])assert.throws(()=>p.configuredSpendMicros({META_DEMO_BUDGET_USD:value}));
 assert.equal(p.configuredSpendMicros({META_DEMO_BUDGET_USD:'2.01'}),2_010_000);assert.equal(p.configuredSpendMicros({META_DEMO_BUDGET_USD:'0'}),0);
});
test('official current rates reserve full context and exact bounded fixed-price operations',()=>{
 assert.equal(p.reserveCostMicros(spec(spark())),1_321_345);
 assert.equal(p.reserveCostMicros({model:'muse-wonder-1.0',operation:'chat',maxOutputTokens:1800}),4_230_304);
 assert.equal(p.reserveCostMicros({model:'muse-wonder-1.0',operation:'chat',maxOutputTokens:2200}),4_238_304);
 assert.equal(p.reserveCostMicros({model:'sam-3.1',operation:'sam_image'}),2500);
 assert.equal(p.reserveCostMicros({model:'muse-image-1.0',operation:'image'}),10_000);
 assert.equal(p.reserveCostMicros({model:'muse-voice-transcribe-1.0',operation:'voice'}),3000);
 for(const value of [{model:'unknown',operation:'chat',maxOutputTokens:10},{...spec(spark()),maxOutputTokens:2501},{...spec(spark()),maxOutputTokens:NaN},{...spec(spark()),operation:'image'},{model:'sam-3.1',operation:'sam_image',images:2},{model:'sam-3.1',operation:'sam_image',maxOutputTokens:2}])assert.throws(()=>p.parseSpendCall(value));
});
test('settlement charges uncached prompt tokens, rounds fractional microdollars upward and is exactly idempotent',()=>{
 const ledger=p.newSpendLedger(2_000_000),reserved=p.reserveSpend(ledger,undefined,spark()).reservation;
 const usage={requestId:uuid(1),model:'muse-spark-1.3',usage:{prompt_tokens:1,completion_tokens:1}};
 assert.equal(p.settleSpend(ledger,reserved,usage).settled,true);assert.equal(ledger.spentMicros,6);assert.equal(ledger.heldMicros,0);
 assert.equal(p.settleSpend(ledger,reserved,usage).settled,true);assert.equal(ledger.spentMicros,6);
 assert.throws(()=>p.settleSpend(ledger,reserved,{...usage,usage:{prompt_tokens:1,completion_tokens:2}}));assert.equal(ledger.spentMicros,6);
});
test('missing, mismatched, zero or oversized text usage never releases a held reservation',()=>{
 for(const bad of [{},{model:'muse-wonder-1.0',usage:{prompt_tokens:10,completion_tokens:1}},{usage:{prompt_tokens:0,completion_tokens:1}},{usage:{prompt_tokens:2.5,completion_tokens:1}},{usage:{prompt_tokens:10,completion_tokens:2501}},{usage:{prompt_tokens:1_048_576,completion_tokens:1}},{usage:{prompt_tokens:10,completion_tokens:1,cached_tokens:10}},{usage:{prompt_tokens:-1,completion_tokens:1}}]){
  const ledger=p.newSpendLedger(2_000_000),reservation=p.reserveSpend(ledger,undefined,spark()).reservation,before=JSON.stringify(ledger);
  assert.throws(()=>p.settleSpend(ledger,reservation,{requestId:uuid(1),model:'muse-spark-1.3',...bad}));assert.equal(JSON.stringify(ledger),before);
 }
 const ledger=p.newSpendLedger(2_000_000);assert.throws(()=>p.settleSpend(ledger,undefined,{requestId:uuid(1),model:'muse-spark-1.3',usage:{prompt_tokens:1,completion_tokens:1}}));
});
test('failed or interrupted calls retain their full cost indefinitely and duplicate reserve cannot authorize another dispatch',()=>{
 const ledger=p.newSpendLedger(2_000_000),first=p.reserveSpend(ledger,undefined,spark());
 assert.equal(p.reserveSpend(ledger,first.reservation,spark()).result.allowed,false);assert.equal(ledger.heldMicros,1_321_345);assert.equal(ledger.reservationCount,1);
 assert.equal(p.spendStatus(ledger,spec(spark())).allowed,false);assert.equal(p.reserveSpend(ledger,undefined,spark(2)).result.code,'META_SPEND_LIMIT');
 assert.equal('expires' in first.reservation,false);assert.equal('day' in ledger,false);
});
test('concurrent calls from two object instances cannot exceed the one persistent monetary allowance',async()=>{
 const d=db(),env={META_DEMO_BUDGET_USD:'2'},a=new DemoBudget({storage:d.storage},env),b=new DemoBudget({storage:d.storage},env);
 const results=await Promise.all(Array.from({length:12},(_,i)=>call(i%2?a:b,'/spend-reserve',spark(i+1))));
 assert.equal(results.filter(x=>x.body.allowed).length,1);assert.equal(results.filter(x=>x.body.code==='META_SPEND_LIMIT').length,11);
 const ledger:any=d.store.get('meta-spend-ledger-v1');assert.equal(ledger.heldMicros,1_321_345);assert.ok(ledger.spentMicros+ledger.heldMicros<=ledger.budgetMicros);assert.equal([...d.store.keys()].filter(k=>k.startsWith('meta-spend-call:')).length,1);
});
test('restart and changed valid configuration preserve seed, reservations and settled spend',async()=>{
 const d=db();let object=new DemoBudget({storage:d.storage},{META_DEMO_BUDGET_USD:'2'});
 assert.equal((await call(object,'/spend-reserve',spark())).body.allowed,true);
 object=new DemoBudget({storage:d.storage},{META_DEMO_BUDGET_USD:'200'});
 assert.equal((await call(object,'/spend-reserve',spark(2))).body.code,'META_SPEND_LIMIT');assert.equal((d.store.get('meta-spend-ledger-v1') as any).budgetMicros,2_000_000);
 assert.equal((await call(object,'/spend-settle',{requestId:uuid(1),model:'muse-spark-1.3',usage:{prompt_tokens:1000,completion_tokens:100}})).body.settled,true);
 const prior=structuredClone(d.store.get('meta-spend-ledger-v1'));
 assert.equal((await call(new DemoBudget({storage:d.storage},{META_DEMO_BUDGET_USD:'1'}),'/spend-status',{})).body.allowed,true);assert.deepEqual(d.store.get('meta-spend-ledger-v1'),prior);
});
test('concurrent duplicate settlements refund once and conflicting later usage cannot alter the charge',async()=>{
 const d=db(),env={META_DEMO_BUDGET_USD:'2'},a=new DemoBudget({storage:d.storage},env),b=new DemoBudget({storage:d.storage},env);
 await call(a,'/spend-reserve',spark());const settled={requestId:uuid(1),model:'muse-spark-1.3',usage:{prompt_tokens:1000,completion_tokens:100}};
 const results=await Promise.all(Array.from({length:8},(_,i)=>call(i%2?a:b,'/spend-settle',settled)));assert.ok(results.every(x=>x.body.settled===true));
 const ledger:any=d.store.get('meta-spend-ledger-v1');assert.equal(ledger.spentMicros,1675);assert.equal(ledger.heldMicros,0);assert.equal(ledger.reservationCount,1);
 assert.equal((await call(a,'/spend-settle',{...settled,usage:{prompt_tokens:100,completion_tokens:10}})).status,503);assert.deepEqual(d.store.get('meta-spend-ledger-v1'),ledger);
 assert.equal((await call(b,'/spend-reserve',spark())).body.allowed,false);
});
test('question lease release and daily rollover cannot release monetary holds',async()=>{
 const d=db(),object=new DemoBudget({storage:d.storage},{META_DEMO_BUDGET_USD:'2'});
 const admitted=await call(object,'/reserve',{kind:'chat',ip:'a'.repeat(64)});assert.equal(admitted.body.allowed,true);
 assert.equal((await call(object,'/spend-reserve',spark())).body.allowed,true);
 await call(object,'/release',{leaseId:admitted.body.leaseId});
 const q:any=d.store.get('budget');q.day-=10;q.leases={};d.store.set('budget',q);
 await call(object,'/reserve',{kind:'voice',ip:'b'.repeat(64)});
 assert.equal((d.store.get('meta-spend-ledger-v1') as any).heldMicros,1_321_345);assert.equal((await call(object,'/spend-status',spec(spark()))).body.allowed,false);
});
test('missing configuration, broken storage and corrupted persisted ledger fail closed without resetting',async()=>{
 const d=db();assert.equal((await call(new DemoBudget({storage:d.storage},{}),'/spend-status',{})).status,503);assert.equal(d.store.size,0);
 const broken=new DemoBudget({storage:{transaction:async()=>{throw Error('storage unavailable');}}},{META_DEMO_BUDGET_USD:'2'});assert.equal((await call(broken,'/spend-reserve',spark())).body.allowed,false);
 const corrupt={...p.newSpendLedger(2_000_000),heldMicros:3_000_000};d.store.set('meta-spend-ledger-v1',corrupt);
 const failure=await call(new DemoBudget({storage:d.storage},{META_DEMO_BUDGET_USD:'200'}),'/spend-reserve',spark());assert.equal(failure.status,503);assert.deepEqual(d.store.get('meta-spend-ledger-v1'),corrupt);
});
test('status and reservation responses expose no budget, spend, balance or currency amounts',async()=>{
 const d=db(),object=new DemoBudget({storage:d.storage},{META_DEMO_BUDGET_USD:'0'});
 assert.deepEqual((await call(object,'/spend-status',{})).body,{allowed:false,code:'META_SPEND_LIMIT'});
 assert.deepEqual((await call(object,'/spend-reserve',spark())).body,{allowed:false,code:'META_SPEND_LIMIT'});
 assert.equal((await call(object,'/spend-status',{url:'https://untrusted.example'})).status,503);
});

// Real SQLite Durable Object runtime; synthetic cents only, no provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

test('real SQLite object serializes parallel charges and retains exhausted allowance after restart',async()=>{
 const persistence=await mkdtemp(join(tmpdir(),'geonos-spend-test-'));
 const bundle=await build({stdin:{contents:"export {DemoBudget} from './worker/demo-budget.ts'; export default {fetch(){return new Response('test only')}};",resolveDir:resolve(import.meta.dirname,'..'),loader:'ts'},bundle:true,format:'esm',write:false,platform:'browser',target:'es2022'});
 const options=budget=>({name:'geonos-spend-runtime-test',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',durableObjects:{DEMO_BUDGET:{className:'DemoBudget',useSQLite:true}},durableObjectsPersist:persistence,bindings:budget===undefined?{}:{META_DEMO_BUDGET_USD:budget}});
 let runtime=new Miniflare(options('0.01'));
 const stub=async()=>{const ns=await runtime.getDurableObjectNamespace('DEMO_BUDGET');return ns.get(ns.idFromName('geonos-public-demo-v1'));};
 const call=async(path,body)=>{const s=await stub();const response=await s.fetch('https://budget.internal'+path,{method:'POST',body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
 const reserve=()=>call('/spend-reserve',{requestId:randomUUID(),operation:'sam_image',model:'sam-3.1'});
 try{
  const results=await Promise.all(Array.from({length:16},reserve));
  assert.equal(results.filter(r=>r.body.allowed).length,4);
  assert.equal(results.filter(r=>r.body.code==='META_SPEND_LIMIT').length,12);
  await runtime.dispose();runtime=new Miniflare(options('999'));
  assert.equal((await reserve()).body.code,'META_SPEND_LIMIT');
  // Releasing a request lease never refunds an uncertain provider charge.
  await call('/release',{leaseId:randomUUID()});
  assert.equal((await call('/spend-status',{})).body.code,'META_SPEND_LIMIT');
  await runtime.dispose();runtime=new Miniflare(options(undefined));
  const unavailable=await reserve();assert.equal(unavailable.status,503);assert.equal(unavailable.body.code,'META_SPEND_UNAVAILABLE');
 }finally{await runtime.dispose();await rm(persistence,{recursive:true,force:true});}
});

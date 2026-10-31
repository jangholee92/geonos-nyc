import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(options:{failExclusion?:boolean;invalid?:boolean;deep?:boolean;historicalRows?:unknown[];currentFeatures?:unknown[]}={}){
 const result:any={exports:{}};let requests=0;
 const code=ts.transpileModule(fs.readFileSync('lib/site-context.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const city={n:(v:any)=>v==null?null:Number(v),geomPoint:()=>[-74,40.7],invalidFootprint:()=>!!options.invalid,soda:async(id:string)=>id==='5zhs-2jue'?[{the_geom:{type:'Polygon'}}]:id==='4mhf-duep'?[{hvi:4}]:id==='27ya-gqtm'?(options.historicalRows??[{count:'0'}]):id==='epne-qv9x'?[{hurricane_:'X'}]:id==='jjja-shxy'?[{the_geom:{type:'LineString',coordinates:[[-74,40.699],[-74,40.701]]},street:'Test'}]:[]};
 const mockedFetch=async(url:URL)=>{requests++;const u=String(url);if(u.includes('Census2020'))return Response.json({features:[{attributes:{ZCTA5:'10001'}}]});if(u.includes('Current_Sea_Levels'))return Response.json({features:options.currentFeatures??[]});if(options.failExclusion&&/FeatureServer\/0\/query/.test(u)&&u.includes('SLR'))return Response.json({error:{code:500}});return Response.json({features:options.deep&&/FeatureServer\/4\/query/.test(u)?[{attributes:{OBJECTID:1}}]:[]})};
 const helper:any={exports:{}};const helperCode=ts.transpileModule(fs.readFileSync('lib/public-fetch.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(helperCode,{exports:helper.exports,module:helper,fetch:mockedFetch,AbortController,setTimeout,clearTimeout,window:{}});
 vm.runInNewContext(code,{exports:result.exports,module:result,require:(id:string)=>id==='./public-fetch'?helper.exports:city,URL,fetch:mockedFetch,AbortSignal,Promise,Date,Number,Error,Math,Response});
 return{run:result.exports.fetchSiteContext,requests:()=>requests};
}
test('stormwater no-hit is contextual, not safe; historical +31 and stormwater +30 stay distinct',async()=>{const h=harness(),v=await h.run('3');assert.equal(v.stormwater.value.queries_succeeded,7);assert.match(v.stormwater.value.future_2050.category,/safety is not established/);assert.equal(v.stormwater.value.rainfall.total_mm,54.102);assert.equal(v.stormwater.value.future_2050.sea_level_rise_inches,30);assert.match(v.future_flood.value.scenario,/31/);assert.equal(v.truck.value.distance_m,0);});
test('failed exclusion lookup prevents a confident future category even with deep overlay hit',async()=>{const v=await harness({failExclusion:true,deep:true}).run('3');assert.equal(v.stormwater.value.future_2050.excluded_area,null);assert.equal(v.stormwater.value.future_2050.category,'Model exclusion lookup failed');assert.equal(v.stormwater.value.queries_succeeded,6);});
test('invalid or placeholder geometry never queries exposure services',async()=>{const h=harness({invalid:true});await assert.rejects(()=>h.run('3'),/invalid footprint/);assert.equal(h.requests(),0);});
test('malformed historical counts remain unavailable rather than a false no-intersection',async()=>{
 for(const historicalRows of [[],[{}],[{count:null}],[{count:''}],[{count:'not-a-count'}],[{count:-1}],[{count:1.5}],[{count:'0'},{count:'1'}]]){
  const v=await harness({historicalRows}).run('3');
  assert.equal(v.future_flood.status,'unavailable',JSON.stringify(historicalRows));assert.equal(v.future_flood.value,null);
 }
 for(const count of [0,'0',1,'2']){
  const v=await harness({historicalRows:[{count}]}).run('3');assert.equal(v.future_flood.status,'available');assert.equal(v.future_flood.value.inside,Number(count)>0);
 }
});
test('unknown current-map hit classes do not become no-intersection or complete evidence',async()=>{
 for(const currentFeatures of [[{attributes:{}}],[{attributes:{Flooding_C:3}}],[{attributes:{Flooding_C:null}}],[{attributes:{Flooding_C:true}}],[null],[{attributes:{Flooding_C:2}},{attributes:{Flooding_C:'new-class'}}]]){
  const v=await harness({currentFeatures}).run('3');assert.equal(v.stormwater.value.current.category,'Query failed');assert.equal(v.stormwater.value.queries_succeeded,6);
 }
 for(const Flooding_C of [1,'1',2,'2']){
  const v=await harness({currentFeatures:[{attributes:{Flooding_C}}]}).run('3');assert.equal(v.stormwater.value.queries_succeeded,7);assert.match(v.stormwater.value.current.category,Number(Flooding_C)===2?/Modeled deep/:/Modeled nuisance/);
 }
});
test('truck metadata distinguishes last verified data revision from context retrieval time',async()=>{
 const v=await harness().run('3');assert.equal(v.truck.value.source_data_updated_at,'2026-03-02T19:36:22Z');
 assert.equal(v.truck.value.source_revision_check_mode,'last-verified-metadata');assert.equal(v.truck.value.source_revision_checked_at,'2026-10-28T01:21:46.592288Z');
 assert.notEqual(v.truck.value.source_data_updated_at,v.retrieved_at);assert.match(v.truck.value.source_revision_note,/not rechecked/);
 assert.equal(v.truck.value.current_dot_guidance_url,'https://www.nyc.gov/html/dot/html/motorist/truckrouting.shtml');
});

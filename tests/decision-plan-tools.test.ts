import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
type Obj=Record<string,any>;
function compile(path:string,requireFn:(s:string)=>any){const source=readFileSync(new URL(path,import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const module={exports:{} as Obj};new vm.Script(code).runInContext(vm.createContext({module,exports:module.exports,require:requireFn}));return module.exports;}
const planner=compile('../lib/decision-plan.ts',()=>{throw Error('Pure planner imported runtime dependency')});
const adapter=compile('../lib/decision-plan-tools.ts',s=>{if(s==='./decision-plan')return planner;throw Error(s)});
const requirement={id:'size',factKey:'footprint_area_sqft',operator:'gte',target:20000,unit:'sqft',scope:'building_footprint',required:true};
const args=(r:Obj=requirement,quote='20,000 sqft footprint')=>({plan:{intent:'find',requirements:[r]},ids:['101'],requirementOrigins:[{requirementId:r.id,quote}]});

test('quoted numeric thresholds accept explicit comma and k notation, but no invented defaults or conversion',()=>{
 for(const quote of ['20,000 sqft footprint','20k sqft footprint','20000 sqft footprint']){const parsed=adapter.parseDecisionTool(args(requirement,quote),[quote],quote);assert.equal(parsed.plan.requirements[0].target,20000)}
 assert.throws(()=>adapter.parseDecisionTool(args(requirement,'a large building'),['a large building'],'a large building'),/numeric requirement/);
 assert.throws(()=>adapter.parseDecisionTool(args(requirement,'1858 square metres'),['1858 square metres'],'1858 square metres'),/numeric requirement/);
});
test('plan provenance must be exact user text, unique and complete, not assistant or tool claims',()=>{
 assert.throws(()=>adapter.parseDecisionTool(args(),['Need a warehouse'],'Need a warehouse'),/exact text/);
 const missing=args();missing.requirementOrigins=[];assert.throws(()=>adapter.parseDecisionTool(missing,['20,000 sqft footprint'],'Find'),/Every requirement/);
 const duplicate=args();duplicate.plan.requirements.push({...requirement,id:'second'});duplicate.requirementOrigins.push(duplicate.requirementOrigins[0]);assert.throws(()=>adapter.parseDecisionTool(duplicate,['20,000 sqft footprint'],'Find'),/Duplicate/);
});
test('unsupported top-level, plan and requirement fields cannot supply observations or conclusions',()=>{
 for(const value of [{...args(),facts:[{power:500}]},{...args(),plan:{...args().plan,answer:'Suitable'}},{...args(),plan:{...args().plan,requirements:[{...requirement,observedValue:30000}]}}])assert.throws(()=>adapter.parseDecisionTool(value,['20,000 sqft footprint'],'Find'));
});
test('registered units and scopes must match; roof height cannot silently become interior clearance',()=>{
 assert.throws(()=>adapter.parseDecisionTool(args({...requirement,unit:'m'}),['20,000 sqft footprint'],'Find'),/unit/);
 assert.throws(()=>adapter.parseDecisionTool(args({...requirement,scope:'operational'}),['20,000 sqft footprint'],'Find'),/scope/);
 assert.throws(()=>adapter.parseDecisionTool(args({...requirement,factKey:'rent'}),['20,000 sqft footprint'],'Find'),/not supported/);
});
test('canonical clarifications accept neither arbitrary factual prose nor prototype keys',()=>{
 assert.equal(adapter.parseClarification({topic:'area_scope'}).options.length,3);
 for(const input of [{topic:'__proto__'},{topic:'area_scope',answer:'Verified safe'},'area_scope',null])assert.throws(()=>adapter.parseClarification(input));
});
test('candidate count and identity preserve intended operation without arbitrary selectors',()=>{
 for(const value of [{...args(),ids:['1 OR 1=1']},{...args(),ids:['101','101']},{...args(),plan:{...args().plan,intent:'compare'}},{...args(),plan:{...args().plan,intent:'understand'},ids:['101','102']}])assert.throws(()=>adapter.parseDecisionTool(value,['20,000 sqft footprint'],'Find'));
 const empty={plan:{intent:'find',requirements:[]},ids:[],requirementOrigins:[]};assert.equal(adapter.parseDecisionTool(empty,[],'Find').ids.length,0);
});

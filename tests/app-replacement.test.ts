import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

type Obj = Record<string, any>;
const plain = <T>(value:T):T => JSON.parse(JSON.stringify(value));
function compile(path:string, imports:Obj={}):Obj {
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 new vm.Script(code,{filename:path}).runInNewContext({module,exports:module.exports,URL,URLSearchParams,require:(id:string)=>{
  if(id in imports)return imports[id];throw Error('Unexpected test import: '+id);
 }});
 return module.exports;
}
const quality=JSON.parse(readFileSync(new URL('../lib/city-quality.json',import.meta.url),'utf8'));
const city=compile('../lib/city.ts',{'./city-quality.json':quality,'./public-fetch':{fetchPublicJson:()=>{throw Error('Unexpected network request');}}});
const planner=compile('../lib/decision-plan.ts');
const reviewed=compile('../lib/reviewed-plan.ts',{'./city':city,'./decision-plan':planner});
const picking=compile('../lib/map-selection.ts',{'./city-quality.json':quality});

// Extract the production handlers, including their actual query/provenance and
// deduplication helpers. Only I/O and React state delivery are replaced. A rename
// must fail this harness explicitly instead of silently executing stale logic.
const source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const home=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='Home') as ts.FunctionDeclaration|undefined;
assert.ok(home?.body,'Home must exist for the controlled-handler tests');
const names=['cancelPendingSelections','commitBuildingSelection','drainSelectionQueue','enqueueSelection','loadRecords','selectAtPoint','selectBuilding','removeBuilding','clearSelection','openReturnedSearch','applyReviewed','compareExample'];
const handlers=names.map(name=>{
 const node=home.body!.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
 assert.ok(node,'Missing production handler: '+name);return node.getText(ast);
}).join('\n');
const helpers=['unique','fetched','validQuery'].map(name=>{
 const node=ast.statements.find(node=>ts.isFunctionDeclaration(node)?node.name?.text===name:ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text===name));
 assert.ok(node,'Missing production helper: '+name);return node.getText(ast);
}).join('\n');
const code=ts.transpileModule(helpers+'\n'+handlers+'\nObject.defineProperty(globalThis,"mapBuildings",{get:()=>unique([...items,...selected])});',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const deferred=()=>{
 let resolve!:(value:any)=>void,reject!:(reason:any)=>void;
 const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};
};
const POINT:[number,number]=[-74,40.7];
function building(id:string,point:readonly number[]=POINT):Obj {
 const [x,y]=point,d=.00003;
 return{id,entity_type:'building',geometry_quality:'source_geometry',feature_code:2100,address:'Place '+id,bin:'3000001',bbl:'3000010001',zoning:['M1-1'],longitude:x,latitude:y,
  geometry:{type:'Polygon',coordinates:[[[x-d,y-d],[x+d,y-d],[x+d,y+d],[x-d,y+d],[x-d,y-d]]]}};
}
const result=(rows:Obj[],q='source')=>({buildings:rows,fetched_at:'2026-10-28T01:00:00Z',query:{unit:'building',q,limit:100},next_page:null,next_cursor:null,has_more:false});
const plan=(ids=['201'])=>({intent:ids.length===1?'understand':'compare',purpose:'general',userQuestion:'Inspect these official records.',requirements:[]});
function payload(ids=['201']):Obj {
 return{kind:'decision',grounded:true,planNeedsReview:true,plan:plan(ids),decision:{valid:true,candidates:ids.map(id=>({id}))},
  evidence:ids.map(id=>({id,building:{id,entity_type:id.startsWith('p:')?'parcel':'building',bbl:id.startsWith('p:')?id.slice(2):'3000010001'}}))};
}
const resolved=(ids=['201'])=>({ids,plan:plan(ids),buildings:ids.map(id=>({...building(id),retrieval:{mode:'live-query',retrieved_at:'2026-10-28T02:00:00Z'}}))});
function harness(){
 const calls:Obj[]=[],resolveCalls:Obj[]=[],contextCalls:any[][]=[];
 const old=building('101',[-73.98,40.75]);
 const state:Obj={
  selectionQueue:{current:null},requestGeneration:{current:0},selectionGeneration:{current:0},pointGeneration:{current:0},selectedRef:{current:[old]},
  selected:[old],items:[old],page:result([old],'old'),query:{unit:'building',q:'old'},busy:false,error:'',notice:'',
  contexts:{101:{id:'101',status:'old'}},contextBusy:{},contextErrors:{},focus:old,focusToken:7,mobilePanel:'map',overlay:null,resultsOpen:false,filtersOpen:true,
  plan:{...plan(),requirements:[planner.makeRequirement('usable_area_sqft','gte',20000)]},planVersion:4,
  extras:{101:{label:'Existing user report'}},surroundings:{101:{label:'Existing source evidence'}},
  URLSearchParams,console,validateQuery:city.validateQuery,inspectReviewedPlan:reviewed.inspectReviewedPlan,pickBuildingAtPoint:picking.pickBuildingAtPoint,
  queryCity:(query:Obj)=>{const wait=deferred();calls.push({query,...wait});return wait.promise;},
  resolveReviewedPlan:(descriptor:Obj)=>{const wait=deferred();resolveCalls.push({descriptor,...wait});return wait.promise;},
  context:(...args:any[])=>{contextCalls.push(args);},
 };
 for(const setter of new Set(handlers.match(/\bset[A-Z]\w*/g)||[])){
  const key=setter[3].toLowerCase()+setter.slice(4);
  state[setter]=(value:any)=>{state[key]=typeof value==='function'?value(state[key]):value;};
 }
 vm.createContext(state);new vm.Script(code,{filename:'actual-page-handlers.js'}).runInContext(state);
 return{state,calls,resolveCalls,contextCalls};
}
const ids=(rows:Obj[])=>plain(rows.map(b=>b.id));
const workspace=(s:Obj)=>plain(Object.fromEntries(['items','selected','page','query','plan','planVersion','contexts','focus','focusToken','extras','surroundings','overlay'].map(key=>[key,s[key]])));
const query=(q:string)=>({unit:'building',q,limit:100});

test('latest source request wins, including page/query and live retrieval provenance',async()=>{
 const h=harness(),s=h.state;
 const old=s.loadRecords(query('first'),{selectSingle:true}),latest=s.loadRecords(query('second'),{focusFirst:true});
 h.calls[1].resolve(result([building('202')],'second'));await latest;
 h.calls[0].resolve(result([building('201')],'first'));await old;
 assert.deepEqual(ids(s.items),['202']);assert.deepEqual(ids(s.selected),['101']);
 assert.equal(s.page.query.q,'second');assert.equal(s.query.q,'second');assert.equal(s.focus.id,'202');assert.equal(s.focusToken,8);
 assert.deepEqual(plain(s.items[0].retrieval),{mode:'live-query',retrieved_at:'2026-10-28T01:00:00Z'});
 assert.equal(s.busy,false);assert.equal(h.contextCalls.length,0);
});

test('an older completion cannot clear a newer source request busy state or publish its error',async()=>{
 for(const rejectOld of [false,true]){
  const h=harness(),s=h.state,old=s.loadRecords(query('first')),latest=s.loadRecords(query('second'));
  if(rejectOld)h.calls[0].reject(Error('Obsolete failure'));else h.calls[0].resolve(result([building('201')],'first'));
  await old;assert.equal(s.busy,true);assert.equal(s.error,'');assert.deepEqual(ids(s.items),['101']);
  h.calls[1].resolve(result([building('202')],'second'));await latest;
  assert.equal(s.busy,false);assert.deepEqual(ids(s.items),['202']);
 }
});

test('source refresh failure and invalid filters preserve the existing workspace',async()=>{
 const h=harness(),s=h.state,before=workspace(s),pending=s.loadRecords(query('new'));
 h.calls[0].reject(Error('Official source unavailable'));await pending;
 assert.deepEqual(workspace(s),before);assert.match(s.error,/Official source unavailable/);assert.equal(s.busy,false);assert.equal(h.contextCalls.length,0);
 await s.loadRecords({...query('invalid'),borough:'not-a-borough'});
 assert.equal(h.calls.length,1);assert.deepEqual(workspace(s),before);assert.match(s.error,/valid borough/);
});

test('source pagination appends distinct IDs in order and refreshes duplicate data without changing selection',async()=>{
 const h=harness(),s=h.state,original=s.selected[0];
 const pending=s.loadRecords({...query('more'),cursor:101},{append:true});
 h.calls[0].resolve({...result([{...building('101'),address:'Fresh official address'},building('9'),building('2')],'more'),next_cursor:202,has_more:true});await pending;
 assert.deepEqual(ids(s.items),['101','9','2']);assert.equal(s.items[0].address,'Fresh official address');assert.equal(s.selected[0],original);
 assert.equal(s.page.next_cursor,202);assert.equal(s.query.q,'more');assert.equal(h.calls[0].query.cursor,101);
});

test('late single-result address searches do not replace a manual selection or reset',async()=>{
 for(const action of ['manual','reset']){
  const h=harness(),s=h.state,pending=s.loadRecords(query('address'),{selectSingle:true});
  if(action==='manual')s.selectBuilding(building('301'));else s.clearSelection();
  h.calls[0].resolve(result([building('201')],'address'));await pending;
  assert.deepEqual(ids(s.selected),action==='manual'?['101','301']:[]);assert.deepEqual(ids(s.items),['201']);
  assert.equal(h.contextCalls.length,action==='manual'?1:0);
 }
});

test('only a single address result is auto-selected; empty and ambiguous results remain explicit choices',async()=>{
 for(const count of [0,1,2]){
  const h=harness(),s=h.state,pending=s.loadRecords(query('address'),{selectSingle:true});
  h.calls[0].resolve(result(Array.from({length:count},(_,i)=>building(String(201+i))),'address'));await pending;
  assert.deepEqual(ids(s.selected),count===1?['101','201']:['101']);
  assert.equal(s.resultsOpen,count!==1);
  if(count===0)assert.match(s.notice,/No linked building/);
  if(count===2)assert.match(s.notice,/multiple official outlines/);
 }
});

test('a known exact map hit selects locally without fetching and without moving the map',async()=>{
 const h=harness(),s=h.state;s.items.push(building('201'));
 await s.selectAtPoint(POINT);
 assert.equal(h.calls.length,0);assert.deepEqual(ids(s.selected),['101','201']);assert.equal(s.focus.id,'101');assert.equal(s.focusToken,7);
 assert.equal(h.contextCalls[0][0].id,'201');assert.equal(s.mobilePanel,'building');
});

test('an unknown map point selects the exact official footprint, not a neighboring outline',async()=>{
 const h=harness(),s=h.state,pending=s.selectAtPoint(POINT);
 assert.equal(h.calls[0].query.unit,'building');assert.equal(h.calls[0].query.limit,100);
 const bounds=h.calls[0].query.bbox;assert.ok(bounds[0]<POINT[0]&&bounds[2]>POINT[0]&&bounds[1]<POINT[1]&&bounds[3]>POINT[1]);
 h.calls[0].resolve(result([building('202',[-74.0001,40.7]),building('201')]));await pending;
 assert.deepEqual(ids(s.selected),['101','201']);assert.deepEqual(ids(s.items),['101']);assert.equal(s.selected[1].retrieval.mode,'live-query');assert.equal(s.notice,'');
});

test('a map point with nearby but non-covering records does not silently choose a nearest building',async()=>{
 const h=harness(),s=h.state,pending=s.selectAtPoint(POINT);
 h.calls[0].resolve(result([building('201',[-74.0001,40.7])]));await pending;
 assert.deepEqual(ids(s.selected),['101']);assert.deepEqual(ids(s.items),['101']);assert.equal(h.contextCalls.length,0);
 assert.match(s.notice,/No official building outline contains this point/);
});

test('late point responses and errors cannot overwrite a manual click, removal or reset',async()=>{
 for(const action of ['manual','remove','reset'])for(const failed of [false,true]){
  const h=harness(),s=h.state,pending=s.selectAtPoint(POINT);
  if(action==='manual')s.selectBuilding(building('301'));else if(action==='remove')s.removeBuilding('101');else s.clearSelection();
  const before=workspace(s),contexts=h.contextCalls.length;
  if(failed)h.calls[0].reject(Error('Obsolete point failure'));else h.calls[0].resolve(result([building('201')]));
  await pending;assert.deepEqual(workspace(s),before);assert.equal(s.error,'');assert.equal(h.contextCalls.length,contexts);
 }
});

test('a newer point lookup wins and a source search cancels a pending point lookup',async()=>{
 const h=harness(),s=h.state,other:[number,number]=[-74.01,40.71];
 const first=s.selectAtPoint(POINT),second=s.selectAtPoint(other);
 h.calls[1].resolve(result([building('202',other)]));await second;
 h.calls[0].resolve(result([building('201')]));await first;
 assert.deepEqual(ids(s.selected),['101','202']);assert.deepEqual(ids(s.items),['101']);
 const pending=s.selectAtPoint(POINT),search=s.loadRecords(query('new'));
 h.calls[2].resolve(result([building('203')]));await pending;
 assert.deepEqual(ids(s.selected),['101','202']);assert.deepEqual(ids(s.items),['101']);
 h.calls[3].resolve(result([building('204')],'new'));await search;assert.deepEqual(ids(s.items),['204']);
});

test('two-building selection pins A, replaces B, preserves click order, and ignores duplicate identities',()=>{
 const h=harness(),s=h.state;s.clearSelection();
 s.selectBuilding(building('9'));s.selectBuilding(building('2'));
 assert.deepEqual(ids(s.selected),['9','2']);assert.equal(s.selectedRef.current,s.selected);
 s.selectBuilding({...building('9'),address:'Duplicate record'});s.selectBuilding(building('2'));
 assert.deepEqual(ids(s.selected),['9','2']);assert.equal(h.contextCalls.length,2);assert.equal(s.selected[0].address,'Place 9');
 s.selectBuilding(building('5'));
 assert.deepEqual(ids(s.selected),['9','5']);assert.equal(s.selectedRef.current,s.selected);assert.match(s.notice,/B replaced.*A stays pinned/);
 assert.equal(h.contextCalls.length,3);assert.equal(s.focus.id,'101');
});

test('removal promotes the remaining record to A and reset clears conditions and user reports',()=>{
 const h=harness(),s=h.state;s.selectBuilding(building('2'));s.removeBuilding('101');s.selectBuilding(building('9'));
 assert.deepEqual(ids(s.selected),['2','9']);assert.equal(s.selectedRef.current,s.selected);
 const previousVersion=s.planVersion;s.clearSelection();
 assert.deepEqual(ids(s.selected),[]);assert.deepEqual(ids(s.selectedRef.current),[]);assert.equal(s.plan.requirements.length,0);assert.equal(s.planVersion,previousVersion+1);
 assert.deepEqual(plain(s.extras),{});assert.deepEqual(plain(s.surroundings),{});
});

test('review source failure makes no partial workspace commit or context request',async()=>{
 const h=harness(),s=h.state,before=workspace(s),pending=s.applyReviewed(payload());
 const rejection=assert.rejects(pending,/Source failed/);h.resolveCalls[0].reject(Error('Source failed'));await rejection;
 assert.deepEqual(workspace(s),before);assert.equal(h.contextCalls.length,0);
});

test('a reviewed plan commits fresh source records atomically in requested order and refreshes their context',async()=>{
 const h=harness(),s=h.state,pending=s.applyReviewed(payload(['9','2']));
 assert.deepEqual(plain(h.resolveCalls[0].descriptor.ids),['9','2']);assert.deepEqual(ids(s.selected),['101']);
 h.resolveCalls[0].resolve(resolved(['9','2']));await pending;
 assert.deepEqual(ids(s.selected),['9','2']);assert.equal(s.selectedRef.current,s.selected);assert.deepEqual(ids(s.items),['101']);
 assert.equal(s.plan.intent,'compare');assert.equal(s.planVersion,5);assert.equal(s.overlay,'conditions');assert.equal(s.focus.id,'9');
 assert.deepEqual(plain(h.contextCalls.map(([b,force])=>[b.id,force])),[['9',true],['2',true]]);
});

test('manual selection or reset during plan refresh rejects the stale plan without a partial commit',async()=>{
 for(const action of ['manual','reset']){
  const h=harness(),s=h.state,pending=s.applyReviewed(payload(['9','2']));
  if(action==='manual')s.selectBuilding(building('301'));else s.clearSelection();
  const before=workspace(s),count=h.contextCalls.length,rejection=assert.rejects(pending,/selection changed/);
  h.resolveCalls[0].resolve(resolved(['9','2']));await rejection;
  assert.deepEqual(workspace(s),before);assert.equal(h.contextCalls.length,count);
 }
});

test('a new source request invalidates a pending plan and owns its own busy state',async()=>{
 const h=harness(),s=h.state,pending=s.applyReviewed(payload()),search=s.loadRecords(query('new'));
 const rejection=assert.rejects(pending,/selection changed/);h.resolveCalls[0].resolve(resolved());await rejection;
 assert.equal(s.busy,true);assert.deepEqual(ids(s.selected),['101']);assert.equal(h.contextCalls.length,0);
 h.calls[0].resolve(result([building('301')],'new'));await search;assert.equal(s.busy,false);assert.deepEqual(ids(s.items),['301']);
});

test('only the most recently reviewed plan can commit, even if an earlier refresh finishes last',async()=>{
 const h=harness(),s=h.state,old=s.applyReviewed(payload(['201'])),latest=s.applyReviewed(payload(['9','2']));
 const rejected=assert.rejects(old,/selection changed/);
 h.resolveCalls[1].resolve(resolved(['9','2']));await latest;h.resolveCalls[0].resolve(resolved(['201']));await rejected;
 assert.deepEqual(ids(s.selected),['9','2']);assert.equal(s.planVersion,5);assert.equal(h.contextCalls.length,2);
});

test('malformed reviews, duplicates, too many records and tax lots fail before any source resolution',async()=>{
 for(const value of [{},payload(['9','9']),payload(['9','2','5']),payload(['p:3000010001'])]){
  const h=harness(),s=h.state,before=workspace(s);
  await assert.rejects(s.applyReviewed(value));assert.equal(h.resolveCalls.length,0);assert.equal(h.calls.length,0);assert.deepEqual(workspace(s),before);
 }
});

test('the two-address example retains requested BIN order despite reversed completion',async()=>{
 const h=harness(),s=h.state,pending=s.compareExample();
 assert.deepEqual(h.calls.map(c=>c.query.q),['3008210','3008212']);assert.ok(h.calls.every(c=>c.query.unit==='building'));
 h.calls[1].resolve(result([building('819422')],'3008212'));h.calls[0].resolve(result([building('109855')],'3008210'));await pending;
 assert.deepEqual(ids(s.selected),['109855','819422']);assert.deepEqual(ids(s.items),['101']);assert.equal(s.selectedRef.current,s.selected);assert.equal(s.focus.id,'109855');assert.equal(s.busy,false);
 assert.ok(s.selected.every((b:Obj)=>b.retrieval.mode==='live-query'));assert.deepEqual(h.contextCalls.map(([b])=>b.id),['109855','819422']);
});

test('example resolution requires one distinct record per address and preserves the workspace on failure',async()=>{
 for(const mode of ['missing','two-from-one','duplicate','network']){
  const h=harness(),s=h.state,before=workspace(s),pending=s.compareExample();
  if(mode==='network'){h.calls[0].reject(Error('Example source failed'));h.calls[1].resolve(result([building('2')]));}
  else{
   h.calls[0].resolve(result(mode==='two-from-one'?[building('9'),building('2')]:[building('9')]));
   h.calls[1].resolve(result(mode==='duplicate'?[building('9')]:[]));
  }
  await pending;assert.deepEqual(workspace(s),before);assert.equal(h.contextCalls.length,0);assert.equal(s.busy,false);assert.ok(s.error.length>0);
 }
});

test('a superseded example cannot commit or clear the busy state of a newer source request',async()=>{
 for(const failOld of [false,true]){
  const h=harness(),s=h.state,old=s.compareExample(),search=s.loadRecords(query('latest'));
  if(failOld)h.calls[0].reject(Error('Obsolete example failure'));else h.calls[0].resolve(result([building('9')]));
  h.calls[1].resolve(result([building('2')]));await old;
  assert.equal(s.busy,true);assert.equal(s.error,'');assert.deepEqual(ids(s.selected),['101']);assert.equal(h.contextCalls.length,0);
  h.calls[2].resolve(result([building('301')],'latest'));await search;assert.deepEqual(ids(s.items),['301']);assert.equal(s.busy,false);
 }
});

test('manual selection or reset while the example loads prevents the late comparison from opening',async()=>{
 for(const action of ['manual','reset']){
  const h=harness(),s=h.state,pending=s.compareExample();
  if(action==='manual')s.selectBuilding(building('301'));else s.clearSelection();
  const before=workspace(s),count=h.contextCalls.length;
  h.calls[0].resolve(result([building('9')]));h.calls[1].resolve(result([building('2')]));await pending;
  assert.deepEqual(workspace(s),before);assert.equal(h.contextCalls.length,count);assert.equal(s.busy,false);
 }
});


test('a returned parcel search is rejected before source I/O or any workspace mutation',async()=>{
 const h=harness(),s=h.state,before=workspace(s);
 await assert.rejects(s.openReturnedSearch({unit:'parcel',q:'3000010001',page:5,cursor:901,limit:12}),/building outlines.*building search/i);
 assert.equal(h.calls.length,0);assert.equal(h.resolveCalls.length,0);assert.equal(h.contextCalls.length,0);
 assert.deepEqual(workspace(s),before);assert.equal(s.resultsOpen,false);assert.equal(s.busy,false);
});

test('opening a returned building search preserves its exact page, cursor and source filters',async()=>{
 for(const pagination of [{page:0,cursor:812345},{page:7,cursor:0},{page:7,cursor:812345}]){
  const h=harness(),s=h.state,selectedBefore=s.selected;
  const params={unit:'building',q:'LOMBARDY',borough:'BK',minArea:20000,zoning:'M',landUse:'06',bbox:[-74.02,40.68,-73.9,40.75],limit:12,...pagination};
  const pending=s.openReturnedSearch(params);
  assert.equal(h.calls.length,1);assert.deepEqual(plain(h.calls[0].query),params,'the actual handler must not restart pagination or silently change the spatial unit');
  h.calls[0].resolve({...result([building('201')]),query:params,next_page:8,next_cursor:812399,has_more:true});await pending;
  assert.deepEqual(plain(s.query),params);assert.deepEqual(plain(s.page.query),params);
  assert.equal(s.page.next_page,8);assert.equal(s.page.next_cursor,812399);assert.equal(s.resultsOpen,true);
  assert.equal(s.selected,selectedBefore);assert.deepEqual(ids(s.items),['201']);assert.equal(s.focus.id,'201');
 }
});

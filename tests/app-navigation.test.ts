import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(hash=''){
 const listeners=new Map<string,Set<()=>void>>(),slots:any[]=[],effects:(()=>void)[]=[];
 let index=0,cancellations=0;
 const history:any={state:null,entries:[{hash,state:null}],index:0,pushState(state:any,_title:string,next:string){this.state=state;window.location.hash=next;this.entries=this.entries.slice(0,this.index+1);this.entries.push({hash:next,state});this.index++;}};
 const window={location:{hash},history,addEventListener:(name:string,listener:()=>void)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(listener);},removeEventListener:(name:string,listener:()=>void)=>listeners.get(name)?.delete(listener)};
 const react={useState:(initial:any)=>{const i=index++;if(!(i in slots))slots[i]=initial;return[slots[i],(next:any)=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useRef:(initial:any)=>{const i=index++;return slots[i]??(slots[i]={current:initial});},useCallback:(fn:any)=>{index++;return fn;},useEffect:(fn:()=>void)=>{const i=index++;if(!(i in slots)){slots[i]=true;effects.push(fn);}}};
 const module={exports:{} as any};
 const code=ts.transpileModule(readFileSync(new URL('../lib/app-navigation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new vm.Script(code).runInNewContext({module,exports:module.exports,require:(id:string)=>{assert.equal(id,'react');return react;},window});
 const render=()=>{index=0;return module.exports.useAppNavigation(()=>cancellations++);};
 render();effects.splice(0).forEach(fn=>fn());
 const travel=(delta:number)=>{history.index+=delta;const entry=history.entries[history.index];history.state=entry.state;window.location.hash=entry.hash;for(const event of ['popstate','hashchange'])listeners.get(event)?.forEach(fn=>fn());return render();};
 return {api:module.exports,render,window,history,travel,cancellations:()=>cancellations};
}

test('direct climate and story links decode without exposing place or report data',()=>{
 const h=harness('#climate/moisture');assert.equal(h.render().climateMode,'paired');assert.equal(h.render().tab,'climate');
 for(const hash of ['#investigation/energy','#investigation/surroundings']){const app=harness(hash).render();assert.equal(app.tab,'story');assert.equal(app.storyReturn,'home');}
 for(const hash of ['#constructor','#__proto__','#map?address=private','#unknown'])assert.equal(h.api.decodeAppRoute(hash).tab,'home');
});

test('user navigation cancels pending work, successful commits do not cancel themselves',()=>{
 const h=harness('#start');const initial=h.cancellations();
 h.render().setTab('explore');assert.equal(h.cancellations(),initial+1);
 h.render().setTab('explore');assert.equal(h.cancellations(),initial+1,'Same view is not a cancellation.');
 h.render().setTab('answer',{preservePending:true});assert.equal(h.cancellations(),initial+1);
 assert.equal(h.render().tab,'answer');assert.equal(h.window.location.hash,'#compare');
});

test('back/forward cancel once despite popstate plus hashchange and restore each story origin',()=>{
 const h=harness('#start');h.render().setTab('answer');h.render().setStory('energy');
 assert.equal(h.render().storyReturn,'answer');h.render().setTab('home');h.render().setStory('footprint');
 assert.equal(h.render().storyReturn,'home');
 const before=h.cancellations();h.travel(-1);assert.equal(h.cancellations(),before+1);
 const previous=h.travel(-1);assert.equal(previous.story,'energy');assert.equal(previous.storyReturn,'answer');
 h.travel(1);const future=h.travel(1);assert.equal(future.story,'footprint');assert.equal(future.storyReturn,'home');
});

test('same-turn climate mode and navigation commits do not lose the chosen mode',()=>{
 const h=harness('#map');const app=h.render();app.setClimateMode('paired');app.setTab('climate');
 assert.equal(h.render().climateMode,'paired');assert.equal(h.window.location.hash,'#climate/moisture');
 h.render().setClimateMode('future');assert.equal(h.travel(-1).climateMode,'paired');assert.equal(h.travel(1).climateMode,'future');
 const fromBareHome=harness(''),home=fromBareHome.render();home.setClimateMode('paired');home.setTab('climate');
 assert.equal(fromBareHome.history.entries.length,2,'Do not insert an extra Start history entry while preparing climate mode.');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''),require=createRequire(root+'/package.json');
const ts=require('typescript'),{renderToStaticMarkup}=require('react-dom/server');
function compile(file,imports={},globals={}){const module={exports:{}};const source=ts.transpileModule(readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new vm.Script(source).runInNewContext({module,exports:module.exports,Date,AbortController,Error,require:name=>name in imports?imports[name]:name.endsWith('.css')?{}:require(name),...globals});return module.exports;}
const display=compile('lib/local-review-display.ts');
const ids=['109855','819422'],stamp='2026-10-31T18:00:00.000Z';
function review(){
 const evidence=ids.flatMap(id=>['footprint_area_sqft','roof_height_ft'].map(key=>({evidenceId:id+':'+key+':current',buildingIds:[id],origin:'public_record',label:'Fixture public measurement',text:'Fixture '+id+' '+key+' recorded value.',scope:key==='footprint_area_sqft'?'building_footprint':'building',scopeNote:'Source scope retained in this test fixture.',source:{id:'nyc-footprints',label:'NYC building footprints',url:'https://data.cityofnewyork.us/d/5zhs-2jue',recordId:id,retrievedAt:stamp}})));
 const actions=ids.map((id,i)=>({id:'check_'+(i+1),title:'Request measured floor plan '+(i+1),action:'Ask the owner for the current measured floor plan.',buildingIds:[id],support:[{evidenceId:evidence[i*2].evidenceId,quote:evidence[i*2].text}]}));
 return{kind:'local_glimmer_review',status:'completed',model:'muse-glimmer',modelLabel:'Muse Glimmer 30B',execution:'local-loopback',modelGenerated:true,grounded:false,buildingIds:ids,actions,priority:{actionId:'check_1',ifFinding:'the measured area meets the requirement',thenAction:'inspect the loading arrangement',support:actions[0].support},evidence,createdAt:stamp,timing:{requestMs:20},provenance:{notesLabel:'Your inspection notes',endpointHost:'127.0.0.1',packetSha256:'a'.repeat(64),sourceRecordRetrievedAt:Object.fromEntries(ids.map(id=>[id,stamp]))}};
}
function harness(){
 const slots=[],effects=[],calls=[],timers=new Map();let index=0,dirty=true,tree,timer=0,closed=0,unmounted=false;
 const props={selected:ids.map((id,i)=>({id,address:'Fixture building '+(i+1)})),onClose(){closed++;}};
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const hooks={useState(value){const i=index++;if(!slots[i])slots[i]={value};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true;}];},useRef(value){const i=index++;return(slots[i]??={current:value});},useId(){return'field-'+index++;},useEffect(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
 const component=compile('components/local-review-panel.tsx',{'@/lib/local-review-display':display,react:hooks},{window:{setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}},fetch(url,init){return new Promise((resolve,reject)=>calls.push({url,init,resolve:body=>resolve({ok:body.ok??true,json:async()=>body.body??body}),reject}));}});
 const nodes=e=>!e||typeof e!=='object'?[]:Array.isArray(e)?e.flatMap(nodes):[e,...nodes(e.props?.children)];
 function flush(){if(unmounted)return;let loops=0;while(dirty||effects.length){if(++loops>25)throw Error('Render loop');if(dirty){dirty=false;index=0;tree=component.default(props);for(const n of nodes(tree))if(n.props?.ref&&typeof n.props.ref==='object')n.props.ref.current={scrollIntoView(){}};}while(effects.length)effects.shift()();}}
 const find=fn=>nodes(tree).find(fn);
 function edit(field,value){nodes(tree).filter(n=>n.type==='textarea')[field].props.onChange({target:{value}});flush();}
 function send(){const pending=find(n=>n.type==='form').props.onSubmit({preventDefault(){}});flush();return pending;}
 function unmount(){unmounted=true;slots.forEach(s=>s?.cleanup?.());}
 async function tick(){await new Promise(r=>setImmediate(r));flush();}
 flush();return{calls,timers,find,edit,send,flush,tick,unmount,html:()=>renderToStaticMarkup(tree),closed:()=>closed,slots};
}
test('private notes submit only to the local route with IDs, question and notes',async()=>{
 const h=harness();h.edit(0,'Which site check comes first?');h.edit(1,'QA ONLY: private owner note.');const pending=h.send();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/local-review');assert.deepEqual(JSON.parse(h.calls[0].init.body),{selectedIds:ids,question:'Which site check comes first?',notes:'QA ONLY: private owner note.'});assert.equal(h.calls[0].init.method,'POST');assert.equal(h.timers.size,1);
 h.calls[0].resolve(review());await pending;await h.tick();assert.match(h.html(),/Request measured floor plan 1/);assert.match(h.html(),/Supporting records/);assert.doesNotMatch(h.html(),/Evidence behind this check/);assert.equal(h.timers.size,0);assert.ok(h.find(n=>n.type==='details').props.open);
});
test('changing either source text clears the old review before a new request',async()=>{
 for(const field of [0,1]){const h=harness(),pending=h.send();h.calls[0].resolve(review());await pending;await h.tick();assert.match(h.html(),/Glimmer’s suggested first check/);h.edit(field,'Revised source text');assert.doesNotMatch(h.html(),/Glimmer’s suggested first check|Request measured floor plan 1/);assert.equal(h.calls.length,1);}
});
test('stop invalidates a late response even when fetch ignores cancellation',async()=>{
 const h=harness(),pending=h.send();h.find(n=>n.type==='button'&&n.props.className==='local-review-submit').props.onClick();h.flush();assert.equal(h.calls[0].init.signal.aborted,true);h.calls[0].resolve(review());await pending;await h.tick();assert.doesNotMatch(h.html(),/Glimmer’s suggested first check/);assert.equal(h.timers.size,0);
});
test('close delegates to parent and unmount cancels the isolated local request',async()=>{
 const h=harness();h.edit(1,'QA ONLY PRIVATE');const pending=h.send();h.find(n=>n.type==='button'&&n.props.className==='local-review-back').props.onClick();assert.equal(h.closed(),1);h.unmount();assert.equal(h.calls[0].init.signal.aborted,true);h.calls[0].resolve(review());await pending;assert.equal(h.timers.size,0);assert.ok(!h.slots.some(s=>s?.value?.kind==='local_glimmer_review'));
});
test('server errors, changed selected IDs and forged quotes never produce an accepted result',async()=>{
 for(const mode of ['error','ids','quote']){const h=harness(),pending=h.send(),value=review();if(mode==='ids')value.buildingIds=[...ids].reverse();if(mode==='quote')value.actions[0].support[0].quote='Invented source';h.calls[0].resolve(mode==='error'?{ok:false,body:{error:'Local source lookup failed.'}}:value);await pending;await h.tick();assert.ok(h.find(n=>n.props?.role==='alert'));assert.doesNotMatch(h.html(),/Glimmer’s suggested first check/);assert.equal(h.calls.length,1);}
});
test('notes and response prose remain escaped React text',async()=>{
 const h=harness();h.edit(1,'<script>private()</script>');assert.match(h.html(),/&lt;script&gt;/);const pending=h.send(),value=review();value.actions[0].title='<img src=x onerror=alert(1)>';h.calls[0].resolve(value);await pending;await h.tick();assert.match(h.html(),/&lt;img/);assert.doesNotMatch(h.html(),/<img src=x|<script>/);
});

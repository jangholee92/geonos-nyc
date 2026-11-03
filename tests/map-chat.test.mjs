// Focused mocked checks for the new component; no provider or public-source calls.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const require=createRequire(root+'/package.json'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function compile(file,imports={},globals={}){const module={exports:{}};const code=ts.transpileModule(readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new vm.Script(code,{filename:file}).runInNewContext({module,exports:module.exports,URL,URLSearchParams,TextEncoder,AbortController,Date,Error,SyntaxError,fetch:()=>{throw Error('No network permitted')},require:name=>name in imports?imports[name]:name.endsWith('.css')?{}:require(name),...globals});return module.exports;}
const city=compile('lib/city.ts',{'./public-fetch':{fetchPublicJson:()=>{throw Error('No network')}},'./city-quality.json':JSON.parse(readFileSync(root+'/lib/city-quality.json','utf8'))});
const decision=compile('lib/decision-plan.ts');
const reviewed=compile('lib/reviewed-plan.ts',{'./city':city,'./decision-plan':decision});
const quality=compile('components/energy-source-qualifications.tsx');
const imagery=compile('components/site-imagery-evidence.tsx');
const visualComparison=compile('components/visual-comparison-result.tsx',{'./site-imagery-evidence':imagery});
const temporalPair=compile('lib/temporal-pair.ts');
const temporalImagery=compile('components/temporal-imagery-result.tsx',{'../lib/temporal-pair':temporalPair});
const result=compile('components/meta-investigation-result.tsx',{'./energy-source-qualifications':quality,'./visual-comparison-result':visualComparison,'./temporal-imagery-result':temporalImagery});
// These child interactions are tested separately; keep their props visible to
// the parent state harness without invoking microphones or browser runtimes.
const VoiceStub=()=>null,MenuStub=()=>null,VisualStub=()=>null,TemporalStub=()=>null,LocalStub=()=>null;
const imports={'./local-review-panel':{__esModule:true,default:LocalStub},'./site-imagery-evidence':imagery,'@/lib/city':city,'@/lib/reviewed-plan':reviewed,'./meta-investigation-result':result,'./voice-note-composer':{__esModule:true,default:VoiceStub},'./chat-analysis-menu':{__esModule:true,default:MenuStub},'./visual-comparison-result':{...visualComparison,__esModule:true,default:VisualStub},'./temporal-imagery-result':{...temporalImagery,__esModule:true,default:TemporalStub}};
const plain=compile('components/map-chat.tsx',imports);
const planning=compile('lib/planning-context.ts',{'./climate-evidence-index.json':JSON.parse(readFileSync(root+'/lib/climate-evidence-index.json','utf8'))});
const ready={configured:true,approved:true,canRun:true,liveVerified:false,status:'ready_for_verification'};
const pending={configured:false,approved:false,canRun:false,liveVerified:false,status:'approval_pending'};
const building=(id='123')=>({id,address:'211 LOMBARDY STREET',bin:'3338236',bbl:'3028220001',entity_type:'building'});
const clarification=(answer='Which measurement do you mean?')=>({kind:'clarification',answer,clarification:{question:answer,why:'Footprint and usable area are different.',options:[{label:'Mapped footprint',value:'footprint'}]},model:'mock-test',grounded:false,toolCalls:[]});
const conversation=(answer='Tell me what matters to your project.')=>({kind:'conversation',answer,grounded:false,responseOrigin:'model-synthesis',citations:[],toolCalls:[],evidence:[],model:'mock-test',groundingNote:'Model interpretation; source references apply only to the cited facts.'});
const resilienceBrief=()=>({kind:'resilience_brief',focus:'comparison',responseOrigin:'source-based-rules',modelGenerated:false,answer:'Usable space and entrance protection need documentation before the retrofit comparison can be resolved.',places:[{id:'123',address:'Fixture A'},{id:'456',address:'Fixture B'}],observations:[],conditionalTradeoffs:[],nextChecks:[{id:'entrances',title:'Check entrances',action:'Request surveyed entrance elevations.',whyItMatters:'Point tests do not establish entrance flooding.',whatCouldChange:'Entrance protection could change the adaptation scope.',buildingIds:['123','456'],evidenceIds:[]},{id:'power',title:'Check electrical service',action:'Request documented available capacity.',whyItMatters:'Floor area does not establish available power.',whatCouldChange:'A required service upgrade could change the retrofit scope.',buildingIds:['123','456'],evidenceIds:[]}],planningContext:null,limitations:['No investment return is calculated.'],citations:[],groundingNote:'Application rules preserve public-data scope.',providerStatus:{status:'content_filtered',code:'MODEL_CONTENT_FILTERED',message:'Meta could not answer this request.',model:'mock-test'},toolCalls:[],evidence:[],model:'mock-test'});
const planPayload=()=>({kind:'decision',answer:'No operational requirement has been established.',planNeedsReview:true,grounded:true,plan:{intent:'understand',purpose:'general',userQuestion:'Understand this place.',requirements:[]},decision:{valid:true,candidates:[{id:'123',label:'Lombardy',status:'not_assessed',requirements:[]}]},evidence:[{id:'123',building:{id:'123',entity_type:'building'}}],model:'mock-test',toolCalls:[]});
function harness(initial={},browser={}){
 const storage=browser.storage??new Map();
 const slots=[];let index=0,dirty=true,tree,props={selected:[building()],query:{},onApplyReviewed:async()=>{},onOpenSearch:async()=>{},...initial};const layout=[],effects=[],calls=[],timers=new Map();let timer=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const refObject={scrollTop:0,scrollHeight:2000,clientHeight:200,scrollTo({top}){this.scrollTop=top;},focus(){}};
 const hooks={useState(value){const i=index++;if(!slots[i])slots[i]={value:typeof value==='function'?value():value};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},useRef(value){const i=index++;return(slots[i]??={current:value});},useId(){return'id-'+index++;},useMemo(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},useLayoutEffect(fn,deps){effect(layout,fn,deps);},useEffect(fn,deps){effect(effects,fn,deps);}};
 function effect(queue,fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};queue.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}
 const component=compile('components/map-chat.tsx',{...imports,react:hooks},{window:{get sessionStorage(){if(browser.storageUnavailable)throw Error('Storage unavailable');return{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};},setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}},fetch(url,init){return new Promise((resolve,reject)=>calls.push({url,init,resolve:payload=>resolve({ok:payload.ok??true,json:async()=>payload.body??payload}),reject}));}});
 function nodes(element){if(element===null||element===undefined||typeof element==='boolean')return[];if(Array.isArray(element))return element.flatMap(nodes);if(typeof element!=='object')return[];return[element,...nodes(element.props?.children)];}
 function flush(){let loops=0;while(dirty||layout.length||effects.length){if(++loops>50)throw Error('Render loop');if(dirty){dirty=false;index=0;tree=component.default(props);for(const n of nodes(tree))if(n.props?.ref&&typeof n.props.ref==='object')n.props.ref.current=refObject;}while(layout.length)layout.shift()();while(effects.length)effects.shift()();}return tree;}
 const find=(predicate)=>nodes(tree).find(predicate);
 const getText=()=>renderToStaticMarkup(tree);
 async function tick(){await new Promise(resolve=>setImmediate(resolve));flush();await new Promise(resolve=>setImmediate(resolve));flush();}
 function draft(value){find(n=>n.type==='textarea').props.onChange({target:{value}});flush();}
 function send(){const p=find(n=>n.type==='form').props.onSubmit({preventDefault(){}});flush();return p;}
 function change(next){props={...props,...next};dirty=true;flush();}
 flush();return{calls,storage,flush,tick,find,draft,send,change,getText,refObject,resolveStatus:async(value=ready)=>{calls[0].resolve(value);await tick();},tree:()=>tree};
}
test('unknown, malformed and contradictory provider status fails closed',()=>{
 for(const value of [null,{}, {...ready,canRun:'true'}, {...ready,status:'live'}, {...ready,approved:false}, {...pending,canRun:true},{...ready,configured:false}])assert.equal(plain.readMapChatStatus(value).canRun,false);
 assert.equal(plain.readMapChatStatus(pending).state,'approval_pending');assert.equal(plain.readMapChatStatus(ready).canRun,true);
});
test('standalone public demo is ready without a ChatGPT sign-in link',async()=>{
 const h=harness();await h.resolveStatus({...ready,requiresSignIn:false,accessMode:'anonymous-demo'});h.draft('Compare these two buildings.');
 assert.equal(plain.readMapChatStatus({...ready,requiresSignIn:false}).canRun,true);
 assert.equal(h.find(n=>n.type==='a'&&n.props.className==='map-chat-signin-link'),undefined);assert.doesNotMatch(h.getText(),/Sign in|ChatGPT/);
 assert.equal(plain.readMapChatStatus({...ready,requiresSignIn:true,signInUrl:'/signin-with-chatgpt'}).canRun,false);
});
test('demo outage preserves the draft and offers recheck without sign-in or automatic retry',async()=>{
 const h=harness();await h.resolveStatus();h.draft('Check the selected building.');const p=h.send();h.calls.at(-1).resolve({ok:false,body:{code:'DEMO_UNAVAILABLE',error:'Demo unavailable'}});await p;await h.tick();
 assert.equal(h.find(n=>n.type==='textarea').props.value,'Check the selected building.');assert.equal(h.find(n=>n.type==='a'&&n.props.className==='map-chat-signin-link'),undefined);assert.doesNotMatch(h.getText(),/Sign in|ChatGPT/);await h.send();assert.equal(h.calls.length,2);
});
test('voice demo outage invalidates audio context and preserves the current question',async()=>{
 const h=harness();await h.resolveStatus();h.draft('Existing draft');const voice=h.find(n=>n.type===VoiceStub),oldKey=voice.props.contextKey;voice.props.onAuthRequired();h.flush();
 assert.equal(h.find(n=>n.type===VoiceStub).props.disabled,true);assert.notEqual(h.find(n=>n.type===VoiceStub).props.contextKey,oldKey);assert.equal(h.find(n=>n.type==='textarea').props.value,'Existing draft');assert.doesNotMatch(h.getText(),/Sign in|ChatGPT/);assert.equal(h.calls.length,1);assert.equal(h.storage.size,0);
});
test('returned searches reject unsupported fields and unsafe type coercion',()=>{
 for(const q of [{url:'https://example.com'},{geometry:{}},{bbox:['-74',40.7,-73.9,40.8]},{minArea:'20000'},{q:{toString(){return'address';}}},{bbox:[-180,0,180,90]}])assert.equal(plain.readMapChatQuery(q),null);
 assert.equal(plain.readMapChatQuery({q:'Lombardy',unit:'building',minArea:20000}).minArea,20000);
 assert.equal(plain.mapChatContextKey([building()],{}),plain.mapChatContextKey([building()],city.validateQuery(new URLSearchParams())));
 assert.notEqual(plain.mapChatContextKey([building('1'),building('2')],{}),plain.mapChatContextKey([building('2'),building('1')],{}));
});
test('pending mode keeps an editable draft and never posts; untouched empty chat starts at top',async()=>{
 const h=harness();await h.resolveStatus(pending);h.draft('A draft, not a request.');await h.send();
 assert.equal(h.calls.length,1);assert.equal(h.find(n=>n.type==='textarea').props.value,'A draft, not a request.');assert.equal(h.find(n=>n.props?.['aria-label']==='Send unavailable until Meta is connected').props.disabled,true);assert.equal(h.refObject.scrollTop,0);
 h.change({query:city.validateQuery(new URLSearchParams())});assert.doesNotMatch(h.getText(),/Context changed/);assert.equal(h.refObject.scrollTop,0);
});
test('voice preparation blocks chat sending; reset and selection changes invalidate the child context',async()=>{
 const h=harness();await h.resolveStatus();h.draft('Keep this draft until a deliberate send.');
 const voice=()=>h.find(n=>n.type===VoiceStub),menu=()=>h.find(n=>n.type===MenuStub);const originalKey=voice().props.contextKey;
 voice().props.onBusyChange(true);h.flush();assert.equal(h.find(n=>n.props?.['aria-label']==='Send question to Meta').props.disabled,true);assert.equal(menu().props.disabled,true);
 await h.send();assert.equal(h.calls.length,1);assert.equal(h.find(n=>n.type==='textarea').props.value,'Keep this draft until a deliberate send.');
 h.find(n=>n.props?.['aria-label']==='Reset conversation').props.onClick();h.flush();const resetKey=voice().props.contextKey;assert.notEqual(resetKey,originalKey);assert.equal(h.find(n=>n.type==='textarea').props.value,'');
 voice().props.onBusyChange(false);h.flush();h.change({selected:[building('456')]});assert.notEqual(voice().props.contextKey,resetKey);assert.equal(menu().props.context,voice().props.contextKey);assert.equal(h.calls.length,1);
});
test('analysis menu choices fill an editable draft without starting any provider request',async()=>{
 const h=harness({selected:[building('123'),building('456')]});await h.resolveStatus();const menu=h.find(n=>n.type===MenuStub);
 assert.equal(menu.props.count,2);assert.equal(menu.props.disabled,false);
 const question='Compare the aerial imagery of both selected buildings and identify the next useful inspection.';menu.props.onChoose(question);h.flush();
 assert.equal(h.find(n=>n.type==='textarea').props.value,question);assert.equal(h.calls.length,1);assert.equal(h.find(n=>n.props?.['aria-label']==='Send question to Meta').props.disabled,false);
});
test('adding a reviewed voice transcript only appends to the current draft and exposes its actual remaining capacity',async()=>{
 const h=harness();await h.resolveStatus();h.draft('Existing question');let voice=h.find(n=>n.type===VoiceStub);assert.equal(voice.props.remainingCharacters,4000-'Existing question'.length-1);
 voice.props.onTranscript('Reviewed speech');h.flush();assert.equal(h.find(n=>n.type==='textarea').props.value,'Existing question\nReviewed speech');assert.equal(h.calls.length,1);
 h.draft('x'.repeat(4000));voice=h.find(n=>n.type===VoiceStub);assert.equal(voice.props.remainingCharacters,-1);assert.equal(h.calls.length,1);
});
test('a selection change cancels an in-flight answer even if the response ignores abort and selection returns',async()=>{
 const h=harness();await h.resolveStatus();h.draft('Inspect this selected building.');const p=h.send();const sent=h.calls[1];assert.equal(JSON.parse(sent.init.body).selectedIds[0],'123');assert.equal(JSON.parse(sent.init.body).geometry,undefined);
 h.change({selected:[building('456')]});h.change({selected:[building('123')]});assert.equal(sent.init.signal.aborted,true);
 sent.resolve(clarification('STALE RESPONSE MUST NOT APPEAR'));await p;await h.tick();assert.doesNotMatch(h.getText(),/STALE RESPONSE MUST NOT APPEAR/);assert.match(h.getText(),/reply was cancelled/);assert.equal(h.find(n=>n.type==='textarea').props.value,'Inspect this selected building.');
});
test('reset invalidates late responses without clearing native map selection',async()=>{
 const h=harness();await h.resolveStatus();h.draft('Old request');const p=h.send();h.find(n=>n.props?.['aria-label']==='Reset conversation').props.onClick();h.flush();h.calls[1].resolve(clarification('LATE AFTER RESET'));await p;await h.tick();assert.doesNotMatch(h.getText(),/LATE AFTER RESET|Old request/);assert.equal(h.refObject.scrollTop,0);
 h.draft('New request');const next=h.send();const body=JSON.parse(h.calls.at(-1).init.body);assert.deepEqual(body.selectedIds,['123']);assert.deepEqual(body.history,[]);h.calls.at(-1).resolve(clarification());await next;await h.tick();
});
test('provider errors retain the original input for retry and never become an evidence result',async()=>{
 const h=harness();await h.resolveStatus();h.draft('Check electrical capacity');const p=h.send();h.calls[1].resolve({ok:false,body:{error:'Official source unavailable.',code:'MODEL_INVALID_RESPONSE'}});await p;await h.tick();assert.equal(h.find(n=>n.type==='textarea').props.value,'Check electrical capacity');assert.match(h.getText(),/Official source unavailable/);assert.doesNotMatch(h.getText(),/Use these reviewed conditions/);
});
test('conversation pins the original exchange and latest seven pairs across selection and query changes',async()=>{
 const h=harness();await h.resolveStatus();
 for(let i=0;i<10;i++){h.draft('Question '+i);const p=h.send();h.calls.at(-1).resolve(conversation('Reply '+i));await p;await h.tick();}
 const previous=JSON.parse(h.calls.at(-1).init.body).history;
 assert.equal(previous.length,16);assert.deepEqual(previous.filter(t=>t.role==='user').map(t=>t.content),['Question 0','Question 2','Question 3','Question 4','Question 5','Question 6','Question 7','Question 8']);
 h.change({selected:[building('456')],query:{borough:'QN',minArea:20000}});assert.match(h.getText(),/Conversation kept/);h.draft('Keep my original goal');const p=h.send();const body=JSON.parse(h.calls.at(-1).init.body);
 assert.equal(body.history.length,16);assert.deepEqual(body.history.filter(t=>t.role==='user').map(t=>t.content),['Question 0','Question 3','Question 4','Question 5','Question 6','Question 7','Question 8','Question 9']);
 assert.deepEqual(body.selectedIds,['456']);assert.equal(body.query.borough,'QN');assert.equal(body.query.minArea,20000);
 h.calls.at(-1).resolve(conversation());await p;await h.tick();
 h.find(n=>n.props?.['aria-label']==='Reset conversation').props.onClick();h.flush();h.draft('A fresh goal');const fresh=h.send();assert.deepEqual(JSON.parse(h.calls.at(-1).init.body).history,[]);h.calls.at(-1).resolve(conversation());await fresh;await h.tick();
});
test('the UTF-8 budget removes middle pairs before shortening replies and never rewrites pinned user goals',()=>{
 const history=Array.from({length:10},(_,i)=>[{role:'user',content:'Goal '+i+' '+ '한'.repeat(3900)},{role:'assistant',content:'Reply '+i+' '+ '한'.repeat(3900)}]).flat();
 const before=JSON.stringify(history),bodyText=plain.mapChatRequestBody('한'.repeat(4000),history,['123'],{q:'Long message'}),body=JSON.parse(bodyText);
 assert.ok(new TextEncoder().encode(bodyText).length<=58000);assert.equal(body.history.length,4);
 assert.equal(body.history[0].content,history[0].content);assert.equal(body.history[2].content,history.at(-2).content);assert.ok(body.history[1].content.length<history[1].content.length||body.history[3].content.length<history.at(-1).content.length);
 assert.deepEqual(body.history.map(t=>t.role),['user','assistant','user','assistant']);assert.equal(JSON.stringify(history),before);
});
test('a late explicit horizon survives ten-plus exchanges and its latest correction wins in the actual planning reader',()=>{
 let history=[];
 const append=(content)=>{history=plain.retainMapChatHistory([...history,{role:'user',content},{role:'assistant',content:'A reply, not new evidence.'}]);};
 const context=()=>planning.readPlanningContext(history.filter(turn=>turn.role==='user').map(turn=>turn.content).reverse(),new Date('2026-10-28T12:00:00Z'));
 append('Compare two buildings for a cold-storage retrofit.');append('Use the next 10 years.');
 for(let i=0;i<12;i++)append('Follow-up '+i);
 assert.equal(history.length,16);assert.equal(history[0].content,'Compare two buildings for a cold-storage retrofit.');assert.ok(history.some(turn=>turn.content==='Use the next 10 years.'));assert.equal(context().planningWindow.requestedEndYear,2036);
 append('Actually use the next twenty years.');for(let i=0;i<12;i++)append('Later question '+i);
 assert.equal(history.length,16);assert.equal(context().planningWindow.requestedEndYear,2046);assert.equal(context().planningWindow.quote,'Actually use the next twenty years.');assert.ok(!history.some(turn=>turn.content==='Use the next 10 years.'));
 append('Instead, use 2037.');for(let i=0;i<12;i++)append('Unrelated detail '+i);
 assert.equal(context().status,'unsupported');assert.equal(context().planningWindow.quote,'Instead, use 2037.');assert.equal(context().planningWindow.publishedHorizon,null);
});
test('source years and quantities cannot displace the user horizon; explicit unsupported requests can',()=>{
 for(const content of ['Built in 1931; mapped footprint 4000 ft².','NPCC4 (2024), baseline 1981–2010.','Budget $2024 and 2050 kW.','The assessment was published in 2024.']){
  assert.equal(plain.hasExplicitPlanningTime(content),false,content);
  assert.equal(planning.readPlanningContext([content],new Date('2026-10-28T12:00:00Z')).planningWindow.origin,'application_default',content);
 }
 for(const content of ['Over the next ten years','Use 2050s','In a decade','Tomorrow','The past five years','Use 2200'])assert.equal(plain.hasExplicitPlanningTime(content),true,content);
});
test('the byte budget preserves the original goal, time clarification and latest user request without mutation',()=>{
 const pair=content=>[{role:'user',content},{role:'assistant',content:'Reply '+ '한'.repeat(3900)}];
 const history=[...pair('Original goal '+ '한'.repeat(3900)),...pair('Use the next ten years. '+ '한'.repeat(3900)),...Array.from({length:10},(_,i)=>pair('Detail '+i+' '+ '한'.repeat(3900))).flat()];
 const before=JSON.stringify(history),serialized=plain.mapChatRequestBody('한'.repeat(4000),history,['123','456'],{}),body=JSON.parse(serialized),users=body.history.filter(turn=>turn.role==='user').map(turn=>turn.content);
 assert.ok(new TextEncoder().encode(serialized).length<=58000);assert.equal(body.history.length,6);assert.deepEqual(users,[history[0].content,history[2].content,history.at(-2).content]);assert.equal(JSON.stringify(history),before);assert.equal(planning.readPlanningContext([...users].reverse(),new Date('2026-10-28T12:00:00Z')).planningWindow.requestedEndYear,2036);
});
test('history keeps complete exchanges and truncates without leaving an orphan surrogate',()=>{
 const input=[{role:'assistant',content:'orphan'},{role:'user',content:'goal'},{role:'assistant',content:'a'.repeat(3999)+'😀'},{role:'user',content:'unfinished'}];
 const retained=JSON.parse(JSON.stringify(plain.retainMapChatHistory(input)));assert.deepEqual(retained.map(t=>t.role),['user','assistant']);assert.equal(retained[0].content,'goal');assert.equal(retained[1].content,'a'.repeat(3999));
});
test('a cancelled turn never enters retained history after a context change',async()=>{
 const h=harness();await h.resolveStatus();h.draft('My original goal');let p=h.send();h.calls.at(-1).resolve(conversation('Original reply'));await p;await h.tick();
 h.draft('Old selected place');p=h.send();const old=h.calls.at(-1);h.change({selected:[building('456')]});old.resolve(conversation('STALE BUILDING FACT'));await p;await h.tick();
 h.draft('New selected place, same goal');const next=h.send();const body=JSON.parse(h.calls.at(-1).init.body);assert.deepEqual(body.history.map(t=>t.content),['My original goal','Original reply']);assert.deepEqual(body.selectedIds,['456']);assert.doesNotMatch(h.getText(),/STALE BUILDING FACT/);h.calls.at(-1).resolve(conversation());await next;await h.tick();
});
test('reviewable plans require an explicit click and never reactivate after A→B→A',async()=>{
 let applied=0;const h=harness({onApplyReviewed:async()=>{applied++;}});await h.resolveStatus();h.draft('Understand this place.');const p=h.send();h.calls[1].resolve(planPayload());await p;await h.tick();assert.equal(applied,0);assert.match(h.getText(),/Use these reviewed conditions/);
 h.change({selected:[building('456')]});h.change({selected:[building('123')]});assert.doesNotMatch(h.getText(),/Use these reviewed conditions/);assert.equal(applied,0);assert.match(h.getText(),/Earlier context/);
});
test('user text, assistant text and source record labels stay escaped',async()=>{
 const h=harness({selected:[{...building(),address:'<img src=x onerror=alert(1)>'}]});await h.resolveStatus();h.draft('<script>user()</script>');const p=h.send();h.calls[1].resolve(clarification('<script>answer()</script>'));await p;await h.tick();
 assert.match(h.getText(),/&lt;img/);assert.match(h.getText(),/&lt;script&gt;user/);assert.match(h.getText(),/&lt;script&gt;answer/);assert.doesNotMatch(h.getText(),/<img src=x|<script>/);
});

function nodes(element,visibleOnly=false){
 if(element===null||element===undefined||typeof element==='boolean')return[];
 if(Array.isArray(element))return element.flatMap(e=>nodes(e,visibleOnly));
 if(typeof element!=='object')return[];
 if(element.type===result.MetaAnswerText)return[element,...nodes(result.MetaAnswerText(element.props),visibleOnly)];
 if(element.type===result.ResilienceBriefText)return[element,...nodes(result.ResilienceBriefText(element.props),visibleOnly)];
 let children=element.props?.children;
 if(visibleOnly&&element.type==='details'&&!element.props.open)children=React.Children.toArray(children).filter(child=>child?.type==='summary');
 return[element,...nodes(children,visibleOnly)];
}
function visibleText(element){return nodes(element,true).flatMap(n=>React.Children.toArray(n.props?.children).filter(c=>typeof c==='string'||typeof c==='number')).join(' ');}

test('ready empty chat exposes only its simple heading, quiet greeting and composer',async()=>{
 const h=harness();await h.resolveStatus();const tree=h.tree(),html=h.getText();
 assert.equal(h.find(n=>n.type==='h2').props.children,'Meta');assert.equal(h.find(n=>n.type==='textarea').props.placeholder,'Message Meta…');
 assert.doesNotMatch(html,/Current chat context|selected place|211 LOMBARDY|Suggestions|API approval|Ready for a request|Public evidence has limits|Next fact to check|map-chat-suggestions|map-chat-places/);
 assert.equal(nodes(tree).filter(n=>n.type==='button').length,2);assert.equal(h.calls.length,1);
});

test('completed answers remain plain chat while every review action stays in closed Sources',async()=>{
 let applied=0;const h=harness({onApplyReviewed:async()=>{applied++;}});await h.resolveStatus();h.draft('Understand this place.');const pending=h.send();const payload=planPayload();payload.decision.nextQuestion={question:'A consequential next question'};h.calls[1].resolve(payload);await pending;await h.tick();
 const disclosure=h.find(n=>n.type==='details'&&n.props.className==='map-chat-evidence');assert.ok(disclosure);assert.notEqual(disclosure.props.open,true);
 assert.equal(nodes(disclosure).find(n=>n.type==='summary').props.children[0],'Sources');
 assert.match(visibleText(h.tree()),/No operational requirement has been established/);assert.doesNotMatch(visibleText(h.tree()),/Use these reviewed conditions|A consequential next question|Next fact to check|211 LOMBARDY/);
 const apply=nodes(disclosure).find(n=>n.type==='button'&&n.props.className==='map-chat-action');assert.ok(apply);assert.equal(applied,0);await apply.props.onClick();await h.tick();assert.equal(applied,1);
});

test('clarifications are conversational questions with optional choices inside Sources',async()=>{
 const h=harness();await h.resolveStatus();h.draft('How much space?');const pending=h.send();h.calls[1].resolve(clarification());await pending;await h.tick();
 assert.match(visibleText(h.tree()),/Which measurement do you mean/);assert.doesNotMatch(visibleText(h.tree()),/Footprint and usable|Mapped footprint|Choose an option/);
 const disclosure=h.find(n=>n.type==='details');assert.ok(nodes(disclosure).some(n=>n.type===result.default));assert.equal(h.calls.length,2);
});

test('returned source search is opt-in inside Sources and retains pagination',async()=>{
 let opened=null;const h=harness({onOpenSearch:async q=>{opened=q;}});await h.resolveStatus();h.draft('Find records');const pending=h.send();const payload=planPayload();payload.appliedQuery={unit:'building',q:'Smith',cursor:512,page:3};payload.toolCalls=[{name:'search_city',result:{page:{returned:1}}}];h.calls[1].resolve(payload);await pending;await h.tick();
 assert.equal(opened,null);assert.doesNotMatch(visibleText(h.tree()),/Open returned search/);const disclosure=h.find(n=>n.type==='details');const button=nodes(disclosure).find(n=>n.props?.className==='map-chat-search-action');assert.ok(button);await button.props.onClick();await h.tick();assert.equal(opened.cursor,512);assert.equal(opened.page,3);
});


test('source-free conversation renders readable safe Markdown without an empty Sources control',async()=>{
 const h=harness();await h.resolveStatus();h.draft('Explain the workflow');const p=h.send();h.calls.at(-1).resolve(conversation('### Start here\n\nChoose **two buildings**.\n\n- Inspect their footprint.\n- Keep usable area separate.\n\n> A reported fact is not a permit.\n\n<script>unsafe()</script>'));await p;await h.tick();
 const html=h.getText();assert.match(html,/<strong>two buildings<\/strong>/);assert.match(html,/<ul><li>Inspect their footprint/);assert.match(html,/<blockquote>A reported fact/);assert.match(html,/&lt;script&gt;unsafe/);assert.doesNotMatch(html,/<script>|### Start|&gt; A reported|map-chat-evidence|EVIDENCE INVESTIGATION|Plan review required/);assert.equal(h.find(n=>n.type==='details'),undefined);
});
test('conversation search remains opt-in, carries its returned query, and becomes inert after context changes',async()=>{
 let opened=null,applied=0;const h=harness({onOpenSearch:async q=>{opened=q;},onApplyReviewed:async()=>{applied++;}});await h.resolveStatus();h.draft('Find Smith buildings');const p=h.send(),payload=conversation('The returned page contains buildings on Smith Street.');payload.appliedQuery={unit:'building',q:'Smith',cursor:512,page:3};payload.toolCalls=[{name:'search_city',result:{page:{returned:1}}}];h.calls.at(-1).resolve(payload);await p;await h.tick();
 const disclosure=h.find(n=>n.type==='details');assert.ok(disclosure);assert.notEqual(disclosure.props.open,true);assert.equal(opened,null);assert.equal(applied,0);assert.doesNotMatch(visibleText(h.tree()),/Open returned search|Use these reviewed conditions/);
 const button=nodes(disclosure).find(n=>n.props?.className==='map-chat-search-action');await button.props.onClick();await h.tick();assert.equal(opened.cursor,512);assert.equal(opened.page,3);
 h.change({selected:[building('456')]});opened=null;await button.props.onClick();await h.tick();assert.equal(opened,null);assert.equal(applied,0);assert.doesNotMatch(h.getText(),/Open returned search/);
});

test('returned aerial evidence is inline in chat, while malformed visual data creates no image or empty card',async()=>{
 const visual={kind:'site_imagery',id:'synthetic-inline-test',buildingId:'123',address:'Synthetic renderer fixture',source:{label:'NYS 2024 orthoimagery',url:'https://gis.ny.gov/2024-orthoimagery',captureYear:2024,capturePeriod:'Spring 2024',retrievedAt:'2026-10-28T22:00:00Z'},image:{dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:768,height:768,bounds:[-74.001,40.671,-73.999,40.673]},footprint:{paths:['M100 100L300 100L300 300L100 300Z'],note:'Reference only.'},analysis:{model:'sam-3.1',status:'completed',note:'Synthetic renderer fixture, not a live model result.'},concepts:[{concept:'roof',status:'detected',objectCount:1,paths:['M110 110L290 110L290 290L110 290Z'],note:'Test region.'}],limitations:['Test fixture only.']};
 const h=harness();await h.resolveStatus();h.draft('Show the roof image');let pending=h.send(),payload=conversation('The image is attached.');payload.visualEvidence=[visual];h.calls.at(-1).resolve(payload);await pending;await h.tick();
 assert.ok(h.find(n=>n.type===imagery.default));assert.equal(h.find(n=>n.type==='details'),undefined);assert.match(h.getText(),/site-imagery-evidence/);assert.match(h.getText(),/AI roof analysis/);
 h.find(n=>n.props?.['aria-label']==='Reset conversation').props.onClick();h.flush();h.draft('Malformed response fixture');pending=h.send();payload=conversation('The text remains readable.');payload.visualEvidence=[{}];h.calls.at(-1).resolve(payload);await pending;await h.tick();assert.doesNotMatch(h.getText(),/site-imagery-evidence|<img|<figure/);assert.match(h.getText(),/The text remains readable/);
});

test('the public-data fallback is inline, honestly attributed, and retained for a natural follow-up with both places',async()=>{
 const h=harness({selected:[building('123'),building('456')]});await h.resolveStatus();h.draft('Compare resilience over the next ten years.');let pending=h.send();h.calls.at(-1).resolve(resilienceBrief());await pending;await h.tick();
 assert.match(visibleText(h.tree()),/Public-data comparison/);assert.match(visibleText(h.tree()),/was not generated by Meta/);assert.match(visibleText(h.tree()),/Check entrances/);assert.match(visibleText(h.tree()),/Request surveyed entrance elevations/);assert.doesNotMatch(visibleText(h.tree()),/could change the adaptation scope|Point tests do not establish entrance flooding/);assert.match(h.getText(),/could change the adaptation scope|Why these checks matter/);
 const sources=h.find(n=>n.type==='details'&&n.props.className==='map-chat-evidence');assert.ok(sources);assert.notEqual(sources.props.open,true);assert.doesNotMatch(visibleText(h.tree()),/Recorded comparison|Use these reviewed conditions|Open returned search/);assert.ok(h.find(n=>n.props?.['aria-label']==='Public-data comparison'));
 h.draft('Which documents should I request first?');pending=h.send();const body=JSON.parse(h.calls.at(-1).init.body);assert.equal(body.history[0].content,'Compare resilience over the next ten years.');assert.match(body.history[1].content,/application rules, not Meta/);assert.match(body.history[1].content,/Fixture A \(native ID 123\)/);assert.match(body.history[1].content,/Fixture B \(native ID 456\)/);assert.match(body.history[1].content,/Usable space and entrance protection/);assert.deepEqual(body.selectedIds,['123','456']);h.calls.at(-1).resolve(conversation('Document review continues.'));await pending;await h.tick();
});
test('a late public-data fallback cannot override a changed selection or enter the retained conversation',async()=>{
 const h=harness({selected:[building('123'),building('456')]});await h.resolveStatus();h.draft('Compare these two.');let pending=h.send();const old=h.calls.at(-1);h.change({selected:[building('789')]});old.resolve(resilienceBrief());await pending;await h.tick();assert.doesNotMatch(h.getText(),/Public-data comparison|Check entrances/);
 h.draft('What about this building?');pending=h.send();const body=JSON.parse(h.calls.at(-1).init.body);assert.deepEqual(body.history,[]);assert.deepEqual(body.selectedIds,['789']);h.calls.at(-1).resolve(conversation());await pending;await h.tick();
});


test('local review is explicit, isolated from cloud history, and cleared on context changes',async()=>{
 const h=harness({selected:[building('123'),building('456')]});await h.resolveStatus({...ready,localReview:{available:true}});
 h.draft('Existing public question');let p=h.send();h.calls.at(-1).resolve(conversation('Existing sourced reply'));await p;await h.tick();
 h.draft('Unsent public draft');h.find(n=>n.type===MenuStub).props.onLocalReview();h.flush();
 const local=h.find(n=>n.type===LocalStub);assert.ok(local);assert.deepEqual(Object.keys(local.props).sort(),['onClose','selected']);assert.equal(h.find(n=>n.type==='form'),undefined);assert.equal(h.calls.length,2);
 local.props.onClose();h.flush();assert.equal(h.find(n=>n.type==='textarea').props.value,'Unsent public draft');
 p=h.send();const body=JSON.parse(h.calls.at(-1).init.body);assert.deepEqual(body.history.map(t=>t.content),['Existing public question','Existing sourced reply']);assert.equal(h.calls.at(-1).url,'/api/chat');h.calls.at(-1).resolve(conversation());await p;await h.tick();
 h.find(n=>n.type===MenuStub).props.onLocalReview();h.flush();h.change({selected:[building('789'),building('456')]});assert.equal(h.find(n=>n.type===LocalStub),undefined);assert.ok(h.find(n=>n.type===MenuStub));
});
test('local inspection mode stays unavailable without its exact capability and two native buildings',async()=>{
 for(const localReview of [undefined,{available:false},{available:'true'}]){const h=harness({selected:[building('123'),building('456')]});await h.resolveStatus({...ready,localReview});assert.equal(h.find(n=>n.type===MenuStub).props.onLocalReview,undefined);}
 const h=harness({selected:[building('123'),building('p:3000000001')]});await h.resolveStatus({...ready,localReview:{available:true}});assert.equal(h.find(n=>n.type===MenuStub).props.onLocalReview,undefined);
});

test('a single-site public brief keeps its identity and honest origin in natural follow-up history',async()=>{
 const h=harness({selected:[building('123')]});await h.resolveStatus();h.draft('Explain this building for a cold-storage retrofit.');let pending=h.send();
 const p=resilienceBrief();p.places=p.places.slice(0,1);p.nextChecks=p.nextChecks.map(c=>({...c,buildingIds:['123']}));p.answer='Fixture A: mapped footprint 27,193 ft². Request dated plans.';
 h.calls.at(-1).resolve(p);await pending;await h.tick();assert.match(visibleText(h.tree()),/Public-data site brief/);assert.doesNotMatch(visibleText(h.tree()),/Public-data comparison/);
 h.draft('What should I request from the owner?');pending=h.send();const body=JSON.parse(h.calls.at(-1).init.body);assert.deepEqual(body.selectedIds,['123']);assert.match(body.history[1].content,/Public-data site brief produced by application rules, not Meta/);assert.match(body.history[1].content,/Fixture A \(native ID 123\)/);assert.doesNotMatch(body.history[1].content,/Fixture B/);
 h.calls.at(-1).resolve(conversation('Request a current plan.'));await pending;await h.tick();
});

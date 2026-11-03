import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=ts.transpileModule(readFileSync(new URL('../components/voice-note-composer.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const trackSet=()=>{const track={stops:0,stop(){this.stops++;}};return{track,getTracks(){return[track];}};};
function harness(){
 const slots=[],effects=[],permission=[],recorders=[],calls=[],added=[],busy=[],timeouts=new Map(),intervals=new Map();let index=0,dirty=true,tree,id=0;
 let props={disabled:false,contextKey:'place-A',remainingCharacters:4000,onTranscript:value=>added.push(value),onBusyChange:value=>busy.push(value)};
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const hooks={useState(initial){const i=index++;if(!slots[i])slots[i]={value:initial};return[slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},useRef(value){return slots[index++]??=( {current:value});},useEffect(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
 class Recorder{static isTypeSupported(){return true;}constructor(stream){this.stream=stream;this.state='inactive';this.mimeType='audio/webm';recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['synthetic recording'])});this.onstop?.();});}}
 const module={exports:{}};
 new vm.Script(source).runInNewContext({module,exports:module.exports,require:name=>name==='react'?hooks:name==='../lib/voice-audio'?{VOICE_FILE_BYTES:10485760,VOICE_SECONDS:60,prepareVoiceAudio:async()=>new Blob(['synthetic WAV'],{type:'audio/wav'})}:name.endsWith('.css')?{}:require(name),navigator:{mediaDevices:{getUserMedia(){const d=deferred();permission.push(d);return d.promise;}}},MediaRecorder:Recorder,Blob,FormData,AbortController,performance:{now:()=>1000},URL:{createObjectURL:()=>`blob:fixture-${++id}`,revokeObjectURL(){}},setTimeout(fn){const key=++id;timeouts.set(key,fn);return key;},clearTimeout(key){timeouts.delete(key);},setInterval(fn){const key=++id;intervals.set(key,fn);return key;},clearInterval(key){intervals.delete(key);},fetch(url,init){const d=deferred();calls.push({url,init,...d});return d.promise;}});
 function nodes(value){if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=='object')return[];return[value,...nodes(value.props?.children)];}
 function text(value){if(Array.isArray(value))return value.map(text).join('');if(typeof value==='string'||typeof value==='number')return String(value);return value&&typeof value==='object'?text(value.props?.children):'';}
 function flush(){let turns=0;while(dirty||effects.length){if(++turns>40)throw Error('Render loop');if(dirty){dirty=false;index=0;tree=module.exports.default(props);}while(effects.length)effects.shift()();}return tree;}
 const find=predicate=>nodes(tree).find(predicate);
 const button=label=>find(n=>n.type==='button'&&(n.props['aria-label']===label||text(n.props.children)===label));
 const click=label=>{const n=button(label);assert.ok(n,`Button ${label}`);n.props.onClick();flush();};
 async function tick(){await new Promise(resolve=>setImmediate(resolve));flush();await new Promise(resolve=>setImmediate(resolve));flush();}
 function upload(){find(n=>n.type==='input').props.onChange({target:{files:[{size:10,name:'synthetic.wav'}],value:'selected'}});flush();}
 function change(next){props={...props,...next};dirty=true;flush();}
 function unmount(){for(const slot of slots)slot?.cleanup?.();}
 flush();click('Voice note');return{permission,recorders,calls,added,busy,timeouts,intervals,click,button,find,flush,tick,upload,change,unmount,text:()=>text(tree)};
}
const result=text=>({ok:true,json:async()=>({kind:'voice_transcript',model:'muse-voice-transcribe-1.0',transcript:text,editable:true,autoSend:false,isEvidence:false})});

test('an unavailable demo informs the parent and never accepts or retries a transcript',async()=>{
 const h=harness();let requested=0;h.change({onAuthRequired:()=>{requested++;}});h.upload();h.click('Transcribe with Meta');await h.tick();
 h.calls[0].resolve({ok:false,json:async()=>({code:'AUTH_REQUIRED',error:'Authentication required'})});await h.tick();
 assert.equal(requested,1);assert.match(h.text(),/public voice demo is temporarily unavailable/);assert.equal(h.calls.length,1);assert.equal(h.added.length,0);assert.equal(h.busy.at(-1),false);h.unmount();
});

test('a permission rejection from an abandoned recording cannot stop the newer microphone stream',async()=>{
 const h=harness();h.click('Record');h.click('Waiting for microphone… Cancel');h.click('Record');const current=trackSet();h.permission[1].resolve(current);await h.tick();
 h.permission[0].reject(Error('old permission rejection'));await h.tick();assert.equal(current.track.stops,0);assert.equal(h.recorders[0].state,'recording');assert.match(h.text(),/Stop ·/);h.unmount();assert.equal(current.track.stops,1);
});
test('queued callbacks from an older recorder cannot release or cancel a newer recording',async()=>{
 const h=harness(),old=trackSet();h.click('Record');h.permission[0].resolve(old);await h.tick();const oldStop=h.recorders[0].onstop,oldError=h.recorders[0].onerror;
 h.click('Close voice note');h.click('Voice note');h.click('Record');const current=trackSet();h.permission[1].resolve(current);await h.tick();
 oldStop();oldError();h.flush();assert.equal(current.track.stops,0);assert.equal(h.recorders[1].state,'recording');assert.match(h.text(),/Stop ·/);assert.doesNotMatch(h.text(),/stopped unexpectedly/);h.unmount();
});
test('a late permission grant after a selection change stops only its own tracks',async()=>{
 const h=harness();h.click('Record');h.change({contextKey:'place-B'});const late=trackSet();h.permission[0].resolve(late);await h.tick();assert.equal(late.track.stops,1);assert.equal(h.recorders.length,0);assert.equal(h.calls.length,0);assert.equal(h.added.length,0);h.unmount();
});
test('duplicate clicks start one transcription and only explicit Add transfers editable text',async()=>{
 const h=harness();h.upload();const action=h.button('Transcribe with Meta').props.onClick;action();action();h.flush();await h.tick();assert.equal(h.calls.length,1);assert.equal(h.busy.at(-1),true);
 h.calls[0].resolve(result('Original transcription'));await h.tick();assert.equal(h.added.length,0);h.find(n=>n.type==='textarea').props.onChange({target:{value:'Edited question'}});h.flush();h.click('Add to message');assert.deepEqual(h.added,['Edited question']);assert.equal(h.busy.at(-1),false);h.unmount();
});
test('a timed-out response that ignores abort never becomes an editable transcript',async()=>{
 const h=harness();h.upload();h.click('Transcribe with Meta');await h.tick();[...h.timeouts.values()][0]();assert.equal(h.calls[0].init.signal.aborted,true);
 h.calls[0].resolve(result('LATE TRANSCRIPT'));await h.tick();assert.doesNotMatch(h.text(),/LATE TRANSCRIPT/);assert.match(h.text(),/Transcription stopped/);assert.equal(h.added.length,0);assert.equal(h.busy.at(-1),false);h.unmount();
});
test('selection changes cancel transcription and cannot carry a late result into the next building',async()=>{
 const h=harness();h.upload();h.click('Transcribe with Meta');await h.tick();h.change({contextKey:'place-B'});assert.equal(h.calls[0].init.signal.aborted,true);h.calls[0].resolve(result('OLD BUILDING TRANSCRIPT'));await h.tick();h.click('Voice note');assert.doesNotMatch(h.text(),/OLD BUILDING TRANSCRIPT/);assert.equal(h.added.length,0);h.unmount();
});

import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node 25 strips TypeScript; application imports stay extensionless.
import {encodeVoiceWav} from '../lib/voice-audio.ts';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
type Obj=Record<string,any>;
test('voice audio is mono PCM16 with correct timing and clipped signed samples',()=>{const samples=new Float32Array(2400);samples.set([-2,-1,0,1,2]);const wav=encodeVoiceWav(samples),v=new DataView(wav.buffer);assert.equal(new TextDecoder().decode(wav.slice(0,4)),'RIFF');assert.equal(v.getUint32(4,true),wav.length-8);assert.equal(v.getUint16(20,true),1);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint32(24,true),24000);assert.equal(v.getUint32(28,true),48000);assert.equal(v.getUint32(40,true),4800);assert.deepEqual(Array.from({length:5},(_,i)=>v.getInt16(44+i*2,true)),[-32768,-32768,0,32767,32767]);});
test('invalid duration, unsupported sample rate and nonfinite audio are rejected before upload',()=>{for(const samples of [new Float32Array(0),new Float32Array(24000*60+1),new Float32Array(2400).fill(NaN),new Float32Array(2400).fill(Infinity)])assert.throws(()=>encodeVoiceWav(samples));assert.throws(()=>encodeVoiceWav(new Float32Array(4800),48000));assert.equal(encodeVoiceWav(new Float32Array(1600),16000).length,3244);});

function preparation(options:Obj={}):Obj{
 const contexts:Obj[]=[],offline:Obj[]=[],revoked:string[]=[],elements:Obj[]=[];
 class DecodeContext{closes=0;constructor(){contexts.push(this);}decodeAudioData(){return options.decode??Promise.resolve({duration:options.duration??1,numberOfChannels:options.channels??2,sampleRate:44100});}close(){this.closes++;return Promise.resolve();}}
 class RenderContext{destination={};frames:number;constructor(channels:number,frames:number,rate:number){this.frames=frames;offline.push({channels,frames,rate});}createBufferSource(){return{buffer:null,connect(){},start(){}};}startRendering(){return options.render??Promise.resolve({getChannelData:()=>new Float32Array(this.frames).fill(.25)});}}
 class Media{duration=options.metadataDuration??1;onloadedmetadata:(()=>void)|null=null;onerror:(()=>void)|null=null;constructor(){elements.push(this);}set src(_value:string){queueMicrotask(()=>this.onloadedmetadata?.());}removeAttribute(){}load(){}}
 const code=ts.transpileModule(readFileSync(new URL('../lib/voice-audio.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};
 new vm.Script(code).runInNewContext({module,exports:module.exports,require:()=>{throw Error('No imports');},Blob,Uint8Array,Float32Array,DataView,AudioContext:DecodeContext,OfflineAudioContext:RenderContext,Audio:Media,URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:(url:string)=>revoked.push(url)},setTimeout,clearTimeout});
 return{...module.exports,contexts,offline,revoked,elements};
}
test('browser preparation downmixes through one-channel 24kHz rendering and emits verified PCM timing',async()=>{
 const h=preparation(),output:Blob=await h.prepareVoiceAudio(new Blob(['synthetic encoded audio']),new AbortController().signal);
 assert.equal(output.type,'audio/wav');const bytes=new Uint8Array(await output.arrayBuffer()),v=new DataView(bytes.buffer);
 assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint32(24,true),24000);assert.equal(v.getUint32(40,true),48000);assert.deepEqual(h.offline,[{channels:1,frames:24000,rate:24000}]);assert.equal(h.contexts[0].closes,1);assert.deepEqual(h.revoked,['blob:synthetic']);
});
test('decoded duration and channels remain authoritative even if browser metadata claims a short clip',async()=>{
 for(const options of [{duration:61},{channels:9}]){const h=preparation(options);await assert.rejects(()=>h.prepareVoiceAudio(new Blob(['encoded']),new AbortController().signal));assert.equal(h.offline.length,0);assert.equal(h.contexts[0].closes,1);}
});
test('cancel while decoding returns promptly and closes its audio context without waiting for the decoder',async()=>{
 const controller=new AbortController(),h=preparation({decode:new Promise(()=>{})});const pending=h.prepareVoiceAudio(new Blob(['encoded']),controller.signal,1);await new Promise(resolve=>setImmediate(resolve));controller.abort();
 await assert.rejects(()=>pending,/cancelled/);assert.ok(h.contexts[0].closes>=1);assert.equal(h.offline.length,0);
});
test('cancel during offline rendering discards late audio and closes the decode context',async()=>{
 const controller=new AbortController(),h=preparation({render:new Promise(()=>{})});const pending=h.prepareVoiceAudio(new Blob(['encoded']),controller.signal,1);await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(()=>pending,/cancelled/);assert.equal(h.offline.length,1);assert.ok(h.contexts[0].closes>=1);
});
test('already cancelled preparation creates no audio context and oversized input is not decoded',async()=>{
 const h=preparation(),controller=new AbortController();controller.abort();await assert.rejects(()=>h.prepareVoiceAudio(new Blob(['encoded']),controller.signal,1),/cancelled/);await assert.rejects(()=>h.prepareVoiceAudio(new Blob([new Uint8Array(10485761)]),new AbortController().signal,1),/10 MB/);assert.equal(h.contexts.length,0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
type Helper = typeof import('../lib/public-fetch');
type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown>; body?: { cancel: () => Promise<void> } };
function harness(fetcher:(url:URL|string,init:RequestInit)=>Promise<FakeResponse>,browser=false){
 let now=0,nextTimer=0;const timers=new Map<number,{at:number;run:()=>void}>(),logs:unknown[][]=[];
 const source=readFileSync(new URL('../lib/public-fetch.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,fetch:fetcher,AbortController,SyntaxError,Date:{now:()=>now},console:{warn:(...items:unknown[])=>logs.push(items)},...(browser?{window:{}}:{}),setTimeout:(run:()=>void,delay:number)=>{const id=++nextTimer;timers.set(id,{at:now+delay,run});return id},clearTimeout:(id:number)=>timers.delete(id)});
 return{api:module.exports as Helper,logs,timers,advance(ms:number){now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.run()}}};
}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve()}

test('four slots include JSON body consumption; queued deadlines begin only on acquisition',async()=>{
 const bodies:{resolve:(x:unknown)=>void;signal:AbortSignal}[]=[];let active=0,peak=0;
 const h=harness(async(_url,init)=>{assert.equal(init.credentials,'same-origin');assert.equal(init.method,'GET');assert.equal(init.headers,undefined);active++;peak=Math.max(peak,active);const signal=init.signal!;
  return{ok:true,status:200,json:()=>new Promise((resolve,reject)=>{let complete=false;const finish=(fn:()=>void)=>{if(complete)return;complete=true;active--;fn()};bodies.push({signal,resolve:v=>finish(()=>resolve(v))});signal.addEventListener('abort',()=>finish(()=>reject(new Error('aborted'))),{once:true})})};});
 const first=Array.from({length:4},(_,i)=>h.api.fetchPublicJson('https://public.example/'+i,{timeoutMs:200}));
 const queued=h.api.fetchPublicJson('https://public.example/queued',{timeoutMs:20});
 const outcome=queued.then(()=> 'unexpected',e=>e.code);
 await flush();assert.equal(bodies.length,4);assert.equal(h.timers.size,4);
 h.advance(50);await flush();assert.equal(bodies.length,4);assert.ok(bodies.every(b=>!b.signal.aborted));
 bodies[0].resolve({ok:true});await flush();assert.equal(bodies.length,5);assert.equal(active,4);assert.equal(peak,4);
 h.advance(19);assert.equal(bodies[4].signal.aborted,false);
 h.advance(1);await flush();assert.equal(await outcome,'PUBLIC_TIMEOUT');
 for(const b of bodies.slice(1,4))b.resolve({ok:true});await Promise.all(first);assert.equal(active,0);assert.equal(h.timers.size,0);
 assert.equal(h.logs.length,1);assert.equal((h.logs[0][1] as any).elapsed_ms,20);
});
test('same-origin assets retain their site session while external source requests never use include credentials',async()=>{
 const seen:{url:string;credentials:RequestCredentials|undefined;headers:HeadersInit|undefined}[]=[];
 const h=harness(async(url,init)=>{seen.push({url:String(url),credentials:init.credentials,headers:init.headers});return{ok:true,status:200,json:async()=>({ok:true})};},true);
 for(const url of ['/data/surroundings/10.json.gz','/data/energy/302.json','https://data.cityofnewyork.us/resource/5zhs-2jue.json'])await h.api.fetchPublicJson(url);
 assert.deepEqual(seen.map(request=>request.url),['/data/surroundings/10.json.gz','/data/energy/302.json','https://data.cityofnewyork.us/resource/5zhs-2jue.json']);
 // Fetch's same-origin policy carries cookies only for the hosting origin;
 // cross-origin NYC requests remain credential-free without a URL heuristic.
 assert.ok(seen.every(request=>request.credentials==='same-origin'&&request.headers===undefined));
 assert.equal(seen.some(request=>request.credentials==='include'),false);
 assert.equal(h.logs.length,0);assert.equal(h.timers.size,0);
});
test('HTTP failures cancel unread bodies before releasing slots and queued requests recover',async()=>{
 let started=0,canceled=0;const releases:(()=>void)[]=[];
 const h=harness(async()=>{started++;if(started<=4)return{ok:false,status:503,json:async()=>{throw Error('must not expose body')},body:{cancel:()=>new Promise<void>(resolve=>releases.push(()=>{canceled++;resolve()}))}};return{ok:true,status:200,json:async()=>({ok:true})}});
 const failures=Array.from({length:4},()=>h.api.fetchPublicJson('https://public.example/error').catch(e=>e.code));
 const queued=h.api.fetchPublicJson('https://public.example/next');await flush();assert.equal(started,4);assert.equal(releases.length,4);
 releases[0]();await flush();assert.equal(started,5);assert.deepEqual(await queued,{ok:true});
 releases.slice(1).forEach(f=>f());assert.deepEqual(await Promise.all(failures),Array(4).fill('PUBLIC_HTTP_ERROR'));assert.equal(canceled,4);assert.equal(h.timers.size,0);
});
test('timeouts and JSON failures log bounded metadata without URLs, headers or upstream text',async()=>{
 let call=0;const h=harness(async()=>{if(++call===1)throw Error('secret upstream URL token=hidden');return{ok:true,status:200,json:async()=>{throw new SyntaxError('private source body')}}});
 await assert.rejects(h.api.fetchPublicJson('https://public.example/?token=hidden',{label:'https://bad-label/?private',headers:{Authorization:'never-log-this'}}),{code:'PUBLIC_NETWORK_ERROR'});
 await assert.rejects(h.api.fetchPublicJson('https://public.example/?q=private',{label:'64uk-42ks'}),{code:'PUBLIC_INVALID_JSON'});
 const logs=JSON.stringify(h.logs);assert.ok(!/hidden|private|never-log|https:/.test(logs));assert.equal((h.logs[0][1] as any).dataset,'public');assert.equal((h.logs[1][1] as any).dataset,'64uk-42ks');assert.equal(h.timers.size,0);
 const browser=harness(async()=>{throw Error('offline')},true);await assert.rejects(browser.api.fetchPublicJson('https://public.example/'));assert.equal(browser.logs.length,0);
});
test('custom stream decoding retains the same four slots and acquisition-based deadline',async()=>{
 const signals=new WeakMap<object,AbortSignal>(),finish:(()=>void)[]=[];let started=0,decoding=0,peak=0;
 const h=harness(async(_url,init)=>{started++;const response={ok:true,status:200,json:async()=>{throw Error('The custom reader must consume this body.')}};signals.set(response,init.signal!);return response;},true);
 const readResponse=(response:Response)=>new Promise<{decoded:boolean}>((resolve,reject)=>{decoding++;peak=Math.max(peak,decoding);let done=false;const complete=(action:()=>void)=>{if(done)return;done=true;decoding--;action()};finish.push(()=>complete(()=>resolve({decoded:true})));signals.get(response)!.addEventListener('abort',()=>complete(()=>reject(Error('aborted during decoding'))),{once:true});});
 const active=Array.from({length:4},()=>h.api.fetchPublicJson('/public/archive.gz',{timeoutMs:200,readResponse}));
 const queued=h.api.fetchPublicJson('/public/queued.gz',{timeoutMs:20,readResponse}).catch(error=>error.code);
 await flush();assert.equal(started,4);assert.equal(decoding,4);
 h.advance(80);await flush();assert.equal(started,4);
 finish[0]();await flush();assert.equal(started,5);assert.equal(peak,4);assert.equal(decoding,4);
 h.advance(20);await flush();assert.equal(await queued,'PUBLIC_TIMEOUT');
 finish.slice(1,4).forEach(resolve=>resolve());assert.ok((await Promise.all(active)).every(value=>value.decoded));assert.equal(decoding,0);assert.equal(h.timers.size,0);
});

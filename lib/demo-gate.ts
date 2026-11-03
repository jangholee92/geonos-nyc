import {VOICE_MAX_UPLOAD_BYTES} from './voice-transcription';
import {runWithDemoActor,type DemoActor} from './demo-access';
import {demoLimits,type DemoKind} from './demo-budget-policy';
export type DemoEnv=Record<string,unknown>&{DEMO_BUDGET?:DurableObjectNamespace;GEONOS_PUBLIC_DEMO?:string;DEMO_IP_SALT?:string};
const response=(error:string,code:string,status:number,retryAfter?:number)=>Response.json({error,code},{status,headers:{'Cache-Control':'no-store',...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
export async function demoActor(request:Request,env:DemoEnv):Promise<DemoActor|null>{
 if(env.GEONOS_PUBLIC_DEMO!=='true'||!env.DEMO_BUDGET||typeof env.DEMO_IP_SALT!=='string'||env.DEMO_IP_SALT.length<32||env.DEMO_IP_SALT.length>512)return null;
 // Only Cloudflare's direct request metadata establishes this anonymous quota key.
 // Incoming user identity headers and visitor-supplied Forwarded headers never do.
 const ip=request.headers.get('cf-connecting-ip');
 if(!request.cf||!ip||ip.length>64||!/^[0-9a-fA-F:.]+$/.test(ip))return null;
 try{demoLimits(env);}catch{return null;}
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.DEMO_IP_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(Math.floor(Date.now()/86400000)+'|'+ip));
 return{kind:'anonymous-demo',userId:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')};
}
async function budgetCall(stub:DurableObjectStub,path:string,body:unknown){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try{return await stub.fetch('https://budget.internal'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});}finally{clearTimeout(timer);}
}
export async function gateDemo(request:Request,env:DemoEnv,ctx:Pick<ExecutionContext,'waitUntil'>,run:(request:Request)=>Promise<Response>):Promise<Response>{
 const url=new URL(request.url),kind:DemoKind|null=url.pathname==='/api/chat'?'chat':url.pathname==='/api/transcribe'?'voice':null;
 const headers=new Headers(request.headers);
 for(const key of [...headers.keys()])if(key.includes('authenticated-user')||key.startsWith('x-geonos-'))headers.delete(key);
 const clean=new Request(request,{headers});
 if(!kind)return runWithDemoActor(null,()=>run(clean));
 const actor=await demoActor(request,env);
 if(request.method!=='POST')return runWithDemoActor(actor,()=>run(clean));
 if(!actor||env.META_API_APPROVED!=='true'||typeof env.MODEL_API_KEY!=='string'||!env.MODEL_API_KEY.trim())return response('The public AI demo is temporarily unavailable. The map remains available.','DEMO_UNAVAILABLE',503);
 if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return response('Send requests from this GEONOS page.','ORIGIN_REJECTED',403);
 const contentType=request.headers.get('content-type')??'';
 if(kind==='chat'&&!contentType.toLowerCase().startsWith('application/json'))return response('A JSON question is required.','INVALID_REQUEST',400);
 if(Number(request.headers.get('content-length')||0)>(kind==='chat'?60000:VOICE_MAX_UPLOAD_BYTES))return response('The upload exceeds this demo limit.','REQUEST_TOO_LARGE',413);
 const stub=env.DEMO_BUDGET!.get(env.DEMO_BUDGET!.idFromName('geonos-public-demo-v1'));
 let leaseId:string;
 try{
  const result=await budgetCall(stub,'/reserve',{kind,ip:actor.userId});
  if(!result.ok)throw Error();const value:any=await result.json();
  if(value.allowed===false&&typeof value.code==='string')return response(value.code==='DEMO_BUSY'?'Two investigations are already running. Please try again shortly.':'This public demo allowance has been reached. The map and records remain available.',value.code,429,Number(value.retryAfter)||60);
  if(value.allowed!==true||typeof value.leaseId!=='string'||!/^[a-f0-9-]{36}$/.test(value.leaseId))throw Error();leaseId=value.leaseId;
 }catch{return response('The demo allowance could not be verified. Please try again shortly.','DEMO_UNAVAILABLE',503);}
 const controller=new AbortController();
 const parentAbort=()=>controller.abort(request.signal.reason);
 request.signal.addEventListener('abort',parentAbort,{once:true});
 const timer=setTimeout(()=>controller.abort(new DOMException('Demo deadline exceeded','TimeoutError')),210_000);
 if(request.signal.aborted)parentAbort();
 let onAbort:()=>void=()=>{};
 const expired=new Promise<Response>(resolve=>{onAbort=()=>resolve(response('This investigation exceeded its time allowance. Please try a shorter request.','DEMO_DEADLINE',504));controller.signal.addEventListener('abort',onAbort,{once:true});if(controller.signal.aborted)onAbort();});
 try{
  const bounded=new Request(clean,{signal:controller.signal});
  return await Promise.race([runWithDemoActor(actor,()=>run(bounded)),expired]);
 }finally{
  clearTimeout(timer);request.signal.removeEventListener('abort',parentAbort);controller.signal.removeEventListener('abort',onAbort);
  ctx.waitUntil(budgetCall(stub,'/release',{leaseId}).then(()=>{}).catch(()=>{}));
 }
}

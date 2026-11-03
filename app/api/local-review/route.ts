import {getLocalReviewActor} from '../../../lib/local-review-auth';
import {getLocalReviewAvailability,isLocalReviewPostOrigin,localReviewConfig} from '../../../lib/local-review-config';
import {resolveReviewedPlan} from '../../../lib/reviewed-plan';
import {reviewLocalGlimmer,LocalGlimmerError} from '../../../lib/local-glimmer-review';

const MAX_BYTES=32*1024,MAX_MS=120_000;
// Budget metadata only. Notes, questions, sources and model output are never
// retained here, written to logs or sent to a hosted model.
const windows=new Map<string,{start:number;count:number}>();
let active=false;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Host, Origin'}});
const fail=(error:string,code:string,status:number)=>json({error,code},status);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const safeText=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
class InputError extends Error{}
const cancellation=()=>new LocalGlimmerError('GLIMMER_CANCELLED','Local review was cancelled.');
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)return Promise.reject(cancellation());
 return new Promise((resolve,reject)=>{const abort=()=>reject(cancellation());signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
async function readInput(request:Request,signal:AbortSignal){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')||Number(request.headers.get('content-length')||0)>MAX_BYTES||!request.body)throw new InputError();
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{
  while(true){const chunk=await abortable(reader.read(),signal);if(chunk.done)break;size+=chunk.value.length;if(size>MAX_BYTES)throw new InputError();chunks.push(chunk.value);}
  if(signal.aborted)throw cancellation();
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new InputError();}
  if(!object(value)||Object.keys(value).some(k=>!['question','notes','selectedIds'].includes(k))||!safeText(value.question,2000)||!value.question.trim()||value.notes!==undefined&&!safeText(value.notes,6000)||!Array.isArray(value.selectedIds)||value.selectedIds.length!==2||value.selectedIds.some(id=>typeof id!=='string'||!/^[1-9]\d{0,9}$/.test(id))||new Set(value.selectedIds).size!==2)throw new InputError();
  return{question:value.question,notes:typeof value.notes==='string'?value.notes:'',ids:value.selectedIds as string[]};
 }catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);}
}
export async function GET(request:Request){
 const capability=await getLocalReviewAvailability(request);
 return capability.available?json(capability):fail('Local review is unavailable.','LOCAL_REVIEW_UNAVAILABLE',404);
}
export async function POST(request:Request){
 const configuration=await localReviewConfig(request);
 if(!configuration)return fail('Local review is unavailable.','LOCAL_REVIEW_UNAVAILABLE',404);
 if(!isLocalReviewPostOrigin(request))return fail('Open local review from this application.','LOCAL_REVIEW_ORIGIN_REJECTED',403);
 const user=getLocalReviewActor();
 if(!user)return fail('Open local review from the local development app.','AUTH_REQUIRED',401);
 const now=Date.now();for(const[id,record]of windows)if(now-record.start>=60_000)windows.delete(id);
 const window=windows.get(user.userId)??{start:now,count:0};
 if(active||window.count>=4||(!windows.has(user.userId)&&windows.size>=2048))return fail('Finish the current local review or try again shortly.','RATE_LIMITED',429);
 window.count++;windows.set(user.userId,window);active=true;
 const controller=new AbortController();let timedOut=false;
 const parentAbort=()=>controller.abort();request.signal.addEventListener('abort',parentAbort,{once:true});if(request.signal.aborted)controller.abort();
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},MAX_MS);
 try{
  const input=await readInput(request,controller.signal);
  // The only text sent to public-source retrieval is validated numeric IDs.
  // Private question/notes never enter SoQL, a source URL or Spark history.
  let resolved:Awaited<ReturnType<typeof resolveReviewedPlan>>;
  try{resolved=await abortable(resolveReviewedPlan({plan:{intent:'compare',userQuestion:'Retrieve public records for a local review',requirements:[]},ids:input.ids}),controller.signal);}
  catch(error){if(controller.signal.aborted)throw cancellation();return fail('The selected official building records could not be refreshed.','LOCAL_REVIEW_SOURCE_UNAVAILABLE',502);}
  if(controller.signal.aborted)throw cancellation();
  const result=await abortable(reviewLocalGlimmer({buildings:resolved.buildings,question:input.question,notes:input.notes},configuration,controller.signal),controller.signal);
  if(controller.signal.aborted)throw cancellation();
  return json(result);
 }catch(error){
  if(timedOut)return fail('Local review reached its time limit.','GLIMMER_TIMEOUT',504);
  if(request.signal.aborted)return fail('Local review was cancelled.','GLIMMER_CANCELLED',499);
  if(error instanceof InputError)return fail('Provide two distinct native building IDs, a question up to 2,000 characters and notes up to 6,000 characters.','LOCAL_REVIEW_INVALID_INPUT',400);
  if(error instanceof LocalGlimmerError){const status=error.code==='GLIMMER_TIMEOUT'?504:error.code==='GLIMMER_CANCELLED'?499:error.code==='GLIMMER_INVALID_INPUT'?400:502;return fail(error.message,error.code,status);}
  return fail('The local review could not be completed.','GLIMMER_REQUEST_FAILED',502);
 }finally{clearTimeout(timer);request.signal.removeEventListener('abort',parentAbort);active=false;}
}

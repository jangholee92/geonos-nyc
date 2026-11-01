/** Local inference is an explicit capability, not a public-model fallback.
 * Request location and provider destination are independently constrained. */
type Bindings=Record<string,unknown>;
export type LocalReviewConfig={endpoint:string;apiKey:string};
export const LOCAL_REVIEW_MODEL='muse-glimmer';
const FORWARDED=['forwarded','x-original-host','x-forwarded-server','x-forwarded-for','x-forwarded-proto','x-forwarded-port'];
const LOOPBACK=/^(?:localhost|127\.0\.0\.1|\[::1\])(?::(?:[1-9]\d{0,4}))?$/;
function literalLoopback(value:string):boolean{
 if(!LOOPBACK.test(value))return false;
 try{const url=new URL('http://'+value);return !url.port||Number(url.port)<=65535;}catch{return false;}
}
export function isLocalReviewRequest(request:Request):boolean{
 let url:URL;try{url=new URL(request.url);}catch{return false;}
 const host=request.headers.get('host');
 // The local Cloudflare Vite bridge copies Host into X-Forwarded-Host.
 // It never establishes request identity: only an exact redundant copy of the
 // independently validated literal loopback authority is permitted.
 const forwardedHost=request.headers.get('x-forwarded-host');
 return url.protocol==='http:'&&!!host&&literalLoopback(host)&&host===url.host&&literalLoopback(url.host)&&!url.username&&!url.password&&(forwardedHost===null||forwardedHost===host)&&!FORWARDED.some(name=>request.headers.has(name));
}
/** Browser writes require exact same-origin provenance. Missing Origin is not
 * accepted, including non-browser callers; no permissive CORS route is added. */
export function isLocalReviewPostOrigin(request:Request):boolean{
 if(!isLocalReviewRequest(request))return false;
 const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
 return origin===new URL(request.url).origin&&(site===null||site==='same-origin');
}
function endpoint(value:unknown):string|null{
 if(typeof value!=='string'||value.length>200||!/^[\x21-\x7e]+$/.test(value))return null;
 // Validate the original authority before URL normalization, rejecting numeric
 // IPv4 aliases, userinfo, domains and DNS-rebinding destinations.
 const match=/^http:\/\/([^/?#]+)(\/v1(?:\/chat\/completions)?\/?)?$/.exec(value);
 if(!match||!literalLoopback(match[1]))return null;
 try{const url=new URL(value);if(url.username||url.password||url.search||url.hash)return null;url.pathname='/v1/chat/completions';return url.href;}catch{return null;}
}
export async function localReviewConfig(request:Request):Promise<LocalReviewConfig|null>{
 if(!isLocalReviewRequest(request))return null;
 let bindings:Bindings={};
 try{const{env}=await import('cloudflare:workers');bindings=env as unknown as Bindings;}catch{/* Local Node tests have no Worker bindings. */}
 const read=(key:string)=>bindings[key]??process.env[key];
 if(read('GEONOS_LOCAL_REVIEW')!=='true')return null;
 const url=endpoint(read('GEONOS_GLIMMER_URL')),key=read('GEONOS_GLIMMER_API_KEY');
 if(!url||typeof key!=='string'||key.length<16||key.length>512||/\s/.test(key))return null;
 return{endpoint:url,apiKey:key};
}
export async function getLocalReviewAvailability(request?:Request){
 const configured=request?await localReviewConfig(request):null;
 return{available:Boolean(configured),model:LOCAL_REVIEW_MODEL,mode:'local' as const,privateNotesStayLocal:true};
}

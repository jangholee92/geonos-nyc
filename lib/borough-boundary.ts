import manifest from './borough-boundary-manifest.json';

type Boundary={type:'FeatureCollection';features:Record<string,unknown>[]};
const cancelled=()=>new Error('The boundary request was cancelled.');
async function digest(bytes:Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function bounded(body:ReadableStream<Uint8Array>|null,max:number,signal:AbortSignal):Promise<Uint8Array>{
 if(!body)throw Error('The boundary response is empty.');
 const reader=body.getReader(),chunks:Uint8Array[]=[];let size=0;
 const stop=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',stop,{once:true});
 try{
  while(true){if(signal.aborted)throw cancelled();const part=await reader.read();if(signal.aborted)throw cancelled();if(part.done)break;size+=part.value.length;if(size>max)throw Error('The boundary response exceeds its size limit.');chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 }catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',stop);reader.releaseLock();}
}
/** Both encoded and decoded identities are pinned. A hosting layer may already
 * decode gzip; either transport must yield the exact unchanged source bytes. */
export async function decodeBoroughBoundary(response:Response,signal=new AbortController().signal):Promise<Boundary>{
 if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error('The boundary asset is unavailable.');}
 const encoded=await bounded(response.body,manifest.decoded_bytes,signal);let decoded=encoded;
 if(encoded[0]===0x1f&&encoded[1]===0x8b){
  if(encoded.length!==manifest.compressed_bytes||await digest(encoded)!==manifest.compressed_sha256)throw Error('The compressed boundary identity differs.');
  if(typeof DecompressionStream==='undefined')throw Error('This browser cannot decode the boundary archive.');
  decoded=await bounded(new Response(encoded as BodyInit).body!.pipeThrough(new DecompressionStream('gzip')),manifest.decoded_bytes,signal);
 }
 if(signal.aborted)throw cancelled();
 if(decoded.length!==manifest.decoded_bytes||await digest(decoded)!==manifest.decoded_sha256)throw Error('The boundary source identity differs.');
 const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));
 if(result?.type!=='FeatureCollection'||!Array.isArray(result.features)||result.features.length!==manifest.feature_count)throw Error('The boundary source format differs.');
 return result as Boundary;
}
export async function fetchBoroughBoundary(parentSignal?:AbortSignal):Promise<Boundary>{
 if(parentSignal?.aborted)throw cancelled();
 const controller=new AbortController(),abort=()=>controller.abort();
 parentSignal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15_000);
 try{return await decodeBoroughBoundary(await fetch(manifest.asset,{credentials:'same-origin',signal:controller.signal}),controller.signal);}
 finally{clearTimeout(timer);parentSignal?.removeEventListener('abort',abort);}
}

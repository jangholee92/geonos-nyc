import type {TemporalImagery} from './temporal-imagery';
import {patchDiscrepancy,rgbaToDinoInput} from './dino-math';
import manifest from '../public/models/dinov2/manifest.json';

export type DinoTemporalComparison={
 kind:'dino_temporal_comparison';
 model:{id:'dinov2_vits14_reg';label:string;sourceUrl:string;sha256:string;bytes:number;execution:'browser WASM CPU';quantization:string};
 inputs:[{year:2020;imageSha256:string},{year:2024;imageSha256:string}];
 grid:{rows:16;columns:16;values:number[];metric:'1 - cosine similarity';range:[0,2];cellSourcePixels:48;cellApproximateGroundM:number;observedMinimum:number;observedMaximum:number};
 elapsedMs:number;
 limitations:string[];
};
export type DinoProgress=(phase:string)=>void;
export {validateTemporalPair} from './temporal-pair';
import {validateTemporalPair} from './temporal-pair';
const cancelled=()=>new DOMException('The visual comparison was cancelled.','AbortError');
function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw cancelled();}
async function inputTensor(item:TemporalImagery['images'][0],signal?:AbortSignal):Promise<Float32Array>{
 checkAbort(signal);
 const bytes=Uint8Array.from(atob(item.image.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
 if(bytes.length>2_000_000)throw Error('The source image exceeded its byte bound.');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(digest!==item.source.imageSha256)throw Error('The source image did not match its provenance hash.');
 checkAbort(signal);
 const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}),{colorSpaceConversion:'none'});
 try{
  if(bitmap.width!==768||bitmap.height!==768)throw Error('The decoded image dimensions did not match the source crop.');
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('This browser could not read the aerial-image pixels.');
  ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,768,768);checkAbort(signal);
  return rgbaToDinoInput(pixels.data,768,768);
 }finally{bitmap.close();}
}
/** Explicitly invoked browser-only inference. A dedicated worker provides
 * immediate cancellation and avoids sending the images to another service. */
export async function compareTemporalImages(pair:TemporalImagery,options:{signal?:AbortSignal;onProgress?:DinoProgress}={}):Promise<DinoTemporalComparison>{
 if(typeof window==='undefined'||typeof Worker==='undefined'||typeof createImageBitmap==='undefined')throw Error('This browser cannot run the local visual comparison.');
 validateTemporalPair(pair);checkAbort(options.signal);const started=performance.now();
 options.onProgress?.('Checking the two source images');
 const before=await inputTensor(pair.images[0],options.signal),after=await inputTensor(pair.images[1],options.signal);checkAbort(options.signal);
 const vectors=await new Promise<{before:Float32Array;after:Float32Array}>((resolve,reject)=>{
  const worker=new Worker('/models/dinov2/runtime/dino-worker.js',{type:'module'});
  let settled=false;const finish=(action:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);worker.terminate();action();};
  const abort=()=>finish(()=>reject(cancelled()));
  const timer=setTimeout(()=>finish(()=>reject(Error('The browser comparison exceeded its 90-second limit. No result was inferred.'))),90_000);
  options.signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=(event:MessageEvent)=>{
   const data=event.data;
   if(data?.type==='progress'&&typeof data.phase==='string'&&data.phase.length<100)options.onProgress?.(data.phase);
   else if(data?.type==='result'&&data.before instanceof ArrayBuffer&&data.after instanceof ArrayBuffer&&data.before.byteLength===393216&&data.after.byteLength===393216)finish(()=>resolve({before:new Float32Array(data.before),after:new Float32Array(data.after)}));
   else if(data?.type==='error')finish(()=>reject(Error(typeof data.message==='string'?data.message.slice(0,200):'The browser could not run the comparison.')));
   else finish(()=>reject(Error('The visual model returned an invalid result.')));
  };
  worker.onerror=()=>finish(()=>reject(Error('The browser could not initialize the local visual model.')));
  if(options.signal?.aborted){abort();return;}
  worker.postMessage({before:before.buffer,after:after.buffer},[before.buffer,after.buffer]);
 });
 checkAbort(options.signal);const values=patchDiscrepancy(vectors.before,vectors.after);
 return{kind:'dino_temporal_comparison',model:{id:'dinov2_vits14_reg',label:'Meta DINOv2 ViT-S/14 with registers',sourceUrl:manifest.source_model_card,sha256:manifest.artifact.sha256,bytes:manifest.artifact.bytes,execution:'browser WASM CPU',quantization:manifest.artifact.quantization},inputs:[{year:2020,imageSha256:pair.images[0].source.imageSha256},{year:2024,imageSha256:pair.images[1].source.imageSha256}],grid:{rows:16,columns:16,values,metric:'1 - cosine similarity',range:[0,2],cellSourcePixels:48,cellApproximateGroundM:pair.bounds.approximateGroundWidthM/16,observedMinimum:Math.min(...values),observedMaximum:Math.max(...values)},elapsedMs:Math.round(performance.now()-started),limitations:[
  'This is contextual visual-feature dissimilarity from DINOv2, not a calibrated change probability or a roof-condition assessment.',
  'Both whole crops are resized to 224 pixels. Each coarse grid cell represents one of 256 contextual patch features; a high value does not precisely localize a changed object.',
  'Identical geographic export bounds do not guarantee pixel-perfect survey registration. Shadows, season, lighting, parked objects and processing can affect the result.',
  'Inspect both dated source photographs before requesting current owner records or a site visit. No changed area, structural change, capacity, permission, flood risk or investment value is inferred.',
 ]};
}

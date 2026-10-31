/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import {artifact} from '../public/models/dinov2/manifest.json';
import {decodeDinoModelDownload} from './dino-model';

// A dedicated Worker is created only on an explicit comparison request and
// terminated afterwards. No inference, WASM or weight fetch occurs on import.
const scope=self as unknown as DedicatedWorkerGlobalScope;
const post=(phase:string)=>scope.postMessage({type:'progress',phase});
let started=false;
scope.onmessage=async(event:MessageEvent<{before:ArrayBuffer;after:ArrayBuffer}>)=>{
 if(started)return;started=true;
 let session:ort.InferenceSession|undefined;
 try{
  const{before,after}=event.data;
  if(!(before instanceof ArrayBuffer)||!(after instanceof ArrayBuffer)||before.byteLength!==602112||after.byteLength!==602112)throw Error('Invalid image tensor.');
  post('Loading the DINOv2 model');
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  ort.env.wasm.wasmPaths={
   wasm:new URL('/models/dinov2/runtime/ort-wasm-simd-threaded.wasm',scope.location.origin).href,
   mjs:new URL('/models/dinov2/runtime/ort-wasm-simd-threaded.mjs',scope.location.origin).href,
  };
  const modelUrl=new URL(artifact.download.path,scope.location.origin);
  if(modelUrl.origin!==scope.location.origin||modelUrl.pathname!=='/models/dinov2/dinov2-vits14-reg-patches-int8.onnx.gzip'||modelUrl.search||modelUrl.hash)throw Error('The model asset must use its pinned same-origin path.');
  const response=await fetch(modelUrl.href,{credentials:'same-origin',redirect:'error',cache:'force-cache'});
  const model=await decodeDinoModelDownload(response,{bytes:artifact.download.bytes,sha256:artifact.download.sha256,decodedBytes:artifact.bytes,decodedSha256:artifact.sha256});
  session=await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});
  const outputs:Float32Array[]=[];
  for(const[index,input]of[before,after].entries()){
   post(`Reading ${index===0?'2020':'2024'} visual features`);
   const tensor=new ort.Tensor('float32',new Float32Array(input),[1,3,224,224]);
   const result=await session.run({image:tensor}),patches=result.patches;
   if(!patches||patches.type!=='float32'||patches.dims.join(',')!=='1,256,384')throw Error('DINO returned an unexpected feature shape.');
   outputs.push(new Float32Array(patches.data as Float32Array));
   tensor.dispose();for(const value of Object.values(result))value.dispose();
  }
  scope.postMessage({type:'result',before:outputs[0].buffer,after:outputs[1].buffer},[outputs[0].buffer,outputs[1].buffer]);
 }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:'The browser could not run the visual comparison.'});}
 finally{await session?.release();}
};

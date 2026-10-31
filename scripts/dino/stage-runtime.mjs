// Stage only the pinned browser WASM runtime next to the verified model. This
// script never installs software or fetches model weights.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'node_modules/onnxruntime-web/package.json'),'utf8'));
if(pkg.version!=='1.24.3')throw Error('Review and revalidate a runtime version change before staging it.');
const output=path.join(root,'public/models/dinov2'),runtime=path.join(output,'runtime');fs.mkdirSync(runtime,{recursive:true});
const files=['ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.mjs'].map(name=>{
 const bytes=fs.readFileSync(path.join(root,'node_modules/onnxruntime-web/dist',name));fs.writeFileSync(path.join(runtime,name),bytes);
 return{path:'/models/dinov2/runtime/'+name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
});
const workerBytes=fs.readFileSync(path.join(runtime,'dino-worker.js'));
files.push({path:'/models/dinov2/runtime/dino-worker.js',bytes:workerBytes.length,sha256:createHash('sha256').update(workerBytes).digest('hex')});
const licenseUrl='https://raw.githubusercontent.com/microsoft/onnxruntime/v1.24.3/LICENSE';
const response=await fetch(licenseUrl,{redirect:'error'});if(!response.ok)throw Error('Could not retrieve the official runtime license.');
const license=await response.text();if(!license.startsWith('MIT License')||license.length>20000)throw Error('Unexpected runtime license.');fs.writeFileSync(path.join(runtime,'LICENSE.txt'),license);
const manifestPath=path.join(output,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
manifest.validation.graph_optimization='disabled to preserve explicit QDQ graph across native and browser runtimes';
manifest.browser_runtime={package:'onnxruntime-web',version:pkg.version,execution:'single-thread WASM CPU in a dedicated cancellable Web Worker',graph_optimization:'disabled',files,license:'MIT',license_url:licenseUrl,first_use_model_and_runtime_bytes:(manifest.artifact.download?.bytes??manifest.artifact.bytes)+files.reduce((sum,f)=>sum+f.bytes,0)};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest.browser_runtime,null,2));

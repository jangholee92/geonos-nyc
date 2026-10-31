// Compile a same-origin public Worker entry. Vinext/RSC transforms import.meta
// differently from ordinary Vite; a fixed compiled URL works in both contexts.
import {build} from 'vite';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
await build({configFile:false,root,publicDir:false,resolve:{alias:{'onnxruntime-web/wasm':path.join(root,'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs')}},build:{outDir:path.join(root,'public/models/dinov2/runtime'),emptyOutDir:false,minify:true,sourcemap:false,lib:{entry:path.join(root,'lib/dino-worker.ts'),formats:['es'],fileName:()=> 'dino-worker.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});

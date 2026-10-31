import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/dino-math.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{} as typeof import('../lib/dino-math')};new vm.Script(compiled).runInNewContext({module,exports:module.exports,Float32Array});
const{patchDiscrepancy,rgbaToDinoInput}=module.exports;
const features=()=>{const a=new Float32Array(256*384);for(let p=0;p<256;p++)a[p*384]=1;return a;};
test('identical patch features have zero discrepancy; the metric ignores vector magnitude',()=>{
 const a=features(),b=a.map(v=>v*3);assert.ok(patchDiscrepancy(a,a).every(v=>v===0));assert.ok(patchDiscrepancy(a,b).every(v=>v===0));
});
test('orthogonal and opposite features have cosine discrepancies1 and2 in exactly the corresponding cell',()=>{
 const a=features(),b=features();b[9*384]=0;b[9*384+1]=1;b[255*384]=-1;const d=patchDiscrepancy(a,b);
 assert.equal(d.length,256);assert.equal(d[9],1);assert.equal(d[255],2);assert.equal(d[8],0);assert.equal(d[10],0);
});
test('empty, truncated and non-finite tensors fail rather than masquerading as no difference',()=>{
 const a=features();assert.throws(()=>patchDiscrepancy(a,new Float32Array(10)));assert.throws(()=>patchDiscrepancy(a,new Float32Array(a.length)));const b=features();b[1]=NaN;assert.throws(()=>patchDiscrepancy(a,b));
});
test('whole-crop RGB preprocessing preserves north/east orientation and channels without a center crop',()=>{
 const pixels=new Uint8Array(224*224*4);
 for(let y=0;y<224;y++)for(let x=0;x<224;x++){const i=(y*224+x)*4;pixels[i]=x;pixels[i+1]=y;pixels[i+2]=100;pixels[i+3]=255;}
 const out=rgbaToDinoInput(pixels,224,224);assert.equal(out.length,150528);
 assert.ok(Math.abs(out[0]-(0-.485)/.229)<1e-6);assert.ok(out[223]>out[0]);assert.ok(out[50176+223*224]>out[50176]);assert.ok(Math.abs(out[100352]-(100/255-.406)/.225)<1e-6);
});
test('blank or transparent source pixels cannot yield a seemingly meaningful feature comparison',()=>{
 const pixels=new Uint8Array(768*768*4).fill(255);assert.throws(()=>rgbaToDinoInput(pixels,768,768),/insufficient/);pixels[0]=0;pixels[3]=0;assert.throws(()=>rgbaToDinoInput(pixels,768,768),/transparent/);assert.throws(()=>rgbaToDinoInput(pixels,512,512),/invalid/);
});

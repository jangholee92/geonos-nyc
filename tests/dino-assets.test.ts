import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const root=new URL('../public/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('models/dinov2/manifest.json',root),'utf8'));
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
test('the shipped model is the verified under25MiB file with the documented patch tensor contract',()=>{
 const compressed=readFileSync(new URL(manifest.artifact.download.path.slice(1),root));assert.equal(compressed.length,manifest.artifact.download.bytes);assert.equal(hash(compressed),manifest.artifact.download.sha256);
 const bytes=gunzipSync(compressed,{maxOutputLength:manifest.artifact.bytes});assert.equal(bytes.length,manifest.artifact.bytes);assert.ok(bytes.length<25*1024*1024);assert.equal(hash(bytes),manifest.artifact.sha256);
 assert.deepEqual(manifest.artifact.input_shape,[1,3,224,224]);assert.deepEqual(manifest.artifact.output_shape,[1,256,384]);assert.equal(manifest.checkpoint.sha256,'f433177089a681826f849f194ece3bb48f4d63fb38d32fc837e3dc7a4e5641fb');
 assert.match(readFileSync(new URL('models/dinov2/LICENSE.txt',root),'utf8'),/Apache License/);
});
test('every separately shipped runtime asset matches provenance and remains below the deployment file bound',()=>{
 for(const file of manifest.browser_runtime.files){const bytes=readFileSync(new URL(file.path.slice(1),root));assert.equal(bytes.length,file.bytes);assert.ok(bytes.length<25*1024*1024);assert.equal(hash(bytes),file.sha256);}
 assert.ok(manifest.browser_runtime.files.some((f:{path:string})=>f.path.endsWith('/dino-worker.js')));assert.equal(manifest.browser_runtime.graph_optimization,'disabled');
});
test('public validation has finite measured parity and no local absolute source paths',()=>{
 for(const image of manifest.validation.images){assert.ok(image.patch_cosine_to_torch.minimum>.98);assert.ok(image.patch_cosine_to_torch.mean>.99);assert.ok(!image.source_image.includes('/'));}
 assert.ok(!JSON.stringify(manifest).includes('/Volumes/'));assert.ok(!JSON.stringify(manifest).includes('/Users/'));
});

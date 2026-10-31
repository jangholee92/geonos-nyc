import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../lib/dino-model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{} as typeof import('../lib/dino-model')};new vm.Script(code).runInNewContext({module,exports:module.exports,Uint8Array,ArrayBuffer,Blob,DecompressionStream,crypto:webcrypto});
const{decodeDinoModelDownload}=module.exports;
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const plain=Buffer.from('A bounded original tensor model fixture. '.repeat(1000)),gzip=gzipSync(plain);
const expected={bytes:gzip.length,sha256:hash(gzip),decodedBytes:plain.length,decodedSha256:hash(plain)};
test('gzip transport restores exact verified original bytes before inference',async()=>{
 const restored=await decodeDinoModelDownload(new Response(gzip),expected);assert.deepEqual(Buffer.from(restored),plain);
});
test('compressed corruption and wrong decoded identity are rejected independently',async()=>{
 const bad=Buffer.from(gzip);bad[15]^=1;await assert.rejects(decodeDinoModelDownload(new Response(bad),expected),/compressed.*SHA/);
 await assert.rejects(decodeDinoModelDownload(new Response(gzip),{...expected,decodedSha256:'0'.repeat(64)}),/decoded.*SHA/);
});
test('a valid gzip cannot expand beyond the pinned decoded model byte bound',async()=>{
 await assert.rejects(decodeDinoModelDownload(new Response(gzip),{...expected,decodedBytes:100}),/byte bound/);
 await assert.rejects(decodeDinoModelDownload(new Response(gzip),{...expected,decodedBytes:plain.length+1}),/size/);
});
test('malformed archives, oversized transport and invalid manifest limits fail closed',async()=>{
 const malformed=Buffer.from('notgzip');await assert.rejects(decodeDinoModelDownload(new Response(malformed),{...expected,bytes:malformed.length,sha256:hash(malformed)}));
 await assert.rejects(decodeDinoModelDownload(new Response(gzip,{headers:{'Content-Length':String(gzip.length+1)}}),expected),/unavailable/);
 await assert.rejects(decodeDinoModelDownload(new Response(gzip),{...expected,decodedBytes:25*1024*1024+1}),/manifest/);
});

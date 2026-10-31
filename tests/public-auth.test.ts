import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../app/chatgpt-auth.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function auth({mode='production',flag,workerFlag,host='example.org',identity=true}:{mode?:string;flag?:string;workerFlag?:unknown;host?:string;identity?:boolean}={}){
 const requestHeaders=new Headers({host,...(identity?{'oai-authenticated-user-id':'forged-user','oai-authenticated-user-email':'forged@example.test'}:{})});
 const module={exports:{} as {getChatGPTUser:()=>Promise<unknown>}};
 new vm.Script(code).runInNewContext({module,exports:module.exports,URL,process:{env:{NODE_ENV:mode,TRUST_SITES_PROXY_IDENTITY:flag}},require:(id:string)=>{
  if(id==='next/headers')return{headers:async()=>requestHeaders};
  if(id==='next/navigation')return{redirect:()=>{throw Error('Unexpected redirect');}};
  if(id==='cloudflare:workers')return{env:{TRUST_SITES_PROXY_IDENTITY:workerFlag}};
  throw Error('Unexpected import');
 }});
 return module.exports;
}
test('production rejects caller-supplied identity by default, including a loopback Host header',async()=>{
 for(const host of ['example.org','127.0.0.1:5173','localhost'])assert.equal(await auth({host}).getChatGPTUser(),null);
 for(const flag of ['false','1','TRUE',''])assert.equal(await auth({flag}).getChatGPTUser(),null);
});
test('production trusted-edge opt-in is exact and explicit; Worker false overrides process true',async()=>{
 assert.ok(await auth({flag:'true'}).getChatGPTUser());
 assert.ok(await auth({workerFlag:'true'}).getChatGPTUser());
 assert.equal(await auth({flag:'true',workerFlag:'false'}).getChatGPTUser(),null);
 assert.equal(await auth({flag:'true',identity:false}).getChatGPTUser(),null);
});
test('development mock identity is restricted to loopback host names',async()=>{
 for(const host of ['localhost:5173','127.0.0.1:5173','[::1]:5173'])assert.ok(await auth({mode:'development',host}).getChatGPTUser());
 for(const host of ['example.org','localhost.example.org','localhost@evil.example','localhost/path',''])assert.equal(await auth({mode:'development',host}).getChatGPTUser(),null);
});
test('local middleware strips forged identity before its loopback socket checks, and preview denies secret files',()=>{
 const middleware=readFileSync(new URL('../scripts/vite/sites-vite-plugin.ts',import.meta.url),'utf8');
 const strip=middleware.indexOf('name.startsWith("oai-authenticated-user-")');
 assert.ok(strip>=0&&strip<middleware.indexOf('!localAddresses.has(request.socket.remoteAddress'));
 const preview=readFileSync(new URL('../scripts/vite/connector-preview-plugin.mjs',import.meta.url),'utf8');
 assert.match(preview,/"\.dev\.vars"/);assert.match(preview,/"\.dev\.vars\.\*"/);
});

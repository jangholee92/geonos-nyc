import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,mkdirSync,writeFileSync,cpSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {X509Certificate} from 'node:crypto';
import {rootCertificates} from 'node:tls';
import {configureLocalTlsTrust,NYC_SOURCE_ROOT_SHA256} from '../scripts/local-tls-trust.mjs';

const temporary=()=>mkdtempSync(path.join(tmpdir(),'geonos-local-tls-'));
test('only the exact already trusted public root is exported, without changing TLS validation',()=>{
  const directory=temporary(),env={},warnings=[];
  try{
    const result=configureLocalTlsTrust(directory,{env,warn:value=>warnings.push(value)});
    assert.equal(result.status,'configured');
    const exported=new X509Certificate(readFileSync(env.NODE_EXTRA_CA_CERTS));
    assert.equal(exported.fingerprint256,NYC_SOURCE_ROOT_SHA256);
    assert.equal(exported.ca,true);
    assert.ok(rootCertificates.some(pem=>new X509Certificate(pem).fingerprint256===exported.fingerprint256));
    assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED,undefined);
    assert.deepEqual(warnings,[]);
    assert.ok(env.NODE_EXTRA_CA_CERTS.startsWith(path.join(directory,'.geonos-runtime')));
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('an explicit existing certificate setting is preserved without reading or overwriting its file',()=>{
  const directory=temporary();
  try{
    for(const setting of ['/unread/custom-ca.pem','']){
      const env={NODE_EXTRA_CA_CERTS:setting};
      assert.equal(configureLocalTlsTrust(directory,{env,certificates:[],warn:()=>assert.fail('Unexpected warning')}).status,'existing');
      assert.equal(env.NODE_EXTRA_CA_CERTS,setting);
      assert.equal(existsSync(path.join(directory,'.geonos-runtime')),false);
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('a missing expected root gives a clear warning and does not trust a substitute',()=>{
  const directory=temporary(),env={},warnings=[];
  try{
    const alternatives=rootCertificates.filter(pem=>new X509Certificate(pem).fingerprint256!==NYC_SOURCE_ROOT_SHA256);
    assert.equal(configureLocalTlsTrust(directory,{env,certificates:['malformed',...alternatives],warn:value=>warnings.push(value)}).status,'unavailable');
    assert.equal(env.NODE_EXTRA_CA_CERTS,undefined);
    assert.equal(existsSync(path.join(directory,'.geonos-runtime')),false);
    assert.match(warnings[0],/Update Node/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('the actual launcher configures local development before framework import, but never a production build',()=>{
  const directory=temporary(),source=fileURLToPath(new URL('../scripts/',import.meta.url));
  try{
    mkdirSync(path.join(directory,'scripts'));mkdirSync(path.join(directory,'node_modules/vinext/dist'),{recursive:true});
    for(const file of ['run-framework.mjs','runtime-env.mjs','tool-environment.mjs','local-tls-trust.mjs'])cpSync(path.join(source,file),path.join(directory,'scripts',file));
    writeFileSync(path.join(directory,'node_modules/vinext/package.json'),JSON.stringify({type:'module'}));
    writeFileSync(path.join(directory,'node_modules/vinext/dist/cli.js'),"console.log(JSON.stringify({command:process.argv[2],ca:!!process.env.NODE_EXTRA_CA_CERTS,tlsDisabled:process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'}));");
    for(const command of ['build','dev']){
      const run=spawnSync(process.execPath,[path.join(directory,'scripts/run-framework.mjs'),command],{encoding:'utf8',env:{PATH:process.env.PATH}});
      assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim());
      assert.equal(result.command,command);assert.equal(result.ca,command==='dev');assert.equal(result.tlsDisabled,false);
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});

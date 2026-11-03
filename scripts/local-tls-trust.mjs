import {rootCertificates} from 'node:tls';
import {X509Certificate,randomBytes} from 'node:crypto';
import {mkdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';

// NYC's November 2026 source certificate chains to this public CA. Miniflare
// reads NODE_EXTRA_CA_CERTS at import time; never disable TLS verification.
export const NYC_SOURCE_ROOT_SHA256='4F:A3:12:6D:8D:3A:11:D1:C4:85:5A:4F:80:7C:BA:D6:CF:91:9D:3A:5A:88:B0:3B:EA:2C:63:72:D9:3C:40:C9';

/** Called only by the development launcher, before importing the framework.
 * Select an already trusted Node-bundled root by exact fingerprint. Do not
 * import a downloaded certificate, the server's leaf, or an OS trust store.
 */
export function configureLocalTlsTrust(projectRoot,{env=process.env,certificates=rootCertificates,warn=console.warn}={}){
  if(env.NODE_EXTRA_CA_CERTS!==undefined)return{status:'existing'};
  const pem=certificates.find(value=>{
    try{const certificate=new X509Certificate(value);return certificate.ca&&certificate.fingerprint256===NYC_SOURCE_ROOT_SHA256;}
    catch{return false;}
  });
  if(!pem){
    warn('[local-tls] The Node bundle lacks the verified GlobalSign R46 root. Update Node or configure NODE_EXTRA_CA_CERTS with your trusted CA bundle before starting local development. TLS verification remains enabled.');
    return{status:'unavailable'};
  }
  const directory=path.join(env.GEONOS_RUNTIME_ROOT||path.join(projectRoot,'.geonos-runtime'),'certificates');
  const destination=path.join(directory,'globalsign-root-r46.pem');
  const temporary=destination+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
    mkdirSync(directory,{recursive:true,mode:0o700});
    writeFileSync(temporary,pem.trim()+'\n',{flag:'wx',mode:0o600});
    renameSync(temporary,destination);
    env.NODE_EXTRA_CA_CERTS=destination;
    return{status:'configured',fingerprint:NYC_SOURCE_ROOT_SHA256};
  }catch{
    try{rmSync(temporary,{force:true});}catch{}
    warn('[local-tls] The development CA file could not be prepared. Set NODE_EXTRA_CA_CERTS to your trusted CA bundle before starting local development. TLS verification remains enabled.');
    return{status:'unavailable'};
  }
}

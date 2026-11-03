import type {IncomingMessage} from 'node:http';
import type {Plugin} from 'vite';

const CAPABILITY='x-geonos-local-capability';
const SOCKETS=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);
const AUTHORITY=/^(?:localhost|127\.0\.0\.1|\[::1\])(?::([1-9]\d{0,4}))?$/;
/** Independently scoped development middleware. The capability is internal to
 * one preview process; no account, cookie or client-selected identity exists. */
export function attachLocalCapability(request:IncomingMessage,token:string):void{
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid local preview capability.');
 const internal=(name:string)=>name.toLowerCase().startsWith('x-geonos-')||name.toLowerCase().includes('authenticated-user');
 for(const name of Object.keys(request.headers))if(internal(name))delete request.headers[name];
 const raw:string[]=[];let hostCount=0;
 for(let i=0;i+1<request.rawHeaders.length;i+=2){
  const name=request.rawHeaders[i];if(name.toLowerCase()==='host')hostCount++;
  if(!internal(name))raw.push(name,request.rawHeaders[i+1]);
 }
 request.rawHeaders=raw;
 const host=request.headers.host,match=typeof host==='string'?AUTHORITY.exec(host):null;
 if(hostCount!==1||!match||(match[1]&&Number(match[1])>65535)||!SOCKETS.has(request.socket.remoteAddress||''))return;
 request.headers[CAPABILITY]=token;
 request.rawHeaders.push(CAPABILITY,token);
}
export function localPreview(token:string):Plugin{
 return{name:'geonos-local-preview',apply:'serve',enforce:'pre',configureServer(server){
  server.middlewares.use((request,_response,next)=>{attachLocalCapability(request,token);next();});
 }};
}

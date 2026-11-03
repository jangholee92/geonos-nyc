import {AsyncLocalStorage} from 'node:async_hooks';
import {isLocalReviewRequest} from './local-review-config';

export type LocalReviewActor={kind:'local-preview';userId:'local-preview'};
const actors=new AsyncLocalStorage<LocalReviewActor|null>();
/** This actor identifies a local execution session, not a human account. */
export function getLocalReviewActor():LocalReviewActor|null{return actors.getStore()??null;}
export function runWithLocalReviewActor<T>(request:Request,env:Record<string,unknown>,development:boolean,run:()=>T):T{
 const expected=env.GEONOS_LOCAL_PREVIEW_TOKEN,received=request.headers.get('x-geonos-local-capability');
 let accepted=false;
 if(development&&env.GEONOS_LOCAL_PREVIEW==='true'&&typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&received?.length===64&&isLocalReviewRequest(request)){
  let difference=0;for(let i=0;i<64;i++)difference|=expected.charCodeAt(i)^received.charCodeAt(i);
  accepted=difference===0;
 }
 return actors.run(accepted?{kind:'local-preview',userId:'local-preview'}:null,run);
}

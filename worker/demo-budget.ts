import {demoLimits,emptyDemoState,reserveDemo,type DemoState,type DemoKind} from '../lib/demo-budget-policy';
import {configuredSpendMicros,newSpendLedger,validateSpendLedger,parseSpendCall,spendRequestId,reserveSpend,settleSpend,spendStatus,type SpendLedger,type SpendReservation,type SpendRequest,type SpendCall} from '../lib/meta-spend-policy';
const SPEND_LEDGER='meta-spend-ledger-v1';
const spendKey=(id:string)=>`meta-spend-call:${id}`;
/** One fixed global object. Stores counters and salted IP digests, never text/audio. */
export class DemoBudget{
 constructor(private state:DurableObjectState,private env:Record<string,unknown>){}
 async fetch(request:Request):Promise<Response>{
  if(request.method!=='POST')return new Response(null,{status:405});
  let body:any;try{const raw=await request.text();if(raw.length>512)throw Error();body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return new Response(null,{status:400});}
  const path=new URL(request.url).pathname;
  if(['/spend-reserve','/spend-settle','/spend-status'].includes(path)){
   try{
    const configured=configuredSpendMicros(this.env);
    const result=await this.state.storage.transaction(async tx=>{
     const previous=await tx.get<SpendLedger>(SPEND_LEDGER);
     // Server configuration seeds once. Redeployment or a changed value never
     // increases or resets the persisted allowance, spending or reservations.
     const ledger=previous===undefined?newSpendLedger(configured):previous;
     validateSpendLedger(ledger);
     if(path==='/spend-status'){
      const call=Object.keys(body).length?parseSpendCall(body) as SpendCall:undefined;
      if(previous===undefined)await tx.put(SPEND_LEDGER,ledger);
      return spendStatus(ledger,call);
     }
     if(path==='/spend-reserve'){
      const call=parseSpendCall(body,true) as SpendRequest;
      const existing=await tx.get<SpendReservation>(spendKey(call.requestId));
      const {result,reservation}=reserveSpend(ledger,existing,call);
      if(reservation)await tx.put(spendKey(call.requestId),reservation);
      if(previous===undefined||reservation)await tx.put(SPEND_LEDGER,ledger);
      return result;
     }
     if(!spendRequestId(body.requestId)||previous===undefined)throw Error('Unknown spending reservation');
     const reservation=await tx.get<SpendReservation>(spendKey(body.requestId));
     const result=settleSpend(ledger,reservation,body);
     await tx.put(SPEND_LEDGER,ledger);await tx.put(spendKey(body.requestId),reservation!);
     return result;
    });
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
   }catch{return Response.json({allowed:false,code:'META_SPEND_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});}
  }
  if(path==='/release'){
   if(typeof body.leaseId!=='string'||!/^[a-f0-9-]{36}$/.test(body.leaseId))return new Response(null,{status:400});
   await this.state.storage.transaction(async tx=>{const state=await tx.get<DemoState>('budget');if(state&&state.leases[body.leaseId]){delete state.leases[body.leaseId];await tx.put('budget',state);}});
   return Response.json({released:true});
  }
  if(path!=='/reserve'||!['chat','voice'].includes(body.kind)||typeof body.ip!=='string'||!/^[a-f0-9]{64}$/.test(body.ip))return new Response(null,{status:400});
  const limits=demoLimits(this.env),now=Date.now();
  const result=await this.state.storage.transaction(async tx=>{const state=await tx.get<DemoState>('budget')??emptyDemoState(now);const result=reserveDemo(state,limits,body.kind as DemoKind,body.ip,now,crypto.randomUUID());await tx.put('budget',state);return result;});
  return Response.json(result);
 }
}

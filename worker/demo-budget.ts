import {demoLimits,emptyDemoState,reserveDemo,type DemoState,type DemoKind} from '../lib/demo-budget-policy';
/** One fixed global object. Stores counters and salted IP digests, never text/audio. */
export class DemoBudget{
 constructor(private state:DurableObjectState,private env:Record<string,unknown>){}
 async fetch(request:Request):Promise<Response>{
  if(request.method!=='POST')return new Response(null,{status:405});
  let body:any;try{const raw=await request.text();if(raw.length>512)throw Error();body=JSON.parse(raw);}catch{return new Response(null,{status:400});}
  const path=new URL(request.url).pathname;
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

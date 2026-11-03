/** Prices checked against https://dev.meta.ai/docs/pricing-rate-limits.
 * Full context limit: https://dev.meta.ai/docs/models. This ledger is a
 * conservative local spending allowance, not a live account balance. */
export const META_SPEND_PRICING_VERSION='meta-standard-2026-11-03' as const;
export const META_CONTEXT_TOKENS=1_048_576;
export type SpendOperation='chat'|'sam_image'|'image'|'voice';
export type SpendCall={model:string;operation:SpendOperation;maxOutputTokens?:number};
export type SpendRequest=SpendCall&{requestId:string};
export type SpendUsage={prompt_tokens:number;completion_tokens:number};
export type SpendLedger={version:1;pricingVersion:typeof META_SPEND_PRICING_VERSION;budgetMicros:number;spentMicros:number;heldMicros:number;reservationCount:number};
export type SpendReservation=SpendRequest&{version:1;reservedMicros:number;settledUsage:SpendUsage|null;settledMicros:number|null};
export type SpendResult={allowed:true;reservationId:string}|{allowed:false;code:'META_SPEND_LIMIT'|'META_SPEND_UNAVAILABLE'};
const invalid=()=>new Error('Meta spending allowance could not be verified');
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const exactKeys=(value:Record<string,unknown>,required:string[],optional:string[]=[])=>required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
export const spendRequestId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);

/** No default: only an explicit server-side seed can initialize the ledger. */
export function configuredSpendMicros(env:Record<string,unknown>):number{
 const value=env.META_DEMO_BUDGET_USD;
 if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value))throw invalid();
 const [whole,cents='']=value.split('.');
 return Number(whole)*1_000_000+Number(cents.padEnd(2,'0'))*10_000;
}
export function newSpendLedger(budgetMicros:number):SpendLedger{
 if(!integer(budgetMicros)||budgetMicros>999_999_990_000)throw invalid();
 return{version:1,pricingVersion:META_SPEND_PRICING_VERSION,budgetMicros,spentMicros:0,heldMicros:0,reservationCount:0};
}
export function validateSpendLedger(value:unknown):asserts value is SpendLedger{
 if(!object(value)||value.version!==1||value.pricingVersion!==META_SPEND_PRICING_VERSION||!['budgetMicros','spentMicros','heldMicros','reservationCount'].every(key=>integer(value[key]))||Number(value.budgetMicros)>999_999_990_000||Number(value.spentMicros)+Number(value.heldMicros)>Number(value.budgetMicros))throw invalid();
}
function textPrice(model:string){
 // Quarter-microdollar integer rates avoid binary fractional currency math.
 if(model==='muse-spark-1.3')return{inputQuarterMicros:5,outputQuarterMicros:17,outputCap:2500};
 if(model==='muse-wonder-1.0')return{inputQuarterMicros:16,outputQuarterMicros:80,outputCap:2200};
 throw invalid();
}
function tokenCost(model:string,prompt:number,completion:number){const price=textPrice(model);return Math.ceil((prompt*price.inputQuarterMicros+completion*price.outputQuarterMicros)/4);}
export function parseSpendCall(value:unknown,withId=false):SpendCall|SpendRequest{
 if(!object(value)||!exactKeys(value,withId?['requestId','model','operation']:['model','operation'],['maxOutputTokens'])||typeof value.model!=='string'||typeof value.operation!=='string'||withId&&!spendRequestId(value.requestId))throw invalid();
 const call={model:value.model,operation:value.operation as SpendOperation,...(Object.hasOwn(value,'maxOutputTokens')?{maxOutputTokens:value.maxOutputTokens as number}:{})};
 if(call.operation==='chat'){
  const price=textPrice(call.model);if(!integer(call.maxOutputTokens)||call.maxOutputTokens<1||call.maxOutputTokens>price.outputCap)throw invalid();
 }else{
  const expected={sam_image:'sam-3.1',image:'muse-image-1.0',voice:'muse-voice-transcribe-1.0'};
  if(!(call.operation in expected)||call.model!==expected[call.operation as keyof typeof expected]||Object.hasOwn(call,'maxOutputTokens'))throw invalid();
 }
 return withId?{...call,requestId:value.requestId as string}:call;
}
export function reserveCostMicros(call:SpendCall):number{
 parseSpendCall(call);
 if(call.operation==='chat')return tokenCost(call.model,META_CONTEXT_TOKENS,call.maxOutputTokens!);
 return call.operation==='sam_image'?2500:call.operation==='image'?10_000:3000;
}
export function spendStatus(ledger:SpendLedger,call?:SpendCall):{allowed:boolean;code?:'META_SPEND_LIMIT'}{
 validateSpendLedger(ledger);
 const required=call?reserveCostMicros(call):2500;
 return ledger.budgetMicros-ledger.spentMicros-ledger.heldMicros>=required?{allowed:true}:{allowed:false,code:'META_SPEND_LIMIT'};
}
/** A repeated UUID never authorizes another provider dispatch. There is no
 * expiry/refund for uncertain charges; caller cancellation keeps the hold. */
export function reserveSpend(ledger:SpendLedger,existing:SpendReservation|undefined,input:unknown):{result:SpendResult;reservation?:SpendReservation}{
 validateSpendLedger(ledger);const call=parseSpendCall(input,true) as SpendRequest;
 if(existing!==undefined)return{result:{allowed:false,code:'META_SPEND_UNAVAILABLE'}};
 const reservedMicros=reserveCostMicros({model:call.model,operation:call.operation,...(call.maxOutputTokens!==undefined?{maxOutputTokens:call.maxOutputTokens}:{})});
 if(ledger.budgetMicros-ledger.spentMicros-ledger.heldMicros<reservedMicros)return{result:{allowed:false,code:'META_SPEND_LIMIT'}};
 ledger.heldMicros+=reservedMicros;ledger.reservationCount++;
 return{result:{allowed:true,reservationId:call.requestId},reservation:{...call,version:1,reservedMicros,settledUsage:null,settledMicros:null}};
}
/** Only complete server-returned text usage can reduce a reservation. Cached
 * prompt tokens are charged at the full input rate conservatively. */
export function settleSpend(ledger:SpendLedger,reservation:SpendReservation|undefined,input:unknown):{settled:true}{
 validateSpendLedger(ledger);
 if(!object(input)||!exactKeys(input,['requestId','model','usage'])||!spendRequestId(input.requestId)||!reservation||reservation.version!==1||reservation.requestId!==input.requestId||reservation.model!==input.model||reservation.operation!=='chat'||!object(input.usage)||!exactKeys(input.usage,['prompt_tokens','completion_tokens']))throw invalid();
 const usage=input.usage;
 if(!integer(usage.prompt_tokens)||!integer(usage.completion_tokens)||usage.prompt_tokens<1||usage.prompt_tokens>META_CONTEXT_TOKENS||usage.completion_tokens>Number(reservation.maxOutputTokens)||usage.prompt_tokens+usage.completion_tokens>META_CONTEXT_TOKENS)throw invalid();
 const call={model:reservation.model,operation:reservation.operation,maxOutputTokens:reservation.maxOutputTokens};
 if(reservation.reservedMicros!==reserveCostMicros(call))throw invalid();
 const actual=tokenCost(reservation.model,usage.prompt_tokens,usage.completion_tokens);
 if(actual>reservation.reservedMicros)throw invalid();
 if(reservation.settledUsage!==null||reservation.settledMicros!==null){
  if(reservation.settledUsage?.prompt_tokens!==usage.prompt_tokens||reservation.settledUsage?.completion_tokens!==usage.completion_tokens||reservation.settledMicros!==actual)throw invalid();
  return{settled:true};
 }
 if(ledger.heldMicros<reservation.reservedMicros)throw invalid();
 ledger.heldMicros-=reservation.reservedMicros;ledger.spentMicros+=actual;
 reservation.settledUsage={prompt_tokens:usage.prompt_tokens,completion_tokens:usage.completion_tokens};reservation.settledMicros=actual;
 return{settled:true};
}

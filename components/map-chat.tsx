'use client';

import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowDown,ArrowUp,ArrowUpRight,Check,ChevronDown,CornerDownLeft,LoaderCircle,RefreshCw,RotateCcw,Square,TriangleAlert} from 'lucide-react';
import {validateQuery,type CityBuilding,type CityQuery} from '@/lib/city';
import {inspectReviewedPlan} from '@/lib/reviewed-plan';
import MetaInvestigationResult,{hasMetaSources,MetaAnswerText,MetaModelAttribution,AdaptationConceptVisual,parseMetaResult,ResilienceBriefText,type MetaResultView} from './meta-investigation-result';
import SiteImageryEvidence from './site-imagery-evidence';
import VoiceNoteComposer from './voice-note-composer';
import ChatAnalysisMenu from './chat-analysis-menu';
import VisualComparisonResult from './visual-comparison-result';
import TemporalImageryResult from './temporal-imagery-result';
import LocalReviewPanel from './local-review-panel';
import './map-chat.css';

export type MapChatProps={
 selected:CityBuilding[];
 query:CityQuery;
 onApplyReviewed:(payload:unknown)=>Promise<void>;
 onOpenSearch:(query:CityQuery)=>Promise<void>;
};
type Obj=Record<string,unknown>;
export type HistoryTurn={role:'user'|'assistant';content:string};
type Connection={state:'checking'|'approval_pending'|'credential_missing'|'ready_for_verification'|'demo_unavailable'|'unavailable';canRun:boolean};
type Exchange={id:number;question:string;context:string;generation:number;places:string[];state:'pending'|'complete'|'error'|'cancelled';payload?:unknown;error?:string;authRequired?:boolean};
const object=(v:unknown):Obj|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Obj:null;
const text=(v:unknown,fallback='',limit=8000)=>typeof v==='string'?v.slice(0,limit):fallback;
const nativeId=(v:unknown):v is string=>typeof v==='string'&&/^(?:[1-9]\d{0,9}|p:[1-5]\d{9})$/.test(v);
const QUERY_KEYS=['unit','q','borough','bbox','cursor','page','limit','minArea','zoning','landUse'];
/** Unknown or contradictory status envelopes never enable the composer. */
export function readMapChatStatus(payload:unknown):Connection{
 const p=object(payload);
 if(!p||typeof p.configured!=='boolean'||typeof p.approved!=='boolean'||typeof p.canRun!=='boolean'||typeof p.liveVerified!=='boolean')return{state:'unavailable',canRun:false};
 if(p.requiresSignIn!==undefined&&typeof p.requiresSignIn!=='boolean')return{state:'unavailable',canRun:false};
 if(p.status==='approval_pending'&&p.approved===false&&p.canRun===false)return{state:'approval_pending',canRun:false};
 if(p.status==='credential_missing'&&p.approved===true&&p.configured===false&&p.canRun===false)return{state:'credential_missing',canRun:false};
 if(p.requiresSignIn===true)return{state:'unavailable',canRun:false};
 if(p.status==='ready_for_verification'&&p.approved===true&&p.configured===true&&p.canRun===true)return{state:'ready_for_verification',canRun:true};
 return{state:'unavailable',canRun:false};
}

/** Only registered query fields reach the map; the parent remains the final owner. */
export function readMapChatQuery(value:unknown):CityQuery|null{
 const q=object(value);if(!q||Object.keys(q).some(k=>!QUERY_KEYS.includes(k)))return null;
 for(const [key,val] of Object.entries(q)){
  if(val===undefined)continue;
  if(key==='bbox'){if(!Array.isArray(val)||val.length!==4||val.some(n=>typeof n!=='number'||!Number.isFinite(n)))return null;}
  else if(['unit','q','borough','zoning','landUse'].includes(key)){if(typeof val!=='string')return null;}
  else if(typeof val!=='number'||!Number.isFinite(val))return null;
 }
 try{return validateQuery(new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v)])));}catch{return null;}
}

export function mapChatContextKey(selected:CityBuilding[],query:CityQuery):string{
 // A/B ordering is significant. Coordinates and model-supplied geometry are never sent.
 const normalized=readMapChatQuery(query)??query;
 const orderedQuery=QUERY_KEYS.map(key=>[key,(normalized as Record<string,unknown>)[key]??null]);
 return JSON.stringify({ids:selected.map(b=>b.id),query:orderedQuery});
}

function clipHistoryText(value:string,length=4000):string{
 const clipped=value.slice(0,length);
 // Never leave half of a UTF-16 surrogate pair at a truncation boundary.
 return /[\uD800-\uDBFF]$/.test(clipped)?clipped.slice(0,-1):clipped;
}
/** Mirrors planning-context's explicit-time recognition without bundling its
 * climate snapshot. It retains the user's words, never a model-derived date.
 * Unsupported later dates also matter: they must not revive an older horizon.
 */
export function hasExplicitPlanningTime(value:string):boolean{
 const text=value.replace(/\bNPCC4(?:\s+(?:report|assessment))?\s*\(?2024\)?|\b2024\s+NPCC4(?:\s+(?:report|assessment))?|\bpublished\s+in\s+2024\b/gi,'')
  .replace(/\b(?:built|constructed|construction year|year built)\s*(?:in\s*)?\d{4}\b/gi,'')
  .replace(/\b(?:baseline|reference period)\s*(?:of\s*)?1981\s*[–—-]\s*2010\b/gi,'')
  .replace(/[$£€]\s*\d[\d,.]*/g,'')
  .replace(/\b\d[\d,.]*(?:\s*[–—-]\s*\d[\d,.]*)?\s*(?:square\s+(?:feet|foot|metres?|meters?)|sq\.?\s*(?:ft|feet|m)|ft²|m²|sqft|sqm|kwh?|mw|watts?|feet|ft|metres?|meters?|dollars?)\b/gi,'');
 const quantity='(?:\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty)';
 const relative=new RegExp(`\\b(?:(?:next|coming|following)\\s*(${quantity})\\s*years?|(?:over|for|in)\\s+(?:the\\s+)?(?:(?:next|coming|following)\\s*)?(${quantity})\\s*years?|(${quantity})\\s*years?\\s+from\\s+now|(?:next|coming|following)\\s*decade|in\\s+a\\s+decade)\\b`,'i');
 return relative.test(text)||/\b\d{4}s?\b/i.test(text)||/\b(today|tomorrow|tonight|right now|current weather|next week|next month|this week|this month)\b/i.test(text)||/\b(?:past|last|previous)\s+(?:\d+|\w+)\s+years?\b|\b(?:past|last|previous)\s+decade\b/i.test(text);
}
function latestPlanningPair(history:readonly HistoryTurn[]):number{
 for(let i=history.length-2;i>=0;i-=2)if(history[i].role==='user'&&hasExplicitPlanningTime(history[i].content))return i;
 return -1;
}
/** Keep the goal, the latest explicit time request, and recent complete pairs. */
export function retainMapChatHistory(history:readonly HistoryTurn[]):HistoryTurn[]{
 const pairs:HistoryTurn[]=[];
 for(let i=0;i+1<history.length;i++){
  if(history[i].role!=='user'||history[i+1].role!=='assistant')continue;
  pairs.push({role:'user',content:clipHistoryText(history[i].content)},{role:'assistant',content:clipHistoryText(history[++i].content)});
 }
 if(pairs.length<=16)return pairs;
 const keep=new Set([0]),planning=latestPlanningPair(pairs);
 if(planning>=0)keep.add(planning);
 for(let i=pairs.length-2;i>=0&&keep.size<8;i-=2)keep.add(i);
 return [...keep].sort((a,b)=>a-b).flatMap(i=>pairs.slice(i,i+2));
}
export function mapChatRequestBody(message:string,history:readonly HistoryTurn[],selectedIds:string[],query:CityQuery):string{
 const bounded=retainMapChatHistory(history);
 let result=JSON.stringify({message,history:bounded,selectedIds,query});
 const bytes=()=>new TextEncoder().encode(result).length;
 // Discard unpinned middle pairs first, preserving the goal, latest explicit
 // time request and latest exchange. Never shorten those user statements.
 while(bytes()>58_000&&bounded.length>4){
  const planning=latestPlanningPair(bounded);
  let remove=-1;for(let i=2;i<bounded.length-2;i+=2)if(i!==planning){remove=i;break;}
  if(remove<0)break;
  bounded.splice(remove,2);result=JSON.stringify({message,history:bounded,selectedIds,query});
 }
 // A few long multibyte turns can still exceed the transport budget. Shorten
 // assistant context only; keep the original and latest user requests intact.
 while(bytes()>58_000){
  const longest=bounded.reduce((best,turn,i)=>turn.role==='assistant'&&turn.content.length>(bounded[best]?.content.length??128)?i:best,-1);
  if(longest<0)throw Error('This message is too large to send. Shorten it and try again.');
  bounded[longest]={...bounded[longest],content:clipHistoryText(bounded[longest].content,Math.floor(bounded[longest].content.length*.75))+'…'};
  result=JSON.stringify({message,history:bounded,selectedIds,query});
 }
 return result;
}
function historyAnswer(view:MetaResultView):string{
 if(view.kind!=='resilience_brief')return view.answer;
 const places=(view.data.places as Array<{id:string;address:string}>).map(place=>`${place.address} (native ID ${place.id})`).join(' / ');
 // Preserve identities even when a concise follow-up answer does not repeat
 // them. The server still treats all prior assistant text as untrusted context.
 return `Public-data comparison produced by application rules, not Meta. Places in this response: ${places}.\n${view.answer}`;
}
const statusCopy:Record<Connection['state'],string>={
 checking:'Connecting…',
 approval_pending:'Meta access is pending. You can keep drafting.',
 credential_missing:'Meta is not connected yet. You can keep drafting.',
 ready_for_verification:'Ready to send.',
 demo_unavailable:'The public AI demo is temporarily unavailable. The map remains available.',
 unavailable:'Connection unavailable. Try again.',
};

export default function MapChat({selected,query,onApplyReviewed,onOpenSearch}:MapChatProps){
 const inputId=useId(),headingId=useId();
 const [connection,setConnection]=useState<Connection>({state:'checking',canRun:false});
 const [draft,setDraft]=useState('');
 const [localAvailable,setLocalAvailable]=useState(false),[localOpen,setLocalOpen]=useState(false);
 const [exchanges,setExchanges]=useState<Exchange[]>([]);
 const [busy,setBusy]=useState(false);
 const [voiceBusy,setVoiceBusy]=useState(false),[voiceReset,setVoiceReset]=useState(0);
 const [actionBusy,setActionBusy]=useState<number|null>(null);
 const [actionError,setActionError]=useState('');
 const [notice,setNotice]=useState('');
 const [statusRefresh,setStatusRefresh]=useState(0);
 const [newContent,setNewContent]=useState(false);
 const [contextGeneration,setContextGeneration]=useState(0);
 const generation=useRef(0);
 const composer=useRef<HTMLTextAreaElement>(null),transcript=useRef<HTMLDivElement>(null);
 const history=useRef<HistoryTurn[]>([]),requestSequence=useRef(0),nextId=useRef(1),actionSequence=useRef(0);
 const request=useRef<{controller:AbortController;id:number;question:string}|null>(null);
 const statusSequence=useRef(0),stickToBottom=useRef(true),mounted=useRef(true);
 const context=mapChatContextKey(selected,query),activeContext=useRef(context);
 const validQuery=readMapChatQuery(query);
 const selectionValid=selected.length<=2&&selected.every(b=>nativeId(b.id))&&new Set(selected.map(b=>b.id)).size===selected.length;
 const status=statusCopy[connection.state];
 const canSend=connection.canRun&&!!draft.trim()&&!busy&&!voiceBusy&&actionBusy===null&&selectionValid&&validQuery!==null;

 const stopRequest=useCallback((reason:string)=>{
  ++requestSequence.current;
  const current=request.current;request.current=null;current?.controller.abort();setBusy(false);
  if(current){setDraft(value=>value||current.question);setExchanges(rows=>rows.map(row=>row.id===current.id&&row.state==='pending'?{...row,state:'cancelled',error:reason}:row));}
 },[]);
 const setDemoUnavailable=useCallback(()=>{setConnection({state:'demo_unavailable',canRun:false});setVoiceReset(value=>value+1);},[]);

 useLayoutEffect(()=>{
  if(activeContext.current===context)return;
  const hadConversation=exchanges.length>0||history.current.length>0||request.current!==null;
  setLocalOpen(false);activeContext.current=context;setContextGeneration(++generation.current);++actionSequence.current;
  stopRequest('The selected places or search scope changed. This reply was cancelled.');
  setActionBusy(null);setActionError('');setNotice(hadConversation?'Conversation kept. Your next question will use the current places and search scope.':'');
 },[context,stopRequest,exchanges.length]);

 useEffect(()=>{
  mounted.current=true;
  return()=>{mounted.current=false;request.current?.controller.abort();};
 },[]);

 useEffect(()=>{
  const controller=new AbortController(),sequence=++statusSequence.current;
  let active=true;
  const timer=window.setTimeout(()=>controller.abort(),12_000);
  fetch('/api/chat',{method:'GET',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}})
   .then(async response=>{if(!response.ok)throw Error('Status unavailable');return response.json() as Promise<unknown>;})
   .then(data=>{if(active&&mounted.current&&sequence===statusSequence.current){setConnection(readMapChatStatus(data));setLocalAvailable(object(object(data)?.localReview)?.available===true);}})
   .catch(()=>{if(active&&mounted.current&&sequence===statusSequence.current)setConnection({state:'unavailable',canRun:false});})
   .finally(()=>window.clearTimeout(timer));
  return()=>{active=false;controller.abort();window.clearTimeout(timer);};
 },[statusRefresh]);

 const scrollToLatest=useCallback(()=>{const panel=transcript.current;if(panel){panel.scrollTo({top:panel.scrollHeight,behavior:'auto'});stickToBottom.current=true;setNewContent(false);}},[]);
 useLayoutEffect(()=>{
  const panel=transcript.current;
  if(exchanges.length===0){if(panel)panel.scrollTop=0;stickToBottom.current=true;return;}
  if(stickToBottom.current&&panel)panel.scrollTo({top:panel.scrollHeight,behavior:'auto'});
 },[exchanges,busy,notice]);

 function fillDraft(value:string){setDraft(value.slice(0,4000));setActionError('');composer.current?.focus();}
 function reset(){
  if(actionBusy!==null)return;
  setLocalOpen(false);setVoiceReset(value=>value+1);stopRequest('Conversation reset.');++actionSequence.current;history.current=[];setExchanges([]);setDraft('');setNewContent(false);setActionError('');setNotice('');stickToBottom.current=true;composer.current?.focus();
 }
 async function send(event?:FormEvent){
  event?.preventDefault();
  if(!canSend||!validQuery||request.current!==null)return;
  const question=draft.trim(),id=nextId.current++,contextAtSend=context,generationAtSend=generation.current,sequence=++requestSequence.current;
  const controller=new AbortController();request.current={controller,id,question};
  setDraft('');setBusy(true);setNewContent(false);setActionError('');setNotice('');stickToBottom.current=true;
  setExchanges(rows=>[...rows,{id,question,context:contextAtSend,generation:generationAtSend,places:selected.map((b,i)=>`${String.fromCharCode(65+i)} · ${b.address}`),state:'pending'}]);
  let timedOut=false,authRequired=false;
  const timeout=window.setTimeout(()=>{timedOut=true;controller.abort();},180_000);
  const current=()=>mounted.current&&sequence===requestSequence.current&&activeContext.current===contextAtSend&&generation.current===generationAtSend;
  try{
   const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},signal:controller.signal,body:mapChatRequestBody(question,history.current,selected.map(b=>b.id),validQuery)});
   const payload:unknown=await response.json();
   if(!current())return;
   if(!response.ok){
    const data=object(payload);
    if(data?.code==='AUTH_REQUIRED'||data?.code==='DEMO_UNAVAILABLE'){authRequired=true;setDemoUnavailable();throw Error('The public demo is unavailable. Your question is ready in the composer.');}
    if(data?.code==='MODEL_APPROVAL_PENDING')setConnection({state:'approval_pending',canRun:false});
    else if(data?.code==='MODEL_NOT_CONFIGURED')setConnection({state:'credential_missing',canRun:false});
    throw Error(text(data?.error,'The request could not be completed. Your question is ready to retry.',900));
   }
   const view=parseMetaResult(payload);
   if(!view)throw Error('The response was incomplete or its evidence did not match its scope. No result has been applied. Try a more specific question.');
   setExchanges(rows=>rows.map(row=>row.id===id?{...row,state:'complete',payload}:row));
   history.current=retainMapChatHistory([...history.current,{role:'user',content:question},{role:'assistant',content:historyAnswer(view)}]);
  }catch(error){
   if(!current())return;
   const message=timedOut?'The request timed out. No answer was accepted. Your question is ready to retry.':controller.signal.aborted?'Stopped waiting. No new answer was accepted.':error instanceof SyntaxError?'The server did not return a readable response. Your question is ready to retry.':error instanceof Error?error.message:'The request could not be completed. Your question is ready to retry.';
   setExchanges(rows=>rows.map(row=>row.id===id?{...row,state:'error',error:message,authRequired}:row));setDraft(value=>value||question);
  }finally{
   window.clearTimeout(timeout);
   if(current()){request.current=null;setBusy(false);}
  }
 }
 async function act(row:Exchange,kind:'apply'|'search'){
  if(row.context!==activeContext.current||row.generation!==generation.current||busy||actionBusy!==null||row.state!=='complete')return;
  const payload=object(row.payload);if(!payload)return;
  const plan=kind==='apply'?inspectReviewedPlan(payload):null;
  const returnedQuery=kind==='search'?readMapChatQuery(payload.appliedQuery):null;
  if(kind==='apply'&&(!plan?.ok||plan.descriptor.ids.length>2)){setActionError('Review a valid plan for no more than two places before using it.');return;}
  if(kind==='search'&&!returnedQuery){setActionError('This response does not contain a valid map search.');return;}
  const sequence=++actionSequence.current,contextAtStart=activeContext.current;
  setActionBusy(row.id);setActionError('');
  try{
   if(kind==='apply')await onApplyReviewed(payload);else await onOpenSearch(returnedQuery!);
   if(mounted.current&&sequence===actionSequence.current&&activeContext.current===contextAtStart)setNotice(kind==='apply'?'Reviewed conditions opened with refreshed official records.':'The returned search was opened on the map.');
  }catch(error){if(mounted.current&&sequence===actionSequence.current&&activeContext.current===contextAtStart)setActionError(error instanceof Error?error.message:'The action could not be completed. Your current places remain available.');}
  finally{if(mounted.current&&sequence===actionSequence.current)setActionBusy(null);}
 }
 if(localOpen&&localAvailable)return <aside className="map-chat" aria-label="Meta local review"><LocalReviewPanel key={context} selected={selected} onClose={()=>setLocalOpen(false)}/></aside>;
 return <aside className="map-chat" aria-labelledby={headingId}>
  <header className="map-chat-header"><h2 id={headingId}>Meta</h2><button type="button" className="map-chat-icon" onClick={reset} disabled={actionBusy!==null} title="Reset conversation" aria-label="Reset conversation"><RotateCcw size={16} aria-hidden="true"/></button></header>
  <div ref={transcript} className="map-chat-transcript" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={()=>{const el=transcript.current;if(el){stickToBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;setNewContent(!stickToBottom.current);}}}>
   {exchanges.length===0&&<p className="map-chat-welcome">What would you like to know?</p>}
   {exchanges.map(row=>{
    const payload=object(row.payload),view=parseMetaResult(row.payload),stale=row.context!==context||row.generation!==contextGeneration;
    const review=payload?.kind==='decision'?inspectReviewedPlan(payload):null;
    const returnedQuery=payload?readMapChatQuery(payload.appliedQuery):null;
    const actualSearch=Array.isArray(payload?.toolCalls)&&payload.toolCalls.some(call=>{const t=object(call);return t?.name==='search_city'&&object(t.result)&&!object(t.result)?.error;});
    return <article className={'map-chat-exchange'+(stale?' map-chat-earlier':'')} key={row.id}>
     <div className="map-chat-user" aria-label="You"><p>{row.question}</p></div>
     <div className="map-chat-reply" aria-label={view?.kind==='resilience_brief'?'Public-data comparison':'Meta response'}>
      {stale&&<span className="map-chat-earlier-label">Earlier context</span>}
      {row.state==='pending'?<div className="map-chat-waiting" role="status"><LoaderCircle size={16} aria-hidden="true"/><p>Thinking…</p></div>:row.state==='error'||row.state==='cancelled'?<div className="map-chat-message-error" role="alert"><TriangleAlert size={16} aria-hidden="true"/><p>{row.error}</p>{!row.authRequired&&<button type="button" onClick={()=>fillDraft(row.question)} disabled={busy||actionBusy!==null}>Edit and retry <CornerDownLeft size={13} aria-hidden="true"/></button>}</div>:view&&<>
       <MetaModelAttribution view={view}/>
       {view.kind==='resilience_brief'?<ResilienceBriefText view={view}/>:<MetaAnswerText className="map-chat-answer" answer={view.kind==='clarification'?text(view.data.question):view.answer}/>}
       {payload?.conceptVisual&&<AdaptationConceptVisual view={view}/>}
       {payload?.visualComparison&&<VisualComparisonResult value={payload.visualComparison}/>}
       {payload?.temporalImagery&&<TemporalImageryResult value={payload.temporalImagery} active={!stale} onAsk={fillDraft}/>}
       {!payload?.visualComparison&&!payload?.temporalImagery&&Array.isArray(payload?.visualEvidence)&&payload.visualEvidence.length===1&&<SiteImageryEvidence value={payload.visualEvidence[0]}/>}
       {(view.kind!=='conversation'||hasMetaSources(view.payload))&&<details className="map-chat-evidence"><summary>Sources<ChevronDown size={13} aria-hidden="true"/></summary>
        {row.places.length>0&&<p className="map-chat-source-context">{row.places.join(' · ')}</p>}
        <MetaInvestigationResult sourcesOnly payload={row.payload} onClarificationChoice={!stale&&!busy&&actionBusy===null?fillDraft:undefined}/>
        {stale?<p className="map-chat-stale-note">This answer belongs to an earlier selection or search. Ask again to use the current context.</p>:<div className="map-chat-result-actions">
        {review?.ok&&review.descriptor.ids.length<=2&&<button type="button" className="map-chat-action" disabled={busy||actionBusy!==null} onClick={()=>act(row,'apply')}>{actionBusy===row.id?<LoaderCircle size={14}/>:<Check size={14}/>}Use these reviewed conditions</button>}
        {review?.ok&&review.descriptor.ids.length>2&&<p className="map-chat-review-note">This result includes more than two places. Ask for a comparison of two before applying it.</p>}
        {review&&!review.ok&&<p className="map-chat-review-note">{review.error}</p>}
        {returnedQuery&&actualSearch&&<button type="button" className="map-chat-search-action" disabled={busy||actionBusy!==null} onClick={()=>act(row,'search')}>Open returned search <ArrowUpRight size={14}/></button>}
        </div>}
       </details>}
      </>}
     </div>
    </article>;
   })}
   {notice&&<p className="map-chat-notice" role="status">{notice}</p>}
   {actionError&&<p className="map-chat-action-error" role="alert">{actionError}</p>}
  </div>
  {newContent&&exchanges.length>0&&<button type="button" className="map-chat-latest" onClick={scrollToLatest}><ArrowDown size={13}/>Latest reply</button>}
  <form className="map-chat-composer" onSubmit={send}>
   {!connection.canRun&&<div className={'map-chat-connection'+(connection.state==='demo_unavailable'?' map-chat-signin':'')} role="status"><span id={`${inputId}-status`}>{status}</span>{connection.state!=='checking'&&<button type="button" className="map-chat-icon" onClick={()=>{setConnection({state:'checking',canRun:false});setStatusRefresh(value=>value+1);}} disabled={busy} aria-label="Recheck Meta connection" title="Recheck connection"><RefreshCw size={13} aria-hidden="true"/></button>}</div>}
   {!selectionValid&&<p className="map-chat-context-warning" role="alert">Choose no more than two distinct places before sending.</p>}
   {!validQuery&&<p className="map-chat-context-warning" role="alert">The current search scope is invalid. Update the map search before sending.</p>}
   <label className="map-chat-sr-only" htmlFor={inputId}>Your question for Meta</label>
   <div className="map-chat-input-wrap"><textarea ref={composer} id={inputId} value={draft} onChange={event=>setDraft(event.target.value)} maxLength={4000} rows={2} placeholder="Message Meta…" aria-describedby={!connection.canRun?`${inputId}-status`:undefined} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&connection.canRun){event.preventDefault();void send();}}}/><div className="map-chat-input-footer"><div className="map-chat-input-tools"><ChatAnalysisMenu count={selected.length} disabled={busy||voiceBusy||actionBusy!==null} context={`${context}:${voiceReset}`} onChoose={fillDraft} onLocalReview={localAvailable&&selected.length===2&&selected.every(b=>!b.id.startsWith('p:'))?()=>setLocalOpen(true):undefined}/><VoiceNoteComposer onAuthRequired={setDemoUnavailable} disabled={!connection.canRun||busy||actionBusy!==null} contextKey={`${context}:${voiceReset}`} remainingCharacters={4000-draft.trim().length-(draft.trim()?1:0)} onTranscript={value=>{setDraft(current=>[current.trim(),value].filter(Boolean).join('\n').slice(0,4000));composer.current?.focus();}} onBusyChange={setVoiceBusy}/><span>{draft.length>=3600?`${draft.length.toLocaleString()} / 4,000`:''}</span></div>{busy?<button type="button" className="map-chat-send map-chat-stop" onClick={()=>stopRequest('Stopped waiting. No new answer was accepted.')} aria-label="Stop waiting for the response"><Square size={14} aria-hidden="true"/></button>:<button type="submit" className="map-chat-send" disabled={!canSend} aria-label={connection.canRun?'Send question to Meta':connection.state==='demo_unavailable'?'Demo temporarily unavailable':'Send unavailable until Meta is connected'} title="Send message"><ArrowUp size={18} aria-hidden="true"/></button>}</div></div>
  </form>
 </aside>;
}

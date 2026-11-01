'use client';

import {useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowUp,ChevronDown,LockKeyhole,LoaderCircle,Square} from 'lucide-react';
import type {CityBuilding} from '@/lib/city';
import {parseLocalReviewDisplay} from '@/lib/local-review-display';
import type {LocalGlimmerReview} from '@/lib/local-glimmer-review';
import './local-review-panel.css';

/** Deliberately separate from MapChat's draft, exchanges and cloud history.
 * Closing/unmounting clears private text and aborts the local-only request. */
export default function LocalReviewPanel({selected,onClose}:{selected:CityBuilding[];onClose:()=>void}){
 const id=useId(),controller=useRef<AbortController|null>(null),sequence=useRef(0),resultPanel=useRef<HTMLDivElement>(null);
 const[question,setQuestion]=useState('Which inspection should come first, and what finding could change the choice between these buildings?');
 const[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const[result,setResult]=useState<LocalGlimmerReview|null>(null);
 useEffect(()=>()=>{++sequence.current;controller.current?.abort();},[]);
 useEffect(()=>{if(result)resultPanel.current?.scrollIntoView({block:'start',behavior:'auto'});},[result]);
 function stop(){++sequence.current;controller.current?.abort();controller.current=null;setBusy(false);}
 async function send(event:FormEvent){
  event.preventDefault();if(busy||!question.trim()||selected.length!==2)return;
  const current=++sequence.current,abort=new AbortController();controller.current=abort;setBusy(true);setError('');setResult(null);
  const timer=window.setTimeout(()=>abort.abort(),125_000);
  try{
   const response=await fetch('/api/local-review',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},signal:abort.signal,body:JSON.stringify({selectedIds:selected.map(b=>b.id),question:question.trim(),notes:notes.trim()})});
   const payload:unknown=await response.json();if(sequence.current!==current)return;
   if(!response.ok){const p=payload as {error?:unknown};throw Error(typeof p?.error==='string'?p.error.slice(0,500):'The local review could not be completed.');}
   const review=parseLocalReviewDisplay(payload);
   if(!review||review.buildingIds.some((value,i)=>value!==selected[i]?.id))throw Error('The review did not match these buildings and their evidence.');
   setResult(review);
  }catch(cause){if(sequence.current===current)setError(abort.signal.aborted?'The review was stopped. Your notes are ready to try again.':cause instanceof Error?cause.message:'The local review could not be completed.');}
  finally{window.clearTimeout(timer);if(sequence.current===current){controller.current=null;setBusy(false);}}
 }
 const priority=result?.actions.find(action=>action.id===result.priority.actionId);
 return <section className="local-review-panel" aria-label="On-device inspection review">
  <header><button type="button" onClick={onClose} className="local-review-back"><ArrowLeft size={15}/>Back to chat</button><span><LockKeyhole size={13}/>On this computer</span></header>
  <div className="local-review-scroll">
   <p className="local-review-model">Muse Glimmer <span>30B · Open weights</span></p>
   <h3>What could change your choice?</h3>
   <p className="local-review-intro">Bring your inspection notes into the comparison. Glimmer reviews them locally alongside fresh public building records.</p>
   <div className="local-review-places">{selected.map((building,i)=><p key={building.id}><b>{String.fromCharCode(65+i)}</b>{building.address}</p>)}</div>
   <form onSubmit={send}>
    <label htmlFor={`${id}-question`}>Decision to explore</label><textarea id={`${id}-question`} value={question} onChange={e=>{setQuestion(e.target.value);setResult(null);setError('');}} maxLength={2000} rows={3} disabled={busy}/>
    <label htmlFor={`${id}-notes`}>Your inspection notes <span>Optional</span></label><textarea id={`${id}-notes`} value={notes} onChange={e=>{setNotes(e.target.value);setResult(null);setError('');}} maxLength={6000} rows={5} placeholder="Add what you observed, what the owner reported, and what still needs checking…" disabled={busy}/>
    <p className="local-review-privacy"><LockKeyhole size={13}/>Your notes and this review stay in the local session.</p>
    <button className="local-review-submit" type={busy?'button':'submit'} onClick={busy?stop:undefined} disabled={!busy&&(!question.trim()||selected.length!==2)}>{busy?<><Square size={13}/>Stop review</>:<>Review with Glimmer<ArrowUp size={16}/></>}</button>
   </form>
   {busy&&<p className="local-review-progress" role="status"><LoaderCircle size={16}/>Reviewing the evidence on this computer…</p>}
   {error&&<p className="local-review-error" role="alert">{error}</p>}
   {result&&priority&&<div className="local-review-result" aria-live="polite" ref={resultPanel}>
    <p className="local-review-result-label">Glimmer’s suggested first check</p>
    <h4>{priority.title}</h4><p>{priority.action}</p>
    <div className="local-review-pivot"><strong>What changes the decision</strong><p><b>If</b> {result.priority.ifFinding}</p><p><b>Then</b> {result.priority.thenAction}</p></div>
    <details open><summary>Supporting records<ChevronDown size={14}/></summary>{[...priority.support,...result.priority.support].filter((support,index,rows)=>rows.findIndex(row=>row.evidenceId===support.evidenceId)===index).map(support=>{const source=result.evidence.find(item=>item.evidenceId===support.evidenceId)!;return <blockquote key={support.evidenceId}><span>{source.origin==='user_note'?'Your inspection notes':source.label}</span><p>{support.quote}</p></blockquote>;})}</details>
    {result.actions.filter(action=>action.id!==priority.id).map(action=><details key={action.id}><summary>{action.title}<ChevronDown size={14}/></summary><p>{action.action}</p>{action.support.map(support=><blockquote key={support.evidenceId}><span>{result.evidence.find(item=>item.evidenceId===support.evidenceId)?.label}</span><p>{support.quote}</p></blockquote>)}</details>)}
    <p className="local-review-receipt">Muse Glimmer 30B · {Math.round(result.timing.requestMs/1000)}s · Source-linked review</p>
   </div>}
  </div>
 </section>;
}

'use client';
import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Upload,X,LoaderCircle} from 'lucide-react';
import {prepareVoiceAudio,VOICE_FILE_BYTES,VOICE_SECONDS} from '../lib/voice-audio';
import './voice-note-composer.css';

type Recording={blob:Blob;label:string;duration?:number};
export default function VoiceNoteComposer({disabled,contextKey,remainingCharacters,onTranscript,onBusyChange}:{disabled:boolean;contextKey:string;remainingCharacters:number;onTranscript:(text:string)=>void;onBusyChange:(busy:boolean)=>void}){
 const [open,setOpen]=useState(false),[phase,setPhase]=useState<'idle'|'requesting'|'recording'|'transcribing'>('idle'),[seconds,setSeconds]=useState(0),[recording,setRecording]=useState<Recording|null>(null),[preview,setPreview]=useState(''),[result,setResult]=useState(''),[error,setError]=useState('');
 const fileInput=useRef<HTMLInputElement>(null),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),request=useRef<AbortController|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null),sequence=useRef(0),mounted=useRef(true),started=useRef(0);
 const busy=phase!=='idle';
 useEffect(()=>{onBusyChange(busy);},[busy,onBusyChange]);
 function release(){stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(timer.current)clearInterval(timer.current);timer.current=null;}
 function cancel(){++sequence.current;request.current?.abort();request.current=null;if(recorder.current){recorder.current.onstop=null;recorder.current.ondataavailable=null;recorder.current.onerror=null;if(recorder.current.state!=='inactive')recorder.current.stop();recorder.current=null;}release();setPhase('idle');onBusyChange(false);}
 function close(){cancel();setOpen(false);setRecording(null);setResult('');setError('');setSeconds(0);}
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++sequence.current;request.current?.abort();if(recorder.current){recorder.current.onstop=null;recorder.current.ondataavailable=null;recorder.current.onerror=null;if(recorder.current.state!=='inactive')recorder.current.stop();}release();};},[]);
 useEffect(()=>{close();},[contextKey]);
 useEffect(()=>{if(!recording){setPreview('');return;}const url=URL.createObjectURL(recording.blob);setPreview(url);return()=>URL.revokeObjectURL(url);},[recording]);
 async function record(){
  if(disabled||busy)return;setError('');setResult('');setRecording(null);
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Microphone recording is unavailable here. Upload an audio file instead.');return;}
  const turn=++sequence.current;setPhase('requesting');onBusyChange(true);
  try{
   const tracks=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current||turn!==sequence.current){tracks.getTracks().forEach(t=>t.stop());return;}stream.current=tracks;
   const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(value=>MediaRecorder.isTypeSupported(value));
   const capture=new MediaRecorder(tracks,type?{mimeType:type}:undefined),chunks:Blob[]=[];let bytes=0;recorder.current=capture;started.current=performance.now();setSeconds(0);setPhase('recording');
   const current=()=>mounted.current&&turn===sequence.current&&recorder.current===capture;
   capture.ondataavailable=event=>{if(current()&&event.data.size){bytes+=event.data.size;chunks.push(event.data);if(bytes>VOICE_FILE_BYTES&&capture.state!=='inactive')capture.stop();}};
   capture.onerror=()=>{if(!current())return;cancel();setError('Recording stopped unexpectedly. Please try again or upload audio.');};
   capture.onstop=()=>{if(!current())return;const duration=Math.min(VOICE_SECONDS,(performance.now()-started.current)/1000);release();recorder.current=null;setPhase('idle');onBusyChange(false);if(bytes>VOICE_FILE_BYTES){setError('The recording exceeded 10 MB.');return;}setRecording({blob:new Blob(chunks,{type:capture.mimeType}),label:'Your recording',duration});};
   capture.start(250);timer.current=setInterval(()=>{const elapsed=(performance.now()-started.current)/1000;setSeconds(Math.min(VOICE_SECONDS,Math.floor(elapsed)));if(elapsed>=VOICE_SECONDS&&capture.state!=='inactive')capture.stop();},200);
  }catch{if(mounted.current&&turn===sequence.current){cancel();setError('Microphone access was not available. You can upload a recording instead.');}}
 }
 function upload(file?:File){if(!file||disabled||busy)return;setError('');setResult('');if(file.size>VOICE_FILE_BYTES||!file.size){setError('Choose an audio file smaller than 10 MB.');return;}setRecording({blob:file,label:file.name.slice(0,100)});}
 async function transcribe(){
  if(!recording||busy||disabled||request.current)return;const turn=++sequence.current,controller=new AbortController();request.current=controller;setPhase('transcribing');onBusyChange(true);setError('');setResult('');
  const timeout=setTimeout(()=>controller.abort(),75000);
  try{
   const wav=await prepareVoiceAudio(recording.blob,controller.signal,recording.duration);if(controller.signal.aborted||!mounted.current||turn!==sequence.current)return;const body=new FormData();body.append('audio',wav,'voice-note.wav');
   const response=await fetch('/api/transcribe',{method:'POST',body,signal:controller.signal,headers:{Accept:'application/json'}});const raw:unknown=await response.json();const payload=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
   if(!mounted.current||turn!==sequence.current)return;
   if(controller.signal.aborted)throw Error('Transcription stopped.');
   if(!response.ok)throw Error(typeof payload?.error==='string'?payload.error:'Transcription could not be completed.');
   if(payload?.kind!=='voice_transcript'||payload.model!=='muse-voice-transcribe-1.0'||payload.editable!==true||payload.autoSend!==false||payload.isEvidence!==false||typeof payload.transcript!=='string'||!payload.transcript.trim()||payload.transcript.length>4000)throw Error('No complete transcript was returned.');
   setResult(payload.transcript);
  }catch(e){if(mounted.current&&turn===sequence.current)setError(controller.signal.aborted?'Transcription stopped. Nothing was added to the conversation.':e instanceof Error?e.message:'Transcription could not be completed.');}
  finally{clearTimeout(timeout);if(mounted.current&&turn===sequence.current){request.current=null;setPhase('idle');onBusyChange(false);}}
 }
 return <div className="voice-note"><button type="button" className="map-chat-icon" aria-label="Voice note" aria-expanded={open} disabled={disabled} title="Voice note" onClick={()=>open?close():setOpen(true)}><Mic size={17}/></button>{open&&<section className="voice-note-panel" aria-label="Voice note" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
  <header><div><strong>Voice note</strong><span>Muse Voice · English & Korean</span></div><button type="button" className="map-chat-icon" aria-label="Close voice note" onClick={close}><X size={15}/></button></header>
  <p>Record a site observation or a question. Audio is sent to Meta only when you choose Transcribe. Review the text before adding it.</p>
  <input ref={fileInput} type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" hidden onChange={event=>{upload(event.target.files?.[0]);event.target.value='';}}/>
  <div className="voice-note-actions">{phase==='requesting'?<button type="button" onClick={cancel}><LoaderCircle className="voice-note-spin" size={13}/>Waiting for microphone… Cancel</button>:phase==='recording'?<button type="button" onClick={()=>recorder.current?.stop()}><Square size={13}/>Stop · {seconds}s</button>:<><button type="button" disabled={busy||disabled} onClick={()=>void record()}><Mic size={13}/>Record</button><button type="button" disabled={busy||disabled} onClick={()=>fileInput.current?.click()}><Upload size={13}/>Upload audio</button></>}<small>Up to 60 seconds</small></div>
  {recording&&<div className="voice-note-preview"><span>{recording.label}</span>{preview&&<audio controls src={preview} preload="metadata"/>}</div>}
  {error&&<p role="alert" className="voice-note-error">{error}</p>}
  {phase==='transcribing'?<button type="button" className="voice-note-primary" onClick={cancel}><LoaderCircle className="voice-note-spin" size={14}/>Transcribing… Stop</button>:recording&&!result&&<button type="button" className="voice-note-primary" disabled={disabled} onClick={()=>void transcribe()}>Transcribe with Meta</button>}
  {result&&<div className="voice-note-result"><label>Review transcript<textarea value={result} maxLength={4000} rows={4} onChange={event=>setResult(event.target.value)}/></label><small>Speech recognition can be wrong. Site observations remain unverified.</small>{result.trim().length>remainingCharacters&&<p role="alert" className="voice-note-error">Shorten the transcript or the current draft before adding it.</p>}<button type="button" className="voice-note-primary" disabled={disabled||!result.trim()||result.trim().length>remainingCharacters} onClick={()=>{onTranscript(result.trim());close();}}>Add to message</button></div>}
 </section>}</div>;
}

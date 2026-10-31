'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Expand,LoaderCircle,ScanLine,Square} from 'lucide-react';
import {validateTemporalPair} from '../lib/temporal-pair';
import type {TemporalImagery} from '../lib/temporal-imagery';
import type {DinoTemporalComparison} from '../lib/dino-temporal';
import './temporal-imagery-result.css';
export function parseTemporalImagery(value:unknown,outer?:unknown):TemporalImagery|null{
 try{
  validateTemporalPair(value);
  if(outer){const p=outer as Record<string,unknown>;if(!Array.isArray(p.evidence)||!p.evidence.some(e=>e&&typeof e==='object'&&(e as Record<string,unknown>).id===value.target.id))return null;
   if(!Array.isArray(p.citations)||!value.images.every(image=>(p.citations as Record<string,unknown>[]).some(c=>c.evidenceId===`temporal:${value.target.id}:${image.source.captureYear}`)))return null;
  }return value;
 }catch{return null;}
}
export default function TemporalImageryResult({value,active=true,onAsk}:{value:unknown;active?:boolean;onAsk?:(question:string)=>void}){
 const pair=parseTemporalImagery(value);
 return pair?<TemporalViewer pair={pair} active={active} onAsk={onAsk}/>:null;
}
function TemporalViewer({pair,active,onAsk}:{pair:TemporalImagery;active:boolean;onAsk?:(question:string)=>void}){
 const [split,setSplit]=useState(50),[showFeatures,setShowFeatures]=useState(false),[result,setResult]=useState<DinoTemporalComparison|null>(null),[phase,setPhase]=useState(''),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),request=useRef<AbortController|null>(null),sequence=useRef(0),mounted=useRef(true);const id=useId();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++sequence.current;request.current?.abort();};},[]);
 useEffect(()=>{if(!active){++sequence.current;request.current?.abort();request.current=null;setPhase('');}},[active]);
 async function run(){
  if(request.current||!active)return;const controller=new AbortController(),turn=++sequence.current;request.current=controller;setPhase('Preparing the image pair');setError('');
  try{const{compareTemporalImages}=await import('../lib/dino-temporal');if(controller.signal.aborted)return;const next=await compareTemporalImages(pair,{signal:controller.signal,onProgress:label=>{if(mounted.current&&turn===sequence.current)setPhase(label);}});if(mounted.current&&turn===sequence.current&&!controller.signal.aborted){setResult(next);setShowFeatures(true);}}
  catch(e){if(mounted.current&&turn===sequence.current)setError(controller.signal.aborted?'Stopped. No model result was accepted.':e instanceof Error?e.message:'The browser could not run the comparison.');}
  finally{if(mounted.current&&turn===sequence.current){request.current=null;setPhase('');}}
 }
 const paths=pair.target.footprintPixels.map(polygon=>polygon.map(ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join('')+'Z').join(''));
 function scene(large=false){return <><div className="temporal-scene">
  <img src={pair.images[1].image.dataUrl} width={768} height={768} alt={`Spring 2024 official aerial view of ${pair.target.address}`}/>
  <img className="temporal-before" style={{clipPath:`inset(0 ${100-split}% 0 0)`}} src={pair.images[0].image.dataUrl} width={768} height={768} alt={`Spring 2020 official aerial view of the same area`}/>
  <svg viewBox="0 0 768 768" aria-label="Current mapped footprint and optional visual-feature differences" role="img">{showFeatures&&result?.grid.values.map((v,i)=><rect key={i} x={(i%16)*48} y={Math.floor(i/16)*48} width={48} height={48} fill="#ff853c" opacity={Math.min(1,v/Math.max(.000001,result.grid.observedMaximum))*.78}><title>{`Image cell ${i+1}: feature dissimilarity ${v.toFixed(3)} of 2`}</title></rect>)}{paths.map((d,i)=><path key={i} d={d} fill="none" fillRule="evenodd" stroke="#d1ff78" strokeWidth="2" vectorEffect="non-scaling-stroke"/> )}</svg>
  <span className="temporal-date temporal-date-before">2020</span><span className="temporal-date temporal-date-after">2024</span><span className="temporal-divider" style={{left:`${split}%`}}/>
  <input aria-label={large?'Expanded historical image divider':'Historical image divider'} type="range" min={0} max={100} value={split} onChange={event=>setSplit(Number(event.target.value))}/>
 </div><div className="temporal-controls"><span>Drag to compare · current footprint in lime</span>{result&&<label><input type="checkbox" checked={showFeatures} onChange={event=>setShowFeatures(event.target.checked)}/>Feature differences</label>}</div>{showFeatures&&result&&<div className="temporal-legend"><span>0 · similar</span><i/><span>{result.grid.observedMaximum.toFixed(2)} · more different</span><small>Display scaled to this pair · not change probability</small></div>}</>;}
 return <section className="temporal-result" aria-label="Historical aerial comparison"><header><div><strong>A place through time</strong><span>{pair.target.address} · NYS aerial imagery</span></div><button type="button" aria-label="Expand historical aerial comparison" onClick={()=>dialog.current?.showModal()}><Expand size={15}/></button></header>
  {scene()}
  {!result&&<p>Let Meta DINOv2 highlight where the two images look different, then inspect those areas in the original photos.</p>}
  {phase?<button type="button" className="temporal-run" onClick={()=>request.current?.abort()}><LoaderCircle size={14} className="temporal-spin"/>{phase}… <Square size={12}/>Stop</button>:!result&&<button type="button" className="temporal-run" disabled={!active} onClick={()=>void run()}><ScanLine size={15}/>Run DINOv2 visual comparison</button>}
  {!result&&!phase&&<small>Runs in this browser. First use downloads about 33 MB of model and runtime files.</small>}
  {error&&<p role="alert" className="temporal-error">{error}</p>}
  {result&&<div className="temporal-finding"><strong>Meta DINOv2 · completed locally</strong><p>Inspect the highlighted windows in both photographs. Lighting, shadows, vegetation and survey alignment can also explain differences.</p><p><b>Next check:</b> Request dated roof and equipment plans, then confirm relevant differences during a current site visit before changing an adaptation assumption.</p>{onAsk&&<button type="button" className="temporal-followup" disabled={!active} onClick={()=>onAsk(`For ${pair.target.address}, use current public records to help me prepare the next site visit for climate-resilience due diligence. We compared historical 2020 and 2024 imagery; visual-feature differences remain unverified. Which owner records and site checks could change the adaptation decision?`)}>Prepare my site-visit question →</button>}<small>16 × 16 contextual feature grid · about {result.grid.cellApproximateGroundM.toFixed(1)} m per cell · {(result.elapsedMs/1000).toFixed(1)} s</small></div>}
  <details><summary>Sources & method</summary><p>Historical images, not a live view. Shared geographic bounds do not verify pixel-perfect alignment.</p>{pair.images.map(image=><a key={image.source.captureYear} href={image.source.metadataUrl} target="_blank" rel="noreferrer">NYS {image.source.captureYear} orthoimagery · Spring {image.source.captureYear}</a>)}<p>Crop width: approximately {pair.bounds.approximateGroundWidthM.toFixed(0)} m. Both original exports are 768 × 768 pixels.</p>{result&&<><a href={result.model.sourceUrl} target="_blank" rel="noreferrer">Meta DINOv2 · ViT-S/14 with registers</a><p>Pretrained visual features, {result.model.quantization}. Each crop is resized to 224 × 224 for inference. Metric: 1 − cosine similarity. No change classifier or calibrated confidence is used.</p><p className="temporal-hash">Model SHA-256: {result.model.sha256}</p></>}{pair.limitations.map(line=><p key={line}>{line}</p>)}</details>
  <dialog ref={dialog} className="temporal-dialog" aria-labelledby={`${id}-title`} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}><header><div><strong id={`${id}-title`}>{pair.target.address}</strong><span>Official Spring 2020 / Spring 2024 aerial imagery</span></div><button type="button" onClick={()=>dialog.current?.close()}>Close</button></header>{scene(true)}<p>Image differences are inspection prompts, not verified physical changes or roof condition.</p></dialog>
 </section>;
}

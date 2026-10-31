'use client';
import {useMemo,useState} from 'react';
import SiteImageryEvidence,{parseSiteImagery} from './site-imagery-evidence';
import type {VisualComparisonResult as Comparison,TreeContext} from '../lib/visual-comparison';
import './visual-comparison-result.css';

type Obj=Record<string,unknown>;
const object=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=1200):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const native=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,9}$/.test(v);
const strings=(v:unknown,max:number,length=1200):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(s=>text(s,length));
function safeUrl(v:unknown):string|null{if(typeof v!=='string'||v.length>2000)return null;try{const url=new URL(v);return url.protocol==='https:'&&!url.username&&!url.password?url.toString():null;}catch{return null;}}
function parseTree(value:unknown):TreeContext|null{
 if(!object(value)||!['available','not_detected','unavailable','resolution_limited'].includes(String(value.status))||value.method!=='cell-center even-odd raster and Euclidean cell-center distance'||value.gridWidth!==256||value.gridHeight!==256||value.bandM!==10||!text(value.interpretation,1600)||!strings(value.limitations,8,1600))return null;
 if(value.approximateCellSizeM!==null&&(!finite(value.approximateCellSizeM)||value.approximateCellSizeM<=0||value.approximateCellSizeM>4))return null;
 if(value.status==='available'){
  if(!finite(value.approximateCellSizeM)||value.approximateCellSizeM>2||!Number.isInteger(value.sampledBandCells)||Number(value.sampledBandCells)<1||Number(value.sampledBandCells)>65536||!Number.isInteger(value.treeMaskCellsInBand)||Number(value.treeMaskCellsInBand)<0||Number(value.treeMaskCellsInBand)>Number(value.sampledBandCells)||!finite(value.detectedMaskCoveragePct)||value.detectedMaskCoveragePct!==Math.round(Number(value.treeMaskCellsInBand)/Number(value.sampledBandCells)*1000)/10)return null;
 }else if(value.sampledBandCells!==null||value.treeMaskCellsInBand!==null||value.detectedMaskCoveragePct!==null||value.status==='resolution_limited'&&(!finite(value.approximateCellSizeM)||value.approximateCellSizeM<=2))return null;
 return value as TreeContext;
}
/** The optional outer chat envelope binds this card to the server-resolved
 * selection and citations. Images reuse the strict existing mask validator. */
export function parseVisualComparison(value:unknown,outerPayload?:unknown):Comparison|null{
 if(!object(value)||value.kind!=='visual_comparison'||!['completed','partial','unavailable'].includes(String(value.status))||!Array.isArray(value.buildingIds)||value.buildingIds.length!==2||!value.buildingIds.every(native)||new Set(value.buildingIds).size!==2||!Array.isArray(value.sites)||value.sites.length!==2||!Array.isArray(value.visualEvidence)||value.visualEvidence.length>2||!Array.isArray(value.citations)||value.citations.length<1||value.citations.length>72||!text(value.answer,12000)||!text(value.groundingNote,2000)||!text(value.createdAt,80)||!Number.isFinite(Date.parse(value.createdAt))||!['completed','skipped_incomplete_images','content_filtered','unavailable'].includes(String(value.reviewStatus))||value.reviewErrorCode!==null&&!text(value.reviewErrorCode,80))return null;
 const ids=value.buildingIds as string[],refs=new Set<string>();let bytes=0;
 for(const c of value.citations){
  if(!object(c)||!text(c.evidenceId,180)||refs.has(c.evidenceId)||!object(c.source)||!text(c.source.label,200)||!text(c.measurement,100)||!text(c.scope,100)||!text(c.unit,100)||c.source.url!==undefined&&!safeUrl(c.source.url))return null;
  try{bytes+=JSON.stringify(c).length;if(bytes>96000)return null;}catch{return null;}refs.add(c.evidenceId);
 }
 if(outerPayload!==undefined){
  if(!object(outerPayload)||!Array.isArray(outerPayload.evidence)||!Array.isArray(outerPayload.citations))return null;
  const outerIds=new Set(outerPayload.evidence.filter(object).map(e=>e.id)),outerRefs=new Set(outerPayload.citations.filter(object).map(c=>c.evidenceId));
  if(ids.some(id=>!outerIds.has(id))||[...refs].some(id=>!outerRefs.has(id)))return null;
 }
 const images=new Map<string,ReturnType<typeof parseSiteImagery>>();
 for(const raw of value.visualEvidence){
  const parsed=parseSiteImagery(raw);
  if(!parsed||!ids.includes(parsed.buildingId)||images.has(parsed.buildingId)||parsed.concepts.length!==2||parsed.image.width!==768||parsed.image.height!==768||!object(raw)||!object(raw.source)||raw.source.url!=='https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer'||raw.source.captureYear!==2024||typeof raw.source.imageSha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.source.imageSha256)||parsed.id!==`sam31:${parsed.buildingId}:${raw.source.imageSha256}`||raw.crosscheck!==undefined&&!parsed.crosscheck)return null;
  images.set(parsed.buildingId,parsed);
 }
 for(let i=0;i<value.sites.length;i++){
  const s=value.sites[i];if(!object(s)||s.buildingId!==ids[i]||!text(s.address,300)||!['completed','partial','unavailable'].includes(String(s.status))||!text(s.note,1600)||s.errorCode!==null&&!text(s.errorCode,80))return null;
  const visual=images.get(ids[i]);
  if(!visual){if(s.status!=='unavailable'||s.visualEvidenceId!==null||s.treeContext!==null||s.errorCode===null)return null;continue;}
  if(s.visualEvidenceId!==visual.id||s.address!==visual.address||s.status!==visual.analysis.status||s.status==='completed'&&s.errorCode!==null||s.status!=='completed'&&s.errorCode===null)return null;
  const tree=parseTree(s.treeContext);if(!tree)return null;
  const concept=visual.concepts.find(c=>c.concept==='trees')!;
  if(tree.status==='available'&&concept.status!=='detected'||tree.status==='not_detected'&&concept.status!=='not_detected'||concept.status==='error'&&tree.status!=='unavailable')return null;
  const citation=value.citations.find(c=>object(c)&&c.evidenceId===`${visual.id}:tree_context`);
  if(!object(citation)||citation.measurement!=='sampled_tree_mask_context'||JSON.stringify(citation.value)!==JSON.stringify(s.treeContext)||!refs.has(`${visual.id}:roof`)||!refs.has(`${visual.id}:map_identity`)||!refs.has(visual.id))return null;
 }
 const validRefs=(v:unknown)=>strings(v,8,180)&&v.length>=1&&new Set(v).size===v.length&&v.every(id=>refs.has(id));
 const completeImages=images.size===2&&value.sites.every(s=>object(s)&&s.status==='completed');
 if(value.review===null){
  if((value.reviewStatus==='content_filtered'||value.reviewStatus==='unavailable')&&!completeImages)return null;
  if(value.status===(images.size?'partial':'unavailable')&&value.reviewStatus!=='completed'&&(value.reviewStatus==='skipped_incomplete_images'?value.reviewErrorCode===null:value.reviewErrorCode!==null))return value as unknown as Comparison;
  return null;
 }
 const r=value.review;
 if(value.status!=='completed'||value.reviewStatus!=='completed'||value.reviewErrorCode!==null||images.size!==2||value.sites.some(s=>!object(s)||s.status!=='completed')||!object(r)||r.model!=='muse-wonder-1.0'||r.sawPixels!==false||r.grounded!==false||r.modelGenerated!==true||!Array.isArray(r.lenses)||r.lenses.length!==3||!Array.isArray(r.nextSurveyTargets)||r.nextSurveyTargets.length<2||r.nextSurveyTargets.length>3)return null;
 const lenses=['roof','trees','map_identity'];
 for(let i=0;i<3;i++){
  const row=r.lenses[i];if(!object(row)||row.lens!==lenses[i]||!text(row.whatPicturesAdd,600)||!text(row.whatStillUnknown,600)||!validRefs(row.evidenceIds))return null;
  const measurement=i===0?'sam_roof_detection':i===1?'sampled_tree_mask_context':'map_image_representation';
  if(!(row.evidenceIds as string[]).some(id=>(value.citations as unknown[]).some(c=>object(c)&&c.evidenceId===id&&c.measurement===measurement)))return null;
 }
 const checkIds=new Set<string>();
 for(const c of r.nextSurveyTargets){
  if(!object(c)||!text(c.checkId,100)||!['verify_roof_and_equipment','verify_tree_context','reconcile_map_and_image'].includes(c.checkId)||checkIds.has(c.checkId)||!text(c.title,160)||!text(c.action)||!text(c.whatCouldChange)||!text(c.reason,400)||!Array.isArray(c.buildingIds)||c.buildingIds.length!==2||c.buildingIds.some((id,i)=>id!==ids[i])||!validRefs(c.evidenceIds))return null;checkIds.add(c.checkId);
 }
 return value as unknown as Comparison;
}
const lensName={roof:'Roof evidence',trees:'Tree context',map_identity:'Map and image'};
function metric(tree:TreeContext|null):string{
 if(tree?.status==='available')return`≈ ${tree.detectedMaskCoveragePct}% tree-mask overlap`;
 return tree?.status==='not_detected'?'No tree detection · unknown':tree?.status==='resolution_limited'?'Band too coarse · unknown':'Tree context unavailable';
}
export default function VisualComparisonResult({value}:{value:unknown}){
 const result=useMemo(()=>parseVisualComparison(value),[value]),[activeId,setActiveId]=useState<string|null>(null);
 if(!result)return null;
 const active=result.sites.find(s=>s.buildingId===activeId)||result.sites[0],visual=result.visualEvidence.find(v=>v.buildingId===active.buildingId),review=result.review;
 return <section className="visual-comparison-result" aria-label="Paired aerial evidence">
  <header><strong>What the aerial images add</strong><span>SAM 3.1 · {review?'Muse Wonder summary review':'Review incomplete'}</span></header>
  <div className="vcr-sites" role="group" aria-label="Choose aerial image">
   {result.sites.map((site,i)=>{const image=result.visualEvidence.find(v=>v.buildingId===site.buildingId);return <button key={site.buildingId} type="button" aria-pressed={site.buildingId===active.buildingId} onClick={()=>setActiveId(site.buildingId)}><span className={`vcr-letter vcr-letter-${i}`}>{i?'B':'A'}</span>{image?<img src={image.image.dataUrl} alt="" width={64} height={64}/>:<span className="vcr-no-image">Image unavailable</span>}<span className="vcr-site-text"><strong>{site.address}</strong><span>{metric(site.treeContext)}</span></span></button>;})}
  </div>
  <p className="vcr-scope">Approximate overlap of detected tree masks in a 10 m band outside each mapped footprint. Not shade, cooling benefit or a resilience score.</p>
  {visual?<SiteImageryEvidence key={visual.id} value={visual}/>:<p className="vcr-status" role="status">{active.note}</p>}
  {!review&&<p className="vcr-status" role="status">{result.reviewStatus==='content_filtered'?'Muse Wonder declined the planned review. No alternative model or retry was used.':result.reviewStatus==='skipped_incomplete_images'?'Both image analyses must complete before the planned Wonder review. Available images and detections are retained.':'The planned Wonder review was unavailable. Actual images and detections are retained.'}</p>}
  {review&&<details className="vcr-review"><summary>What to verify next <span>Wonder · summary-based interpretation</span></summary>
   {review.nextSurveyTargets.map((check,i)=><div className="vcr-check" key={check.checkId}><strong>{i+1}. {check.title}</strong><p>{check.action}</p><p className="vcr-muted">{check.reason} {check.whatCouldChange}</p></div>)}
   <div className="vcr-lenses">{review.lenses.map(lens=><div key={lens.lens}><strong>{lensName[lens.lens]}</strong><p>{lens.whatPicturesAdd}</p><p className="vcr-muted">{lens.whatStillUnknown}</p></div>)}</div>
   <p className="vcr-muted">Muse Wonder received typed summaries, not image pixels. These are inspection questions, not verified condition or suitability.</p>
  </details>}
  <details className="vcr-sources"><summary>Sources and calculation</summary>
   <p>{result.groundingNote}</p>
   {result.sites.map(site=><div key={site.buildingId}><strong>{site.address}</strong>{site.treeContext&&<><p>{site.treeContext.interpretation}</p><p>256 × 256 grid · approximate cell size {site.treeContext.approximateCellSizeM===null?'unknown':`${site.treeContext.approximateCellSizeM.toLocaleString('en-US',{maximumFractionDigits:2})} m`}</p>{site.treeContext.limitations.map((line,i)=><p key={i}>{line}</p>)}</>}</div>)}
   {result.citations.filter(c=>c.measurement==='source_aerial_image').map(c=><p key={c.evidenceId}>{safeUrl(c.source.url)?<a href={safeUrl(c.source.url)!} target="_blank" rel="noopener noreferrer">{c.source.label}</a>:c.source.label} · {String(c.source.version||'Dated source image')} · DOITT {String(c.source.recordId)}</p>)}
   <p>Review created {result.createdAt}</p>
  </details>
 </section>;
}

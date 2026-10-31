'use client';
import {useId,useMemo,useRef,useState} from 'react';
import {Maximize2,X} from 'lucide-react';
import './site-imagery-evidence.css';

type Obj=Record<string,unknown>;
type Concept={concept:'roof'|'trees';status:'detected'|'not_detected'|'error';objectCount:number;paths:string[];note:string};
type Crosscheck={kind:'imagery_crosscheck';status:'compared'|'no_intersecting_roof'|'unavailable';grid:{width:number;height:number;sourceWidth:number;sourceHeight:number;cellWidthPx:number;cellHeightPx:number;method:string};footprintCoveredByRoofPct:number|null;counts:{targetCells:number;overlapCells:number;mapOnlyCells:number;roofOnlyCells:number;inputRoofObjects:number;intersectingRoofObjects:number;includedRoofComponents:number;excludedRoofComponents:number};regions:{mapOnlyPaths:string[];roofOnlyPaths:string[];overlapPaths:string[]};interpretation:string;limitations:string[];reason:string};
export type SiteImageryView={
 kind:'site_imagery';id:string;buildingId:string;address:string;
 source:{label:string;url:string;captureYear:number;capturedBetween?:string;capturePeriod?:string;retrievedAt:string};
 image:{dataUrl:string;width:number;height:number;bounds:[number,number,number,number]};
 footprint:{paths:string[];note:string};
 analysis:{model:'sam-3.1';status:'completed'|'partial'|'unavailable';note:string};
 concepts:Concept[];limitations:string[];crosscheck?:Crosscheck;
};
const object=(v:unknown):Obj|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Obj:null;
const short=(v:unknown,max=1200):v is string=>typeof v==='string'&&v.length<=max;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const MAX_CONCEPT_PATH_CHARS=500_000,MAX_FOOTPRINT_PATH_CHARS=20_000,MAX_IMAGE_PATH_CHARS=1_020_000;
/** Only absolute source-pixel paths from the server's decoder are accepted. */
export function validImageryPath(value:unknown,width:number,height:number):value is string{
 if(typeof value!=='string'||!value.length||value.length>MAX_CONCEPT_PATH_CHARS||!/^[\s,MLZ+\-\d.eE]+$/.test(value))return false;
 const tokens=value.match(/[MLZ]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g);
 if(!tokens||tokens[0]!=='M'||value.replace(/[MLZ]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g,'').replace(/[\s,]/g,''))return false;
 let command='',coords=0,subpathOpen=false;
 for(const token of tokens){
  if(token==='M'||token==='L'||token==='Z'){
   if(command&&command!=='Z'&&(coords<2||coords%2!==0))return false;
   if(token==='L'&&!subpathOpen||token==='Z'&&!subpathOpen)return false;
   if(token==='M')subpathOpen=true;
   if(token==='Z')subpathOpen=false;
   command=token;coords=0;
  }else{
   if(!command||command==='Z')return false;
   const n=Number(token),max=coords%2===0?width:height;
   if(!Number.isFinite(n)||n<0||n>max)return false;
   coords++;
  }
 }
 return command==='Z';
}
export function parseImageryCrosscheck(value:unknown,width:number,height:number):Crosscheck|null{
 const p=object(value),grid=object(p?.grid),counts=object(p?.counts),regions=object(p?.regions);
 if(!p||p.kind!=='imagery_crosscheck'||!['compared','no_intersecting_roof','unavailable'].includes(String(p.status))||!grid||!counts||!regions||!short(p.interpretation,2000)||!short(p.reason)||!Array.isArray(p.limitations)||p.limitations.length>12||p.limitations.some(v=>!short(v)))return null;
 if(grid.width!==256||grid.height!==256||grid.sourceWidth!==width||grid.sourceHeight!==height||grid.cellWidthPx!==width/256||grid.cellHeightPx!==height/256||grid.method!=='cell-center even-odd raster')return null;
 const keys=['targetCells','overlapCells','mapOnlyCells','roofOnlyCells','inputRoofObjects','intersectingRoofObjects','includedRoofComponents','excludedRoofComponents'];
 if(keys.some(key=>!Number.isInteger(counts[key])||Number(counts[key])<0||Number(counts[key])>1_000_000))return null;
 let chars=0;
 for(const key of ['mapOnlyPaths','roofOnlyPaths','overlapPaths']){
  const paths=regions[key];if(!Array.isArray(paths)||paths.length>2048||paths.some(path=>{if(!validImageryPath(path,width,height))return true;chars+=path.length;return chars>200_000;}))return null;
 }
 if(p.status==='unavailable')return p.footprintCoveredByRoofPct===null&&Object.values(regions).every(paths=>Array.isArray(paths)&&paths.length===0)?p as unknown as Crosscheck:null;
 const n=counts as Crosscheck['counts'];
 if(n.targetCells<=0||n.targetCells>65536||n.overlapCells>n.targetCells||n.mapOnlyCells!==n.targetCells-n.overlapCells||n.roofOnlyCells+n.overlapCells>65536||n.inputRoofObjects>64||n.intersectingRoofObjects>n.inputRoofObjects||!finite(p.footprintCoveredByRoofPct)||p.footprintCoveredByRoofPct!==Math.round(n.overlapCells/n.targetCells*1000)/10)return null;
 if(p.status==='compared'&&(n.overlapCells===0||n.includedRoofComponents===0||n.intersectingRoofObjects===0)||p.status==='no_intersecting_roof'&&(n.overlapCells!==0||n.roofOnlyCells!==0||n.includedRoofComponents!==0||n.intersectingRoofObjects!==0))return null;
 for(const [key,count] of [['mapOnlyPaths',n.mapOnlyCells],['roofOnlyPaths',n.roofOnlyCells],['overlapPaths',n.overlapCells]] as const)if((regions[key] as string[]).length===0?count!==0:count===0)return null;
 return p as unknown as Crosscheck;
}
export function parseSiteImagery(value:unknown):SiteImageryView|null{
 const p=object(value),source=object(p?.source),image=object(p?.image),footprint=object(p?.footprint),analysis=object(p?.analysis);
 if(!p||p.kind!=='site_imagery'||!short(p.id,160)||!p.id||!short(p.buildingId,20)||!/^[1-9]\d{0,9}$/.test(p.buildingId)||!short(p.address,240)||!source||!image||!footprint||!analysis)return null;
 if(!short(source.label,200)||!short(source.url,2000)||!Number.isInteger(source.captureYear)||Number(source.captureYear)<2000||Number(source.captureYear)>2100||!short(source.retrievedAt,80)||!Number.isFinite(Date.parse(source.retrievedAt))||source.capturedBetween!==undefined&&!short(source.capturedBetween,160)||source.capturePeriod!==undefined&&!short(source.capturePeriod,160))return null;
 if(!Number.isInteger(image.width)||!Number.isInteger(image.height)||Number(image.width)<128||Number(image.height)<128||Number(image.width)>1024||Number(image.height)>1024||typeof image.dataUrl!=='string'||image.dataUrl.length>3_000_000||!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl))return null;
 const bounds=image.bounds;if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(finite)||bounds[0]>=bounds[2]||bounds[1]>=bounds[3]||bounds[0]<-74.5||bounds[2]>-73.5||bounds[1]<40.3||bounds[3]>41.1)return null;
 if(analysis.model!=='sam-3.1'||!['completed','partial','unavailable'].includes(String(analysis.status))||!short(analysis.note)||!short(footprint.note)||!Array.isArray(footprint.paths)||footprint.paths.length>256||!Array.isArray(p.concepts)||p.concepts.length<1||p.concepts.length>2||!Array.isArray(p.limitations)||p.limitations.length>12||p.limitations.some(v=>!short(v)))return null;
 const width=Number(image.width),height=Number(image.height),concepts:Concept[]=[],seen=new Set<string>();let chars=0,masks=0;
 const pathsValid=(paths:unknown[])=>paths.every(path=>{if(!validImageryPath(path,width,height))return false;chars+=path.length;return chars<=MAX_IMAGE_PATH_CHARS;});
 if(!pathsValid(footprint.paths)||chars>MAX_FOOTPRINT_PATH_CHARS)return null;
 for(const value of p.concepts){
  const before=chars;
  const c=object(value);if(!c||!['roof','trees'].includes(String(c.concept))||seen.has(String(c.concept))||!['detected','not_detected','error'].includes(String(c.status))||!Number.isInteger(c.objectCount)||Number(c.objectCount)<0||Number(c.objectCount)>64||!Array.isArray(c.paths)||!short(c.note)||!pathsValid(c.paths))return null;
  if(chars-before>MAX_CONCEPT_PATH_CHARS)return null;
  masks+=Number(c.objectCount);if(masks>64||c.status==='detected'&&(Number(c.objectCount)<1||c.paths.length!==c.objectCount)||c.status!=='detected'&&(c.objectCount!==0||c.paths.length!==0))return null;
  seen.add(String(c.concept));concepts.push(c as Concept);
 }
 const errors=concepts.filter(c=>c.status==='error').length;
 if(analysis.status==='completed'&&errors!==0||analysis.status==='partial'&&(errors===0||errors===concepts.length)||analysis.status==='unavailable'&&errors!==concepts.length)return null;
 return{...p,source,image,footprint,analysis,concepts,crosscheck:parseImageryCrosscheck(p.crosscheck,width,height)??undefined} as SiteImageryView;
}
function sourceLink(url:string):string|null{
 return ['https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer','https://gis.ny.gov/2024-orthoimagery'].includes(url)?url:null;
}
const colors={roof:'#f4ad8f',trees:'#bbf56d'};
const names={roof:'Roofs',trees:'Trees'};
/** Render only a source image and the masks returned for that exact image. */
export default function SiteImageryEvidence({value}:{value:unknown}){
 const data=useMemo(()=>parseSiteImagery(value),[value]),labelId=useId(),dialog=useRef<HTMLDialogElement>(null);
 const [shown,setShown]=useState({roof:true,trees:true}),[opacity,setOpacity]=useState(.48),[imageFailed,setImageFailed]=useState(false),[mode,setMode]=useState<'detections'|'compare'>('detections');
 if(!data)return null;
 const detected=data.concepts.filter(c=>c.status==='detected'),href=sourceLink(data.source.url),crosscheck=data.crosscheck&&data.crosscheck.status!=='unavailable'?data.crosscheck:null,compare=mode==='compare'&&!!crosscheck;
 const viewSwitch=crosscheck&&!imageFailed?<div className="sie-view" aria-label="Image view"><button type="button" aria-pressed={!compare} onClick={()=>setMode('detections')}>Detections</button><button type="button" aria-pressed={compare} onClick={()=>setMode('compare')}>Compare with map</button></div>:null;
 const comparisonSummary=compare&&crosscheck?<div className="sie-comparison"><p><strong>{crosscheck.footprintCoveredByRoofPct?.toLocaleString('en-US',{maximumFractionDigits:1})}%</strong> of the mapped footprint overlaps a roof mask.</p><p>{crosscheck.status==='no_intersecting_roof'?crosscheck.interpretation:'Only roof-mask components touching this outline are included.'}</p><small>Approximate grid overlap, not accuracy or roof condition. This does not assess resilience or investment suitability.</small></div>:null;
 const picture=(expanded=false)=><div className="sie-picture" style={{aspectRatio:`${data.image.width} / ${data.image.height}`}}>
  <img src={data.image.dataUrl} width={data.image.width} height={data.image.height} alt={`Aerial image of ${data.address}, captured in ${data.source.captureYear}`} onError={()=>setImageFailed(true)} onLoad={event=>{if(event.currentTarget.naturalWidth!==data.image.width||event.currentTarget.naturalHeight!==data.image.height)setImageFailed(true);}}/>
  {!imageFailed&&<svg viewBox={`0 0 ${data.image.width} ${data.image.height}`} aria-hidden="true" className="sie-masks">{compare&&crosscheck?<><g fill="#efb85e" fillOpacity={opacity} data-overlay="map-only">{crosscheck.regions.mapOnlyPaths.map((path,i)=><path key={i} d={path} fillRule="evenodd"/>)}</g><g fill="#65dfeb" fillOpacity={opacity} data-overlay="roof-only">{crosscheck.regions.roofOnlyPaths.map((path,i)=><path key={i} d={path} fillRule="evenodd"/>)}</g></>:detected.filter(c=>shown[c.concept]).map(c=><g key={c.concept} fill={colors[c.concept]} fillOpacity={opacity} stroke={colors[c.concept]} strokeWidth={1.2} strokeOpacity={opacity}>{c.paths.map((path,i)=><path key={i} d={path} fillRule="evenodd"/>)}</g>)}<g fill="none" stroke="#14222d" strokeWidth={5.5}>{data.footprint.paths.map((path,i)=><path key={i} d={path}/>)}</g><g fill="none" stroke="#fff" strokeWidth={2.5} strokeDasharray="7 5">{data.footprint.paths.map((path,i)=><path key={i} d={path}/>)}</g></svg>}
  <span className="sie-north" aria-label="North is up">N ↑</span>
  {!expanded&&!imageFailed&&<button type="button" className="sie-expand" aria-label={`Enlarge aerial image of ${data.address}`} onClick={()=>dialog.current?.showModal()}><Maximize2 size={16} aria-hidden="true"/></button>}
 </div>;
 const controls=<div className="sie-controls">{compare?<><span className="sie-region-label"><i style={{background:'#efb85e'}}/>Map only</span><span className="sie-region-label"><i style={{background:'#65dfeb'}}/>Roof detection only</span></>:data.concepts.map(c=>c.status==='detected'?<button key={c.concept} type="button" aria-pressed={shown[c.concept]} onClick={()=>setShown(previous=>({...previous,[c.concept]:!previous[c.concept]}))}><i style={{background:colors[c.concept]}}/>{names[c.concept]}</button>:<span key={c.concept} className="sie-missing">{c.status==='error'?`${names[c.concept]} unavailable`:`No ${c.concept==='roof'?'roof':'tree'} detections`}</span>)}{(detected.length>0||compare)&&<label>Opacity<input aria-label="AI mask opacity" type="range" min="0" max="0.8" step="0.05" value={opacity} onChange={event=>setOpacity(Number(event.target.value))}/></label>}</div>;
 return <figure className="site-imagery-evidence" aria-labelledby={labelId}>
  <figcaption id={labelId}><strong>{data.address}</strong><span>AI {data.concepts.length===2?'roof & tree':data.concepts[0].concept==='roof'?'roof':'tree'} analysis · SAM 3.1</span></figcaption>
  {viewSwitch}
  {imageFailed?<p className="sie-error" role="status">The aerial image could not be displayed. Its masks are hidden.</p>:picture()}
  {!imageFailed&&controls}
  {!imageFailed&&comparisonSummary}
  <p className="sie-capture">{href?<a href={href} target="_blank" rel="noreferrer noopener">{data.source.label}</a>:data.source.label} · {data.source.capturedBetween||data.source.capturePeriod||data.source.captureYear}</p>
  <p className="sie-note">Detections cover the whole image, including nearby properties.</p>
  <p className="sie-note">{data.analysis.note}</p>
  {data.footprint.paths.length>0&&<p className="sie-footprint"><span/> Dashed white: selected building’s official footprint.</p>}
  {data.limitations.length>0&&<details className="sie-limits"><summary>Image scope</summary>{compare&&<p>{crosscheck?.interpretation}</p>}<ul>{[...data.limitations,...(compare?crosscheck?.limitations??[]:[])].map((line,i)=><li key={i}>{line}</li>)}</ul><p>Retrieved {data.source.retrievedAt}</p>{data.footprint.note&&<p>{data.footprint.note}</p>}{data.concepts.filter(c=>c.note).map(c=><p key={c.concept}>{names[c.concept]}: {c.note}</p>)}</details>}
  <dialog ref={dialog} className="sie-dialog" aria-label={`Aerial image of ${data.address}`}><div className="sie-dialog-header"><strong>{data.address} · {data.source.captureYear}</strong><button type="button" aria-label="Close enlarged aerial image" onClick={()=>dialog.current?.close()}><X size={20}/></button></div>{viewSwitch}{!imageFailed&&picture(true)}{!imageFailed&&controls}{!imageFailed&&comparisonSummary}<p className="sie-note">AI detections in the captured image. {data.analysis.note}</p></dialog>
 </figure>;
}

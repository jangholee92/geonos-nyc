'use client';
import {useRef,type ReactNode} from 'react';
import {ArrowRight,ArrowUpRight,BookOpen,CheckCircle2,ChevronDown,ClipboardCheck,HelpCircle,Layers3,Search,Thermometer,TriangleAlert,Zap} from 'lucide-react';
import {EnergyQualityNotice,EnergyQualityDetails} from './energy-source-qualifications';
import './meta-investigation-result.css';
import {parseVisualComparison} from './visual-comparison-result';
import {parseTemporalImagery} from './temporal-imagery-result';

type ObjectValue=Record<string,unknown>;
type ResultKind='energy_scope'|'climate_observed'|'climate_projected'|'climate_hourly'|'decision'|'clarification'|'conversation'|'resilience_brief';
export type MetaResultView={kind:ResultKind;answer:string;model:string;data:ObjectValue;payload:ObjectValue};
export type MetaInvestigationResultProps={payload:unknown;onClarificationChoice?:(choice:string)=>void};
const object=(value:unknown):ObjectValue|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as ObjectValue:null;
const text=(value:unknown,fallback='',max=8000):string=>typeof value==='string'?value.slice(0,max):fallback;
const items=(value:unknown,max=100):unknown[]=>Array.isArray(value)?value.slice(0,max):[];
const objects=(value:unknown,max=100)=>items(value,max).map(object).filter((value):value is ObjectValue=>value!==null);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const number=(value:unknown,digits=2)=>finite(value)?value.toLocaleString('en-US',{maximumFractionDigits:digits}):'Unknown';
const utc=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'UTC'}).format(new Date(value))+' UTC':'Timestamp unreported';
const yearLabel=(value:unknown)=>finite(value)&&Number.isInteger(value)?String(value):'Unknown';
const words=(value:unknown)=>text(value).replaceAll('_',' ');
const unknownLabels:Record<string,string>={building_cooling_capacity_kw:'Cooling capacity',available_electrical_capacity_kw:'Available electrical capacity',indoor_conditions:'Indoor conditions',utility_bill:'Utility cost',building_efficiency:'Building efficiency',meter_allocation:'Metering and allocation'};
const metricLabels:Record<string,string>={hottest_pair:'Highest retained air-temperature pair',highest_dew_point_pair:'Highest retained dew-point pair',tmean_c:'Period mean temperature',hot_days_32_2c:'Mean annual hot-day count',precip_mm:'Mean annual precipitation',rx1day_mm:'Mean annual maximum daily precipitation',cooling_degree_days_18c:'Mean annual cooling degree days · 18°C base',heating_degree_days_18c:'Mean annual heating degree days · 18°C base',temperature_change_c:'Annual temperature change',precipitation_change_pct:'Annual precipitation change',hot_days_ge90f_per_year:'Days with maximum temperature ≥90°F',heatwaves_per_year:'Heatwaves · at least 3 consecutive days ≥90°F',rain_days_ge2inch_per_year:'Days with precipitation ≥2 inches'};
const conditionLabels:Record<string,string>={footprint_area_sqft:'Mapped footprint area',lot_building_area_sqft:'All floor area on the tax lot',lot_area_sqft:'Tax-lot area',roof_height_ft:'Recorded roof height',zoning:'Recorded zoning district',truck_route_distance_m:'Reference-point distance to a truck route',usable_area_sqft:'Usable indoor area',clear_height_ft:'Interior clear height',electrical_capacity_kw:'Available electrical capacity',floor_load_psf:'Documented floor loading',loading_docks:'Usable loading docks',delivery_access_confirmed:'Delivery access confirmed',available_for_use:'Available for the proposed activity',use_permission:'Use permission',site_eui:'Reporting-property site EUI',source_eui:'Reporting-property source EUI',stormwater_footprint_intersection:'Stormwater-map / footprint intersection',stormwater_footprint_overlap_pct:'Stormwater-map / footprint overlap'};
const scopeLabels:Record<string,string>={reference_station:'Reference station',NYC_region:'NYC region',building:'Individual building',building_footprint:'Mapped footprint',parcel:'Entire tax lot',operational:'Proposed operation',representative_point:'Reference point',benchmark_property:'Reporting property'};
const statusLabels:Record<string,string>={matches:'Stated conditions match',conditional:'Needs evidence',conflicts:'A condition conflicts',not_assessed:'Not assessed',supported:'Supported',conflicting:'Conflicts',unknown:'Unknown'};
const label=(value:unknown,labels:Record<string,string>,fallback='Unreported')=>typeof value==='string'&&Object.prototype.hasOwnProperty.call(labels,value)?labels[value]:words(value)||fallback;

const boundedText=(v:unknown,max=1200):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const nativeIds=(v:unknown):v is string[]=>Array.isArray(v)&&v.length===2&&new Set(v).size===2&&v.every(id=>typeof id==='string'&&/^[1-9]\d{0,9}$/.test(id));
function attachedReferences(payload:ObjectValue,refs:unknown,max=64):refs is string[]{
 const ids=new Set(objects(payload.citations,512).map(c=>c.evidenceId));
 return Array.isArray(refs)&&refs.length<=max&&new Set(refs).size===refs.length&&refs.every(id=>typeof id==='string'&&ids.has(id));
}
function attachedBuildings(payload:ObjectValue,ids:string[]){const known=new Set(objects(payload.evidence).map(e=>e.id));return ids.every(id=>known.has(id));}
export function parseComparisonReview(value:unknown,payload:ObjectValue):ObjectValue|null{
 const r=object(value),tradeoff=object(r?.strongestTradeoff),assumption=object(r?.weakestAssumption),check=object(r?.decisiveCheck);
 if(!r||r.kind!=='comparison_review'||r.model!=='muse-wonder-1.0'||r.status!=='completed'||r.modelGenerated!==true||r.grounded!==false||!nativeIds(r.buildingIds)||!attachedBuildings(payload,r.buildingIds)||!tradeoff||!assumption||!check||!boundedText(r.questionToAsk,360)||!boundedText(r.createdAt,80)||!Number.isFinite(Date.parse(r.createdAt)))return null;
 if([tradeoff,assumption].some(row=>!boundedText(row.text,800)||!attachedReferences(payload,row.evidenceIds,32)))return null;
 if(!boundedText(check.id,100)||!boundedText(check.title,160)||!boundedText(check.action)||!boundedText(check.reason,600)||!boundedText(check.whatCouldChange)||!attachedReferences(payload,check.evidenceIds,32))return null;
 return r;
}
export function parseAdaptationConcept(value:unknown,payload:ObjectValue):ObjectValue|null{
 const v=object(value),img=object(v?.image),ref=object(v?.sourceRef);
 if(!v||v.kind!=='adaptation_concept'||v.model!=='muse-image-1.0'||!boundedText(v.id,160)||!boundedText(v.createdAt,80)||!Number.isFinite(Date.parse(v.createdAt))||v.notToScale!==true||v.isEvidence!==false||!boundedText(v.disclaimer,1600)||!boundedText(v.alt,1600)||!img||!ref||ref.kind!=='resilience_brief'||!attachedReferences(payload,ref.evidenceIds,128))return null;
 if(!Array.isArray(v.places)||v.places.length!==2||v.places.some(place=>!object(place)||!boundedText(object(place)?.address,300)))return null;
 const ids=v.places.map(place=>object(place)?.id);if(!nativeIds(ids)||!attachedBuildings(payload,ids))return null;
 if(!Array.isArray(v.checkIds)||v.checkIds.length<2||v.checkIds.length>3||new Set(v.checkIds).size!==v.checkIds.length||v.checkIds.some(id=>!boundedText(id,100)))return null;
 const checks=payload.conceptChecks;
 if(!Array.isArray(checks)||checks.length!==v.checkIds.length||checks.some((value,i)=>{const c=object(value);return !c||c.id!==(v.checkIds as string[])[i]||!boundedText(c.title,160)||!boundedText(c.action)||!boundedText(c.whatCouldChange)||!Array.isArray(c.buildingIds)||!c.buildingIds.length||c.buildingIds.some(id=>!ids.includes(id as string))||!attachedReferences(payload,c.evidenceIds,64);}))return null;
 if(img.mimeType!=='image/png'||!Number.isInteger(img.width)||!Number.isInteger(img.height)||Number(img.width)<256||Number(img.height)<256||Number(img.width)>4096||Number(img.height)>4096||Number(img.width)*Number(img.height)>8_400_000||!Number.isInteger(img.byteLength)||Number(img.byteLength)<24||Number(img.byteLength)>4*1024*1024||typeof img.sha256!=='string'||!/^[a-f0-9]{64}$/.test(img.sha256))return null;
 if(typeof img.dataUrl!=='string'||img.dataUrl.length>5_592_430||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(img.dataUrl))return null;
 return v;
}

export function MetaModelAttribution({view}:{view:MetaResultView}){
 if(view.payload.comparisonReview)return <p className="mir-model-attribution">Second review · Muse Wonder <span>A second review of the current public-data brief</span></p>;
 if(view.payload.conceptVisual)return <p className="mir-model-attribution">Inspection concept · Muse Image</p>;
 return null;
}
export function AdaptationConceptVisual({view}:{view:MetaResultView}){
 const dialog=useRef<HTMLDialogElement>(null),v=parseAdaptationConcept(view.payload.conceptVisual,view.payload);
 if(!v)return null;
 const img=object(v.image)!;
 return <figure className="mir-concept"><button type="button" className="mir-concept-preview" aria-label="Expand generated inspection concept" onClick={()=>dialog.current?.showModal()}><img src={text(img.dataUrl,'',5_592_430)} width={Number(img.width)} height={Number(img.height)} alt={text(v.alt)}/><span>Enlarge concept</span></button><figcaption><strong>Generated concept · not site evidence</strong><p>Not to scale. These are questions to investigate, not a verified design or predicted outcome.</p></figcaption><dialog ref={dialog} className="mir-concept-dialog" onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}><header><div><strong>Inspection concept</strong><p>Muse Image · generated schematic · not to scale</p></div><button type="button" aria-label="Close inspection concept" onClick={()=>dialog.current?.close()}>Close</button></header><img src={text(img.dataUrl,'',5_592_430)} width={Number(img.width)} height={Number(img.height)} alt={text(v.alt)}/><p>{text(v.disclaimer)}</p></dialog></figure>;
}
function ModelContributionDetails({view}:{view:MetaResultView}){
 const review=parseComparisonReview(view.payload.comparisonReview,view.payload),concept=parseAdaptationConcept(view.payload.conceptVisual,view.payload);
 if(review){const check=object(review.decisiveCheck)!;return <Detail title="Muse Wonder review provenance"><p>A separate model reviewed the same retrieved evidence. Its interpretation is not an independent survey or verified finding.</p><Facts rows={[["Review model",'muse-wonder-1.0'],['Created',utc(review.createdAt)],['Selected check',text(check.title)]]}/><p>{text(check.action)}</p><p>{text(check.whatCouldChange)}</p><p>Question to ask: {text(review.questionToAsk)}</p></Detail>;}
 if(concept)return <Detail title="Muse Image concept provenance"><p>{text(concept.disclaimer)}</p><Facts rows={[["Generation model",'muse-image-1.0'],['Created',utc(concept.createdAt)],['Purpose','Illustrate the attached investigation questions'],['Evidence status','Generated illustration, not a source measurement']]} /><h4>Written checks behind this concept</h4>{objects(view.payload.conceptChecks,3).map(check=><div key={text(check.id)}><strong>{text(check.title)}</strong><p>{text(check.action)}</p><p>{text(check.whatCouldChange)}</p></div>)}</Detail>;
 return null;
}

/** A defensive display boundary, not a substitute for the server's evidence validation. */
export function parseMetaResult(payload:unknown):MetaResultView|null{
 const p=object(payload);if(!p||typeof p.answer!=='string'||!p.answer.trim())return null;
 if(p.kind!=='conversation'&&(p.comparisonReview!==undefined||p.conceptVisual!==undefined||p.visualComparison!==undefined||p.temporalImagery!==undefined))return null;
 const common={answer:text(p.answer),model:text(p.model,'Model unreported',100),payload:p};
 if(p.kind==='resilience_brief'){
  const string=(v:unknown,max=1200):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
  const strings=(v:unknown,max=32)=>Array.isArray(v)&&v.length<=max&&v.every(x=>string(x,1200));
  if(p.responseOrigin!=='source-based-rules'||p.modelGenerated!==false||p.answer.length>12_000||(p.grounded!==undefined&&p.grounded!==false)||['plan','decision','planNeedsReview','selectionNeedsReview'].some(key=>Object.prototype.hasOwnProperty.call(p,key)))return null;
  if(!['comparison','prioritize_checks','owner_documents'].includes(text(p.focus)))return null;
  const provider=object(p.providerStatus);
  if(!provider||provider.status!=='content_filtered'||provider.code!=='MODEL_CONTENT_FILTERED'||!string(provider.message)||!string(provider.model,100))return null;
  if(!Array.isArray(p.places)||p.places.length!==2||p.places.some(value=>{const place=object(value);return !place||!string(place.id,20)||!/^(?:[1-9]\d{0,9}|p:[1-5]\d{9})$/.test(place.id)||!string(place.address,300);}))return null;
  const ids=p.places.map(value=>String(object(value)!.id));if(new Set(ids).size!==2)return null;
  if(!Array.isArray(p.citations)||p.citations.length>512||p.citations.some(c=>{const citation=object(c);return !citation||typeof citation.evidenceId!=='string'||!object(citation.source)||typeof citation.measurement!=='string'||typeof citation.scope!=='string';}))return null;
  if(!Array.isArray(p.toolCalls)||p.toolCalls.length>6||p.toolCalls.some(t=>{const trace=object(t);return !trace||!string(trace.name,100);}))return null;
  if(!Array.isArray(p.evidence)||p.evidence.length>100||p.evidence.some(e=>!object(e)))return null;
  if(!Array.isArray(p.observations)||p.observations.length>8||p.observations.some(value=>{const row=object(value);return !row||!string(row.id,100)||!string(row.label,160)||!string(row.scope,100)||!string(row.note)||!Array.isArray(row.values)||row.values.length!==2||new Set(row.values.map(v=>object(v)?.buildingId)).size!==2||row.values.some(v=>{const item=object(v);return !item||!ids.includes(String(item.buildingId))||!['recorded','unknown'].includes(text(item.status))||!string(item.text)||!strings(item.evidenceIds);});}))return null;
  if(!Array.isArray(p.conditionalTradeoffs)||p.conditionalTradeoffs.length>3||p.conditionalTradeoffs.some(value=>{const row=object(value);return !row||!string(row.text)||!strings(row.evidenceIds);}))return null;
  if(!Array.isArray(p.nextChecks)||p.nextChecks.length<2||p.nextChecks.length>3||p.nextChecks.some(value=>{const row=object(value);return !row||!string(row.id,100)||!string(row.title,160)||!string(row.action)||!string(row.whyItMatters)||!string(row.whatCouldChange)||!Array.isArray(row.buildingIds)||row.buildingIds.length<1||row.buildingIds.length>2||row.buildingIds.some(id=>!ids.includes(String(id)))||!strings(row.evidenceIds);}))return null;
  if(!strings(p.limitations,20)||!string(p.groundingNote,2000))return null;
  return{...common,answer:p.answer,kind:'resilience_brief',data:p};
 }
 if(p.kind==='conversation'){
  if(p.grounded!==false||p.responseOrigin!=='model-synthesis'||p.answer.length>12_000||['plan','decision','planNeedsReview','selectionNeedsReview'].some(key=>Object.prototype.hasOwnProperty.call(p,key)))return null;
  if(!Array.isArray(p.citations)||p.citations.length>512||p.citations.some(c=>{const citation=object(c);return !citation||typeof citation.evidenceId!=='string'||!object(citation.source)||typeof citation.measurement!=='string'||typeof citation.scope!=='string';}))return null;
  if(!Array.isArray(p.toolCalls)||p.toolCalls.length>6||p.toolCalls.some(t=>{const trace=object(t);return !trace||typeof trace.name!=='string'||!trace.name.trim();}))return null;
  if(!Array.isArray(p.evidence)||p.evidence.length>100||p.evidence.some(e=>!object(e)))return null;
  if(p.comparisonReview!==undefined&&(!parseComparisonReview(p.comparisonReview,p)||p.model!=='muse-wonder-1.0'))return null;
  if(p.conceptVisual!==undefined&&(!parseAdaptationConcept(p.conceptVisual,p)||p.model!=='muse-image-1.0'))return null;
  if([p.comparisonReview,p.conceptVisual,p.visualComparison,p.temporalImagery].filter(v=>v!==undefined).length>1)return null;
  if(p.visualComparison!==undefined&&!parseVisualComparison(p.visualComparison,p))return null;
  if(p.temporalImagery!==undefined&&!parseTemporalImagery(p.temporalImagery,p))return null;
  return{...common,answer:p.answer,kind:'conversation',data:object(p.planningContext)||{}};
 }
 if(p.kind==='clarification'){const d=object(p.clarification);return d&&typeof d.question==='string'?{...common,kind:'clarification',data:d}:null;}
 if(p.kind==='decision'){
  const plan=object(p.plan),d=object(p.decision);
  if(!plan||!Array.isArray(plan.requirements)||!d||d.valid!==true||!Array.isArray(d.candidates))return null;
  return{...common,kind:'decision',data:d};
 }
 if(p.kind!=='investigation'||p.selectionNeedsReview!==true)return null;
 const d=object(p.data),selection=object(p.selection);if(!d||!selection||!object(d.source))return null;
 if(p.investigationType==='energy_scope'){
  const analysis=object(d.analysis),target=object(d.target);
  if(!analysis||!Array.isArray(analysis.nodes)||!target||typeof target.id!=='string'||selection.id!==target.id||!finite(selection.reportYear))return null;
  if(analysis.nodes.some(node=>{const r=object(node);return !r||typeof r.propertyId!=='string'||r.reportYear!==selection.reportYear;} ))return null;
  return{...common,kind:'energy_scope',data:d};
 }
 if(p.investigationType==='climate_observed'){
  const station=object(d.station),period=object(d.period);
  if(!station||typeof station.id!=='string'||selection.stationId!==station.id||selection.metric!==d.metric||d.scope!=='reference_station'||!period||!finite(period.startYear)||!finite(period.endYear)||typeof d.metric!=='string'||typeof d.unit!=='string'||!(d.value===null||finite(d.value)))return null;
  const years=selection.period==='baseline_1991_2020'?[1991,2020]:selection.period==='recent_2021_2025'?[2021,2025]:null;
  if(!years||period.startYear!==years[0]||period.endYear!==years[1])return null;
  return{...common,kind:'climate_observed',data:d};
 }
 if(p.investigationType==='climate_hourly'){
  const station=object(d.station),pair=object(d.pair),coverage=object(d.coverage);
  if(!station||!['USW00094789','USW00014732','USW00014734'].includes(text(station.id))||selection.stationId!==station.id||selection.year!==d.year||selection.metric!==d.metric||selection.mode!=='hourly'||d.scope!=='reference_station'||d.unit!=='°C'||!['hottest_pair','highest_dew_point_pair'].includes(text(d.metric))||!finite(d.year)||d.year<2021||d.year>2025||!pair||!finite(pair.temperature_c)||!finite(pair.dew_point_c)||pair.dew_point_c>pair.temperature_c||typeof pair.timestamp_utc!=='string'||!pair.timestamp_utc.endsWith('Z')||new Date(pair.timestamp_utc).getUTCFullYear()!==d.year||!Number.isInteger(d.tiedSampleCount)||Number(d.tiedSampleCount)<1||!coverage)return null;
  if(!finite(coverage.expectedUtcHourBins)||coverage.expectedUtcHourBins<=0||!finite(coverage.representedUtcHourBins)||coverage.representedUtcHourBins<0||!Number.isInteger(coverage.representedUtcHourBins)||!finite(coverage.unrepresentedUtcHourBins)||coverage.unrepresentedUtcHourBins<0||!Number.isInteger(coverage.unrepresentedUtcHourBins)||coverage.representedUtcHourBins+coverage.unrepresentedUtcHourBins!==coverage.expectedUtcHourBins||!finite(coverage.percent)||coverage.percent<0||coverage.percent>100||Math.abs(coverage.percent-coverage.representedUtcHourBins/coverage.expectedUtcHourBins*100)>.001)return null;
  return{...common,kind:'climate_hourly',data:d};
 }
 if(p.investigationType==='climate_projected'){
  if(typeof d.metric!=='string'||selection.metric!==d.metric||selection.horizon!==d.horizon||d.scope!=='NYC_region'||typeof d.horizon!=='string'||typeof d.unit!=='string'||!object(d.pooledPercentiles)||!object(d.baseline))return null;
  return{...common,kind:'climate_projected',data:d};
 }
 return null;
}
export function hasMetaSources(payload:unknown):boolean{
 const p=object(payload);return !!p&&(objects(p.citations).length>0||objects(p.toolCalls,6).length>0);
}
/** A deliberately small Markdown subset, constructed as escaped React nodes. */
export function MetaAnswerText({answer,className='mir-answer-text'}:{answer:string;className?:string}){
 const blocks:ReactNode[]=[],paragraph:string[]=[],list:string[]=[],quote:string[]=[];
 let listType:'ul'|'ol'|null=null;
 const inline=(value:string)=>value.split(/(\*\*[^*\n]+\*\*)/g).map((part,i)=>part.startsWith('**')&&part.endsWith('**')&&part.length>4?<strong key={i}>{part.slice(2,-2)}</strong>:part);
 const flushParagraph=()=>{if(paragraph.length){blocks.push(<p key={blocks.length}>{inline(paragraph.join('\n'))}</p>);paragraph.length=0;}};
 const flushList=()=>{if(listType&&list.length){const List=listType;blocks.push(<List key={blocks.length}>{list.map((line,i)=><li key={i}>{inline(line)}</li>)}</List>);list.length=0;listType=null;}};
 const flushQuote=()=>{if(quote.length){blocks.push(<blockquote key={blocks.length}>{inline(quote.join('\n'))}</blockquote>);quote.length=0;}};
 for(const line of answer.slice(0,12_000).replace(/\r\n?/g,'\n').split('\n')){
  if(!line.trim()){flushParagraph();flushList();flushQuote();continue;}
  const heading=line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?$/),quoted=line.match(/^ {0,3}>\s?(.*)$/);
  if(heading){flushParagraph();flushList();flushQuote();blocks.push(<p className="mir-answer-heading" key={blocks.length}>{inline(heading[1])}</p>);continue;}
  if(quoted){flushParagraph();flushList();quote.push(quoted[1]);continue;}
  flushQuote();
  const unordered=line.match(/^ {0,3}[-*+]\s+(.+)$/),ordered=line.match(/^ {0,3}\d{1,3}[.)]\s+(.+)$/),match=unordered||ordered;
  if(match){flushParagraph();const type=unordered?'ul':'ol';if(listType!==type)flushList();listType=type;list.push(match[1]);}
  else{flushList();paragraph.push(line);}
 }
 flushParagraph();flushList();flushQuote();
 return <div className={className}>{blocks}</div>;
}
/** An application-produced comparison is never presented as Meta's prose. */
export function ResilienceBriefText({view}:{view:MetaResultView}){
 if(view.kind!=='resilience_brief')return null;
 const focus=view.data.focus,limit=focus==='prioritize_checks'?1:focus==='owner_documents'?3:2;
 return <div className="map-chat-answer"><p><strong>Public-data comparison</strong></p><p className="mir-conversation-note">Meta could not answer this request. This comparison uses public-data rules and was not generated by Meta.</p><MetaAnswerText answer={view.answer}/><p><strong>{focus==='prioritize_checks'?'Start here':'What to verify next'}</strong></p><ol>{objects(view.data.nextChecks,limit).map(check=><li key={text(check.id)}><strong>{text(check.title)}</strong><p>{text(check.action)}</p></li>)}</ol></div>;
}
/** Links never execute source-provided scripts or conceal URL credentials. */
export function safeEvidenceUrl(value:unknown):string|null{
 if(typeof value!=='string'||value.length>12000||/[\s<>"'\\]/.test(value))return null;
 try{const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function SourceLink({url,children}:{url:unknown;children:ReactNode}){
 const href=safeEvidenceUrl(url);return href?<a href={href} target="_blank" rel="noreferrer noopener">{children}<ArrowUpRight size={13} aria-hidden="true"/><span className="mir-sr-only"> (opens in a new tab)</span></a>:<span>{children}<small className="mir-link-unavailable"> · source link unavailable</small></span>;
}
function Value({value,unit}:{value:unknown;unit?:unknown}){return <span className="mir-value">{number(value)}{finite(value)&&text(unit)&&<small>{text(unit)}</small>}</span>;}
function Detail({title,children}:{title:string;children:ReactNode}){return <details className="mir-detail"><summary>{title}<ChevronDown size={15} aria-hidden="true"/></summary><div>{children}</div></details>;}
function Facts({rows}:{rows:[string,ReactNode][]}){return <dl className="mir-facts">{rows.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>;}
function ScopeReview({view}:{view:MetaResultView}){
 const p=view.payload,d=view.data,selection=object(p.selection)||{},origin=object(p.selectionOrigin);
 let rows:[string,ReactNode][]=[];
 if(view.kind==='energy_scope'){const t=object(d.target)||{};rows=[['Native place ID',text(t.id,'Unknown')],['BIN / BBL',`${text(t.bin,'Unknown')} / ${text(t.bbl,'Unknown')}`],['Report year',yearLabel(selection.reportYear)]];}
 else if(view.kind==='climate_observed'){const s=object(d.station)||{},period=object(d.period)||{};rows=[['Station',`${text(s.name,'Unreported station')} · ${text(s.id)}`],['Observation period',`${yearLabel(period.startYear)}–${yearLabel(period.endYear)}`],['Measurement',label(d.metric,metricLabels)]];}
 else if(view.kind==='climate_hourly'){const station=object(d.station)||{};rows=[['Airport',`${text(station.name,'Unreported airport')} · ${text(station.id)}`],['UTC calendar year',yearLabel(d.year)],['Selected maximum',label(d.metric,metricLabels)]];}
 else if(view.kind==='climate_projected')rows=[['Spatial scope','NYC region'],['Published horizon',text(d.horizon,'Unknown')],['Measurement',label(d.metric,metricLabels)]];
 return <section className="mir-scope"><div className="mir-section-title"><ClipboardCheck size={18} aria-hidden="true"/><h3>Check what was selected</h3></div><p>The selected scope needs your review. A valid tool call does not prove that it captured your intended question.</p><Facts rows={rows}/>{text(origin?.quote)&&<blockquote><span>Your wording</span>{text(origin?.quote)}</blockquote>}</section>;
}
function SourceProvenance({source}:{source:ObjectValue}){
 const rows:[string,ReactNode][]=[['Evidence source',<SourceLink key="source" url={source.url}>{text(source.dataset||source.label,'Source record')}</SourceLink>]];
 if(source.retrievalMode)rows.push(['Retrieval mode',source.retrievalMode==='live-query'?'Bounded official query':source.retrievalMode==='compiled-source-snapshot'?'Compiled source snapshot':text(source.retrievalMode,'Unreported')]);
 if(source.retrievedOn||source.retrievedAt)rows.push(['Retrieved',text(source.retrievedOn||source.retrievedAt)]);
 if(source.sourceVersion||source.version)rows.push(['Source version',text(source.sourceVersion||source.version)]);
 if(source.recordId)rows.push(['Native source record',text(source.recordId)]);
 if(source.analyticalCutoff)rows.push(['Analysis ends',text(source.analyticalCutoff)]);
 if(Object.prototype.hasOwnProperty.call(source,'sourceLastModified'))rows.push(['Publisher Last-Modified',text(source.sourceLastModified,'Not provided')]);
 if(source.summaryGeneratedAt)rows.push(['Summary generated',text(source.summaryGeneratedAt)]);
 if(source.firstRawObservation||source.lastRawObservation)rows.push(['Raw-file observation span',`${text(source.firstRawObservation,'Unreported')} to ${text(source.lastRawObservation,'Unreported')}`]);
 if(source.documentationUrl)rows.push(['Source documentation',<SourceLink key="documentation" url={source.documentationUrl}>{text(source.documentationVersion,'Format and methods')}</SourceLink>]);
 if(source.sourceRowsUpdatedAt)rows.push(['Published rows updated',text(source.sourceRowsUpdatedAt)]);
 const latest=object(source.latestRecordByElement);if(latest)rows.push(['Latest raw records',Object.entries(latest).map(([key,value])=>`${key}: ${text(value,'Unreported')}`).join(' · ')]);
 return <><Facts rows={rows}/>{text(source.revisionNote)&&<p className="mir-note">{text(source.revisionNote)}</p>}{text(source.paper)&&<p><SourceLink url={source.paper}>Read the published assessment</SourceLink></p>}{objects(source.queries,8).map((query,i)=><div className="mir-query" key={i}><SourceLink url={query.url}>Official query {i+1}</SourceLink><span>{text(query.retrievedAt,'Retrieval time unreported')} · {number(query.returned,0)} returned{query.truncated===true?' · truncated at the analysis bound':''}</span></div>)}{Boolean(source.rawSha256)&&<Detail title="Snapshot fingerprint"><pre>{typeof source.rawSha256==='string'?text(source.rawSha256):Object.entries(object(source.rawSha256)||{}).slice(0,20).filter(([,value])=>typeof value==='string').map(([name,value])=>name+': '+text(value)).join('\n')||'Fingerprint unavailable in a supported format.'}</pre></Detail>}</>;
}
function EnergyResult({view}:{view:MetaResultView}){
 const d=view.data,analysis=object(d.analysis)||{},target=object(d.target)||{},source=object(d.source)||{},nodes=objects(analysis.nodes),repeated=objects(analysis.sameEnergyRelationships),retrieval=object(target.retrieval);
 return <><div className="mir-finding"><span className="mir-kicker">REPORTING BOUNDARIES</span><h2>{text(target.address,'Selected place')}</h2><p>{view.answer}</p></div><ScopeReview view={view}/>{d.queryLimited===true&&<div className="mir-warning"><TriangleAlert size={18} aria-hidden="true"/><p>A query bound was reached. Further linked reports may be missing; this result is not a complete inventory.</p></div>}<section className="mir-reading"><div className="mir-section-title"><Layers3 size={18} aria-hidden="true"/><h3>{nodes.length} reporting {nodes.length===1?'property':'properties'} in the returned evidence</h3></div><p>Reported annual energy and floor area stay at their native reporting boundary. Missing values remain unknown.</p>{nodes.length===0?<p className="mir-empty">No exact linked report was returned. This does not establish zero energy use, exemption or efficiency.</p>:<div className="mir-energy-records">{nodes.map((node,i)=><article className="mir-energy-record" key={text(node.key,String(i))}><header><span>{text(node.scopeLabel,'Relationship unknown')}</span><h4>{text(node.name,'Reporting property')}</h4><p>Property {text(node.propertyId)} · {yearLabel(node.reportYear)}</p></header><EnergyQualityNotice data={node.dataQuality} conflicting={node.conflictingCopies===true}/><div className="mir-energy-values"><div><span>Annual site energy</span><Value value={node.siteEnergyKbtu} unit="kBtu/year"/></div><div><span>Reported floor area</span><Value value={node.floorAreaFt2} unit="ft²"/></div><div><span>Reported site EUI</span><Value value={node.siteEuiKbtuFt2} unit="kBtu/ft²/year"/></div></div><Detail title="Source qualifications"><EnergyQualityDetails data={node.dataQuality}/></Detail><p className="mir-boundary">{node.targetMatch==='single-building-report'?'A single listed building matches the selected BIN; actual meter coverage still needs confirmation.':node.targetMatch==='includes-selected-building'?'Includes the selected BIN; the reporting boundary may include other buildings.':node.targetMatch==='lot-context-only'?'Tax-lot match only. This does not identify building-specific consumption.':node.targetMatch==='not-matched'?'Linked reporting scope; not a direct match to the selected building.':'Building/report alignment needs review.'}</p>{text(node.parentKey)&&<p className="mir-note">Native parent {text(node.parentKey)} · {node.parentAvailable===true?'matching parent report retrieved':'parent relationship unresolved'}</p>}{items(node.warnings).length>0&&<ul className="mir-notes">{items(node.warnings).map((w,j)=><li key={j}>{text(w)}</li>)}</ul>}</article>)}</div>}{repeated.length>0&&<div className="mir-same-total"><Zap size={21} aria-hidden="true"/><div><h4>The same reported total appears at different boundaries</h4>{repeated.map((r,i)=><p key={i}>{text(r.parentKey)} → {text(r.childKey)}: {number(r.siteEnergyKbtu)} kBtu/year. {text(r.interpretation)}</p>)}</div></div>}<p className="mir-boundary">{text(analysis.aggregationNote,'No cross-property total is calculated. Parent and child reports must not be added together.')}</p></section><Detail title="Source provenance and query limits"><SourceProvenance source={source}/><Facts rows={[["Place retrieval mode",text(retrieval?.mode,'Unreported')],["Place retrieved",text(retrieval?.retrieved_at,'Unreported')],["Footprint edit date",text(target.footprintEditedAt,'Unreported')],["PLUTO version",text(target.plutoVersion,'Unreported')]]}/><p>{text(d.exactMatchNote)}</p></Detail></>;
}
function ClimateResult({view}:{view:MetaResultView}){
 const d=view.data,observed=view.kind==='climate_observed',source=object(d.source)||{},station=object(d.station)||{},period=object(d.period)||{},baseline=object(d.baseline)||{},ranges=object(d.pooledPercentiles)||{};
 const baselineYears=items(baseline.years,2).filter(finite).join('–');
 const baselineMetric=d.metric==='temperature_change_c'?`${number(baseline.temperatureF)} °F annual mean`:d.metric==='precipitation_change_pct'?`${number(baseline.precipitationInches)} inches annual precipitation`:`${number(baseline.value)} ${text(baseline.unit)}`;
 const coverage=object(d.minDailyCoverage);
 return <><div className="mir-finding"><span className="mir-kicker">{observed?'OBSERVED STATION CONTEXT':'PUBLISHED REGIONAL PROJECTION'}</span><h2>{label(d.metric,metricLabels)}</h2><p>{observed?`${text(station.name)} · ${yearLabel(period.startYear)}–${yearLabel(period.endYear)}`:`NYC region · ${text(d.horizon)}`}</p><div className="mir-climate-number">{observed?<Value value={d.value} unit={d.unit}/>:<><strong>{number(ranges.p25)}–{number(ranges.p75)}</strong><span>{text(d.unit)}</span><small>Pooled 25th–75th percentiles</small></>}</div><p className="mir-boundary">{observed?'Reference-station observations, not a measurement of this building.':'Model-and-scenario spread, not a calibrated probability or a forecast for one building or year.'}</p></div><ScopeReview view={view}/><section className="mir-reading"><h3>{observed?'How to read this observation':'Keep the reference period attached'}</h3>{observed?<Facts rows={[["Valid years for this metric",`${number(d.validYears,0)} of ${number(d.expectedYears,0)}`],["Spatial unit","Reference station"],["Method",text(d.method,'Method unreported')]]}/>:<><Facts rows={[["Published baseline",baselineYears||'Unreported'],["Baseline reference",baselineMetric],["Reference scope",text(baseline.scope,'Unreported')]]}/><div className="mir-percentiles" aria-label="Published pooled percentiles">{[10,25,75,90].map(p=><div key={p}><span>{p}th percentile</span><strong>{number(ranges['p'+p])}</strong><small>{text(d.unit)}</small></div>)}</div><p>{text(d.method)}</p><p className="mir-boundary">Keep the NPCC 1981–2010 reference separate from observed station summaries for 1991–2020 or 2021–2025.</p></>}{coverage&&<Detail title="Daily-data coverage"><p>Minimum annual daily coverage within this selected period, by source element. Missing values are not filled.</p><Facts rows={Object.entries(coverage).map(([key,value])=>[key,finite(value)&&value>=0&&value<=1?`${number(value*100)}%`:'Unknown'])}/></Detail>}</section><Detail title="Source dates, method and snapshot"><SourceProvenance source={source}/></Detail></>;
}
function HourlyResult({view}:{view:MetaResultView}){
 const d=view.data,station=object(d.station)||{},pair=object(d.pair)||{},coverage=object(d.coverage)||{},gap=object(coverage.longestUnrepresentedRun),method=object(d.method)||{},source=object(d.source)||{},hottest=d.metric==='hottest_pair';
 return <><div className="mir-finding"><span className="mir-kicker">PAIRED AIRPORT OBSERVATION</span><h2>Two readings.<br/>One observed moment.</h2><p>{text(station.name)} · {yearLabel(d.year)} · {label(d.metric,metricLabels)}</p><div className="mir-hourly-pair"><div className={hottest?'mir-pair-chosen':''}><span>Dry-bulb air temperature</span><Value value={pair.temperature_c} unit="°C"/></div><div className={!hottest?'mir-pair-chosen':''}><span>Dew point · atmospheric moisture</span><Value value={pair.dew_point_c} unit="°C"/></div></div><p className="mir-paired-time"><time dateTime={text(pair.timestamp_utc)}>{utc(pair.timestamp_utc)}</time> · same source row</p><p className="mir-boundary">{Number(d.tiedSampleCount)>1?`Earliest of ${number(d.tiedSampleCount,0)} retained samples tied at the selected maximum. The companion reading may differ at other tied maxima.`:'One retained sample at the selected maximum.'} These are paired outdoor observations, not engineering design conditions. Independent temperature and dew-point maxima have not been combined.</p></div><ScopeReview view={view}/><section className="mir-reading"><h3>How much of the year is represented?</h3><Facts rows={[["UTC hour bins with a retained pair",`${number(coverage.percent)}%`],["Represented / expected",`${number(coverage.representedUtcHourBins,0)} / ${number(coverage.expectedUtcHourBins,0)}`],["Unrepresented hour bins",number(coverage.unrepresentedUtcHourBins,0)],["Observation scope","One sampled moment per represented UTC hour"]]}/><div className="mir-hourly-gap">{gap?<><strong>Longest unrepresented span: {number(gap.hour_bins,0)} UTC hour bins</strong><p>{utc(gap.first_utc_hour_bin)} through {utc(gap.last_utc_hour_bin)}.</p><p>The reported maximum is limited to retained samples. This gap may contain unobserved or excluded conditions; it is not filled.</p></>:<p>All UTC hour bins have a retained pair. One sampled moment per hour still does not establish continuous conditions.</p>}</div><p>{text(method.coverage)}</p><Detail title="Pair selection and quality flags"><p>{text(method.pairing)}</p><p>{text(method.hour_selection)}</p><p>{text(method.quality_policy)}</p><Facts rows={[["Air temperature source / QC",`${text(pair.temperature_source_code,'Unknown')} / ${text(pair.temperature_quality_code,'Unknown')}`],["Dew-point source / QC",`${text(pair.dew_point_source_code,'Unknown')} / ${text(pair.dew_point_quality_code,'Unknown')}`],["Tie method",text(method.peak_ties)]]}/><p className="mir-note">Source-specific QC codes describe the retained observations. Exclusion does not mean a reading is wrong.</p></Detail></section><Detail title="Source dates and retained file"><SourceProvenance source={source}/></Detail></>;
}

function conditionValue(requirement:ObjectValue){const target=requirement.target,op={gte:'≥',lte:'≤',eq:'=',in:'in'}[text(requirement.operator)];const value=typeof target==='boolean'?target?'Yes':'No':Array.isArray(target)?items(target).map(v=>text(v)).join(', '):number(target);return `${label(requirement.factKey,conditionLabels)} ${op||'·'} ${value}${['boolean','code'].includes(text(requirement.unit))?'':' '+text(requirement.unit)}`;}
function DecisionResult({view}:{view:MetaResultView}){
 const p=view.payload,plan=object(p.plan)||{},requirements=objects(plan.requirements,20),origins=objects(p.requirementOrigins,20),candidates=objects(view.data.candidates,12);
 return <><div className="mir-finding"><span className="mir-kicker">YOUR CONDITIONS, MADE EXPLICIT</span><h2>Review the interpretation first.</h2><p>{view.answer}</p></div><section className="mir-scope"><div className="mir-section-title"><ClipboardCheck size={18} aria-hidden="true"/><h3>Plan review required</h3></div><p>These conditions were extracted from your words. Check the measurement, threshold, unit and scope. Review every condition before using it in your place workspace. No plan is applied automatically.</p>{text(plan.userQuestion)&&<blockquote><span>Your question</span>{text(plan.userQuestion)}</blockquote>}{requirements.length?<ol className="mir-conditions">{requirements.map((r,i)=><li key={text(r.id,String(i))}><div><b>{conditionValue(r)}</b><span>{r.required===true?'Required':'Optional'} · {label(r.scope,scopeLabels)}</span></div>{text(r.scenario)&&<p>Scenario: {text(r.scenario)}</p>}{finite(r.year)&&<p>Reporting year: {yearLabel(r.year)}</p>}{origins.filter(o=>o.requirementId===r.id).map((o,j)=><blockquote key={j}><span>Original wording</span>{text(o.quote)}</blockquote>)}</li>)}</ol>:<p className="mir-boundary">No requirements were stated. This is a descriptive investigation, not an operational fit assessment.</p>}</section><section className="mir-reading"><h3>What the retrieved evidence supports</h3>{candidates.length?candidates.map((candidate,i)=><article className="mir-candidate" key={text(candidate.id,String(i))}><div className="mir-candidate-title"><h4>{text(candidate.label,'Selected place')}</h4><span className={'mir-status mir-status-'+(['matches','conditional','conflicts','not_assessed'].includes(text(candidate.status))?text(candidate.status):'not_assessed')}>{label(candidate.status,statusLabels,'Status unreported')}</span></div><p>{text(candidate.answer)}</p><ul className="mir-condition-results">{objects(candidate.requirements,20).map((r,j)=><li key={j}><strong>{text(r.label,'Condition')}</strong><span>{label(r.status,statusLabels)}{r.required===false?' · optional':''}</span><p>{text(r.reason)}</p></li>)}</ul>{items(candidate.warnings).concat(items(candidate.dataIssues)).length>0&&<ul className="mir-notes">{items(candidate.warnings).concat(items(candidate.dataIssues)).map((item,j)=><li key={j}>{text(item)}</li>)}</ul>}</article>):<p>The latest bounded query returned no records. This does not establish that no suitable places exist.</p>}</section></>;
}
function ClarificationResult({view,onChoice}:{view:MetaResultView;onChoice?:MetaInvestigationResultProps['onClarificationChoice']}){
 const d=view.data,options=objects(d.options,10);return <div className="mir-finding"><span className="mir-kicker">ONE QUESTION BEFORE THE SEARCH</span><h2>{text(d.question)}</h2><p>{text(d.why)}</p>{options.length>0&&<div className="mir-options" aria-label="Clarification choices">{options.map((option,i)=>onChoice?<button key={i} type="button" onClick={()=>onChoice(text(option.label||option.value))}>{text(option.label||option.value)}<ArrowRight size={15} aria-hidden="true"/></button>:<span key={i}>{text(option.label||option.value)}</span>)}</div>}<p className="mir-boundary">This is a clarification, not an evidence finding. Choosing an option only fills the next question; it does not run a request.</p></div>;
}
function EvidenceLedger({view}:{view:MetaResultView}){
 const p=view.payload,citations=objects(p.citations,view.kind==='conversation'||view.kind==='resilience_brief'?512:100),traces=objects(p.toolCalls,6);
 return <>{(view.kind!=='conversation'||citations.length>0)&&<Detail title={`Evidence references · ${citations.length}`}>{citations.length?<ol className="mir-citations">{citations.map((citation,i)=>{const source=object(citation.source)||{};return <li key={text(citation.evidenceId,String(i))}><SourceLink url={source.url}>{text(source.label||source.dataset,'Source record')}</SourceLink><p>{label(citation.measurement,{...conditionLabels,...metricLabels})} · {label(citation.scope,scopeLabels)}</p><small>Evidence ID: {text(citation.evidenceId,'Unreported')}</small>{text(source.retrievedAt||source.retrievedOn)&&<small>Retrieved: {text(source.retrievedAt||source.retrievedOn)}</small>}</li>;})}</ol>:<p>No evidence citation was returned for this response. A clarification can legitimately have no retrieval.</p>}</Detail>}{(view.kind!=='conversation'||traces.length>0)&&<Detail title={`Returned tool trace · ${traces.length} ${traces.length===1?'call':'calls'}`}><p>Only calls recorded in this response appear here. These records do not certify account access or future availability.</p>{traces.length?<ol className="mir-traces">{traces.map((trace,i)=><li key={i}><Search size={15} aria-hidden="true"/><div><strong>{text(trace.name,'Tool name unreported')}</strong><span>{text(trace.error)||text(object(trace.result)?.error)?'Returned an error':Object.prototype.hasOwnProperty.call(trace,'result')?'Returned a result':'Outcome not included'}</span>{(text(trace.error)||text(object(trace.result)?.error))&&<p>{text(trace.error)||text(object(trace.result)?.error)}</p>}</div></li>)}</ol>:<p>No tool calls were included.</p>}</Detail>}</>;
}
/** No fetches, model calls, hidden application of plans, or success fixtures. */
export default function MetaInvestigationResult({payload,onClarificationChoice}:MetaInvestigationResultProps){
 const view=parseMetaResult(payload);
 if(!view)return <section className="meta-investigation-result mir-unavailable" aria-label="Response needs review"><TriangleAlert size={21} aria-hidden="true"/><div><h2>The response needs review.</h2><p>A supported, complete result was not provided. No measurement, selected condition or conclusion is inferred from the missing fields.</p></div></section>;
 if(view.kind==='conversation')return <section className="meta-investigation-result mir-conversation" aria-label="Conversation response"><MetaAnswerText answer={view.answer}/><ModelContributionDetails view={view}/>{hasMetaSources(view.payload)&&<><EvidenceLedger view={view}/>{text(view.payload.groundingNote)&&<p className="mir-conversation-note">{text(view.payload.groundingNote)}</p>}</>}</section>;
 if(view.kind==='resilience_brief')return <section className="meta-investigation-result mir-conversation" aria-label="Public-data comparison sources"><p className="mir-conversation-note">Application rules produced this comparison from the cited public records. It is not a Meta-generated answer, a resilience score or a verified investment recommendation.</p><Detail title="Why these checks matter"><ol>{objects(view.data.nextChecks,3).map(check=><li key={text(check.id)}><strong>{text(check.title)}</strong><p>{text(check.action)}</p><p>{text(check.whyItMatters)}</p><p>{text(check.whatCouldChange)}</p></li>)}</ol></Detail><Detail title="Recorded comparison">{objects(view.data.observations,8).map(row=><div key={text(row.id)}><h3>{text(row.label)}</h3><Facts rows={objects(row.values,2).map(value=>[text(objects(view.data.places,2).find(place=>place.id===value.buildingId)?.address,'Selected place'),text(value.text)])}/><p className="mir-note">{label(row.scope,scopeLabels)} · {text(row.note)}</p></div>)}</Detail>{objects(view.data.conditionalTradeoffs,3).length>0&&<Detail title="Conditional trade-offs"><ul>{objects(view.data.conditionalTradeoffs,3).map((row,i)=><li key={i}>{text(row.text)}</li>)}</ul></Detail>}<EvidenceLedger view={view}/><Detail title="What this comparison cannot establish"><ul>{items(view.data.limitations,20).map((value,i)=><li key={i}>{text(value)}</li>)}</ul><p>{text(view.payload.groundingNote)}</p></Detail></section>;
 const Icon=view.kind==='energy_scope'?Zap:view.kind.startsWith('climate')?Thermometer:view.kind==='clarification'?HelpCircle:CheckCircle2;
 const next=view.kind==='decision'?object(view.data.nextQuestion):null,nextQuestion=view.kind==='decision'?text(next?.question):text(view.payload.nextQuestion),limitations=items(view.payload.limitations),unknowns=items(view.payload.unknowns);
 return <section className="meta-investigation-result" aria-label="Inspectable response"><header className="mir-header"><span><Icon size={18} aria-hidden="true"/> {view.kind==='clarification'?'CLARIFICATION':'EVIDENCE INVESTIGATION'}</span><small>Returned model label: {view.model}</small></header>{view.kind==='energy_scope'?<EnergyResult view={view}/>:view.kind==='climate_hourly'?<HourlyResult view={view}/>:view.kind==='climate_observed'||view.kind==='climate_projected'?<ClimateResult view={view}/>:view.kind==='decision'?<DecisionResult view={view}/>:<ClarificationResult view={view} onChoice={onClarificationChoice}/>}{nextQuestion&&<section className="mir-next"><span className="mir-kicker">THE NEXT FACT THAT COULD MATTER</span><h3>{nextQuestion}</h3>{text(next?.why)&&<p>{text(next?.why)}</p>}{objects(next?.branches,8).length>0&&<ul>{objects(next?.branches,8).map((branch,i)=><li key={i}><strong>{text(branch.if)}</strong> {text(branch.then)}</li>)}</ul>}</section>}{unknowns.length>0&&<section className="mir-unknowns"><h3>Still not established</h3><ul>{unknowns.map((value,i)=><li key={i}>{label(value,unknownLabels)}</li>)}</ul></section>}{limitations.length>0&&<Detail title="What this evidence cannot establish"><ul className="mir-notes">{limitations.map((value,i)=><li key={i}>{text(value)}</li>)}</ul></Detail>}<EvidenceLedger view={view}/><footer className="mir-footer"><BookOpen size={17} aria-hidden="true"/><p>{text(view.payload.groundingNote,'Review the returned evidence and its scope before using this result.')}<span>Application-rendered evidence. This display does not verify a live Meta connection or overall property suitability.</span></p></footer></section>;
}

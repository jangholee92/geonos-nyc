'use client';

import {useEffect,useId,useMemo,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpRight,Building2,Check,ChevronDown,Download,FileText,HelpCircle,Layers3,LoaderCircle,Map,MapPin,Plus,Search,SlidersHorizontal,Thermometer,Trash2,Truck,Waves,X,Zap} from 'lucide-react';
import type {CityBuilding,CityQuery} from '@/lib/city';
import type {SiteContext} from '@/lib/site-context';
import type {SurroundingsEvidence} from '@/lib/surroundings';
import {renderInvestigationReceipt,type InvestigationReceipt} from '@/lib/investigation-receipt';
import {captureSurroundings,selectedPlaceEvidence,type LoadedPlaceEvidence,type PlaceEvidenceRegistry} from '@/lib/investigation-evidence';
import {commonOutlineFrame,eligibleOutline,type PhysicalDrawingFrame} from '@/lib/geometry-frame';
import {FACTS,describeRequirement,describeSearchFilters,evaluateQuestion,makeRequirement,nextRequirementPrompt,validatePlan,type CandidateDecision,type CandidateExtras,type DecisionFact,type FactKey,type Operator,type OperationalFactKey,type QuestionPlan,type ReportedOperationalFact,type Requirement} from '@/lib/decision-plan';
import GeoScene from './geo-scene';
import SurroundingsPanel from './surroundings-panel';
import './investigation.css';
import './decision-workspace.css';

export type DecisionWorkspaceProps={
 buildings:CityBuilding[];contexts:Record<string,SiteContext>;
 contextBusy?:Record<string,boolean>;contextErrors?:Record<string,string>;
 initialPlan:QuestionPlan;initialExtras?:Record<string,CandidateExtras>;initialSurroundings?:Record<string,SurroundingsEvidence|null>;searchQuery?:CityQuery;
 onPlanChange?:(plan:QuestionPlan)=>void;
 onExtrasChange?:(extras:Record<string,CandidateExtras>)=>void;
 onSurroundingsChange?:(surroundings:Record<string,SurroundingsEvidence|null>)=>void;
 loadedEvidence?:PlaceEvidenceRegistry;
 onEvidenceCapture?:(building:CityBuilding,patch:Partial<Omit<LoadedPlaceEvidence,'identity'>>)=>void;
 onInspect:(building:CityBuilding)=>void;onRemove:(building:CityBuilding)=>void;
 onExplore:()=>void;onRestart:()=>void;onClimate:(building:CityBuilding)=>void;
 onStory:(choice:'footprint'|'energy')=>void;
};
const fmt=(value:unknown,digits=0)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:digits}):'Unknown';
const statusLabel={matches:'Stated conditions match',conditional:'Needs evidence',conflicts:'A condition conflicts',not_assessed:'Facts to investigate'};
const conditionLabel={supported:'Supported',conflicting:'Conflicts',unknown:'Unknown',not_assessed:'Not assessed'};
function placeIdentity(building:CityBuilding,candidate?:CandidateDecision){return candidate?.label&&candidate.label!==building.address?candidate.label:`${building.address} · ${building.bin?'BIN '+building.bin:building.bbl?'BBL '+building.bbl:'record '+building.id}`;}
const scopeLabels={building:'Individual building',building_footprint:'Mapped footprint',parcel:'Entire tax lot',representative_point:'Reference point',operational:'Your proposed operation',benchmark_property:'Reporting property'};
const publicKeys:FactKey[]=['footprint_area_sqft','lot_building_area_sqft','lot_area_sqft','roof_height_ft','zoning','truck_route_distance_m'];
const operationalKeys:OperationalFactKey[]=['usable_area_sqft','clear_height_ft','electrical_capacity_kw','floor_load_psf','loading_docks','delivery_access_confirmed','available_for_use'];
function valueLabel(fact:DecisionFact){
 const value=fact.value;
 if(value===null)return 'Unknown';
 if(Array.isArray(value))return value.join(', ');
 if(typeof value==='boolean')return value?'Yes':'No';
 return `${fmt(value,2)} ${fact.unit==='count'?'':fact.unit}`.trim();
}
function usableGeometry(b:CityBuilding){
 return eligibleOutline(b)!==null;
}
function ContextNotes({building,context,busy,error,onClimate,onInspect,onStory,onEvidence}:{building:CityBuilding;context?:SiteContext;busy?:boolean;error?:string;onClimate:()=>void;onInspect:()=>void;onStory:()=>void;onEvidence:(evidence:SurroundingsEvidence)=>void}){
 const [expanded,setExpanded]=useState(false);
 const hvi=context?.heat?.status==='available'?context.heat.value?.hvi:null;
 const distance=context?.truck?.status==='available'?context.truck.value?.distance_m:null;
 const storm=context?.stormwater?.status==='available'?context.stormwater.value:null;
 return <details className="dw-context" onToggle={event=>setExpanded(event.currentTarget.open)}><summary><span><Layers3 size={14}/>Climate & surroundings</span>{busy?<LoaderCircle className="spin" size={13}/>:<ChevronDown size={14}/>}</summary><div>
  {busy&&<p className="dw-context-progress" role="status">Reading the official context sources…</p>}
  {error&&<p className="dw-context-error">Some context could not be retrieved. Missing information remains unknown.</p>}
  <div className="dw-context-fact"><Thermometer size={16}/><div><strong>{typeof hvi==='number'?`Neighborhood HVI ${fmt(hvi)} / 5`:'Neighborhood heat context unavailable'}</strong><p>Resident heat vulnerability at ZCTA scale. It does not measure indoor temperature or cooling demand.</p></div></div>
  <div className="dw-context-fact"><Truck size={16}/><div><strong>{typeof distance==='number'?`${fmt(distance)} m to a recorded truck route`:'Truck-route proximity unknown'}</strong><p>Straight-line reference-point distance in the recorded network. The last verified dataset update is March 2, 2026; confirm current route designations, entrance access and restrictions with NYC DOT.</p></div></div>
  <div className="dw-context-fact"><Waves size={16}/><div><strong>{storm?`Stormwater map queries: ${storm.queries_succeeded ?? '—'} / ${storm.queries_total ?? '—'}`:'Stormwater context unavailable'}</strong><p>The DEP model describes surrounding ground and treats buildings as voids. A point without a mapped category does not establish safety.</p>{storm&&<details className="dw-source-detail"><summary>Read the reference-point results</summary><p><b>Current sea levels:</b> {String(storm.current?.category??'Unknown')}</p><p><b>2050 sea levels (+30 in):</b> {String(storm.future_2050?.category??'Unknown')}</p><p>2.13 inches of rain in one hour. Categories are scenario outputs, not annual flood probabilities or exact building depths.</p></details>}</div></div>
  {(building.flood_2007===1||building.flood_2015===1)&&<p className="dw-recorded-flag">PLUTO records a {building.flood_2007===1&&building.flood_2015===1?'2007 / 2015':building.flood_2015===1?'2015 preliminary':'2007'} flood-map intersection for the tax lot. Review the source geography and applicable current information.</p>}
  {expanded&&<div className="dw-surroundings"><SurroundingsPanel building={building} compact onStory={onStory} onEvidence={onEvidence}/></div>}
  <div className="dw-context-actions"><button onClick={onInspect}>All source details <ArrowUpRight size={12}/></button><button onClick={onClimate}>Weather & future climate <ArrowRight size={12}/></button></div>
  {context?.retrieved_at&&<small>Context retrieved {context.retrieved_at.slice(0,10)}</small>}
 </div></details>;
}

function CandidateCard({building,result,index,context,busy,error,physicalFrame,onInspect,onRemove,onClimate,onStory,onEvidence}:{building:CityBuilding;result:CandidateDecision;index:number;context?:SiteContext;busy?:boolean;error?:string;physicalFrame?:PhysicalDrawingFrame|null;onInspect:()=>void;onRemove:()=>void;onClimate:()=>void;onStory:()=>void;onEvidence:(evidence:SurroundingsEvidence)=>void}){
 const drawable=usableGeometry(building);
 return <article className={'dw-candidate '+result.status}>
  <div className="dw-candidate-top"><span className="dw-letter">{String.fromCharCode(65+index)}</span><span>{building.borough} · {building.entity_type==='parcel'?'Tax lot':'Building footprint'}</span><button aria-label={'Remove '+placeIdentity(building,result)} onClick={onRemove}><X size={15}/></button></div>
  <button className="dw-candidate-name" aria-label={'Inspect '+placeIdentity(building,result)} onClick={onInspect}><h3>{building.address}</h3><ArrowUpRight size={17}/></button>
  <div className="dw-native-id">{building.bin?'BIN '+building.bin:'No individual BIN'} <span>·</span> BBL {building.bbl||'Unmatched'}</div>
  {building.retrieval&&<p className="dw-record-vintage">{building.retrieval.mode==='source-snapshot'?'Preserved source snapshot':'Official source query'} · {building.retrieval.retrieved_at.slice(0,10)} UTC</p>}
  <div className="dw-footprint">{drawable?<GeoScene features={[{id:building.id,geometry:building.geometry,color:'#315b54',stroke:'#c8f77b',label:undefined}]} physicalFrame={physicalFrame} labels={false} caption={physicalFrame?'Outlines share one scale · not usable floor space':'Individually fitted outline · not usable floor space'}/>:<div className="dw-no-footprint"><Layers3 size={28}/><span>{building.entity_type==='parcel'?'Tax-lot record':'Outline unavailable'}</span><small>{building.entity_type==='parcel'?'No individual building outline is assigned.':'A missing outline is not replaced with an assumed shape.'}</small></div>}</div>
  <dl className="dw-physical-facts"><div><dt>Mapped footprint</dt><dd>{fmt(building.footprint_area_sqft)}<small>{building.footprint_area_sqft===null?'':' sq ft'}</small></dd></div><div><dt>All floor area on tax lot</dt><dd>{fmt(building.lot_building_area_sqft)}<small>{building.lot_building_area_sqft===null?'':' sq ft'}</small></dd></div><div><dt>Buildings on tax lot</dt><dd>{fmt(building.lot_buildings)}</dd></div><div><dt>Recorded roof height</dt><dd>{fmt(building.roof_height_ft,1)}<small>{building.roof_height_ft===null?'':' ft'}</small></dd></div><div className="dw-zoning-fact"><dt>Recorded zoning</dt><dd>{building.zoning?.length?building.zoning.join(' · '):'Unknown'}</dd><small>Recorded districts do not establish permission.</small></div></dl>
  {building.join_warning&&<p className="dw-join-note">{building.join_warning}</p>}
  <div className={'dw-status '+result.status}><span/>{statusLabel[result.status]}</div>
  {!!result.requirements.length&&<div className="dw-condition-results">{result.requirements.map(r=><details key={r.requirementId} className={'dw-condition-result '+r.status}><summary><span>{FACTS[r.factKey].label}{!r.required&&<small>Optional check</small>}</span><b>{conditionLabel[r.status]}</b></summary><div><p>{r.label}</p><p>{r.reason}</p>{r.facts.map(f=><div className="dw-evidence-line" key={f.id}><strong>{valueLabel(f)}</strong><span>{scopeLabels[f.scope]}{f.basis==='user_reported'?' · User report, not independently verified':''}</span>{f.source.url?<a href={f.source.url} target="_blank" rel="noreferrer">{f.source.label}<ArrowUpRight size={11}/></a>:<small>{f.source.label}</small>}{f.reportedAt&&<small>Report dated {f.reportedAt.slice(0,10)}</small>}</div>)}</div></details>)}</div>}
  <ContextNotes building={building} context={context} busy={busy} error={error} onClimate={onClimate} onInspect={onInspect} onStory={onStory} onEvidence={onEvidence}/>
  <div className="dw-candidate-footer"><button aria-label={'Open evidence for '+placeIdentity(building,result)} onClick={onInspect}>Open place evidence <ArrowRight size={13}/></button><a href={building.source||'https://data.cityofnewyork.us/d/5zhs-2jue'} target="_blank" rel="noreferrer" aria-label={'Original source for '+placeIdentity(building,result)}><FileText size={15}/></a></div>
 </article>;
}

/** Mount with a new React key for a new investigation. Local requirements and
 * reports persist while candidates/context change within that investigation. */
export default function DecisionWorkspace({buildings,contexts,contextBusy={},contextErrors={},initialPlan,initialExtras={},initialSurroundings={},loadedEvidence={},onEvidenceCapture,searchQuery,onPlanChange,onExtrasChange,onSurroundingsChange,onInspect,onRemove,onExplore,onRestart,onClimate,onStory}:DecisionWorkspaceProps){
 const [plan,setPlan]=useState<QuestionPlan>(()=>({...initialPlan,requirements:initialPlan.requirements.map(r=>({...r,target:Array.isArray(r.target)?[...r.target]:r.target}))}));
 const [extras,setExtras]=useState<Record<string,CandidateExtras>>(()=>initialExtras);
 const [surroundings,setSurroundings]=useState<Record<string,SurroundingsEvidence|null>>(()=>initialSurroundings);
 useEffect(()=>{onSurroundingsChange?.(surroundings);},[surroundings,onSurroundingsChange]);
 const [skipped,setSkipped]=useState<FactKey[]>([]),[showEditor,setShowEditor]=useState(false),[editorKey,setEditorKey]=useState<FactKey|'times_blank'>('times_blank');
 const [operator,setOperator]=useState<Operator>('gte'),[target,setTarget]=useState(''),[editingId,setEditingId]=useState<string|null>(null),[editorError,setEditorError]=useState('');
 const [reportKey,setReportKey]=useState<OperationalFactKey|null>(null),[reportCandidate,setReportCandidate]=useState(''),[reportValue,setReportValue]=useState(''),[reportSource,setReportSource]=useState(''),[reportDate,setReportDate]=useState(''),[reportUrl,setReportUrl]=useState(''),[reportError,setReportError]=useState('');
 const [downloadNotice,setDownloadNotice]=useState('');
 const seq=useRef(0),instanceId=useId().replaceAll(':','');
 const editorRef=useRef<HTMLDivElement>(null),reportRef=useRef<HTMLDivElement>(null);
 const headingRef=useRef<HTMLHeadingElement>(null);
 const editorSelectRef=useRef<HTMLSelectElement>(null),reportSelectRef=useRef<HTMLSelectElement>(null);
 const editorOpener=useRef<HTMLElement|null>(null),reportOpener=useRef<HTMLElement|null>(null);
 function restoreFocus(opener:React.RefObject<HTMLElement|null>){requestAnimationFrame(()=>{if(opener.current?.isConnected)opener.current.focus({preventScroll:true});else headingRef.current?.focus({preventScroll:true});});}
 function closeEditor(){setShowEditor(false);restoreFocus(editorOpener);}
 function closeReport(){setReportKey(null);restoreFocus(reportOpener);}
 const result=useMemo(()=>evaluateQuestion(plan,buildings,contexts,extras),[plan,buildings,contexts,extras]);
 const physicalFrame=useMemo(()=>commonOutlineFrame(buildings),[buildings]);
 const prompt=nextRequirementPrompt(plan,skipped,result);
 const next=result.nextQuestion;
 const required=plan.requirements.filter(r=>r.required);
 const searchDescription=searchQuery?describeSearchFilters(searchQuery):null;
 const only=buildings.length===1?buildings[0]:null;
 const visibleReports=buildings.flatMap(b=>(extras[b.id]?.operational||[]).map((report,index)=>({building:b,report,index})));
 function updatePlan(nextPlan:QuestionPlan){setPlan(nextPlan);onPlanChange?.(nextPlan);}
 function updateExtras(nextExtras:Record<string,CandidateExtras>){setExtras(nextExtras);onExtrasChange?.(nextExtras);}
 function openEditor(key?:FactKey,existing?:Requirement){
  editorOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setShowEditor(true);setEditorError('');setEditorKey(existing?.factKey||key||'times_blank');setEditingId(existing?.id||null);
  setOperator(existing?.operator||((key&&FACTS[key].type==='boolean')?'eq':key==='zoning'?'in':'gte'));
  setTarget(existing?Array.isArray(existing.target)?existing.target.join(', '):String(existing.target):'');
  requestAnimationFrame(()=>{editorRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});editorSelectRef.current?.focus({preventScroll:true});});
 }
 function changeMeasurement(key:FactKey|'times_blank'){
  setEditorKey(key);setTarget('');setOperator(key==='times_blank'?'gte':FACTS[key].type==='number'?'gte':FACTS[key].type==='codes'?'in':'eq');setEditorError('');
 }
 function saveRequirement(event:FormEvent){
  event.preventDefault();
  if(editorKey==='times_blank'){setEditorError('Choose the measurement this condition should use.');return;}
  const d=FACTS[editorKey];
  if(!target.trim()){setEditorError('State your condition explicitly. No threshold is assumed.');return;}
  const value=d.type==='number'?Number(target):d.type==='boolean'?target==='true':target.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  const original=editingId?plan.requirements.find(r=>r.id===editingId):undefined;
  const requirement=makeRequirement(editorKey,operator,value,{id:editingId||`${instanceId}-condition-${++seq.current}`,required:original?.required??true,...(original?.factKey===editorKey?{scenario:original.scenario,year:original.year}:{})});
  const nextPlan={...plan,requirements:editingId?plan.requirements.map(r=>r.id===editingId?requirement:r):[...plan.requirements,requirement]};
  const issues=validatePlan(nextPlan);if(issues.length){setEditorError(issues[0].message);return;}
  updatePlan(nextPlan);closeEditor();setEditingId(null);setTarget('');setEditorKey('times_blank');
 }
 function openReport(key:OperationalFactKey,candidateId?:string){
  reportOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setReportKey(key);setReportCandidate(candidateId||next?.candidateIds[0]||buildings[0]?.id||'');setReportValue('');setReportSource('');setReportDate('');setReportUrl('');setReportError('');
  requestAnimationFrame(()=>{reportRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});reportSelectRef.current?.focus({preventScroll:true});});
 }
 function saveReport(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!reportKey)return;
  // Native date widgets and browser autofill may dispatch input before change.
  // Read the submitted control as well, so the visible date is authoritative.
  const dateControl=event.currentTarget.elements.namedItem('reportDate') as HTMLInputElement|null;
  const submittedDate=dateControl?dateControl.value:reportDate;
  if(!buildings.some(b=>b.id===reportCandidate)){setReportError('Choose the candidate this report describes.');return;}
  if(!reportValue.trim()||!reportSource.trim()||!submittedDate){setReportError('Add a value, a source description and the report date.');return;}
  const definition=FACTS[reportKey],value=definition.type==='boolean'?reportValue==='true':Number(reportValue);
  const source={id:`user-report-${instanceId}-${++seq.current}`,label:reportSource.trim(),...(reportUrl.trim()?{url:reportUrl.trim()}:{} )};
  const report:ReportedOperationalFact={key:reportKey,value,unit:definition.unit,scope:'operational',source,reportedAt:submittedDate};
  const candidateExtras={...extras[reportCandidate],operational:[...(extras[reportCandidate]?.operational||[]),report]};
  const newExtras={...extras,[reportCandidate]:candidateExtras};
  const check=evaluateQuestion(plan,buildings,contexts,newExtras).candidates.find(c=>c.id===reportCandidate);
  const oldIssues=result.candidates.find(c=>c.id===reportCandidate)?.dataIssues.length||0;
  if(check&&check.dataIssues.length>oldIssues){setReportError(check.dataIssues.at(-1)!);return;}
  updateExtras(newExtras);closeReport();
 }
 function evidenceBundle():InvestigationReceipt{const captured=selectedPlaceEvidence(loadedEvidence,buildings);return{schema:'geonos.question-plan.v2',generated_at:new Date().toISOString(),question_plan:plan,discovery_query:searchQuery||null,discovery_filters:searchDescription,decision:result,buildings,loaded_evidence:captured,context_status:Object.fromEntries(buildings.map(b=>[b.id,contexts[b.id]?'available':contextBusy[b.id]?'loading':contextErrors[b.id]?'unavailable':'not_requested'])),surroundings:Object.fromEntries(buildings.map(b=>[b.id,captured[b.id].surroundings?.data??surroundings[b.id]??initialSurroundings[b.id]??null])),contexts:Object.fromEntries(buildings.map(b=>[b.id,contexts[b.id]??null])),user_reported_evidence:Object.fromEntries(buildings.filter(b=>extras[b.id]).map(b=>[b.id,extras[b.id]])),method:'Deterministic explicit-condition evaluation. Unknown is not a pass. Loaded place evidence is retained with source status; evidence not requested remains distinct from unavailable or no linked records. Weather-studio selections are not included. Public records, operational reports, spatial scope and reporting year remain separate. No overall suitability score, approval or annual flood probability is inferred.'};}
 function briefText(){
  return `GEONOS · PLACE INVESTIGATION\n${new Date().toISOString()}\n\nQUESTION\n${plan.userQuestion||'Understand the supplied places'}\nPURPOSE\n${plan.purpose||'general'}\n\nANSWER\n${result.answer}\n\n${searchDescription?.filters.length?`DISCOVERY FILTERS\n${searchDescription.filters.map(x=>'- '+x).join('\n')}\n${searchDescription.meaning}\n\n`:''}STATED CONDITIONS\n${plan.requirements.length?plan.requirements.map(r=>'- '+describeRequirement(r)+(r.required?'':' [optional]')).join('\n'):'No conditions have been stated. These records have not been assessed for operational fit.'}\n\n${result.candidates.map(c=>{const b=buildings.find(x=>x.id===c.id)!;return `${c.label}\n${c.answer}\nNative footprint ID: ${b.id}; BIN: ${b.bin||'unknown'}; BBL: ${b.bbl||'unmatched'}\nMapped footprint: ${fmt(b.footprint_area_sqft)} sqft; all tax-lot floor area: ${fmt(b.lot_building_area_sqft)} sqft\nRecorded zoning: ${b.zoning?.join(', ')||'unknown'}\nSource: ${b.source}\nRecord retrieval: ${b.retrieval?.retrieved_at||'not available in supplied metadata'}\nContext retrieval: ${contexts[b.id]?.retrieved_at||'not retrieved'}\n${c.requirements.map(r=>`${conditionLabel[r.status]} — ${r.label}\n${r.reason}\n${r.facts.map(f=>`${valueLabel(f)}; ${scopeLabels[f.scope]}; ${f.basis}; ${f.source.label}; ${f.source.url||'no public URL'}${f.reportedAt?'; report dated '+f.reportedAt:''}`).join('\n')}`).join('\n')}\n${c.warnings.concat(c.dataIssues).join('\n')}`;}).join('\n\n')}\n\nNEXT QUESTION\n${next?next.question+'\n'+next.why:'No unresolved stated condition remains. This does not establish overall suitability, availability or permission.'}\n\nMETHOD\nDeterministic, source-linked conditions; no AI answer is simulated. User-entered reports are not independently verified. Mapped outlines are not usable floor area, roof height is not clear height, and reported energy intensity is not available electrical capacity. The DEP stormwater model treats buildings as voids; map intersections do not establish indoor flooding or safety.\n`;
 }
 function download(kind:'txt'|'json'|'html'){
  const blob=new Blob([kind==='txt'?briefText():kind==='html'?renderInvestigationReceipt(evidenceBundle()):JSON.stringify(evidenceBundle(),null,2)],{type:kind==='txt'?'text/plain;charset=utf-8':kind==='html'?'text/html;charset=utf-8':'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`geonos-place-investigation.${kind}`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);setDownloadNotice(`${kind.toUpperCase()} download prepared.`);
 }
 const headline=required.length?result.counts.matches?`${result.counts.matches} ${result.counts.matches===1?'place matches':'places match'} your stated conditions.`:result.counts.conditional?`${result.counts.conditional} ${result.counts.conditional===1?'place still needs':'places still need'} evidence.`:result.counts.conflicts===buildings.length?'None meets every stated condition.':'Some conditions need qualified review.':only?only.address:`${buildings.length} places. Start with what is known.`;
 if(!result.valid)return <section className="dw-empty"><HelpCircle size={35}/><h1>The conditions need clarification.</h1><p>{result.issues.map(issue=>issue.message).join(' ')}</p><button className="button button-lime" onClick={onRestart}>Review the question <ArrowLeft size={15}/></button></section>;
 if(!buildings.length)return <section className="dw-empty"><MapPin size={35}/><h1>Start with a place.</h1><p>Add a real address or search public records to build an investigation.</p><div><button className="button button-lime" onClick={onRestart}>Ask a new question <ArrowRight size={15}/></button><button className="button button-outline" onClick={onExplore}>Explore the map <Map size={15}/></button></div></section>;
 const factsFirst=plan.intent==='understand'&&(!plan.purpose||plan.purpose==='general')&&!plan.requirements.length;
 const conditionsSection=(<section className="dw-conditions" aria-labelledby="dw-condition-heading"><div className="dw-section-heading"><div><span className="dw-eyebrow">YOUR CONDITIONS</span><h2 id="dw-condition-heading">What must a place meet?</h2></div><button className="dw-add-button" onClick={()=>openEditor()}><Plus size={14}/>Add a condition</button></div>
   {plan.requirements.length?<div className="dw-condition-chips">{plan.requirements.map(r=><div key={r.id}><button onClick={()=>openEditor(r.factKey,r)}><SlidersHorizontal size={13}/><span>{describeRequirement(r)}</span></button><button onClick={()=>updatePlan({...plan,requirements:plan.requirements.filter(x=>x.id!==r.id)})} aria-label={'Remove condition '+FACTS[r.factKey].label}><X size={13}/></button></div>)}</div>:<p className="dw-no-conditions">No operating requirements have been set. These records are a factual starting point, not a claim that the places fit a use.</p>}
   {showEditor&&<div className="dw-condition-editor" ref={editorRef}><form onSubmit={saveRequirement} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closeEditor();}}}><div className="dw-editor-title"><h3>{editingId?'Change this condition':'State one condition'}</h3><button type="button" onClick={closeEditor} aria-label="Close condition editor"><X size={16}/></button></div><div className="dw-editor-fields"><label><span>What measurement matters?</span><select ref={editorSelectRef} value={editorKey} onChange={e=>changeMeasurement(e.target.value as FactKey|'times_blank')}><option value="times_blank">Choose a measurement</option>{editorKey!=='times_blank'&&!publicKeys.includes(editorKey)&&!operationalKeys.includes(editorKey as OperationalFactKey)&&editorKey!=='use_permission'&&<option value={editorKey}>{FACTS[editorKey].label} · existing scoped condition</option>}<optgroup label="Public-record screening">{publicKeys.map(k=><option key={k} value={k}>{FACTS[k].label}</option>)}</optgroup><optgroup label="Your actual operation · requires separate evidence">{operationalKeys.map(k=><option key={k} value={k}>{FACTS[k].label}</option>)}</optgroup><option value="use_permission">Permission for the proposed use · qualified review</option></select></label>{editorKey!=='times_blank'&&<><label><span>Condition</span>{FACTS[editorKey].type==='number'?<select value={operator} onChange={e=>setOperator(e.target.value as Operator)}><option value="gte">At least</option><option value="lte">At most</option><option value="eq">Exactly</option></select>:<div className="dw-fixed-operator">{editorKey==='zoning'?'Includes an exact district':'Must be'}</div>}</label><label className="dw-target"><span>{editorKey==='zoning'?'District codes':FACTS[editorKey].type==='boolean'?'Explicit answer':`Your threshold · ${FACTS[editorKey].unit}`}</span>{FACTS[editorKey].type==='boolean'?<select value={target} onChange={e=>setTarget(e.target.value)} required><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></select>:<input required type={editorKey==='zoning'?'text':'number'} min={editorKey==='zoning'?undefined:0} step={editorKey==='loading_docks'?'1':'any'} value={target} onChange={e=>setTarget(e.target.value)} placeholder={editorKey==='zoning'?'e.g. M1-1, M3-1':'No default assumed'}/>}</label></>}</div>{editorKey!=='times_blank'&&<p className="dw-measurement-note"><span>{scopeLabels[FACTS[editorKey].scope]}</span>{FACTS[editorKey].note}</p>}{editorError&&<p className="dw-form-error" role="alert">{editorError}</p>}<button className="button button-lime" type="submit">{editingId?'Update the condition':'Apply this condition'}<ArrowRight size={14}/></button></form></div>}
   {prompt&&!showEditor&&<div className="dw-prompt"><HelpCircle size={20}/><div><span>ONE OPTIONAL QUESTION</span><h3>{prompt.question}</h3><p>No threshold is assumed. Add it only if it matters to your plan.</p><div><button onClick={()=>openEditor(prompt.factKey)}>Set this requirement <ArrowRight size={13}/></button><button onClick={()=>setSkipped([...skipped,prompt.factKey])}>Not needed now</button></div></div></div>}
  </section>);
 const candidateSection=(<section className="dw-candidate-section" aria-labelledby="dw-place-heading"><div className="dw-section-heading"><div><span className="dw-eyebrow">{only?'OFFICIAL RECORDS · THIS PLACE':'SAME QUESTION · DISTINCT PLACES'}</span><h2 id="dw-place-heading">{only?'The place and its records.':'Compare the evidence, side by side.'}</h2></div><span className="dw-source-type"><span/>Public records · source linked</span></div>{physicalFrame&&<p className="dw-scale-note"><strong>Outlines share one scale.</strong> Each place is centered separately, with north at the top. Only eligible building outlines are drawn.</p>}<div className={'dw-candidates '+(only?'single':'')} style={{'--candidate-count':Math.min(buildings.length,4)} as React.CSSProperties}>{buildings.map((b,i)=><CandidateCard key={b.id} building={b} result={result.candidates.find(c=>c.id===b.id)!} index={i} physicalFrame={physicalFrame} context={contexts[b.id]} busy={contextBusy[b.id]} error={contextErrors[b.id]} onInspect={()=>onInspect(b)} onRemove={()=>onRemove(b)} onClimate={()=>onClimate(b)} onStory={()=>onStory('footprint')} onEvidence={evidence=>{setSurroundings(previous=>({...previous,[b.id]:evidence}));onEvidenceCapture?.(b,{surroundings:captureSurroundings(evidence)});}}/>)}</div><p className="dw-scope-reminder"><Layers3 size={14}/>Footprint area, total tax-lot floor area and usable indoor space answer different questions. Their values are never substituted for one another.</p></section>);
 return <div className={'decision-workspace'+(factsFirst?' dw-facts-first':'')}>
  <div className="dw-toolbar"><button onClick={onRestart}><ArrowLeft size={14}/>New question</button><div><button onClick={onExplore}><Plus size={14}/>Explore / add places</button><details className="dw-export"><summary><Download size={14}/>Export<ChevronDown size={12}/></summary><div><button onClick={()=>download('html')}><FileText size={14}/>Visual receipt · print to PDF</button><button onClick={()=>download('txt')}><FileText size={14}/>Readable brief · TXT</button><button onClick={()=>download('json')}><Layers3 size={14}/>Investigation evidence · JSON</button></div></details></div></div>
  <header className="dw-heading"><span className="dw-eyebrow"><span/>{plan.intent==='understand'?'YOUR PLACE BRIEF':plan.intent==='find'?'YOUR CANDIDATE INVESTIGATION':'YOUR COMPARISON'} · NYC PUBLIC RECORDS</span><h1 ref={headingRef} tabIndex={-1}>{headline}</h1><p>{required.length?result.answer:only?`${only.entity_type==='parcel'?`This tax-lot record lists ${fmt(only.lot_area_sqft)} sq ft of land.`:only.footprint_area_sqft?`The mapped building outline covers about ${fmt(only.footprint_area_sqft)} sq ft.`:'The mapped outline area is unavailable.'} ${only.lot_buildings?`The tax lot contains ${fmt(only.lot_buildings)} recorded ${only.lot_buildings===1?'building':'buildings'}`:'The building count on the tax lot is unknown'}${only.lot_building_area_sqft?`, with ${fmt(only.lot_building_area_sqft)} sq ft of total recorded floor area.`:'. Total recorded floor area is unknown.'} Recorded zoning: ${only.zoning?.join(', ')||'unknown'}. Usable space and permission need separate checks.`:`These records describe ${buildings.length} selected places. Compare their physical facts below, then state a condition if you want to assess fit. Usable space, availability and permissions are separate questions.`}</p>
   {required.length>0&&<div className="dw-counts" aria-live="polite"><span className="matches"><b>{result.counts.matches}</b>Match stated conditions</span><span className="conditional"><b>{result.counts.conditional}</b>Need evidence</span><span className="conflicts"><b>{result.counts.conflicts}</b>Have a conflict</span></div>}
   <div className="dw-discovery"><strong>Your question</strong><p>{plan.userQuestion||'Understand these places'}</p><small>Considering: {{general:'the property',warehouse:'warehouse / logistics',cold_storage:'cold storage'}[plan.purpose||'general']}. This purpose guides questions; only the stated conditions are evaluated.</small></div>
   {searchDescription&&searchDescription.filters.length>0&&<details className="dw-discovery"><summary><Search size={12}/>How these records were found <ChevronDown size={12}/></summary><ul>{searchDescription.filters.map(x=><li key={x}>{x}</li>)}</ul><p>{searchDescription.meaning}</p></details>}
  </header>

  {factsFirst?candidateSection:conditionsSection}

  {next&&next.kind!=='define_requirement'&&<section className="dw-next-question" aria-labelledby="dw-next-heading"><div className="dw-next-mark"><HelpCircle size={25}/></div><div><span className="dw-eyebrow">THE NEXT ANSWER THAT COULD MATTER</span><h2 id="dw-next-heading">{next.kind==='verify_fact'&&next.factKey&&operationalKeys.includes(next.factKey as OperationalFactKey)?FACTS[next.factKey].question:next.question}</h2><p>{next.why}</p><div className="dw-next-actions">{next.kind==='verify_fact'&&next.factKey&&operationalKeys.includes(next.factKey as OperationalFactKey)?<button className="button button-lime" onClick={()=>openReport(next.factKey as OperationalFactKey)}>Add a sourced report <Plus size={14}/></button>:next.kind==='reconsider_requirement'?<><button className="button button-lime" onClick={()=>{const r=plan.requirements.find(r=>r.id===next.requirementId);if(r)openEditor(r.factKey,r);}}>Review this condition <SlidersHorizontal size={14}/></button><button className="text-button" onClick={onExplore}>Search other places <ArrowRight size={13}/></button></>:<button className="button button-outline" onClick={()=>{const b=buildings.find(b=>next.candidateIds.includes(b.id));if(b)onInspect(b);}}>Inspect the relevant records <ArrowUpRight size={14}/></button>}</div>{next.branches.length>0&&<details className="dw-outcomes"><summary>What would change with an answer? <ChevronDown size={13}/></summary><div>{next.branches.map(branch=><p key={branch.if}><strong>{branch.if}</strong><span>{branch.then}</span></p>)}</div></details>}</div></section>}

  {reportKey&&<section className="dw-report-editor" ref={reportRef}><form onSubmit={saveReport} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closeReport();}}}><div className="dw-editor-title"><div><span className="dw-eyebrow">YOUR DOCUMENTED EVIDENCE</span><h2>Add a report, with its source.</h2></div><button type="button" onClick={closeReport} aria-label="Close report editor"><X size={17}/></button></div><p className="dw-report-explanation">This becomes an explicitly user-reported fact. GEONOS does not independently verify the document or certify its applicability. Saved here for this investigation; export the evidence to retain it.</p><div className="dw-report-fields"><label><span>Which place?</span><select ref={reportSelectRef} value={reportCandidate} onChange={e=>setReportCandidate(e.target.value)}>{buildings.map(b=><option key={b.id} value={b.id}>{placeIdentity(b,result.candidates.find(c=>c.id===b.id))}</option>)}</select></label><label><span>{FACTS[reportKey].label} · {FACTS[reportKey].unit}</span>{FACTS[reportKey].type==='boolean'?<select value={reportValue} onChange={e=>setReportValue(e.target.value)} required><option value="">Choose a reported answer</option><option value="true">Yes</option><option value="false">No</option></select>:<input type="number" min="0" step={reportKey==='loading_docks'?1:'any'} required value={reportValue} onChange={e=>setReportValue(e.target.value)}/>}</label><label><span>Source document or relevant party</span><input required maxLength={300} value={reportSource} onChange={e=>setReportSource(e.target.value)} placeholder="Document title / confirmation source"/></label><label><span>Report date</span><input type="date" name="reportDate" required value={reportDate} onInput={e=>setReportDate(e.currentTarget.value)} onChange={e=>setReportDate(e.currentTarget.value)}/></label><label className="dw-report-url"><span>Source link <small>optional · HTTPS</small></span><input type="url" maxLength={2000} value={reportUrl} onChange={e=>setReportUrl(e.target.value)} placeholder="https://…"/></label></div>{reportError&&<p className="dw-form-error" role="alert">{reportError}</p>}<button type="submit" className="button button-lime">Save as a user report <Check size={14}/></button></form></section>}

  {factsFirst?conditionsSection:candidateSection}

  {visibleReports.length>0&&<section className="dw-saved-reports"><h2>Your reported evidence</h2><p>Kept separate from the public records. Different reported values remain a conflict to resolve.</p>{visibleReports.map(({building,report,index})=><div key={building.id+':'+index}><FileText size={17}/><div><strong>{placeIdentity(building,result.candidates.find(c=>c.id===building.id))} · {FACTS[report.key].label}</strong><span>{typeof report.value==='boolean'?report.value?'Yes':'No':fmt(report.value,2)} {FACTS[report.key].type==='boolean'?'':report.unit} · {report.source.label} · {report.reportedAt}</span></div><button onClick={()=>updateExtras({...extras,[building.id]:{...extras[building.id],operational:extras[building.id].operational!.filter((_,i)=>i!==index)}})} aria-label={'Remove '+FACTS[report.key].label+' report for '+placeIdentity(building,result.candidates.find(c=>c.id===building.id))}><Trash2 size={15}/></button></div>)}</section>}

  <section className="dw-deeper"><div><span className="dw-eyebrow">READ THE DATA A LITTLE MORE CLOSELY</span><h2>A number needs a boundary.</h2><p>Two short investigations show why the next question can matter more than another score.</p></div><div><button onClick={()=>onStory('footprint')}><Waves size={21}/><span><strong>What does a flood map leave out?</strong><small>Ground, building voids and site-specific questions</small></span><ArrowUpRight size={17}/></button><button onClick={()=>onStory('energy')}><Zap size={21}/><span><strong>Whose energy number is this?</strong><small>Real reporting groups and different denominators</small></span><ArrowUpRight size={17}/></button></div></section>
  <footer className="dw-footer"><span><Check size={14}/>Exports retain the place evidence loaded in this investigation. Climate Studio selections are separate.</span><div><button onClick={()=>download('html')}>Visual receipt <FileText size={13}/></button><button onClick={()=>download('txt')}>Download brief <Download size={13}/></button><button onClick={()=>download('json')}>Evidence JSON <ArrowUpRight size={13}/></button></div></footer>{downloadNotice&&<p className="dw-download-notice" role="status">{downloadNotice}</p>}
 </div>;
}

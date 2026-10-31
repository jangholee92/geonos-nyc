'use client';

import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowDownToLine,ArrowUpRight,Building2,ChevronDown,Layers3,LoaderCircle,LocateFixed,MapPin,RefreshCw,Truck,X} from 'lucide-react';
import type {CityBuilding} from '@/lib/city';
import type {ContextValue,SiteContext} from '@/lib/site-context';
import {commonOutlineFrame,drawOutline,type PhysicalDrawingFrame} from '@/lib/geometry-frame';
import {fetchPublicJson} from '@/lib/public-fetch';
import {ENERGY_SOURCE,type EnergyReport} from '@/lib/energy-evidence';
import {captureSurroundings,type EnergyCaptureData,type EvidenceCapture,type LoadedPlaceEvidence} from '@/lib/investigation-evidence';
import type {SurroundingsEvidence} from '@/lib/surroundings';
import EnergyEvidencePanel from './energy-evidence-panel';
import SurroundingsPanel from './surroundings-panel';
import './map-inspector.css';

export type MapInspectorProps={
  buildings:CityBuilding[];
  contexts:Record<string,SiteContext>;
  busy:Record<string,boolean>;
  errors:Record<string,string>;
  onRemove:(id:string)=>void;
  onClear:()=>void;
  onFocus:(building:CityBuilding)=>void;
  onRetry:(building:CityBuilding)=>void;
  onExport:()=>void;
  onExample:()=>void;
  onEvidenceCapture?:(building:CityBuilding,patch:Partial<Omit<LoadedPlaceEvidence,'identity'>>)=>void;
};

const numeric=(value:unknown,digits=0)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:digits}):'Unknown';
const measure=(value:unknown,unit:string,digits=0)=>typeof value==='number'&&Number.isFinite(value)?`${numeric(value,digits)} ${unit}`:'Unknown';
const date=(value:string|null|undefined)=>value?.slice(0,10)||'Unreported';
const year=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?String(value):'Unknown';
const zoning=(building:CityBuilding)=>building.zoning?.length?building.zoning.join(' · '):'Unknown';
const nativeId=(building:CityBuilding)=>building.entity_type==='parcel'?`BBL ${building.bbl||'unknown'}`:building.bin?`BIN ${building.bin}`:`DOITT ${building.id}`;
const isBuilding=(building:CityBuilding)=>building.entity_type!=='parcel';
function value(context:SiteContext|undefined,key:'heat'|'truck',field:string){return context?.[key]?.status==='available'?context[key].value?.[field]:null;}
function safeSource(url:unknown){return typeof url==='string'&&/^https:\/\/[^\s<>"']+$/.test(url)?url:null;}
function Source({url,children}:{url:unknown;children:ReactNode}){const href=safeSource(url);return href?<a href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={12}/></a>:<span>{children}</span>;}
function Disclosure({title,note,children,className=''}:{title:string;note?:string;children:ReactNode;className?:string}){
  const [requested,setRequested]=useState(false);
  // Mount only after an explicit opening; closing retains the requested evidence.
  return <details className={'mi-disclosure '+className} onToggle={event=>{if(event.currentTarget.open)setRequested(true);}}><summary><span>{title}{note&&<small>{note}</small>}</span><ChevronDown size={15}/></summary>{requested&&<div className="mi-disclosure-body">{children}</div>}</details>;
}
function Outline({building,frame}:{building:CityBuilding;frame:PhysicalDrawingFrame|null}){
  const drawing=drawOutline(building,{plotWidth:132,plotHeight:70,centerX:80,centerY:45},frame);
  if(!drawing)return <div className="mi-outline-empty"><Building2 size={23}/><span>{building.entity_type==='parcel'?'Tax-lot record':'Outline unavailable'}</span></div>;
  return <svg className="mi-outline" viewBox="0 0 160 112" role="img" aria-label={`${building.address}: official outline, ${frame?'shared comparison scale':'individually fitted'}, north up`} data-pixels-per-meter={drawing.pixelsPerMeter}>
    <path d={drawing.path} fill="#366258" stroke="#c8f77b" strokeWidth=".9" fillRule="evenodd"/>
    <path d={`M12 91v3h${drawing.scaleBarMeters*drawing.pixelsPerMeter}v-3`} stroke="#b0c5bd" fill="none"/>
    <text x="12" y="108" fill="#a9c0c7" fontSize="11">{drawing.scaleBarMeters} m</text><text x="148" y="14" textAnchor="end" fill="#a9c0c7" fontSize="11">N ↑</text>
  </svg>;
}
function Identity({building,index,onRemove,onFocus}:{building:CityBuilding;index:number;onRemove:(id:string)=>void;onFocus:(building:CityBuilding)=>void}){
  return <article className={'mi-identity mi-place-'+index}><div className="mi-identity-top"><span className="mi-letter">{index===0?'A':'B'}</span><span>{building.borough||'NYC'}</span><button className="mi-icon-button" onClick={()=>onRemove(building.id)} aria-label={`Remove ${building.address} · ${nativeId(building)}`}><X size={14}/></button></div><button className="mi-address" onClick={()=>onFocus(building)} aria-label={`Focus map on ${building.address} · ${nativeId(building)}`}><strong>{building.address}</strong><LocateFixed size={14}/></button><p>{nativeId(building)}</p></article>;
}
function ContextCell({context,kind,busy}:{context:SiteContext|undefined;kind:'heat'|'truck';busy:boolean}){
  const metric=value(context,kind,kind==='heat'?'hvi':'distance_m');
  const valid=typeof metric==='number'&&Number.isFinite(metric)&&(kind==='heat'?metric>=1&&metric<=5:metric>=0);
  return <>{valid?kind==='heat'?`${numeric(metric)} / 5`:measure(metric,'m'):busy?<span className="mi-pending">Loading…</span>:<span className="mi-unknown">Unknown</span>}</>;
}
function ContextDetail({building,context,busy,error,onRetry}:{building:CityBuilding;context?:SiteContext;busy:boolean;error?:string;onRetry:(building:CityBuilding)=>void}){
  const storm=context?.stormwater;
  const available=(entry:ContextValue|undefined)=>entry?.status==='available';
  const partial=!context||Object.values(context).some(entry=>entry&&typeof entry==='object'&&'status'in entry&&entry.status==='unavailable')||(typeof storm?.value?.queries_succeeded==='number'&&typeof storm?.value?.queries_total==='number'&&storm.value.queries_succeeded<storm.value.queries_total);
  return <div className="mi-context-details">
    <div className="mi-context-status">{busy?<span role="status"><LoaderCircle size={13} className="spin"/>Reading public sources…</span>:<span>{context?`Retrieved ${date(context.retrieved_at)} UTC`:'Context not yet available'}</span>}{!busy&&(partial||error)&&<button onClick={()=>onRetry(building)}><RefreshCw size={13}/>{context?'Retry missing sources':'Load context'}</button>}</div>
    {error&&<p className="mi-warning">Some sources could not be read. Missing values remain unknown.</p>}
    <div className="mi-context-block"><h4>Neighborhood heat vulnerability</h4><p><b><ContextCell context={context} kind="heat" busy={busy}/></b>{context?.heat.value?.zcta?` · ZCTA ${context.heat.value.zcta}`:''}. Resident vulnerability at community scale, not building temperature or cooling demand.</p><Source url={context?.heat.source||'https://data.cityofnewyork.us/d/4mhf-duep'}>NYC Health HVI</Source></div>
    <div className="mi-context-block"><h4>Recorded truck-route proximity</h4><p><b><ContextCell context={context} kind="truck" busy={busy}/></b>{available(context?.truck)&&context?.truck.value?.street?` · ${context.truck.value.street}`:''}. Straight-line distance from the reference point; not driving distance or lawful access.</p><p>Last verified network update: {date(context?.truck.value?.source_data_updated_at)}. Confirm current routes and entrance access with NYC DOT.</p><Source url={context?.truck.source||'https://data.cityofnewyork.us/d/jjja-shxy'}>Recorded route network</Source></div>
    <div className="mi-context-block"><h4>Rainfall scenarios · reference point</h4><dl><div><dt>Current sea levels</dt><dd>{available(storm)?storm?.value?.current?.category||'Unknown':'Unknown'}</dd></div><div><dt>2050 · +30 in sea level</dt><dd>{available(storm)?storm?.value?.future_2050?.category||'Unknown':'Unknown'}</dd></div></dl>{available(storm)&&<p>{numeric(storm?.value?.queries_succeeded)} / {numeric(storm?.value?.queries_total)} source queries completed.</p>}<p>2.13 inches of rain in one hour. The model leaves building interiors out; an absent category is not a safety finding.</p><Source url={storm?.source||'https://services.arcgis.com/at3rDjch5X7i9Bag/ArcGIS/rest/services/Moderate_Flood_SLR_2050/FeatureServer'}>NYC DEP scenario source</Source></div>
    <div className="mi-context-block"><h4>Other planning context</h4><dl><div><dt>Evacuation zone</dt><dd>{available(context?.evacuation)?context?.evacuation.value?.zones?.length?context.evacuation.value.zones.join(', '):'No zone returned at this point':'Unknown'}</dd></div><div><dt>Historical 2050s coastal map</dt><dd>{available(context?.future_flood)?context?.future_flood.value?.inside===true?'Reference point intersects':context?.future_flood.value?.inside===false?'No reference-point intersection':'Unknown':'Unknown'}</dd></div></dl><p>Evacuation planning and the historical NPCC2013 +31 in scenario are separate from the DEP rain scenarios. They do not establish annual risk or safety.</p><div className="mi-link-row"><Source url={context?.evacuation.source||'https://data.cityofnewyork.us/d/epne-qv9x'}>Evacuation zones</Source><Source url={context?.future_flood.source||'https://data.cityofnewyork.us/d/27ya-gqtm'}>Historical coastal map</Source></div></div>
  </div>;
}
/** A bounded local snapshot lookup. Its records retain reporting-property scope. */
export async function readReportedEnergy(building:CityBuilding):Promise<EvidenceCapture<EnergyCaptureData>>{
  const captured_at=()=>new Date().toISOString(),bbl=building.bbl;
  if(!bbl||!/^([1-5])\d{9}$/.test(bbl))return{status:'not_linked',data:null,captured_at:captured_at(),note:'No matched BBL is available for a reporting-property lookup. Energy use remains unknown.'};
  const asset='/data/energy/'+bbl.slice(0,3)+'.json';
  try{
    const data=await fetchPublicJson<Record<string,unknown>>(asset,{label:'ll84-energy-snapshot'});
    if(!data||data.source_id!=='ll84_energy'||data.calendar_year!==2024||!data.records||typeof data.records!=='object'||Array.isArray(data.records))throw Error('Unsupported energy snapshot.');
    const linked=(data.records as Record<string,unknown>)[bbl],records=linked===undefined?[]:linked;
    if(!Array.isArray(records)||records.length>200||records.some(record=>!record||typeof record!=='object'||typeof record.property_id!=='string'||!/^[1-9]\d*$/.test(record.property_id)||record.report_year!==2024||!Array.isArray(record.bbls)||!record.bbls.includes(bbl)))throw Error('Invalid linked energy records.');
    const note=records.length?'Native reporting-property records linked through this BBL. They are not an allocation to the selected footprint.':'No report linked in this snapshot. This does not mean zero energy use.';
    return{status:records.length?'available':'not_linked',captured_at:captured_at(),note,data:{bbl,calendar_year:2024,records:records as EnergyReport[],asset,source_url:ENERGY_SOURCE,reporting_scope_source:data.reporting_scope_source&&typeof data.reporting_scope_source==='object'&&!Array.isArray(data.reporting_scope_source)?data.reporting_scope_source as Record<string,unknown>:null}};
  }catch{return{status:'unavailable',data:null,captured_at:captured_at(),note:'The energy snapshot could not be loaded or validated. No absence or zero consumption is inferred.'};}
}
type EvidenceReporter=MapInspectorProps['onEvidenceCapture'];
function ReportedEnergy({building,onCapture}:{building:CityBuilding;onCapture?:EvidenceReporter}){
  const [capture,setCapture]=useState<EvidenceCapture<EnergyCaptureData>|null>(null),[attempt,setAttempt]=useState(0);
  const reporter=useRef(onCapture);reporter.current=onCapture;
  useEffect(()=>{
    let stopped=false;
    const loading:EvidenceCapture<EnergyCaptureData>={status:'loading',data:null,captured_at:new Date().toISOString(),note:'Reading the preserved 2024 LL84 reporting-property snapshot.'};
    setCapture(loading);reporter.current?.(building,{energy:loading});
    readReportedEnergy(building).then(result=>{if(!stopped){setCapture(result);reporter.current?.(building,{energy:result});}});
    return()=>{stopped=true;};
  },[building.id,building.bbl,building.footprint_edited_at,attempt]);
  return <div className="mi-energy"><EnergyEvidencePanel building={building} records={capture?.data?.records??null} status={capture?.note||'Reading the reported energy record…'}/>{capture?.status==='unavailable'&&<button className="mi-retry-energy" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={13}/>Try the energy source again</button>}</div>;
}
function GroundEvidence({building,onCapture}:{building:CityBuilding;onCapture?:EvidenceReporter}){
  const reporter=useRef(onCapture);reporter.current=onCapture;
  useEffect(()=>{reporter.current?.(building,{surroundings:{status:'loading',data:null,captured_at:new Date().toISOString(),note:'Checking the selected outline against the preserved surrounding-ground snapshot.'}});},[building.id,building.bbl,building.footprint_edited_at]);
  return <SurroundingsPanel building={building} compact onEvidence={(evidence:SurroundingsEvidence)=>reporter.current?.(building,{surroundings:captureSurroundings(evidence)})}/>;
}
function RecordSources({building}:{building:CityBuilding}){
  return <div className="mi-record-sources"><dl><div><dt>Native record</dt><dd>{isBuilding(building)?'DOITT '+building.id:'Tax lot'}</dd></div><div><dt>Tax-lot identity</dt><dd>{building.bbl?'BBL '+building.bbl:'Unknown'}</dd></div><div><dt>Footprint source edit</dt><dd>{date(building.footprint_edited_at)}</dd></div><div><dt>PLUTO version</dt><dd>{building.pluto_version||'Unreported'}</dd></div><div><dt>Record retrieved</dt><dd>{date(building.retrieval?.retrieved_at)}{building.retrieval?.mode==='source-snapshot'?' · preserved snapshot':''}</dd></div></dl>{building.join_warning&&<p className="mi-warning">{building.join_warning}</p>}<div className="mi-link-row"><Source url={building.source}>Original property record</Source>{building.bbl&&<Source url={`https://data.cityofnewyork.us/resource/64uk-42ks.json?$where=bbl%3D${encodeURIComponent(building.bbl)}`}>PLUTO tax-lot record</Source>}<Source url="https://data.cityofnewyork.us/d/5zyy-y8am">LL84 energy disclosures</Source></div><p>Energy disclosures may cover multiple buildings. No energy value or electrical capacity is inferred here.</p></div>;
}

/** Panel content only. Its parent owns the viewport columns and panel scrolling. */
export default function MapInspector({buildings,contexts,busy,errors,onRemove,onClear,onFocus,onRetry,onExport,onExample,onEvidenceCapture}:MapInspectorProps){
  const places=useMemo(()=>[...new Map(buildings.map(building=>[building.id,building])).values()].slice(0,2),[buildings]);
  const frame=useMemo(()=>commonOutlineFrame(places),[places]);
  const compare=places.length===2;
  if(!places.length)return <section className="map-inspector mi-empty" aria-label="Building information"><div className="mi-empty-icon"><MapPin size={26}/></div><span className="mi-overline">START WITH A PLACE</span><h2>Click a building<br/>on the map.</h2><p>See its physical facts and public context. Select a second building to compare them here.</p><button className="mi-example" onClick={onExample}>Try a real building <ArrowUpRight size={15}/></button><small>NYC public records. Unknown values stay unknown.</small></section>;
  const building=places[0];
  const rows:{label:string;value:(b:CityBuilding)=>ReactNode}[]=[
    {label:'Mapped footprint',value:b=>measure(isBuilding(b)?b.footprint_area_sqft:null,'sq ft')},
    {label:'Roof height',value:b=>measure(isBuilding(b)?b.roof_height_ft:null,'ft',1)},
    {label:'Construction year',value:b=>year(isBuilding(b)?b.construction_year:null)},
  ];
  return <section className={'map-inspector '+(compare?'mi-comparison':'mi-single')} aria-label={compare?'Two-building comparison':'Selected building information'}>
    <header className="mi-header"><div><span className="mi-overline">{compare?'COMPARE · A + B':'SELECTED PLACE'}</span><h2>{compare?'Two buildings':isBuilding(building)?'Building details.':'Tax-lot details.'}</h2></div><div className="mi-header-actions"><button className="mi-icon-button" onClick={onExport} aria-label={compare?'Export these two places':'Export this place'} title="Export selected evidence"><ArrowDownToLine size={16}/></button>{compare&&<button className="mi-clear" onClick={onClear}>Clear</button>}</div></header>
    <div className="mi-identities">{places.map((b,index)=><Identity key={b.id} building={b} index={index} onRemove={onRemove} onFocus={onFocus}/>)}</div>
    <div className="mi-outlines" aria-label={frame?'Building outlines at one physical scale':'Building outline'}>{places.map(b=><Outline key={b.id} building={b} frame={frame}/>)}</div>
    <p className="mi-scale-caption">{frame?'One physical scale · north up':compare?'Only eligible outlines are shown':isBuilding(building)?'Official outline · north up':'No building outline inferred'}<span>Not usable floor space</span></p>
    {compare?<table className="mi-table"><caption className="sr-only">Source attributes for {places[0].address} and {places[1].address}; unknown values are not zero.</caption><thead><tr><th scope="col">Attribute</th>{places.map((b,i)=><th key={b.id} scope="col"><span className={'mi-table-letter mi-place-'+i}>{i?'B':'A'}</span><span className="sr-only"> {b.address} · {nativeId(b)}</span></th>)}</tr></thead><tbody><tr className="mi-table-group"><th colSpan={3}>Individual building record</th></tr>{rows.map(row=><tr key={row.label}><th scope="row">{row.label}</th>{places.map(b=><td key={b.id}>{row.value(b)}</td>)}</tr>)}<tr className="mi-table-group"><th colSpan={3}>Entire tax lot · may include other buildings</th></tr><tr><th scope="row">All floor area</th>{places.map(b=><td key={b.id}>{measure(b.lot_building_area_sqft,'sq ft')}</td>)}</tr><tr><th scope="row">Buildings on lot</th>{places.map(b=><td key={b.id}>{numeric(b.lot_buildings)}</td>)}</tr><tr><th scope="row">Recorded zoning</th>{places.map(b=><td className="mi-zoning" key={b.id}>{zoning(b)}</td>)}</tr><tr className="mi-table-group"><th colSpan={3}>Public context · not indoor conditions</th></tr><tr><th scope="row">Community HVI</th>{places.map(b=><td key={b.id}><ContextCell context={contexts[b.id]} kind="heat" busy={!!busy[b.id]}/></td>)}</tr><tr><th scope="row">Truck-route proximity</th>{places.map(b=><td key={b.id}><ContextCell context={contexts[b.id]} kind="truck" busy={!!busy[b.id]}/></td>)}</tr></tbody></table>:<><dl className="mi-single-facts">{rows.map(row=><div key={row.label}><dt>{row.label}</dt><dd>{row.value(building)}</dd></div>)}<div><dt>Recorded zoning</dt><dd className="mi-zoning">{zoning(building)}</dd></div></dl><div className="mi-lot"><div><Layers3 size={13}/><strong>Entire tax lot</strong><span>{building.lot_buildings===null?'Building count unknown':`${numeric(building.lot_buildings)} ${building.lot_buildings===1?'building':'buildings'}`}</span></div><dl><div><dt>All recorded floor area</dt><dd>{measure(building.lot_building_area_sqft,'sq ft')}</dd></div></dl></div><div className="mi-quick-context"><div><span>Community HVI</span><b><ContextCell context={contexts[building.id]} kind="heat" busy={!!busy[building.id]}/></b></div><div><span><Truck size={12}/>Recorded truck route</span><b><ContextCell context={contexts[building.id]} kind="truck" busy={!!busy[building.id]}/></b></div></div></>}
    <p className="mi-boundary-note">Roof height ≠ interior clearance. Zoning ≠ permission. HVI describes a community; route distance is straight line.</p>
    <div className="mi-more">{places.map((b,index)=><div key={b.id} className="mi-place-evidence">{compare&&<h3><span className={'mi-table-letter mi-place-'+index}>{index?'B':'A'}</span>{b.address}</h3>}<Disclosure title="Climate & access context" note={busy[b.id]?'Loading sources…':errors[b.id]?'Some sources unavailable':undefined}><ContextDetail building={b} context={contexts[b.id]} busy={!!busy[b.id]} error={errors[b.id]} onRetry={onRetry}/></Disclosure><Disclosure title="Ground around the outline" note="Current and 2050 rainfall scenarios" className="mi-ground"><GroundEvidence building={b} onCapture={onEvidenceCapture}/></Disclosure><Disclosure title="Reported energy" note="2024 disclosures · reporting-property scope"><ReportedEnergy building={b} onCapture={onEvidenceCapture}/></Disclosure><Disclosure title="Sources & record identity"><RecordSources building={b}/></Disclosure></div>)}</div>
    {!compare&&<footer className="mi-select-next"><Building2 size={14}/><span>Select a second building for an automatic A/B comparison.</span></footer>}
  </section>;
}

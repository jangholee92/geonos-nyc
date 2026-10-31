'use client';
import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownToLine,ArrowUpRight,Building2,Check,ChevronDown,Database,Layers3,LoaderCircle,MapPin,MessageCircle,Search,SlidersHorizontal,Thermometer,X} from 'lucide-react';
import AddressPicker from '@/components/address-picker';
import MapInspector from '@/components/map-inspector';
import MapChat from '@/components/map-chat';
import {addressQuery,type AddressEntry} from '@/lib/address-search';
import {BOROUGHS,queryCity,validateQuery,type CityBuilding,type CityPage,type CityQuery} from '@/lib/city';
import {fetchSiteContext,type SiteContext} from '@/lib/site-context';
import {pickBuildingAtPoint} from '@/lib/map-selection';
import {inspectReviewedPlan,resolveReviewedPlan} from '@/lib/reviewed-plan';
import type {QuestionPlan,CandidateExtras} from '@/lib/decision-plan';
import type {SurroundingsEvidence} from '@/lib/surroundings';
import {retainPlaceEvidence,selectedPlaceEvidence,type LoadedPlaceEvidence,type PlaceEvidenceRegistry} from '@/lib/investigation-evidence';
import '@/components/decision-start.css';
import './map-workspace.css';
const CityMap=lazy(()=>import('@/components/city-map'));
const ClimateStudio=lazy(()=>import('@/components/climate-studio'));
const DecisionWorkspace=lazy(()=>import('@/components/decision-workspace'));
const EnergyStory=lazy(()=>import('@/components/energy-story'));
const SurroundingsStory=lazy(()=>import('@/components/surroundings-story'));
type Any=Record<string,any>;
type Overlay='sources'|'climate'|'energy'|'surroundings'|'conditions'|null;
type SelectionQueue={generation:number;selectionAtStart:number;intents:{id:string;building?:CityBuilding}[]};
const CITY=[-74.26,40.49,-73.69,40.92];
const number=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US'):'—';
const unique=(rows:CityBuilding[])=>[...new Map(rows.map(b=>[b.id,b])).values()];
const fetched=(page:CityPage)=>page.buildings.map(b=>({...b,retrieval:{mode:'live-query' as const,retrieved_at:page.fetched_at}}));
function validQuery(query:CityQuery){return validateQuery(new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v)])));}
function save(name:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export default function Home(){
 const [address,setAddress]=useState<AddressEntry>({text:'',match:null});
 const [items,setItems]=useState<CityBuilding[]>([]),[selected,setSelected]=useState<CityBuilding[]>([]),[page,setPage]=useState<CityPage|null>(null);
 const [query,setQuery]=useState<CityQuery>({unit:'building',limit:200});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pendingSelection,setPendingSelection]=useState(0);
 const [contexts,setContexts]=useState<Record<string,SiteContext>>({}),[contextBusy,setContextBusy]=useState<Record<string,boolean>>({}),[contextErrors,setContextErrors]=useState<Record<string,string>>({});
 const [boundary,setBoundary]=useState<Any|null>(null),[overview,setOverview]=useState<Any|null>(null),[catalog,setCatalog]=useState<Any[]>([]);
 const [layerId,setLayerId]=useState('footprints'),[layer,setLayer]=useState<Any|null>(null),[layerBusy,setLayerBusy]=useState(false),[layerError,setLayerError]=useState(''),[layerFeature,setLayerFeature]=useState<Any|null>(null);
 const [bounds,setBounds]=useState<number[]>(CITY),[focus,setFocus]=useState<CityBuilding|null>(null),[focusBorough,setFocusBorough]=useState('all'),[focusToken,setFocusToken]=useState(0);
 const [mobilePanel,setMobilePanel]=useState<'map'|'building'|'chat'>('map'),[overlay,setOverlay]=useState<Overlay>(null),[resultsOpen,setResultsOpen]=useState(false),[filtersOpen,setFiltersOpen]=useState(false);
 const [borough,setBorough]=useState('all'),[minArea,setMinArea]=useState(''),[zoning,setZoning]=useState('all');
 const [plan,setPlan]=useState<QuestionPlan>({intent:'understand',purpose:'general',userQuestion:'What should I know about this building?',requirements:[]}),[planVersion,setPlanVersion]=useState(0);
 const [climate,setClimate]=useState<Any|null>(null),[projections,setProjections]=useState<Any|null>(null),[climateMode,setClimateMode]=useState<'observed'|'paired'|'future'>('observed');
 const [loadedEvidence,setLoadedEvidence]=useState<PlaceEvidenceRegistry>({}),[extras,setExtras]=useState<Record<string,CandidateExtras>>({}),[surroundings,setSurroundings]=useState<Record<string,SurroundingsEvidence|null>>({});
 const retainEvidence=useCallback((building:CityBuilding,patch:Partial<Omit<LoadedPlaceEvidence,'identity'>>)=>setLoadedEvidence(previous=>retainPlaceEvidence(previous,building,patch)),[]);
 const selectionQueue=useRef<SelectionQueue|null>(null);
 const requestGeneration=useRef(0),selectionGeneration=useRef(0),pointGeneration=useRef(0),selectedRef=useRef(selected),contextRequests=useRef<Record<string,number>>({}),pendingContexts=useRef(new Set<string>());
 selectedRef.current=selected;
 const initialStarted=useRef(false),dialog=useRef<HTMLDialogElement>(null),layerCache=useRef<Record<string,Any>>({});
 const currentLayer=catalog.find(c=>c.id===layerId),mappedLayers=catalog.filter(c=>c.asset?.endsWith('.geojson')&&c.map!==false);
 const mapBuildings=useMemo(()=>unique([...items,...selected]),[items,selected]);
 async function context(building:CityBuilding,force=false){
  if(!force&&(contexts[building.id]||pendingContexts.current.has(building.id)))return;
  const generation=(contextRequests.current[building.id]||0)+1;contextRequests.current[building.id]=generation;pendingContexts.current.add(building.id);
  setContextBusy(s=>({...s,[building.id]:true}));setContextErrors(s=>({...s,[building.id]:''}));
  try{const result=await fetchSiteContext(building.id,force);if(contextRequests.current[building.id]===generation)setContexts(s=>({...s,[building.id]:result}));}
  catch(reason:any){if(contextRequests.current[building.id]===generation)setContextErrors(s=>({...s,[building.id]:reason.message||'Source context is unavailable.'}));}
  finally{if(contextRequests.current[building.id]===generation){pendingContexts.current.delete(building.id);setContextBusy(s=>({...s,[building.id]:false}));}}
 }
 function cancelPendingSelections(){selectionQueue.current=null;setPendingSelection(0);}
 function commitBuildingSelection(building:CityBuilding){
  setNotice('');const previous=selectedRef.current;
  if(previous.some(b=>b.id===building.id)){setMobilePanel('building');return;}
  const next=previous.length<2?[...previous,building]:[previous[0],building];
  if(previous.length===2)setNotice('Building B replaced. A stays pinned for comparison.');
  selectedRef.current=next;setSelected(next);setMobilePanel('building');void context(building);
 }
 async function drainSelectionQueue(queue:SelectionQueue){
  const current=()=>selectionQueue.current===queue&&queue.generation===pointGeneration.current&&queue.selectionAtStart===selectionGeneration.current;
  while(current()&&queue.intents.length){
   const intent=queue.intents[0];
   try{
    let building=intent.building;
    if(!building){
     // Tiles contribute identity only; the full outline and facts come from the official source.
     const resolved=await resolveReviewedPlan({plan:{intent:'understand',userQuestion:'Inspect selected building',requirements:[]},ids:[intent.id]});
     if(!current())return;
     if(resolved.buildings.length!==1||resolved.buildings[0].id!==intent.id||resolved.buildings[0].entity_type!=='building')throw Error('The source did not return the requested building. Your existing selections are unchanged.');
     building=resolved.buildings[0];
    }
    if(!current())return;commitBuildingSelection(building);
   }catch(reason:any){if(!current())return;setError(reason.message||'The building lookup is unavailable. Your existing selections are unchanged.');}
   queue.intents.shift();setPendingSelection(queue.intents.length);
  }
  if(current()){selectionQueue.current=null;setPendingSelection(0);}
 }
 function enqueueSelection(id:string,building?:CityBuilding){
  const active=selectionQueue.current;
  if(active&&active.generation===pointGeneration.current&&active.selectionAtStart===selectionGeneration.current){
   if(active.intents.some(intent=>intent.id===id)||selectedRef.current.some(b=>b.id===id)){setMobilePanel('building');return;}
   // Preserve the active click and the latest waiting B choice, bounding source work.
   if(active.intents.length===1)active.intents.push({id,building});else active.intents[1]={id,building};
   setPendingSelection(active.intents.length);return;
  }
  const queue:SelectionQueue={generation:++pointGeneration.current,selectionAtStart:++selectionGeneration.current,intents:[{id,building}]};
  selectionQueue.current=queue;setError('');setNotice('');setPendingSelection(1);void drainSelectionQueue(queue);
 }
 function selectBuilding(building:CityBuilding){enqueueSelection(building.id,building);}
 function removeBuilding(id:string){cancelPendingSelections();selectionGeneration.current++;pointGeneration.current++;setNotice('');const next=selectedRef.current.filter(b=>b.id!==id);selectedRef.current=next;setSelected(next);}
 function clearSelection(){cancelPendingSelections();selectionGeneration.current++;pointGeneration.current++;setNotice('');selectedRef.current=[];setSelected([]);setExtras({});setSurroundings({});setPlan(p=>({...p,requirements:[]}));setPlanVersion(v=>v+1);}
 async function loadRecords(params:CityQuery,options:{append?:boolean;focusFirst?:boolean;selectSingle?:boolean}={}){
  cancelPendingSelections();const generation=++requestGeneration.current,selectionAtStart=selectionGeneration.current;pointGeneration.current++;setBusy(true);setError('');setNotice('');
  try{
   const checked=validQuery(params),result=await queryCity(checked);if(generation!==requestGeneration.current)return;
   const rows=fetched(result);setItems(old=>options.append?unique([...old,...rows]):rows);setPage(result);setQuery(result.query);setFiltersOpen(false);
   if(options.focusFirst&&rows.length&&selectionAtStart===selectionGeneration.current){setFocus(rows[0]);setFocusToken(v=>v+1);}
   if(options.selectSingle&&rows.length===1&&selectionAtStart===selectionGeneration.current)selectBuilding(rows[0]);
   if(options.selectSingle&&rows.length!==1&&selectionAtStart===selectionGeneration.current){setResultsOpen(true);setNotice(rows.length?'This address has multiple official outlines. Choose the building you mean.':'No linked building was returned for this address.');}
   return result;
  }catch(reason:any){if(generation===requestGeneration.current)setError(reason.message||'The official records could not be retrieved.');}
  finally{if(generation===requestGeneration.current)setBusy(false);}
 }
 async function searchAddress(event?:React.FormEvent){event?.preventDefault();const q=addressQuery(address);if(!q){setError('Choose a matching address suggestion, or enter a 7-digit BIN / 10-digit BBL.');return;}setResultsOpen(false);await loadRecords({unit:'building',q,limit:200},{focusFirst:true,selectSingle:true});}
 function selectByNativeId(id:string){
  if(!/^[1-9]\d{0,9}$/.test(id)){setError('This map feature has no valid native building ID. Your selection is unchanged.');return;}
  const known=selectedRef.current.find(b=>b.id===id)||mapBuildings.find(b=>b.id===id);enqueueSelection(id,known);
 }
 async function selectAtPoint(point:[number,number]){
  const known=pickBuildingAtPoint(mapBuildings,point);if(known){selectBuilding(known);return;}
  cancelPendingSelections();const generation=++pointGeneration.current,selectionAtStart=++selectionGeneration.current;setError('');setNotice('Finding the official building at this point…');
  try{
   const result=await queryCity(validQuery({unit:'building',bbox:[point[0]-.00008,point[1]-.00006,point[0]+.00008,point[1]+.00006],limit:100}));
   if(generation!==pointGeneration.current||selectionAtStart!==selectionGeneration.current)return;
   const rows=fetched(result),building=pickBuildingAtPoint(rows,point);
   if(building){setNotice('');selectBuilding(building);}else setNotice('No official building outline contains this point. Click a building outline or search its address.');
  }catch(reason:any){if(generation===pointGeneration.current&&selectionAtStart===selectionGeneration.current){setNotice('');setError(reason.message||'The building lookup is unavailable. Your selection is unchanged.');}}
 }
 function searchView(){const box=[Math.max(CITY[0],bounds[0]),Math.max(CITY[1],bounds[1]),Math.min(CITY[2],bounds[2]),Math.min(CITY[3],bounds[3])];if(box[0]>=box[2]||box[1]>=box[3]){setNotice('Move the map back to New York City.');return;}setResultsOpen(false);void loadRecords({unit:'building',bbox:box,limit:250});}
 async function openReturnedSearch(params:CityQuery){if(params.unit==='parcel')throw Error('This map selects building outlines. Ask Meta for a building search to open it here.');const result=await loadRecords(validQuery(params),{focusFirst:true});if(!result)throw Error('The returned search could not be opened. Your selected buildings are unchanged.');setResultsOpen(true);}
 async function applyReviewed(payload:unknown){
  const inspected=inspectReviewedPlan(payload);if(!inspected.ok)throw Error(inspected.error);
  if(inspected.descriptor.ids.length>2)throw Error('This workspace compares two buildings. Ask Meta to narrow the plan to one or two.');
  if(inspected.descriptor.ids.some(id=>id.startsWith('p:')))throw Error('This workspace selects building outlines. Ask Meta for building records rather than tax lots.');
  cancelPendingSelections();const generation=++selectionGeneration.current,requestAtStart=++requestGeneration.current;pointGeneration.current++;setBusy(false);
  const resolved=await resolveReviewedPlan(inspected.descriptor);
  if(generation!==selectionGeneration.current||requestAtStart!==requestGeneration.current)throw Error('The selection changed while records were refreshing. Review the new selection before applying a plan.');
  selectedRef.current=resolved.buildings;setSelected(resolved.buildings);setPlan(resolved.plan);setPlanVersion(v=>v+1);setFocus(resolved.buildings[0]);setMobilePanel('building');
  resolved.buildings.forEach(b=>void context(b,true));setOverlay('conditions');
 }
 async function showExample(){setError('');setResultsOpen(false);await loadRecords({unit:'building',q:'3008210',limit:50},{focusFirst:true,selectSingle:true});}
 async function compareExample(){
  cancelPendingSelections();const generation=++selectionGeneration.current,requestAtStart=++requestGeneration.current;pointGeneration.current++;setBusy(true);setError('');setNotice('');
  try{const results=await Promise.all(['3008210','3008212'].map(q=>queryCity({unit:'building',q,limit:50})));if(generation!==selectionGeneration.current||requestAtStart!==requestGeneration.current)return;if(results.some(r=>r.buildings.length!==1))throw Error('Each example address must resolve to exactly one official building.');const rows=unique(results.flatMap(fetched));if(rows.length!==2)throw Error('The two example records could not be resolved uniquely.');selectedRef.current=rows;setSelected(rows);setFocus(rows[0]);rows.forEach(b=>void context(b));setMobilePanel('building');}
  catch(reason:any){if(generation===selectionGeneration.current&&requestAtStart===requestGeneration.current)setError(reason.message||'Example records are unavailable.');}finally{if(requestAtStart===requestGeneration.current)setBusy(false);}
 }
 function exportSelection(){save('geonos-selected-buildings.json',{schema:'geonos.map-selection.v1',generated_at:new Date().toISOString(),buildings:selected,contexts:Object.fromEntries(selected.map(b=>[b.id,{value:contexts[b.id]||null,status:contextBusy[b.id]?'loading':contexts[b.id]?'available':contextErrors[b.id]?'unavailable':'not_requested'}])),query,conditions:plan,loaded_evidence:selectedPlaceEvidence(loadedEvidence,selected),user_reports:Object.fromEntries(selected.filter(b=>extras[b.id]).map(b=>[b.id,extras[b.id]])),method:'Official building and tax-lot attributes retain their scope. Context is not a site-specific safety or suitability determination. Energy, detailed surroundings and operational conditions are available in the separate evidence/conditions views.'});}
 const onBounds=useCallback((next:number[])=>setBounds(next),[]);
 useEffect(()=>{
  if(initialStarted.current)return;initialStarted.current=true;
  const read=async(path:string)=>{const r=await fetch(path);if(!r.ok)throw Error('Unable to load '+path);return r.json() as Promise<Any>;};
  void read('/data/boroughs.geojson').then(setBoundary).catch(()=>setNotice('The boundary preview is unavailable. Official building search remains available.'));
  void read('/data/citywide/overview_grid.json').then(setOverview).catch(()=>{});
  void read('/data/catalog.json').then(d=>setCatalog(d.layers||d)).catch(()=>setNotice('The layer catalog could not load. Reload to retry.'));
 },[]);
 useEffect(()=>{
  setLayerFeature(null);setLayerError('');setLayer(null);
  if(!currentLayer?.asset?.endsWith('.geojson')){setLayerBusy(false);return;}
  if(layerCache.current[layerId]){setLayer(layerCache.current[layerId]);setLayerBusy(false);return;}
  let canceled=false;setLayerBusy(true);
  fetch(currentLayer.asset).then(r=>{if(!r.ok)throw Error();return r.json() as Promise<Any>;}).then(d=>{layerCache.current[layerId]=d;if(!canceled)setLayer(d);}).catch(()=>{if(!canceled)setLayerError('This layer could not load. Choose another layer or reload to retry.');}).finally(()=>{if(!canceled)setLayerBusy(false);});return()=>{canceled=true;};
 },[layerId,currentLayer?.asset]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6500);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{if(overlay)cancelPendingSelections();if(overlay&&!dialog.current?.open)dialog.current?.showModal();if(!overlay&&dialog.current?.open)dialog.current.close();},[overlay]);
 useEffect(()=>{if(overlay!=='climate')return;for(const [url,set] of [['/data/climate/station_climate.json',setClimate],['/data/climate/npcc4_projections.json',setProjections]] as const)fetch(url).then(r=>{if(!r.ok)throw Error();return r.json() as Promise<Any>;}).then(set).catch(()=>setError('Climate data could not load. Close and reopen to retry.'));},[overlay]);
 useEffect(()=>()=>{selectionQueue.current=null;pointGeneration.current++;selectionGeneration.current++;},[]);
 useEffect(()=>{const handle=(event:KeyboardEvent)=>{if(event.key==='Escape'){setResultsOpen(false);setFiltersOpen(false);setLayerFeature(null);setMobilePanel('map');}if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes((event.target as HTMLElement).tagName)){event.preventDefault();document.querySelector<HTMLInputElement>('.mw-search input')?.focus();}};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[]);
 return <main className="map-workspace">
  <header className="mw-header"><a href="#map" className="mw-brand" aria-label="GEONOS map workspace" onClick={event=>{event.preventDefault();setMobilePanel('map');}}><Layers3 size={25}/><span>GEONOS<small>NEW YORK CITY</small></span></a><form className="mw-search" onSubmit={searchAddress}><AddressPicker value={address} onChange={setAddress} label="Search NYC address, BIN or BBL" placeholder="Search an NYC address…"/><button type="submit" aria-label="Find this address" disabled={busy}><Search size={18}/></button></form><button className="mw-data-button" aria-label="Data & methods" onClick={()=>setOverlay('sources')}><Database size={15}/><span>Data & methods</span></button></header>
  <div className="mw-layout">
   <aside className={'mw-inspector '+(mobilePanel==='building'?'mw-mobile-open':'')} aria-label="Selected building information"><div className="mw-mobile-close"><strong>Building information</strong><button onClick={()=>setMobilePanel('map')} aria-label="Close building panel"><X size={19}/></button></div><MapInspector buildings={selected} contexts={contexts} busy={contextBusy} errors={contextErrors} onRemove={removeBuilding} onClear={clearSelection} onFocus={b=>{setFocus({...b});setMobilePanel('map');}} onRetry={b=>void context(b,true)} onExport={exportSelection} onExample={()=>void showExample()} onEvidenceCapture={retainEvidence}/>{selected.length>0&&<div className="mw-inspector-footer"><button onClick={()=>setOverlay('conditions')}><Check size={14}/>Check my requirements<ArrowUpRight size={13}/></button></div>}</aside>
   <section className="mw-map" aria-label="Interactive NYC building map">
    <Suspense fallback={<div className="mw-map-loading"><LoaderCircle className="spin"/>Loading the map…</div>}><CityMap compact buildings={mapBuildings} selectedIds={selected.map(b=>b.id)} activeId={selected.at(-1)?.id} boundary={boundary} overview={overview} layer={layer} layerId={layerId} onSelect={selectBuilding} onSelectId={selectByNativeId} onMapPoint={point=>void selectAtPoint(point)} onFeature={setLayerFeature} onBounds={onBounds} focusBorough={focusBorough} focusToken={focusToken} focusBuilding={focus} queryCaption="Click one building to inspect · two to compare"/></Suspense>
    <div className="mw-map-toolbar"><label className="mw-layer"><Layers3 size={16}/><select aria-label="Visualization layer" value={layerId} onChange={e=>setLayerId(e.target.value)}><option value="footprints">Building footprints</option><option value="density">Citywide building density</option><option value="flood">Recorded flood intersections</option>{mappedLayers.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><ChevronDown size={14}/></label><button className="mw-tool" aria-label="Filter public records" title="Filter public records" aria-expanded={filtersOpen} onClick={()=>{setFiltersOpen(v=>!v);setResultsOpen(false);}}><SlidersHorizontal size={17}/></button></div>
    <button className="mw-search-view" onClick={searchView} disabled={busy}>{busy?<LoaderCircle size={14} className="spin"/>:<Search size={14}/>} {busy?'Searching records…':'Search records in this view'}</button>
    {filtersOpen&&<form className="mw-filter-popover" onSubmit={e=>{e.preventDefault();setFocusBorough(borough);setFocus(null);setFocusToken(v=>v+1);void loadRecords({unit:'building',borough,minArea:Number(minArea)||0,zoning,limit:200});}}><div><strong>Find public records</strong><button type="button" aria-label="Close filters" onClick={()=>setFiltersOpen(false)}><X size={16}/></button></div><label>Borough<select value={borough} onChange={e=>setBorough(e.target.value)}><option value="all">All five boroughs</option>{Object.entries(BOROUGHS).map(([id,b])=><option key={id} value={id}>{b.name}</option>)}</select></label><label>Minimum lot floor area · ft²<input type="number" min="0" max="1000000000" value={minArea} onChange={e=>setMinArea(e.target.value)} placeholder="Any size"/></label><label>Zoning family<select value={zoning} onChange={e=>setZoning(e.target.value)}><option value="all">All districts</option><option value="M">Manufacturing</option><option value="C">Commercial</option><option value="R">Residential</option></select></label><p>Floor area covers all buildings on a tax lot. These records do not establish usable space, availability or permission.</p><button type="submit" className="button button-lime" disabled={busy}>Find buildings<ArrowUpRight size={14}/></button></form>}
    <div className="mw-map-bottom"><button onClick={()=>{setResultsOpen(v=>!v);setFiltersOpen(false);}} aria-expanded={resultsOpen}><Building2 size={14}/>{number(items.length)} {items.length===1?'search result':'search results'}{page?.has_more?' · more pages':''}<ChevronDown size={13}/></button><span>1.08M source footprints · NYC OTI</span></div>
    {resultsOpen&&<div className="mw-results" aria-label="Building search results"><header><strong>Search results</strong><button aria-label="Close building list" onClick={()=>setResultsOpen(false)}><X size={16}/></button></header><p>{page?.matched_parcels!==undefined?number(page.matched_parcels)+' matching tax lots · ':''}Bounded search results. Additional buildings remain visible on the citywide map.</p><div className="mw-results-scroll">{items.map(b=><button key={b.id} className={selected.some(x=>x.id===b.id)?'is-selected':''} onClick={()=>{selectBuilding(b);setResultsOpen(false);}}><MapPin size={14}/><span><strong>{b.address}</strong><small>{b.borough} · BIN {b.bin||'unavailable'}</small></span>{selected.some(x=>x.id===b.id)&&<Check size={14}/>}</button>)}{!items.length&&<p>No search results yet. Search an address or the current map view.</p>}</div>{page?.has_more&&<button className="mw-more" disabled={busy} onClick={()=>void loadRecords({...query,cursor:page.next_cursor||0,page:page.next_cursor?query.page||0:page.next_page||0},{append:true})}>{busy?'Loading…':'Load next search page'}</button>}</div>}
    {layerBusy&&<div className="mw-layer-status" role="status"><LoaderCircle size={13} className="spin"/>Loading visualization…</div>}{(error||layerError)&&<div className="mw-map-error" role="alert"><span>{error||layerError}</span><button aria-label="Dismiss source error" onClick={()=>{setError('');setLayerError('');}}><X size={14}/></button></div>}{pendingSelection>0?<div className="mw-notice" role="status"><LoaderCircle size={14} className="spin"/> {pendingSelection===1?'Retrieving the selected building…':'Retrieving selections in click order…'}</div>:notice&&<div className="mw-notice" role="status">{notice}</div>}
    {currentLayer&&!layerFeature&&<details className="mw-layer-note"><summary>About this layer</summary><p>{currentLayer.title}. {currentLayer.display_only?'Simplified display geometry. ':''}{currentLayer.method||currentLayer.scope}</p><a href={currentLayer.url||currentLayer.source_url} target="_blank" rel="noreferrer">Original source ↗</a></details>}
    {layerFeature&&<div className="mw-feature"><header><strong>{layerFeature.label||currentLayer?.title||'Selected map feature'}</strong><button aria-label="Close map feature" onClick={()=>setLayerFeature(null)}><X size={16}/></button></header><details open><summary>Source attributes</summary><dl>{Object.entries(layerFeature).filter(([key])=>!key.startsWith('_geo')).map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{typeof value==='object'?JSON.stringify(value):String(value??'Unknown')}</dd></div>)}</dl></details></div>}
   </section>
   <aside className={'mw-chat '+(mobilePanel==='chat'?'mw-mobile-open':'')} aria-label="Meta assistant"><div className="mw-mobile-close"><strong>Meta assistant</strong><button onClick={()=>setMobilePanel('map')} aria-label="Close Meta panel"><X size={19}/></button></div><MapChat selected={selected} query={query} onApplyReviewed={applyReviewed} onOpenSearch={openReturnedSearch}/></aside>
  </div>
  <nav className="mw-mobile-switch" aria-label="Workspace panels"><button className={mobilePanel==='map'?'active':''} onClick={()=>setMobilePanel('map')}><Layers3 size={17}/>Map</button><button className={mobilePanel==='building'?'active':''} onClick={()=>setMobilePanel('building')}><Building2 size={17}/>{selected.length===2?'Compare':'Building'}<b>{selected.length}</b></button><button className={mobilePanel==='chat'?'active':''} onClick={()=>setMobilePanel('chat')}><MessageCircle size={17}/>Meta</button></nav>
  <dialog ref={dialog} className="mw-dialog" onCancel={()=>setOverlay(null)}><header><div><span>GEONOS / EVIDENCE</span><h2>{{sources:'Data & methods',climate:'Climate evidence',energy:'Whose energy number is this?',surroundings:'Look outside the building',conditions:'Your requirements'}[overlay||'sources']}</h2></div><button aria-label="Close evidence window" onClick={()=>setOverlay(null)}><X size={22}/></button></header><div className="mw-dialog-body"><Suspense fallback={<p>Loading evidence…</p>}>
   {overlay==='sources'&&<><p className="mw-source-intro">Official records, measurement boundaries, and the methods behind this map. Public data work without a Meta connection.</p><div className="mw-evidence-shortcuts"><button onClick={()=>setOverlay('climate')}><Thermometer size={17}/>Climate history & futures<ArrowUpRight size={15}/></button><button onClick={()=>setOverlay('energy')}>Energy reporting boundaries<ArrowUpRight size={15}/></button><button onClick={()=>setOverlay('surroundings')}>Stormwater model boundaries<ArrowUpRight size={15}/></button><a href="/reports/GEONOS-Evidence-Atlas.pdf" target="_blank" rel="noreferrer"><ArrowDownToLine size={17}/>Visual evidence guide · PDF</a></div><div className="mw-source-list"><details><summary><span>How Meta contributes<small>Six distinct model roles · invoked only when needed</small></span><ChevronDown size={15}/></summary><p>Spark carries the conversation and retrieves official records. The + menu prepares a question for you to review; choosing an item does not send it.</p><ul><li><strong>Muse Spark:</strong> natural conversation and bounded source retrieval.</li><li><strong>SAM 3.1:</strong> roof and tree masks on actual dated NYS aerial images.</li><li><strong>Muse Wonder:</strong> a second review of public evidence, or a planned review of paired SAM summaries. It receives summaries, not image pixels.</li><li><strong>Muse Image:</strong> a labelled inspection concept, never source evidence or a verified design.</li><li><strong>Muse Voice:</strong> an editable transcript of a short recording. Review before adding it to a message.</li><li><strong>Meta DINOv2:</strong> browser-based visual-feature comparison of Spring 2020 and 2024 photos. Highlighted differences are inspection prompts, not verified change or risk.</li></ul><p>Each result identifies the work that actually completed. Missing analyses stay unknown. A content-filter refusal is not retried through another model.</p><div><a href="https://dev.meta.ai/docs/models" target="_blank" rel="noreferrer">Meta model documentation ↗</a><a href="https://github.com/facebookresearch/dinov2" target="_blank" rel="noreferrer">DINOv2 pretrained model ↗</a></div></details>{catalog.map(c=><details key={c.id}><summary><span>{c.title}<small>{c.publisher||'Public source'}</small></span><b>{c.status}</b><ChevronDown size={15}/></summary><p>{c.method||c.description||c.scope}</p><p>{c.scope}</p><ul>{(Array.isArray(c.caveats)?c.caveats:[c.caveats]).filter(Boolean).map((c:string,i:number)=><li key={i}>{c}</li>)}</ul><div><a href={c.url||c.source_url} target="_blank" rel="noreferrer">Original source ↗</a>{c.asset&&<a href={c.asset} download>{c.asset.includes('citywide_counts')?'Download archive counts':c.asset.includes('/energy/index')?'Download reporting index':c.display_only?'Download map preview':'Download data product'} ↓</a>}</div></details>)}</div></>}
   {overlay==='climate'&&<ClimateStudio climate={climate} projections={projections} mode={climateMode} onModeChange={setClimateMode}/>}
   {overlay==='energy'&&<EnergyStory onBack={()=>setOverlay('sources')} onPlace={bin=>{setOverlay(null);void loadRecords({unit:'building',q:bin,limit:200},{focusFirst:true,selectSingle:true});}}/>}
   {overlay==='surroundings'&&<SurroundingsStory onBack={()=>setOverlay('sources')} onCompare={()=>{setOverlay(null);void compareExample();}} compareBusy={busy}/>}
   {overlay==='conditions'&&<DecisionWorkspace key={planVersion} buildings={selected} contexts={contexts} contextBusy={contextBusy} contextErrors={contextErrors} initialPlan={{...plan,intent:selected.length===2?'compare':'understand'}} initialExtras={extras} onExtrasChange={setExtras} initialSurroundings={surroundings} onSurroundingsChange={setSurroundings} loadedEvidence={loadedEvidence} onEvidenceCapture={retainEvidence} onPlanChange={setPlan} onInspect={b=>{setOverlay(null);setFocus(b);setMobilePanel('building');}} onRemove={b=>removeBuilding(b.id)} onExplore={()=>setOverlay(null)} onRestart={()=>{setOverlay(null);clearSelection();}} onClimate={()=>setOverlay('climate')} onStory={choice=>setOverlay(choice==='energy'?'energy':'surroundings')}/>}
  </Suspense></div></dialog>
 </main>;
}

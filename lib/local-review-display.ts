import type {LocalGlimmerReview,LocalGlimmerEvidence,LocalGlimmerSupport} from './local-glimmer-review';

// Browser-only structural boundary. The type import is erased; no model client,
// server configuration or credential handling enters the browser bundle.
type Obj=Record<string,unknown>;
const object=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Obj,list:string[])=>Object.keys(v).length===list.length&&list.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const prose=(v:unknown,max:number):v is string=>text(v,max)&&!/(?:https?:\/\/|www\.|javascript:|data:|file:)/i.test(v);
const date=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
const native=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,9}$/.test(v);
const sources:Record<string,string>={
 'nyc-footprints':'https://data.cityofnewyork.us/d/5zhs-2jue',
 'nyc-pluto':'https://data.cityofnewyork.us/d/64uk-42ks',
 'nyc-dep-surroundings':'https://data.cityofnewyork.us/d/9i7c-xyvv'
};

/** Validates source attribution and references, not the truth of model prose. */
export function parseLocalReviewDisplay(value:unknown,expectedBuildingIds?:readonly string[]):LocalGlimmerReview|null{
 try{
  if(!object(value)||!keys(value,['kind','status','model','modelLabel','execution','modelGenerated','grounded','buildingIds','actions','priority','evidence','createdAt','timing','provenance'])||value.kind!=='local_glimmer_review'||value.status!=='completed'||value.model!=='muse-glimmer'||value.modelLabel!=='Muse Glimmer 30B'||value.execution!=='local-loopback'||value.modelGenerated!==true||value.grounded!==false||!Array.isArray(value.buildingIds)||value.buildingIds.length!==2||!value.buildingIds.every(native)||new Set(value.buildingIds).size!==2)return null;
  const ids=value.buildingIds as string[];
  if(expectedBuildingIds&&(expectedBuildingIds.length!==2||ids.some((id,i)=>id!==expectedBuildingIds[i])))return null;
  if(!date(value.createdAt)||!object(value.timing)||!keys(value.timing,['requestMs'])||typeof value.timing.requestMs!=='number'||!Number.isFinite(value.timing.requestMs)||value.timing.requestMs<0||value.timing.requestMs>95_000)return null;
  const p=value.provenance;
  if(!object(p)||!keys(p,['notesLabel','endpointHost','packetSha256','sourceRecordRetrievedAt'])||p.notesLabel!=='Your inspection notes'||!['127.0.0.1','localhost','[::1]'].includes(String(p.endpointHost))||typeof p.packetSha256!=='string'||!/^[a-f0-9]{64}$/.test(p.packetSha256)||!object(p.sourceRecordRetrievedAt)||!keys(p.sourceRecordRetrievedAt,ids)||!Object.values(p.sourceRecordRetrievedAt).every(date))return null;
  if(!Array.isArray(value.evidence)||value.evidence.length<4||value.evidence.length>60)return null;
  const evidence=new Map<string,LocalGlimmerEvidence>();let noteLength=0;
  for(const e of value.evidence){
   if(!object(e)||!keys(e,['evidenceId','buildingIds','origin','label','text','scope','scopeNote','source'])||!text(e.evidenceId,160)||evidence.has(e.evidenceId)||!text(e.label,200)||!text(e.text,1000)||!text(e.scope,80)||!text(e.scopeNote,1000)||!Array.isArray(e.buildingIds)||!e.buildingIds.length||e.buildingIds.length>2||new Set(e.buildingIds).size!==e.buildingIds.length||!e.buildingIds.every(id=>typeof id==='string'&&ids.includes(id)))return null;
   if(e.origin==='user_note'){
    if(!/^inspection-note:[1-9]\d?$/.test(e.evidenceId)||e.label!=='Your inspection notes'||e.scope!=='user_reported_note'||e.source!==null||e.text.length>600||e.buildingIds.length!==2||e.buildingIds.some((id,i)=>id!==ids[i]))return null;
    noteLength+=e.text.length;if(noteLength>6000)return null;
   }else{
    if(!['public_record','derived_public_context'].includes(String(e.origin))||e.buildingIds.length!==1||!e.evidenceId.startsWith(e.buildingIds[0]+':')||!object(e.source))return null;
    const source=e.source;
    if(Object.keys(source).some(k=>!['id','label','url','recordId','retrievedAt','version'].includes(k))||typeof source.id!=='string'||!Object.prototype.hasOwnProperty.call(sources,source.id)||source.url!==sources[source.id]||!text(source.label,200)||!text(source.recordId,100)||source.retrievedAt!==undefined&&!date(source.retrievedAt)||source.version!==undefined&&!text(source.version,100))return null;
    if(e.origin==='derived_public_context'){
     if(source.id!=='nyc-dep-surroundings'||e.scope!=='surrounding_ground'||source.recordId!==e.buildingIds[0]||!date(source.version)||!/^\d+:surroundings:(current_nuisance|current_deep|future_nuisance|future_deep|future_high_tide)$/.test(e.evidenceId))return null;
    }else if(source.id==='nyc-footprints'){
     if(source.recordId!==e.buildingIds[0]||!/^\d+:(footprint_area_sqft|roof_height_ft):current$/.test(e.evidenceId)||e.scope!==(e.evidenceId.includes(':footprint_area_sqft:')?'building_footprint':'building')||source.retrievedAt!==p.sourceRecordRetrievedAt[e.buildingIds[0]])return null;
    }else if(source.id==='nyc-pluto'){
     if(!/^\d{10}$/.test(source.recordId)||e.scope!=='parcel'||!/^\d+:(lot_building_area_sqft|lot_area_sqft|zoning):current$/.test(e.evidenceId)||source.retrievedAt!==p.sourceRecordRetrievedAt[e.buildingIds[0]])return null;
    }else return null;
   }
   evidence.set(e.evidenceId,e as LocalGlimmerEvidence);
  }
  const supports=(v:unknown):v is LocalGlimmerSupport[]=>Array.isArray(v)&&v.length>=1&&v.length<=4&&new Set(v.map(s=>object(s)?s.evidenceId:null)).size===v.length&&v.every(s=>object(s)&&keys(s,['evidenceId','quote'])&&typeof s.evidenceId==='string'&&evidence.has(s.evidenceId)&&s.quote===evidence.get(s.evidenceId)!.text);
  if(!Array.isArray(value.actions)||value.actions.length<2||value.actions.length>3)return null;
  const actionIds=new Set<string>(),covered=new Set<string>();
  for(const a of value.actions){
   if(!object(a)||!keys(a,['id','title','action','buildingIds','support'])||typeof a.id!=='string'||!['check_1','check_2','check_3'].includes(a.id)||actionIds.has(a.id)||!prose(a.title,100)||!prose(a.action,420)||!Array.isArray(a.buildingIds)||a.buildingIds.length<1||a.buildingIds.length>2||new Set(a.buildingIds).size!==a.buildingIds.length||!a.buildingIds.every(id=>typeof id==='string'&&ids.includes(id))||!supports(a.support))return null;
   const own=a.buildingIds as string[],support=a.support;
   if(own.some(id=>!support.some(s=>{const e=evidence.get(s.evidenceId)!;return e.origin!=='user_note'&&e.buildingIds.includes(id);})))return null;
   if(support.some(s=>{const e=evidence.get(s.evidenceId)!;return e.origin!=='user_note'&&e.buildingIds.some(id=>!own.includes(id));}))return null;
   actionIds.add(a.id);own.forEach(id=>covered.add(id));
  }
  const priority=value.priority;
  if(covered.size!==2||!object(priority)||!keys(priority,['actionId','ifFinding','thenAction','support'])||typeof priority.actionId!=='string'||!actionIds.has(priority.actionId)||!prose(priority.ifFinding,300)||!prose(priority.thenAction,360)||!supports(priority.support))return null;
  const chosen=value.actions.find(a=>a.id===priority.actionId);
  if(priority.support.some(s=>!chosen.support.some((r:LocalGlimmerSupport)=>r.evidenceId===s.evidenceId)))return null;
  return value as LocalGlimmerReview;
 }catch{return null;}
}

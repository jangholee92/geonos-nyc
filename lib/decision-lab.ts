import type {CityBuilding} from './city';
import type {SiteContext} from './site-context';
import {screen, type Preferences} from './city-screening';

export type WinnerInterval={from:number;to:number;winnerIds:string[]};
export type WinnerBoundary={at:number;winnerIds:string[]};
export type PreferenceCurve={id:string;size:number|null;truck:number|null};
const EPS=1e-8;
export function blendWeights(truckPercent:number):Preferences {
 const t=Number.isFinite(truckPercent)?Math.max(0,Math.min(100,truckPercent))/100:0;
 return {size:3*(1-t),truck:3*t,heat:0};
}
export function truckShare(weights:Preferences):number {
 const size=Number.isFinite(weights.size)?Math.max(0,weights.size):0;
 const truck=Number.isFinite(weights.truck)?Math.max(0,weights.truck):0;
 return size+truck?truck/(size+truck)*100:0;
}

/** Exact upper envelope of the existing two-metric linear score, not a sampled grid. */
export function preferenceFrontier(buildings:CityBuilding[],contexts:Record<string,SiteContext>) {
 const rows=screen(buildings,contexts,{size:1,truck:1,heat:0});
 const mixedUnits=new Set(buildings.map(b=>b.entity_type||'building')).size>1;
 const curves:PreferenceCurve[]=rows.map(r=>({id:r.building.id,size:r.metrics.size,truck:r.metrics.truck}));
 const complete=curves.filter((r):r is PreferenceCurve&{size:number;truck:number}=>r.size!==null&&r.truck!==null);
 const missingIds=curves.filter(r=>r.size===null||r.truck===null).map(r=>r.id);
 const winnerAt=(percent:number):string[]=>{
  const ranked=screen(buildings,contexts,blendWeights(percent)).filter(r=>r.score!==null);
  return ranked.length?ranked.filter(r=>Math.abs(r.score!-ranked[0].score!)<EPS).map(r=>r.building.id).sort():[];
 };
 const endpoints={size:winnerAt(0),truck:winnerAt(100)};
 if(mixedUnits)return {mixedUnits,curves,missingIds,intervals:[] as WinnerInterval[],boundaries:[] as WinnerBoundary[],endpoints};
 const cuts=[0,100];
 for(let i=0;i<complete.length;i++)for(let j=i+1;j<complete.length;j++){
  const a=complete[i],b=complete[j],denom=(a.truck-a.size)-(b.truck-b.size);
  if(Math.abs(denom)<EPS)continue;
  const percent=(b.size-a.size)/denom*100;
  if(percent>EPS&&percent<100-EPS)cuts.push(percent);
 }
 cuts.sort((a,b)=>a-b);
 const unique=cuts.filter((v,i)=>!i||v-cuts[i-1]>EPS);
 const intervals:WinnerInterval[]=[];
 for(let i=1;i<unique.length;i++){
  const from=unique[i-1],to=unique[i],winnerIds=winnerAt((from+to)/2);
  const last=intervals.at(-1);
  if(last&&last.winnerIds.join('|')===winnerIds.join('|'))last.to=to;
  else intervals.push({from,to,winnerIds});
 }
 // Include all exact shared first-place intersections, including an isolated three-way tie.
 const boundaries=unique.slice(1,-1).map((at,i)=>{
  const winnerIds=winnerAt(at),left=winnerAt((unique[i]+at)/2),right=winnerAt((at+unique[i+2])/2);
  return {at,winnerIds,changed:winnerIds.join('|')!==left.join('|')||winnerIds.join('|')!==right.join('|')};
 }).filter(b=>b.winnerIds.length>1&&b.changed).map(({at,winnerIds})=>({at,winnerIds}));
 return {mixedUnits,curves,missingIds,intervals,boundaries,endpoints};
}

export type Verification={kind:'missing'|'review';title:string;detail:string};
/** A deterministic research queue. These are open questions, never inferred defects. */
export function nextVerification(building:CityBuilding,context?:SiteContext):Verification {
 const size=building.entity_type==='parcel'?building.lot_area_sqft:building.footprint_area_sqft;
 if(size===null||!Number.isFinite(size)||size<0)return {kind:'missing',title:'Establish a usable area measurement',detail:'The selected area metric is missing or invalid. Review the source geometry before comparing this candidate.'};
 const distance=context?.truck.status==='available'?context.truck.value?.distance_m:null;
 if(typeof distance!=='number'||!Number.isFinite(distance)||distance<0)return {kind:'missing',title:'Resolve the truck-route lookup',detail:'Route proximity is unknown. Refresh the public-data lookup before giving access a scoring weight.'};
 if(!building.bbl||building.join_warning)return {kind:'missing',title:'Confirm the parcel relationship',detail:'Check the footprint-to-tax-lot match. Parcel attributes describe the whole tax lot and may cover several structures.'};
 if(building.flood_2007===1||building.flood_2015===1)return {kind:'review',title:'Review the recorded flood-map intersection',detail:'A PLUTO flood flag is recorded. Verify current maps, full-site exposure and applicable requirements with the relevant authority.'};
 if(!context?.stormwater||context.stormwater.status!=='available'||context.stormwater.value?.queries_succeeded!==context.stormwater.value?.queries_total)return {kind:'missing',title:'Complete the stormwater context',detail:'One or more scenario lookups are unavailable. No result is not evidence of low exposure.'};
 return {kind:'review',title:'Verify permission and physical fit',detail:'Confirm the intended use, loading access, floor load, electrical capacity and indoor conditions. Public geometry and proximity do not establish operational suitability.'};
}

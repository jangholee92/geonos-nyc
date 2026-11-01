import type {CityBuilding,Geometry} from './city';
import type {PlanningContext} from './planning-context';
import index from './surroundings-shard-index.json';

const SNAPSHOT='nyc-surroundings-20261028-v1';
const LAYERS=['current_nuisance','current_deep','future_nuisance','future_deep','future_high_tide','future_exclusion_0','future_exclusion_3','future_water'] as const;
type Layer=typeof LAYERS[number];
type PondingLayer=typeof LAYERS[0|1|2|3|4];
type Obj=Record<string,unknown>;
const object=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const nonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const native=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,9}$/.test(v);
const source={
 label:'NYC DEP stormwater scenarios · full-outline surroundings',url:'https://data.cityofnewyork.us/d/9i7c-xyvv',
 methodUrl:'https://www.nyc.gov/assets/orr/pdf/publications/stormwater-resiliency-plan.pdf',methodPage:20,
 snapshotId:SNAPSHOT,sourceRowsUpdatedAt:'2024-07-03T21:04:08Z',sourceRetrievedOn:'2026-10-27',
 footprintSource:'https://data.cityofnewyork.us/d/5zhs-2jue',footprintSnapshotUpdatedAt:'2026-10-25T08:21:07Z',
 maskSource:'https://services.arcgis.com/at3rDjch5X7i9Bag/ArcGIS/rest/services/Moderate_Flood_SLR_2050/FeatureServer',
 maskRetrievedOn:'2026-10-27',manifestSha256:index.manifest_sha256,
};
export const surroundingGroundTool={type:'function',function:{name:'inspect_surrounding_ground',description:'Read the audited full-outline surrounding-ground archive for one or two selected or this-turn resolved native DOITT buildings. Returns exact current and 2050 moderate-rainfall scenarios, nearest mapped-category distances and areas in 0–5, 5–10 and 10–20 metre outside bands, with geometry/source-date guards and exclusions. Use for climate comparison and entrance/loading/equipment inspection questions; an interior point can miss surrounding ground. Both scenarios use 2.13 inches of rain in one hour; 2050 adds 30 inches of sea level. Keep the user’s requested time window separate: these are the archive scenarios, not interpolated years. Distances/areas are source geometry, not indoor flood depth, annual probability, a winner or operational condition. Nonterminal: continue with a concise evidence-linked answer and the next decisive check.',parameters:{type:'object',properties:{ids:{type:'array',items:{type:'string',pattern:'^[1-9][0-9]{0,9}$'},minItems:1,maxItems:2}},required:['ids'],additionalProperties:false}}};

export type GroundSite={
 buildingId:string;address:string;status:'available'|'stale'|'unsupported'|'unavailable';reason:string;
 evidenceId:string|null;geometrySha256?:string;footprintEditedAt?:string|null;
 nearestM?:Record<PondingLayer,number>;
 bands?:{innerM:number;outerM:number;areasM2:Record<Layer,number>}[];
 outlineIntersects?:Record<Layer,boolean>;
 footprintMasksM2?:{futureExclusion0:number;futureExclusion3:number;futureWater:number};
};
export type SurroundingGroundResult={
 kind:'surrounding_ground';status:'available'|'partial'|'unavailable';sites:GroundSite[];
 scenarios:{id:'current_moderate'|'2050_moderate';label:string;rainfallInches:2.13;rainfallDurationHours:1;seaLevelRiseInches:0|30;rainfallClasses:{id:'nuisance'|'deep';minimumDepthInches:number;maximumDepthInchesExclusive:number|null}[]}[];
 planningWindow:PlanningContext['planningWindow']|null;
 scopeNote:string;method:string;source:typeof source;
 citations:{evidenceId:string;source:typeof source&{recordId:string;geometrySha256:string;footprintEditedAt:string|null;shardSha256:string};measurement:'surrounding_ground_geometry';scope:'outside_building_outline';unit:'m and m²';value:GroundSite}[];
 nextChecks:{id:string;buildingIds:string[];action:string;why:string;whatCouldChange:string;evidenceIds:string[]}[];
};
export type SurroundingGroundOptions={
 /** An application-owned asset binding. This callback only receives a fixed,
  * validated local path; never pass model URLs, request cookies or credentials. */
 fetchAsset:(path:string,signal:AbortSignal)=>Promise<Response>;
 signal?:AbortSignal;planningContext?:PlanningContext|null;
};
export class SurroundingGroundError extends Error{constructor(public code:'GROUND_INVALID_INPUT'|'GROUND_CANCELLED',message:string){super(message);this.name='SurroundingGroundError';}}
const cancelled=()=>new SurroundingGroundError('GROUND_CANCELLED','The surrounding-ground request was cancelled.');
const arrays=(v:unknown,n:number):v is number[]=>Array.isArray(v)&&v.length===n&&v.every(nonnegative);
const sameDate=(a:unknown,b:unknown)=>a===null&&b===null||typeof a==='string'&&typeof b==='string'&&Number.isFinite(Date.parse(a))&&Date.parse(a)===Date.parse(b);
async function digest(bytes:Uint8Array){const hash=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
/** Identical 1e-7-degree canonicalization to the audited Python archive and UI. */
export async function groundGeometryHash(geometry:Geometry):Promise<string>{
 if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type))throw Error('Unsupported geometry');
 let points=0;
 const round=(value:unknown,depth=0):unknown=>{
  if(!Array.isArray(value)||!value.length||depth>4)throw Error('Invalid geometry');
  if(typeof value[0]==='number'){
   if(value.length<2||!Number.isFinite(value[0])||!Number.isFinite(value[1])||++points>100_000)throw Error('Invalid coordinates');
   return value.slice(0,2).map(n=>Math.round(n*1e7));
  }
  return value.map(v=>round(v,depth+1));
 };
 return digest(new TextEncoder().encode(JSON.stringify([geometry.type,round(geometry.coordinates)])));
}
function abortable<T>(pending:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)return Promise.reject(cancelled());
 return new Promise((resolve,reject)=>{const stop=()=>reject(cancelled());signal.addEventListener('abort',stop,{once:true});pending.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));});
}
async function readBounded(body:ReadableStream<Uint8Array>|null,max:number,signal:AbortSignal):Promise<Uint8Array>{
 if(!body)throw Error('Empty asset');const reader=body.getReader(),chunks:Uint8Array[]=[];let size=0;
 const stop=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',stop,{once:true});
 try{while(true){const part=await abortable(reader.read(),signal);if(part.done)break;size+=part.value.length;if(size>max)throw Error('Asset size exceeded');chunks.push(part.value);}if(signal.aborted)throw cancelled();const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;}
 catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',stop);}
}
type Entry=typeof index.files[keyof typeof index.files];
/** Transport and decoded identities are both pinned. Hosts which already
 * decoded Content-Encoding are accepted only with the exact decoded hash. */
async function readShard(path:string,entry:Entry,fetchAsset:SurroundingGroundOptions['fetchAsset'],signal:AbortSignal):Promise<Obj>{
 const pending=fetchAsset(path,signal);pending.then(r=>{if(signal.aborted)void r.body?.cancel().catch(()=>{});},()=>{});
 const response=await abortable(pending,signal);
 if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error('Asset unavailable');}
 const encoded=await readBounded(response.body,Math.max(entry.bytes,entry.compressed_bytes),signal);
 let decoded:Uint8Array;
 if(encoded[0]===0x1f&&encoded[1]===0x8b){
  if(encoded.length!==entry.compressed_bytes||await digest(encoded)!==entry.compressed_sha256)throw Error('Transport identity mismatch');
  if(typeof DecompressionStream==='undefined')throw Error('Decompression unavailable');
  decoded=await readBounded(new Response(encoded as BodyInit).body!.pipeThrough(new DecompressionStream('gzip')),entry.bytes,signal);
 }else{
  if(!/application\/(?:[a-z0-9.+-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type')||'')&&!/(?:^|,)\s*gzip\s*(?:,|$)/i.test(response.headers.get('content-encoding')||''))throw Error('Unexpected asset transport');
  decoded=encoded;
 }
 if(decoded.length!==entry.bytes||await digest(decoded)!==entry.sha256)throw Error('Decoded identity mismatch');
 const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));
 if(!object(parsed)||parsed.schema_version!==1||parsed.snapshot_id!==SNAPSHOT||!object(parsed.records))throw Error('Snapshot identity mismatch');
 return parsed.records;
}
function decodeSite(building:CityBuilding,row:unknown,hash:string):GroundSite{
 const base:GroundSite={buildingId:building.id,address:String(building.address||'Selected building').slice(0,300),status:'unavailable',reason:'No compatible record was returned by the pinned archive.',evidenceId:null};
 if(!Array.isArray(row)||row.length!==8)return base;
 const [fingerprint,editedAt,featureCode,nearest,bands,masks,bits,quality]=row;
 if(quality===1)return{...base,status:'unsupported',reason:'The archived footprint is invalid or a placeholder.'};
 if(quality!==0||typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint)||!arrays(nearest,5)||!arrays(masks,3)||!Number.isInteger(bits)||bits<0||bits>255||!object(bands)||!(editedAt===null||typeof editedAt==='string')||!(featureCode===null||Number.isInteger(featureCode)))return base;
 if(fingerprint!==hash||!sameDate(editedAt,building.footprint_edited_at??null))return{...base,status:'stale',reason:'The live footprint geometry or source edit date differs from this archive. Recompute before using its measurements.'};
 const rows=[[0,5],[5,10],[10,20]].map(([innerM,outerM])=>({innerM,outerM,areasM2:Object.fromEntries(LAYERS.map(k=>[k,0])) as Record<Layer,number>}));
 for(const [key,areas]of Object.entries(bands)){if(!/^[0-7]$/.test(key)||!arrays(areas,3))return base;areas.forEach((a,i)=>{rows[i].areasM2[LAYERS[Number(key)]]=a;});}
 return{...base,status:'available',reason:'Pinned source bytes, native identity, footprint geometry and edit date match.',evidenceId:`${building.id}:surrounding_ground:${SNAPSHOT}`,geometrySha256:fingerprint,footprintEditedAt:editedAt,
  nearestM:Object.fromEntries(LAYERS.slice(0,5).map((k,i)=>[k,nearest[i]])) as Record<PondingLayer,number>,bands:rows,
  outlineIntersects:Object.fromEntries(LAYERS.map((k,i)=>[k,Boolean(bits&(1<<i))])) as Record<Layer,boolean>,footprintMasksM2:{futureExclusion0:masks[0],futureExclusion3:masks[1],futureWater:masks[2]}};
}

/** One bounded server-owned lookup, never model/browser facts. Two distinct
 * native buildings, at most two sequential shards, 15 s including body reads.
 * Cache only inside this invocation; failed/stale records never become zeros. */
export async function inspectSurroundingGround(buildings:readonly CityBuilding[],options:SurroundingGroundOptions):Promise<SurroundingGroundResult>{
 if(!Array.isArray(buildings)||buildings.length<1||buildings.length>2||new Set(buildings.map(b=>b?.id)).size!==buildings.length||buildings.some(b=>!b||!native(b.id))||typeof options?.fetchAsset!=='function')throw new SurroundingGroundError('GROUND_INVALID_INPUT','Use one or two distinct freshly resolved native building IDs.');
 if(options.signal?.aborted)throw cancelled();
 const controller=new AbortController(),abort=()=>controller.abort();let timedOut=false;
 options.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>{timedOut=true;controller.abort();},15_000);
 const shards=new Map<string,Obj|null>(),sites:GroundSite[]=[];
 try{
  for(const building of buildings){
   if(options.signal?.aborted)throw cancelled();
   const base:GroundSite={buildingId:building.id,address:String(building.address||'Selected building').slice(0,300),status:'unavailable',reason:timedOut?'The archive lookup reached its time budget.':'The archive could not be loaded and verified.',evidenceId:null};
   if(building.entity_type==='parcel'||building.geometry_quality==='invalid_or_placeholder'||building.feature_code===1003){sites.push({...base,status:'unsupported',reason:'An eligible individual building outline is required.'});continue;}
   const key=String(Math.floor(Number(building.id)/10000)),entry=(index.files as Record<string,Entry>)[key];
   if(!entry){sites.push({...base,reason:'This native building is outside the pinned archive.'});continue;}
   try{
    const hash=await groundGeometryHash(building.geometry);
    if(!shards.has(key))shards.set(key,await readShard(`/data/surroundings/${key}.json.gz`,entry,options.fetchAsset,controller.signal));
    const rows=shards.get(key);sites.push(rows?decodeSite(building,rows[building.id],hash):base);
   }catch{if(options.signal?.aborted)throw cancelled();shards.set(key,null);sites.push(base);}
  }
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
 const available=sites.filter(s=>s.status==='available');
 const citations:SurroundingGroundResult['citations']=available.map(site=>({evidenceId:site.evidenceId!,source:{...source,recordId:site.buildingId,geometrySha256:site.geometrySha256!,footprintEditedAt:site.footprintEditedAt??null,shardSha256:(index.files as Record<string,Entry>)[String(Math.floor(Number(site.buildingId)/10000))].sha256},measurement:'surrounding_ground_geometry',scope:'outside_building_outline',unit:'m and m²',value:site}));
 const near=available.filter(site=>site.outlineIntersects!.future_deep||site.bands!.some(b=>b.areasM2.future_deep>0));
 const mask=available.filter(site=>Object.values(site.footprintMasksM2!).some(v=>v>0)||site.bands!.some(b=>b.areasM2.future_exclusion_0>0||b.areasM2.future_exclusion_3>0||b.areasM2.future_water>0));
 const target=near.length?near:available;
 const nextChecks:SurroundingGroundResult['nextChecks']=target.length?[{id:'survey_entrances_and_equipment',buildingIds:target.map(s=>s.buildingId),action:'Locate actual entrances, loading access and critical equipment on a current plan; obtain their surveyed elevations and the relevant ground/drainage observations.',why:near.length?'The 2050 deep-water source category intersects the outline or its 20 m surrounding bands at these places. These are specific locations for a ground-level survey.':'The archive describes ground around the outline. Relating that ground to the actual doors, routes and equipment is the next site-specific check.',whatCouldChange:'The actual location and elevation of essential access or equipment can change the adaptation work required and the next comparison question.',evidenceIds:target.map(s=>s.evidenceId!)}]:[];
 if(mask.length)nextChecks.push({id:'verify_model_coverage',buildingIds:mask.map(s=>s.buildingId),action:'Review the source exclusion and wetland/waterbody boundaries with the site plan and a qualified reviewer.',why:'Separate 2050 exclusion or waterbody layers intersect these footprints or their surrounding bands.',whatCouldChange:'A verified coverage boundary determines which published scenario measurements can inform the site investigation.',evidenceIds:mask.map(s=>s.evidenceId!)});
 const classes=[{id:'nuisance' as const,minimumDepthInches:4,maximumDepthInchesExclusive:12},{id:'deep' as const,minimumDepthInches:12,maximumDepthInchesExclusive:null}];
 return{kind:'surrounding_ground',status:available.length===sites.length?'available':available.length?'partial':'unavailable',sites,
  scenarios:[{id:'current_moderate',label:'Moderate rainfall · current sea level',rainfallInches:2.13,rainfallDurationHours:1,seaLevelRiseInches:0,rainfallClasses:classes},{id:'2050_moderate',label:'Moderate rainfall · 2050 sea level',rainfallInches:2.13,rainfallDurationHours:1,seaLevelRiseInches:30,rainfallClasses:classes}],
  planningWindow:options.planningContext?.planningWindow??null,
  scopeNote:'The user planning window is retained separately from the two published scenarios. No intermediate year, annual likelihood, indoor depth or adaptation benefit is calculated. A no-hit or zero-area result is a geometric observation; model coverage must be reviewed separately.',
  method:'Global nearest source-category geometry in EPSG:2263, converted from US survey feet to metres (1200/3937). Distances are stored to 0.001 m; use whole metres or <1 m in prose, not millimetre accuracy. Areas in disjoint 0–5, 5–10 and 10–20 m bands outside the entire outline, in square metres; bands may contain other structures or private land. The 2050 high-tide category and exclusion/waterbody masks remain separate from rainfall-depth classes. DEP models buildings as voids: surrounding ground, not flooded building floor area. Rounded zero distance and topological intersection are separate fields.',source,citations,nextChecks};
}

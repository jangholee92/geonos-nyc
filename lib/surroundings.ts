'use client';
import type {CityBuilding, Geometry} from './city';
import {fetchPublicJson} from './public-fetch';

export const SURROUNDINGS_SNAPSHOT = 'nyc-surroundings-20261028-v1';
export const SURROUNDINGS_LAYERS = ['current_nuisance','current_deep','future_nuisance','future_deep','future_high_tide','future_exclusion_0','future_exclusion_3','future_water'] as const;
export type SurroundingsLayer = typeof SURROUNDINGS_LAYERS[number];
export type PondingLayer = typeof SURROUNDINGS_LAYERS[0|1|2|3|4];
export const SURROUNDINGS_SOURCE = {
  snapshot_id:SURROUNDINGS_SNAPSHOT,
  title:'Official downloadable stormwater-map snapshot',
  url:'https://data.cityofnewyork.us/d/9i7c-xyvv',
  data_updated_at:'2024-07-03T21:04:08Z',
  metadata_updated_at:'2024-10-17T18:10:13Z',
  retrieved_at:'2026-10-27',
  footprint_updated_at:'2026-10-25T08:21:07Z',
  method_url:'https://www.nyc.gov/assets/orr/pdf/publications/stormwater-resiliency-plan.pdf',
  method_page:20,
  rainfall_inches:2.13,
  rainfall_duration_hours:1,
  future_high_tide_sea_level_rise_inches:30,
  nearest_search:'Global category geometry; no distance cap.',
  mask_scope:'Exclusion and wetland/waterbody layers are from the hosted 2050 scenario, retrieved 2026-10-27. Their absence does not prove model coverage.',
  note:'These are geometric surroundings of a building outline in published scenarios, not current conditions, indoor flood depth, entrance accessibility, annual probability or expected loss. The published model treats buildings as voids in its surface-water mesh.',
} as const;

export type SurroundingsBand = {inner_m:number;outer_m:number;areas_m2:Record<SurroundingsLayer,number>};
export type AvailableSurroundings = {
  status:'available';id:string;source:typeof SURROUNDINGS_SOURCE;
  geometry_sha256:string;footprint_edited_at:string|null;feature_code:number|null;
  nearest_m:Record<PondingLayer,number>;
  bands:SurroundingsBand[];
  footprint_masks_m2:{exclusion_0:number;exclusion_3:number;water:number};
  outline_intersects:Record<SurroundingsLayer,boolean>;
};
export type SurroundingsEvidence = AvailableSurroundings | {status:'unavailable'|'stale'|'unsupported';id:string;reason:string;source:typeof SURROUNDINGS_SOURCE};
type Shard = {schema_version:number;snapshot_id:string;records:Record<string,unknown>};
// Browser-only, per-shard static assets. Never import the citywide index into a
// JavaScript bundle or load the full archive into a Worker. At most 12 shards
// stay cached here; concurrent requests for the same shard share one promise.
const shards=new Map<string,Promise<Shard>>();

/** The archive is shipped as gzip files to keep the complete citywide evidence
 * inside hosting limits. Fetch can already decode a Content-Encoding response;
 * inspect actual bytes so that those bodies are not decompressed twice. */
async function readCompressedShard(response:Response):Promise<unknown>{
  if(!response.body)throw Error('Missing surroundings response body.');
  const reader=response.body.getReader(),prefix:Uint8Array[]=[];
  let prefixSize=0;
  try{
    while(prefixSize<2){const chunk=await reader.read();if(chunk.done)break;if(chunk.value.length){prefix.push(chunk.value);prefixSize+=chunk.value.length;}}
    if(prefixSize<2||prefixSize>8*1024*1024)throw Error('Empty, truncated or oversized surroundings asset.');
    const first=prefix[0][0],second=prefix[0].length>1?prefix[0][1]:prefix[1][0];
    const gzip=first===0x1f&&second===0x8b;
    // A non-gzip body is acceptable only when the server explicitly identifies
    // decoded gzip or JSON. HTML fallback pages and corrupt archives fail closed.
    const encoding=response.headers.get('content-encoding')||'';
    const jsonType=/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type')||'');
    if(!gzip&&!/(?:^|,)\s*gzip\s*(?:,|$)/i.test(encoding)&&!jsonType)throw Error('Unexpected surroundings asset encoding.');
    let compressedBytes=prefixSize;
    const input=new ReadableStream<Uint8Array>({
      start(controller){for(const chunk of prefix)controller.enqueue(chunk);},
      async pull(controller){try{const chunk=await reader.read();if(chunk.done){controller.close();return;}compressedBytes+=chunk.value.length;if(compressedBytes>8*1024*1024)throw Error('Surroundings asset exceeds the bounded shard size.');controller.enqueue(chunk.value);}catch(error){controller.error(error);await reader.cancel().catch(()=>{});}},
      cancel(reason){return reader.cancel(reason);},
    });
    const decoded=gzip?(input as ReadableStream<BufferSource>).pipeThrough(new DecompressionStream('gzip')):input;
    const output=decoded.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
    let text='',decodedBytes=0;
    try{
      while(true){const chunk=await output.read();if(chunk.done)break;decodedBytes+=chunk.value.length;if(decodedBytes>8*1024*1024)throw Error('Decoded surroundings asset exceeds the bounded shard size.');text+=decoder.decode(chunk.value,{stream:true});}
      text+=decoder.decode();
      return JSON.parse(text);
    }catch(error){await output.cancel().catch(()=>{});throw error;}
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
}

/** Same canonicalization used by the audited Python export. Ring order is intentional. */
export async function geometryFingerprint(geometry:Geometry):Promise<string>{
  if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type))throw Error('A polygon footprint is required.');
  const round=(value:any):any=>{
    if(!Array.isArray(value)||!value.length)throw Error('Empty or invalid geometry.');
    if(typeof value[0]==='number'){
      if(value.length<2||!Number.isFinite(value[0])||!Number.isFinite(value[1]))throw Error('Invalid coordinates.');
      return value.slice(0,2).map((n:number)=>Math.round(n*1e7));
    }
    return value.map(round);
  };
  const encoded=new TextEncoder().encode(JSON.stringify([geometry.type,round(geometry.coordinates)]));
  const bytes=await crypto.subtle.digest('SHA-256',encoded);
  return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function loadShard(key:string):Promise<Shard>{
  const known=shards.get(key);
  if(known){shards.delete(key);shards.set(key,known);return known;}
  const promise=fetchPublicJson(`/data/surroundings/${key}.json.gz`,{timeoutMs:12000,label:'surroundings',readResponse:readCompressedShard})
    .then((value:any)=>{
      if(value?.schema_version!==1||value?.snapshot_id!==SURROUNDINGS_SNAPSHOT||!value.records||typeof value.records!=='object'||Array.isArray(value.records))throw Error('Unexpected surroundings snapshot.');
      return value as Shard;
    }).catch(error=>{shards.delete(key);throw error;});
  shards.set(key,promise);
  if(shards.size>12)shards.delete(shards.keys().next().value!);
  return promise;
}
const finiteNonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const numberArray=(v:unknown,length:number):v is number[]=>Array.isArray(v)&&v.length===length&&v.every(finiteNonnegative);
function sameDate(a:unknown,b:unknown){
  if(a===null&&b===null)return true;
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)&&x===y;
}

/** A missing, stale or failed lookup is never converted to an all-zero evidence row. */
export async function fetchSurroundings(building:CityBuilding):Promise<SurroundingsEvidence>{
  const id=String(building.id),source=SURROUNDINGS_SOURCE;
  const unknown=(status:'unavailable'|'stale'|'unsupported',reason:string):SurroundingsEvidence=>({status,id,reason,source});
  if(building.entity_type==='parcel'||!/^\d{1,10}$/.test(id)||Number(id)<=0)return unknown('unsupported','Surroundings require an individual building footprint. A parcel reference point cannot substitute for that outline.');
  if(building.geometry_quality==='invalid_or_placeholder'||building.feature_code===1003)return unknown('unsupported','The source footprint is invalid or a placeholder. Surroundings remain unknown.');
  if(typeof DecompressionStream==='undefined')return unknown('unavailable','This browser cannot decompress the surroundings archive. Use an up-to-date browser and try again. Surroundings remain unknown.');
  try{
    const [shard,hash]=await Promise.all([loadShard(String(Math.floor(Number(id)/10000))),geometryFingerprint(building.geometry)]);
    const row=shard.records[id];
    if(!Array.isArray(row)||row.length!==8)return unknown('unavailable','This footprint has no compatible surroundings record in the pinned snapshot.');
    const [fingerprint,editedAt,featureCode,nearest,bands,masks,touchBits,quality]=row;
    if(quality===1)return unknown('unsupported','The archived source geometry was invalid or a placeholder.');
    if(quality!==0||typeof fingerprint!=='string'||!/^([a-f0-9]{64})$/.test(fingerprint)||!numberArray(nearest,5)||!numberArray(masks,3)||!Number.isInteger(touchBits)||touchBits<0||touchBits>255||!bands||typeof bands!=='object'||Array.isArray(bands))return unknown('unavailable','The surroundings record is incomplete or invalid.');
    if(fingerprint!==hash||!sameDate(editedAt,building.footprint_edited_at??null))return unknown('stale','The building geometry or source edit date has changed since the surroundings snapshot. Recalculation is needed.');
    const bandRows:SurroundingsBand[]=[[0,5],[5,10],[10,20]].map(([inner_m,outer_m])=>({inner_m,outer_m,areas_m2:Object.fromEntries(SURROUNDINGS_LAYERS.map(k=>[k,0])) as Record<SurroundingsLayer,number>}));
    for(const [key,areas]of Object.entries(bands)){
      if(!/^[0-7]$/.test(key)||!numberArray(areas,3))return unknown('unavailable','The surroundings band values are invalid.');
      areas.forEach((area,i)=>{bandRows[i].areas_m2[SURROUNDINGS_LAYERS[Number(key)]]=area;});
    }
    return{status:'available',id,source,geometry_sha256:fingerprint,footprint_edited_at:editedAt,feature_code:typeof featureCode==='number'?featureCode:null,
      nearest_m:Object.fromEntries(SURROUNDINGS_LAYERS.slice(0,5).map((k,i)=>[k,nearest[i]])) as Record<PondingLayer,number>,bands:bandRows,
      footprint_masks_m2:{exclusion_0:masks[0],exclusion_3:masks[1],water:masks[2]},
      outline_intersects:Object.fromEntries(SURROUNDINGS_LAYERS.map((k,i)=>[k,Boolean(touchBits&(1<<i))])) as Record<SurroundingsLayer,boolean>};
  }catch{return unknown('unavailable','The surroundings snapshot could not be loaded or verified. No safety conclusion can be drawn.');}
}

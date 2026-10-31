import type {CityBuilding} from './city';

type Point=[number,number];
type Bounds=[number,number,number,number];
export type SiteImagery={
 image:{dataUrl:string;mimeType:'image/jpeg';width:768;height:768};
 bounds:{wgs84:Bounds;webMercator:Bounds;crs:'EPSG:3857';approximateGroundWidthM:number;approximateGroundPixelSizeM:number};
 target:{id:string;bin:string|null;bbl:string|null;address:string;footprintPixels:Point[][][];footprintSource:string;footprintEditedAt:string|null};
 source:{label:string;url:string;metadataUrl:string;exportUrl:string;captureYear:2024;capturePeriod:string;publishedServiceResolutionM:number;resolutionNote:string;retrievedAt:string;imageSha256:string};
 limitations:string[];
};
export const SITE_IMAGERY_SOURCE='https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer';
export const SITE_IMAGERY_METADATA='https://gis.ny.gov/2024-orthoimagery';
const FOOTPRINT_SOURCE='https://data.cityofnewyork.us/d/5zhs-2jue';
const R=6378137, SIZE=768, MAX_BYTES=2_000_000, TIMEOUT_MS=25_000;
const limits=[
 'This is the official 2024 natural-color aerial image, not a live view. The source specifies Spring 2024; the exact acquisition date of this crop is unavailable.',
 'The published service describes approximately 12-inch detail. Exported pixel spacing depends on the crop and does not create finer native detail.',
 'Spring imagery may not show the full leaf-on tree canopy. Shadows, branches, occlusion and surface appearance can change or confuse visible roof and tree boundaries.',
 'The current official footprint and the 2024 image have different source vintages. Their outlines may differ because of later changes or image/geometry alignment; the footprint overlay is a reference, not a verified roof mask.',
 'Visible roof and tree segmentation cannot establish roof material, structural condition, load capacity, usable roof area, solar output, cooling demand, current tree health or legal permission.',
];

export class SiteImageryError extends Error{
 constructor(public code:'INVALID_SITE'|'CROP_TOO_LARGE'|'IMAGE_UNAVAILABLE'|'INVALID_IMAGE'|'IMAGE_TOO_LARGE'|'IMAGE_TIMEOUT',message:string){super(message);this.name='SiteImageryError';}
}
const badSite=()=>new SiteImageryError('INVALID_SITE','A valid, resolved NYC building footprint is required for the aerial image. Parcel outlines and placeholder records cannot be analyzed.');
const mercator=([lon,lat]:Point):Point=>[R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
const geographic=([x,y]:Point):Point=>[x/R*180/Math.PI,(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI];
const rounded=(value:number,places=6)=>Number(value.toFixed(places));

/** Pure crop planning from the authoritative full footprint, never map-tile
 * geometry, a model-provided box, a reference point, or a caller-supplied URL. */
export function planSiteImagery(building:CityBuilding){
 if(!building||!/^\d{1,10}$/.test(building.id)||building.entity_type==='parcel'||building.feature_code===1003||building.geometry_quality==='invalid_or_placeholder')throw badSite();
 const geometry=building.geometry;
 const polygons:unknown=geometry?.type==='MultiPolygon'?geometry.coordinates:geometry?.type==='Polygon'?[geometry.coordinates]:null;
 if(!Array.isArray(polygons)||!polygons.length||polygons.length>256)throw badSite();
 let pointCount=0;
 const projected:Point[][][]=polygons.map((polygon:unknown)=>{
  if(!Array.isArray(polygon)||!polygon.length||polygon.length>256)throw badSite();
  return polygon.map((ring:unknown)=>{
   if(!Array.isArray(ring)||ring.length<4)throw badSite();
   pointCount+=ring.length;if(pointCount>50_000)throw badSite();
   const points=ring.map((point:unknown):Point=>{
    if(!Array.isArray(point)||point.length<2||!Number.isFinite(point[0])||!Number.isFinite(point[1])||point[0]<-74.3||point[0]>-73.65||point[1]<40.47||point[1]>40.94)throw badSite();
    return mercator([point[0],point[1]]);
   });
   const first=points[0],last=points.at(-1)!;
   if(first[0]!==last[0]||first[1]!==last[1])throw badSite();
   const origin=first;
   const area=Math.abs(points.slice(1).reduce((sum,p,i)=>sum+(points[i][0]-origin[0])*(p[1]-origin[1])-(p[0]-origin[0])*(points[i][1]-origin[1]),0));
   if(!Number.isFinite(area)||area<=.000001)throw badSite();
   return points;
  });
 });
 let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
 for(const polygon of projected)for(const ring of polygon)for(const[x,y]of ring){west=Math.min(west,x);south=Math.min(south,y);east=Math.max(east,x);north=Math.max(north,y);}
 const center:Point=[(west+east)/2,(south+north)/2],centerLatitude=geographic(center)[1],groundScale=Math.cos(centerLatitude*Math.PI/180);
 // At least 200 m across, with 30 m around every footprint edge when larger.
 // Large complexes are rejected rather than silently clipping the target.
 const widthM=Math.max(200,Math.max(east-west,north-south)*groundScale+60);
 if(widthM>1000)throw new SiteImageryError('CROP_TOO_LARGE','This building is too large for one bounded aerial-image analysis. No part of its footprint was silently cropped.');
 const half=widthM/groundScale/2;
 const webMercator:Bounds=[center[0]-half,center[1]-half,center[0]+half,center[1]+half].map(v=>rounded(v)) as Bounds;
 const sw=geographic([webMercator[0],webMercator[1]]),ne=geographic([webMercator[2],webMercator[3]]);
 const footprintPixels=projected.map(polygon=>polygon.map(ring=>ring.map(([x,y]):Point=>[rounded((x-webMercator[0])/(webMercator[2]-webMercator[0])*SIZE,3),rounded((webMercator[3]-y)/(webMercator[3]-webMercator[1])*SIZE,3)])));
 const url=new URL(SITE_IMAGERY_SOURCE+'/export');
 const parameters={bbox:webMercator.join(','),bboxSR:'3857',imageSR:'3857',size:`${SIZE},${SIZE}`,format:'jpg',transparent:'false',f:'image'};
 for(const[key,value]of Object.entries(parameters))url.searchParams.set(key,value);
 return{url:url.toString(),bounds:{wgs84:[...sw,...ne].map(v=>rounded(v,9)) as Bounds,webMercator,crs:'EPSG:3857' as const,approximateGroundWidthM:rounded(widthM,3),approximateGroundPixelSizeM:rounded(widthM/SIZE,6)},target:{id:building.id,bin:building.bin,bbl:building.bbl,address:building.address,footprintPixels,footprintSource:FOOTPRINT_SOURCE,footprintEditedAt:building.footprint_edited_at??null}};
}

/** Inspect encoded dimensions without a browser canvas or native image package.
 * The source bytes remain unchanged for both the provider and the display. */
function jpegSize(bytes:Uint8Array):Point|null{
 if(bytes.length<12||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[bytes.length-2]!==0xff||bytes[bytes.length-1]!==0xd9)return null;
 let offset=2;
 while(offset+3<bytes.length){
  if(bytes[offset++]!==0xff)return null;
  while(bytes[offset]===0xff)offset++;
  const marker=bytes[offset++];
  if(marker===0xd9||marker===0xda)return null;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  const length=(bytes[offset]<<8)|bytes[offset+1];
  if(length<2||offset+length>bytes.length)return null;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
   if(length<8)return null;
   return[(bytes[offset+5]<<8)|bytes[offset+6],(bytes[offset+3]<<8)|bytes[offset+4]];
  }
  offset+=length;
 }
 return null;
}
async function readBoundedImage(response:Response,signal:AbortSignal):Promise<Uint8Array>{
 const length=Number(response.headers.get('content-length'));
 if(Number.isFinite(length)&&length>MAX_BYTES){await response.body?.cancel();throw new SiteImageryError('IMAGE_TOO_LARGE','The official aerial image exceeded the bounded image size.');}
 if(!response.body)throw new SiteImageryError('INVALID_IMAGE','The official imagery service returned no image.');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{
  while(true){if(signal.aborted)throw new SiteImageryError('IMAGE_UNAVAILABLE','The aerial-image request was canceled.');const{done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.length;if(total>MAX_BYTES)throw new SiteImageryError('IMAGE_TOO_LARGE','The official aerial image exceeded the bounded image size.');chunks.push(value);}
  if(signal.aborted)throw new SiteImageryError('IMAGE_UNAVAILABLE','The aerial-image request was canceled.');
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

/** One fixed, public-source request. No authentication, arbitrary URL, remote
 * redirect, client-provided crop or provider call is accepted here. */
export async function fetchSiteImagery(building:CityBuilding,parentSignal?:AbortSignal):Promise<SiteImagery>{
 const plan=planSiteImagery(building),controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort();
 if(parentSignal?.aborted)throw new SiteImageryError('IMAGE_UNAVAILABLE','The aerial-image request was canceled.');
 parentSignal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},TIMEOUT_MS);
 try{
  // Workerd supports only follow/manual; redirect:'error' throws before any
  // request. Manual plus the non-2xx guard preserves the no-redirect boundary.
  const response=await fetch(plan.url,{method:'GET',headers:{Accept:'image/jpeg'},credentials:'omit',redirect:'manual',cache:'no-store',signal:controller.signal});
  if(!response.ok){await response.body?.cancel();throw new SiteImageryError('IMAGE_UNAVAILABLE','The official 2024 aerial image could not be retrieved. No substitute image was used.');}
  if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='image/jpeg'){await response.body?.cancel();throw new SiteImageryError('INVALID_IMAGE','The official imagery service did not return a JPEG image.');}
  const bytes=await readBoundedImage(response,controller.signal),dimensions=jpegSize(bytes);
  if(!dimensions||dimensions[0]!==SIZE||dimensions[1]!==SIZE)throw new SiteImageryError('INVALID_IMAGE','The official aerial-image dimensions did not match the requested analysis crop.');
  const digest=await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer);
  if(controller.signal.aborted)throw new SiteImageryError('IMAGE_UNAVAILABLE','The aerial-image request was canceled.');
  const imageSha256=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return{image:{dataUrl:'data:image/jpeg;base64,'+btoa(binary),mimeType:'image/jpeg',width:SIZE,height:SIZE},bounds:plan.bounds,target:plan.target,source:{label:'NYS 2024 natural-color orthoimagery',url:SITE_IMAGERY_SOURCE,metadataUrl:SITE_IMAGERY_METADATA,exportUrl:plan.url,captureYear:2024,capturePeriod:'Spring 2024',publishedServiceResolutionM:0.3048,resolutionNote:'The service describes approximately 12-inch resolution. Exported pixel spacing is not a claim of additional native detail.',retrievedAt:new Date().toISOString(),imageSha256},limitations:[...limits]};
 }catch(error){
  if(timedOut)throw new SiteImageryError('IMAGE_TIMEOUT','The official aerial-image request timed out. No image analysis was performed.');
  if(error instanceof SiteImageryError)throw error;
  throw new SiteImageryError('IMAGE_UNAVAILABLE','The official 2024 aerial image could not be retrieved. No substitute image was used.');
 }finally{clearTimeout(timer);parentSignal?.removeEventListener('abort',cancel);}
}

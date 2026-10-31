import type {CityBuilding} from './city';
import {planSiteImagery, type SiteImagery} from './site-imagery';

export type TemporalImage={
 image:{dataUrl:string;mimeType:'image/jpeg';width:768;height:768};
 source:{label:string;url:string;metadataUrl:string;exportUrl:string;captureYear:2020|2024;capturePeriod:string;publishedServiceResolutionM:number;retrievedAt:string;imageSha256:string};
};
export type TemporalImagery={
 kind:'temporal_imagery';
 target:SiteImagery['target'];bounds:SiteImagery['bounds'];
 images:[TemporalImage,TemporalImage];
 alignment:{method:'identical EPSG:3857 export bounds';pixelRegistrationVerified:false};
 limitations:string[];
};
export const TEMPORAL_IMAGERY_YEARS=[2020,2024] as const;
const HOST='https://orthos.its.ny.gov/arcgis/rest/services/wms/';
const MAX_BYTES=2_000_000;
export class TemporalImageryError extends Error{
 constructor(public code:'SOURCE_UNAVAILABLE'|'INVALID_IMAGE'|'IMAGE_TOO_LARGE'|'SOURCE_TIMEOUT'|'CANCELLED',message:string){super(message);this.name='TemporalImageryError';}
}
const failure=(year:number)=>new TemporalImageryError('SOURCE_UNAVAILABLE',`The official ${year} aerial image is unavailable. A different year or substitute image was not used.`);
function jpegSize(bytes:Uint8Array):[number,number]|null{
 if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
 let offset=2;
 while(offset+3<bytes.length){
  if(bytes[offset++]!==255)return null;while(bytes[offset]===255)offset++;
  const marker=bytes[offset++];if(marker===217||marker===218)return null;
  if(marker===1||(marker>=208&&marker<=215))continue;
  const length=(bytes[offset]<<8)|bytes[offset+1];if(length<2||offset+length>bytes.length)return null;
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return length<8?null:[(bytes[offset+5]<<8)|bytes[offset+6],(bytes[offset+3]<<8)|bytes[offset+4]];
  offset+=length;
 }return null;
}
async function bytesOf(response:Response,signal:AbortSignal):Promise<Uint8Array>{
 if(signal.aborted){await response.body?.cancel();throw new TemporalImageryError('CANCELLED','The aerial-image comparison was cancelled.');}
 if(Number(response.headers.get('content-length'))>MAX_BYTES){await response.body?.cancel();throw new TemporalImageryError('IMAGE_TOO_LARGE','An official aerial image exceeded the 2 MB image bound.');}
 if(!response.body)throw new TemporalImageryError('INVALID_IMAGE','An official aerial image was empty.');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 const aborted=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',aborted,{once:true});
 try{while(true){if(signal.aborted)throw new TemporalImageryError('CANCELLED','The aerial-image comparison was cancelled.');const{value,done}=await reader.read();if(signal.aborted)throw new TemporalImageryError('CANCELLED','The aerial-image comparison was cancelled.');if(done)break;if(!value)continue;total+=value.length;if(total>MAX_BYTES)throw new TemporalImageryError('IMAGE_TOO_LARGE','An official aerial image exceeded the 2 MB image bound.');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{signal.removeEventListener('abort',aborted);reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return bytes;
}
/** The existing full-footprint crop planner sets the one geographic window.
 * Fixed source years and hosts cannot be overridden by user/model arguments. */
export function planTemporalImagery(building:CityBuilding){
 const plan=planSiteImagery(building);
 const sources=TEMPORAL_IMAGERY_YEARS.map(year=>{
  const source=HOST+year+'/MapServer',url=new URL(source+'/export');url.search=new URL(plan.url).search;
  return{year,url:url.toString(),source,metadataUrl:`https://gis.ny.gov/${year}-orthoimagery`};
 });
 return{target:plan.target,bounds:plan.bounds,sources};
}
/** Two bounded public-source reads, no model or arbitrary outbound URL. Both
 * original JPEG byte sequences are retained. Partial pairs are never returned. */
export async function fetchTemporalImagery(building:CityBuilding,parentSignal?:AbortSignal):Promise<TemporalImagery>{
 const plan=planTemporalImagery(building),controller=new AbortController();let timedOut=false;
 if(parentSignal?.aborted)throw new TemporalImageryError('CANCELLED','The aerial-image comparison was cancelled.');
 const abort=()=>controller.abort();parentSignal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},25_000);
 try{
  const images=await Promise.all(plan.sources.map(async source=>{
   const response=await fetch(source.url,{method:'GET',headers:{Accept:'image/jpeg'},credentials:'omit',redirect:'manual',cache:'no-store',signal:controller.signal});
   if(!response.ok){await response.body?.cancel();throw failure(source.year);}
   if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='image/jpeg'){await response.body?.cancel();throw new TemporalImageryError('INVALID_IMAGE',`The ${source.year} source did not return a JPEG image.`);}
   const bytes=await bytesOf(response,controller.signal),size=jpegSize(bytes);
   if(!size||size[0]!==768||size[1]!==768)throw new TemporalImageryError('INVALID_IMAGE',`The ${source.year} image did not match the requested 768-pixel crop.`);
   const digest=await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer),imageSha256=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
   let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   return{image:{dataUrl:'data:image/jpeg;base64,'+btoa(binary),mimeType:'image/jpeg' as const,width:768 as const,height:768 as const},source:{label:`NYS ${source.year} natural-color orthoimagery`,url:source.source,metadataUrl:source.metadataUrl,exportUrl:source.url,captureYear:source.year,capturePeriod:`Spring ${source.year}`,publishedServiceResolutionM:.3048,retrievedAt:new Date().toISOString(),imageSha256}};
  }));
  if(controller.signal.aborted)throw new TemporalImageryError('CANCELLED','The aerial-image comparison was cancelled.');
  return{kind:'temporal_imagery',target:plan.target,bounds:plan.bounds,images:images as [TemporalImage,TemporalImage],alignment:{method:'identical EPSG:3857 export bounds',pixelRegistrationVerified:false},limitations:[
   'These are two historical source images, from Spring 2020 and Spring 2024, not a current view or a before-and-after survey. Exact acquisition dates for these crops are unavailable.',
   'Both exports use identical bounds, size and north-up orientation. This does not verify pixel-perfect registration between aerial surveys.',
   'The services describe approximately 12-inch published detail. Resizing for model input produces a coarser representation; it does not create new detail.',
   'Shadows, illumination, season, occlusion, parked objects, image processing and alignment can differ. Apparent differences are inspection prompts, not verified physical changes.',
   'The current official footprint is a reference from a separate source vintage. Features cannot establish roof condition, usable area, capacity, permissions, flood risk or investment value.',
  ]};
 }catch(error){
  controller.abort();
  if(parentSignal?.aborted)throw new TemporalImageryError('CANCELLED','The aerial-image comparison was cancelled.');
  if(timedOut)throw new TemporalImageryError('SOURCE_TIMEOUT','The official imagery request timed out. No temporal comparison was performed.');
  if(error instanceof TemporalImageryError)throw error;
  // Do not disclose an upstream body or environmental details.
  throw new TemporalImageryError('SOURCE_UNAVAILABLE','The official image pair could not be retrieved. No substitute source or year was used.');
 }finally{clearTimeout(timer);parentSignal?.removeEventListener('abort',abort);}
}

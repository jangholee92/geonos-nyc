import type {TemporalImagery} from './temporal-imagery';
const hashPattern=/^[a-f0-9]{64}$/;
/** Validation deliberately excludes arbitrary image URLs. Both inputs must be
 * the original bounded data URLs produced by the fixed public-source adapter. */
export function validateTemporalPair(value:unknown):asserts value is TemporalImagery{
 if(!value||typeof value!=='object')throw Error('A verified historical image pair is required.');
 const pair=value as TemporalImagery;
 if(pair.kind!=='temporal_imagery'||typeof pair.target?.id!=='string'||!/^[1-9]\d{0,9}$/.test(pair.target.id)||!Array.isArray(pair.images)||pair.images.length!==2||pair.bounds?.crs!=='EPSG:3857')throw Error('The historical image pair is invalid.');
 if(typeof pair.target.address!=='string'||!pair.target.address.trim()||pair.target.address.length>200||/[\u0000-\u001f]/.test(pair.target.address))throw Error('The target address is invalid.');
 for(const[key,length]of[['bin',7],['bbl',10]] as const){const v=pair.target[key];if(v!==null&&(typeof v!=='string'||v.length!==length||!/^\d+$/.test(v)))throw Error('The target native identifiers are invalid.');}
 if(pair.target.footprintSource!=='https://data.cityofnewyork.us/d/5zhs-2jue'||(pair.target.footprintEditedAt!==null&&(typeof pair.target.footprintEditedAt!=='string'||pair.target.footprintEditedAt.length>40||!Number.isFinite(Date.parse(pair.target.footprintEditedAt)))))throw Error('The target geometry provenance is invalid.');
 let points=0;
 if(!Array.isArray(pair.target.footprintPixels)||!pair.target.footprintPixels.length||pair.target.footprintPixels.length>256)throw Error('The target footprint is invalid.');
 for(const polygon of pair.target.footprintPixels){
  if(!Array.isArray(polygon)||!polygon.length||polygon.length>256)throw Error('The target footprint is invalid.');
  for(const ring of polygon){
   if(!Array.isArray(ring)||ring.length<4||(points+=ring.length)>50000)throw Error('The target footprint is invalid.');
   for(const p of ring)if(!Array.isArray(p)||p.length!==2||!p.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=768))throw Error('The target footprint is invalid.');
   if(ring[0][0]!==ring.at(-1)![0]||ring[0][1]!==ring.at(-1)![1])throw Error('The target footprint ring is not closed.');
  }
 }
 const bbox=pair.bounds.webMercator;
 if(!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||bbox[2]<=bbox[0]||bbox[3]<=bbox[1]||Math.abs((bbox[2]-bbox[0])-(bbox[3]-bbox[1]))>.0001||!Number.isFinite(pair.bounds.approximateGroundWidthM)||pair.bounds.approximateGroundWidthM<200||pair.bounds.approximateGroundWidthM>1000)throw Error('The image-pair bounds are invalid.');
 const wgs=pair.bounds.wgs84;
 if(!Array.isArray(wgs)||wgs.length!==4||!wgs.every(Number.isFinite)||wgs[0]<-74.32||wgs[2]>-73.63||wgs[1]<40.45||wgs[3]>40.96||wgs[0]>=wgs[2]||wgs[1]>=wgs[3])throw Error('The geographic crop is outside the supported NYC range.');
 const geographical=(x:number,y:number)=>[x/6378137*180/Math.PI,(2*Math.atan(Math.exp(y/6378137))-Math.PI/2)*180/Math.PI];
 const derived=[...geographical(bbox[0],bbox[1]),...geographical(bbox[2],bbox[3])];
 const centerLatitude=geographical((bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2)[1];
 const derivedGroundWidth=(bbox[2]-bbox[0])*Math.cos(centerLatitude*Math.PI/180);
 if(Math.abs(derivedGroundWidth-pair.bounds.approximateGroundWidthM)>.001)throw Error('The reported ground scale does not match the geographic crop.');
 if(derived.some((v,i)=>Math.abs(v-wgs[i])>1e-7)||!Number.isFinite(pair.bounds.approximateGroundPixelSizeM)||Math.abs(pair.bounds.approximateGroundPixelSizeM-pair.bounds.approximateGroundWidthM/768)>1e-6)throw Error('The geographic and image bounds do not agree.');
 for(const[index,item]of pair.images.entries()){
  const year=index===0?2020:2024,base=`https://orthos.its.ny.gov/arcgis/rest/services/wms/${year}/MapServer`;
  if(item?.source?.captureYear!==year||item.source.label!==`NYS ${year} natural-color orthoimagery`||item.source.capturePeriod!==`Spring ${year}`||item.source.publishedServiceResolutionM!==.3048||typeof item.source.retrievedAt!=='string'||item.source.retrievedAt.length>40||item.source.url!==base||item.source.metadataUrl!==`https://gis.ny.gov/${year}-orthoimagery`||!hashPattern.test(item.source.imageSha256)||!Number.isFinite(Date.parse(item.source.retrievedAt)))throw Error('The image source provenance is invalid.');
  if(item.image?.width!==768||item.image.height!==768||item.image.mimeType!=='image/jpeg'||typeof item.image.dataUrl!=='string'||item.image.dataUrl.length>2_666_700||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(item.image.dataUrl))throw Error('The historical image encoding is invalid.');
  let url:URL;try{url=new URL(item.source.exportUrl);}catch{throw Error('The source crop URL is invalid.');}
  if(url.origin+url.pathname!==base+'/export'||url.searchParams.get('bbox')!==bbox.join(',')||url.searchParams.get('bboxSR')!=='3857'||url.searchParams.get('imageSR')!=='3857'||url.searchParams.get('size')!=='768,768'||url.searchParams.get('f')!=='image'||url.searchParams.get('format')!=='jpg')throw Error('The two source crops do not use the same verified bounds.');
 }
 if(!Array.isArray(pair.limitations)||pair.limitations.length>10||pair.limitations.some(v=>typeof v!=='string'||v.length>600))throw Error('The source limitations are invalid.');
 if(pair.alignment?.pixelRegistrationVerified!==false||pair.alignment.method!=='identical EPSG:3857 export bounds')throw Error('The image alignment scope is invalid.');
}

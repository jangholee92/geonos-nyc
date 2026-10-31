import {fetchPublicJson} from './public-fetch';
import quality from './city-quality.json';
/** NYC official-source query adapter. Bounding/pagination limits display size, not source coverage. */
export function invalidFootprint(f:any){return Number(f.feature_code)===1003||quality.invalid_geometry_doitt_ids.map(String).includes(String(f.doitt_id))||quality.placeholder_doitt_ids.map(String).includes(String(f.doitt_id))}
export const CITY_SOURCE = 'https://data.cityofnewyork.us/resource/';
export const BOROUGHS:Record<string,{name:string,code:string,bounds:number[]}>={
 MN:{name:'Manhattan',code:'1',bounds:[-74.0479,40.6829,-73.9067,40.8822]},BX:{name:'Bronx',code:'2',bounds:[-73.9339,40.7857,-73.7481,40.9176]},BK:{name:'Brooklyn',code:'3',bounds:[-74.042,40.5695,-73.833,40.7395]},QN:{name:'Queens',code:'4',bounds:[-73.9626,40.5417,-73.7000,40.8008]},SI:{name:'Staten Island',code:'5',bounds:[-74.2591,40.4959,-74.0492,40.6517]},
};
export type Geometry={type:string;coordinates:any};
export type CityBuilding={retrieval?:{mode:"source-snapshot"|"live-query";retrieved_at:string};feature_code?:number|null;record_type?:string|null;geometry_quality?:string;entity_type?:'building'|'parcel';id:string;bin:string|null;bbl:string|null;base_bbl:string|null;mappluto_bbl:string|null;match_method:string;address:string;borough:string;borough_code:string;latitude:number;longitude:number;geometry:Geometry;footprint_area_sqft:number|null;roof_height_ft:number|null;construction_year:number|null;ground_elevation_ft:number|null;lot_building_area_sqft:number|null;lot_area_sqft:number|null;lot_floors:number|null;lot_buildings:number|null;zoning:string[];land_use:string|null;building_class:string|null;residential_units:number|null;commercial_area_sqft:number|null;residential_area_sqft:number|null;storage_area_sqft:number|null;factory_area_sqft:number|null;built_far:number|null;residential_far:number|null;commercial_far:number|null;facility_far:number|null;year_altered:number|null;year_altered2:number|null;lot_front_ft:number|null;lot_depth_ft:number|null;lot_type:string|null;owner_type:string|null;historic_district:string|null;landmark:string|null;flood_2007:number|null;flood_2015:number|null;pluto_version:string|null;footprint_edited_at:string|null;source_ids:string[];source:string;join_warning:string|null};
// OTI's FEATURE_CODE dictionary, not a land-use or occupancy inference.
const recordTypes:Record<number,string>={1000:'Parking',1001:'Gas Station Canopy',1002:'Storage Tank',1003:'Placeholder',1004:'Auxiliary Structure',1005:'Temporary Structure',1006:'Cantilevered Building',2100:'Building',2110:'Skybridge',5100:'Building Under Construction',5110:'Garage'};
export type CityQuery={unit?:'building'|'parcel';q?:string;borough?:string;bbox?:number[];cursor?:number;page?:number;limit?:number;minArea?:number;zoning?:string;landUse?:string};
export type CityPage={buildings:CityBuilding[];next_cursor:number|null;next_page:number|null;has_more:boolean;mode:string;matched_parcels?:number;query:CityQuery;fetched_at:string;warnings:string[];source_url:string};
const cache=new Map<string,{until:number;data:any}>();
export function n(v:unknown,zeroNull=false){const k=Number(v);return v===null||v===undefined||v===''||!Number.isFinite(k)||(zeroNull&&k===0)?null:k}
export function textLiteral(s:string){return "'"+s.replaceAll("'","''")+"'"}
/** A nonpositive TTL explicitly bypasses application-cache reads and writes. */
export async function soda(id:string,params:Record<string,string|number>,ttl=180000):Promise<any[]>{
 const u=new URL(CITY_SOURCE+id+'.json');for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));const key=u.toString();const known=ttl>0?cache.get(key):undefined;if(known&&known.until>Date.now())return known.data;
 const rows:any=await fetchPublicJson(u,{headers:{Accept:'application/json'},timeoutMs:25000,label:id});if(!Array.isArray(rows))throw new Error('The NYC data response has an unexpected format.');if(ttl>0){if(cache.size>80)cache.delete(cache.keys().next().value!);cache.set(key,{until:Date.now()+ttl,data:rows});}return rows;
}
export function validateQuery(p:URLSearchParams):CityQuery{
 const unit=p.get('unit')||'building';if(!['building','parcel'].includes(unit))throw Error('Choose a valid spatial unit.');const q=(p.get('q')||'').trim();if(q.length>120)throw Error('Search text must be 120 characters or fewer.');const borough=p.get('borough')||'all';if(borough!=='all'&&!BOROUGHS[borough])throw Error('Choose a valid borough.');
 const val=(key:string,def:number,min:number,max:number)=>{const raw=p.get(key);const x=raw===null?def:Number(raw);if(!Number.isFinite(x)||x<min||x>max)throw Error(`Invalid ${key} value.`);return x};
 let bbox:number[]|undefined;if(p.get('bbox')){bbox=p.get('bbox')!.split(',').map(Number);if(bbox.length!==4||bbox.some(x=>!Number.isFinite(x))||bbox[0]<-74.5||bbox[2]>-73.5||bbox[1]<40.3||bbox[3]>41.1||bbox[0]>=bbox[2]||bbox[1]>=bbox[3])throw Error('Provide valid map bounds within New York City.');}
 const zoning=p.get('zoning')||'all',landUse=p.get('landUse')||'all';if(!['all','M','C','R'].includes(zoning)||!['all','01','02','03','04','05','06','07','08','09','10','11'].includes(landUse))throw Error('Invalid filter.');
 return{unit:unit as 'building'|'parcel',q,borough,bbox,cursor:Math.floor(val('cursor',0,0,1e10)),page:Math.floor(val('page',0,0,100000)),limit:Math.floor(val('limit',120,1,300)),minArea:val('minArea',0,0,1e9),zoning,landUse};
}
export function geoAreaSqft(geom:Geometry):number|null{const polygons=geom.type==='MultiPolygon'?geom.coordinates:geom.type==='Polygon'?[geom.coordinates]:[];let total=0;const rad=Math.PI/180;for(const poly of polygons){for(let r=0;r<poly.length;r++){const ring=poly[r];let sum=0;for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];sum+=(b[0]-a[0])*rad*(2+Math.sin(a[1]*rad)+Math.sin(b[1]*rad))}total+=(r===0?1:-1)*Math.abs(sum)*6371008.8**2/2}}return total>0?Math.round(total*10.7639104167):null}
/** Choose an interior point in the largest valid polygon component, excluding holes.
 * A horizontal scanline between vertex levels avoids ambiguous vertex crossings.
 * Unlike a vertex mean or centroid, its interval midpoint cannot land in a hole
 * or between disconnected parts of a valid Polygon/MultiPolygon.
 */
export function geomPoint(geom:Geometry):number[]{
 const coordinate=(p:any):p is number[]=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
 if(geom?.type==='Point')return coordinate(geom.coordinates)?geom.coordinates.slice(0,2):[NaN,NaN];
 const candidates=geom?.type==='MultiPolygon'?geom.coordinates:geom?.type==='Polygon'?[geom.coordinates]:[];
 if(!Array.isArray(candidates))return[NaN,NaN];
 const polygons=candidates.filter((poly:any)=>Array.isArray(poly)&&poly.length&&poly.every((ring:any)=>Array.isArray(ring)&&ring.length>=4&&ring.every(coordinate)));
 const ringArea=(ring:number[][])=>Math.abs(ring.slice(1).reduce((sum,p,i)=>sum+ring[i][0]*p[1]-p[0]*ring[i][1],0))/2;
 polygons.sort((a:number[][][],b:number[][][])=>b.reduce((sum,r,i)=>sum+(i?-1:1)*ringArea(r),0)-a.reduce((sum,r,i)=>sum+(i?-1:1)*ringArea(r),0));
 for(const polygon of polygons as number[][][][]){
  const levels=[...new Set(polygon.flatMap(ring=>ring.map(p=>p[1])))].sort((a,b)=>a-b);
  const middle=(levels[0]+levels.at(-1)!)/2;
  const scanlines=levels.slice(1).map((y,i)=>(levels[i]+y)/2).filter((y,i)=>y>levels[i]&&y<levels[i+1]).sort((a,b)=>Math.abs(a-middle)-Math.abs(b-middle));
  for(const y of scanlines){
   const crossings:number[]=[];
   for(const ring of polygon)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];
    if((a[1]>y)!==(b[1]>y))crossings.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
   }
   crossings.sort((a,b)=>a-b);
   if(crossings.length%2)continue;
   let left=NaN,right=NaN,width=0;
   for(let i=0;i<crossings.length;i+=2)if(crossings[i+1]-crossings[i]>width){left=crossings[i];right=crossings[i+1];width=right-left;}
   if(width>0){const x=(left+right)/2;if(x>left&&x<right)return[x,y];}
  }
 }
 return[NaN,NaN];
}
const parcelFields='bbl,address,borough,latitude,longitude,bldgarea,lotarea,numfloors,numbldgs,zonedist1,zonedist2,zonedist3,zonedist4,landuse,bldgclass,unitstotal,unitsres,comarea,resarea,strgearea,factryarea,builtfar,residfar,commfar,facilfar,yearbuilt,yearalter1,yearalter2,lotfront,lotdepth,lottype,ownertype,histdist,landmark,firm07_flag,pfirm15_flag,version';
export function combineBuilding(f:any,p:any|undefined,method:string):CityBuilding{
 const bbl=p?String(p.bbl).split('.')[0]:null;const [longitude,latitude]=geomPoint(f.the_geom);const base=String(f.base_bbl||'').trim(),map=String(f.mappluto_bbl||'').trim();const code=Object.keys(BOROUGHS).find(k=>BOROUGHS[k].code===String(f.bin||map||base).charAt(0))||'';
 return{entity_type:'building',feature_code:n(f.feature_code),record_type:n(f.feature_code)===null?null:recordTypes[Number(f.feature_code)]||'Other',id:String(f.doitt_id),bin:f.bin?String(f.bin):null,bbl,base_bbl:base||null,mappluto_bbl:map||null,match_method:method,address:p?.address||f.name||`Building ${f.bin||f.doitt_id}`,borough:BOROUGHS[code]?.name||p?.borough||'Unknown',borough_code:code,latitude,longitude,geometry:f.the_geom,geometry_quality:invalidFootprint(f)?'invalid_or_placeholder':'source_geometry',footprint_area_sqft:invalidFootprint(f)?null:geoAreaSqft(f.the_geom),roof_height_ft:n(f.height_roof,true),construction_year:n(f.construction_year,true),ground_elevation_ft:n(f.ground_elevation),lot_building_area_sqft:n(p?.bldgarea,true),lot_area_sqft:n(p?.lotarea,true),lot_floors:n(p?.numfloors,true),lot_buildings:n(p?.numbldgs,true),zoning:[p?.zonedist1,p?.zonedist2,p?.zonedist3,p?.zonedist4].filter(Boolean),land_use:p?.landuse||null,building_class:p?.bldgclass||null,residential_units:n(p?.unitsres),commercial_area_sqft:n(p?.comarea),residential_area_sqft:n(p?.resarea),storage_area_sqft:n(p?.strgearea),factory_area_sqft:n(p?.factryarea),built_far:n(p?.builtfar),residential_far:n(p?.residfar),commercial_far:n(p?.commfar),facility_far:n(p?.facilfar),year_altered:n(p?.yearalter1,true),year_altered2:n(p?.yearalter2,true),lot_front_ft:n(p?.lotfront),lot_depth_ft:n(p?.lotdepth),lot_type:p?.lottype||null,owner_type:p?.ownertype||null,historic_district:p?.histdist||null,landmark:p?.landmark||null,flood_2007:n(p?.firm07_flag),flood_2015:n(p?.pfirm15_flag),pluto_version:p?.version||null,footprint_edited_at:f.last_edited_date||null,source_ids:['nyc-footprints',...(p?['nyc-pluto']:[])],source:'https://data.cityofnewyork.us/d/5zhs-2jue',join_warning:!p?'No matching PLUTO lot was found. Lot attributes remain unknown.':map&&base&&map!==base?'MapPLUTO and base BBL differ. Check condominium billing or lot changes.':null};
}
export async function queryCity(input:CityQuery):Promise<CityPage>{
 // Tool callers use this adapter too; enforce the same limits as the HTTP route.
 const query=validateQuery(new URLSearchParams(Object.entries(input).filter(([,v])=>v!==undefined).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v)])));
 const {unit='building',q='',borough='all',bbox,cursor=0,page=0,limit=120,minArea=0,zoning='all',landUse='all'}=query;
 const isBin=/^\d{7}$/.test(q);
 const parcelMode=unit==='parcel'||(!isBin&&!!q)||minArea>0||zoning!=='all'||landUse!=='all';
 const key=(v:unknown)=>{const id=String(v??'').trim().split('.')[0];return /^\d{10}$/.test(id)?id:null};
 const fetchParcels=async(ids:string[])=>{const out:any[]=[];for(let i=0;i<ids.length;i+=100)out.push(...await soda('64uk-42ks',{$select:parcelFields,$where:`bbl in (${ids.slice(i,i+100).join(',')})`,$limit:100}));return out};
 const where:string[]=[];let parcels:any[]=[];let matchedParcels:number|undefined;let nextPage:number|null=null;
 if(parcelMode){
  const pw:string[]=[];
  if(isBin){
   // Resolve a BIN to its authoritative billing lot before applying parcel filters.
   const footprints=await soda('5zhs-2jue',{$select:'doitt_id,bin,mappluto_bbl,base_bbl',$where:`bin=${q}`,$order:'doitt_id',$limit:50000});
   if(footprints.length===50000)throw Error('This BIN has too many linked results. Narrow the search by borough or BBL.');
   const ids=[...new Set(footprints.flatMap(f=>[key(f.mappluto_bbl),key(f.base_bbl)]).filter((id):id is string=>id!==null))];
   const available=new Set((await fetchParcels(ids)).map(p=>key(p.bbl)));
   const canonical=[...new Set(footprints.map(f=>available.has(key(f.mappluto_bbl))?key(f.mappluto_bbl):available.has(key(f.base_bbl))?key(f.base_bbl):null).filter((id):id is string=>id!==null))];
   pw.push(canonical.length?`bbl in (${canonical.join(',')})`:'bbl IS NULL');
  }else if(/^\d{10}$/.test(q))pw.push(`bbl=${q}`);
  else if(q)pw.push(`upper(address) like ${textLiteral('%'+q.toUpperCase().replaceAll('%','').replaceAll('_','')+'%')}`);
  if(borough!=='all')pw.push(`borough=${textLiteral(borough)}`);
  if(minArea>0)pw.push(`bldgarea>=${minArea}`);
  if(zoning!=='all')pw.push('('+[1,2,3,4].map(i=>`zonedist${i} like '${zoning}%'`).join(' OR ')+')');
  if(landUse!=='all')pw.push(`landuse=${Number(landUse)}`);
  if(bbox)pw.push(`longitude between ${bbox[0]} and ${bbox[2]} AND latitude between ${bbox[1]} and ${bbox[3]}`);
  const clause=pw.join(' AND ')||'bbl IS NOT NULL';
  const parcelLimit=unit==='parcel'?limit:40;
  const [ps,count]=await Promise.all([
   soda('64uk-42ks',{$select:parcelFields,$where:clause,$order:'bbl',$limit:parcelLimit,$offset:page*parcelLimit}),
   soda('64uk-42ks',{$select:'count(*) as count',$where:clause}),
  ]);
  parcels=ps;matchedParcels=Number(count[0]?.count||0);nextPage=(page+1)*parcelLimit<matchedParcels?page+1:null;
  if(unit==='parcel')return{
   buildings:parcels.map(p=>{const b=combineBuilding({doitt_id:'p:'+key(p.bbl),base_bbl:String(p.bbl),mappluto_bbl:String(p.bbl),the_geom:{type:'Point',coordinates:[n(p.longitude)??NaN,n(p.latitude)??NaN]}},p,'BBL');return{...b,entity_type:'parcel' as const,feature_code:null,record_type:'Tax lot',id:'p:'+key(p.bbl),bin:null,construction_year:n(p.yearbuilt,true),footprint_area_sqft:null,source_ids:['nyc-pluto'],source:'https://data.cityofnewyork.us/d/64uk-42ks'}}),
   next_cursor:null,next_page:nextPage,has_more:nextPage!==null,mode:'all-parcels',matched_parcels:matchedParcels,query,fetched_at:new Date().toISOString(),warnings:['Parcel search. Lots without coordinates remain in the list but cannot appear on the map.','Unused lot FAR does not establish development feasibility or permission.'],source_url:'https://data.cityofnewyork.us/d/64uk-42ks',
  };
  if(!parcels.length)return{buildings:[],next_cursor:null,next_page:null,has_more:false,mode:'parcel-search',matched_parcels:matchedParcels,query,fetched_at:new Date().toISOString(),warnings:[],source_url:'https://data.cityofnewyork.us/d/64uk-42ks'};
  const ids=parcels.map(p=>textLiteral(key(p.bbl)!)).join(',');
  where.push(`(mappluto_bbl in (${ids}) OR base_bbl in (${ids}))`);
  if(isBin)where.push(`bin=${q}`);
 }else{
  if(isBin)where.push(`bin=${q}`);
  if(borough!=='all')where.push(`bin between ${BOROUGHS[borough].code}000000 and ${BOROUGHS[borough].code}999999`);
  if(bbox)where.push(`intersects(the_geom, 'POLYGON ((${bbox[0]} ${bbox[1]},${bbox[2]} ${bbox[1]},${bbox[2]} ${bbox[3]},${bbox[0]} ${bbox[3]},${bbox[0]} ${bbox[1]}))')`);
 }
 if(cursor)where.push(`doitt_id>${cursor}`);
 const raw=await soda('5zhs-2jue',{$where:where.join(' AND ')||'doitt_id IS NOT NULL',$order:'doitt_id',$limit:limit+1});
 const hasExtra=raw.length>limit;const fp=raw.slice(0,limit);
 const pageIds=new Set(parcels.map(p=>key(p.bbl)));
 const have=new Map(parcels.map(p=>[key(p.bbl),p]));
 const needed=[...new Set(fp.flatMap(f=>[key(f.mappluto_bbl),key(f.base_bbl)]).filter((id):id is string=>id!==null&&!have.has(id)))];
 for(const p of await fetchParcels(needed))have.set(key(p.bbl),p);
 const buildings=fp.filter(f=>f.the_geom).flatMap(f=>{
  const mp=have.get(key(f.mappluto_bbl)),bp=have.get(key(f.base_bbl)),p=mp||bp;
  // A matching physical/base lot must not override an existing billing-lot join
  // and leak a different parcel's attributes past address/area/use filters.
  if(parcelMode&&!pageIds.has(key(p?.bbl)))return[];
  return[combineBuilding(f,p,mp?'mappluto_bbl':bp?'base_bbl':'unmatched')];
 });
 return{buildings,next_cursor:hasExtra?Number(fp.at(-1)?.doitt_id):null,next_page:hasExtra?page:nextPage,has_more:hasExtra||nextPage!==null,mode:parcelMode?'parcel-search':'building-search',matched_parcels:matchedParcels,query,fetched_at:new Date().toISOString(),warnings:[`This page contains ${buildings.length} footprint records. Continue to the next page for more matching results.`,'PLUTO area, use and FAR describe the tax lot. Keep them separate from individual building attributes.',...(parcelMode?['Address, area and use filters first search all PLUTO lots, then return linked footprints. Lots without a footprint match do not appear in building results.']:[])],source_url:'https://data.cityofnewyork.us/d/5zhs-2jue'};
}
export function haversine(a:number[],b:number[]){const r=Math.PI/180,dlat=(b[1]-a[1])*r,dlon=(b[0]-a[0])*r;const h=Math.sin(dlat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dlon/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)))}

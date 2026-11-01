'use client';

import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {Map as LibreMap,GeoJSONSource,FilterSpecification} from 'maplibre-gl';
import {ArrowUpRight,Box,Compass,Expand,Layers3,LocateFixed,Minus,Plus,RotateCcw,Shrink} from 'lucide-react';
import type {CityBuilding} from '@/lib/city';
import {BOROUGHS} from '@/lib/city';
import {pickBuildingAtPoint} from '@/lib/map-selection';
import {CITY_ATLAS,atlasBuildingId,cityAtlasSource} from '@/lib/city-atlas';
import 'maplibre-gl/dist/maplibre-gl.css';
import './city-map.css';

type Any=Record<string,any>;
export type CityMapProps={buildings:CityBuilding[];selectedIds:string[];activeId?:string;boundary:any;overview:any;layer:any|null;layerId:string;onSelect:(building:CityBuilding)=>void;onSelectId?:(id:string)=>void;onFeature:(properties:any)=>void;onBounds:(bbox:number[])=>void;focusBorough:string;focusToken:number;focusBuilding?:CityBuilding|null;queryCaption?:string;onMapPoint?:(point:[number,number])=>void;compact?:boolean};
const CITY=[-74.26,40.49,-73.69,40.92];
const EMPTY={type:'FeatureCollection',features:[]} as any;
const COLORS={result:'#73dfc5',selected:'#f5c77b',active:'#fff0c5'};
const SELECTION_BADGES=[{label:'A',color:'#c8f77b',icon:'geo-selection-a'},{label:'B',color:'#edb59e',icon:'geo-selection-b'}] as const;
const labels:Record<string,string>={density:'Building distribution',flood:'Recorded flood intersection',footprints:'Building footprints',pluto:'Tax lots','4mhf-duep':'Heat vulnerability','jjja-shxy':'Truck routes','27ya-gqtm':'2050s coastal flood scenario',subway_stations:'Subway stations',firehouses:'Firehouses',hospitals:'Hospitals',health_facilities:'Health facilities','parks.overview':'Parks','hurricane_evacuation_zones.overview':'Hurricane evacuation zones','community_districts.overview':'Community districts',air_quality_2024_cd:'2024 air quality',canopy_2010_cd:'2010 tree canopy','zoning_districts.overview':'Zoning districts',zoning_commercial_overlays:'Commercial overlays',zoning_special_districts:'Special districts',zoning_special_subdistricts:'Special subdistricts',zoning_limited_height:'Height districts',zoning_map_amendments:'Zoning map amendments','stormwater_extreme_2080.overview':'2080 extreme rain scenario','stormwater_moderate_2050.overview':'2050 moderate rain scenario','stormwater_moderate_current.overview':'Current moderate rain scenario'};
export const hasPoint=(b:CityBuilding)=>b.geometry_quality!=='invalid_or_placeholder'&&Number.isFinite(b.longitude)&&Number.isFinite(b.latitude)&&b.longitude>=-74.5&&b.longitude<=-73.5&&b.latitude>=40.3&&b.latitude<=41.1;
const collection=(features:any[])=>({type:'FeatureCollection',features}) as any;
const feature=(geometry:any,properties:Any,id?:string)=>({type:'Feature',...(id?{id}:{}),geometry,properties});
const metricNumber=(value:unknown)=>value===null||value===undefined||value===''?null:typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()&&Number.isFinite(Number(value))?Number(value):null;
export function overlayColor(p:Any,id:string){
 const category=Number(p.Flooding_Category??p.Flooding_C);
 if(id.startsWith('stormwater'))return category===1?'#66c9e4':category===2?'#658bed':category===3?'#aa8ee5':'#64748b';
 if(id==='canopy_2010_cd'||p.tree_canopy_percent!==undefined){const x=metricNumber(p.tree_canopy_percent);return x===null||x<0||x>100?'#64748b':x<10?'#d4d77a':x<25?'#7fc7a1':x<40?'#39a88a':'#197368';}
 if(id==='air_quality_2024_cd'||p.pm25_ug_m3!==undefined){const x=metricNumber(p.pm25_ug_m3);return x===null||x<0?'#64748b':x<5?'#89c9c7':x<6?'#d1bd82':x<7?'#df987d':'#c56e87';}
 if(id.includes('evacuation')){const zone=metricNumber(p.hurricane_??p.zone);return zone!==null&&Number.isInteger(zone)&&zone>=1&&zone<=6?['#d68791','#dc9c7c','#d9bc83','#a8c598','#7dbac0','#8da7d0'][zone-1]:'#64748b';}
 if(id.includes('zoning')){const zone=String(p.ZONEDIST??p.zonedist??'');return zone.startsWith('M')?'#b49ae6':zone.startsWith('C')?'#edb17d':zone.startsWith('R')?'#92c6a5':'#c4b4df';}
 if(id.includes('parks'))return '#6fbd98';
 if(id.includes('subway'))return '#e3c37a';
 if(id.includes('firehouse'))return '#ee9a7a';
 if(id.includes('hospital')||id.includes('health'))return '#d796b9';
 if(id==='jjja-shxy'||id.includes('truck'))return '#d6b785';
 if(id==='27ya-gqtm'||id.includes('flood'))return '#78aee6';
 const hvi=Number(p.hvi??p.HVI??p.heat_vulnerability_index);if(hvi>=1&&hvi<=5)return ['#79c5bc','#b7caaa','#d6c18a','#dc9d7c','#c87e91'][hvi-1];
 return '#aa9ed4';
}
export function layerLegend(id:string):[string,string][]{
 if(id.startsWith('stormwater'))return [['#66c9e4','4 in–<1 ft map class'],['#658bed','≥1 ft map class'],...(id.includes('current')?[]:[['#aa8ee5','High tide · separate category'] as [string,string]])];
 if(id==='canopy_2010_cd')return [['#d4d77a','<10%'],['#7fc7a1','10–<25%'],['#39a88a','25–<40%'],['#197368','≥40% canopy'],['#64748b','Unknown']];
 if(id==='air_quality_2024_cd')return [['#89c9c7','<5'],['#d1bd82','5–<6'],['#df987d','6–<7'],['#c56e87','≥7 µg/m³ PM2.5'],['#64748b','Unknown']];
 if(id==='zoning_districts.overview')return [['#92c6a5','Residential'],['#edb17d','Commercial'],['#b49ae6','Manufacturing']];
 if(id.includes('evacuation'))return [['#d68791','Zone 1'],['#dc9c7c','2'],['#d9bc83','3'],['#a8c598','4'],['#7dbac0','5'],['#8da7d0','6']];
 if(id==='flood')return [['#efaa83','Intersection recorded'],[COLORS.result,'Not a safety finding']];
 return [[overlayColor({},id),'Source features']];
}

function layerScope(id:string):string|null{
 if(id.startsWith('stormwater'))return 'Simplified ground-model overview. Buildings are model voids; blank areas do not establish coverage or safety.';
 if(id==='air_quality_2024_cd')return '2024 annual community-district means, not a parcel measurement.';
 if(id==='canopy_2010_cd')return '2010 community-district statistics, not current parcel tree cover.';
 if(id.includes('evacuation'))return 'Evacuation planning zones, not flood probabilities.';
 if(id.includes('zoning'))return 'Recorded zoning geography does not establish permission for a proposed use.';
 if(id==='flood')return 'PLUTO 2007 / 2015 tax-lot intersection flags. A missing flag does not establish safety.';
 return null;
}
export function buildingColor(b:CityBuilding,selected:boolean,active:boolean,floodLayer:boolean){
 return active?COLORS.active:selected?COLORS.selected:floodLayer&&(b.flood_2007===1||b.flood_2015===1)?'#efaa83':COLORS.result;
}
/** Draw each known-height native building once. The full-record overlay replaces
 * its quantized atlas extrusion; point-only or unknown-height records do not. */
export function citywideExtrusionFilter(polygons:{features?:any[]}):FilterSpecification{
 const ids=[...new Set((polygons.features||[]).filter(f=>{
  const g=f.geometry,p=f.properties;
  const rings=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];
  return Array.isArray(rings)&&rings.some((polygon:any)=>Array.isArray(polygon?.[0])&&polygon[0].length>=4)&&typeof p?.height_m==='number'&&Number.isFinite(p.height_m)&&p.height_m>0&&/^[1-9]\d{0,9}$/.test(String(p.id));
 }).map(f=>String(f.properties.id)))];
 const height:FilterSpecification=['>', ['coalesce',['get','height_m'],0],0];
 return ids.length?['all',height,['!', ['in',['get','id'],['literal',ids]]]]:height;
}
function boundsFor(borough:string){return BOROUGHS[borough]?.bounds||CITY;}
function niceName(id:string){return labels[id]||id.replace(/\.overview$/,'').replaceAll('_',' ');}

export default function CityMap(props:CityMapProps){
 const host=useRef<HTMLDivElement>(null),container=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),latest=useRef(props);
 latest.current=props;
 const helpId=useId(),fullscreenOpener=useRef<HTMLElement|null>(null);
 const [atlasState,setAtlasState]=useState<'loading'|'ready'|'error'>('loading');
 const[ready,setReady]=useState(false),[fallback,setFallback]=useState(false),[attempt,setAttempt]=useState(0),[threeD,setThreeD]=useState(false),[density,setDensity]=useState(false),[fullscreen,setFullscreen]=useState(false),[zoom,setZoom]=useState(10),[hover,setHover]=useState<{x:number;y:number;label:string;detail:string}|null>(null),[view,setView]=useState(CITY);
 const revealOutsideMap=(action:()=>void)=>{
  setFullscreen(false);
  if(document.fullscreenElement===host.current)void document.exitFullscreen().catch(()=>{}).then(action);else action();
 };
 const inspectBuilding=(building:CityBuilding)=>revealOutsideMap(()=>latest.current.onSelect(building));
 const inspectFeature=(properties:Any)=>revealOutsideMap(()=>latest.current.onFeature(properties));
 const inspectPoint=(point:[number,number])=>revealOutsideMap(()=>latest.current.onMapPoint?.(point));
 const inspectNative=(id:string)=>revealOutsideMap(()=>latest.current.onSelectId?.(id));
 const selected=useMemo(()=>new Set(props.selectedIds),[props.selectedIds]);
 const buildingData=useMemo(()=>{
  const polygons:any[]=[],points:any[]=[];
  for(const b of props.buildings){
   if(!hasPoint(b))continue;
   const badge=SELECTION_BADGES[props.selectedIds.indexOf(b.id)];
   const p={selection_label:badge?.label||'',selection_icon:badge?.icon||'',id:b.id,address:b.address,entity:b.entity_type||'building',record_type:b.record_type||'Building',selected:selected.has(b.id),active:b.id===props.activeId,flood:b.flood_2007===1||b.flood_2015===1,height_m:typeof b.roof_height_ft==='number'&&b.roof_height_ft>0?b.roof_height_ft*.3048:null};
   points.push(feature({type:'Point',coordinates:[b.longitude,b.latitude]},p,b.id));
   if(b.geometry_quality!=='invalid_or_placeholder'&&['Polygon','MultiPolygon'].includes(b.geometry?.type))polygons.push(feature(b.geometry,p,b.id));
  }
  return{polygons:collection(polygons),points:collection(points)};
 },[props.buildings,props.activeId,props.selectedIds,selected]);
 const overlay=useMemo(()=>collection((props.layer?.features||[]).filter((f:any)=>f.geometry).map((f:any,i:number)=>({...f,id:i,properties:{...(f.properties||{}),_geo_color:overlayColor(f.properties||{},props.layerId),_geo_index:i}}))),[props.layer,props.layerId]);
 const densityData=useMemo(()=>{const step=props.overview?.grid_size_degrees||.005;return collection((props.overview?.cells||[]).map((r:any)=>{const west=r[0],south=r[1],count=r[2];return feature({type:'Polygon',coordinates:[[[west,south],[west+step,south],[west+step,south+step],[west,south+step],[west,south]]]},{count});}));},[props.overview]);
 const data=useRef({buildingData,overlay,densityData,boundary:props.boundary,threeD,density});data.current={buildingData,overlay,densityData,boundary:props.boundary,threeD,density};

 useEffect(()=>{
  let canceled=false,resize:ResizeObserver|undefined,initialTimer:ReturnType<typeof setTimeout>|undefined;
  setReady(false);setFallback(false);
  const fail=()=>{if(canceled)return;setFallback(true);setReady(false);setHover(null);if(initialTimer)clearTimeout(initialTimer);map.current?.remove();map.current=null;};
  (async()=>{
   try{
    const lib=await import('maplibre-gl');if(canceled||!container.current)return;
    const m=new lib.Map({container:container.current,style:'https://tiles.openfreemap.org/styles/dark',center:[-73.98,40.71],zoom:10,attributionControl:{compact:true,customAttribution:'NYC OTI · NYC DCP'},maxZoom:19,minZoom:8,maxBounds:[[-74.6,40.2],[-73.3,41.25]],pitch:0,bearing:0,canvasContextAttributes:{antialias:true},refreshExpiredTiles:false});
    map.current=m;m.getCanvas().setAttribute('aria-describedby',helpId);
    m.addControl(new lib.ScaleControl({maxWidth:110,unit:'imperial'}),'bottom-right');
    const emitBounds=()=>{const b=m.getBounds();latest.current.onBounds([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);setZoom(m.getZoom());};
    let tileErrors=0;
    m.on('error',e=>{if(canceled)return;if((e as typeof e&{sourceId?:string}).sourceId===CITY_ATLAS.sourceId){setAtlasState('error');return;}const s=String(e.error?.message||'');if(/WebGL|context lost/i.test(s)){fail();return;}if(!m.isStyleLoaded()&&++tileErrors>=6)fail();});
    m.on('sourcedata',e=>{if(!canceled&&e.sourceId===CITY_ATLAS.sourceId&&e.isSourceLoaded)setAtlasState(state=>state==='error'?state:'ready');});
    m.getCanvas().addEventListener('webglcontextlost',fail,{once:true});
    initialTimer=setTimeout(()=>{if(!canceled&&!m.isStyleLoaded())fail();},14000);
    m.on('load',()=>{
     if(canceled)return;if(initialTimer)clearTimeout(initialTimer);
     // Keep the provider attribution while tailoring a quiet cartographic base.
     for(const l of m.getStyle().layers){
      if(l.type==='background')m.setPaintProperty(l.id,'background-color','#111c26');
      if(l.id==='water')m.setPaintProperty(l.id,'fill-color','#081521');
      if(l.id==='waterway')m.setPaintProperty(l.id,'line-color','#0b2331');
      // The native city atlas replaces decorative provider building geometry.
      if(l.id==='building')m.setLayoutProperty(l.id,'visibility','none');
      if(l.id==='landuse_park')m.setPaintProperty(l.id,'fill-color','#18352f');
      if(l.id==='highway_minor')m.setPaintProperty(l.id,'line-color','#2a3a44');
      if(l.id.includes('highway_major')&&l.type==='line')m.setPaintProperty(l.id,'line-color','#3e4f58');
      if(l.type==='symbol'&&l.layout?.['text-field']){m.setPaintProperty(l.id,'text-color',l.id.includes('place')?'#899ca6':'#73868f');m.setPaintProperty(l.id,'text-halo-color','#111c26');}
     }
     m.setLight({color:'#e6eee6',intensity:.4,position:[1.5,170,65]});
     const d=data.current;
     m.addSource('geo-boroughs',{type:'geojson',data:d.boundary||EMPTY});
     m.addLayer({id:'geo-borough-line',type:'line',source:'geo-boroughs',paint:{'line-color':'#6996a3','line-width':.8,'line-opacity':.28}});
     m.addSource('geo-density',{type:'geojson',data:d.densityData});
     m.addLayer({id:'geo-density-fill',type:'fill',source:'geo-density',layout:{visibility:'visible'},paint:{'fill-color':['interpolate',['linear'],['get','count'],0,'#2b555c',80,'#427d78',350,'#6bb69d',1500,'#c9d4a2'],'fill-opacity':['interpolate',['linear'],['zoom'],9,.45,13.8,.28,14,0]}});
     // This source never changes when the search results or A/B selection change.
     // MapLibre streams only the tiles in view and overzooms the full detail tier.
     m.addSource(CITY_ATLAS.sourceId,cityAtlasSource(window.location.origin));
     const atlasLayer={source:CITY_ATLAS.sourceId,'source-layer':CITY_ATLAS.sourceLayer,minzoom:CITY_ATLAS.minZoom};
     m.addLayer({...atlasLayer,id:'geo-citywide-fill',type:'fill',paint:{'fill-color':'#7eafa3','fill-opacity':.36}});
     m.addLayer({...atlasLayer,id:'geo-citywide-outline',type:'line',paint:{'line-color':'#83b8ad','line-width':['interpolate',['linear'],['zoom'],14,.35,17,.85],'line-opacity':.75}});
     m.addLayer({...atlasLayer,id:'geo-citywide-3d',type:'fill-extrusion',filter:citywideExtrusionFilter(d.buildingData.polygons),layout:{visibility:d.threeD?'visible':'none'},paint:{'fill-extrusion-color':'#70a79a','fill-extrusion-height':['get','height_m'],'fill-extrusion-base':0,'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true}});
     m.addSource('geo-overlay',{type:'geojson',data:d.overlay});
     m.addLayer({id:'geo-overlay-fill',type:'fill',source:'geo-overlay',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':['get','_geo_color'],'fill-opacity':.38,'fill-outline-color':['get','_geo_color']}});
     m.addLayer({id:'geo-overlay-line',type:'line',source:'geo-overlay',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':['get','_geo_color'],'line-width':['interpolate',['linear'],['zoom'],9,1.2,15,3.5],'line-opacity':.9}});
     m.addLayer({id:'geo-overlay-point',type:'circle',source:'geo-overlay',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':['get','_geo_color'],'circle-radius':['interpolate',['linear'],['zoom'],9,3,15,6],'circle-stroke-color':'#13222c','circle-stroke-width':1.2}});
     m.addSource('geo-buildings',{type:'geojson',data:d.buildingData.polygons});
     m.addSource('geo-points',{type:'geojson',data:d.buildingData.points});
     const color=['case',['get','active'],COLORS.active,['get','selected'],COLORS.selected,...(latest.current.layerId==='flood'?[['get','flood'],'#efaa83']:[]),COLORS.result] as any;
     m.addLayer({id:'geo-building-fill',type:'fill',source:'geo-buildings',minzoom:12.8,paint:{'fill-color':color,'fill-opacity':.45}});
     m.addLayer({id:'geo-building-outline',type:'line',source:'geo-buildings',minzoom:12.8,paint:{'line-color':color,'line-width':['case',['get','active'],2.2,['get','selected'],1.7,.8],'line-opacity':.95}});
     m.addLayer({id:'geo-building-3d',type:'fill-extrusion',source:'geo-buildings',minzoom:14,filter:['>', ['coalesce',['get','height_m'],0],0],layout:{visibility:d.threeD?'visible':'none'},paint:{'fill-extrusion-color':color,'fill-extrusion-height':['get','height_m'],'fill-extrusion-base':0,'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true}});
     m.addLayer({id:'geo-point-halo',type:'circle',source:'geo-points',filter:['any',['get','selected'],['get','active']],paint:{'circle-color':COLORS.selected,'circle-radius':['interpolate',['linear'],['zoom'],9,11,14,15,17,10],'circle-opacity':.10,'circle-stroke-width':1,'circle-stroke-color':'rgba(245,199,123,.35)'}});
     m.addLayer({id:'geo-point',type:'circle',source:'geo-points',paint:{'circle-color':color,'circle-radius':['interpolate',['linear'],['zoom'],9,['case',['get','active'],5.5,['get','selected'],4.7,3],13,['case',['get','active'],6,['get','selected'],5,3.5],16,['case',['get','active'],4,['get','selected'],3.5,2]],'circle-opacity':['interpolate',['linear'],['zoom'],13,1,16,.7],'circle-stroke-color':'#12282c','circle-stroke-width':1.4}});
     // Screen-facing symbols stay legible over overlays and extrusions. Draw
     // the two letter icons locally so they need no extra glyph/font request.
     for(const badge of SELECTION_BADGES){
      const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
      const ctx=canvas.getContext('2d');if(!ctx)continue;
      ctx.beginPath();ctx.arc(48,48,47,0,Math.PI*2);ctx.fillStyle='#08152180';ctx.fill();
      ctx.beginPath();ctx.arc(48,48,40,0,Math.PI*2);ctx.fillStyle=badge.color;ctx.fill();ctx.strokeStyle='#12282c';ctx.lineWidth=6;ctx.stroke();
      ctx.fillStyle='#17382f';ctx.font='750 45px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(badge.label,48,49);
      m.addImage(badge.icon,ctx.getImageData(0,0,96,96),{pixelRatio:3});
     }
     m.addLayer({id:'geo-selection-badge',type:'symbol',source:'geo-points',filter:['in',['get','selection_label'],['literal',['A','B']]],layout:{'icon-image':['get','selection_icon'],'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-pitch-alignment':'viewport','icon-rotation-alignment':'viewport'}});
     m.on('click',e=>{
      const hits=m.queryRenderedFeatures(e.point,{layers:['geo-selection-badge','geo-point','geo-building-3d','geo-building-fill','geo-citywide-3d','geo-citywide-fill']});
      const rawId=hits[0]?.properties?.id??hits[0]?.id,b=latest.current.buildings.find(b=>b.id===String(rawId));if(b){inspectBuilding(b);return;}
      const id=atlasBuildingId(rawId);if(id&&latest.current.onSelectId){inspectNative(id);return;}
      const f=m.queryRenderedFeatures(e.point,{layers:['geo-overlay-point','geo-overlay-line','geo-overlay-fill']})[0];
      if(f){const original=latest.current.layer?.features?.[f.properties?._geo_index];inspectFeature(original?.properties||f.properties);return;}
      if(latest.current.onMapPoint){
       const point:[number,number]=[e.lngLat.lng,e.lngLat.lat];
       const known=pickBuildingAtPoint(latest.current.buildings,point);
       if(known){inspectBuilding(known);return;}
       inspectPoint(point);
      }
     });
     m.on('mousemove',e=>{
      const f=m.queryRenderedFeatures(e.point,{layers:['geo-selection-badge','geo-point','geo-building-3d','geo-building-fill','geo-citywide-3d','geo-citywide-fill','geo-overlay-point','geo-overlay-line','geo-overlay-fill']})[0];
      m.getCanvas().style.cursor=f?'pointer':latest.current.onMapPoint?'crosshair':'';
      if(!f){setHover(null);return;}
      const p=f.properties||{},native=f.source===CITY_ATLAS.sourceId;setHover({x:e.point.x,y:e.point.y,label:native?`Building ${p.bin?`BIN ${p.bin}`:`DOITT ${p.id}`}`:String(p.address||p.label||p.name311||p.NAME||niceName(latest.current.layerId)),detail:native?'NYC official footprint · click to inspect':(f.source==='geo-points'||f.source==='geo-buildings')?String(p.record_type||'Building')+' · click to inspect':'Source feature · click to inspect'});
     });
     m.on('mouseleave',()=>setHover(null));
     const b=boundsFor(latest.current.focusBorough);m.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:{top:70,bottom:65,left:40,right:50},duration:0});
     setReady(true);emitBounds();
    });
    m.on('moveend',emitBounds);m.on('movestart',()=>setHover(null));
    resize=new ResizeObserver(()=>m.resize());if(host.current)resize.observe(host.current);
   }catch{fail();}
  })();
  return()=>{canceled=true;if(initialTimer)clearTimeout(initialTimer);resize?.disconnect();map.current?.remove();map.current=null;};
 },[attempt]);

 useEffect(()=>{
  const m=map.current;if(!ready||!m)return;
  const put=(id:string,value:any)=>(m.getSource(id) as GeoJSONSource|undefined)?.setData(value);
  put('geo-buildings',buildingData.polygons);put('geo-points',buildingData.points);put('geo-overlay',overlay);put('geo-density',densityData);put('geo-boroughs',props.boundary||EMPTY);
  m.setFilter('geo-citywide-3d',citywideExtrusionFilter(buildingData.polygons));
  const color=['case',['get','active'],COLORS.active,['get','selected'],COLORS.selected,...(props.layerId==='flood'?[['get','flood'],'#efaa83']:[]),COLORS.result];
  m.setPaintProperty('geo-building-fill','fill-color',color);m.setPaintProperty('geo-building-outline','line-color',color);m.setPaintProperty('geo-building-3d','fill-extrusion-color',color);m.setPaintProperty('geo-point','circle-color',color);
 },[ready,buildingData,overlay,densityData,props.boundary,props.layerId]);
 useEffect(()=>{const m=map.current;if(!ready||!m)return;const explicit=density||props.layerId==='density';m.setLayoutProperty('geo-density-fill','visibility',explicit||zoom<CITY_ATLAS.minZoom?'visible':'none');m.setPaintProperty('geo-density-fill','fill-opacity',explicit?.35:['interpolate',['linear'],['zoom'],9,.45,13.8,.28,14,0]);},[ready,density,props.layerId,zoom]);
 useEffect(()=>{const m=map.current;if(!ready||!m)return;m.setLayoutProperty('geo-building-3d','visibility',threeD?'visible':'none');m.setLayoutProperty('geo-citywide-3d','visibility',threeD?'visible':'none');const target=latest.current.focusBuilding||latest.current.buildings.find(b=>b.id===latest.current.activeId)||latest.current.buildings.find(b=>latest.current.selectedIds.includes(b.id));m.easeTo({pitch:threeD?52:0,bearing:threeD?-15:0,...(threeD&&m.getZoom()<14&&target&&hasPoint(target)?{center:[target.longitude,target.latitude] as [number,number],zoom:15.8}:{}),duration:850});},[ready,threeD]);
 useEffect(()=>{
  const b=boundsFor(props.focusBorough);setView(b);
  if(fallback){props.onBounds(b);return;}const m=map.current;if(!ready||!m)return;
  m.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:{top:70,bottom:65,left:40,right:50},duration:1100,essential:false});
 },[props.focusToken,props.focusBorough,ready,fallback]);
 useEffect(()=>{const b=props.focusBuilding;if(!b||!hasPoint(b))return;const m=map.current;if(ready&&m)m.flyTo({center:[b.longitude,b.latitude],zoom:16.6,pitch:threeD?52:0,duration:1250,essential:false});if(fallback){const v=[b.longitude-.004,b.latitude-.003,b.longitude+.004,b.latitude+.003];setView(v);props.onBounds(v);}},[props.focusBuilding,ready,fallback]);
 useEffect(()=>{const changed=()=>{setFullscreen(document.fullscreenElement===host.current);setTimeout(()=>map.current?.resize(),30);};document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
 const goHome=()=>{setView(CITY);if(map.current){map.current.fitBounds([[CITY[0],CITY[1]],[CITY[2],CITY[3]]],{padding:60,duration:1000});}else props.onBounds(CITY);};
 const changeZoom=(delta:number)=>{if(map.current)map.current.zoomTo(map.current.getZoom()+delta,{duration:350});else setView(v=>{const x=(v[0]+v[2])/2,y=(v[1]+v[3])/2,w=(v[2]-v[0])/Math.pow(1.7,delta)/2,h=(v[3]-v[1])/Math.pow(1.7,delta)/2;const b=[x-w,y-h,x+w,y+h];props.onBounds(b);return b;});};
 useEffect(()=>{const timer=setTimeout(()=>map.current?.resize(),40);return()=>clearTimeout(timer);},[fullscreen]);
 useEffect(()=>{
  if(!fullscreen)return;
  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const keyboard=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){if(document.fullscreenElement){void document.exitFullscreen();}else setFullscreen(false);return;}
   if(event.key!=='Tab'||!host.current)return;
   const nodes=Array.from(host.current.querySelectorAll('button:not(:disabled),a[href],summary,[tabindex="0"]')) as unknown as HTMLElement[];
   const visible=nodes.filter(node=>node.getClientRects().length>0);
   const first=visible[0],last=visible.at(-1);if(!first)return;
   if(!host.current.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
   else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',keyboard);
  return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',keyboard);if(fullscreenOpener.current?.isConnected)fullscreenOpener.current.focus({preventScroll:true});};
 },[fullscreen]);
 const toggleFullscreen=()=>{if(!fullscreen)fullscreenOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;if(fullscreen){if(document.fullscreenElement)void document.exitFullscreen();else setFullscreen(false);}else if(host.current?.requestFullscreen)void host.current.requestFullscreen().catch(()=>setFullscreen(true));else setFullscreen(true);};
 const mapped=buildingData.points.features.length;
 const showLayer=!!props.layer?.features?.length||props.layerId==='flood';
 const legend=layerLegend(props.layerId);
 return <div className={'geo-map'+(props.compact?' geo-map-compact':'')+(fullscreen?' geo-map-expanded':'')} ref={host} role={fullscreen?'dialog':undefined} aria-modal={fullscreen?true:undefined} aria-label={fullscreen?'New York City evidence map':undefined}>
  <div ref={container} className={'geo-map-canvas'+(fallback?' geo-map-hidden':'')} aria-label="Interactive map of New York City" aria-describedby={helpId}/>
  {fallback&&<FallbackMap boundary={props.boundary} buildings={props.buildings} overlay={overlay} selected={selected} activeId={props.activeId} view={view} floodLayer={props.layerId==='flood'} onSelect={inspectBuilding} onFeature={inspectFeature} onMapPoint={props.onMapPoint?inspectPoint:undefined}/>}
  {!ready&&!fallback&&<div className="geo-map-loading"><span/><p>Bringing the city into focus</p><small>Loading the street map and official geography</small></div>}
  {!props.compact&&<div className="geo-map-topline"><div className="geo-map-location"><span className="geo-map-live"/><strong>NEW YORK CITY</strong><span className="geo-map-divider"/><span>{props.queryCaption||('View: '+(props.focusBorough==='all'?'Five boroughs':BOROUGHS[props.focusBorough]?.name||'Five boroughs'))}</span></div></div>}
  <div className="geo-map-controls" aria-label="Map controls">
   <button aria-label="Zoom in" title="Zoom in" onClick={()=>changeZoom(1)}><Plus size={18}/></button><button aria-label="Zoom out" title="Zoom out" onClick={()=>changeZoom(-1)}><Minus size={18}/></button><span/>
   <button aria-label="Show all of New York City" title="View all five boroughs" onClick={goHome}><LocateFixed size={18}/></button>
   <button aria-label="Reset north" title="Reset north" disabled={fallback} onClick={()=>map.current?.easeTo({bearing:0,duration:500})}><Compass size={18}/></button><span/>
   <button className={threeD?'is-active':''} aria-label="Toggle 3D buildings" aria-pressed={threeD} title="3D uses recorded roof heights only" disabled={fallback} onClick={()=>setThreeD(v=>!v)}><Box size={18}/><small>3D</small></button>
   <button className={density||props.layerId==='density'||zoom<CITY_ATLAS.minZoom?'is-active':''} aria-label="Toggle citywide building density" aria-pressed={density||props.layerId==='density'||zoom<CITY_ATLAS.minZoom} title={zoom<CITY_ATLAS.minZoom?'Full-city density overview · zoom in for individual outlines':'Citywide building density'} disabled={fallback||props.layerId==='density'||zoom<CITY_ATLAS.minZoom} onClick={()=>setDensity(v=>!v)}><Layers3 size={18}/></button><span/>
   <button aria-label={fullscreen?'Exit full screen':'Expand map to full screen'} title={fullscreen?'Exit full screen':'Full screen'} onClick={toggleFullscreen}>{fullscreen?<Shrink size={18}/>:<Expand size={18}/>}</button>
  </div>
  {hover&&!fallback&&<div className="geo-map-tooltip" style={{left:Math.min(hover.x+16,(host.current?.clientWidth||600)-245),top:Math.max(56,hover.y-60)}}><strong>{hover.label}</strong><span>{hover.detail}<ArrowUpRight size={12}/></span></div>}
  <div className={'geo-map-atlas-status'+(atlasState==='error'?' is-error':'')} role="status">{fallback?'Citywide outlines need the interactive map. Search remains available.':atlasState==='error'?<><span>Some building tiles could not load.</span><button onClick={()=>{setAtlasState('loading');setAttempt(v=>v+1);}}>Retry</button></>:zoom<CITY_ATLAS.minZoom?<><strong>All five boroughs</strong><span>Zoom in for individual buildings</span></>:<><strong>{CITY_ATLAS.mappedOutlines.toLocaleString('en-US')} outlines · citywide</strong><span>{atlasState==='loading'?'Loading this view…':'Click any building to inspect'}</span></>}</div>
  <div className="geo-map-legend"><div className="geo-map-legend-title"><span>SEARCH RECORDS</span><strong>{mapped.toLocaleString('en-US')}<small> search locations</small></strong></div><div className="geo-map-legend-items">{!fallback&&zoom>=14&&<span><i style={{background:'#7eafa3'}}/>Buildings</span>}<span><i style={{background:COLORS.result}}/>Search</span><span><i style={{background:COLORS.selected}}/>Selected</span>{threeD&&<span className="geo-map-height-note">Recorded heights · {zoom<14?'zoom in for 3D':'ft → m'}</span>}</div>{showLayer&&<div className="geo-map-overlay-key"><strong>{niceName(props.layerId)}</strong><div>{legend.map(([color,label])=><span key={label}><i style={{background:color}}/>{label}</span>)}</div></div>}{showLayer&&layerScope(props.layerId)&&<p>{layerScope(props.layerId)}</p>}{(density||props.layerId==='density')&&!fallback&&<p>Citywide footprint count · {props.overview?.grid_size_degrees||.005}° cells</p>}</div>
  <p id={helpId} className="geo-map-accessibility">{fallback?'Use the zoom buttons to navigate this overview.':'Use the zoom buttons or arrow keys to navigate the map.'} {props.compact?'The left panel provides keyboard-accessible building information and comparison. Select one building to inspect it; select a second building to compare.':'The result cards after the map provide keyboard-accessible place inspection and comparison.'}</p>
  {fallback?<div className="geo-map-status"><span>Local geography mode · street map unavailable</span><button onClick={()=>setAttempt(x=>x+1)}><RotateCcw size={12}/>Retry map</button></div>:<div className="geo-map-hint"><span>Drag to explore</span><b>·</b><span>{props.compact?'Click a building to inspect':'Click a place to investigate'}</span></div>}
 </div>;
}

function FallbackMap({boundary,buildings,overlay,selected,activeId,view,floodLayer,onSelect,onFeature,onMapPoint}:{boundary:any;buildings:CityBuilding[];overlay:any;selected:Set<string>;activeId?:string;view:number[];floodLayer:boolean;onSelect:(b:CityBuilding)=>void;onFeature:(p:any)=>void;onMapPoint?:(point:[number,number])=>void}){
 const merc=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
 const frame=useMemo(()=>{const h=merc(view[3])-merc(view[1]),w=(view[2]-view[0])*Math.PI/180,scale=Math.min(1200/w,800/h),ox=(1200-w*scale)/2,oy=(800-h*scale)/2;return{project:(p:number[])=>[ox+(p[0]-view[0])*Math.PI/180*scale,oy+(merc(view[3])-merc(p[1]))*scale],unproject:(x:number,y:number):[number,number]=>[view[0]+(x-ox)/scale*180/Math.PI,(2*Math.atan(Math.exp(merc(view[3])-(y-oy)/scale))-Math.PI/2)*180/Math.PI]};},[view]);
 const projection=frame.project;
 const path=(g:any):string=>{if(!g)return'';const line=(r:any[])=>r.map((p,i)=>{const q=projection(p);return(i?'L':'M')+q[0].toFixed(2)+','+q[1].toFixed(2)}).join('');if(g.type==='Polygon')return g.coordinates.map((r:any[])=>line(r)+'Z').join('');if(g.type==='MultiPolygon')return g.coordinates.flatMap((p:any[])=>p.map((r:any[])=>line(r)+'Z')).join('');if(g.type==='LineString')return line(g.coordinates);if(g.type==='MultiLineString')return g.coordinates.map(line).join('');return'';};
 return <svg className="geo-map-fallback" viewBox="0 0 1200 800" role="group" aria-label="Local NYC geography fallback map" onClick={event=>{if(!onMapPoint)return;const matrix=event.currentTarget.getScreenCTM();if(!matrix)return;const screen=event.currentTarget.createSVGPoint();screen.x=event.clientX;screen.y=event.clientY;const local=screen.matrixTransform(matrix.inverse());const point=frame.unproject(local.x,local.y);if(!point.every(Number.isFinite))return;const known=pickBuildingAtPoint(buildings,point);if(known)onSelect(known);else onMapPoint(point);}}><defs><pattern id="geo-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#253b46" strokeWidth=".5"/></pattern><radialGradient id="geo-ocean"><stop stopColor="#102d3b"/><stop offset="1" stopColor="#091824"/></radialGradient></defs><rect width="1200" height="800" fill="url(#geo-ocean)"/><rect width="1200" height="800" fill="url(#geo-grid)" opacity=".45"/>{boundary?.features?.map((f:any,i:number)=><path key={i} d={path(f.geometry)} fill="#1a3037" stroke="#4a727a" strokeWidth="1" fillRule="evenodd"/>)}{overlay.features.map((f:any,i:number)=>{const p=f.properties||{},g=f.geometry;return g.type==='Point'?<circle key={i} cx={projection(g.coordinates)[0]} cy={projection(g.coordinates)[1]} r="4" fill={p._geo_color} onClick={event=>{event.stopPropagation();onFeature(p);}}/>:<path key={i} d={path(g)} fill={g.type.includes('Line')?'none':p._geo_color} stroke={p._geo_color} fillOpacity=".35" strokeWidth=".6" fillRule="evenodd" onClick={event=>{event.stopPropagation();onFeature(p);}}/>;})}{buildings.filter(hasPoint).map(b=>{const p=projection([b.longitude,b.latitude]),color=buildingColor(b,selected.has(b.id),b.id===activeId,floodLayer);return <g key={b.id} className="geo-map-fallback-feature" onClick={event=>{event.stopPropagation();onSelect(b);}} role="button" tabIndex={0} aria-label={'Inspect '+b.address+' · '+(b.bin?'BIN '+b.bin:'BBL '+b.bbl)+' · record '+b.id} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(b);}}}>{b.geometry_quality!=='invalid_or_placeholder'&&['Polygon','MultiPolygon'].includes(b.geometry?.type)&&view[2]-view[0]<.08&&<path d={path(b.geometry)} fill={color} stroke={color} fillOpacity=".4" strokeWidth="1" fillRule="evenodd"/>}<circle cx={p[0]} cy={p[1]} r={selected.has(b.id)?6:3.5} fill={color} stroke="#11242c" strokeWidth="1.5"/><title>{b.address}</title></g>;})}{[...selected].slice(0,2).map((id,index)=>{const b=buildings.find(b=>b.id===id);if(!b||!hasPoint(b))return null;const p=projection([b.longitude,b.latitude]),badge=SELECTION_BADGES[index];return <g key={'badge-'+id} className="geo-map-fallback-badge" transform={'translate('+p[0]+','+p[1]+')'} onClick={event=>{event.stopPropagation();onSelect(b);}} aria-hidden="true"><circle r="23" fill="#08152180"/><circle r="20" fill={badge.color} stroke="#12282c" strokeWidth="3"/><text textAnchor="middle" dominantBaseline="central" fill="#17382f">{badge.label}</text><title>{'Building '+badge.label+' · '+b.address}</title></g>;})}<text x="28" y="770" fill="#75929e" fontSize="12">NYC OTI / DCP · official boundaries and source features</text></svg>;
}

'use client';
import {useId,useMemo} from 'react';
import type {Geometry} from '@/lib/city';
import {drawingPixelsPerMeter,scaleBarMeters,type PhysicalDrawingFrame} from '@/lib/geometry-frame';

export type SceneFeature={id:string;geometry:Geometry;label?:string;color:string;opacity?:number;stroke?:string;dashed?:boolean;interactive?:boolean};
function points(g:Geometry):number[][]{return g.type==='Point'?[g.coordinates]:g.type==='Polygon'?g.coordinates.flat():g.type==='MultiPolygon'?g.coordinates.flat(2):g.type==='LineString'?g.coordinates:g.type==='MultiLineString'?g.coordinates.flat():[];}
/** A local equirectangular drawing with an explicit meter scale. It preserves
 * source vertices for presentation; all analytical distances come from EPSG2263. */
export default function GeoScene({features,bounds,physicalFrame,onSelect,selected,labels=true,caption='Official source geometry',showCaption=true,className='',attribution='NYC OTI / source vertices'}:{features:SceneFeature[];bounds?:number[];physicalFrame?:PhysicalDrawingFrame|null;onSelect?:(id:string)=>void;selected?:string[];labels?:boolean;caption?:string;showCaption?:boolean;className?:string;attribution?:string}){
  const rawId=useId(),id=rawId.replaceAll(':','');
  const projection=useMemo(()=>{
    const coords=features.flatMap(f=>points(f.geometry)).filter(p=>p.length>=2&&p.every(Number.isFinite));
    if(!coords.length)return null;
    const box=bounds??coords.reduce((box,p)=>[Math.min(box[0],p[0]),Math.min(box[1],p[1]),Math.max(box[2],p[0]),Math.max(box[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
    const latitude=(box[1]+box[3])/2,longitude=(box[0]+box[2])/2,kx=111195*Math.cos(latitude*Math.PI/180),ky=111195;
    const width=Math.max(1,(box[2]-box[0])*kx),height=Math.max(1,(box[3]-box[1])*ky),scale=drawingPixelsPerMeter(550,340,physicalFrame||{widthMeters:width,heightMeters:height});
    const xy=(p:number[])=>[340+(p[0]-longitude)*kx*scale,225-(p[1]-latitude)*ky*scale];
    const path=(g:Geometry)=>{
      const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:g.type==='LineString'?[[g.coordinates]]:g.type==='MultiLineString'?[g.coordinates]:[];
      return polys.flatMap((poly:number[][][])=>poly.map(ring=>ring.map((p,i)=>{const v=xy(p);return(i?'L':'M')+v[0].toFixed(2)+','+v[1].toFixed(2);}).join(' ')+(['Polygon','MultiPolygon'].includes(g.type)?' Z':''))).join(' ');
    };
    const meterScale=scaleBarMeters(scale);
    return{xy,path,scale,meterScale};
  },[features,bounds,physicalFrame]);
  if(!projection)return <div className="geo-scene-empty">Geometry is unavailable.</div>;
  return <div className={'geo-scene '+className}><svg viewBox="0 0 680 460" role={onSelect?'group':'img'} aria-label={caption} data-pixels-per-meter={projection.scale} data-physical-frame={physicalFrame?'shared':'individual'}>
    <defs><pattern id={'grid-'+id} width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#354c5c" strokeWidth=".5" opacity=".35"/></pattern><radialGradient id={'glow-'+id}><stop offset="0" stopColor="#27515b" stopOpacity=".3"/><stop offset="1" stopColor="#0a1926" stopOpacity="0"/></radialGradient></defs>
    <rect width="680" height="460" fill="#0a1926"/><rect width="680" height="460" fill={'url(#grid-'+id+')'}/><ellipse cx="340" cy="225" rx="320" ry="230" fill={'url(#glow-'+id+')'}/>
    {features.map(feature=>{const chosen=!selected||selected.includes(feature.id),interactive=!!onSelect&&feature.interactive!==false;return <g key={feature.id} className={interactive?'scene-feature interactive':'scene-feature'} onClick={interactive?()=>onSelect?.(feature.id):undefined} role={interactive?'button':undefined} tabIndex={interactive?0:undefined} aria-label={interactive?feature.label||feature.id:undefined} onKeyDown={interactive?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(feature.id);}}:undefined} opacity={(feature.opacity??1)*(chosen?1:.25)}><title>{feature.label||feature.id}</title>{feature.geometry.type==='Point'?<circle cx={projection.xy(feature.geometry.coordinates)[0]} cy={projection.xy(feature.geometry.coordinates)[1]} r="5" fill={feature.color}/>:<path d={projection.path(feature.geometry)} fill={['Polygon','MultiPolygon'].includes(feature.geometry.type)?feature.color:'none'} fillRule="evenodd" stroke={feature.stroke||feature.color} strokeWidth={feature.dashed?1:1.2} strokeDasharray={feature.dashed?'5 4':undefined}/>}</g>;})}
    {labels&&features.filter(f=>f.label&&f.interactive!==false).map(f=>{const coords=points(f.geometry),center=[coords.reduce((s,p)=>s+p[0],0)/coords.length,coords.reduce((s,p)=>s+p[1],0)/coords.length],xy=projection.xy(center);return <g key={'label-'+f.id} pointerEvents="none"><text x={xy[0]} y={xy[1]} textAnchor="middle" fill="#ecf2e9" stroke="#0a1926" strokeWidth="4" paintOrder="stroke" fontSize="15" fontFamily="inherit" fontWeight="500">{f.label}</text></g>;})}
    <g transform="translate(635 30)"><path d="M0 18V0M-4 7 0 0 4 7" stroke="#90aab4" fill="none"/><text y="-7" textAnchor="middle" fill="#8ca4b1" fontSize="12">N</text></g>
    <g transform="translate(35 418)"><path d={'M0 0V5H'+(projection.meterScale*projection.scale)+'V0'} stroke="#aac1c5" fill="none"/><text y={physicalFrame?25:20} fill="#91a7b3" fontSize={physicalFrame?23:13}>{projection.meterScale} m{physicalFrame?'':' · drawing scale'}</text></g>
    <text x="645" y="440" textAnchor="end" fill="#667f90" fontSize="12">{attribution}</text>
  </svg>{showCaption&&<span className="geo-scene-caption">{caption}{physicalFrame&&<span className="geo-scene-scale-label">{projection.meterScale} m scale bar · north up</span>}</span>}</div>;
}

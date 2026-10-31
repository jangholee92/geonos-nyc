'use client';

import {useEffect,useId,useState} from 'react';
import type {CSSProperties,KeyboardEvent,PointerEvent} from 'react';
import './analytics.css';
import HourlyWeather from './hourly-weather';

export type ClimateStudioProps={climate:any;projections:any;mode:'observed'|'paired'|'future';onModeChange?:(mode:'observed'|'paired'|'future')=>void;initialStationId?:string};
type Metric={key:string;label:string;short:string;unit:string;digits:number;description:string};
const METRICS:Metric[]=[
 {key:'tmean_c',label:'Mean temperature',short:'Temperature',unit:'°C',digits:1,description:'Mean of daily (TMAX + TMIN) / 2. This is a station observation, not building temperature.'},
 {key:'hot_days_32_2c',label:'Hot days',short:'Hot days',unit:'days',digits:1,description:'Days with maximum temperature ≥32.2°C (90°F rounded to the archive precision).'},
 {key:'tropical_nights_gt20c',label:'Warm nights',short:'Warm nights',unit:'days',digits:1,description:'Days with minimum temperature >20°C. An ETCCDI-style threshold, not an hourly nighttime measurement.'},
 {key:'precip_mm',label:'Precipitation',short:'Precipitation',unit:'mm',digits:0,description:'Total water-equivalent precipitation, including melted snow. This is not a flood or drainage model.'},
 {key:'rx1day_mm',label:'Wettest day',short:'Wettest day',unit:'mm',digits:1,description:'Maximum reported daily precipitation total. Not a rolling 24-hour or one-hour rainfall extreme.'},
 {key:'cooling_degree_days_18c',label:'Cooling degree days · 18°C base',short:'Cooling degree days',unit:'°C·days',digits:0,description:'Sum of max(daily mean − 18°C, 0). The 18°C base differs from the common US 65°F (18.3°C) base. This temperature index is not energy consumption, peak cooling load or a refrigeration design calculation.'},
 {key:'heating_degree_days_18c',label:'Heating degree days · 18°C base',short:'Heating degree days',unit:'°C·days',digits:0,description:'Sum of max(18°C − daily mean, 0). The 18°C base differs from the common US 65°F (18.3°C) base. This temperature index is not energy consumption or design heating load.'},
];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const finite=(v:any):v is number=>typeof v==='number'&&Number.isFinite(v);
const fmt=(v:any,digits=1)=>finite(v)?v.toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits}):'—';
const signed=(v:any,digits=1)=>{if(!finite(v))return '—';const rounded=Math.round(v*10**digits)/10**digits;return `${rounded>0?'+':''}${fmt(Object.is(rounded,-0)?0:rounded,digits)}`};
const pathOf=(rows:any[],x:(r:any,i:number)=>number,y:(r:any)=>number|null)=>{let drawing=false;return rows.map((r,i)=>{const value=y(r);if(value===null){drawing=false;return ''}const cmd=drawing?'L':'M';drawing=true;return `${cmd}${x(r,i)},${value}`}).join(' ')};
const band=(rows:any[],x:(r:any,i:number)=>number,lo:(r:any)=>number,hi:(r:any)=>number)=>rows.length?`M${rows.map((r,i)=>`${x(r,i)},${hi(r)}`).join(' L')} L${[...rows].reverse().map((r,i)=>`${x(r,rows.length-1-i)},${lo(r)}`).join(' L')} Z`:'';

function MonthlyPattern({station,metric}:{station:any;metric:Metric}){
 const baseline=station.monthly_climatology?.baseline_1991_2020||[],recent=station.monthly_climatology?.recent_2021_2025||[];
 const values=[...baseline,...recent].map((r:any)=>r[metric.key]).filter(finite);
 const low=Math.min(0,...values),high=Math.max(1,...values)*1.1;
 const y=(n:number)=>156-(n-low)/(high-low)*136;
 return <div className="gx-card gx-month-card"><div className="gx-card-heading"><div><span className="gx-eyebrow">THE SEASONAL FINGERPRINT</span><h3>A year, month by month.</h3></div><span className="gx-pill">{metric.unit}</span></div><div className="gx-chart-legend"><span><i style={{background:'#667789'}}/>1991–2020 monthly mean</span><span><i style={{background:'#c8f77b'}}/>2021–2025 monthly mean</span></div><svg className="gx-month-chart" viewBox="0 0 720 196" role="img" aria-label={`Monthly ${metric.label.toLowerCase()} averages for the baseline and recent five-year period`}><title>{`Seasonal pattern at ${station.name}`}</title><line className="gx-gridline" x1={32} x2={704} y1={y(0)} y2={y(0)}/>{MONTHS.map((month,i)=>{
  const a=baseline.find((r:any)=>r.month===i+1)?.[metric.key],b=recent.find((r:any)=>r.month===i+1)?.[metric.key];const x=43+i*56;
  return <g key={month}><title>{`${month}: baseline ${fmt(a,metric.digits)}, recent ${fmt(b,metric.digits)} ${metric.unit}`}</title>{finite(a)&&<rect x={x} y={Math.min(y(0),y(a))} width={15} height={Math.max(1,Math.abs(y(a)-y(0)))} rx={3} fill="#667789"/>}{finite(b)&&<rect x={x+18} y={Math.min(y(0),y(b))} width={15} height={Math.max(1,Math.abs(y(b)-y(0)))} rx={3} fill="#c8f77b"/>}<text className="gx-axis-label" x={x+16} y={184} textAnchor="middle">{month}</text></g>;
 })}</svg><p className="gx-small">Each bar averages that calendar month across valid years. Monthly maxima average each month’s wettest day; they do not add to the annual maximum. The recent five years are a comparison period, not a new climate normal.</p></div>;
}

function ObservedClimate({climate,initialStationId}:{climate:any;initialStationId?:string}){
 const stations=Array.isArray(climate?.stations)?climate.stations:[];
 const [stationId,setStationId]=useState(initialStationId||'USW00094728');
 const [metricKey,setMetricKey]=useState('tmean_c');
 const [selectedYear,setSelectedYear]=useState(2025);
 const gradient=useId().replaceAll(':','');
 useEffect(()=>{if(initialStationId)setStationId(initialStationId)},[initialStationId]);
 const station=stations.find((s:any)=>s.id===stationId)||stations[0];
 if(!station)return <div className="gx-empty"><h3>Climate observations are loading.</h3><p>The charts appear when the verified station archive is ready.</p></div>;
 const metric=METRICS.find(m=>m.key===metricKey)!;
 const annual=Array.isArray(station.annual)?station.annual:[];
 const baseline=station.summary?.baseline_1991_2020?.annual_average?.[metricKey];
 const recent=station.summary?.recent_2021_2025?.annual_average?.[metricKey];
 const active=annual.find((r:any)=>r.year===selectedYear)||annual.at(-1);
 const values=annual.map((r:any)=>r[metricKey]).filter(finite);
 const min=Math.min(...values,...(finite(baseline)?[baseline]:[])),max=Math.max(...values,...(finite(baseline)?[baseline]:[]));
 const pad=(max-min||1)*.17,low=min-pad,high=max+pad;
 const x=(_r:any,i:number)=>62+i*620/Math.max(1,annual.length-1),y=(n:number)=>246-(n-low)/(high-low)*196;
 const series=pathOf(annual,x,r=>finite(r[metricKey])?y(r[metricKey]):null);
 const activeIndex=Math.max(0,annual.indexOf(active));
 const delta=finite(active?.[metricKey])&&finite(baseline)?active[metricKey]-baseline:null;
 const biggestDelta=Math.max(1,...values.map((n:number)=>finite(baseline)?Math.abs(n-baseline):0));
 const ticks=Array.from({length:5},(_,i)=>low+(high-low)*i/4);
 const pointer=(event:PointerEvent<SVGSVGElement>)=>{const bounds=event.currentTarget.getBoundingClientRect(),position=(event.clientX-bounds.left)/bounds.width*730;const index=Math.max(0,Math.min(annual.length-1,Math.round((position-62)/620*(annual.length-1))));if(annual[index])setSelectedYear(annual[index].year)};
 const keyboard=(event:KeyboardEvent<SVGSVGElement>)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?annual.length-1:Math.max(0,Math.min(annual.length-1,activeIndex+(event.key==='ArrowRight'?1:-1)));if(annual[index])setSelectedYear(annual[index].year)};
 return <>
  <div className="gx-station-row"><div className="gx-stations" aria-label="Observation station">{stations.map((s:any)=><button key={s.id} className={s.id===station.id?'is-active':''} aria-pressed={s.id===station.id} onClick={()=>setStationId(s.id)}><span className="gx-station-dot"/>{s.name}{s.outside_nyc_reference&&<small>NJ</small>}</button>)}</div><span className="gx-source-stamp">NOAA / 1991–2025</span></div>
  <div className="gx-climate-grid"><div className="gx-card gx-history-card"><div className="gx-card-heading"><div><span className="gx-eyebrow">35 YEARS / ONE OBSERVATION POINT</span><h3>The climate we have lived.</h3></div><label className="gx-select-label"><span className="gx-sr-only">Climate metric</span><select aria-label="Climate metric" value={metricKey} onChange={e=>setMetricKey(e.target.value)}>{METRICS.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></label></div>
   <div className="gx-chart-readout"><div><span>{active?.year||'—'} · {metric.label}</span><strong>{fmt(active?.[metricKey],metric.digits)} <small>{metric.unit}</small></strong></div><div className="gx-readout-delta"><span>vs. 1991–2020 annual mean</span><strong style={{color:delta===null?'#bbc7d3':delta>=0?'#f6ad98':'#68d9cf'}}>{signed(delta,metric.digits)} <small>{metric.unit}</small></strong></div></div>
   <svg className="gx-history-chart" viewBox="0 0 730 285" role="img" tabIndex={0} aria-label={`${station.name}, annual ${metric.label.toLowerCase()}. Use left and right arrow keys to inspect years.`} onPointerMove={pointer} onKeyDown={keyboard}>
    <title>{`${station.name}: annual ${metric.label.toLowerCase()}`}</title><desc>Use the arrow keys or the annual strip to inspect values. The dashed line is the derived 1991–2020 annual mean.</desc><defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#c8f77b" stopOpacity=".2"/><stop offset="100%" stopColor="#c8f77b" stopOpacity="0"/></linearGradient></defs>
    {ticks.map((tick,i)=><g key={i}><line className="gx-gridline" x1={62} x2={682} y1={y(tick)} y2={y(tick)}/><text className="gx-axis-label" x={50} y={y(tick)+4} textAnchor="end">{fmt(tick,metric.digits===0?0:1)}</text></g>)}
    {annual.filter((r:any)=>r.year%5===0||r.year===1991).map((r:any)=><text className="gx-axis-label" key={r.year} x={x(r,annual.indexOf(r))} y={272} textAnchor="middle">{r.year}</text>)}
    {annual.length>0&&annual.every((r:any)=>finite(r[metricKey]))&&<path d={`${series} L682,246 L62,246 Z`} fill={`url(#${gradient})`}/>}
    {finite(baseline)&&<line x1={62} x2={682} y1={y(baseline)} y2={y(baseline)} stroke="#95a1af" strokeDasharray="4 5" opacity={.65}/>}
    <path d={series} stroke="#c8f77b" strokeWidth={2.5} strokeLinejoin="round" fill="none"/>
    {finite(active?.[metricKey])&&<g><line x1={x(active,activeIndex)} x2={x(active,activeIndex)} y1={42} y2={246} stroke="#e5edf7" strokeDasharray="3 5" opacity={.5}/><circle cx={x(active,activeIndex)} cy={y(active[metricKey])} r={5} fill="#c8f77b" stroke="#0b1420" strokeWidth={2}/></g>}
   </svg>
   <div className="gx-strip-heading"><span>ANNUAL DEPARTURE FROM BASELINE</span><span><i className="gx-cool-key"/> Lower <i className="gx-warm-key"/> Higher</span></div>
   <div className="gx-anomaly-strip" role="group" aria-label="Select a year">{annual.map((r:any)=>{const value=r[metricKey],difference=finite(value)&&finite(baseline)?value-baseline:null;const strength=difference===null?0:Math.min(1,Math.abs(difference)/biggestDelta);return <button key={r.year} className={r.year===active?.year?'is-active':''} aria-pressed={r.year===active?.year} aria-label={`${r.year}: ${fmt(value,metric.digits)} ${metric.unit}; ${signed(difference,metric.digits)} from baseline`} title={`${r.year}: ${signed(difference,metric.digits)} ${metric.unit} from baseline`} onMouseEnter={()=>setSelectedYear(r.year)} onFocus={()=>setSelectedYear(r.year)} onClick={()=>setSelectedYear(r.year)} style={{background:difference===null?'#354351':difference>=0?`rgba(246,173,152,${.16+strength*.84})`:`rgba(104,217,207,${.16+strength*.84})`}}><span className="gx-sr-only">{r.year}</span></button>})}</div>
   <p className="gx-small">{metric.description} Colored departures describe observed differences; they do not attribute a cause.</p>
  </div>
  <aside className="gx-card gx-climate-summary"><span className="gx-eyebrow">THE BASELINE & THE RECENT PAST</span><h3>{station.name}</h3><p className="gx-muted">{station.outside_nyc_reference?'New Jersey regional reference. Not an NYC site or rural heat-island control.':`${station.area||'New York City'} · A station-scale view of regional conditions.`}</p><div className="gx-climate-stat"><span>1991–2020 baseline</span><strong>{fmt(baseline,metric.digits)} <small>{metric.unit}</small></strong><em>30-year derived annual mean</em></div><div className="gx-climate-stat"><span>2021–2025 recent period</span><strong>{fmt(recent,metric.digits)} <small>{metric.unit}</small></strong><em>5-year annual mean</em></div><div className="gx-climate-stat gx-stat-change"><span>Recent minus baseline</span><strong>{signed(finite(recent)&&finite(baseline)?recent-baseline:null,metric.digits)} <small>{metric.unit}</small></strong><em>A period comparison, not an attribution claim</em></div><a className="gx-source-link" href={station.source_url} target="_blank" rel="noreferrer">Inspect the NOAA station source ↗</a><p className="gx-small">The displayed complete-year series ends on 31 Dec 2025; partial 2026 records are excluded. These derived, unadjusted summaries are not official NOAA Climate Normals. Missing or failed-quality observations are not filled in.</p></aside></div>
  <MonthlyPattern station={station} metric={metric}/>
 </>;
}

function FutureClimate({projections}:{projections:any}){
 const [horizonIndex,setHorizonIndex]=useState(2);
 const [metric,setMetric]=useState<'temperature_change_c'|'precipitation_change_pct'>('temperature_change_c');
 const rows=Array.isArray(projections?.annual)?projections.annual:[];
 if(!rows.length)return <div className="gx-empty"><h3>Projection evidence is loading.</h3><p>Published NPCC4 ranges will appear when the verified data are ready.</p></div>;
 const index=Math.min(horizonIndex,rows.length-1),active=rows[index],isTemp=metric==='temperature_change_c',unit=isTemp?'°C':'%',range=active[metric];
 const labels=rows.map((r:any)=>r.horizon);
 const year=(r:any)=>r.horizon==='2100'?2100:Number.parseInt(r.horizon)+5;
 const start=year(rows[0]),end=year(rows.at(-1));
 const x=(r:any)=>60+(year(r)-start)/(end-start||1)*620;
 const values=rows.flatMap((r:any)=>Object.values(r[metric]||{})).filter(finite);
 const low=Math.min(0,...values),high=Math.max(1,...values)*1.1;
 const y=(n:number)=>245-(n-low)/(high-low)*192;
 const outer=band(rows,x,r=>y(r[metric].p10),r=>y(r[metric].p90));
 const inner=band(rows,x,r=>y(r[metric].p25),r=>y(r[metric].p75));
 const means=active.scenario_ensemble_means;
 const extremes=(Array.isArray(projections.extremes)?projections.extremes:[]).filter((r:any)=>r.horizon===active.horizon);
 const extremeCards=[{key:'hot_days_ge90f_per_year',label:'Hot days ≥90°F',unit:'days / year'},{key:'heatwaves_per_year',label:'Heatwaves',unit:'events / year'},{key:'rain_days_ge2inch_per_year',label:'Daily precipitation ≥2 inches',unit:'days / year'}];
 return <>
  <div className="gx-future-context"><span className="gx-source-stamp">NPCC4 / PUBLISHED IN 2024</span><p>New York City regional projections. Every delta uses the published <strong>1981–2010 baseline</strong>.</p></div>
  <div className="gx-climate-grid"><div className="gx-card gx-future-card"><div className="gx-card-heading"><div><span className="gx-eyebrow">MULTIPLE FUTURES / SHARED EVIDENCE</span><h3>The range is part of the story.</h3></div><div className="gx-segmented gx-segmented-small" aria-label="Projection metric"><button className={isTemp?'is-active':''} onClick={()=>setMetric('temperature_change_c')} aria-pressed={isTemp}>Temperature</button><button className={!isTemp?'is-active':''} onClick={()=>setMetric('precipitation_change_pct')} aria-pressed={!isTemp}>Precipitation</button></div></div>
   <div className="gx-chart-readout"><div><span>{active.horizon} · annual {isTemp?'temperature':'precipitation'} change</span><strong>{signed(range.p25,isTemp?1:0)} to {signed(range.p75,isTemp?1:0)} <small>{unit}</small></strong></div><div className="gx-readout-delta"><span>Published 25th–75th percentiles</span><span className="gx-pill">Pooled across models + scenarios</span></div></div>
   <svg className="gx-projection-chart" viewBox="0 0 730 285" role="img" aria-label={`NPCC4 projected annual ${isTemp?'temperature':'precipitation'} change, pooled ranges and separate scenario means`}><title>Published NPCC4 projection ranges</title><desc>The outer band joins 10th and 90th percentile points; the inner band joins 25th and 75th. Lines show separate SSP2-4.5 and SSP5-8.5 ensemble means. Connecting lines do not create new projection estimates between published horizons.</desc>{[0,1,2,3,4].map(i=>{const v=low+(high-low)*i/4;return <g key={i}><line className="gx-gridline" x1={60} x2={680} y1={y(v)} y2={y(v)}/><text className="gx-axis-label" x={48} y={y(v)+4} textAnchor="end">{fmt(v,isTemp?1:0)}</text></g>})}<path d={outer} fill="#68d9cf" opacity={.1}/><path d={inner} fill="#68d9cf" opacity={.25}/>{['ssp245','ssp585'].map((scenario,i)=><path key={scenario} d={pathOf(rows,x,r=>finite(r.scenario_ensemble_means?.[scenario]?.[metric])?y(r.scenario_ensemble_means[scenario][metric]):null)} fill="none" stroke={i?'#f6ad98':'#c8f77b'} strokeWidth={2} strokeDasharray={i?'6 5':undefined}/>)}{rows.map((r:any)=><g key={r.horizon}><text className="gx-axis-label" x={x(r)} y={271} textAnchor="middle">{r.horizon}</text>{r===active&&<><line x1={x(r)} x2={x(r)} y1={42} y2={245} stroke="#f3f5f8" strokeDasharray="3 5" opacity={.65}/><circle cx={x(r)} cy={y(r[metric].p25)} r={4} fill="#68d9cf"/><circle cx={x(r)} cy={y(r[metric].p75)} r={4} fill="#68d9cf"/></>}</g>)}<text className="gx-axis-title" x={60} y={22}>Change from 1981–2010 / {unit}</text></svg>
   <div className="gx-chart-legend gx-fan-legend"><span><i style={{background:'rgba(104,217,207,.2)'}}/>10th–90th</span><span><i style={{background:'rgba(104,217,207,.6)'}}/>25th–75th</span><span><i style={{background:'#c8f77b'}}/>SSP2-4.5 mean</span><span><i style={{background:'#f6ad98'}}/>SSP5-8.5 mean</span></div>
   <div className="gx-horizon-control"><label htmlFor="gx-climate-horizon">Explore a time horizon <strong>{active.horizon}</strong></label><input id="gx-climate-horizon" className="gx-range" aria-label="NPCC4 published time horizon" aria-valuetext={active.horizon} type="range" min={0} max={rows.length-1} step={1} value={index} onChange={e=>setHorizonIndex(Number(e.target.value))} style={{'--gx-range-fill':`${index/(rows.length-1)*100}%`} as CSSProperties}/><div className="gx-horizon-buttons">{labels.map((label:string,i:number)=><button key={label} className={i===index?'is-active':''} onClick={()=>setHorizonIndex(i)} aria-pressed={i===index}>{label}</button>)}</div></div>
   <p className="gx-small">These are pooled model-and-scenario percentiles, not calibrated probabilities or confidence intervals. Bands connect published time slices for orientation; the slider selects only published horizons. The 2100 time slice uses the source’s separate end-century method.</p>
  </div><aside className="gx-card gx-scenario-card"><span className="gx-eyebrow">SAME HORIZON / DIFFERENT PATHWAYS</span><h3>{active.horizon}</h3><p className="gx-muted">Scenario ensemble means are shown separately from the pooled uncertainty ranges.</p>{[{key:'ssp245',label:'SSP2-4.5',color:'#c8f77b'},{key:'ssp585',label:'SSP5-8.5',color:'#f6ad98'}].map(s=><div className="gx-scenario-value" key={s.key}><span style={{color:s.color}}><i style={{background:s.color}}/>{s.label}</span><strong>{signed(means?.[s.key]?.[metric],isTemp?1:0)} <small>{unit}</small></strong><em>Model ensemble mean</em></div>)}<div className="gx-projection-envelope"><span>Wider published range · 10th–90th</span><strong>{signed(range.p10,isTemp?1:0)} to {signed(range.p90,isTemp?1:0)} {unit}</strong></div><a className="gx-source-link" href={projections.provenance?.dataset_landing||'https://climateassessment.nyc/npcc-datasets/'} target="_blank" rel="noreferrer">Explore the NPCC4 source ↗</a><p className="gx-small">No station observations are spliced into this projection. The observed view uses a different baseline. These regional changes cannot resolve an individual building’s indoor climate or flood exposure.</p></aside></div>
  <div className="gx-extremes-header"><div><span className="gx-eyebrow">EXTREMES / A SEPARATE MODEL SUMMARY</span><h3>A shift in everyday extremes.</h3></div><span className="gx-pill">{active.horizon} · 25th–75th range</span></div>
  {extremes.length?<div className="gx-extremes-grid">{extremeCards.map(card=>{const a=extremes.find((r:any)=>r.percentile===25)?.[card.key],b=extremes.find((r:any)=>r.percentile===75)?.[card.key];return <div className="gx-card gx-extreme-card" key={card.key}><span>{card.label}</span><strong>{fmt(a,0)}–{fmt(b,0)}<small>{card.unit}</small></strong><p>Published 1981–2010 baseline: <b>{fmt(projections.baseline_extremes?.[card.key],0)}</b></p></div>})}</div>:<div className="gx-card gx-extremes-unavailable"><span>Extremes are published for the 2030s, 2050s and 2080s.</span><p>No extreme-event frequency is interpolated for this horizon.</p><div>{['2030s','2050s','2080s'].map(label=><button className="gx-button gx-button-quiet" key={label} onClick={()=>setHorizonIndex(labels.indexOf(label))}>View {label} ↗</button>)}</div></div>}
  <p className="gx-small gx-extreme-note">Extremes summarize long-term annual frequencies from a separate 16-model ensemble. A heatwave is at least three consecutive days with maximum temperature ≥90°F. These are not forecasts for a particular year, site or storm.</p>
 </>;
}

function ClimateInvestigationQuestion({projections}:{projections:any}){
 const rows=Array.isArray(projections?.extremes)?projections.extremes:[];
 const lower=rows.find((r:any)=>r.horizon==='2050s'&&r.percentile===25)?.hot_days_ge90f_per_year;
 const upper=rows.find((r:any)=>r.horizon==='2050s'&&r.percentile===75)?.hot_days_ge90f_per_year;
 const baseline=projections?.baseline_extremes?.hot_days_ge90f_per_year;
 return <aside className="gx-card gx-month-card" style={{marginTop:18}} aria-label="Climate question for your property investigation"><div className="gx-card-heading"><div><span className="gx-eyebrow">THE NEXT PROPERTY QUESTION</span><h3>Can this place maintain the indoor conditions your activity needs?</h3></div></div><p className="gx-muted" style={{marginTop:14}}>Ask for documented cooling performance during a sustained hot spell, including the indoor target, outdoor temperature and humidity, equipment performance and available electrical capacity.</p>{finite(lower)&&finite(upper)&&finite(baseline)&&<p className="gx-small" style={{marginTop:12}}>Why ask: NPCC4’s 2050s NYC regional summary projects {fmt(lower,0)}–{fmt(upper,0)} days per year at or above 90°F (pooled 25th–75th percentiles), against its published 1981–2010 reference of {fmt(baseline,0)}. That reference is separate from the selected station’s 1991–2020 baseline.</p>}<p className="gx-small" style={{marginTop:8}}>Hot-day counts and annual energy intensity cannot determine a building’s cooling capacity, bill or operational fit. Without asset-specific verification, those conditions remain unknown.</p><a className="gx-source-link" href="https://ntrs.nasa.gov/api/citations/20240008607/downloads/VGornitzANYASNPCC4Reprint.pdf#page=17" target="_blank" rel="noreferrer">Read the published NPCC4 table and methods ↗</a></aside>;
}

export function ClimateStudio({climate,projections,mode,onModeChange,initialStationId}:ClimateStudioProps){
 const [localMode,setLocalMode]=useState(mode);
 useEffect(()=>setLocalMode(mode),[mode]);
 const change=(next:'observed'|'paired'|'future')=>{setLocalMode(next);onModeChange?.(next)};
 return <section className="analytics-workspace gx-climate" aria-label="Climate studio"><div className="gx-heading"><div><span className="gx-eyebrow"><span className="gx-spark"/> CLIMATE STUDIO</span><h2>Outdoor conditions.<br/><em>Better indoor questions.</em></h2><p>Read regional heat, moisture and future ranges. Then ask for evidence of a building’s performance.</p></div><div className="gx-segmented" aria-label="Climate time perspective"><button className={localMode==='observed'?'is-active':''} aria-pressed={localMode==='observed'} onClick={()=>change('observed')}>Daily history</button><button className={localMode==='paired'?'is-active':''} aria-pressed={localMode==='paired'} onClick={()=>change('paired')}>Heat + moisture</button><button className={localMode==='future'?'is-active':''} aria-pressed={localMode==='future'} onClick={()=>change('future')}>Future pathways</button></div></div>{localMode==='observed'?<ObservedClimate climate={climate} initialStationId={initialStationId}/>:localMode==='paired'?<HourlyWeather initialStationId={initialStationId}/>:<FutureClimate projections={projections}/>}<ClimateInvestigationQuestion projections={projections}/></section>;
}

export default ClimateStudio;

'use client';
/** The four native LL84 qualifications already retained in each reporting node.
 * Preserve the source text; no flag changes energy values or certifies a report. */
const definitions=[
 ['estimated_values_energy','Estimated energy entries'],
 ['alert_energy_meter_has_less','Meter coverage under 12 full calendar months'],
 ['alert_energy_meter_has_gaps','Gaps in energy-meter data'],
 ['alert_gross_floor_area_is','Zero gross floor area alert'],
] as const;
export function energyQualityFlags(value:unknown){
 const source=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 return definitions.map(([key,label])=>{
  const raw=source[key],status=typeof raw==='string'&&raw.trim()?raw.slice(0,500):'Not provided';
  const normalized=status.trim().toLowerCase();
  return{key,label,status,attention:normalized==='yes'||normalized==='possible issue'};
 });
}
export function EnergyQualityNotice({data,conflicting=false}:{data:unknown;conflicting?:boolean}){
 const flags=energyQualityFlags(data),attention=flags.filter(flag=>flag.attention);
 if(conflicting)return <div className="ll84-quality-notice"><strong>Conflicting report copies need review.</strong><p>The qualifications below come from one returned copy and may not agree across copies. They do not resolve the conflict.</p></div>;
 if(!attention.length)return null;
 const estimated=attention.some(flag=>flag.key==='estimated_values_energy');
 return <div className="ll84-quality-notice"><strong>{estimated?'Reported energy includes estimated meter entries.':'Source qualifications need review.'}</strong><p>{attention.map(flag=>`${flag.label}: ${flag.status}`).join(' · ')}</p><p>No adjustment is made to the reported values. These flags do not establish an error or the fraction of consumption that was estimated.</p></div>;
}
export function EnergyQualityDetails({data}:{data:unknown}){
 return <div className="ll84-quality-details"><h4>Native source qualifications</h4><dl>{energyQualityFlags(data).map(flag=><div key={flag.key} className={flag.attention?'needs-review':undefined}><dt>{flag.label}</dt><dd>{flag.status}</dd></div>)}</dl><p>Literal reporting-property flags from LL84. “Ok” is the source status, not independent verification. An unavailable check is not “No.”</p></div>;
}

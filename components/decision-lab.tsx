'use client';

import {useMemo} from 'react';
import type {CityBuilding} from '../lib/city';
import type {SiteContext} from '../lib/site-context';
import {screen,type Preferences} from '../lib/city-screening';
import {blendWeights,truckShare,preferenceFrontier,nextVerification} from '../lib/decision-lab';
import './analytics.css';

export type DecisionLabProps={buildings:CityBuilding[];contexts:Record<string,SiteContext>;weights:Preferences;onWeightsChange:(w:Preferences)=>void;onInspect:(b:CityBuilding)=>void;onRemove:(b:CityBuilding)=>void;onExplore:()=>void;onExport:()=>void};
const COLORS=['#c8f77b','#68d9cf','#f6ad98','#b9a5f9'];
const number=(n:number|null|undefined,digits=0)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:digits}):'Unknown';
const pct=(n:number)=>Number(n.toFixed(2)).toString();

export function DecisionLab({buildings,contexts,weights,onWeightsChange,onInspect,onRemove,onExplore,onExport}:DecisionLabProps){
 const candidates=useMemo(()=>buildings.slice(0,4),[buildings]);
 const rows=useMemo(()=>screen(candidates,contexts,weights),[candidates,contexts,weights]);
 const frontier=useMemo(()=>preferenceFrontier(candidates,contexts),[candidates,contexts]);
 const share=truckShare(weights);
 const noWeight=!(weights.size>0||weights.truck>0);
 const ranked=rows.filter(r=>r.score!==null);
 const winners=ranked.filter(r=>Math.abs(r.score!-ranked[0].score!)<1e-8).map(r=>r.building.id);
 const identify=(id:string)=>candidates.findIndex(b=>b.id===id);
 const letter=(id:string)=>String.fromCharCode(65+identify(id));
 const color=(id:string)=>COLORS[Math.max(0,identify(id))];
 const unit=candidates[0]?.entity_type==='parcel'?'Tax-lot area':'Building footprint';
 const x=(n:number)=>54+n*6.24,y=(n:number)=>226-n*1.8;
 const completeCount=frontier.curves.filter(c=>c.size!==null&&c.truck!==null).length;
 const uniqueWins=[...new Set(frontier.intervals.flatMap(s=>s.winnerIds))];
 const currentBoundary=frontier.boundaries.find(b=>Math.abs(b.at-share)<.00001);

 return <section className="analytics-workspace gx-decision" aria-label="Decision lab">
  <div className="gx-heading"><div><span className="gx-eyebrow"><span className="gx-spark"/> DECISION LAB</span><h2>What would change<br/><em>your decision?</em></h2><p>A shortlist is a hypothesis. Move one priority and see which candidates still make sense.</p></div><div className="gx-header-actions"><button className="gx-button gx-button-quiet" onClick={onExplore}>＋ Add a candidate</button><button className="gx-button" disabled={!candidates.length} onClick={onExport}>Export evidence ↗</button></div></div>
  {!candidates.length?<div className="gx-empty"><div className="gx-empty-orbit">A <span>↔</span> B</div><h3>Give your decision a second option.</h3><p>Save up to four buildings or tax lots from the city explorer. Compare the same type of candidate to reveal the trade-offs.</p><button className="gx-button gx-button-lime" onClick={onExplore}>Explore New York ↗</button></div>:<>
   <div className="gx-lab-grid">
    <div className="gx-card gx-frontier-card">
     <div className="gx-card-heading"><div><span className="gx-eyebrow">01 / PREFERENCE FRONTIER</span><h3>{frontier.mixedUnits?'Different units. Different questions.':completeCount<2?'Start with the evidence you have.':uniqueWins.length>1?'Every preference has a consequence.':'A steady lead in the known evidence.'}</h3></div><span className="gx-pill">{candidates.length} candidates</span></div>
     {frontier.mixedUnits?<div className="gx-inset-message"><strong>Keep buildings and tax lots in separate comparisons.</strong><p>A footprint is an individual structure’s ground coverage. Tax-lot area is the full parcel. Their scores are withheld here because those measurements answer different questions.</p></div>:<>
      <div className="gx-frontier-legend">{candidates.map((b,i)=><span key={b.id}><i style={{background:COLORS[i]}}/>{String.fromCharCode(65+i)} · {b.address||b.id}</span>)}</div>
      <div className="gx-score-chart"><svg viewBox="0 0 730 270" role="img" aria-label="Preference score as the truck-route share changes from zero to one hundred percent">
       <title>Exact linear preference scores</title><desc>Only candidates with both known metrics have a continuous line. Higher scores reflect the selected area and route-distance rules, not suitability or safety.</desc>
       {[0,25,50,75,100].map(v=><g key={v}><line className="gx-gridline" x1={54} x2={678} y1={y(v)} y2={y(v)}/><text className="gx-axis-label" x={42} y={y(v)+4} textAnchor="end">{v}</text><text className="gx-axis-label" x={x(v)} y={250} textAnchor="middle">{v}%</text></g>)}
       {frontier.boundaries.map(b=><line key={b.at} x1={x(b.at)} x2={x(b.at)} y1={46} y2={226} className="gx-crossing-line"/>)}
       {frontier.curves.map(c=><g key={c.id}>{c.size!==null&&c.truck!==null?<path d={`M ${x(0)} ${y(c.size)} L ${x(100)} ${y(c.truck)}`} fill="none" stroke={color(c.id)} strokeWidth={3} opacity={winners.includes(c.id)?1:.55}/>:<>{c.size!==null&&<circle cx={x(0)} cy={y(c.size)} r={5} fill={color(c.id)}/>} {c.truck!==null&&<circle cx={x(100)} cy={y(c.truck)} r={5} fill={color(c.id)}/>}</>}</g>)}
       <line x1={x(share)} x2={x(share)} y1={32} y2={226} stroke="#ffffff" strokeWidth={1} strokeDasharray="3 5" opacity={.8}/>
       {!noWeight&&rows.map(r=>r.score!==null&&<g key={r.building.id}><circle cx={x(share)} cy={y(r.score)} r={7} fill={color(r.building.id)} stroke="#0b1420" strokeWidth={3}/></g>)}
       <text x={54} y={18} className="gx-axis-title">Preference score / 100</text>
      </svg></div>
      <div className="gx-blend-labels"><div><span>MORE SPACE</span><strong>{pct(100-share)}<small>%</small></strong></div><div className="gx-blend-center">Drag to challenge your choice <span>↔</span></div><div><span>CLOSER TO A TRUCK ROUTE</span><strong>{pct(share)}<small>%</small></strong></div></div>
      <input className="gx-range" aria-label="Truck-route preference share" type="range" min="0" max="100" step="any" value={share} onChange={e=>onWeightsChange(blendWeights(Number(e.target.value)))} style={{'--gx-range-fill':`${share}%`} as React.CSSProperties}/>
      <div className="gx-current-choice" aria-live="polite"><span className="gx-eyebrow">AT THIS BLEND</span><strong>{noWeight?'No active preference':!winners.length?'No complete score':`${winners.map(letter).join(' + ')} ${winners.length>1?'share the lead':'leads'}`}</strong><span>{noWeight?'Move the slider to activate the blend.':currentBoundary?'An exact tie at the crossover.':frontier.missingIds.length?'Among candidates with the required evidence.':'Within your current shortlist.'}</span></div>
     </>}
     <details className="gx-method"><summary>How this score works <span>＋</span></summary><p>Area receives 0–100 points up to 20,000 sq ft, then stays at 100. Truck proximity receives 100 points at 0 m, decreasing to 0 at 2,000 m. The slider blends those two values. Distance is a straight-line proxy, not a confirmed access route. Scores have no economic or risk interpretation. Heat vulnerability and flood scenarios remain context only.</p><p>Missing active metrics withhold a score. At either endpoint, only that endpoint’s metric is required. Lines show candidates with both metrics. All candidates use the existing screening calculation; these are chosen heuristics, not validated suitability thresholds.</p></details>
    </div>
    <aside className="gx-card gx-tipping-card"><span className="gx-eyebrow">02 / THE TIPPING POINTS</span><h3>Where the lead<br/>changes hands.</h3><p className="gx-muted">The intervals are calculated from the score lines, not sampled from a weight grid.</p>
     {frontier.mixedUnits?<div className="gx-tipping-empty">Choose one measurement unit to unlock the frontier.</div>:completeCount===0?<div className="gx-tipping-empty">No candidate has both metrics yet. Endpoint scores may still be available.</div>:<div className="gx-intervals">{frontier.intervals.map((interval,i)=><div className="gx-interval" key={i}><div className="gx-interval-line"><span>{pct(interval.from)}–{pct(interval.to)}<small>% truck</small></span><strong style={{color:color(interval.winnerIds[0]||'')}}>{interval.winnerIds.map(letter).join(' + ')||'—'}</strong></div><div className="gx-interval-track"><span style={{marginLeft:`${interval.from}%`,width:`${interval.to-interval.from}%`,background:color(interval.winnerIds[0]||'')}}/></div></div>)}</div>}
     {!!frontier.boundaries.length&&<div className="gx-crossings">{frontier.boundaries.map(b=><button key={b.at} onClick={()=>onWeightsChange(blendWeights(b.at))}><span>{b.winnerIds.map(letter).join(' + ')} tie at</span><strong>{pct(b.at)}% ↗</strong></button>)}</div>}
     {!frontier.mixedUnits&&<p className="gx-small">Intervals describe their interiors; boundaries may tie. At 0% truck: {frontier.endpoints.size.map(letter).join(' + ')||'no score'}. At 100% truck: {frontier.endpoints.truck.map(letter).join(' + ')||'no score'}. Displayed percentages are rounded.</p>}
     {!!frontier.missingIds.length&&!frontier.mixedUnits&&<div className="gx-data-gap"><span>○ EVIDENCE GAP</span><p>{frontier.missingIds.map(letter).join(', ')} {frontier.missingIds.length===1?'is':'are'} missing a required metric for an interior score. A complete-data winner is not a confirmed winner over those candidates.</p></div>}
    </aside>
   </div>
   <div className="gx-evidence-header"><div><span className="gx-eyebrow">03 / THE NEXT USEFUL QUESTION</span><h3>More evidence. Fewer assumptions.</h3></div><p>One fact to verify for each candidate.</p></div>
   <div className="gx-evidence-grid">{candidates.map((b,i)=>{
    const row=rows.find(r=>r.building.id===b.id)!;const context=contexts[b.id];const next=nextVerification(b,context);
    return <article className="gx-card gx-evidence-card" key={b.id} style={{'--gx-candidate':COLORS[i]} as React.CSSProperties}>
     <div className="gx-evidence-top"><span className="gx-candidate-letter">{String.fromCharCode(65+i)}</span><span className="gx-pill">{b.entity_type==='parcel'?'Tax lot':'Building'}</span><button className="gx-icon-button" aria-label={`Remove ${b.address||b.id} from comparison`} onClick={()=>onRemove(b)}>×</button></div>
     <button className="gx-address-button" onClick={()=>onInspect(b)}><h4>{b.address||`Record ${b.id}`}</h4><span>↗</span></button><p className="gx-location">{b.borough||'New York City'} · {b.bin?`BIN ${b.bin}`:`BBL ${b.bbl||'unmatched'}`}</p>
     <div className="gx-evidence-score"><strong>{row.score===null?'—':number(row.score,1)}</strong><span>preference score<small>{row.score===null?'Insufficient / incomparable evidence':winners.includes(b.id)?'Leading at this blend':'Within this shortlist'}</small></span></div>
     <dl className="gx-evidence-metrics"><div><dt>{b.entity_type==='parcel'?'Tax-lot area':unit==='Tax-lot area'?'Building footprint':unit}</dt><dd>{number(row.raw.size)} <small>{row.raw.size!==null?'sq ft':''}</small></dd></div><div><dt>Truck-route proximity</dt><dd>{number(row.raw.truck)} <small>{row.raw.truck!==null?'m':''}</small></dd></div><div><dt>Neighborhood HVI</dt><dd>{row.raw.heat!==null&&row.raw.heat>=1&&row.raw.heat<=5?`${row.raw.heat} / 5`:'Unknown'}<small> context only</small></dd></div></dl>
     <div className="gx-next-fact"><span>{next.kind==='missing'?'○ FILL A DATA GAP':'↗ CHECK IN THE REAL WORLD'}</span><h5>{next.title}</h5><p>{next.detail}</p></div>
     <button className="gx-button gx-button-full" onClick={()=>onInspect(b)}>Open evidence passport <span>↗</span></button>
    </article>;
   })}{candidates.length<4&&<button className="gx-add-card" onClick={onExplore}><span>＋</span><strong>Test another possibility</strong><p>Add a candidate from the map.</p></button>}</div>
  </>}
 </section>;
}

export default DecisionLab;

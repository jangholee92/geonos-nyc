'use client';

import {useRef,useState, type FormEvent,type KeyboardEvent} from 'react';
import {ArrowRight, ArrowUpRight, Building2, Check, ChevronDown, GitCompareArrows, Layers3, LoaderCircle, MapPin, Search, ShieldQuestion, Thermometer, Waves, Zap} from 'lucide-react';
import './decision-start.css';
import AddressPicker from './address-picker';
import {addressQuery,type AddressEntry} from '@/lib/address-search';

export type StartIntent = 'understand' | 'compare' | 'find';
export type StartRequest = {
  intent: StartIntent;
  purpose: 'general' | 'warehouse' | 'cold_storage';
  addresses: AddressEntry[];
  borough: string;
  minimumLotFloorArea: number | null;
};
export type StoryChoice = 'footprint' | 'energy';

type Props = {
  onStart: (request: StartRequest) => void;
  onStory: (story: StoryChoice) => void;
  onMap: () => void;
  onHourly: () => void;
  busy: boolean;
  error?: string;
  connectedSources: number;
};

const tasks = [
  {id:'understand' as const, title:'Understand a place', subtitle:'Start with one address', Icon:MapPin},
  {id:'compare' as const, title:'Compare addresses', subtitle:'See what changes the choice', Icon:GitCompareArrows},
  {id:'find' as const, title:'Find candidates', subtitle:'Search the public records', Icon:Search},
];

export default function DecisionStart({onStart,onStory,onMap,onHourly,busy,error,connectedSources}:Props) {
  const [intent,setIntent] = useState<StartIntent>('understand');
  const [purpose,setPurpose] = useState<StartRequest['purpose']>('general');
  const [addresses,setAddresses] = useState<AddressEntry[]>([{text:'',match:null},{text:'',match:null}]);
  const [borough,setBorough] = useState('all');
  const [area,setArea] = useState('');
  const [validation,setValidation] = useState('');
  const [details,setDetails] = useState(false);
  const addressFields=useRef<HTMLDivElement>(null);

  function submit(e:FormEvent) {
    e.preventDefault();
    const entries=addresses.slice(0,intent==='understand'?1:addresses.length).map(x=>({...x,text:x.text.trim()}));
    if(intent!=='find'&&entries.some(x=>!x.text)) {setValidation(intent==='compare'?'Add at least two NYC addresses to compare.':'Enter a NYC street address, BBL or BIN.');return;}
    if(intent!=='find'&&entries.some(x=>!addressQuery(x))) {setValidation('Choose each matching address from the suggestions, or enter its BIN / BBL.');return;}
    if(intent==='compare'&&new Set(entries.map(x=>addressQuery(x))).size!==entries.length) {setValidation('Use different addresses for the comparison.');return;}
    const minimum=area.trim()?Number(area):null;
    if(minimum!==null&&(!Number.isFinite(minimum)||minimum<0||minimum>100000000)) {setValidation('Use a floor-area target between 0 and 100,000,000 square feet.');return;}
    setValidation('');
    onStart({intent,purpose,addresses:intent==='find'?[]:entries,borough,minimumLotFloorArea:minimum});
  }

  function changeTask(next:StartIntent) {setIntent(next);setValidation('');}
  function switchTask(event:KeyboardEvent<HTMLButtonElement>,index:number){
    const next=event.key==='ArrowRight'?(index+1)%tasks.length:event.key==='ArrowLeft'?(index+tasks.length-1)%tasks.length:event.key==='Home'?0:event.key==='End'?tasks.length-1:null;
    if(next===null)return;event.preventDefault();changeTask(tasks[next].id);document.getElementById('task-'+tasks[next].id)?.focus();
  }
  function addAddress(){const index=addresses.length;setAddresses(old=>[...old,{text:'',match:null}]);requestAnimationFrame(()=>addressFields.current?.querySelectorAll<HTMLInputElement>('input[role="combobox"]')[index]?.focus());}
  const title={understand:'What should I know about this building?',compare:'Which of these places fits my plan?',find:'Where should I start looking?'}[intent];
  const promise={understand:'A place brief: physical facts, climate context and the next questions to ask.',compare:'A side-by-side answer: what matches, what conflicts and what is still unknown.',find:'Real public records matching your filters, ready for closer investigation.'}[intent];

  return <div className="decision-start">
    <section className="start-intro" aria-labelledby="start-title">
      <div className="start-kicker"><span/> NEW YORK CITY · PROPERTY DECISIONS</div>
      <h1 id="start-title">Which building<br/>fits <em>your plan?</em></h1>
      <p>Compare NYC buildings with climate, energy and city records. Turn evidence into your next step.</p>
      <div className="start-proof"><span><Building2 size={15}/>1.08M official footprints</span><span><Layers3 size={15}/>{connectedSources||'—'} connected data layers</span><button onClick={onMap}>Explore the map <ArrowUpRight size={14}/></button></div>
    </section>

    <section className="question-launcher" aria-label="Start a property decision">
      <div className="task-switch" role="tablist" aria-label="What would you like to do?">
        {tasks.map(({id,title,subtitle,Icon},index)=><button key={id} role="tab" tabIndex={intent===id?0:-1} onKeyDown={event=>switchTask(event,index)} aria-selected={intent===id} aria-controls="decision-task-panel" id={'task-'+id} onClick={()=>changeTask(id)} className={intent===id?'active':''}><span className="task-icon"><Icon size={21}/></span><span><strong>{title}</strong><small>{subtitle}</small></span><ArrowRight size={16}/></button>)}
      </div>
      <form onSubmit={submit} className="task-form" role="tabpanel" id="decision-task-panel" aria-labelledby={'task-'+intent}>
        <div className="task-form-heading"><span className="start-step">01</span><div><h2>{title}</h2><p>{promise}</p></div></div>
        <div className="task-inputs">
          {intent!=='find'&&<div ref={addressFields} className={'address-inputs '+(intent==='compare'?'comparison-inputs':'')}>
            {addresses.slice(0,intent==='understand'?1:addresses.length).map((address,index)=><div className="address-field-row" key={index}><AddressPicker value={address} label={intent==='compare'?'Address '+String.fromCharCode(65+index):'NYC street address, BBL or BIN'} placeholder={index===0?'e.g. 211 Lombardy Street, Brooklyn':'e.g. 45 Bowne Street, Brooklyn'} onChange={entry=>setAddresses(old=>old.map((value,i)=>i===index?entry:value))}/>{intent==='compare'&&index>1&&<button className="remove-address" type="button" onClick={()=>setAddresses(old=>old.filter((_,i)=>i!==index))}>Remove address {String.fromCharCode(65+index)}</button>}</div>)}
            {intent==='understand'&&<button className="sample-address-button" type="button" onClick={()=>setAddresses(old=>[{text:'211 LOMBARDY STREET, Brooklyn, NY, USA',match:{id:'bin:3338236',label:'211 LOMBARDY STREET, Brooklyn, NY, USA',name:'211 LOMBARDY STREET',borough:'Brooklyn',bin:'3338236',bbl:'3028220001',version:'26c',source:'NYC Planning GeoSearch / PAD'}},...old.slice(1)])}>Try a real example: 211 Lombardy Street <ArrowUpRight size={11}/></button>}
            {intent==='compare'&&addresses.length<4&&<button className="add-address" type="button" onClick={addAddress}>+ Add another address</button>}
          </div>}
          <div className={'launch-options '+(intent==='find'?'find-options':'')}>
            <label className="launch-field"><span>What are you considering?</span><div className="launch-select"><Building2 size={17}/><select value={purpose} onChange={e=>setPurpose(e.target.value as StartRequest['purpose'])}><option value="general">Understand the property</option><option value="warehouse">Warehouse or logistics use</option><option value="cold_storage">Cold-storage use</option></select><ChevronDown size={14}/></div><small>Guides follow-up questions; it does not filter or certify a use.</small></label>
            {intent==='find'&&<><label className="launch-field"><span>Where in New York City?</span><div className="launch-select"><MapPin size={17}/><select value={borough} onChange={e=>setBorough(e.target.value)}><option value="all">All five boroughs</option><option value="BK">Brooklyn</option><option value="QN">Queens</option><option value="BX">Bronx</option><option value="MN">Manhattan</option><option value="SI">Staten Island</option></select><ChevronDown size={14}/></div></label><label className="launch-field area-launch-field"><span>Minimum reported floor area <small>optional</small></span><div className="launch-input"><input type="number" min="0" max="100000000" step="100" value={area} placeholder="e.g. 20000" onChange={e=>setArea(e.target.value)}/><span>sq ft</span></div><small>All buildings on the tax lot. Usable indoor space needs a separate check.</small></label></>}
          </div>
        </div>
        {(error||validation)&&<p className="launch-error" role="alert">{validation||error}</p>}
        <div className="launch-submit-row"><div><Check size={15}/><span>Works now with public data</span></div><button className="button button-lime launch-submit" type="submit" disabled={busy}>{busy?<LoaderCircle size={18} className="spin"/>:<Search size={17}/>} {busy?'Finding the official records…':{understand:'Understand this place',compare:'Compare these places',find:'Find candidate records'}[intent]}{!busy&&<ArrowRight size={18}/>}</button></div>
        <div className="launch-scope">Public evidence for early investigation. Listings, usable space and approvals are separate checks.</div>
      </form>
    </section>

    <section className="real-investigations" aria-labelledby="investigation-title">
      <div className="investigation-heading"><div><span className="start-kicker">DON’T HAVE AN ADDRESS YET?</span><h2 id="investigation-title">Try a real investigation.</h2></div><p>One small change in how you read the data<br/>can change the question you ask next.</p></div>
      <div className="investigation-cards">
        <button className="investigation-card flood-investigation" onClick={()=>onStory('footprint')}><div className="investigation-top"><span><Waves size={15}/> FLOOD MAPS × FUTURE SCENARIOS</span><ArrowUpRight size={20}/></div><div className="point-outline-visual" aria-hidden="true"><div className="outline-shape"><span className="outline-water"/><i/><b>BUILDING INTERIOR</b></div><span className="outline-arrow">→</span><div className="outline-shape outlined"><span className="outline-water"/><i/><b>SURROUNDING GROUND</b></div></div><h3>Why is the building blank?</h3><p>The model leaves buildings out. Step outside the outline and see what changes in the 2050 scenario.</p><span className="investigation-action">Look around the building <ArrowRight size={16}/></span></button>
        <button className="investigation-card energy-investigation" onClick={()=>onStory('energy')}><div className="investigation-top"><span><Zap size={15}/> ENERGY REPORTS × BUILDING IDENTITY</span><ArrowUpRight size={20}/></div><div className="scope-visual" aria-hidden="true"><div><span>ONE REPORTING PROPERTY</span><b>2 buildings</b><i/></div><div><span>ONE BUILDING</span><b>A different denominator</b><i/></div></div><h3>Whose energy number is this?</h3><p>Unpack the reporting property behind an energy figure before using it to judge a building.</p><span className="investigation-action">Follow the energy record <ArrowRight size={16}/></span></button>
        <button className="investigation-card weather-investigation" onClick={onHourly}><div className="investigation-top"><span><Thermometer size={15}/> HEAT × MOISTURE × TIME</span><ArrowUpRight size={20}/></div><div className="weather-pair-visual" aria-hidden="true"><div><span>HOTTEST MOMENT</span><i/><b>Temperature + dew point</b></div><div><span>HIGHEST DEW POINT</span><i/><b>A different moment</b></div></div><h3>Did those extremes happen together?</h3><p>Follow actual airport observations. The hottest sample and the highest dew point tell different stories.</p><span className="investigation-action">Keep the weather pair together <ArrowRight size={16}/></span></button>
      </div>
    </section>

    <section className="start-explainer"><button aria-expanded={details} onClick={()=>setDetails(!details)}><ShieldQuestion size={19}/><span>What will GEONOS actually tell me?</span><ChevronDown size={17} className={details?'rotated':''}/></button>{details&&<div><p><strong>What the records support.</strong> Building geometry, tax-lot attributes, mapped scenario context, reported energy and public infrastructure.</p><p><strong>What could change your choice.</strong> A requirement a candidate does not meet, a measurement with the wrong scope, or a missing operational fact worth checking.</p><p><strong>What to do next.</strong> A concrete investigation question and a source-linked brief. Public records alone cannot establish availability, usable space, permissions or future losses.</p></div>}</section>
  </div>;
}

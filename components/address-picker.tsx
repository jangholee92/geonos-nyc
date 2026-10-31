'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Check,LoaderCircle,MapPin} from 'lucide-react';
import {addressQuery,searchAddresses,type AddressEntry,type AddressMatch} from '@/lib/address-search';

export default function AddressPicker({value,onChange,label,placeholder,required=true}:{value:AddressEntry;onChange:(value:AddressEntry)=>void;label:string;placeholder:string;required?:boolean}){
  const id=useId(),[options,setOptions]=useState<AddressMatch[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[highlight,setHighlight]=useState(-1);
  const request=useRef(0),focused=useRef(false),input=useRef<HTMLInputElement>(null);
  const resolved=addressQuery(value);
  useEffect(()=>{
    const sequence=++request.current;setHighlight(-1);setMessage('');
    if(resolved||value.text.trim().length<4){setOptions([]);setBusy(false);return;}
    setBusy(true);
    const timer=setTimeout(()=>{searchAddresses(value.text).then(rows=>{if(sequence!==request.current)return;setOptions(rows);setMessage(rows.length?'':'No address suggestions. Check the spelling or enter a BIN / BBL.');setOpen(focused.current);}).catch(()=>{if(sequence!==request.current)return;setOptions([]);setMessage('Address suggestions are temporarily unavailable. Try again or use a 7-digit BIN / 10-digit BBL.');}).finally(()=>{if(sequence===request.current)setBusy(false);});},350);
    return()=>{clearTimeout(timer);request.current++;};
  },[value.text,resolved]);
  function choose(match:AddressMatch){request.current++;setOpen(false);setOptions([]);setBusy(false);setMessage('');onChange({text:match.label,match});input.current?.focus();}
  return <div className="launch-field address-picker"><label htmlFor={id}>{label}</label><div className={'launch-input '+(resolved?'address-resolved':'')}><MapPin size={17}/><input ref={input} id={id} value={value.text} required={required} maxLength={240} placeholder={placeholder} role="combobox" aria-autocomplete="list" aria-expanded={open&&options.length>0} aria-controls={id+'-choices'} aria-activedescendant={open&&highlight>=0?id+'-choice-'+highlight:undefined} aria-describedby={id+'-hint'} autoComplete="off" onChange={e=>{onChange({text:e.target.value.slice(0,120),match:null});setOpen(true);}} onFocus={()=>{focused.current=true;if(options.length)setOpen(true);}} onBlur={()=>{focused.current=false;setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!options.length)return;e.preventDefault();setOpen(true);setHighlight(n=>e.key==='ArrowDown'?Math.min(n+1,options.length-1):Math.max(0,n-1));}if(e.key==='Enter'&&open&&highlight>=0&&options[highlight]){e.preventDefault();choose(options[highlight]);}}}/>{busy?<LoaderCircle size={15} className="spin"/>:resolved?<Check size={16}/>:null}</div>
    {open&&options.length>0&&<ul className="address-choices" id={id+'-choices'} role="listbox" aria-label="Matching NYC addresses">{options.map((match,index)=><li key={match.id} id={id+'-choice-'+index} role="option" aria-selected={highlight===index} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(match)} onMouseEnter={()=>setHighlight(index)}><MapPin size={15}/><div><strong>{match.name}</strong><small>{match.borough} · {match.bin?'BIN '+match.bin:'BBL '+match.bbl}</small></div><span>Choose</span></li>)}<li className="address-attribution" role="presentation">NYC Planning · Property Address Directory</li></ul>}
    <small id={id+'-hint'} className={'address-hint '+(resolved?'resolved':'')} aria-live="polite">{resolved?(value.match?'Official address selected · '+(value.match.bin?'BIN '+value.match.bin:'BBL '+value.match.bbl):'Official identifier entered'):message||'Type an address, then choose the matching official record.'}</small>
  </div>;
}

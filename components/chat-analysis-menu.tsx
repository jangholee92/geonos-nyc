'use client';
import {useEffect,useRef,useState} from 'react';
import {Plus,ScanLine,Images,History,Lightbulb,MessagesSquare} from 'lucide-react';
import './chat-analysis-menu.css';
export default function ChatAnalysisMenu({count,disabled,context,onChoose}:{count:number;disabled:boolean;context:string;onChoose:(question:string)=>void}){
 const[open,setOpen]=useState(false),panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{setOpen(false);},[context]);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
 const options=[
  {label:'Compare roofs & tree context',note:'Two aerials · SAM + Wonder',count:2,icon:ScanLine,prompt:'Compare the aerial imagery, roofs and nearby tree context of both selected buildings using SAM and Wonder. Show which site checks could change our climate-resilience comparison.'},
  {label:'Explore a place through time',note:'2020 / 2024 · DINOv2',count:1,icon:History,prompt:'Show historical aerial images of the first selected building and compare 2020 with 2024 using DINOv2.'},
  {label:'Challenge the comparison',note:'Second review · Muse Wonder',count:2,icon:MessagesSquare,prompt:'Give a Muse Wonder second review of the climate-resilience comparison of these two buildings. Challenge the weakest assumption and identify the next decisive check.'},
  {label:'Illustrate the inspection plan',note:'Concept diagram · Muse Image',count:2,icon:Lightbulb,prompt:'Create an inspection concept diagram for the climate-resilience comparison of these two buildings, showing the next checks and how they could change the decision.'},
  {label:'Inspect this building’s aerial',note:'Roof & trees · SAM',count:1,icon:Images,prompt:'Inspect the aerial photograph of the first selected building. Use SAM to mark roofs and trees, and explain what needs to be confirmed on site.'},
 ];
 return <div className="chat-analysis-menu" ref={panel} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}><button type="button" className="map-chat-icon" aria-label="Explore analysis tools" aria-expanded={open} disabled={disabled} title="Explore analysis tools" onClick={()=>setOpen(v=>!v)}><Plus size={18}/></button>{open&&<div className="chat-analysis-options" aria-label="Analysis tools"><strong>Explore with Meta</strong><p>Choose an idea, then edit and send.</p>{options.map(option=><button type="button" key={option.label} disabled={count<option.count||disabled} onClick={()=>{onChoose(option.prompt);setOpen(false);}}><option.icon size={16}/><span>{option.label}<small>{count<option.count?`Select ${option.count===2?'two buildings':'a building'} on the map`:option.note}</small></span></button>)}</div>}</div>;
}

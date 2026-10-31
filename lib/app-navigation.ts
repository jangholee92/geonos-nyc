'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
export type AppTab='home'|'answer'|'story'|'explore'|'climate'|'library'|'research'|'assistant';
export type AppRoute={tab:AppTab;story:'energy'|'footprint';climateMode:'observed'|'paired'|'future'};
export type NavigationOptions={preservePending?:boolean};
const initial:AppRoute={tab:'home',story:'energy',climateMode:'observed'};
const simple:Record<string,AppTab>={start:'home',compare:'answer',map:'explore',sources:'library',methods:'research',meta:'assistant'};
/** Only product navigation is encoded. Addresses, user reports and credentials never enter the URL. */
export function decodeAppRoute(hash:string):Partial<AppRoute>{
 const path=hash.replace(/^#/,'').replace(/\/$/,'');
 if(!path)return{tab:'home'};
 if(Object.prototype.hasOwnProperty.call(simple,path))return{tab:simple[path]};
 if(path==='investigation/energy')return{tab:'story',story:'energy'};
 if(path==='investigation/surroundings')return{tab:'story',story:'footprint'};
 if(path==='climate'||path==='climate/history')return{tab:'climate',climateMode:'observed'};
 if(path==='climate/moisture')return{tab:'climate',climateMode:'paired'};
 if(path==='climate/future')return{tab:'climate',climateMode:'future'};
 return{tab:'home'};
}
export function encodeAppRoute(route:AppRoute):string{
 if(route.tab==='story')return '#investigation/'+(route.story==='energy'?'energy':'surroundings');
 if(route.tab==='climate')return '#climate/'+({observed:'history',paired:'moisture',future:'future'}[route.climateMode]);
 return '#'+({home:'start',answer:'compare',explore:'map',library:'sources',research:'methods',assistant:'meta'}[route.tab]);
}
export function useAppNavigation(onNavigate?:()=>void){
 const [route,setRoute]=useState<AppRoute>(initial),current=useRef(route),beforeNavigate=useRef(onNavigate),storyReturn=useRef<AppTab>('home');
 beforeNavigate.current=onNavigate;
 const changed=(a:AppRoute,b:AppRoute)=>a.tab!==b.tab||(a.tab==='story'&&a.story!==b.story)||(a.tab==='climate'&&a.climateMode!==b.climateMode);
 useEffect(()=>{
  const read=()=>{
   const next={...current.current,...decodeAppRoute(window.location.hash)};
   if(changed(current.current,next))beforeNavigate.current?.();
   if(next.tab==='story'){
    const origin=window.history.state?.geonosStoryReturn;
    storyReturn.current=['home','answer','explore','climate','library','research','assistant'].includes(origin)?origin:'home';
   }
   current.current=next;setRoute(next);
  };
  read();window.addEventListener('popstate',read);window.addEventListener('hashchange',read);
  return()=>{window.removeEventListener('popstate',read);window.removeEventListener('hashchange',read)};
 },[]);
 const commit=useCallback((patch:Partial<AppRoute>,options:NavigationOptions={})=>{
  const previous=current.current,next={...previous,...patch};
  if(changed(previous,next)&&!options.preservePending)beforeNavigate.current?.();
  if(patch.story&&next.tab==='story'&&previous.tab!=='story')storyReturn.current=previous.tab;
  current.current=next;setRoute(next);
  const hash=encodeAppRoute(next);
  if(window.location.hash!==hash&&(changed(previous,next)||patch.tab||patch.story))window.history.pushState(next.tab==='story'?{geonosStoryReturn:storyReturn.current}:null,'',hash);
 },[]);
 const setTab=useCallback((tab:AppTab,options?:NavigationOptions)=>commit({tab},options),[commit]);
 const setStory=useCallback((story:AppRoute['story'])=>commit({story,tab:'story'}),[commit]);
 const setClimateMode=useCallback((climateMode:AppRoute['climateMode'])=>commit({climateMode}),[commit]);
 return{...route,storyReturn:storyReturn.current,setTab,setStory,setClimateMode};
}

import {fetchPublicJson} from './public-fetch';

export type AddressMatch = {
  id:string; label:string; name:string; borough:string;
  bin:string|null; bbl:string|null; version:string|null;
  source:'NYC Planning GeoSearch / PAD';
  aliases?:string[];
};
export type AddressEntry = {text:string; match:AddressMatch|null};
export const ADDRESS_SOURCE='https://geosearch.planninglabs.nyc/docs/';
const PAD_SOURCE='NYC Planning GeoSearch / PAD';
const boroughs:Record<string,string>={1:'Manhattan',2:'Bronx',3:'Brooklyn',4:'Queens',5:'Staten Island'};
function nativeId(value:unknown,length:7|10):string|null{
  const text=typeof value==='string'?value.trim():typeof value==='number'&&Number.isSafeInteger(value)?String(value):'';
  return (length===7?/^[1-5]\d{6}$/:/^[1-5]\d{9}$/).test(text)?text:null;
}
function displayText(value:unknown,max=240):string|null{
  return typeof value==='string'&&value.trim().length>0&&value.trim().length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():null;
}
const identity=(bin:string|null,bbl:string|null)=>bin?'bin:'+bin:bbl?'bbl:'+bbl:null;

/** Resolve an explicit identity, never a confidence score or arbitrary first hit. */
export function addressQuery(entry:AddressEntry):string|null {
  if(!entry||typeof entry.text!=='string')return null;
  const text=entry.text.trim();
  if(nativeId(text,7)||nativeId(text,10))return text;
  const match=entry.match;
  if(!match||match.source!==PAD_SOURCE||!displayText(match.label)||match.label!==text)return null;
  const bin=nativeId(match.bin,7),bbl=nativeId(match.bbl,10);
  if(bin&&bbl&&bin[0]!==bbl[0])return null;
  if(match.id!==identity(bin,bbl))return null;
  return bin||bbl;
}

/** Two address aliases may refer to one native building. A BBL shared by
 * different BINs does not make them the same building. BIN-to-BBL equivalence
 * is not guessed here; compare resolved footprint IDs after the city query too.
 */
export function duplicateAddressEntries(entries:AddressEntry[]):{identity:string;indexes:number[]}[]{
  const byId=new Map<string,number[]>();
  entries.forEach((entry,index)=>{const query=addressQuery(entry);if(query){const key=(query.length===7?'bin:':'bbl:')+query;byId.set(key,[...(byId.get(key)||[]),index]);}});
  return[...byId].filter(([,indexes])=>indexes.length>1).map(([identity,indexes])=>({identity,indexes}));
}

/** PAD identifiers are the bridge to official footprints; geocoder coordinates
 * never stand in for the geometry used to query environmental evidence. */
export function parseAddressMatches(data:unknown):AddressMatch[]{
  if(!data||typeof data!=='object'||(data as any).type!=='FeatureCollection'||!Array.isArray((data as any).features)||(data as any).features.length>500)throw Error('The address service returned an unexpected response.');
  const result:AddressMatch[]=[],seen=new Map<string,AddressMatch>();
  for(const f of (data as any).features){
    const p=f?.properties,pad=p?.addendum?.pad;
    if(f?.type!=='Feature'||!p||p.source!=='nycpad'||!pad||typeof pad!=='object'||Array.isArray(pad))continue;
    const bin=nativeId(pad.bin,7),bbl=nativeId(pad.bbl,10),label=displayText(p.label);
    const id=identity(bin,bbl);
    if(!id||!label||(bin&&bbl&&bin[0]!==bbl[0]))continue;
    const borough=boroughs[(bin||bbl)![0]];
    const declaredBorough=displayText(p.borough,40);
    if(declaredBorough&&Object.values(boroughs).includes(declaredBorough)&&declaredBorough!==borough)continue;
    const previous=seen.get(id);
    if(previous){if(label!==previous.label&&!previous.aliases!.includes(label)&&previous.aliases!.length<12)previous.aliases!.push(label);continue;}
    if(result.length===8)continue;
    const match:AddressMatch={id,label,name:displayText(p.name)||label,borough,bin,bbl,version:displayText(pad.version,40),source:PAD_SOURCE,aliases:[]};
    result.push(match);seen.set(id,match);
  }
  return result;
}

const cache=new Map<string,{rows:AddressMatch[];until:number}>();
const copy=(rows:AddressMatch[])=>rows.map(row=>({...row,aliases:[...(row.aliases||[])]}));
export async function searchAddresses(text:string,mode:'autocomplete'|'search'='autocomplete'):Promise<AddressMatch[]>{
  if(typeof text!=='string')throw Error('Enter an address or a native NYC identifier.');
  if(mode!=='autocomplete'&&mode!=='search')throw Error('Use the search or autocomplete address endpoint.');
  const query=text.trim();if(query.length<4)return[];
  if(query.length>120)throw Error('Keep addresses to 120 characters.');
  const key=mode+':'+query.toLowerCase();const existing=cache.get(key);if(existing&&existing.until>Date.now())return copy(existing.rows);
  const url=new URL('https://geosearch.planninglabs.nyc/v2/'+mode);url.searchParams.set('text',query);url.searchParams.set('size','8');
  const rows=parseAddressMatches(await fetchPublicJson(url,{timeoutMs:12000,label:'nyc-geosearch'}));
  if(cache.size>=60)cache.delete(cache.keys().next().value!);cache.set(key,{rows:copy(rows),until:Date.now()+15*60*1000});return rows;
}

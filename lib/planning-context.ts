import climateIndex from './climate-evidence-index.json';

type Horizon='2030s'|'2040s'|'2050s'|'2060s'|'2070s'|'2080s'|'2100';
type Origin='relative_user_window'|'explicit_published_horizon'|'application_default'|'unsupported_explicit_time';
type Range={p10:number;p25:number;p75:number;p90:number};
export type PlanningCitation={
 evidenceId:string;source:{url:string;dataset:string;label:string;paper:string;retrievalMode:'compiled-source-snapshot';retrievedOn:string;sourceRowsUpdatedAt:string;rawSha256:Record<string,string>};
 measurement:string;scope:'NYC_region';value:Range;unit:string;
 baseline:{years:number[];value?:number;unit?:string;scope:string};
};
export type PlanningContext={
 kind:'planning_context';status:'available'|'unsupported';
 planningWindow:{origin:Origin;quote:string|null;anchorDate:string|null;requestedStartYear:number|null;requestedEndYear:number|null;publishedHorizon:Horizon|null;interpretation:string};
 facts:Array<PlanningCitation&{label:string}>;citations:PlanningCitation[];
 limitations:string[];nextInvestigation:string;groundingNote:string;
};

const projection=climateIndex.projections;
const horizons=projection.annual.map(row=>row.horizon) as Horizon[];
const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,fifteen:15,twenty:20,thirty:30,forty:40,fifty:50};
const quantity='(?:\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty)';
const relativePattern=new RegExp(`\\b(?:(?:next|coming|following)\\s*(${quantity})\\s*years?|(?:over|for|in)\\s+(?:the\\s+)?(?:(?:next|coming|following)\\s*)?(${quantity})\\s*years?|(${quantity})\\s*years?\\s+from\\s+now|(?:next|coming|following)\\s*decade|in\\s+a\\s+decade)\\b`,'gi');
const shortTerm=/\b(today|tomorrow|tonight|right now|current weather|next week|next month|this week|this month)\b/i;
const pastWindow=/\b(?:past|last|previous)\s+(?:\d+|\w+)\s+years?\b|\b(?:past|last|previous)\s+decade\b/i;
const limits=[
 'This is NYC regional outdoor climate context from NPCC4 (2024), not a forecast for one building, a particular calendar year or the exact requested holding period.',
 'Published decade labels are centered 30-year climate time slices. No interpolation, annual trajectory or total for the requested years is calculated. The 2100 entry uses the report’s separate end-century method.',
 'Pooled 25th–75th percentiles combine models and two emissions pathways. They are not a calibrated probability, confidence interval or scenario-specific forecast.',
 'The reference is 1981–2010. Do not present the temperature change as additional warming from today or add it to the separate 1991–2020 station summary.',
 'Outdoor heat, degree days and annual energy intensity do not establish refrigeration load, available electrical capacity, indoor temperature, equipment size, energy cost or investment return.',
 'Daily heavy-rain frequencies are not hourly design rainfall, building flood depth, access reliability, damage or insurance risk. Regional climate alone cannot rank two buildings.',
];
const nextInvestigation='Are you evaluating an existing cold-storage operation, or converting this building? That determines whether the next evidence is documented plant performance or a refrigeration and electrical design assessment.';

function anchor(now:Date):{date:string;year:number}|null{
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(key:string)=>parts.find(p=>p.type===key)?.value;
 const year=Number(part('year'));return Number.isInteger(year)?{date:`${part('year')}-${part('month')}-${part('day')}`,year}:null;
}
function horizonFor(end:number):Horizon|null{
 if(end>2100)return null;
 if(end<2040)return'2030s';
 const label=`${Math.floor(end/10)*10}s` as Horizon;
 return horizons.includes(label)?label:end===2100?'2100':null;
}
function temporalText(text:string):string{
 // Publication/construction years are source metadata, not a user horizon.
 return text.replace(/\bNPCC4(?:\s+(?:report|assessment))?\s*\(?2024\)?|\b2024\s+NPCC4(?:\s+(?:report|assessment))?|\bpublished\s+in\s+2024\b/gi,'')
  .replace(/\b(?:built|constructed|construction year|year built)\s*(?:in\s*)?\d{4}\b/gi,'')
  .replace(/\b(?:baseline|reference period)\s*(?:of\s*)?1981\s*[–—-]\s*2010\b/gi,'')
  .replace(/[$£€]\s*\d[\d,.]*/g,'')
  .replace(/\b\d[\d,.]*(?:\s*[–—-]\s*\d[\d,.]*)?\s*(?:square\s+(?:feet|foot|metres?|meters?)|sq\.?\s*(?:ft|feet|m)|ft²|m²|sqft|sqm|kwh?|mw|watts?|feet|ft|metres?|meters?|dollars?)\b/gi,'');
}
function empty(window:PlanningContext['planningWindow']):PlanningContext{
 return{kind:'planning_context',status:'unsupported',planningWindow:window,facts:[],citations:[],limitations:limits,nextInvestigation:'Clarify the intended planning period in ordinary dates or years. Do not substitute an older conversation horizon for the latest explicit request.',groundingNote:'No quantitative climate evidence was selected for this unsupported or conflicting time request.'};
}

/** Server-owned planning evidence. The model cannot supply dates, thresholds,
 * projections or URLs. Relative timing is interpreted openly; it is never
 * mislabelled as an exact user selection of a dataset or a calendar-year forecast.
 */
export function readPlanningContext(userTexts:string[],now:Date=new Date()):PlanningContext{
 const today=anchor(now);
 const window:PlanningContext['planningWindow']={origin:'application_default',quote:null,anchorDate:today?.date??null,requestedStartYear:null,requestedEndYear:null,publishedHorizon:null,interpretation:''};
 if(!today)return empty({...window,origin:'unsupported_explicit_time',interpretation:'The request date could not be established. No relative period was inferred.'});
 // Inputs are latest-first. Stop at the first explicit time request, including
 // unsupported choices; never fall through to a convenient older selection.
 for(const original of Array.isArray(userTexts)?userTexts:[]){
  if(typeof original!=='string'||!original.trim())continue;
  const text=temporalText(original),relative=[...text.matchAll(relativePattern)];
  const years=[...text.matchAll(/\b(\d{4})(s)?\b/gi)];
  const explicit=years.map(m=>({year:Number(m[1]),horizon:m[2]?`${m[1]}s`:m[1]}));
  const unsupported=(interpretation:string)=>empty({...window,origin:'unsupported_explicit_time',quote:original.slice(0,1200),interpretation});
  if(shortTerm.test(text))return unsupported('A current or short-term weather request is not answered by regional climate projections.');
  if(pastWindow.test(text))return unsupported('A historical time window is not answered by this future-planning context.');
  if(relative.length){
   const durations=relative.map(m=>{const q=(m[1]||m[2]||m[3]||'ten').toLowerCase();return words[q]??Number(q);});
   if(new Set(durations).size!==1||durations.some(n=>!Number.isInteger(n)||n<1||n>100))return unsupported('The relative planning duration is unsupported or contains conflicting periods.');
   const end=today.year+durations[0],horizon=horizonFor(end);
   if(!horizon)return unsupported(`The requested period is ${today.year}–${end}; this snapshot has no matching published planning horizon. No interpolation or substitute from older history was used.`);
   if(explicit.some(item=>item.horizon!==horizon&&!(!item.horizon.endsWith('s')&&[today.year,end].includes(item.year))))return unsupported('The relative period and explicit calendar years or published horizons conflict. Clarify the intended period without choosing a dataset.');
   Object.assign(window,{origin:'relative_user_window',quote:original.slice(0,1200),requestedStartYear:today.year,requestedEndYear:end,publishedHorizon:horizon,interpretation:`Using ${today.date} in America/New_York, the requested ${durations[0]}-year planning window is ${today.year}–${end}. The application selected the published ${horizon} regional context${end<2030?' as the nearest available near-term context':''}; it is not a forecast for ${end} or an average over exactly this requested window.`});
   break;
  }
  if(explicit.length){
   const chosen=[...new Set(explicit.map(item=>item.horizon))];
   if(chosen.length!==1||!horizons.includes(chosen[0] as Horizon))return unsupported(`The latest explicit time request (${chosen.join(', ')}) has no single matching published horizon here. A calendar-year forecast or unpublished interval cannot be inferred. No older horizon was reused.`);
   Object.assign(window,{origin:'explicit_published_horizon',quote:original.slice(0,1200),publishedHorizon:chosen[0],interpretation:`The user named the published ${chosen[0]} context. This is a climate time slice, not a prediction for one calendar year.`});
   break;
  }
 }
 if(!window.publishedHorizon){
  const horizon=horizonFor(today.year);
  if(!horizon)return empty({...window,origin:'unsupported_explicit_time',interpretation:'No current near-term planning context is available in this preserved snapshot.'});
  Object.assign(window,{publishedHorizon:horizon,interpretation:`No planning period was stated. The application selected the published ${horizon} near-term regional context as a disclosed default; the user did not explicitly choose this dataset or period.`});
 }
 const horizon=window.publishedHorizon!,annual=projection.annual.find(row=>row.horizon===horizon)!;
 const provenance=projection.provenance,baselineYears=[...projection.baseline_years];
 const citations:PlanningCitation[]=[],facts:PlanningContext['facts']=[];
 function add(measurement:string,label:string,unit:string,value:Range,extreme=false,baselineValue?:number){
  const citation:PlanningCitation={evidenceId:`npcc4:${horizon}:${measurement}`,source:{url:extreme?provenance.extremes:provenance.temperature_precipitation,dataset:'NPCC4 (2024)',label:'NYC Panel on Climate Change regional projections',paper:provenance.paper,retrievalMode:'compiled-source-snapshot',retrievedOn:provenance.retrieved_on,sourceRowsUpdatedAt:extreme?provenance.source_rows_updated_at.extremes:provenance.source_rows_updated_at.temperature_precipitation,rawSha256:{...provenance.raw_sha256}},measurement,scope:'NYC_region',unit,value,baseline:{years:baselineYears,...(baselineValue===undefined?{}:{value:baselineValue,unit}),scope:extreme?'Published NYC regional reference':'Central Park reference for published regional changes'}};
  citations.push(citation);facts.push({...citation,label});
 }
 add('temperature_change_c','Mean annual temperature change','°C change',{...annual.temperature_change_c});
 const extremes=projection.extremes.filter(row=>row.horizon===horizon);
 if(extremes.length){
  for(const metric of [
   {key:'hot_days_ge90f_per_year',label:'Days per year with maximum temperature at least 90°F',unit:'days/year'},
   {key:'heatwaves_per_year',label:'Heatwaves of at least three consecutive days with daily maximum temperature at or above 90°F',unit:'events/year'},
   {key:'rain_days_ge2inch_per_year',label:'Days per year with precipitation at least 2 inches',unit:'days/year'},
  ] as const){
   const value=Object.fromEntries([10,25,75,90].map(p=>[`p${p}`,extremes.find(row=>row.percentile===p)![metric.key]])) as Range;
   add(metric.key,metric.label,metric.unit,value,true,projection.baseline_extremes[metric.key]);
  }
 }else add('precipitation_change_pct','Mean annual precipitation change','% change',{...annual.precipitation_change_pct});
 const coldStorage=userTexts.some(text=>typeof text==='string'&&/\bcold[-\s]?(?:storage|store)|\bfreez|\bfrozen|\bchilled|\brefrigerat/i.test(text));
 return{kind:'planning_context',status:'available',planningWindow:window,facts,citations,limitations:[...limits,...(!extremes.length?['No extreme-event table is published for this selected horizon in the snapshot; no hot-day or heatwave values were interpolated.']:[])],nextInvestigation:coldStorage?nextInvestigation:'Which operating conditions must this place maintain, and what documented building or equipment performance is available to check them?',groundingNote:'Facts and citations are read from the audited compiled NPCC4 snapshot. The application-selected time context is disclosed separately from the user’s words. This supplies evidence for a conversational planning answer; it does not establish investment merit or cold-storage operating fit.'};
}

export const planningContextTool={type:'function',function:{name:'read_planning_context',description:'Retrieve compact server-owned NYC regional climate context for a broad planning question. Derives relative periods such as next ten years from the current New York date, explains the corresponding published context, and preserves unsupported latest explicit years. Does not require the user to choose a dataset. Returns quantitative evidence with baseline, model/scenario ranges and citations for a conversational answer; does not finish the turn. Does not predict a building temperature, refrigeration load, electrical capacity, costs, return or overall suitability. No arguments.',parameters:{type:'object',properties:{},additionalProperties:false}}};

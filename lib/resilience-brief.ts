import type {CityBuilding} from './city';
import type {SiteContext} from './site-context';
import type {PlanningContext} from './planning-context';
import type {SiteVisualEvidence} from './site-segmentation';
import {buildCandidateEvidence} from './decision-plan';

export type ResilienceFocus='comparison'|'prioritize_checks'|'owner_documents';
export type ResilienceIntent={focus:ResilienceFocus;purpose:'cold_storage'|'general'};
export type ResilienceCitation={evidenceId:string;source:{url?:string;label:string;[key:string]:unknown};measurement:string;scope:string;unit:string;value:unknown};
export type ResilienceObservation={id:string;label:string;scope:string;note:string;values:{buildingId:string;status:'recorded'|'unknown';text:string;evidenceIds:string[]}[]};
export type ResilienceCheck={id:string;title:string;action:string;whyItMatters:string;whatCouldChange:string;buildingIds:string[];evidenceIds:string[]};
export type ResilienceBrief={
 kind:'resilience_brief';responseOrigin:'source-based-rules';modelGenerated:false;focus:ResilienceFocus;
 answer:string;places:{id:string;address:string}[];observations:ResilienceObservation[];
 conditionalTradeoffs:{text:string;evidenceIds:string[]}[];nextChecks:ResilienceCheck[];
 planningContext:PlanningContext|null;limitations:string[];citations:ResilienceCitation[];groundingNote:string;
};

// This is a deliberately narrow application-command recognizer, not a content
// moderation classifier. Only these ordinary comparison/diligence questions
// may invoke a fixed public-record brief after a provider refusal. Unknown
// topics and instructions do not inherit eligibility from older conversation.
const vocabulary=new Set(`a about across adaptation adapt am and are as ask at available be because before best better between both building buildings by can change changes changing check checks choice choose chosen climate cold compare comparing comparison compliance conditions consider considering could current data decision describe differences different diligence do does each electrical else energy entrance entrances equipment evaluate evaluating evidence explain exposure facts first flood flooding following for from further future general give goal ground has have heat help how i im if impact in information inspect inspection insulation into invest investing investment investments is it its know large larger less let lets location locations look map mapped me mean missing more most much my need needs next nyc of on one operating operation operations or other our outdoor over owner owners plan planning plans please power premises property properties public question rainfall records refrigeration region relevant request requests require required requirements resilience resilient results result retrofit retrofitting return review risk risks roof roofs safe safety same selected should show site sites size smaller source sources space storage stormwater such tell temperature than that the their them then there these they thing things this those through time to tradeoff tradeoffs two understand us use usable using verify warming we well what when whether which why will with within without would year years decade decades decades yes you your ahead priority prioritize prioritise priorities document documents documentation package period horizon capacity purchase purchasing buying buy suitability suitable assess assessment next step steps`.split(/\s+/));
function boundedQuestion(text:string):string|null{
 if(typeof text!=='string'||!text.trim()||text.length>2000)return null;
 const plain=text.toLowerCase().replace(/[’']/g,'').replace(/[–—-]/g,' ').replace(/[.,?!:;()]/g,' ').replace(/\s+/g,' ').trim();
 if(!/^[a-z0-9\s]+$/.test(plain))return null;
 if(plain.split(' ').some(word=>!vocabulary.has(word)&&!/^\d{1,4}s?$/.test(word)))return null;
 return plain;
}
function isGoal(text:string):boolean{
 return /\b(?:climate|resilience|resilient|flood|flooding|stormwater|heat|cold storage|retrofit|retrofitting)\b/.test(text)&&/\b(?:compar\w*|selected|two|both|between|investment|invest|diligence|retrofit|retrofitting|check|checks|which|best)\b/.test(text);
}
export function resilienceIntent(userTexts:readonly string[]):ResilienceIntent|null{
 const current=boundedQuestion(userTexts[0]);if(!current)return null;
 if(/\b(?:nyc|citywide|city)\b/.test(current)&&!/\b(?:selected|two|both|between)\b/.test(current))return null;
 const prior=userTexts.slice(1,17).map(boundedQuestion).filter((text):text is string=>text!==null);
 const goal=isGoal(current)?current:prior.find(isGoal);
 if(!goal)return null;
 const owner=/\b(?:owner|owners)\b/.test(current)&&/\b(?:request|ask|document|documents|documentation|need|from)\b/.test(current);
 const next=/\b(?:check|checks|next|first|priorit\w*|choice|decision|result|results)\b/.test(current)&&/\b(?:what|which|how|should|could|would|next)\b/.test(current);
 const continuation=/^(?:and )?(?:what|which|how|should|can|could|would)\b/.test(current)&&/\b(?:buildings|places|these|those|them|both|two|selected|next|owner|owners|checks|check|choice)\b/.test(current);
 const timeOnly=/^(?:the )?(?:next|coming|following) \d{1,2} years?$/.test(current);
 if(!isGoal(current)&&!continuation&&!timeOnly)return null;
 const explicitPurpose=[current,...prior].find(text=>/\bcold storage|\brefrigerat|\bgeneral\b/.test(text));
 return{focus:owner?'owner_documents':next&&!timeOnly&&!isGoal(current)?'prioritize_checks':'comparison',purpose:explicitPurpose&&!/\bgeneral\b/.test(explicitPurpose)&&/\bcold storage|\brefrigerat/.test(explicitPurpose)?'cold_storage':'general'};
}

const fmt=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const positive=(value:unknown)=>finite(value)&&value>0?value:null;
const label=(building:CityBuilding)=>`${String(building.address||'Selected building').slice(0,300)} (DOITT ${building.id})`;
const currentSource='https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Moderate_Flood_Map_Current_Sea_Levels/FeatureServer/0';
const futureSource='https://services.arcgis.com/at3rDjch5X7i9Bag/ArcGIS/rest/services/Moderate_Flood_SLR_2050/FeatureServer';
const noHit='No intersection with mapped categories at this point; safety is not established';
const categories=new Set(['Modeled deep flooding: ≥1 ft','Modeled nuisance flooding: ≥4 in and <1 ft',noHit]);
const pointLimit='An interior reference-point lookup is not building exposure. DEP models buildings as voids; a blank or unmatched point cannot establish safety. Verify surrounding ground, entrances and equipment separately.';
const unavailable='Unknown — source unavailable or response incomplete';

/** Deterministic, scope-preserving observations and investigation prompts.
 * Inputs must be freshly resolved by the server; this function neither fetches
 * data nor accepts model findings, thresholds, scores or a winning candidate.
 */
export function buildResilienceBrief(input:{buildings:readonly CityBuilding[];contexts:Record<string,SiteContext|undefined>;planningContext:PlanningContext|null;intent:ResilienceIntent;visualEvidence?:readonly SiteVisualEvidence[]}):ResilienceBrief|null{
 const {buildings,contexts,planningContext,intent}=input;
 if(buildings.length!==2||new Set(buildings.map(b=>b.id)).size!==2||buildings.some(b=>!b||!/^[1-9]\d{0,9}$/.test(b.id)||b.entity_type==='parcel'||b.geometry_quality==='invalid_or_placeholder'||b.feature_code===1003||!['Polygon','MultiPolygon'].includes(b.geometry?.type)))return null;
 const ids=buildings.map(b=>b.id),places=buildings.map(b=>({id:b.id,address:String(b.address||'Selected building').slice(0,300)}));
 const citations:ResilienceCitation[]=[],observations:ResilienceObservation[]=[],conditionalTradeoffs:ResilienceBrief['conditionalTradeoffs']=[];
 const facts=new Map(buildings.map(b=>[b.id,buildCandidateEvidence(b,contexts[b.id]?.id===b.id?contexts[b.id]:undefined).facts]));
 function recorded(key:string,labelText:string,scope:string,unit:string,note:string){
  const values=buildings.map(b=>{const f=facts.get(b.id)?.find(f=>f.key===key),v=f?.value;const valid=Array.isArray(v)?v.length>0:finite(v)&&v>0;
   if(!f||!valid)return{buildingId:b.id,status:'unknown' as const,text:'Unknown',evidenceIds:[]};
   citations.push({evidenceId:f.id,source:f.source,measurement:key,scope:f.scope,unit:f.unit,value:v});
   return{buildingId:b.id,status:'recorded' as const,text:Array.isArray(v)?v.join(', '):`${fmt.format(v as number)} ${unit}`,evidenceIds:[f.id]};});
  observations.push({id:key,label:labelText,scope,note,values});
 }
 recorded('footprint_area_sqft','Mapped footprint','building_footprint','ft²','Mapped outline area is not usable interior floor area.');
 recorded('roof_height_ft','Recorded roof height','building','ft','Roof height is not interior clear height or equipment capacity.');
 recorded('lot_building_area_sqft','Floor area across the tax lot','parcel','ft²','Includes the whole linked tax lot; it may include multiple buildings.');
 recorded('zoning','Recorded zoning','parcel','','Recorded districts do not establish permission for a proposed use.');
 const contextIds:string[]=[],positivePointIds:string[]=[],missingPointIds:string[]=[];
 function contextRow(id:string,labelText:string,source:string,measurement:string,note:string,read:(c:SiteContext)=>{text:string;value:unknown;positive?:boolean}|null){
  const values=buildings.map(b=>{const c=contexts[b.id];const value=c?.id===b.id?read(c):null;
   if(!value){if(id==='stormwater_current'||id==='stormwater_2050')missingPointIds.push(b.id);return{buildingId:b.id,status:'unknown' as const,text:unavailable,evidenceIds:[]};}
   const evidenceId=`${b.id}:resilience:${id}`;contextIds.push(evidenceId);if(value.positive)positivePointIds.push(b.id);
   citations.push({evidenceId,source:{url:source,label:labelText,recordId:b.id,retrievedAt:c!.retrieved_at},measurement,scope:'representative_point',unit:'source_category',value:value.value});
   return{buildingId:b.id,status:'recorded' as const,text:value.text,evidenceIds:[evidenceId]};});
  observations.push({id,label:labelText,scope:'representative_point',note,values});
 }
 contextRow('stormwater_current','DEP rainfall scenario · current sea levels',currentSource,'stormwater_current_point',`2.13 inches in one hour. ${pointLimit}`,c=>{
  if(c.stormwater?.status!=='available')return null;const v=c.stormwater.value,s=v?.current?.category;
  return categories.has(s)?{text:s,value:{category:s,rainfall:v.rainfall,spatial_test:v.spatial_test,coverage:v.current.coverage,queries_succeeded:v.queries_succeeded,queries_total:v.queries_total},positive:s!==noHit}:null;
 });
 contextRow('stormwater_2050','DEP rainfall scenario · 2050 sea levels',futureSource,'stormwater_2050_point',`Same 2.13-inch rainfall event with +30 inches sea level. It is a separate scenario, not a measured risk change. ${pointLimit}`,c=>{
  if(c.stormwater?.status!=='available')return null;const v=c.stormwater.value,f=v?.future_2050;
  if(!f||typeof f!=='object')return null;
  const rain=f.excluded_area===true?'Excluded from model analysis':f.excluded_area===false&&categories.has(f.category)?f.category:'Rainfall category unknown: incomplete coverage/query';
  const tide=f.high_tide_separate===true?'separate high-tide category intersects':f.high_tide_separate===false?'no separate high-tide intersection':'separate high-tide result unknown';
  const water=f.wetland_or_waterbody===true?'wetland/waterbody layer intersects':f.wetland_or_waterbody===false?'no wetland/waterbody intersection':'wetland/waterbody result unknown';
  return{text:`${rain}; ${tide}; ${water}`,value:{...f,rainfall:v.rainfall,spatial_test:v.spatial_test,queries_succeeded:v.queries_succeeded,queries_total:v.queries_total},positive:f.high_tide_separate===true||(f.excluded_area===false&&categories.has(f.category)&&f.category!==noHit)};
 });
 contextRow('historical_coastal','Historical coastal planning map · 2050s','https://data.cityofnewyork.us/d/27ya-gqtm','historical_coastal_point','NPCC2013 high90 +31-inch scenario, 2050–2059. Illustrative historical point membership; not a current forecast or property-specific risk judgment.',c=>{
  const f=c.future_flood;if(f?.status!=='available'||typeof f.value?.inside!=='boolean')return null;
  return{text:f.value.inside?'Reference point intersects the historical scenario':'No point intersection; safety is not established',value:f.value,positive:f.value.inside};
 });
 contextRow('evacuation','Hurricane evacuation zone','https://data.cityofnewyork.us/d/epne-qv9x','evacuation_zone','Emergency-planning designation, not flood depth, probability or building safety.',c=>{
  const f=c.evacuation;if(f?.status!=='available'||!Array.isArray(f.value?.zones)||!f.value.zones.every((x:unknown)=>/^[1-6]$/.test(String(x))))return null;
  const zones=[...new Set(f.value.zones.map(String))];return{text:zones.length?`Zone ${zones.join(', ')}`:'No zone intersection; safety is not established',value:zones};
 });
 const areas=buildings.map(b=>positive(b.footprint_area_sqft));
 if(areas.every((v):v is number=>v!==null)){
  const [a,b]=areas as number[],delta=Math.abs(a-b),larger=buildings[a>=b?0:1];
  conditionalTradeoffs.push({text:delta?`${label(larger)} has ${fmt.format(delta)} ft² more mapped footprint. If usable storage area is decisive, verify internal layout and clear height before treating that difference as an advantage.`:'The mapped footprint areas are equal. Interior layout and clear height could still distinguish the two buildings.',evidenceIds:citations.filter(c=>c.measurement==='footprint_area_sqft').map(c=>c.evidenceId)});
 }else conditionalTradeoffs.push({text:'A complete mapped-footprint comparison is unavailable. Neither missing geometry nor tax-lot floor area can substitute for usable space.',evidenceIds:[]});
 if(buildings[0].bbl&&buildings[0].bbl===buildings[1].bbl)conditionalTradeoffs.push({text:`Both buildings link to tax lot ${buildings[0].bbl}. Their recorded lot floor areas describe that same lot and must not be added or assigned independently to each building.`,evidenceIds:citations.filter(c=>c.measurement==='lot_building_area_sqft').map(c=>c.evidenceId)});
 conditionalTradeoffs.push({text:'Regional climate projections apply to both places. These point samples, zoning records and physical dimensions do not establish which building is more resilient or the better investment.',evidenceIds:contextIds});
 const checks:ResilienceCheck[]=[];
 const positiveIds=[...new Set(positivePointIds)];
 const water:ResilienceCheck={id:'entrances_and_equipment',title:positiveIds.length?'Verify the mapped-water observation at entrances':'Establish exposure around the entrances',action:'Request a current entrance/loading plan and surveyed finished-floor and critical-equipment elevations; have a qualified reviewer relate them to modeled surrounding ground and the applicable scenario/datum.',whyItMatters:positiveIds.length?'At least one reference point intersects a mapped water category or historical coastal scenario. That flags a focused investigation, not actual building flooding.':missingPointIds.length?'Some point-source results are unavailable. Other no-hit samples cannot fill those gaps, and DEP buildings are modeled as voids.':'A no-hit or excluded interior point is not a favorable finding. DEP models buildings as voids, so this lookup cannot settle exposure at doors, loading areas or equipment.',whatCouldChange:'Verified exposure at an essential entrance or equipment location, and the feasibility of protecting or relocating it, could change which site warrants further work.',buildingIds:positiveIds.length?positiveIds:ids,evidenceIds:contextIds.filter(id=>!id.endsWith(':evacuation'))};
 const operation:ResilienceCheck={id:'operating_conditions',title:intent.purpose==='cold_storage'?'Confirm refrigeration and power requirements':'Confirm required operating performance',action:intent.purpose==='cold_storage'?'Request the refrigeration design basis, temperature requirements, verified electrical service capacity and backup-power documentation; for an existing operation, also request maintenance and temperature/outage records.':'Request the intended indoor operating conditions, documented electrical/HVAC capacity, maintenance records and backup-power arrangements.',whyItMatters:'Outdoor regional projections do not reveal the building envelope, installed equipment capacity or performance during an outage.',whatCouldChange:'Documented capacity that cannot meet the intended conditions, or a substantial unassessed retrofit, could change the choice; neither site passes this check yet.',buildingIds:ids,evidenceIds:planningContext?.citations.map(c=>c.evidenceId)??[]};
 if(positiveIds.length)checks.push(water,operation);else checks.push(operation,water);
 const visual=input.visualEvidence?.find(v=>ids.includes(v.buildingId)&&v.crosscheck?.status==='compared'&&((v.crosscheck.counts.mapOnlyCells??0)>0||(v.crosscheck.counts.roofOnlyCells??0)>0));
 if(visual){
  citations.push({evidenceId:visual.id,source:visual.source,measurement:'footprint_image_representation_crosscheck',scope:'image_crop',unit:'grid_cells',value:{grid:visual.crosscheck!.grid,counts:visual.crosscheck!.counts,footprintCoveredByRoofPct:visual.crosscheck!.footprintCoveredByRoofPct}});
  checks.push({id:'reconcile_roof_plan',title:'Reconcile the roof plan and dated imagery',action:'Request a current roof plan and a site inspection to reconcile the official outline with the target-intersecting SAM roof representation before considering equipment placement.',whyItMatters:'This turn’s image crosscheck contains disagreement between mapped and image-derived regions. Dates, alignment, occlusion, shared roofs and model error can explain it.',whatCouldChange:'A verified current layout could alter the area available for investigation; the disagreement is not evidence of a defect, building change, usable area or structural capacity.',buildingIds:[visual.buildingId],evidenceIds:[visual.id]});
 }else checks.push({id:'usable_layout',title:'Verify usable layout and proposed-use review',action:'Request current floor plans, measured clear heights and relevant use/alteration documents. Confirm available space and seek the applicable professional review for the proposed activity.',whyItMatters:'Mapped footprint and whole-lot floor area describe different things; recorded zoning does not establish permission.',whatCouldChange:'A layout, availability or permission constraint could outweigh the mapped size difference.',buildingIds:ids,evidenceIds:citations.filter(c=>['footprint_area_sqft','lot_building_area_sqft','roof_height_ft','zoning'].includes(c.measurement)).map(c=>c.evidenceId)});
 for(const citation of planningContext?.citations??[])citations.push(citation as ResilienceCitation);
 const warming=planningContext?.status==='available'?planningContext.facts.find(f=>f.measurement==='temperature_change_c'):undefined;
 const regionalRange=warming&&finite(warming.value.p25)&&finite(warming.value.p75)&&warming.value.p25<=warming.value.p75
  ?` Published regional warming is ${fmt.format(warming.value.p25)}–${fmt.format(warming.value.p75)} °C relative to ${warming.baseline.years.join('–')} (pooled 25th–75th percentiles across models and emissions pathways).`:'';
 const climate=planningContext?.status==='available'?planningContext.planningWindow.interpretation+regionalRange:'A quantitative regional planning window could not be selected. No projection or substitute period was invented.';
 const first=checks[0];let answer:string;
 if(intent.focus==='owner_documents')answer=`For ${label(buildings[0])} and ${label(buildings[1])}, start the owner request with the documents needed for “${first.title}.” ${first.action} Ask for dates, the part of the property each document covers, and who prepared it. Treat an absent document as an unresolved question, not a failed or passing site. ${first.whatCouldChange}`;
 else if(intent.focus==='prioritize_checks')answer=`For ${label(buildings[0])} and ${label(buildings[1])}, first: ${first.title.toLowerCase()}. ${first.whyItMatters} ${first.whatCouldChange} This prioritizes the investigation, not the buildings.`;
 else answer=`Compare ${label(buildings[0])} with ${label(buildings[1])}. ${conditionalTradeoffs[0].text}\n\n${climate} That regional context is shared; it cannot rank these buildings. First, ${first.title.toLowerCase()}. ${first.whatCouldChange}`;
 return{kind:'resilience_brief',responseOrigin:'source-based-rules',modelGenerated:false,focus:intent.focus,answer,places,observations,conditionalTradeoffs,nextChecks:checks,planningContext,limitations:[pointLimit,'No resilience score, investment winner, return estimate or permission decision is computed. Ground elevation alone does not rank flood exposure.','Public attributes do not establish usable area, electrical/refrigeration capacity, availability, adaptation performance or financial value.',...(planningContext?.status==='unsupported'?[planningContext.planningWindow.interpretation]:[])],citations,groundingNote:'This public-data comparison is assembled by fixed application rules from this request’s official records and published regional context. It is not a Meta-generated answer, verified building safety finding or applied plan.'};
}

export const resilienceComparisonTool={type:'function',function:{name:'compare_resilience',description:'Read a deterministic climate-resilience diligence brief for exactly two selected or this-turn retrieved native buildings. Uses official records, dated point context and shared regional planning evidence. Returns scoped conditional tradeoffs and decision-changing checks, with no risk score, winner or financial advice. This is a nonterminal tool: explain the returned evidence naturally. No model findings, thresholds or URLs accepted.',parameters:{type:'object',properties:{ids:{type:'array',items:{type:'string'},minItems:2,maxItems:2}},required:['ids'],additionalProperties:false}}};

import type {CityBuilding} from './city';
import type {EvidenceSource,QuestionPlan} from './decision-plan';

export type BuildingDescriptionCitation={
 evidenceId:string;source:EvidenceSource;measurement:'construction_year';
 scope:'building';unit:'year';value:number;
};
export type BuildingDescription={
 answer:string;candidateAnswers:Record<string,string>;citations:BuildingDescriptionCitation[];
};
const numberFormat=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const positive=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
const year=(value:unknown):number|null=>typeof value==='number'&&Number.isInteger(value)&&value>=1000&&value<=9999?value:null;
const amount=(value:number)=>value<.005?'less than 0.01':numberFormat.format(value);
const measured=(value:number|null,unit:string)=>value===null?'unknown':`${amount(value)} ${unit}`;
const lotId=(building:CityBuilding)=>typeof building.bbl==='string'&&/^[1-5]\d{9}$/.test(building.bbl)?building.bbl:null;
const label=(building:CityBuilding)=>`${building.address?.trim()||'Building'} (DOITT ${building.id})`;
const footprint=(building:CityBuilding)=>building.geometry_quality==='invalid_or_placeholder'||building.feature_code===1003?null:positive(building.footprint_area_sqft);
const LIMITS='Mapped footprint is not usable interior floor area; roof height is not interior clear height. Electrical capacity, availability and permission for a proposed use remain unknown from these records.';

function physicalSummary(building:CityBuilding):string{
 const bbl=lotId(building),built=year(building.construction_year);
 const zoning=bbl&&Array.isArray(building.zoning)?[...new Set(building.zoning.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))]:[];
 return `${label(building)}: mapped footprint ${measured(footprint(building),'ft²')}; recorded roof height ${measured(positive(building.roof_height_ft),'ft')}; recorded year built ${built??'unknown'}. `+
  `Linked tax lot BBL ${bbl??'unknown'}: recorded floor area across the whole lot ${measured(bbl?positive(building.lot_building_area_sqft):null,'ft²')}; recorded lot zoning ${zoning.length?zoning.join(', '):'unknown'}.`;
}
function difference(a:CityBuilding,b:CityBuilding,key:'footprint_area_sqft'|'roof_height_ft'):string|null{
 const x=key==='footprint_area_sqft'?footprint(a):positive(a.roof_height_ft);
 const y=key==='footprint_area_sqft'?footprint(b):positive(b.roof_height_ft);
 if(x===null||y===null)return null;
 if(x===y)return key==='footprint_area_sqft'?'The two records have the same mapped footprint area.':'The two records have the same recorded roof height.';
 const larger=x>y?a:b,smaller=x>y?b:a;
 return key==='footprint_area_sqft'
  ?`${label(larger)} has ${amount(Math.abs(x-y))} ft² more mapped footprint than ${label(smaller)}.`
  :`${label(larger)} has a recorded roof height ${amount(Math.abs(x-y))} ft higher than ${label(smaller)}.`;
}
function sharedLotNotes(buildings:readonly CityBuilding[]):string[]{
 const groups=new Map<string,CityBuilding[]>();
 for(const building of buildings){const bbl=lotId(building);if(bbl)groups.set(bbl,[...(groups.get(bbl)||[]),building]);}
 return [...groups].filter(([,group])=>group.length>1).map(([bbl,group])=>{
  const areas=group.map(b=>positive(b.lot_building_area_sqft)).filter((value):value is number=>value!==null);
  return `DOITT ${group.map(b=>b.id).join(' and ')} share BBL ${bbl}. Their lot-level floor areas refer to the same tax lot; they are not independent building areas and must not be added.`+
   (new Set(areas).size>1?' The linked floor-area values disagree and need source verification.':'');
 });
}

/** Deterministic description of authoritative records already retrieved by the
 * application. This is deliberately separate from the requirement evaluator:
 * no thresholds, model-written facts, inferred capacity or suitability ranking.
 * Parcel requests and nonempty plans keep their existing evaluation path.
 */
export function describeBuildings(buildings:readonly CityBuilding[],plan:Pick<QuestionPlan,'intent'|'requirements'>):BuildingDescription|null{
 if(!Array.isArray(plan.requirements)||plan.requirements.length!==0||!['understand','compare'].includes(plan.intent))return null;
 if(!Array.isArray(buildings)||(plan.intent==='understand'?buildings.length!==1:buildings.length<2||buildings.length>4))return null;
 if(buildings.some(b=>!b||typeof b.id!=='string'||!b.id||b.entity_type==='parcel'||b.id.startsWith('p:'))||new Set(buildings.map(b=>b.id)).size!==buildings.length)return null;
 const summaries=buildings.map(physicalSummary),shared=sharedLotNotes(buildings);
 const candidateAnswers=Object.fromEntries(buildings.map((b,i)=>[b.id,`${summaries[i]} ${LIMITS}`]));
 const comparisons=buildings.length===2?[difference(buildings[0],buildings[1],'footprint_area_sqft'),difference(buildings[0],buildings[1],'roof_height_ft')].filter(Boolean):[];
 const citations:BuildingDescriptionCitation[]=buildings.flatMap(building=>{
  const value=year(building.construction_year);if(value===null)return [];
  return[{evidenceId:`${building.id}:construction_year`,source:{id:'nyc-footprints',label:'NYC Building Footprints',url:building.source,recordId:building.id,...(building.retrieval?.retrieved_at?{retrievedAt:building.retrieval.retrieved_at}:{})},measurement:'construction_year' as const,scope:'building' as const,unit:'year' as const,value}];
 });
 return{answer:buildings.length===1?candidateAnswers[buildings[0].id]:[...summaries,...comparisons,...shared,LIMITS].join('\n\n'),candidateAnswers,citations};
}

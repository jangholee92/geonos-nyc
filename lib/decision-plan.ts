import type {CityBuilding,CityQuery} from './city';
import type {SiteContext} from './site-context';

/** A requirement engine, not a suitability score or a permission decision.
 * Every predicate names its measurement and spatial unit. Missing evidence is
 * neither a passing condition nor a failing condition. Purpose adds suggested
 * questions only; it never silently adds requirements or thresholds.
 */
export type FactUnit = 'sqft' | 'ft' | 'm' | 'kW' | 'psf' | 'count' | 'code' | 'boolean' | 'percent' | 'kBtu/sqft/year';
export type FactScope = 'building' | 'building_footprint' | 'parcel' | 'representative_point' | 'operational' | 'benchmark_property';
export type Operator = 'gte' | 'lte' | 'eq' | 'in';
export type FactValue = number | boolean | string[];
type Definition = {
 label:string; unit:FactUnit; scope:FactScope; type:'number'|'boolean'|'codes';
 use:'recorded'|'operational'|'professional_review'|'context_only';
 note:string; question:string; qualifiers?:'scenario'|'year'; min?:number; max?:number; integer?:boolean;
};
export const FACTS = {
 footprint_area_sqft:{label:'Mapped building footprint area',unit:'sqft',scope:'building_footprint',type:'number',use:'recorded',min:0,note:'A spherical-area approximation from the mapped outline. Projected-area calculations can differ. It is not usable floor area or the sum of all floors.',question:'What mapped footprint area do you need?'},
 lot_building_area_sqft:{label:'Recorded floor area across the tax lot',unit:'sqft',scope:'parcel',type:'number',use:'recorded',min:0,note:'PLUTO floor area covers the tax lot and may include several buildings. It is not verified usable or available space.',question:'What total recorded floor area on the tax lot do you need?'},
 lot_area_sqft:{label:'Recorded tax-lot area',unit:'sqft',scope:'parcel',type:'number',use:'recorded',min:0,note:'The tax-lot area does not establish buildable area, site access or development permission.',question:'What tax-lot area do you need?'},
 roof_height_ft:{label:'Recorded roof height',unit:'ft',scope:'building',type:'number',use:'recorded',min:0,note:'Roof height is not interior clear height.',question:'What recorded roof height matters for this screen?'},
 zoning:{label:'Recorded zoning district',unit:'code',scope:'parcel',type:'codes',use:'recorded',note:'A recorded district is a starting point for review. It does not determine whether a proposed use or project is permitted.',question:'Which recorded zoning districts should this screen include?'},
 truck_route_distance_m:{label:'Reference-point distance to a recorded truck route',unit:'m',scope:'representative_point',type:'number',use:'recorded',min:0,note:'Approximate straight-line distance in the retrieved route dataset. It is not entrance distance, legal access, travel time or a current route-compliance determination.',question:'How far from a recorded route may the reference point be?'},
 usable_area_sqft:{label:'Usable space for the proposed activity',unit:'sqft',scope:'operational',type:'number',use:'operational',min:0,note:'Requires a relevant floor plan, measurement or explicit report. Public footprint and tax-lot floor area do not establish usable space.',question:'What usable area is available for the proposed activity?'},
 clear_height_ft:{label:'Interior clear height',unit:'ft',scope:'operational',type:'number',use:'operational',min:0,note:'Requires an interior measurement or relevant document. Roof height cannot answer this question.',question:'What is the usable interior clear height?'},
 electrical_capacity_kw:{label:'Available electrical capacity',unit:'kW',scope:'operational',type:'number',use:'operational',min:0,note:'Requires a relevant utility or electrical-engineering confirmation. Annual energy intensity does not establish available capacity.',question:'What electrical capacity is available for this operation?'},
 floor_load_psf:{label:'Allowable floor loading for the proposed activity',unit:'psf',scope:'operational',type:'number',use:'operational',min:0,note:'Requires an applicable structural assessment; this engine does not certify floor loading.',question:'What floor loading is supported by the applicable structural documentation?'},
 loading_docks:{label:'Usable loading docks',unit:'count',scope:'operational',type:'number',use:'operational',min:0,integer:true,note:'A reported dock count needs confirmation against the actual vehicles, access and operating arrangements.',question:'How many loading docks can this operation actually use?'},
 delivery_access_confirmed:{label:'Delivery access confirmed for the proposed vehicles',unit:'boolean',scope:'operational',type:'boolean',use:'operational',note:'Requires an explicit access check for the entrance, vehicle and route. Proximity to a line on a map is insufficient.',question:'Has delivery access been checked for the actual entrance and vehicles?'},
 available_for_use:{label:'Space available for the proposed activity',unit:'boolean',scope:'operational',type:'boolean',use:'operational',note:'Availability is time-sensitive and must be confirmed with a relevant party. A public building record is not a listing.',question:'Is the required space available for this activity and schedule?'},
 use_permission:{label:'Permission for the proposed use or project',unit:'boolean',scope:'operational',type:'boolean',use:'professional_review',note:'This engine does not determine use permission. Zoning codes, FAR and other public attributes cannot establish approval.',question:'Which proposed use, work and applicable approval requirements need a qualified review?'},
 stormwater_footprint_intersection:{label:'Raw stormwater-map and footprint intersection',unit:'boolean',scope:'building_footprint',type:'boolean',use:'context_only',qualifiers:'scenario',note:'Display-only map diagnostic. The DEP model treats buildings as voids; outline intersections can reflect geometry or vintage differences. Neither an intersection nor its absence establishes actual building flooding, suitability or safety.',question:'What do the modeled surrounding ground conditions imply for a site-specific entrance and equipment-elevation review?'},
 stormwater_footprint_overlap_pct:{label:'Raw stormwater-map and footprint overlap percentage',unit:'percent',scope:'building_footprint',type:'number',use:'context_only',qualifiers:'scenario',min:0,max:100,note:'Display-only map diagnostic. Buildings are voids in the DEP model; overlapping geometries can differ in vintage or alignment. This is not flooded building area, depth, damage, probability or a suitability criterion.',question:'Which entrances and equipment elevations need checking against surrounding-ground conditions?'},
 site_eui:{label:'Reported property-group site energy intensity',unit:'kBtu/sqft/year',scope:'benchmark_property',type:'number',use:'recorded',qualifiers:'year',min:0,note:'A reporting-year property-group benchmark. It is not an individual-building meter reading, cooling load, electrical capacity or evidence of efficient operation under a different use.',question:'Which reporting-year property-group site energy intensity is relevant?'},
 source_eui:{label:'Reported property-group source energy intensity',unit:'kBtu/sqft/year',scope:'benchmark_property',type:'number',use:'recorded',qualifiers:'year',min:0,note:'A reporting-year property-group benchmark including source-energy accounting. It does not establish site electrical capacity or a proposed operation’s energy demand.',question:'Which reporting-year property-group source energy intensity is relevant?'},
} as const satisfies Record<string,Definition>;
export type FactKey = keyof typeof FACTS;
export type OperationalFactKey = 'usable_area_sqft'|'clear_height_ft'|'electrical_capacity_kw'|'floor_load_psf'|'loading_docks'|'delivery_access_confirmed'|'available_for_use';
export type EvidenceSource = {id:string;label:string;url?:string;retrievedAt?:string;recordId?:string;version?:string};
export type DecisionFact = {
 id:string;key:FactKey;value:FactValue|null;unit:FactUnit;scope:FactScope;
 basis:'public_record'|'derived'|'user_reported';source:EvidenceSource;
 note:string;scenario?:string;year?:number;propertyId?:string;
 complete?:boolean;coverage?:'covered'|'excluded'|'unknown';reportedAt?:string;
};
export type ReportedOperationalFact = {
 key:OperationalFactKey;value:number|boolean|null;unit:FactUnit;scope:'operational';
 source:EvidenceSource;reportedAt:string;note?:string;
};
export type WholeFootprintEvidence = {
 buildingId:string;scenario:string;intersects:boolean|null;overlapPct:number|null;
 queryComplete:boolean;coverage:'covered'|'excluded'|'unknown';source:EvidenceSource;note?:string;
};
export type EnergyBenchmarkEvidence = {
 propertyId:string;matchedBbl:string;reportingYear:number;
 siteEui:number|null;sourceEui:number|null;source:EvidenceSource;note?:string;
};
export type CandidateExtras = {
 operational?:ReportedOperationalFact[];
 footprint?:WholeFootprintEvidence[];
 energy?:EnergyBenchmarkEvidence[];
};
export type Requirement = {
 id:string;factKey:FactKey;operator:Operator;target:number|boolean|string[];
 unit:FactUnit;scope:FactScope;required:boolean;scenario?:string;year?:number;
};
export type QuestionPlan = {
 intent:'find'|'compare'|'understand';purpose?:'general'|'warehouse'|'cold_storage';
 userQuestion:string;requirements:Requirement[];
};
export type PlanIssue = {path:string;code:string;message:string};
export type CandidateEvidence = {
 id:string;label:string;entityType:'building'|'parcel';facts:DecisionFact[];
 warnings:string[];dataIssues:string[];
};
export type RequirementStatus = 'supported'|'conflicting'|'unknown'|'not_assessed';
export type RequirementResult = {
 requirementId:string;factKey:FactKey;label:string;required:boolean;
 status:RequirementStatus;reason:string;evidenceIds:string[];facts:DecisionFact[];
};
export type CandidateDecision = {
 id:string;label:string;status:'matches'|'conditional'|'conflicts'|'not_assessed';
 answer:string;requirements:RequirementResult[];blockers:RequirementResult[];
 unknowns:RequirementResult[];warnings:string[];dataIssues:string[];
};
export type NextQuestion = {
 kind:'verify_fact'|'professional_review'|'reconsider_requirement'|'define_requirement';
 question:string;why:string;candidateIds:string[];factKey?:FactKey;requirementId?:string;
 branches:{if:string;then:string}[];
};
export type PlanDecision = {
 valid:boolean;issues:PlanIssue[];answer:string;candidates:CandidateDecision[];
 nextQuestion:NextQuestion|null;
 counts:{checked:number;matches:number;conditional:number;conflicts:number;notAssessed:number};
 suggestedQuestions:{factKey:FactKey;question:string}[];
};

const knownKey=(key:unknown):key is FactKey=>typeof key==='string'&&Object.prototype.hasOwnProperty.call(FACTS,key);
const def=(key:FactKey):Definition=>FACTS[key];
const hasText=(x:unknown,max=300):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const validYear=(x:unknown)=>typeof x==='number'&&Number.isInteger(x)&&x>=1900&&x<=2200;
function validDate(x:unknown):boolean{
 if(typeof x!=='string'||x.length>80||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(x)||!Number.isFinite(Date.parse(x)))return false;
 const [year,month,day]=x.slice(0,10).split('-').map(Number);
 const calendar=new Date(Date.UTC(year,month-1,day));
 return calendar.getUTCFullYear()===year&&calendar.getUTCMonth()===month-1&&calendar.getUTCDate()===day;
}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const plural=(n:number,singular:string,other=singular+'s')=>n===1?singular:other;
function valueProblem(value:unknown,d:Definition):string|null{
 if(d.type==='number')return !finite(value)?'A finite numeric value is required.':d.min!==undefined&&value<d.min?'The value is below the allowed range.':d.max!==undefined&&value>d.max?'The value is above the allowed range.':d.integer&&!Number.isInteger(value)?'A whole-number count is required.':null;
 if(d.type==='boolean')return typeof value==='boolean'?null:'An explicit true or false value is required.';
 return Array.isArray(value)&&value.length>0&&value.length<=30&&value.every(x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9 ./-]{0,29}$/.test(x))?null:'Provide one or more exact recorded codes.';
}
function sourceProblem(source:unknown):string|null{
 if(!source||typeof source!=='object')return 'Source metadata are missing.';
 const s=source as EvidenceSource;
 if(!hasText(s.id,160)||!hasText(s.label,300))return 'A source identifier and label are required.';
 if(s.url!==undefined&&(!hasText(s.url,2000)||!/^https:\/\/[^\s<>]+$/i.test(s.url)))return 'Source links must use HTTPS.';
 if(s.retrievedAt!==undefined&&!validDate(s.retrievedAt))return 'The source retrieval date is invalid.';
 return null;
}
function factProblem(f:DecisionFact):string|null{
 if(!f||!knownKey(f.key))return 'The fact key is not supported.';
 const d=def(f.key);
 if(f.unit!==d.unit||f.scope!==d.scope)return `The fact must use ${d.unit} at ${d.scope} scope.`;
 if(!hasText(f.id,300))return 'An evidence identifier is required.';
 const source=sourceProblem(f.source);if(source)return source;
 if(!['public_record','derived','user_reported'].includes(f.basis))return 'The evidence basis is invalid.';
 if(d.use==='operational'&&(f.basis!=='user_reported'||!validDate(f.reportedAt)))return 'Operational evidence needs an explicitly dated report; public proxies cannot fill it.';
 if(d.qualifiers==='scenario'&&(!hasText(f.scenario,160)||typeof f.complete!=='boolean'||!['covered','excluded','unknown'].includes(f.coverage||'')))return 'Footprint evidence needs a scenario, query completeness and model-coverage status.';
 if(d.qualifiers==='year'&&(!validYear(f.year)||!hasText(f.propertyId,160)))return 'Benchmark evidence needs its reporting year and property-group identifier.';
 return f.value===null?null:valueProblem(f.value,d);
}

/** Adds the canonical unit/scope, but does not guess what measurement the user meant. */
export function makeRequirement(factKey:FactKey,operator:Operator,target:Requirement['target'],options:Partial<Pick<Requirement,'id'|'required'|'scenario'|'year'>>={}):Requirement{
 if(!knownKey(factKey))throw new Error('Unsupported requirement fact.');
 return{id:options.id??factKey,factKey,operator,target,unit:FACTS[factKey].unit,scope:FACTS[factKey].scope,required:options.required??true,...(options.scenario!==undefined?{scenario:options.scenario}:{}),...(options.year!==undefined?{year:options.year}:{})};
}

/** Run this before accepting plans produced by a form or, later, a model tool. */
export function validatePlan(input:unknown):PlanIssue[]{
 const issues:PlanIssue[]=[];
 const add=(path:string,code:string,message:string)=>issues.push({path,code,message});
 if(!input||typeof input!=='object'){add('plan','invalid_plan','Provide a question plan.');return issues;}
 const plan=input as QuestionPlan;
 if(!['find','compare','understand'].includes(plan.intent))add('intent','invalid_intent','Choose find, compare or understand.');
 if(plan.purpose!==undefined&&!['general','warehouse','cold_storage'].includes(plan.purpose))add('purpose','invalid_purpose','Choose a supported purpose or leave it unspecified.');
 if(typeof plan.userQuestion!=='string'||plan.userQuestion.length>2000)add('userQuestion','invalid_question','The question must contain at most 2,000 characters.');
 if(!Array.isArray(plan.requirements)||plan.requirements.length>20){add('requirements','invalid_requirements','Use an array of at most 20 explicit requirements.');return issues;}
 const ids=new Set<string>();
 plan.requirements.forEach((r,i)=>{
  const path=`requirements[${i}]`;
  if(!r||typeof r!=='object'){add(path,'invalid_requirement','Provide a requirement object.');return;}
  if(!hasText(r.id,100)||ids.has(r.id))add(path+'.id','invalid_id','Requirement identifiers must be nonempty and unique.');else ids.add(r.id);
  if(!knownKey(r.factKey)){add(path+'.factKey','unknown_fact','This measurement is not supported.');return;}
  const d=def(r.factKey);
  if(r.unit!==d.unit)add(path+'.unit','unit_mismatch',`${d.label} uses ${d.unit}; no implicit conversion is performed.`);
  if(r.scope!==d.scope)add(path+'.scope','scope_mismatch',`${d.label} describes ${d.scope}; another spatial unit cannot substitute for it.`);
  if(typeof r.required!=='boolean')add(path+'.required','invalid_required','State whether this is a requirement or an optional check.');
  const allowed=d.type==='number'?['gte','lte','eq']:d.type==='codes'?['in']:['eq'];
  if(!allowed.includes(r.operator))add(path+'.operator','invalid_operator',`This measurement supports ${allowed.join(', ')}.`);
  const problem=valueProblem(r.target,d);if(problem)add(path+'.target','invalid_target',problem);
  if(d.qualifiers==='scenario'&&!hasText(r.scenario,160))add(path+'.scenario','missing_scenario','Select the exact modeled scenario.');
  if(d.qualifiers==='year'&&!validYear(r.year))add(path+'.year','missing_year','Select the reporting year.');
  if(d.qualifiers!=='scenario'&&r.scenario!==undefined)add(path+'.scenario','unexpected_scenario','This measurement is not scenario-specific.');
  if(d.qualifiers!=='year'&&r.year!==undefined)add(path+'.year','unexpected_year','This measurement does not accept a reporting-year selector.');
 });
 // A missing measurement cannot resolve mutually impossible conditions. Group
 // only the same scoped measurement and reporting context; codes are sets, so
 // different zoning predicates may coexist on a multi-district tax lot.
 if(!issues.length){
  const groups=new Map<string,Requirement[]>();
  for(const r of plan.requirements){
   if(!r.required||def(r.factKey).type==='codes')continue;
   const key=JSON.stringify([r.factKey,r.unit,r.scope,r.scenario??null,r.year??null]);
   groups.set(key,[...(groups.get(key)||[]),r]);
  }
  for(const rows of groups.values()){
   if(rows.length<2)continue;
   const d=def(rows[0].factKey);
   if(d.type==='boolean'){
    if(new Set(rows.map(r=>r.target)).size>1)add('requirements','contradictory_requirements',`${d.label} cannot be both yes and no. Change or remove one of these required conditions.`);
   }else{
    const lower=rows.filter(r=>r.operator==='gte'||r.operator==='eq').sort((a,b)=>(b.target as number)-(a.target as number))[0];
    const upper=rows.filter(r=>r.operator==='lte'||r.operator==='eq').sort((a,b)=>(a.target as number)-(b.target as number))[0];
    if(lower&&upper&&(lower.target as number)>(upper.target as number))add('requirements','contradictory_requirements',`These required conditions cannot both hold: ${describeRequirement(lower)}; ${describeRequirement(upper)}. Change or remove one condition.`);
   }
  }
 }
 return issues;
}

/** Public fields are adapted explicitly. There is no key-name guessing, proxy
 * substitution, implicit unit conversion or inference from zoning to permission.
 * Extra measurements must belong to this candidate and keep their own scope.
 */
export function buildCandidateEvidence(building:CityBuilding,context?:SiteContext,extras:CandidateExtras={}):CandidateEvidence{
 const candidate:CandidateEvidence={id:building.id,label:building.address||building.id,entityType:building.entity_type==='parcel'?'parcel':'building',facts:[],warnings:[],dataIssues:[]};
 if(building.join_warning)candidate.warnings.push(building.join_warning);
 const retrievedAt=building.retrieval?.retrieved_at;
 const footprint:EvidenceSource={id:'nyc-footprints',label:'NYC building footprints',url:'https://data.cityofnewyork.us/d/5zhs-2jue',recordId:building.id,...(retrievedAt?{retrievedAt}:{})};
 const pluto:EvidenceSource={id:'nyc-pluto',label:'NYC PLUTO tax-lot record',url:'https://data.cityofnewyork.us/d/64uk-42ks',...(building.bbl?{recordId:building.bbl}:{}),...(building.pluto_version?{version:building.pluto_version}:{}),...(retrievedAt?{retrievedAt}:{})};
 const add=(key:FactKey,value:FactValue|null,source:EvidenceSource,fields:Partial<DecisionFact>={})=>{
  const d=def(key),f:DecisionFact={id:`${building.id}:${key}:${fields.scenario??fields.year??'current'}`,key,value,unit:d.unit,scope:d.scope,basis:'public_record',source,note:d.note,...fields};
  const problem=factProblem(f);if(problem){candidate.dataIssues.push(`${d.label}: ${problem}`);return;}
  candidate.facts.push(f);
 };
 const measured=(v:unknown,positive=false)=>finite(v)&&v>=0&&(!positive||v>0)?v:null;
 if(candidate.entityType==='building'){
  add('footprint_area_sqft',building.geometry_quality==='invalid_or_placeholder'?null:measured(building.footprint_area_sqft,true),footprint,{basis:'derived'});
  add('roof_height_ft',measured(building.roof_height_ft,true),footprint);
 }
 if(building.bbl){
  add('lot_building_area_sqft',measured(building.lot_building_area_sqft,true),pluto);
  add('lot_area_sqft',measured(building.lot_area_sqft,true),pluto);
  add('zoning',Array.isArray(building.zoning)&&building.zoning.length?building.zoning:null,pluto);
 }
 if(context&&context.id!==building.id)candidate.dataIssues.push('The site context belongs to a different candidate and was ignored.');
 else if(context?.truck?.status==='available'){
  const revision=context.truck.value?.source_data_updated_at,checkedAt=context.truck.value?.source_revision_checked_at;
  const note=[context.truck.note||FACTS.truck_route_distance_m.note,validDate(checkedAt)?`Publisher revision last verified ${checkedAt}; not rechecked at every spatial query.`:''].filter(Boolean).join(' ');
  add('truck_route_distance_m',measured(context.truck.value?.distance_m),{id:'nyc-truck-routes',label:'NYC truck-route dataset used for the query',url:context.truck.source||'https://data.cityofnewyork.us/d/jjja-shxy',...(context.retrieved_at?{retrievedAt:context.retrieved_at}:{}),...(validDate(revision)?{version:revision}:{})},{basis:'derived',note});
 }
 for(const [i,report] of (extras.operational||[]).entries()){
  if(!knownKey(report?.key)||def(report.key).use!=='operational'){candidate.dataIssues.push('Only explicitly reported operational measurements may be added as operational evidence.');continue;}
  add(report.key,report.value,report.source,{id:`${building.id}:${report.key}:report:${i}`,unit:report.unit,scope:report.scope,basis:'user_reported',reportedAt:report.reportedAt,note:report.note?`${def(report.key).note} Report note: ${report.note}`:def(report.key).note});
 }
 for(const [i,overlay] of (extras.footprint||[]).entries()){
  if(candidate.entityType!=='building'||overlay.buildingId!==building.id||building.geometry_quality==='invalid_or_placeholder'){
   candidate.dataIssues.push('Whole-footprint evidence did not match a valid building footprint and was ignored.');continue;
  }
  const fields:Partial<DecisionFact>={basis:'derived',scenario:overlay.scenario,complete:overlay.queryComplete,coverage:overlay.coverage};
  add('stormwater_footprint_intersection',overlay.intersects,overlay.source,{...fields,id:`${building.id}:stormwater_footprint_intersection:${i}`});
  add('stormwater_footprint_overlap_pct',overlay.overlapPct,overlay.source,{...fields,id:`${building.id}:stormwater_footprint_overlap_pct:${i}`});
 }
 for(const [i,energy] of (extras.energy||[]).entries()){
  if(!building.bbl||energy.matchedBbl!==building.bbl){candidate.dataIssues.push('The energy benchmark was not explicitly linked to this candidate’s tax lot and was ignored.');continue;}
  const fields:Partial<DecisionFact>={year:energy.reportingYear,propertyId:energy.propertyId};
  add('site_eui',energy.siteEui,energy.source,{...fields,id:`${building.id}:site_eui:${i}`});
  add('source_eui',energy.sourceEui,energy.source,{...fields,id:`${building.id}:source_eui:${i}`});
 }
 return candidate;
}

export function describeRequirement(r:Requirement):string{
 const d=def(r.factKey);
 const target=Array.isArray(r.target)?r.target.join(' or '):typeof r.target==='boolean'?(r.target?'yes':'no'):`${r.target.toLocaleString('en-US',{maximumFractionDigits:6})}${r.unit==='count'?'':` ${r.unit}`}`;
 const comparison=r.operator==='gte'?'at least ':r.operator==='lte'?'at most ':r.operator==='in'?'includes ':'';
 return `${d.label}: ${comparison}${target}${r.scenario?` (${r.scenario})`:''}${r.year?` (${r.year})`:''}`;
}
function matches(value:FactValue,r:Requirement):boolean{
 if(r.operator==='in')return Array.isArray(value)&&Array.isArray(r.target)&&value.some(x=>(r.target as string[]).includes(x));
 if(r.operator==='gte')return typeof value==='number'&&typeof r.target==='number'&&value>=r.target;
 if(r.operator==='lte')return typeof value==='number'&&typeof r.target==='number'&&value<=r.target;
 return value===r.target;
}
function assessRequirement(r:Requirement,c:CandidateEvidence):RequirementResult{
 const d=def(r.factKey),base={requirementId:r.id,factKey:r.factKey,label:describeRequirement(r),required:r.required};
 const result=(status:RequirementStatus,reason:string,facts:DecisionFact[]=[]):RequirementResult=>({...base,status,reason,evidenceIds:facts.map(f=>f.id),facts});
 if(d.use==='professional_review')return result('not_assessed',d.note);
 if((d.scope==='building'||d.scope==='building_footprint')&&c.entityType==='parcel')return result('not_assessed','This condition requires an individual building measurement; the selected candidate is a tax lot.');
 const all=c.facts.filter(f=>f&&typeof f==='object'&&f.key===r.factKey);
 const relevant=all.filter(f=>(r.scenario===undefined||f.scenario===r.scenario)&&(r.year===undefined||f.year===r.year));
 if(d.use==='context_only')return result('not_assessed',d.note,relevant.filter(f=>!factProblem(f)));
 if(!relevant.length)return result('unknown',all.length?'Available evidence belongs to another scenario or reporting year. It cannot answer this condition.':`${d.label} has not been established for this candidate. ${d.note}`);
 const invalid=relevant.map(f=>factProblem(f)).find(Boolean);
 if(invalid)return result('unknown',`The supplied evidence cannot support this condition: ${invalid}`,relevant);
 if(d.qualifiers==='scenario'&&relevant.some(f=>f.complete!==true||f.coverage!=='covered'))return result('unknown','The full-footprint query or model-coverage check is incomplete, excluded or unknown. A missing map hit cannot satisfy this condition.',relevant);
 if(relevant.some(f=>f.value===null))return result('unknown',`${d.label} is missing. Missing values do not satisfy or contradict the condition.`,relevant);
 // Do not silently choose between separate reports or different benchmark groups.
 const signatures=new Set(relevant.map(f=>JSON.stringify({value:f.value,propertyId:f.propertyId??null})));
 if(signatures.size>1)return result('unknown','The available records disagree or describe different benchmark property groups. Resolve the evidence before applying this condition.',relevant);
 const supported=matches(relevant[0].value!,r);
 const basis=relevant.some(f=>f.basis==='user_reported')?'The explicitly reported value':'The recorded measurement';
 return result(supported?'supported':'conflicting',`${basis} ${supported?'matches':'does not match'} this condition. ${d.note}`,relevant);
}
function summaryWithoutRequirements(c:CandidateEvidence):string{
 const useful=c.facts.filter(f=>f&&typeof f==='object'&&['footprint_area_sqft','lot_building_area_sqft','zoning'].includes(f.key)&&f.value!==null&&!factProblem(f));
 const pieces=useful.map(f=>f.key==='zoning'?`recorded zoning ${(f.value as string[]).join(', ')}`:`${(f.value as number).toLocaleString('en-US')} sqft ${f.key==='footprint_area_sqft'?'mapped footprint':'recorded floor area across the lot'}`);
 return `${c.label}: ${pieces.length?pieces.join('; '):'the relevant physical records have not been established'}. Specify a condition to assess fit. Use permission and operational readiness remain unassessed.`;
}
function assessCandidate(plan:QuestionPlan,c:CandidateEvidence):CandidateDecision{
 const requirements=plan.requirements.map(r=>assessRequirement(r,c));
 const required=requirements.filter(r=>r.required),blockers=required.filter(r=>r.status==='conflicting'),unknowns=required.filter(r=>r.status==='unknown'||r.status==='not_assessed');
 const status:CandidateDecision['status']=!required.length?'not_assessed':blockers.length?'conflicts':unknowns.length?'conditional':'matches';
 const supported=required.filter(r=>r.status==='supported').length;
 const answer=status==='not_assessed'?summaryWithoutRequirements(c):status==='conflicts'?`${c.label} does not match ${blockers.length} stated ${plural(blockers.length,'requirement')}: ${blockers.map(r=>r.label).join('; ')}.${unknowns.length?` Another ${unknowns.length} ${plural(unknowns.length,'condition')} remains unresolved.`:''}`:status==='conditional'?`${c.label} matches ${supported} of ${required.length} stated requirements on the available evidence. ${unknowns.length} ${plural(unknowns.length,'condition remains','conditions remain')} unresolved; it stays a conditional candidate.`:`${c.label} matches all ${required.length} stated ${plural(required.length,'requirement')} on the supplied evidence. This establishes only those conditions, not overall suitability, availability or permission.`;
 return{id:c.id,label:c.label,status,answer,requirements,blockers,unknowns,warnings:c.warnings||[],dataIssues:c.dataIssues||[]};
}

/** Logical discrimination, not expected financial value of information. A fact
 * receives priority only when resolving it can change the provisional shortlist.
 * No likelihood, utility, cost or value-of-information estimate is invented.
 */
function chooseNextQuestion(plan:QuestionPlan,candidates:CandidateDecision[]):NextQuestion|null{
 const required=plan.requirements.filter(r=>r.required);
 if(!required.length)return{kind:'define_requirement',question:'What is one condition a place must meet for your question?',why:'No required conditions have been stated. A purpose alone does not establish size, capacity or permission requirements.',candidateIds:candidates.map(c=>c.id),branches:[]};
 const viable=candidates.filter(c=>!c.blockers.length&&c.unknowns.length);
 const choices=required.map((r,index)=>{
  const affected=viable.filter(c=>c.unknowns.some(x=>x.requirementId===r.id));
  const resolvable=def(r.factKey).use==='recorded'||def(r.factKey).use==='operational';
  return{r,index,affected,resolvable,lastUnknown:affected.filter(c=>c.unknowns.length===1).length};
 }).filter(x=>x.affected.length);
 choices.sort((a,b)=>Number(b.resolvable)-Number(a.resolvable)||b.lastUnknown-a.lastUnknown||b.affected.length-a.affected.length||a.index-b.index);
 if(choices.length){
  const{r,affected,resolvable,lastUnknown}=choices[0];
  if(!resolvable)return{kind:'professional_review',question:FACTS[r.factKey].question,why:def(r.factKey).note,candidateIds:affected.map(c=>c.id),factKey:r.factKey,requirementId:r.id,branches:[]};
  const names=affected.map(c=>c.label).join(', ');
  return{kind:'verify_fact',question:`For ${names}, can you establish this condition: ${describeRequirement(r)}?`,why:lastUnknown?`This is the last unresolved condition for ${lastUnknown} ${plural(lastUnknown,'candidate')} with no known conflicts. A checked answer could change the provisional shortlist.`:`This condition is unresolved for ${affected.length} ${plural(affected.length,'candidate')} with no known conflicts. Other unresolved conditions would still need attention.`,candidateIds:affected.map(c=>c.id),factKey:r.factKey,requirementId:r.id,branches:[{if:'The relevant, correctly scoped evidence meets the condition',then:lastUnknown?`${lastUnknown} ${plural(lastUnknown,'candidate would','candidates would')} match all stated requirements; any other candidates still need their remaining conditions resolved.`:'This condition becomes supported. The other unresolved requirements still need evidence.'},{if:'The evidence does not meet the condition',then:'The affected candidate does not match this requirement unless you explicitly change it.'},{if:'The evidence is unavailable or addresses another unit, scope or scenario',then:'The condition remains unknown; the candidate is not promoted to a match.'}]};
 }
 if(candidates.length&&candidates.every(c=>c.blockers.length)){
  const ordered=required.map((r,index)=>({r,index,blocked:candidates.filter(c=>c.blockers.some(x=>x.requirementId===r.id))})).filter(x=>x.blocked.length).sort((a,b)=>b.blocked.length-a.blocked.length||a.index-b.index);
  const{r,blocked}=ordered[0];
  return{kind:'reconsider_requirement',question:`Is this condition essential, or should the search change: ${describeRequirement(r)}?`,why:'Every checked candidate has a known conflict. Filling unrelated unknowns cannot remove those conflicts. Keep the condition and search elsewhere, or change it explicitly.',candidateIds:blocked.map(c=>c.id),factKey:r.factKey,requirementId:r.id,branches:[{if:'Keep the condition',then:'Continue searching for other candidates; the conflicting candidates remain outside these requirements.'},{if:'Change the condition',then:'Re-evaluate all candidates. Other conflicts and unknowns still apply.'}]};
 }
 return null;
}

function suggestions(purpose:QuestionPlan['purpose']):PlanDecision['suggestedQuestions']{
 const keys:FactKey[]=purpose==='cold_storage'?['usable_area_sqft','electrical_capacity_kw','clear_height_ft','available_for_use','use_permission']:purpose==='warehouse'?['usable_area_sqft','delivery_access_confirmed','loading_docks','available_for_use','use_permission']:['available_for_use','use_permission'];
 return keys.map(factKey=>({factKey,question:FACTS[factKey].question}));
}
export function evaluatePlan(plan:QuestionPlan,candidates:CandidateEvidence[]):PlanDecision{
 const issues=validatePlan(plan),empty={checked:0,matches:0,conditional:0,conflicts:0,notAssessed:0};
 if(!Array.isArray(candidates)||candidates.length>500)issues.push({path:'candidates',code:'invalid_candidates',message:'Evaluate at most 500 explicitly supplied candidates at a time.'});
 else if(candidates.some(c=>!c||!hasText(c.id,160)||!hasText(c.label,300)||!['building','parcel'].includes(c.entityType)||!Array.isArray(c.facts))||new Set(candidates.map(c=>c.id)).size!==candidates.length)issues.push({path:'candidates',code:'invalid_candidates',message:'Candidates need unique identifiers, labels, spatial units and evidence arrays.'});
 if(issues.length)return{valid:false,issues,answer:'The question needs clarification before these conditions can be evaluated.',candidates:[],nextQuestion:null,counts:empty,suggestedQuestions:[]};
 const results=candidates.map(c=>assessCandidate(plan,c));
 const counts={checked:results.length,matches:results.filter(c=>c.status==='matches').length,conditional:results.filter(c=>c.status==='conditional').length,conflicts:results.filter(c=>c.status==='conflicts').length,notAssessed:results.filter(c=>c.status==='not_assessed').length};
 let answer:string;
 if(!results.length)answer='No candidates were supplied for this question. Search for places or select a site first.';
 else if(plan.intent==='understand'&&results.length===1)answer=results[0].answer;
 else if(!plan.requirements.some(r=>r.required))answer=`The ${results.length} supplied ${plural(results.length,'candidate')} can be described, but no required conditions have been stated. Choose what matters before calling any of them a match.`;
 else answer=`Among the ${results.length} ${plural(results.length,'candidate')} checked, ${counts.matches} ${plural(counts.matches,'matches','match')} all stated requirements, ${counts.conditional} ${plural(counts.conditional,'remains','remain')} conditional, and ${counts.conflicts} ${plural(counts.conflicts,'has','have')} a known conflict. These conclusions apply only to the stated conditions and supplied evidence.`;
 return{valid:true,issues:[],answer,candidates:results,nextQuestion:results.length?chooseNextQuestion(plan,results):null,counts,suggestedQuestions:suggestions(plan.purpose).filter(s=>!plan.requirements.some(r=>r.factKey===s.factKey))};
}

/** Convenience entry point used by the UI; does not fetch, rank or mutate input. */
export function evaluateQuestion(plan:QuestionPlan,buildings:CityBuilding[],contexts:Record<string,SiteContext>={},extrasById:Record<string,CandidateExtras>={}):PlanDecision{
 const evidence=buildings.map(b=>buildCandidateEvidence(b,contexts[b.id],extrasById[b.id]));
 // An address can name several physical buildings. Make answers and report
 // selectors unambiguous without collapsing distinct BINs into one tax lot.
 evidence.forEach((candidate,index)=>{
  const siblings=evidence.filter(c=>c.label.trim().toLowerCase()===candidate.label.trim().toLowerCase());
  // Compare original addresses because labels are enriched in place below.
  const same=buildings.filter(b=>(b.address||b.id).trim().toLowerCase()===(buildings[index].address||buildings[index].id).trim().toLowerCase());
  if(same.length<2&&siblings.length<2)return;
  const b=buildings[index],native=b.bin?`BIN ${b.bin}`:b.bbl?`BBL ${b.bbl}`:`record ${b.id}`;
  const repeated=same.filter(other=>b.bin?other.bin===b.bin:b.bbl?other.bbl===b.bbl:other.id===b.id).length>1;
  candidate.label+=` (${native}${repeated?`, record ${b.id}`:''})`;
 });
 return evaluatePlan(plan,evidence);
}

export type RequirementPrompt = {
 factKey:OperationalFactKey;question:string;explanation:string;
 unit:FactUnit;scope:'operational';operator:'gte'|'eq';input:'minimum'|'confirmation';
};
/** Optional elicitation before a condition exists. Returning a prompt does not
 * add a requirement. There is deliberately no default threshold or yes answer.
 * Resolve an existing action-changing question before asking for more criteria.
 */
export function nextRequirementPrompt(plan:QuestionPlan,skipped:FactKey[]=[],decision?:PlanDecision):RequirementPrompt|null{
 if(validatePlan(plan).length||!plan.purpose||plan.purpose==='general')return null;
 if(decision?.nextQuestion&&decision.nextQuestion.kind!=='define_requirement')return null;
 const order:OperationalFactKey[]=plan.purpose==='cold_storage'?['usable_area_sqft','electrical_capacity_kw','clear_height_ft','floor_load_psf','available_for_use']:['usable_area_sqft','delivery_access_confirmed','loading_docks','available_for_use'];
 const key=order.find(key=>!skipped.includes(key)&&!plan.requirements.some(r=>r.factKey===key));
 if(!key)return null;
 const d=def(key),numeric=d.type==='number';
 const questions:Record<OperationalFactKey,string>={
  usable_area_sqft:'Does your plan require a minimum amount of usable indoor space?',
  clear_height_ft:'Does your equipment or storage layout require a minimum interior clear height?',
  electrical_capacity_kw:'Do you already have a minimum electrical-capacity requirement for the proposed equipment?',
  floor_load_psf:'Does your proposed loading require a documented minimum floor-load capacity?',
  loading_docks:'Is a minimum number of usable loading docks essential to your plan?',
  delivery_access_confirmed:'Must delivery access be confirmed for a particular entrance and vehicle before a place can qualify?',
  available_for_use:'Must availability for your activity and schedule be confirmed before a place can qualify?',
 };
 return{factKey:key,question:questions[key],explanation:`Add this condition only if it matters to your plan. ${d.note}`,unit:d.unit,scope:'operational',operator:numeric?'gte':'eq',input:numeric?'minimum':'confirmation'};
}

/** Discovery filters are reported separately from requirements. This function
 * never adds a predicate, claims usable area, or says that a returned place fits.
 */
export function describeSearchFilters(query:CityQuery):{filters:string[];meaning:string}{
 const filters:string[]=[];
 const boroughs:Record<string,string>={MN:'Manhattan',BX:'Bronx',BK:'Brooklyn',QN:'Queens',SI:'Staten Island'};
 if(query.q?.trim())filters.push(`Address or source-identifier query: ${query.q.trim().slice(0,120)}`);
 if(query.borough&&boroughs[query.borough])filters.push(`Borough: ${boroughs[query.borough]}`);
 if(finite(query.minArea)&&query.minArea>0)filters.push(`At least ${query.minArea.toLocaleString('en-US')} sqft recorded floor area across the tax lot, potentially across multiple buildings`);
 if(query.zoning&&['M','C','R'].includes(query.zoning))filters.push(`Recorded zoning district begins with ${query.zoning}; this is not a use-permission check`);
 if(query.landUse&&query.landUse!=='all')filters.push(`Recorded tax-lot land-use code: ${query.landUse}`);
 if(query.bbox?.length===4)filters.push('Within the selected map-search bounds');
 return{filters,meaning:'These settings select public records to investigate. Passing the search filters does not establish usable space, availability, operational fit or permission. Only explicitly stated requirements are evaluated.'};
}

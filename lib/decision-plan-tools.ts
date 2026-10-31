import { FACTS, validatePlan, type QuestionPlan } from './decision-plan';

const object = (v:unknown):v is Record<string,unknown> => Boolean(v) && typeof v==='object' && !Array.isArray(v);
const exactKeys = (v:Record<string,unknown>, keys:string[]) => Object.keys(v).every(k=>keys.includes(k));
export class DecisionToolError extends Error {}
const reject=(message:string):never=>{throw new DecisionToolError(message)};

/** Model-selectable questions have application-owned wording, so a clarification
 * cannot smuggle an unsupported site claim into a purportedly factual answer. */
export const CLARIFICATIONS = {
 intent:{question:'What would you like to do with NYC building records?',why:'The next step depends on whether you are finding places, comparing addresses or understanding one place.',options:[{value:'find',label:'Find places'},{value:'compare',label:'Compare addresses'},{value:'understand',label:'Understand a place'}]},
 area_scope:{question:'When you say space or area, which measurement do you mean?',why:'A mapped footprint, floor area across a tax lot and usable indoor space are different measurements. Public records cannot substitute for a usable-space check.',options:[{value:'footprint_area_sqft',label:'Mapped building footprint'},{value:'lot_building_area_sqft',label:'Recorded floor area across the lot'},{value:'usable_area_sqft',label:'Usable indoor space'}]},
 height_scope:{question:'Do you mean recorded roof height or usable interior clear height?',why:'The building-height record does not establish the clearance available inside.',options:[{value:'roof_height_ft',label:'Recorded roof height'},{value:'clear_height_ft',label:'Interior clear height'}]},
 energy_scope:{question:'Which energy question do you need to answer?',why:'A reporting-group annual energy benchmark cannot establish the electrical capacity available to a proposed operation.',options:[{value:'site_eui',label:'Reported annual energy intensity'},{value:'electrical_capacity_kw',label:'Available electrical capacity'}]},
 climate_scope:{question:'Which climate source and time window should we inspect?',why:'This tool returns one named-station metric for 1991–2020 or 2021–2025, one paired observation for an airport and year from 2021–2025, or a published NYC regional projection horizon. It does not provide current weather, a multi-station comparison or building-specific forecasts.',options:[{value:'JFK 2025 hottest pair',label:'JFK · hottest retained pair in 2025'},{value:'JFK 2021–2025',label:'JFK · 2021–2025'},{value:'NYC 2050s',label:'NYC region · 2050s'}]},
 location:{question:'Which NYC address, building identifier or borough should we investigate?',why:'A location defines the public records to search; it does not establish availability or suitability.',options:[]},
 candidates:{question:'Which two to four addresses or selected buildings should we compare?',why:'A comparison needs distinct places. Buildings sharing one tax lot may still be separate candidates.',options:[]},
 requirement:{question:'What is one condition a place must meet for your question?',why:'A purpose alone does not establish an area, capacity or permission requirement. You can also ask to understand a place without evaluating its fit.',options:[]},
} as const;
export type ClarificationTopic=keyof typeof CLARIFICATIONS;
export function parseClarification(value:unknown){
 if(!object(value)||!exactKeys(value,['topic'])||typeof value.topic!=='string'||!Object.prototype.hasOwnProperty.call(CLARIFICATIONS,value.topic))return reject('Choose one supported clarification topic without adding factual claims.');
 const topic=value.topic as ClarificationTopic;
 return{topic,...CLARIFICATIONS[topic]};
}
export type RequirementOrigin={requirementId:string;quote:string};
export type ParsedDecision={plan:QuestionPlan;ids:string[];requirementOrigins:RequirementOrigin[]};
const idPattern=/^(?:[1-9]\d{0,9}|p:[1-5]\d{9})$/;
const numericTokens=(text:string)=>[...text.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'').matchAll(/(?<![\w.])\d+(?:\.\d+)?(?:\s*[kK](?![a-zA-Z]))?/g)].map(x=>/[kK]$/.test(x[0])?Number(x[0].slice(0,-1).trim())*1000:Number(x[0]));
/** Accept only the planner's registered predicates. Exact quoted user text is an
 * audit trail, not proof of perfect language interpretation: callers expose the
 * extracted plan for review. No model output is accepted as operational evidence. */
export function parseDecisionTool(value:unknown,userTexts:string[],currentQuestion:string):ParsedDecision{
 if(!object(value)||!exactKeys(value,['plan','ids','requirementOrigins'])||!object(value.plan))return reject('Provide only plan, ids and requirementOrigins.');
 const p=value.plan;
 if(!exactKeys(p,['intent','purpose','requirements']))return reject('Unsupported plan field. The server retains the original question.');
 if(!Array.isArray(p.requirements))return reject('Plan requirements must be an array.');
 for(const r of p.requirements){
  if(!object(r)||!exactKeys(r,['id','factKey','operator','target','unit','scope','required','scenario','year']))return reject('Unsupported requirement field.');
 }
 const plan={...p,userQuestion:currentQuestion.slice(0,2000)} as QuestionPlan;
 const issues=validatePlan(plan);
 if(issues.length)return reject(issues.map(x=>`${x.path}: ${x.message}`).join(' ').slice(0,1800));
 if(!Array.isArray(value.ids)||value.ids.length>12||!value.ids.every(id=>typeof id==='string'&&idPattern.test(id))||new Set(value.ids).size!==value.ids.length)return reject('Use at most twelve unique retrieved native site identifiers; an empty list is allowed only for a find query with no results.');
 if(!value.ids.length&&plan.intent!=='find')return reject('Only a find plan may evaluate an empty query result.');
 if(plan.intent==='compare'&&(value.ids.length<2||value.ids.length>4))return reject('A comparison needs two to four retrieved sites.');
 if(plan.intent==='understand'&&value.ids.length!==1)return reject('Understanding a place needs exactly one retrieved site.');
 if(!Array.isArray(value.requirementOrigins)||value.requirementOrigins.length!==plan.requirements.length)return reject('Every requirement needs one exact quotation from the user.');
 const origins:RequirementOrigin[]=[];
 for(const raw of value.requirementOrigins){
  if(!object(raw)||!exactKeys(raw,['requirementId','quote'])||typeof raw.requirementId!=='string'||typeof raw.quote!=='string'||!raw.quote.trim()||raw.quote.length>1200||!userTexts.some(t=>t.includes(raw.quote as string)))return reject('Requirement quotations must be exact text from this conversation’s user messages.');
  if(origins.some(o=>o.requirementId===raw.requirementId))return reject('Duplicate requirement origin.');
  const requirement=plan.requirements.find(r=>r.id===raw.requirementId);
  if(!requirement)return reject('The quotation must name an existing requirement.');
  if(typeof requirement.target==='number'&&!numericTokens(raw.quote).includes(requirement.target))return reject('A numeric requirement threshold must be stated in its quoted user text; do not invent or convert a threshold.');
  origins.push({requirementId:raw.requirementId,quote:raw.quote});
 }
 return{plan,ids:value.ids as string[],requirementOrigins:origins};
}
const requirementSchema={type:'object',properties:{
 id:{type:'string',maxLength:100},factKey:{type:'string',enum:Object.keys(FACTS)},operator:{type:'string',enum:['gte','lte','eq','in']},
 target:{anyOf:[{type:'number'},{type:'boolean'},{type:'array',items:{type:'string'},minItems:1,maxItems:30}]},
 unit:{type:'string',enum:[...new Set(Object.values(FACTS).map(f=>f.unit))]},scope:{type:'string',enum:[...new Set(Object.values(FACTS).map(f=>f.scope))]},
 required:{type:'boolean'},scenario:{type:'string'},year:{type:'integer'}},required:['id','factKey','operator','target','unit','scope','required'],additionalProperties:false};
export const decisionControlTools=[
 {type:'function',function:{name:'clarify_question',description:'Finish this turn with one useful clarification instead of retrieving records needlessly. Select a canonical topic when intent, candidates, area/height/energy/climate scope, location or a necessary condition is ambiguous. No factual claims are accepted.',parameters:{type:'object',properties:{topic:{type:'string',enum:Object.keys(CLARIFICATIONS)}},required:['topic'],additionalProperties:false}}},
 {type:'function',function:{name:'evaluate_decision',description:'Finish this turn by evaluating an explicit typed plan against official records successfully retrieved during THIS turn. The application computes the conditional answer and citations; the model does not supply findings. Quote exact user text for every requirement. Do not invent numeric thresholds, convert units, promote search filters into requirements, or infer requirements from purpose. Use zero requirements for a descriptive inspection. Operational facts and use permission remain unknown/unassessed. Schema and quotes validate structure, not perfect intent extraction; the plan is returned for review.',parameters:{type:'object',properties:{plan:{type:'object',properties:{intent:{type:'string',enum:['find','compare','understand']},purpose:{type:'string',enum:['general','warehouse','cold_storage']},requirements:{type:'array',items:requirementSchema,maxItems:20}},required:['intent','requirements'],additionalProperties:false},ids:{type:'array',items:{type:'string'},minItems:0,maxItems:12},requirementOrigins:{type:'array',items:{type:'object',properties:{requirementId:{type:'string'},quote:{type:'string',maxLength:1200}},required:['requirementId','quote'],additionalProperties:false},maxItems:20}},required:['plan','ids','requirementOrigins'],additionalProperties:false}}},
];
export const decisionFieldGuide=Object.entries(FACTS).map(([key,f])=>({key,unit:f.unit,scope:f.scope,note:f.note}));

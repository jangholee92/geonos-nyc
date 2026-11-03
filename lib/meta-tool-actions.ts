/** UI-only launch descriptions. Choosing a tool never sends a model request. */
export type MetaToolId='compare'|'aerial'|'change'|'review'|'visual'|'voice'|'private';
export type MetaToolRequest={sequence:number;tool:MetaToolId;selectionIds:string[]};
export type MetaToolState={localAvailable:boolean;canRun:boolean;busy:boolean;voiceBusy:boolean;connectionMessage:string};
export const META_TOOLS=[
 {id:'compare',label:'Compare',model:'Muse Spark',minimum:2,description:'Compare official records and choose the next site check.'},
 {id:'aerial',label:'Aerial imagery',model:'SAM · Wonder',minimum:1,description:'Inspect roof and tree regions on dated aerial photographs.'},
 {id:'change',label:'Change detection',model:'DINOv2',minimum:1,description:'Explore 2020 and 2024 imagery of building A.'},
 {id:'review',label:'Second review',model:'Muse Wonder',minimum:2,description:'Challenge the assumptions behind a two-building comparison.'},
 {id:'visual',label:'Inspection visual',model:'Muse Image',minimum:2,description:'Illustrate the next inspection checks as a concept diagram.'},
 {id:'voice',label:'Voice',model:'Muse Voice',minimum:0,description:'Open voice notes; choose Record or Upload when ready.'},
 {id:'private',label:'Private notes',model:'Local Glimmer',minimum:2,description:'Review inspection notes privately in the optional local app.'},
] as const;
export const metaTool=(id:MetaToolId)=>META_TOOLS.find(tool=>tool.id===id)!;
export function toolSelectionIssue(tool:MetaToolId,ids:readonly string[]):string|null{
 if(tool==='voice')return null;
 if(ids.some(id=>!/^[1-9]\d{0,9}$/.test(id))||ids.length>2||new Set(ids).size!==ids.length)return 'Choose one or two individual building outlines on the map.';
 const minimum=metaTool(tool).minimum;
 return ids.length<minimum?minimum===2?'Choose two buildings: A stays pinned, and the next click adds B.':'Choose a building on the map, or search its address.':null;
}
export function metaToolPrompt(tool:MetaToolId,count:number):string|null{
 switch(tool){
  case'compare':return 'Compare these two buildings for climate resilience. Use their building records and surrounding-ground scenarios. What stands out, and which site check should we prioritize?';
  case'aerial':return count===2?'Compare the aerial imagery, roofs and nearby tree context of both selected buildings using SAM and Wonder. Show which site checks could change our climate-resilience comparison.':'Inspect the aerial photograph of the first selected building. Use SAM to mark roofs and trees, and explain what needs to be confirmed on site.';
  case'change':return 'Show historical aerial images of the first selected building (A) and compare 2020 with 2024 using DINOv2.';
  case'review':return 'Give a Muse Wonder second review of the climate-resilience comparison of these two buildings. Challenge the weakest assumption and identify the next decisive check.';
  case'visual':return 'Create an inspection concept diagram for the climate-resilience comparison of these two buildings, showing the next checks and how they could change the decision.';
  default:return null;
 }
}
/** Preserve typed work. An unchanged tool-generated preset may be replaced by
 * another preset; edited text is kept and the new question is appended once. */
export function stageToolDraft(current:string,prompt:string,lastPreset:string|null):{draft:string;preset:string|null;overflow:boolean}{
 if(!current.trim()||current===lastPreset)return{draft:prompt,preset:prompt,overflow:false};
 if(current.includes(prompt))return{draft:current,preset:lastPreset,overflow:false};
 const next=current+'\n\n'+prompt;
 return next.length<=4000?{draft:next,preset:null,overflow:false}:{draft:current,preset:lastPreset,overflow:true};
}

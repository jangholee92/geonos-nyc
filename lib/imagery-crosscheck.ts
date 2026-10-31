/** A disclosed raster comparison of two source-pixel representations. It does
 * not identify a roof, survey a building, measure usable area, or detect change. */
type Point=[number,number];
type Ring=Point[];
type Input={width:number;height:number;footprintPaths:string[];roofPaths:string[];roofStatus:'detected'|'not_detected'|'error'};
type Counts={targetCells:number;overlapCells:number;mapOnlyCells:number;roofOnlyCells:number;inputRoofObjects:number;intersectingRoofObjects:number;includedRoofComponents:number;excludedRoofComponents:number};
export type ImageryCrosscheck={
 kind:'imagery_crosscheck';status:'compared'|'no_intersecting_roof'|'unavailable';reason:string;
 grid:{width:256;height:256;sourceWidth:number;sourceHeight:number;cellWidthPx:number;cellHeightPx:number;method:string};
 footprintCoveredByRoofPct:number|null;counts:Counts;
 regions:{mapOnlyPaths:string[];roofOnlyPaths:string[];overlapPaths:string[]};
 interpretation:string;limitations:string[];
};
const GRID=256,MAX_INPUT_CHARS=520_000,MAX_VERTICES=100_000,MAX_ROW_CROSSINGS=2_000_000,MAX_OUTPUT_CHARS=60_000;
const limitations=[
 'This percentage is approximate overlap of grid-cell centres, not segmentation accuracy, roof condition, a survey, a roof-area measurement or evidence of a changed building.',
 'Only 4-connected roof-mask components that overlap the selected footprint at this grid resolution are included. Separate neighboring components are excluded; an included component can still extend across a shared or neighboring roof.',
 'Map-only means a footprint cell without an overlapping returned roof mask. Image-only means an included roof-mask cell outside the footprint. Neither establishes a missing, new or unmapped building.',
 'Disagreement can arise from imagery/footprint vintage, shadows, occlusion, map/image alignment, grid resolution or model error. A high overlap also does not verify identity, structural safety or suitability.',
];
function initial(input:Input):ImageryCrosscheck{
 return{kind:'imagery_crosscheck',status:'unavailable',reason:'unavailable',grid:{width:GRID,height:GRID,sourceWidth:input.width,sourceHeight:input.height,cellWidthPx:input.width/GRID,cellHeightPx:input.height/GRID,method:'cell-center even-odd raster'},footprintCoveredByRoofPct:null,counts:{targetCells:0,overlapCells:0,mapOnlyCells:0,roofOnlyCells:0,inputRoofObjects:Array.isArray(input.roofPaths)?input.roofPaths.length:0,intersectingRoofObjects:0,includedRoofComponents:0,excludedRoofComponents:0},regions:{mapOnlyPaths:[],roofOnlyPaths:[],overlapPaths:[]},interpretation:'No valid map/image comparison was calculated.',limitations:[...limitations]};
}
function unavailable(out:ImageryCrosscheck,reason:string,message:string):ImageryCrosscheck{
 return{...out,status:'unavailable',reason,footprintCoveredByRoofPct:null,regions:{mapOnlyPaths:[],roofOnlyPaths:[],overlapPaths:[]},interpretation:message};
}

function parsePath(path:string,width:number,height:number,budget:{vertices:number}):Ring[]{
 if(typeof path!=='string'||!path.length||path.length>MAX_INPUT_CHARS)throw Error('Invalid path');
 const tokenPattern=/[MLZ]|-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g;
 const tokens:string[]=[];let offset=0;
 for(const match of path.matchAll(tokenPattern)){
  if(!/^[\s,]*$/.test(path.slice(offset,match.index)))throw Error('Invalid path syntax');
  tokens.push(match[0]);offset=match.index!+match[0].length;
 }
 if(!/^[\s,]*$/.test(path.slice(offset)))throw Error('Invalid path syntax');
 const rings:Ring[]=[];let current:Ring|null=null;
 for(let i=0;i<tokens.length;){
  const command=tokens[i++];
  if(command==='Z'){
   if(!current||current.length<3)throw Error('Invalid ring');
   const first=current[0],last=current.at(-1)!;
   if(first[0]!==last[0]||first[1]!==last[1])current.push([...first]);
   rings.push(current);current=null;continue;
  }
  if(!['M','L'].includes(command)||i+1>=tokens.length||(command==='M'&&current)||(command==='L'&&!current))throw Error('Invalid path command');
  const x=Number(tokens[i++]),y=Number(tokens[i++]);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>width||y<0||y>height)throw Error('Invalid coordinates');
  if(++budget.vertices>MAX_VERTICES)throw Error('Path complexity exceeded');
  if(command==='M')current=[];
  current!.push([x,y]);
 }
 if(current||!rings.length)throw Error('Unclosed path');
 return rings;
}
function raster(rings:Ring[],width:number,height:number,budget:{crossings:number}):Uint8Array{
 const cells=new Uint8Array(GRID*GRID),sx=width/GRID,sy=height/GRID;
 const byRow=Array.from({length:GRID},()=>[] as number[]);
 // Exact same cell-centre fill, but visit an edge only on rows it crosses.
 // Dense one-pixel SAM contours must not cost vertices × all 256 grid rows.
 for(const ring of rings)for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i];if(a[1]===b[1])continue;
  const first=Math.max(0,Math.ceil(Math.min(a[1],b[1])/sy-.5)),end=Math.min(GRID,Math.ceil(Math.max(a[1],b[1])/sy-.5));
  budget.crossings+=Math.max(0,end-first);if(budget.crossings>MAX_ROW_CROSSINGS)throw Error('Raster complexity exceeded');
  for(let row=first;row<end;row++){const y=(row+.5)*sy;byRow[row].push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
 }
 for(let row=0;row<GRID;row++){
  const crossings=byRow[row];
  crossings.sort((a,b)=>a-b);
  if(crossings.length%2)throw Error('Unpaired path crossings');
  for(let i=0;i<crossings.length;i+=2){
   const start=Math.max(0,Math.ceil(crossings[i]/sx-.5)),end=Math.min(GRID,Math.ceil(crossings[i+1]/sx-.5));
   if(end>start)cells.fill(1,row*GRID+start,row*GRID+end);
  }
 }
 return cells;
}
function includeTouchingComponents(mask:Uint8Array,target:Uint8Array,union:Uint8Array,counts:Counts):boolean{
 const queue=new Uint32Array(GRID*GRID);let objectIncluded=false;
 for(let start=0;start<mask.length;start++){
  if(mask[start]!==1)continue;
  let head=0,tail=1,touches=false;queue[0]=start;mask[start]=2;
  while(head<tail){
   const index=queue[head++],column=index%GRID;
   if(target[index])touches=true;
   for(const neighbor of [column?index-1:-1,column<GRID-1?index+1:-1,index>=GRID?index-GRID:-1,index<mask.length-GRID?index+GRID:-1]){
    if(neighbor>=0&&mask[neighbor]===1){mask[neighbor]=2;queue[tail++]=neighbor;}
   }
  }
  if(touches){counts.includedRoofComponents++;objectIncluded=true;for(let i=0;i<tail;i++)union[queue[i]]=1;}
  else counts.excludedRoofComponents++;
 }
 return objectIncluded;
}
type Rect={left:number;right:number;top:number;bottom:number};
/** Vertically merge identical horizontal grid runs. These are approximate
 * grid-cell rectangles, expressed in the original image's pixel coordinates. */
function regionPath(cells:Uint8Array,value:number,width:number,height:number):string{
 let open=new Map<string,Rect>();const rectangles:Rect[]=[];
 for(let y=0;y<=GRID;y++){
  const next=new Map<string,Rect>();
  for(let x=0;y<GRID&&x<GRID;){
   if(cells[y*GRID+x]!==value){x++;continue;}
   const left=x;while(x<GRID&&cells[y*GRID+x]===value)x++;
   const key=`${left}:${x}`,prior=open.get(key);
   next.set(key,prior?{...prior,bottom:y+1}:{left,right:x,top:y,bottom:y+1});
  }
  for(const[key,rect]of open)if(!next.has(key))rectangles.push(rect);
  open=next;
 }
 const n=(value:number)=>Number(value.toFixed(3)),sx=width/GRID,sy=height/GRID;let path='';
 for(const rect of rectangles){const l=n(rect.left*sx),r=n(rect.right*sx),t=n(rect.top*sy),b=n(rect.bottom*sy);path+=`M${l} ${t}L${r} ${t}L${r} ${b}L${l} ${b}Z`;if(path.length>MAX_OUTPUT_CHARS)throw Error('Output complexity exceeded');}
 return path;
}

export function crosscheckImagery(input:Input):ImageryCrosscheck{
 const out=initial(input);
 if(!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<1||input.height<1||input.width>2048||input.height>2048)return unavailable(out,'invalid_dimensions','The image dimensions could not support a bounded comparison.');
 if(input.roofStatus==='error')return unavailable(out,'roof_analysis_unavailable','Roof segmentation was unavailable; no overlap or difference was inferred.');
 if(input.roofStatus==='not_detected')return unavailable(out,'no_roof_detection','SAM returned no roof detection. This does not establish that the mapped building or roof is absent.');
 if(input.roofStatus!=='detected'||!Array.isArray(input.footprintPaths)||!input.footprintPaths.length||input.footprintPaths.length>256||!Array.isArray(input.roofPaths)||!input.roofPaths.length||input.roofPaths.length>32)return unavailable(out,'invalid_geometry','No valid pair of footprint and roof-mask paths was available to compare.');
 try{
  if([...input.footprintPaths,...input.roofPaths].some(path=>typeof path!=='string')||[...input.footprintPaths,...input.roofPaths].reduce((sum,path)=>sum+path.length,0)>MAX_INPUT_CHARS)throw Error('Input complexity exceeded');
  const budget={vertices:0},footprints=input.footprintPaths.map(path=>parsePath(path,input.width,input.height,budget)),roofs=input.roofPaths.map(path=>parsePath(path,input.width,input.height,budget));
  const target=new Uint8Array(GRID*GRID),roof=new Uint8Array(GRID*GRID),rasterBudget={crossings:0};
  for(const rings of footprints){const cells=raster(rings,input.width,input.height,rasterBudget);for(let i=0;i<target.length;i++)if(cells[i])target[i]=1;}
  out.counts.targetCells=target.reduce((sum,value)=>sum+value,0);
  if(!out.counts.targetCells)return unavailable(out,'target_below_grid_resolution','The mapped footprint contains no sample-cell centres at this grid resolution; no percentage was reported.');
  for(const rings of roofs)if(includeTouchingComponents(raster(rings,input.width,input.height,rasterBudget),target,roof,out.counts))out.counts.intersectingRoofObjects++;
  const classes=new Uint8Array(GRID*GRID);
  for(let i=0;i<classes.length;i++){
   if(target[i]&&roof[i]){classes[i]=3;out.counts.overlapCells++;}
   else if(target[i]){classes[i]=1;out.counts.mapOnlyCells++;}
   else if(roof[i]){classes[i]=2;out.counts.roofOnlyCells++;}
  }
  const paths=[1,2,3].map(value=>regionPath(classes,value,input.width,input.height));
  if(paths.reduce((sum,path)=>sum+path.length,0)>MAX_OUTPUT_CHARS)throw Error('Output complexity exceeded');
  out.regions={mapOnlyPaths:paths[0]?[paths[0]]:[],roofOnlyPaths:paths[1]?[paths[1]]:[],overlapPaths:paths[2]?[paths[2]]:[]};
  out.footprintCoveredByRoofPct=Math.round(out.counts.overlapCells/out.counts.targetCells*1000)/10;
  out.status=out.counts.overlapCells?'compared':'no_intersecting_roof';out.reason=out.status;
  out.interpretation=out.status==='compared'?`${out.footprintCoveredByRoofPct}% of the mapped footprint's sampled cell centres overlap included roof-mask regions. The denominator is the selected footprint, not all roofs or the full image. This is a grid comparison, not a verified roof boundary.`:'No returned roof-mask component intersects the selected footprint at this grid resolution. Map-only highlighting is a representation mismatch, not evidence that the building or roof is absent.';
  return out;
 }catch{return unavailable(out,'invalid_or_complex_geometry','The paths could not be compared within the bounded geometry and display limits. No partial percentage or difference overlay was accepted.');}
}

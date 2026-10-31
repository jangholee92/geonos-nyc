import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module={exports:{} as typeof import('../lib/imagery-crosscheck')};
const source=readFileSync(new URL('../lib/imagery-crosscheck.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new vm.Script(code).runInNewContext({module,exports:module.exports,require:()=>{throw Error('The comparison must remain pure');},fetch:()=>{throw Error('No network requests permitted');}});
const {crosscheckImagery}=module.exports;
const rect=(left:number,top:number,right:number,bottom:number)=>`M${left} ${top}L${right} ${top}L${right} ${bottom}L${left} ${bottom}Z`;
const compare=(footprintPaths:string[],roofPaths:string[],roofStatus:'detected'|'not_detected'|'error'='detected')=>crosscheckImagery({width:768,height:768,footprintPaths,roofPaths,roofStatus});
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value));

test('known half overlap uses the selected footprint denominator and original image coordinates',()=>{
 const out=compare([rect(0,0,300,300)],[rect(150,0,450,300)]);
 assert.equal(out.kind,'imagery_crosscheck');assert.equal(out.status,'compared');assert.equal(out.footprintCoveredByRoofPct,50);
 assert.equal(out.grid.method,'cell-center even-odd raster');assert.equal(out.grid.width,256);assert.equal(out.grid.height,256);assert.equal(out.grid.cellWidthPx,3);assert.equal(out.grid.cellHeightPx,3);
 assert.equal(out.counts.targetCells,10000);assert.equal(out.counts.overlapCells,5000);assert.equal(out.counts.mapOnlyCells,5000);assert.equal(out.counts.roofOnlyCells,5000);
 assert.equal(out.regions.mapOnlyPaths[0],rect(0,0,150,300));assert.equal(out.regions.roofOnlyPaths[0],rect(300,0,450,300));assert.equal(out.regions.overlapPaths[0],rect(150,0,300,300));
 assert.match(out.interpretation,/denominator is the selected footprint/);assert.match(out.limitations.join(' '),/not segmentation accuracy/);
});

test('whole-image agreement is bounded and is not promoted to verified roof identity or condition',()=>{
 const out=compare([rect(0,0,768,768)],[rect(0,0,768,768)]);
 assert.equal(out.footprintCoveredByRoofPct,100);assert.equal(out.counts.targetCells,65536);assert.equal(out.counts.overlapCells,65536);assert.equal(out.counts.mapOnlyCells,0);assert.equal(out.counts.roofOnlyCells,0);
 assert.equal(out.regions.mapOnlyPaths.length,0);assert.equal(out.regions.roofOnlyPaths.length,0);assert.match(out.limitations.join(' '),/high overlap also does not verify identity/);
});

test('nearby roofs and disconnected neighbors inside one SAM object are excluded from roof-only difference',()=>{
 const out=compare([rect(0,0,300,300)],[rect(150,0,450,300)+rect(600,600,750,750),rect(500,0,750,150)]);
 assert.equal(out.footprintCoveredByRoofPct,50);assert.equal(out.counts.inputRoofObjects,2);assert.equal(out.counts.intersectingRoofObjects,1);assert.equal(out.counts.includedRoofComponents,1);assert.equal(out.counts.excludedRoofComponents,2);
 assert.equal(out.counts.roofOnlyCells,5000);assert.equal(out.regions.roofOnlyPaths[0],rect(300,0,450,300));
 assert.match(out.limitations.join(' '),/shared or neighboring roof/);assert.match(out.limitations.join(' '),/Neither establishes a missing, new or unmapped building/);
});

test('a roof that only touches the mapped edge has no sampled intersection and cannot create an image-only region',()=>{
 const out=compare([rect(0,0,300,300)],[rect(300,0,450,300)]);
 assert.equal(out.status,'no_intersecting_roof');assert.equal(out.footprintCoveredByRoofPct,0);assert.equal(out.counts.overlapCells,0);assert.equal(out.counts.mapOnlyCells,10000);assert.equal(out.counts.roofOnlyCells,0);assert.equal(out.counts.excludedRoofComponents,1);
 assert.equal(out.regions.roofOnlyPaths.length,0);assert.equal(out.regions.mapOnlyPaths[0],rect(0,0,300,300));assert.match(out.interpretation,/not evidence that the building or roof is absent/);
});

test('footprint and mask holes preserve even-odd semantics instead of filling courtyards',()=>{
 const outer=rect(0,0,300,300),hole=rect(90,90,210,210);
 const matching=compare([outer+hole],[outer+hole]);assert.equal(matching.counts.targetCells,8400);assert.equal(matching.counts.overlapCells,8400);assert.equal(matching.counts.roofOnlyCells,0);assert.equal(matching.footprintCoveredByRoofPct,100);
 const roofWithoutHole=compare([outer+hole],[outer]);assert.equal(roofWithoutHole.counts.targetCells,8400);assert.equal(roofWithoutHole.counts.roofOnlyCells,1600);assert.equal(roofWithoutHole.regions.roofOnlyPaths[0],hole);
 const footprintWithoutHole=compare([outer],[outer+hole]);assert.equal(footprintWithoutHole.footprintCoveredByRoofPct,84);assert.equal(footprintWithoutHole.counts.mapOnlyCells,1600);assert.equal(footprintWithoutHole.regions.mapOnlyPaths[0],hole);
});

test('unions avoid double-counting overlapping footprints and repeated roof objects',()=>{
 const footprint=[rect(0,0,300,300),rect(150,0,450,300)],roofs=[rect(0,0,300,300),rect(0,0,300,300)];
 const before=JSON.stringify({footprint,roofs}),out=compare(footprint,roofs);
 assert.equal(out.counts.targetCells,15000);assert.equal(out.counts.overlapCells,10000);assert.equal(out.counts.mapOnlyCells,5000);assert.equal(out.footprintCoveredByRoofPct,66.7);assert.equal(out.counts.intersectingRoofObjects,2);assert.equal(out.counts.includedRoofComponents,2);
 assert.equal(JSON.stringify({footprint,roofs}),before);
});

test('no detection or a failed SAM request produces an unavailable comparison, never a false zero match',()=>{
 for(const status of ['not_detected','error'] as const){const out=compare([rect(0,0,300,300)],[],status);assert.equal(out.status,'unavailable');assert.equal(out.footprintCoveredByRoofPct,null);assert.deepEqual(plain(out.regions),{mapOnlyPaths:[],roofOnlyPaths:[],overlapPaths:[]});}
});

test('a below-grid target is unknown, while exact cell-centre boundaries use the disclosed fill convention',()=>{
 const small=compare([rect(0,0,1,1)],[rect(0,0,9,9)]);assert.equal(small.status,'unavailable');assert.equal(small.reason,'target_below_grid_resolution');assert.equal(small.footprintCoveredByRoofPct,null);
 const edge=compare([rect(1.5,1.5,4.5,4.5)],[rect(0,0,9,9)]);assert.equal(edge.counts.targetCells,1);assert.equal(edge.footprintCoveredByRoofPct,100);assert.equal(edge.regions.overlapPaths[0],rect(0,0,3,3));
});

test('out-of-image coordinates, malformed/injected paths and excessive complexity fail closed',()=>{
 for(const path of ['M0 0L800 0L1 1Z','M0 0L1 1','M0 0L1 1Z','M0 0L1 1L2 2Z<script>','M0 0C1 1 2 2 3 3Z','m0 0l1 1l2 2z','M0 0L1e309 0L2 2Z',rect(0,0,300,300).repeat(20000)]){
  const out=compare([rect(0,0,300,300)],[path]);assert.equal(out.status,'unavailable',path.slice(0,40));assert.equal(out.footprintCoveredByRoofPct,null);assert.equal(out.regions.mapOnlyPaths.length,0);
 }
 assert.equal(compare([rect(0,0,300,300)],Array(33).fill(rect(0,0,300,300))).status,'unavailable');
 assert.equal(crosscheckImagery({width:0,height:768,footprintPaths:[],roofPaths:[],roofStatus:'detected'}).reason,'invalid_dimensions');
});

test('diagonally touching mask components remain distinct under the explicit four-neighbor rule',()=>{
 const out=compare([rect(0,0,3,3)],[rect(0,0,3,3)+rect(3,3,6,6)]);
 assert.equal(out.counts.targetCells,1);assert.equal(out.counts.overlapCells,1);assert.equal(out.counts.roofOnlyCells,0);assert.equal(out.counts.includedRoofComponents,1);assert.equal(out.counts.excludedRoofComponents,1);assert.equal(out.footprintCoveredByRoofPct,100);
});

test('dense exact roof contours above the former quota produce the same grid comparison without simplifying geometry',()=>{
 const points:string[]=[];const steps=8000,n=(value:number)=>Number(value.toFixed(3));
 for(let i=0;i<steps;i++)points.push(`${n(i/steps*300)} 0`);
 for(let i=0;i<steps;i++)points.push(`300 ${n(i/steps*300)}`);
 for(let i=0;i<steps;i++)points.push(`${n(300-i/steps*300)} 300`);
 for(let i=0;i<steps;i++)points.push(`0 ${n(300-i/steps*300)}`);
 const dense='M'+points.join('L')+'Z';assert.ok(points.length>30000);assert.ok(dense.length>250000&&dense.length<500000);
 const out=compare([rect(0,0,300,300)],[dense]);assert.equal(out.status,'compared');assert.equal(out.footprintCoveredByRoofPct,100);assert.equal(out.counts.targetCells,10000);assert.equal(out.counts.overlapCells,10000);assert.equal(out.regions.overlapPaths[0],rect(0,0,300,300));
});

test('a compact adversarial path with excessive full-height crossings fails before unbounded raster work',()=>{
 const zigzag='M0 0'+Array.from({length:9000},(_,i)=>i%2?'L0 0':'L300 768').join('')+'Z';
 const out=compare([rect(0,0,300,300)],[zigzag]);assert.equal(out.status,'unavailable');assert.equal(out.reason,'invalid_or_complex_geometry');assert.equal(out.footprintCoveredByRoofPct,null);assert.equal(out.regions.mapOnlyPaths.length,0);
});

test('slanted edges and courtyard holes match independent point-in-polygon samples after row indexing',()=>{
 type P=[number,number];
 const target:P[][]=[[[90,80],[430,190],[300,550],[60,400]],[[150,210],[190,220],[180,260]]];
 const roof=target.map(ring=>ring.map(([x,y]):P=>[x+24,y-18]));
 const path=(rings:P[][])=>rings.map(ring=>'M'+ring.map(([x,y])=>`${x} ${y}`).join('L')+'Z').join('');
 const inside=(x:number,y:number,rings:P[][])=>{
  let included=false;
  for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])included=!included;
  }
  return included;
 };
 const expected={targetCells:0,overlapCells:0,mapOnlyCells:0,roofOnlyCells:0};
 for(let row=0;row<256;row++)for(let col=0;col<256;col++){
  const x=(col+.5)*3,y=(row+.5)*3,a=inside(x,y,target),b=inside(x,y,roof);
  if(a)expected.targetCells++;if(a&&b)expected.overlapCells++;else if(a)expected.mapOnlyCells++;else if(b)expected.roofOnlyCells++;
 }
 const out=compare([path(target)],[path(roof)]);assert.equal(out.status,'compared');
 for(const key of Object.keys(expected) as Array<keyof typeof expected>)assert.equal(out.counts[key],expected[key],key);
 assert.equal(out.footprintCoveredByRoofPct,Math.round(expected.overlapCells/expected.targetCells*1000)/10);
});

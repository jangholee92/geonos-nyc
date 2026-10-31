import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function compile(react?:unknown){const module={exports:{} as Record<string,any>};const code=ts.transpileModule(readFileSync(new URL('../components/site-imagery-evidence.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new vm.Script(code).runInNewContext({module,exports:module.exports,URL,Date,require:(name:string)=>name==='react'&&react?react:name.endsWith('.css')?{}:require(name)});return module.exports;}
const component=compile();
// Synthetic renderer fixture only. This is not a SAM response or scientific result.
const fixture=()=>({kind:'site_imagery',id:'renderer-fixture',buildingId:'109855',address:'Renderer fixture',source:{label:'NYS 2024 orthoimagery',url:'https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer',captureYear:2024,capturePeriod:'Spring 2024',retrievedAt:'2026-10-28T22:00:00Z'},image:{dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:768,height:768,bounds:[-74.001,40.671,-73.999,40.673]},footprint:{paths:['M100 100L300 100L300 300L100 300Z'],note:'Official outline is context, not an image segmentation.'},analysis:{model:'sam-3.1',status:'completed',note:'AI-detected shapes in this image; review visually.'},concepts:[{concept:'roof',status:'detected',objectCount:1,paths:['M100 100L300 100L300 300L100 300ZM150 150L150 200L200 200L200 150Z'],note:'Visible roofs only.'},{concept:'trees',status:'detected',objectCount:1,paths:['M400 400L450 410L460 470L400 460Z'],note:'Visible tree shapes only.'}],limitations:['Spring imagery is not a measurement of summer canopy.']});
const render=(value:unknown)=>renderToStaticMarkup(createElement(component.default,{value}));
function descendants(element:any):any[]{if(Array.isArray(element))return element.flatMap(descendants);if(!element||typeof element!=='object')return[];return[element,...descendants(element.props?.children)];}

test('exact pixel paths preserve holes and reject scripts, curves, relative or out-of-image coordinates',()=>{
 const valid=['M0 0L768 0L768 768L0 768Z','M1,2L3,4L2,5ZM1.5 2.5L2 3L1 3Z','M1e2 1e2L200 100L200 200Z'];
 for(const path of valid)assert.equal(component.validImageryPath(path,768,768),true,path);
 for(const path of ['','M1 1L2 2','M1 1L2Z','M0 0L769 2L1 1Z','M-1 0L2 2L1 1Z','m1 1l2 2z','M0 0C0 1 2 3 4 5Z','M0 0L1e309 2L1 1Z','M0 0L1 1L2 2Z<script>','M0 0L1 1L2 2Z0 0','M1 1LL2 2Z','M0 0L2 2L1 1Z'.repeat(50000)])assert.equal(component.validImageryPath(path,768,768),false,path.slice(0,40));
});
test('imagery envelope rejects inconsistent analysis, counts and dimensions instead of drawing guessed masks',()=>{
 assert.ok(component.parseSiteImagery(fixture()));
 const bad=()=>fixture() as any;
 const cases:any[]=[null,{}, {...fixture(),kind:'model_image'}];
 let p=bad();p.image.dataUrl='data:image/svg+xml;base64,PHN2Zz4=';cases.push(p);
 p=bad();p.image.width=0;cases.push(p);p=bad();p.image.bounds=[-75,40.6,-74,40.7];cases.push(p);
 p=bad();p.concepts[0].objectCount=2;cases.push(p);p=bad();p.concepts[0].paths[0]='M0 0L900 0L1 1Z';cases.push(p);
 p=bad();p.concepts[0].status='not_detected';cases.push(p);p=bad();p.concepts[1].concept='roof';cases.push(p);
 p=bad();p.analysis.model='imagined-segmentation';cases.push(p);p=bad();p.analysis.status='unavailable';cases.push(p);
 p=bad();p.source.captureYear=null;cases.push(p);p=bad();p.source.retrievedAt='unknown';cases.push(p);
 for(const value of cases){assert.equal(component.parseSiteImagery(value),null);assert.equal(render(value),'');}
});
test('inline image keeps source aspect, exact returned paths, separate classes, source date and enlargement',()=>{
 const payload=fixture(),html=render(payload);assert.match(html,/width="768" height="768"/);assert.match(html,/viewBox="0 0 768 768"/);assert.match(html,/fill-rule="evenodd"/);assert.ok(html.includes(payload.concepts[0].paths[0]));assert.match(html,/fill="#f4ad8f"/);assert.match(html,/fill="#bbf56d"/);assert.match(html,/AI roof &amp; tree analysis · SAM 3\.1/);assert.match(html,/Spring 2024/);assert.match(html,/selected building’s official footprint/);assert.match(html,/Enlarge aerial image/);assert.match(html,/<dialog/);assert.doesNotMatch(html,/safe roof|healthy tree|summer canopy area|confidence/);
});
test('not-detected is distinct from unavailable and never becomes a claim that no trees exist',()=>{
 const p=fixture() as any;p.analysis.status='partial';p.concepts=[{concept:'roof',status:'not_detected',objectCount:0,paths:[],note:'No returned detection.'},{concept:'trees',status:'error',objectCount:0,paths:[],note:'SAM request failed.'}];const html=render(p);
 assert.match(html,/No roof detections/);assert.match(html,/Trees unavailable/);assert.doesNotMatch(html,/AI mask opacity|aria-pressed|No trees exist|no vegetation/);assert.match(html,/<img/);
});
test('only fixed official provenance links are active, and source text remains escaped',()=>{
 const p=fixture();p.source.url='https://attacker.example/source';p.address='<script>bad()</script>';p.source.label='<img src=x onerror=bad()>';const html=render(p);assert.doesNotMatch(html,/href=|<script>|<img src=x/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);
});
test('mask toggles and opacity change only overlays; an image dimension mismatch hides every mask',()=>{
 const slots:any[]=[];let cursor=0;const hooks={useMemo(fn:()=>unknown){return fn();},useState(initial:any){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(value:any)=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useId(){return'imagery-test';},useRef(){return{current:null};}};
 const c=compile(hooks),value=fixture(),draw=()=>{cursor=0;return c.default({value});};
 let tree=draw(),nodes=descendants(tree);const imageSrc=nodes.find(n=>n.type==='img').props.src;
 nodes.find(n=>n.type==='button'&&n.props['aria-pressed']===true).props.onClick();tree=draw();nodes=descendants(tree);assert.equal(nodes.find(n=>n.type==='button'&&n.props['aria-pressed']!==undefined).props['aria-pressed'],false);assert.equal(nodes.filter(n=>n.type==='g'&&n.props.fill==='#f4ad8f').length,0);assert.equal(nodes.find(n=>n.type==='img').props.src,imageSrc);
 nodes.find(n=>n.type==='input').props.onChange({target:{value:'0.2'}});tree=draw();nodes=descendants(tree);assert.equal(nodes.find(n=>n.type==='g'&&n.props.fill==='#bbf56d').props.fillOpacity,.2);
 nodes.find(n=>n.type==='img').props.onLoad({currentTarget:{naturalWidth:1,naturalHeight:1}});tree=draw();nodes=descendants(tree);assert.equal(nodes.filter(n=>n.type==='svg').length,0);assert.equal(nodes.filter(n=>n.type==='img').length,0);assert.ok(nodes.some(n=>n.props?.role==='status'));
});
test('one requested concept has its own completed or unavailable state, never an invented second analysis',()=>{
 const p=fixture();p.concepts=p.concepts.slice(0,1);assert.ok(component.parseSiteImagery(p));let html=render(p);assert.match(html,/AI roof analysis/);assert.doesNotMatch(html,/>Trees<|No tree detections|Trees unavailable/);
 p.analysis.status='unavailable';p.concepts=[{concept:'roof',status:'error',objectCount:0,paths:[],note:'Request unavailable.'}];assert.ok(component.parseSiteImagery(p));html=render(p);assert.match(html,/Roofs unavailable/);assert.doesNotMatch(html,/No roof detections/);
 p.analysis.status='partial';assert.equal(component.parseSiteImagery(p),null);
});

const crosscheckFixture=()=>({kind:'imagery_crosscheck',status:'compared',grid:{width:256,height:256,sourceWidth:768,sourceHeight:768,cellWidthPx:3,cellHeightPx:3,method:'cell-center even-odd raster'},footprintCoveredByRoofPct:75,counts:{targetCells:100,overlapCells:75,mapOnlyCells:25,roofOnlyCells:10,inputRoofObjects:3,intersectingRoofObjects:1,includedRoofComponents:1,excludedRoofComponents:2},regions:{mapOnlyPaths:['M100 100L130 100L130 130L100 130Z'],roofOnlyPaths:['M300 100L330 100L330 130L300 130Z'],overlapPaths:['M130 100L300 100L300 300L130 300Z']},interpretation:'Only detected roof components intersecting the selected outline are compared. Differences can reflect dates, alignment or segmentation.',limitations:['Cell-center grid approximation; no physical area or accuracy is calculated.'],reason:''});
test('comparison validates the denominator, grid and classifications without discarding the source image on failure',()=>{
 const valid=crosscheckFixture();assert.ok(component.parseImageryCrosscheck(valid,768,768));
 for(const change of [{footprintCoveredByRoofPct:90},{counts:{...valid.counts,mapOnlyCells:24}},{counts:{...valid.counts,overlapCells:101}},{grid:{...valid.grid,sourceWidth:512}},{grid:{...valid.grid,cellWidthPx:1}},{regions:{...valid.regions,roofOnlyPaths:['M0 0L769 0L1 1Z']}},{status:'no_intersecting_roof'}]){
  const crosscheck={...valid,...change};assert.equal(component.parseImageryCrosscheck(crosscheck,768,768),null);const parsed=component.parseSiteImagery({...fixture(),crosscheck});assert.ok(parsed);assert.equal(parsed.crosscheck,undefined);assert.doesNotMatch(render({...fixture(),crosscheck}),/Compare with map/);
 }
 const none={...valid,status:'no_intersecting_roof',footprintCoveredByRoofPct:0,counts:{...valid.counts,overlapCells:0,mapOnlyCells:100,roofOnlyCells:0,intersectingRoofObjects:0,includedRoofComponents:0},regions:{...valid.regions,roofOnlyPaths:[],overlapPaths:[]},interpretation:'No sampled roof component intersects the outline. This is not evidence that a roof is absent.'};assert.ok(component.parseImageryCrosscheck(none,768,768));
});
test('compare mode changes only overlays, exposes representation overlap, and restores original detections',()=>{
 const slots:any[]=[];let cursor=0;const hooks={useMemo(fn:()=>unknown){return fn();},useState(initial:any){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(value:any)=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useId(){return'compare-test';},useRef(){return{current:null};}};
 const c=compile(hooks),value={...fixture(),crosscheck:crosscheckFixture()},draw=()=>{cursor=0;return c.default({value});};
 let nodes=descendants(draw()),image=nodes.find(n=>n.type==='img').props.src;assert.equal(nodes.filter(n=>n.props?.['data-overlay']).length,0);assert.ok(nodes.some(n=>n.type==='g'&&n.props.fill==='#f4ad8f'));
 nodes.find(n=>n.type==='button'&&n.props.children==='Compare with map').props.onClick();let tree=draw();nodes=descendants(tree);assert.equal(nodes.find(n=>n.type==='img').props.src,image);assert.ok(nodes.some(n=>n.props?.['data-overlay']==='map-only'&&n.props.fill==='#efb85e'));assert.ok(nodes.some(n=>n.props?.['data-overlay']==='roof-only'&&n.props.fill==='#65dfeb'));assert.equal(nodes.filter(n=>n.type==='g'&&n.props.fill==='#f4ad8f').length,0);let html=renderToStaticMarkup(tree);assert.match(html,/75%/);assert.match(html,/of the mapped footprint overlaps a roof mask/);assert.match(html,/not accuracy or roof condition/);assert.doesNotMatch(html,/new building|unmapped building|verified roof/);
 nodes.find(n=>n.type==='button'&&n.props.children==='Detections').props.onClick();nodes=descendants(draw());assert.equal(nodes.filter(n=>n.props?.['data-overlay']).length,0);assert.ok(nodes.some(n=>n.type==='g'&&n.props.fill==='#f4ad8f'));assert.equal(nodes.find(n=>n.type==='img').props.src,image);
});
test('frontend accepts the real crosscheck module output for overlap, separated roofs and unavailable analysis',()=>{
 const module={exports:{} as Record<string,any>},code=ts.transpileModule(readFileSync(new URL('../lib/imagery-crosscheck.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new vm.Script(code).runInNewContext({module,exports:module.exports});
 const source=fixture(),input={width:768,height:768,footprintPaths:source.footprint.paths,roofPaths:source.concepts[0].paths,roofStatus:'detected'};
 for(const patch of [{},{roofPaths:['M600 600L700 600L700 700L600 700Z']},{roofStatus:'not_detected',roofPaths:[]},{roofStatus:'error',roofPaths:[]}]){
  const crosscheck=module.exports.crosscheckImagery({...input,...patch}),parsed=component.parseSiteImagery({...source,crosscheck});assert.ok(parsed?.crosscheck);assert.equal(parsed.crosscheck.status,crosscheck.status);assert.equal(parsed.crosscheck.footprintCoveredByRoofPct,crosscheck.footprintCoveredByRoofPct);
 }
});
test('complex returned roofs fit the expanded bound while oversized concepts and footprints still fail closed',()=>{
 const contour='M100 100L200 100L200 200L100 200Z',repeat=contour.repeat(Math.floor(500000/contour.length)),atLimit=repeat+' '.repeat(500000-repeat.length);
 assert.equal(atLimit.length,500000);assert.equal(component.validImageryPath(atLimit,768,768),true);assert.equal(component.validImageryPath(atLimit+' ',768,768),false);
 const p=fixture();p.concepts[0].paths=[atLimit];p.concepts[1].paths=[atLimit];assert.ok(component.parseSiteImagery(p));
 p.concepts[0].paths.push(contour);p.concepts[0].objectCount=2;assert.equal(component.parseSiteImagery(p),null);
 const footprintTooLarge=fixture();footprintTooLarge.footprint.paths=[contour.repeat(Math.ceil(20001/contour.length))];assert.equal(component.parseSiteImagery(footprintTooLarge),null);
});

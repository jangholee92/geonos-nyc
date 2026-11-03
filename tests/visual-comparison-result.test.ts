import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
type Obj=Record<string,any>;
const nativeRequire=createRequire(import.meta.url);
function compile(file:string,deps:Obj={},extra:Obj={}){const module={exports:{} as Obj},code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new vm.Script(code).runInNewContext({module,exports:module.exports,URL,Date,Intl,TextEncoder,TextDecoder,Uint8Array,Float64Array,Int32Array,Response,AbortController,AbortSignal,setTimeout,clearTimeout,require:(id:string)=>id==='./meta-paid-fetch'?{MetaSpendError:class extends Error{},fetchMetaPaid:(url:string,init:RequestInit)=>extra.fetch(url,init),settleMetaPaid:async()=>false}:Object.hasOwn(deps,id)?deps[id]:id.endsWith('.css')?{}:nativeRequire(id),...extra});return module.exports;}
const imagery=compile('../components/site-imagery-evidence.tsx'),component=compile('../components/visual-comparison-result.tsx',{'./site-imagery-evidence':imagery});
const cross=compile('../lib/imagery-crosscheck.ts'),sourceImagery=compile('../lib/site-imagery.ts'),comparison=compile('../lib/comparison-review.ts'),planner=compile('../lib/decision-plan.ts'),resilience=compile('../lib/resilience-brief.ts',{'./decision-plan':planner});
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8')),buildings=demo.buildings.slice(0,2),brief=resilience.buildResilienceBrief({buildings,contexts:demo.contexts,planningContext:null,intent:{focus:'comparison',purpose:'general'}});
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function site(b:Obj):Obj{
 const footprint=['M300 300L420 300L420 420L300 420Z'],roof=['M303 300L420 300L420 420L303 420Z'];
 return{kind:'site_imagery',id:`sam31:${b.id}:${'a'.repeat(64)}`,buildingId:b.id,address:b.address,source:{label:'NYS 2024 natural-color orthoimagery',url:'https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer',metadataUrl:'https://gis.ny.gov/2024-orthoimagery',exportUrl:'https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer/export',captureYear:2024,capturePeriod:'Spring 2024',publishedServiceResolutionM:.3048,resolutionNote:'Not finer native detail',retrievedAt:'2026-10-30T00:00:00Z',imageSha256:'a'.repeat(64)},image:{dataUrl:'data:image/png;base64,iVBORw0KGgo=',mimeType:'image/jpeg',width:768,height:768,bounds:[-74.01,40.7,-74,40.71]},bounds:{wgs84:[-74.01,40.7,-74,40.71],webMercator:[1,2,3,4],crs:'EPSG:3857',approximateGroundWidthM:256,approximateGroundPixelSizeM:1/3},footprint:{paths:footprint,source:'https://data.cityofnewyork.us/d/5zhs-2jue',editedAt:'2026-10-25',note:'Official outline is a geographic reference.'},analysis:{model:'sam-3.1',status:'completed',note:'SAM completed both analyses; Wonder receives summaries.'},concepts:[{concept:'roof',status:'detected',objectCount:1,paths:roof,note:'Model-detected regions.'},{concept:'trees',status:'detected',objectCount:1,paths:['M420 300L450 300L450 420L420 420Z'],note:'Not tree inventory.'}],crosscheck:cross.crosscheckImagery({width:768,height:768,footprintPaths:footprint,roofPaths:roof,roofStatus:'detected'}),limitations:['Spring imagery may not show leaf-on canopy.']};
}
async function result(partial=false){
 const lib=compile('../lib/visual-comparison.ts',{'./comparison-review':comparison,'./site-imagery':sourceImagery,'./site-segmentation':{inspectSiteImagery:async(b:Obj)=>{const v=site(b);if(partial&&b.id===buildings[1].id){v.analysis.status='partial';v.concepts[1]={concept:'trees',status:'error',objectCount:0,paths:[],note:'Unavailable, not absence.'};}return v;}}},{fetch:async(_url:string,init:RequestInit)=>{
  const packet=JSON.parse(JSON.parse(String(init.body)).messages[1].content),refs=(suffix:string)=>packet.sites[0].evidenceIds.filter((id:string)=>id.endsWith(suffix));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({lenses:[{lens:'roof',whatPicturesAdd:'Dated roof-mask hypotheses.',whatStillUnknown:'Condition requires inspection.',evidenceIds:refs(':roof')},{lens:'trees',whatPicturesAdd:'Sampled nearby tree-mask overlap.',whatStillUnknown:'Shade and ownership are unknown.',evidenceIds:refs(':tree_context')},{lens:'map_identity',whatPicturesAdd:'Map and image representation can be checked.',whatStillUnknown:'Identity and change are not established.',evidenceIds:refs(':map_identity')}],nextSurveyTargets:packet.surveyChecks.slice(0,2).map((c:Obj)=>({checkId:c.checkId,reason:'A current site survey can resolve this gap.'}))})}}]});
 }});
 return lib.compareSiteImagery(buildings,brief,'synthetic-key');
}
const render=(value:unknown)=>renderToStaticMarkup(createElement(component.default,{value}));
function descendants(element:any):any[]{if(Array.isArray(element))return element.flatMap(descendants);if(!element||typeof element!=='object')return[];return[element,...descendants(element.props?.children)];}

test('frontend accepts the actual backend helper contract and binds it to the current outer evidence',async()=>{
 const value=await result(),outer={evidence:buildings.map((b:Obj)=>({id:b.id})),citations:value.citations};
 assert.ok(component.parseVisualComparison(value,outer));assert.equal(component.parseVisualComparison(value,{...outer,evidence:[outer.evidence[0]]}),null);assert.equal(component.parseVisualComparison(value,{...outer,citations:outer.citations.slice(1)}),null);
 const html=render(value);assert.match(html,/What the aerial images add/);assert.match(html,/SAM 3\.1/);assert.match(html,/Muse Wonder summary review/);assert.match(html,/10 m band/);assert.match(html,/Not shade, cooling benefit or a resilience score/);assert.match(html,/typed summaries, not image pixels/);assert.match(html,/Sources and calculation/);
 assert.equal((html.match(/class="site-imagery-evidence"/g)||[]).length,1);assert.equal((html.match(/class="vcr-sites"/g)||[]).length,1);assert.doesNotMatch(html,/<details[^>]* open/);
});

test('image selection switches one active reusable overlay card without changing source values',async()=>{
 const slots:any[]=[];let cursor=0;const hooks={useMemo(fn:()=>unknown){return fn();},useState(initial:any){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];}};
 const c=compile('../components/visual-comparison-result.tsx',{'./site-imagery-evidence':imagery,react:hooks}),value=await result(),draw=()=>{cursor=0;return c.default({value});};
 let nodes=descendants(draw());let cards=nodes.filter(n=>n.type===imagery.default);assert.equal(cards.length,1);assert.equal(cards[0].props.value.buildingId,value.buildingIds[0]);
 const buttons=nodes.filter(n=>n.type==='button'&&n.props['aria-pressed']!==undefined);assert.equal(buttons.length,2);buttons[1].props.onClick();nodes=descendants(draw());cards=nodes.filter(n=>n.type===imagery.default);assert.equal(cards.length,1);assert.equal(cards[0].props.value.buildingId,value.buildingIds[1]);assert.equal(cards[0].props.value.image.dataUrl,value.visualEvidence[1].image.dataUrl);assert.equal(nodes.filter(n=>n.type==='button'&&n.props['aria-pressed']===true).length,1);
});

test('partial analysis is honest and cannot masquerade as a completed Wonder interpretation',async()=>{
 const value=await result(true);assert.ok(component.parseVisualComparison(value));const html=render(value);assert.match(html,/Review incomplete/);assert.match(html,/must complete before/);assert.doesNotMatch(html,/What to verify next|Wonder · summary-based interpretation/);
 const fake=clone(value);fake.status='completed';assert.equal(component.parseVisualComparison(fake),null);fake.reviewStatus='completed';assert.equal(component.parseVisualComparison(fake),null);
});

test('zero returned detections never become a tree-absence or zero-canopy claim',async()=>{
 const value=await result(true),tree=value.sites[0].treeContext;tree.status='not_detected';tree.sampledBandCells=null;tree.treeMaskCellsInBand=null;tree.detectedMaskCoveragePct=null;tree.interpretation='No returned tree region; canopy remains unknown.';value.visualEvidence[0].concepts[1]={concept:'trees',status:'not_detected',objectCount:0,paths:[],note:'No detection is not absence.'};
 const ref=value.citations.find((c:Obj)=>c.evidenceId===value.visualEvidence[0].id+':tree_context');ref.value=tree;
 assert.ok(component.parseVisualComparison(value));const html=render(value);assert.match(html,/No tree detection · unknown/);assert.doesNotMatch(html,/0% tree-mask overlap|no trees exist/i);
});

test('foreign IDs, invalid image masks, unsupported source provenance and internally inconsistent percentages are rejected',async()=>{
 const base=await result();const mutations=[(v:Obj)=>{v.buildingIds[1]=v.buildingIds[0];},(v:Obj)=>{v.sites.reverse();},(v:Obj)=>{v.visualEvidence[1].buildingId='999999';},(v:Obj)=>{v.visualEvidence[0].concepts[0].paths=['M0 0L900 0L1 1Z'];},(v:Obj)=>{v.visualEvidence[0].source.url='https://attacker.invalid';},(v:Obj)=>{v.visualEvidence[0].source.imageSha256='b'.repeat(64);},(v:Obj)=>{v.sites[0].treeContext.detectedMaskCoveragePct=101;},(v:Obj)=>{v.sites[0].treeContext.sampledBandCells=0;},(v:Obj)=>{v.visualEvidence[0].crosscheck.footprintCoveredByRoofPct=999;},(v:Obj)=>{v.review.sawPixels=true;},(v:Obj)=>{v.review.grounded=true;},(v:Obj)=>{v.review.lenses[0].evidenceIds=['foreign'];},(v:Obj)=>{v.review.nextSurveyTargets[0].checkId='invented_design';},(v:Obj)=>{v.review.nextSurveyTargets[0].buildingIds=['1','2'];}];
 for(const mutate of mutations){const v=clone(base);mutate(v);assert.equal(component.parseVisualComparison(v),null);assert.equal(render(v),'');}
});

test('all provider text is escaped and oversized envelopes do not render',async()=>{
 const value=await result();value.review.lenses[0].whatPicturesAdd='<img src=x onerror=bad()> & <script>bad()</script>';const html=render(value);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img src=x/);
 value.answer='x'.repeat(12001);assert.equal(component.parseVisualComparison(value),null);value.answer='Answer';value.citations.push(...Array.from({length:73},()=>value.citations[0]));assert.equal(component.parseVisualComparison(value),null);
});

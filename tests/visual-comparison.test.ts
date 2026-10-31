import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as parser from '@meta-sam/parser';
type Obj=Record<string,any>;
function compile(file:string,require:(id:string)=>unknown,extra:Obj={}){
 const module={exports:{} as Obj},code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new vm.Script(code).runInNewContext({module,exports:module.exports,require,Date,Intl,URL,TextEncoder,TextDecoder,Uint8Array,Int32Array,Float64Array,ArrayBuffer,Response,AbortSignal,AbortController,setTimeout,clearTimeout,...extra});return module.exports;
}
const pure=()=>{throw Error('Unexpected dependency');};
const planner=compile('../lib/decision-plan.ts',pure),resilience=compile('../lib/resilience-brief.ts',id=>id==='./decision-plan'?planner:pure());
const comparison=compile('../lib/comparison-review.ts',pure);
const imagery=compile('../lib/site-imagery.ts',pure);
const fixture=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
const buildings=fixture.buildings.slice(0,2);
const brief=resilience.buildResilienceBrief({buildings,contexts:fixture.contexts,planningContext:null,intent:{focus:'comparison',purpose:'cold_storage'}});
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function rectangle(x:number,y:number,w:number,h:number){return`M${x} ${y}L${x+w} ${y}L${x+w} ${y+h}L${x} ${y+h}Z`;}
function visual(id=buildings[0].id):Obj{return{
 kind:'site_imagery',id:`sam31:${id}:${'a'.repeat(64)}`,buildingId:id,address:buildings.find((b:Obj)=>b.id===id)?.address||'Synthetic site',
 source:{label:'NYS 2024 natural-color orthoimagery',url:'https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer',metadataUrl:'https://gis.ny.gov/2024-orthoimagery',exportUrl:'https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer/export',captureYear:2024,capturePeriod:'Spring 2024',publishedServiceResolutionM:.3048,resolutionNote:'Not new detail',retrievedAt:'2026-10-30T00:00:00Z',imageSha256:'a'.repeat(64)},
 image:{dataUrl:'data:image/jpeg;base64,SYNTHETIC_IMAGE_BYTES',mimeType:'image/jpeg',width:768,height:768,bounds:[-74.01,40.7,-74,40.71]},
 bounds:{wgs84:[-74.01,40.7,-74,40.71],webMercator:[1,2,3,4],crs:'EPSG:3857',approximateGroundWidthM:256,approximateGroundPixelSizeM:1/3},
 footprint:{paths:[rectangle(300,300,120,120)],source:'https://data.cityofnewyork.us/d/5zhs-2jue',editedAt:'2026-10-25',note:'Current map reference, not roof identity'},
 analysis:{model:'sam-3.1',status:'completed',note:'Both requested analyses completed; no pixel viewing by Wonder.'},
 concepts:[{concept:'roof',status:'detected',objectCount:1,paths:[rectangle(303,300,117,120)],note:'Crop-wide model regions, not verified identity.'},{concept:'trees',status:'detected',objectCount:1,paths:[rectangle(420,300,30,120)],note:'Crop-wide model regions, not trees counted.'}],
 crosscheck:{kind:'imagery_crosscheck',status:'compared',footprintCoveredByRoofPct:97.5,interpretation:'Approximate representation overlap, not accuracy.',limitations:['Source dates differ.'],regions:{mapOnlyPaths:['MAP_ONLY_PATH_BYTES'],roofOnlyPaths:[],overlapPaths:[]}},limitations:['Spring imagery may not show leaf-on canopy.','No condition or capacity is established.']};}
function validResponse(body:Obj){
 const packet=JSON.parse(body.messages[1].content);
 const ids=packet.sites.map((s:Obj)=>s.evidenceIds);
 return{lenses:[{lens:'roof',whatPicturesAdd:'Returned masks provide a dated roof-outline hypothesis for both selected sites.',whatStillUnknown:'Condition and capacity require a site survey.',evidenceIds:[ids[0].find((id:string)=>id.endsWith(':roof'))]},{lens:'trees',whatPicturesAdd:'The sampled band describes where returned tree masks overlap nearby image ground.',whatStillUnknown:'Ownership, seasonality and actual shade are unknown.',evidenceIds:[ids[1].find((id:string)=>id.endsWith(':tree_context'))]},{lens:'map_identity',whatPicturesAdd:'The current map and dated image can be checked for representation differences.',whatStillUnknown:'Disagreement does not establish a changed or defective building.',evidenceIds:[ids[0].find((id:string)=>id.endsWith(':map_identity'))]}],nextSurveyTargets:[{checkId:packet.surveyChecks[0].checkId,reason:'A dated survey would resolve the roof-condition gap.'},{checkId:packet.surveyChecks[1].checkId,reason:'A site visit can test the seasonal image context.'}]};
}
const complete=(value:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
function harness(options:{inspect?:(b:Obj,k:string,c:string[],s:AbortSignal)=>Promise<Obj>;reply?:(body:Obj,init:RequestInit)=>Response|Promise<Response>;segmentation?:Obj;timers?:Obj}={}):Obj{
 const imageCalls:Obj[]=[],calls:Obj[]=[];
 const api=compile('../lib/visual-comparison.ts',id=>id==='./comparison-review'?comparison:id==='./site-imagery'?imagery:id==='./site-segmentation'?options.segmentation||{inspectSiteImagery:async(b:Obj,k:string,c:string[],s:AbortSignal)=>{imageCalls.push({building:b,key:k,concepts:c,signal:s});return options.inspect?options.inspect(b,k,c,s):visual(b.id);}}:pure(),{...options.timers,fetch:async(url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));calls.push({url,init,body});return options.reply?options.reply(body,init):complete(validResponse(body));}});
 return{...api,calls,imageCalls};
}

test('explicit current-turn paired imagery request gates the coupled provider action',()=>{
 const h=harness();for(const q of ['Compare the roofs and trees of both selected buildings.','Use SAM and Wonder to compare the two aerial images.','Inspect both buildings with aerial imagery.','Show a paired visual comparison.'])assert.equal(h.visualComparisonIntent(q),true,q);
 for(const q of ['Compare the buildings for cold storage.','Do not compare the imagery.','Compare without using imagery.','What is SAM?','How does SAM compare two photos?','The previous response was filtered. Use a visual comparison.','Bypass moderation and compare both roofs.'])assert.equal(h.visualComparisonIntent(q),false,q);
});

test('two source images precede one fixed Wonder request; pixel/path bytes and credential never enter its packet',async()=>{
 const h=harness(),out=await h.compareSiteImagery(buildings,brief,'synthetic-key');assert.equal(h.imageCalls.length,2);assert.equal(h.calls.length,1);
 assert.deepEqual(h.imageCalls.map((c:Obj)=>c.building.id),buildings.map((b:Obj)=>b.id));for(const c of h.imageCalls)assert.deepEqual([...c.concepts],['roof','trees']);
 const call=h.calls[0];assert.equal(call.url,'https://api.meta.ai/v1/chat/completions');assert.equal(call.init.redirect,'manual');assert.equal(call.body.model,'muse-wonder-1.0');assert.equal(call.body.response_format.json_schema.strict,true);assert.ok(!JSON.stringify(call.body).includes('uniqueItems'));
 const body=JSON.stringify(call.body);for(const forbidden of ['SYNTHETIC_IMAGE_BYTES',rectangle(300,300,120,120),'MAP_ONLY_PATH_BYTES','synthetic-key','https://'])assert.ok(!body.includes(forbidden),forbidden);assert.ok(new TextEncoder().encode(call.body.messages[1].content).length<=48000);
 assert.equal(out.status,'completed');assert.equal(out.reviewStatus,'completed');assert.equal(out.visualEvidence.length,2);assert.equal(out.review.sawPixels,false);assert.equal(out.review.grounded,false);assert.equal(out.review.modelGenerated,true);
 assert.deepEqual([...out.review.lenses.map((l:Obj)=>l.lens)],['roof','trees','map_identity']);assert.equal(out.review.nextSurveyTargets[0].title,'Survey the roof and equipment');assert.match(out.answer,/not image pixels/);assert.equal(out.citations.length,brief.citations.length+8);
 assert.ok(out.citations.some((c:Obj)=>c.measurement==='sampled_tree_mask_context'&&c.value.status==='available'));
});

test('both image tasks start together and Wonder waits for both completed results',async()=>{
 const releases:Array<()=>void>=[];const h=harness({inspect:async b=>{await new Promise<void>(resolve=>releases.push(resolve));return visual(b.id);}});
 const pending=h.compareSiteImagery(buildings,brief,'key');await new Promise(resolve=>setImmediate(resolve));assert.equal(releases.length,2);assert.equal(h.calls.length,0);releases[1]();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.length,0);releases[0]();await pending;assert.equal(h.calls.length,1);
});

test('real SAM integration makes at most four parallel calls and one later Wonder call',async()=>{
 let active=0,maxActive=0;const pending:Array<()=>void>=[],samCalls:Obj[]=[];
 const cross=compile('../lib/imagery-crosscheck.ts',pure);
 const sam=compile('../lib/site-segmentation.ts',id=>id==='@meta-sam/parser'?parser:id==='./imagery-crosscheck'?cross:id==='./site-imagery'?{SiteImageryError:class extends Error{},fetchSiteImagery:async(b:Obj,signal:AbortSignal)=>{assert.ok(signal);const p=imagery.planSiteImagery(b),v=visual(b.id);return{image:v.image,bounds:p.bounds,target:p.target,source:v.source,limitations:v.limitations};}}:pure(),{fetch:async(_url:string,init:RequestInit)=>{
  const body=JSON.parse(String(init.body));samCalls.push(body);active++;maxActive=Math.max(maxActive,active);await new Promise<void>(resolve=>pending.push(resolve));active--;
  const encoded='<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=768;h=768|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>\n';
  return new Response([{type:'response.output_text.done',item_id:'i',output_index:0,content_index:0,text:encoded},{type:'response.completed'}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
 }});
 const h=harness({segmentation:sam}),promise=h.compareSiteImagery(buildings,brief,'synthetic-key');await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,4);assert.equal(maxActive,4);assert.equal(h.calls.length,0);for(const release of pending)release();const out=await promise;assert.equal(samCalls.length,4);assert.equal(h.calls.length,1);assert.equal(out.status,'completed');
});

test('one partial/error SAM analysis preserves actual images and never calls Wonder',async()=>{
 for(const state of ['partial','unavailable']){
  const h=harness({inspect:async b=>{const v=visual(b.id);if(b.id===buildings[1].id){v.analysis.status=state;v.concepts[1].status='error';v.concepts[1].paths=[];}return v;}}),out=await h.compareSiteImagery(buildings,brief,'key');
  assert.equal(out.status,'partial');assert.equal(out.visualEvidence.length,2);assert.equal(out.review,null);assert.equal(out.reviewStatus,'skipped_incomplete_images');assert.equal(h.calls.length,0);assert.match(out.answer,/not evidence of absence/);
 }
});

test('source-image failures preserve the other image and never switch to Wonder',async()=>{
 const h=harness({inspect:async b=>{if(b.id===buildings[1].id)throw Object.assign(new Error('private upstream text'),{code:'IMAGE_UNAVAILABLE'});return visual(b.id);}}),out=await h.compareSiteImagery(buildings,brief,'key');
 assert.equal(out.visualEvidence.length,1);assert.equal(out.sites[1].errorCode,'IMAGE_UNAVAILABLE');assert.equal(out.sites[1].treeContext,null);assert.equal(h.calls.length,0);assert.ok(!JSON.stringify(out).includes('private upstream'));
 const none=harness({inspect:async()=>{throw Error('private');}});assert.equal((await none.compareSiteImagery(buildings,brief,'key')).status,'unavailable');assert.equal(none.calls.length,0);
});

test('not-detected concepts remain unknown but count as completed provider responses',async()=>{
 const h=harness({inspect:async b=>{const v=visual(b.id);v.concepts=v.concepts.map((c:Obj)=>({...c,status:'not_detected',objectCount:0,paths:[]}));return v;}}),out=await h.compareSiteImagery(buildings,brief,'key');
 assert.equal(h.calls.length,1);assert.equal(out.sites[0].treeContext.status,'not_detected');assert.equal(out.sites[0].treeContext.detectedMaskCoveragePct,null);assert.match(out.sites[0].treeContext.interpretation,/remain unknown/);
});

test('invalid, duplicate, mismatched or unsupported native buildings fail before any source/provider request',async()=>{
 const h=harness();for(const [bs,br] of [[[buildings[0],buildings[0]],brief],[[...buildings].reverse(),brief],[[{...buildings[0],id:'p:3004880006'},buildings[1]],brief],[[{...buildings[0],geometry_quality:'invalid_or_placeholder'},buildings[1]],brief],[buildings,{...brief,citations:[]}]] as any[])await assert.rejects(()=>h.compareSiteImagery(bs,br,'key'));
 assert.equal(h.calls.length,0);assert.equal(h.imageCalls.length,0);
});

test('Wonder filters, redirects, malformed outputs and foreign citations retain images without retry or substitute prose',async()=>{
 const replies=[()=>Response.json({error:{code:'content_policy_violation',message:'private synthetic-key'}},{status:400}),()=>new Response(null,{status:302,headers:{Location:'https://elsewhere.invalid'}}),()=>complete({made_up:'review'}),(body:Obj)=>{const value=validResponse(body);value.lenses[0].evidenceIds=['foreign'];return complete(value);},()=>Response.json({choices:[{finish_reason:'content_filter',message:{content:null,refusal:'private refusal'}}]})];
 for(const reply of replies){const h=harness({reply}),out=await h.compareSiteImagery(buildings,brief,'synthetic-key');assert.equal(h.calls.length,1);assert.equal(out.status,'partial');assert.equal(out.visualEvidence.length,2);assert.equal(out.review,null);assert.ok(['content_filtered','unavailable'].includes(out.reviewStatus));assert.ok(!out.answer.includes('private'));assert.ok(!out.answer.includes('synthetic-key'));}
});

test('duplicate lenses/checks, unrelated lens citations and incomplete output never produce a review',async()=>{
 const mutations=[(v:Obj)=>{v.lenses[2]=v.lenses[0];},(v:Obj)=>{v.nextSurveyTargets[1]=v.nextSurveyTargets[0];},(v:Obj)=>{v.lenses[0].evidenceIds=v.lenses[1].evidenceIds;},(v:Obj)=>{v.nextSurveyTargets[0].checkId='invented_engineering_design';},(v:Obj)=>{v.lenses[0].extra='x';}];
 for(const mutate of mutations){const h=harness({reply:body=>{const value=validResponse(body);mutate(value);return complete(value);}}),out=await h.compareSiteImagery(buildings,brief,'key');assert.equal(out.review,null);assert.equal(out.reviewErrorCode,'VISUAL_REVIEW_INVALID');}
});

test('parent cancellation before start and during source work stops the chain',async()=>{
 const pre=new AbortController();pre.abort();const before=harness();await assert.rejects(()=>before.compareSiteImagery(buildings,brief,'key',pre.signal),(e:Obj)=>e.code==='VISUAL_CANCELED');assert.equal(before.imageCalls.length,0);
 const parent=new AbortController();let canceled=0;const h=harness({inspect:async(_b,_k,_c,signal)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{canceled++;reject(Error('aborted'));},{once:true});})});
 const promise=h.compareSiteImagery(buildings,brief,'key',parent.signal);await new Promise(resolve=>setImmediate(resolve));parent.abort();await assert.rejects(promise,(e:Obj)=>e.code==='VISUAL_CANCELED');assert.equal(canceled,2);assert.equal(h.calls.length,0);
});

test('parent cancellation interrupts a stalled Wonder response body and cleans up the parent listener',async()=>{
 const parent=new AbortController();let added=0,removed=0,canceled=false;const add=parent.signal.addEventListener.bind(parent.signal),remove=parent.signal.removeEventListener.bind(parent.signal);
 parent.signal.addEventListener=((...args:any[])=>{added++;return(add as any)(...args);}) as any;parent.signal.removeEventListener=((...args:any[])=>{removed++;return(remove as any)(...args);}) as any;
 const h=harness({reply:()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){canceled=true;}}))});
 const promise=h.compareSiteImagery(buildings,brief,'key',parent.signal);await new Promise(resolve=>setImmediate(resolve));parent.abort();await assert.rejects(promise,(e:Obj)=>e.code==='VISUAL_CANCELED');assert.equal(canceled,true);assert.equal(added,removed);assert.equal(h.calls.length,1);
});

test('tree-band overlap equals an independent brute-force cell-center calculation',()=>{
 const v=visual(),h=harness(),out=h.treeContextForVisual(v);assert.equal(out.status,'available');assert.equal(out.approximateCellSizeM,1);
 let band=0,hit=0;
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  if(x>=100&&x<140&&y>=100&&y<140)continue;
  const nx=Math.max(100,Math.min(139,x)),ny=Math.max(100,Math.min(139,y));
  if((x-nx)**2+(y-ny)**2<=100){band++;if(x>=140&&x<150&&y>=100&&y<140)hit++;}
 }
 assert.equal(out.sampledBandCells,band);assert.equal(out.treeMaskCellsInBand,hit);assert.equal(out.detectedMaskCoveragePct,Math.round(hit/band*1000)/10);
 // Duplicate/overlapping model regions are unioned, not double counted.
 v.concepts[1].paths.push(v.concepts[1].paths[0]);assert.equal(h.treeContextForVisual(v).treeMaskCellsInBand,hit);
});

test('tree context retains footprint holes and multipart geometry without filling courtyards',()=>{
 const v=visual(),h=harness();v.footprint.paths=[rectangle(240,240,120,120)+rectangle(270,270,60,60),rectangle(450,450,30,30)];v.concepts[1].paths=[rectangle(270,270,60,60)];
 const out=h.treeContextForVisual(v);assert.equal(out.status,'available');assert.ok(out.treeMaskCellsInBand>0);assert.match(out.limitations[0],/courtyards/);
 // A filled courtyard is no longer outside the mapped footprint.
 v.footprint.paths=[rectangle(240,240,120,120),rectangle(450,450,30,30)];assert.equal(h.treeContextForVisual(v).treeMaskCellsInBand,0);
});

test('tree metrics are null for no detection, coarse/clipped/invalid shapes; detected masks outside band give qualified zero',()=>{
 const h=harness();const cases:Obj[]=[];
 const none=visual();none.concepts[1].status='not_detected';none.concepts[1].paths=[];cases.push(none);
 const coarse=visual();coarse.bounds.approximateGroundWidthM=600;cases.push(coarse);
 const clipped=visual();clipped.footprint.paths=[rectangle(3,3,60,60)];cases.push(clipped);
 const injected=visual();injected.concepts[1].paths=['<script>alert(1)</script>'];cases.push(injected);
 const bad=visual();bad.footprint.paths=['M20 20L30 30'];cases.push(bad);
 for(const v of cases){const out=h.treeContextForVisual(v);assert.notEqual(out.status,'available');assert.equal(out.detectedMaskCoveragePct,null);assert.equal(out.sampledBandCells,null);}
 const distant=visual();distant.concepts[1].paths=[rectangle(600,600,30,30)];const out=h.treeContextForVisual(distant);assert.equal(out.status,'available');assert.equal(out.treeMaskCellsInBand,0);assert.match(out.interpretation,/Returned tree masks overlap 0%/);assert.match(out.limitations.join(' '),/not a tree inventory/);
});

test('source imagery propagates cancellation through a stalled body and cleans up parent listeners',async()=>{
 const parent=new AbortController();let calls=0,canceled=false,adds=0,removes=0;const add=parent.signal.addEventListener.bind(parent.signal),remove=parent.signal.removeEventListener.bind(parent.signal);
 parent.signal.addEventListener=((...args:any[])=>{adds++;return(add as any)(...args);}) as any;parent.signal.removeEventListener=((...args:any[])=>{removes++;return(remove as any)(...args);}) as any;
 const api=compile('../lib/site-imagery.ts',pure,{fetch:async(_url:string,init:RequestInit)=>{calls++;assert.ok(init.signal);return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([255,216]));},cancel(){canceled=true;}}),{headers:{'Content-Type':'image/jpeg'}});}});
 const promise=api.fetchSiteImagery(buildings[0],parent.signal);await new Promise(resolve=>setImmediate(resolve));parent.abort();await assert.rejects(promise,(e:Obj)=>e.code==='IMAGE_UNAVAILABLE');assert.equal(canceled,true);assert.equal(adds,removes);assert.equal(calls,1);
 await assert.rejects(()=>api.fetchSiteImagery(buildings[0],parent.signal));assert.equal(calls,1);
});

test('SAM cancellation stops every stalled stream; source-stage cancellation starts no paid calls',async()=>{
 let sourceSignal:AbortSignal|undefined,paid=0,streamCancels=0;
 const cross=compile('../lib/imagery-crosscheck.ts',pure),parent=new AbortController();
 const sam=compile('../lib/site-segmentation.ts',id=>id==='@meta-sam/parser'?parser:id==='./imagery-crosscheck'?cross:id==='./site-imagery'?{SiteImageryError:class extends Error{},fetchSiteImagery:async(b:Obj,s:AbortSignal)=>{sourceSignal=s;const p=imagery.planSiteImagery(b),v=visual(b.id);return{image:v.image,bounds:p.bounds,target:p.target,source:v.source,limitations:v.limitations};}}:pure(),{fetch:async()=>{paid++;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '));},cancel(){streamCancels++;}}),{headers:{'Content-Type':'text/event-stream'}});}});
 const promise=sam.inspectSiteImagery(buildings[0],'key',['roof','trees'],parent.signal);await new Promise(resolve=>setImmediate(resolve));assert.equal(sourceSignal,parent.signal);parent.abort();const out=await promise;assert.equal(out.analysis.status,'unavailable');assert.equal(paid,2);assert.equal(streamCancels,2);
 const pre=new AbortController();const noPaid=compile('../lib/site-segmentation.ts',id=>id==='@meta-sam/parser'?parser:id==='./imagery-crosscheck'?cross:id==='./site-imagery'?{SiteImageryError:class extends Error{},fetchSiteImagery:async(b:Obj)=>{pre.abort();const p=imagery.planSiteImagery(b),v=visual(b.id);return{image:v.image,bounds:p.bounds,target:p.target,source:v.source,limitations:v.limitations};}}:pure(),{fetch:async()=>{throw Error('Paid request must not start');}});await assert.rejects(()=>noPaid.inspectSiteImagery(buildings[0],'key',['roof','trees'],pre.signal),/canceled before segmentation/);
});

test('roof provenance retains six validated model references and appends both actual-site map references within the eight-reference display bound',async()=>{
 let supplied:string[]=[];
 const h=harness({reply:body=>{const value=validResponse(body),packet=JSON.parse(body.messages[1].content);supplied=[...packet.sites.flatMap((s:Obj)=>s.evidenceIds.filter((id:string)=>id.endsWith(':roof'))),...packet.publicData.evidence.slice(0,4).map((c:Obj)=>c.evidenceId)];assert.equal(supplied.length,6);value.lenses[0].evidenceIds=[...supplied];return complete(value);}});
 const out=await h.compareSiteImagery(buildings,brief,'key');assert.equal(out.status,'completed');const refs=[...out.review.lenses[0].evidenceIds];assert.equal(refs.length,8);assert.deepEqual(refs.slice(0,6),supplied);
 for(const b of buildings){const citation=out.citations.find((c:Obj)=>c.measurement==='map_image_representation'&&c.source.recordId===b.id);assert.ok(citation);assert.ok(refs.includes(citation.evidenceId));}
 assert.equal(new Set(refs).size,8);assert.equal(h.calls[0].body.response_format.json_schema.schema.properties.lenses.items.properties.evidenceIds.maxItems,6);assert.match(h.calls[0].body.messages[0].content,/overlap percentages only in the map_identity lens/);
});

test('already-cited map context is deduplicated; unsupported or excessive provider refs are rejected before augmentation',async()=>{
 const dedup=harness({reply:body=>{const value=validResponse(body),packet=JSON.parse(body.messages[1].content);value.lenses[0].evidenceIds.push(...packet.sites.flatMap((s:Obj)=>s.evidenceIds.filter((id:string)=>id.endsWith(':map_identity'))));return complete(value);}}),out=await dedup.compareSiteImagery(buildings,brief,'key');assert.equal(out.status,'completed');assert.equal(out.review.lenses[0].evidenceIds.length,3);assert.equal(new Set(out.review.lenses[0].evidenceIds).size,3);
 for(const foreign of [false,true]){const h=harness({reply:body=>{const value=validResponse(body),packet=JSON.parse(body.messages[1].content);value.lenses[0].evidenceIds=foreign?[value.lenses[0].evidenceIds[0],'invented-source']:[value.lenses[0].evidenceIds[0],...packet.publicData.evidence.slice(0,6).map((c:Obj)=>c.evidenceId)];return complete(value);}}),invalid=await h.compareSiteImagery(buildings,brief,'key');assert.equal(invalid.review,null);assert.equal(invalid.reviewErrorCode,'VISUAL_REVIEW_INVALID');assert.equal(h.calls.length,1);}
});

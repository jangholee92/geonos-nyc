import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as parser from '@meta-sam/parser';
type Obj = Record<string, any>;
const fixture = '<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=768;h=768|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>\n';
// The encoded mask is the official parser README's complete 5×5 example.
const sourceImage = {image:{dataUrl:'data:image/jpeg;base64,/9j/2Q==',mimeType:'image/jpeg',width:768,height:768},bounds:{wgs84:[-74.01,40.70,-74,40.71],webMercator:[1,2,3,4],crs:'EPSG:3857',approximateGroundWidthM:200,approximateGroundPixelSizeM:200/768},target:{id:'101',bin:'1000001',bbl:'1000010001',address:'Source address',footprintPixels:[[[[20,20],[40,20],[40,40],[20,20]],[[25,25],[30,25],[30,30],[25,25]]]],footprintSource:'https://data.cityofnewyork.us/d/5zhs-2jue',footprintEditedAt:'2026-10-25'},source:{label:'Official image fixture',url:'https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer',metadataUrl:'https://gis.ny.gov/2024-orthoimagery',exportUrl:'https://orthos.its.ny.gov/arcgis/rest/services/wms/2024/MapServer/export',captureYear:2024,capturePeriod:'Spring 2024',publishedServiceResolutionM:.3048,resolutionNote:'Not new detail',retrievedAt:'2026-10-28T00:00:00Z',imageSha256:'a'.repeat(64)},limitations:['Not live; image and footprint vintages differ.']};
function events(text=fixture, completed=true):Obj[]{
 return [{type:'response.output_text.delta',item_id:'i',output_index:0,content_index:0,delta:text.slice(0,20)},{type:'response.output_text.delta',item_id:'i',output_index:0,content_index:0,delta:text.slice(20)},{type:'response.output_text.done',item_id:'i',output_index:0,content_index:0,text},...(completed?[{type:'response.completed'}]:[])];
}
function stream(data:Obj[], split=43){
 const encoded=new TextEncoder().encode(data.map(value=>'data: '+JSON.stringify(value)+'\r\n\r\n').join(''));
 return new Response(new ReadableStream({start(controller){for(let i=0;i<encoded.length;i+=split)controller.enqueue(encoded.slice(i,i+split));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});
}
class TestMetaSpendError extends Error { code='META_SPEND_LIMIT'; status=429; constructor(){super('The shared AI demo budget has been reached.');} }
function harness(answer:(body:Obj,n:number)=>Response=()=>stream(events()),image=sourceImage){
 const calls:Obj[]=[];let imageCalls=0;
 const source=readFileSync(new URL('../lib/site-segmentation.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{} as Obj};
 const crossModule={exports:{} as Obj},crossCode=ts.transpileModule(readFileSync(new URL('../lib/imagery-crosscheck.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new vm.Script(crossCode).runInContext(vm.createContext({module:crossModule,exports:crossModule.exports}));
 const require=(name:string)=>name==='./meta-paid-fetch'?{MetaSpendError:TestMetaSpendError,fetchMetaPaid:(url:string,init:RequestInit)=>fetcher(url,init)}:name==='@meta-sam/parser'?parser:name==='./imagery-crosscheck'?crossModule.exports:name==='./site-imagery'?{SiteImageryError:class extends Error{},fetchSiteImagery:async()=>{imageCalls++;return image;}}:(()=>{throw Error(name)})();
 const fetcher=async(url:string,init:RequestInit)=>{
  assert.equal(url,'https://api.meta.ai/v1/responses');assert.equal((init.headers as Obj).Authorization,'Bearer test-key');assert.equal(init.redirect,'manual');assert.ok(init.signal);
  const body=JSON.parse(String(init.body));calls.push(body);return answer(body,calls.length);
 };
 new vm.Script(code).runInContext(vm.createContext({module,exports:module.exports,require,Response,TextDecoder,AbortSignal,fetch:fetcher}));
 return{sam:module.exports,calls,get imageCalls(){return imageCalls;}};
}
const building={id:'101',entity_type:'building',address:'Source address'};

test('real official parser decodes fragmented SSE into source-aligned paths; Muse summary omits pixels and masks',async()=>{
 const h=harness(),out=await h.sam.inspectSiteImagery(building,'test-key');
 assert.equal(h.imageCalls,1);assert.equal(h.calls.length,2);assert.deepEqual(h.calls.map(c=>c.input[0].content[0].text),['building roof','tree']);assert.ok(h.calls.every(c=>c.model==='sam-3.1'&&c.metadata.mask_encoding==='one_bit'));
 assert.equal(out.analysis.status,'completed');assert.equal(out.concepts[0].objectCount,1);assert.equal(out.concepts[0].paths[0].split('M').length,5);
 const coordinates=out.concepts[0].paths[0].match(/-?\d+(?:\.\d+)?/g).map(Number);assert.ok(coordinates.every((n:number,i:number)=>i%2===0?n>=10&&n<=15:n>=20&&n<=25));
 assert.equal(out.footprint.paths[0].split('M').length,3);assert.equal(out.source.imageSha256,'a'.repeat(64));assert.equal(out.image.dataUrl,sourceImage.image.dataUrl);
 const summary=JSON.stringify(h.sam.summarizeSiteImagery(out));assert.ok(!summary.includes('base64'));assert.ok(!summary.includes(out.concepts[0].paths[0]));assert.match(summary,/not in the Muse tool context/);
 assert.equal(out.crosscheck.kind,'imagery_crosscheck');assert.ok(!Object.hasOwn(h.sam.summarizeSiteImagery(out).crosscheck,'regions'));
 assert.ok(!summary.includes('objectCount'));assert.ok(!summary.includes('intersectingRoofObjects'));assert.ok(!summary.includes('includedRoofComponents'));assert.match(summary,/targetCells/);assert.match(summary,/edge-connected/);assert.equal(out.concepts[0].objectCount,1);
});
test('valid reordered and whitespace-separated SAM fields retain exact placement',async()=>{
 const text=fixture.replace('x1=10;y1=20;x2=14;y2=24;w=768;h=768','h = 768 ; x2=14; y2=24; x1=10; w = 768 ; y1=20');
 const h=harness(()=>stream(events(text))),out=await h.sam.inspectSiteImagery(building,'test-key',['roof']);assert.equal(out.analysis.status,'completed');assert.equal(out.concepts[0].status,'detected');
});
test('a valid complex roof contour over the former 90k quota remains exact and displayable',async()=>{
 const {mask,pathChars}=JSON.parse(readFileSync(new URL('./fixtures/sam-long-contour.json',import.meta.url),'utf8'));
 assert.ok(pathChars>90_000);assert.ok(pathChars<500_000);
 const text=`<0f>0<|box;x1=10;y1=20;x2=${10+mask.width-1};y2=${20+mask.height-1};w=768;h=768|><|mask;x=0;y=0;data=${mask.height},${mask.width},${mask.payload}|>\n`;
 const h=harness(()=>stream(events(text))),out=await h.sam.inspectSiteImagery(building,'test-key',['roof']);
 assert.equal(out.analysis.status,'completed');assert.equal(out.concepts[0].objectCount,1);assert.ok(out.concepts[0].paths[0].length>90_000);
 assert.equal(out.concepts[0].paths[0].match(/[MLZ]/g).length,parser.decodeMaskToSVGPath(mask).match(/[MLZ]/g)!.length);
});
test('real Meta content-part completion without deltas is validated before any mask allocation',async()=>{
 const done=(text:string)=>[{type:'response.content_part.done',item_id:'i',output_index:0,content_index:0,part:{type:'output_text',text}},{type:'response.completed'}];
 const h=harness(()=>stream(done(fixture))),out=await h.sam.inspectSiteImagery(building,'test-key',['roof']);assert.equal(out.concepts[0].status,'detected');
 const huge=harness(()=>stream(done(fixture.replace('data=5,5','data = 999999999 , 999999999')))),bad=await huge.sam.inspectSiteImagery(building,'test-key',['roof']);assert.equal(bad.concepts[0].status,'error');assert.match(bad.concepts[0].note,/dimensions exceeded the bounded/);
});
test('completed empty output is no detection, while incomplete/refused/malformed output is unavailable',async()=>{
 const empty=harness(()=>stream(events(''))),out=await empty.sam.inspectSiteImagery(building,'test-key',['trees']);assert.equal(out.analysis.status,'completed');assert.equal(out.concepts[0].status,'not_detected');assert.match(out.concepts[0].note,/does not establish/);
 for(const rows of[events(fixture,false),[{type:'response.failed',response:{error:{message:'raw provider secret'}}}],events('not a segmentation'),events(fixture.replace('QO(0lu8?','broken'))]){
  const h=harness(()=>stream(rows)),v=await h.sam.inspectSiteImagery(building,'test-key',['roof']);assert.equal(v.analysis.status,'unavailable');assert.equal(v.concepts[0].status,'error');assert.equal(v.concepts[0].paths.length,0);assert.match(v.analysis.note,/could not complete/);assert.ok(!JSON.stringify(v).includes('raw provider secret'));
 }
});
test('partial HTTP failure preserves successful concept and does not claim a missing concept is absent',async()=>{
 const h=harness((_,n)=>n===1?stream(events()):new Response('raw secret provider body',{status:429}));const out=await h.sam.inspectSiteImagery(building,'test-key');
 assert.equal(out.analysis.status,'partial');assert.equal(out.concepts[0].status,'detected');assert.equal(out.concepts[1].status,'error');assert.match(out.concepts[1].note,/429/);assert.ok(!JSON.stringify(out).includes('raw secret'));
});
test('SAM redirects are rejected without following them or forwarding the credential',async()=>{
 const h=harness(()=>new Response(null,{status:302,headers:{Location:'https://unexpected.invalid/collect'}}));
 const out=await h.sam.inspectSiteImagery(building,'test-key',['roof']);assert.equal(h.calls.length,1);assert.equal(out.analysis.status,'unavailable');assert.match(out.concepts[0].note,/HTTP 302/);assert.ok(!JSON.stringify(out).includes('unexpected.invalid'));
});
test('source dimension mismatches and huge masks are rejected before a usable image result',async()=>{
 for(const text of[fixture.replace('w=768','w=500'),fixture.replace('data=5,5','data=999999999,999999999'),fixture.replace('data=5,5','data = 999999999 , 999999999')]){
  const h=harness(()=>stream(events(text))),out=await h.sam.inspectSiteImagery(building,'test-key',['roof']);assert.equal(out.analysis.status,'unavailable');assert.equal(out.concepts[0].paths.length,0);assert.match(out.concepts[0].note,/dimensions/);
 }
});
test('the SAM stream byte cap applies before parser input and no arbitrary concepts or parcel targets run',async()=>{
 const h=harness(()=>new Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:'x'.repeat(2_000_001)})+'\n\n',{headers:{'Content-Type':'text/event-stream'}}));
 const out=await h.sam.inspectSiteImagery(building,'test-key',['roof']);assert.equal(out.concepts[0].status,'error');assert.match(out.concepts[0].note,/bounded analysis size/);
 for(const [record,concepts]of[[{...building,id:'p:1000010001'},['roof']],[building,['roof','roof']],[building,['pipe capacity']]]){
  const next=harness();await assert.rejects(next.sam.inspectSiteImagery(record,'test-key',concepts));assert.equal(next.imageCalls,0);assert.equal(next.calls.length,0);
 }
});

test('a spending denial cannot become an ordinary missing mask that invites another model turn',async()=>{
 const h=harness(()=>{throw new TestMetaSpendError();});await assert.rejects(()=>h.sam.inspectSiteImagery(building,'test-key',['roof']),(e:Obj)=>e instanceof TestMetaSpendError&&e.code==='META_SPEND_LIMIT');assert.equal(h.calls.length,1);
});

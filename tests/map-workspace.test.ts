import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {CityBuilding,CityQuery} from '../lib/city';

type Any=Record<string,any>;
type Node={type:any;props:Any};
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-sites.json',import.meta.url),'utf8'));
const buildings:CityBuilding[]=demo.buildings.slice(0,3);
const source=ts.transpileModule(readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8'),{fileName:'page.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const toolModule={exports:{} as Any};
new vm.Script(ts.transpileModule(readFileSync(new URL('../lib/meta-tool-actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText).runInNewContext({module:toolModule,exports:toolModule.exports});
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve!:(value:any)=>void,reject!:(error:unknown)=>void;const promise=new Promise<any>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function descendants(value:any):Node[]{if(!value)return[];if(Array.isArray(value))return value.flatMap(descendants);if(typeof value!=='object'||!('props'in value))return[];return[value,...descendants(value.props.children)];}
function content(value:any):string{if(value===null||value===undefined||typeof value==='boolean')return'';if(Array.isArray(value))return value.map(content).join('');return typeof value==='object'?content(value.props?.children):String(value);}

/** Execute the real page handlers with deterministic hook state and controlled source requests. */
function workspace(){
 const slots:any[]=[],effects:(()=>void)[]=[],assets:string[]=[],queries:{query:CityQuery;request:ReturnType<typeof deferred>}[]=[],resolutions:{descriptor:Any;request:ReturnType<typeof deferred>}[]=[],contextIds:string[]=[];
 let cursor=0,dirty=true,tree:Node;
 const changed=(a:any[]|undefined,b:any[]|undefined)=>!a||!b||a.length!==b.length||a.some((value,i)=>!Object.is(value,b[i]));
 const memo=(value:()=>any,deps?:any[])=>{const index=cursor++;if(!slots[index]||changed(slots[index].deps,deps))slots[index]={value:value(),deps};return slots[index].value;};
 const react={
  useState(initial:any){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],(value:any)=>{const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(slots[index],next)){slots[index]=next;dirty=true;}}];},
  useRef(initial:any){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];},
  useMemo:memo,useCallback:(value:any,deps:any[])=>memo(()=>value,deps),
  useEffect(effect:()=>void,deps:any[]){const index=cursor++;if(!slots[index]||changed(slots[index].deps,deps)){const previous=slots[index];slots[index]={deps};effects.push(()=>{previous?.cleanup?.();slots[index].cleanup=effect();});}},
  lazy(factory:()=>unknown){return String(factory).match(/@\/components\/([^"']+)/)?.[1]||'lazy';},Suspense:'Suspense',
 };
 const jsx=(type:any,props:Any)=>({type,props:props||{}});
 const module={exports:{} as Any};
 const require=(name:string):unknown=>{
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'Fragment'};
  if(name==='lucide-react')return new Proxy({}, {get:(_,key)=>String(key)});
  if(name.endsWith('.css'))return{};
  if(name.startsWith('@/components/'))return{__esModule:true,default:name.slice(13)};
  if(name==='@/lib/meta-tool-actions')return toolModule.exports;
  if(name==='@/lib/address-search')return{addressQuery:(entry:Any)=>entry.match?.bin||(/^\d{7}$|^\d{10}$/.test(entry.text)?entry.text:null)};
  if(name==='@/lib/city')return{BOROUGHS:{},validateQuery:(params:URLSearchParams)=>Object.fromEntries([...params].map(([key,value])=>[key,key==='bbox'?value.split(',').map(Number):['limit','cursor','page','minArea'].includes(key)?Number(value):value])),queryCity:(query:CityQuery)=>{const request=deferred();queries.push({query:plain(query),request});return request.promise;}};
  if(name==='@/lib/site-context')return{fetchSiteContext:(id:string)=>{contextIds.push(id);return new Promise(()=>{});}};
  if(name==='@/lib/borough-boundary')return{fetchBoroughBoundary:async()=>{assets.push('/data/boroughs.geojson.gzip');return{};}};
  if(name==='@/lib/map-selection')return{pickBuildingAtPoint:(rows:CityBuilding[],point:[number,number])=>rows.find(b=>b.longitude===point[0]&&b.latitude===point[1])};
  if(name==='@/lib/reviewed-plan')return{inspectReviewedPlan:(descriptor:Any)=>({ok:true,descriptor}),resolveReviewedPlan:(descriptor:Any)=>{const request=deferred();resolutions.push({descriptor:plain(descriptor),request});return request.promise;}};
  if(name==='@/lib/investigation-evidence')return{retainPlaceEvidence:(previous:Any)=>previous,selectedPlaceEvidence:()=>({})};
  throw Error('Unexpected import '+name);
 };
 new vm.Script(source,{filename:'app/page.tsx'}).runInContext(vm.createContext({module,exports:module.exports,require,URL,URLSearchParams,Blob,Date,console,setTimeout:()=>1,clearTimeout(){},window:{addEventListener(){},removeEventListener(){}},fetch:async(path:string)=>{assets.push(path);return{ok:true,json:async()=>path.endsWith('catalog.json')?{layers:[]}:{}};}}));
 const render=()=>{cursor=0;dirty=false;tree=module.exports.default();while(effects.length)effects.shift()!();return tree;};
 const nodes=()=>descendants(dirty?render():tree);
 const component=(name:string)=>{const node=nodes().find(n=>n.type===name);assert.ok(node,'Missing component '+name);return node.props;};
 const button=(label:string)=>{const node=nodes().find(n=>n.type==='button'&&(content(n.props.children).trim()===label||n.props['aria-label']===label));assert.ok(node,'Missing button '+label);return node.props;};
 const settle=async()=>{for(let i=0;i<8;i++){if(dirty)render();await Promise.resolve();}if(dirty)render();};
 const finishQuery=(index:number,rows:CityBuilding[],extra:Any={})=>queries[index].request.resolve({buildings:rows,query:queries[index].query,fetched_at:'2026-10-28T22:00:00Z',has_more:false,...extra});
 const finishResolution=(index:number,building:CityBuilding)=>resolutions[index].request.resolve({plan:resolutions[index].descriptor.plan,buildings:[building]});
 render();
 return{assets,queries,resolutions,contextIds,component,button,settle,finishQuery,finishResolution,search:()=>nodes().find(n=>n.type==='form'&&n.props.className==='mw-search')!.props.onSubmit({preventDefault(){}}),text:()=>content(dirty?render():tree)};
}

test('startup opens all NYC with no automatic sample query, demo focus or selected record',async()=>{
 const h=workspace();await h.settle();
 assert.deepEqual(h.assets.sort(),['/data/boroughs.geojson.gzip','/data/catalog.json','/data/citywide/overview_grid.json']);
 assert.equal(h.queries.length,0);assert.equal(h.resolutions.length,0);
 assert.equal(h.component('city-map').focusBorough,'all');assert.equal(h.component('city-map').focusBuilding,null);
 assert.equal(h.component('city-map').buildings.length,0);assert.equal(h.component('map-inspector').buildings.length,0);
 assert.deepEqual(plain(h.component('map-chat').query),{unit:'building',limit:200});
 h.button('Search records in this view').onClick();assert.deepEqual(h.queries[0].query.bbox,[-74.26,40.49,-73.69,40.92]);
});

test('native tile identity resolves a fresh full official record, without becoming a search result',async()=>{
 const h=workspace();await h.settle();const pending=h.component('city-map').onSelectId(buildings[0].id);
 assert.deepEqual(h.resolutions[0].descriptor,{plan:{intent:'understand',userQuestion:'Inspect selected building',requirements:[]},ids:[buildings[0].id]});
 assert.equal(h.component('map-inspector').buildings.length,0);
 h.finishResolution(0,buildings[0]);await pending;await h.settle();
 const actual=h.component('map-inspector').buildings[0];assert.equal(actual,buildings[0]);assert.equal(actual.geometry,buildings[0].geometry);
 assert.deepEqual(h.contextIds,[buildings[0].id]);assert.match(h.text(),/0 search results/);
 await h.component('city-map').onSelectId(buildings[0].id);await h.settle();assert.equal(h.resolutions.length,1);assert.equal(h.component('map-inspector').buildings.length,1);
});

test('rapid unseen native clicks resolve sequentially in A/B click order with visible pending state',async()=>{
 const h=workspace();await h.settle();
 h.component('city-map').onSelectId(buildings[0].id);h.component('city-map').onSelectId(buildings[1].id);
 assert.equal(h.resolutions.length,1);assert.match(h.text(),/Retrieving selections in click order/);
 h.finishResolution(0,buildings[0]);await h.settle();
 assert.deepEqual(plain(h.component('map-inspector').buildings.map((b:CityBuilding)=>b.id)),[buildings[0].id]);
 assert.equal(h.resolutions.length,2);assert.equal(h.resolutions[1].descriptor.ids[0],buildings[1].id);
 h.finishResolution(1,buildings[1]);await h.settle();
 assert.deepEqual(plain(h.component('map-inspector').buildings.map((b:CityBuilding)=>b.id)),buildings.slice(0,2).map(b=>b.id));
 assert.doesNotMatch(h.text(),/Retrieving/);assert.match(h.text(),/0 search results/);
});

test('an already-loaded second click waits for pending A instead of cancelling it',async()=>{
 const h=workspace();await h.settle();
 h.component('city-map').onSelectId(buildings[0].id);h.component('city-map').onSelect(buildings[1]);
 assert.equal(h.component('map-inspector').buildings.length,0);assert.equal(h.resolutions.length,1);
 h.finishResolution(0,buildings[0]);await h.settle();
 assert.deepEqual(plain(h.component('map-inspector').buildings.map((b:CityBuilding)=>b.id)),buildings.slice(0,2).map(b=>b.id));
 assert.equal(h.resolutions.length,1);
});

test('pending work keeps the active click and latest waiting choice, and duplicate clicks do not create requests',async()=>{
 const h=workspace();await h.settle();
 for(const b of [buildings[0],buildings[1],buildings[2],buildings[2],buildings[0]])h.component('city-map').onSelectId(b.id);
 assert.equal(h.resolutions.length,1);h.finishResolution(0,buildings[0]);await h.settle();
 assert.equal(h.resolutions.length,2);assert.equal(h.resolutions[1].descriptor.ids[0],buildings[2].id);
 h.finishResolution(1,buildings[2]);await h.settle();
 assert.deepEqual(plain(h.component('map-inspector').buildings.map((b:CityBuilding)=>b.id)),[buildings[0].id,buildings[2].id]);
});

test('clear or opening an evidence view cancels the active and queued selections without resurrection',async()=>{
 for(const action of ['clear','evidence']){
  const h=workspace();await h.settle();
  h.component('city-map').onSelectId(buildings[0].id);h.component('city-map').onSelectId(buildings[1].id);
  if(action==='clear')h.component('map-inspector').onClear();else h.button('Data & methods').onClick();
  await h.settle();assert.doesNotMatch(h.text(),/Retrieving/);
  h.finishResolution(0,buildings[0]);await h.settle();
  assert.equal(h.component('map-inspector').buildings.length,0);assert.equal(h.resolutions.length,1);assert.equal(h.contextIds.length,0);
 }
});

test('a cancelled queue cannot interfere with a newer native selection queue',async()=>{
 const h=workspace();await h.settle();
 h.component('city-map').onSelectId(buildings[0].id);h.component('city-map').onSelectId(buildings[1].id);h.component('map-inspector').onClear();
 h.component('city-map').onSelectId(buildings[2].id);assert.equal(h.resolutions.length,2);
 h.finishResolution(0,buildings[0]);await h.settle();assert.equal(h.component('map-inspector').buildings.length,0);assert.match(h.text(),/Retrieving the selected building/);
 h.finishResolution(1,buildings[2]);await h.settle();assert.equal(h.component('map-inspector').buildings[0].id,buildings[2].id);assert.doesNotMatch(h.text(),/Retrieving/);
});

test('failed or mismatched resolution preserves both selections; invalid IDs never reach a source',async()=>{
 const h=workspace();await h.settle();h.component('city-map').onSelect(buildings[0]);await h.settle();h.component('city-map').onSelect(buildings[1]);await h.settle();
 for(const id of ['p:3004880006','bin:3008210','0109855','1 OR 1=1',''])await h.component('city-map').onSelectId(id);
 assert.equal(h.resolutions.length,0);
 const pending=h.component('city-map').onSelectId(buildings[2].id);h.resolutions[0].request.reject(Error('Source unavailable'));await pending;await h.settle();
 assert.deepEqual(plain(h.component('map-inspector').buildings.map((b:CityBuilding)=>b.id)),buildings.slice(0,2).map(b=>b.id));assert.match(h.text(),/Source unavailable/);
 const mismatch=h.component('city-map').onSelectId(buildings[2].id);h.finishResolution(1,buildings[0]);await mismatch;await h.settle();
 assert.deepEqual(plain(h.component('map-inspector').buildings.map((b:CityBuilding)=>b.id)),buildings.slice(0,2).map(b=>b.id));assert.match(h.text(),/did not return the requested building/);
});

test('a newer search cancels an older tile lookup without confusing search results and selections',async()=>{
 const h=workspace();await h.settle();const pending=h.component('city-map').onSelectId(buildings[0].id);
 h.button('Search records in this view').onClick();h.finishQuery(0,[buildings[1]],{has_more:true});await h.settle();h.finishResolution(0,buildings[0]);await pending;await h.settle();
 assert.equal(h.component('map-inspector').buildings.length,0);assert.match(h.text(),/1 search result · more pages/);
 await h.component('city-map').onSelectId(buildings[1].id);await h.settle();assert.equal(h.resolutions.length,1);assert.equal(h.component('map-inspector').buildings[0].id,buildings[1].id);
});

test('a newer tile click prevents an older address search from auto-selecting or moving focus',async()=>{
 const h=workspace();await h.settle();h.component('address-picker').onChange({text:'3008210',match:null});await h.settle();
 const search=h.search();assert.equal(h.queries.length,1);assert.equal(h.queries[0].query.q,'3008210');
 const tile=h.component('city-map').onSelectId(buildings[1].id);h.finishQuery(0,[buildings[0]]);await search;await h.settle();
 assert.equal(h.component('map-inspector').buildings.length,0);assert.equal(h.component('city-map').focusBuilding,null);
 h.finishResolution(0,buildings[1]);await tile;await h.settle();assert.equal(h.component('map-inspector').buildings[0].id,buildings[1].id);assert.match(h.text(),/1 search result/);
});

test('known results use full records and a third distinct choice replaces B while keeping A',async()=>{
 const h=workspace();await h.settle();h.button('Search records in this view').onClick();h.finishQuery(0,buildings);await h.settle();
 for(const building of buildings){await h.component('city-map').onSelectId(building.id);await h.settle();}
 assert.equal(h.resolutions.length,0);assert.deepEqual(plain(h.component('map-inspector').buildings.map((b:CityBuilding)=>b.id)),[buildings[0].id,buildings[2].id]);assert.match(h.text(),/3 search results/);
});

test('point fallback selects the containing record without adding nearby rows to the search page',async()=>{
 const h=workspace();await h.settle();h.component('city-map').onMapPoint([buildings[0].longitude,buildings[0].latitude]);h.finishQuery(0,buildings);await h.settle();
 assert.equal(h.component('map-inspector').buildings[0].id,buildings[0].id);assert.match(h.text(),/0 search results/);
 assert.deepEqual(plain(h.component('city-map').buildings.map((b:CityBuilding)=>b.id)),[buildings[0].id]);
});


test('a failed first native lookup does not strand a valid queued choice or invent A facts',async()=>{
 const h=workspace();await h.settle();h.component('city-map').onSelectId(buildings[0].id);h.component('city-map').onSelectId(buildings[1].id);
 h.resolutions[0].request.reject(Error('First record is unavailable'));await h.settle();assert.equal(h.resolutions.length,2);assert.equal(h.component('map-inspector').buildings.length,0);
 h.finishResolution(1,buildings[1]);await h.settle();assert.equal(h.component('map-inspector').buildings[0].id,buildings[1].id);assert.match(h.text(),/First record is unavailable/);assert.doesNotMatch(h.text(),/Retrieving/);
});

test('an explicit reviewed plan cancels pending native clicks before committing its fresh records',async()=>{
 const h=workspace();await h.settle();h.component('city-map').onSelectId(buildings[0].id);h.component('city-map').onSelectId(buildings[1].id);
 const descriptor={plan:{intent:'understand',userQuestion:'Understand this building',requirements:[]},ids:[buildings[2].id]};
 const reviewed=h.component('map-chat').onApplyReviewed(descriptor);assert.equal(h.resolutions.length,2);
 h.finishResolution(0,buildings[0]);await h.settle();assert.equal(h.component('map-inspector').buildings.length,0);
 h.finishResolution(1,buildings[2]);await reviewed;await h.settle();assert.deepEqual(plain(h.component('map-inspector').buildings.map((b:CityBuilding)=>b.id)),[buildings[2].id]);assert.deepEqual(h.contextIds,[buildings[2].id]);
});

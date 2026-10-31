import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type {AddressEntry,AddressMatch} from '../lib/address-search';
const code=ts.transpileModule(readFileSync(new URL('../lib/address-search.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(fetcher:(url:URL,options:unknown)=>Promise<unknown>=async()=>{throw Error('Unexpected request');}){
 const module={exports:{}};
 new vm.Script(code).runInNewContext({module,exports:module.exports,URL,require:(id:string)=>{assert.equal(id,'./public-fetch');return{fetchPublicJson:fetcher};}});
 return module.exports as typeof import('../lib/address-search');
}
const api=load(),plain=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const feature=(bin:unknown='3338236',bbl:unknown='3028220001',label='211 LOMBARDY STREET, Brooklyn, NY, USA',extra:Record<string,unknown>={})=>({type:'Feature',geometry:{type:'Point',coordinates:[-73.932177,40.724258]},properties:{source:'nycpad',name:'211 LOMBARDY STREET',label,borough:'Brooklyn',confidence:.8,addendum:{pad:{bin,bbl,version:'26c'}},...extra}});
const collection=(features:unknown[])=>({type:'FeatureCollection',features});
const selected=(match:AddressMatch):AddressEntry=>({text:match.label,match});

test('official PAD identifiers resolve only after deliberate selection, never from confidence or coordinates',()=>{
 const matches=api.parseAddressMatches(collection([feature(),feature('3069706','3028150050','289 LOMBARDY STREET, Brooklyn, NY, USA',{confidence:1})]));
 assert.equal(matches.length,2);assert.equal(matches[0].id,'bin:3338236');
 assert.equal(api.addressQuery({text:matches[0].label,match:null}),null);
 assert.equal(api.addressQuery(selected(matches[0])),'3338236');
 assert.ok(!('confidence' in matches[0]));assert.ok(!('geometry' in matches[0]));
});

test('PAD aliases deduplicate by BIN, while different buildings on one tax lot remain distinct',()=>{
 const matches=api.parseAddressMatches(collection([
  feature('3069707','3028150060','259 LOMBARDY STREET, Brooklyn, NY, USA'),
  feature('3069707','3028150060','269 LOMBARDY STREET, Brooklyn, NY, USA'),
  feature('3069707','3028150060','271 LOMBARDY STREET, Brooklyn, NY, USA'),
  feature('3069708','3028150060','273 LOMBARDY STREET, Brooklyn, NY, USA'),
 ]));
 assert.equal(matches.length,2);assert.equal(matches[0].aliases?.length,2);
 assert.deepEqual(plain(api.duplicateAddressEntries(matches.map(selected))),[]);
});

test('duplicate compare entries are identified across address aliases and typed native IDs',()=>{
 const a=api.parseAddressMatches(collection([feature()]))[0];
 const alias=api.parseAddressMatches(collection([feature('3338236','3028220001','215 LOMBARDY STREET, Brooklyn, NY, USA')]))[0];
 const out=api.duplicateAddressEntries([selected(a),selected(alias),{text:'3338236',match:null}]);
 assert.deepEqual(plain(out),[{identity:'bin:3338236',indexes:[0,1,2]}]);
 // A tax lot and one of its buildings are not asserted to be equivalent here.
 assert.equal(api.duplicateAddressEntries([selected(a),{text:'3028220001',match:null}]).length,0);
});

test('editing a selected label invalidates its native identity, even if it still looks plausible',()=>{
 const match=api.parseAddressMatches(collection([feature()]))[0];
 assert.equal(api.addressQuery({text:'211 LOMBARDY STREET',match}),null);
 assert.equal(api.addressQuery({text:match.label.replace('211','289'),match}),null);
 assert.equal(api.addressQuery({text:match.label,match:{...match,id:'bin:3069706'}}),null);
 assert.equal(api.addressQuery({text:match.label,match:{...match,source:'Other service' as any}}),null);
});

test('native BIN and BBL entry remains explicit and rejects other strings',()=>{
 assert.equal(api.addressQuery({text:' 3338236 ',match:null}),'3338236');
 assert.equal(api.addressQuery({text:'3028220001',match:null}),'3028220001');
 for(const text of ['3338236 OR 1=1','9999999','3e6','3338236.0','211 Lombardy Street','3338236\nDROP'])assert.equal(api.addressQuery({text,match:null}),null,text);
 assert.equal(api.addressQuery(null as unknown as AddressEntry),null);
});

test('malformed service envelopes fail explicitly and oversized arrays are bounded',()=>{
 for(const data of [null,[],{}, {type:'FeatureCollection',features:{}},{type:'Point',features:[]},collection(Array(501).fill(null))])assert.throws(()=>api.parseAddressMatches(data),/unexpected response/);
});

test('malformed or non-PAD features cannot create a native identity',()=>{
 const payload=collection([null,{},feature(undefined,undefined),feature('not-a-bin','not-a-bbl'),feature([],{}),feature('3338236','3028220001',''),feature('3338236','3028220001','a'.repeat(241)),feature('3338236','3028220001','bad\u0000label'),feature('3338236','3028220001','Fake',{source:'other'}),{...feature(),type:'Point'}]);
 // Explicit undefined uses fixture defaults; replace that record with truly absent IDs.
 (payload.features[2] as any).properties.addendum.pad={};
 assert.equal(api.parseAddressMatches(payload).length,0);
});

test('BIN, BBL and recognized borough disagreements are rejected rather than guessed',()=>{
 const matches=api.parseAddressMatches(collection([feature('3338236','4028220001'),feature('3338236','3028220001','Wrong borough',{borough:'Queens'})]));
 assert.equal(matches.length,0);
});

test('missing BIN may resolve to an explicit BBL; numeric native IDs and bounded display fields are supported',()=>{
 const matches=api.parseAddressMatches(collection([feature(null,3028220001,'211 LOMBARDY STREET, Brooklyn, NY, USA',{name:{bad:'object'},borough:undefined}),feature(3069707,3028150060,'259 LOMBARDY STREET, Brooklyn, NY, USA')]));
 assert.equal(matches[0].id,'bbl:3028220001');assert.equal(matches[0].name,matches[0].label);assert.equal(matches[0].borough,'Brooklyn');
 assert.equal(api.addressQuery(selected(matches[0])),'3028220001');assert.equal(api.addressQuery(selected(matches[1])),'3069707');
});

test('the parser returns no more than eight identities and never sorts by confidence',()=>{
 const features=Array.from({length:20},(_,i)=>feature(String(3000100+i),'3028220001',`Address ${i}`,{confidence:i/20}));
 const matches=api.parseAddressMatches(collection(features));
 assert.equal(matches.length,8);assert.equal(matches[0].bin,'3000100');assert.equal(matches[7].bin,'3000107');
});

test('search requests use the fixed official endpoint, encoded text and public-fetch defaults',async()=>{
 const calls:{url:URL;options:any}[]=[];
 const adapter=load(async(url,options)=>{calls.push({url,options});return collection([feature()]);});
 await adapter.searchAddresses('211 Lombardy & size=100','search');
 assert.equal(calls.length,1);assert.equal(calls[0].url.origin,'https://geosearch.planninglabs.nyc');
 assert.equal(calls[0].url.pathname,'/v2/search');assert.equal(calls[0].url.searchParams.get('size'),'8');assert.equal(calls[0].url.searchParams.get('text'),'211 Lombardy & size=100');
 assert.equal(calls[0].options.timeoutMs,12000);assert.equal(calls[0].options.headers,undefined);
});

test('invalid modes, oversized queries and very short queries cannot issue requests',async()=>{
 let calls=0;const adapter=load(async()=>{calls++;return collection([]);});
 await assert.rejects(adapter.searchAddresses('211 Lombardy','../../other' as any),/endpoint/);
 await assert.rejects(adapter.searchAddresses('a'.repeat(121)),/120 characters/);
 await assert.rejects(adapter.searchAddresses(123 as any),/Enter an address/);
 assert.deepEqual(plain(await adapter.searchAddresses('abc')),[]);assert.equal(calls,0);
});

test('cached suggestions cannot be corrupted by a caller mutating returned objects',async()=>{
 let calls=0;const adapter=load(async()=>{calls++;return collection([feature()]);});
 const first=await adapter.searchAddresses('211 Lombardy');first[0].bin='3999999';first[0].aliases!.push('invented');first.push(first[0]);
 const second=await adapter.searchAddresses('211 lombardy');assert.equal(calls,1);assert.equal(second.length,1);assert.equal(second[0].bin,'3338236');assert.equal(second[0].aliases!.length,0);
 second[0].label='Changed';const third=await adapter.searchAddresses('211 Lombardy');assert.notEqual(third[0].label,'Changed');
});

test('provider errors remain failures rather than empty or fabricated successful matches',async()=>{
 const adapter=load(async()=>{throw Error('Provider unavailable');});
 await assert.rejects(adapter.searchAddresses('211 Lombardy'),/Provider unavailable/);
});

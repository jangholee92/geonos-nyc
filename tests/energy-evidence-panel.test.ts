import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
type Data=Record<string,any>;
function compile(path:string,resolve:(name:string)=>unknown){const module={exports:{} as Data};const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new vm.Script(code).runInNewContext({module,exports:module.exports,require:resolve,URL,Date});return module.exports;}
const quality=compile('../components/energy-source-qualifications.tsx',name=>require(name));
const energy=compile('../lib/energy-evidence.ts',()=>{throw Error('Unexpected energy import')});
const panel=compile('../components/energy-evidence-panel.tsx',name=>name==='./energy-source-qualifications'?quality:name==='@/lib/energy-evidence'?energy:name.endsWith('.css')?{}:require(name));
const render=(component:any,props:Data)=>renderToStaticMarkup(createElement(component,props));

test('the actual multi-lot parent report exposes estimated energy beside its retained 20.8 EUI',()=>{
 const shard=JSON.parse(readFileSync(new URL('../public/data/energy/400.json',import.meta.url),'utf8'));
 for(const bbl of ['4003120309','4003120315']){
  const records=shard.records[bbl],parent=records.find((r:Data)=>r.property_id==='2815580');
  assert.equal(parent.data_quality.estimated_values_energy,'Yes');assert.equal(parent.metrics.site_eui_kbtu_ft2,20.8);
  const html=render(panel.default,{building:{id:'p:'+bbl,bbl,bin:null},records,status:''});
  assert.match(html,/Reported energy includes estimated meter entries/);assert.match(html,/20\.8/);assert.match(html,/Estimated energy entries: Yes/);assert.match(html,/Native source qualifications/);assert.match(html,/Zero gross floor area alert/);assert.match(html,/Unable to Check \(not enough data\)/);assert.match(html,/No adjustment is made/);
  assert.ok(html.indexOf('Reported energy includes estimated meter entries')<html.indexOf('>20.8<'));
 }
});
test('native Possible Issue values are highlighted while No, Ok and unavailable checks keep their literal meaning',()=>{
 // Controlled flag fixture: not a claim about a particular property.
 const data={estimated_values_energy:'No',alert_energy_meter_has_less:'Possible Issue',alert_energy_meter_has_gaps:'Unable to Check (not enough data)',alert_gross_floor_area_is:'Ok'};
 const notice=render(quality.EnergyQualityNotice,{data}),details=render(quality.EnergyQualityDetails,{data});
 assert.match(notice,/Source qualifications need review/);assert.match(notice,/Meter coverage under 12 full calendar months: Possible Issue/);assert.doesNotMatch(notice,/Reported energy includes/);
 assert.match(details,/Unable to Check \(not enough data\)/);assert.match(details,/An unavailable check is not/);assert.doesNotMatch(details,/verified report|complete year confirmed/);
 const flags=quality.energyQualityFlags(data);assert.deepEqual(Array.from(flags,(r:Data)=>r.attention),[false,true,false,false]);
});
test('missing and malformed source flags do not become No, and untrusted flags remain escaped text',()=>{
 for(const value of [undefined,null,[],{estimated_values_energy:true},{estimated_values_energy:{html:'Yes'}}]){
  assert.equal(render(quality.EnergyQualityNotice,{data:value}),'');assert.match(render(quality.EnergyQualityDetails,{data:value}),/Not provided/);
 }
 const html=render(quality.EnergyQualityDetails,{data:{estimated_values_energy:'<img src=x onerror=alert(1)>'}});
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<script/);
});
test('conflicting report copies cannot turn one copy’s native flag into a resolved conclusion',()=>{
 const html=render(quality.EnergyQualityNotice,{data:{estimated_values_energy:'Yes'},conflicting:true});
 assert.match(html,/Conflicting report copies need review/);assert.match(html,/one returned copy/);assert.doesNotMatch(html,/Reported energy includes estimated meter entries/);
});

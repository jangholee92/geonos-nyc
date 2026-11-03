import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module={exports:{} as Record<string,any>};
const code=ts.transpileModule(readFileSync(new URL('../lib/meta-tool-actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new vm.Script(code).runInNewContext({module,exports:module.exports});
const {META_TOOLS,toolSelectionIssue,metaToolPrompt,stageToolDraft}=module.exports;
const plain=(value:any)=>JSON.parse(JSON.stringify(value));
test('seven functional tools have explicit selection requirements and local-model attribution',()=>{
 assert.deepEqual(plain(META_TOOLS.map((t:any)=>t.id)),['compare','aerial','change','review','visual','voice','private']);
 assert.equal(toolSelectionIssue('voice',[]),null);
 for(const tool of ['compare','review','visual','private']){assert.match(toolSelectionIssue(tool,['123']),/two buildings/);assert.equal(toolSelectionIssue(tool,['123','456']),null);}
 for(const tool of ['aerial','change']){assert.match(toolSelectionIssue(tool,[]),/Choose a building/);assert.equal(toolSelectionIssue(tool,['123']),null);}
 for(const ids of [['123','123'],['p:3000000001'],['abc'],['1','2','3']])assert.match(toolSelectionIssue('aerial',ids),/individual building outlines/);
 assert.match(META_TOOLS.find((t:any)=>t.id==='private').model,/Local/);
});
test('aerial launch adapts one and two buildings while historical imagery explicitly targets A',()=>{
 assert.match(metaToolPrompt('aerial',1),/first selected building/);assert.doesNotMatch(metaToolPrompt('aerial',1),/both selected/);
 assert.match(metaToolPrompt('aerial',2),/both selected buildings using SAM and Wonder/);
 assert.match(metaToolPrompt('change',2),/first selected building \(A\).*2020.*2024.*DINOv2/);
 for(const tool of ['compare','aerial','change','review','visual'])assert.ok(metaToolPrompt(tool,2).length<4000);
 assert.equal(metaToolPrompt('voice',0),null);assert.equal(metaToolPrompt('private',2),null);
});
test('tool presets replace only unchanged presets, preserve typed work, and never truncate it',()=>{
 assert.deepEqual(plain(stageToolDraft('','Inspect A',null)),{draft:'Inspect A',preset:'Inspect A',overflow:false});
 assert.equal(stageToolDraft('Inspect A','Compare A and B','Inspect A').draft,'Compare A and B');
 const typed='My loading-bay question';const appended=stageToolDraft(typed,'Inspect A',null);
 assert.equal(appended.draft,typed+'\n\nInspect A');assert.equal(appended.preset,null);
 assert.equal(stageToolDraft(appended.draft,'Inspect A',null).draft,appended.draft);
 const full='X'.repeat(3999);assert.deepEqual(plain(stageToolDraft(full,'Inspect A',null)),{draft:full,preset:null,overflow:true});
});

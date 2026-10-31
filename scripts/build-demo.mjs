import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
const modules=new Map();
function moduleAt(name){const absolute=path.resolve(name);if(modules.has(absolute))return modules.get(absolute);const m={exports:{}};modules.set(absolute,m.exports);const text=fs.readFileSync(absolute,'utf8');const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText;const req=(id)=>{const p=path.resolve(path.dirname(absolute),id);return id.endsWith('.json')?JSON.parse(fs.readFileSync(p,'utf8')):moduleAt(p+'.ts')};vm.runInNewContext(js,{module:m,exports:m.exports,require:req,fetch,URL,URLSearchParams,AbortController,AbortSignal,console,setTimeout,clearTimeout,Date,Map,Set},{filename:absolute});modules.set(absolute,m.exports);return m.exports;}
const {queryCity}=moduleAt('lib/city.ts');
const {fetchSiteContext}=moduleAt('lib/site-context.ts');
const ids=['3004880006','3004900016','3005080010'];
const buildings=[];const contexts={};
for(const bbl of ids){const result=await queryCity({unit:'building',q:bbl,limit:120});if(result.buildings.length!==1)throw Error('Demo identity not unique: '+bbl);const b=result.buildings[0];buildings.push(b);contexts[b.id]=await fetchSiteContext(b.id);console.log('Verified public record',b.id,b.address);}
fs.writeFileSync('public/data/demo-sites.json',JSON.stringify({title:'Brooklyn industrial field study',description:'Three real industrial records selected for an illustrative comparison. Not property listings, recommendations, or confirmed cold-storage facilities.',retrieved_at:new Date().toISOString(),snapshot:true,selection_method:'PLUTO manufacturing land use, M zoning, one building per lot, official valid footprints. Curated for illustration, not an optimized shortlist.',buildings,contexts},null,2));

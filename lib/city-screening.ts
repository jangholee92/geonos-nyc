import type {CityBuilding} from './city';
import type {SiteContext} from './site-context';
export type Preferences={size:number;truck:number;heat:0};
const scoringKeys=['size','truck'] as const;
const observed=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
export function screen(buildings:CityBuilding[],contexts:Record<string,SiteContext>,weights:Preferences){
 const mixed=new Set(buildings.map(b=>b.entity_type||'building')).size>1;
 const active=scoringKeys.filter(k=>Number.isFinite(weights[k])&&weights[k]>0);
 const rows=buildings.map(b=>{
  const c=contexts[b.id];
  const raw={size:observed(b.entity_type==='parcel'?b.lot_area_sqft:b.footprint_area_sqft),truck:c?.truck.status==='available'?observed(c.truck.value?.distance_m):null,heat:c?.heat.status==='available'?observed(c.heat.value?.hvi):null};
  const metrics={size:raw.size===null?null:Math.min(raw.size/20000,1)*100,truck:raw.truck===null?null:Math.max(0,1-raw.truck/2000)*100,heat:raw.heat===null||raw.heat<1||raw.heat>5?null:(5-raw.heat)/4*100};
  const known=active.filter(k=>metrics[k]!==null);
  const score=!mixed&&active.length&&known.length===active.length?active.reduce((s,k)=>s+metrics[k]!*weights[k],0)/active.reduce((s,k)=>s+weights[k],0):null;
  return{building:b,raw,metrics,score,coverage:active.length?known.length/active.length:0,pareto:false};
 });
 for(const a of rows)a.pareto=!mixed&&!!active.length&&active.every(k=>a.metrics[k]!==null)&&!rows.some(b=>b!==a&&active.every(k=>b.metrics[k]!==null&&b.metrics[k]!>=a.metrics[k]!)&&active.some(k=>b.metrics[k]!>a.metrics[k]!));
 rows.sort((a,b)=>(b.score??-1)-(a.score??-1)||a.building.id.localeCompare(b.building.id));return rows;
}
export function sensitivity(buildings:CityBuilding[],contexts:Record<string,SiteContext>,weights:Preferences){
 const counts:Record<string,number>={};let valid=0;
 // Disabled dimensions have one fixed value; HVI never enters the preference grid.
 const sizes=Number.isFinite(weights.size)&&weights.size>0?[1,2,3]:[0];
 const trucks=Number.isFinite(weights.truck)&&weights.truck>0?[0,1,2,3]:[0];
 for(const size of sizes)for(const truck of trucks){
  const rs=screen(buildings,contexts,{size,truck,heat:0}).filter(r=>r.score!==null);
  if(!rs.length)continue;
  const best=rs[0].score!;
  for(const r of rs.filter(x=>Math.abs(x.score!-best)<.00001))counts[r.building.id]=(counts[r.building.id]||0)+1;
  valid++;
 }
 return{top_counts:counts,scenarios:valid,note:'First-place counts within the selected candidates and weight grid. All ties count, so totals may exceed the number of scenarios. This measures preference sensitivity, not statistical confidence or business success probability.'};
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
type Obj=Record<string,any>;
const load=(name:string)=>JSON.parse(readFileSync(new URL('../public/data/climate/'+name,import.meta.url),'utf8'));
const climate=load('station_climate.json'),npcc=load('npcc4_projections.json');
const dailyArchive=readFileSync(new URL('../public/data/climate/station_daily_1991_2025.csv.gzip',import.meta.url));
const dailyCsv=gunzipSync(dailyArchive);
const lines=dailyCsv.toString('utf8').trim().split(/\r?\n/);
const byStation=new Map<string,{date:string;tx:number;tn:number;pr:number}[]>();
for(const line of lines.slice(1)){const[id,date,tx,tn,pr]=line.split(',');assert.ok(tx&&tn&&pr,'Empty fields cannot become numeric zero');const records=byStation.get(id)||[];records.push({date,tx:Number(tx),tn:Number(tn),pr:Number(pr)});byStation.set(id,records);}
const close=(a:number,b:number,label:string,tolerance=.000501)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,`${label}: ${a} vs ${b}`);
const avg=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;

test('compressed station download preserves the exact audited CSV and deterministic gzip identity',()=>{
 const entry=load('science_catalog.json').datasets.find((d:Obj)=>d.id==='noaa_station_climate'),archive=entry.daily_archive;
 assert.ok(entry.local_files.includes('data/climate/station_daily_1991_2025.csv.gzip'));
 assert.equal(archive.decoded_bytes,dailyCsv.length);assert.equal(archive.compressed_bytes,dailyArchive.length);
 assert.equal(createHash('sha256').update(dailyCsv).digest('hex'),archive.decoded_sha256);
 assert.equal(createHash('sha256').update(dailyArchive).digest('hex'),archive.compressed_sha256);
 assert.deepEqual([...dailyArchive.subarray(4,8)],[0,0,0,0]);assert.equal(dailyArchive[9],255);
 assert.equal(dailyCsv.length,1919847);
});

test('station archive covers the exact calendar including leap days and no partial 2026 year',()=>{
 assert.equal(lines.length-1,51136);assert.equal(byStation.size,4);assert.equal(climate.historical_cutoff,'2025-12-31');assert.deepEqual(climate.periods,{baseline:[1991,2020],recent:[2021,2025]});
 for(const records of byStation.values()){assert.equal(records.length,12784);assert.equal(new Set(records.map(r=>r.date)).size,12784);assert.equal(records[0].date,'1991-01-01');assert.equal(records.at(-1)?.date,'2025-12-31');assert.equal(records.filter(r=>r.date.endsWith('02-29')).length,9);assert.ok(records.every(r=>r.tx>=r.tn&&r.pr>=0));}
});
test('all shipped annual and monthly temperatures, totals, extremes and threshold counts reconstruct from daily observations',()=>{
 for(const station of climate.stations){const daily=byStation.get(station.id)!;
  for(const published of [...station.annual,...station.monthly]){const prefix=String(published.year)+(published.month?'-'+String(published.month).padStart(2,'0'):'');const rows=daily.filter(r=>r.date.startsWith(prefix));
   assert.equal(rows.length,published.expected_days);assert.ok(Object.values(published.coverage).every(x=>x===1));
   close(published.tmean_c,avg(rows.map(r=>(r.tx+r.tn)/2)),'temperature');close(published.precip_mm,rows.reduce((s,r)=>s+r.pr,0),'precipitation');close(published.rx1day_mm,Math.max(...rows.map(r=>r.pr)),'daily maximum');
   assert.equal(published.hot_days_32_2c,rows.filter(r=>r.tx>=32.2).length);assert.equal(published.tropical_nights_gt20c,rows.filter(r=>r.tn>20).length);
   // The difference identity verifies the base and units independently of the two sums.
   close(published.heating_degree_days_18c-published.cooling_degree_days_18c,rows.reduce((s,r)=>s+18-(r.tx+r.tn)/2,0),'degree-day base identity',.00101);
  }
 }
});
test('calendar-month climatologies are means of monthly statistics and do not turn maxima into totals',()=>{
 for(const s of climate.stations)for(const [label,lo,hi]of[['baseline_1991_2020',1991,2020],['recent_2021_2025',2021,2025]]as const){
  for(const month of s.monthly_climatology[label])for(const key of ['tmean_c','precip_mm','rx1day_mm','hot_days_32_2c','tropical_nights_gt20c','cooling_degree_days_18c']){
   const rows=s.monthly.filter((r:Obj)=>r.year>=lo&&r.year<=hi&&r.month===month.month);close(month[key],avg(rows.map((r:Obj)=>r[key])),'monthly climatology');assert.equal(month.valid_years_by_metric[key],hi-lo+1);
  }
  for(const key of ['precip_mm','hot_days_32_2c','tropical_nights_gt20c','cooling_degree_days_18c'])close(s.monthly_climatology[label].reduce((sum:number,r:Obj)=>sum+r[key],0),s.summary[label].annual_average[key],'monthly additivity',.007);
 }
});
test('NPCC futures preserve their separate baseline and convert temperature changes without an offset',()=>{
 assert.deepEqual(npcc.baseline_years,[1981,2010]);assert.deepEqual(npcc.scenarios,['SSP2-4.5','SSP5-8.5']);assert.equal(npcc.annual.length,7);assert.equal(npcc.monthly_and_seasonal.length,84);assert.equal(npcc.extremes.length,12);
 for(const row of [...npcc.annual,...npcc.monthly_and_seasonal]){for(const p of ['p10','p25','p75','p90'])close(row.temperature_change_c[p],row.temperature_change_f[p]*5/9,'Fahrenheit difference conversion');for(const key of ['temperature_change_f','temperature_change_c','precipitation_change_pct']){const v=['p10','p25','p75','p90'].map(p=>row[key][p]);assert.deepEqual(v,[...v].sort((a,b)=>a-b));}}
 const mid=npcc.annual.find((r:Obj)=>r.horizon==='2050s');assert.deepEqual(mid.temperature_change_f,{p10:3,p25:4,p75:6,p90:7.1});assert.deepEqual(mid.precipitation_change_pct,{p10:0,p25:4,p75:11,p90:14});assert.equal(npcc.baseline_extremes.hot_days_ge90f_per_year,17);
 const lower=npcc.extremes.find((r:Obj)=>r.horizon==='2050s'&&r.percentile===25),upper=npcc.extremes.find((r:Obj)=>r.horizon==='2050s'&&r.percentile===75);assert.equal(lower.hot_days_ge90f_per_year,38);assert.equal(upper.hot_days_ge90f_per_year,62);
 assert.ok(npcc.methods.means.includes('35'));assert.ok(npcc.methods.extremes.includes('16'));assert.equal(npcc.provenance.paper,'https://doi.org/10.1111/nyas.15116');
});

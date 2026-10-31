import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module={exports:{}};
new vm.Script(ts.transpileModule(readFileSync(new URL('../lib/hourly-context.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText).runInNewContext({module,exports:module.exports});
const {parseHourlyContext}=module.exports as typeof import('../lib/hourly-context');
const fixture=()=>JSON.parse(readFileSync(new URL('../public/data/climate/hourly_context.json',import.meta.url),'utf8'));
test('all fifteen official station-years satisfy the browser evidence contract including leap-year coverage',()=>{
 const data=parseHourlyContext(fixture());assert.ok(data);assert.equal(data.stations.length,3);assert.equal(data.stations.flatMap(s=>s.years).length,15);
 for(const station of data.stations){assert.equal(station.years.find(y=>y.year===2024)?.expected_utc_hours,8784);for(const year of station.years)assert.equal(year.samples_at_both_temperature_and_dew_point_maxima,0);}
});
test('the browser rejects conflated peaks, unsupported source/QC, or a contradictory gap count',()=>{
 let data=fixture(),y=data.stations[0].years[4];y.highest_temperature_observation.dew_point_c=y.highest_temperature_observation.temperature_c+1;assert.equal(parseHourlyContext(data),null);
 data=fixture();data.stations[0].years[4].highest_temperature_observation.temperature_quality_code='999';assert.equal(parseHourlyContext(data),null);
 data=fixture();data.stations[0].years[4].longest_unrepresented_run.hour_bins+=1;assert.equal(parseHourlyContext(data),null);
 data=fixture();data.stations[0].years[4].coverage_percent=100;assert.equal(parseHourlyContext(data),null);
});
test('an hourly series cannot silently bridge a missing UTC hour or change its paired values',()=>{
 let data=fixture();data.stations[0].years[4].top_hot_runs[0].points[2][0]=data.stations[0].years[4].top_hot_runs[0].points[3][0];assert.equal(parseHourlyContext(data),null);
 data=fixture();data.stations[0].years[4].top_hot_runs[0].points[2][1]=29.9;assert.equal(parseHourlyContext(data),null);
 data=fixture();data.stations[0].years[4].top_hot_runs[0].points[2][2]=60;assert.equal(parseHourlyContext(data),null);
});
test('source identity, calendar-year uniqueness, and file provenance are mandatory',()=>{
 let data=fixture();data.stations[1].station_id=data.stations[0].station_id;assert.equal(parseHourlyContext(data),null);
 data=fixture();data.stations[0].years[1].year=2021;assert.equal(parseHourlyContext(data),null);
 data=fixture();data.stations[0].years[0].source_url='https://example.org/NOAA-looking-file';assert.equal(parseHourlyContext(data),null);
 data=fixture();data.stations[0].years[0].source_sha256='unverified';assert.equal(parseHourlyContext(data),null);
 data=fixture();data.documentation_url='javascript:alert(1)';assert.equal(parseHourlyContext(data),null);
});
test('a future complete source year can represent no gap without inventing one',()=>{
 const data=fixture(),y=data.stations[0].years[0];y.paired_hourly_samples=y.expected_utc_hours;y.unrepresented_utc_hours=0;y.coverage_percent=100;y.longest_unrepresented_run=null;
 assert.ok(parseHourlyContext(data));
 y.unrepresented_utc_hours=1;y.paired_hourly_samples--;y.coverage_percent=Math.round(y.paired_hourly_samples/y.expected_utc_hours*100000)/1000;assert.equal(parseHourlyContext(data),null);
});

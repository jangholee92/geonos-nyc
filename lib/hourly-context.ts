/** Guard the public compact NOAA snapshot before any chart treats a value as evidence. */
export type HourlyPair={timestamp_utc:string;temperature_c:number;dew_point_c:number;temperature_quality_code:string;dew_point_quality_code:string;temperature_source_code:string;dew_point_source_code:string};
export type HourlyRun={first_sample_utc:string;last_sample_utc:string;consecutive_utc_hour_bins:number;points:[string,number,number][]};
export type HourlyGap={first_utc_hour_bin:string;last_utc_hour_bin:string;hour_bins:number};
export type HourlyYear={year:number;source_url:string;source_sha256:string;retrieved_at:string;expected_utc_hours:number;paired_hourly_samples:number;unrepresented_utc_hours:number;coverage_percent:number;highest_temperature_observation:HourlyPair;highest_dew_point_observation:HourlyPair;highest_temperature_observation_count:number;highest_dew_point_observation_count:number;samples_at_both_temperature_and_dew_point_maxima:number;top_hot_runs:HourlyRun[];longest_unrepresented_run:HourlyGap|null};
export type HourlyStation={station_id:string;name:string;latitude:number;longitude:number;years:HourlyYear[]};
export type HourlyContext={schema:string;product_url:string;documentation_url:string;documentation_version:string;method:Record<string,unknown>;limitations:string[];stations:HourlyStation[]};
const object=(value:unknown):value is Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const integer=(value:unknown,min:number,max:number)=>finite(value)&&Number.isInteger(value)&&value>=min&&value<=max;
const timestamp=(value:unknown,year?:number)=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)$/.test(value)&&Number.isFinite(Date.parse(value))&&(year===undefined||new Date(value).getUTCFullYear()===year);
const values=(temperature:unknown,dew:unknown)=>finite(temperature)&&finite(dew)&&temperature>=-100&&temperature<=70&&dew>=-100&&dew<=temperature;
const quality=(source:unknown,code:unknown)=>source==='223'?code==='1':source==='343'&&(code==='1'||code==='5');
const pair=(value:unknown,year:number)=>object(value)&&timestamp(value.timestamp_utc,year)&&values(value.temperature_c,value.dew_point_c)&&quality(value.temperature_source_code,value.temperature_quality_code)&&quality(value.dew_point_source_code,value.dew_point_quality_code);
export function parseHourlyContext(value:unknown):HourlyContext|null{
 if(!object(value)||value.schema!=='geonos.noaa-paired-hourly-context.v1'||!Array.isArray(value.stations)||value.stations.length!==3||!object(value.method)||!Array.isArray(value.limitations)||value.limitations.some((s:unknown)=>typeof s!=='string'))return null;
 if(value.product_url!=='https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly'||value.documentation_url!=='https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh_DOCUMENTATION.pdf')return null;
 const ids=new Set(['USW00094789','USW00014732','USW00014734']);
 for(const station of value.stations){
  if(!object(station)||!ids.delete(station.station_id)||typeof station.name!=='string'||!finite(station.latitude)||!finite(station.longitude)||!Array.isArray(station.years)||station.years.length!==5)return null;
  const years=new Set([2021,2022,2023,2024,2025]);
  for(const y of station.years){
   if(!object(y)||!years.delete(y.year))return null;
   const expected=(Date.UTC(y.year+1,0,1)-Date.UTC(y.year,0,1))/3600000;
   if(y.expected_utc_hours!==expected||!integer(y.paired_hourly_samples,1,expected)||y.unrepresented_utc_hours!==expected-y.paired_hourly_samples||!finite(y.coverage_percent)||Math.abs(y.coverage_percent-y.paired_hourly_samples/expected*100)>.00051)return null;
   if(y.source_url!==`https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/access/by-year/${y.year}/psv/GHCNh_${station.station_id}_${y.year}.psv`||typeof y.source_sha256!=='string'||!/^([a-f0-9]{64})$/.test(y.source_sha256)||!timestamp(y.retrieved_at))return null;
   if(!pair(y.highest_temperature_observation,y.year)||!pair(y.highest_dew_point_observation,y.year)||!integer(y.highest_temperature_observation_count,1,y.paired_hourly_samples)||!integer(y.highest_dew_point_observation_count,1,y.paired_hourly_samples)||!integer(y.samples_at_both_temperature_and_dew_point_maxima,0,Math.min(y.highest_temperature_observation_count,y.highest_dew_point_observation_count)))return null;
   if(y.highest_temperature_observation.temperature_c<y.highest_dew_point_observation.temperature_c||y.highest_dew_point_observation.dew_point_c<y.highest_temperature_observation.dew_point_c)return null;
   const gap=y.longest_unrepresented_run;
   if(gap===null){if(y.unrepresented_utc_hours!==0)return null;}
   else if(!object(gap)||!timestamp(gap.first_utc_hour_bin,y.year)||!timestamp(gap.last_utc_hour_bin,y.year)||!integer(gap.hour_bins,1,y.unrepresented_utc_hours)||(Date.parse(gap.last_utc_hour_bin)-Date.parse(gap.first_utc_hour_bin))/3600000+1!==gap.hour_bins)return null;
   if(!Array.isArray(y.top_hot_runs)||y.top_hot_runs.length>3)return null;
   for(const run of y.top_hot_runs){
    if(!object(run)||!Array.isArray(run.points)||!integer(run.consecutive_utc_hour_bins,3,expected)||run.points.length!==run.consecutive_utc_hour_bins)return null;
    if(run.first_sample_utc!==run.points[0]?.[0]||run.last_sample_utc!==run.points.at(-1)?.[0])return null;
    for(let i=0;i<run.points.length;i++){
     const r=run.points[i];if(!Array.isArray(r)||r.length!==3||!timestamp(r[0],y.year)||!values(r[1],r[2])||r[1]<30)return null;
     if(r[1]>y.highest_temperature_observation.temperature_c||r[2]>y.highest_dew_point_observation.dew_point_c)return null;
     if(i&&Math.floor(Date.parse(r[0])/3600000)-Math.floor(Date.parse(run.points[i-1][0])/3600000)!==1)return null;
    }
   }
  }
 }
 return value as HourlyContext;
}

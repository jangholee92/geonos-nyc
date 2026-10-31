import {analyzeEnergyEvidence, ENERGY_SOURCE, type EnergyReport} from './energy-evidence';
import {fetchPublicJson} from './public-fetch';
import type {CityBuilding} from './city';
import climateIndex from './climate-evidence-index.json';
import hourlyIndex from './hourly-evidence-index.json';

type Data = Record<string, any>;
export class InvestigationInputError extends Error {}
export const INVESTIGATION_NAMES = ['inspect_energy_scope', 'inspect_climate_evidence'] as const;
const stationIds = climateIndex.observations.stations.map(station => station.id);
const hourlyStationIds = hourlyIndex.stations.map(station=>station.station_id);
const hourlyYears = [2021,2022,2023,2024,2025] as const;
const hourlyMetrics = {hottest_pair:'highest retained air-temperature pair',highest_dew_point_pair:'highest retained dew-point pair'} as const;
const stationNames:Record<string,RegExp> = {
  USW00094728:/\bCentral Park\b|\bUSW00094728\b/i,
  USW00094789:/\bJFK\b|\bJohn F\.? Kennedy\b|\bUSW00094789\b/i,
  USW00014732:/\bLaGuardia\b|\bLGA\b|\bUSW00014732\b/i,
  USW00014734:/\bNewark\b|\bEWR\b|\bUSW00014734\b/i,
};
// Inspect all explicit calendar years, including unavailable ones. A supported
// older selection must never survive a newer request outside the archive.
function explicitYears(text:string):number[] {
  return [...new Set([...text.matchAll(/\b(\d{4})(?:s)?\b/g)].map(match=>Number(match[1])))];
}
function projectionYears(text:string):number[] {
  // The source's explicitly named publication year is not a forecast horizon.
  // Other mixed years remain ambiguous and require scope clarification.
  return explicitYears(text.replace(/\bNPCC4(?:\s+(?:report|assessment))?\s*\(?2024\)?|\b2024\s+NPCC4(?:\s+(?:report|assessment))?|\bpublished\s+in\s+2024\b/gi,''));
}
/** Exact quotations audit the requested station/time selection. They do not
 * prove semantic equivalence of the question and the selected metric. */
function climateSelectionOrigin(args:Data,userTexts:readonly string[]) {
  const quote=args.selectionQuote;
  if(typeof quote!=='string'||!quote.trim()||quote.length>1200||!userTexts.some(text=>text.includes(quote))) throw new InvestigationInputError('Quote the user’s exact station/time selection; do not choose an unrequested station or period. Use climate_scope clarification when it is missing.');
  const hasYear=(year:number)=>new RegExp(`(?:^|[^0-9])${year}(?:s)?(?:$|[^0-9])`,'i').test(quote);
  if(args.mode==='observed'||args.mode==='hourly') {
    if(/\b(today|tomorrow|right now|current weather|tonight)\b|\b(weather|temperature|dew point)\b.{0,40}\b(now|currently)\b/i.test(userTexts[0]??''))throw new InvestigationInputError('Historical station summaries cannot answer current weather or a short-term forecast question.');
    const stationPattern=Object.prototype.hasOwnProperty.call(stationNames,args.stationId)?stationNames[args.stationId]:null;
    if(!stationPattern?.test(quote)) throw new InvestigationInputError('The selected NOAA station must occur in the user’s quoted selection.');
    const years=args.mode==='hourly'&&hourlyYears.includes(args.year)?[args.year]:args.mode==='observed'&&args.period==='baseline_1991_2020'?[1991,2020]:args.mode==='observed'&&args.period==='recent_2021_2025'?[2021,2025]:[];
    if(!years.length||!years.every(hasYear))throw new InvestigationInputError('The supported observed period or single airport year must be stated in the user’s quoted selection. A historical period is not live weather.');
    // The latest explicit station choice wins over older user history.
    for(const text of userTexts){const named=Object.entries(stationNames).filter(([,pattern])=>pattern.test(text)).map(([id])=>id);if(named.length){if(named.length!==1||named[0]!==args.stationId)throw new InvestigationInputError('This single-station tool cannot override the latest station choice or complete a multi-station comparison. Clarify the scope.');break;}}
    if(args.mode==='hourly'){
      const quotedYears=explicitYears(quote);
      if(quotedYears.length!==1||quotedYears[0]!==args.year)throw new InvestigationInputError('Select exactly one airport calendar year; this tool cannot compare multiple years or choose a year from a requested range.');
      for(const text of userTexts){const chosen=explicitYears(text);if(chosen.length){if(chosen.length!==1||chosen[0]!==args.year)throw new InvestigationInputError('This single-year tool cannot override the latest airport year or complete an unsupported or multi-year selection. Clarify the scope.');break;}}
    } else {
      const matchesPeriod=(chosen:number[])=>chosen.length===years.length&&years.every(year=>chosen.includes(year));
      if(!matchesPeriod(explicitYears(quote)))throw new InvestigationInputError('Quote exactly one supported observed period; mixed or unsupported years require scope clarification.');
      for(const text of userTexts){const chosen=explicitYears(text);if(chosen.length){if(!matchesPeriod(chosen))throw new InvestigationInputError('This single-period tool cannot override the latest observed period or complete an unsupported or multi-period selection. Clarify the scope.');break;}}
    }
  } else {
    if(!hasYear(Number(String(args.horizon).replace('s','')))) throw new InvestigationInputError('The published projection horizon must occur in the user’s quoted selection.');
    const horizon=Number(String(args.horizon).replace('s','')),quotedYears=projectionYears(quote);
    if(quotedYears.length!==1||quotedYears[0]!==horizon)throw new InvestigationInputError('Quote exactly one published projection horizon; mixed or unsupported years require scope clarification.');
    for(const text of userTexts){const horizons=projectionYears(text);if(horizons.length){if(horizons.length!==1||horizons[0]!==horizon)throw new InvestigationInputError('This single-horizon tool cannot override the latest projection horizon or complete an unsupported or multi-horizon selection. Clarify the scope.');break;}}
  }
  return {quote,meaningNeedsReview:true};
}
const observedMetrics = {
  tmean_c: {label:'annual mean temperature',unit:'°C',method:'Mean of daily (TMAX + TMIN) / 2, then equal-weighted valid annual means; not a 24-hour average.'},
  hot_days_32_2c: {label:'annual hot-day count',unit:'days/year',method:'Daily TMAX ≥32.2°C, with 90°F rounded to the archive’s 0.1°C precision.'},
  precip_mm: {label:'annual precipitation total',unit:'mm/year',method:'Sum of reported daily water-equivalent precipitation, including melted snowfall when reported.'},
  rx1day_mm: {label:'annual maximum daily precipitation',unit:'mm',method:'Mean of each year’s largest reported daily total; not the largest event across the whole period or hourly rainfall.'},
  cooling_degree_days_18c: {label:'annual cooling degree days at an 18°C base',unit:'°C·days/year',method:'Sum of max((TMAX+TMIN)/2 − 18, 0). An 18°C base differs from 65°F (18.3°C).'},
  heating_degree_days_18c: {label:'annual heating degree days at an 18°C base',unit:'°C·days/year',method:'Sum of max(18 − (TMAX+TMIN)/2, 0). An 18°C base differs from 65°F (18.3°C).'},
} as const;
const projectedMetrics = {
  temperature_change_c: {label:'annual temperature change',unit:'°C change',type:'mean'},
  precipitation_change_pct: {label:'annual precipitation change',unit:'% change',type:'mean'},
  hot_days_ge90f_per_year: {label:'days with maximum temperature ≥90°F',unit:'days/year',type:'extreme'},
  heatwaves_per_year: {label:'heatwaves of at least three consecutive days with maximum temperature ≥90°F',unit:'events/year',type:'extreme'},
  rain_days_ge2inch_per_year: {label:'days with reported precipitation ≥2 inches',unit:'days/year',type:'extreme'},
} as const;
const CAPACITY_LIMIT = 'These data cannot establish building cooling capacity, available electrical capacity, a utility bill, indoor conditions or operational suitability. Annual energy intensity is not a capacity measurement.';
const fixed = (value:number|null|undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US',{maximumFractionDigits:2}) : 'unknown';
function fields(args:Data, allowed:string[]) {
  if (Object.keys(args).some(key=>!allowed.includes(key))) throw new InvestigationInputError('Unsupported investigation field. URLs, observations and model-written conclusions are not accepted.');
}
function member<T extends string>(value:unknown, allowed:readonly T[], label:string):T {
  if(typeof value!=='string'||!allowed.includes(value as T)) throw new InvestigationInputError(`Choose a supported ${label}.`);
  return value as T;
}
export const investigationTools = [
  {type:'function',function:{name:'inspect_energy_scope',description:'Complete an energy-reporting-scope investigation for one resolved native DOITT or p:BBL identifier. Retrieves bounded official 2024 LL84 records and native parent links. The application returns a deterministic answer and citations. Does not rank EUI, allocate parent energy, estimate kW, cost or efficiency. This must be the only tool call in its model turn.',parameters:{type:'object',properties:{id:{type:'string',description:'Native DOITT ID or p:BBL, from the selected IDs or a completed search.'},reportYear:{type:'integer',enum:[2024]}},required:['id','reportYear'],additionalProperties:false}}},
  {type:'function',function:{name:'inspect_climate_evidence',description:'Complete a climate evidence investigation with one precise metric. Observed mode requires stationId and period; projected mode requires a published horizon and no station; hourly mode requires JFK/LGA/Newark stationId, one year 2021–2025 and hottest_pair or highest_dew_point_pair. Hourly returns both readings from one actual observation, its time, ties, coverage and longest gap; never combines independent maxima. Returns a small audited bundled snapshot with provenance, not live weather. The application writes the answer. No building temperature, energy capacity or flood inference. Use clarification first if the consequential measurement is ambiguous. This must be the only tool call in its model turn.',parameters:{type:'object',properties:{mode:{type:'string',enum:['observed','projected','hourly']},metric:{type:'string',enum:[...Object.keys(observedMetrics),...Object.keys(projectedMetrics),...Object.keys(hourlyMetrics)]},stationId:{type:'string',enum:stationIds},period:{type:'string',enum:['baseline_1991_2020','recent_2021_2025']},year:{type:'integer',enum:hourlyYears},horizon:{type:'string',enum:['2030s','2040s','2050s','2060s','2070s','2080s','2100']},selectionQuote:{type:'string',maxLength:1200,description:'Exact user text containing the requested station and both period years, or the single airport year, or the published projection horizon. Never invent a quote or choose an unstated scope; use climate_scope clarification.'}},required:['mode','metric','selectionQuote'],additionalProperties:false}}},
];

/** A 16 KB compiled snapshot: no raw daily arrays, runtime file access or asset binding. */
export function inspectClimateEvidence(args:Data,userTexts:readonly string[]) {
  fields(args,['mode','metric','stationId','period','horizon','year','selectionQuote']);
  const mode=member(args.mode,['observed','projected','hourly'],'climate evidence mode');
  const selectionOrigin=climateSelectionOrigin(args,userTexts);
  const data=climateIndex as Data;
  if(mode==='hourly') return inspectHourlyEvidence(args,selectionOrigin);
  if(args.year!==undefined)throw new InvestigationInputError('A single airport calendar year belongs only to hourly mode; do not mix it with observed periods or regional horizons.');
  if(mode==='observed') {
    if(args.horizon!==undefined) throw new InvestigationInputError('Observed station periods cannot be combined with a projection horizon.');
    const metric=member(args.metric,Object.keys(observedMetrics) as (keyof typeof observedMetrics)[],'observed metric');
    const stationId=member(args.stationId,stationIds,'NOAA reference station');
    const period=member(args.period,['baseline_1991_2020','recent_2021_2025'],'observed period');
    const station=data.observations.stations.find((value:Data)=>value.id===stationId);
    const summary=station.periods[period], definition=observedMetrics[metric];
    const value=summary.annual_average[metric] as number|null;
    const validYears=summary.valid_years_by_metric[metric] as number;
    const source={url:station.source_url,dataset:'NOAA GHCN-Daily',retrievalMode:'compiled-source-snapshot',retrievedOn:station.source_retrieved_on,sourceVersion:data.observations.source_snapshot.version,rawSha256:station.source_sha256,latestRecordByElement:station.source_latest_valid_record_by_element,analyticalCutoff:data.observations.historical_cutoff};
    const limitations=['Reference-station observations do not measure the selected building or its indoor temperature.','The 1991–2020 summaries are unadjusted derived statistics, not official NOAA Climate Normals; 2021–2025 is a five-year comparison, not a new normal.','Missing/failed-quality daily values are not filled; valid-year counts and coverage are retained.',CAPACITY_LIMIT];
    if(station.outside_nyc_reference) limitations.push('Newark is a New Jersey regional reference, not an NYC site or rural heat-island control.');
    return {kind:'investigation' as const,investigationType:'climate_observed',answer:`At ${station.name}, the ${summary.start_year}–${summary.end_year} mean ${definition.label} is ${fixed(value)} ${definition.unit}, based on ${validYears} of ${summary.expected_years} valid years. This is station context, not building performance. ${CAPACITY_LIMIT}`,selection:{mode,metric,stationId,period},selectionNeedsReview:true,selectionOrigin,grounded:true,
      data:{station:{id:station.id,name:station.name,latitude:station.latitude,longitude:station.longitude},period:{startYear:summary.start_year,endYear:summary.end_year},metric,value,unit:definition.unit,scope:'reference_station',validYears,expectedYears:summary.expected_years,minDailyCoverage:summary.min_daily_coverage,method:definition.method,source},
      citations:[{evidenceId:`noaa:${stationId}:${period}:${metric}`,source,measurement:metric,scope:'reference_station',unit:definition.unit,value}],limitations,nextQuestion:'What indoor conditions must the activity maintain, and what asset-specific performance evidence is available?',unknowns:['building_cooling_capacity_kw','available_electrical_capacity_kw','indoor_conditions','utility_bill'],groundingNote:'The selected metric is read from an audited compiled source snapshot; no live weather request or building prediction was made.'};
  }
  if(args.stationId!==undefined||args.period!==undefined) throw new InvestigationInputError('Regional NPCC projections cannot be assigned a station period or a building-specific temperature.');
  const metric=member(args.metric,Object.keys(projectedMetrics) as (keyof typeof projectedMetrics)[],'published projection metric');
  const projection=data.projections, definition=projectedMetrics[metric];
  const horizons=definition.type==='mean'?projection.annual.map((row:Data)=>row.horizon):['2030s','2050s','2080s'];
  const horizon=member(args.horizon,horizons,'published horizon for this metric');
  const ranges:Data={};
  if(definition.type==='mean') Object.assign(ranges,projection.annual.find((row:Data)=>row.horizon===horizon)[metric]);
  else for(const percentile of [10,25,75,90]) ranges[`p${percentile}`]=projection.extremes.find((row:Data)=>row.horizon===horizon&&row.percentile===percentile)?.[metric]??null;
  const baseline=definition.type==='extreme'?{years:projection.baseline_years,value:projection.baseline_extremes[metric],unit:definition.unit,scope:'published NYC regional reference'}:{years:projection.baseline_years,temperatureF:projection.baseline_published_annual.temperature_f,precipitationInches:projection.baseline_published_annual.precipitation_inches,scope:'Central Park reference for published regional changes'};
  const source={url:definition.type==='mean'?projection.provenance.temperature_precipitation:projection.provenance.extremes,paper:projection.provenance.paper,dataset:'NPCC4 (2024)',retrievalMode:'compiled-source-snapshot',retrievedOn:projection.provenance.retrieved_on,sourceRowsUpdatedAt:definition.type==='mean'?projection.provenance.source_rows_updated_at.temperature_precipitation:projection.provenance.source_rows_updated_at.extremes,rawSha256:projection.provenance.raw_sha256};
  return {kind:'investigation' as const,investigationType:'climate_projected',answer:`NPCC4’s ${horizon} NYC regional range for ${definition.label} is ${fixed(ranges.p25)}–${fixed(ranges.p75)} ${definition.unit} (pooled 25th–75th percentiles), using its published 1981–2010 reference${definition.type==='extreme'?` of ${fixed(baseline.value)} ${definition.unit}`:''}. These are model-and-scenario ranges, not calibrated probabilities or a forecast for one building or year. ${CAPACITY_LIMIT}`,selection:{mode,metric,horizon},selectionNeedsReview:true,selectionOrigin,grounded:true,
    data:{metric,horizon,scope:'NYC_region',unit:definition.unit,pooledPercentiles:ranges,baseline,method:definition.type==='mean'?projection.methods.means:projection.methods.extremes,source},citations:[{evidenceId:`npcc4:${horizon}:${metric}`,source,measurement:metric,scope:'NYC_region',unit:definition.unit,value:ranges,baseline}],limitations:[...projection.limitations,'Observed station baselines (1991–2020) and NPCC references (1981–2010) are different; do not splice them.','No interpolation is used for unpublished extreme-event horizons.',CAPACITY_LIMIT],nextQuestion:'Can documented system performance maintain the required indoor conditions through a sustained hot spell?',unknowns:['building_cooling_capacity_kw','available_electrical_capacity_kw','indoor_conditions','utility_bill'],groundingNote:'This result reproduces one published metric from a preserved NPCC4 source snapshot, not a new model forecast.'};
}


/** Return exactly one retained same-row pair; never splice separate extrema. */
function inspectHourlyEvidence(args:Data,selectionOrigin:{quote:string;meaningNeedsReview:boolean}) {
  if(args.period!==undefined||args.horizon!==undefined)throw new InvestigationInputError('An airport year cannot be combined with an observed multi-year period or projection horizon.');
  const metric=member(args.metric,Object.keys(hourlyMetrics) as (keyof typeof hourlyMetrics)[],'paired-hourly metric');
  const stationId=member(args.stationId,hourlyStationIds,'paired-hourly airport station; Central Park is not in this archive');
  if(!Number.isInteger(args.year)||!hourlyYears.includes(args.year))throw new InvestigationInputError('Choose one supported airport year from 2021 through 2025.');
  const index=hourlyIndex as Data,station=index.stations.find((s:Data)=>s.station_id===stationId),year=station.years.find((y:Data)=>y.year===args.year);
  const hottest=metric==='hottest_pair',pair=year[hottest?'highest_temperature_observation':'highest_dew_point_observation'];
  const ties=year[hottest?'highest_temperature_observation_count':'highest_dew_point_observation_count'];
  const source={url:year.source_url,dataset:index.product,retrievalMode:'compiled-source-snapshot',retrievedOn:year.retrieved_at,sourceLastModified:year.source_last_modified,rawSha256:year.source_sha256,documentationUrl:index.documentation_url,documentationVersion:index.documentation_version,sourceAssetSha256:index.source_asset.sha256,summaryGeneratedAt:index.source_asset.generated_at,firstRawObservation:year.first_raw_observation_utc,lastRawObservation:year.last_raw_observation_utc,revisionNote:year.source_last_modified===null?'The publisher Last-Modified value was unavailable; the retrieval time and raw-file hash identify this snapshot.':'Publisher metadata and the source hash identify the retained file snapshot.'};
  const gap=year.longest_unrepresented_run;
  const gapText=gap?` The longest unrepresented span is ${gap.hour_bins} UTC hour bins (${gap.first_utc_hour_bin} through ${gap.last_utc_hour_bin}).`:' All UTC hour bins contain a retained pair; this still does not establish continuous coverage.';
  const limitations=[...index.limitations,'This is one earliest-tied retained observation at the chosen maximum, not an annual absolute extreme guaranteed across missing or excluded reports. The companion reading can differ at other tied maxima.','Independent air-temperature and dew-point maxima must not be combined into a synthetic observation.',CAPACITY_LIMIT];
  if(station.state==='NJ')limitations.push('Newark is a New Jersey regional airport reference, not an NYC property measurement.');
  const answer=`At ${station.name} in ${args.year}, the ${hourlyMetrics[metric]} was ${fixed(pair.temperature_c)}°C air temperature with ${fixed(pair.dew_point_c)}°C dew point at ${pair.timestamp_utc}. Both readings belong to that same retained observation; ${ties} retained sample${ties===1?'':'s'} tied at the chosen maximum, and the earliest is shown. ${year.paired_hourly_samples} of ${year.expected_utc_hours} UTC hour bins contain a retained pair (${fixed(year.coverage_percent)}%); ${year.unrepresented_utc_hours} are unrepresented.${gapText} ${CAPACITY_LIMIT}`;
  return {kind:'investigation' as const,investigationType:'climate_hourly',answer,selection:{mode:'hourly',metric,stationId,year:args.year},selectionNeedsReview:true,selectionOrigin,grounded:true,
    data:{station:{id:station.station_id,name:station.name,latitude:station.latitude,longitude:station.longitude,elevationM:station.elevation_m,state:station.state},year:args.year,metric,scope:'reference_station',unit:'°C',pair,tiedSampleCount:ties,samplesAtBothMaxima:year.samples_at_both_temperature_and_dew_point_maxima,coverage:{expectedUtcHourBins:year.expected_utc_hours,representedUtcHourBins:year.paired_hourly_samples,unrepresentedUtcHourBins:year.unrepresented_utc_hours,percent:year.coverage_percent,longestUnrepresentedRun:gap},method:index.method,source},
    citations:[{evidenceId:`noaa-ghcnh:${stationId}:${args.year}:${metric}`,source,measurement:metric,scope:'reference_station',unit:'°C',value:{temperatureC:pair.temperature_c,dewPointC:pair.dew_point_c,timestampUtc:pair.timestamp_utc},tiedSampleCount:ties}],limitations,nextQuestion:'What indoor temperature and moisture conditions must the operation maintain, and what documented system performance supports them?',unknowns:['building_cooling_capacity_kw','available_electrical_capacity_kw','indoor_conditions','utility_bill'],groundingNote:'The application returned one actual paired observation from an audited airport-year source snapshot. No maxima were combined, no live weather was requested and no building load or capacity was computed.'};
}

const ENERGY_ENDPOINT='https://data.cityofnewyork.us/resource/5zyy-y8am.json';
const ENERGY_FIELDS='report_year,property_id,property_name,parent_property_id,parent_property_name,nyc_borough_block_and_lot,nyc_building_identification,number_of_buildings,primary_property_type,property_gfa_self_reported,site_eui_kbtu_ft,site_energy_use_kbtu,estimated_values_energy,alert_energy_meter_has_less,alert_energy_meter_has_gaps,alert_gross_floor_area_is';
const MAX_ROWS=50, MAX_PARENTS=8;
function rawText(value:unknown):string|null {return typeof value==='string'?value.slice(0,500):typeof value==='number'&&Number.isFinite(value)?String(value):null;}
function nonnegative(value:unknown):number|null {const text=rawText(value);if(!text||!/^\d+(?:\.\d+)?$/.test(text))return null;const parsed=Number(text);return Number.isFinite(parsed)?parsed:null;}
function nativeIds(value:unknown,length:number):string[]{return [...new Set((rawText(value)?.match(/\d+/g)??[]).filter(id=>new RegExp(`^[1-5]\\d{${length-1}}$`).test(id)))];}
function report(row:Data):EnergyReport|null {
  const propertyId=rawText(row.property_id), year=nonnegative(row.report_year);
  if(!propertyId||!/^[1-9]\d{0,15}$/.test(propertyId)||year!==2024)return null;
  const area=nonnegative(row.property_gfa_self_reported),eui=nonnegative(row.site_eui_kbtu_ft),energy=nonnegative(row.site_energy_use_kbtu);
  return {property_id:propertyId,report_year:year,name:rawText(row.property_name),bbls:nativeIds(row.nyc_borough_block_and_lot,10),bins:nativeIds(row.nyc_building_identification,7),number_of_buildings:nonnegative(row.number_of_buildings),property_type:rawText(row.primary_property_type),metrics:{floor_area_ft2:area,site_eui_kbtu_ft2:eui},reporting_scope:{alignment:'matched',parent_property_id_raw:rawText(row.parent_property_id),parent_property_name:rawText(row.parent_property_name),site_energy_use_kbtu:energy,site_energy_use_kbtu_raw:rawText(row.site_energy_use_kbtu),source_property_id:propertyId,source_report_year:year,source_floor_area_ft2:area,source_site_eui_kbtu_ft2:eui},data_quality:Object.fromEntries(['estimated_values_energy','alert_energy_meter_has_less','alert_energy_meter_has_gaps','alert_gross_floor_area_is'].map(key=>[key,rawText(row[key])]))};
}
export async function inspectEnergyScope(building:CityBuilding,args:Data) {
  fields(args,['id','reportYear']);
  if(args.id!==building.id||args.reportYear!==2024)throw new InvestigationInputError('Use the resolved native identifier and supported 2024 reporting year.');
  const bin=typeof building.bin==='string'&&/^[1-5]\d{6}$/.test(building.bin)?building.bin:null;
  const bbl=typeof building.bbl==='string'&&/^[1-5]\d{9}$/.test(building.bbl)?building.bbl:null;
  if(!bin&&!bbl)throw new InvestigationInputError('The official building record has no supported BIN or BBL for an energy lookup.');
  const queries:Data[]=[];
  async function get(where:string) {
    const url=new URL(ENERGY_ENDPOINT);url.searchParams.set('$select',ENERGY_FIELDS);url.searchParams.set('$where',`report_year=2024 and (${where})`);url.searchParams.set('$order','property_id');url.searchParams.set('$limit',String(MAX_ROWS+1));
    const rows=await fetchPublicJson<unknown>(url,{timeoutMs:15000,label:'ll84_scope'});
    if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error('Invalid LL84 response.');
    queries.push({url:url.toString(),retrievedAt:new Date().toISOString(),returned:rows.length,limit:MAX_ROWS,truncated:rows.length>MAX_ROWS});
    return rows.slice(0,MAX_ROWS).map(row=>report(row as Data)).filter((row):row is EnergyReport=>row!==null);
  }
  const predicates=[...(bin?[`nyc_building_identification like '%${bin}%'`]:[]),...(bbl?[`nyc_borough_block_and_lot like '%${bbl}%'`]:[])];
  const candidates=await get(predicates.join(' or '));
  const matched=candidates.filter(row=>Boolean(bin&&row.bins?.includes(bin)||bbl&&row.bbls?.includes(bbl)));
  const parentIds=[...new Set(matched.map(row=>row.reporting_scope?.parent_property_id_raw).filter((id):id is string=>typeof id==='string'&&/^[1-9]\d{0,15}$/.test(id)))];
  const followed=parentIds.slice(0,MAX_PARENTS);
  const linked=followed.length?await get(`property_id in (${followed.join(',')}) or parent_property_id in (${followed.map(id=>`'${id}'`).join(',')})`):[];
  const verifiedLinked=linked.filter(row=>followed.includes(row.property_id)||followed.includes(row.reporting_scope?.parent_property_id_raw??''));
  const analysis=analyzeEnergyEvidence([...matched,...verifiedLinked],{bin,bbl,reportYear:2024});
  const queryLimited=queries.some(query=>query.truncated)||parentIds.length>MAX_PARENTS;
  const incomplete=analysis.nodes.some(node=>node.relationship==='unknown'||node.conflictingCopies||node.relationship==='child'&&!node.parentAvailable);
  const source={url:ENERGY_SOURCE,dataset:'NYC LL84 energy disclosures',reportYear:2024,retrievalMode:'live-query',queries,publisherRevision:null,revisionNote:'Publisher revision was not separately fetched; sequential bounded requests do not establish an atomic archive snapshot.'};
  const repeated=analysis.sameEnergyRelationships.length;
  const answer=analysis.nodes.length===0?'The bounded official 2024 LL84 query returned no exact BIN/BBL-linked reporting property. This is not evidence of zero consumption, exemption or an efficient building.':`The bounded 2024 LL84 lookup found ${analysis.nodes.length} distinct reporting properties at this year and scope. ${repeated?`${repeated} verified parent–child relationship${repeated===1?'':'s'} repeat the same positive reported energy total; different reported floor areas can produce different EUI values. `:''}${incomplete?'Some reporting relationships remain unresolved. ':''}${queryLimited?'A row or parent-group bound was reached; further linked reports may be missing. ':''}Parent and child totals must not be added, and a tax-lot match does not establish building-specific consumption. ${CAPACITY_LIMIT}`;
  return {kind:'investigation' as const,investigationType:'energy_scope',answer,selection:{id:building.id,reportYear:2024},selectionNeedsReview:true,grounded:true,
    data:{target:{id:building.id,bin,bbl,address:building.address,sourceIds:building.source_ids,plutoVersion:building.pluto_version,footprintEditedAt:building.footprint_edited_at,retrieval:building.retrieval??null},analysis,source,queryLimited,limits:{rowsPerQuery:MAX_ROWS,maxRequests:2,maxParentGroups:MAX_PARENTS},exactMatchNote:'Candidate substring queries are followed by exact parsed BIN/BBL token validation. Linked reports require a native property/parent ID. Owner-reported identities are not independently certified.'},
    citations:analysis.nodes.map(node=>({evidenceId:`ll84:${node.key}`,source,measurement:'reported_energy_scope',scope:node.scopeLabel,unit:{siteEnergyKbtu:'kBtu/year',floorAreaFt2:'ft²',siteEuiKbtuFt2:'kBtu/ft²/year'},value:{propertyId:node.propertyId,parentKey:node.parentKey,bins:node.bins,bbls:node.bbls,siteEnergyKbtu:node.siteEnergyKbtu,floorAreaFt2:node.floorAreaFt2,siteEuiKbtuFt2:node.siteEuiKbtuFt2}})),
    limitations:['2024 is the supported report year, not a claim that it is the newest published year.','This is a bounded lookup, not a completeness guarantee for every meter, report or property; missing values are not zero.',...(queryLimited?['A row or parent-group bound was reached; some linked records were not retrieved.']:[]),CAPACITY_LIMIT],nextQuestion:'Which meters, gross floor areas, buildings and operating uses do these reports actually cover?',unknowns:['meter_allocation','building_cooling_capacity_kw','available_electrical_capacity_kw','utility_bill','building_efficiency'],groundingNote:'The application interpreted native official report IDs and values. It did not allocate energy to geometry, add overlapping reports, infer efficiency or turn EUI into an operational requirement.'};
}

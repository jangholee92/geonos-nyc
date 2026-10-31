"""Build a small server-bundled climate index from the audited public assets."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data/climate'
station_bytes = (DATA / 'station_summary.json').read_bytes()
projection_bytes = (DATA / 'npcc4_projections.json').read_bytes()
stations = json.loads(station_bytes)
projections = json.loads(projection_bytes)
metrics = ['tmean_c', 'hot_days_32_2c', 'precip_mm', 'rx1day_mm', 'cooling_degree_days_18c', 'heating_degree_days_18c']
index = {
    'schema_version': '1.0',
    'source_assets': {
        'station_summary.json': hashlib.sha256(station_bytes).hexdigest(),
        'npcc4_projections.json': hashlib.sha256(projection_bytes).hexdigest(),
    },
    'observations': {
        'historical_cutoff': stations['historical_cutoff'],
        'source_snapshot': stations['source_snapshot'],
        'stations': [],
    },
    'projections': {key: projections[key] for key in ['assessment', 'spatial_support', 'baseline_years', 'baseline_published_annual', 'baseline_extremes', 'methods', 'annual', 'extremes', 'limitations', 'provenance']},
}
for station in stations['stations']:
    item = {key: station[key] for key in ['id', 'name', 'latitude', 'longitude', 'outside_nyc_reference', 'source_url', 'source_sha256', 'source_retrieved_on', 'source_latest_valid_record_by_element']}
    item['periods'] = {}
    for period in ['baseline_1991_2020', 'recent_2021_2025']:
        source = station['summary'][period]
        item['periods'][period] = {key: source[key] for key in ['start_year', 'end_year', 'expected_years', 'min_daily_coverage']}
        item['periods'][period]['annual_average'] = {key: source['annual_average'][key] for key in metrics}
        item['periods'][period]['valid_years_by_metric'] = {key: source['valid_years_by_metric'][key] for key in metrics}
    index['observations']['stations'].append(item)
destination = ROOT / 'lib/climate-evidence-index.json'
destination.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps({'path': str(destination), 'bytes': destination.stat().st_size, 'stations': len(index['observations']['stations'])}))

# A separate compact source snapshot keeps paired values and timestamps together.
# Do not bundle raw hourly observations, monthly arrays or episode traces.
hourly_bytes = (DATA / 'hourly_context.json').read_bytes()
hourly = json.loads(hourly_bytes)
assert hourly['schema'] == 'geonos.noaa-paired-hourly-context.v1'
assert {station['station_id'] for station in hourly['stations']} == {'USW00094789', 'USW00014732', 'USW00014734'}
hourly_index = {
    'schema_version': '1.0',
    'source_asset': {'file': 'hourly_context.json', 'sha256': hashlib.sha256(hourly_bytes).hexdigest(), 'generated_at': hourly['generated_at']},
    **{key: hourly[key] for key in ['product', 'product_url', 'documentation_url', 'documentation_version', 'legacy_product_notice_url', 'period_utc', 'units', 'limitations']},
    'method': {key: hourly['method'][key] for key in ['pairing', 'quality_allowlist', 'quality_policy', 'hour_selection', 'coverage', 'peak_ties', 'physical_guard', 'central_park']},
    'stations': [],
}
year_keys = ['year', 'source_url', 'source_sha256', 'source_last_modified', 'retrieved_at', 'first_raw_observation_utc', 'last_raw_observation_utc', 'raw_records', 'expected_utc_hours', 'paired_hourly_samples', 'unrepresented_utc_hours', 'coverage_percent', 'longest_unrepresented_run', 'highest_temperature_observation', 'highest_dew_point_observation', 'highest_temperature_observation_count', 'highest_dew_point_observation_count', 'samples_at_both_temperature_and_dew_point_maxima']
for station in hourly['stations']:
    assert sorted(year['year'] for year in station['years']) == list(range(2021, 2026))
    item = {key: station[key] for key in ['station_id', 'name', 'latitude', 'longitude', 'elevation_m', 'state', 'station_metadata_url']}
    item['years'] = []
    for year in station['years']:
        assert year['paired_hourly_samples'] + year['unrepresented_utc_hours'] == year['expected_utc_hours']
        assert abs(year['coverage_percent'] - year['paired_hourly_samples'] / year['expected_utc_hours'] * 100) <= 0.00051
        assert len(year['source_sha256']) == 64 and all(char in '0123456789abcdef' for char in year['source_sha256'])
        for key in ['highest_temperature_observation', 'highest_dew_point_observation']:
            pair = year[key]
            assert pair['timestamp_utc'].startswith(str(year['year']) + '-') and pair['timestamp_utc'].endswith('Z')
            assert isinstance(pair['temperature_c'], (int, float)) and isinstance(pair['dew_point_c'], (int, float))
            assert -100 <= pair['dew_point_c'] <= pair['temperature_c'] <= 70
            for variable in ['temperature', 'dew_point']:
                assert pair[variable + '_quality_code'] in hourly['method']['quality_allowlist'][pair[variable + '_source_code']]
        item['years'].append({key: year[key] for key in year_keys})
    hourly_index['stations'].append(item)
hourly_destination = ROOT / 'lib/hourly-evidence-index.json'
hourly_output = json.dumps(hourly_index, ensure_ascii=False, separators=(',', ':')) + '\n'
assert len(hourly_output.encode()) < 35000, 'Hourly tool index unexpectedly expanded'
hourly_destination.write_text(hourly_output)
print(json.dumps({'path': str(hourly_destination), 'bytes': hourly_destination.stat().st_size, 'station_years': sum(len(station['years']) for station in hourly_index['stations'])}))

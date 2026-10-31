#!/usr/bin/env python3
"""Stage and validate public derivatives before atomic publication.

Product copy is curated in catalog-copy.json. Existing English method reports
are preserved; curated reports seed a fresh output. Source archives/SQLite are
never copied. Run --dry-run or --destination /temporary/public for review.
"""
from __future__ import annotations
import argparse,copy,gzip,hashlib,io,json,re,shutil,sqlite3,tempfile,os,zlib
from pathlib import Path

REPO=Path(__file__).resolve().parents[1]
HANGUL=re.compile('[\uac00-\ud7a3]')
def read(path):return json.loads(Path(path).read_text())
def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')
def copy_file(source,destination):
 destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,destination)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def deterministic_gzip(raw):
 stream=io.BytesIO()
 with gzip.GzipFile(filename='',mode='wb',fileobj=stream,compresslevel=9,mtime=0) as compressor:compressor.write(raw)
 encoded=stream.getvalue()
 if gzip.decompress(encoded)!=raw:raise ValueError('Gzip round-trip verification failed.')
 return encoded
def surroundings_bytes(root,entry):
 raw=root/(entry['key']+'.json');compressed=root/(entry['key']+'.json.gz')
 try:payload=raw.read_bytes() if raw.exists() else gzip.decompress(compressed.read_bytes())
 except (OSError,EOFError,zlib.error) as error:raise ValueError(f'Surroundings shard {entry["key"]} could not be decoded.') from error
 if len(payload)!=entry['bytes'] or hashlib.sha256(payload).hexdigest()!=entry['sha256']:raise ValueError(f'Surroundings shard {entry["key"]} failed integrity validation.')
 document=json.loads(payload)
 if len(document.get('records',{}))!=entry['records']:raise ValueError(f'Surroundings shard {entry["key"]} record count disagrees with the manifest.')
 return payload
def assert_english(value,label):
 if HANGUL.search(json.dumps(value,ensure_ascii=False) if not isinstance(value,str) else value):raise ValueError(f'{label} contains untranslated Korean product copy; no public files were changed.')
def format_copy(value,context):
 if isinstance(value,str):return value.format_map(context)
 if isinstance(value,list):return [format_copy(v,context) for v in value]
 if isinstance(value,dict):return {k:format_copy(v,context) for k,v in value.items()}
 return value

def build(source_root:Path,repo:Path,stage:Path,current:Path):
 source=source_root/'data';data=stage/'data';layers_path=source/'layers-citywide'
 manifest=read(layers_path/'manifest.json');browser=read(layers_path/'browser_catalog.json');by={d['id']:d for d in manifest['datasets']}
 counts=read(source/'citywide/citywide_counts.json')
 if counts.get('status')!='complete_verified' or any(s['source_rows']!=s['downloaded_rows'] for s in counts['sources']):raise ValueError('The citywide source counts are not reconciled.')
 energy_index=read(layers_path/'energy/index.json')
 source_versions={s['dataset_id']:s for s in counts['sources']}
 pluto_version=source_versions['64uk-42ks'].get('source_version')
 if not pluto_version:
  database=source/'citywide/nyc.sqlite'
  if not database.exists():raise ValueError('PLUTO source_version is absent and the read-only source database is unavailable.')
  with sqlite3.connect(f'file:{database}?mode=ro',uri=True) as db:
   versions=[r[0] for r in db.execute('SELECT DISTINCT version FROM parcels') if r[0]]
  if len(versions)!=1:raise ValueError(f'PLUTO snapshot has ambiguous native versions: {versions}')
  pluto_version=versions[0]
 context={'footprint_count':counts['counts']['building_footprints'],'parcel_count':counts['counts']['parcels'],'invalid_geometry':counts['coverage']['buildings']['geometry_invalid'],'placeholders':counts['coverage']['buildings']['placeholder_geometries'],'multiple_footprint_lots':counts['coverage']['join']['tax_lots_with_multiple_footprints'],'unmatched_footprints':counts['coverage']['buildings']['parcel_join_unmatched'],'pluto_version':pluto_version,'energy_reports':by['ll84_energy']['row_count'],'energy_year':energy_index['calendar_year'],'energy_bbls':sum(s['bbl_count'] for s in energy_index['shards'].values())}
 curated=read(repo/'scripts/catalog-copy.json');assert_english(curated,'Curated catalog')
 entries={d['id']:format_copy(copy.deepcopy(d),context) for d in curated['layers']}
 bc_entries={Path(b['path']).stem:b for b in browser['layers'] if Path(b['path']).suffix=='.geojson' and b['bytes']<=5_000_000}
 for ident,b in bc_entries.items():
  if ident not in entries:raise ValueError(f'New display layer {ident} needs reviewed English catalog copy.')
  raw=layers_path/b['path']
  if len(read(raw).get('features',[]))!=b['feature_count']:raise ValueError(f'{raw.name} feature count disagrees with its source manifest.')
  copy_file(raw,data/'layers'/raw.name);d=entries[ident];s=by[b['source_id']]
  d.update(record_count=b['feature_count'],publisher=s.get('publisher','NYC'),url=s['source_url'],asset='/data/layers/'+raw.name,display_only=b.get('display_only',False),method=b['method'])
  d['date']=s.get('source_version','Source version unavailable') if b['source_id']=='zoning' else s.get('source_data_updated_at',s.get('version','See source metadata'))
  # Version-sensitive notes come from metadata, while ordinary copy stays curated.
  if b['source_id']=='zoning':
   d['caveats']=[c for c in d['caveats'] if not c.startswith('The acquired archive is version')]
   d['caveats'].append('Acquired archive version: '+str(s.get('source_version','unknown'))+'. A stale platform row-update date is not the archive vintage.')
 entries['footprints'].update(record_count=context['footprint_count'],date=counts['timestamps']['footprints_data_updated_at'])
 entries['pluto'].update(record_count=context['parcel_count'],date=f"{pluto_version} / {counts['timestamps']['pluto_data_updated_at']}")
 entries['ll84_energy'].update(record_count=context['energy_reports'],date=f"Reporting year {context['energy_year']} · source updated {by['ll84_energy']['source_data_updated_at']}")
 context_versions=source/'citywide/context_catalog_versions.json'
 if context_versions.exists():
  for version in read(context_versions):
   if version['dataset_id'] in entries:
    entries[version['dataset_id']].update(date=version['source_data_updated_at'],source_metadata_updated_at=version['source_metadata_updated_at'],metadata_verified_at=version['retrieved_at'])
 copy_file(source/'citywide/citywide_counts.json',data/'citywide/citywide_counts.json')
 for name in ['air_quality_2024_by_cd.json','canopy_2010_by_cd.json','stormwater_services.json']:
  copy_file(layers_path/name,data/'layers'/name)
 # Validate enrichment before any destination change. Never erase energy/.
 report_count=0
 for key,info in energy_index['shards'].items():
  relative=Path(info['path']);raw=read(layers_path/relative)
  if len(raw.get('records',{}))!=info['bbl_count']:raise ValueError(f'{relative} BBL count disagrees with the energy index.')
  if not raw.get('reporting_scope_source'):raise ValueError(f'{relative} is missing the reporting-scope source metadata.')
  for bbl,reports in raw['records'].items():
   for report in reports:
    if 'reporting_scope' not in report:raise ValueError(f'{relative}: report {report.get("property_id")} would lose reporting_scope; regenerate enriched source shards first.')
    report_count+=1
  if raw.get('reporting_scope_source')!=energy_index.get('reporting_scope_source'):raise ValueError(f'{relative}: reporting_scope source revision disagrees with the index.')
  if not info.get('sha256') or digest(layers_path/relative)!=info['sha256']:raise ValueError(f'{relative}: energy shard checksum failed; regenerate the verified index.')
  if (layers_path/relative).stat().st_size!=info['bytes']:raise ValueError(f'{relative}: energy shard byte count disagrees with the index.')
  target=data/relative;copy_file(layers_path/relative,target)
  info['bytes']=target.stat().st_size
 write(data/'energy/index.json',energy_index)
 if energy_index.get('counts',{}).get('report_references')!=report_count:raise ValueError('Energy report-reference count disagrees with the index.')
 # Enrichment changes derivative sizes, not the preserved raw-report checksum.
 energy_source=by['ll84_energy'];max_energy_bytes=max(s['bytes'] for s in energy_index['shards'].values())
 energy_source['browser_shards_max_bytes']=max_energy_bytes;energy_source['browser_shard_count']=len(energy_index['shards'])
 for derivative in energy_source.get('browser_derivatives',[]):
  if derivative.get('path')=='energy/index.json':
   derivative.update(feature_count=context['energy_bbls'],bytes=(data/'energy/index.json').stat().st_size,max_shard_bytes=max_energy_bytes)
 browser['energy']=energy_index
 write(data/'layers/browser_catalog.json',browser);write(data/'layers/manifest.json',manifest)
 limited=next((d for d in browser.get('stormwater_scenarios',[]) if d['id']=='limited_current'),None)
 if not limited:raise ValueError('Limited-current scenario processing status is absent from source metadata.')
 if limited.get('status')=='acquired' and limited.get('exact_geometry'):
  entries['stormwater_limited_current'].update(status='partial',method='The precise source geometry is decoded and archived, but this scenario is not yet connected to site analysis. Other scenarios are not substitutes.')
 else:
  entries['stormwater_limited_current'].update(status='partial',method='The official limited-current archive is acquired but not decoded by the current OpenFileGDB driver because this specific layer uses compressed CDF tables. It is not connected to site analysis; no other scenario substitutes for it.')
 science=read(source/'climate/science_catalog.json')
 assert_english(science,'Science catalog')
 if not science.get('independent_audit') or not science.get('reference_summary'):raise ValueError('The science catalog would lose its numerical or citation audit metadata.')
 write(data/'climate/science_catalog.json',science)
 for s in science['datasets']:
  if s['id'] not in entries:raise ValueError(f'New climate source {s["id"]} needs reviewed English copy.')
  d=entries[s['id']];d['status']='connected' if s['status'].startswith('acquired') else 'reference';d['url']=s['urls'][0]
  period=s.get('analysis_period')
  d['date']=(str(period.get('start','unknown'))+' to '+str(period.get('end','unknown'))) if isinstance(period,dict) else str(period or s.get('assessment_year') or 'See source metadata')
  if s['id']=='noaa_hourly_extension' and d['status']=='connected':
   hourly_path=source/'climate/hourly_context.json';hourly=read(hourly_path)
   if hourly.get('schema')!='geonos.noaa-paired-hourly-context.v1' or digest(hourly_path)!=s.get('asset_sha256') or hourly_path.stat().st_size!=s.get('asset_bytes'):raise ValueError('Hourly NOAA asset schema/hash/byte length disagrees with the reviewed science catalog.')
   years=[y for station in hourly['stations'] for y in station['years']]
   if len(hourly['stations'])!=3 or len(years)!=15 or any({y['year'] for y in station['years']}!=set(range(2021,2026)) for station in hourly['stations']):raise ValueError('Hourly NOAA station/year coverage disagrees with the declared acquisition.')
   coverage=s['coverage']
   if sum(y['paired_hourly_samples'] for y in years)!=coverage['paired_hourly_samples'] or sum(y['expected_utc_hours'] for y in years)!=coverage['expected_station_hour_bins']:raise ValueError('Hourly NOAA coverage totals disagree with the source summaries.')
   if any(not re.fullmatch('[a-f0-9]{64}',y.get('source_sha256','')) or not y.get('source_url','').startswith('https://www.ncei.noaa.gov/') for y in years):raise ValueError('Hourly NOAA native-file provenance is missing or not the expected official host.')
   d.update(record_count=coverage['paired_hourly_samples'],source_file_count=len(years),coverage=coverage,asset='/data/climate/hourly_context.json')
   copy_file(hourly_path,data/'climate/hourly_context.json')
 # Full city surroundings remain static assets, never JavaScript or Worker data.
 surround_root=source/'decision_patterns/public'
 if not (surround_root/'manifest.json').exists():surround_root=current/'data/surroundings'
 if (surround_root/'manifest.json').exists():
  sm=read(surround_root/'manifest.json')
  if sm.get('status')!='complete':raise ValueError('The surroundings snapshot is incomplete.')
  for f in sm['files']:
   payload=surroundings_bytes(surround_root,f);encoded=deterministic_gzip(payload)
   target=data/'surroundings'/(f['key']+'.json.gz');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(encoded)
   f.update(asset=target.name,compressed_bytes=len(encoded),compressed_sha256=hashlib.sha256(encoded).hexdigest())
  if sum(f['records'] for f in sm['files'])!=sm['source_counts']['records']:raise ValueError('Surroundings shard counts disagree with the manifest total.')
  sm['transport']={'format':'gzip file payload','filename_template':'{key}.json.gz','compression_level':9,'gzip_mtime':0,'compressed_bytes':sum(f['compressed_bytes'] for f in sm['files']),'decoded_bytes':sum(f['bytes'] for f in sm['files']),'max_compressed_shard_bytes':max(f['compressed_bytes'] for f in sm['files']),'max_decoded_shard_bytes':max(f['bytes'] for f in sm['files']),'identity_note':'Existing bytes and sha256 fields identify the unchanged decoded JSON. compressed_bytes and compressed_sha256 identify the deployed gzip file. Historical gzip_bytes fields are level-6 estimates, not the actual level-9 files.','delivery_note':'Browser lazily fetches one gzip file and decompresses it before parsing; metadata and method text remain uncompressed. No citywide archive is loaded in a Worker.'}
  write(data/'surroundings/manifest.json',sm)
  method=source/'decision_patterns/METHOD.txt'
  if not method.exists():method=surround_root/'method.txt'
  method_text=method.read_text()
  delivery=f"The 129 deterministic .json.gz files total {sm['transport']['compressed_bytes']:,} stored bytes and decode to exactly {sm['transport']['decoded_bytes']:,} JSON bytes. The largest compressed shard is {sm['transport']['max_compressed_shard_bytes']:,} bytes; the largest decoded shard is {sm['transport']['max_decoded_shard_bytes']:,} bytes. Every decoded SHA-256 and record count matches the original JSON manifest. Metadata and method text remain uncompressed. The browser lazily fetches and decompresses only the selected building's shard and caches at most 12 shards. Assets remain outside JavaScript bundles; never load the entire archive into a 128 MiB Worker or eagerly fetch every shard. Original uncompressed JSON and research SQLite remain outside the site repository."
  method_text=re.sub(r'(?<=Browser delivery and resource limits\n).*?(?=\nEach row carries)',delivery,method_text,flags=re.S)
  if 'Independent stratified recomputation' not in method_text:
   method_text=method_text.replace('\nBrowser delivery and resource limits\n','\nIndependent stratified recomputation: 80 additional records (16 per borough) passed using original footprint CSV WKT and native DEP FileGDB polygons read directly from the official ZIP. The independent meter-coordinate path uses brute-force nearest distances and cumulative-buffer area subtraction. The sample includes 20 footprints with interior holes, 30 mapped-band hits, 23 mask/water-band hits and 36 all-band no-hits (categories overlap). Maximum discrepancies were 0.0004992 m for distance and 0.053780 m² for packaged band area, within the documented rounding. US survey-foot conversion was checked against CRS metadata and a one-square-meter analytic control. This is an 80-record numerical audit, not an independent citywide recomputation or physical model validation; it shares the GEOS and PROJ engines. Machine-readable results: /reports/surroundings_spatial_audit.json\n\nBrowser delivery and resource limits\n')
  (data/'surroundings/method.txt').write_text(method_text)
  for ident in ['stormwater_moderate_current.overview','stormwater_moderate_2050.overview']:
   entries[ident]['derived_surroundings']={'manifest':'/data/surroundings/manifest.json','method_document':'/data/surroundings/method.txt','footprint_records':sm['source_counts']['records'],'computed':sm['source_counts']['computed'],'unknown_invalid_or_placeholder':sm['source_counts']['invalid_or_placeholder'],'method':'Full-resolution pinned downloadable polygons; global minimum outline distance and 0–5/5–10/10–20 m external-band areas in EPSG:2263. No risk score or indoor-depth inference. Browser lazily fetches one bounded static shard; source geometry and edit date must match.'}
 catalog={'retrieved_at':manifest['retrieved_at'],'layers':list(entries.values())};assert_english(catalog,'Generated catalog');write(data/'catalog.json',catalog)
 # Keep hand-edited English reports. Seed fresh or untranslated destinations.
 for seed in (repo/'scripts/curated-reports').glob('*'):
  existing=current/'reports'/seed.name
  chosen=existing if existing.exists() and not HANGUL.search(existing.read_text()) else seed
  assert_english(chosen.read_text(),seed.name);copy_file(chosen,stage/'reports'/seed.name)
 return {'catalog_entries':len(entries),'connected':sum(d['status']=='connected' for d in entries.values()),'energy_report_references':report_count,'surroundings_records':sm['source_counts']['records'] if 'sm' in locals() else 0,'surroundings_transport':sm.get('transport') if 'sm' in locals() else None}

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source-root',type=Path,default=REPO.parent);parser.add_argument('--destination',type=Path,default=REPO/'public');parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
 destination=args.destination.resolve();current=destination if (destination/'data/catalog.json').exists() else REPO/'public'
 with tempfile.TemporaryDirectory(prefix='geonos-public-stage-') as temporary:
  stage=Path(temporary);summary=build(args.source_root.resolve(),REPO,stage,current)
  files=[p for p in stage.rglob('*') if p.is_file()];changes=[]
  for path in files:
   target=destination/path.relative_to(stage)
   if not target.exists() or digest(path)!=digest(target):changes.append((path,target))
  # Only known raw shard assets may be removed, after all decoded identities pass.
  removals=[];staged_manifest=stage/'data/surroundings/manifest.json'
  if staged_manifest.exists():
   for entry in read(staged_manifest)['files']:
    raw=destination/'data/surroundings'/(entry['key']+'.json')
    if raw.exists():
     if raw.stat().st_size!=entry['bytes'] or digest(raw)!=entry['sha256']:raise ValueError(f'Existing raw surroundings shard {entry["key"]} differs from its pinned identity; refusing removal.')
     removals.append(raw)
  summary.update(managed_files=len(files),changed_files=len(changes),changed_paths=[str(target.relative_to(destination)) for _,target in changes],removed_files=len(removals),removed_paths=[str(p.relative_to(destination)) for p in removals],dry_run=args.dry_run)
  if not args.dry_run:
   # Validation is complete. Replace only managed files, never whole directories.
   for path,target in changes:
    target.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix='.'+target.name+'.',dir=target.parent,delete=False) as stream:
     temporary_file=Path(stream.name)
     with path.open('rb') as source:shutil.copyfileobj(source,stream)
    os.replace(temporary_file,target)
   # Every replacement is already present before obsolete raw files are unlinked.
   for path in removals:path.unlink()
  print(json.dumps(summary,indent=2))
if __name__=='__main__':main()

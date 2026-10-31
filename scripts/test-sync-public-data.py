#!/usr/bin/env python3
"""Integration audit using real acquired snapshots and disposable destinations."""
import argparse,gzip,hashlib,importlib.util,json,shutil,subprocess,sys,tempfile
from pathlib import Path
REPO=Path(__file__).resolve().parents[1]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def files(root):return {str(p.relative_to(root)):sha(p) for p in root.rglob('*') if p.is_file()}
def run(*args,ok=True):
 result=subprocess.run([sys.executable,str(REPO/'scripts/sync-public-data.py'),*map(str,args)],capture_output=True,text=True)
 if ok and result.returncode:raise AssertionError(result.stderr)
 return result
parser=argparse.ArgumentParser();parser.add_argument('--source-root',type=Path,default=REPO.parent);parser.add_argument('--report',type=Path);args=parser.parse_args();source=args.source_root.resolve()
with tempfile.TemporaryDirectory(prefix='geonos-sync-audit-') as temporary:
 temp=Path(temporary);destination=temp/'public';(destination/'data').mkdir(parents=True);(destination/'data/keep-custom.txt').write_text('Unmanaged content stays intact.\n')
 first=json.loads(run('--source-root',source,'--destination',destination).stdout)
 assert (destination/'data/keep-custom.txt').exists()
 report=destination/'reports/LAYERS_METHODS.md';report.write_text(report.read_text()+'\nCurated review note retained by the sync audit.\n')
 before=files(destination);second=json.loads(run('--source-root',source,'--destination',destination).stdout)
 assert second['changed_files']==0 and files(destination)==before
 catalog=json.loads((destination/'data/catalog.json').read_text());assert len(catalog['layers'])==32
 assert any(d.get('derived_surroundings',{}).get('computed')==1082923 for d in catalog['layers'])
 manifest=json.loads((destination/'data/surroundings/manifest.json').read_text());assert len(manifest['files'])==129
 assert not list((destination/'data/surroundings').glob('[0-9]*.json'))
 assert len(list((destination/'data/surroundings').glob('[0-9]*.json.gz')))==129
 for entry in manifest['files']:
  archive=destination/'data/surroundings'/entry['asset'];encoded=archive.read_bytes();decoded=gzip.decompress(encoded)
  assert len(decoded)==entry['bytes'] and hashlib.sha256(decoded).hexdigest()==entry['sha256']
  assert len(encoded)==entry['compressed_bytes'] and sha(archive)==entry['compressed_sha256']
  assert encoded[4:8]==bytes(4) and encoded[9]==255
 assert sum(f['compressed_bytes'] for f in manifest['files'])==manifest['transport']['compressed_bytes']
 # Existing known raw shards are removed only after verified gzip publication.
 originals=source/'data/decision_patterns/public'
 for key in ['0','117']:shutil.copyfile(originals/(key+'.json'),destination/'data/surroundings'/(key+'.json'))
 unmanaged=destination/'data/surroundings/9999.json';unmanaged.write_text('{"unmanaged":true}\n')
 migration_before=files(destination)
 migration_dry=json.loads(run('--source-root',source,'--destination',destination,'--dry-run').stdout)
 assert migration_dry['removed_files']==2 and files(destination)==migration_before
 migration=json.loads(run('--source-root',source,'--destination',destination).stdout)
 assert migration['removed_files']==2 and migration['changed_files']==0 and unmanaged.exists()
 assert all(not (destination/'data/surroundings'/(key+'.json')).exists() for key in ['0','117'])
 before=files(destination)
 # A stale acquisition pipeline must fail before it can strip reporting scope.
 fake=temp/'source';(fake/'data/layers-citywide/energy').mkdir(parents=True)
 for p in (source/'data').iterdir():
  if p.name!='layers-citywide':(fake/'data'/p.name).symlink_to(p,target_is_directory=p.is_dir())
 for p in (source/'data/layers-citywide').iterdir():
  if p.name!='energy':(fake/'data/layers-citywide'/p.name).symlink_to(p,target_is_directory=p.is_dir())
 for p in (source/'data/layers-citywide/energy').iterdir():(fake/'data/layers-citywide/energy'/p.name).symlink_to(p)
 bad=fake/'data/layers-citywide/energy/302.json';raw=json.loads(bad.read_text());bad.unlink()
 next(iter(raw['records'].values()))[0].pop('reporting_scope');bad.write_text(json.dumps(raw))
 failure=run('--source-root',fake,'--destination',destination,ok=False)
 assert failure.returncode and 'reporting_scope' in failure.stderr and files(destination)==before
 # A changed compact climate asset must not silently inherit a reviewed catalog hash.
 bad.unlink();bad.symlink_to(source/'data/layers-citywide/energy/302.json')
 climate=fake/'data/climate';climate.unlink();climate.mkdir()
 for p in (source/'data/climate').iterdir():(climate/p.name).symlink_to(p,target_is_directory=p.is_dir())
 bad_hourly=climate/'hourly_context.json';hourly=json.loads(bad_hourly.read_text());bad_hourly.unlink()
 hourly['stations'][0]['years'][0]['paired_hourly_samples']-=1;bad_hourly.write_text(json.dumps(hourly))
 failure=run('--source-root',fake,'--destination',destination,ok=False)
 assert failure.returncode and 'Hourly NOAA' in failure.stderr and files(destination)==before
 # A gzip-only preserved destination can reproduce itself without raw public JSON.
 bad_hourly.unlink();bad_hourly.symlink_to(source/'data/climate/hourly_context.json')
 patterns=fake/'data/decision_patterns';patterns.unlink();patterns.mkdir()
 fallback=json.loads(run('--source-root',fake,'--destination',destination).stdout)
 assert fallback['changed_files']==0 and fallback['removed_files']==0 and files(destination)==before
 # A corrupt compressed input must fail without changing any destination file.
 compressed=destination/'data/surroundings/0.json.gz';good=compressed.read_bytes();compressed.write_bytes(good[:-10])
 corrupt_before=files(destination);failure=run('--source-root',fake,'--destination',destination,ok=False)
 assert failure.returncode and 'Surroundings shard 0' in failure.stderr and files(destination)==corrupt_before
 compressed.write_bytes(good)
 # Refuse to delete a raw shard whose bytes no longer match the original identity.
 changed_raw=destination/'data/surroundings/0.json';changed_raw.write_text('{}')
 changed_before=files(destination);failure=run('--source-root',source,'--destination',destination,ok=False)
 assert failure.returncode and 'refusing removal' in failure.stderr and files(destination)==changed_before
 changed_raw.unlink()
 # Dry-run the real public target and prove those managed files were untouched.
 watched=[REPO/'public'/p for p in ['data/catalog.json','data/layers/manifest.json','data/layers/browser_catalog.json','data/energy/index.json','reports/LAYERS_METHODS.md']]
 hashes={str(p):sha(p) for p in watched};dry=json.loads(run('--source-root',source,'--dry-run').stdout)
 assert hashes=={str(p):sha(p) for p in watched}
 spec=importlib.util.spec_from_file_location('sync_public',REPO/'scripts/sync-public-data.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 try:module.assert_english(chr(0xAC00),'test')
 except ValueError:pass
 else:raise AssertionError('Untranslated product copy was accepted')
 result={'first_run':first,'idempotent_second_run':second,'real_public_dry_run':dry,'unmanaged_files_preserved':True,'hand_edited_english_report_preserved':True,'all_surroundings_shards_preserved':True,'deterministic_gzip_headers_and_all_decoded_hashes_verified':True,'raw_shard_migration':migration,'raw_shard_migration_dry_run':migration_dry,'gzip_only_source_fallback':fallback,'corrupt_gzip_rejected_before_mutation':True,'changed_raw_shard_deletion_rejected_before_mutation':True,'reporting_scope_regression_rejected_before_mutation':True,'changed_hourly_evidence_rejected_before_mutation':True,'real_public_unchanged_by_dry_run':True,'untranslated_copy_rejected':True}
 if args.report:args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(result,indent=2))
 print(json.dumps(result,indent=2))

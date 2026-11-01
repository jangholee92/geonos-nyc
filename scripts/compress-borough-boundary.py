#!/usr/bin/env python3
"""Reproduce the lossless asset from the pinned original GeoJSON.

python3 scripts/compress-borough-boundary.py ../data/boroughs.geojson
The input stays outside the published app. Source/version changes require a
separate reviewed manifest update; this command cannot silently replace them.
"""
import argparse,gzip,hashlib,io,json,os
from pathlib import Path
repo=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('source',type=Path);a=p.parse_args()
manifest_bytes=(repo/'lib/borough-boundary-manifest.json').read_bytes()
m=json.loads(manifest_bytes);raw=a.source.read_bytes()
sha=lambda b:hashlib.sha256(b).hexdigest()
assert len(raw)==m['decoded_bytes'] and sha(raw)==m['decoded_sha256'],'Original source identity differs'
stream=io.BytesIO()
with gzip.GzipFile(filename='',mode='wb',fileobj=stream,compresslevel=9,mtime=0) as z:z.write(raw)
encoded=stream.getvalue()
assert gzip.decompress(encoded)==raw,'Round-trip differs'
assert len(encoded)==m['compressed_bytes'] and sha(encoded)==m['compressed_sha256'],'Compressed identity differs'
target=repo/'public'/m['asset'].lstrip('/');temp=target.with_suffix(target.suffix+'.tmp')
temp.write_bytes(encoded);os.replace(temp,target)
public_manifest=repo/'public/data/boroughs-manifest.json';manifest_temp=public_manifest.with_suffix('.json.tmp')
manifest_temp.write_bytes(manifest_bytes);os.replace(manifest_temp,public_manifest)
print(json.dumps({'asset':m['asset'],'decoded_bytes':len(raw),'compressed_bytes':len(encoded),'decoded_sha256':sha(raw),'lossless':True}))

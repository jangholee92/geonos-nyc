#!/usr/bin/env python3
"""Read-only SQLite export for build-citywide-tiles.mjs; one buffered tile per line."""
import argparse, collections, hashlib, json, math, pathlib, sqlite3
import shapely

parser=argparse.ArgumentParser()
parser.add_argument('--source',required=True)
args=parser.parse_args()
source=pathlib.Path(args.source).resolve()
metadata=json.loads(source.with_name('citywide_counts.json').read_text())
archive=json.loads(source.with_name('manifest.json').read_text())
expected=next(item for item in archive['files'] if item['path']=='nyc.sqlite')
with source.open('rb') as f:
    source_hash=hashlib.file_digest(f,'sha256').hexdigest()
if source_hash!=expected['sha256']:
    raise RuntimeError('SQLite hash differs from its audited archive manifest; review the source before rebuilding.')
connection=sqlite3.connect('file:'+str(source)+'?mode=ro&immutable=1',uri=True)
connection.row_factory=sqlite3.Row
zoom=14
extent=8192
buffer=64
bounds=[-74.26,40.49,-73.69,40.92]
n=2**zoom
xy=lambda lon,lat:(int((lon+180)/360*n),int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n))
lon=lambda x:x/n*360-180
lat=lambda y:math.degrees(math.atan(math.sinh(math.pi*(1-2*y/n))))
valid='geometry_valid=1 AND is_placeholder=0'
counts=dict(connection.execute('SELECT COUNT(*) total,SUM(geometry_valid=1 AND is_placeholder=0) renderable,SUM(geometry_valid=0) invalid,SUM(is_placeholder=1) placeholders FROM buildings').fetchone())
if counts['total']!=metadata['counts']['building_footprints']:
    raise RuntimeError('Source count does not match its audited manifest.')
actual=list(connection.execute(f'SELECT MIN(minx),MIN(miny),MAX(maxx),MAX(maxy) FROM buildings WHERE {valid}').fetchone())
if not(bounds[0]<=actual[0] and bounds[1]<=actual[1] and bounds[2]>=actual[2] and bounds[3]>=actual[3]):
    raise RuntimeError('Configured tile rectangle no longer contains all valid source geometry.')
ids_hash=hashlib.sha256()
for (identifier,) in connection.execute(f'SELECT doitt_id FROM buildings WHERE {valid} ORDER BY doitt_id'):
    ids_hash.update((str(identifier)+'\n').encode())
samples=[]
for borough in '12345':
    row=connection.execute(f'SELECT doitt_id,bin,roof_height_ft,feature_code FROM buildings WHERE {valid} AND substr(bin,1,1)=? AND roof_height_ft>0 ORDER BY doitt_id LIMIT 1',(borough,)).fetchone()
    if row:samples.append({'kind':'borough','borough_code':borough,**dict(row)})
for row in connection.execute(f'SELECT doitt_id,bin,roof_height_ft,feature_code FROM buildings WHERE {valid} AND roof_height_ft IS NULL ORDER BY doitt_id LIMIT 5'):
    samples.append({'kind':'unknown_height',**dict(row)})
x0,y0=xy(bounds[0],bounds[3]);x1,y1=xy(bounds[2],bounds[1])
source_metadata=next(item for item in metadata['sources'] if item['dataset_id']=='5zhs-2jue')
header={'kind':'header','schema':'geonos.citywide-footprint-tiles.v1','source':{'dataset_id':source_metadata['dataset_id'],'url':source_metadata['url'],'source_updated_at':source_metadata['source_updated_at'],'retrieval_completed_at':source_metadata['retrieval_completed_at'],'archive_sha256':source_hash,'archive_file':'nyc.sqlite','download_manifest_sha256':source_metadata['download_manifest_sha256']},'counts':counts,'source_valid_ids_sha256':ids_hash.hexdigest(),'bounds':bounds,'actual_source_bounds':actual,'tile_grid_bounds':[lon(x0),lat(y1+1),lon(x1+1),lat(y0)],'grid':{'zoom':zoom,'min_x':x0,'max_x':x1,'min_y':y0,'max_y':y1},'options':{'extent':extent,'buffer':buffer,'tolerance':0,'layer':'buildings'},'samples':samples,'shapely_version':shapely.__version__}
print(json.dumps(header,separators=(',',':')),flush=True)
for x in range(x0,x1+1):
    for y in range(y0,y1+1):
        margin=buffer/extent
        box=(lon(x-margin),lat(y+1+margin),lon(x+1+margin),lat(y-margin))
        rows=connection.execute('SELECT b.doitt_id,b.bin,b.geom_wkb,b.roof_height_ft,b.feature_code FROM building_rtree r JOIN buildings b ON b.doitt_id=r.doitt_id WHERE r.maxx>=? AND r.minx<=? AND r.maxy>=? AND r.miny<=? AND b.geometry_valid=1 AND b.is_placeholder=0 ORDER BY b.doitt_id',(box[0],box[2],box[1],box[3])).fetchall()
        features=[]
        for row in rows:
            height=row['roof_height_ft']
            properties={'id':str(row['doitt_id']),'bin':row['bin'],'height_m':height*.3048 if height is not None and math.isfinite(height) and height>0 else None,'feature_code':row['feature_code']}
            geometry=json.loads(shapely.to_geojson(shapely.from_wkb(row['geom_wkb'])))
            features.append({'type':'Feature','id':row['doitt_id'],'properties':properties,'geometry':geometry})
        print(json.dumps({'kind':'tile','z':zoom,'x':x,'y':y,'data':{'type':'FeatureCollection','features':features}},separators=(',',':')),flush=True)

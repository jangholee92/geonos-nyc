import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import {geoJSONToTile} from '@maplibre/geojson-vt';
import {fromGeojsonVt} from '@maplibre/vt-pbf';

const root=new URL('../public/data/citywide/tiles/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const seen=new Set(),sampleIds=new Set(manifest.validation.source_samples.map(s=>s.doitt_id));
const seamIds=new Set(manifest.validation.boundary_repeat_sample_ids),samples=new Map(),seams=new Map();
let bytes=0,instances=0,empty=0,largest=0;
// Decode every shipped tile once; test assertions below reuse this independent
// read, not in-memory results from the producer or source export stream.
for(const file of manifest.files){
 const raw=readFileSync(new URL(file.path,root));
 assert.equal(raw.length,file.bytes,file.path+' bytes');assert.equal(sha(raw),file.sha256,file.path+' hash');
 const layer=new VectorTile(new Pbf(raw)).layers.buildings,count=layer?.length||0;
 assert.equal(count,file.features,file.path+' features');bytes+=raw.length;instances+=count;largest=Math.max(largest,raw.length);if(!count)empty++;
 if(layer)assert.equal(layer.extent,8192);
 for(let i=0;i<count;i++){
  const f=layer.feature(i);assert.equal(f.type,3);assert.equal(f.properties.id,String(f.id));seen.add(f.id);
  if(sampleIds.has(f.id))samples.set(f.id,[...(samples.get(f.id)||[]),{path:file.path,properties:{...f.properties},geometry:f.loadGeometry()}]);
  if(seamIds.has(f.id))seams.set(f.id,[...(seams.get(f.id)||[]),{path:file.path,properties:{...f.properties}}]);
 }
}

test('all valid native source IDs survive packaged decoding with exactly the audited unique-ID hash',()=>{
 assert.equal(manifest.source_record_count,1082964);assert.equal(manifest.rendered_unique_id_count,1082923);
 assert.equal(seen.size,1082923);
 const decodedHash=sha([...seen].sort((a,b)=>a-b).map(id=>`${id}\n`).join(''));
 assert.equal(decodedHash,manifest.validation.source_valid_ids_sha256);assert.equal(decodedHash,manifest.validation.decoded_unique_ids_sha256);
 assert.deepEqual(manifest.excluded_records,{invalid_geometry:7,placeholder:34,total:41});
});

test('all rectangle tiles exist and empty tiles are valid layers rather than missing-file responses',()=>{
 const {grid}=manifest;
 assert.deepEqual(grid,{zoom:14,min_x:4812,max_x:4838,min_y:6147,max_y:6173});
 assert.equal(manifest.files.length,729);assert.equal(new Set(manifest.files.map(f=>f.path)).size,729);
 const names=new Set(manifest.files.map(f=>f.path));
 for(let x=grid.min_x;x<=grid.max_x;x++)for(let y=grid.min_y;y<=grid.max_y;y++)assert.ok(names.has(`14/${x}/${y}.pbf`));
 assert.equal(empty,manifest.empty_tile_count);assert.ok(empty>0);
 const canonical=fromGeojsonVt({buildings:{features:[]}},{extent:8192,version:2});
 for(const file of manifest.files.filter(f=>f.features===0))assert.deepEqual(readFileSync(new URL(file.path,root)),Buffer.from(canonical));
});

test('sampled native identities, feature type and recorded height conversion agree across all five boroughs',()=>{
 const boroughs=manifest.validation.source_samples.filter(s=>s.kind==='borough');
 assert.deepEqual(boroughs.map(s=>s.borough_code),['1','2','3','4','5']);
 for(const s of boroughs){
  const occurrences=samples.get(s.doitt_id);assert.ok(occurrences?.length);
  for(const item of occurrences){
   assert.equal(item.properties.id,String(s.doitt_id));assert.equal(item.properties.bin,s.bin);assert.equal(item.properties.bin[0],s.borough_code);
   assert.equal(item.properties.feature_code,s.feature_code);assert.ok(Math.abs(item.properties.height_m-s.roof_height_ft*.3048)<1e-9);
   assert.ok(item.geometry.length>0&&item.geometry.every(r=>r.length>=4));
  }
 }
});

test('unknown recorded heights are omitted, never encoded as an invented zero',()=>{
 const unknown=manifest.validation.source_samples.filter(s=>s.kind==='unknown_height');assert.ok(unknown.length>0);
 for(const s of unknown){assert.equal(s.roof_height_ft,null);assert.ok(samples.has(s.doitt_id));for(const item of samples.get(s.doitt_id))assert.ok(!('height_m' in item.properties));}
 assert.ok(manifest.validation.unknown_height_feature_instances>0);
});

test('clipped seam fragments keep one native identity and identical attributes across distinct tiles',()=>{
 assert.ok(manifest.validation.boundary_repeat_id_count>0);assert.ok(seamIds.size>0);
 for(const id of seamIds){
  const occurrences=seams.get(id);assert.ok(occurrences?.length>1,String(id));assert.equal(new Set(occurrences.map(f=>f.path)).size,occurrences.length);
  for(const item of occurrences)assert.deepEqual(item.properties,occurrences[0].properties);
 }
 assert.equal(instances,manifest.feature_instances);assert.ok(instances>seen.size);
});

test('a seam-spanning polygon retains its native ID on both sides and its courtyard hole where present',()=>{
 const z=14,x=4815,y=6156,n=2**z,boundary=(x+1)/n*360-180;
 const latitude=Math.atan(Math.sinh(Math.PI*(1-2*(y+.5)/n)))*180/Math.PI;
 const ring=(w,s,e,n)=>[[w,s],[e,s],[e,n],[w,n],[w,s]];
 const data={type:'FeatureCollection',features:[{type:'Feature',id:1300000,properties:{id:'1300000',bin:'1000001',height_m:null,feature_code:2100},geometry:{type:'Polygon',coordinates:[ring(boundary-.0008,latitude-.0008,boundary+.0008,latitude+.0008),ring(boundary+.0003,latitude-.0002,boundary+.0006,latitude+.0002).reverse()]}}]};
 for(const tileX of [x,x+1]){
  const tile=geoJSONToTile(data,z,tileX,y,{extent:8192,buffer:64,tolerance:0});
  const encoded=fromGeojsonVt({buildings:tile},{extent:8192,version:2}),layer=new VectorTile(new Pbf(encoded)).layers.buildings;
  assert.equal(layer.length,1);const f=layer.feature(0);assert.equal(f.id,1300000);assert.equal(f.properties.id,'1300000');assert.ok(!('height_m' in f.properties));
  if(tileX===x+1){const g=f.toGeoJSON(tileX,y,z).geometry;assert.equal(g.type,'Polygon');assert.equal(g.coordinates.length,2);}
 }
});

test('delivery totals and largest file remain within the stated deployment budget',()=>{
 assert.equal(bytes,manifest.total_bytes);assert.equal(largest,manifest.largest_tile_bytes);assert.ok(largest<25*1024*1024);
 assert.ok(bytes<100*1024*1024);assert.equal(manifest.minzoom,14);assert.equal(manifest.maxzoom,14);
 assert.deepEqual(manifest.bounds,[-74.26,40.49,-73.69,40.92]);assert.equal(manifest.source_layer,'buildings');
 assert.equal(manifest.options.tolerance,0);assert.equal(manifest.source.source_updated_at,'2026-10-25T08:21:07Z');
});

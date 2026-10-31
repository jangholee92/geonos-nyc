#!/usr/bin/env node
/** Offline, deterministic XYZ MVT build. No network, source mutation or model API.
 * Run: node scripts/build-citywide-tiles.mjs
 * Options: --source <nyc.sqlite> --python <python-with-shapely> --output <tiles-dir>
 */
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {gzipSync} from 'node:zlib';
import {geoJSONToTile} from '@maplibre/geojson-vt';
import {fromGeojsonVt} from '@maplibre/vt-pbf';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';

const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--source','--python','--output'].includes(args[i])||!args[i+1])throw Error('Use --source, --python or --output with a path.');options[args[i]]=resolve(args[i+1]);}
const source=options['--source']||resolve(app,'../data/citywide/nyc.sqlite');
const python=options['--python']||resolve(app,'../research/citywide/.venv/bin/python');
const output=options['--output']||join(app,'public/data/citywide/tiles');
const hash=value=>createHash('sha256').update(value).digest('hex');
const packageVersion=async name=>JSON.parse(await readFile(join(app,'node_modules',name,'package.json'),'utf8')).version;
await mkdir(dirname(output),{recursive:true});
const staging=await mkdtemp(join(dirname(output),'.tiles-stage-'));
const child=spawn(python,[join(app,'scripts/build-citywide-tiles.py'),'--source',source],{stdio:['ignore','pipe','inherit']});
const childExit=once(child,'close');
let header;const files=[],seen=new Set(),occurrences=new Map(),sampleMap=new Map(),sampleHits=new Map();
let rawBytes=0,gzipBytes=0,maxBytes=0,featureInstances=0,nonempty=0,unknownHeightInstances=0,propertyChecks=0;
try{
 for await(const line of createInterface({input:child.stdout,crlfDelay:Infinity})){
  const item=JSON.parse(line);
  if(item.kind==='header'){
   if(header)throw Error('Unexpected second source header.');header=item;
   for(const sample of header.samples)sampleMap.set(sample.doitt_id,sample);
   continue;
  }
  if(!header||item.kind!=='tile')throw Error('Missing source header or malformed tile stream.');
  const {z,x,y,data}=item,extent=header.options.extent;
  const tile=geoJSONToTile(data,z,x,y,{extent,buffer:header.options.buffer,tolerance:0});
  const bytes=fromGeojsonVt({buildings:tile||{features:[]}},{extent,version:2});
  if(bytes.byteLength>25*1024*1024)throw Error('A tile exceeds the deployment asset budget.');
  // Decode the actual shipped bytes, independently of the encoder tile object.
  const decoded=new VectorTile(new Pbf(bytes)),layer=decoded.layers.buildings;
  const count=layer?.length||0;
  if(layer&&layer.extent!==extent)throw Error('Encoded layer uses another extent.');
  // The decoder intentionally omits empty layers. Verify their exact canonical
  // protobuf instead; an absent parsed layer must never hide a nonempty tile.
  if(!layer&&(tile?.features.length||Buffer.compare(Buffer.from(bytes),Buffer.from(fromGeojsonVt({buildings:{features:[]}},{extent,version:2})))!==0))throw Error('Nonempty or malformed tile lost its layer.');
  const input=new Map(data.features.map(f=>[f.id,f.properties]));
  for(let i=0;i<count;i++){
   const feature=layer.feature(i),expected=input.get(feature.id),p=feature.properties;
   if(!expected||feature.type!==3||p.id!==String(feature.id))throw Error('Native ID or polygon geometry changed during encoding.');
   for(const key of ['bin','feature_code','height_m']){
    if(expected[key]===null){if(key in p)throw Error(`Unknown ${key} became a value.`);}
    else if(typeof expected[key]==='number'){if(typeof p[key]!=='number'||Math.abs(p[key]-expected[key])>1e-9)throw Error(`Numeric ${key} changed.`);}
    else if(p[key]!==expected[key])throw Error(`Native ${key} changed.`);
   }
   if(!('height_m' in p))unknownHeightInstances++;
   propertyChecks++;seen.add(feature.id);occurrences.set(feature.id,(occurrences.get(feature.id)||0)+1);
   if(sampleMap.has(feature.id)){
    const value={z,x,y,id:feature.id,properties:{...p},rings:feature.loadGeometry().length};
    sampleHits.set(feature.id,[...(sampleHits.get(feature.id)||[]),value]);
   }
  }
  const path=`${z}/${x}/${y}.pbf`,compressed=gzipSync(bytes,{level:9}).byteLength;
  await mkdir(join(staging,String(z),String(x)),{recursive:true});await writeFile(join(staging,path),bytes);
  files.push({path,bytes:bytes.byteLength,sha256:hash(bytes),features:count,gzip_equivalent_bytes:compressed});
  rawBytes+=bytes.byteLength;gzipBytes+=compressed;maxBytes=Math.max(maxBytes,bytes.byteLength);featureInstances+=count;if(count)nonempty++;
  if(files.length%100===0)console.log(`Validated ${files.length} tiles; ${seen.size.toLocaleString('en-US')} distinct native IDs.`);
 }
 const [code]=await childExit;if(code!==0)throw Error(`Source reader failed (${code}).`);
 if(!header)throw Error('No source metadata received.');
 const {grid}=header,expectedTiles=(grid.max_x-grid.min_x+1)*(grid.max_y-grid.min_y+1);
 if(files.length!==expectedTiles)throw Error('Tile rectangle is incomplete.');
 const sortedIds=[...seen].sort((a,b)=>a-b),idHash=hash(sortedIds.map(id=>`${id}\n`).join(''));
 if(seen.size!==header.counts.renderable||idHash!==header.source_valid_ids_sha256)throw Error('Encoded native ID coverage differs from the valid source set.');
 for(const sample of header.samples)if(!sampleHits.has(sample.doitt_id))throw Error('A borough or unknown-height validation sample is missing.');
 const repeatIds=[...occurrences].filter(([,n])=>n>1).map(([id])=>id).sort((a,b)=>a-b);
 const manifest={
  schema:header.schema,producer:'scripts/build-citywide-tiles.mjs',source:header.source,
  source_record_count:header.counts.total,rendered_unique_id_count:seen.size,excluded_records:{invalid_geometry:header.counts.invalid,placeholder:header.counts.placeholders,total:header.counts.total-seen.size},
  bounds:header.bounds,actual_source_bounds:header.actual_source_bounds,tile_grid_bounds:header.tile_grid_bounds,grid,minzoom:grid.zoom,maxzoom:grid.zoom,
  tiles:['/data/citywide/tiles/{z}/{x}/{y}.pbf'],source_layer:'buildings',format:'uncompressed MVT v2',
  properties:{id:'string native DOITT ID; also encoded as numeric MVT feature.id',bin:'native BIN string; omitted when unknown',height_m:'recorded roof height in feet × 0.3048; omitted means unknown/null, not zero',feature_code:'native OTI feature type; not a land-use or occupancy classification'},
  options:header.options,tile_count:files.length,nonempty_tile_count:nonempty,empty_tile_count:files.length-nonempty,total_bytes:rawBytes,gzip_equivalent_bytes:gzipBytes,largest_tile_bytes:maxBytes,feature_instances:featureInstances,
  validation:{decoded_every_tile:true,decoded_property_checks:propertyChecks,source_valid_ids_sha256:header.source_valid_ids_sha256,decoded_unique_ids_sha256:idHash,native_ids_complete:true,boundary_repeat_id_count:repeatIds.length,boundary_repeat_sample_ids:repeatIds.slice(0,20),unknown_height_feature_instances:unknownHeightInstances,source_samples:header.samples.map(sample=>({...sample,decoded_tiles:sampleHits.get(sample.doitt_id)}))},
  tooling:{geojson_vt:await packageVersion('@maplibre/geojson-vt'),vt_pbf:await packageVersion('@maplibre/vt-pbf'),vector_tile_decoder:await packageVersion('@mapbox/vector-tile'),shapely:header.shapely_version},
  method:'All valid non-placeholder source footprints are clipped to buffered Web Mercator tile bounds, quantized to an 8192-unit tile grid, and encoded without simplification (tolerance 0). Native IDs are retained across clipped fragments. Every tile in the stated rectangle exists, including valid empty layers. No geographic or feature-density sampling is applied.',
  limitations:['This is the preserved 2026-10-25 source revision retrieved on 2026-10-27, not a live or exhaustive survey of every physical structure.','The source includes garages, auxiliary structures and other OTI feature types. Seven invalid geometries and 34 placeholders are excluded from polygon display and remain in the full archive.','Tile clipping and coordinate quantization are for display and native-ID selection only. Fetch the authoritative full record before geometry measurements or site evidence analysis.','At this latitude, an 8192-unit z14 tile grid is approximately 0.23 m per unit. Overzoom adds display detail, not survey precision.','Repeated fragments at tile boundaries represent one native DOITT record, not additional buildings.','Roof height is not interior clear height; missing height does not imply a zero-height building.'],
  files,
 };
 await writeFile(join(staging,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 // Replace only this pipeline's own previously generated directory.
 let old;
 try{old=JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(old&&old.producer!=='scripts/build-citywide-tiles.mjs')throw Error('Refusing to replace an unmanaged tile directory.');
 const backup=output+'.previous';
 if(old)await rename(output,backup);
 try{await rename(staging,output);}catch(error){if(old)await rename(backup,output);throw error;}
 if(old)await rm(backup,{recursive:true});
 console.log(JSON.stringify({status:'complete',tiles:files.length,nonempty,unique_ids:seen.size,raw_bytes:rawBytes,gzip_equivalent_bytes:gzipBytes,largest_tile_bytes:maxBytes,source_valid_ids_sha256:idHash},null,2));
}catch(error){child.kill();await rm(staging,{recursive:true,force:true});throw error;}

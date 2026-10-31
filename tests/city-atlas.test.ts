import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node runs TypeScript directly; application imports remain extensionless.
import {atlasBuildingId,cityAtlasSource,CITY_ATLAS} from '../lib/city-atlas.ts';

test('native map identities accept exact DOITT keys and reject parcel IDs, malformed values and coercion',()=>{
 for(const value of ['109855',109855,'819422'])assert.equal(atlasBuildingId(value),String(value));
 for(const value of [null,undefined,{},0,-1,1.5,Infinity,'p:3004880006',' 109855','109855 OR 1=1','1e5','00109855'])assert.equal(atlasBuildingId(value),null);
});
test('the full atlas uses bounded same-origin tiles independent of search conditions',()=>{
 const source=cityAtlasSource('https://demo.example');
 assert.equal(source.tiles[0],'https://demo.example/data/citywide/tiles/{z}/{x}/{y}.pbf');
 assert.equal(source.minzoom,14);assert.equal(source.maxzoom,14);
 assert.deepEqual(source.bounds,[-74.26,40.49,-73.69,40.92]);
 assert.equal(CITY_ATLAS.mappedOutlines+CITY_ATLAS.unsupportedGeometries,CITY_ATLAS.sourceRecords);
});

import type {CityBuilding, Geometry} from './city';
import quality from './city-quality.json';

type Point = readonly [number, number];
type Ring = number[][];
type Relation = 'outside' | 'inside' | 'boundary';
const nativeUnsupported = new Set([...quality.invalid_geometry_doitt_ids, ...quality.placeholder_doitt_ids].map(String));
const coordinate = (value:unknown):value is number[] => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);

function validRing(value:unknown):value is Ring {
 if(!Array.isArray(value) || value.length < 4 || !value.every(coordinate))return false;
 const first=value[0],last=value[value.length-1];
 if(first[0]!==last[0] || first[1]!==last[1])return false;
 // Translate first: small NYC footprints should not lose area to cancellation
 // between products of absolute longitude/latitude coordinates.
 let twiceArea=0;
 for(let i=1;i<value.length-1;i++)twiceArea+=(value[i][0]-first[0])*(value[i+1][1]-first[1])-(value[i+1][0]-first[0])*(value[i][1]-first[1]);
 return Number.isFinite(twiceArea) && twiceArea!==0;
}

function relation(ring:Ring, point:Point):Relation {
 const [x,y]=point;let inside=false;
 for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1];
  if(dx===0&&dy===0)continue;
  // Floating-point boundary tolerance only; never a screen-pixel/nearest radius.
  const epsilon=Number.EPSILON*16*Math.max(1,Math.abs(x),Math.abs(y),Math.abs(a[0]),Math.abs(a[1]),Math.abs(b[0]),Math.abs(b[1]));
  const cross=dx*(y-a[1])-dy*(x-a[0]);
  if(Math.abs(cross)<=epsilon*Math.max(Math.abs(dx),Math.abs(dy)) && x>=Math.min(a[0],b[0])-epsilon && x<=Math.max(a[0],b[0])+epsilon && y>=Math.min(a[1],b[1])-epsilon && y<=Math.max(a[1],b[1])+epsilon)return 'boundary';
  if((a[1]>y)!==(b[1]>y) && x<a[0]+(y-a[1])*dx/dy)inside=!inside;
 }
 return inside?'inside':'outside';
}

function covers(geometry:Geometry,point:Point):boolean {
 const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:null;
 if(!Array.isArray(polygons)||!polygons.length)return false;
 // One malformed component invalidates the candidate instead of silently
 // choosing from a partial outline. Native topology flags are checked below.
 if(!polygons.every(p=>Array.isArray(p)&&p.length>0&&p.every(validRing)))return false;
 return polygons.some(p=>{
  const exterior=relation(p[0],point);
  if(exterior==='outside')return false;
  if(exterior==='boundary')return true;
  for(const hole of p.slice(1)){
   const location=relation(hole,point);
   if(location==='inside')return false;
   if(location==='boundary')return true;
  }
  return true;
 });
}

/** Return the first actual footprint covering this longitude/latitude point.
 * Hole interiors and gaps between components are excluded; all polygon
 * boundaries are included. Overlapping/shared-boundary matches retain input
 * order. This never substitutes the nearest building, its representative point,
 * or parcel geometry, and does not repair invalid native source geometry.
 */
export function pickBuildingAtPoint(buildings:readonly CityBuilding[],point:Point):CityBuilding|null {
 if(!coordinate(point)||Math.abs(point[0])>180||Math.abs(point[1])>90)return null;
 for(const building of buildings){
  if(building.entity_type==='parcel'||building.geometry_quality==='invalid_or_placeholder'||building.feature_code===1003||nativeUnsupported.has(String(building.id)))continue;
  if(covers(building.geometry,point))return building;
 }
 return null;
}

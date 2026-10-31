import type { CityBuilding, Geometry } from './city';

/** Presentation only: local equirectangular meters, not analytical site distance.
 * Each building has its own center and longitude correction. A common frame
 * shares physical width/height, never the geographic bounds between buildings.
 */
export type PhysicalDrawingFrame = { widthMeters: number; heightMeters: number; outlineCount: number };
export type OutlineCandidate = Pick<CityBuilding, 'geometry' | 'entity_type' | 'geometry_quality' | 'feature_code'>;
export type LocalOutline = {
  polygons: number[][][][]; longitude: number; latitude: number;
  metersPerLongitudeDegree: number; widthMeters: number; heightMeters: number;
};
export const METERS_PER_LATITUDE_DEGREE = 111195;

export function localOutline(geometry: Geometry | null | undefined): LocalOutline | null {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) return null;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!polygons.length || polygons.length > 1000) return null;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity, vertices = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || (vertices += ring.length) > 50_000) return null;
      for (const p of ring) {
        if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) >= 85) return null;
        west = Math.min(west, p[0]); east = Math.max(east, p[0]); south = Math.min(south, p[1]); north = Math.max(north, p[1]);
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return null;
    }
    const outer = polygon[0] as number[][];
    // Translation first avoids cancellation from large longitude/latitude terms.
    let twiceArea = 0;
    for (let i = 1; i < outer.length - 1; i++) twiceArea += (outer[i][0] - outer[0][0]) * (outer[i + 1][1] - outer[0][1]) - (outer[i + 1][0] - outer[0][0]) * (outer[i][1] - outer[0][1]);
    if (Math.abs(twiceArea) < 1e-16) return null;
  }
  const latitude = (south + north) / 2, longitude = (west + east) / 2;
  const metersPerLongitudeDegree = METERS_PER_LATITUDE_DEGREE * Math.cos(latitude * Math.PI / 180);
  return { polygons, longitude, latitude, metersPerLongitudeDegree, widthMeters: Math.max(1, (east - west) * metersPerLongitudeDegree), heightMeters: Math.max(1, (north - south) * METERS_PER_LATITUDE_DEGREE) };
}

export function eligibleOutline(building: OutlineCandidate): LocalOutline | null {
  if (building.entity_type === 'parcel' || building.geometry_quality === 'invalid_or_placeholder' || building.feature_code === 1003) return null;
  return localOutline(building.geometry);
}

export function commonOutlineFrame(buildings: readonly OutlineCandidate[]): PhysicalDrawingFrame | null {
  const outlines = buildings.map(eligibleOutline).filter((value): value is LocalOutline => value !== null);
  if (outlines.length < 2) return null;
  return {
    widthMeters: Math.max(...outlines.map(outline => outline.widthMeters)),
    heightMeters: Math.max(...outlines.map(outline => outline.heightMeters)),
    outlineCount: outlines.length,
  };
}

export function drawingPixelsPerMeter(width: number, height: number, frame: Pick<PhysicalDrawingFrame, 'widthMeters' | 'heightMeters'>): number {
  if (![width, height, frame.widthMeters, frame.heightMeters].every(value => Number.isFinite(value) && value > 0)) throw Error('A drawing frame needs positive finite dimensions.');
  return Math.min(width / frame.widthMeters, height / frame.heightMeters);
}

export function scaleBarMeters(pixelsPerMeter: number, targetPixels = 80): number {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0 || !Number.isFinite(targetPixels) || targetPixels <= 0) throw Error('A scale bar needs a valid drawing scale.');
  const targetMeters = targetPixels / pixelsPerMeter, decade = 10 ** Math.floor(Math.log10(targetMeters));
  const multiple = [1, 2, 5].filter(value => value * decade <= targetMeters).at(-1) || 1;
  return Number((multiple * decade).toPrecision(10));
}

export function drawOutline(building: OutlineCandidate, viewport: { plotWidth: number; plotHeight: number; centerX: number; centerY: number }, frame?: PhysicalDrawingFrame | null) {
  const outline = eligibleOutline(building);
  if (!outline) return null;
  const scale = drawingPixelsPerMeter(viewport.plotWidth, viewport.plotHeight, frame || outline);
  const xy = (p: number[]) => [viewport.centerX + (p[0] - outline.longitude) * outline.metersPerLongitudeDegree * scale, viewport.centerY - (p[1] - outline.latitude) * METERS_PER_LATITUDE_DEGREE * scale];
  const path = outline.polygons.flatMap(polygon => polygon.map(ring => ring.map((p, i) => { const point = xy(p); return `${i ? 'L' : 'M'}${point[0].toFixed(2)},${point[1].toFixed(2)}`; }).join(' ') + ' Z')).join(' ');
  return { path, xy, pixelsPerMeter: scale, scaleBarMeters: scaleBarMeters(scale), outline };
}

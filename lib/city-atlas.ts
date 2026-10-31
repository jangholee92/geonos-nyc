/** Display tiles cover the complete usable NYC footprint snapshot. Tile
 * geometry is quantized for display; inspect the native record for analysis. */
export const CITY_ATLAS = {
 sourceId: 'geo-citywide', sourceLayer: 'buildings',
 tilePath: '/data/citywide/tiles/{z}/{x}/{y}.pbf',
 minZoom: 14, maxZoom: 14,
 sourceRecords: 1_082_964, mappedOutlines: 1_082_923, unsupportedGeometries: 41,
} as const;

export function atlasBuildingId(value: unknown): string | null {
 const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value : '';
 return /^[1-9]\d{0,9}$/.test(id) ? id : null;
}

export function cityAtlasSource(origin: string) {
 // URL serialization escapes braces, but MapLibre needs literal XYZ tokens.
 const tileUrl=new URL(CITY_ATLAS.tilePath,origin).href.replace(/%7B/gi,'{').replace(/%7D/gi,'}');
 return {type: 'vector' as const, tiles: [tileUrl],
  minzoom: CITY_ATLAS.minZoom, maxzoom: CITY_ATLAS.maxZoom,
  bounds: [-74.26,40.49,-73.69,40.92] as [number,number,number,number],
  attribution: 'NYC OTI Building Footprints · 2026-10-27 snapshot'};
}

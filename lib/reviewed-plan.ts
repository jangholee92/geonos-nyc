import { combineBuilding, n, soda, type CityBuilding } from './city';
import { validatePlan, type QuestionPlan, type Requirement } from './decision-plan';

type ObjectValue = Record<string, unknown>;
export type ReviewedPlanDescriptor = { plan: QuestionPlan; ids: string[] };
export type ReviewedPlanInspection =
  | { ok: true; descriptor: ReviewedPlanDescriptor }
  | { ok: false; error: string };
export type ReviewedSourceQuery = {
  dataset: '5zhs-2jue' | '64uk-42ks'; ids: string[];
  started_at: string; completed_at: string;
};
export type ResolvedReviewedPlan = ReviewedPlanDescriptor & {
  buildings: CityBuilding[]; resolved_at: string; source_queries: ReviewedSourceQuery[];
};

export class ReviewedPlanError extends Error {
  constructor(message: string) { super(message); this.name = 'ReviewedPlanError'; }
}
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: ObjectValue, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const nativeId = (value: unknown): value is string => typeof value === 'string' && /^(?:[1-9]\d{0,9}|p:[1-5]\d{9})$/.test(value);
const reject = (message: string): never => { throw new ReviewedPlanError(message); };
const PLAN_KEYS = ['intent', 'purpose', 'userQuestion', 'requirements'];
const REQUIREMENT_KEYS = ['id', 'factKey', 'operator', 'target', 'unit', 'scope', 'required', 'scenario', 'year'];

function copyPlan(value: unknown): QuestionPlan {
  if (!object(value) || !exact(value, PLAN_KEYS) || !Array.isArray(value.requirements) || value.requirements.length > 20)
    return reject('The proposed conditions have an unexpected format. Ask for a revised plan.');
  if (value.requirements.some(r => !object(r) || !exact(r, REQUIREMENT_KEYS)))
    return reject('The proposed plan contains unsupported condition fields.');
  const issues = validatePlan(value);
  if (issues.length) return reject(issues.map(issue => issue.message).join(' ').slice(0, 1200));
  const plan = value as unknown as QuestionPlan;
  // Copy only registered predicates, never model facts, observations, answers or scores.
  return {
    intent: plan.intent, userQuestion: plan.userQuestion,
    ...(plan.purpose === undefined ? {} : { purpose: plan.purpose }),
    requirements: plan.requirements.map((r): Requirement => ({
      id: r.id, factKey: r.factKey, operator: r.operator,
      target: Array.isArray(r.target) ? [...r.target] : r.target,
      unit: r.unit, scope: r.scope, required: r.required,
      ...(r.scenario === undefined ? {} : { scenario: r.scenario }),
      ...(r.year === undefined ? {} : { year: r.year }),
    })),
  };
}

function copyDescriptor(value: unknown): ReviewedPlanDescriptor {
  if (!object(value) || !exact(value, ['plan', 'ids'])) return reject('Review a valid plan before opening a workspace.');
  const plan = copyPlan(value.plan), ids = value.ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 4 || !ids.every(nativeId) || new Set(ids).size !== ids.length)
    return reject('Choose one to four distinct native building or tax-lot records before using this plan.');
  if (plan.intent === 'understand' && ids.length !== 1) return reject('Understanding a place requires exactly one record.');
  if (plan.intent === 'compare' && ids.length < 2) return reject('A comparison requires at least two distinct records.');
  return { plan, ids: [...ids] };
}

/** Validate the reviewable result envelope. This verifies identity consistency,
 * not the truth of its facts: all facts are discarded and reloaded on acceptance.
 * A caller must still obtain the user's explicit Review and use action.
 */
export function inspectReviewedPlan(payload: unknown): ReviewedPlanInspection {
  try {
    if (!object(payload) || payload.kind !== 'decision' || payload.planNeedsReview !== true || payload.grounded !== true || !object(payload.decision) || payload.decision.valid !== true)
      return reject('Only a completed, reviewable decision can open a workspace.');
    const candidates = payload.decision.candidates, evidence = payload.evidence;
    if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 4)
      return reject('This result needs one to four selected records before it can open a workspace.');
    if (!candidates.every(candidate => object(candidate) && nativeId(candidate.id)))
      return reject('A candidate is missing its native record identifier.');
    const descriptor = copyDescriptor({ plan: payload.plan, ids: candidates.map(candidate => (candidate as ObjectValue).id) });
    if (!Array.isArray(evidence) || evidence.length !== descriptor.ids.length)
      return reject('Each selected record must have exactly one matching evidence identity.');
    const seen = new Set<string>();
    for (const entry of evidence) {
      if (!object(entry) || !nativeId(entry.id) || !descriptor.ids.includes(entry.id) || seen.has(entry.id) || !object(entry.building) || entry.building.id !== entry.id)
        return reject('Candidate and evidence identities do not match. Ask for the records to be retrieved again.');
      const entity = entry.id.startsWith('p:') ? 'parcel' : 'building';
      if (entry.building.entity_type !== entity || (entity === 'parcel' && entry.building.bbl !== entry.id.slice(2)))
        return reject('The evidence mixes building and tax-lot identifiers. Retrieve the intended record again.');
      seen.add(entry.id);
    }
    return { ok: true, descriptor };
  } catch (error) {
    return { ok: false, error: error instanceof ReviewedPlanError ? error.message : 'The proposed decision could not be validated. Ask for a revised plan.' };
  }
}

const FOOTPRINT_FIELDS = 'doitt_id,bin,mappluto_bbl,base_bbl,the_geom,name,height_roof,construction_year,ground_elevation,feature_code,last_edited_date';
const PARCEL_FIELDS = 'bbl,address,borough,latitude,longitude,bldgarea,lotarea,numfloors,numbldgs,zonedist1,zonedist2,zonedist3,zonedist4,landuse,bldgclass,unitsres,comarea,resarea,strgearea,factryarea,builtfar,residfar,commfar,facilfar,yearbuilt,yearalter1,yearalter2,lotfront,lotdepth,lottype,ownertype,histdist,landmark,firm07_flag,pfirm15_flag,version';
function sourceBbl(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  const text = typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  if (!/^[1-5]\d{9}(?:\.0+)?$/.test(text)) return reject('An official record has an invalid tax-lot identifier. Try retrieving it again.');
  return text.split('.')[0];
}
function sourceBin(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  const text = typeof value === 'string' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^[1-5]\d{6}$/.test(text) ? text : reject('An official footprint has an invalid BIN. No alternative identity was substituted.');
}
function validateGeometry(value: unknown): void {
  if (!object(value) || !['Polygon', 'MultiPolygon'].includes(String(value.type)) || !Array.isArray(value.coordinates)) return reject('The official building outline is missing or malformed.');
  const polygons = value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  let vertices = 0;
  if (!polygons.length || polygons.length > 1000) return reject('The official building outline is missing or too complex to review.');
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) return reject('The official building outline is malformed.');
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || (vertices += ring.length) > 50_000) return reject('The official building outline is malformed or too complex to review.');
      for (const point of ring) {
        if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || point[0] < -74.5 || point[0] > -73.5 || point[1] < 40.3 || point[1] > 41.1)
          return reject('The official building outline has invalid NYC coordinates.');
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return reject('The official building outline is not closed.');
    }
  }
}
function sourcePrimitives(row: ObjectValue, fields: string[], geometry = false): void {
  for (const key of fields) {
    if (geometry && key === 'the_geom') continue;
    const value = row[key];
    if (value !== null && value !== undefined && typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) return reject('An official record has malformed attributes.');
    if (typeof value === 'string' && value.length > 3000) return reject('An official record has an unexpectedly long attribute.');
  }
}

/** Resolve all records atomically from the fixed official datasets. No context,
 * status, operational report or numeric fact from the model response is retained.
 * Failures throw before any replacement workspace is returned.
 */
export async function resolveReviewedPlan(input: ReviewedPlanDescriptor): Promise<ResolvedReviewedPlan> {
  const descriptor = copyDescriptor(input), queries: ReviewedSourceQuery[] = [];
  const footprintIds = descriptor.ids.filter(id => !id.startsWith('p:'));
  const explicitBbls = descriptor.ids.filter(id => id.startsWith('p:')).map(id => id.slice(2));
  async function fetchRows(dataset: ReviewedSourceQuery['dataset'], ids: string[], field: 'doitt_id' | 'bbl', select: string): Promise<ObjectValue[]> {
    const started_at = new Date().toISOString();
    // Explicit refresh bypasses soda's application cache for both reads/writes.
    // Only validated numeric native identifiers enter the fixed-source predicate.
    let rows: unknown;
    try {
      rows = await soda(dataset, { $select: select, $where: `${field} in (${ids.join(',')})`, $order: field, $limit: ids.length + 1 }, 0);
    } catch {
      return reject('The official NYC records could not be refreshed. Your current workspace has not been replaced. Try again shortly.');
    }
    if (!Array.isArray(rows) || rows.length > ids.length || rows.some(row => !object(row))) return reject('The official source returned ambiguous or malformed records. Your current workspace has not been replaced.');
    queries.push({ dataset, ids: [...ids], started_at, completed_at: new Date().toISOString() });
    return rows as ObjectValue[];
  }
  const footprints = new Map<string, ObjectValue>();
  if (footprintIds.length) {
    for (const row of await fetchRows('5zhs-2jue', footprintIds, 'doitt_id', FOOTPRINT_FIELDS)) {
      sourcePrimitives(row, FOOTPRINT_FIELDS.split(','), true);
      const id = typeof row.doitt_id === 'number' && Number.isSafeInteger(row.doitt_id) ? String(row.doitt_id) : row.doitt_id;
      if (!nativeId(id) || id.startsWith('p:') || !footprintIds.includes(id) || footprints.has(id)) return reject('The official response did not uniquely match the requested native building IDs.');
      validateGeometry(row.the_geom);
      if (row.name !== undefined && row.name !== null && typeof row.name !== 'string') return reject('The official building name has an unexpected format.');
      footprints.set(id, { ...row, doitt_id: id, bin: sourceBin(row.bin), mappluto_bbl: sourceBbl(row.mappluto_bbl), base_bbl: sourceBbl(row.base_bbl) });
    }
    if (footprints.size !== footprintIds.length) return reject('A selected native building record is no longer available. Retrieve the intended place again; no BIN or address substitution was made.');
  }
  const bbls = [...new Set([...explicitBbls, ...[...footprints.values()].flatMap(row => [row.mappluto_bbl, row.base_bbl].filter((value): value is string => typeof value === 'string'))])];
  if (bbls.length > 8) return reject('The selected records exceed the bounded tax-lot lookup.');
  const parcels = new Map<string, ObjectValue>();
  if (bbls.length) {
    for (const row of await fetchRows('64uk-42ks', bbls, 'bbl', PARCEL_FIELDS)) {
      sourcePrimitives(row, PARCEL_FIELDS.split(','));
      for (const field of ['address', 'borough', 'zonedist1', 'zonedist2', 'zonedist3', 'zonedist4', 'version'])
        if (row[field] !== undefined && row[field] !== null && typeof row[field] !== 'string') return reject('The official tax-lot labels have an unexpected format.');
      const latitude = n(row.latitude), longitude = n(row.longitude);
      if ((latitude !== null && (latitude < 40.3 || latitude > 41.1)) || (longitude !== null && (longitude < -74.5 || longitude > -73.5))) return reject('The official tax-lot location is outside the supported NYC bounds.');
      const id = sourceBbl(row.bbl);
      if (!id || !bbls.includes(id) || parcels.has(id)) return reject('The official response did not uniquely match the requested tax lots.');
      parcels.set(id, { ...row, bbl: id });
    }
  }
  const resolved_at = new Date().toISOString();
  const buildings = descriptor.ids.map((id): CityBuilding => {
    if (id.startsWith('p:')) {
      const p = parcels.get(id.slice(2));
      if (!p) return reject('A selected tax-lot record is no longer available. Retrieve the intended place again.');
      const b = combineBuilding({ doitt_id: id, base_bbl: p.bbl, mappluto_bbl: p.bbl, the_geom: { type: 'Point', coordinates: [n(p.longitude) ?? NaN, n(p.latitude) ?? NaN] } }, p, 'BBL');
      return { ...b, entity_type: 'parcel', feature_code: null, record_type: 'Tax lot', id, bin: null, construction_year: n(p.yearbuilt, true), footprint_area_sqft: null, source_ids: ['nyc-pluto'], source: 'https://data.cityofnewyork.us/d/64uk-42ks', retrieval: { mode: 'live-query', retrieved_at: resolved_at } };
    }
    const f = footprints.get(id)!;
    const map = typeof f.mappluto_bbl === 'string' ? parcels.get(f.mappluto_bbl) : undefined;
    const base = typeof f.base_bbl === 'string' ? parcels.get(f.base_bbl) : undefined;
    return { ...combineBuilding(f, map ?? base, map ? 'mappluto_bbl' : base ? 'base_bbl' : 'unmatched'), retrieval: { mode: 'live-query', retrieved_at: resolved_at } };
  });
  return { ...descriptor, buildings, resolved_at, source_queries: queries };
}

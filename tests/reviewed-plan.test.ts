import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type { QuestionPlan } from '../lib/decision-plan';
import type { ReviewedPlanDescriptor } from '../lib/reviewed-plan';

type Obj = Record<string, any>;
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function compile(path: string, requireFn: (id: string) => unknown): Obj {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new vm.Script(code).runInNewContext({ module, exports: module.exports, require: requireFn, URL, URLSearchParams });
  return module.exports;
}
const planner = compile('../lib/decision-plan.ts', id => { throw Error(id); });
const quality = JSON.parse(readFileSync(new URL('../lib/city-quality.json', import.meta.url), 'utf8'));
const geometry = { type: 'Polygon', coordinates: [[[-74, 40.7], [-73.999, 40.7], [-73.999, 40.701], [-74, 40.701], [-74, 40.7]]] };
const footprint = (id = '101', map = '1000010001', base = map) => ({ doitt_id: id, bin: '1000001', mappluto_bbl: map, base_bbl: base, the_geom: geometry, feature_code: '2100', height_roof: '25', last_edited_date: '2026-10-25T00:00:00.000' });
const parcel = (bbl = '1000010001', area = '50000') => ({ bbl, address: 'OFFICIAL ADDRESS', borough: 'MN', bldgarea: area, lotarea: '25000', longitude: '-74', latitude: '40.7', yearbuilt: '1950', version: '26v2', zonedist1: 'M1-1' });
const plan = (intent: QuestionPlan['intent'] = 'understand'): QuestionPlan => ({ intent, userQuestion: 'Understand this place.', purpose: 'general', requirements: [] });
function payload(ids = ['101'], p = plan()): Obj {
  return { kind: 'decision', grounded: true, planNeedsReview: true, plan: p,
    decision: { valid: true, candidates: ids.map(id => ({ id, status: 'matches', answer: 'UNTRUSTED' })) },
    evidence: ids.map(id => ({ id, building: { id, entity_type: id.startsWith('p:') ? 'parcel' : 'building', bbl: id.startsWith('p:') ? id.slice(2) : '1000010001', address: 'MODEL ADDRESS', lot_building_area_sqft: 999999, electrical_capacity_kw: 999999 }, context: { invented: true } })) };
}
function harness(response?: (dataset: string, params: URLSearchParams, call: number) => unknown) {
  const calls: { dataset: string; params: URLSearchParams }[] = [];
  const city = compile('../lib/city.ts', id => {
    if (id === './city-quality.json') return quality;
    if (id === './public-fetch') return { fetchPublicJson: async (url: URL) => {
      const dataset = url.pathname.split('/').at(-1)!.replace('.json', '');
      assert.equal(url.origin, 'https://data.cityofnewyork.us');
      calls.push({ dataset, params: url.searchParams });
      return response ? response(dataset, url.searchParams, calls.length) : dataset === '5zhs-2jue' ? [footprint()] : [parcel()];
    } };
    throw Error(id);
  });
  const api = compile('../lib/reviewed-plan.ts', id => {
    if (id === './city') return city;
    if (id === './decision-plan') return planner;
    throw Error(id);
  }) as typeof import('../lib/reviewed-plan');
  return { api, city, calls };
}
const api = harness().api;
function descriptor(value = payload()): ReviewedPlanDescriptor {
  const result = api.inspectReviewedPlan(value);
  if (!result.ok) throw Error(result.error);
  return result.descriptor;
}

test('inspect copies only a valid plan and native IDs, discarding every model fact and finding', () => {
  const original = payload();
  const result = descriptor(original);
  assert.deepEqual(plain(result), { plan: plan(), ids: ['101'] });
  original.plan.requirements.push({ factKey: 'invented' });
  original.decision.candidates[0].id = '999';
  assert.equal(result.plan.requirements.length, 0);
  assert.deepEqual(plain(result.ids), ['101']);
});

test('only completed explicitly reviewable decisions pass', () => {
  for (const value of [null, [], {}, { ...payload(), kind: 'clarification' }, { ...payload(), grounded: false }, { ...payload(), planNeedsReview: false }, { ...payload(), decision: { valid: false, candidates: [{ id: '101' }] } }])
    assert.equal(api.inspectReviewedPlan(value).ok, false);
});

test('native candidate bounds, duplicate IDs and intent arity are enforced before source calls', () => {
  for (const value of [payload([], plan('find')), payload(['1', '2', '3', '4', '5'], plan('find')), payload(['101', '101'], plan('compare')), payload(['101'], plan('compare')), payload(['101', '102']), payload(['01']), payload(['1 OR 1=1']), payload(['bin:1000001']), payload(['p:6000010001'])])
    assert.equal(api.inspectReviewedPlan(value).ok, false);
});

test('candidate, evidence and building identities must match exactly with no extra aliases', () => {
  for (const change of [
    (p: Obj) => { p.evidence = []; },
    (p: Obj) => { p.evidence[0].id = '102'; },
    (p: Obj) => { p.evidence[0].building.id = '102'; },
    (p: Obj) => { p.evidence[0].building.entity_type = 'parcel'; },
    (p: Obj) => { p.evidence.push(p.evidence[0]); },
    (p: Obj) => { delete p.evidence[0].building.entity_type; },
  ]) { const value = payload(); change(value); assert.equal(api.inspectReviewedPlan(value).ok, false); }
  const parcelPayload = payload(['p:1000010001']);
  assert.equal(api.inspectReviewedPlan(parcelPayload).ok, true);
  parcelPayload.evidence[0].building.bbl = '1000010002';
  assert.equal(api.inspectReviewedPlan(parcelPayload).ok, false);
});

test('plan validation prevents unit/scope substitutions, unknown predicates, extra facts and contradictory requirements', () => {
  const good = planner.makeRequirement('usable_area_sqft', 'gte', 40000);
  for (const requirements of [
    [{ ...good, unit: 'm' }], [{ ...good, scope: 'parcel' }], [{ ...good, factKey: 'model_safety_score' }],
    [{ ...good, evidence: { value: 999999 } }], [good, planner.makeRequirement('usable_area_sqft', 'lte', 30000, { id: 'upper' })],
  ]) assert.equal(api.inspectReviewedPlan(payload(['101'], { ...plan(), requirements })).ok, false);
  const withFacts = payload(); withFacts.plan.facts = [{ value: 999999 }];
  assert.equal(api.inspectReviewedPlan(withFacts).ok, false);
});

test('fresh resolution replaces model numbers and addresses with official records and timestamps', async () => {
  const h = harness();
  const resolved = await h.api.resolveReviewedPlan(descriptor());
  assert.equal(resolved.buildings[0].address, 'OFFICIAL ADDRESS');
  assert.equal(resolved.buildings[0].lot_building_area_sqft, 50000);
  assert.ok(!('electrical_capacity_kw' in resolved.buildings[0]));
  assert.equal(resolved.buildings[0].retrieval?.mode, 'live-query');
  assert.equal(resolved.buildings[0].retrieval?.retrieved_at, resolved.resolved_at);
  assert.deepEqual(plain(resolved.source_queries.map(q => q.dataset)), ['5zhs-2jue', '64uk-42ks']);
  assert.ok(resolved.source_queries.every(q => Number.isFinite(Date.parse(q.started_at)) && Date.parse(q.completed_at) >= Date.parse(q.started_at)));
  assert.equal(h.calls.length, 2);
});

test('MapPLUTO wins over a conflicting base lot and fallback is used only if that lot is absent', async () => {
  for (const hasMap of [true, false]) {
    const h = harness(dataset => dataset === '5zhs-2jue' ? [footprint('101', '1000010001', '1000010002')] : hasMap ? [parcel('1000010002', '999'), parcel('1000010001', '50000')] : [parcel('1000010002', '999')]);
    const b = (await h.api.resolveReviewedPlan(descriptor())).buildings[0];
    assert.equal(b.bbl, hasMap ? '1000010001' : '1000010002');
    assert.equal(b.match_method, hasMap ? 'mappluto_bbl' : 'base_bbl');
    assert.equal(b.lot_building_area_sqft, hasMap ? 50000 : 999);
  }
});

test('a missing linked lot leaves attributes unknown, while an explicitly requested missing parcel fails', async () => {
  const h = harness(dataset => dataset === '5zhs-2jue' ? [footprint()] : []);
  const b = (await h.api.resolveReviewedPlan(descriptor())).buildings[0];
  assert.equal(b.bbl, null); assert.equal(b.lot_building_area_sqft, null); assert.equal(b.match_method, 'unmatched');
  await assert.rejects(h.api.resolveReviewedPlan(descriptor(payload(['p:1000010001']))), /tax-lot record is no longer available/);
});

test('parcel records remain parcel-scoped with no fabricated footprint, BIN or building height', async () => {
  const h = harness(() => [{ ...parcel(), longitude: null, latitude: null }]);
  const resolved = await h.api.resolveReviewedPlan(descriptor(payload(['p:1000010001'])));
  const b = resolved.buildings[0];
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].dataset, '64uk-42ks');
  assert.equal(b.entity_type, 'parcel'); assert.equal(b.bin, null); assert.equal(b.footprint_area_sqft, null); assert.equal(b.roof_height_ft, null);
  assert.ok(Number.isNaN(b.longitude)); assert.equal(b.construction_year, 1950);
});

test('a seven-digit building ID is queried only as DOITT, never as a BIN alias', async () => {
  const h = harness(dataset => dataset === '5zhs-2jue' ? [footprint('3338236')] : [parcel()]);
  const resolved = await h.api.resolveReviewedPlan(descriptor(payload(['3338236'])));
  assert.equal(resolved.buildings[0].id, '3338236');
  assert.equal(h.calls[0].params.get('$where'), 'doitt_id in (3338236)');
  assert.ok(!h.calls.some(call => /\bbin=/.test(call.params.get('$where') || '')));
});

test('distinct footprints sharing a BBL stay distinct and requested order is retained', async () => {
  const h = harness(dataset => dataset === '5zhs-2jue' ? [footprint('101'), footprint('102')] : [parcel()]);
  const resolved = await h.api.resolveReviewedPlan(descriptor(payload(['102', '101'], plan('compare'))));
  assert.deepEqual(plain(resolved.buildings.map(b => b.id)), ['102', '101']);
  assert.equal(h.calls[1].params.get('$where'), 'bbl in (1000010001)');
});

test('four candidates use at most two bounded official queries and no user-provided URLs', async () => {
  const ids = ['101', '102', '103', '104'];
  const h = harness(dataset => dataset === '5zhs-2jue' ? ids.map((id, i) => footprint(id, `100001000${i * 2 + 1}`, `100001000${i * 2 + 2}`)) : Array.from({ length: 8 }, (_, i) => parcel(`100001000${i + 1}`)));
  const p = payload(ids, plan('compare')); p.source = 'https://attacker.invalid';
  p.evidence.forEach((e: Obj) => { e.building.source = 'https://attacker.invalid'; });
  const out = await h.api.resolveReviewedPlan(descriptor(p));
  assert.equal(out.buildings.length, 4); assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].params.get('$limit'), '5'); assert.equal(h.calls[1].params.get('$limit'), '9');
});

test('malformed, duplicate, foreign or missing official footprints fail without alias substitution', async () => {
  for (const rows of [[], [footprint('999')], [footprint(), footprint()], [{ ...footprint(), the_geom: null }], [{ ...footprint(), the_geom: { type: 'Point', coordinates: [-74, 40.7] } }], [{ ...footprint(), mappluto_bbl: '1000010001.5' }], [{ ...footprint(), bin: '101' }], [{ ...footprint(), name: { injected: true } }]]) {
    const h = harness(() => rows);
    await assert.rejects(h.api.resolveReviewedPlan(descriptor()));
    assert.equal(h.calls.length, 1);
  }
});

test('duplicate or unexpected PLUTO rows are not silently selected as a matching lot', async () => {
  for (const rows of [[parcel(), parcel()], [parcel('1000010002')], [{ ...parcel(), bbl: '1000010001.1' }], [{ ...parcel(), address: 7 }], [{ ...parcel(), longitude: '0' }]]) {
    const h = harness(dataset => dataset === '5zhs-2jue' ? [footprint()] : rows);
    await assert.rejects(h.api.resolveReviewedPlan(descriptor()));
  }
});

test('source failures produce a safe human error and do not mutate input descriptors', async () => {
  const h = harness(() => { throw Error('secret upstream details'); });
  const d = descriptor(), original = plain(d);
  await assert.rejects(h.api.resolveReviewedPlan(d), error => error instanceof Error || /could not be refreshed/.test(String(error)));
  try { await h.api.resolveReviewedPlan(d); } catch (error) {
    assert.match(String(error), /could not be refreshed/); assert.ok(!String(error).includes('secret'));
  }
  assert.deepEqual(plain(d), original);
});

test('mutated descriptors are revalidated before network access', async () => {
  const h = harness();
  const d = descriptor(); d.ids[0] = '1 OR 1=1';
  await assert.rejects(h.api.resolveReviewedPlan(d)); assert.equal(h.calls.length, 0);
});

test('operational facts remain unknown after accepting a condition and refreshing public records', async () => {
  const p = payload(['101'], { ...plan(), requirements: [planner.makeRequirement('electrical_capacity_kw', 'gte', 500)] });
  const h = harness(); const out = await h.api.resolveReviewedPlan(descriptor(p));
  const result = planner.evaluateQuestion(out.plan, out.buildings, {});
  assert.equal(result.candidates[0].requirements[0].status, 'unknown');
  assert.equal(result.counts.matches, 0);
});

test('soda positive TTL keeps existing caching while explicit nonpositive TTL bypasses reads and writes', async () => {
  const h = harness((_dataset, _params, call) => [{ value: call }]);
  const params = { $where: 'doitt_id=101', $limit: 1 };
  assert.equal((await h.city.soda('5zhs-2jue', params))[0].value, 1);
  assert.equal((await h.city.soda('5zhs-2jue', params))[0].value, 1);
  assert.equal((await h.city.soda('5zhs-2jue', params, 0))[0].value, 2);
  assert.equal((await h.city.soda('5zhs-2jue', params, -1))[0].value, 3);
  assert.equal((await h.city.soda('5zhs-2jue', params))[0].value, 1);
  const fresh = { $where: 'doitt_id=102', $limit: 1 };
  assert.equal((await h.city.soda('5zhs-2jue', fresh, 0))[0].value, 4);
  assert.equal((await h.city.soda('5zhs-2jue', fresh))[0].value, 5);
  assert.equal(h.calls.length, 5);
});

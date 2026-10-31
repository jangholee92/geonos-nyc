import assert from "node:assert/strict";
import test from "node:test";
// Node 25 strips TypeScript for dependency-free tests; the app's bundler uses extensionless imports.
// @ts-expect-error TypeScript allowImportingTsExtensions is unnecessary for the application build.
import { analyzeBuildings, buildEvidence, normalizeBorough, validateLayerRecord } from "../lib/analysis.ts";
import type { AnalysisOptions, Building, LayerRecord } from "../lib/analysis";

const defaults: AnalysisOptions = { useCase: "cold_storage" };
function building(overrides: Partial<Building> = {}): Building {
  return { id: "3000000001", bbl: "3000000001", address: "Test parcel", borough: "Brooklyn", latitude: 40.7, longitude: -73.95, building_area_sqft: 50_000, zoning_district: "M1-1", heat_hvi: 3, truck_route_distance_m: 200, ...overrides };
}
function layer(overrides: Partial<LayerRecord> = {}): LayerRecord {
  return { bbl: "3000000001", metric: "flood_depth_m", value: 1.2, unit: "m", source: "Synthetic test source", scenario: "ssp245", year: "2050", ...overrides };
}

test("filters by observed borough, area and zoning; rejects unknown area under a minimum", () => {
  const result = analyzeBuildings([building(), building({ bbl: "4000000002", borough: "Queens" }), building({ bbl: "3000000003", building_area_sqft: null }), building({ bbl: "3000000004", zoning_district: "R6" })], { ...defaults, borough: "Brooklyn", minArea: 25_000, zoning: "M" });
  assert.equal(result.matchedCount, 1);
  assert.equal(result.excludedCount, 3);
  assert.equal(result.ranked[0].building.bbl, "3000000001");
  assert.equal(result.ranked[0].useAssessment.legalSuitability, "unknown");
});

test("missing flood flags never become a safe finding or a quantitative depth", () => {
  for (const flag of [undefined, null, 0]) {
    const result = buildEvidence(building({ pfirm15_flag: flag }), { ...defaults, weights: { area: 1, lowFlood: 1, lowHeat: 0, truck: 0 } });
    assert.equal(result.floodFlag, "unknown");
    assert.equal(result.metrics.floodDepth, null);
    assert.equal(result.score, null);
    assert.equal(result.scoreCoverage, 0.5);
    assert.deepEqual(result.missing, ["flood_depth_m"]);
  }
  assert.equal(buildEvidence(building({ pfirm15_flag: 1 }), defaults).floodFlag, "flagged");
});

test("weighted score is reproducible and a missing enabled metric cannot win a ranking", () => {
  const options: AnalysisOptions = { ...defaults, weights: { area: 1, lowFlood: 0, lowHeat: 1, truck: 1 } };
  const known = buildEvidence(building(), options);
  assert.equal(known.score, 60); // area 50, HVI preference 50, truck preference 80
  const result = analyzeBuildings([building({ bbl: "3000000002", building_area_sqft: 100_000, heat_hvi: null }), building()], options);
  assert.equal(result.ranked[0].building.bbl, "3000000001");
  assert.equal(result.ranked[1].score, null);
});

test("scenario layers join on BBL, scenario, year; future metrics never inherit baseline heat", () => {
  const layers = [layer(), layer({ bbl: "3000000002", value: 0 }), layer({ scenario: "ssp585", value: 2.5 }), layer({ year: "2080", value: 3 })];
  const future = buildEvidence(building(), { ...defaults, scenario: "ssp245", year: "2050" }, layers);
  assert.equal(future.metrics.floodDepth, 1.2);
  assert.equal(future.metrics.heat, null);
  assert.equal(future.metrics.truckDistance, 200);
  const baseline = buildEvidence(building(), defaults, layers);
  assert.equal(baseline.metrics.floodDepth, null);
  assert.equal(baseline.metrics.heat, 3);
  assert.equal(buildEvidence(building(), { ...defaults, scenario: "baseline", year: "2050" }).metrics.heat, null);
});

test("conflicting scenario rows and wrong units remain unavailable", () => {
  const options = { ...defaults, scenario: "ssp245", year: "2050" };
  assert.equal(buildEvidence(building(), options, [layer(), layer({ value: 2 })]).metrics.floodDepth, null);
  assert.equal(buildEvidence(building(), options, [layer({ unit: "ft" })]).metrics.floodDepth, null);
  assert.equal(buildEvidence(building(), options, [layer({ source: "" })]).metrics.floodDepth, null);
  assert.equal(buildEvidence(building(), options, [layer(), layer()]).metrics.floodDepth, 1.2);
});

test("imported null does not fall back to known baseline, and invalid heat cannot improve a score", () => {
  const imported = layer({ metric: "heat_index", unit: "index_1_5", scenario: "baseline", year: "current", value: null });
  assert.equal(buildEvidence(building(), defaults, [imported]).metrics.heat, null);
  assert.equal(buildEvidence(building(), defaults, [layer({ metric: "heat_index", unit: "index_1_5", scenario: "baseline", year: "2050", value: 5 })]).metrics.heat, 3);
  assert.equal(buildEvidence(building({ heat_hvi: 9 }), { ...defaults, weights: { area: 0, lowFlood: 0, lowHeat: 1, truck: 0 } }).score, null);
});

test("no enabled weights means no score; zero imported depth is known only with provenance", () => {
  assert.equal(buildEvidence(building(), { ...defaults, weights: { area: 0, lowFlood: 0, lowHeat: 0, truck: 0 } }).score, null);
  const zero = buildEvidence(building(), { ...defaults, scenario: "ssp245", year: "2050", weights: { area: 0, lowFlood: 1, lowHeat: 0, truck: 0 } }, [layer({ value: 0 })]);
  assert.equal(zero.score, 100);
  assert.equal(zero.floodFlag, "unknown");
  assert.equal(zero.useAssessment.legalSuitability, "unknown");
});

test("borough codes used by the interface match actual borough names", () => {
  assert.equal(analyzeBuildings([building()], { ...defaults, borough: "BK" }).matchedCount, 1);
  assert.equal(analyzeBuildings([building()], { ...defaults, borough: "QN" }).matchedCount, 0);
  assert.equal(normalizeBorough("BX"), "Bronx");
});

test("address and BBL query use the same deterministic filter as the UI and AI", () => {
  const rows = [building({ address: "100 Test Avenue" }), building({ id: "4000000002", bbl: "4000000002", address: "22 River Street" })];
  assert.equal(analyzeBuildings(rows, { ...defaults, query: " TEST avenue " }).ranked[0].building.bbl, "3000000001");
  assert.equal(analyzeBuildings(rows, { ...defaults, query: "4000000002" }).matchedCount, 1);
  assert.equal(analyzeBuildings(rows, { ...defaults, query: "not in sample" }).matchedCount, 0);
});

test("historical future flood-zone membership is display-only and cannot alter scores or depth", () => {
  const options: AnalysisOptions = { ...defaults, weights: { area: 1, lowFlood: 0, lowHeat: 1, truck: 1 } };
  const inside = buildEvidence(building({ projected_flood_zone_2050: 1 }), options);
  const outside = buildEvidence(building({ projected_flood_zone_2050: 0 }), options);
  assert.equal(inside.score, outside.score);
  assert.equal(inside.score, 60);
  assert.deepEqual(inside.metrics, outside.metrics);
  assert.equal(inside.metrics.floodDepth, null);
  assert.ok(inside.evidence.find((item) => item.id.endsWith(":future-flood-2050"))?.value !== outside.evidence.find((item) => item.id.endsWith(":future-flood-2050"))?.value);
});

test("malformed source metadata cannot enter analysis or become a rendered object", () => {
  const invalid = { ...layer(), source: { text: "bad source" } };
  assert.equal(validateLayerRecord(invalid), false);
  const candidate = buildEvidence(building(), { ...defaults, scenario: "ssp245", year: "2050" }, [invalid as unknown as LayerRecord]);
  assert.equal(candidate.metrics.floodDepth, null);
  assert.ok(candidate.evidence.every((item) => typeof item.source === "string"));
});


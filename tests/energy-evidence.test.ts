import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
// @ts-expect-error Native TypeScript tests use explicit extensions; application imports are extensionless.
import {analyzeEnergyEvidence} from '../lib/energy-evidence.ts';
import type {EnergyReport} from '../lib/energy-evidence';
const lombardy = JSON.parse(readFileSync(new URL('../public/data/energy/302.json', import.meta.url), 'utf8')).records['3028220001'] as EnergyReport[];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function report(id: string, parent: string | null, overrides: Partial<EnergyReport> = {}): EnergyReport {
  return {property_id: id, report_year: 2024, name: 'Test reporting property', bins: ['3330118'], bbls: ['3028220001'], number_of_buildings: 1,
    metrics: {floor_area_ft2: 1000, site_eui_kbtu_ft2: 10},
    reporting_scope: {alignment: 'matched', parent_property_id_raw: parent, site_energy_use_kbtu: 10000, source_property_id: id, source_report_year: 2024, source_floor_area_ft2: 1000, source_site_eui_kbtu_ft2: 10}, ...overrides};
}
test('real Lombardy source has two reporting levels, the same total, and one unknown child', () => {
  const result = analyzeEnergyEvidence(lombardy, {bin: '3338236', bbl: '3028220001', reportYear: 2024});
  assert.equal(result.nodes.length, 3);
  const parent = result.nodes.find(n => n.propertyId === '2784952')!;
  const child = result.nodes.find(n => n.propertyId === '66128693')!;
  const other = result.nodes.find(n => n.propertyId === '66128992')!;
  assert.equal(parent.relationship, 'parent'); assert.equal(child.relationship, 'child');
  assert.deepEqual(parent.childKeys, ['2024:66128693', '2024:66128992']);
  assert.equal(parent.siteEnergyKbtu, 5307042.6); assert.equal(child.siteEnergyKbtu, 5307042.6);
  assert.equal(parent.floorAreaFt2, 79551); assert.equal(child.floorAreaFt2, 41583);
  assert.equal(parent.siteEuiKbtuFt2, 66.7); assert.equal(child.siteEuiKbtuFt2, 127.6);
  assert.equal(Number((parent.siteEnergyKbtu! / parent.floorAreaFt2!).toFixed(1)), parent.siteEuiKbtuFt2);
  assert.equal(Number((child.siteEnergyKbtu! / child.floorAreaFt2!).toFixed(1)), child.siteEuiKbtuFt2);
  assert.equal(other.siteEnergyKbtu, null); assert.equal(other.siteEuiKbtuFt2, null);
  assert.equal(parent.targetMatch, 'includes-selected-building'); assert.equal(child.targetMatch, 'single-building-report');
  assert.equal(other.targetMatch, 'lot-context-only');
  assert.equal(result.sameEnergyRelationships.length, 1); assert.equal(result.aggregateSiteEnergyKbtu, null);
});
test('native scope supplements preserve legacy report facts and are read without mutation', () => {
  const before = JSON.stringify(lombardy); analyzeEnergyEvidence(lombardy);
  assert.equal(JSON.stringify(lombardy), before);
  for (const row of lombardy) {
    assert.equal(row.reporting_scope?.alignment, 'matched');
    assert.equal(row.reporting_scope?.source_property_id, row.property_id);
    assert.equal(row.reporting_scope?.source_report_year, row.report_year);
  }
});
test('duplicate copies from two BBL lookups are counted once without summing reports', () => {
  const a = report('1', '1', {bbls: ['4003120309', '4003120315'], number_of_buildings: 2});
  const out = analyzeEnergyEvidence([a, clone(a)], {bin: '3330118'});
  assert.equal(out.nodes.length, 1); assert.equal(out.duplicateCopiesRemoved, 1);
  assert.equal(out.nodes[0].targetMatch, 'includes-selected-building'); assert.equal(out.aggregateSiteEnergyKbtu, null);
});
test('a missing native parent remains missing and no relationship is inferred from a name', () => {
  const child = report('2', '1');
  const named = report('3', null, {name: 'Campus (Parent)', number_of_buildings: 2});
  const unsupported = report('4', 'Unknown: 1');
  const out = analyzeEnergyEvidence([child, named, unsupported]);
  assert.equal(out.nodes[0].relationship, 'child'); assert.equal(out.nodes[0].parentAvailable, false);
  assert.equal(out.nodes[1].relationship, 'unknown'); assert.equal(out.nodes[2].relationship, 'unknown');
  assert.equal(out.sameEnergyRelationships.length, 0);
});
test('native standalone sentinel is distinct from an unsupported value', () => {
  assert.equal(analyzeEnergyEvidence([report('1', 'Not Applicable: Standalone Property')]).nodes[0].relationship, 'standalone');
  assert.equal(analyzeEnergyEvidence([report('1', 'Not Available')]).nodes[0].relationship, 'unknown');
});
test('parent links do not cross reporting years or use a contradictory standalone record', () => {
  const oldParent = report('1', '1'); oldParent.report_year = 2023; oldParent.reporting_scope!.source_report_year = 2023;
  assert.equal(analyzeEnergyEvidence([oldParent, report('2', '1')]).sameEnergyRelationships.length, 0);
  const contradictory = analyzeEnergyEvidence([report('1', 'Not Applicable: Standalone Property'), report('2', '1')]);
  assert.equal(contradictory.nodes.find(n => n.propertyId === '2')!.parentAvailable, false);
});
test('same energy in unrelated reports is not classified as shared parent–child consumption', () => {
  const out = analyzeEnergyEvidence([report('1', 'Not Applicable: Standalone Property'), report('2', 'Not Applicable: Standalone Property')]);
  assert.equal(out.sameEnergyRelationships.length, 0);
});
test('missing or zero energy is never used to assert repeated positive consumption', () => {
  for (const value of [null, 0]) {
    const p = report('1', '1'), c = report('2', '1');
    p.reporting_scope!.site_energy_use_kbtu = value; c.reporting_scope!.site_energy_use_kbtu = value;
    const out = analyzeEnergyEvidence([p, c]);
    assert.equal(out.nodes[0].siteEnergyKbtu, value); assert.equal(out.sameEnergyRelationships.length, 0);
  }
});
test('conflicting copies with the same ID/year withhold metrics and hierarchy', () => {
  const a = report('1', '1'), b = clone(a); b.metrics!.floor_area_ft2 = 2000;
  const out = analyzeEnergyEvidence([a, b, report('2', '1')]);
  assert.deepEqual(out.conflictingRecordKeys, ['2024:1']); assert.equal(out.nodes[0].siteEnergyKbtu, null);
  assert.equal(out.nodes[0].floorAreaFt2, null); assert.equal(out.nodes[0].relationship, 'unknown');
  assert.equal(out.sameEnergyRelationships.length, 0);
});
test('a supplement cannot attach another year, property or measurement to an existing report', () => {
  for (const patch of [{source_property_id: '99'}, {source_report_year: 2023}, {source_floor_area_ft2: 2000}, {alignment: 'not_retrieved' as const}]) {
    const a = report('1', '1'); Object.assign(a.reporting_scope!, patch);
    const node = analyzeEnergyEvidence([a]).nodes[0];
    assert.equal(node.supplementAligned, false); assert.equal(node.relationship, 'unknown'); assert.equal(node.siteEnergyKbtu, null);
    assert.equal(node.siteEuiKbtuFt2, 10, 'existing reported value remains a report-level fact');
  }
});
test('negative or non-finite metrics are not made into building-level comparisons', () => {
  const a = report('1', '1'); a.metrics!.site_eui_kbtu_ft2 = -0.5; a.reporting_scope!.source_site_eui_kbtu_ft2 = -0.5;
  a.reporting_scope!.site_energy_use_kbtu = -500;
  const n = analyzeEnergyEvidence([a]).nodes[0]; assert.equal(n.siteEnergyKbtu, null); assert.equal(n.siteEuiKbtuFt2, null);
});
test('invalid source identities are isolated and report-year filtering is explicit', () => {
  const bad = report('not-an-id', null), older = report('1', '1', {report_year: 2023});
  const out = analyzeEnergyEvidence([bad, older, report('2', '2')], {reportYear: 2024});
  assert.equal(out.invalidRecords, 1); assert.equal(out.nodes.length, 1); assert.equal(out.nodes[0].propertyId, '2');
});

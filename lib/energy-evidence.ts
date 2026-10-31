/** LL84 values belong to reporting properties. Native parent IDs define relationships. */
export const ENERGY_SOURCE = 'https://data.cityofnewyork.us/d/5zyy-y8am';
export type ReportingScope = {
  alignment: 'matched' | 'conflict' | 'not_retrieved';
  parent_property_id_raw: string | null;
  parent_property_name?: string | null;
  site_energy_use_kbtu: number | null;
  site_energy_use_kbtu_raw?: string | null;
  source_property_id?: string;
  source_report_year?: number;
  source_floor_area_ft2?: number | null;
  source_site_eui_kbtu_ft2?: number | null;
};
export type EnergyReport = {
  property_id: string;
  report_year: number;
  name?: string | null;
  address?: string | null;
  bbls?: string[];
  bins?: string[];
  number_of_buildings?: number | null;
  property_type?: string | null;
  metrics?: {site_eui_kbtu_ft2?: number | null; floor_area_ft2?: number | null; [key: string]: unknown};
  reporting_scope?: ReportingScope;
  data_quality?: Record<string, unknown>;
  [key: string]: unknown;
};
export type EnergyTarget = {bin?: string | null; bbl?: string | null; reportYear?: number};
export type EnergyNode = {
  key: string; propertyId: string; reportYear: number; name: string;
  relationship: 'parent' | 'child' | 'standalone' | 'unknown';
  parentKey: string | null; parentAvailable: boolean; childKeys: string[];
  bbls: string[]; bins: string[]; reportedBuildingCount: number | null;
  scopeLabel: string; targetMatch: 'single-building-report' | 'includes-selected-building' | 'lot-context-only' | 'not-matched' | 'not-requested';
  siteEnergyKbtu: number | null; floorAreaFt2: number | null; siteEuiKbtuFt2: number | null;
  propertyType: string | null; dataQuality: Record<string, unknown>;
  supplementAligned: boolean; conflictingCopies: boolean; sourceUrl: string; warnings: string[];
};
export type SameEnergyRelationship = {
  parentKey: string; childKey: string; siteEnergyKbtu: number;
  parentFloorAreaFt2: number | null; childFloorAreaFt2: number | null;
  parentEuiKbtuFt2: number | null; childEuiKbtuFt2: number | null;
  interpretation: string;
};
const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const positiveId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const ids = (value: unknown, length: number): string[] => Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && new RegExp(`^[1-5]\\d{${length - 1}}$`).test(v)))] : [];
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + stable(v)).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
function aligned(report: EnergyReport): boolean {
  const scope = report.reporting_scope;
  return !!scope && scope.alignment === 'matched' && scope.source_property_id === report.property_id && scope.source_report_year === report.report_year
    && numeric(scope.source_floor_area_ft2) === numeric(report.metrics?.floor_area_ft2)
    && numeric(scope.source_site_eui_kbtu_ft2) === numeric(report.metrics?.site_eui_kbtu_ft2);
}
/** Deduplicate report/year copies, retain scope, and identify direct parent–child repeated totals.
 * No cross-report energy total is produced: parent and child consumption may overlap. */
export function analyzeEnergyEvidence(records: readonly EnergyReport[], target: EnergyTarget = {}) {
  const groups = new Map<string, EnergyReport[]>();
  const warnings: string[] = [];
  let invalidRecords = 0, duplicateCopiesRemoved = 0;
  for (const report of records) {
    if (!report || !positiveId(report.property_id) || !Number.isInteger(report.report_year) || report.report_year < 1900 || report.report_year > 2200) {invalidRecords++; continue;}
    if (target.reportYear !== undefined && report.report_year !== target.reportYear) continue;
    const key = `${report.report_year}:${report.property_id}`;
    const existing = groups.get(key) ?? [];
    if (existing.some(r => stable(r) === stable(report))) duplicateCopiesRemoved++;
    else existing.push(report);
    groups.set(key, existing);
  }
  if (invalidRecords) warnings.push(`${invalidRecords} record(s) have an unsupported reporting identity and were not analyzed.`);
  const nodes: EnergyNode[] = [...groups.entries()].map(([key, copies]) => {
    const report = copies[0], scope = report.reporting_scope;
    const conflictingCopies = copies.length > 1;
    const supplementAligned = !conflictingCopies && aligned(report);
    const rawParent = supplementAligned && typeof scope?.parent_property_id_raw === 'string' ? scope.parent_property_id_raw.trim() : null;
    const relationship: EnergyNode['relationship'] = positiveId(rawParent) ? rawParent === report.property_id ? 'parent' : 'child' : rawParent === 'Not Applicable: Standalone Property' ? 'standalone' : 'unknown';
    const bins = conflictingCopies ? [] : ids(report.bins, 7), bbls = conflictingCopies ? [] : ids(report.bbls, 10);
    const count = conflictingCopies ? null : numeric(report.number_of_buildings);
    const multi = bins.length > 1 || bbls.length > 1 || (count !== null && count > 1) || relationship === 'parent';
    const targetMatch: EnergyNode['targetMatch'] = !target.bin && !target.bbl ? 'not-requested'
      : target.bin && bins.includes(target.bin) ? !multi && bins.length === 1 && count === 1 ? 'single-building-report' : 'includes-selected-building'
      : target.bbl && bbls.includes(target.bbl) ? 'lot-context-only' : 'not-matched';
    const nodeWarnings: string[] = [];
    if (conflictingCopies) nodeWarnings.push('Conflicting copies of the same reporting property and year: values and relationships are withheld.');
    else if (!supplementAligned) nodeWarnings.push('Native scope evidence is missing or does not match this report snapshot; parentage and site-energy total remain unknown.');
    else if (relationship === 'unknown') nodeWarnings.push('The native parent-property field does not establish a supported relationship. The name is not used to infer one.');
    if (multi) nodeWarnings.push('This reporting scope may include multiple buildings or lots. Do not allocate its values to a single footprint.');
    if (targetMatch === 'lot-context-only') nodeWarnings.push('A matching tax lot alone does not establish a building-specific energy value.');
    return {
      key, propertyId: report.property_id, reportYear: report.report_year, name: typeof report.name === 'string' ? report.name : `Reporting property ${report.property_id}`,
      relationship, parentKey: relationship === 'child' ? `${report.report_year}:${rawParent}` : null, parentAvailable: false, childKeys: [],
      bbls, bins, reportedBuildingCount: count,
      scopeLabel: relationship === 'parent' ? 'Parent reporting property' : relationship === 'child' ? 'Child reporting property' : relationship === 'standalone' ? multi ? 'Standalone report with multiple listed buildings or lots' : 'Standalone reporting property' : 'Reporting relationship unknown',
      targetMatch, siteEnergyKbtu: supplementAligned ? numeric(scope?.site_energy_use_kbtu) : null,
      floorAreaFt2: conflictingCopies ? null : numeric(report.metrics?.floor_area_ft2), siteEuiKbtuFt2: conflictingCopies ? null : numeric(report.metrics?.site_eui_kbtu_ft2),
      propertyType: typeof report.property_type === 'string' ? report.property_type : null,
      dataQuality: report.data_quality && typeof report.data_quality === 'object' ? report.data_quality : {},
      supplementAligned, conflictingCopies, sourceUrl: ENERGY_SOURCE, warnings: nodeWarnings,
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
  const byKey = new Map(nodes.map(node => [node.key, node]));
  for (const child of nodes.filter(n => n.relationship === 'child')) {
    const parent = byKey.get(child.parentKey!);
    child.parentAvailable = !!parent && parent.relationship === 'parent' && parent.supplementAligned && !parent.conflictingCopies;
    if (child.parentAvailable) parent!.childKeys.push(child.key);
    else child.warnings.push('The referenced parent report is not available as a verified parent for this year. No parent value is inferred.');
  }
  const sameEnergyRelationships: SameEnergyRelationship[] = [];
  for (const child of nodes) {
    if (!child.parentAvailable || child.siteEnergyKbtu === null || child.siteEnergyKbtu <= 0) continue;
    const parent = byKey.get(child.parentKey!)!;
    if (parent.siteEnergyKbtu !== child.siteEnergyKbtu) continue;
    sameEnergyRelationships.push({parentKey: parent.key, childKey: child.key, siteEnergyKbtu: child.siteEnergyKbtu,
      parentFloorAreaFt2: parent.floorAreaFt2, childFloorAreaFt2: child.floorAreaFt2, parentEuiKbtuFt2: parent.siteEuiKbtuFt2, childEuiKbtuFt2: child.siteEuiKbtuFt2,
      interpretation: 'These linked reports contain the same positive native site-energy total. Their reporting floor areas may differ. This does not establish an error, independent metering, an allocation rule, or building efficiency. Do not add the parent and child totals.'});
  }
  const unresolved = nodes.some(n => n.relationship === 'unknown' || n.conflictingCopies || (n.relationship === 'child' && !n.parentAvailable));
  return {
    nodes, sameEnergyRelationships, duplicateCopiesRemoved, invalidRecords,
    conflictingRecordKeys: nodes.filter(n => n.conflictingCopies).map(n => n.key),
    aggregateSiteEnergyKbtu: null,
    aggregationNote: 'No total across reporting properties is calculated. Parent/child scopes and repeated BBL links may overlap; missing reports and energy values are not zero.',
    warnings,
    nextChecks: [
      ...(unresolved ? ['Retrieve the native reporting relationship and the matching parent record for the same calendar year.'] : []),
      'Confirm which meters, floor areas and buildings the selected report covers.',
      'Obtain building-specific metering or a documented allocation before assigning this reported energy total to one footprint.',
      'Verify present use and operating conditions before comparing performance or estimating future demand.',
    ],
  };
}

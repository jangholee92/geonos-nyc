/** Preliminary, reproducible screening of the supplied public-data sample. */
export type UseCase = "cold_storage" | "warehouse" | "housing";
export type ZoningGroup = "all" | "M" | "C" | "R" | "other";
export type Metric = "flood_depth_m" | "heat_index" | "truck_distance_m";

export interface Building {
  id: string;
  bbl: string;
  address: string;
  borough: string;
  borough_code?: string;
  latitude: number;
  longitude: number;
  building_area_sqft: number | null;
  lot_area_sqft?: number | null;
  storage_area_sqft?: number | null;
  factory_area_sqft?: number | null;
  floors?: number | null;
  year_built?: number | null;
  building_class?: string | null;
  land_use?: string | number | null;
  zoning_district?: string | null;
  zoning_districts?: string[];
  pluto_version?: string | null;
  firm07_flag?: number | null;
  pfirm15_flag?: number | null;
  flood_status?: string;
  /** Historical NPCC2013 scenario point membership; display only, never a score input. */
  projected_flood_zone_2050?: 0 | 1 | null;
  heat_hvi?: number | null;
  zcta20?: string | null;
  truck_route_distance_m?: number | null;
  nearest_truck_route?: string | null;
  truck_route_type?: string | null;
  truck_route_restriction?: string | null;
  source_ids?: string[];
  source_url?: string;
  retrieved_at?: string;
}

/** Imported scenario rows join by the 10-digit NYC BBL, never by address. */
export interface LayerRecord {
  bbl: string;
  metric: Metric;
  value: number | null;
  source: string;
  scenario: string;
  year: string;
  unit: string;
}

export interface AnalysisOptions {
  borough?: string;
  query?: string;
  minArea?: number;
  zoning?: ZoningGroup;
  useCase: UseCase;
  weights?: { area: number; lowFlood: number; lowHeat: number; truck: number };
  scenario?: string;
  year?: string;
  limit?: number;
}

export interface Evidence {
  id: string;
  label: string;
  value: number | string | null;
  unit: string;
  source: string;
  scenario?: string;
  note?: string;
}

export interface Candidate {
  building: Building;
  score: number | null;
  /** Share (0–1) of enabled weight with a known value; never a confidence. */
  scoreCoverage: number;
  evidence: Evidence[];
  missing: string[];
  useAssessment: {
    status: "preliminary_only";
    reason: string;
    legalSuitability: "unknown";
  };
  metrics: {
    area: number | null;
    floodDepth: number | null;
    heat: number | null;
    truckDistance: number | null;
  };
  floodFlag: "flagged" | "not_flagged" | "unknown";
}

export interface AnalysisResult {
  ranked: Candidate[];
  excludedCount: number;
  totalCount: number;
  matchedCount: number;
  /** Counts of matching candidates with a usable value, before limit. */
  coverage: { flood: number; heat: number; truck: number };
  methodology: string[];
  warnings: string[];
}

export const DEFAULT_WEIGHTS = { area: 1, lowFlood: 0, lowHeat: 0, truck: 0 };
export const METHODOLOGY = [
  "제한된 공개자료 표본을 비교합니다. 실제 매물 목록이나 인허가 검토 결과가 아닙니다.",
  "규모 점수 = min(건물 연면적 ÷ 100,000 ft², 1) × 100. 탐색을 위해 정한 선호 기준이며 공학적 적합성 기준이 아닙니다.",
  "물류 점수 = max(1 − 트럭 노선 직선거리 ÷ 1,000 m, 0) × 100. 노선과 가까워도 차량 진입이나 합법적 통행이 보장되지 않습니다.",
  "열 지표 점수 = (5 − 지수) ÷ 4 × 100. 현재 자료는 주민의 사회적 여건을 포함한 지역 열 취약성 지수(1–5)이며 필지 기온이나 미래기후 예측이 아닙니다.",
  "침수 점수 = max(1 − 가져온 시나리오 침수 깊이 ÷ 2 m, 0) × 100. PLUTO 홍수구역 교차 기록으로 침수 깊이를 추정하지 않으며, 기록이 없다고 안전한 것은 아닙니다.",
  "2050년대 NPCC 2013 역사 시나리오는 대표점의 구역 포함 여부만 보여줍니다. 점수에는 사용하지 않으며 현재 PLUTO 교차 기록과 정량적 위험 변화로 비교하지 않습니다.",
  "선택한 지표를 모두 확인할 수 있을 때만 가중평균 점수를 계산합니다. 누락값은 미확인으로 남기며 위험이 0인 것으로 처리하지 않습니다.",
  "가져온 자료는 BBL·시나리오·기간이 모두 일치해야 합니다. 중복값이 충돌하면 미확인으로 남깁니다. 미래 열·침수 값에 현재 값을 대신 넣지 않습니다.",
  "용도별 설명은 추가 확인사항입니다. 용도지역·면적·접근성만으로 허가 가능성, 공학적 적합성, 사업성을 판정할 수 없습니다.",
];

const PLUTO_SOURCE = "https://data.cityofnewyork.us/d/64uk-42ks";
const HEAT_SOURCE = "https://data.cityofnewyork.us/d/4mhf-duep";
const TRUCK_SOURCE = "https://data.cityofnewyork.us/d/jjja-shxy";
const finiteNonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const validHeat = (value: unknown): value is number => finiteNonnegative(value) && value >= 1 && value <= 5;
const cleanNumber = (value: unknown) => finiteNonnegative(value) ? value : null;

export function normalizeBorough(value: string): string {
  const aliases: Record<string, string> = { bk: "Brooklyn", brooklyn: "Brooklyn", qn: "Queens", queens: "Queens", bx: "Bronx", bronx: "Bronx", "the bronx": "Bronx", mn: "Manhattan", ny: "Manhattan", manhattan: "Manhattan", si: "Staten Island", "staten island": "Staten Island", all: "all" };
  return aliases[value.trim().toLowerCase()] ?? value;
}

/** Metadata is a citation supplied by the user, not independent source verification. */
export function validateLayerRecord(value: unknown): value is LayerRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.bbl !== "string" || !/^\d{10}$/.test(row.bbl) || !["flood_depth_m", "heat_index", "truck_distance_m"].includes(String(row.metric))) return false;
  for (const key of ["source", "scenario", "year", "unit"]) {
    const limit = key === "source" ? 700 : key === "year" ? 30 : 80;
    if (typeof row[key] !== "string" || !row[key].trim() || row[key].length > limit) return false;
  }
  if (row.value !== null && (!finiteNonnegative(row.value) || row.value > 1e7)) return false;
  if (row.metric === "heat_index") return row.unit === "index_1_5" && (row.value === null || validHeat(row.value));
  return row.unit === "m";
}

export function zoningGroup(building: Building): Exclude<ZoningGroup, "all"> {
  const first = (building.zoning_district ?? "").trim().toUpperCase().charAt(0);
  return first === "M" || first === "C" || first === "R" ? first : "other";
}

function layerFor(building: Building, metric: Metric, options: AnalysisOptions, layers: LayerRecord[]) {
  const rows = layers.filter((row) => validateLayerRecord(row) && row.bbl === building.bbl && row.metric === metric &&
    row.scenario === (options.scenario ?? "baseline") && row.year === (options.year ?? "current"));
  if (!rows.length) return { row: null, conflict: false };
  // Identical duplicates are harmless, but competing values/sources are not silently preferred.
  const unique = [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()];
  return unique.length === 1 ? { row: unique[0], conflict: false } : { row: null, conflict: true };
}

function usableLayer(row: LayerRecord | null, metric: Metric): number | null {
  if (!row || !validateLayerRecord(row)) return null;
  if (metric === "heat_index") return row.unit === "index_1_5" && validHeat(row.value) ? row.value : null;
  return row.unit === "m" ? cleanNumber(row.value) : null;
}

export function buildEvidence(building: Building, options: AnalysisOptions, layers: LayerRecord[] = []): Candidate {
  const scenario = options.scenario ?? "baseline";
  const baseline = scenario === "baseline" && (!options.year || options.year === "current");
  const floodLayer = layerFor(building, "flood_depth_m", options, layers);
  const heatLayer = layerFor(building, "heat_index", options, layers);
  const truckLayer = layerFor(building, "truck_distance_m", options, layers);
  const area = cleanNumber(building.building_area_sqft);
  const floodDepth = usableLayer(floodLayer.row, "flood_depth_m");
  const heat = heatLayer.row || heatLayer.conflict
    ? usableLayer(heatLayer.row, "heat_index")
    : baseline && validHeat(building.heat_hvi) ? building.heat_hvi : null;
  const truckDistance = truckLayer.row || truckLayer.conflict
    ? usableLayer(truckLayer.row, "truck_distance_m")
    : cleanNumber(building.truck_route_distance_m);
  // Dataset flags record intersections, not a positive finding of absence of flooding.
  const floodFlag = building.pfirm15_flag === 1 || building.firm07_flag === 1 ? "flagged" : "unknown";
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const components = [
    { key: "building_area_sqft", weight: weights.area, value: area, score: area === null ? null : Math.min(area / 100_000, 1) * 100 },
    { key: "flood_depth_m", weight: weights.lowFlood, value: floodDepth, score: floodDepth === null ? null : Math.max(1 - floodDepth / 2, 0) * 100 },
    { key: "heat_index", weight: weights.lowHeat, value: heat, score: heat === null ? null : (5 - heat) / 4 * 100 },
    { key: "truck_distance_m", weight: weights.truck, value: truckDistance, score: truckDistance === null ? null : Math.max(1 - truckDistance / 1000, 0) * 100 },
  ].filter((component) => finiteNonnegative(component.weight) && component.weight > 0);
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const knownWeight = components.reduce((sum, component) => sum + (component.value !== null ? component.weight : 0), 0);
  const missing = components.filter((component) => component.value === null).map((component) => component.key);
  if (!totalWeight) missing.push("enabled_score_metric");
  const score = totalWeight > 0 && missing.length === 0
    ? Math.round(components.reduce((sum, component) => sum + (component.score as number) * component.weight, 0) / totalWeight * 10) / 10
    : null;
  const source = building.source_url || PLUTO_SOURCE;
  const evidence: Evidence[] = [
    { id: `${building.bbl}:area`, label: "건물 연면적", value: area, unit: "ft²", source, note: `PLUTO ${building.pluto_version ?? "버전 미확인"} · 필지 전체 합계이며 실제 사용 가능한 실내 면적은 별도 확인이 필요합니다.` },
    { id: `${building.bbl}:zoning`, label: "원자료 용도지역", value: building.zoning_district || null, unit: "지역 코드", source, note: "첫 번째 용도지역만 표시합니다. 복합 용도지역과 개별 용도의 허가 조건은 별도 검토가 필요합니다." },
    { id: `${building.bbl}:flood-flag`, label: "홍수구역 교차 기록", value: floodFlag === "flagged" ? "교차 기록 있음" : null, unit: "기록", source, note: `2007 FIRM: ${building.firm07_flag ?? "미기록"} · 2015 예비 FIRM: ${building.pfirm15_flag ?? "미기록"}. 누락·0은 안전 판정이 아니며 시나리오 침수 깊이로 해석할 수 없습니다.` },
    { id: `${building.bbl}:future-flood-2050`, label: "2050년대 역사 시나리오 (대표점)", value: building.projected_flood_zone_2050 === 1 ? "대표점이 시나리오 구역 내부" : building.projected_flood_zone_2050 === 0 ? "대표점이 시나리오 구역 외부 (안전 판정 아님)" : null, unit: "구역 포함 여부", source: "https://data.cityofnewyork.us/Environment/Future-Floodplain-2050s/27ya-gqtm", scenario: "NPCC 2013 상위 90백분위 · 해수면 +31인치 (2000–2004년 대비) · 2050–2059년대 · 연간 초과확률 1% 해안홍수", note: "2013년에 작성한 예시적 계획 시나리오로 최신 예측이나 특정 2050년의 예측이 아닙니다. 원 보고서는 개별 부지 위험·보험료·재산가치 판단에 사용하지 않도록 명시합니다. 대표점의 포함 여부이며 필지 전체·건물 전체·침수 깊이를 뜻하지 않습니다. 외부라도 안전하다는 뜻은 아닙니다. 현재 PLUTO의 필지 일부 교차 기록과 방법이 달라 정량적 증감 비교를 하지 않으며 점수에서 제외합니다." },
    { id: `${building.bbl}:flood-depth`, label: "가져온 침수 깊이", value: floodDepth, unit: "m", source: floodLayer.row?.source ?? "일치하는 가져오기 자료 없음", scenario: `${scenario}${options.year ? ` / ${options.year}` : ""}`, note: floodLayer.conflict ? "동일 조건의 기록이 충돌하여 값을 표시하지 않습니다." : "사용자가 제공한 출처·시나리오의 값입니다. 출처 내용은 독립 검증하지 않았으며 PLUTO 기록으로 깊이를 추정하지 않습니다." },
    { id: `${building.bbl}:heat`, label: heatLayer.row ? "가져온 열 지표" : "지역 열 취약성", value: heat, unit: "1–5 지수", source: heatLayer.row?.source ?? HEAT_SOURCE, scenario: heatLayer.row ? `${heatLayer.row.scenario} / ${heatLayer.row.year}` : baseline ? "현재 공개자료" : scenario, note: heatLayer.conflict ? "동일 조건의 기록이 충돌하여 값을 표시하지 않습니다." : heatLayer.row ? "사용자가 제공한 1–5 지수입니다. 출처·정의·현재 지수와의 비교 가능성을 확인하세요. 출처 내용은 독립 검증하지 않았습니다." : "ZCTA 주민의 사회적 여건을 포함한 지역 취약성입니다. 필지 기온·건물 성능·미래 예측을 뜻하지 않습니다." },
    { id: `${building.bbl}:truck`, label: "트럭 노선까지 직선거리", value: truckDistance, unit: "m", source: truckLayer.row?.source ?? TRUCK_SOURCE, scenario: truckLayer.row ? `${truckLayer.row.scenario} / ${truckLayer.row.year}` : "현재 자료 / 고정값", note: truckLayer.conflict ? "동일 조건의 기록이 충돌하여 값을 표시하지 않습니다." : "필지 대표점에서 노선까지의 직선거리입니다. 차량 진입·주행시간·통행 허가를 보장하지 않습니다. 가져온 값의 출처는 독립 검증하지 않았습니다." },
  ];
  const threshold = options.useCase === "cold_storage" ? 25_000 : options.useCase === "warehouse" ? 10_000 : 5_000;
  const areaNote = area === null ? "건물 연면적이 미확인입니다." : area >= threshold
    ? `탐색용으로 정한 ${threshold.toLocaleString("ko-KR")} ft² 규모 기준 이상입니다.`
    : `탐색용으로 정한 ${threshold.toLocaleString("ko-KR")} ft² 규모 기준 미만입니다.`;
  const useNote = options.useCase === "cold_storage"
    ? "냉동·냉장 설비, 전력 용량, 상하차 진입, 침수 대응, 용도 허가를 별도 확인해야 합니다."
    : options.useCase === "warehouse"
      ? "상하차 진입, 구조 하중, 소방 설비, 용도 허가를 별도 확인해야 합니다."
      : "주거 용도 허가, 거주 환경, 기반시설, 개발 가능 면적을 별도 확인해야 합니다.";
  return {
    building, score, scoreCoverage: totalWeight ? knownWeight / totalWeight : 0,
    evidence, missing,
    useAssessment: { status: "preliminary_only", legalSuitability: "unknown", reason: `${areaNote} ${useNote} 용도지역 ${building.zoning_district || "미확인"}은 원자료 표기이며 적법성은 미확인입니다.` },
    metrics: { area, floodDepth, heat, truckDistance }, floodFlag,
  };
}

export function analyzeBuildings(buildings: Building[], options: AnalysisOptions, layers: LayerRecord[] = []): AnalysisResult {
  const unique = [...new Map(buildings.map((building) => [building.bbl, building])).values()];
  const filtered = unique.filter((building) => {
    if (options.query?.trim() && !`${building.address} ${building.bbl}`.toLowerCase().includes(options.query.trim().toLowerCase())) return false;
    if (options.borough && options.borough !== "all" && normalizeBorough(building.borough) !== normalizeBorough(options.borough)) return false;
    if (options.minArea && (!finiteNonnegative(building.building_area_sqft) || building.building_area_sqft < options.minArea)) return false;
    if (options.zoning && options.zoning !== "all" && zoningGroup(building) !== options.zoning) return false;
    return true;
  });
  const candidates = filtered.map((building) => buildEvidence(building, options, layers));
  candidates.sort((a, b) => {
    if (a.score === null && b.score !== null) return 1;
    if (a.score !== null && b.score === null) return -1;
    return (b.score ?? 0) - (a.score ?? 0) || a.building.bbl.localeCompare(b.building.bbl);
  });
  const warnings = [
    "모든 결과는 사전 검토용입니다. 적법성과 실제 매물 여부는 미확인입니다.",
    "홍수구역 교차 기록이 없는 필지는 미확인 상태이며 홍수로부터 안전하다는 뜻이 아닙니다.",
  ];
  if (candidates.some((candidate) => candidate.score === null)) warnings.push("선택한 지표가 누락되거나 충돌하여 일부 후보의 점수를 계산하지 않았습니다.");
  if ((options.scenario ?? "baseline") !== "baseline") warnings.push("미래·시나리오별 열과 침수 값은 일치하는 가져오기 자료가 필요합니다. 건물 면적과 기본 트럭 거리는 원자료 시점의 고정값입니다.");
  if (buildings.length !== unique.length) warnings.push("같은 BBL의 중복 기록을 하나의 필지로 합쳤습니다.");
  const limit = Number.isFinite(options.limit) ? Math.max(0, Math.min(1500, Math.floor(options.limit as number))) : candidates.length;
  return {
    ranked: candidates.slice(0, limit), excludedCount: unique.length - filtered.length,
    totalCount: unique.length, matchedCount: filtered.length,
    coverage: {
      flood: candidates.filter((candidate) => candidate.metrics.floodDepth !== null).length,
      heat: candidates.filter((candidate) => candidate.metrics.heat !== null).length,
      truck: candidates.filter((candidate) => candidate.metrics.truckDistance !== null).length,
    },
    methodology: METHODOLOGY, warnings,
  };
}

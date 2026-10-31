# NYC full-source data audit — October 28, 2026 UTC

Original citywide inventory acquired October 27; surroundings derivation and fresh-source adapter audit completed October 28. Source observation/model dates remain separate from these acquisition and audit dates.

## Completion and scope

**Complete and reconciled:** 858,284 PLUTO tax-lot records and 1,082,964 official building-footprint records across all five boroughs and all source land uses. There is no industrial-only, area, availability, or 45-record sample filter in this snapshot.

This means all records in the named official datasets at the recorded revisions. It is not a claim that the source captures every physical structure or its current operating condition. The original 45-parcel prototype remains a separate earlier artifact.

| Borough | PLUTO tax lots | Footprint records |
| --- | ---: | ---: |
| Manhattan | 42,504 | 45,172 |
| Bronx | 89,362 | 104,268 |
| Brooklyn | 276,106 | 330,113 |
| Queens | 324,483 | 460,950 |
| Staten Island | 125,829 | 142,461 |
| **Total** | **858,284** | **1,082,964** |

Borough summaries use PLUTO `borocode` for lots and the footprint's BIN borough prefix, with source BBL fallback. No footprint record has an unclassified borough in this snapshot.

## Official sources and snapshot protection

- [PLUTO, NYC Department of City Planning](https://data.cityofnewyork.us/d/64uk-42ks), dataset `64uk-42ks`, version **26v2**, source rows updated **August 24, 2026, 20:48:51 UTC**.
- [BUILDING / Building Footprints, NYC Office of Technology and Innovation](https://data.cityofnewyork.us/d/5zhs-2jue), dataset `5zhs-2jue`, source rows updated **October 25, 2026, 08:21:07 UTC**. This live metadata is newer than some indexed catalog pages.
- [OTI's official footprint specification](https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_BuildingFootprints.md) explains geometry, IDs, capture limits, unknown heights, and condominium joining. The local research workspace retains a copy; the published report links to the authoritative specification above.

Both datasets were counted before acquisition and again after all downloads. Source row counts and `rowsUpdatedAt` remained unchanged. The downloaded rows reconcile to both source counts and SQLite row counts. PLUTO was downloaded as **18** ordered CSV chunks; footprints as **44**. The gzip archives total approximately **241.54 MB**, without a second ZIP layer. Each chunk has its request URL, offset, expected/actual count, first/last key, retrieval time, byte length and SHA-256 in its source download manifest. Accepted chunks can be reused after interruption only when the source revision and checksum match. Source revision changes cause a refusal rather than silently mixing revisions.

The SQLite primary keys independently establish 858,284 unique nonnull BBLs and 1,082,964 unique OTI DOITT_IDs. A remote footprint `count(distinct doitt_id)` request timed out; uniqueness was therefore verified on the complete downloaded source in SQLite, not assumed from that failed query.

## Individual footprints, BINs and tax lots

`DOITT_ID` is the stable footprint key. BIN identifies buildings but is not guaranteed unique in the source specification. This snapshot contains **1,082,951 distinct assigned BINs** and **13 unassigned borough-million BIN records**. There are no duplicate assigned BINs in this snapshot. The only repeated BIN groups are unassigned `3000000` (2 records), `4000000` (6), and `5000000` (3); the remaining two unassigned codes occur once each. No BIN has an invalid seven-digit format.

The full footprint source contains **868,582** records classified as Building (`2100`), **213,408** Garage (`5110`), **311** Under Construction (`5100`), and **663** records in other source categories. The latter include parking/canopy/auxiliary/skybridge/temporary/cantilevered and placeholder records. Headline counts must say *footprint records*, not imply 1,082,964 conventional occupied buildings.

The source's capture rules generally cover structures above 400 square feet and 12 feet, plus other agency BIN structures. Some small, movable, temporary and interior features are excluded by source policy; legacy or explicitly categorized exceptions exist in the actual data.

The official `mappluto_bbl` is used first because it accounts for condominium billing lots. `base_bbl` is considered only when the first key has no PLUTO match. Results:

- **1,082,740** footprints join through `mappluto_bbl`; no additional matches require the base-BBL fallback in this snapshot.
- **224** footprints remain unmatched. No nearest-lot or guessed address join fills these gaps.
- **817,016** distinct tax lots have a matched footprint; **219,982** lots have multiple footprints.
- **41,268** PLUTO lots have no matched footprint. This can include vacant and other non-building lots as well as source differences; it is not automatically an error.

The source dates differ, so the two inventories are not a perfectly synchronized cadastral snapshot. Tax-lot floor area, use, floors, units and valuation remain **lot context**. They must not be copied into every footprint as independent building facts or summed once per footprint.

## Geometry and measurement

All source footprint geometries are retained as WKB in EPSG:4326. The source CSV/WKT archive is also preserved. There are **0 missing footprint geometries**, **7 invalid geometries** (ring self-intersections), and **34 placeholder triangles**. No geometry is silently repaired or dropped. The affected IDs are in `city_quality.json`; individual validity reasons are in `research/citywide/invalid_geometries.json`.

Derived area and HVI/future spatial context are null for the **41 invalid or placeholder records**. Approximate preview positions remain available so the inventory and overview counts still include those source records. Consumers must apply the quality guard and runtime `feature_code == 1003` placeholder check. Static invalid-ID lists apply only to the recorded source revision.

Archived valid ordinary footprint area is computed after transforming geometry to **EPSG:2263**, in U.S. survey square feet. The live browser adapter instead displays a rounded approximate spherical plan-view area in square feet; it is not identical to the projected archival measurement. Both paths exclude known invalid/placeholder records. Official `shape_area` and `shape_length` are retained as source attributes but never used as measured area/length because OTI documents their Web Mercator distortion. A footprint is a plan-view outline, not usable floor area or total floor area. Full-city surroundings calculations use EPSG:2263, not the browser's approximate area.

Archival footprint context joins use Shapely points on surface. The live app uses an interior horizontal-scanline point in the largest polygon component, excluding holes; these are different valid reference-point methods and can differ near category boundaries. The Smith Street story was queried using the actual app reference points against the pinned full-resolution source. None of these points is an entrance or survey point. PLUTO coordinates are the source's approximate lot points. **937** PLUTO rows have missing/invalid coordinates and remain in the inventory without spatial joins. All populated source locations pass the NYC envelope check; none lie outside longitude −74.3 to −73.65 / latitude 40.48 to 40.94.

## Public layer coverage

All original PLUTO fields are retained, including up to four zoning districts, overlays, special districts, FAR fields, area/units/year/assessment fields, historic/landmark and source flood flags. Detailed present/null counts for every retained and derived field are in `field_coverage.json`.

| Field or join | Tax lots | Footprint records |
| --- | ---: | ---: |
| HVI available | 855,470 | 1,081,046 |
| HVI missing or guarded | 2,814 | 1,918 |
| Census 2020 ZCTA missing or guarded | 2,030 | 289 |
| Historical future point membership inside | 96,615 | 111,987 |
| Historical future point membership unknown | 937 | 41 |

HVI comes from [DOHMH's official rankings](https://data.cityofnewyork.us/d/4mhf-duep), joined using [Census 2020 ZCTA polygons](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/84). All-city spatial joins use the official 2020 geographic vintage, not postal ZIP approximation. HVI is a neighborhood vulnerability ranking based on historical environmental and social factors; it is not building temperature, cooling demand or a future heat forecast.

The future layer is [NYC's historical 2013 planning dataset](https://data.cityofnewyork.us/d/27ya-gqtm): NPCC 2013 high-estimate 90th percentile, 31 inches sea-level rise relative to 2000–2004, sea-level period **2050–2059**, coastal 1% annual-chance zone. It is a point/polygon context overlay only, outside suitability scoring. A zero means outside this one scenario at that point; null means unavailable/guarded. There is no flood-depth estimate. The official report cautions against site-specific risk or property-value judgments. Future point results must not be subtracted from current any-part-of-lot flood flags as if they were a consistent change metric.

PLUTO retains **34,736** 2007 flood flags and **65,826** 2015 preliminary flags. Their absent values remain null (**823,548** and **792,458**, respectively), not safe/outside. They describe any part of a tax lot, not necessarily an individual building.

Other useful missingness: **577** missing parcel addresses, **1,442** missing primary zoning districts, **506** missing total building areas, **42,374** missing floor counts, **720** unknown footprint roof heights and **10,065** unknown construction years. Source roof height/year zero is preserved in raw fields and normalized to unknown in the corresponding usable fields. Ground elevation zero is not automatically discarded because zero can be a valid datum-relative value.

Current vacancy, rent, clear ceiling height, electrical capacity, structural floor load, loading docks, food-use permission and access compliance are not established by these sources. They remain unverified. Weather and other new layers should preserve their own source timestamps and spatial scale; they are not invented in this archive.

## Files, indexes and application boundaries

- `data/citywide/nyc.sqlite` — approximately 1.10 GB. Complete parcel table, complete footprint table, original geometry WKB, BBL/BIN indexes, parcel-address FTS5, building-bbox and parcel-point RTree indexes.
- `data/citywide/citywide_counts.json` — compact public summary of source counts, boroughs, quality, coverage and timestamps.
- `data/citywide/overview_grid.json` — **3,435** occupied cells at 0.005 degrees; rows are `[west, south, building_count]`. Counts sum to **1,082,964**, including every source footprint record with a preview point. This is a density overview, not individual footprint geometry.
- `data/citywide/overview_grid.geojson` — the same all-city cell aggregation with center points and cell bounds.
- `data/citywide/city_quality.json` — revision-specific invalid/placeholder/unassigned-BIN ID lists and rules.
- `data/citywide/identity_audit.json`, `field_coverage.json`, `manifest.json` and both `*_download_manifest.json` files — detailed audit and SHA-256 checksums.
- `research/citywide/context_sources.json` — provenance and caveats for reused HVI, Census geography and flood context.

The full archive is local. A deployed app can query official no-key SODA endpoints for bounded viewport pages and selected records while using the compact all-city overview. It must disclose bounded loaded results and distinguish live source results from this dated local snapshot. It must not imply that one million features were embedded in the web bundle or that bounded results are a complete screen at every zoom.

## Reproduce and validate

### Full-city surroundings and status guards

Snapshot `nyc-surroundings-20261028-v1` preserves all **1,082,964** DOITT records: **1,082,923** computed and **41** explicit unknowns for the seven invalid and 34 placeholder outlines. The current/2050 category geometry is the original downloadable DEP source with a 2024-07-03 data update, retrieved 2026-10-27. Separately identified 2050 hosted-service exclusion/water masks are preserved; they are not used to infer comprehensive coverage. The current hosted point service and downloadable source have different geometries and are never silently combined into one revision.

| Derived product | Calculation and validation | Interpretation/status |
|---|---|---|
| Nearest mapped category | Exact global outline-to-polygon distance, EPSG:2263; no search cap | Geometric distance, not entrance distance, indoor depth or annual probability |
| External bands | Category-union area in 0–5, 5–10 and 10–20 m outward bands | Geometric context; can include courtyards, other buildings and private land |
| Exclusions and water | Separately measured 2050 service masks | No mask hit does not establish model coverage |
| Known invalid/placeholder outline | Null analytical values; inventory record retained | `unsupported`, never zero-filled |
| Geometry or native edit date differs | SHA-256 fingerprint and edit timestamp comparison | `stale`; the app withholds the old derived evidence |
| Missing row, failed fetch or malformed shard | Compatible schema/snapshot and numeric-value checks | `unavailable`, never a safety finding |
| Parcel selection | No individual footprint provided | `unsupported`; a lot point cannot substitute for an outline |

Fingerprint canonicalization retains polygon type, ring/component/vertex order and the first two coordinate axes, rounding each axis to 1e-7 degree before SHA-256. Equivalent geometry reordered by the source can conservatively become stale; no topological-equivalence guess overrides the guard. Native edit dates must also match. The invalid-ID list is revision-specific; source placeholders additionally use the runtime `feature_code=1003` guard.

Eight real examples were recalculated against all source polygon parts: maximum nearest-distance difference was **0.000479 m**, consistent with stored rounding. Doubling buffer resolution from 32 to 64 segments per quadrant changed sampled band-category area by at most **0.165 m²**. External/disjoint band assertions and an analytical 20 m² check passed. All 114 cross-language cases produced identical app/Python reference points and fingerprints. These implementation checks do not measure the physical accuracy of the source flood model or building outlines.

A separate **80-record stratified recomputation** (16 per borough) read original footprint CSV WKT and native EPSG:2263 DEP polygons directly from the official ZIP. Its independent meter-coordinate calculation used brute-force nearest distances and cumulative-buffer area subtraction. All 80 passed: the sample includes 20 footprints with holes, 30 mapped-band hits, 23 mask/water-band hits and 36 all-band no-hits (categories overlap). Maximum discrepancies were **0.0004992 m** for distance and **0.053780 m²** for packaged band area, within stored rounding. US survey-foot conversion was independently checked against CRS metadata and a one-square-meter control. This is sample numerical verification, not independent all-city or physical-model accuracy validation; both implementations use GEOS/PROJ. [Machine-readable results](/reports/surroundings_spatial_audit.json).

All 129 public shards passed byte-length/SHA-256, unique-ID, correct-bucket, finite-value and explicit-unknown checks. Deterministic `.json.gz` assets now occupy **73,727,636 stored bytes** and decode to the unchanged **192,532,821 JSON bytes**. The largest compressed file is 643,063 bytes; the largest decoded shard is 1,694,262 bytes. Each decoded hash matches the original manifest. They are lazy static assets, not a million-record JavaScript import or Worker database. Original uncompressed JSON and the full local analytical SQLite archive remain outside public assets.

### Fresh official-source check across all five boroughs

At **2026-10-28 00:32 UTC**, a deterministic stratified random sample of 20 valid/nonplaceholder archived DOITT IDs per borough was fetched again from official SODA, together with all 41 quality-guard IDs and their native PLUTO rows. The footprint source metadata remained at **2026-10-25 08:21:07 UTC** before and after acquisition. All 141 requested native records were returned with unique IDs; no missing IDs or acquisition errors occurred.

The test executed the actual `combineBuilding`, `fetchSurroundings` and public-fetch limiter against these native geometries and the published static shards. It did not recreate the production loader in the test. Static responses were read locally through the Fetch interface, so this is a source/adapter/content audit rather than a guarantee of deployed CDN or browser connectivity.

| Borough | Random valid records available | Known invalid/placeholder unsupported | Live stale | Live unavailable |
|---|---:|---:|---:|---:|
| Manhattan | 20 | 9 | 0 | 0 |
| Bronx | 20 | 4 | 0 | 0 |
| Brooklyn | 20 | 4 | 0 | 0 |
| Queens | 20 | 16 | 0 | 0 |
| Staten Island | 20 | 8 | 0 | 0 |
| **Total** | **100** | **41** | **0** | **0** |

Separate deliberate mutations—not observed live-source changes—confirmed that geometry changes and edit-date changes each return `stale`; a parcel control returns `unsupported`. Six automated surroundings tests also cover malformed/missing rows, snapshot mismatch, concurrent request sharing and retry after failure. The sample supports these integration results; it is not a re-download or physical validation of all million source features. [Machine-readable audit results and requested URLs](/reports/surroundings_live_audit.json).

From the workspace root, reproduce the new live audit with:

```sh
python3 research/decision_patterns/audit_live_surroundings.py
node research/decision_patterns/audit_live_surroundings.cjs
```

Source fixtures, before/after metadata, exact request URLs, response hashes and detailed per-record outcomes are retained in `research/decision_patterns/live_audit/`. A later source change can legitimately produce stale or missing records; inspect the recorded outcome rather than treating the old count as a permanent guarantee.

From the site repository, review and regenerate public data with:

```sh
python3 scripts/sync-public-data.py --dry-run
python3 scripts/test-sync-public-data.py --report /tmp/geonos-sync-audit.json
python3 scripts/sync-public-data.py
```

This staged process preserves curated English copy, native LL84 reporting scope, existing English reports and all surroundings shards. It validates before mutation, atomically replaces changed managed files, and then removes only verified obsolete raw shard files for which the compressed replacement already exists. It never erases public directories or unknown files. The catalog's **28 connected entries** are products with implemented query, lookup, climate or map-display paths, not 28 independent sources or 28 site-level calculations; the [layer methods report](/reports/LAYERS_METHODS.md) reconciles the count and capabilities.


### Rebuild integrity and publication size

The two large browser products are bounded static shards, loaded only when a selected record needs them. The totals below are independently verified source bytes, not startup transfer or JavaScript bundle size.

| Product | Shards | Exact stored asset bytes | Decoded JSON bytes | Largest stored asset |
|---|---:|---:|---:|---:|
| Full-city surroundings (`.json.gz`) | 129 | 73,727,636 | 192,532,821 | 643,063 |
| LL84 reporting-scope evidence (`.json`) | 45 | 43,922,319 | 43,922,319 | 6,353,146 |

The surroundings manifest reconciles **1,082,964** records: **1,082,923 computed**, **41 unsupported invalid/placeholder**. The energy index reconciles **26,736 BBLs**, **40,041 BBL/report references**, and **37,931 distinct indexed reports** from **39,090 original reports**. Repeated references are not additional reporting properties and must not be summed. Both manifests record decoded JSON SHA-256 and byte length. The surroundings manifest additionally records each deployed gzip file's SHA-256 and byte length. Its deterministic level-9 gzip files have a zero timestamp and no embedded filename; the browser decompresses one requested shard before parsing. Metadata and method text stay uncompressed. LL84 remains ordinary JSON (its separate level-6 transfer estimate is 4,002,704 bytes); actual HTTP transfer can differ with host encoding. The full local SQLite, raw source downloads, precise FGB geometry, analysis database and Python environment are outside the app checkout and public output.

The reconstruction guard pins all six analytical input hashes, hosted mask counts/edit dates and calculation-source hashes. Resuming or exporting after an input or calculation change stops for a new reviewed snapshot; an uncheckpointed source SQLite WAL also stops the operation. The guard was added after the original successful run: its adoption record explicitly says so, verifies source hashes against the original acquisition/export evidence, and reconciles both complete analytical tables. It does not retroactively claim to have run during the initial computation. The original samples and independent geometry recalculations remain the validation evidence.

Hosted exclusion/water acquisition checks source counts and data/schema edit dates before and after retrieval. Its 23 cached chunks reproduce the pinned complete artifact hashes. A source revision or checksum difference stops reuse; rerunning a verification does not replace the original retrieval date. The native LL84 supplement must match the original source's update timestamp, report year, row count and checked original/supplement hashes. Missing scope, conflicting source values, or changed revisions fail before replacing prior energy derivatives. Sorting BBLs makes repeated sharding deterministic. The enrichment script updates local derivatives only; the staged public-sync script is the sole copy path and verifies both product manifests before changes.

These rebuild checks and the live-app guard have different roles. The browser rejects a selected **OTI footprint** whose geometry fingerprint or native edit date differs from the pinned surroundings row. It does **not** poll DEP for a newer publication and invalidate a historical map product merely because the publisher changes its live service. The DEP archive date remains visibly pinned; live point queries and archived whole-outline surroundings may use different revisions and cannot be relabeled as the same live surface.

From the complete research workspace, verify reconstruction protection and the publication source artifacts with:

```sh
research/citywide/.venv/bin/python research/decision_patterns/test_rebuild_guards.py
research/citywide/.venv/bin/python research/decision_patterns/analysis_guard.py
research/citywide/.venv/bin/python research/decision_patterns/fetch_masks.py
python3 research/decision_patterns/audit_public_package.py
```

The package audit checks all shard hashes/counts, report links, public symlinks and accidental absolute local paths. The staged public-sync test also verifies an idempotent second run and proves that a deliberately missing energy-scope field leaves the destination unchanged. Source/archive code and raw research data are not silently bundled into the public Site. A clone of the app repository contains the browser products and public-sync script, but a complete raw-data rebuild additionally requires the separately retained research workspace. Final production build, Sites archive contents and deployed CDN transfers must still be checked for the final publication revision; an older archive is not evidence for these newer artifacts.

### Original citywide acquisition

Commands run from the workspace root:

```sh
python3 research/citywide/prepare_sources.py
python3 research/citywide/download_snapshots.py 64uk-42ks
python3 research/citywide/download_snapshots.py 5zhs-2jue
research/citywide/.venv/bin/python research/citywide/build_index.py
research/citywide/.venv/bin/python research/citywide/finalize_manifest.py
python3 research/citywide/validate_index.py
```

The two download commands may run concurrently. The index builder can ingest completed verified chunks while downloads continue. The spatial environment uses Shapely 2.2.0, PyProj 3.8.0 and NumPy 2.5.4. Acquisition uses Python's standard library and needs no API key. The existing HVI, Census 2020 and future-zone snapshots under `data/` are prerequisites with provenance retained.

Validation passed: source/local row counts, unique keys, RTree counts, join references, quality guard nulls, native flood null semantics, full-text address lookup and a bounded spatial query. All **45** independently acquired earlier parcel records match their archived address/area/zoning fields; all **45** earlier pure-Python HVI and future-point join results match the independent Shapely implementation. SQLite `quick_check` reports `ok`. The small test viewport returned 247 records through the RTree in approximately 0.08 ms on this machine; this is a local smoke check, not a performance guarantee.

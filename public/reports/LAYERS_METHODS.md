# A layer is a claim with a boundary

NYC supporting data: coverage, methods and limits · acquired 27 October 2026; audited 28 October 2026 UTC

Each source answers a different question. GEONOS preserves source dates, original spatial units and missing values instead of blending them into a universal risk score. Full source archives and precise geometries are stored locally; the web application serves selected display products and queries official services for site context.

## What “28 connected” means

The catalog has **32 product entries: 28 connected, three references and one partial acquisition**. “Connected” means that the product is available through an implemented application path. It does not mean 28 independent source datasets, universal geographic coverage, 28 property-level calculations, or that every public service responded successfully for a particular place. Hospitals are a subset of the health-facility source; the six zoning products share one archive; the three stormwater previews share another.

| Connected products | Count | Actual application path |
|---|---:|---|
| Footprints and PLUTO | 2 | Bounded official-source search, selected record and lot join; complete dated archives remain local |
| HVI, truck routes and historical coastal scenario | 3 | Live reference-point context; source failures remain unavailable |
| Infrastructure, district, zoning and stormwater map products | 18 | Selectable GeoJSON map layers; some are display-only previews, not site-analysis inputs |
| LL84 | 1 | Lazy BBL-linked reporting-property lookup with native reporting scope |
| NOAA daily and paired hourly observations, plus two NPCC4 products | 4 | Station/regional climate views and documented statistics; no building-specific forecasts |
| **Connected total** | **28** | **Products with different capabilities and spatial units** |

The full-resolution current/2050 surroundings calculation is attached to the two existing moderate-stormwater entries; it does not add two more source counts. The 2080 extreme scenario is a map preview, not a connected selected-site point or surroundings calculation. The three reference-only entries are 2017 land-cover raster, ERA5-Land and Landsat surface temperature. The NOAA hourly entry is now acquired: three airport stations, 2021–2025, at most one paired temperature/dew-point observation per UTC hour bin. It is a separate observation product, not property-specific temperature or cooling load. The limited-current 1.77 in/h archive is partial and unconnected to site analysis.

## Acquired layers

| Browser product | Coverage | Interpretation |
|---|---:|---|
| Subway stations | 496 records | Station centers, not entrances or walking times; complexes may contain multiple stations |
| Firehouses | 219 records | Facility locations, not response time, staffing or capacity; source update is 2022 |
| Health facilities | 2,128 valid-coordinate records from 2,141 | 17 native facility types; geocoded mailing addresses, not verified care availability |
| Hospitals and off-campus emergency facilities | 68 records | 67 Hospital and 1 Off-Campus Emergency Department records; no inference that every hospital has an emergency department |
| Parks properties | 2,061 records | Managed/acquired properties, not necessarily independent public parks or entrances |
| Evacuation zones | 8 multipolygon records | Emergency planning areas, not FEMA zones or flood probabilities |
| Air quality | 59 community districts | 2024 annual PM2.5 and NO₂; not indoor, parcel-level or real-time measurements |
| Historical canopy | 71 districts | 2010 land cover joined to Version 10C geography; not current shade or future vegetation |
| Zoning districts | 5,415 records | Acquired file version 202606; full zoning text and amendments still matter |
| Special districts / subdistricts | 95 / 336 | Separate statutory spatial layers |
| Commercial overlays | 9,623 records | Separate from base zoning districts |
| Limited-height districts | 14 records | Does not determine a permitted building height by itself |
| Zoning map amendments | 1,418 records | Project, status and effective dates remain source attributes |
| LL84 energy reports | 39,090 reports | 2024 reporting properties and portfolios; not all NYC buildings |
| Current moderate stormwater | 2 modeled categories | Current sea levels, 2.13 inches of rain in one hour |
| 2050 moderate stormwater | 3 modeled categories | Same rainfall, future sea levels; high tide is a separate category |
| 2080 extreme stormwater | 3 modeled categories | 3.66 inches in one hour and future sea levels; not a like-for-like rainfall change |

The source health catalog description understates the actual 17 facility types. Native type labels were preserved instead of forcing all records into hospitals. Records without valid coordinates remain in the source archive but not the point map.

## Display geometry is not analysis geometry

Point products retain native fields with common `id`, `label`, `source` and `source_id` fields. Display polygons are converted to EPSG:4326 with six decimal places. Parks use topology-preserving simplification at 5 m; most other overview products use 10 m.

Stormwater previews also omit small components: below 5,000 m² for moderate scenarios and 10,000 m² for the extreme scenario. **Do not test point exposure against those previews or treat an uncolored area as safe.** Corresponding full `.fgb` geometries are retained without simplification, along with the original EPSG:2263 geodatabase. Full Parks and evacuation GeoJSON products are also preserved locally.

Data acquisition, browser packaging and successful UI connection are separate states. A catalog entry marked as a reference does not mean its raster or model has been downloaded.

## LL84: reports are not individual footprint measurements

The acquired source year is **2024**, confirmed by the field label Calendar Year and `year_ending=2024-12-31`. There are 39,090 unique Portfolio Manager property IDs; 37,931 reports have interpretable BBLs and 38,691 have interpretable BINs. There are 863 reports with multiple BBLs. Numeric Site EUI is available in 30,577 reports. [Official LL84 source](https://data.cityofnewyork.us/d/5zyy-y8am).

Identifiers are format-checked. Eighteen invalid BBL tokens and 34 invalid BIN tokens were excluded from joins while preserving the originals. A valid identifier format does not verify the owner's reported mapping. The lookup indexes 26,736 valid-format BBLs into 45 files using the first three BBL digits; after adding native parent/child reporting scope, the largest file is **6,353,146 bytes (6.35 MB)**. There are 40,041 report references across the BBL index, distinct from the 39,090 unique source reports: multi-lot reports are referenced more than once rather than interpreted as new reports.

For BBL `1013380030`, read `energy/101.json` and then `payload.records["1013380030"]`. A BBL may return multiple reports, and one report may span multiple lots or buildings. Retain property ID, BBLs, BINs, building count, type, year and quality warnings. Do not sum reports blindly or divide a portfolio metric among footprints.

| Metric | Source unit and scope |
|---|---|
| Site EUI | Annual kBtu/ft² |
| Weather-normalized Site EUI | Weather-normalized annual kBtu/ft² |
| Total GHG | Annual location-based metric tons CO₂e |
| GHG intensity | Annual location-based kgCO₂e/ft² |
| ENERGY STAR score | Reported 1–100 score, null where unavailable |
| Floor area | Reported property ft²; may differ from PLUTO lot floor area |

Unparseable numeric values become null. Consumption does not establish spare electrical capacity, refrigeration feasibility, outage risk or regulatory compliance. Meaningful peer comparison requires compatible use, size, occupancy and operating conditions.

## Stormwater: preserve the event and the spatial test

The model treats buildings as **voids in its two-dimensional surface-water mesh**: water cannot flow or pond over those building cells. This is explicit in the [2021 Stormwater Resiliency Plan, printed page 20](https://www.nyc.gov/assets/orr/pdf/publications/stormwater-resiliency-plan.pdf#page=20). Therefore, a blank building interior is not a finding of no building risk. Positive overlap with a newer footprint can also reflect differing building/model vintages. Neither footprint-overlap percentage nor nearby mapped area becomes a risk score, flooded floor area, or indoor-depth estimate.

The application keeps three distinct products:

| Product | Geometry and version | Calculation and status |
|---|---|---|
| City map preview | Rounded/simplified display GeoJSON; small stormwater components omitted | Visual context only; no analytical membership or proximity test |
| Live reference-point query | Hosted ArcGIS layers, requested at lookup time | One interior building point, or the approximate PLUTO lot point; may differ from the downloadable revision |
| Pinned full-city surroundings | Original full-resolution current/2050 download, data update 2024-07-03; OTI footprint snapshot updated 2026-10-25 | Global outline-to-category minimum distance and mapped areas in external 0–5, 5–10 and 10–20 m bands; available only when outline fingerprint and edit date still match |

The surroundings snapshot `nyc-surroundings-20261028-v1` contains **1,082,964 records: 1,082,923 computed and 41 explicit unknowns**. It uses EPSG:2263 and the U.S. survey-foot conversion, preserving all source polygon components. Self-touching source flood rings are repaired with GEOS `make_valid` while retaining polygonal output; there is no simplification or small-area cutoff. Category union avoids double-counting within a category. The bands are geometric exterior neighborhoods, and can include courtyards, other structures or private land; they are not surveyed accessible ground.

Distances use the entire category geometry without a search cap. Bands use 32 buffer segments per quadrant (maximum circle approximation error about 6 mm at 20 m). Public areas are rounded to 0.1 m²; distance storage precision is 0.001 m and does not imply survey accuracy. Exclusion layers and water are recorded separately from ponding. **The masks come from the hosted 2050 scenario only; absence from those masks does not prove current or future model coverage.**

The pinned current download and hosted current service are demonstrably different official revisions. Full geometry recomputation found deep-category areas of 40,126,224.83 ft² in the download and 42,995,641.14 ft² in the hosted service. Hosted metadata records data editing on 2024-02-26 and schema editing on 2024-03-07; the download catalog records 2024-07-03. These timestamps and different geometries do not by themselves establish which modeling assumptions are newer. The products remain separately labeled. A comparison between the published current-sea-level and 2050 scenarios is not attributed solely to sea-level rise without establishing otherwise identical baseline modeling.

See the [surroundings manifest](/data/surroundings/manifest.json) for source archive/FGB checksums, mask service metadata, every shard checksum, counts and rounding rules; see the [full method](/data/surroundings/method.txt) for the implementation contract. The 129 lazy `.json.gz` assets occupy **73,727,636 stored bytes** and decode to the unchanged **192,532,821 JSON bytes**. The largest compressed/decoded shard is 643,063 / 1,694,262 bytes. Every decoded hash and record count matches the original manifest. The browser decompresses only the requested shard; metadata and method text remain uncompressed. No full archive is loaded into the JavaScript bundle or the application Worker. A separate 80-record, five-borough numerical recomputation passed within stored rounding; [audit results and limitations](/reports/surroundings_spatial_audit.json).

Current moderate point queries use the public service:

https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Moderate_Flood_Map_Current_Sea_Levels/FeatureServer/0

`Flooding_C=1` means modeled flooding at least 4 inches and less than 1 foot; `2` means at least 1 foot. These are categories, not exact site depths.

The 2050 moderate service is:

https://services.arcgis.com/at3rDjch5X7i9Bag/ArcGIS/rest/services/Moderate_Flood_SLR_2050/FeatureServer

| Layer | Meaning |
|---|---|
| 4 | Modeled deep flooding, ≥1 foot |
| 5 | Modeled nuisance flooding, ≥4 inches and <1 foot |
| 1 | Future high tide, a separate coastal category |
| 0 and 3 | Analysis exclusion areas |
| 2 | Wetlands and water bodies |

Queries use EPSG:4326 point intersections and retain source and retrieval time. A successful empty result means no intersection with that queried category at that point. It does not establish safety or complete model coverage. Failure, timeout and excluded coverage remain distinct unknown states. A building interior point is not a full-footprint test; PLUTO parcel coordinates are approximate and are not guaranteed to lie inside a parcel.

The source generally maps contiguous areas of at least 0.25 acres and depth of at least 4 inches, with small remnants possible after masking. Private drainage, blocked drains and future construction are not fully represented. Source maps are not a substitute for site design, insurance or property-specific risk assessment.

The moderate event is **2.13 inches in one hour (54.102 mm)**; the extreme is **3.66 inches in one hour (92.964 mm)**. This establishes the rainfall duration, not a constant hyetograph or full model run time. The 2050 stormwater high-tide assumption is **+30 inches**, distinct from the historical NPCC2013 coastal layer's **+31 inches**. [NYC 2021 plan, p.11](https://www.nyc.gov/assets/orr/pdf/publications/stormwater-resiliency-plan.pdf), [FY26 appendix A, p.3](https://www.nyc.gov/assets/omb/downloads/pdf/exec25/exec25-nyccbta.pdf), [NYS DEC 2025, p.3-34](https://dec.ny.gov/sites/default/files/2025-04/harlemriveruseattainanalysis.pdf).

The limited-rainfall 1.77 in/h archive was downloaded but its Esri CDF compression could not be decoded by the available open-source driver. It remains `archive_acquired_not_decoded`; another scenario is not substituted. Older individual Open Data links returned 403, so the acquired bundle and verified public services are used.

## What the evidence can change

| Decision | Useful context | Still requires confirmation |
|---|---|---|
| Cold-storage or warehouse screening | Lot/use attributes, truck-route context, modeled flood categories, comparable energy reports | Power, cooling, clear height, floor load, loading, actual availability and permission |
| Housing or reuse | Transit, parks, health facilities, district air quality, community heat vulnerability, flood planning | Indoor conditions, ventilation, noise, existing contamination, legal use and habitability |
| Retrofit screening | Same-year, comparable-use weather-normalized EUI and emissions | Audit, equipment, tariffs, schedules, tenant effects and capital cost |
| Future resilience | Separately labeled observation and scenario evidence | Floor and entry elevations, local drainage, design standards and asset-response models |

HVI describes community vulnerability and adaptation needs. It is excluded from property preference scoring for all use cases. It must not become a penalty for a neighborhood's residents or an inferred property value.

## Dates, sources and reproducibility

| Context product | Pinned meaning or source data revision | What a later metadata date does not mean |
|---|---|---|
| HVI | 2024 table, components 2016–2020; data updated 2024-09-19; Census 2020 ZCTA | April 2026 metadata edits are not new temperature observations |
| Truck routes | Open Data rows updated 2026-03-02 | DOT's September 2026 redesign is not independently verified as incorporated into these rows |
| Historical coastal 2050s | 2013 model, +31 inches, high 90th percentile, 2050–2059 | April 2026 metadata edits are not a new NPCC coastal forecast |
| DEP moderate surroundings | Download data updated 2024-07-03; retrieved 2026-10-27 | “Current sea levels” names a modeled scenario, not live water conditions |
| OTI outline | Source updated 2026-10-25; archived 2026-10-27 | Later selected records require exact outline/edit-date verification before reusing derived surroundings |

The route-distance feature is a bounded straight-line proximity calculation, not routing. It returns unknown when the query fails, reaches its 10,000-row limit, or cannot establish a reliable nearby route within 2,800 m. Publisher metadata independently checked **2026-10-28 01:21:46 UTC** reported a data update of **2026-03-02 19:36:22 UTC**, before the [DOT redesign announcement of 4 September 2026](https://home4.nyc.gov/html/dot/html/pr2026/nyc-dot-complete-mandated-truck-route-redesign.shtml). Context values retain those separate dates and mark the revision as last-verified metadata; a fresh spatial query does not recheck the publisher revision. The app has not reconciled that redesign or effective dates against every segment; review the [official truck-routing guidance](https://www.nyc.gov/html/dot/html/motorist/truckrouting.shtml), restrictions and actual approaches before any access decision.

File-based catalogs can have stale `rowsUpdatedAt` values. Zoning's catalog field remains in 2013 while the acquired file is **202606**; those dates must not be conflated. Air quality represents **2024 annual means** even if the catalog was updated in 2026. Canopy represents **2010** even if its upload date differs. Every live lookup should retain retrieval time.

The 2017 six-inch land-cover raster is approximately 1.33 GB compressed. Its official metadata and download reference were verified, but the raster was not acquired or connected. Pixel spacing alone does not establish accuracy or current conditions.

Primary sources: [MTA](https://data.ny.gov/d/39hk-dx4f), [FDNY](https://data.cityofnewyork.us/d/hc8x-tcnd), [NYS health facilities](https://health.data.ny.gov/d/vn5v-hh5r), [Parks](https://data.cityofnewyork.us/d/enfh-gkve), [evacuation zones](https://data.cityofnewyork.us/d/epne-qv9x), [air quality](https://data.cityofnewyork.us/d/c3uy-2p5r), [2010 canopy](https://data.cityofnewyork.us/d/hnxz-kkn5), [zoning](https://data.cityofnewyork.us/d/mm69-vrje), [stormwater](https://data.cityofnewyork.us/d/9i7c-xyvv).

The local workspace retains `data/layers-citywide/manifest.json`, browser catalog, source metadata, raw files and checksums. Acquisition is reproduced with `research/layers-citywide/acquire_layers.py`; browser preparation and validation use `prepare_browser_layers.py` and `validate_layers.py` with the documented geospatial environment. No new redistribution license is inferred when the publisher has not explicitly supplied one.

From the site repository, review and regenerate public products with:

```sh
python3 scripts/sync-public-data.py --dry-run
python3 scripts/test-sync-public-data.py --report /tmp/geonos-sync-audit.json
python3 scripts/sync-public-data.py
```

The default source root is the repository's parent workspace. `--destination /tmp/geonos-public` creates a review copy. Curated English catalog text, source-driven counts/vintages, reporting-scope fields and surroundings checksums are validated before any public replacement. Existing English reports and unrelated files are preserved. The script replaces only changed managed files and never deletes a public directory. A repeated sync on the audited sources produces zero changes. The [data audit](/reports/DATA_AUDIT.md) documents a fresh native-geometry test across all five boroughs and how to reproduce it.


Rebuild protection: the full-city surroundings export is tied to exact input hashes and calculation-source hashes. Changed source bytes, hosted mask versions or calculation code stop reuse. Native LL84 supplementation requires the original source revision and preserves its reporting year, parent IDs and unallocated totals; missing/conflicting inputs stop before replacing derivative files. Public sync checks per-shard checksums for both products and uses deterministic energy ordering. See the [data audit](/reports/DATA_AUDIT.md) for exact static-transfer estimates and the distinction between historical DEP provenance and live OTI stale-record rejection.

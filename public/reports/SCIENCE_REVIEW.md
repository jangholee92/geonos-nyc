# Evidence before confidence

Scientific foundations and limits of inference · reviewed 27 October 2026; independent numerical audit 28 October 2026 UTC

A useful site comparison should make its assumptions visible. GEONOS keeps observations, modeled scenarios, administrative records and user-specified conditions separate. A precise-looking map does not make a measurement building-specific. A complete source archive does not make every source fact current or complete in the real world.

## What the bibliography count means

The catalog contains **14 journal publications**, **23 supporting technical references** and **one event-rules reference**. These are a selected bibliography, not 14 independent validations of GEONOS, a systematic literature review, or 14 acquired datasets. “Journal publications” is more accurate than “primary studies”: the three NPCC4 papers are publisher-labeled technical reports, ERA5-Land and NEX-GDDP are data-description papers, and Maraun et al. is a perspective. Agency reports, dataset documentation, ASHRAE's handbook and event rules are counted separately. All 14 DOI/title/year identities were checked against Crossref registration on 28 October 2026; an automated publisher fetch rejection does not make an otherwise verified DOI invalid.

| Publication or documentation | What it supports here | Implementation boundary |
|---|---|---|
| [Menne et al. 2012](https://doi.org/10.1175/JTECH-D-11-00103.1), [Durre et al. 2010](https://doi.org/10.1175/2010JAMC2375.1), NOAA format documentation | Daily archive structure, source QA flags and interpretation | Four station files were acquired; the app rejects flagged values but does not reproduce NOAA's full QA pipeline or independently validate instruments |
| [Braneon et al. 2024](https://doi.org/10.1111/nyas.15116) | NPCC4 mean changes and the shipped hot-day/rain-day frequency tables | Official regional tables were acquired and normalized; no individual-building forecast |
| [Ortiz et al. 2024](https://doi.org/10.1111/nyas.15180) | Compound heat/humidity, tail risks and additional projection methods | Research context only for these additional variables; its new humid-heat table is not the shipped Braneon Table 4 hot-day series |
| [Yoon et al. 2024](https://doi.org/10.1111/nyas.15117), [ASHRAE 2017 design-weather chapter](https://handbook.ashrae.org/handbooks/f17/si/F17_Ch14/f17_ch14_si.aspx) | Regional energy context and outdoor design-weather methods | Neither is a refrigerated-warehouse load calculation, a current design standard, or evidence of a site's spare power/cooling capacity |
| [Hersbach et al. 2020](https://doi.org/10.1002/qj.3803), [Muñoz-Sabater et al. 2021](https://doi.org/10.5194/essd-13-4349-2021) | ERA5 / ERA5-Land methods and spatial support | Reanalysis arrays not acquired or used in site calculations |
| [Voogt & Oke 2003](https://doi.org/10.1016/S0034-4257(03)00079-8), USGS Collection 2 documentation | Surface/air-temperature distinction and product-specific scaling/QA | No LST raster or building extraction acquired; USGS documentation supplies the current scaling rule |
| [Stewart & Oke 2012](https://doi.org/10.1175/BAMS-D-11-00019.1) | Consistent urban-form and station-setting descriptions | No Local Climate Zone map or local air-temperature model fitted |
| [Ortiz et al. 2018](https://doi.org/10.1175/JAMC-D-17-0125.1), [Ortiz et al. 2019](https://doi.org/10.1002/joc.6102) | NYC heatwave processes and an urban downscaling example | Simulations not rerun; published local grid outputs not acquired or assigned to buildings |
| [Thrasher et al. 2022](https://doi.org/10.1038/s41597-022-01393-4), [Maraun et al. 2017](https://doi.org/10.1038/nclimate3418) | Statistical downscaling and process-aware limitations | NEX-GDDP arrays not acquired; no bias-correction model fitted |
| [Madrigano et al. 2015](https://doi.org/10.1289/ehp.1408178), NYC's 2024 HVI documentation | Heat-related resident health vulnerability | The observed case-only study is not the exact 2024 HVI algorithm or a cold-storage suitability model |

The physical evidence can support several user questions on one shared data foundation. It does not support every requested quantity. Search and comparison are implemented; market availability, rent, full legal permission, travel time, confirmed power, indoor cooling loads and building-specific losses remain unestablished. Reference-only literature must not be presented as an acquired high-resolution temperature or energy layer.

## What the climate package contains

| Evidence | Acquired and processed | Spatial support | Time represented |
|---|---|---|---|
| NOAA GHCN-Daily | Daily TMAX, TMIN and precipitation; annual and monthly statistics | Central Park, JFK, LaGuardia and Newark station points | 1991–2025 observations |
| NPCC4 mean climate | Official annual and monthly temperature and precipitation tables | NYC regional climate | 2024 assessment; 1981–2010 baseline |
| NPCC4 extremes | Published hot-day, cold-day, heatwave and rain-day frequencies | Regional model ensemble | 2030s, 2050s, 2080s |
| Scientific methods | Primary papers and official documentation | Interpretation and extension design | Publication-specific |

The package contains 51,136 station-days, 140 station-years and 1,680 station-months. All three selected daily elements have 100% coverage after rejecting missing values and failed quality flags. This statement applies only to these stations, elements and years. It does not establish error-free instruments or remove the effects of station siting.

Acquisition date is not observation date. The source files retrieved on 27 October 2026 include valid records through 24 October 2026, but the analytical products stop at **31 December 2025**. The preserved NOAA archive version is **3.35-upd-2026102517**. NPCC catalog revisions describe publication updates, not observations in a future year. [NOAA format and flags](https://www.ncei.noaa.gov/pub/data/ghcn/daily/readme.txt), [archive version](https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-version.txt), [official NPCC datasets](https://climateassessment.nyc/npcc-datasets/).

## Observed climate: a comparison, not an attribution claim

Each period statistic equally weights its annual aggregates. Daily mean temperature is calculated as `(TMAX + TMIN) / 2`; it is not the mean of 24 hourly observations. These reproducible, unadjusted baseline statistics are distinct from NOAA's separately processed official Climate Normals.

| Station | Mean temperature °C, 1991–2020 → 2021–2025 | Difference °C | ≥90°F days/year | Daily minimum >20°C days/year | Annual precipitation mm |
|---|---:|---:|---:|---:|---:|
| Central Park | 13.18 → 13.91 | +0.73 | 17.37 → 17.80 | 46.90 → 55.40 | 1,258.17 → 1,276.94 |
| JFK | 12.72 → 13.46 | +0.74 | 10.83 → 11.00 | 42.07 → 49.00 | 1,099.28 → 1,052.46 |
| LaGuardia | 13.62 → 14.33 | +0.71 | 21.77 → 23.60 | 61.53 → 65.20 | 1,149.83 → 1,194.52 |
| Newark | 13.26 → 14.37 | +1.11 | 28.30 → 38.20 | 47.23 → 56.60 | 1,183.58 → 1,152.38 |

These values were calculated directly from the preserved source. The recent period contains five years; it is not a new 30-year normal. Differences do not establish a statistically significant trend or the contribution of a particular cause. Precipitation changes differ among stations, and a few extreme storms can strongly influence a short comparison period.

Newark is an external New Jersey reference, not a NYC station or a rural urban-heat-island control. Airport, park, coastal and inland settings differ. A difference between two stations is not automatically a measure of urban heat-island intensity.

## Definitions and quality rules

GHCN-Daily stores temperature in tenths of a degree Celsius and precipitation in tenths of a millimeter. The pipeline rejects `-9999` and every nonblank quality flag, retains measurement/source flag counts, and treats reported trace precipitation as zero in totals. No missing values are imputed or prorated.

Temperature means require at least 95% daily coverage. Counts, totals, extrema and degree-day sums require 100%; otherwise they are null. This is the product's explicit completeness policy, not a claim to reproduce NOAA's official normal-calculation method. GHCN-Daily automated QA does not homogenize every non-climatic station discontinuity. [Menne et al., 2012](https://doi.org/10.1175/JTECH-D-11-00103.1), [Durre et al., 2010](https://doi.org/10.1175/2010JAMC2375.1), [NOAA normal methodology](https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/doc/Normals_Calculation_Methodology_2020.pdf).

| Metric | Definition | What it does not measure |
|---|---|---|
| Mean temperature | Mean of daily `(TMAX+TMIN)/2`, °C | Indoor temperature or a 24-hour instrument mean |
| Hot days | TMAX ≥32.2°C, archive-precision equivalent of 90°F | Every building's hot-day exposure |
| Warm nights, TR | Daily TMIN >20°C | A sunset-to-sunrise observation or the Korean ≥25°C overnight definition |
| Precipitation | Daily water-equivalent precipitation, mm | Runoff, hourly intensity or rain only; melted snow may contribute |
| Rx1day | Maximum reported daily precipitation in the period | Rolling 24-hour maximum or one-hour rainfall |
| R10 / R20 | Days with precipitation ≥10 / ≥20 mm | Flood occurrence or depth |
| Cooling degree days | Σmax(Tmean−18, 0), °C·days | kWh, peak power or equipment capacity |
| Heating degree days | Σmax(18−Tmean, 0), °C·days | Heating cost or system efficiency |

90°F is exactly 32.222…°C, but a 90°F observation is encoded as 32.2°C in a one-decimal archive. Comparing against exact 32.222 would wrongly exclude boundary observations. The analogous 75°F threshold is 23.9°C. TR uses a strict `>20°C`; R10 and R20 use inclusive thresholds. [Climpact definitions](https://climpact-sci.org/indices/).

**Time aggregation matters.** Annual summary precipitation is the mean of annual totals. A January climatology value is the mean of January totals, not annual rainfall. Monthly Rx1day climatology is the mean of each year's January maximum, not the largest January event across 30 years. Monthly day counts are days per calendar month, and monthly degree days are monthly sums averaged across years. The annual table and monthly table must use different labels where appropriate. “CDD” can also mean consecutive dry days in other climate literature; GEONOS spells out cooling degree days. The chosen 18°C base equals 64.4°F, not the common US 65°F (18.3°C) base. Degree-day totals with different bases or temperature units cannot be compared directly. An 18°C threshold is an explicit climate-index choice, not a measured balance-point temperature for a particular building or a refrigeration setpoint. [NWS degree-day method](https://www.weather.gov/key/climate_heat_cool).

## NPCC4: regional futures with the original baseline intact

NPCC4 uses **1981–2010**, while the separate station comparison uses **1991–2020**. The published changes must not simply be added to that different station baseline. GEONOS presents regional changes directly.

Mean projections combine 35 CMIP6 models and two pathways, SSP2-4.5 and SSP5-8.5, with equal weighting. Extreme frequencies use a separate 16-model, two-pathway calculation and quantile mapping. The pooled 25th–75th percentile range is model/scenario spread, not a calibrated probability or a confidence interval for a building. [Braneon et al., 2024, Tables 3–4](https://doi.org/10.1111/nyas.15116).

| Horizon | Mean annual warming, pooled 25th–75th percentile | Annual precipitation change | ≥90°F days/year |
|---|---:|---:|---:|
| 2030s | +1.50–2.17°C | +2–7% | 27–46 |
| 2050s | +2.22–3.33°C | +4–11% | 38–62 |
| 2080s | +3.11–5.44°C | +7–17% | 46–85 |

Temperature differences convert from °F by multiplying by 5/9; no −32 offset applies to a difference. Decade labels describe climate time windows, not forecasts for individual years. The 2100 entry follows a separate end-century method. The official hot-day baseline is 17 days/year. [Official mean projections](https://data.cityofnewyork.us/resource/hmdk-eidg.json), [official extreme projections](https://data.cityofnewyork.us/resource/38ps-fnsg.json).

Scenario-specific ensemble means are a different statistic. For the 2050s, temperature changes are +2.389°C under SSP2-4.5 and +3.222°C under SSP5-8.5. Do not combine those means with pooled percentile endpoints to manufacture a new interval. Mean and extreme tables were checked against the published PDF tables.

A regional change applied equally to every candidate cannot, by itself, justify a new ordering of buildings. Site-specific ranking changes need separate spatial or asset-response evidence. Annual rainfall percentage change cannot be multiplied into hourly rainfall, flood depth or expected loss. Compound heat also depends on humidity, local form and event conditions. [Ortiz et al., 2024](https://doi.org/10.1111/nyas.15180).

## Urban heat: distinguish the physical quantities

Local air temperature reflects synoptic weather, shade, sky view, heat storage, evapotranspiration, urban geometry, ventilation, coastal breezes and anthropogenic heat. Day and night differ. A specific NYC heatwave modeling result is not a universal temperature offset for every building. [Ortiz et al., 2018](https://doi.org/10.1175/JAMC-D-17-0125.1). Local Climate Zones offer a consistent way to describe urban form and station exposure rather than treating an arbitrary airport–park pair as an urban–rural experiment. [Stewart & Oke, 2012](https://doi.org/10.1175/BAMS-D-11-00019.1).

**Nearest station.** Haversine distance selects a reference station and preserves its name, distance, period and setting. It does not interpolate temperature or turn an airport observation into a building measurement. Four stations cannot resolve every neighborhood, especially distant parts of Staten Island and Brooklyn.

**Satellite surface temperature.** LST is radiometric surface temperature, with a different physical meaning and footprint from shaded near-surface air temperature. Roofs, roads, tree canopies, view direction and acquisition time matter. One hot-day image cannot establish annual cooling consumption. [Voogt & Oke, 2003](https://doi.org/10.1016/S0034-4257(03)00079-8).

Landsat Collection 2 surface temperature converts as `K = DN × 0.00341802 + 149`, then subtracts 273.15 for °C. Cloud, shadow and emissivity QA are required. Landsat 8/9 thermal information acquired at 100 m and delivered at 30 m is not independent 30 m thermal detail. ASTER emissivity gaps and historical land-cover assumptions can introduce persistent gaps or artifacts. [USGS product](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature), [known issues](https://www.usgs.gov/landsat-missions/landsat-collection-2-known-issues).

**HVI.** NYC's index describes relative resident vulnerability to heat-related mortality, combining environmental and social factors. It is not °C, cooling demand or warehouse suitability. Its documented surface-temperature input includes ECOSTRESS imagery; it should not automatically be called Landsat. HVI remains separate community context for every use case; it is not a warehouse-suitability measure or overall score. [NYC heat report](https://a816-dohbesp.nyc.gov/IndicatorPublic/data-features/heat-report-archive/2024/), [official dataset catalog](https://catalog.data.gov/dataset/heat-vulnerability-index-rankings), [Madrigano et al., 2015](https://doi.org/10.1289/ehp.1408178).

## Acquired hourly observations and their limits

The supplemental [NOAA GHCNh product](https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly) now supplies paired outdoor dry-bulb temperature and dew point for JFK, LaGuardia and Newark, **2021–2025 UTC**. The same observation row supplies both readings. Central Park is not included. Fifteen raw station/year files contain 190,666 records; the conservative project filter retains **130,951 samples in 131,472 expected station-hour bins (99.604%)**. The 180,459,281 raw source bytes stay outside the web bundle; the compact summaries retain per-file URLs, hashes and retrieval timestamps. Coverage is not 100%, and a retained sample represents one observed moment, not continuous conditions throughout an hour.

The [current documentation, v1.1.0 of March 10, 2026](https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh_DOCUMENTATION.pdf) and [official source-code list](https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh-source-list.pdf) support the field, report-type and quality-code interpretation. The project accepts explicitly good documented QC only: source 223/code 1 and source 343/code 1 or 5. Both fields must have routine FM15 report type; the nearest eligible sample to minute :51 is selected once per UTC hour, with an earlier-time tie break. Blank/unclassified and undocumented source codes remain excluded, without declaring their measurements wrong. No special-report substitution, interpolation or cross-timestamp pairing fills gaps. Station identity and coordinates are verified against the [official inventory](https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh-station-list.txt).

The requested legacy ISD/Global Hourly service stopped updating after August 24, 2025. All five acquired years consistently use the successor, avoiding a silently truncated final year. [NOAA service notice](https://www.nesdis.noaa.gov/news/service-location-change-integrated-surface-data-global-hourly).

Temperature and moisture peaks need not coincide. JFK's earliest tied highest selected temperature in 2025 was 38.9°C with 21.7°C dew point at June 24, 16:51 UTC; its earliest tied highest dew point was 25.6°C with 31.1°C dry bulb at June 23, 11:51 UTC. Peak ties and exact companion readings remain explicit. These observations support a better question about actual equipment and conditions; they do not calculate latent cooling load, equipment size, available power, operating cost or site suitability.

This is a five-year filtered sample, not an official 30-year climate normal or design-weather series. UTC calendar dates differ from New York local dates. Exploratory runs of at least three consecutive sampled hour bins at ≥30°C are not continuous exposure duration or an official heat-wave definition. No wind, heat index, wet-bulb, WBGT or future hourly sequence is derived. Heat index and WBGT require their own measurement/interpretation conditions. [NWS heat index](https://www.weather.gov/safety/heat-index), [equation limits](https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml).

## Reanalysis and downscaling: researched extensions

ERA5 is an atmospheric reanalysis at approximately 31 km. ERA5-Land is an approximately 9 km land replay forced by ERA5, delivered by CDS on a 0.1° grid; it does not add building observations. A coordinate-based point request selects grid data rather than a sensor at that coordinate. [Hersbach et al., 2020](https://doi.org/10.1002/qj.3803), [Muñoz-Sabater et al., 2021](https://doi.org/10.5194/essd-13-4349-2021), [CDS dataset](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land?tab=overview).

NASA NEX-GDDP-CMIP6 provides daily statistical downscaling at 0.25°. Assigning one of its grid values to a building polygon is a spatial join, not additional physical resolution. NYC research has also used 1 km urban dynamical modeling and bias correction, but this still does not directly predict individual interiors. Bias correction cannot automatically restore missing physical processes or guarantee that historical relationships persist. [Thrasher et al., 2022](https://doi.org/10.1038/s41597-022-01393-4), [Ortiz et al., 2019](https://doi.org/10.1002/joc.6102), [Maraun et al., 2017](https://doi.org/10.1038/nclimate3418), [IPCC AR6 Chapter 10](https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-10/).

ERA5/ERA5-Land, satellite LST, NEX-GDDP-CMIP6 arrays, Local Climate Zone maps and the cited 1 km urban-model outputs were researched, not acquired or fitted in this package. No accuracy claim is made for an unimplemented local temperature model. The historical 2017 land-cover raster is likewise a verified reference, not an acquired analysis input; its fine pixel spacing cannot substitute for physical temperature evidence.

## Rainfall scenarios and asset decisions

The moderate stormwater scenario uses **2.13 inches in one hour = 54.102 mm in one hour**. The extreme scenario uses **3.66 inches in one hour = 92.964 mm in one hour**. This establishes the rainfall duration, not a constant within-hour hyetograph or the full hydraulic simulation duration. [NYC 2021 plan, p.11](https://www.nyc.gov/assets/orr/pdf/publications/stormwater-resiliency-plan.pdf), [FY2026 appendix A, p.3](https://www.nyc.gov/assets/omb/downloads/pdf/exec25/exec25-nyccbta.pdf), [NYS DEC 2025 report, p.3-34](https://dec.ny.gov/sites/default/files/2025-04/harlemriveruseattainanalysis.pdf).

Preserve each layer's assumptions. The 2050 stormwater map uses +30 inches; the separate historical NPCC2013 coastal layer uses +31 inches. Nuisance flooding is modeled ≥4 inches and <1 foot; deep flooding is ≥1 foot. Future high tide is a separate coastal category. The DEP hydraulic model represents buildings as voids in its two-dimensional ground-flow mesh. A blank interior sample can therefore reflect model design; a map/outline overlap can reflect differences in geometry or source vintage. Inspect modeled surrounding ground and verify real entrances and equipment elevations, without calling a footprint intersection flooded indoor area. [DEP model description, p.20](https://www.nyc.gov/assets/orr/pdf/publications/stormwater-resiliency-plan.pdf). Point membership is not footprint coverage or indoor depth. A simplified display map must not be used to conclude that an uncolored site is safe.

| Decision question | Available evidence | Still needed for a quantitative conclusion |
|---|---|---|
| Which logistics candidates deserve inspection? | Explicit footprint/parcel and route-context comparison | Available space, loading access, truck restrictions, permission, utility and lease conditions |
| Which locations experience more heat? | Reference-station climate and separate community context | Validated local air observations; consistent-date surface/form/vegetation evidence |
| What is the cooling bill? | Degree days as climate context | Setpoint, insulation, volume, infiltration, product load, efficiency, schedules and tariffs |
| Will a building flood? | Model categories and stated spatial tests | Detailed terrain, drainage, floor/entry elevations, basements and site assessment |
| What is the payback? | A list of needed assumptions | Validated energy/loss response, capital and operating costs, discount and price assumptions |

## What would change the conclusion?

A defensible interface preserves evidence type, spatial support, observation or scenario period, units, method, source and unknowns. It distinguishes observation error, representativeness, model structure, scenario spread, natural variability and missing asset inputs. These are not one interchangeable confidence percentage.

Condition sensitivity asks whether a candidate still meets the user’s explicit thresholds when a requirement changes. It is not event probability. A useful reversal test identifies the assumption or missing fact that could alter the choice. If a new model is added, evaluate it against independent spatial and temporal holdouts, including extreme and nighttime performance. Randomly splitting adjacent observations can overstate skill.

Completed checks include calendar and leap-day coverage, independent daily-to-annual reconstruction, monthly-to-annual totals, threshold boundaries, published-table reproduction and unit conversion. They establish internal consistency, not independent instrument validation. No building-energy model, parcel temperature model or calibrated financial-loss model is included.


## Independent climate audit: 28 October 2026 UTC

The audit reconciled the shipped browser assets against the preserved native files, without importing the production aggregation functions. It passed **192,336 value comparisons**: all 51,136 daily station records; 140 annual and 1,680 monthly aggregates; period and calendar-month means and valid-year counts; 91 annual/monthly/seasonal NPCC mean rows; and 12 extreme-event rows. Native-file SHA256 values matched, source month/element rows were unique, and temperature minima did not exceed their paired maxima. No scientific values required correction. These are consistency checks against a preserved source snapshot, not independent instrument validation.

Reproduce the raw-source audit from the parent workspace with `python3 research/climate/audit_climate_evidence.py`; its machine-readable result is `research/climate/validation_report.json`. The app repository's `tests/climate-evidence.test.ts` independently checks the shipped CSV/JSON calendar, all annual/monthly temperatures and precipitation statistics, threshold counts, degree-day base identity, monthly aggregation and the published NPCC baseline/table conversions. These four offline tests pass. No live weather or model API is required.

The review checked the actual Climate Studio display as well as the numbers. The observed chart is a 1991–2025 station history; five recent years are labeled as a comparison period. The future chart keeps the 1981–2010 NPCC baseline, distinguishes scenario means from pooled percentile spread, and does not interpolate extreme frequencies into unpublished horizons. Degree-day labels now state the 18°C base explicitly. The extreme precipitation label describes precipitation, and the interface no longer substitutes a hardcoded baseline if a source baseline is absent. [NOAA archive specification](https://www.ncei.noaa.gov/pub/data/ghcn/daily/readme.txt), [Climpact indices](https://climpact-sci.org/indices/), [NPCC4 primary report and Appendix C](https://ntrs.nasa.gov/api/citations/20240008607/downloads/VGornitzANYASNPCC4Reprint.pdf).

The NPCC extreme-series method also has a relevant limitation: quantile mapping retains the historical ordering of weather while changing values. This can miss changes in event sequencing or long-duration heat not represented in the baseline record. The reported mean heatwave duration is not a maximum design duration. Pooled percentile ranges are not a property's probability of failure. Appendix C.2 discusses these limitations; the product does not replace them with a numerical confidence score.

## One useful property question from the climate evidence

**Can this place maintain the indoor conditions your activity needs through a sustained hot spell?** This is a due-diligence question, not a new climate-based property ranking. It applies to people, ordinary workspaces, equipment and temperature-sensitive goods; the required conditions depend on the actual activity.

The reason to ask is regional: the published NPCC4 2050s middle range has 38–62 days per year with maximum temperature at least 90°F, compared with its published NYC 1981–2010 reference of 17. This is Table 4’s reference, not the selected station’s 1991–2020 derived baseline. Table 2 separately states that its mean-temperature/precipitation baseline uses Central Park observations. That evidence strengthens the case for checking an asset's thermal performance over its intended service life. It does not distinguish two nearby buildings, supply a design temperature, establish an outage probability, or calculate a bill. Keep the regional numbers beside the question rather than painting different future temperatures onto individual buildings.

A useful next step is to request the documented indoor temperature/humidity requirement, the existing system's design outdoor conditions and demonstrated capacity under those conditions, and a building-specific assessment of envelope, infiltration, ventilation, occupancy or product loads and equipment performance. A utility/service-capacity confirmation answers a different question from a system's cooling capacity. Annual LL84 energy intensity answers neither. Building loads need suitable coincident temperature/humidity and asset inputs; multiplying regional warming or degree days by area does not provide those inputs. [ASHRAE climatic design methods](https://handbook.ashrae.org/handbooks/f17/si/F17_Ch14/f17_ch14_si.aspx), [NPCC4 energy chapter](https://doi.org/10.1111/nyas.15117).

If evidence demonstrates that the intended conditions can be maintained, the corresponding operational requirement can become supported at its stated scope and date. If it cannot, the user can consider a different property, system upgrade or revised operating requirement. If there is no such evidence, the candidate remains conditional. This is the product connection worth making: regional climate changes the question to investigate; verified asset evidence changes the candidate's status.


The hourly supplement has 11 policy/real-data tests and an independent raw-source check of all 30 annual temperature/dew-point maxima, all tied peaks and the 15 annual maxima-intersection counts. Within these retained samples, none of the 15 station-years has an observation that simultaneously attains both annual maxima. This describes the filtered sample, not an impossibility in weather. Reproduce with `python3 -m unittest discover -s research/climate/hourly -p 'test_hourly_context.py' -v` and `python3 research/climate/hourly/audit_raw_peaks.py` from the full workspace. The app source-sync validates the exact compact asset hash, three verified stations, fifteen station-years and declared coverage before publication.

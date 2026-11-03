# GEONOS — NYC building evidence, in one workspace

Explore New York City buildings, select two to compare, and plan the next step toward a climate-resilient retrofit. GEONOS connects official building and tax-lot records, climate context, dated aerial imagery and seven Meta model roles across the hosted workflow and an optional local inspection-review mode. Follow the evidence to the owner document, equipment check or site inspection that could change your choice.

This is a sanitized public source snapshot of the hackathon application, based on the demonstrated v15 application (`fd667567f782f37df64358d4c90554ee99a35c84`) with subsequent source hardening and the optional local Glimmer extension. The current source includes the standalone Cloudflare Worker, persistent public-demo quotas and the solid 3D building-display correction. It excludes deployment identity, credentials, private working history and local provider captures. See [Hackathon build scope](HACKATHON_BUILD_SCOPE.md) for what was built and which foundations pre-existed.

## Open GEONOS

[Open the live application](https://geonos-nyc.ljh920821.workers.dev/). Explore the map, public building records and capped AI demo without signing in. The optional local Glimmer review is available through the local setup below.

## Recorded demo

Watch the [public recorded demo](https://jangholee.com/geonos-nyc/) — seven-role overview updated on 3 November 2026, with the retained full walkthrough. The page contains a 2:55 overview and an 8:30 full walkthrough, with English captions and transcripts. You can also open [docs/index.html](docs/index.html) locally.

The videos show edited actual product states with synthetic English narration. 1080p delivery combines a recorded 3D opening, fresh full-page captures and archival product shots. Native source dimensions are retained in the production record. The Muse Image sequence uses an earlier illustrated inspection example for 572 Smith Street and 611 Court Street, dated 30 October 2026. Watch directly in your browser, with captions and transcripts. See [JUDGE_GUIDE.md](JUDGE_GUIDE.md) for hands-on exercises and application access.

## What it does

- Shows the complete valid footprint snapshot across five boroughs, independent of a search result page. Click a building for its full official record; select a second for automatic A/B comparison.
- Identifies the scope of each measurement: building footprint, tax-lot floor area, community context or energy-report boundary. Open questions become explicit owner-document and inspection requests.
- Connects evidence to the next owner document or site inspection that could change a comparison.
- Offers dated roof/tree masks, a paired aerial review and an optional local 2020/2024 visual-feature comparison inside chat.
- Turns voice recordings and analysis-menu choices into editable drafts, with the user choosing when to send.
- In local mode, reviews two refreshed building records with an inspection note and returns source-linked next actions and a conditional follow-up.

## Run locally

Use **Node.js 24.12 or later** with npm. The recorded development environment used Node 25.9.0. Native `.ts` tests need Node's type-stripping support.

```sh
npm run install:ci
npm run dev -- --host 127.0.0.1
```

Open the printed localhost URL. The map, public-data tools and deterministic evidence checks run independently of the Meta API. Live source lookups require network access. Keep the preview bound to loopback.

The local map and deterministic tools are available immediately. For the optional Glimmer mode, follow the pinned setup below; its loopback sign-in is separate from the deployed public-demo actor.

To deploy your own public AI demo, use an approved Meta account and configure server-side Cloudflare secrets `MODEL_API_KEY`, `META_API_APPROVED=true`, a random `DEMO_IP_SALT` of at least 32 characters, and a deliberate `META_DEMO_BUDGET_USD` spending allowance. The generated Worker configuration binds the `DemoBudget` Durable Object and enables `GEONOS_PUBLIC_DEMO`. A missing spending allowance blocks paid calls. Do not commit secret values or enable `TRUST_SITES_PROXY_IDENTITY` on a generic host. A localhost sign-in alone does not create the Cloudflare-edge actor used by the public chat/voice routes.

```sh
node --test tests/*.test.ts tests/*.test.mjs scripts/build-citywide-tiles.test.mjs
npx tsc --noEmit
npm run build
```

The default test suite uses local fixtures/mocks; two public-source integration checks are opt-in with `CITY_LIVE_TESTS=1`. `npm start` serves a built Worker locally. Use the development command above for the optional local Glimmer workflow.

## Public-demo access and hosting boundary

Use [Standalone deployment](STANDALONE_DEPLOYMENT.md) for the Worker setup, required server-side secrets, persistent quota storage and deployment checks.

The current Worker uses an anonymous, request-scoped quota actor derived from Cloudflare edge metadata. Browser-supplied identity headers are stripped; they do not establish an authenticated person. Paid chat and transcription requests require a same-origin request, server-side approval and credentials, and a successful reservation from one persistent `DemoBudget` Durable Object.

Default allowances are 60 chat and 20 voice interactions per UTC day, with lifetime limits of 300 chat and 100 voice interactions. Per-IP daily limits are 20 chat and 6 voice interactions, with a shared burst limit of three per minute and two active investigations globally. Accepted attempts consume an allowance even if downstream work fails. These limits count interactions, not dollars; a chat may use more than one model. Public map and record tools remain available independently.

A separate persistent spending ledger reserves a conservative maximum cost before **every paid Meta call**, including later conversation rounds and parallel analyses. Validated text-token usage can reduce that reservation; uncertain charges keep their full reservation. Missing accounting or insufficient allowance stops the paid call and disables the composer. Concurrent requests share the same ledger, which survives redeployment. This is an operator-configured application budget based on a verified starting credit balance, rather than live Meta account-balance synchronization. Keep other clients outside this accounting boundary from spending the same credits. See [Standalone deployment](STANDALONE_DEPLOYMENT.md) for configuration and verification.

The previous Sites deployment used ChatGPT sign-in. Its retained authentication helper rejects production identity headers unless explicitly configured for a trusted Sites edge. The local mock is limited to loopback and is used by the optional Glimmer workflow. Neither is the current public-demo quota actor. The neutral `.openai/hosting.json` retains the build adapter without private project identity. Publishing this source supplies neither provider credentials nor another deployment's quota storage.

## Seven model roles

| Model | Role | Evidence and output |
|---|---|---|
| `muse-spark-1.3` | Conversation and bounded official-source tools | Source-linked explanations and follow-up questions |
| `sam-3.1` | Roof/tree masks on official Spring 2024 aerial crops | Image detections displayed alongside original imagery and mapped outlines |
| `muse-wonder-1.0` | Second review of a public-data brief or paired SAM summary | Structured summaries and records become targeted survey questions |
| `muse-image-1.0` | Inspection concept derived from written checks | Labelled illustration of what to verify and what could change the comparison |
| `muse-voice-transcribe-1.0` | Recording to an editable draft | Review, edit, add to the message and send |
| Meta DINOv2 `dinov2_vits14_reg` | Optional local comparison of 2020/2024 image features | Highlighted windows guide closer inspection of dated photographs |
| Muse Glimmer 30B, official Q4_K_M open weights | Optional local inspection-note review | Two source-linked action cards and a conditional next check for the selected buildings |

Five roles use the server-side Meta API. DINOv2 uses open weights in a cancellable browser Worker, independently of API credentials. Its first use downloads approximately **33.1 MB** of compressed model and runtime assets. The [manifest](public/models/dinov2/manifest.json) records sizes, hashes, conversion and runtime checks. The historical image pair uses matched geographic crop bounds.

Glimmer runs in an authenticated, loopback-only llama.cpp server on the same computer as the local app. Its note and model request stay local; official building-record refreshes still contact NYC’s public service. The tested setup uses an Apple M2 Ultra with 128 GiB unified memory and the official 16.76 GB text checkpoint. Weights and credentials are downloaded or generated outside the repository. Follow the pinned [Glimmer setup and verification guide](scripts/glimmer/README.md). The hosted app uses five Meta API roles plus browser DINOv2. The optional local app adds Glimmer; both execution modes appear in the seven-role videos.

Voice uploads support up to 60 seconds and 10 MiB, canonicalized to mono PCM16 WAV and sent once to the fixed provider endpoint with cancellation and deadline controls. The application server processes audio in memory. Provider handling follows the account’s applicable Meta terms. English and Korean language hints are available; the recorded transcription exercise uses synthetic English.

Official documentation: [Meta models](https://dev.meta.ai/docs/models), [tool calling](https://dev.meta.ai/docs/tool-calling), [SAM segmentation](https://dev.meta.ai/docs/media-segmentation), [image generation](https://dev.meta.ai/docs/image-generation), [voice transcription](https://dev.meta.ai/docs/speech-to-text), [DINOv2](https://github.com/facebookresearch/dinov2), [Muse Glimmer](https://dev.meta.ai/docs/muse-glimmer).

## Data and reproducibility

The shipped source snapshots contain **1,082,964 footprint records**, with **1,082,923 valid display outlines**, and source joins to **858,284 PLUTO tax lots**. Static map tiles, compressed surroundings shards, climate summaries and energy shards are included. The full research SQLite and raw acquisition archives are not included or served by the app. Source revision is distinct from the date of a live selected-record lookup.

- [Data audit](public/reports/DATA_AUDIT.md)
- [Spatial layers and energy methods](public/reports/LAYERS_METHODS.md)
- [Scientific review](public/reports/SCIENCE_REVIEW.md)
- [Source catalog](public/data/catalog.json)
- [Evidence Atlas](public/reports/GEONOS-Evidence-Atlas.pdf)

Normal startup uses the bundled products; it does not rerun data acquisition or model conversion. Rebuilding tiles requires the audited source SQLite and a Python/Shapely environment via `scripts/build-citywide-tiles.mjs --source ... --python ...`. Full data synchronization requires a separately acquired source root. DINO conversion requires the official checkpoint/source and Python ML dependencies; `scripts/dino/export_dinov2.py` documents its inputs. Rebuild the same-origin worker with `node scripts/dino/build-worker.mjs` after changing its implementation or model manifest. The lockfile covers the web application, not these separate research environments.

## Verification

The standalone Cloudflare service was checked in an anonymous browser on **3 November 2026**. The live question “Compare these two buildings for climate resilience. What should I verify next?” produced a Muse Spark response for 572 and 592 Smith Street, with building facts, climate context and entrance/equipment checks. A further full-outline question returned the mapped 2050 deep-water contact at 572 Smith, the roughly 47-metre separation at 592 Smith, and entrance, loading and equipment checks. These verify the tested source-linked flows on the new public service; earlier model-specific executions are recorded below.

The recorded v15 application suite had **529 checks: 527 passed, two opt-in checks skipped, zero failures**, followed by focused protocol, transport and authentication checks. Actual provider and browser verification covered editable synthetic-English transcription, paired SAM/Wonder analysis for 572 and 592 Smith Street, and local/browser DINOv2 inference on the official 2020/2024 pair. This public export adds authentication hardening, with separate validation recorded in [PUBLIC_EXPORT.md](PUBLIC_EXPORT.md).

The Glimmer extension completed a separate actual browser review in **35 seconds** for fresh 572/592 Smith records, displaying two inspection cards and a conditional check using the authored 20,000-square-foot requirement. A 39.82-second direct local response also passed the current exact-quote, building-ID and user-quantity validator. The pinned setup recipe compiled successfully. These local checks are separate from the hosted production checks above.

The refreshed public candidate passed **606 checks: 604 passed, two opt-in checks skipped**, plus 15 focused authentication/local-route checks and built-Worker forged-header checks. Following the final lossless borough-boundary packaging change, all 18 focused boundary/workspace checks, TypeScript and the production build passed. See [PUBLIC_EXPORT.md](PUBLIC_EXPORT.md) for the exact validation stages and cleanup.

Chat keeps provider status visible and identifies the origin of each response. Supported two-building requests can also display an application-written public-data brief with source references and prioritized next checks.

The investigation follows each source at its own scale: HVI describes community vulnerability, NPCC provides regional scenarios, stormwater layers describe modeled ground, and energy reports retain their reporting boundaries. Usable space, electrical capacity and roof or equipment details become concrete requests for owner records and site inspection.

## Hackathon fit

The selected problem statement is **Build for Your World**. The [official participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) assigns **30% Impact, 25% Use of Meta AI Tooling, 20% Technical Depth & Execution and 25% Demo**. The intended demonstration is one connected investigation: compare buildings, inspect the evidence, add a local planning note and identify the next consequential check.

The guide names **Muse Glimmer or Muse Spark Open** for the Best Open-Weight bonus. The actually executed Glimmer role meets that model-use aspect; this is a category alignment, not an eligibility decision or award claim. DINOv2 remains a separate, useful open-weight visual role.

## Rights and attribution

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This snapshot does not grant a blanket license over all application code, data, model weights and dependencies. Third-party materials retain their own terms, including the custom SAM parser license, DINOv2's Apache-2.0 license, ONNX Runtime notices, and publisher-specific data terms. No API key, private Site access credential or production user content is included.

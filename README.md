# GEONOS — NYC building evidence, in one workspace

Explore New York City buildings, select two to compare, and ask what the available evidence supports—and what to check next. GEONOS connects official building and tax-lot records, climate context, dated aerial imagery and Meta models without turning unknown operating conditions into a suitability score.

This is a sanitized public source snapshot of the hackathon application, based on private working commit `fd667567f782f37df64358d4c90554ee99a35c84`. It excludes deployment identity, credentials, private working history and local provider captures. See [Hackathon build scope](HACKATHON_BUILD_SCOPE.md) for what was built and which foundations pre-existed.

## Recorded demo

Watch the [public recorded demo](https://jangholee.com/geonos-nyc/) — access and overview playback verified on 31 October 2026. The page contains a three-minute overview and a ten-minute supporting walkthrough, with English captions and transcripts. You can also open [docs/index.html](docs/index.html) locally.

These are edited actual product states with synthetic English narration, not a continuous live recording or an interactive deployment. The Muse Image concept is an earlier separate verified example, as disclosed beside the videos. No API key is needed to watch. See [JUDGE_GUIDE.md](JUDGE_GUIDE.md) for the interactive walkthrough and access requirements.

## What it does

- Shows the complete valid footprint snapshot across five boroughs, independent of a search result page. Click a building for its full official record; select a second for automatic A/B comparison.
- Keeps building footprint, tax-lot floor area, community context and reported energy scope separate. Missing information stays unknown.
- Connects evidence to the next owner document or site inspection that could change a comparison.
- Offers dated roof/tree masks, a paired aerial review and an optional local 2020/2024 visual-feature comparison inside chat.
- Lets users review a voice transcript or an analysis-menu draft before sending it. Neither action auto-submits a question.

## Run locally

Use **Node.js 24.12 or later** with npm. The recorded development environment used Node 25.9.0. Native `.ts` tests need Node's type-stripping support.

```sh
npm run install:ci
npm run dev -- --host 127.0.0.1
```

Open the printed localhost URL. The map, public-data tools and deterministic evidence checks do not need a Meta key; live public sources still require network access and can fail or throttle requests. Keep the preview bound to loopback.

To enable optional Meta requests with **your own approved account**:

```sh
cp .dev.vars.example .dev.vars
```

Set `MODEL_API_KEY` and `META_API_APPROVED=true` in that local file. Keep the key server-side, leave `TRUST_SITES_PROXY_IDENTITY=false`, and never commit the filled file. Use the local sign-in link at `/signin-with-chatgpt?return_to=%2F`; it creates a loopback-only development identity. Model requests start only after a user action and may incur provider charges. No credential is included in this repository.

```sh
node --test tests/*.test.ts tests/*.test.mjs scripts/build-citywide-tiles.test.mjs
npx tsc --noEmit
npm run build
```

The default test suite uses local fixtures/mocks; two public-source integration checks are opt-in with `CITY_LIVE_TESTS=1`. Tests do not establish live model availability. `npm start` serves a built Worker locally; it is not the development sign-in workflow.

## Authentication and hosting boundary

The original hosted app uses Sites to inject authenticated identity. **This public copy rejects production identity headers by default.** An arbitrary browser-supplied `oai-authenticated-user-*` header is not authentication.

`TRUST_SITES_PROXY_IDENTITY=true` is only for a trusted Sites edge that strips incoming identity headers and injects its own authenticated identity. Do not enable it on a generic public host. A different host must implement and verify its own authentication before paid API routes are enabled. The environment flag is not itself an authentication service.

The neutral `.openai/hosting.json` is required by the retained Vinext/Sites build adapter but contains no project identity or storage binding. A new hosted deployment needs its own configuration and secrets. The local mock is restricted by host and socket to loopback and is not a production login mechanism. The original private demo's access policy is not changed by publishing this source.

## Six model roles

| Model | Role | Interpretation boundary |
|---|---|---|
| `muse-spark-1.3` | Conversation and bounded official-source tools | Model interpretation; citations do not verify every sentence |
| `sam-3.1` | Roof/tree masks on official Spring 2024 aerial crops | Detections, not condition, capacity, canopy or cooling benefit |
| `muse-wonder-1.0` | Second review of a public-data brief or paired SAM summary | Receives typed summaries, not the image pixels; no independent site survey |
| `muse-image-1.0` | Inspection concept derived from written checks | Generated illustration, not site evidence or a validated design |
| `muse-voice-transcribe-1.0` | Recording to an editable draft | Review mistakes before manually adding and sending text |
| Meta DINOv2 `dinov2_vits14_reg` | Optional local comparison of 2020/2024 image features | Contextual discrepancy, not verified change, damage or risk |

Five roles use the server-side Meta API. DINOv2 uses open weights in a cancellable browser Worker, with no Meta key. Its first use downloads approximately **33.1 MB** of compressed model and runtime assets. The [manifest](public/models/dinov2/manifest.json) records sizes, hashes, conversion and runtime checks. Matched geographic bounds do not establish pixel-perfect registration.

Voice uploads are limited to 60 seconds and 10 MiB, canonicalized to mono PCM16 WAV, and sent once to the fixed provider endpoint with cancellation/deadline limits. The application server does not persist audio. This is not a statement about provider retention. English and Korean hints are offered; recorded verification used synthetic English only.

Official documentation: [Meta models](https://dev.meta.ai/docs/models), [tool calling](https://dev.meta.ai/docs/tool-calling), [SAM segmentation](https://dev.meta.ai/docs/media-segmentation), [image generation](https://dev.meta.ai/docs/image-generation), [voice transcription](https://dev.meta.ai/docs/speech-to-text), [DINOv2](https://github.com/facebookresearch/dinov2).

## Data and reproducibility

The shipped source snapshots contain **1,082,964 footprint records**, with **1,082,923 valid display outlines**, and source joins to **858,284 PLUTO tax lots**. Static map tiles, compressed surroundings shards, climate summaries and energy shards are included. The full research SQLite and raw acquisition archives are not included or served by the app. Source revision is distinct from the date of a live selected-record lookup.

- [Data audit](public/reports/DATA_AUDIT.md)
- [Spatial layers and energy methods](public/reports/LAYERS_METHODS.md)
- [Scientific review](public/reports/SCIENCE_REVIEW.md)
- [Source catalog](public/data/catalog.json)
- [Evidence Atlas](public/reports/GEONOS-Evidence-Atlas.pdf)

Normal startup uses the bundled products; it does not rerun data acquisition or model conversion. Rebuilding tiles requires the audited source SQLite and a Python/Shapely environment via `scripts/build-citywide-tiles.mjs --source ... --python ...`. Full data synchronization requires a separately acquired source root. DINO conversion requires the official checkpoint/source and Python ML dependencies; `scripts/dino/export_dinov2.py` documents its inputs. Rebuild the same-origin worker with `node scripts/dino/build-worker.mjs` after changing its implementation or model manifest. The lockfile covers the web application, not these separate research environments.

## Verification and known limits

The recorded v15 application suite had **529 checks: 527 passed, two opt-in checks skipped, zero failures**, followed by focused protocol, transport and authentication checks. Actual provider and browser verification included synthetic voice, paired SAM/Wonder, and local/browser DINOv2 inference. These are bounded examples, not guarantees about every site, device or future request. This public export adds authentication hardening; its separate validation is recorded in [PUBLIC_EXPORT.md](PUBLIC_EXPORT.md).

Some benign climate/investment follow-ups still receive Meta's `content_policy_violation`. The app preserves the refusal and does not try an alternate model to evade it. A supported two-building request can separately display a clearly attributed deterministic public-data brief; it is not a fabricated Meta answer. Other refused requests remain errors.

Public data and aerial imagery cannot establish usable space, spare electrical capacity, structural load, current equipment, permission, availability, financial return or verified climate resilience. HVI is community vulnerability context; flood no-hits are not safety findings; regional projections are not building forecasts. Masks and image differences guide the next investigation, not a point-based investment ranking.

## Rights and attribution

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This snapshot does not grant a blanket license over all application code, data, model weights and dependencies. Third-party materials retain their own terms, including the custom SAM parser license, DINOv2's Apache-2.0 license, ONNX Runtime notices, and publisher-specific data terms. No API key, private Site access credential or production user content is included.

# Public export boundary

Original source application: private working commit `fd667567f782f37df64358d4c90554ee99a35c84` (30 October 2026, America/New_York). This directory is a sanitized snapshot, not a clone of the private repository history. No historic public commits have been reconstructed. The current seven-role extension and lossless packaging sync are based on private working commit `afb7f21f3dae18d66f418dccf5f9edda39c5078b`; the deliberate public authentication differences below remain.

## Deliberate differences from the hosted application

- Removed the private Site project identifier; the retained hosting manifest contains only null D1/R2 bindings.
- Replaced internal release/submission documents with public quickstart, build-scope and attribution records. Omitted stale judging/strategy material.
- Production `getChatGPTUser()` rejects identity headers unless `TRUST_SITES_PROXY_IDENTITY=true` is explicitly configured behind a trusted identity edge. The flag is false in the environment example. Development retains the original loopback-only middleware and an additional host guard.
- Preview file-denial rules explicitly include `.dev.vars` and `.dev.vars.*`.
- Added a regression covering forged production headers and explicit trusted-edge opt-in.
- Preserved model API, source query, geometry, calculation and scientific interpretation implementations. No model key or production authentication state is supplied.

The distributable source archive omits `.git`, node_modules, build output, runtime cache, filled environment file, private provider capture or local research archive. Third-party model/runtime licenses and complete shipped data products remain included.

## Initial public candidate validation

Validation completed on 31 October 2026 with Node 25.9.0:

- Full candidate suite: **552 tests, 550 passed, two opt-in public-source tests skipped, zero failures**. This includes four new identity/preview regressions.
- TypeScript checking and the Vinext production build passed.
- The built local Worker rejected spoofed identity headers with HTTP 401 on both `/api/chat` and `/api/transcribe`, even with approval configured using an invalid placeholder key.
- Development middleware rejected forged identity headers; direct and Vite filesystem requests for the temporary `.dev.vars` marker returned HTTP 403 without exposing its content.
- Loopback sign-in reached normal input validation. Only invalid empty chat bodies were used in these HTTP checks; **no provider request was made**.
- Model API and scientific implementation files were compared to the source snapshot; candidate-only changes are the boundaries documented above.

Verification reused the original locked dependency installation through a temporary external symlink. This was not a new clean-room installation or a guarantee about another operating system. The symlink, dummy environment file, build products, preview processes and runtime state were removed before handoff. Neither source control nor a remote repository was created by this preparation step.

## Seven-role extension and final packaging validation

The public source now includes the bounded surrounding-ground tool, the optional local Muse Glimmer review, and the reproducible pinned Glimmer setup. The original production identity hardening, loopback development guard and secret-file denial remain intact. Glimmer weights, runtime credentials and private request captures remain outside the public source.

Validation completed on 31 October 2026 with Node 25.9.0:

- After the model/workflow sync, the complete candidate suite passed **606 tests: 604 passed, two opt-in public-source checks skipped, zero failures**. TypeScript and the production build passed.
- The **15 focused authentication/local-route checks** passed. The built Worker rejected forged identity headers with HTTP 401 for chat and transcription when approval was enabled using an ephemeral, deliberately invalid placeholder. The unconfigured local-review route returned HTTP 404. No filled environment file or provider request was used.
- A final lossless packaging change replaced the 3,167,656-byte borough-boundary GeoJSON with a 1,151,801-byte gzip and pinned compressed/decoded hashes. Every decoded source byte and all five geometries are preserved. After that change, **18 focused boundary/workspace tests**, TypeScript and the production build passed. The earlier full-suite count is kept separate from this final focused run.
- The final development-import correction keeps identical manifest bytes in `lib` and the public provenance file. Its **18 focused tests**, TypeScript and production build passed again. An actual Vite development request returned HTTP 200 JavaScript for the boundary loader and its `lib` manifest, and the served gzip matched its pinned hash. No public-asset import error remained.
- Three setup safety tests passed for the separate local Glimmer launcher. Actual local Glimmer review is documented independently: a 39.82-second response passed current validation, and a separate browser review completed in 35 seconds.

Validation reused the same locked dependencies through a temporary external link. That link, generated builds/runtime state and the owned preview on port 40093 were removed. No other development process or dependency installation was changed. These checks did not commit, publish, submit, change access settings or make hosted model requests.

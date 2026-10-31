# Public export boundary

Source application: private working commit `fd667567f782f37df64358d4c90554ee99a35c84` (30 October 2026, America/New_York). This directory is a sanitized snapshot, not a clone of the private repository history. No historic public commits have been reconstructed.

## Deliberate differences from the hosted application

- Removed the private Site project identifier; the retained hosting manifest contains only null D1/R2 bindings.
- Replaced internal release/submission documents with public quickstart, build-scope and attribution records. Omitted stale judging/strategy material.
- Production `getChatGPTUser()` rejects identity headers unless `TRUST_SITES_PROXY_IDENTITY=true` is explicitly configured behind a trusted identity edge. The flag is false in the environment example. Development retains the original loopback-only middleware and an additional host guard.
- Preview file-denial rules explicitly include `.dev.vars` and `.dev.vars.*`.
- Added a regression covering forged production headers and explicit trusted-edge opt-in.
- Preserved model API, source query, geometry, calculation and scientific interpretation implementations. No model key or production authentication state is supplied.

The source export contains no `.git`, node_modules, build output, runtime cache, filled environment file, private provider capture or local research archive. Third-party model/runtime licenses and complete shipped data products remain included.

## Candidate validation

Validation completed on 31 October 2026 with Node 25.9.0:

- Full candidate suite: **552 tests, 550 passed, two opt-in public-source tests skipped, zero failures**. This includes four new identity/preview regressions.
- TypeScript checking and the Vinext production build passed.
- The built local Worker rejected spoofed identity headers with HTTP 401 on both `/api/chat` and `/api/transcribe`, even with approval configured using an invalid placeholder key.
- Development middleware rejected forged identity headers; direct and Vite filesystem requests for the temporary `.dev.vars` marker returned HTTP 403 without exposing its content.
- Loopback sign-in reached normal input validation. Only invalid empty chat bodies were used in these HTTP checks; **no provider request was made**.
- Model API and scientific implementation files were compared to the source snapshot; candidate-only changes are the boundaries documented above.

Verification reused the original locked dependency installation through a temporary external symlink. This was not a new clean-room installation or a guarantee about another operating system. The symlink, dummy environment file, build products, preview processes and runtime state were removed before handoff. Neither source control nor a remote repository was created by this preparation step.

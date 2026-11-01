# Local inspection review with Muse Glimmer

This optional local mode reviews two freshly resolved building records together with an inspection note. It returns source-linked next actions in the existing chat. The note and model request go to an authenticated server on the same computer. Public record refreshes still use NYC's public data service.

The hosted GEONOS app and its Meta API key are separate. This setup does not expose a public inference service, connect a browser to a local server, or substitute a cloud model when local inference is unavailable.

## Reproduce the local runtime

The tested hardware is an Apple M2 Ultra with 128 GiB of unified memory. Use Python 3.10+, Apple's command-line development tools, Git, CMake and curl. The script installs no global packages. Keep at least 30 GiB of free disk space. Model downloads are free and do not require a Hugging Face account or gated-access acceptance.

From the repository root:

```sh
python3 scripts/glimmer/setup-local.py doctor
python3 scripts/glimmer/setup-local.py setup
python3 scripts/glimmer/setup-local.py start
python3 scripts/glimmer/setup-local.py status
python3 scripts/glimmer/setup-local.py configure-app --app-dir .
```

Restart the local GEONOS app after configuration. Its application server must also bind to `127.0.0.1`. The UI offers local review only when the local configuration, origin and authentication checks pass. The `configure-app` command updates only `GEONOS_LOCAL_REVIEW`, `GEONOS_GLIMMER_URL` and `GEONOS_GLIMMER_API_KEY` in the Git-ignored `.dev.vars`, preserves other settings, and sets permissions to `0600`. It never prints the token. Do not copy these local settings into a hosted deployment.

The default runtime directory is `~/Library/Caches/geonos-glimmer`, outside the repository. `--runtime-dir /absolute/path` selects another external directory. The script rejects a runtime directory inside the app checkout. To stop only the process started by this setup:

```sh
python3 scripts/glimmer/setup-local.py stop
```

The launcher pins `127.0.0.1:8088`, the `muse-glimmer` alias, 16,384 context tokens, one request slot, four CPU threads and Metal acceleration. A generated local token protects inference requests. The server's web UI and runtime logging are disabled. `stop` verifies both the recorded executable and process start time before signaling the process.

## Pinned artifacts

Official model repository: [`meta-models/Muse-Glimmer-30B-GGUF`](https://huggingface.co/meta-models/Muse-Glimmer-30B-GGUF), revision `b44f1072cf75e918a1b82a3a17b45c4389b076e7`, Apache 2.0.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf` | 16,756,683,904 | `4cc57c0f51040a226e5a72cc47b7613f7772950e460a665f7083de89f183f60e` |
| Optional `mmproj-Muse-Glimmer-30B-Q4_K_M.gguf` | 1,400,328,928 | `f48b452316f9b213758e8659444029b961a24a07f99a1abb2a9f88b06f7c00c6` |

`setup --with-vision` also downloads and verifies the optional projector. The current inspection-note workflow and launcher remain text-only. Downloading the projector does not establish a tested image-review feature.

Runtime: [`ggml-org/llama.cpp`](https://github.com/ggml-org/llama.cpp), revision `a91eab67d8389d979d29fdf6633b2edd0718eb4b`. The script builds only the local server and records its hash and build flags in the runtime's `provenance.json`. Explicit Apple compiler and SDK settings avoid inheriting an unrelated Conda compiler. HTTPS client support is unnecessary for this fixed loopback server; model downloads use curl with normal TLS verification.

The model and runtime files are not included in the repository or web deployment. The generated token, request notes and private review output must remain outside public commits and artifacts.

## Actual verification

On the tested Mac, a real local response for freshly fetched 572 and 592 Smith Street records completed in 39.82 seconds. It produced two source-linked inspection cards and a conditional follow-up using the explicitly authored 20,000 usable-square-foot requirement. The identical captured response passed the current application validator after support for measurement modifiers was added. Exact source quotes, native IDs and the supplied numerical requirement were checked; a separate actual browser request then completed in 35 seconds and displayed both cards plus the conditional inspection-order check. No cloud inference was used for either local review. The runtime was stopped after capture to release the GPU; rerun `start` before using the local feature.

The three setup safety tests cover private configuration handling, rejection of unrelated process IDs and prevention of model files inside the app checkout. The exact pinned public build recipe was also compiled successfully.

## Request contract

The app makes one explicit request to `POST /v1/chat/completions`, with `model: "muse-glimmer"`, `chat_template_kwargs: {"reasoning_strength":"low"}` and a strict JSON schema. Source IDs and exact quote pairs are schema-constrained and checked again after generation. The app separately checks native building ownership and user-supplied quantities. The priority selects a validated action ID; the app attaches that action’s exact source context. Model-written actions remain attributed suggestions; the review does not automatically replace public facts or apply conditions.

The pinned runtime's Glimmer parser does not automatically populate its reasoning-budget delimiters. The application therefore supplies the documented Glimmer start/end tokens, a 128-token budget and an empty `reasoning_budget_message` to initialize the runtime's forced end sequence. This configuration was checked with actual local streamed responses. Keep these request fields with the pinned runtime recipe when reproducing the workflow.

The application bounds note length, packet size, response size and elapsed time. It provides no retrieval tools to the local model and follows no redirects. Logs must not contain note text, prompts or request bodies. A new local document or image input should receive its own scope and retention review before being added to this text workflow.

Official guides: [model availability](https://dev.meta.ai/docs/muse-glimmer/get-the-model), [runtime setup](https://dev.meta.ai/docs/muse-glimmer/deploy), [prompt and reasoning format](https://dev.meta.ai/docs/muse-glimmer/prompting).

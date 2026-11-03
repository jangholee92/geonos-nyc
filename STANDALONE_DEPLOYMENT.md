# Standalone public GEONOS demo

This checkout runs the application on Cloudflare Workers with Static Assets. The map, official-record queries, browser DINOv2 and hosted Meta features use the same application routes. Visitors use an explicitly anonymous demo allowance; the standalone UI does not present ChatGPT sign-in. Glimmer remains a separately configured local workflow.

## Build and deployment

Use Node 22.13 or newer and the locked dependencies. Run `npm ci`, then `npm run build`. The generated deployment configuration is `dist/server/wrangler.json`; it declares Worker `geonos-nyc`, `workers_dev: true`, the `ASSETS` binding and one SQLite Durable Object class, `DemoBudget`, bound as `DEMO_BUDGET`. The migration tag is `v1`.

Deploy the generated configuration through an authorized Cloudflare account. The initial deployment has no provider credential and fails closed for AI. Configure these server-only secrets using Wrangler stdin or the provider's secret interface:

- `MODEL_API_KEY`: the approved Meta Model API credential.
- `META_API_APPROVED`: the explicit approval flag.
- `MODEL_NAME`: optional; the default is `muse-spark-1.3`.
- `DEMO_IP_SALT`: a newly generated random string of at least 32 characters, used only to derive daily HMAC quota keys.
- `META_DEMO_BUDGET_USD`: a finite spending allowance for future Meta calls, configured privately by the operator.

Do not copy local Glimmer configuration or credentials to the hosted Worker. Never enable `TRUST_SITES_PROXY_IDENTITY` on this directly exposed deployment. Provider credentials and raw IP addresses are not stored in the quota object.

## Durable demo allowances

The Worker reserves an interaction in one fixed global Durable Object before a paid API route can run. Counts persist across Worker restarts; only the daily counters reset at midnight UTC. Lifetime counters remain cumulative. A failed or cancelled accepted interaction still consumes its count.

| Allowance | Chat | Voice |
|---|---:|---:|
| Shared daily interactions | 60 | 20 |
| Shared lifetime interactions | 300 | 100 |
| Per-IP daily interactions | 20 | 6 |

Both routes share a three-request-per-minute per-IP burst limit and two active global leases, with one active request per IP. A request receives a 210-second deadline; its crash-recovery lease expires after 240 seconds. Each route retains its existing tighter upload, model, tool-count, context and response limits. These interaction allowances apply in addition to the spending guard below.

Optional finite integer environment settings are `DEMO_DAILY_CHAT`, `DEMO_DAILY_VOICE`, `DEMO_LIFETIME_CHAT`, `DEMO_LIFETIME_VOICE`, `DEMO_IP_DAILY_CHAT`, `DEMO_IP_DAILY_VOICE`, `DEMO_BURST_PER_MINUTE` and `DEMO_CONCURRENT`. Invalid configuration, missing secrets/bindings or unavailable quota storage blocks hosted AI. Zero disables the respective allowance. Keep the fixed Durable Object identity and persistent state when redeploying; recreating the namespace would create a new lifetime counter.

## Persistent Meta spending guard

Before every paid Meta call, including later tool-loop rounds and parallel image analyses, the server atomically reserves a conservative maximum charge in the same fixed Durable Object. Spark and Wonder reserve the model's maximum context at the uncached input rate plus the capped output. Validated usage can settle that reservation at a lower amount. SAM, Image and Voice reserve their bounded per-call charge. Missing usage, failed requests and timeouts keep their reservation; a request deadline never refunds money automatically.

Concurrent requests share one ledger. The allowance persists across restarts and deployments. Missing configuration, unavailable accounting, an unsupported model or insufficient remaining allowance blocks the paid call before it reaches Meta. The chat and voice controls reflect a blocked allowance. Public maps, records and browser DINOv2 remain available; local Glimmer is separate.

This is a GEONOS spending allowance based on an operator-verified starting credit balance. Meta's published API does not expose a live account credit balance, and its Spend Limits feature sends alerts rather than enforcing a hard cap. Set the allowance below the verified remaining credits, keeping a reserve for billing delay. Other deployments and clients using the same account must be stopped or included in the same accounting boundary. The former hosted deployment must not retain an active paid-model route.

The model/rate allowlist is pinned to the [official pricing](https://dev.meta.ai/docs/pricing-rate-limits) and [context limits](https://dev.meta.ai/docs/models) checked on November 3, 2026. Review it before enabling a different model or using changed provider prices. Do not delete or recreate the Durable Object namespace to reset a budget. The ledger stores only accounting identifiers, model operations and amounts; credentials, prompts, images and recordings never enter it. Public responses do not expose the operator's account balance or allowance.

## Boundary and verification

The quota actor is an internal `anonymous-demo` type derived from Cloudflare request metadata. It is not an authenticated person, email or ChatGPT account. Incoming identity headers are removed. Paid POSTs require the exact application Origin. Quota storage contains counters, daily salted IP digests and expiring lease identifiers; it contains no questions, notes, recordings or model replies.

Verify the actual public URL after deployment: anonymous map/data, no-sign-in chat/voice status, rejected cross-origin writes, persistent allowances, exhausted-budget rejection without a provider request, one authorized real model request, pinned surrounding-ground assets and browser model loading. Free-plan CPU limits must be checked with real workloads; no paid plan upgrade is performed by these build scripts.

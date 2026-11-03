import path from "node:path";

// Shared defaults for Vite and standalone Wrangler commands. Local state stays outside tracked source.
export function configureToolEnvironment(projectRoot) {
  const runtimeRoot =
    process.env.GEONOS_RUNTIME_ROOT || path.join(projectRoot, ".geonos-runtime");
  const defaults = {
    CLOUDFLARE_CF_FETCH_ENABLED: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: path.join(runtimeRoot, "wrangler/logs"),
    WRANGLER_REGISTRY_PATH: path.join(runtimeRoot, "wrangler/dev-registry"),
    MINIFLARE_REGISTRY_PATH: path.join(runtimeRoot, "wrangler/registry"),
  };
  for (const [name, value] of Object.entries(defaults)) {
    process.env[name] ??= value;
  }
}

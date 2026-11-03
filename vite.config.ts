import vinext from "vinext";
import { randomBytes } from "node:crypto";
import { defineConfig } from "vite";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { localPreview } from "./scripts/vite/local-preview";

export default defineConfig(async ({ command }) => {
  configureToolEnvironment(process.cwd());
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const development = command === "serve";
  // This capability exists only in a loopback development process. It is never
  // placed in browser code, a production binding or a tracked environment file.
  const previewToken = development ? randomBytes(32).toString("hex") : null;
  return {
    server: {
      host: "127.0.0.1",
      strictPort: true,
      fs: { deny: [".env", ".env.*", ".dev.vars", ".dev.vars.*", "*.{crt,pem}", "**/.git/**", "**/.geonos-runtime/**"] },
      watch: { ignored: ["**/.geonos-runtime/**"], ...(process.env.GEONOS_POLLING === "true" ? { useFsEvents: false, usePolling: true } : {}) },
    },
    plugins: [
      vinext(),
      ...(previewToken ? [localPreview(previewToken)] : []),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          name: "geonos-nyc",
          workers_dev: true,
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
          assets: { binding: "ASSETS" },
          durable_objects: { bindings: [{ name: "DEMO_BUDGET", class_name: "DemoBudget" }] },
          migrations: [{ tag: "v1", new_sqlite_classes: ["DemoBudget"] }],
          vars: {
            GEONOS_PUBLIC_DEMO: "true",
            ...(previewToken ? { GEONOS_LOCAL_PREVIEW: "true", GEONOS_LOCAL_PREVIEW_TOKEN: previewToken } : {}),
          },
        },
      }),
    ],
  };
});

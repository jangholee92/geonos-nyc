import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure an actual D1 database under `d1_databases` in vite.config.ts before using the optional database example."
    );
  }

  return drizzle(env.DB, { schema });
}

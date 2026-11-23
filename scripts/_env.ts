// Loads .env.local / .env like Next.js does, and describes the target database without secrets.
import { existsSync } from "node:fs";
import { describeDb } from "../src/lib/import/engine/env";

export function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        /* ignore malformed files */
      }
    }
  }
}

/** user@host/db: never the password. */
export function describeTarget(url: string): string {
  return describeDb(url);
}

/** Real databases need CONFIRM_DB=yes for anything that writes. */
export function requireConfirm(action: string): string {
  const url = process.env.DATABASE_URL!;
  console.log(`\n${action} will run against: ${describeTarget(url)}\n`);
  if (process.env.CONFIRM_DB !== "yes") {
    console.error("Refusing: set CONFIRM_DB=yes to confirm this is the database you mean (test on a Neon branch first, see docs/DEPLOY.md).");
    process.exit(1);
  }
  return url;
}

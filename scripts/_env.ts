// Loads .env.local / .env like Next.js does, and describes the target database without secrets.
import { existsSync } from "node:fs";

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

export function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    const branch = u.searchParams.get("options")?.match(/endpoint%3D([^&]+)/)?.[1];
    return `host ${u.hostname}, database ${u.pathname.replace(/^\//, "") || "(default)"}, user ${u.username || "(none)"}${branch ? `, endpoint ${branch}` : ""}`;
  } catch {
    return "an unreadable DATABASE_URL";
  }
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

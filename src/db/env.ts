// Is there a database? Small on purpose: the middleware reads it on every request.

/** A local PGlite folder for smoke tests on a developer machine; never in a production build. */
export function testDbDir(env: Record<string, string | undefined> = process.env): string | null {
  // `process.env.NODE_ENV` is written out literally so production builds drop this branch entirely.
  if (process.env.NODE_ENV === "production") return null;
  if ((env.HUB_TEST_DB ?? "").trim() !== "pglite") return null;
  if (env.VERCEL || env.VERCEL_ENV) return null;
  return (env.HUB_TEST_DB_DIR ?? "").trim() || ".data/test-pglite";
}

/** True when the app has a database to use. */
export function databaseConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean((env.DATABASE_URL ?? "").trim()) || testDbDir(env) !== null;
}

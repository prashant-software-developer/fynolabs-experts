// Where the old jobs site's tables (public.xdl_jobs_*) are read from:
//  - JOBS_DATABASE_URL set: a separate database (the shared "Engine"), read only, while Expert
//    Hub writes to its own DATABASE_URL. CVs are copied into hub.expert_files, so the app never
//    needs the old database afterwards.
//  - not set: the same database as DATABASE_URL (the old shared setup, and local development).
import type { DB } from "@/db/client";

export type JobsSourceConfig = { mode: "same" } | { mode: "separate"; url: string };

export function jobsSourceConfig(env: Record<string, string | undefined> = process.env): JobsSourceConfig {
  const url = (env.JOBS_DATABASE_URL ?? "").trim();
  if (!url) return { mode: "same" };
  return { mode: "separate", url };
}

/** The database to read jobs-site tables from (opened lazily; nothing is ever written to it). */
export async function openJobsSource(db: DB, env: Record<string, string | undefined> = process.env): Promise<{ source: DB; separate: boolean }> {
  const cfg = jobsSourceConfig(env);
  if (cfg.mode === "same") return { source: db, separate: false };
  if (cfg.url === env.DATABASE_URL) return { source: db, separate: false };
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  return { source: drizzle({ client: neon(cfg.url) }) as unknown as DB, separate: true };
}

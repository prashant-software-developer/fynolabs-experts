import { defineConfig } from "drizzle-kit";

// Only the `hub` schema belongs to this app. The jobs-site tables in `public` are read, never migrated.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["hub"],
  migrations: { schema: "hub", table: "__drizzle_migrations" },
  strict: true,
  verbose: true,
});

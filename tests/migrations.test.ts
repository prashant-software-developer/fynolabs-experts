import { describe, expect, it } from "vitest";
import { checkMigrationsFolder, checkStatement } from "@/lib/migration-guard";

describe("migration guard (shared Engine database)", () => {
  it("every migration in drizzle/ stays inside the hub schema", () => {
    expect(checkMigrationsFolder()).toEqual([]);
  });

  it("rejects statements that touch anything else", () => {
    expect(checkStatement('DROP TABLE "public"."xdl_jobs_users";')).not.toBeNull();
    expect(checkStatement('ALTER TABLE "public"."xdl_jobs_users" ADD COLUMN "x" text;')).not.toBeNull();
    expect(checkStatement('CREATE TABLE "experts" ("id" uuid);')).not.toBeNull();
    expect(checkStatement("DROP SCHEMA hub CASCADE;")).not.toBeNull();
    expect(checkStatement("TRUNCATE hub.experts;")).not.toBeNull();
    expect(checkStatement("GRANT ALL ON SCHEMA hub TO someone;")).not.toBeNull();
    expect(checkStatement('ALTER TABLE "hub"."x" ADD CONSTRAINT "f" FOREIGN KEY ("u") REFERENCES "public"."xdl_jobs_users"("id");')).not.toBeNull();
    expect(checkStatement('CREATE INDEX "i" ON "other"."t" USING btree ("a");')).not.toBeNull();
  });

  it("accepts normal hub statements", () => {
    expect(checkStatement('CREATE TABLE "hub"."t" ("id" uuid PRIMARY KEY);')).toBeNull();
    expect(checkStatement('ALTER TABLE "hub"."a" ADD CONSTRAINT "f" FOREIGN KEY ("b") REFERENCES "hub"."b"("id") ON DELETE cascade;')).toBeNull();
    expect(checkStatement('CREATE INDEX "i" ON "hub"."t" USING gin ("search");')).toBeNull();
  });
});

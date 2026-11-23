import { describe, expect, it } from "vitest";
import { authSettings, isAllowedEmail } from "@/lib/auth/allow";
import { oauthMethods } from "@/auth.config";
import { databaseConfigured, testDbDir } from "@/db/env";

describe("who may sign in", () => {
  const s = authSettings({ ALLOWED_DOMAIN: "xocket.sh", ALLOWED_EMAILS: "Contractor@Example.com, ops@example.org" });

  it("allows the team domain exactly", () => {
    expect(isAllowedEmail("someone@xocket.sh", s)).toBe(true);
    expect(isAllowedEmail("SOMEONE@XOCKET.SH", s)).toBe(true);
    expect(isAllowedEmail("someone@evil-xocket.sh", s)).toBe(false);
    expect(isAllowedEmail("someone@sub.xocket.sh", s)).toBe(false);
    expect(isAllowedEmail("xocket.sh@gmail.com", s)).toBe(false);
  });

  it("allows listed exceptions", () => {
    expect(isAllowedEmail("contractor@example.com", s)).toBe(true);
    expect(isAllowedEmail("other@example.com", s)).toBe(false);
    expect(isAllowedEmail("", s)).toBe(false);
    expect(isAllowedEmail(null, s)).toBe(false);
  });

  it("defaults the domain to xocket.sh", () => {
    expect(authSettings({}).domain).toBe("xocket.sh");
    expect(authSettings({ ALLOWED_DOMAIN: "@Example.com" }).domain).toBe("example.com");
  });

});

describe("sign-in methods and the database switch", () => {
  it("Google and LinkedIn only when their keys are set; email + password always", () => {
    expect(oauthMethods({})).toEqual([]);
    expect(oauthMethods({ AUTH_GOOGLE_ID: "x" })).toEqual([]);
    expect(oauthMethods({ AUTH_GOOGLE_ID: "x", AUTH_GOOGLE_SECRET: "y" })).toEqual(["google"]);
    expect(oauthMethods({ AUTH_LINKEDIN_ID: "id", AUTH_LINKEDIN_SECRET: "s" })).toEqual(["linkedin"]);
  });

  it("the app needs DATABASE_URL; the PGlite test switch never counts on Vercel", () => {
    expect(databaseConfigured({})).toBe(false);
    expect(databaseConfigured({ DATABASE_URL: "  " })).toBe(false);
    expect(databaseConfigured({ DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" })).toBe(true);
    // Tests run with NODE_ENV=test: the switch works here, never with Vercel set (and production builds drop it).
    expect(testDbDir({ HUB_TEST_DB: "pglite" })).toBe(".data/test-pglite");
    expect(testDbDir({ HUB_TEST_DB: "pglite", VERCEL: "1" })).toBeNull();
    expect(testDbDir({ HUB_TEST_DB: "yes" })).toBeNull();
  });
});

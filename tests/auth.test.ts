import { describe, expect, it } from "vitest";
import { authSettings, devBypassFor, isAllowedEmail } from "@/lib/auth/allow";

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

  it("dev bypass only in development without Google keys, never on Vercel or in production", () => {
    expect(devBypassFor({ NODE_ENV: "development" })).toBe(true);
    expect(devBypassFor({ NODE_ENV: "development", AUTH_GOOGLE_ID: "x", AUTH_GOOGLE_SECRET: "y" })).toBe(false);
    expect(devBypassFor({ NODE_ENV: "production" })).toBe(false);
    expect(devBypassFor({ NODE_ENV: "test" })).toBe(false);
    expect(devBypassFor({ NODE_ENV: "development", VERCEL: "1" })).toBe(false);
  });
});

describe("dev sign-in bypass is localhost-only", () => {
  it("accepts only this computer's addresses", async () => {
    const { isLocalHost } = await import("@/lib/auth/allow");
    for (const h of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST"]) expect(isLocalHost(h), h).toBe(true);
    for (const h of ["192.168.1.20:3000", "hub.fynolabs.si", "localhost.evil.example", "", null]) expect(isLocalHost(h), String(h)).toBe(false);
  });
});

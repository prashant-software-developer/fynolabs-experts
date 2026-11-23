// The app with no database (one "Database not set up" page instead of everything), the middleware's
// first gate, callbackUrl handling (no open redirects), and a check that no preview / demo / dev
// sign-in code is left in the app.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { nextAfterSignIn, safePath } from "@/lib/auth/account";
import DatabaseNotSetUpPage from "@/app/db-not-set-up/page";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});
const req = (p: string) => new NextRequest(new URL(p, "http://localhost:3000"));
const ev = {} as never;

describe("without DATABASE_URL", () => {
  it("every page shows 'Database not set up' (503), and the APIs say so", async () => {
    process.env.DATABASE_URL = "";
    delete process.env.HUB_TEST_DB;
    const { default: middleware } = await import("@/middleware");
    for (const p of ["/", "/admin", "/signin", "/jobs/anything", "/me"]) {
      const res = await middleware(req(p), ev);
      expect(res.status, p).toBe(503);
      expect(res.headers.get("x-middleware-rewrite"), p).toMatch(/\/db-not-set-up$/);
    }
    const api = await middleware(req("/api/experts/export"), ev);
    expect(api.status).toBe(503);
    expect(await api.json()).toEqual({ error: "The database isn't set up (DATABASE_URL)." });
    expect((await middleware(req("/db-not-set-up"), ev)).headers.get("x-middleware-next")).toBe("1");
  });

  it("the page gives the four Neon steps, and no secret", () => {
    const html = renderToStaticMarkup(createElement(DatabaseNotSetUpPage));
    expect(html).toContain("Database not set up");
    for (const s of ["neon.tech", "expert-hub", "Connect", ".env.local", "DATABASE_URL=the string you copied", "start it again"]) expect(html).toContain(s);
    expect(html.match(/<li[ >]/g)).toHaveLength(4);
  });
});

describe("with a database, the middleware's first gate", () => {
  it("guests go to /signin with where they were going; public pages stay open", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@ep-test-1.example.invalid/db";
    process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
    const { default: middleware } = await import("@/middleware");
    const admin = await middleware(req("/admin/jobs?tab=x"), ev);
    expect(admin.status).toBe(307);
    expect(new URL(admin.headers.get("location")!).pathname).toBe("/signin");
    expect(new URL(admin.headers.get("location")!).searchParams.get("callbackUrl")).toBe("/admin/jobs?tab=x");
    const me = await middleware(req("/me"), ev);
    expect(new URL(me.headers.get("location")!).pathname).toBe("/signin");
    expect((await middleware(req("/api/experts/export"), ev)).status).toBe(401);
    for (const p of ["/", "/signin", "/join", "/verify-email", "/forgot-password", "/reset-password", "/jobs/x"]) expect((await middleware(req(p), ev)).headers.get("x-middleware-next"), p).toBe("1");
    expect(new URL((await middleware(req("/account/password"), ev)).headers.get("location")!).pathname).toBe("/signin");
  });
});

describe("callbackUrl: same-site paths only", () => {
  it("refuses other sites in every disguise", () => {
    for (const bad of ["https://evil.example/", "//evil.example", "/\\evil.example", "\\\\evil.example", "/%2F%2Fevil.example", "/%5Cevil.example", " //evil.example", "javascript:alert(1)", "/\u0000//evil", "/\t/evil.example", "evil.example", "", null, undefined]) {
      expect(safePath(bad as string), String(bad)).toBeNull();
      expect(nextAfterSignIn("expert", bad as string)).toBe("/me");
      expect(nextAfterSignIn("team", bad as string)).toBe("/admin");
    }
  });

  it("keeps real paths (with their query), and never loops back to a sign-in page", () => {
    expect(safePath("/jobs/rust-engineer?utm_source=x")).toBe("/jobs/rust-engineer?utm_source=x");
    expect(nextAfterSignIn("expert", "/jobs/rust-engineer?utm_source=x")).toBe("/jobs/rust-engineer?utm_source=x");
    expect(nextAfterSignIn("team", "/admin/experts?q=python")).toBe("/admin/experts?q=python");
    for (const p of ["/signin", "/join?callbackUrl=/me", "/verify-email", "/reset-password?token=x", "/account/password", "/forgot-password"]) {
      expect(nextAfterSignIn("expert", p), p).toBe("/me");
      expect(nextAfterSignIn("team", p), p).toBe("/admin");
    }
    expect(nextAfterSignIn("expert", "/admin/experts")).toBe("/me");
  });
});

describe("no preview, demo or automatic sign-in left in the app", () => {
  it("src has none of it", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|css)$/.test(n)) files.push(p);
      }
    };
    walk(path.join(process.cwd(), "src"));
    const banned = [/Preview as/i, /DEV_ROLE/, /dev@xocket\.sh/i, /isDevBypass|devBypass|devPreview|DevRoleSwitcher|setDevRole/, /\bdemo\b/i, /demo\.expert@/i, /hub_dev_role/, /Local development:/, /Real database \(production\)/];
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const re of banned) if (re.test(text)) hits.push(`${path.relative(process.cwd(), f)}: ${re}`);
    }
    expect(hits).toEqual([]);
    const root = readdirSync(process.cwd());
    expect(root).not.toContain("Reset demo data.bat");
    expect(root).toContain("Create my admin account.bat");
  });
});

// The backup address lookup: used only when the computer's own lookup can't find the name.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("node:dns");
});

describe("resolveHost", () => {
  it("does nothing when the normal lookup works", async () => {
    vi.doMock("node:dns", () => ({ default: {}, promises: { lookup: async () => ({ address: "1.2.3.4", family: 4 }) } }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { resolveHost } = await import("@/lib/server/db-connect");
    expect(await resolveHost("ep-x.c-2.ap-southeast-1.aws.neon.tech")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks Cloudflare over HTTPS when the name isn't found, and connects by IP with the real name for TLS", async () => {
    vi.doMock("node:dns", () => ({
      default: {},
      promises: { lookup: async () => Promise.reject(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })) },
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ Answer: [{ type: 5, data: "x.neon.tech." }, { type: 1, data: "13.228.1.2" }] }), { status: 200 }),
    );
    const { resolveHost, pgConfig } = await import("@/lib/server/db-connect");
    const host = "ep-raspy.c-2.ap-southeast-1.aws.neon.tech";
    const r = await resolveHost(host);
    expect(r).toEqual({ address: "13.228.1.2", by: "Cloudflare" });
    const cfg = pgConfig(`postgresql://u:p@${host}/neondb?sslmode=require&channel_binding=require`, 1, r!.address);
    expect(cfg.connectionString).toBe("postgresql://u:p@13.228.1.2/neondb");
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true, servername: host });
  });

  it("falls back to Google, and returns null when both fail", async () => {
    vi.doMock("node:dns", () => ({
      default: {},
      promises: { lookup: async () => Promise.reject(Object.assign(new Error("x"), { code: "EAI_AGAIN" })) },
    }));
    const f = vi.spyOn(globalThis, "fetch");
    f.mockRejectedValueOnce(new Error("blocked")).mockResolvedValueOnce(
      new Response(JSON.stringify({ Answer: [{ type: 1, data: "3.3.3.3" }] }), { status: 200 }),
    );
    let mod = await import("@/lib/server/db-connect");
    expect(await mod.resolveHost("a.example.com")).toEqual({ address: "3.3.3.3", by: "Google" });
    vi.resetModules();
    f.mockReset().mockRejectedValue(new Error("offline"));
    mod = await import("@/lib/server/db-connect");
    expect(await mod.resolveHost("b.example.com")).toBeNull();
  });

  it("never touches local addresses or IPs", async () => {
    const { resolveHost } = await import("@/lib/server/db-connect");
    expect(await resolveHost("localhost")).toBeNull();
    expect(await resolveHost("127.0.0.1")).toBeNull();
  });
});

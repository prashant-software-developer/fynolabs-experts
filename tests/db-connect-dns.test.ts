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

// The app's database fetch (src/db/dns-safe-fetch.ts): the lookup undici connects with.
describe("safeLookup", () => {
  const HOST = "api.c-2.ap-southeast-1.aws.neon.tech";
  const miss = () => Object.assign(new Error(`getaddrinfo ENOTFOUND ${HOST}`), { code: "ENOTFOUND" });
  const doh = (ip: string) => new Response(JSON.stringify({ Answer: [{ type: 1, data: ip }] }), { status: 200 });
  type Result = { err: (Error & { code?: string }) | null; address?: unknown; family?: number };

  /** node:dns whose lookup answers from `answers` in turn (an Error = that call fails). */
  function mockDns(answers: (Error | string)[]) {
    const calls: string[] = [];
    const lookup = (host: string, _o: unknown, cb: (e: Error | null, a?: unknown, f?: number) => void) => {
      calls.push(host);
      const next = answers.length > 1 ? answers.shift()! : answers[0];
      setImmediate(() => (next instanceof Error ? cb(next) : cb(null, next, 4)));
    };
    // The computer's lookup works again when asked a second time (it comes and goes).
    vi.doMock("node:dns", () => ({ default: { lookup }, promises: { lookup: async () => ({ address: "9.9.9.9", family: 4 }) } }));
    return calls;
  }

  async function run(options: { all?: boolean } = {}): Promise<Result> {
    const { safeLookup } = await import("@/db/dns-safe-fetch");
    return new Promise((resolve) => safeLookup(HOST, options, (err, address, family) => resolve({ err, address, family })));
  }

  it("uses the backup answer when the computer's lookup misses, even if it would work a moment later", async () => {
    mockDns([miss(), "9.9.9.9"]);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => doh("13.251.17.193"));
    expect(await run({ all: true })).toEqual({ err: null, address: [{ address: "13.251.17.193", family: 4 }], family: undefined });
    vi.resetModules();
    mockDns([miss(), "9.9.9.9"]);
    expect(await run()).toEqual({ err: null, address: "13.251.17.193", family: 4 });
  });

  it("asks the computer once more when the backup can't answer, else gives the first error", async () => {
    const calls = mockDns([miss(), "9.9.9.9"]);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await run()).toEqual({ err: null, address: "9.9.9.9", family: 4 });
    expect(calls).toHaveLength(2);
    vi.resetModules();
    mockDns([miss()]);
    const r = await run();
    expect(r.err?.code).toBe("ENOTFOUND");
  });

  it("leaves a working lookup and other errors alone (no backup asked)", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    mockDns(["3.0.167.45"]);
    expect(await run()).toEqual({ err: null, address: "3.0.167.45", family: 4 });
    vi.resetModules();
    mockDns([Object.assign(new Error("bad"), { code: "EINVAL" })]);
    expect((await run()).err?.code).toBe("EINVAL");
    expect(f).not.toHaveBeenCalled();
  });
});

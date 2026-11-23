// npm run sync:fynolabs, the runner: talks to the hub-sync edge function over HTTP (here a fake
// fetch that runs the real edge logic against PGlite), copies, maps and checks the counts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SqlRunner } from "@/lib/import/engine/source";
import { parseSyncArgs, runSync, scrub, SyncHttpError, DEFAULT_SYNC_URL } from "@/lib/import/fynolabs/runner";
import { addToken } from "@/lib/import/fynolabs/token";
import { openTestDb } from "./fixtures/db";
import { fakeEdge, newFynoLabs, SYNC_URL, TOKEN } from "./fixtures/fynolabs-edge";

let src: PGlite;
let hub: PGlite;
const raw = () => hub as unknown as SqlRunner;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeAll(async () => {
  src = await newFynoLabs();
  ({ client: hub } = await openTestDb({ jobsStub: false }));
});
afterAll(async () => {
  await src.close();
  await hub.close();
});

describe("the runner", () => {
  it("a dry run only asks for counts: nothing is copied or mapped", async () => {
    const calls: string[] = [];
    const r = await runSync({ url: SYNC_URL, token: TOKEN, dryRun: true, fetch: fakeEdge(src, hub, undefined, { calls }), raw: raw(), actorEmail: "cli:test" });
    expect(calls).toEqual(["GET tables"]);
    expect(r.ok).toBe(true);
    expect(r.report).toMatch(/^DRY RUN/);
    expect((await hub.query(`select to_regclass('fynolabs_copy.talent_profiles') as t`)).rows[0]).toEqual({ t: null });
    expect(r.report).toMatch(/talent_profiles\s+experts\s+4/);
  });

  it("a real run copies every table and the files, maps them, and the check passes", async () => {
    const calls: string[] = [];
    let migrated = 0;
    const lines: string[] = [];
    const r = await runSync({ url: SYNC_URL, token: TOKEN, dryRun: false, fetch: fakeEdge(src, hub, undefined, { calls }), raw: raw(), migrate: async () => void migrated++, actorEmail: "cli:test", log: (l) => lines.push(l) });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(migrated).toBe(1);
    expect(calls[0]).toBe("GET tables");
    expect(calls).toContain("POST copy:talent_profiles");
    expect(calls).toContain("POST copy:auth_users");
    expect(calls[calls.length - 1]).toBe("POST storage");
    expect(r.report).toContain("CHECK OK");
    expect(r.report).toMatch(/talent_profiles\s+experts\s+4\s+4\s+4/);
    // Counts only: no names, emails, file contents or the token.
    for (const s of ["Asha", "example.com", "%PDF", TOKEN]) {
      expect(r.report).not.toContain(s);
      expect(lines.join("\n")).not.toContain(s);
    }
    expect(Number((await hub.query<{ n: number }>(`select count(*)::int as n from hub.experts`)).rows[0].n)).toBe(6);
  });

  it("follows cursors until a table is done", async () => {
    const seen: string[] = [];
    const f = (async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      seen.push(`${u.searchParams.get("op")}:${u.searchParams.get("cursor") ?? "-"}`);
      if (u.searchParams.get("op") === "tables") return json({ tables: [{ table: "visitor_pageviews", rows: 3 }] });
      const c = u.searchParams.get("cursor");
      return json({ table: "visitor_pageviews", copied: 1, inserted: 1, updated: 0, next_cursor: c === "b" ? null : c === "a" ? "b" : "a" });
    }) as typeof fetch;
    // The table really holds 5 rows in fynolabs_copy from the run above (>= 3): no problem about the copy.
    const r = await runSync({ url: SYNC_URL, token: TOKEN, dryRun: false, fetch: f, raw: raw(), actorEmail: "cli:test" });
    expect(seen.slice(0, 4)).toEqual(["tables:-", "copy:-", "copy:a", "copy:b"]);
    expect(r.copy[0]).toMatchObject({ table: "visitor_pageviews", calls: 3, copied: 3 });
  });

  it("an unexplained gap fails the check (exit code 1)", async () => {
    const f = (async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      if (u.searchParams.get("op") === "tables") return json({ tables: [{ table: "leads", rows: 50 }] });
      return json({ table: "leads", copied: 50, inserted: 0, updated: 0, next_cursor: null });
    }) as typeof fetch;
    const r = await runSync({ url: SYNC_URL, token: TOKEN, dryRun: false, fetch: f, raw: raw(), actorEmail: "cli:test" });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/fynolabs_copy\.leads has 2 rows; FynoLabs has 50/);
    expect(r.report).toContain("CHECK FAILED");
  });

  it("a wrong token gets a plain explanation, never the token", async () => {
    const err = await runSync({ url: SYNC_URL, token: "wrong-token-1234567890", dryRun: true, fetch: fakeEdge(src, hub), raw: null, actorEmail: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(SyncHttpError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/HUB_SYNC_TOKEN/);
    expect(err.message).not.toContain("wrong-token");
  });

  it("errors from the edge function carry its code; network errors are scrubbed", async () => {
    const boom = (async () => json({ error: "The copy of leads stopped.", code: "42P01", message: 'relation "…" does not exist' }, 500)) as typeof fetch;
    const e1 = await runSync({ url: SYNC_URL, token: TOKEN, dryRun: true, fetch: boom, raw: null, actorEmail: "x" }).catch((e) => e);
    expect(e1.message).toMatch(/500 \[42P01\]/);
    const down = (async () => {
      throw new Error(`connect ECONNREFUSED (token ${TOKEN})`);
    }) as typeof fetch;
    const e2 = await runSync({ url: SYNC_URL, token: TOKEN, dryRun: true, fetch: down, raw: null, actorEmail: "x" }).catch((e) => e);
    expect(e2.message).toMatch(/Couldn't reach the FynoLabs side/);
    expect(e2.message).not.toContain(TOKEN);
    const missing = (async () => json({ error: "not found" }, 404)) as typeof fetch;
    expect((await runSync({ url: SYNC_URL, token: TOKEN, dryRun: true, fetch: missing, raw: null, actorEmail: "x" }).catch((e) => e)).message).toMatch(/Push the main site/);
  });

  it("a real run needs the hub's database", async () => {
    await expect(runSync({ url: SYNC_URL, token: TOKEN, dryRun: false, fetch: fakeEdge(src, hub), raw: null, actorEmail: "x" })).rejects.toThrow(/DATABASE_URL/);
  });
});

describe("settings and secrets", () => {
  it("parses its options", () => {
    expect(parseSyncArgs(["--dry-run", "--log-file", "logs\\x.log"])).toEqual({ dryRun: true, logFile: "logs\\x.log", help: false, unknown: [] });
    expect(parseSyncArgs(["--log-file=a.log", "--nope"])).toMatchObject({ logFile: "a.log", unknown: ["--nope"] });
    expect(DEFAULT_SYNC_URL).toBe("https://kmnlyniplnkwfkbhehei.supabase.co/functions/v1/hub-sync");
  });

  it("scrubs tokens, passwords and database addresses", () => {
    const url = "postgresql://owner:npg_Secret123@ep-x.neon.tech/neondb";
    const s = scrub(`token ${TOKEN} at ${url} and npg_Other456`, [TOKEN, url]);
    expect(s).not.toContain(TOKEN);
    expect(s).not.toContain("npg_");
    expect(s).not.toContain("Secret123");
  });

  it("token:new adds a fresh token once, keeping the file's line endings, and never twice", () => {
    const a = addToken("DATABASE_URL=postgresql://x\r\n", () => "t".repeat(43));
    expect(a).toEqual({ added: true, text: `DATABASE_URL=postgresql://x\r\nFYNOLABS_SYNC_TOKEN=${"t".repeat(43)}\r\n` });
    expect(addToken(a.text)).toEqual({ added: false, text: a.text });
    expect(addToken("FYNOLABS_SYNC_TOKEN=\nX=1", () => "new")).toEqual({ added: true, text: "FYNOLABS_SYNC_TOKEN=new\nX=1" });
    expect(addToken(null, () => "abc").text).toBe("FYNOLABS_SYNC_TOKEN=abc\n");
    expect(addToken(null).text).toMatch(/^FYNOLABS_SYNC_TOKEN=[A-Za-z0-9_-]{43}\n$/);
  });
});

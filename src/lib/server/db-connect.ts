// Connecting to the real database from a PC script (migrate, admin account, Engine copy).
// First choice: plain Postgres over TCP (node-postgres, port 5432), the most dependable from a
// Windows PC. If that can't connect (a firewall that blocks 5432, say), Neon's WebSocket (port
// 443) is tried. If both fail, the error says what each one answered. Nothing printed here ever
// contains a password: describeError() output goes through scrubSecrets() before it's shown.
// (The web app itself uses Neon over HTTP: src/db/client.ts.)

export type Via = "tcp" | "websocket";

/** The Pool/Client surface the scripts use; node-postgres and Neon's driver both have it. */
export type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};
export type OpenedPool = { pool: Queryable & { end: () => Promise<void> }; via: Via };
export type OpenedClient = { client: Queryable & { end: () => Promise<void> }; via: Via };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** node-postgres settings from a connection string: sslmode/channel_binding handled here, not by the URL parser. */
export function pgConfig(url: string, max?: number) {
  const u = new URL(url);
  const sslmode = (u.searchParams.get("sslmode") ?? "").toLowerCase();
  u.searchParams.delete("sslmode");
  u.searchParams.delete("channel_binding");
  const local = LOCAL_HOSTS.has(u.hostname);
  const ssl = sslmode === "disable" || (local && sslmode !== "require") ? false : { rejectUnauthorized: true };
  return {
    connectionString: u.toString(),
    ssl,
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
    ...(max ? { max } : {}),
  };
}

/** The message, code and causes of an error, one line. Run the result through scrubSecrets before showing it. */
export function describeError(e: unknown, depth = 0): string {
  if (depth > 3) return "";
  if (e instanceof AggregateError && e.errors?.length) return e.errors.map((x) => describeError(x, depth + 1)).filter(Boolean).join("; ");
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    const cause = (e as { cause?: unknown }).cause;
    const head = `${e.message || e.name}${typeof code === "string" && !e.message.includes(code) ? ` [${code}]` : ""}`;
    const tail = cause ? describeError(cause, depth + 1) : "";
    return tail && !head.includes(tail) ? `${head} (because: ${tail})` : head;
  }
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error?: unknown; type?: unknown };
    if (o.error) return describeError(o.error, depth + 1);
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.type === "string") return `connection ${o.type}`;
  }
  return String(e);
}

/** Removes passwords and full addresses (shown as user@host/db instead). */
export function scrubSecrets(text: string, urls: string[]): string {
  let out = text;
  for (const raw of urls) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      const pw = decodeURIComponent(u.password);
      out = out.split(raw).join(`${u.username}@${u.hostname}${u.pathname}`);
      if (pw) out = out.split(pw).join("***");
    } catch {
      /* not a URL */
    }
  }
  return out.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "(database address)").replace(/npg_[A-Za-z0-9]+/g, "***");
}

async function neonWs() {
  const neon = await import("@neondatabase/serverless");
  neon.neonConfig.webSocketConstructor = globalThis.WebSocket;
  return neon;
}

const sentence = (t: string) => t.replace(/[.\s]+$/, "");

function bothFailed(what: string, tcpErr: unknown, wsErr: unknown): Error {
  return new Error(
    `Couldn't open ${what}. Direct connection (port 5432): ${sentence(describeError(tcpErr))}. ` +
      `Web connection (port 443): ${sentence(describeError(wsErr))}. Check the internet connection and the database address in .env.local.`,
  );
}

/** A pool for writing (target database). TCP first, then WebSocket. */
export async function openPool(url: string, max = 1): Promise<OpenedPool> {
  let tcpErr: unknown;
  try {
    const pg = (await import("pg")).default;
    const pool = new pg.Pool(pgConfig(url, max));
    pool.on("error", () => {}); // a dropped idle connection fails the next statement, which reports it
    try {
      await pool.query("select 1");
      return { pool: pool as unknown as OpenedPool["pool"], via: "tcp" };
    } catch (e) {
      await pool.end().catch(() => {});
      throw e;
    }
  } catch (e) {
    tcpErr = e;
  }
  try {
    const { Pool } = await neonWs();
    const pool = new Pool({ connectionString: url, max });
    pool.on("error", () => {});
    try {
      await pool.query("select 1");
      return { pool: pool as unknown as OpenedPool["pool"], via: "websocket" };
    } catch (e) {
      await pool.end().catch(() => {});
      throw e;
    }
  } catch (wsErr) {
    throw bothFailed("the database", tcpErr, wsErr);
  }
}

/** One long-lived connection (Engine's read-only snapshot). TCP first, then WebSocket. */
export async function openClient(url: string): Promise<OpenedClient> {
  let tcpErr: unknown;
  try {
    const pg = (await import("pg")).default;
    const client = new pg.Client(pgConfig(url));
    client.on("error", () => {});
    try {
      await client.connect();
      return { client: client as unknown as OpenedClient["client"], via: "tcp" };
    } catch (e) {
      await client.end().catch(() => {});
      throw e;
    }
  } catch (e) {
    tcpErr = e;
  }
  try {
    const { Client } = await neonWs();
    const client = new Client({ connectionString: url });
    client.on("error", () => {});
    try {
      await client.connect();
      return { client: client as unknown as OpenedClient["client"], via: "websocket" };
    } catch (e) {
      await client.end().catch(() => {});
      throw e;
    }
  } catch (wsErr) {
    throw bothFailed("Engine", tcpErr, wsErr);
  }
}

export const viaLabel = (via: Via) => (via === "tcp" ? "direct connection" : "web connection");

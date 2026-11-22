// The Engine side of the copy: one connection, one READ ONLY snapshot, SELECT statements only.
//
// Three locks, so nothing can ever be written to Engine:
//  1. SET default_transaction_read_only = on for the session;
//  2. every read runs inside BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY (one
//     consistent snapshot for the whole run, so files match the rows read at the start);
//  3. select() refuses any statement that isn't a single SELECT, before it reaches the database.
// The recommended database user (DEPLOY.md) can also only SELECT.

/** The tiny driver surface the copy needs (PGlite and the Neon client both have it). */
export interface SqlRunner {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class SourceWriteRefused extends Error {
  constructor(text: string) {
    super(`Refused: only single SELECT statements may run on Engine (got "${text.trim().slice(0, 40)}...").`);
    this.name = "SourceWriteRefused";
  }
}

/** True for one plain SELECT (no second statement, no SELECT ... INTO, no FOR UPDATE / SHARE locks). */
export function isPlainSelect(text: string): boolean {
  const s = text.replace(/--[^\n]*/g, " ").trim();
  if (!/^select\b/i.test(s)) return false;
  const outside = s.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
  if (outside.includes(";")) return false;
  if (/\binto\b/i.test(outside) && /\bselect\b[\s\S]*\binto\b[\s\S]*\bfrom\b/i.test(outside)) return false;
  if (/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(outside)) return false;
  return true;
}

export class ReadOnlySource {
  private open = false;
  private beat: ReturnType<typeof setInterval> | null = null;
  private constructor(private readonly client: SqlRunner) {}

  /**
   * While the hub side works (creating thousands of experts), Engine's connection would sit idle in
   * its transaction for minutes. A tiny SELECT now and then keeps the connection and the snapshot alive.
   */
  keepAlive(ms = 45_000): void {
    if (this.beat || !this.open) return;
    this.beat = setInterval(() => {
      if (this.open) this.client.query("select 1").catch(() => {});
    }, ms);
    (this.beat as { unref?: () => void }).unref?.();
  }

  /** Starts the read-only snapshot. Throws if the database doesn't confirm it is read only. */
  static async begin(client: SqlRunner): Promise<ReadOnlySource> {
    await client.query("SET default_transaction_read_only = on");
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const src = new ReadOnlySource(client);
    src.open = true;
    const { rows } = await client.query<{ ro: string; iso: string }>("select current_setting('transaction_read_only') as ro, current_setting('transaction_isolation') as iso");
    if (rows[0]?.ro !== "on" || rows[0]?.iso !== "repeatable read") {
      await src.end();
      throw new Error("Engine didn't confirm a read-only snapshot; nothing was copied.");
    }
    // Same text for timestamps on both sides (the copy writes UTC offsets anyway).
    await client.query("SET LOCAL TimeZone = 'UTC'");
    return src;
  }

  async select<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    if (!this.open) throw new Error("The Engine snapshot is closed.");
    if (!isPlainSelect(text)) throw new SourceWriteRefused(text);
    return (await this.client.query<T>(text, params)).rows;
  }

  /** Ends the snapshot. ROLLBACK, not COMMIT: there is never anything to keep. */
  async end(): Promise<void> {
    if (this.beat) clearInterval(this.beat);
    this.beat = null;
    if (!this.open) return;
    this.open = false;
    try {
      await this.client.query("ROLLBACK");
    } catch {
      /* connection already gone */
    }
  }
}

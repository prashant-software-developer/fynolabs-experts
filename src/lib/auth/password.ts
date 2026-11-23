// Passwords: hashing (Node's built-in scrypt, no native packages), the policy, a strength hint and
// generated temporary passwords. Only the hash is ever stored; plain passwords are never logged.
//
// Stored format (versioned, so the parameters can change later without breaking old hashes):
//   scrypt$1$<log2 N>$<r>$<p>$<salt, base64url>$<hash, base64url>
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { passwordProblem } from "./password-policy";

export * from "./password-policy";

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

/** Current parameters: N = 2^15, r = 8, p = 1, a random 16-byte salt and a 32-byte key. */
export const SCRYPT = { logN: 15, r: 8, p: 1, saltBytes: 16, keyBytes: 32 } as const;
const VERSION = "1";

// scrypt needs about 128 * N * r bytes; Node's default limit (32 MiB) is exactly that for N = 2^15.
const maxmem = (logN: number, r: number) => 128 * 2 ** logN * r * 2 + 1024 * 1024;

/** Hashes a password with a fresh random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const key = await scrypt(password.normalize("NFKC"), salt, SCRYPT.keyBytes, { N: 2 ** SCRYPT.logN, r: SCRYPT.r, p: SCRYPT.p, maxmem: maxmem(SCRYPT.logN, SCRYPT.r) });
  return ["scrypt", VERSION, SCRYPT.logN, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

type Parsed = { logN: number; r: number; p: number; salt: Buffer; key: Buffer };

export function parseHash(stored: string | null | undefined): Parsed | null {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== VERSION) return null;
  const [logN, r, p] = parts.slice(2, 5).map((x) => Number(x));
  if (![logN, r, p].every((n) => Number.isInteger(n) && n > 0) || logN > 20 || r > 32 || p > 16) return null;
  const salt = Buffer.from(parts[5], "base64url");
  const key = Buffer.from(parts[6], "base64url");
  if (salt.length < 16 || key.length < 16) return null;
  return { logN, r, p, salt, key };
}

/** Constant-time check of a password against a stored hash. A missing or malformed hash never matches. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const h = parseHash(stored);
  if (!h) {
    // The same work as a real check, so a missing hash takes as long as a wrong password.
    await verifyPassword(password, await dummyHash());
    return false;
  }
  const key = await scrypt(password.normalize("NFKC"), h.salt, h.key.length, { N: 2 ** h.logN, r: h.r, p: h.p, maxmem: maxmem(h.logN, h.r) });
  return key.length === h.key.length && timingSafeEqual(key, h.key);
}

/** True when a hash was made with other parameters (it is re-hashed at the next successful sign-in). */
export function needsRehash(stored: string): boolean {
  const h = parseHash(stored);
  return !h || h.logN !== SCRYPT.logN || h.r !== SCRYPT.r || h.p !== SCRYPT.p || h.key.length !== SCRYPT.keyBytes;
}

let dummy: Promise<string> | null = null;
/** A hash of a random password, checked for unknown emails so the timing doesn't reveal which emails have accounts. */
export function dummyHash(): Promise<string> {
  if (!dummy) dummy = hashPassword(randomBytes(24).toString("base64url"));
  return dummy;
}

// ---------- Generated passwords ----------

// Letters and digits without look-alikes (0/O, 1/l/I), and symbols that are safe to type in any
// terminal, PowerShell or Windows cmd (no quotes, ^, &, |, <, >, %, ! or backslash).
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "@#-_+=.?";
export const GENERATED_ALPHABET = UPPER + LOWER + DIGITS + SYMBOLS;

/** A random password (20 characters by default) with upper and lower case letters, digits and symbols. */
export function generatePassword(length = 20): string {
  const pick = (set: string) => set[randomInt(set.length)];
  for (;;) {
    const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
    while (chars.length < length) chars.push(pick(GENERATED_ALPHABET));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const out = chars.join("");
    // Never starts or ends with a symbol, so a double-click selects all of it.
    if (!SYMBOLS.includes(out[0]) && !SYMBOLS.includes(out[out.length - 1]) && !passwordProblem(out)) return out;
  }
}

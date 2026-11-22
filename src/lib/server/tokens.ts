// Signed tokens and hashes that must not be guessable: invite links and rate-limit keys.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DB !== "yes") throw new Error("AUTH_SECRET is not set.");
  return "local-development-only-secret";
}

const b64url = (b: Buffer) => b.toString("base64url");

/** "?ref=invite&e=<token>": the expert's id plus a signature, so links can't be made up. */
export function inviteToken(expertId: string): string {
  const id = expertId.replace(/-/g, "");
  const sig = b64url(createHmac("sha256", secret()).update(`invite:${id}`).digest()).slice(0, 16);
  return `${id}.${sig}`;
}

/** The expert id in a valid invite token, else null. */
export function readInviteToken(token: string | null | undefined): string | null {
  const m = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{16})$/.exec(token ?? "");
  if (!m) return null;
  const want = b64url(createHmac("sha256", secret()).update(`invite:${m[1]}`).digest()).slice(0, 16);
  if (!timingSafeEqual(Buffer.from(want), Buffer.from(m[2]))) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A keyed hash (IP addresses, emails for rate limits): the value itself is never stored. */
export function keyedHash(kind: string, value: string): string {
  return createHash("sha256").update(`${secret()}:${kind}:${value.trim().toLowerCase()}`).digest("hex");
}

// FYNOLABS_SYNC_TOKEN for .env.local (npm run token:new). Pure: the script does the file work.
import { randomBytes } from "node:crypto";
import { parseEnvText } from "@/lib/import/engine/env";

/** Adds a fresh random FYNOLABS_SYNC_TOKEN line unless one is set; keeps the file's line endings. */
export function addToken(text: string | null, make: () => string = () => randomBytes(32).toString("base64url")): { text: string; added: boolean } {
  const current = text ?? "";
  if ((parseEnvText(current).get("FYNOLABS_SYNC_TOKEN") ?? "").trim()) return { text: current, added: false };
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  // An empty FYNOLABS_SYNC_TOKEN= line is replaced; otherwise the line goes at the end.
  const lines = current.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*(export\s+)?FYNOLABS_SYNC_TOKEN\s*=/.test(l));
  const line = `FYNOLABS_SYNC_TOKEN=${make()}`;
  if (at >= 0) {
    lines[at] = line;
    return { text: lines.join(eol), added: true };
  }
  const base = current && !/\r?\n$/.test(current) ? `${current}${eol}` : current;
  return { text: `${base}${line}${eol}`, added: true };
}

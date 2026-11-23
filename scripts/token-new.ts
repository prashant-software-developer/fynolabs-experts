// npm run token:new: adds FYNOLABS_SYNC_TOKEN (a fresh random secret) to .env.local if it isn't
// there yet. The token itself is never printed: copy it from .env.local into Lovable
// (Cloud -> Secrets -> HUB_SYNC_TOKEN), as docs/DEPLOY.md explains.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { addToken } from "../src/lib/import/fynolabs/token";

{
  const file = ".env.local";
  const { text, added } = addToken(existsSync(file) ? readFileSync(file, "utf8") : null);
  if (added) {
    writeFileSync(file, text);
    console.log("Added FYNOLABS_SYNC_TOKEN to .env.local (not shown here). Copy its value into Lovable: Cloud -> Secrets -> HUB_SYNC_TOKEN.");
  } else console.log("FYNOLABS_SYNC_TOKEN is already in .env.local: nothing changed.");
}

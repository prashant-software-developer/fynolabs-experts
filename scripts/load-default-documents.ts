// npm run docs:defaults [-- --dry-run] [-- --dir <folder>]
// The two documents every expert signs in the portal, made from the company's Word templates:
//   ..\Company\Legal\Templates\2 - Non-Disclosure Agreement.docx           -> "Non-Disclosure Agreement" (NDA)
//   ..\Company\Legal\Templates\4 - Candidate consent (profile sharing).docx -> "Profile sharing consent"
// (paths from this folder's parent, the FynoLabs folder; --dir points somewhere else).
//
// The Word files are read here at run time only and never copied into this repo: the NDA holds
// FynoLabs's GSTIN and business address. Their [placeholders] become {{placeholders}} that are filled
// in when an expert signs (src/lib/server/portal-documents.ts, docxToBody). Each template is added by
// title, or brought up to date: required for every expert, active. Signed copies keep their own text,
// so updating a template never changes what someone already signed.
//
// --dry-run prints the converted text and changes nothing (no database needed). Writing needs
// CONFIRM_DB=yes ("Load default documents.bat" sets it).
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "./_env";
import { databaseTarget, NEON_STEPS, openDatabase, runScript } from "./_account-cli";

loadEnv();

const DEFAULTS = [
  {
    file: "2 - Non-Disclosure Agreement.docx",
    title: "Non-Disclosure Agreement",
    kind: "nda",
    position: 0,
    optional: [] as number[],
    description: "Keeps client work, tasks and data confidential. You sign it once.",
  },
  {
    file: "4 - Candidate consent (profile sharing).docx",
    title: "Profile sharing consent",
    kind: "compliance",
    position: 1,
    // The second box (sharing the full profile for a named role) may stay unticked.
    optional: [1],
    description: "What we may share with clients and partners when we put you forward for a role.",
  },
];

const USAGE = `Load the default documents every expert signs (the NDA and the profile sharing consent).

  CONFIRM_DB=yes npm run docs:defaults
  npm run docs:defaults -- --dry-run      (print the converted text, change nothing)

Options: --dir <folder> (where the Word templates are; default ..\\Company\\Legal\\Templates).
The database is DATABASE_URL in .env.local (the Neon project "expert-hub").`;

function parseArgs(argv: string[]) {
  const a = { dryRun: false, help: false, dir: null as string | null, unknown: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--dry-run") a.dryRun = true;
    else if (k === "--help" || k === "-h") a.help = true;
    else if (k === "--dir") a.dir = argv[++i] ?? null;
    else if (k.startsWith("--dir=")) a.dir = k.slice(6);
    else a.unknown.push(k);
  }
  return a;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.unknown.length) {
    console.error(`Unknown option(s): ${args.unknown.join(" ")}\n\n${USAGE}`);
    return 1;
  }
  const dir = args.dir ? path.resolve(args.dir) : path.resolve(process.cwd(), "..", "Company", "Legal", "Templates");
  const { docxDocumentXml, docxToBody, upsertDefaultTemplate } = await import("../src/lib/server/portal-documents");

  const converted: ((typeof DEFAULTS)[number] & { body: string; unmapped: string[] })[] = [];
  for (const d of DEFAULTS) {
    const file = path.join(dir, d.file);
    if (!existsSync(file)) {
      console.error(`Can't find ${file}.\nThe Expert Hub folder should sit inside the FynoLabs folder, next to Company (or pass --dir).`);
      return 1;
    }
    const xml = docxDocumentXml(new Uint8Array(readFileSync(file)));
    if (!xml) {
      console.error(`${d.file} isn't a Word document (.docx) this can read. Save it again as .docx and retry.`);
      return 1;
    }
    const { body, unmapped } = docxToBody(xml, { optional: d.optional });
    if (!body.trim()) {
      console.error(`${d.file} has no text. Nothing was changed.`);
      return 1;
    }
    converted.push({ ...d, body, unmapped });
  }

  if (args.dryRun) {
    for (const c of converted) {
      const line = "=".repeat(72);
      console.log(`\n${line}\n${c.title} (${c.kind}, from ${c.file})\n${line}\n${c.body}\n`);
      if (c.unmapped.length) console.log(`Not converted (check these by hand): ${c.unmapped.join(", ")}`);
    }
    console.log("\nDry run: nothing was written.");
    return 0;
  }

  const target = await databaseTarget();
  if (!target) {
    console.error(`\n${NEON_STEPS}\n`);
    return 1;
  }
  console.log(`\nDefault documents into: ${target.label}\n`);
  if (process.env.CONFIRM_DB !== "yes") {
    console.error("Refusing: set CONFIRM_DB=yes to confirm this is the database you mean.");
    return 1;
  }
  const { db, close } = await openDatabase(target);
  try {
    const actor = process.env.HUB_ACTOR || `cli:${os.userInfo().username}`;
    const words = { created: "added", updated: "brought up to date", unchanged: "already up to date", skipped: "left as it is" } as const;
    for (const c of converted) {
      const res = await upsertDefaultTemplate(db, actor, { title: c.title, kind: c.kind, body: c.body, position: c.position, description: c.description });
      console.log(`${c.title}: ${words[res.status]}${res.reason ? ` (${res.reason})` : ""}.`);
      if (c.unmapped.length) console.log(`  Check by hand in Admin, Documents: ${c.unmapped.join(", ")}`);
    }
    console.log("\nEvery expert now sees them on their Documents page until they sign them.");
    return 0;
  } finally {
    await close().catch(() => {});
  }
}

runScript(main);

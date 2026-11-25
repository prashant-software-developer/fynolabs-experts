// npm run expert:create -- --email <email> [--name <name>]
// A test expert login for trying the expert side (profile, onboarding, applying, applications)
// before sign-up email is set up: an expert account with the email marked verified (no mailbox
// needed), linked to an expert record named "Test Expert" and tagged "test". Runs the migrations first.
//
// Refuses team emails, a real expert's email, a login someone else made, and people deleted on
// request (src/lib/server/test-expert.ts). The password works as in admin:create: typed twice
// (hidden), or press Enter for a generated one (printed once; changed at the first sign-in).
// To remove it: Admin → Experts → the record → Delete on request.
//
// Non-interactive (tests, scripts): --generate and --reset yes|no. Refuses without CONFIRM_DB=yes.
import os from "node:os";
import { loadEnv } from "./_env";
import { ask, choosePassword, databaseTarget, NEON_STEPS, openDatabase, parseArgs, printPasswordOnce, runScript } from "./_account-cli";

loadEnv();

const USAGE = `Create or update a test expert login, for trying the expert portal.

  CONFIRM_DB=yes npm run expert:create -- --email test.expert@example.com [--name "Test Expert"]

Options: --generate (make a strong password instead of asking), --reset yes|no (answer for an existing login).
The email needs no real mailbox (it is marked verified), but it can't be a team email or a real expert's.
The database is DATABASE_URL in .env.local (the Neon project "expert-hub").`;

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
  const target = await databaseTarget();
  if (!target) {
    console.error(`\n${NEON_STEPS}\n`);
    return 1;
  }
  console.log(`\nTest expert login in: ${target.label}\n`);
  if (process.env.CONFIRM_DB !== "yes") {
    console.error("Refusing: set CONFIRM_DB=yes to confirm this is the database you mean.");
    return 1;
  }

  const { normalizeEmail } = await import("../src/lib/normalize");
  let email = normalizeEmail(args.email ?? "");
  if (!email) email = normalizeEmail(await ask("The test expert's email: "));
  if (!email) {
    console.error("That isn't a valid email address. Nothing was changed.");
    return 1;
  }

  const { db, close } = await openDatabase(target);
  try {
    const { checkTestExpert, upsertTestExpert } = await import("../src/lib/server/test-expert");
    const check = await checkTestExpert(db, email);
    if (!check.ok) {
      console.error(`\n${check.reason} Nothing was changed.`);
      return 1;
    }
    let setPassword = true;
    if (check.account) {
      let answer = args.reset ?? "";
      while (answer !== "yes" && answer !== "no") answer = (await ask(`${email} is already a test expert login. Reset the password? (yes/no): `)).toLowerCase();
      setPassword = answer === "yes";
    }

    let chosen: { password: string; generated: boolean } | null = null;
    if (setPassword) {
      chosen = await choosePassword(email, args.generate);
      if (!chosen) {
        console.error("No password set. Nothing was changed.");
        return 1;
      }
    }

    const res = await upsertTestExpert(db, { email, name: args.name ?? null, password: chosen?.password ?? null, generated: chosen?.generated ?? false, actor: process.env.HUB_ACTOR || `cli:${os.userInfo().username}` });
    if (!res.ok) {
      console.error(`\n${res.reason} Nothing was changed.`);
      return 1;
    }
    console.log(`\n${res.created ? "Created" : "Updated"} the test expert login ${res.email} (email verified; expert record "${res.expertName}", tagged test).`);
    if (!chosen) console.log("The password was not changed.");
    else if (chosen.generated) {
      printPasswordOnce("The password", chosen.password);
      console.log("Copy it now. You'll choose your own password at the first sign-in.");
    } else console.log("The password is set.");
    console.log(`To remove it later: Admin, Experts, search ${res.email}, open the record, Delete on request.`);
    return 0;
  } finally {
    await close().catch(() => {});
  }
}

runScript(main);

// npm run admin:create -- --email <email> [--name <name>]
// Creates (or updates) the owner's admin login in DATABASE_URL: the team member with role admin
// and a team account with the email marked verified. Runs the migrations first.
//
// The password is typed twice with hidden input, or press Enter to get a strong generated one
// (printed once; it must be changed at the first sign-in). It is never written to a file or a log.
// If the account already exists it asks "Reset the password? (yes/no)".
//
// Non-interactive (tests, scripts): --generate (no password prompt) and --reset yes|no.
// Refuses without CONFIRM_DB=yes, and prints the target as user@host/db (never the password).
import os from "node:os";
import { loadEnv } from "./_env";
import { ask, choosePassword, databaseTarget, NEON_STEPS, openDatabase, parseArgs, printPasswordOnce, runScript } from "./_account-cli";

loadEnv();

const USAGE = `Create or update your Expert Hub admin login.

  CONFIRM_DB=yes npm run admin:create -- --email you@xocket.sh [--name "Your Name"]

Options: --generate (make a strong password instead of asking), --reset yes|no (answer for an existing account).
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
  console.log(`\nAdmin account in: ${target.label}\n`);
  if (process.env.CONFIRM_DB !== "yes") {
    console.error("Refusing: set CONFIRM_DB=yes to confirm this is the database you mean.");
    return 1;
  }

  const { normalizeEmail } = await import("../src/lib/normalize");
  let email = normalizeEmail(args.email ?? "");
  if (!email) email = normalizeEmail(await ask("Your email: "));
  if (!email) {
    console.error("That isn't a valid email address. Nothing was changed.");
    return 1;
  }

  const { db, close } = await openDatabase(target);
  try {
    const { adminAccountExists, upsertAdminAccount } = await import("../src/lib/server/admin-account");
    const exists = await adminAccountExists(db, email);
    let setPassword = true;
    if (exists) {
      let answer = args.reset ?? "";
      while (answer !== "yes" && answer !== "no") answer = (await ask(`${email} already has an account. Reset the password? (yes/no): `)).toLowerCase();
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

    const res = await upsertAdminAccount(db, { email, name: args.name ?? null, password: chosen?.password ?? null, generated: chosen?.generated ?? false, actor: process.env.HUB_ACTOR || `cli:${os.userInfo().username}` });
    console.log(`\n${res.created ? "Created" : "Updated"} the admin account for ${res.email} (role: admin, email verified).`);
    if (!chosen) console.log("The password was not changed.");
    else if (chosen.generated) {
      printPasswordOnce("Your password", chosen.password);
      console.log("Write it down or copy it now. You'll choose your own password when you first sign in.");
    } else console.log("Your password is set.");
    return 0;
  } finally {
    await close().catch(() => {});
  }
}

runScript(main);

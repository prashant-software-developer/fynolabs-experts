// The password rules and the strength hint. Pure (no Node APIs), so the sign-up form can show
// the same hint in the browser; the server enforces the rules (src/lib/auth/password.ts).

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

/** The passwords people pick most often (variants with digits or symbols on the end are caught too). */
const COMMON = new Set([
  "password", "passw0rd", "p@ssw0rd", "p@ssword", "qwerty", "qwertyuiop", "asdfghjkl", "asdf", "1q2w3e4r5t", "1qaz2wsx3edc",
  "zaq12wsx", "123456", "1234567", "12345678", "123456789", "1234567890", "0123456789", "0987654321", "9876543210", "111111",
  "1111111111", "000000", "0000000000", "123123", "123123123", "abc", "abcd", "abcdef", "abcdefgh", "abcdefghij",
  "iloveyou", "letmein", "welcome", "admin", "administrator", "changeme", "trustno1", "dragon", "monkey", "football",
  "baseball", "cricket", "superman", "batman", "sunshine", "princess", "shadow", "master", "whatever", "freedom",
  "starwars", "computer", "internet", "secret", "default", "test", "testing", "login", "hello", "helloworld",
  "india", "bharat", "mumbai", "fynolabs", "xocket", "experthub", "expert", "mypassword", "yourpassword", "newpassword",
]);

export type PolicyProblem = "too_short" | "too_long" | "is_email" | "common";

export const POLICY_MESSAGES: Record<PolicyProblem, string> = {
  too_short: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  too_long: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
  is_email: "Don't use your email address as your password.",
  common: "That password is too common. Pick something harder to guess.",
};

/** The first rule a password breaks, or null: at least 10 characters, not the email, not a common password. */
export function passwordProblem(password: string, email?: string | null): PolicyProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password.length > MAX_PASSWORD_LENGTH) return "too_long";
  const p = password.trim().toLowerCase();
  const e = (email ?? "").trim().toLowerCase();
  if (e && (p.includes(e) || (e.includes("@") && p === e.split("@")[0]))) return "is_email";
  // A common word with digits or symbols tacked on ("Password123!", "qwerty2026", "admin@123").
  const core = p.replace(/[^a-z]+$/g, "");
  if (COMMON.has(p) || (core.length >= 3 && COMMON.has(core)) || /^(.)\1+$/.test(p) || /^(?:0123456789|1234567890|abcdefghij)/.test(p)) return "common";
  return null;
}

export function passwordMessage(password: string, email?: string | null): string | null {
  const p = passwordProblem(password, email);
  return p ? POLICY_MESSAGES[p] : null;
}

/** A rough strength hint for the form: 0 (too weak) to 3 (strong). The policy above is what's enforced. */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!password) return { score: 0, label: "" };
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/\d/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  if (passwordProblem(password)) return { score: 0, label: "Too weak" };
  const len = password.length;
  if (len >= 16 && classes >= 3) return { score: 3, label: "Strong" };
  if ((len >= 12 && classes >= 2) || classes >= 4) return { score: 2, label: "Good" };
  return { score: 1, label: "Fair: longer is stronger" };
}

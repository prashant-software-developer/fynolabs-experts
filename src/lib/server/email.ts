// Outgoing email: through Resend (RESEND_API_KEY + EMAIL_FROM) or any SMTP server (SMTP_HOST,
// SMTP_PORT, SMTP_USER, SMTP_PASS + EMAIL_FROM, e.g. hello@fynolabs.si on Hostinger). Resend wins
// when both are set. Without either nothing is ever sent, and callers say so instead.
// Automated tests and local smoke tests use HUB_TEST_MAIL (memory, or file:<path>); production
// builds compile that path out.

export type MailConfig =
  | { kind: "resend"; apiKey: string; from: string }
  | { kind: "smtp"; host: string; port: number; secure: boolean; user: string | null; pass: string | null; from: string }
  | { kind: "test"; target: "memory" | { file: string }; from: string };

type Env = Record<string, string | undefined>;

export function mailConfig(env: Env = process.env): MailConfig | null {
  // `process.env.NODE_ENV` is written out literally so production builds drop this branch.
  if (process.env.NODE_ENV !== "production") {
    const t = (env.HUB_TEST_MAIL ?? "").trim();
    if (t === "memory") return { kind: "test", target: "memory", from: env.EMAIL_FROM || "FynoLabs <test@example.test>" };
    if (t.startsWith("file:")) return { kind: "test", target: { file: t.slice(5) }, from: env.EMAIL_FROM || "FynoLabs <test@example.test>" };
  }
  const from = (env.EMAIL_FROM ?? "").trim();
  if (!from) return null;
  if (env.RESEND_API_KEY?.trim()) return { kind: "resend", apiKey: env.RESEND_API_KEY.trim(), from };
  const host = (env.SMTP_HOST ?? "").trim();
  if (host) {
    const port = Number(env.SMTP_PORT || 465) || 465;
    const secure = env.SMTP_SECURE ? env.SMTP_SECURE.trim().toLowerCase() !== "false" : port === 465;
    return { kind: "smtp", host, port, secure, user: env.SMTP_USER?.trim() || null, pass: env.SMTP_PASS || null, from };
  }
  return null;
}

/** True when the app can send email (sign-up codes, password resets, invites). */
export function emailConfigured(env: Env = process.env): boolean {
  return mailConfig(env) !== null;
}

export type Mail = { to: string; subject: string; text: string; html?: string };
export type SendResult = { sent: true } | { sent: false; reason: string };

/** Mail kept by the "memory" test transport (tests read it). */
export function testOutbox(): Mail[] {
  const g = globalThis as { __hubTestMail?: Mail[] };
  g.__hubTestMail ??= [];
  return g.__hubTestMail;
}

type SmtpTransport = { sendMail: (m: Record<string, unknown>) => Promise<unknown> };
const transports = new Map<string, SmtpTransport>();

async function smtpTransport(cfg: Extract<MailConfig, { kind: "smtp" }>): Promise<SmtpTransport> {
  const key = `${cfg.host}:${cfg.port}:${cfg.user ?? ""}`;
  const known = transports.get(key);
  if (known) return known;
  const nodemailer = (await import("nodemailer")).default;
  const t = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass ?? "" } } : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  }) as unknown as SmtpTransport;
  transports.set(key, t);
  return t;
}

export async function sendEmail(msg: Mail): Promise<SendResult> {
  const cfg = mailConfig();
  if (!cfg) return { sent: false, reason: "Email isn't set up (Resend or SMTP, plus EMAIL_FROM), so nothing was sent." };
  try {
    if (cfg.kind === "test") {
      if (cfg.target === "memory") testOutbox().push(msg);
      else {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(cfg.target.file, `${JSON.stringify({ ...msg, from: cfg.from, at: new Date().toISOString() })}\n`);
      }
      return { sent: true };
    }
    if (cfg.kind === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: cfg.from, to: msg.to, subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) }),
      });
      if (!res.ok) return { sent: false, reason: `The email service answered ${res.status}.` };
      return { sent: true };
    }
    const t = await smtpTransport(cfg);
    await t.sendMail({ from: cfg.from, to: msg.to, subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) });
    return { sent: true };
  } catch (e) {
    // Never log the message itself (it can hold a code or a link): only that it failed.
    console.error(`[expert-hub] Sending an email failed (${cfg.kind}): ${e instanceof Error ? e.name : "error"}`);
    return { sent: false, reason: "The email service could not be reached." };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain, branded email: a heading, a few short paragraphs, an optional button and a code. */
export function brandedEmail(input: { siteName: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; code?: string; footer?: string }): { text: string; html: string } {
  const text = [
    input.heading,
    "",
    ...input.paragraphs.flatMap((p) => [p, ""]),
    ...(input.code ? [`Your code: ${input.code}`, ""] : []),
    ...(input.button ? [`${input.button.label}: ${input.button.url}`, ""] : []),
    input.footer ?? `${input.siteName}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Inter,Arial,Helvetica,sans-serif;color:#191d26">
<div style="max-width:520px;margin:0 auto;padding:40px 24px">
<p style="margin:0 0 28px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#205ff3">${esc(input.siteName)}</p>
<h1 style="margin:0 0 20px;font-size:22px;font-weight:300;line-height:1.3">${esc(input.heading)}</h1>
${input.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3c4150">${esc(p)}</p>`).join("\n")}
${input.code ? `<p style="margin:24px 0;font-size:30px;letter-spacing:.3em;font-weight:500;color:#191d26">${esc(input.code)}</p>` : ""}
${input.button ? `<p style="margin:28px 0"><a href="${esc(input.button.url)}" style="display:inline-block;background:#205ff3;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:4px">${esc(input.button.label)}</a></p>` : ""}
<p style="margin:36px 0 0;font-size:12px;line-height:1.6;color:#787c87">${esc(input.footer ?? input.siteName)}</p>
</div></body></html>`;
  return { text, html };
}

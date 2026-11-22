// Outgoing email through Resend, only when RESEND_API_KEY and EMAIL_FROM are set. Without them
// nothing is sent and callers show a note instead (local development and tests never send).

export function emailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export type SendResult = { sent: true } | { sent: false; reason: string };

export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<SendResult> {
  if (!emailConfigured()) return { sent: false, reason: "Email isn't set up (RESEND_API_KEY and EMAIL_FROM), so nothing was sent." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) return { sent: false, reason: `The email service answered ${res.status}.` };
    return { sent: true };
  } catch {
    return { sent: false, reason: "The email service could not be reached." };
  }
}

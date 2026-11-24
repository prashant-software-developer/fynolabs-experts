// Settings → Email replies (hub.settings, the FynoLabs admin's admin_settings keys): what a reply to
// a contact message may say. Until a key is saved its starter text is used, as in the FynoLabs admin.
import { inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { settings } from "@/db/schema";
import { cleanLongText } from "@/lib/normalize";
import { actorEmail, logActivity, type Actor } from "./activity";

export const REPLY_FIELDS = {
  reply_context: {
    title: "Company context",
    info: "Facts a reply may use: what you offer, how you work, prices or timelines. Drafts never go beyond this and your links.",
    rows: 6,
    starter:
      "FynoLabs is a senior product design and development studio for early-stage SaaS and AI teams, and a managed partner for AI training talent (evaluators, benchmark authors, research reviewers).\n\nClients: we work in fixed-scope projects. Suggest a short call to understand the product before quoting.\n\nPeople looking for work: thank them, ask them to apply through the talent call page so we can match them to programs, and mention open roles on the jobs page. Never promise a role.\n\nAI labs and data partners: we can start with a small paid pilot.",
  },
  reply_style: {
    title: "Writing style",
    info: "Tone, sentence length, words to avoid, how you open and close.",
    rows: 4,
    starter:
      "Write as Prashant, founder of FynoLabs.\nCalm, direct and warm. Short sentences.\nNo buzzwords, no hype, no emojis.\nThank people for their time, answer what they asked, and give one clear next step.",
  },
  reply_links: {
    title: "Links",
    info: "One per line, as “when to use it: URL”. Replies share the one or two that fit.",
    rows: 6,
    starter:
      "People looking for work, freelance or AI training roles: https://fynolabs.si/talent-call\nOpen roles: https://fynolabs.si/jobs\nFounders or teams wanting a product designed or built: https://fynolabs.si/product\nPast work: https://fynolabs.si/work\nAI labs or data partners needing evaluators or AI training talent: https://fynolabs.si/ai-training\nAI labs, data partners or staffing firms who want to talk: https://cal.com/fynolabs/partner-intro\nFounders who want to talk about a product: https://cal.com/fynolabs/product-discovery",
  },
  reply_signoff: {
    title: "Sign-off",
    info: "Ends every reply exactly as written. Up to four lines; anything after a blank line is ignored.",
    rows: 3,
    starter: "Prashant\nFounder, FynoLabs",
  },
} as const;
export type ReplyKey = keyof typeof REPLY_FIELDS;
export const REPLY_KEYS = Object.keys(REPLY_FIELDS) as ReplyKey[];

/** Saved values, with the starter where nothing is saved yet; `saved` says which keys are saved. */
export async function replySettings(db: DB): Promise<{ values: Record<ReplyKey, string>; saved: Record<ReplyKey, boolean>; updatedAt: Date | null }> {
  const rows = await db.select().from(settings).where(inArray(settings.key, REPLY_KEYS));
  const values = {} as Record<ReplyKey, string>;
  const saved = {} as Record<ReplyKey, boolean>;
  let updatedAt: Date | null = null;
  for (const k of REPLY_KEYS) {
    const r = rows.find((x) => x.key === k);
    const v = r ? (typeof r.value === "string" ? r.value : r.value == null ? "" : JSON.stringify(r.value)) : null;
    values[k] = v ?? REPLY_FIELDS[k].starter;
    saved[k] = Boolean(r);
    if (r && (!updatedAt || r.updatedAt > updatedAt)) updatedAt = r.updatedAt;
  }
  return { values, saved, updatedAt };
}

/** The sign-off as used: the lines before the first blank line, at most four. */
export function signOffLines(raw: string): string[] {
  const block = raw.replace(/\r\n?/g, "\n").split(/\n\s*\n/)[0] ?? "";
  return block
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .slice(0, 4);
}

export const signOffTooLong = (raw: string) => {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  return /\n\s*\n/.test(text) || text.split("\n").length > 4;
};

/** Writes only the keys that changed. Returns the keys written. */
export async function saveReplySettings(db: DB, input: Partial<Record<ReplyKey, string | null>>, actor: Actor): Promise<ReplyKey[]> {
  const current = await replySettings(db);
  const changed: ReplyKey[] = [];
  const now = new Date();
  for (const k of REPLY_KEYS) {
    if (input[k] === undefined) continue;
    const v = cleanLongText(input[k], 8000) ?? "";
    if (v === current.values[k] && current.saved[k]) continue;
    if (v === current.values[k] && !current.saved[k] && v === REPLY_FIELDS[k].starter) continue;
    await db
      .insert(settings)
      .values({ key: k, value: v, updatedAt: now, updatedBy: actorEmail(actor) })
      .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: now, updatedBy: actorEmail(actor) } });
    changed.push(k);
  }
  if (changed.length) await logActivity(db, { entityType: "setting", entityId: "email_replies", actor, action: "updated", detail: { fields: changed } });
  return changed;
}

/** The start of a reply: "Hi Asha," then the sign-off. */
export function replyStarter(name: string, signOff: string): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  return `Hi ${first},\n\n\n\n${signOffLines(signOff).join("\n")}`;
}

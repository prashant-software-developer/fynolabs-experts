import Link from "next/link";
import { ShieldCheck } from "@/components/icons";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { one, type SearchParams } from "@/lib/filters";
import { ago } from "@/lib/format";
import { emailConfigured } from "@/lib/server/email";
import { REPLY_FIELDS, REPLY_KEYS, replySettings, signOffTooLong } from "@/lib/server/reply-settings";
import { SubmitButton } from "@/components/ui/client";
import { FlashFromParams, NoAccess, Notice } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { saveEmailReplySettings } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("settings");
  if (!allowed || !can(user.role, "settings.manage"))
    return (
      <>
        <PageHeader title="Settings" />
        <Section>
          <NoAccess what="Settings" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const s = await replySettings(db);
  return (
    <>
      <PageHeader title="Settings" subtitle="How the team's replies read, and who can open what." />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        <form action={saveEmailReplySettings}>
          <Section title="Email replies" description="Replies to contact messages start from these: the company context, the writing style, the links to share and the sign-off.">
            <div className="space-y-6">
              {!emailConfigured() ? (
                <Notice tone="info" title="Email isn't set up yet">
                  Replies are written here and sent from your own email app until Resend or SMTP is set up (DEPLOY.md step 5).
                </Notice>
              ) : null}
              {REPLY_KEYS.map((k) => {
                const f = REPLY_FIELDS[k];
                return (
                  <Field
                    key={k}
                    label={f.title}
                    htmlFor={k}
                    hint={
                      k === "reply_signoff" && signOffTooLong(s.values[k]) ? (
                        <span className="text-destructive">Only the lines before the first blank line (up to four) are used.</span>
                      ) : (
                        <>
                          {f.info}
                          {s.saved[k] ? "" : " (Starter text: not saved yet.)"}
                        </>
                      )
                    }
                  >
                    <Textarea id={k} name={k} rows={f.rows} defaultValue={s.values[k]} />
                  </Field>
                );
              })}
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
                {s.updatedAt ? <span className="text-[13px] text-muted-foreground">Last saved {ago(s.updatedAt)}</span> : null}
              </div>
            </div>
          </Section>
        </form>
        <Section title="Job radar" description="Keywords and minimum pay for scanning other platforms' roles live with Job radar.">
          <p className="text-small text-muted-foreground">Set them on the Job radar page.</p>
        </Section>
        {can(user.role, "team.manage") ? (
          <Section title="Team & access" description="Team logins, roles and access.">
            <Link href="/admin/settings/team" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Open Team & access
            </Link>
          </Section>
        ) : null}
      </Stack>
    </>
  );
}

import Link from "next/link";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { experts } from "@/db/schema";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { REFERRAL_METHODS } from "@/lib/constants";
import { hrefWith, one, parseExpertFilters, type SearchParams } from "@/lib/filters";
import { REFERRAL_METHOD_LABELS } from "@/lib/talent";
import { emailConfigured } from "@/lib/server/email";
import { listExperts } from "@/lib/server/experts";
import { projectOptions } from "@/lib/server/pipelines";
import { alreadyReferred, groupExpertIds, listGroups, platformOptions, referralCounts } from "@/lib/server/referrals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectAll, SubmitButton } from "@/components/ui/client";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, FlashFromParams, Notice } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { CountTabs, Email, SectionBlocked } from "@/components/talent/bits";
import { ReferralTarget } from "@/components/talent/client";
import { recordReferralsAction } from "./actions";

export const metadata = { title: "Send referrals" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SendReferralsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canOpenSection(user, "send-referrals")) return <SectionBlocked title="Send referrals" section="send-referrals" />;
  const db = await getDb();
  const manage = can(user.role, "referrals.manage");
  const contact = canSeeContact(user.role);
  const q = one(sp.q).slice(0, 100);
  const groupId = UUID.test(one(sp.group)) ? one(sp.group) : "";
  const platformId = UUID.test(one(sp.platform)) ? one(sp.platform) : "";
  const projectId = UUID.test(one(sp.project)) ? one(sp.project) : "";
  const preselected = one(sp.ids)
    .split(",")
    .filter((x) => UUID.test(x))
    .slice(0, 200);
  const [platformList, projectList, groups, counts] = await Promise.all([platformOptions(db), projectOptions(db), listGroups(db, { status: "active" }), referralCounts(db, {})]);
  const groupIds = groupId ? await groupExpertIds(db, groupId) : [];
  const fromSearch = q ? (await listExperts(db, parseExpertFilters({ q }), { limit: 50, offset: 0, contact })).rows : [];
  const wanted = [...new Set([...preselected, ...groupIds, ...fromSearch.map((r) => r.id)])].slice(0, 300);
  const people = wanted.length
    ? (await db.select({ id: experts.id, name: experts.fullName, email: experts.email, headline: experts.headline, status: experts.status, cvConsent: experts.cvConsent }).from(experts).where(inArray(experts.id, wanted))).sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const referred = await alreadyReferred(db, platformId || null, people.map((p) => p.id));
  const ticked = new Set([...preselected, ...groupIds]);
  const platform = platformList.find((p) => p.id === platformId);
  const project = projectList.find((p) => p.id === projectId);
  const dest = platform?.name ?? "the platform";
  const link = platform?.referralUrl ?? project?.referralUrl ?? "";
  const email = emailConfigured();
  const subject = `Your referral link for ${dest}`;
  const body = `Hi {{first_name}},\n\nHere is your referral link for ${dest}. Sign up with this link so your application is tagged to us. It helps your profile get reviewed faster.\n\n${link || "{{referral_link}}"}\n\nOnce you are selected, reply to this email and we will take it from there.\nFynoLabs`;
  const here = hrefWith("/admin/send-referrals", sp, { ok: null, error: null });

  return (
    <>
      <PageHeader title="Send referrals" subtitle="Send experts a platform's referral link, submit them through a partner's form, or share their profile (with their consent)." />
      <CountTabs
        label="Referrals"
        tabs={[
          { href: "/admin/send-referrals", label: "Send", active: true },
          { href: "/admin/referrals", label: "Sent referrals", active: false, count: counts.all },
        ]}
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      {!manage ? (
        <Section>
          <EmptyState padded={false} title="Read only for your role" description="Recruiters and admins record referrals. You can see what was sent under Sent referrals." />
        </Section>
      ) : (
        <Stack>
          {!email ? (
            <Notice tone="info" title="Email isn't set up yet">
              Record referrals as a sign-up link (or their form, a profile share or an introduction) and send the message yourself: copy it from the preview below. The referral email itself goes out once email is set up.
            </Notice>
          ) : null}
          <form id="refer" action={recordReferralsAction}>
            <input type="hidden" name="returnTo" value={here} />
            {groupId ? <input type="hidden" name="groupId" value={groupId} /> : null}
            <Stack>
              <Section title="Where to" description="A platform with its referral link, a project, or a partner's name.">
                <div className="space-y-4">
                  <ReferralTarget platforms={platformList.map((p) => ({ id: p.id, name: p.name, referralUrl: p.referralUrl }))} projects={projectList.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}`, referralUrl: p.referralUrl, platformId: p.platformId }))} platformId={platformId} projectId={projectId} link={link} />
                  <Field label="Or a name" htmlFor="destination" hint="When there is no platform record: the partner or agency they were sent to.">
                    <Input id="destination" name="destination" maxLength={120} placeholder="Partner name" />
                  </Field>
                </div>
              </Section>
              <Section title="How">
                <div className="space-y-4">
                  <fieldset className="grid gap-2 sm:grid-cols-2">
                    <legend className="sr-only">Method</legend>
                    {REFERRAL_METHODS.map((m) => (
                      <label key={m} className="flex items-center gap-2 text-sm text-foreground/85">
                        <input type="radio" name="method" value={m} defaultChecked={m === "link"} disabled={m === "email" && !email} className="h-4 w-4" />
                        {REFERRAL_METHOD_LABELS[m]}
                        {m === "email" && !email ? <span className="text-xs text-muted-foreground">(email isn&apos;t set up yet)</span> : null}
                        {m === "profile_share" || m === "intro" ? <span className="text-xs text-muted-foreground">(needs consent)</span> : null}
                      </label>
                    ))}
                  </fieldset>
                  <Field label="Personal note (optional)" htmlFor="personalNote">
                    <Textarea id="personalNote" name="personalNote" rows={2} maxLength={2000} placeholder="One line on why this platform fits them." />
                  </Field>
                  <div className="space-y-2">
                    <Checkbox name="consentConfirmed" value="yes" label="They agreed to have their profile shared (records consent for anyone who has none on file)" />
                    <Checkbox name="allowRepeat" value="yes" label="Send again even if they were sent there in the last 30 days" />
                  </div>
                  <p className="text-xs text-muted-foreground">Profile shares and introductions pass someone&apos;s details on, so they need consent on record. People marked do not contact are never referred.</p>
                </div>
              </Section>
            </Stack>
          </form>

          <Section title="Who" description="Search experts or pick a group. People marked do not contact or without an email can't be ticked." flush>
            <form method="get" className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              {preselected.length ? <input type="hidden" name="ids" value={preselected.join(",")} /> : null}
              {projectId ? <input type="hidden" name="project" value={projectId} /> : null}
              <Input name="q" defaultValue={q} placeholder="Search people" className="h-9 min-w-56 flex-1" aria-label="Search people" />
              <Select name="group" defaultValue={groupId} options={groups.map((g) => ({ value: g.id, label: `${g.name} · ${g.members}` }))} placeholder="No group" className="h-9 w-auto" aria-label="Group" />
              <Select name="platform" defaultValue={platformId} options={platformList.map((p) => ({ value: p.id, label: p.name }))} placeholder="Platform for the preview" className="h-9 w-auto" aria-label="Platform" />
              <Button type="submit" variant="secondary">
                Find
              </Button>
              {groupId ? <Checkbox form="refer" name="wholeGroup" value="yes" label="Everyone in the group" /> : null}
            </form>
            {people.length ? (
              <Table>
                <THead>
                  <Th className="w-8">
                    <SelectAll form="refer" />
                  </Th>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Notes</Th>
                </THead>
                <TBody>
                  {people.map((p) => {
                    const blocked = p.status === "do_not_contact" || !p.email;
                    return (
                      <Tr key={p.id} className={blocked ? "opacity-60" : undefined}>
                        <Td className="py-2">
                          <input type="checkbox" form="refer" name="ids" value={p.id} defaultChecked={ticked.has(p.id) && !blocked} disabled={blocked} aria-label={`Select ${p.name}`} className="h-4 w-4 rounded-sm align-middle" />
                        </Td>
                        <Td className="py-2">
                          <Link href={`/admin/experts/${p.id}`} className="font-medium text-foreground hover:text-primary">
                            {p.name}
                          </Link>
                          {p.headline ? <div className="max-w-sm truncate text-xs text-muted-foreground">{p.headline}</div> : null}
                        </Td>
                        <Td className="py-2 text-small">
                          <Email value={p.email} contact={contact} />
                        </Td>
                        <Td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {p.status === "do_not_contact" ? <Badge tone="danger">Do not contact</Badge> : null}
                            {!p.email ? <Badge tone="muted">No email</Badge> : null}
                            {p.cvConsent !== "yes" ? <Badge tone="warning">No consent on file</Badge> : <Badge tone="success">Consent</Badge>}
                            {referred.has(p.id) ? <Badge tone="info">Already referred</Badge> : null}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="Nobody picked yet" description="Search by name, skill or email, pick a group, or tick people on Experts and choose Refer them." />
            )}
          </Section>

          <Section title="Preview" description="What they'll get. Until email is set up, copy it and send it yourself (one email per person, with their name)." actions={<CopyButton value={`${subject}\n\n${body}`} label="Copy message" />}>
            <div className="space-y-3 rounded-md border border-border p-4 text-sm">
              <div>
                <span className="text-muted-foreground">Subject: </span>
                <span className="text-foreground">{subject}</span>
              </div>
              <pre className="font-sans whitespace-pre-wrap text-foreground/85">{body}</pre>
            </div>
          </Section>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton form="refer" pendingText="Recording...">
              Record referrals
            </SubmitButton>
            <span className="text-small text-muted-foreground">One referral per ticked person; each one is logged on their timeline.</span>
          </div>
        </Stack>
      )}
    </>
  );
}

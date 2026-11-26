import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { oauthMethods } from "@/auth.config";
import { getDb } from "@/db/client";
import { authSettings } from "@/lib/auth/allow";
import { can, ROLE_LABELS, ROLE_SUMMARY, ROLES, roleLabel } from "@/lib/auth/permissions";
import { adminEmails, defaultRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { activityOfType } from "@/lib/server/activity";
import { listPartners } from "@/lib/server/requirements";
import { listTeam } from "@/lib/server/team";
import { ActivityList } from "@/components/activity-list";
import { Badge } from "@/components/ui/badge";
import { AutoSubmitSelect, SubmitButton } from "@/components/ui/client";
import { EmptyState, FlashFromParams, NoAccess } from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/field";
import { AddMemberForm, ResetPasswordForm } from "@/components/team-forms";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { SlideOver } from "@/components/ui/slide-over";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { RoleChip } from "@/components/ui/role-chip";
import { changeTeamRole, setTeamActive, setTeamScope } from "./actions";

export const metadata = { title: "Team & access" };

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default async function TeamPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user.role, "team.manage")) {
    return (
      <>
        <PageHeader title="Team & access" />
        <Section flush>
          <NoAccess what="Team & access" role={roleLabel(user.role)} />
        </Section>
      </>
    );
  }
  const db = await getDb();
  const [members, partners, history] = await Promise.all([listTeam(db), listPartners(db), activityOfType(db, "team_member", 20)]);
  const envAdmins = adminEmails();
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const bootstrap = envAdmins.filter((e) => !members.some((m) => m.email === e));
  const effectiveAdmins = new Set([...envAdmins, ...members.filter((m) => m.role === "admin" && m.active).map((m) => m.email)]);
  const { domain } = authSettings();
  const scopeFor = members.find((m) => m.id === one(sp.scope));
  const resetFor = members.find((m) => m.id === one(sp.reset));
  const signInUrl = `${await siteUrl()}/signin`;
  const lastSignIn = (m: (typeof members)[number]) => {
    if (!m.login) return <span className="text-xs text-muted-foreground">No login yet</span>;
    return (
      <div className="text-xs text-muted-foreground">
        <div className="text-[13px] text-foreground/80">{m.login.lastLoginAt ? fmtDate(m.login.lastLoginAt) : "Never"}</div>
        {m.login.mustChangePassword ? <div>Temporary password</div> : null}
        {m.login.lockedUntil && m.login.lockedUntil > new Date() ? <div className="text-warning">Locked (too many wrong passwords)</div> : null}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Team & access" subtitle="Team members sign in with their email and password. Roles decide what each person can see and do; every change is logged." />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Stack>
        <Section title="Team" description={`${members.filter((m) => m.active).length + bootstrap.length} with access.${oauthMethods().includes("google") ? ` Anyone else at @${domain} who signs in with Google gets ${ROLE_LABELS[defaultRole()]} (DEFAULT_ROLE).` : ""}`} flush>
          {members.length || bootstrap.length ? (
            <Table>
              <THead>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th>Partner scope</Th>
                <Th>Access</Th>
                <Th>Last sign-in</Th>
                <Th>Password</Th>
              </THead>
              <TBody>
                {bootstrap.map((email) => (
                  <Tr key={email}>
                    <Td className="min-w-56">
                      <div className="font-medium text-foreground">{email}</div>
                      <div className="text-xs text-muted-foreground">{email === user.email ? "You · " : ""}set by ADMIN_EMAILS</div>
                    </Td>
                    <Td>
                      <Badge tone="info">Admin</Badge>
                    </Td>
                    <Td className="text-muted-foreground/70">–</Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">Always (bootstrap)</span>
                    </Td>
                    <Td className="text-xs text-muted-foreground">Not on the list yet</Td>
                    <Td className="text-xs text-muted-foreground">npm run admin:create</Td>
                  </Tr>
                ))}
                {members.map((m) => {
                  const self = m.email === user.email;
                  const envAdmin = envAdmins.includes(m.email);
                  const lastAdmin = m.role === "admin" && m.active && !envAdmin && effectiveAdmins.size <= 1;
                  const locked = self || lastAdmin;
                  const lockedWhy = self ? "You can't change your own role or access." : lastAdmin ? "The last admin can't be demoted or turned off." : undefined;
                  return (
                    <Tr key={m.id} className={m.active ? undefined : "opacity-60"}>
                      <Td className="min-w-56">
                        <div className="font-medium text-foreground">{m.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {[self ? "You" : null, m.name, envAdmin ? "admin via ADMIN_EMAILS" : null].filter(Boolean).join(" · ") || " "}
                          <div>
                            Added {fmtDate(m.createdAt)}
                            {m.createdBy ? ` by ${m.createdBy}` : ""}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <form action={changeTeamRole} className="flex items-center gap-2" title={lockedWhy}>
                          <input type="hidden" name="id" value={m.id} />
                          <AutoSubmitSelect name="role" defaultValue={m.role} disabled={locked} className="control h-8 w-auto text-[13px]" aria-label={`Role for ${m.email}`}>
                            {roleOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </AutoSubmitSelect>
                          <noscript>
                            <button className="text-sm">Save</button>
                          </noscript>
                        </form>
                      </Td>
                      <Td className="max-w-64">
                        {m.role === "pod_lead" ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {m.partnerIds.length ? (
                              m.partnerIds.map((pid) => (
                                <Badge key={pid} tone="outline" className="font-normal">
                                  {partnerName.get(pid) ?? "Removed partner"}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-warning">No partners yet: sees no submissions</span>
                            )}
                            <Link href={hrefWith("/admin/settings/team", sp, { scope: m.id, ok: null, error: null })} scroll={false} className="text-[13px] font-medium text-primary underline-offset-4 hover:underline">
                              Edit
                            </Link>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{m.role === "viewer" ? "–" : "All partners"}</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <form action={setTeamActive} className="flex items-center gap-2" title={lockedWhy}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="active" value={m.active ? "no" : "yes"} />
                          <Badge tone={m.active ? "success" : "muted"}>{m.active ? "Active" : "Off"}</Badge>
                          {!locked ? (
                            <SubmitButton size="sm" variant="ghost" confirm={m.active ? `Turn off access for ${m.email}? They are signed out at once and can't sign in until it's turned back on.` : undefined}>
                              {m.active ? "Turn off" : "Turn on"}
                            </SubmitButton>
                          ) : null}
                        </form>
                      </Td>
                      <Td className="whitespace-nowrap">{lastSignIn(m)}</Td>
                      <Td className="whitespace-nowrap">
                        {self ? (
                          <Link href="/account/password" className="text-[13px] font-medium text-primary underline-offset-4 hover:underline">
                            Change mine
                          </Link>
                        ) : m.active ? (
                          <Link href={hrefWith("/admin/settings/team", sp, { reset: m.id, ok: null, error: null })} scroll={false} className="text-[13px] font-medium text-primary underline-offset-4 hover:underline">
                            {m.login ? "Reset password" : "Create login"}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={ShieldCheck} title="Nobody added yet" description="Add the core team below. Until then everyone gets the default role." />
          )}
        </Section>

        <Section title="Add a team member" description="They get a temporary password, shown once here, and choose their own when they first sign in.">
          <AddMemberForm roles={roleOptions} partners={partners.map((p) => ({ id: p.id, name: p.name }))} domain={domain} signInUrl={signInUrl} />
        </Section>

        <Section title="What each role can do" flush>
          <Table>
            <THead>
              <Th>Role</Th>
              <Th>Can</Th>
            </THead>
            <TBody>
              {ROLES.map((r) => (
                <Tr key={r}>
                  <Td className="whitespace-nowrap">
                    <RoleChip role={ROLE_LABELS[r]} />
                  </Td>
                  <Td className="text-[13px] text-foreground/80">{ROLE_SUMMARY[r]}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Section>

        <Section title="Recent changes">
          <ActivityList items={history} showEntity={false} />
        </Section>
      </Stack>

      {resetFor ? (
        <SlideOver title={`Reset password · ${resetFor.email}`} closeHref={hrefWith("/admin/settings/team", sp, { reset: null })}>
          <ResetPasswordForm id={resetFor.id} email={resetFor.email} signInUrl={signInUrl} />
        </SlideOver>
      ) : null}

      {scopeFor ? (
        <SlideOver title={`Partner scope · ${scopeFor.email}`} closeHref={hrefWith("/admin/settings/team", sp, { scope: null })}>
          <form action={setTeamScope} className="space-y-5">
            <input type="hidden" name="id" value={scopeFor.id} />
            <p className="text-sm text-muted-foreground">Pod leads see submissions and placements only for these partners, and can update hours, tasks and status there.</p>
            {partners.length ? (
              <div className="space-y-2">
                {partners.map((p) => (
                  <div key={p.id}>
                    <Checkbox name="partnerIds" value={p.id} defaultChecked={scopeFor.partnerIds.includes(p.id)} label={p.name} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState padded={false} title="No partners yet" />
            )}
            <SubmitButton pendingText="Saving...">Save scope</SubmitButton>
          </form>
        </SlideOver>
      ) : null}
    </>
  );
}

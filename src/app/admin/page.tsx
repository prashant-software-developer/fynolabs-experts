// The dashboard: where every expert and every partner request stands today. The tiles bring the hub's
// numbers (experts, open slots, waiting on partners, placements, live jobs) together with the FynoLabs
// admin's (new to review, job pipelines, platforms, messages, referrals, visitors); each links to the
// page behind it when this person may open it. Then the lists to act on, the 30-day trends and the
// latest changes.
import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dataRequests } from "@/db/schema";
import { EXPERT_STATUSES, label } from "@/lib/constants";
import { daysSince, fmtDate } from "@/lib/format";
import { computeMoney, formatMoney } from "@/lib/money";
import { can, canSeeMoney, partnerScope } from "@/lib/auth/permissions";
import { openSections } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { todayIST } from "@/lib/crm/dates";
import { dashboardKpis } from "@/lib/server/crm-dashboard";
import { dashboardData } from "@/lib/server/dashboard";
import { listJobs } from "@/lib/server/jobs";
import { ActivityList } from "@/components/activity-list";
import { LineTrend, StackedTrend } from "@/components/crm/trend";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, NoAccess, Notice } from "@/components/ui/feedback";
import { PageHeader, Section, Stack, Stat, StatGrid } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export const metadata = { title: "Dashboard" };

const DAYS = 30;
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const n = (v: number) => v.toLocaleString("en-GB");

export default async function DashboardPage() {
  const user = await requireUser();
  const open = openSections(user);
  if (!open.dashboard) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <NoAccess what="The dashboard" role={user.role} />
      </>
    );
  }
  const db = await getDb();
  const [d, k, liveJobs, deletionRequests] = await Promise.all([
    dashboardData(db, { partnerScope: partnerScope(user) }),
    dashboardKpis(db, todayIST()),
    open["posted-jobs"] ? listJobs(db, { status: "live" }) : Promise.resolve([]),
    db.select({ n: count() }).from(dataRequests).where(eq(dataRequests.status, "open")),
  ]);
  const openDeletions = Number(deletionRequests[0]?.n ?? 0);
  const money = canSeeMoney(user.role);
  const openSlots = d.openReqs.reduce((s, r) => s + Math.max(0, r.slots - r.filled), 0);
  const newApplicants = liveJobs.reduce((s, j) => s + j.newApplicants, 0);
  const maxStatus = Math.max(1, ...Object.values(d.byStatus));
  const perDay = k.perDay.map((x) => ({ label: dayLabel(x.day), applications: x.applications, messages: x.messages }));
  const refDays = k.referralSeries.perDay.map(({ day, ...rest }) => ({ label: dayLabel(String(day)), ...rest }));
  const appsTotal = k.perDay.reduce((s, x) => s + x.applications, 0);
  const msgsTotal = k.perDay.reduce((s, x) => s + x.messages, 0);
  const people = open.profiles;
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Where every expert and every partner request stands today."
        actions={
          <>
            {people ? (
              <ButtonLink href="/admin/experts" variant={can(user.role, "requirements.create") ? "secondary" : "primary"}>
                Find experts
              </ButtonLink>
            ) : null}
            {can(user.role, "requirements.create") ? (
              <ButtonLink href="/admin/requirements/new" variant="primary">
                New requirement
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <Stack>
        <StatGrid columns="many">
          <Stat label="Experts" value={n(k.experts)} hint={`${n(d.byStatus.bench ?? 0)} on the bench`} href={people ? "/admin/experts" : undefined} />
          <Stat label="New to review" value={n(k.newToReview)} hint="Applicants" href={people ? "/admin/experts?status=applicant" : undefined} />
          <Stat label="In a job pipeline" value={n(k.inJobPipeline)} hint="Not ended or rejected" href={people ? "/admin/experts?layout=pipelines" : undefined} />
          <Stat label="Active experts" value={n(k.activeExperts)} hint="Placed" href={people ? "/admin/experts?status=placed" : undefined} />
          <Stat label="Jobs taking applications" value={n(liveJobs.length)} hint={newApplicants ? `${n(newApplicants)} new applicants` : "No new applicants"} href={open["posted-jobs"] ? "/admin/jobs" : undefined} />
          <Stat label="Open slots" value={n(openSlots)} hint={`${d.openReqs.length} open requirements`} href="/admin/requirements" />
          <Stat label="Waiting on partners" value={n(d.waiting.length)} hint="Submitted, no answer" href="/admin/submissions?status=waiting" />
          <Stat label="Active placements" value={n(d.active.length)} href="/admin/placements?status=active" />
          <Stat label="Platforms" value={n(k.platforms)} href={open.platforms ? "/admin/platforms" : undefined} />
          <Stat label="Open messages" value={n(k.openMessages)} href={open.messages ? "/admin/messages?tab=open" : undefined} />
          <Stat label="Referrals sent" value={n(k.referrals)} href={open["send-referrals"] ? "/admin/referrals" : undefined} />
          <Stat label={`Visitors, ${DAYS} days`} value={n(k.visitors30)} href={open.analytics ? "/admin/analytics" : undefined} />
        </StatGrid>

        {openDeletions ? (
          <Notice tone="warning" title={`${openDeletions} ${openDeletions === 1 ? "expert has" : "experts have"} asked us to delete their data`}>
            Find them on Experts (a notice shows on their profile). Delete within 30 days of the request and confirm by email.
          </Notice>
        ) : null}

        {open["posted-jobs"] ? (
          <Section
            title="Jobs taking applications"
            flush
            actions={
              <ButtonLink href="/admin/jobs" size="sm" variant="ghost">
                All jobs
              </ButtonLink>
            }
          >
            {liveJobs.length ? (
              <Table>
                <THead>
                  <Th>Job</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Applicants</Th>
                  <Th className="text-right">New</Th>
                  <Th>Closes</Th>
                </THead>
                <TBody>
                  {liveJobs.slice(0, 8).map(({ job, applicants, newApplicants: fresh }) => (
                    <Tr key={job.id}>
                      <Td>
                        <Link href={`/admin/jobs/${job.id}?tab=applicants`} className="font-medium text-foreground hover:text-primary">
                          {job.title}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge value={job.status} />
                      </Td>
                      <Td className="tabular text-right">{applicants}</Td>
                      <Td className="tabular text-right">{fresh ? <span className="font-medium text-info">{fresh}</span> : "–"}</Td>
                      <Td className="whitespace-nowrap">{fmtDate(job.closesOn)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No open jobs" description="Turn a requirement into a job to get a public link and an application form." action={can(user.role, "jobs.manage") ? <ButtonLink href="/admin/jobs/new" size="sm">New job</ButtonLink> : undefined} />
            )}
          </Section>
        ) : null}

        <Section title="Experts by status">
          <div className="space-y-2">
            {EXPERT_STATUSES.map((s) => {
              const v = d.byStatus[s] ?? 0;
              const row = (
                <>
                  <span className="w-32 shrink-0 text-foreground/70 group-hover:text-foreground">{label(s)}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-1.5 rounded-full bg-foreground/75 transition-colors group-hover:bg-foreground" style={{ width: `${(v / maxStatus) * 100}%` }} />
                  </div>
                  <span className="tabular w-10 text-right text-foreground/80">{n(v)}</span>
                </>
              );
              return people ? (
                <Link key={s} href={`/admin/experts?status=${s}`} className="group flex items-center gap-3 text-sm">
                  {row}
                </Link>
              ) : (
                <div key={s} className="group flex items-center gap-3 text-sm">
                  {row}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Open requirements" flush actions={<ButtonLink href="/admin/requirements" size="sm" variant="ghost">All requirements</ButtonLink>}>
          {d.openReqs.length ? (
            <Table>
              <THead>
                <Th>Requirement</Th>
                <Th>Partner</Th>
                <Th>Status</Th>
                <Th>Open slots</Th>
                <Th>In progress</Th>
                <Th>Deadline</Th>
              </THead>
              <TBody>
                {d.openReqs.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={`/admin/requirements/${r.id}`} className="font-medium text-foreground hover:text-primary">
                        {r.title}
                      </Link>
                    </Td>
                    <Td>{r.partnerName}</Td>
                    <Td>
                      <StatusBadge value={r.status} />
                    </Td>
                    <Td className="tabular">
                      {Math.max(0, r.slots - r.filled)} of {r.slots}
                    </Td>
                    <Td className="tabular">{r.inPlay}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.deadline)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No open requirements" action={can(user.role, "requirements.create") ? <ButtonLink href="/admin/requirements/new" size="sm">Add one</ButtonLink> : undefined} />
          )}
        </Section>

        <Section title="Waiting on partners" description="Submitted, no answer yet. Oldest first: chase these." flush>
          {d.waiting.length ? (
            <Table>
              <THead>
                <Th>Expert</Th>
                <Th>Requirement</Th>
                <Th>Partner</Th>
                <Th>Status</Th>
                <Th>Waiting</Th>
              </THead>
              <TBody>
                {d.waiting.map((w) => {
                  const days = daysSince(w.submittedAt);
                  return (
                    <Tr key={w.id}>
                      <Td>
                        <Link href={`/admin/experts/${w.expertId}`} className="font-medium text-foreground hover:text-primary">
                          {w.expertName}
                        </Link>
                      </Td>
                      <Td>
                        <Link href={`/admin/requirements/${w.reqId}?tab=submissions`} className="hover:text-primary">
                          {w.reqTitle}
                        </Link>
                      </Td>
                      <Td>{w.partnerName}</Td>
                      <Td>
                        <StatusBadge value={w.status} />
                      </Td>
                      <Td className={days != null && days >= 5 ? "text-warning" : ""}>{days == null ? "–" : `${days} d`}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="Nothing waiting on partners" />
          )}
        </Section>

        <Section title="Active placements" flush actions={<ButtonLink href="/admin/placements" size="sm" variant="ghost">All placements</ButtonLink>}>
          {d.active.length ? (
            <Table>
              <THead>
                <Th>Expert</Th>
                <Th>Project</Th>
                <Th>Partner</Th>
                <Th>Since</Th>
                <Th className="text-right">Hours / tasks</Th>
                {money ? <Th className="text-right">Earned</Th> : null}
                {money ? <Th className="text-right">Revenue</Th> : null}
              </THead>
              <TBody>
                {d.active.map((a) => {
                  const m = computeMoney(a.p);
                  return (
                    <Tr key={a.p.id}>
                      <Td>{a.expertName ?? <span className="text-muted-foreground/70">Deleted expert</span>}</Td>
                      <Td>
                        <Link href={`/admin/placements/${a.p.id}`} className="hover:text-primary">
                          {a.p.projectName}
                        </Link>
                      </Td>
                      <Td>{a.partnerName}</Td>
                      <Td>{fmtDate(a.p.startDate)}</Td>
                      <Td className="tabular text-right">{a.p.basis === "per_task" ? `${a.p.tasksAccepted ?? 0} tasks` : `${a.p.hoursApproved ?? 0} h`}</Td>
                      {money ? <Td className="tabular text-right">{formatMoney(m.earned, a.p.currency)}</Td> : null}
                      {money ? <Td className="tabular text-right">{formatMoney(m.revenue, a.p.currency)}</Td> : null}
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No active placements" />
          )}
        </Section>

        <Section title={`Applications, last ${DAYS} days`} description={`${n(appsTotal)} applications across every job.`}>
          <LineTrend data={perDay} dataKey="applications" name="Applications" />
        </Section>
        <Section title={`Messages, last ${DAYS} days`} description={`${n(msgsTotal)} messages from the website's contact form.`}>
          <LineTrend data={perDay} dataKey="messages" name="Messages" />
        </Section>
        <Section title={`Referrals, last ${DAYS} days`} description={`${n(k.referralSeries.total)} referrals sent, by platform.`}>
          <StackedTrend data={refDays} series={k.referralSeries.series} name={`Referrals: ${k.referralSeries.total} in this period`} />
        </Section>

        <Section title="Recent activity">
          <ActivityList items={d.activity} />
        </Section>
      </Stack>
    </>
  );
}

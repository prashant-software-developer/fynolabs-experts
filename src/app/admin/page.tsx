import Link from "next/link";
import { getDb } from "@/db/client";
import { EXPERT_STATUSES, label } from "@/lib/constants";
import { daysSince, fmtDate } from "@/lib/format";
import { computeMoney, formatMoney } from "@/lib/money";
import { can, canSeeMoney, partnerScope } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { dashboardData } from "@/lib/server/dashboard";
import { listJobs } from "@/lib/server/jobs";
import { dataRequests } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { ActivityList } from "@/components/activity-list";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { PageHeader, Section, Stat, StatGrid, Stack } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const db = await getDb();
  const [d, liveJobs, deletionRequests] = await Promise.all([
    dashboardData(db, { partnerScope: partnerScope(user) }),
    listJobs(db, { status: "live" }),
    db.select({ n: count() }).from(dataRequests).where(eq(dataRequests.status, "open")),
  ]);
  const openDeletions = Number(deletionRequests[0]?.n ?? 0);
  const money = canSeeMoney(user.role);
  const openSlots = d.openReqs.reduce((n, r) => n + Math.max(0, r.slots - r.filled), 0);
  const maxStatus = Math.max(1, ...Object.values(d.byStatus));
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Where every expert and every partner request stands today."
        actions={
          <>
            <ButtonLink href="/admin/experts" variant={can(user.role, "requirements.create") ? "secondary" : "primary"}>
              Find experts
            </ButtonLink>
            {can(user.role, "requirements.create") ? (
              <ButtonLink href="/admin/requirements/new" variant="primary">
                New requirement
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <Stack>
        <StatGrid>
          <Stat label="Experts" value={d.total} hint={`${d.byStatus.bench ?? 0} on the bench`} href="/admin/experts" />
          <Stat label="Open slots" value={openSlots} hint={`${d.openReqs.length} open requirements`} href="/admin/requirements" />
          <Stat label="Waiting on partners" value={d.waiting.length} href="/admin/submissions?status=waiting" />
          <Stat label="Active placements" value={d.active.length} href="/admin/placements?status=active" />
        </StatGrid>

        {openDeletions ? (
          <Notice tone="warning" title={`${openDeletions} ${openDeletions === 1 ? "expert has" : "experts have"} asked us to delete their data`}>
            Find them on Experts (a notice shows on their profile). Delete within 30 days of the request and confirm by email.
          </Notice>
        ) : null}

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
                {liveJobs.slice(0, 8).map(({ job, applicants, newApplicants }) => (
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
                    <Td className="tabular text-right">{newApplicants ? <span className="font-medium text-info">{newApplicants}</span> : "–"}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(job.closesOn)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No open jobs" description="Turn a requirement into a job to get a public link and an application form." action={can(user.role, "jobs.manage") ? <ButtonLink href="/admin/jobs/new" size="sm">New job</ButtonLink> : undefined} />
          )}
        </Section>

        <Section title="Experts by status">
          <div className="space-y-2">
            {EXPERT_STATUSES.map((s) => {
              const n = d.byStatus[s] ?? 0;
              return (
                <Link key={s} href={`/admin/experts?status=${s}`} className="group flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-foreground/70 group-hover:text-foreground">{label(s)}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-1.5 rounded-full bg-foreground/75 transition-colors group-hover:bg-foreground" style={{ width: `${(n / maxStatus) * 100}%` }} />
                  </div>
                  <span className="tabular w-10 text-right text-foreground/80">{n}</span>
                </Link>
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

        <Section title="Recent activity">
          <ActivityList items={d.activity} />
        </Section>
      </Stack>
    </>
  );
}

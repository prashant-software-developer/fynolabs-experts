import Link from "next/link";
import { getDb } from "@/db/client";
import { SUBMISSION_STATUSES, label } from "@/lib/constants";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { daysSince, fmtDate } from "@/lib/format";
import { listPartners, listRequirements } from "@/lib/server/requirements";
import { listSubmissions } from "@/lib/server/submissions";
import { SubmissionStatusForm } from "@/components/submission-status-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, FlashFromParams } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { PageHeader, Section } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const status = one(sp.status);
  const partnerId = one(sp.partner);
  const requirementId = one(sp.requirement);
  const db = await getDb();
  const [rows, partners, reqs] = await Promise.all([
    listSubmissions(db, { status, partnerId, requirementId }),
    listPartners(db),
    listRequirements(db, {}),
  ]);
  const returnTo = hrefWith("/submissions", sp, { ok: null, error: null });
  const filtered = Boolean(status || partnerId || requirementId);
  return (
    <>
      <PageHeader title="Submissions" subtitle="Everyone put forward to a partner, across all requirements." />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Section flush>
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Select name="partner" defaultValue={partnerId} options={partners.map((p) => ({ value: p.id, label: p.name }))} placeholder="All partners" className="w-auto" aria-label="Partner" />
          <Select name="requirement" defaultValue={requirementId} options={reqs.map((r) => ({ value: r.req.id, label: `${r.req.title} · ${r.partnerName}` }))} placeholder="All requirements" className="w-auto max-w-xs" aria-label="Requirement" />
          <Select
            name="status"
            defaultValue={status}
            options={[{ value: "waiting", label: "Waiting on partner" }, ...SUBMISSION_STATUSES.map((s) => ({ value: s, label: label(s) }))]}
            placeholder="Any status"
            className="w-auto"
            aria-label="Status"
          />
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
          {filtered ? (
            <Link href="/submissions" className="text-sm text-muted-foreground hover:text-foreground">
              Clear
            </Link>
          ) : null}
          <span className="ml-auto text-[13px] text-muted-foreground">{rows.length} shown</span>
        </form>
        {rows.length ? (
          <Table>
            <THead>
              <Th>Expert</Th>
              <Th>Requirement</Th>
              <Th>Partner</Th>
              <Th>Score</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
            </THead>
            <TBody>
              {rows.map((s) => {
                const waiting = ["submitted", "partner_review"].includes(s.sub.status) ? daysSince(s.sub.submittedAt) : null;
                return (
                  <Tr key={s.sub.id}>
                    <Td className="min-w-40">
                      <Link href={`/experts/${s.sub.expertId}`} className="font-medium text-foreground hover:text-primary">
                        {s.expertName}
                      </Link>
                      <div className="mt-0.5">
                        <StatusBadge value={s.cvConsent} prefix="CV:" />
                      </div>
                    </Td>
                    <Td className="min-w-44">
                      <Link href={`/requirements/${s.sub.requirementId}?tab=submissions`} className="text-foreground hover:text-primary">
                        {s.reqTitle}
                      </Link>
                    </Td>
                    <Td>{s.partnerName}</Td>
                    <Td className="tabular">{s.sub.score ?? "–"}</Td>
                    <Td className="min-w-96">
                      <SubmissionStatusForm id={s.sub.id} status={s.sub.status} cvConsent={s.cvConsent} expertStatus={s.expertStatus} expertName={s.expertName} partnerNote={s.sub.partnerNote} returnTo={returnTo} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      {fmtDate(s.sub.submittedAt)}
                      {waiting != null && waiting >= 3 ? <div className="text-xs text-warning">{waiting} days waiting</div> : null}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState size="page" title={filtered ? "No submissions match" : "No submissions yet"} description="Shortlist experts from a requirement's Matches tab." />
        )}
      </Section>
    </>
  );
}

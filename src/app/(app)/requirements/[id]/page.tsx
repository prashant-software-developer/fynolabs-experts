import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileArchive } from "lucide-react";
import { getDb } from "@/db/client";
import { REQUIREMENT_STATUSES, label } from "@/lib/constants";
import { one, type SearchParams } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { placeLabel } from "@/lib/match/dictionary";
import { WEIGHTS, type Reason } from "@/lib/match/score";
import { filledCount } from "@/lib/workflow";
import { activityFor } from "@/lib/server/activity";
import { candidatesFor, getRequirement, listPartners } from "@/lib/server/requirements";
import { rosterFor } from "@/lib/server/roster";
import { listSubmissions } from "@/lib/server/submissions";
import { ActivityList } from "@/components/activity-list";
import { RequirementForm } from "@/components/requirement-form";
import { SubmissionStatusForm } from "@/components/submission-status-form";
import { Badge, Chips, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { AutoSubmitSelect, SelectAll, SubmitButton } from "@/components/ui/client";
import { cn } from "@/components/ui/cn";
import { EmptyState, FlashFromParams, Notice } from "@/components/ui/feedback";
import { DefinitionList, PageHeader, Section, Stack } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { setRequirementStatus, shortlist } from "../actions";

const TONE: Record<Reason["tone"], string> = {
  good: "bg-success-soft text-success",
  ok: "bg-secondary text-foreground/70",
  bad: "bg-warning-soft text-warning",
  block: "bg-danger-soft text-danger",
};

function ReasonChips({ reasons }: { reasons: Reason[] }) {
  const order: Reason["factor"][] = ["location", "skills", "nice", "domain", "degree", "years", "availability", "status", "consent"];
  const sorted = [...reasons].sort((a, b) => order.indexOf(a.factor) - order.indexOf(b.factor));
  return (
    <div className="flex flex-wrap gap-1">
      {sorted
        .filter((r) => !(r.tone === "ok" && r.points === r.max && r.factor !== "skills"))
        .map((r, i) => (
          <span key={i} className={cn("rounded-md px-1.5 py-0.5 text-[11px] leading-4", TONE[r.tone])} title={r.max ? `${r.points} of ${r.max} points` : undefined}>
            {r.text}
            {r.max ? <span className="ml-1 opacity-60">{r.points}/{r.max}</span> : null}
          </span>
        ))}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="tabular w-7 text-right font-medium text-foreground">{score}</span>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-1 rounded-full", score >= 75 ? "bg-success" : score >= 50 ? "bg-foreground/60" : "bg-warning")} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default async function RequirementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const found = await getRequirement(db, id);
  if (!found) notFound();
  const { req, partner } = found;
  const tab = ["submissions", "details", "edit"].includes(one(sp.tab)) ? one(sp.tab) : "matches";
  const subs = await listSubmissions(db, { requirementId: id });
  const filled = filledCount(subs.map((s) => s.sub.status));
  const base = `/requirements/${id}`;

  return (
    <>
      <PageHeader
        title={req.title}
        back={{ href: "/requirements", label: "Requirements" }}
        meta={
          <>
            <span className="font-medium text-foreground">{partner.name}</span>
            {req.externalRef ? <span className="text-muted-foreground">· {req.externalRef}</span> : null}
            <StatusBadge value={req.status} />
            <Badge tone={filled >= req.slots ? "success" : "neutral"}>
              {filled} of {req.slots} filled
            </Badge>
            {req.deadline ? <span className="text-muted-foreground">Deadline {fmtDate(req.deadline)}</span> : null}
          </>
        }
        actions={
          <form action={setRequirementStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="returnTo" value={`${base}${tab === "matches" ? "" : `?tab=${tab}`}`} />
            <label className="text-[13px] text-muted-foreground" htmlFor="req-status">
              Status
            </label>
            <AutoSubmitSelect id="req-status" name="status" defaultValue={req.status} className="control h-8 w-auto text-[13px]">
              {REQUIREMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </AutoSubmitSelect>
            <noscript>
              <button className="text-sm">Save</button>
            </noscript>
          </form>
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Tabs
        tabs={[
          { href: base, label: "Matches", active: tab === "matches" },
          { href: `${base}?tab=submissions`, label: "Submissions", active: tab === "submissions", count: subs.length },
          { href: `${base}?tab=details`, label: "Details", active: tab === "details" },
          { href: `${base}?tab=edit`, label: "Edit", active: tab === "edit" },
        ]}
      />
      {tab === "matches" ? <MatchesTab id={id} /> : null}
      {tab === "submissions" ? <SubmissionsTab id={id} subs={subs} /> : null}
      {tab === "details" ? <DetailsTab id={id} /> : null}
      {tab === "edit" ? <EditTab id={id} /> : null}
    </>
  );
}

async function MatchesTab({ id }: { id: string }) {
  const db = await getDb();
  const { req } = (await getRequirement(db, id))!;
  const { ranked, excluded, excludedTotal, pool } = await candidatesFor(db, req);
  return (
    <Stack>
      <Notice tone="info">
        Ranked out of 100: must-have skills {WEIGHTS.skills}, domain {WEIGHTS.domain}, years {WEIGHTS.years}, availability {WEIGHTS.availability}, status {WEIGHTS.status}, degree {WEIGHTS.degree}, nice-to-have {WEIGHTS.nice}, CV consent {WEIGHTS.consent}. Blocked locations, &quot;do not contact&quot; and inactive people are left out. People already on this requirement are on the Submissions tab.
      </Notice>
      <Section title={`Best matches (${ranked.length})`} description={`${pool} people share a skill or the domain.`} flush>
        {ranked.length ? (
          <form action={shortlist}>
            <input type="hidden" name="requirementId" value={id} />
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <SubmitButton size="sm" variant="secondary" pendingText="Adding...">
                Shortlist ticked
              </SubmitButton>
              <span className="text-xs text-muted-foreground">Shortlisting doesn&apos;t send anything. Submitting to the partner needs CV consent.</span>
            </div>
            <Table>
              <THead>
                <Th className="w-8">
                  <SelectAll />
                </Th>
                <Th>Expert</Th>
                <Th>Score</Th>
                <Th>Why</Th>
                <Th />
              </THead>
              <TBody>
                {ranked.map((m) => (
                  <Tr key={m.expertId}>
                    <Td>
                      <input type="checkbox" name="ids" value={m.expertId} aria-label={`Select ${m.expert.fullName}`} className="h-4 w-4 rounded-sm align-middle" />
                    </Td>
                    <Td className="min-w-48">
                      <Link href={`/experts/${m.expertId}`} className="font-medium text-foreground hover:text-primary">
                        {m.expert.fullName}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {[m.expert.domain, m.expert.country].filter(Boolean).join(" · ") || "–"}
                      </div>
                    </Td>
                    <Td>
                      <ScoreBar score={m.score} />
                    </Td>
                    <Td className="min-w-80">
                      <ReasonChips reasons={m.reasons} />
                    </Td>
                    <Td className="text-right">
                      <button name="one" value={m.expertId} className="inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/[0.07]">
                        Shortlist
                      </button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </form>
        ) : (
          <EmptyState title="No matches yet" description="Nobody shares a must-have skill or the domain. Loosen the requirement on the Edit tab, or add experts." />
        )}
      </Section>
      {excludedTotal ? (
        <details className="rounded-md border border-border bg-card">
          <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium text-foreground">Left out ({excludedTotal}): location rules</summary>
          <ul className="divide-y divide-border border-t border-border">
            {excluded.map((m) => (
              <li key={m.expertId} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                <Link href={`/experts/${m.expertId}`} className="text-foreground hover:text-primary">
                  {m.expert.fullName}
                </Link>
                <span className="text-xs text-danger">{m.excludedBecause.join("; ")}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Stack>
  );
}

async function SubmissionsTab({ id, subs }: { id: string; subs: Awaited<ReturnType<typeof listSubmissions>> }) {
  const db = await getDb();
  const { plan } = await rosterFor(db, id);
  const returnTo = `/requirements/${id}?tab=submissions`;
  return (
    <Stack>
      <Section title="Submissions" description="Every change is logged. Moving someone to Submitted needs their CV consent." flush>
        {subs.length ? (
          <Table>
            <THead>
              <Th>Expert</Th>
              <Th>Score</Th>
              <Th>CV consent</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              <Th />
            </THead>
            <TBody>
              {subs.map((s) => (
                <Tr key={s.sub.id}>
                  <Td className="min-w-44">
                    <Link href={`/experts/${s.sub.expertId}`} className="font-medium text-foreground hover:text-primary">
                      {s.expertName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{s.expertCountry ?? "–"}</div>
                  </Td>
                  <Td className="tabular">{s.sub.score ?? "–"}</Td>
                  <Td>
                    <StatusBadge value={s.cvConsent} />
                  </Td>
                  <Td className="min-w-96">
                    <SubmissionStatusForm id={s.sub.id} status={s.sub.status} cvConsent={s.cvConsent} expertStatus={s.expertStatus} expertName={s.expertName} partnerNote={s.sub.partnerNote} returnTo={returnTo} />
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDate(s.sub.submittedAt)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {s.sub.status === "approved" ? (
                      <ButtonLink href={`/placements/new?submission=${s.sub.id}`} size="sm" variant="primary">
                        Create placement
                      </ButtonLink>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="Nobody shortlisted yet" description="Pick people on the Matches tab, or from the Experts list." action={<ButtonLink href={`/requirements/${id}`}>See matches</ButtonLink>} />
        )}
      </Section>

      <Section
        title="Export roster for the partner"
        description="CSV columns: Name, Email, Country, City, Phone, Years of professional experience, LinkedIn profile URL, Résumé filename, Notes. Only people with CV consent = yes are included."
        actions={
          plan.included.length ? (
            <>
              <ButtonLink href={`/api/requirements/${id}/roster?format=csv`} size="sm">
                <Download className="h-3.5 w-3.5" /> Roster CSV
              </ButtonLink>
              <ButtonLink href={`/api/requirements/${id}/roster?format=zip`} size="sm">
                <FileArchive className="h-3.5 w-3.5" /> CVs (ZIP)
              </ButtonLink>
            </>
          ) : null
        }
      >
        <div className="space-y-3 text-sm">
          {plan.included.length ? (
            <p className="text-foreground/80">
              Included ({plan.included.length}): {plan.included.map((l) => l.expert.fullName).join(", ")}
            </p>
          ) : (
            <p className="text-muted-foreground">Nobody can be exported yet.</p>
          )}
          {plan.missingCv.length ? <Notice tone="warning">No CV on file for {plan.missingCv.join(", ")}: their row has an empty Résumé filename.</Notice> : null}
          {plan.skipped.length ? (
            <Notice tone="warning" title={`Left out (${plan.skipped.length})`}>
              <ul className="list-inside list-disc">
                {plan.skipped.map((s) => (
                  <li key={s.name}>
                    {s.name}: {s.reason}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      </Section>
    </Stack>
  );
}

async function DetailsTab({ id }: { id: string }) {
  const db = await getDb();
  const { req, partner } = (await getRequirement(db, id))!;
  const activity = await activityFor(db, "requirement", id, 50);
  return (
    <Stack>
      <Section title="What they need">
        <DefinitionList
          items={[
            { label: "Partner", value: partner.name },
            { label: "Reference", value: req.externalRef },
            { label: "Slots", value: req.slots },
            { label: "Must-have skills", value: req.mustSkills.length ? <Chips items={req.mustSkills} max={30} tone="info" /> : null },
            { label: "Nice-to-have", value: req.niceSkills.length ? <Chips items={req.niceSkills} max={30} /> : null },
            { label: "Domains", value: req.domains.join(", ") || "Any" },
            { label: "Degree", value: req.degrees.length ? req.degrees.map(label).join(" or ") : "Any" },
            { label: "Minimum years", value: req.minYears ?? "Any" },
            { label: "Allowed countries", value: req.countriesAllowed.map(placeLabel).join(", ") || "Anywhere" },
            { label: "Blocked", value: req.countriesBlocked.map(placeLabel).join(", ") || "None" },
            { label: "Deadline", value: fmtDate(req.deadline) },
            { label: "Rate note (internal)", value: req.rateNote },
            { label: "Created", value: `${fmtDate(req.createdAt)}${req.createdBy ? ` by ${req.createdBy}` : ""}` },
          ]}
        />
        {req.description ? <pre className="prose-box mt-6">{req.description}</pre> : null}
      </Section>
      <Section title="Activity">
        <ActivityList items={activity} showEntity={false} />
      </Section>
    </Stack>
  );
}

async function EditTab({ id }: { id: string }) {
  const db = await getDb();
  const { req } = (await getRequirement(db, id))!;
  const partners = await listPartners(db);
  return (
    <Section>
      <RequirementForm
        id={id}
        cancelHref={`/requirements/${id}?tab=details`}
        partners={partners.map((p) => ({ id: p.id, name: p.name }))}
        initial={{
          partnerId: req.partnerId,
          newPartner: "",
          title: req.title,
          externalRef: req.externalRef ?? "",
          description: req.description ?? "",
          mustSkills: req.mustSkills.join(", "),
          niceSkills: req.niceSkills.join(", "),
          domains: req.domains,
          degrees: req.degrees,
          countriesAllowed: req.countriesAllowed.join(", "),
          countriesBlocked: req.countriesBlocked.join(", "),
          minYears: req.minYears != null ? String(req.minYears) : "",
          slots: String(req.slots),
          rateNote: req.rateNote ?? "",
          deadline: req.deadline ?? "",
          status: req.status,
        }}
      />
    </Section>
  );
}

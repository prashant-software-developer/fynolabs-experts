import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check } from "@/components/icons";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { fmtDate } from "@/lib/format";
import { isUuid } from "@/lib/server/experts";
import { ownApplication } from "@/lib/server/portal";
import { PortalCard, PortalHeader, PortalSectionTitle } from "@/components/portal/page";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Application" };

// Where an application can go, in order, as the expert sees it. Not selected and Withdrawn end it early.
const STEPS = [
  { key: "new", label: "Received" },
  { key: "reviewing", label: "In review" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "submitted_to_partner", label: "Profile shared for the role" },
  { key: "hired", label: "Selected" },
] as const;

const NEXT: Record<string, string> = {
  new: "We've got it. The team reviews every application; you'll hear from us by email.",
  reviewing: "The team is looking at your profile and answers now.",
  shortlisted: "You're on the shortlist. We may ask for a short screening or a trial task.",
  submitted_to_partner: "We've shared your profile for this role (only with your consent). We'll tell you what they say.",
  hired: "You've been selected. Check Home and Documents for your next steps.",
  rejected: "Not selected this time. Your profile stays with us for other roles that fit.",
  withdrawn: "You withdrew this application.",
};

/** One application: the role, where it stands (a step list), what happens next, and the answers given. */
export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await portalContext(`/me/applications/${id}`);
  if (ctx.kind !== "expert") return null;
  if (!isUuid(id)) notFound();
  const a = await ownApplication(await getDb(), ctx.expertId, id);
  if (!a) notFound();
  const ended = a.status === "rejected" || a.status === "withdrawn";
  const at = STEPS.findIndex((s) => s.key === a.status);
  return (
    <>
      <Link href="/me?tab=applications" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Applications
      </Link>
      <PortalHeader
        title={a.title}
        subtitle={`Applied ${fmtDate(a.createdAt)}${a.updatedAt && a.updatedAt.getTime() - a.createdAt.getTime() > 60_000 ? ` · updated ${fmtDate(a.updatedAt)}` : ""}`}
        aside={<Badge tone={a.status === "hired" ? "success" : ended ? "muted" : "neutral"}>{a.statusLabel}</Badge>}
        action={
          a.roleHref ? (
            <Link href={a.roleHref} className={buttonClass("secondary", "sm")}>
              {a.roleOpen ? "View the role" : "View the role (closed)"} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : undefined
        }
      />

      <div className="space-y-10">
        <section aria-labelledby="where">
          <PortalSectionTitle>
            <span id="where">Where it stands</span>
          </PortalSectionTitle>
          <PortalCard className="p-5 sm:p-6">
            <ol className="space-y-4">
              {(ended ? STEPS.slice(0, 1) : STEPS).map((s, i) => {
                const done = ended || i < at;
                const current = !ended && i === at;
                return (
                  <li key={s.key} className="flex items-center gap-3">
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px]", done ? "border-foreground bg-foreground text-background" : current ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")} aria-hidden>
                      {done ? <Check className="h-3 w-3" weight="bold" /> : i + 1}
                    </span>
                    <span className={cn("text-sm", current ? "font-medium text-foreground" : done ? "text-foreground/80" : "text-muted-foreground")}>
                      {s.label}
                      {current ? <span className="sr-only"> (current)</span> : null}
                    </span>
                  </li>
                );
              })}
              {ended ? (
                <li className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-[11px] text-muted-foreground" aria-hidden>
                    –
                  </span>
                  <span className="text-sm font-medium text-foreground">{a.statusLabel}</span>
                </li>
              ) : null}
            </ol>
            <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">{NEXT[a.status] ?? NEXT.new}</p>
          </PortalCard>
        </section>

        <section aria-labelledby="answers">
          <PortalSectionTitle count={a.answers.length}>
            <span id="answers">Your answers</span>
          </PortalSectionTitle>
          {a.answers.length ? (
            <PortalCard className="overflow-hidden">
              <dl className="divide-y divide-border">
                {a.answers.map((x, i) => (
                  <div key={i} className="px-5 py-4 sm:px-6">
                    <dt className="text-[13px] text-muted-foreground">{x.question}</dt>
                    <dd className="mt-1 text-sm whitespace-pre-line text-foreground">{x.answer}</dd>
                  </div>
                ))}
              </dl>
            </PortalCard>
          ) : (
            <p className="text-sm text-muted-foreground">No answers on file for this application (it came in before the application form, or through the team).</p>
          )}
        </section>
      </div>
    </>
  );
}

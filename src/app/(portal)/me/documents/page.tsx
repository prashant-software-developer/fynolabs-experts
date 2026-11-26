import Link from "next/link";
import { FileSignature } from "lucide-react";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { todayIST } from "@/lib/crm/dates";
import { one, type SearchParams } from "@/lib/filters";
import { dueText, istDay, ownDocuments } from "@/lib/server/portal-documents";
import { PortalCard, PortalEmpty, PortalHeader, PortalSectionTitle } from "@/components/portal/page";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FlashFromParams } from "@/components/ui/feedback";

export const metadata = { title: "Documents" };

// One row: the count, then one segment per document (filled = signed).
function Progress({ done, total }: { done: number; total: number }) {
  const complete = done === total;
  return (
    <div className="flex items-center gap-3" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="Documents signed">
      <p className="whitespace-nowrap text-[13px] tabular text-muted-foreground">
        <span className={cn("text-foreground", complete && "text-success")}>{done}</span> of {total} signed
      </p>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1.5 w-6 rounded-full", i < done ? (complete ? "bg-success" : "bg-primary") : "bg-border")} />
        ))}
      </div>
    </div>
  );
}

function Row({ href, title, line, overdue, done }: { href: string; title: string; line: string; overdue?: boolean; done?: boolean }) {
  return (
    <li className="flex items-center gap-4 px-5 py-4 sm:px-6">
      <span className={cn("hidden h-9 w-9 shrink-0 place-items-center rounded-lg sm:grid", done ? "bg-success-soft text-success" : "bg-secondary text-foreground/70")} aria-hidden>
        <FileSignature className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-[15px] text-foreground hover:text-primary">
          {title}
        </Link>
        <p className={cn("text-[13px]", overdue ? "text-warning" : "text-muted-foreground")}>{line}</p>
      </div>
      {done ? <Badge tone="success">Done</Badge> : null}
      <Link href={href} className={buttonClass("secondary", "sm")}>
        View
      </Link>
    </li>
  );
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await portalContext("/me/documents");
  if (ctx.kind !== "expert") return null;
  const { toSign, signed, done, total } = await ownDocuments(await getDb(), ctx.expertId);
  const today = todayIST();
  return (
    <>
      <PortalHeader
        title="Documents"
        subtitle="The NDA, agreements and consents for your work with us. Read each one and sign it here."
        aside={total ? <Progress done={done} total={total} /> : undefined}
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      {total === 0 ? (
        <PortalEmpty title="Nothing to sign" description="When we need your signature on an NDA, an agreement or a consent, it shows up here." />
      ) : (
        // Two separate sections, each a heading with its own list (27 Nov 2026: one box with label rows read as one list).
        <div className="space-y-10">
          <section aria-labelledby="to-sign">
            <PortalSectionTitle count={toSign.length}>
              <span id="to-sign">To sign</span>
            </PortalSectionTitle>
            {toSign.length ? (
              <PortalCard className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {toSign.map((d) => {
                    const line = dueText(d.dueOn, today);
                    return <Row key={d.ref} href={`/me/documents/${d.ref}`} title={d.title} line={line} overdue={line.startsWith("Overdue")} />;
                  })}
                </ul>
              </PortalCard>
            ) : (
              <p className="text-sm text-muted-foreground">All signed. Nothing left to do here.</p>
            )}
          </section>
          <section aria-labelledby="signed">
            <PortalSectionTitle count={signed.length}>
              <span id="signed">Signed</span>
            </PortalSectionTitle>
            {signed.length ? (
              <PortalCard className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {signed.map((d) => (
                    <Row key={d.ref} href={`/me/documents/${d.ref}`} title={d.title} line={d.signedAt ? `Signed ${istDay(d.signedAt)}` : "Signed"} done />
                  ))}
                </ul>
              </PortalCard>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing signed yet. Documents you sign show here, with the date.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}

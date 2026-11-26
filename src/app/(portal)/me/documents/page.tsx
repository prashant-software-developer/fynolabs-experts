import Link from "next/link";
import { FileSignature } from "lucide-react";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { todayIST } from "@/lib/crm/dates";
import { one, type SearchParams } from "@/lib/filters";
import { dueText, istDay, ownDocuments } from "@/lib/server/portal-documents";
import { PortalCard, PortalEmpty, PortalHeader } from "@/components/portal/page";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FlashFromParams } from "@/components/ui/feedback";

export const metadata = { title: "Documents" };

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full space-y-1.5 sm:w-44">
      <div className="h-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="Documents signed">
        <div className={cn("h-1 rounded-full", done === total ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[13px] text-muted-foreground tabular sm:text-right">
        {done} of {total} signed
      </p>
    </div>
  );
}

function Row({ href, title, line, overdue, done }: { href: string; title: string; line: string; overdue?: boolean; done?: boolean }) {
  return (
    <li className="flex items-center gap-4 px-5 py-4 sm:px-6">
      <span className={cn("hidden h-9 w-9 shrink-0 place-items-center rounded-lg sm:grid", done ? "bg-success-soft text-success" : "bg-primary/[0.08] text-primary")} aria-hidden>
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
        <PortalCard className="overflow-hidden">
          <section aria-labelledby="to-sign">
            <h2 id="to-sign" className="eyebrow border-b border-border px-5 py-3 text-muted-foreground sm:px-6">
              To sign{toSign.length ? ` (${toSign.length})` : ""}
            </h2>
            {toSign.length ? (
              <ul className="divide-y divide-border">
                {toSign.map((d) => {
                  const line = dueText(d.dueOn, today);
                  return <Row key={d.ref} href={`/me/documents/${d.ref}`} title={d.title} line={line} overdue={line.startsWith("Overdue")} />;
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-[13px] text-muted-foreground sm:px-6">All signed. Nothing left to do here.</p>
            )}
          </section>
          <section aria-labelledby="signed" className="border-t border-border">
            <h2 id="signed" className="eyebrow border-b border-border px-5 py-3 text-muted-foreground sm:px-6">
              Signed{signed.length ? ` (${signed.length})` : ""}
            </h2>
            {signed.length ? (
              <ul className="divide-y divide-border">
                {signed.map((d) => (
                  <Row key={d.ref} href={`/me/documents/${d.ref}`} title={d.title} line={d.signedAt ? `Signed ${istDay(d.signedAt)}` : "Signed"} done />
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-[13px] text-muted-foreground sm:px-6">Nothing signed yet.</p>
            )}
          </section>
        </PortalCard>
      )}
    </>
  );
}

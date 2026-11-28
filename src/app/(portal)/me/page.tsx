import Link from "next/link";
import { BriefcaseBusiness, ChevronDown, ChevronRight, Mail, Send } from "@/components/icons";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { one, type SearchParams } from "@/lib/filters";
import { ago, fmtDate } from "@/lib/format";
import { ownApplications } from "@/lib/server/portal";
import { homeData, type HomeTask } from "@/lib/server/portal-home";
import { rateText } from "@/lib/server/payouts";
import { PortalCard, PortalEmpty, PortalHeader, PortalTabs } from "@/components/portal/page";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { FlashFromParams } from "@/components/ui/feedback";
import { confirmMyAvailability } from "./actions";

export const metadata = { title: "Home" };

const TABS = ["projects", "invitations", "applications"] as const;
type Tab = (typeof TABS)[number];

function dueText(due: string | null): { text: string; urgent: boolean } | null {
  if (!due) return null;
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, urgent: true };
  if (days === 0) return { text: "Due today", urgent: true };
  return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, urgent: days <= 3 };
}

function TaskCard({ t }: { t: HomeTask }) {
  const due = dueText(t.due);
  return (
    <PortalCard className="flex flex-col p-5">
      {due ? <p className={due.urgent ? "mb-2 text-xs text-danger" : "mb-2 text-xs text-muted-foreground"}>{due.text}</p> : null}
      <h3 className="text-[17px] leading-snug text-foreground">{t.title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {t.form === "confirm-availability" ? (
          <>
            <Link href={t.href} className={buttonClass("ghost", "sm")}>
              Change hours
            </Link>
            <form action={confirmMyAvailability}>
              <SubmitButton size="sm" pendingText="Saving…">
                Still right
              </SubmitButton>
            </form>
          </>
        ) : (
          <Link href={t.href} className={buttonClass("primary", "sm")}>
            {t.cta}
          </Link>
        )}
      </div>
    </PortalCard>
  );
}

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "muted" }> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  ended: { label: "Ended", tone: "muted" },
};

type Project = Awaited<ReturnType<typeof homeData>>["current"][number];

function ProjectRow({ p }: { p: Project }) {
  const s = STATUS[p.status] ?? STATUS.active;
  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4">
      <span className={p.status === "active" ? "grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground" : "grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-foreground/60"} aria-hidden>
        <BriefcaseBusiness className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] text-foreground">{p.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{rateText(p.basis, p.rate, p.currency)}{p.basis === "hourly" ? " · Hourly" : ""}</p>
      </div>
      <p className="hidden text-sm text-muted-foreground sm:block">Updated {ago(p.updatedAt)}</p>
      <Badge tone={s.tone}>{s.label}</Badge>
    </li>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await portalContext("/me");
  if (ctx.kind !== "expert") return null;
  const db = await getDb();
  const [h, apps] = await Promise.all([homeData(db, ctx.expertId), ownApplications(db, ctx.expertId)]);
  const raw = one(sp.tab);
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : h.current.length || h.past.length ? "projects" : h.invites.length ? "invitations" : apps.length ? "applications" : "projects";
  const tabHref = (t: Tab) => (t === "projects" ? "/me" : `/me?tab=${t}`);
  return (
    <>
      <PortalHeader title={`Welcome back, ${h.firstName}!`} />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />

      <section className="mb-12" aria-labelledby="tasks-title">
        <h2 id="tasks-title" className="mb-4 text-[17px] text-muted-foreground">
          Important tasks <span className="tabular">({h.tasks.length})</span>
        </h2>
        {h.tasks.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {h.tasks.map((t) => (
              <TaskCard key={t.key} t={t} />
            ))}
          </div>
        ) : (
          <PortalCard className="px-5 py-5 text-sm text-muted-foreground">You&apos;re all caught up. We&apos;ll put anything that needs you here.</PortalCard>
        )}
      </section>

      <PortalTabs
        label="Your work"
        tabs={[
          { href: tabHref("projects"), label: "Projects", active: tab === "projects", count: h.current.length },
          { href: tabHref("invitations"), label: "Invitations", active: tab === "invitations", count: h.invites.length },
          { href: tabHref("applications"), label: "Applications", active: tab === "applications", count: apps.length },
        ]}
      />

      {tab === "projects" ? (
        <div className="space-y-5">
          {h.current.length ? (
            <PortalCard>
              <ul className="divide-y divide-border">
                {h.current.map((p) => (
                  <ProjectRow key={p.id} p={p} />
                ))}
              </ul>
            </PortalCard>
          ) : (
            <PortalEmpty
              title="No projects yet"
              description="When you're selected for a project, it shows here with your rate and status."
              action={
                <Link href="/me/jobs" className={buttonClass("secondary", "sm")}>
                  Browse open roles
                </Link>
              }
            />
          )}
          {h.past.length ? (
            <details className="group">
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-[15px] text-foreground/80 hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-4 w-4 -rotate-90 transition-transform group-open:rotate-0" aria-hidden />
                Past projects <span className="tabular text-muted-foreground">({h.past.length})</span>
              </summary>
              <PortalCard className="mt-3">
                <ul className="divide-y divide-border">
                  {h.past.map((p) => (
                    <ProjectRow key={p.id} p={p} />
                  ))}
                </ul>
              </PortalCard>
            </details>
          ) : null}
        </div>
      ) : null}

      {tab === "invitations" ? (
        h.invites.length ? (
          <PortalCard>
            <ul className="divide-y divide-border">
              {h.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-foreground/60" aria-hidden>
                    <Mail className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] text-foreground">{i.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Invited {fmtDate(i.createdAt)}
                      {i.closesOn ? ` · Closes ${fmtDate(i.closesOn)}` : ""}
                    </p>
                  </div>
                  <Link href={`/jobs/${i.slug}`} className={buttonClass("primary", "sm")}>
                    View and apply
                  </Link>
                </li>
              ))}
            </ul>
          </PortalCard>
        ) : (
          <PortalEmpty title="No invitations right now" description="When our team thinks a role fits you, the invitation shows here." />
        )
      ) : null}

      {tab === "applications" ? (
        apps.length ? (
          <PortalCard>
            <ul className="divide-y divide-border">
              {apps.map((a) => (
                <li key={a.id} className="relative flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-canvas">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-foreground/60" aria-hidden>
                    <Send className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/me/applications/${a.id}`} className="block truncate text-[16px] text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline">
                      {a.title}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">Applied {fmtDate(a.createdAt)}</p>
                  </div>
                  <Badge tone={a.status === "hired" ? "success" : a.status === "rejected" || a.status === "withdrawn" ? "muted" : "neutral"}>{a.statusLabel}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                </li>
              ))}
            </ul>
          </PortalCard>
        ) : (
          <PortalEmpty
            title="No applications yet"
            description="Apply to an open role and you can follow it here."
            action={
              <Link href="/me/jobs" className={buttonClass("secondary", "sm")}>
                Browse open roles
              </Link>
            }
          />
        )
      ) : null}
    </>
  );
}

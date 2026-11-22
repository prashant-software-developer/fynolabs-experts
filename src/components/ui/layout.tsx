import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "./cn";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  meta?: ReactNode;
}) {
  return (
    <header className="mb-8 space-y-3">
      {back ? (
        <Link href={back.href} className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-3.5 w-3.5" /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">{meta}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="space-y-0.5">
            {title ? <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2> : null}
            {description ? <p className="text-[13px] text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-300">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>;
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{i.label}</dt>
          <dd className="mt-1 break-words text-sm text-slate-800">{i.value ?? <span className="text-slate-400">–</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

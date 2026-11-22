"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { applyCsvImport, previewCsvImport, runJobsSync } from "@/app/(app)/import/actions";
import type { CsvPreview } from "@/lib/server/csv-import";
import type { JobsSyncResult } from "@/lib/server/jobs-sync";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox, Field, Select } from "./ui/field";
import { EmptyState, Notice } from "./ui/feedback";

export function JobsSyncPanel({ available }: { available: boolean }) {
  const [result, setResult] = useState<JobsSyncResult | null>(null);
  const [pending, start] = useTransition();
  if (!available) {
    return <EmptyState title="Jobs-site tables not found" description="This database has no public.xdl_jobs_users table. In production it reads the jobs site's tables in the shared Engine database." />;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => setResult(await runJobsSync(true)))}>
          Preview (no changes)
        </Button>
        <Button disabled={pending} onClick={() => start(async () => setResult(await runJobsSync(false)))}>
          {pending ? "Working..." : "Run sync now"}
        </Button>
      </div>
      {result ? (
        result.ok ? (
          <Notice tone={result.dryRun ? "info" : "success"} title={result.dryRun ? "Preview: nothing was changed" : "Sync finished"}>
            <p>
              {result.users} jobs-site users · <b>{result.created}</b> new · <b>{result.updated}</b> filled in · {result.unchanged} unchanged · {result.duplicates} to review · {result.skipped} skipped
              {result.dryRun ? null : <> · {result.cvsLinked} CVs linked</>}
            </p>
            {result.notes.length ? (
              <ul className="mt-2 list-inside list-disc text-xs">
                {result.notes.slice(0, 20).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            {!result.dryRun ? (
              <Link href="/experts?source=jobs_site" className="mt-2 inline-block font-medium underline">
                See jobs-site experts
              </Link>
            ) : null}
          </Notice>
        ) : (
          <Notice tone="error">{result.message}</Notice>
        )
      ) : null}
    </div>
  );
}

const ACTION_TONE = { create: "success", update: "info", unchanged: "muted", duplicate: "warning", skip: "danger" } as const;
const ACTION_LABEL = { create: "Create", update: "Fill in", unchanged: "No change", duplicate: "Review", skip: "Skip" } as const;

export function CsvImportPanel() {
  const [kind, setKind] = useState("auto");
  const [nameMatch, setNameMatch] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [done, setDone] = useState<Awaited<ReturnType<typeof applyCsvImport>> | null>(null);
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<string>("all");

  const reset = () => {
    setPreview(null);
    setDone(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CSV file" htmlFor="csvfile" hint="In Excel: File > Save As > CSV UTF-8.">
          <input
            id="csvfile"
            type="file"
            accept=".csv,text/csv"
            className="file-control block"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              reset();
              if (!f) return setText(null);
              setFileName(f.name);
              setText(await f.text());
            }}
          />
        </Field>
        <Field label="Format" htmlFor="kind">
          <Select
            id="kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              reset();
            }}
            options={[
              { value: "auto", label: "Detect from the header row" },
              { value: "register", label: "Talent register (Name, Role, Location, Line, Folder...)" },
              { value: "admin_crm", label: "Admin CRM export / other list (Name, Email, LinkedIn...)" },
            ]}
          />
        </Field>
      </div>
      <Checkbox
        checked={nameMatch}
        onChange={(e) => {
          setNameMatch(e.target.checked);
          reset();
        }}
        label="Rows without an email: treat an exact name match as the same person (fills their empty fields)"
      />
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!text || pending} onClick={() => start(async () => { setDone(null); setPreview(await previewCsvImport(kind, text!, nameMatch ? "merge" : "review")); })}>
          {pending && !preview ? "Reading..." : "Preview"}
        </Button>
        {preview?.ok && !done ? (
          <Button disabled={pending || preview.counts.create + preview.counts.update === 0} onClick={() => start(async () => setDone(await applyCsvImport(kind, text!, nameMatch ? "merge" : "review")))}>
            {pending ? "Importing..." : `Import ${preview.counts.create} new, fill ${preview.counts.update}`}
          </Button>
        ) : null}
      </div>

      {done ? (
        done.ok ? (
          <Notice tone="success" title="Import finished">
            {done.created} created · {done.updated} filled in · {done.unchanged} unchanged · {done.duplicates} left for review · {done.skipped} skipped.{" "}
            <Link href={`/experts?source=${done.kind}`} className="font-medium underline">
              See them
            </Link>
          </Notice>
        ) : (
          <Notice tone="error">{done.message}</Notice>
        )
      ) : null}

      {preview && !preview.ok ? <Notice tone="error">{preview.message}</Notice> : null}
      {preview?.ok ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{fileName}: read as {preview.kind === "register" ? "Talent register" : "Admin CRM / list"} ·</span>
            {(["all", "create", "update", "unchanged", "duplicate", "skip"] as const).map((a) => (
              <button key={a} onClick={() => setFilter(a)} className={`inline-flex h-6 items-center rounded-md px-2 text-xs transition-colors ${filter === a ? "bg-foreground text-background" : "bg-secondary text-foreground/80 hover:bg-accent"}`}>
                {a === "all" ? `All ${preview.rows.length}` : `${ACTION_LABEL[a]} ${preview.counts[a]}`}
              </button>
            ))}
          </div>
          {preview.kind === "admin_crm" ? (
            <p className="text-xs text-muted-foreground">
              Columns used: {Object.entries(preview.mapped).map(([h, f]) => `${h} → ${f}`).join(" · ") || "none"}. Other columns are ignored.
            </p>
          ) : null}
          {preview.parseErrors.length ? <Notice tone="warning">{preview.parseErrors.join(" · ")}</Notice> : null}
          <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="eyebrow sticky top-0 border-b border-border bg-background text-muted-foreground">
                <tr>
                  <th className="h-9 px-3 font-normal">Row</th>
                  <th className="h-9 px-3 font-normal">Name</th>
                  <th className="h-9 px-3 font-normal">Action</th>
                  <th className="h-9 px-3 font-normal">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows
                  .filter((r) => filter === "all" || r.action === filter)
                  .map((r) => (
                    <tr key={r.row}>
                      <td className="tabular px-3 py-2 text-muted-foreground">{r.row}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{r.name}</div>
                        {r.email ? <div className="text-xs text-muted-foreground">{r.email}</div> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground/70">
                        {r.reason}
                        {r.warnings.length ? <div className="text-warning">{r.warnings.join("; ")}</div> : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

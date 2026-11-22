import Link from "next/link";
import { ExternalLink, Mail, MapPin } from "lucide-react";
import type { ExpertRow } from "@/lib/server/experts";
import { label } from "@/lib/constants";
import { place } from "@/lib/format";
import { Chips, StatusBadge } from "./ui/badge";
import { DefinitionList } from "./ui/layout";

/** The quick view used in the slide-over panel and at the top of the profile. */
export function ExpertSummary({ e, compact }: { e: ExpertRow; compact?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {e.headline ? <p className="text-sm text-slate-700">{e.headline}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={e.status} />
          <StatusBadge value={e.availability} />
          <StatusBadge value={e.cvConsent} prefix="CV consent:" />
          {e.domain ? <span className="text-xs text-slate-500">{e.domain}</span> : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {place(e)}
          </span>
          {e.email ? (
            <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1 hover:text-slate-900">
              <Mail className="h-3.5 w-3.5" />
              {e.email}
            </a>
          ) : null}
          {e.linkedinUrl ? (
            <a href={e.linkedinUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-slate-900">
              <ExternalLink className="h-3.5 w-3.5" />
              LinkedIn
            </a>
          ) : null}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Skills</div>
        <Chips items={e.skills} max={compact ? 12 : 40} tone="blue" />
      </div>
      <DefinitionList
        items={[
          { label: "Years", value: e.yearsExperience ?? null },
          { label: "Degree", value: e.highestDegree },
          { label: "Field of study", value: e.fieldOfStudy },
          { label: "University", value: e.university },
          { label: "Hours / week", value: e.hoursPerWeek ?? null },
          { label: "Languages", value: e.languages.length ? e.languages.join(", ") : null },
          ...(compact ? [] : [{ label: "Rate expectation (internal)", value: e.rateExpectationUsd != null ? `$${e.rateExpectationUsd}/h` : null }]),
          { label: "Source", value: label(e.primarySource) },
          { label: "Tags", value: e.tags.length ? <Chips items={e.tags} /> : null },
        ]}
      />
      {compact ? (
        <Link href={`/experts/${e.id}`} className="inline-block text-sm font-medium text-accent hover:underline">
          Open full profile
        </Link>
      ) : null}
    </div>
  );
}

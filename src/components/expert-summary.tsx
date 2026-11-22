import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import type { ExpertRow } from "@/lib/server/experts";
import { label } from "@/lib/constants";
import { place } from "@/lib/format";
import { Chips, StatusBadge } from "./ui/badge";
import { DefinitionList } from "./ui/layout";

/** The quick view used in the slide-over panel and at the top of the profile. */
/**
 * `e` must already be the role's visible copy (visibleExpert): money removed, contact masked.
 * `money` shows the internal rate row; `contact` turns the email into a mail link.
 */
export function ExpertSummary({ e, compact, money = false, contact = true }: { e: ExpertRow; compact?: boolean; money?: boolean; contact?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {e.headline ? <p className="text-sm text-foreground/80">{e.headline}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={e.status} />
          <StatusBadge value={e.availability} />
          <StatusBadge value={e.cvConsent} prefix="CV consent:" />
          {e.domain ? <span className="text-xs text-muted-foreground">{e.domain}</span> : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {place(e)}
          </span>
          {e.email ? (
            contact ? (
              <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Mail className="h-3.5 w-3.5" />
                {e.email}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1" title="Masked for your role">
                <Mail className="h-3.5 w-3.5" />
                {e.email}
              </span>
            )
          ) : null}
          {e.phone ? (
            <span className="tabular inline-flex items-center gap-1" title={contact ? undefined : "Masked for your role"}>
              <Phone className="h-3.5 w-3.5" />
              {e.phone}
            </span>
          ) : null}
          {e.linkedinUrl ? (
            <a href={e.linkedinUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
              LinkedIn
            </a>
          ) : null}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2 text-muted-foreground">Skills</div>
        <Chips items={e.skills} max={compact ? 12 : 40} />
      </div>
      <DefinitionList
        items={[
          { label: "Years", value: e.yearsExperience ?? null },
          { label: "Degree", value: e.highestDegree },
          { label: "Field of study", value: e.fieldOfStudy },
          { label: "University", value: e.university },
          { label: "Hours / week", value: e.hoursPerWeek ?? null },
          { label: "Languages", value: e.languages.length ? e.languages.join(", ") : null },
          ...(compact || !money ? [] : [{ label: "Rate expectation (internal)", value: e.rateExpectationUsd != null ? `$${e.rateExpectationUsd}/h` : null }]),
          { label: "Source", value: label(e.primarySource) },
          { label: "Tags", value: e.tags.length ? <Chips items={e.tags} /> : null },
        ]}
      />
    </div>
  );
}

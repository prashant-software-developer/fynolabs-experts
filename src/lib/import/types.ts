import type { Availability, CvConsent, ExpertStatus, Source } from "@/lib/constants";

/** One incoming person, already cleaned, before we decide whether to create or update. */
export type ExpertDraft = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  linkedinUrl: string | null;
  headline: string | null;
  domain: string | null;
  skills: string[];
  languages: string[];
  yearsExperience: number | null;
  highestDegree: string | null;
  fieldOfStudy: string | null;
  university: string | null;
  hoursPerWeek: number | null;
  availability: Availability | null;
  rateExpectationUsd: number | null;
  status: ExpertStatus | null;
  cvConsent: CvConsent | null;
  notes: string | null;
  tags: string[];
};

export type DraftRow = {
  row: number;
  source: Source;
  externalId: string | null;
  draft: ExpertDraft;
  warnings: string[];
};

export function emptyDraft(): ExpertDraft {
  return {
    fullName: null,
    email: null,
    phone: null,
    country: null,
    region: null,
    city: null,
    linkedinUrl: null,
    headline: null,
    domain: null,
    skills: [],
    languages: [],
    yearsExperience: null,
    highestDegree: null,
    fieldOfStudy: null,
    university: null,
    hoursPerWeek: null,
    availability: null,
    rateExpectationUsd: null,
    status: null,
    cvConsent: null,
    notes: null,
    tags: [],
  };
}

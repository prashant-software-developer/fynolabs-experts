import { PLACEMENT_BASIS, PLACEMENT_STATUSES, isOneOf } from "@/lib/constants";
import { cleanLongText, cleanText, isoDate, toInt, toMoney } from "@/lib/normalize";
import type { PlacementInput } from "@/lib/server/placements";

export type PlacementFormValues = Record<
  "expertId" | "partnerId" | "submissionId" | "projectName" | "startDate" | "endDate" | "basis" | "rateToExpert" | "rateFromPartner" | "currency" | "hoursApproved" | "tasksAccepted" | "earnedByExpert" | "revenue" | "status" | "notes",
  string
>;

export function parsePlacementForm(fd: FormData): { values: PlacementFormValues; data: PlacementInput | null; errors: Record<string, string> } {
  const s = (k: keyof PlacementFormValues) => String(fd.get(k) ?? "");
  const values = {
    expertId: s("expertId"),
    partnerId: s("partnerId"),
    submissionId: s("submissionId"),
    projectName: s("projectName"),
    startDate: s("startDate"),
    endDate: s("endDate"),
    basis: s("basis") || "hourly",
    rateToExpert: s("rateToExpert"),
    rateFromPartner: s("rateFromPartner"),
    currency: s("currency") || "USD",
    hoursApproved: s("hoursApproved"),
    tasksAccepted: s("tasksAccepted"),
    earnedByExpert: s("earnedByExpert"),
    revenue: s("revenue"),
    status: s("status") || "active",
    notes: s("notes"),
  };
  const errors: Record<string, string> = {};
  const projectName = cleanText(values.projectName, 200);
  if (!projectName) errors.projectName = "Name the project.";
  if (!values.partnerId) errors.partnerId = "Pick the partner.";
  const money = (k: keyof PlacementFormValues) => {
    if (!values[k].trim()) return null;
    const n = toMoney(values[k]);
    if (n == null || n < 0) errors[k] = "A positive number.";
    return n;
  };
  const rateToExpert = money("rateToExpert");
  const rateFromPartner = money("rateFromPartner");
  const hoursApproved = money("hoursApproved");
  const earnedByExpert = money("earnedByExpert");
  const revenue = money("revenue");
  const tasksAccepted = values.tasksAccepted.trim() ? toInt(values.tasksAccepted, 0, 10_000_000) : null;
  if (values.tasksAccepted.trim() && tasksAccepted == null) errors.tasksAccepted = "A whole number.";
  const startDate = values.startDate ? isoDate(values.startDate) : null;
  const endDate = values.endDate ? isoDate(values.endDate) : null;
  if (startDate && endDate && endDate < startDate) errors.endDate = "Ends before it starts.";
  const currency = /^[A-Z]{3}$/.test(values.currency.trim().toUpperCase()) ? values.currency.trim().toUpperCase() : null;
  if (!currency) errors.currency = "Three letters, e.g. USD.";
  if (Object.keys(errors).length || !projectName || !currency) return { values, data: null, errors };
  return {
    values,
    errors,
    data: {
      expertId: values.expertId || null,
      partnerId: values.partnerId,
      submissionId: values.submissionId || null,
      projectName,
      startDate,
      endDate,
      basis: isOneOf(PLACEMENT_BASIS, values.basis) ? values.basis : "hourly",
      rateToExpert,
      rateFromPartner,
      currency,
      hoursApproved,
      tasksAccepted,
      earnedByExpert,
      revenue,
      status: isOneOf(PLACEMENT_STATUSES, values.status) ? values.status : "active",
      notes: cleanLongText(values.notes, 4000),
    },
  };
}

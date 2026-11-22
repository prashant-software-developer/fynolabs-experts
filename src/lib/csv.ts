// CSV in and out. Output opens cleanly in Excel (UTF-8 BOM, CRLF) and is safe against
// spreadsheet formula injection (a cell starting with "=" can't run as a formula).
import Papa from "papaparse";

type Cell = string | number | null | undefined;

const PHONE_LIKE = /^[+-][\d\s().-]+$/;

export function csvCell(value: Cell): string {
  if (value == null) return "";
  let s = String(value);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !PHONE_LIKE.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][], opts: { bom?: boolean } = {}): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  return (opts.bom === false ? "" : "﻿") + lines.join("\r\n") + "\r\n";
}

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[]; errors: string[] };

/** Reads a CSV (comma, semicolon or tab separated) with a header row. */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, "");
  const res = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  const headers = (res.meta.fields ?? []).filter((h) => h !== "");
  const rows = res.data.filter((r) => Object.values(r).some((v) => v && String(v).trim() !== ""));
  const errors = res.errors
    .filter((e) => e.code !== "UndetectableDelimiter")
    .slice(0, 10)
    .map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  return { headers, rows, errors };
}

/** Safe file name for a download ("Jane Doe - CV.pdf"). */
export function safeFilename(name: string, fallback = "file"): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w .()+-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return s || fallback;
}

/** Content-Disposition header that works for non-ASCII names too. */
export function attachmentHeader(filename: string): string {
  const ascii = safeFilename(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

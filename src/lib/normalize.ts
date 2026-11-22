// Small cleaners used by forms and imports so every record is stored the same way.
import { createHash } from "node:crypto";

export function cleanText(raw: unknown, max = 500): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\s+/g, " ").trim();
  if (!s || /^(n\/a|na|none|null|-|–|—)$/i.test(s)) return null;
  return s.slice(0, max);
}

export function cleanLongText(raw: unknown, max = 10_000): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\r\n?/g, "\n").trim();
  return s ? s.slice(0, max) : null;
}

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  const s = cleanText(raw, 254);
  if (!s) return null;
  const e = s.replace(/^mailto:/i, "").toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

/** "linkedin.com/in/Jane-Doe/?trk=x" -> "https://www.linkedin.com/in/jane-doe" */
export function normalizeLinkedin(raw: unknown): string | null {
  const s = cleanText(raw, 300);
  if (!s) return null;
  const m = /(?:^|\/\/|\.)linkedin\.com\/(in|pub|profile\/view)\/([^/?#\s]+)/i.exec(s);
  if (m) {
    let slug = m[2];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* keep as is */
    }
    return `https://www.linkedin.com/${m[1].toLowerCase()}/${slug.toLowerCase()}`;
  }
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^[\w-]{3,100}$/.test(s) && !s.includes("@")) return `https://www.linkedin.com/in/${s.toLowerCase()}`;
  return null;
}

export function normalizePhone(raw: unknown): string | null {
  const s = cleanText(raw, 40);
  if (!s) return null;
  const cleaned = s.replace(/[^\d+()\s.-]/g, "").replace(/\s+/g, " ").trim();
  return /\d{6,}/.test(cleaned.replace(/\D/g, "")) ? cleaned : null;
}

export function toInt(raw: unknown, min: number, max: number): number | null {
  if (raw == null || raw === "") return null;
  const m = /-?\d+(?:\.\d+)?/.exec(String(raw).replace(/,/g, ""));
  if (!m) return null;
  const n = Math.round(Number(m[0]));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function toMoney(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && String(raw).trim() !== "" ? Math.round(n * 100) / 100 : null;
}

export function splitList(raw: unknown, max = 40): string[] {
  if (raw == null) return [];
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[,;\n|]+/);
  const out: string[] = [];
  for (const p of parts) {
    const s = p.replace(/\s+/g, " ").trim();
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeTags(raw: unknown): string[] {
  return splitList(raw, 30).map((t) => t.toLowerCase().replace(/\s+/g, "-").slice(0, 40));
}

export function isoDate(raw: unknown): string | null {
  const s = cleanText(raw, 40);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

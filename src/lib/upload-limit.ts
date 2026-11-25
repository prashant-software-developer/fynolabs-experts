// The one size limit for uploaded files (CVs and job-form attachments), shared by the browser and the
// server. Vercel's standard limit is 4.5 MB for a whole request (file plus the rest of the form), and
// it refuses a larger one before the app sees it, so files stop at 4 MB. Set 26 Nov 2026 (Prashant:
// "keep standard limit"). Larger files would need object storage (Vercel Blob); see the roadmap.
import { bytes } from "@/lib/format";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "4 MB";

/** The hint under an upload box. */
export const UPLOAD_HINT = `PDF or Word, up to ${MAX_UPLOAD_LABEL}.`;

/** Null when the file fits, else what to tell the person. */
export function tooBig(size: number): string | null {
  return size > MAX_UPLOAD_BYTES ? `That file is ${bytes(size)}. Files can be up to ${MAX_UPLOAD_LABEL}: try a PDF, or a smaller export.` : null;
}

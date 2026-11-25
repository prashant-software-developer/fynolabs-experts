// One upload limit everywhere (src/lib/upload-limit.ts): under Vercel's standard 4.5 MB request cap,
// the same in the browser check, the server checks and every hint the app shows.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkFile, MAX_FILE_BYTES } from "@/lib/forms/job-fields";
import { checkCvUpload, MAX_CV_BYTES } from "@/lib/server/cv";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, tooBig } from "@/lib/upload-limit";

const VERCEL_REQUEST_LIMIT = 4.5 * 1024 * 1024;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("the upload limit", () => {
  it("leaves room for the rest of the form under Vercel's 4.5 MB request cap", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(VERCEL_REQUEST_LIMIT - 256 * 1024);
    expect(MAX_UPLOAD_LABEL).toBe(`${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  });

  it("is the same in the browser check and both server checks", () => {
    expect(MAX_FILE_BYTES).toBe(MAX_UPLOAD_BYTES);
    expect(MAX_CV_BYTES).toBe(MAX_UPLOAD_BYTES);
    expect(tooBig(MAX_UPLOAD_BYTES)).toBeNull();
    expect(tooBig(6.2 * 1024 * 1024)).toBe("That file is 6.2 MB. Files can be up to 4 MB: try a PDF, or a smaller export.");
    expect(checkFile({ name: "cv.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/up to 4 MB/);
    expect(checkCvUpload({ name: "cv.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/up to 4 MB/);
    expect(checkCvUpload({ name: "cv.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it("every 'up to N MB' the app says matches it (hints, messages, form templates)", () => {
    const said = filesUnder(path.join(process.cwd(), "src")).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/up to (\d+(?:\.\d+)?) ?MB/gi)].map((m) => `${m[1]} MB in ${path.relative(process.cwd(), f)}`));
    expect(said.length).toBeGreaterThan(5);
    expect(said.filter((s) => !s.startsWith(MAX_UPLOAD_LABEL))).toEqual([]);
  });
});

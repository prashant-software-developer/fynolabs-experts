// The public application endpoint. Anyone may post a job's form here (no account needed).
// With JavaScript the form expects JSON; a plain form post gets a 303 redirect instead.
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { getAccount } from "@/lib/auth/session";
import { answerInputFromFormData } from "@/lib/forms/job-fields";
import { submitApplication, sourceFromParams, type Applicant } from "@/lib/server/applications";
import { getJobBySlug, jobFields } from "@/lib/server/jobs";
import { linkExpertAccount } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim();
  return ip || null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  const back = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
  const reply = (status: number, body: Record<string, unknown>, fallback: string) => (wantsJson ? NextResponse.json(body, { status }) : back(fallback));

  const db = await getDb();
  const job = await getJobBySlug(db, slug);
  if (!job) return reply(404, { ok: false, message: "This job doesn't exist." }, "/");
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return reply(400, { ok: false, message: "The form couldn't be read. Files can be up to 10 MB." }, `/jobs/${slug}?error=${encodeURIComponent("The form couldn't be read. Files can be up to 10 MB.")}#apply`);
  }
  const account = await getAccount();
  let applicant: Applicant = { kind: "guest" };
  if (account?.kind === "expert") {
    const link = await linkExpertAccount(db, account);
    applicant = { kind: "expert", email: account.email, expertId: link.ok ? link.expertId : null };
  }
  const fields = await jobFields(db, job.id);
  const res = await submitApplication(db, {
    job,
    fields,
    answers: await answerInputFromFormData(fd),
    applicant,
    ip: clientIp(req),
    honeypot: typeof fd.get("website") === "string" ? (fd.get("website") as string) : null,
    source: sourceFromParams((k) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : null)),
  });
  const thanks = `/jobs/${slug}/applied`;
  if (res.ok || res.kind === "spam") return reply(200, { ok: true, redirect: thanks }, thanks);
  const status = res.kind === "invalid" ? 422 : res.kind === "rate_limited" ? 429 : res.kind === "closed" ? 409 : 403;
  // Without JavaScript the page can't mark each question, so the message names them.
  const plain =
    res.kind === "invalid" && Object.keys(res.errors).length
      ? `Some answers need a look: ${Object.entries(res.errors)
          .slice(0, 4)
          .map(([id, e]) => `${(fields.find((f) => f.id === id)?.label ?? "a question").slice(0, 60)} (${e.replace(/\.$/, "").toLowerCase()})`)
          .join("; ")}.`
      : res.message;
  return reply(status, { ok: false, message: res.message, ...(res.kind === "invalid" ? { errors: res.errors } : {}) }, `/jobs/${slug}?error=${encodeURIComponent(plain)}#apply`);
}

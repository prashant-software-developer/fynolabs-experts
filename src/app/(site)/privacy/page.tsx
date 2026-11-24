import type { Metadata } from "next";
import { contactEmail, siteName } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  const name = siteName();
  const email = contactEmail();
  const items: [string, string][] = [
    ["What we keep", "What you give us when you apply or fill in your profile: your name, email, phone, country and city, LinkedIn link, skills, experience, education, availability, your CV and your answers to a job's questions. We never ask for ID numbers, dates of birth or bank details on this site."],
    ["Why", `To consider you for the roles you apply to, and to invite you to similar work later. ${name} works with AI data partners; we share your profile and CV with a partner only for roles you apply to, and only if you agreed to that on the form or in your profile.`],
    ["Who sees it", `The ${name} team, with access limited by role. Partners see only the profiles we put forward to them.`],
    ["Your choices", "Change your profile at any time, turn sharing consent on or off, download a copy of your data from your profile, or ask us to delete it. We confirm deletions within 30 days."],
    ["Contact", `Write to ${email} with any question about your data.`],
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3">
        <p className="eyebrow text-primary">{name}</p>
        <h1 className="text-title text-foreground">How we handle your data</h1>
        <p className="text-sm text-muted-foreground">The short version, in plain words.</p>
      </div>
      <dl className="divide-y divide-border rounded-md border border-border bg-card">
        {items.map(([t, d]) => (
          <div key={t} className="space-y-1.5 px-6 py-5">
            <dt className="text-[15px] font-normal text-foreground">{t}</dt>
            <dd className="text-sm leading-relaxed text-foreground/75">{d}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

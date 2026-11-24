import type { Metadata } from "next";

export const metadata: Metadata = { title: "Database not set up", robots: { index: false, follow: false } };

/** Shown instead of the whole app (by the middleware, with status 503) while DATABASE_URL is empty. */
export default function DatabaseNotSetUpPage() {
  return (
    <main className="flex min-h-screen justify-center bg-background px-4 pt-16 pb-16 sm:pt-24">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fynolabs-mark.svg" alt="" width={40} height={40} className="mx-auto h-10 w-10" />
          <p className="eyebrow text-primary">Expert Hub</p>
          <h1 className="text-title text-foreground">Database not set up</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">The app needs its database (the Neon project &quot;expert-hub&quot;). It isn&apos;t connected on this computer yet.</p>
        </div>
        <ol className="space-y-4 rounded-md border border-border bg-card px-6 py-6 text-sm leading-relaxed text-foreground/85 sm:px-8">
          <li className="flex gap-3">
            <span className="tabular w-5 shrink-0 text-primary">1.</span>
            <span>
              Open <span className="text-foreground">neon.tech</span> with the FynoLabs admin account and open the project <span className="text-foreground">expert-hub</span>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="tabular w-5 shrink-0 text-primary">2.</span>
            <span>
              Press <span className="text-foreground">Connect</span>, keep the main branch, and copy the connection string. It starts with <code className="text-small">postgresql://</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="tabular w-5 shrink-0 text-primary">3.</span>
            <span>
              In the Expert Hub folder, open <code className="text-small">.env.local</code> in Notepad (or create it) and add one line: <code className="text-small break-all">DATABASE_URL=the string you copied</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="tabular w-5 shrink-0 text-primary">4.</span>
            <span>Save it, close the Expert Hub window, and start it again.</span>
          </li>
        </ol>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">Keep that string private: it contains a password. Never paste it in Slack or a doc.</p>
      </div>
    </main>
  );
}

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { activity } from "@/db/schema";
import { can, roleLabel } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { jobsTablesExist } from "@/lib/server/jobs-sync";
import { openJobsSource } from "@/lib/server/jobs-source";
import { NoAccess } from "@/components/ui/feedback";
import { ActivityList } from "@/components/activity-list";
import { CsvImportPanel, JobsSyncPanel } from "@/components/import-panels";
import { PageHeader, Section, Stack } from "@/components/ui/layout";

export const metadata = { title: "Import" };

export default async function ImportPage() {
  const user = await requireUser();
  if (!can(user.role, "imports.csv")) {
    return (
      <>
        <PageHeader title="Import" />
        <Section flush>
          <NoAccess what="Import" role={roleLabel(user.role)} />
        </Section>
      </>
    );
  }
  const jobs = can(user.role, "imports.jobs");
  const db = await getDb();
  const { source, separate } = await openJobsSource(db);
  const [available, history] = await Promise.all([
    jobsTablesExist(source).catch(() => false),
    db.select().from(activity).where(and(eq(activity.entityType, "import"))).orderBy(desc(activity.createdAt)).limit(15),
  ]);
  return (
    <>
      <PageHeader title="Import" subtitle="Bring experts in from the jobs site and from spreadsheets. Re-running is safe: nobody is added twice." />
      <Stack>
        <Section
          title="Jobs site (jobs.fynolabs.si)"
          description={`Reads applicants and their latest CV from the jobs site's tables (read only${separate ? ", in the database set as JOBS_DATABASE_URL" : ""}). New people are added; for people already here, only empty fields are filled, so edits made in the hub are never overwritten. ${separate ? "CVs are copied into the hub." : "CVs stay on the jobs site and are streamed when you download them."}`}
        >
          {jobs ? (
            <>
              <JobsSyncPanel available={available} />
              <p className="mt-4 text-xs text-muted-foreground/70">Same as running <code>npm run import:jobs</code>.</p>
            </>
          ) : (
            <p className="text-small text-muted-foreground">Admins run the jobs-site sync. Ask one if new applicants are missing.</p>
          )}
        </Section>
        <Section
          title="Spreadsheet (CSV)"
          description="The Talent register or an export of the old admin CRM. You always see a preview first: what will be created, filled in, or needs a look (possible duplicates)."
        >
          <CsvImportPanel />
        </Section>
        <Section title="Import history">
          <ActivityList items={history} />
        </Section>
      </Stack>
    </>
  );
}

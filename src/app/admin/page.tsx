// The dashboard, as the FynoLabs admin's (Main Website - FyonLabs/src/components/admin/AdminDashboard.tsx):
// eight KPI tiles with line glyphs, each linking to the page behind its number when you may open it,
// then one chart per measure over the same 30 days.
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dataRequests } from "@/db/schema";
import { can } from "@/lib/auth/permissions";
import { openSections } from "@/lib/auth/sections";
import { requireUser } from "@/lib/auth/session";
import { todayIST } from "@/lib/crm/dates";
import { dashboardKpis } from "@/lib/server/crm-dashboard";
import { AdminNotice, AdminPageHeader, AdminStat, AdminStatGrid } from "@/components/admin/kit";
import { LineTrend, StackedTrend } from "@/components/admin/trend-card";
import { ButtonLink } from "@/components/ui/button";
import { NoAccess } from "@/components/ui/feedback";

export const metadata = { title: { absolute: "Dashboard | FynoLabs admin" } };

const DAYS = 30;
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function DashboardPage() {
  const user = await requireUser();
  const open = openSections(user);
  if (!open.dashboard) {
    return (
      <>
        <AdminPageHeader title="Dashboard" />
        <NoAccess what="The dashboard" role={user.role} />
      </>
    );
  }
  const db = await getDb();
  const today = todayIST();
  const [k, deletionRequests] = await Promise.all([dashboardKpis(db, today), db.select({ n: count() }).from(dataRequests).where(eq(dataRequests.status, "open"))]);
  const openDeletions = Number(deletionRequests[0]?.n ?? 0);
  const perDay = k.perDay.map((d) => ({ label: dayLabel(d.day), applications: d.applications, messages: d.messages }));
  const refDays = k.referralSeries.perDay.map(({ day, ...rest }) => ({ label: dayLabel(String(day)), ...rest }));
  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        actions={
          can(user.role, "requirements.create") ? (
            <ButtonLink href="/admin/requirements/new" variant="primary">
              New requirement
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="space-y-6 pb-10">
        {openDeletions ? (
          <AdminNotice>
            {openDeletions} {openDeletions === 1 ? "expert has" : "experts have"} asked us to delete their data. Find them on Experts; delete within 30 days and confirm by email.
          </AdminNotice>
        ) : null}
        <AdminStatGrid columns={4}>
          <AdminStat label="Experts" glyph="people" value={k.experts.toLocaleString("en-GB")} href={open.profiles ? "/admin/experts" : undefined} />
          <AdminStat label="New to review" glyph="funnel" value={k.newToReview.toLocaleString("en-GB")} href={open.profiles ? "/admin/experts?status=applicant" : undefined} />
          <AdminStat label="In a job pipeline" glyph="relay" value={k.inJobPipeline.toLocaleString("en-GB")} href={open.profiles ? "/admin/experts?layout=pipelines" : undefined} />
          <AdminStat label="Active experts" glyph="rising" value={k.activeExperts.toLocaleString("en-GB")} href={open.profiles ? "/admin/experts?status=placed" : undefined} />
          <AdminStat label="Platforms" glyph="grid" value={k.platforms.toLocaleString("en-GB")} href={open.platforms ? "/admin/platforms" : undefined} />
          <AdminStat label="Open messages" glyph="lines" value={k.openMessages.toLocaleString("en-GB")} href={open.messages ? "/admin/messages?tab=open" : undefined} />
          <AdminStat label="Referrals sent" glyph="orbit" value={k.referrals.toLocaleString("en-GB")} href={open["send-referrals"] ? "/admin/referrals" : undefined} />
          <AdminStat label="Visitors, 30 days" glyph="signal" value={k.visitors30.toLocaleString("en-GB")} href={open.analytics ? "/admin/analytics" : undefined} />
        </AdminStatGrid>

        <div className="grid grid-cols-1 gap-4 sm:gap-6">
          <LineTrend title={`Applications · last ${DAYS} days`} data={perDay} dataKey="applications" name="Applications" />
          <LineTrend title={`Messages · last ${DAYS} days`} data={perDay} dataKey="messages" name="Messages" />
          <StackedTrend title={`Referrals · ${k.referralSeries.total} in the last ${DAYS} days, by platform`} data={refDays} series={k.referralSeries.series} />
        </div>
      </div>
    </>
  );
}

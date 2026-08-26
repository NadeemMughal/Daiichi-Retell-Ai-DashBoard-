import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadDashboard } from "@/lib/dashboard/load-dashboard";

export const dynamic = "force-dynamic";

export default async function TenantOverviewPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const data = await loadDashboard(tenantSlug);
  return <DashboardShell data={data} />;
}

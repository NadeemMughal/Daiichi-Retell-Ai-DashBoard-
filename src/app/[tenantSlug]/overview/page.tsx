import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadDashboard } from "@/lib/dashboard/load-dashboard";

export const dynamic = "force-dynamic";

const views = new Set(["Home", "Agents", "Phone Numbers", "Call History", "Chat History", "Contacts", "Analytics", "Team"]);

export default async function TenantOverviewPage({ params, searchParams }: { params: Promise<{ tenantSlug: string }>; searchParams: Promise<{ view?: string }> }) {
  const { tenantSlug } = await params;
  const data = await loadDashboard(tenantSlug);
  const requestedView = (await searchParams).view ?? "Home";
  return <DashboardShell data={data} initialView={views.has(requestedView) ? requestedView : "Home"} />;
}

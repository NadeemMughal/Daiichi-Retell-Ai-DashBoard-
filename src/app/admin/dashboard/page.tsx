import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadOwnerDashboard } from "@/lib/dashboard/load-dashboard";

export const dynamic = "force-dynamic";

const views = new Set(["Overview", "Voice agents", "Calls", "Chat", "Reports", "Team"]);

export default async function OwnerDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const requestedView = (await searchParams).view ?? "Overview";
  const initialView = views.has(requestedView) ? requestedView : "Overview";
  return <DashboardShell data={await loadOwnerDashboard()} initialView={initialView} />;
}

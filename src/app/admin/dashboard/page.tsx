import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadOwnerDashboard } from "@/lib/dashboard/load-dashboard";

export const dynamic = "force-dynamic";

const views = new Set(["Home", "Agents", "Phone Numbers", "Call History", "Chat History", "Contacts", "Analytics", "Team"]);

export default async function OwnerDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const requestedView = (await searchParams).view ?? "Home";
  const initialView = views.has(requestedView) ? requestedView : "Home";
  return <DashboardShell data={await loadOwnerDashboard()} initialView={initialView} />;
}

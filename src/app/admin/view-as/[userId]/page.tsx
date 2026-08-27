import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDashboard } from "@/lib/dashboard/load-dashboard";

export const dynamic = "force-dynamic";

const views = new Set(["Home", "Agents", "Phone Numbers", "Call History", "Chat History", "Contacts", "Analytics", "Team"]);

export default async function ViewAsPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ view?: string }> }) {
  const context = await requireAuthorizationContext();
  requirePermission(context, "members.manage");
  const { userId } = await params;
  const admin = createAdminClient();
  const { data: membership } = await admin.from("tenant_memberships").select("tenants(slug)").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle();
  const tenant = membership && (Array.isArray(membership.tenants) ? membership.tenants[0] : membership.tenants);
  if (!tenant?.slug) return <main className="grid min-h-screen place-items-center p-6"><p>No active client dashboard exists for this user.</p></main>;
  const data = await loadDashboard(tenant.slug, userId);
  const requestedView = (await searchParams).view ?? "Home";
  return <div><div className="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-[#d7f55b] px-4 py-2 text-xs font-bold text-[#123e32]"><Eye className="size-4"/>Viewing dashboard as {data.userName}<Link href="/admin" className="ml-3 inline-flex items-center gap-1 underline"><ArrowLeft className="size-3"/>Exit view</Link></div><DashboardShell data={data} initialView={views.has(requestedView) ? requestedView : "Home"}/></div>;
}

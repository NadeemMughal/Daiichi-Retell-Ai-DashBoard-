import "server-only";
import type { DashboardDataset } from "@/components/dashboard/dashboard-shell";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function loadDashboard(tenantSlug: string): Promise<DashboardDataset> {
  const context = await requireAuthorizationContext(tenantSlug);
  requirePermission(context, "analytics.read");
  if (!context.tenantId) throw new Error("Tenant context is required.");
  const admin = createAdminClient();
  const periodStart = new Date(); periodStart.setUTCDate(periodStart.getUTCDate() - 6); periodStart.setUTCHours(0, 0, 0, 0);
  const [{ data: tenant }, { data: profile }, { data: calls }, { data: assignments }] = await Promise.all([
    admin.from("tenants").select("display_name").eq("id", context.tenantId).single(),
    admin.from("profiles").select("display_name,email").eq("id", context.userId).single(),
    admin.from("calls").select("id,agent_id,status,started_at,duration_ms,outcome,contact_masked").eq("tenant_id", context.tenantId).gte("started_at", periodStart.toISOString()).order("started_at", { ascending: false }).limit(1000),
    admin.from("agent_assignments").select("agent_id,retell_agents(display_name)").eq("tenant_id", context.tenantId).is("valid_to", null)
  ]);
  const rows = calls ?? [];
  const days = Array.from({ length: 7 }, (_, offset) => { const date = new Date(periodStart); date.setUTCDate(date.getUTCDate() + offset); return date; });
  const chart = days.map((date) => {
    const sameDay = rows.filter((call) => call.started_at && dayKey(new Date(call.started_at)) === dayKey(date));
    return { day: date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }), calls: sameDay.length, converted: sameDay.filter((call) => /book|qualif|success|resolved/i.test(call.outcome ?? "")).length };
  });
  const totalSeconds = Math.round(rows.reduce((sum, call) => sum + Number(call.duration_ms ?? 0), 0) / 1000);
  const successful = rows.filter((call) => /book|qualif|success|resolved/i.test(call.outcome ?? "")).length;
  const avgSeconds = rows.length ? Math.round(totalSeconds / rows.length) : 0;
  const agentRows = (assignments ?? []).map((assignment) => {
    const relation = Array.isArray(assignment.retell_agents) ? assignment.retell_agents[0] : assignment.retell_agents;
    const count = rows.filter((call) => call.agent_id === assignment.agent_id).length;
    return { name: relation?.display_name ?? "Assigned agent", calls: count, score: count ? `${Math.round((rows.filter((call) => call.agent_id === assignment.agent_id && call.status === "ended").length / count) * 100)}%` : "—" };
  });
  return {
    tenantName: tenant?.display_name ?? "Client workspace",
    userName: profile?.display_name?.split(" ")[0] ?? profile?.email?.split("@")[0] ?? "there",
    metrics: [
      { label: "Total calls", value: String(rows.length), change: "Live", detail: "last 7 days", positive: true },
      { label: "Successful outcomes", value: String(successful), change: rows.length ? `${Math.round(successful / rows.length * 100)}%` : "0%", detail: "of conversations", positive: true },
      { label: "Avg. duration", value: `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`, change: "Live", detail: "completed calls", positive: true },
      { label: "Active agents", value: String(agentRows.length), change: "Assigned", detail: "to this workspace", positive: true }
    ],
    chart,
    agents: agentRows,
    calls: rows.slice(0, 8).map((call) => ({ contact: call.contact_masked ?? "Caller", number: "Protected contact", agent: agentRows.find((agent, index) => (assignments ?? [])[index]?.agent_id === call.agent_id)?.name ?? "Assigned agent", outcome: call.outcome ?? call.status, duration: `${Math.floor(Number(call.duration_ms ?? 0) / 60000)}:${String(Math.floor(Number(call.duration_ms ?? 0) / 1000) % 60).padStart(2, "0")}`, time: call.started_at ? new Date(call.started_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }) : "—", tone: /book|qualif|success|resolved/i.test(call.outcome ?? "") ? "success" : "warning" }))
  };
}

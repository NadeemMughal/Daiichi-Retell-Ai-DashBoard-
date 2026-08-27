import "server-only";
import type { DashboardDataset } from "@/components/dashboard/dashboard-shell";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

function dayKey(date: Date) { return date.toISOString().slice(0, 10); }

export async function loadDashboard(tenantSlug: string): Promise<DashboardDataset> {
  const context = await requireAuthorizationContext(tenantSlug);
  requirePermission(context, "analytics.read");
  if (!context.tenantId) throw new Error("Tenant context is required.");
  const admin = createAdminClient();
  const periodStart = new Date(); periodStart.setUTCDate(periodStart.getUTCDate() - 6); periodStart.setUTCHours(0, 0, 0, 0);
  const [{ data: tenant }, { data: profile }, { data: calls }, { data: chats }, { data: assignments }, { data: memberships }] = await Promise.all([
    admin.from("tenants").select("display_name").eq("id", context.tenantId).single(),
    admin.from("profiles").select("display_name,email").eq("id", context.userId).single(),
    admin.from("calls").select("id,agent_id,status,started_at,duration_ms,outcome,contact_masked").eq("tenant_id", context.tenantId).gte("started_at", periodStart.toISOString()).order("started_at", { ascending: false }).limit(1000),
    admin.from("chats").select("id,agent_id,status,started_at,ai_message_count,outcome").eq("tenant_id", context.tenantId).gte("started_at", periodStart.toISOString()).order("started_at", { ascending: false }).limit(1000),
    admin.from("agent_assignments").select("agent_id,retell_agents(id,display_name,kind,status)").eq("tenant_id", context.tenantId).is("valid_to", null),
    admin.from("tenant_memberships").select("role,status,profiles(display_name,email)").eq("tenant_id", context.tenantId).neq("status", "removed")
  ]);
  const callRows = calls ?? []; const chatRows = chats ?? [];
  const days = Array.from({ length: 7 }, (_, offset) => { const date = new Date(periodStart); date.setUTCDate(date.getUTCDate() + offset); return date; });
  const chart = days.map((date) => { const sameDay = callRows.filter((call) => call.started_at && dayKey(new Date(call.started_at)) === dayKey(date)); return { day: date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }), calls: sameDay.length, converted: sameDay.filter((call) => /book|qualif|success|resolved/i.test(call.outcome ?? "")).length }; });
  const totalSeconds = Math.round(callRows.reduce((sum, call) => sum + Number(call.duration_ms ?? 0), 0) / 1000);
  const successful = callRows.filter((call) => /book|qualif|success|resolved/i.test(call.outcome ?? "")).length;
  const avgSeconds = callRows.length ? Math.round(totalSeconds / callRows.length) : 0;
  const agentRows = (assignments ?? []).map((assignment) => {
    const relation = Array.isArray(assignment.retell_agents) ? assignment.retell_agents[0] : assignment.retell_agents;
    const callCount = callRows.filter((call) => call.agent_id === assignment.agent_id).length;
    const chatCount = chatRows.filter((chat) => chat.agent_id === assignment.agent_id).length;
    const kind = (relation?.kind ?? "voice") as "voice" | "chat";
    const completed = kind === "chat" ? chatRows.filter((chat) => chat.agent_id === assignment.agent_id && /ended|analyzed/i.test(chat.status)).length : callRows.filter((call) => call.agent_id === assignment.agent_id && /ended|analyzed/i.test(call.status)).length;
    const volume = kind === "chat" ? chatCount : callCount;
    return { id: relation?.id ?? assignment.agent_id, name: relation?.display_name ?? "Assigned agent", kind, calls: callCount, chats: chatCount, score: volume ? `${Math.round(completed / volume * 100)}%` : "—", status: relation?.status ?? "inactive" };
  });
  return {
    tenantName: tenant?.display_name ?? "Client workspace",
    userName: profile?.display_name?.split(" ")[0] ?? profile?.email?.split("@")[0] ?? "there",
    metrics: [
      { label: "Total calls", value: String(callRows.length), change: "Live", detail: "last 7 days", positive: true },
      { label: "Successful outcomes", value: String(successful), change: callRows.length ? `${Math.round(successful / callRows.length * 100)}%` : "0%", detail: "of conversations", positive: true },
      { label: "Avg. duration", value: `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`, change: "Live", detail: "completed calls", positive: true },
      { label: "Active agents", value: String(agentRows.filter((agent) => agent.status === "active").length), change: "Assigned", detail: "to this workspace", positive: true }
    ], chart, agents: agentRows,
    calls: callRows.slice(0, 100).map((call) => ({ contact: call.contact_masked ?? "Caller", number: "Protected contact", agent: agentRows.find((agent) => agent.id === call.agent_id)?.name ?? "Assigned agent", outcome: call.outcome ?? call.status, duration: `${Math.floor(Number(call.duration_ms ?? 0) / 60000)}:${String(Math.floor(Number(call.duration_ms ?? 0) / 1000) % 60).padStart(2, "0")}`, time: call.started_at ? new Date(call.started_at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—", tone: /book|qualif|success|resolved/i.test(call.outcome ?? "") ? "success" : "warning" })),
    chats: chatRows.slice(0, 100).map((chat) => ({ id: chat.id, agent: agentRows.find((agent) => agent.id === chat.agent_id)?.name ?? "Assigned agent", outcome: chat.outcome ?? "No outcome yet", messages: chat.ai_message_count, time: chat.started_at ? new Date(chat.started_at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—", status: chat.status })),
    team: (memberships ?? []).map((membership) => { const member = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles; return { name: member?.display_name ?? "Workspace member", email: member?.email ?? "", role: membership.role, status: membership.status }; }),
    lastSyncedAt: new Date().toISOString()
  };
}

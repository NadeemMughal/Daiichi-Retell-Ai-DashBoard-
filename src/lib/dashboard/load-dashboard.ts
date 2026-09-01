import "server-only";
import { notFound } from "next/navigation";
import type { DashboardDataset } from "@/components/dashboard/dashboard-shell";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { applyPermissionOverrides, applyTenantDataFlags, dashboardViewsForPermissions, permissionsForTenantRole, type TenantRole } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRetellPhoneNumbers } from "@/lib/retell/client";

function dayKey(date: Date) { return date.toISOString().slice(0, 10); }

export async function loadOwnerDashboard(): Promise<DashboardDataset> {
  const context = await requireAuthorizationContext();
  requirePermission(context, "platform.manage");
  const admin = createAdminClient();
  const periodStart = new Date(); periodStart.setUTCDate(periodStart.getUTCDate() - 29); periodStart.setUTCHours(0, 0, 0, 0);
  const [profileResult, agentsResult, callsResult, chatsResult, membershipsResult] = await Promise.all([
    admin.from("profiles").select("display_name,email").eq("id", context.userId).single(),
    admin.from("retell_agents").select("id,provider_agent_id,display_name,kind,status,provider_version,provider_updated_at").eq("status", "active").order("display_name"),
    admin.from("calls").select("id,provider_call_id,agent_id,status,direction,started_at,duration_ms,outcome,contact_masked,contact_unmasked,provider_cost_minor,disconnection_reason,sentiment").not("provider_call_id", "like", "sample_%").gte("started_at", periodStart.toISOString()).order("started_at", { ascending: false }).limit(5000),
    admin.from("chats").select("id,provider_chat_id,agent_id,status,started_at,ai_message_count,outcome,provider_cost_minor,sentiment").not("provider_chat_id", "like", "sample_%").gte("started_at", periodStart.toISOString()).order("started_at", { ascending: false }).limit(5000),
    admin.from("tenant_memberships").select("role,status,member:profiles!tenant_memberships_user_id_fkey(display_name,email)").neq("status", "removed")
  ]);
  const failedQuery = [profileResult, agentsResult, callsResult, chatsResult, membershipsResult].find((result) => result.error);
  if (failedQuery?.error) throw new Error(`Owner dashboard unavailable: ${failedQuery.error.code}`);
  const profile = profileResult.data;
  const agents = agentsResult.data ?? [];
  const phoneNumbers = await listRetellPhoneNumbers().catch(() => []);
  const activeAgentIds = new Set(agents.map((agent) => agent.id));
  const callRows = (callsResult.data ?? []).filter((call) => activeAgentIds.has(call.agent_id));
  for (const call of callRows) call.contact_masked = call.contact_unmasked ?? call.contact_masked;
  const chatRows = (chatsResult.data ?? []).filter((chat) => activeAgentIds.has(chat.agent_id));
  const chartStart = new Date(); chartStart.setUTCDate(chartStart.getUTCDate() - 6); chartStart.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, offset) => { const date = new Date(chartStart); date.setUTCDate(date.getUTCDate() + offset); return date; });
  const chart = days.map((date) => { const sameDay = callRows.filter((call) => call.started_at && dayKey(new Date(call.started_at)) === dayKey(date)); return { day: date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }), calls: sameDay.length, converted: sameDay.filter((call) => /book|qualif|success|resolved/i.test(call.outcome ?? "")).length }; });
  const successful = callRows.filter((call) => /book|qualif|success|resolved/i.test(call.outcome ?? "")).length;
  const totalSeconds = Math.round(callRows.reduce((sum, call) => sum + Number(call.duration_ms ?? 0), 0) / 1000);
  const avgSeconds = callRows.length ? Math.round(totalSeconds / callRows.length) : 0;
  const agentRows = agents.map((agent) => {
    const callCount = callRows.filter((call) => call.agent_id === agent.id).length;
    const chatCount = chatRows.filter((chat) => chat.agent_id === agent.id).length;
    const kind = agent.kind as "voice" | "chat";
    const completed = kind === "chat" ? chatRows.filter((chat) => chat.agent_id === agent.id && /ended|analyzed/i.test(chat.status)).length : callRows.filter((call) => call.agent_id === agent.id && /ended|analyzed/i.test(call.status)).length;
    const volume = kind === "chat" ? chatCount : callCount;
    return { id: agent.id, providerId: agent.provider_agent_id, version: agent.provider_version ?? undefined, name: agent.display_name, kind, calls: callCount, chats: chatCount, score: volume ? `${Math.round(completed / volume * 100)}%` : "—", status: agent.status, modifiedAt: agent.provider_updated_at ?? undefined };
  });
  return {
    tenantName: "Daiichi Technologies",
    userName: profile?.display_name?.split(" ")[0] ?? profile?.email?.split("@")[0] ?? "Nadeem",
    metrics: [
      { label: "Total calls", value: String(callRows.length), change: "Live", detail: "all agents · last 7 days", positive: true },
      { label: "Successful outcomes", value: String(successful), change: callRows.length ? `${Math.round(successful / callRows.length * 100)}%` : "0%", detail: "of conversations", positive: true },
      { label: "Avg. duration", value: `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`, change: "Live", detail: "completed calls", positive: true },
      { label: "Active agents", value: String(agentRows.length), change: "Global", detail: "voice and chat", positive: true }
    ], chart,
    agents: agentRows,
    calls: callRows.slice(0, 100).map((call) => ({ contact: call.contact_masked ?? "Caller", number: "Protected contact", agentId: call.agent_id, agent: agentRows.find((agent) => agent.id === call.agent_id)?.name ?? "Retell agent", outcome: call.outcome ?? call.status, duration: `${Math.floor(Number(call.duration_ms ?? 0) / 60000)}:${String(Math.floor(Number(call.duration_ms ?? 0) / 1000) % 60).padStart(2, "0")}`, time: call.started_at ? new Date(call.started_at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—", startedAt: call.started_at ?? undefined, tone: /book|qualif|success|resolved/i.test(call.outcome ?? "") ? "success" : "warning", sessionId: call.provider_call_id, channel: call.direction ?? "phone_call", cost: call.provider_cost_minor == null ? "—" : `$${(Number(call.provider_cost_minor) / 100).toFixed(3)}`, endReason: call.disconnection_reason ?? undefined, sentiment: call.sentiment ?? undefined, status: call.status })),
    chats: chatRows.slice(0, 100).map((chat) => ({ id: chat.id, agentId: chat.agent_id, agent: agentRows.find((agent) => agent.id === chat.agent_id)?.name ?? "Retell agent", outcome: chat.outcome ?? "No outcome yet", messages: chat.ai_message_count, time: chat.started_at ? new Date(chat.started_at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—", startedAt: chat.started_at ?? undefined, status: chat.status, sessionId: chat.provider_chat_id, cost: chat.provider_cost_minor == null ? "—" : `$${(Number(chat.provider_cost_minor) / 100).toFixed(3)}`, sentiment: chat.sentiment ?? undefined })),
    team: (membershipsResult.data ?? []).map((membership) => { const member = Array.isArray(membership.member) ? membership.member[0] : membership.member; return { name: member?.display_name ?? "Workspace member", email: member?.email ?? "", role: membership.role, status: membership.status }; }),
    lastSyncedAt: new Date().toISOString(),
    allowedViews: dashboardViewsForPermissions(context.permissions),
    phoneNumbers,
    permissions: [...context.permissions],
    effectiveRole: context.effectiveRole ?? "admin"
  };
}

export async function loadDashboard(tenantSlug: string, effectiveUserId?: string): Promise<DashboardDataset> {
  const context = await requireAuthorizationContext(tenantSlug);
  requirePermission(context, "tenants.read");
  if (!context.tenantId) throw new Error("Tenant context is required.");
  const admin = createAdminClient();
  let dashboardUserId = context.userId;
  let dashboardPermissions = context.permissions;
  if (effectiveUserId && effectiveUserId !== context.userId) {
    requirePermission(context, "members.manage");
    const { data: targetMembership } = await admin.from("tenant_memberships").select("id,role").eq("tenant_id", context.tenantId).eq("user_id", effectiveUserId).eq("status", "active").maybeSingle();
    if (!targetMembership) notFound();
    dashboardUserId = effectiveUserId;
    const [{ data: overrides }, { data: tenantFlags }] = await Promise.all([
      admin.from("membership_permission_overrides").select("permission,allowed").eq("membership_id", targetMembership.id),
      admin.from("tenants").select("transcript_access_enabled,recording_access_enabled,recording_download_enabled,contact_masking_enabled").eq("id", context.tenantId).single()
    ]);
    dashboardPermissions = applyPermissionOverrides(permissionsForTenantRole(targetMembership.role as TenantRole), overrides ?? []);
    if (tenantFlags) dashboardPermissions = applyTenantDataFlags(dashboardPermissions, { transcriptAccessEnabled: tenantFlags.transcript_access_enabled, recordingAccessEnabled: tenantFlags.recording_access_enabled, recordingDownloadEnabled: tenantFlags.recording_download_enabled, contactMaskingEnabled: tenantFlags.contact_masking_enabled });
  }
  const periodStart = new Date(); periodStart.setUTCDate(periodStart.getUTCDate() - 29); periodStart.setUTCHours(0, 0, 0, 0);
  const [tenantResult, profileResult, callsResult, chatsResult, assignmentsResult, membershipsResult] = await Promise.all([
    admin.from("tenants").select("display_name").eq("id", context.tenantId).single(),
    admin.from("profiles").select("display_name,email").eq("id", dashboardUserId).single(),
    admin.from("calls").select("id,provider_call_id,agent_id,status,direction,started_at,duration_ms,outcome,contact_masked,contact_unmasked,provider_cost_minor,disconnection_reason,sentiment").eq("tenant_id", context.tenantId).not("provider_call_id", "like", "sample_%").gte("started_at", periodStart.toISOString()).order("started_at", { ascending: false }).limit(1000),
    admin.from("chats").select("id,provider_chat_id,agent_id,status,started_at,ai_message_count,outcome,provider_cost_minor,sentiment").eq("tenant_id", context.tenantId).not("provider_chat_id", "like", "sample_%").gte("started_at", periodStart.toISOString()).order("started_at", { ascending: false }).limit(1000),
    admin.from("agent_assignments").select("agent_id,retell_agents(id,provider_agent_id,display_name,kind,status,provider_version,provider_updated_at)").eq("tenant_id", context.tenantId).is("valid_to", null),
    admin.from("tenant_memberships").select("role,status,member:profiles!tenant_memberships_user_id_fkey(display_name,email)").eq("tenant_id", context.tenantId).neq("status", "removed")
  ]);
  const failedQuery = [tenantResult, profileResult, callsResult, chatsResult, assignmentsResult, membershipsResult].find((result) => result.error);
  if (failedQuery?.error) throw new Error(`Dashboard data unavailable: ${failedQuery.error.code}`);
  const tenant = tenantResult.data;
  const profile = profileResult.data;
  const calls = callsResult.data;
  const chats = chatsResult.data;
  const assignments = assignmentsResult.data;
  const memberships = membershipsResult.data;
  const tenantAgentIds = (assignments ?? []).map((assignment) => assignment.agent_id);
  const viewingAnotherUser = dashboardUserId !== context.userId;
  const accessResult = context.platformRoles.length && !viewingAnotherUser ? null : await admin.from("user_agent_access").select("agent_id").eq("tenant_id", context.tenantId).eq("user_id", dashboardUserId).is("revoked_at", null);
  if (accessResult?.error) throw new Error(`Dashboard access unavailable: ${accessResult.error.code}`);
  const allowedAgentIds = new Set(context.platformRoles.length && !viewingAnotherUser ? tenantAgentIds : (accessResult?.data ?? []).map((grant) => grant.agent_id));
  const callRows = (calls ?? []).filter((call) => allowedAgentIds.has(call.agent_id));
  if (dashboardPermissions.has("contacts.view_unmasked")) for (const call of callRows) call.contact_masked = call.contact_unmasked ?? call.contact_masked;
  const chatRows = (chats ?? []).filter((chat) => allowedAgentIds.has(chat.agent_id));
  const chartStart = new Date(); chartStart.setUTCDate(chartStart.getUTCDate() - 6); chartStart.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, offset) => { const date = new Date(chartStart); date.setUTCDate(date.getUTCDate() + offset); return date; });
  const chart = days.map((date) => { const sameDay = callRows.filter((call) => call.started_at && dayKey(new Date(call.started_at)) === dayKey(date)); return { day: date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }), calls: sameDay.length, converted: sameDay.filter((call) => /book|qualif|success|resolved/i.test(call.outcome ?? "")).length }; });
  const totalSeconds = Math.round(callRows.reduce((sum, call) => sum + Number(call.duration_ms ?? 0), 0) / 1000);
  const successful = callRows.filter((call) => /book|qualif|success|resolved/i.test(call.outcome ?? "")).length;
  const avgSeconds = callRows.length ? Math.round(totalSeconds / callRows.length) : 0;
  const agentRows = (assignments ?? []).filter((assignment) => allowedAgentIds.has(assignment.agent_id)).map((assignment) => {
    const relation = Array.isArray(assignment.retell_agents) ? assignment.retell_agents[0] : assignment.retell_agents;
    const callCount = callRows.filter((call) => call.agent_id === assignment.agent_id).length;
    const chatCount = chatRows.filter((chat) => chat.agent_id === assignment.agent_id).length;
    const kind = (relation?.kind ?? "voice") as "voice" | "chat";
    const completed = kind === "chat" ? chatRows.filter((chat) => chat.agent_id === assignment.agent_id && /ended|analyzed/i.test(chat.status)).length : callRows.filter((call) => call.agent_id === assignment.agent_id && /ended|analyzed/i.test(call.status)).length;
    const volume = kind === "chat" ? chatCount : callCount;
    return { id: relation?.id ?? assignment.agent_id, providerId: relation?.provider_agent_id, version: relation?.provider_version ?? undefined, name: relation?.display_name ?? "Assigned agent", kind, calls: callCount, chats: chatCount, score: volume ? `${Math.round(completed / volume * 100)}%` : "—", status: relation?.status ?? "inactive", modifiedAt: relation?.provider_updated_at ?? undefined };
  });
  const visibleProviderIds = new Set(agentRows.map((agent) => agent.providerId).filter((id): id is string => Boolean(id)));
  const phoneNumbers = (await listRetellPhoneNumbers().catch(() => [])).filter((number) => [...number.inboundAgentIds, ...number.outboundAgentIds].some((id) => visibleProviderIds.has(id)));
  const allowedViews = dashboardViewsForPermissions(dashboardPermissions);
  if (!allowedViews.length) notFound();
  return {
    tenantName: tenant?.display_name ?? "Client workspace",
    userName: profile?.display_name?.split(" ")[0] ?? profile?.email?.split("@")[0] ?? "there",
    metrics: [
      { label: "Total calls", value: String(callRows.length), change: "Live", detail: "last 7 days", positive: true },
      { label: "Successful outcomes", value: String(successful), change: callRows.length ? `${Math.round(successful / callRows.length * 100)}%` : "0%", detail: "of conversations", positive: true },
      { label: "Avg. duration", value: `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`, change: "Live", detail: "completed calls", positive: true },
      { label: "Active agents", value: String(agentRows.filter((agent) => agent.status === "active").length), change: "Assigned", detail: "to this workspace", positive: true }
    ], chart,
    agents: dashboardPermissions.has("agents.read") ? agentRows : [],
    calls: dashboardPermissions.has("calls.read") ? callRows.slice(0, 100).map((call) => ({ contact: call.contact_masked ?? "Caller", number: "Protected contact", agentId: call.agent_id, agent: agentRows.find((agent) => agent.id === call.agent_id)?.name ?? "Assigned agent", outcome: call.outcome ?? call.status, duration: `${Math.floor(Number(call.duration_ms ?? 0) / 60000)}:${String(Math.floor(Number(call.duration_ms ?? 0) / 1000) % 60).padStart(2, "0")}`, time: call.started_at ? new Date(call.started_at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—", startedAt: call.started_at ?? undefined, tone: /book|qualif|success|resolved/i.test(call.outcome ?? "") ? "success" : "warning", sessionId: call.provider_call_id, channel: call.direction ?? "phone_call", cost: call.provider_cost_minor == null ? "—" : `$${(Number(call.provider_cost_minor) / 100).toFixed(3)}`, endReason: call.disconnection_reason ?? undefined, sentiment: call.sentiment ?? undefined, status: call.status })) : [],
    chats: dashboardPermissions.has("chats.read") ? chatRows.slice(0, 100).map((chat) => ({ id: chat.id, agentId: chat.agent_id, agent: agentRows.find((agent) => agent.id === chat.agent_id)?.name ?? "Assigned agent", outcome: chat.outcome ?? "No outcome yet", messages: chat.ai_message_count, time: chat.started_at ? new Date(chat.started_at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—", startedAt: chat.started_at ?? undefined, status: chat.status, sessionId: chat.provider_chat_id, cost: chat.provider_cost_minor == null ? "—" : `$${(Number(chat.provider_cost_minor) / 100).toFixed(3)}`, sentiment: chat.sentiment ?? undefined })) : [],
    team: dashboardPermissions.has("members.read") ? (memberships ?? []).map((membership) => { const member = Array.isArray(membership.member) ? membership.member[0] : membership.member; return { name: member?.display_name ?? "Workspace member", email: member?.email ?? "", role: membership.role, status: membership.status }; }) : [],
    lastSyncedAt: new Date().toISOString(),
    allowedViews,
    phoneNumbers,
    permissions: [...dashboardPermissions],
    effectiveRole: context.platformRoles.length && !viewingAnotherUser ? (context.effectiveRole ?? "admin") : "client"
  };
}

import { NextResponse } from "next/server";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { listRetellAgents, listRetellHistory } from "@/lib/retell/client";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const context = await requireAuthorizationContext();
  requirePermission(context, "agents.manage");
  requirePermission(context, "retell_connections.manage");
  const admin = createAdminClient();
  let { data: connection } = await admin.from("retell_connections").select("id").eq("status", "active").limit(1).maybeSingle();
  if (!connection) {
    const created = await admin.from("retell_connections").insert({
      name: "Daiichi shared Retell workspace",
      history_secret_reference: "env:RETELL_API_KEY",
      webhook_secret_reference: process.env.RETELL_WEBHOOK_API_KEY ? "env:RETELL_WEBHOOK_API_KEY" : "env:RETELL_API_KEY"
    }).select("id").single();
    if (created.error) return NextResponse.json({ error: "CONNECTION_CREATE_FAILED" }, { status: 503 });
    connection = created.data;
  }
  const agents = await listRetellAgents();
  const normalized = [
    ...agents.voice.map((agent) => ({ connection_id: connection.id, provider_agent_id: agent.providerAgentId, kind: "voice", display_name: agent.displayName, provider_updated_at: new Date(agent.modifiedAt).toISOString() })),
    ...agents.chat.map((agent) => ({ connection_id: connection.id, provider_agent_id: agent.providerAgentId, kind: "chat", display_name: agent.displayName, provider_updated_at: new Date(agent.modifiedAt).toISOString() }))
  ];
  if (normalized.length) {
    const { error } = await admin.from("retell_agents").upsert(normalized, { onConflict: "connection_id,provider_agent_id,kind" });
    if (error) return NextResponse.json({ error: "AGENT_IMPORT_FAILED" }, { status: 503 });
  }
  for (const [kind, current] of [["voice", agents.voice], ["chat", agents.chat]] as const) {
    let stale = admin.from("retell_agents").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("connection_id", connection.id).eq("kind", kind);
    if (current.length) stale = stale.not("provider_agent_id", "in", `(${current.map((agent) => `"${agent.providerAgentId}"`).join(",")})`);
    const { error } = await stale;
    if (error) return NextResponse.json({ error: "AGENT_RETIRE_FAILED" }, { status: 503 });
  }
  const { data: importedAgents, error: importedAgentsError } = await admin.from("retell_agents").select("id,provider_agent_id,connection_id,agent_assignments(tenant_id,valid_to)").eq("connection_id", connection.id).eq("status", "active");
  if (importedAgentsError) return NextResponse.json({ error: "AGENT_LOOKUP_FAILED" }, { status: 503 });
  const history = await listRetellHistory();
  const agentContext = new Map((importedAgents ?? []).flatMap((agent) => { const assignment = agent.agent_assignments?.find((item) => !item.valid_to); return assignment ? [[agent.provider_agent_id, { id: agent.id, connectionId: agent.connection_id, tenantId: assignment.tenant_id }] as const] : []; }));
  const callRows = history.calls.flatMap((call) => { const owner = agentContext.get(call.agent_id); if (!owner) return []; const analysis = call.call_analysis; const custom = analysis?.custom_analysis_data as Record<string, unknown> | undefined; return [{ tenant_id: owner.tenantId, connection_id: owner.connectionId, agent_id: owner.id, provider_call_id: call.call_id, status: call.call_status, direction: "direction" in call ? call.direction : "web_call", started_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null, ended_at: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null, duration_ms: call.duration_ms ?? null, disconnection_reason: call.disconnection_reason ?? null, contact_masked: "Protected caller", summary: analysis?.call_summary ?? null, sentiment: analysis?.user_sentiment ?? null, outcome: typeof custom?.outcome === "string" ? custom.outcome : analysis?.call_successful === true ? "Successful" : analysis?.call_successful === false ? "Unsuccessful" : null, provider_cost_minor: call.call_cost?.combined_cost ?? null, synchronized_at: new Date().toISOString(), updated_at: new Date().toISOString() }]; });
  const chatRows = history.chats.flatMap((chat) => { const owner = agentContext.get(chat.agent_id); if (!owner) return []; const analysis = chat.chat_analysis; const custom = analysis?.custom_analysis_data as Record<string, unknown> | undefined; return [{ tenant_id: owner.tenantId, connection_id: owner.connectionId, agent_id: owner.id, provider_chat_id: chat.chat_id, status: chat.chat_status, started_at: chat.start_timestamp ? new Date(chat.start_timestamp).toISOString() : null, ended_at: chat.end_timestamp ? new Date(chat.end_timestamp).toISOString() : null, ai_message_count: (chat.message_with_tool_calls ?? []).filter((message) => message.role === "agent").length, summary: analysis?.chat_summary ?? null, sentiment: analysis?.user_sentiment ?? null, outcome: typeof custom?.outcome === "string" ? custom.outcome : analysis?.chat_successful === true ? "Successful" : analysis?.chat_successful === false ? "Unsuccessful" : null, provider_cost_minor: chat.chat_cost?.combined_cost ?? null, synchronized_at: new Date().toISOString(), updated_at: new Date().toISOString() }]; });
  if (callRows.length) { const { error } = await admin.from("calls").upsert(callRows, { onConflict: "connection_id,provider_call_id" }); if (error) return NextResponse.json({ error: "CALL_HISTORY_IMPORT_FAILED" }, { status: 503 }); }
  if (chatRows.length) { const { error } = await admin.from("chats").upsert(chatRows, { onConflict: "connection_id,provider_chat_id" }); if (error) return NextResponse.json({ error: "CHAT_HISTORY_IMPORT_FAILED" }, { status: 503 }); }
  await Promise.all([admin.from("calls").delete().like("provider_call_id", "sample_%"), admin.from("chats").delete().like("provider_chat_id", "sample_%")]);
  for (const tenantId of new Set([...callRows.map((row) => row.tenant_id), ...chatRows.map((row) => row.tenant_id)])) {
    if (callRows.some((row) => row.tenant_id === tenantId)) await admin.from("dashboard_refresh_signals").upsert({ tenant_id: tenantId, resource: "calls", changed_at: new Date().toISOString() }, { onConflict: "tenant_id,resource" });
    if (chatRows.some((row) => row.tenant_id === tenantId)) await admin.from("dashboard_refresh_signals").upsert({ tenant_id: tenantId, resource: "chats", changed_at: new Date().toISOString() }, { onConflict: "tenant_id,resource" });
  }
  for (const [kind, current] of [["voice", agents.voice], ["chat", agents.chat]] as const) {
    if (!current.length) continue;
    const { error } = await admin.from("retell_agents").update({ status: "active", updated_at: new Date().toISOString() })
      .eq("connection_id", connection.id)
      .eq("kind", kind)
      .in("provider_agent_id", current.map((agent) => agent.providerAgentId));
    if (error) return NextResponse.json({ error: "AGENT_ACTIVATE_FAILED" }, { status: 503 });
  }
  await admin.from("retell_connections").update({ last_sync_at: new Date().toISOString(), status: "active" }).eq("id", connection.id);
  await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "retell.agents.imported", target_type: "retell_connection", target_id: connection.id, safe_metadata: { voiceCount: agents.voice.length, chatCount: agents.chat.length } });
  return NextResponse.json({ ok: true, voiceCount: agents.voice.length, chatCount: agents.chat.length, callCount: callRows.length, conversationCount: chatRows.length });
}

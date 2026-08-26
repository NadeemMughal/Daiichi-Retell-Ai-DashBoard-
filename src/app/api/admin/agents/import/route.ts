import { NextResponse } from "next/server";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { listRetellAgents } from "@/lib/retell/client";
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
  await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "retell.agents.imported", target_type: "retell_connection", target_id: connection.id, safe_metadata: { voiceCount: agents.voice.length, chatCount: agents.chat.length } });
  return NextResponse.json({ ok: true, voiceCount: agents.voice.length, chatCount: agents.chat.length });
}


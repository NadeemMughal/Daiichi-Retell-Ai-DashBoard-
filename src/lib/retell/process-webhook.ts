import "server-only";
import { z } from "zod";
import { createRetellClient } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeWithSchemaDrift } from "@/lib/supabase/schema-drift";

const callSchema = z.object({
  call_id: z.string(), agent_id: z.string(), call_status: z.string(), direction: z.string().optional(), call_type: z.string().optional(), agent_version: z.number().optional(),
  latency: z.object({ e2e: z.object({ p50: z.number().optional() }).passthrough().optional() }).passthrough().optional(),
  start_timestamp: z.number().optional(), end_timestamp: z.number().optional(), duration_ms: z.number().optional(),
  disconnection_reason: z.string().optional(), from_number: z.string().optional(), to_number: z.string().optional(), transcript: z.string().optional(), recording_url: z.string().optional(), scrubbed_recording_url: z.string().optional(),
  call_analysis: z.object({ call_summary: z.string().optional(), user_sentiment: z.string().optional(), call_successful: z.boolean().optional(), custom_analysis_data: z.record(z.string(), z.unknown()).optional() }).optional(),
  call_cost: z.object({ combined_cost: z.number().optional() }).passthrough().optional()
}).passthrough();

const chatSchema = z.object({
  chat_id: z.string(), agent_id: z.string(), chat_status: z.string(), agent_version: z.number().optional(), start_timestamp: z.number().optional(), end_timestamp: z.number().optional(), transcript: z.string().optional(),
  message_with_tool_calls: z.array(z.object({ role: z.string() }).passthrough()).optional(),
  chat_analysis: z.object({ chat_summary: z.string().optional(), user_sentiment: z.string().optional(), chat_successful: z.boolean().optional(), custom_analysis_data: z.record(z.string(), z.unknown()).optional() }).optional(),
  chat_cost: z.object({ combined_cost: z.number().optional() }).passthrough().optional()
}).passthrough();

function timestamp(value?: number) { return value ? new Date(value).toISOString() : null; }

// Without this, a single column the deployed schema lacks fails every call
// webhook, retries it five times and dead-letters it, silently stopping live
// ingestion until the migration is applied.
async function upsertSession(admin: ReturnType<typeof createAdminClient>, table: "calls" | "chats", row: Record<string, unknown>, conflict: string) {
  const { result, dropped } = await writeWithSchemaDrift([row], (payload) => admin.from(table).upsert(payload, { onConflict: conflict }));
  if (dropped.length) console.warn("Retell webhook stored without unavailable columns", { table, columns: dropped });
  return result;
}

async function assignmentForProviderAgent(providerAgentId: string) {
  const admin = createAdminClient();
  const { data: agent } = await admin.from("retell_agents").select("id,connection_id").eq("provider_agent_id", providerAgentId).maybeSingle();
  if (!agent) return null;
  const { data: assignment } = await admin.from("agent_assignments").select("tenant_id").eq("agent_id", agent.id).is("valid_to", null).maybeSingle();
  if (!assignment) return null;
  const { data: tenant } = await admin.from("tenants").select("transcript_access_enabled,recording_access_enabled,contact_masking_enabled").eq("id", assignment.tenant_id).single();
  return { agent, tenantId: assignment.tenant_id, tenant };
}

export async function processRetellWebhookEvent(eventId: string, eventType: string, providerObjectId: string | null) {
  if (!providerObjectId) throw new Error("MISSING_PROVIDER_OBJECT_ID");
  const admin = createAdminClient();
  const retell = createRetellClient();
  await admin.from("webhook_events").update({ status: "processing" }).eq("id", eventId);
  try {
    if (eventType.startsWith("call_") || eventType.startsWith("transfer_") || eventType === "transcript_updated") {
      const call = callSchema.parse(await retell.call.retrieve(providerObjectId));
      const context = await assignmentForProviderAgent(call.agent_id);
      if (!context) { await admin.from("webhook_events").update({ status: "quarantined", last_error_code: "UNASSIGNED_AGENT" }).eq("id", eventId); return; }
      const custom = call.call_analysis?.custom_analysis_data;
      const synchronized = await upsertSession(admin, "calls", {
        tenant_id: context.tenantId, connection_id: context.agent.connection_id, agent_id: context.agent.id, provider_call_id: call.call_id,
        status: call.call_status, call_type: call.call_type ?? (call.from_number ? "phone_call" : "web_call"), direction: call.direction === "inbound" || call.direction === "outbound" ? call.direction : null, agent_version: call.agent_version ?? null, latency_ms: call.latency?.e2e?.p50 == null ? null : Math.round(call.latency.e2e.p50), started_at: timestamp(call.start_timestamp), ended_at: timestamp(call.end_timestamp), duration_ms: call.duration_ms,
        disconnection_reason: call.disconnection_reason, contact_masked: "Protected caller", contact_unmasked: context.tenant?.contact_masking_enabled ? null : (call.direction === "outbound" ? call.to_number : call.from_number) ?? null, from_number: context.tenant?.contact_masking_enabled ? null : call.from_number ?? null, to_number: context.tenant?.contact_masking_enabled ? null : call.to_number ?? null, custom_analysis: custom && Object.keys(custom).length ? custom : null, summary: call.call_analysis?.call_summary, sentiment: call.call_analysis?.user_sentiment,
        outcome: typeof custom?.outcome === "string" ? custom.outcome : call.call_analysis?.call_successful === true ? "Successful" : call.call_analysis?.call_successful === false ? "Unsuccessful" : null,
        transcript_text: context.tenant?.transcript_access_enabled ? call.transcript : null,
        recording_locator: context.tenant?.recording_access_enabled ? call.scrubbed_recording_url ?? call.recording_url : null,
        provider_cost_minor: call.call_cost?.combined_cost == null ? null : Math.round(call.call_cost.combined_cost), synchronized_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, "connection_id,provider_call_id");
      if (synchronized.error) throw synchronized.error;
      await admin.from("dashboard_refresh_signals").upsert({ tenant_id: context.tenantId, resource: "calls", changed_at: new Date().toISOString() }, { onConflict: "tenant_id,resource" });
    } else if (eventType.startsWith("chat_")) {
      const chat = chatSchema.parse(await retell.chat.retrieve(providerObjectId));
      const context = await assignmentForProviderAgent(chat.agent_id);
      if (!context) { await admin.from("webhook_events").update({ status: "quarantined", last_error_code: "UNASSIGNED_AGENT" }).eq("id", eventId); return; }
      const custom = chat.chat_analysis?.custom_analysis_data;
      const synchronized = await upsertSession(admin, "chats", {
        tenant_id: context.tenantId, connection_id: context.agent.connection_id, agent_id: context.agent.id, provider_chat_id: chat.chat_id, status: chat.chat_status, agent_version: chat.agent_version ?? null, custom_analysis: custom && Object.keys(custom).length ? custom : null,
        started_at: timestamp(chat.start_timestamp), ended_at: timestamp(chat.end_timestamp), ai_message_count: (chat.message_with_tool_calls ?? []).filter((message) => message.role === "agent").length,
        summary: chat.chat_analysis?.chat_summary, sentiment: chat.chat_analysis?.user_sentiment,
        outcome: typeof custom?.outcome === "string" ? custom.outcome : chat.chat_analysis?.chat_successful === true ? "Successful" : chat.chat_analysis?.chat_successful === false ? "Unsuccessful" : null,
        transcript_text: context.tenant?.transcript_access_enabled ? chat.transcript : null, provider_cost_minor: chat.chat_cost?.combined_cost == null ? null : Math.round(chat.chat_cost.combined_cost),
        synchronized_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, "connection_id,provider_chat_id");
      if (synchronized.error) throw synchronized.error;
      await admin.from("dashboard_refresh_signals").upsert({ tenant_id: context.tenantId, resource: "chats", changed_at: new Date().toISOString() }, { onConflict: "tenant_id,resource" });
    }
    await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), last_error_code: null }).eq("id", eventId);
  } catch (error) {
    const code = error instanceof z.ZodError ? "PROVIDER_SCHEMA_MISMATCH" : error instanceof Error ? error.name : "UNKNOWN_PROCESSING_ERROR";
    await admin.from("webhook_events").update({ status: "failed", last_error_code: code, next_attempt_at: new Date(Date.now() + 60_000).toISOString() }).eq("id", eventId);
    throw error;
  }
}

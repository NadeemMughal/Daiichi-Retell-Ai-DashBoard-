import "server-only";
import { NextResponse } from "next/server";
import { listRetellAgents, listRetellContacts, listRetellHistory } from "@/lib/retell/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeWithSchemaDrift } from "@/lib/supabase/schema-drift";

async function upsertHistoryRows(admin: ReturnType<typeof createAdminClient>, table: "calls" | "chats" | "contacts", rows: Record<string, unknown>[], conflict: string, drift: string[]) {
  if (!rows.length) return null;
  // An unapplied additive migration must not stop history from synchronizing. One
  // migration adds several columns at once, so every missing column is dropped in
  // turn and reported back to the caller rather than only the first.
  const { result: firstAttempt, dropped } = await writeWithSchemaDrift(rows, (payload) => admin.from(table).upsert(payload, { onConflict: conflict }));
  if (!firstAttempt.error) { for (const column of dropped) drift.push(`${table}.${column}`); return null; }
  if (dropped.length) return firstAttempt.error;
  // A short retry handles transient PostgREST/database interruptions without
  // making the operator press Sync again. Deterministic validation failures
  // are returned unchanged on the second attempt.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const retry = await admin.from(table).upsert(rows, { onConflict: conflict });
  return retry.error;
}

export async function synchronizeRetellData(actorUserId: string | null) {
  const runStartedAt = new Date().toISOString();
  // Columns the deployed database is missing, reported so an unapplied migration
  // is visible instead of silently degrading what the dashboard can show.
  const schemaDrift: string[] = [];
  const admin = createAdminClient();
  const connectionLookup = await admin.from("retell_connections").select("id").eq("status", "active").limit(1).maybeSingle();
  if (connectionLookup.error) return NextResponse.json({ error: "CONNECTION_LOOKUP_FAILED", code: connectionLookup.error.code }, { status: 503 });
  let connection = connectionLookup.data;
  if (!connection) {
    const created = await admin.from("retell_connections").insert({
      name: "Daiichi Technologies",
      history_secret_reference: "env:RETELL_API_KEY",
      webhook_secret_reference: process.env.RETELL_WEBHOOK_API_KEY ? "env:RETELL_WEBHOOK_API_KEY" : "env:RETELL_API_KEY"
    }).select("id").single();
    if (created.error) return NextResponse.json({ error: "CONNECTION_CREATE_FAILED" }, { status: 503 });
    connection = created.data;
  }
  const agents = await listRetellAgents();
  const normalized = [
    ...agents.voice.map((agent) => ({ connection_id: connection.id, provider_agent_id: agent.providerAgentId, kind: "voice", display_name: agent.displayName, provider_version: agent.version, provider_updated_at: new Date(agent.modifiedAt).toISOString(), status: "active", updated_at: new Date().toISOString() })),
    ...agents.chat.map((agent) => ({ connection_id: connection.id, provider_agent_id: agent.providerAgentId, kind: "chat", display_name: agent.displayName, provider_version: agent.version, provider_updated_at: new Date(agent.modifiedAt).toISOString(), status: "active", updated_at: new Date().toISOString() }))
  ];
  if (normalized.length) {
    // 0003_agent_provider_identity.sql makes (connection_id, provider_agent_id)
    // unique, which is stricter than the (…, kind) constraint from 0001. Inferring
    // on the narrower pair lets an agent that changes channel update in place;
    // inferring on the triple would insert and violate the 2-column index instead.
    const { error } = await admin.from("retell_agents").upsert(normalized, { onConflict: "connection_id,provider_agent_id" });
    if (error) return NextResponse.json({ error: "AGENT_IMPORT_FAILED" }, { status: 503 });
  }
  for (const [kind, current] of [["voice", agents.voice], ["chat", agents.chat]] as const) {
    // An empty provider response is treated as a transient Retell failure, not as
    // a deletion. Retiring on an empty list would close every tenant assignment
    // and revoke every user grant for that channel.
    if (!current.length) continue;
    const { error } = await admin.from("retell_agents").update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("connection_id", connection.id)
      .eq("kind", kind)
      .not("provider_agent_id", "in", `(${current.map((agent) => `"${agent.providerAgentId}"`).join(",")})`);
    if (error) return NextResponse.json({ error: "AGENT_RETIRE_FAILED" }, { status: 503 });
  }
  const { data: retiredAgents, error: retiredLookupError } = await admin.from("retell_agents").select("id").eq("connection_id", connection.id).eq("status", "inactive");
  if (retiredLookupError) return NextResponse.json({ error: "RETIRED_AGENT_LOOKUP_FAILED" }, { status: 503 });
  const retiredAgentIds = (retiredAgents ?? []).map((agent) => agent.id);
  if (retiredAgentIds.length) {
    const [{ data: retiredAssignments, error: retiredAssignmentsError }, { data: retiredGrants, error: retiredGrantsError }] = await Promise.all([
      admin.from("agent_assignments").select("agent_id,tenant_id").in("agent_id", retiredAgentIds).is("valid_to", null),
      admin.from("user_agent_access").select("agent_id,tenant_id").in("agent_id", retiredAgentIds).is("revoked_at", null)
    ]);
    if (retiredAssignmentsError || retiredGrantsError) return NextResponse.json({ error: "RETIRED_AGENT_ACCESS_LOOKUP_FAILED" }, { status: 503 });
    const retiredAt = new Date().toISOString();
    const [{ error: closeAssignmentsError }, { error: revokeGrantsError }] = await Promise.all([
      admin.from("agent_assignments").update({ valid_to: retiredAt }).in("agent_id", retiredAgentIds).is("valid_to", null),
      admin.from("user_agent_access").update({ revoked_at: retiredAt }).in("agent_id", retiredAgentIds).is("revoked_at", null)
    ]);
    if (closeAssignmentsError || revokeGrantsError) return NextResponse.json({ error: "RETIRED_AGENT_ACCESS_CLEANUP_FAILED" }, { status: 503 });
    const affectedTenantIds = new Set([...(retiredAssignments ?? []).map((row) => row.tenant_id), ...(retiredGrants ?? []).map((row) => row.tenant_id)]);
    for (const tenantId of affectedTenantIds) await admin.from("dashboard_refresh_signals").upsert({ tenant_id: tenantId, resource: "agents", changed_at: retiredAt }, { onConflict: "tenant_id,resource" });
  }
  const importedAgentsResult = await admin.from("retell_agents").select("id,provider_agent_id,connection_id,agent_assignments(tenant_id,valid_to)").eq("connection_id", connection.id).eq("status", "active");
  if (importedAgentsResult.error) return NextResponse.json({ error: "AGENT_LOOKUP_FAILED" }, { status: 503 });
  let importedAgents = importedAgentsResult.data;
  const { data: automaticTenant, error: tenantLookupError } = await admin.from("tenants").select("id").eq("slug", "daiichi-technologies").eq("status", "active").maybeSingle();
  if (tenantLookupError) return NextResponse.json({ error: "TENANT_LOOKUP_FAILED" }, { status: 503 });
  if (!automaticTenant) return NextResponse.json({ error: "DAIICHI_TECHNOLOGIES_WORKSPACE_MISSING" }, { status: 503 });
  let unassignedAfterAssignment = 0;
  {
    const automaticTenantId = automaticTenant.id;
    let assignmentActor = actorUserId;
    if (!assignmentActor) {
      const { data: platformActor } = await admin.from("platform_role_assignments").select("user_id").in("role", ["super_admin", "operations_admin"]).is("revoked_at", null).order("granted_at", { ascending: true }).limit(1).maybeSingle();
      assignmentActor = platformActor?.user_id ?? null;
    }
    const unassignedAgents = (importedAgents ?? []).filter((agent) => !agent.agent_assignments?.some((assignment) => !assignment.valid_to));
    if (unassignedAgents.length && !assignmentActor) return NextResponse.json({ error: "AUTOMATIC_ASSIGNMENT_ACTOR_MISSING" }, { status: 503 });
    if (unassignedAgents.length) {
      // Each agent is assigned in its own statement. A multi-row insert is atomic,
      // so one agent that a concurrent sync already assigned (23505 against
      // agent_one_active_tenant_idx) would roll back the whole batch and silently
      // leave every other new agent unassigned.
      for (const agent of unassignedAgents) {
        const { error: assignmentError } = await admin.from("agent_assignments").insert({ tenant_id: automaticTenantId, agent_id: agent.id, assigned_by: assignmentActor!, assignment_reason: "Automatically assigned from the Daiichi Technologies Retell workspace." });
        if (assignmentError && assignmentError.code !== "23505") return NextResponse.json({ error: "AUTOMATIC_AGENT_ASSIGNMENT_FAILED", code: assignmentError.code, detail: assignmentError.message }, { status: 503 });
      }
      const refreshed = await admin.from("retell_agents").select("id,provider_agent_id,connection_id,agent_assignments(tenant_id,valid_to)").eq("connection_id", connection.id).eq("status", "active");
      if (refreshed.error) return NextResponse.json({ error: "AGENT_ASSIGNMENT_REFRESH_FAILED" }, { status: 503 });
      importedAgents = refreshed.data;
      await admin.from("dashboard_refresh_signals").upsert({ tenant_id: automaticTenantId, resource: "agents", changed_at: new Date().toISOString() }, { onConflict: "tenant_id,resource" });
    }
    // Every active agent must carry a workspace assignment before its calls can be
    // attributed. Report any that do not instead of returning a successful sync.
    unassignedAfterAssignment = (importedAgents ?? []).filter((agent) => !agent.agent_assignments?.some((assignment) => !assignment.valid_to)).length;
  }
  const history = await listRetellHistory();
  const contacts = await listRetellContacts();
  const agentContext = new Map((importedAgents ?? []).flatMap((agent) => { const assignment = agent.agent_assignments?.find((item) => !item.valid_to); return assignment ? [[agent.provider_agent_id, { id: agent.id, connectionId: agent.connection_id, tenantId: assignment.tenant_id }] as const] : []; }));
  // contact_unmasked follows the owning tenant's masking flag, exactly as the
  // webhook path does. Because every run re-upserts recent history, turning
  // masking off backfills the column and turning it back on clears it, so the
  // flag stays a live switch instead of a one-way door.
  const ownedTenantIds = [...new Set([...agentContext.values()].map((owner) => owner.tenantId))];
  const maskingByTenant = new Map<string, boolean>();
  if (ownedTenantIds.length) {
    const { data: privacyRows, error: privacyError } = await admin.from("tenants").select("id,contact_masking_enabled").in("id", ownedTenantIds);
    if (privacyError) return NextResponse.json({ error: "TENANT_PRIVACY_LOOKUP_FAILED" }, { status: 503 });
    for (const row of privacyRows ?? []) maskingByTenant.set(row.id, row.contact_masking_enabled);
  }
  const contactFor = (call: (typeof history.calls)[number], tenantId: string) => {
    if (maskingByTenant.get(tenantId) !== false) return null;
    // Web calls carry no phone identifiers; only phone calls have a contact.
    if (!("from_number" in call)) return null;
    return (call.direction === "outbound" ? call.to_number : call.from_number) ?? null;
  };
  // Both endpoints of a phone call are caller identifiers, so they carry the same
  // sensitivity as contact_unmasked and stay out of the row while masking is on.
  const numberFor = (call: (typeof history.calls)[number], tenantId: string, end: "from" | "to") => {
    if (maskingByTenant.get(tenantId) !== false) return null;
    if (!("from_number" in call)) return null;
    return (end === "from" ? call.from_number : call.to_number) ?? null;
  };
  const callRows = history.calls.flatMap((call) => { const owner = agentContext.get(call.agent_id); if (!owner) return []; const analysis = call.call_analysis; const custom = analysis?.custom_analysis_data as Record<string, unknown> | undefined; return [{ tenant_id: owner.tenantId, connection_id: owner.connectionId, agent_id: owner.id, provider_call_id: call.call_id, status: call.call_status, call_type: call.call_type ?? ("from_number" in call ? "phone_call" : "web_call"), direction: "direction" in call ? call.direction : null, agent_version: call.agent_version ?? null, latency_ms: call.latency?.e2e?.p50 == null ? null : Math.round(call.latency.e2e.p50), started_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null, ended_at: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null, duration_ms: call.duration_ms ?? null, disconnection_reason: call.disconnection_reason ?? null, contact_masked: "Protected caller", contact_unmasked: contactFor(call, owner.tenantId), from_number: numberFor(call, owner.tenantId, "from"), to_number: numberFor(call, owner.tenantId, "to"), custom_analysis: custom && Object.keys(custom).length ? custom : null, summary: analysis?.call_summary ?? null, sentiment: analysis?.user_sentiment ?? null, outcome: typeof custom?.outcome === "string" ? custom.outcome : analysis?.call_successful === true ? "Successful" : analysis?.call_successful === false ? "Unsuccessful" : null, provider_cost_minor: call.call_cost?.combined_cost == null ? null : Math.round(call.call_cost.combined_cost), synchronized_at: new Date().toISOString(), updated_at: new Date().toISOString() }]; });
  const chatRows = history.chats.flatMap((chat) => { const owner = agentContext.get(chat.agent_id); if (!owner) return []; const analysis = chat.chat_analysis; const custom = analysis?.custom_analysis_data as Record<string, unknown> | undefined; return [{ tenant_id: owner.tenantId, connection_id: owner.connectionId, agent_id: owner.id, provider_chat_id: chat.chat_id, status: chat.chat_status, custom_analysis: custom && Object.keys(custom).length ? custom : null, started_at: chat.start_timestamp ? new Date(chat.start_timestamp).toISOString() : null, ended_at: chat.end_timestamp ? new Date(chat.end_timestamp).toISOString() : null, ai_message_count: (chat.message_with_tool_calls ?? []).filter((message) => message.role === "agent").length, summary: analysis?.chat_summary ?? null, sentiment: analysis?.user_sentiment ?? null, outcome: typeof custom?.outcome === "string" ? custom.outcome : analysis?.chat_successful === true ? "Successful" : analysis?.chat_successful === false ? "Unsuccessful" : null, provider_cost_minor: chat.chat_cost?.combined_cost == null ? null : Math.round(chat.chat_cost.combined_cost), synchronized_at: new Date().toISOString(), updated_at: new Date().toISOString() }]; });
  const callImportError = await upsertHistoryRows(admin, "calls", callRows, "connection_id,provider_call_id", schemaDrift);
  if (callImportError) return NextResponse.json({ error: "CALL_HISTORY_IMPORT_FAILED", code: callImportError.code, detail: callImportError.message }, { status: 503 });
  const chatImportError = await upsertHistoryRows(admin, "chats", chatRows, "connection_id,provider_chat_id", schemaDrift);
  if (chatImportError) return NextResponse.json({ error: "CHAT_HISTORY_IMPORT_FAILED", code: chatImportError.code, detail: chatImportError.message }, { status: 503 });
  const tenantIds = [...new Set((importedAgents ?? []).flatMap((agent) => agent.agent_assignments?.filter((assignment) => !assignment.valid_to).map((assignment) => assignment.tenant_id) ?? []))];
  if (contacts.length && tenantIds.length === 1) {
    const contactRows = contacts.map((contact) => ({ tenant_id: tenantIds[0], connection_id: connection.id, provider_contact_id: contact.contact_id, phone_number: contact.phone_number, first_name: contact.first_name ?? null, last_name: contact.last_name ?? null, do_not_call: contact.do_not_call ?? false, external_id: contact.external_id ?? null, conversation_count: contact.conversation_count ?? 0, last_conversation_at: contact.last_conversation_timestamp ? new Date(contact.last_conversation_timestamp).toISOString() : null, provider_created_at: new Date(contact.created_timestamp).toISOString(), provider_updated_at: new Date(contact.user_modified_timestamp ?? contact.created_timestamp).toISOString(), custom_fields: contact.custom_fields ?? {}, synchronized_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
    const contactError = await upsertHistoryRows(admin, "contacts", contactRows, "connection_id,provider_contact_id", schemaDrift);
    if (contactError && contactError.code !== "PGRST205" && contactError.code !== "42P01") return NextResponse.json({ error: "CONTACT_IMPORT_FAILED", code: contactError.code, detail: contactError.message }, { status: 503 });
  }
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
  const assignedTenantIds = new Set((importedAgents ?? []).flatMap((agent) => agent.agent_assignments?.filter((assignment) => !assignment.valid_to).map((assignment) => assignment.tenant_id) ?? []));
  for (const tenantId of assignedTenantIds) await admin.from("dashboard_refresh_signals").upsert({ tenant_id: tenantId, resource: "agents", changed_at: new Date().toISOString() }, { onConflict: "tenant_id,resource" });
  await admin.from("retell_connections").update({ name: "Daiichi Technologies", last_sync_at: new Date().toISOString(), status: "active" }).eq("id", connection.id);
  // Operational history for the scheduled sync: which window was reconciled, how
  // much was seen, and how much the provider returned that this workspace could
  // not attribute (calls or chats for an unowned agent, plus unassigned agents).
  const observedStarts = [...callRows, ...chatRows].map((row) => row.started_at).filter((value): value is string => Boolean(value)).sort();
  await admin.from("reconciliation_runs").insert({
    connection_id: connection.id, started_at: runStartedAt, completed_at: new Date().toISOString(), status: "processed",
    window_start: observedStarts[0] ?? runStartedAt, window_end: new Date().toISOString(),
    calls_seen: callRows.length, chats_seen: chatRows.length,
    differences_found: (history.calls.length - callRows.length) + (history.chats.length - chatRows.length) + unassignedAfterAssignment,
    error_code: schemaDrift.length ? "SCHEMA_DRIFT" : null
  });
  await admin.from("audit_logs").insert({ actor_user_id: actorUserId, action: actorUserId ? "retell.agents.imported" : "retell.agents.scheduled_sync", target_type: "retell_connection", target_id: connection.id, safe_metadata: { voiceCount: agents.voice.length, chatCount: agents.chat.length } });
  return NextResponse.json({ ok: true, voiceCount: agents.voice.length, chatCount: agents.chat.length, callCount: callRows.length, conversationCount: chatRows.length, contactCount: contacts.length, unassignedAgentCount: unassignedAfterAssignment, schemaDrift: [...new Set(schemaDrift)] });
}


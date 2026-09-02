import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createRetellClient } from "@/lib/retell/client";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("backfill"), attributes: z.array(z.string().min(1).max(100)).min(1).max(50) }),
  z.object({ action: z.literal("add_field"), name: z.string().regex(/^[a-z][a-z0-9_]*$/).max(100), label: z.string().min(1).max(100), fieldType: z.enum(["string", "number", "boolean", "date", "datetime"]), description: z.string().max(500).optional(), mapPostCall: z.boolean(), analysisDataName: z.string().max(100).optional(), updateMode: z.enum(["overwrite", "fill_if_empty", "merge"]) }),
  z.object({ action: z.literal("update_field"), originalName: z.string().min(1), label: z.string().min(1).max(100), fieldType: z.enum(["string", "number", "boolean", "date", "datetime"]), description: z.string().max(500).optional(), mapPostCall: z.boolean(), analysisDataName: z.string().max(100).optional(), updateMode: z.enum(["overwrite", "fill_if_empty", "merge"]) }),
  z.object({ action: z.literal("delete_field"), name: z.string().min(1) }),
  z.object({
    action: z.literal("create"),
    phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    doNotCall: z.boolean().optional(),
    call: z.boolean().optional()
  })
]);

export async function GET() {
  const context = await requireAuthorizationContext();
  requirePermission(context, "retell_connections.manage");
  try {
    const client = createRetellClient();
    const [config, agentList] = await Promise.all([client.crm.getConfig(), client.agent.list()]);
    const mappingByField = new Map((config.crm_analysis_data_mappings ?? []).map((mapping) => [mapping.field_name, mapping]));
    const voiceAgents = (agentList.items ?? []).filter((agent) => agent.channel === "voice");
    const agentDetails = await Promise.all(voiceAgents.map((agent) => client.agent.retrieve(agent.agent_id).catch(() => null)));
    const analysisFieldMap = new Map<string, { name: string; type: string; description?: string; agents: string[] }>();
    for (const agent of agentDetails) {
      if (!agent) continue;
      for (const analysisField of agent.post_call_analysis_data ?? []) {
        const existing = analysisFieldMap.get(analysisField.name);
        const agentName = agent.agent_name || agent.agent_id;
        if (existing) {
          if (!existing.agents.includes(agentName)) existing.agents.push(agentName);
        } else {
          analysisFieldMap.set(analysisField.name, { name: analysisField.name, type: analysisField.type === "system-presets" ? (analysisField.name === "call_successful" ? "boolean" : "string") : analysisField.type, description: analysisField.description, agents: [agentName] });
        }
      }
    }
    const builtIn = [
      { name: "phone_number", label: "Phone Number", type: "string", builtIn: true },
      { name: "first_name", label: "First Name", type: "string", builtIn: true },
      { name: "last_name", label: "Last Name", type: "string", builtIn: true },
      { name: "do_not_call", label: "Do Not Call", type: "boolean", builtIn: true }
    ];
    const withMapping = (field: { name: string; label: string; type: string; builtIn?: boolean; description?: string }) => {
      const mapping = mappingByField.get(field.name);
      return { ...field, mapping: mapping?.analysis_data_name, mappingMode: mapping?.update_mode, updatedAt: config.last_sync_timestamp };
    };
    const custom = (config.custom_fields ?? []).map((field) => withMapping({ name: field.name, label: field.label ?? field.name, type: field.type, description: field.description }));
    return NextResponse.json({ fields: [...builtIn.map(withMapping), ...custom], analysisFields: [...analysisFieldMap.values()].sort((a, b) => a.name.localeCompare(b.name)), lastSyncTimestamp: config.last_sync_timestamp ?? null });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("Retell contact fields lookup failed", { requestId, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "RETELL_CONTACT_FIELDS_FAILED", requestId }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const context = await requireAuthorizationContext();
  requirePermission(context, "retell_connections.manage");
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CONTACT_ACTION" }, { status: 400 });

  try {
    const client = createRetellClient();
    if (parsed.data.action === "backfill") {
      const result = await client.contact.backfillAnalysisData({ backfill_attributes: parsed.data.attributes });
      return NextResponse.json({ ok: true, message: `Contact backfill is ${result.status}.` });
    }
    if (parsed.data.action === "add_field") {
      const fieldRequest = parsed.data;
      const config = await client.crm.getConfig();
      if ((config.custom_fields ?? []).some((field) => field.name === fieldRequest.name)) return NextResponse.json({ error: "CONTACT_FIELD_ALREADY_EXISTS" }, { status: 409 });
      const mappings = [...(config.crm_analysis_data_mappings ?? [])];
      if (fieldRequest.mapPostCall && fieldRequest.analysisDataName) mappings.push({ field_name: fieldRequest.name, analysis_data_name: fieldRequest.analysisDataName, update_mode: fieldRequest.updateMode });
      await client.crm.updateConfig({ custom_fields: [...(config.custom_fields ?? []), { name: fieldRequest.name, label: fieldRequest.label, type: fieldRequest.fieldType, description: fieldRequest.description || undefined }], crm_analysis_data_mappings: mappings });
      return NextResponse.json({ ok: true, message: "Contact field added to Retell." }, { status: 201 });
    }
    if (parsed.data.action === "update_field") {
      const request = parsed.data;
      const config = await client.crm.getConfig();
      const customFields = (config.custom_fields ?? []).map((field) => field.name === request.originalName ? { ...field, label: request.label, type: request.fieldType, description: request.description || undefined } : field);
      const mappings = (config.crm_analysis_data_mappings ?? []).filter((mapping) => mapping.field_name !== request.originalName);
      if (request.mapPostCall && request.analysisDataName) mappings.push({ field_name: request.originalName, analysis_data_name: request.analysisDataName, update_mode: request.updateMode });
      await client.crm.updateConfig({ custom_fields: customFields, crm_analysis_data_mappings: mappings });
      return NextResponse.json({ ok: true, message: "Contact field updated in Retell." });
    }
    if (parsed.data.action === "delete_field") {
      const request = parsed.data;
      if (["phone_number", "first_name", "last_name", "do_not_call"].includes(request.name)) return NextResponse.json({ error: "BUILT_IN_FIELD_CANNOT_BE_DELETED" }, { status: 409 });
      const config = await client.crm.getConfig();
      await client.crm.updateConfig({ custom_fields: (config.custom_fields ?? []).filter((field) => field.name !== request.name), crm_analysis_data_mappings: (config.crm_analysis_data_mappings ?? []).filter((mapping) => mapping.field_name !== request.name) });
      return NextResponse.json({ ok: true, message: "Contact field deleted from Retell." });
    }
    const contact = await client.contact.create({
      phone_number: parsed.data.phoneNumber,
      first_name: parsed.data.firstName || undefined,
      last_name: parsed.data.lastName || undefined,
      do_not_call: parsed.data.doNotCall,
      custom_fields: { do_no_call: parsed.data.call ?? false }
    });
    return NextResponse.json({ ok: true, contactId: contact.contact_id, message: "Contact added to Retell." }, { status: 201 });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("Retell contact action failed", { requestId, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "RETELL_CONTACT_ACTION_FAILED", requestId }, { status: 503 });
  }
}

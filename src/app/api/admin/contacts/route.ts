import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createRetellClient } from "@/lib/retell/client";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("backfill"), attributes: z.array(z.string().min(1).max(100)).min(1).max(50) }),
  z.object({ action: z.literal("add_field"), name: z.string().regex(/^[a-z][a-z0-9_]*$/).max(100), label: z.string().min(1).max(100), fieldType: z.enum(["string", "number", "boolean", "date", "datetime"]) }),
  z.object({
    action: z.literal("create"),
    phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    doNotCall: z.boolean().optional()
  })
]);

export async function GET() {
  const context = await requireAuthorizationContext();
  requirePermission(context, "retell_connections.manage");
  try {
    const config = await createRetellClient().crm.getConfig();
    const mappings = new Map((config.crm_analysis_data_mappings ?? []).map((mapping) => [mapping.field_name, mapping.analysis_data_name]));
    const builtIn = [
      { name: "phone_number", label: "Phone Number", type: "string", builtIn: true },
      { name: "first_name", label: "First Name", type: "string", builtIn: true },
      { name: "last_name", label: "Last Name", type: "string", builtIn: true },
      { name: "do_not_call", label: "Do Not Call", type: "boolean", builtIn: true }
    ];
    const custom = (config.custom_fields ?? []).map((field) => ({ name: field.name, label: field.label ?? field.name, type: field.type, mapping: mappings.get(field.name), updatedAt: config.last_sync_timestamp }));
    return NextResponse.json({ fields: [...builtIn, ...custom], lastSyncTimestamp: config.last_sync_timestamp ?? null });
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
      await client.crm.updateConfig({ custom_fields: [...(config.custom_fields ?? []), { name: fieldRequest.name, label: fieldRequest.label, type: fieldRequest.fieldType }] });
      return NextResponse.json({ ok: true, message: "Contact field added to Retell." }, { status: 201 });
    }
    const contact = await client.contact.create({
      phone_number: parsed.data.phoneNumber,
      first_name: parsed.data.firstName || undefined,
      last_name: parsed.data.lastName || undefined,
      do_not_call: parsed.data.doNotCall
    });
    return NextResponse.json({ ok: true, contactId: contact.contact_id, message: "Contact added to Retell." }, { status: 201 });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("Retell contact action failed", { requestId, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "RETELL_CONTACT_ACTION_FAILED", requestId }, { status: 503 });
  }
}

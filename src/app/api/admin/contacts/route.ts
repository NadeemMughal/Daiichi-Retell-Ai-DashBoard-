import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createRetellClient } from "@/lib/retell/client";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("backfill"), attributes: z.array(z.string().min(1).max(100)).min(1).max(50) }),
  z.object({
    action: z.literal("create"),
    phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional()
  })
]);

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
    const contact = await client.contact.create({
      phone_number: parsed.data.phoneNumber,
      first_name: parsed.data.firstName || undefined,
      last_name: parsed.data.lastName || undefined
    });
    return NextResponse.json({ ok: true, contactId: contact.contact_id, message: "Contact added to Retell." }, { status: 201 });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("Retell contact action failed", { requestId, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "RETELL_CONTACT_ACTION_FAILED", requestId }, { status: 503 });
  }
}

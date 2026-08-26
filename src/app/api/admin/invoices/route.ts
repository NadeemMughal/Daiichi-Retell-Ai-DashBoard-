import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { summarizeManualUsage } from "@/lib/billing/manual-invoice";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  tenantId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(3).max(80),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  notes: z.string().trim().max(2000).optional()
}).refine((value) => value.periodEnd >= value.periodStart, { message: "Period end must not precede period start.", path: ["periodEnd"] });

export async function POST(request: Request) {
  const context = await requireAuthorizationContext();
  requirePermission(context, "billing.manage");
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "INVALID_INVOICE", details: body.error.flatten().fieldErrors }, { status: 400 });
  const admin = createAdminClient();
  const periodEndExclusive = new Date(`${body.data.periodEnd}T00:00:00.000Z`); periodEndExclusive.setUTCDate(periodEndExclusive.getUTCDate() + 1);
  const [{ data: calls }, { data: chats }, { data: tenant }] = await Promise.all([
    admin.from("calls").select("duration_ms").eq("tenant_id", body.data.tenantId).gte("started_at", `${body.data.periodStart}T00:00:00.000Z`).lt("started_at", periodEndExclusive.toISOString()),
    admin.from("chats").select("ai_message_count").eq("tenant_id", body.data.tenantId).gte("started_at", `${body.data.periodStart}T00:00:00.000Z`).lt("started_at", periodEndExclusive.toISOString()),
    admin.from("tenants").select("id,status").eq("id", body.data.tenantId).maybeSingle()
  ]);
  if (!tenant || tenant.status === "archived") return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  const usage = summarizeManualUsage({ callDurationsMs: (calls ?? []).map((call) => Number(call.duration_ms ?? 0)), chatAiMessageCounts: (chats ?? []).map((chat) => chat.ai_message_count) });
  const { data: invoice, error } = await admin.from("manual_invoices").insert({
    tenant_id: body.data.tenantId, invoice_number: body.data.invoiceNumber, period_start: body.data.periodStart, period_end: body.data.periodEnd,
    call_count: usage.callCount, voice_seconds: usage.voiceSeconds, chat_ai_messages: usage.chatAiMessages,
    amount_minor: body.data.amountMinor, currency: body.data.currency, notes: body.data.notes, created_by: context.userId
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "INVOICE_NUMBER_EXISTS" : "INVOICE_CREATE_FAILED" }, { status: error.code === "23505" ? 409 : 503 });
  await admin.from("audit_logs").insert({ tenant_id: body.data.tenantId, actor_user_id: context.userId, action: "manual_invoice.created", target_type: "manual_invoice", target_id: invoice.id, safe_metadata: { invoiceNumber: body.data.invoiceNumber, ...usage, amountMinor: body.data.amountMinor, currency: body.data.currency } });
  return NextResponse.json({ ok: true, invoiceId: invoice.id, usage }, { status: 201 });
}


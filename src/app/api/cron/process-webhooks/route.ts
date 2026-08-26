import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processRetellWebhookEvent } from "@/lib/retell/process-webhook";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const admin = createAdminClient();
  const { data: events } = await admin.from("webhook_events").select("id,event_type,provider_object_id,attempt_count").in("status", ["pending", "failed"]).or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`).order("received_at").limit(20);
  let processed = 0; let failed = 0;
  for (const event of events ?? []) {
    await admin.from("webhook_events").update({ attempt_count: event.attempt_count + 1 }).eq("id", event.id);
    try { await processRetellWebhookEvent(event.id, event.event_type, event.provider_object_id); processed += 1; }
    catch { failed += 1; if (event.attempt_count + 1 >= 5) await admin.from("webhook_events").update({ status: "dead_letter" }).eq("id", event.id); }
  }
  return NextResponse.json({ ok: true, processed, failed });
}


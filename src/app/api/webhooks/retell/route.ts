import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { verify } from "retell-sdk";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const eventSchema = z.object({
  event: z.string().min(1),
  call: z.object({ call_id: z.string().min(1), agent_id: z.string().min(1), start_timestamp: z.number().optional() }).passthrough().optional(),
  chat: z.object({ chat_id: z.string().min(1), agent_id: z.string().min(1) }).passthrough().optional()
}).passthrough();

function deduplicationKey(event: z.infer<typeof eventSchema>) {
  if (event.call) {
    if (event.event.startsWith("transfer_")) return `${event.event}:${event.call.call_id}:${event.call.start_timestamp ?? "unknown"}`;
    if (event.event === "transcript_updated") return `${event.event}:${event.call.call_id}:${createHash("sha256").update(JSON.stringify(event.call)).digest("hex")}`;
    return `${event.event}:${event.call.call_id}`;
  }
  if (event.chat) return `${event.event}:${event.chat.chat_id}`;
  throw new Error("Webhook payload has no supported provider object.");
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_000_000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  const signature = request.headers.get("x-retell-signature");
  const webhookKey = process.env.RETELL_WEBHOOK_API_KEY ?? process.env.RETELL_API_KEY;
  if (!signature || !webhookKey || !(await verify(rawBody, webhookKey, signature))) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
  const admin = createAdminClient();
  const { data: connection } = await admin.from("retell_connections").select("id").eq("status", "active").limit(1).maybeSingle();
  if (!connection) return NextResponse.json({ error: "NO_ACTIVE_RETELL_CONNECTION" }, { status: 503 });
  const objectId = parsed.data.call?.call_id ?? parsed.data.chat?.chat_id ?? null;
  const { error } = await admin.from("webhook_events").insert({
    connection_id: connection.id,
    provider: "retell",
    deduplication_key: deduplicationKey(parsed.data),
    event_type: parsed.data.event,
    provider_object_id: objectId,
    signature_verified_at: new Date().toISOString(),
    payload_sha256: createHash("sha256").update(rawBody).digest("hex"),
    status: "pending"
  });
  if (error && error.code !== "23505") return NextResponse.json({ error: "INBOX_UNAVAILABLE" }, { status: 503 });
  return new NextResponse(null, { status: 204 });
}

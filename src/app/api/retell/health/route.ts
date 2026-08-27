import { NextResponse } from "next/server";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { listRetellAgents } from "@/lib/retell/client";

export async function GET() {
  const context = await requireAuthorizationContext();
  requirePermission(context, "retell_connections.manage");
  try {
    const agents = await listRetellAgents();
    return NextResponse.json({ ok: true, voiceAgentCount: agents.voice.length, chatAgentCount: agents.chat.length });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("Retell health check failed", { requestId, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ ok: false, error: "RETELL_HEALTH_CHECK_FAILED", requestId }, { status: 503 });
  }
}

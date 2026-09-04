import { NextResponse } from "next/server";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { synchronizeRetellData } from "@/lib/retell/synchronize";

// The full reconciliation pulls agents plus up to 1000 calls, chats and contacts
// from Retell in one request. Vercel's default function budget cuts that short,
// which aborts the run part-way and leaves newly imported agents unassigned.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const context = await requireAuthorizationContext();
  requirePermission(context, "agents.manage");
  requirePermission(context, "retell_connections.manage");
  return synchronizeRetellData(context.userId);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return synchronizeRetellData(null);
}

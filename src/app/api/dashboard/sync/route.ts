import { NextResponse } from "next/server";
import { requireAuthorizationContext } from "@/lib/auth/context";
import { synchronizeRetellData } from "@/lib/retell/synchronize";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Every open dashboard ticks on this endpoint so the newest Retell records reach
// Supabase without waiting for the five-minute schedule. The reconciliation is
// far too heavy to run once per viewer, so the interval is enforced here and the
// claim below decides which single tick actually performs the run.
export const DASHBOARD_SYNC_INTERVAL_MS = 30_000;

export async function POST() {
  // Any signed-in session may tick. It returns a timestamp and nothing else, and
  // the interval bounds what a caller can cause however often they ask.
  await requireAuthorizationContext();
  const admin = createAdminClient();
  const { data: connection, error } = await admin.from("retell_connections").select("id,last_sync_at").eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: "CONNECTION_LOOKUP_FAILED" }, { status: 503 });
  if (!connection) return NextResponse.json({ ranSync: false, reason: "NO_ACTIVE_CONNECTION" });

  const cutoff = new Date(Date.now() - DASHBOARD_SYNC_INTERVAL_MS).toISOString();
  if (connection.last_sync_at && connection.last_sync_at > cutoff) {
    return NextResponse.json({ ranSync: false, syncedAt: connection.last_sync_at });
  }

  // Claiming the slot before running is what stops ten open dashboards from
  // starting ten reconciliations against Retell at the same moment. Only the
  // request whose conditional update matches a row goes on to do the work.
  const claim = await admin.from("retell_connections").update({ last_sync_at: new Date().toISOString() })
    .eq("id", connection.id)
    .or(`last_sync_at.is.null,last_sync_at.lt.${cutoff}`)
    .select("id");
  if (claim.error) return NextResponse.json({ error: "SYNC_CLAIM_FAILED" }, { status: 503 });
  if (!claim.data?.length) return NextResponse.json({ ranSync: false, syncedAt: connection.last_sync_at });

  return synchronizeRetellData(null);
}

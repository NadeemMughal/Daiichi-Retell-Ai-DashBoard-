"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";

// Supabase Cron owns synchronization (supabase/cron/setup_agent_import.sql). An open
// operations page reconciles on the same cadence as a fallback, so agents created or
// deleted in Retell still appear while an operator is watching even if the scheduled
// job has not been installed yet.
const FALLBACK_SYNC_MS = 5 * 60_000;
const STALE_AFTER_MS = 15 * 60_000;

export function ImportButton({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [manualSyncedAt, setManualSyncedAt] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const running = useRef(false);
  const router = useRouter();

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/agents/import", { method: "POST" });
      const result = await response.json() as { ok?: boolean; voiceCount?: number; chatCount?: number; callCount?: number; conversationCount?: number; contactCount?: number; unassignedAgentCount?: number; schemaDrift?: string[]; error?: string; code?: string; detail?: string };
      if (!response.ok) throw new Error([result.error, result.code, result.detail].filter(Boolean).join(": ") || "Import failed");
      setManualSyncedAt(new Date().toISOString());
      const stranded = result.unassignedAgentCount ?? 0;
      const drift = result.schemaDrift ?? [];
      setMessage(`${result.voiceCount ?? 0} voice agents, ${result.chatCount ?? 0} chat agents, ${result.callCount ?? 0} calls, ${result.conversationCount ?? 0} chats, and ${result.contactCount ?? 0} contacts synchronized.${stranded ? ` ${stranded} agent${stranded === 1 ? "" : "s"} still awaiting a workspace assignment.` : ""}${drift.length ? ` Stored without ${drift.join(", ")} — apply the pending database migration.` : ""}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      running.current = false;
      setLoading(false);
    }
  }, [router]);

  // Comparing timestamps only after mount keeps the server and client markup identical.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const immediate = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 30_000);
    return () => { window.clearTimeout(immediate); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void run();
    }, FALLBACK_SYNC_MS);
    return () => window.clearInterval(timer);
  }, [run]);

  const syncedAt = [manualSyncedAt, lastSyncedAt].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const syncedMs = syncedAt ? Date.parse(syncedAt) : null;
  const stale = now !== null && (syncedMs === null || now - syncedMs > STALE_AFTER_MS);
  const relative = now === null || syncedMs === null ? null : describeAge(now - syncedMs);

  return <div className="flex flex-col items-end gap-2">
    <button onClick={() => void run()} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl bg-[#164f3e] px-4 text-sm font-semibold text-white hover:bg-[#1f7659] disabled:opacity-60">
      <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />{loading ? "Syncing Retell..." : "Sync Retell data"}
    </button>
    <p className={`flex items-center gap-1.5 text-right text-[11px] ${stale ? "font-semibold text-amber-700" : "text-[#71817c]"}`}>
      {stale && <TriangleAlert className="size-3.5 shrink-0" />}
      {relative === null ? "Checking workspace synchronization…" : `Retell workspace synchronized ${relative}`}
    </p>
    {message && <p role="status" className="max-w-sm text-right text-xs text-[#657670]">{message}</p>}
  </div>;
}

function describeAge(elapsedMs: number) {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

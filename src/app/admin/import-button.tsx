"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export function ImportButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const running = useRef(false);
  const router = useRouter();
  const run = useCallback(async (automatic = false) => {
    if (running.current) return;
    running.current = true;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/agents/import", { method: "POST" });
      const result = await response.json() as { ok?: boolean; voiceCount?: number; chatCount?: number; callCount?: number; conversationCount?: number; contactCount?: number; error?: string; code?: string; detail?: string };
      if (!response.ok) throw new Error([result.error, result.code, result.detail].filter(Boolean).join(": ") || "Import failed");
      setLastSyncedAt(new Date());
      setMessage(`${automatic ? "Automatic sync: " : ""}${result.voiceCount ?? 0} voice agents, ${result.chatCount ?? 0} chat agents, ${result.callCount ?? 0} calls, ${result.conversationCount ?? 0} chats, and ${result.contactCount ?? 0} contacts synchronized.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      running.current = false;
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void run(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [run]);

  return <div className="flex flex-col items-end gap-2">
    <button onClick={() => void run(false)} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl bg-[#164f3e] px-4 text-sm font-semibold text-white hover:bg-[#1f7659] disabled:opacity-60">
      <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />{loading ? "Syncing Retell..." : "Sync Retell data"}
    </button>
    <p className="text-right text-[11px] text-[#71817c]">Automatic refresh every minute{lastSyncedAt ? ` | Last ${lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</p>
    {message && <p role="status" className="max-w-sm text-right text-xs text-[#657670]">{message}</p>}
  </div>;
}

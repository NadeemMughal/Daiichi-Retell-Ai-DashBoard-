"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export function ImportButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  async function run() {
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/agents/import", { method: "POST" });
      const result = await response.json() as { ok?: boolean; voiceCount?: number; chatCount?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Import failed");
      setMessage(`${result.voiceCount ?? 0} voice and ${result.chatCount ?? 0} chat agents synchronized.`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed"); }
    finally { setLoading(false); }
  }
  return <div className="flex flex-col items-end gap-2"><button onClick={run} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl bg-[#164f3e] px-4 text-sm font-semibold text-white hover:bg-[#1f7659] disabled:opacity-60"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Sync Retell agents</button>{message && <p className="text-xs text-[#657670]">{message}</p>}</div>;
}


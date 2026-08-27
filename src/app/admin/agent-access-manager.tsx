"use client";

import { useEffect, useState } from "react";
import { Bot, Check, LoaderCircle, LockKeyhole, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AccessUser = { userId: string; tenantId: string; name: string; email: string; tenantName: string };
type AccessAgent = { id: string; name: string; kind: string; tenantId: string | null };

export function AgentAccessManager({ users, agents, grants }: { users: AccessUser[]; agents: AccessAgent[]; grants: Array<{ userId: string; agentId: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"grant" | "revoke" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [optimisticAccess, setOptimisticAccess] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("admin-user-agent-access").on("postgres_changes", { event: "*", schema: "public", table: "user_agent_access" }, () => router.refresh()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router]);
  const grantedFromServer = new Set(grants.map((grant) => `${grant.userId}:${grant.agentId}`));
  const granted = { has: (key: string) => optimisticAccess[key] ?? grantedFromServer.has(key) };

  async function change(user: AccessUser, agent: AccessAgent, action: "grant" | "revoke") {
    const key = `${user.userId}:${agent.id}`;
    setBusy(key); setBusyAction(action); setMessage(null);
    setOptimisticAccess((current) => ({ ...current, [key]: action === "grant" }));
    try {
      const response = await fetch("/api/admin/user-agent-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId: user.tenantId, userId: user.userId, agentId: agent.id, action }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Access update failed");
      setMessage(action === "grant" ? `Access granted to ${user.name}.` : `Access removed from ${user.name}.`);
      router.refresh();
    } catch (error) {
      setOptimisticAccess((current) => ({ ...current, [key]: action !== "grant" }));
      setMessage(error instanceof Error ? error.message : "Access update failed");
    } finally { setBusy(null); setBusyAction(null); }
  }

  return <article className="glass mt-5 rounded-2xl p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><LockKeyhole className="size-5 text-[#1f7659]"/><h2 className="font-semibold">User agent access</h2></div><p className="mt-1 text-xs text-[#71817c]">Daiichi grants read-only visibility to individual agents. Users never receive Retell edit access.</p></div>{message && <p className="rounded-lg bg-[#e8f3ed] px-3 py-2 text-xs font-semibold text-[#1f7659]">{message}</p>}</div>
    <div className="mt-5 space-y-4">{users.map((user) => <section key={`${user.tenantId}:${user.userId}`} className="rounded-2xl border border-[#173f3310] bg-white/65 p-5"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#d7f55b] text-[#123e32]"><UserRound className="size-5"/></div><div><p className="font-semibold">{user.name}</p><p className="text-xs text-[#71817c]">{user.email} · {user.tenantName}</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{agents.map((agent) => { const key = `${user.userId}:${agent.id}`; const hasAccess = granted.has(key); const isBusy = busy === key; const belongsElsewhere = Boolean(agent.tenantId && agent.tenantId !== user.tenantId); return <div key={agent.id} className="rounded-xl border border-[#173f3310] bg-white p-3"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-[#e8f3ed] text-[#1f7659]"><Bot className="size-4"/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{agent.name}</p><p className="text-[11px] capitalize text-[#84928d]">{belongsElsewhere ? "Assigned to another client" : agent.kind}</p></div>{hasAccess && <span className="flex items-center gap-1 rounded-full bg-[#e8f3ed] px-2 py-1 text-[11px] font-semibold text-[#1f7659]"><Check className="size-3"/>Active</span>}</div><div className="mt-3 grid grid-cols-2 gap-2"><button disabled={isBusy || belongsElsewhere || hasAccess} onClick={() => change(user, agent, "grant")} className="flex h-9 items-center justify-center gap-1 rounded-lg bg-[#164f3e] px-3 text-xs font-semibold text-white transition hover:bg-[#1f7659] disabled:cursor-not-allowed disabled:opacity-40">{isBusy && busyAction === "grant" ? <LoaderCircle className="size-4 animate-spin"/> : <><Check className="size-3"/>Grant</>}</button><button disabled={isBusy || !hasAccess} onClick={() => change(user, agent, "revoke")} className="flex h-9 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40">{isBusy && busyAction === "revoke" ? <LoaderCircle className="size-4 animate-spin"/> : <><X className="size-3"/>Remove Access</>}</button></div></div>; })}</div></section>)}{!users.length && <p className="rounded-xl border border-dashed border-[#173f3320] p-8 text-center text-sm text-[#71817c]">Create an active client membership before granting agent access.</p>}</div>
  </article>;
}

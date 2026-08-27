"use client";

import { useState } from "react";
import { Bot, Check, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

type AccessUser = { userId: string; tenantId: string; name: string; email: string; tenantName: string };
type AccessAgent = { id: string; name: string; kind: string; tenantId: string | null };

export function AgentAccessManager({ users, agents, grants }: { users: AccessUser[]; agents: AccessAgent[]; grants: Array<{ userId: string; agentId: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const granted = new Set(grants.map((grant) => `${grant.userId}:${grant.agentId}`));

  async function change(user: AccessUser, agent: AccessAgent, action: "grant" | "revoke") {
    const key = `${user.userId}:${agent.id}`;
    setBusy(key); setMessage(null);
    try {
      const response = await fetch("/api/admin/user-agent-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId: user.tenantId, userId: user.userId, agentId: agent.id, action }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Access update failed");
      setMessage(action === "grant" ? `Access granted to ${user.name}.` : `Access revoked from ${user.name}.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Access update failed"); }
    finally { setBusy(null); }
  }

  return <article className="glass mt-5 rounded-2xl p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><LockKeyhole className="size-5 text-[#1f7659]"/><h2 className="font-semibold">User agent access</h2></div><p className="mt-1 text-xs text-[#71817c]">Daiichi grants read-only visibility to individual agents. Users never receive Retell edit access.</p></div>{message && <p className="rounded-lg bg-[#e8f3ed] px-3 py-2 text-xs font-semibold text-[#1f7659]">{message}</p>}</div>
    <div className="mt-5 space-y-4">{users.map((user) => <section key={`${user.tenantId}:${user.userId}`} className="rounded-2xl border border-[#173f3310] bg-white/65 p-5"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#d7f55b] text-[#123e32]"><UserRound className="size-5"/></div><div><p className="font-semibold">{user.name}</p><p className="text-xs text-[#71817c]">{user.email} · {user.tenantName}</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{agents.map((agent) => { const key = `${user.userId}:${agent.id}`; const hasAccess = granted.has(key); const belongsElsewhere = Boolean(agent.tenantId && agent.tenantId !== user.tenantId); return <div key={agent.id} className="flex items-center gap-3 rounded-xl border border-[#173f3310] bg-white p-3"><div className="grid size-9 place-items-center rounded-lg bg-[#e8f3ed] text-[#1f7659]"><Bot className="size-4"/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{agent.name}</p><p className="text-[11px] capitalize text-[#84928d]">{belongsElsewhere ? "Assigned to another client" : agent.kind}</p></div><button disabled={busy === key || belongsElsewhere} onClick={() => change(user, agent, hasAccess ? "revoke" : "grant")} className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-45 ${hasAccess ? "bg-[#e8f3ed] text-[#1f7659]" : "bg-[#164f3e] text-white"}`}>{busy === key ? <LoaderCircle className="size-4 animate-spin"/> : hasAccess ? <span className="flex items-center gap-1"><Check className="size-3"/>Granted</span> : "Grant"}</button></div>; })}</div></section>)}{!users.length && <p className="rounded-xl border border-dashed border-[#173f3320] p-8 text-center text-sm text-[#71817c]">Create an active client membership before granting agent access.</p>}</div>
  </article>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, ChevronDown, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { matchesAgentOwnershipFilters, type AssignmentFilter } from "./agent-ownership-filter";

type Workspace = { id: string; name: string };
type Grant = { userId: string; name: string; email: string };
type Agent = { id: string; name: string; kind: string; tenantId: string | null; tenantName: string | null; grants: Grant[] };

export function AgentOwnershipList({ agents, workspaces, initialAssignmentFilter = "all" }: { agents: Agent[]; workspaces: Workspace[]; initialAssignmentFilter?: AssignmentFilter }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>(initialAssignmentFilter);
  const [refreshing, setRefreshing] = useState(false);
  const visibleAgents = useMemo(() => agents.filter((agent) => matchesAgentOwnershipFilters(agent, workspaceId, assignmentFilter)), [agents, assignmentFilter, workspaceId]);
  const selectedName = workspaceId === "all" ? "All workspaces" : workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "Workspace";
  useEffect(() => {
    const supabase = createClient();
    const refresh = () => { setRefreshing(true); router.refresh(); window.setTimeout(() => setRefreshing(false), 500); };
    const channel = supabase.channel("agent-ownership-records")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_agent_access" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_assignments" }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router]);

  return <article className="glass rounded-2xl p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold">Agent ownership</h2><p className="mt-1 text-xs text-[#71817c]">Select a workspace to view all Retell agents assigned to it.</p></div><Activity className="size-5 shrink-0 text-[#1f7659]"/></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="relative block"><span className="mb-2 block text-xs font-semibold text-[#596a64]">Filter by workspace</span><select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-[#173f3320] bg-white px-4 pr-10 text-sm font-semibold text-[#164f3e] outline-none transition focus:border-[#1f7659] focus:ring-4 focus:ring-[#1f765915]"><option value="all">All workspaces</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><ChevronDown className="pointer-events-none absolute bottom-3.5 right-4 size-4 text-[#71817c]"/></label><label className="relative block"><span className="mb-2 block text-xs font-semibold text-[#596a64]">Assignment status</span><select value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value as AssignmentFilter)} className="h-11 w-full appearance-none rounded-xl border border-[#173f3320] bg-white px-4 pr-10 text-sm font-semibold text-[#164f3e] outline-none transition focus:border-[#1f7659] focus:ring-4 focus:ring-[#1f765915]"><option value="all">All imported agents</option><option value="assigned">Assigned agents</option><option value="unassigned">Unassigned agents</option></select><ChevronDown className="pointer-events-none absolute bottom-3.5 right-4 size-4 text-[#71817c]"/></label></div>
    <div className="mt-3 flex items-center justify-between text-xs text-[#71817c]"><span>{selectedName}</span><span className="flex items-center gap-2">{refreshing && <RefreshCw className="size-3 animate-spin"/>}{visibleAgents.length} {visibleAgents.length === 1 ? "agent" : "agents"}</span></div>
    <div className="mt-3 max-h-[430px] space-y-3 overflow-y-auto pr-2 [scrollbar-color:#b8c9c2_transparent]">
      {visibleAgents.map((agent) => <OwnershipAgentCard key={agent.id} agent={agent} workspaces={workspaces}/>) }
      {!visibleAgents.length && <p className="rounded-xl border border-dashed border-[#173f3320] bg-white/50 p-8 text-center text-sm text-[#71817c]">No agents match the selected workspace and assignment status.</p>}
    </div>
  </article>;
}

function OwnershipAgentCard({ agent, workspaces }: { agent: Agent; workspaces: Workspace[] }) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState(agent.tenantId ?? workspaces[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const save = async () => {
    if (!tenantId || tenantId === agent.tenantId) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/assignments", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId, agentId: agent.id, reason: "Workspace assignment updated from Agent Ownership." }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to assign workspace");
      setMessage("Workspace assigned."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to assign workspace"); }
    finally { setSaving(false); }
  };
  return <div className="rounded-xl border border-[#173f3310] bg-white/70 p-4"><div className="flex flex-wrap items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e8f3ed] text-[#1f7659]"><Bot className="size-4"/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{agent.name}</p><p className="text-xs capitalize text-[#84928d]">{agent.kind} · {agent.grants.length} user {agent.grants.length === 1 ? "grant" : "grants"}</p></div><span className={`max-w-52 truncate rounded-full px-2.5 py-1 text-xs font-semibold ${agent.tenantId ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} title={agent.tenantName ?? "Client assignment required"}>{agent.tenantName ?? "Client assignment required"}</span></div><div className="mt-3 flex flex-wrap gap-2">{agent.grants.map((user) => <span key={`${agent.id}:${user.userId}`} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800" title={user.email}>{user.name}</span>)}{agent.tenantId && !agent.grants.length && <span className="text-xs text-[#84928d]">No client user currently has access.</span>}{!agent.tenantId && <span className="text-xs font-semibold text-amber-700">Select a workspace below to assign this agent.</span>}</div><div className="mt-4 flex flex-col gap-2 border-t border-[#173f3310] pt-3 sm:flex-row"><label className="min-w-0 flex-1"><span className="sr-only">Workspace for {agent.name}</span><select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setMessage(""); }} className="h-10 w-full rounded-xl border border-[#173f3320] bg-white px-3 text-sm outline-none focus:border-[#1f7659]"><option value="">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><button type="button" onClick={() => void save()} disabled={saving || !tenantId || tenantId === agent.tenantId} className="h-10 rounded-xl bg-[#164f3e] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Assigning..." : agent.tenantId ? "Update workspace" : "Assign workspace"}</button></div>{message && <p role="status" className={`mt-2 text-xs font-semibold ${/unable|failed/i.test(message) ? "text-rose-700" : "text-emerald-700"}`}>{message}</p>}</div>;
}

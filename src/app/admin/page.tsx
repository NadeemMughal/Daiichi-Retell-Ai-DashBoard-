import Link from "next/link";
import { Activity, Bot, Building2, ChevronRight, CircleAlert, Eye, FileText, LayoutDashboard, MessageSquareText, Phone, ShieldCheck, Users, Webhook } from "lucide-react";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { ImportButton } from "./import-button";
import { AgentAccessManager } from "./agent-access-manager";

export const dynamic = "force-dynamic";

const portalPages = [
  { label: "Overview", href: "/admin/dashboard?view=Overview", icon: LayoutDashboard },
  { label: "Voice agents", href: "/admin/dashboard?view=Voice%20agents", icon: Bot },
  { label: "Calls", href: "/admin/dashboard?view=Calls", icon: Phone },
  { label: "Chat", href: "/admin/dashboard?view=Chat", icon: MessageSquareText },
  { label: "Reports", href: "/admin/dashboard?view=Reports", icon: FileText },
  { label: "Team", href: "/admin/dashboard?view=Team", icon: Users }
];

export default async function AdminPage() {
  const context = await requireAuthorizationContext();
  requirePermission(context, "tenants.read");
  const admin = createAdminClient();
  const [{ data: tenants }, { data: agents }, { count: pendingEvents }, { count: invoiceCount }, { data: memberships }, { data: accessGrants }] = await Promise.all([
    admin.from("tenants").select("id,slug,display_name,status").neq("status", "archived").order("display_name"),
    admin.from("retell_agents").select("id,display_name,kind,agent_assignments(id,tenant_id,valid_to,tenants(display_name))").eq("status", "active").order("display_name"),
    admin.from("webhook_events").select("id", { count: "exact", head: true }).in("status", ["pending", "failed", "dead_letter"]),
    admin.from("manual_invoices").select("id", { count: "exact", head: true }).neq("status", "paid"),
    admin.from("tenant_memberships").select("user_id,tenant_id,status,member:profiles!tenant_memberships_user_id_fkey(display_name,email),tenants(display_name)").eq("status", "active"),
    admin.from("user_agent_access").select("user_id,agent_id").is("revoked_at", null)
  ]);
  const unassigned = (agents ?? []).filter((agent) => !agent.agent_assignments?.length);
  const cards = [
    { label: "Client organizations", value: tenants?.length ?? 0, icon: Building2, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Imported agents", value: agents?.length ?? 0, icon: Bot, tone: "bg-blue-50 text-blue-700" },
    { label: "Unassigned agents", value: unassigned.length, icon: CircleAlert, tone: "bg-amber-50 text-amber-700" },
    { label: "Webhook exceptions", value: pendingEvents ?? 0, icon: Webhook, tone: "bg-rose-50 text-rose-700" }
  ];
  const accessUsers = (memberships ?? []).map((membership) => {
    const member = Array.isArray(membership.member) ? membership.member[0] : membership.member;
    const tenant = Array.isArray(membership.tenants) ? membership.tenants[0] : membership.tenants;
    return { userId: membership.user_id, tenantId: membership.tenant_id, name: member?.display_name ?? member?.email ?? "Client user", email: member?.email ?? "", tenantName: tenant?.display_name ?? "Client workspace" };
  });
  const accessAgents = (agents ?? []).map((agent) => ({ id: agent.id, name: agent.display_name, kind: agent.kind, tenantId: agent.agent_assignments?.find((assignment) => !assignment.valid_to)?.tenant_id ?? null }));

  return <main className="subtle-grid min-h-screen p-5 md:p-10">
    <div className="mx-auto max-w-7xl">
      <nav className="glass mb-8 flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center">
        <Link href="/" className="flex items-center gap-3 rounded-xl px-2 py-1 transition hover:bg-white/70" aria-label="Daiichi home">
          <span className="grid size-10 place-items-center rounded-xl bg-[#164f3e] font-black text-[#d7f55b]">D</span>
          <span><span className="block text-[10px] font-bold uppercase tracking-[.22em] text-[#71817c]">Daiichi</span><span className="font-semibold">Agent Intelligence</span></span>
        </Link>
        <div className="sm:ml-auto flex flex-wrap gap-2">
          <Link href="/admin" className="flex items-center gap-2 rounded-xl bg-[#164f3e] px-4 py-2.5 text-sm font-semibold text-white"><LayoutDashboard className="size-4" />Operations</Link>
          <Link href="/admin/dashboard" className="flex items-center gap-2 rounded-xl border border-[#173f3317] bg-white px-4 py-2.5 text-sm font-semibold text-[#164f3e]"><Eye className="size-4" />Owner dashboard</Link>
        </div>
      </nav>

      <section className="mb-8"><div className="mb-3 flex items-end justify-between"><div><h2 className="font-semibold">Owner dashboard pages</h2><p className="mt-1 text-xs text-[#71817c]">Live global reporting across every active Retell voice and chat agent.</p></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{portalPages.map((page) => <Link key={page.href} href={page.href} className="glass group flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-lg"><span className="grid size-10 place-items-center rounded-xl bg-[#e8f3ed] text-[#1f7659]"><page.icon className="size-5" /></span><span className="text-sm font-semibold">{page.label}</span><ChevronRight className="ml-auto size-4 text-[#84928d] transition group-hover:translate-x-0.5" /></Link>)}</div></section>

      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-[#1f7659]"><ShieldCheck className="size-4" />Daiichi operations</div><h1 className="mt-3 text-4xl font-semibold tracking-[-.05em]">Platform control center</h1><p className="mt-2 text-[#71817c]">Shared Retell workspace, isolated through explicit client assignments.</p></div>
        {context.permissions.has("retell_connections.manage") && <ImportButton />}
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <article key={card.label} className="glass rounded-2xl p-5"><div className={`grid size-10 place-items-center rounded-xl ${card.tone}`}><card.icon className="size-5" /></div><p className="mt-5 text-sm text-[#71817c]">{card.label}</p><p className="mt-1 text-3xl font-semibold">{card.value}</p></article>)}</section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <article className="glass rounded-2xl p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Agent ownership</h2><p className="mt-1 text-xs text-[#71817c]">Every active agent must have exactly one client assignment.</p></div><Activity className="size-5 text-[#1f7659]" /></div><div className="mt-5 space-y-2">{(agents ?? []).slice(0, 10).map((agent) => { const assignment = agent.agent_assignments?.[0]; const tenantRelation = assignment && (Array.isArray(assignment.tenants) ? assignment.tenants[0] : assignment.tenants); return <div key={agent.id} className="flex items-center gap-3 rounded-xl border border-[#173f3310] bg-white/70 p-4"><div className="grid size-9 place-items-center rounded-lg bg-[#e8f3ed] text-[#1f7659]"><Bot className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{agent.display_name}</p><p className="text-xs text-[#84928d]">{agent.kind}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tenantRelation ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{tenantRelation?.display_name ?? "Assignment required"}</span></div>})}{!agents?.length && <p className="rounded-xl bg-white/60 p-8 text-center text-sm text-[#71817c]">No agents imported yet.</p>}</div></article>
        <div className="space-y-5">
          <article className="glass rounded-2xl p-6"><h2 className="font-semibold">Client dashboards</h2><p className="mt-1 text-xs text-[#71817c]">Open a tenant’s real reporting portal.</p><div className="mt-4 space-y-2">{(tenants ?? []).map((tenant) => <Link key={tenant.id} href={`/${tenant.slug}/overview`} className="flex items-center gap-3 rounded-xl bg-white/70 p-4 transition hover:bg-white"><Building2 className="size-5 text-[#1f7659]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{tenant.display_name}</span><span className="text-xs capitalize text-[#84928d]">{tenant.status}</span></span><ChevronRight className="size-4 text-[#71817c]" /></Link>)}{!tenants?.length && <div className="rounded-xl border border-dashed border-[#173f3320] p-5 text-sm text-[#71817c]">No client workspace exists yet. The portal preview is available above; real pages appear here after a tenant is created.</div>}</div></article>
          <article className="glass rounded-2xl p-6"><h2 className="font-semibold">Operations checklist</h2><div className="mt-5 space-y-3">{[{ label: "Tenant boundary", value: "RLS + server checks", icon: ShieldCheck }, { label: "Manual invoices open", value: String(invoiceCount ?? 0), icon: FileText }, { label: "Webhook queue", value: `${pendingEvents ?? 0} exceptions`, icon: Webhook }].map((item) => <div key={item.label} className="flex items-center gap-3 rounded-xl bg-white/70 p-4"><item.icon className="size-5 text-[#1f7659]"/><div><p className="text-sm font-semibold">{item.label}</p><p className="text-xs text-[#84928d]">{item.value}</p></div></div>)}</div></article>
        </div>
      </section>
      {context.permissions.has("members.manage") && context.permissions.has("agents.manage") && <AgentAccessManager users={accessUsers} agents={accessAgents} grants={(accessGrants ?? []).map((grant) => ({ userId: grant.user_id, agentId: grant.agent_id }))} />}
    </div>
  </main>;
}

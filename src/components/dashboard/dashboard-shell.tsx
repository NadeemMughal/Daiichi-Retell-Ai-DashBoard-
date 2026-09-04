"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarCheck,
  Clock3,
  FileText,
  Headphones,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Phone,
  RefreshCw,
  Search,
  Settings,
  Users,
  X
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { RetellAgentsView, RetellContactsView, RetellPhoneNumbersView } from "./retell-views";
import { type DateRangeValue } from "./date-range-picker";
import { AnalyticsDashboard } from "./analytics-dashboard";
import { SessionHistoryView } from "./session-history-view";
import { LogoutButton } from "@/components/logout-button";

const nav = [
  { label: "Home", slug: "overview", icon: LayoutDashboard },
  { label: "Agents", slug: "voice-agents", icon: Bot },
  { label: "Phone Numbers", slug: "phone-numbers", icon: Phone },
  { label: "Call History", slug: "calls", icon: Phone },
  { label: "Chat History", slug: "chat", icon: MessageSquareText },
  { label: "Contacts", slug: "contacts", icon: Users },
  { label: "Analytics", slug: "reports", icon: FileText },
  { label: "Team", slug: "team", icon: Users }
];

const previewChartData = [
  { day: "Aug 21", calls: 71, converted: 22 },
  { day: "Aug 22", calls: 86, converted: 31 },
  { day: "Aug 23", calls: 64, converted: 24 },
  { day: "Aug 24", calls: 104, converted: 43 },
  { day: "Aug 25", calls: 94, converted: 36 },
  { day: "Aug 26", calls: 128, converted: 54 },
  { day: "Aug 27", calls: 119, converted: 49 }
];

const previewCalls = [
  { contact: "Ayesha Khan", number: "+92 ••• ••• 4712", agent: "Booking concierge", outcome: "Appointment booked", duration: "4:18", time: "10:42 AM", tone: "success" },
  { contact: "Hassan Ali", number: "+92 ••• ••• 0821", agent: "Lead qualifier", outcome: "Qualified lead", duration: "3:06", time: "10:28 AM", tone: "success" },
  { contact: "Unknown caller", number: "+92 ••• ••• 9140", agent: "Booking concierge", outcome: "Follow-up needed", duration: "1:52", time: "10:03 AM", tone: "warning" },
  { contact: "Sara Ahmed", number: "+92 ••• ••• 7734", agent: "Support desk", outcome: "Resolved", duration: "5:24", time: "9:47 AM", tone: "success" }
];

const previewMetrics = [
  { label: "Total calls", value: "666", change: "+12.8%", detail: "vs previous 7 days", positive: true },
  { label: "Appointments", value: "184", change: "+8.4%", detail: "27.6% conversion", positive: true },
  { label: "Avg. duration", value: "3m 42s", change: "-4.1%", detail: "faster resolution", positive: true },
  { label: "Human handoff", value: "8.2%", change: "+0.6%", detail: "within target", positive: false }
];

export type DashboardDataset = {
  tenantId?: string;
  tenantName: string;
  userName: string;
  metrics: typeof previewMetrics;
  chart: typeof previewChartData;
  calls: Array<{ contact: string; number: string; agentId?: string; agent: string; outcome: string; duration: string; time: string; startedAt?: string; tone: string; sessionId?: string; channel?: string; direction?: string; fromNumber?: string; toNumber?: string; latencyMs?: number; agentVersion?: number; summary?: string; custom?: Record<string, string>; cost?: string; endReason?: string; sentiment?: string; status?: string }>;
  agents: Array<{ id: string; providerId?: string; version?: number; name: string; kind: "voice" | "chat"; calls: number; chats: number; score: string; status: string; modifiedAt?: string }>;
  chats: Array<{ id: string; agentId?: string; agent: string; outcome: string; messages: number; time: string; startedAt?: string; status: string; sessionId?: string; agentVersion?: number; summary?: string; custom?: Record<string, string>; cost?: string; sentiment?: string }>;
  team: Array<{ name: string; email: string; role: string; status: string }>;
  lastSyncedAt: string;
  allowedViews: string[];
  permissions: string[];
  effectiveRole: "super_admin" | "admin" | "client";
  phoneNumbers?: Array<{ number: string; prettyNumber: string; nickname: string; type: string; inboundAgentIds: string[]; outboundAgentIds: string[]; modifiedAt: string }>;
};

const metricIcons = [Phone, CalendarCheck, Clock3, Headphones] as const;

const previewAgents = [
  { id: "preview-1", name: "Booking concierge", kind: "voice" as const, calls: 284, chats: 0, score: "96%", status: "active" },
  { id: "preview-2", name: "Lead qualifier", kind: "voice" as const, calls: 231, chats: 0, score: "92%", status: "active" },
  { id: "preview-3", name: "Support chat", kind: "chat" as const, calls: 0, chats: 151, score: "89%", status: "active" }
];

export function DashboardShell({ preview = false, data, initialView = "Overview" }: { preview?: boolean; data?: DashboardDataset; initialView?: string }) {
  const dashboard: DashboardDataset = data ?? { tenantName: "Daiichi Automotive", userName: "Nadeem", metrics: previewMetrics, chart: previewChartData, calls: previewCalls, agents: previewAgents, chats: [], team: [], lastSyncedAt: new Date().toISOString(), allowedViews: nav.map((item) => item.label), permissions: ["reports.export"], effectiveRole: "client" };
  const router = useRouter();
  const visibleNav = nav.filter((item) => dashboard.allowedViews.includes(item.label));
  const normalizedInitialView = ({ Overview: "Home", "Voice agents": "Agents", Calls: "Call History", Chat: "Chat History", Reports: "Analytics" } as Record<string, string>)[initialView] ?? initialView;
  const initialAllowedView = dashboard.allowedViews.includes(normalizedInitialView) ? normalizedInitialView : visibleNav[0]?.label ?? "Home";
  const [active, setActive] = useState(initialAllowedView);
  const reportingEnd = new Date(dashboard.lastSyncedAt).toISOString().slice(0, 10);
  const reportingMinimum = useMemo(() => {
    const dates = [...dashboard.calls.map((call) => call.startedAt), ...dashboard.chats.map((chat) => chat.startedAt)]
      .filter((date): date is string => Boolean(date)).map((date) => date.slice(0, 10)).sort();
    return dates[0] ?? new Date(new Date(`${reportingEnd}T12:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  }, [dashboard.calls, dashboard.chats, reportingEnd]);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => ({
    start: new Date(new Date(`${reportingEnd}T12:00:00Z`).getTime() - 6 * 86_400_000).toISOString().slice(0, 10),
    end: reportingEnd,
    startTime: "00:00:00",
    endTime: "23:59:59",
    utcOffset: "+05:00",
    label: "Last 7 days"
  }));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigateTo = (view: string) => {
    setActive(view); setMobileOpen(false);
    if (!preview) router.replace(`?view=${encodeURIComponent(view)}`, { scroll: false });
  };
  const filteredCalls = useMemo(
    () => dashboard.calls.filter((call) => `${call.contact} ${call.agent} ${call.outcome}`.toLowerCase().includes(query.toLowerCase())),
    [dashboard.calls, query]
  );
  useEffect(() => {
    if (preview) return;
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [preview, router]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [mobileOpen]);
  useEffect(() => {
    if (preview) return;
    const supabase = createClient();
    const tenantFilter = dashboard.tenantId ? `tenant_id=eq.${dashboard.tenantId}` : undefined;
    const channel = supabase.channel("client-access-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_agent_access", filter: tenantFilter }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "tenant_memberships", filter: tenantFilter }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "dashboard_refresh_signals", filter: tenantFilter }, () => router.refresh())
      .subscribe();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
      else if (event === "USER_UPDATED") router.refresh();
    });
    return () => { authListener.subscription.unsubscribe(); void supabase.removeChannel(channel); };
  }, [dashboard.tenantId, preview, router]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {preview && (
        <div className="fixed inset-x-0 top-0 z-50 bg-[#d7f55b] px-4 py-2 text-center text-xs font-bold tracking-wide text-[#18382e]">
          DESIGN PREVIEW — SAMPLE DATA ONLY
        </div>
      )}
      {mobileOpen && <button type="button" aria-label="Close navigation menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-[39] bg-[#0b211a]/55 lg:hidden"/>}
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-[280px] border-r border-white/10 bg-[#123e32] text-white transition-transform lg:sticky lg:top-0 lg:w-auto lg:translate-x-0", preview && "pt-8", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-full flex-col p-5">
          <div className="flex items-center justify-between px-2 py-3">
            <Link href={preview ? "/preview/overview" : "/"} className="flex items-center gap-3 rounded-xl transition hover:opacity-85" aria-label="Return to Daiichi home">
              <div className="grid size-10 place-items-center rounded-xl bg-[#d7f55b] font-black text-[#123e32]">D</div>
              <div><p className="text-[10px] uppercase tracking-[.25em] text-white/55">Daiichi</p><p className="font-semibold">Agent Intelligence</p></div>
            </Link>
            <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 hover:bg-white/10 lg:hidden"><X className="size-5" /></button>
          </div>
          <div className="mt-7 rounded-2xl border border-white/10 bg-white/7 p-3">
            <div className="flex w-full items-center gap-3 text-left">
              <div className="grid size-9 place-items-center rounded-lg bg-white/12 text-sm font-bold">DA</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{dashboard.tenantName}</p><p className="truncate text-xs text-white/50">Client workspace</p></div>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/65">Active</span>
            </div>
          </div>
          <nav className="mt-7 space-y-1" aria-label="Primary navigation">
            {visibleNav.map((item) => preview ? <Link key={item.label} href={`/preview/${item.slug}`} onClick={() => setMobileOpen(false)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition", active === item.label ? "bg-white text-[#164f3e] shadow-lg" : "text-white/65 hover:bg-white/8 hover:text-white")}><item.icon className="size-[18px]" />{item.label}</Link> : <button key={item.label} onClick={() => navigateTo(item.label)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition", active === item.label ? "bg-white text-[#164f3e] shadow-lg" : "text-white/65 hover:bg-white/8 hover:text-white")}><item.icon className="size-[18px]" />{item.label}</button>)}
          </nav>
          <div className="mt-auto space-y-1 border-t border-white/10 pt-4">
            {dashboard.effectiveRole !== "client" && <Link href="/admin" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/65 transition hover:bg-white/8 hover:text-white"><Settings className="size-[18px]" />Back to operations</Link>}
            <div className="mt-3 flex items-center gap-3 rounded-xl px-3 py-3">
              <div className="grid size-9 place-items-center rounded-full bg-[#d7f55b] text-xs font-black text-[#123e32]">{dashboard.userName.slice(0, 2).toUpperCase()}</div>
              <div><p className="text-sm font-medium">{dashboard.userName}</p><p className="text-xs capitalize text-white/45">{dashboard.effectiveRole.replace("_", " ")}</p></div>
            </div>
            {!preview && (
              <LogoutButton dark loginPath={dashboard.effectiveRole === "super_admin" ? "/login/super-admin" : dashboard.effectiveRole === "admin" ? "/login/admin" : "/login/client"}/>
            )}
          </div>
        </div>
      </aside>

      <main className={cn("min-w-0", preview && "pt-8")}>
        <header className="sticky top-0 z-30 flex h-[76px] items-center gap-4 border-b border-[#173f3314] bg-[#f4f6f2] px-5 md:px-8">
          <button aria-label="Open menu" onClick={() => setMobileOpen(true)} className="rounded-xl border border-[#173f331a] bg-white p-2.5 lg:hidden"><Menu className="size-5" /></button>
          {active === "Home" && <div className="relative min-w-0 max-w-sm flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#70827c]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search calls, agents…" className="h-11 w-full rounded-xl border border-[#173f3317] bg-white/70 pl-10 pr-4 text-sm outline-none transition focus:border-[#1f7659] focus:ring-4 focus:ring-[#1f765915]" />
          </div>}
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full bg-[#e7f7ee] px-3 py-2 text-xs font-semibold text-[#1c674e] md:flex"><span className="size-2 animate-pulse rounded-full bg-[#28a06f]" />Live · refreshed {new Date(dashboard.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            <button aria-label="Refresh dashboard" onClick={() => router.refresh()} className="grid size-10 place-items-center rounded-xl border border-[#173f3317] bg-white"><RefreshCw className="size-5 text-[#1f7659]" /></button>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 md:p-8 xl:p-10">
          <section className="relative z-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#1f7659]">Performance command center</p><h1 className="text-3xl font-semibold tracking-[-.04em] md:text-4xl">{active === "Home" ? `Welcome, ${dashboard.userName}.` : active}</h1><p className="mt-2 text-sm text-[#687a74]">Live, tenant-isolated Retell reporting for {dashboard.tenantName}.</p></div>
          </section>

          {active === "Home" ? <>
          <section className="enter-delay mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.metrics.map((metric, metricIndex) => {
              const MetricIcon = metricIcons[metricIndex] ?? Activity;
              return (
              <article key={metric.label} className="glass rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
                <div className="flex items-start justify-between"><div className="grid size-10 place-items-center rounded-xl bg-[#e8f3ed] text-[#1d6c52]"><MetricIcon className="size-5" /></div><span className={cn("flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold", metric.positive ? "bg-[#e5f7eb] text-[#23724f]" : "bg-[#fff0dc] text-[#98601f]")}>{metric.positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{metric.change}</span></div>
                <p className="mt-6 text-sm text-[#687a74]">{metric.label}</p><p className="mt-1 text-3xl font-semibold tracking-[-.04em]">{metric.value}</p><p className="mt-2 text-xs text-[#8a9994]">{metric.detail}</p>
              </article>
            )})}
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
            <article className="glass rounded-2xl p-5 md:p-6">
              <div className="flex items-center justify-between"><div><h2 className="font-semibold">Conversation volume</h2><p className="mt-1 text-xs text-[#7c8c87]">Calls and successful outcomes</p></div><span className="rounded-full bg-[#e8f3ed] px-3 py-1 text-xs font-semibold text-[#1f7659]">Live reporting</span></div>
              <div className="mt-6 h-[285px]">
                <ResponsiveContainer width="100%" height="100%"><AreaChart data={dashboard.chart} margin={{ left: -20, right: 8 }}><defs><linearGradient id="calls" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1f7659" stopOpacity={0.28}/><stop offset="95%" stopColor="#1f7659" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#173f3312"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#7c8c87", fontSize: 11 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#7c8c87", fontSize: 11 }}/><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #173f3315", boxShadow: "0 12px 30px #173f3318" }}/><Area type="monotone" dataKey="calls" stroke="#1f7659" strokeWidth={3} fill="url(#calls)"/><Area type="monotone" dataKey="converted" stroke="#a1c72f" strokeWidth={2} fill="transparent"/></AreaChart></ResponsiveContainer>
              </div>
            </article>

            <article className="glass subtle-grid overflow-hidden rounded-2xl p-6">
              <div className="flex items-center justify-between"><div><h2 className="font-semibold">Agent health</h2><p className="mt-1 text-xs text-[#7c8c87]">{dashboard.agents.filter((agent) => agent.status === "active").length} active agents</p></div><Activity className="size-5 text-[#1f7659]" /></div>
              <div className="mt-6 space-y-3">
                {dashboard.agents.map((agent, index) => <div key={agent.name} className="rounded-xl border border-[#173f3310] bg-white/85 p-4"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#164f3e] text-white"><Bot className="size-5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{agent.name}</p><p className="text-xs text-[#7c8c87]">{agent.calls} calls this week</p></div><div className="text-right"><p className="text-sm font-bold text-[#1f7659]">{agent.score}</p><p className="text-[10px] text-[#8a9994]">quality</p></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8eeea]"><div className="h-full rounded-full bg-[#86ae31]" style={{ width: `${Math.max(10, 88 + index * 2)}%` }} /></div></div>)}
              </div>
            </article>
          </section>

          <section className="glass mt-5 overflow-hidden rounded-2xl">
            <div className="flex flex-col gap-3 border-b border-[#173f3310] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Recent conversations</h2><p className="mt-1 text-xs text-[#7c8c87]">Latest activity across your agents</p></div><button onClick={() => navigateTo("Call History")} className="inline-flex min-h-11 items-center self-start text-left text-sm font-semibold text-[#1f7659] transition hover:translate-x-0.5 hover:underline sm:min-h-0">View all calls</button></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-[#173f330d] text-[10px] uppercase tracking-[.14em] text-[#82918c]"><th className="px-5 py-3 font-semibold">Contact</th><th className="px-5 py-3 font-semibold">Agent</th><th className="px-5 py-3 font-semibold">Outcome</th><th className="px-5 py-3 font-semibold">Duration</th><th className="px-5 py-3 font-semibold">Time</th></tr></thead><tbody>{filteredCalls.map((call) => <tr key={`${call.contact}-${call.time}`} className="border-b border-[#173f3308] text-sm transition last:border-0 hover:bg-[#f4f8f5]"><td className="px-5 py-4"><p className="font-semibold">{call.contact}</p><p className="mt-0.5 text-xs text-[#87958f]">{call.number}</p></td><td className="px-5 py-4 text-[#596a64]">{call.agent}</td><td className="px-5 py-4"><span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", call.tone === "success" ? "bg-[#e5f7eb] text-[#23724f]" : "bg-[#fff0dc] text-[#98601f]")}>{call.outcome}</span></td><td className="px-5 py-4 text-[#596a64]">{call.duration}</td><td className="px-5 py-4 text-[#596a64]">{call.time}</td></tr>)}</tbody></table>
              {filteredCalls.length === 0 && <div className="p-10 text-center text-sm text-[#71817c]">No conversations match your search.</div>}
            </div>
          </section>
          </> : <WorkspacePage active={active} dashboard={dashboard} query={query} dateRange={dateRange} onDateRangeChange={setDateRange} reportingMinimum={reportingMinimum} />}
        </div>
      </main>
      {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden" />}
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return <div className="rounded-2xl border border-dashed border-[#173f3325] bg-white/55 p-12 text-center text-sm text-[#71817c]">{children}</div>;
}

function WorkspacePage({ active: selectedView, dashboard, query, dateRange, onDateRangeChange, reportingMinimum }: { active: string; dashboard: DashboardDataset; query: string; dateRange: DateRangeValue; onDateRangeChange: (value: DateRangeValue) => void; reportingMinimum: string }) {
  const active = ({ Agents: "Voice agents", "Call History": "Calls", "Chat History": "Chat", Analytics: "Reports" } as Record<string, string>)[selectedView] ?? selectedView;
  const rangeStart = new Date(`${dateRange.start}T${dateRange.startTime}${dateRange.utcOffset}`).getTime();
  const rangeEnd = new Date(`${dateRange.end}T${dateRange.endTime}${dateRange.utcOffset}`).getTime();
  const inRange = (startedAt?: string) => !startedAt || (new Date(startedAt).getTime() >= rangeStart && new Date(startedAt).getTime() <= rangeEnd);
  const voiceAgents = dashboard.agents.filter((agent) => (selectedView === "Agents" || agent.kind === "voice") && agent.name.toLowerCase().includes(query.toLowerCase()));
  const chatAgents = dashboard.agents.filter((agent) => agent.kind === "chat" && agent.name.toLowerCase().includes(query.toLowerCase()));
  const calls = dashboard.calls.filter((call) => inRange(call.startedAt) && `${call.contact} ${call.agent} ${call.outcome}`.toLowerCase().includes(query.toLowerCase()));
  const chats = dashboard.chats.filter((chat) => inRange(chat.startedAt) && `${chat.agent} ${chat.outcome} ${chat.status}`.toLowerCase().includes(query.toLowerCase()));
  if (selectedView === "Agents") return <section className="mt-8"><RetellAgentsView agents={dashboard.agents}/></section>;
  if (selectedView === "Phone Numbers") return <section className="mt-8"><RetellPhoneNumbersView phoneNumbers={dashboard.phoneNumbers ?? []} agents={dashboard.agents}/></section>;
  if (selectedView === "Call History") return <section className="mt-8"><SessionHistoryView kind="call" calls={calls} chats={chats} agents={dashboard.agents} canExport={dashboard.permissions.includes("reports.export")} dateRange={dateRange} onDateRangeChange={onDateRangeChange} reportingMinimum={reportingMinimum}/></section>;
  if (selectedView === "Chat History") return <section className="mt-8"><SessionHistoryView kind="chat" calls={calls} chats={chats} agents={dashboard.agents} canExport={dashboard.permissions.includes("reports.export")} dateRange={dateRange} onDateRangeChange={onDateRangeChange} reportingMinimum={reportingMinimum}/></section>;
  if (selectedView === "Contacts") return <section className="mt-8"><RetellContactsView calls={calls} canManage={dashboard.permissions.includes("retell_connections.manage")} canExport={dashboard.permissions.includes("reports.export")}/></section>;
  if (selectedView === "Analytics") return <section className="mt-8"><AnalyticsDashboard calls={calls} chats={chats} agents={dashboard.agents} dateRange={dateRange} onDateRangeChange={onDateRangeChange} reportingMinimum={reportingMinimum}/></section>;
  return <section className="mt-8">
    {active === "Voice agents" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{voiceAgents.map((agent) => <article key={agent.id} className="glass rounded-2xl p-6"><div className="flex items-center gap-4"><div className="grid size-12 place-items-center rounded-2xl bg-[#164f3e] text-white"><Bot className="size-6" /></div><div className="min-w-0"><h2 className="truncate font-semibold">{agent.name}</h2><p className="text-xs capitalize text-[#71817c]">{agent.status} voice agent</p></div></div><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/70 p-4"><p className="text-xs text-[#71817c]">Calls</p><p className="mt-1 text-2xl font-semibold">{agent.calls}</p></div><div className="rounded-xl bg-white/70 p-4"><p className="text-xs text-[#71817c]">Completion</p><p className="mt-1 text-2xl font-semibold">{agent.score}</p></div></div></article>)}{!voiceAgents.length && <EmptyState>No assigned voice agents match this workspace.</EmptyState>}</div>}
    {active === "Calls" && <ConversationTable calls={calls} />}
    {active === "Chat" && <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{chatAgents.map((agent) => <article key={agent.id} className="glass rounded-2xl p-5"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#164f3e] text-white"><MessageSquareText className="size-5" /></div><div><p className="font-semibold">{agent.name}</p><p className="text-xs text-[#71817c]">{agent.chats} chats · {agent.score} complete</p></div></div></article>)}{!chatAgents.length && <EmptyState>No chat agents are configured in Retell.</EmptyState>}</div><div className="glass overflow-hidden rounded-2xl">{chats.length ? <div className="divide-y divide-[#173f3310]">{chats.map((chat) => <div key={chat.id} className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"><div><p className="font-semibold">{chat.agent}</p><p className="text-xs text-[#71817c]">{chat.time}</p></div><p className="text-sm text-[#596a64]">{chat.outcome}</p><span className="text-sm">{chat.messages} AI messages</span><span className="rounded-full bg-[#e7f7ee] px-3 py-1 text-xs font-semibold capitalize text-[#1c674e]">{chat.status}</span></div>)}</div> : <EmptyState>No chat conversations have synchronized yet.</EmptyState>}</div></div>}
    {active === "Reports" && <ReportsView dashboard={{ ...dashboard, calls, chats }} />}
    {active === "Team" && <div className="glass overflow-hidden rounded-2xl">{dashboard.team.length ? <div className="divide-y divide-[#173f3310]">{dashboard.team.map((member) => <div key={member.email} className="flex items-center gap-4 p-5"><div className="grid size-10 place-items-center rounded-full bg-[#d7f55b] text-sm font-bold text-[#123e32]">{member.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{member.name}</p><p className="truncate text-xs text-[#71817c]">{member.email}</p></div><span className="text-sm capitalize text-[#596a64]">{member.role}</span><span className="rounded-full bg-[#e7f7ee] px-3 py-1 text-xs font-semibold capitalize text-[#1c674e]">{member.status}</span></div>)}</div> : <EmptyState>No active team memberships were found.</EmptyState>}</div>}
  </section>;
}

function ReportsView({ dashboard }: { dashboard: DashboardDataset }) {
  const [agentId, setAgentId] = useState("all");
  const selectedAgent = dashboard.agents.find((agent) => agent.id === agentId);
  const calls = selectedAgent ? dashboard.calls.filter((call) => call.agentId ? call.agentId === selectedAgent.id : call.agent === selectedAgent.name) : dashboard.calls;
  const chats = selectedAgent ? dashboard.chats.filter((chat) => chat.agentId ? chat.agentId === selectedAgent.id : chat.agent === selectedAgent.name) : dashboard.chats;
  const successful = [...calls, ...chats].filter((conversation) => /book|qualif|success|resolved/i.test(conversation.outcome)).length;
  const totalSeconds = calls.reduce((sum, call) => { const [minutes = 0, seconds = 0] = call.duration.split(":").map(Number); return sum + minutes * 60 + seconds; }, 0);
  const avgSeconds = calls.length ? Math.round(totalSeconds / calls.length) : 0;
  const metrics = [
    { label: "Total calls", value: String(calls.length), detail: selectedAgent?.name ?? "all accessible agents" },
    { label: "Successful outcomes", value: String(successful), detail: `${calls.length + chats.length ? Math.round(successful / (calls.length + chats.length) * 100) : 0}% of conversations` },
    { label: "Avg. call duration", value: `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`, detail: calls.length ? "completed calls" : "no calls in period" },
    { label: "Chat conversations", value: String(chats.length), detail: selectedAgent ? `${selectedAgent.score} completion` : `${dashboard.agents.length} accessible agents` }
  ];
  return <div className="space-y-5"><div className="glass flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#1f7659]">Agent performance</p><h2 className="mt-1 text-xl font-semibold">{selectedAgent?.name ?? "All accessible agents"}</h2><p className="mt-1 text-xs text-[#71817c]">Only agents assigned to your account are available.</p></div><label className="block"><span className="sr-only">Select an agent</span><select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="h-12 min-w-64 rounded-xl border border-[#173f3317] bg-white px-4 text-sm font-semibold text-[#164f3e] outline-none focus:border-[#1f7659] focus:ring-4 focus:ring-[#1f765915]"><option value="all">All accessible agents</option>{dashboard.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <article key={metric.label} className="glass rounded-2xl p-6"><p className="text-sm text-[#71817c]">{metric.label}</p><p className="mt-2 text-3xl font-semibold">{metric.value}</p><p className="mt-2 text-xs text-[#84928d]">{metric.detail}</p></article>)}</div></div>;
}

function ConversationTable({ calls }: { calls: DashboardDataset["calls"] }) {
  if (!calls.length) return <EmptyState>No calls have synchronized for this workspace yet.</EmptyState>;
  return <div className="glass overflow-x-auto rounded-2xl"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-[#173f330d] text-[10px] uppercase tracking-[.14em] text-[#82918c]"><th className="px-5 py-4">Contact</th><th className="px-5 py-4">Agent</th><th className="px-5 py-4">Outcome</th><th className="px-5 py-4">Duration</th><th className="px-5 py-4">Time</th></tr></thead><tbody>{calls.map((call) => <tr key={`${call.contact}-${call.time}`} className="border-b border-[#173f3308] text-sm last:border-0"><td className="px-5 py-4"><p className="font-semibold">{call.contact}</p><p className="text-xs text-[#87958f]">{call.number}</p></td><td className="px-5 py-4">{call.agent}</td><td className="px-5 py-4">{call.outcome}</td><td className="px-5 py-4">{call.duration}</td><td className="px-5 py-4">{call.time}</td></tr>)}</tbody></table></div>;
}

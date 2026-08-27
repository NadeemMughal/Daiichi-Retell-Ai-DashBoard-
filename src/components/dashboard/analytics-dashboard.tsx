"use client";

import { useMemo, useState } from "react";
import { Activity, BarChart3, MessageSquareText, Phone } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardDataset } from "./dashboard-shell";

const COLORS = ["#4f7df3", "#1f7659", "#d7f55b", "#e89b49", "#9b72cf", "#d45b6b"];
const successPattern = /success|book|resolved|qualified|completed/i;
const seconds = (duration: string) => { const [minutes = 0, remainder = 0] = duration.split(":").map(Number); return minutes * 60 + remainder; };
const percent = (part: number, total: number) => `${total ? Math.round(part / total * 100) : 0}%`;

type Props = { calls: DashboardDataset["calls"]; chats: DashboardDataset["chats"]; agents: DashboardDataset["agents"] };
type ChartDatum = Record<string, string | number>;

export function AnalyticsDashboard({ calls, chats, agents }: Props) {
  const [tab, setTab] = useState<"calls" | "chats">("calls");
  const [agentId, setAgentId] = useState("all");
  const [focused, setFocused] = useState<string | null>(null);
  const filteredCalls = useMemo(() => calls.filter((row) => agentId === "all" || row.agentId === agentId), [agentId, calls]);
  const filteredChats = useMemo(() => chats.filter((row) => agentId === "all" || row.agentId === agentId), [agentId, chats]);
  const callDurations = filteredCalls.map((call) => seconds(call.duration));
  const successfulCalls = filteredCalls.filter((call) => successPattern.test(call.outcome));
  const pickupCalls = filteredCalls.filter((call) => seconds(call.duration) > 0);
  const transferredCalls = filteredCalls.filter((call) => /transfer/i.test(`${call.endReason} ${call.outcome}`));
  const voicemailCalls = filteredCalls.filter((call) => /voicemail/i.test(`${call.endReason} ${call.outcome}`));
  const totalDuration = callDurations.reduce((sum, value) => sum + value, 0);
  const avgDuration = filteredCalls.length ? Math.round(totalDuration / filteredCalls.length) : 0;
  const timeline = useMemo(() => {
    const buckets = new Map<string, { day: string; calls: number; chats: number; duration: number }>();
    for (const item of [...calls.map((call) => ({ type: "call", startedAt: call.startedAt, duration: seconds(call.duration), agentId: call.agentId })), ...chats.map((chat) => ({ type: "chat", startedAt: chat.startedAt, duration: 0, agentId: chat.agentId }))]) {
      if (!item.startedAt || (agentId !== "all" && item.agentId !== agentId)) continue;
      const date = new Date(item.startedAt); const key = date.toISOString().slice(0, 10); const current = buckets.get(key) ?? { day: date.toLocaleDateString("en", { month: "short", day: "numeric" }), calls: 0, chats: 0, duration: 0 };
      if (item.type === "call") { current.calls += 1; current.duration += item.duration; } else current.chats += 1;
      buckets.set(key, current);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => ({ ...value, avgDuration: value.calls ? Math.round(value.duration / value.calls) : 0 }));
  }, [agentId, calls, chats]);
  const concurrency = useMemo(() => {
    const events = filteredCalls.flatMap((call) => { if (!call.startedAt) return []; const start = new Date(call.startedAt).getTime(); return [{ time: start, change: 1 }, { time: start + seconds(call.duration) * 1000, change: -1 }]; }).sort((a, b) => a.time - b.time || a.change - b.change);
    let active = 0; let peak = 0; for (const event of events) { active += event.change; peak = Math.max(peak, active); } return peak;
  }, [filteredCalls]);
  const reasons = group(filteredCalls, (call) => call.endReason ?? call.outcome ?? "Unknown");
  const sentiments = group(filteredCalls, (call) => call.sentiment ?? "Not analyzed");
  const directions = group(filteredCalls, (call) => call.channel ?? "Unknown");
  const statuses = tab === "calls" ? group(filteredCalls, (call) => call.status ?? "Unknown") : group(filteredChats, (chat) => chat.status ?? "Unknown");
  const sessionCount = tab === "calls" ? filteredCalls.length : filteredChats.length;

  return <div className="space-y-4">
    <div className="glass rounded-2xl p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="flex gap-1 border-b lg:border-b-0"><Tab active={tab === "calls"} onClick={() => setTab("calls")} icon={Phone}>Call Dashboard</Tab><Tab active={tab === "chats"} onClick={() => setTab("chats")} icon={MessageSquareText}>Chat Dashboard</Tab></div><label className="lg:ml-auto"><span className="sr-only">Filter analytics by agent</span><select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="h-11 w-full min-w-64 rounded-xl border border-[#d9dee7] bg-white px-4 text-sm font-semibold outline-none focus:border-[#1f7659]"><option value="all">All accessible agents</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label></div></div>

    <div className="grid gap-4 md:grid-cols-3">
      <MetricCard label={tab === "calls" ? "Call latency" : "Chat response latency"} value="—" detail="Awaiting synchronized Retell latency data" icon={Activity}/>
      <MetricCard label={tab === "calls" ? "Average call duration" : "Average messages"} value={tab === "calls" ? formatDuration(avgDuration) : String(filteredChats.length ? Math.round(filteredChats.reduce((sum, chat) => sum + chat.messages, 0) / filteredChats.length) : 0)} detail={tab === "calls" ? `${totalDuration}s total conversation time` : "AI messages per conversation"} icon={BarChart3}/>
      <MetricCard label={tab === "calls" ? "Call count" : "Chat count"} value={String(sessionCount)} detail={`${agentId === "all" ? "All accessible agents" : "Selected agent"}`} icon={tab === "calls" ? Phone : MessageSquareText}/>
    </div>

    <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
      <ChartCard id="session-volume" title={`${tab === "calls" ? "Call" : "Chat"} volume`} focused={focused} setFocused={setFocused}><ResponsiveContainer width="100%" height="100%"><AreaChart data={timeline}><defs><linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f7df3" stopOpacity={.3}/><stop offset="95%" stopColor="#4f7df3" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#dfe5ec" strokeDasharray="3 3"/><XAxis dataKey="day" tick={{ fontSize: 11 }}/><YAxis allowDecimals={false} tick={{ fontSize: 11 }}/><Tooltip/><Area type="monotone" dataKey={tab} stroke="#4f7df3" strokeWidth={2} fill="url(#volumeFill)"/></AreaChart></ResponsiveContainer></ChartCard>
      <ChartCard id="concurrency" title="Concurrency used" focused={focused} setFocused={setFocused}><div className="grid h-full place-items-center"><div className="text-center"><p className="text-5xl font-semibold text-[#253246]">{concurrency}</p><p className="mt-2 text-sm text-[#71817c]">Peak overlapping calls</p></div></div></ChartCard>
    </div>

    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      <DonutCard id="successful" title="Call successful" data={[{ name: "Successful", value: successfulCalls.length }, { name: "Other", value: Math.max(0, filteredCalls.length - successfulCalls.length) }]} focused={focused} setFocused={setFocused}/>
      <DonutCard id="reasons" title="Disconnection reason" data={reasons} focused={focused} setFocused={setFocused}/>
      <DonutCard id="sentiment" title="User sentiment" data={sentiments} focused={focused} setFocused={setFocused}/>
      <DonutCard id="direction" title="Phone inbound/outbound" data={directions} focused={focused} setFocused={setFocused}/>
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <RateCard id="pickup-rate" label="Call pickup rate" value={percent(pickupCalls.length, filteredCalls.length)} detail={`${pickupCalls.length} of ${filteredCalls.length} calls`} focused={focused} setFocused={setFocused}/>
      <RateCard id="success-rate" label="Call successful rate" value={percent(successfulCalls.length, filteredCalls.length)} detail={`${successfulCalls.length} successful outcomes`} focused={focused} setFocused={setFocused}/>
      <RateCard id="transfer-rate" label="Call transfer rate" value={percent(transferredCalls.length, filteredCalls.length)} detail={`${transferredCalls.length} transferred calls`} focused={focused} setFocused={setFocused}/>
      <RateCard id="voicemail-rate" label="Voicemail rate" value={percent(voicemailCalls.length, filteredCalls.length)} detail={`${voicemailCalls.length} voicemail outcomes`} focused={focused} setFocused={setFocused}/>
      <ChartCard id="average-duration" title="Average call duration" focused={focused} setFocused={setFocused}><ResponsiveContainer width="100%" height="100%"><LineChart data={timeline}><CartesianGrid vertical={false} stroke="#dfe5ec" strokeDasharray="3 3"/><XAxis dataKey="day" tick={{ fontSize: 10 }}/><YAxis tick={{ fontSize: 10 }}/><Tooltip formatter={(value) => [`${value}s`, "Duration"]}/><Line type="monotone" dataKey="avgDuration" stroke="#4f7df3" strokeWidth={2}/></LineChart></ResponsiveContainer></ChartCard>
      <ChartCard id="status-breakdown" title={`${tab === "calls" ? "Call" : "Chat"} status`} focused={focused} setFocused={setFocused}><ResponsiveContainer width="100%" height="100%"><BarChart data={statuses} layout="vertical"><CartesianGrid horizontal={false} stroke="#dfe5ec"/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }}/><Tooltip/><Bar dataKey="value" fill="#4f7df3" radius={[0, 6, 6, 0]}/></BarChart></ResponsiveContainer></ChartCard>
    </div>
    <p className="text-center text-xs text-[#84928d]">Select any chart to highlight it. Every value is calculated only from synchronized sessions visible to this dashboard user.</p>
  </div>;
}

function group<T>(rows: T[], key: (row: T) => string): ChartDatum[] { const values = new Map<string, number>(); for (const row of rows) { const label = key(row); values.set(label, (values.get(label) ?? 0) + 1); } return [...values].map(([name, value]) => ({ name, value })); }
function formatDuration(value: number) { return `${Math.floor(value / 60)}m ${value % 60}s`; }
function Tab({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof Phone; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${active ? "border-[#253246] text-[#253246]" : "border-transparent text-[#84928d] hover:text-[#253246]"}`}><Icon className="size-4"/>{children}</button>; }
function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) { return <article className="glass rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-xl"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{label}</p><Icon className="size-4 text-[#4f7df3]"/></div><div className="mt-4 rounded-xl bg-[#f6f7f9] p-5 text-center"><p className="text-3xl font-semibold">{value}</p><p className="mt-2 text-xs text-[#84928d]">{detail}</p></div></article>; }
function ChartCard({ id, title, focused, setFocused, children }: { id: string; title: string; focused: string | null; setFocused: (id: string | null) => void; children: React.ReactNode }) { const active = focused === id; return <button type="button" onClick={() => setFocused(active ? null : id)} aria-pressed={active} className={`glass min-h-72 rounded-2xl p-5 text-left transition ${active ? "-translate-y-1 border-[#4f7df3] ring-4 ring-[#4f7df320] shadow-2xl" : "hover:-translate-y-0.5 hover:shadow-xl"}`}><p className="mb-4 text-sm font-semibold">{title}</p><div className="h-56">{children}</div></button>; }
function DonutCard({ id, title, data, focused, setFocused }: { id: string; title: string; data: ChartDatum[]; focused: string | null; setFocused: (id: string | null) => void }) { const total = data.reduce((sum, item) => sum + Number(item.value), 0); return <ChartCard id={id} title={title} focused={focused} setFocused={setFocused}>{total ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="76%" paddingAngle={2}>{data.map((item, index) => <Cell key={String(item.name)} fill={COLORS[index % COLORS.length]}/>)}</Pie><Tooltip/><Legend iconSize={8} wrapperStyle={{ fontSize: 10 }}/></PieChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-[#84928d]">No synchronized data</div>}</ChartCard>; }
function RateCard({ id, label, value, detail, focused, setFocused }: { id: string; label: string; value: string; detail: string; focused: string | null; setFocused: (id: string | null) => void }) { const active = focused === id; return <button type="button" onClick={() => setFocused(active ? null : id)} aria-pressed={active} className={`glass min-h-72 rounded-2xl p-5 text-left transition ${active ? "-translate-y-1 border-[#4f7df3] ring-4 ring-[#4f7df320] shadow-2xl" : "hover:-translate-y-0.5 hover:shadow-xl"}`}><p className="text-sm font-semibold">{label}</p><div className="grid h-48 place-items-center"><div className="text-center"><p className="text-5xl font-semibold text-[#4f7df3]">{value}</p><p className="mt-3 text-xs text-[#84928d]">{detail}</p></div></div></button>; }

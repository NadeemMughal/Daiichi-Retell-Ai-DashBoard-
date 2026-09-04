"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, CirclePlus, Database, Download, Filter, History, MinusCircle, Plus, RefreshCw, Settings2, Share2, Trash2, X } from "lucide-react";
import type { DashboardDataset } from "./dashboard-shell";
import { DateRangePicker, type DateRangeValue } from "./date-range-picker";
import { Portal } from "./portal";
import { useViewportClamp } from "./use-viewport-clamp";

type Kind = "call" | "chat";
type OpenPanel = "filters" | "columns" | "actions" | null;
type Modal = "export" | "backfill" | null;
type BackfillField = "agent" | "transferAgent" | "time" | "id" | "batchId" | "channel" | "duration" | "latency" | "cost" | "from";
type BackfillCondition = { id: number; field: BackfillField; value: string };
type Row = { id: string; time: string; startedAt?: string; agent: string; agentId: string; agentVersion: string; transferAgent: string; batchId: string; duration: string; channel: string; cost: string; reason: string; status: string; sentiment: string; successful: boolean; outcome: string; latency: string; summary: string; leadName: string; leadContact: string; serviceInterest: string; appointmentOutcome: string; from: string; to: string; direction: string };
type ColumnKey = "time" | "duration" | "channel" | "cost" | "session" | "reason" | "status" | "sentiment" | "from" | "to" | "direction" | "outcome" | "latency" | "summary" | "leadName" | "leadContact" | "serviceInterest" | "appointmentOutcome" | "agentId" | "agentVersion" | "agentName";
type ExtraValues = { transferAgent: string; batchId: string; channel: string; minimumDuration: string; from: string; to: string; reason: string; successful: string };

const DASH = "—";
const control = "h-11 rounded-xl border border-[#d7deea] bg-white px-3 text-sm text-[#253246] shadow-sm outline-none transition hover:border-[#aeb8c8] focus:border-[#4f647e] focus:ring-4 focus:ring-[#4f647e12]";
const initialExtras: ExtraValues = { transferAgent: "", batchId: "", channel: "all", minimumDuration: "", from: "", to: "", reason: "all", successful: "all" };
const retellCallStatuses = ["not_connected", "ongoing", "ended", "error"];
const retellChatStatuses = ["ongoing", "ended", "error"];
const retellSentiments = ["Negative", "Positive", "Neutral", "Unknown"];
const retellDisconnectionReasons = [
  "user_hangup", "agent_hangup", "call_take_over", "call_transfer", "concurrency_limit_reached", "dial_busy", "dial_failed", "dial_no_answer",
  "voicemail_reached", "ivr_reached", "inactivity", "max_duration_reached", "no_concurrency_fallback", "no_valid_payment", "scam_detected",
  "invalid_destination", "telephony_provider_permission_denied", "telephony_provider_unavailable", "sip_routing_error", "marked_as_spam", "user_declined",
  "error_llm_websocket_open", "error_llm_websocket_lost_connection", "error_llm_websocket_runtime", "error_llm_websocket_corrupt_payload",
  "error_no_audio_received", "error_asr", "error_retell", "error_unknown", "error_user_not_joined", "registered_call_timeout", "transfer_bridged",
  "transfer_cancelled", "manual_stopped"
];
const columns: Array<{ key: ColumnKey; label: string; value: (row: Row) => string; exportValue?: (row: Row) => string }> = [
  { key: "time", label: "Time", value: (row) => row.time, exportValue: (row) => exportTimestamp(row) }, { key: "duration", label: "Duration", value: (row) => row.duration }, { key: "channel", label: "Channel Type", value: (row) => row.channel }, { key: "cost", label: "Cost", value: (row) => row.cost }, { key: "session", label: "Session ID", value: (row) => row.id }, { key: "reason", label: "End Reason", value: (row) => row.reason }, { key: "status", label: "Session Status", value: (row) => row.status }, { key: "sentiment", label: "User Sentiment", value: (row) => row.sentiment }, { key: "from", label: "From", value: (row) => row.from }, { key: "to", label: "To", value: (row) => row.to }, { key: "direction", label: "Direction", value: (row) => row.direction }, { key: "outcome", label: "Session Outcome", value: (row) => row.outcome }, { key: "latency", label: "End to End Latency", value: (row) => row.latency }, { key: "summary", label: "Summary", value: (row) => row.summary }, { key: "leadName", label: "lead_name", value: (row) => row.leadName }, { key: "leadContact", label: "lead_contact", value: (row) => row.leadContact }, { key: "serviceInterest", label: "service_interest", value: (row) => row.serviceInterest }, { key: "appointmentOutcome", label: "appointment_outcome", value: (row) => row.appointmentOutcome }, { key: "agentId", label: "Agent ID", value: (row) => row.agentId }, { key: "agentVersion", label: "Agent Version", value: (row) => row.agentVersion }, { key: "agentName", label: "Agent Name", value: (row) => row.agent }
];
const coreFields = new Set(["Agent", "Call ID", "Chat ID", "User Sentiment", "Disconnection Reason", "Call Status", "Chat Status"]);
const extraKey: Record<string, keyof ExtraValues> = { "Transfer Agent": "transferAgent", "Batch Call ID": "batchId", Type: "channel", Duration: "minimumDuration", From: "from", To: "to", "Disconnection Reason": "reason", "Call Successful": "successful", "Chat Successful": "successful" };

export function SessionHistoryView({ kind, calls, chats, agents: agentOptions, canExport, dateRange, onDateRangeChange, reportingMinimum }: { kind: Kind; calls: DashboardDataset["calls"]; chats: DashboardDataset["chats"]; agents: DashboardDataset["agents"]; canExport: boolean; dateRange: DateRangeValue; onDateRangeChange: (value: DateRangeValue) => void; reportingMinimum: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const firstPathSegment = pathname.split("/").filter(Boolean)[0];
  const tenantSlug = firstPathSegment && !["admin", "preview"].includes(firstPathSegment) ? decodeURIComponent(firstPathSegment) : undefined;
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [exportMode, setExportMode] = useState<"current" | "all">("current");
  const [exportColumns, setExportColumns] = useState<ColumnKey[]>(columns.map((column) => column.key));
  const [backfillConditions, setBackfillConditions] = useState<BackfillCondition[]>([{ id: 1, field: "time", value: "" }]);
  const [backfillFilter, setBackfillFilter] = useState<BackfillCondition[]>([]);
  const [filterTab, setFilterTab] = useState("Base");
  const [agent, setAgent] = useState("all");
  const [status, setStatus] = useState("all");
  const [sentiment, setSentiment] = useState("all");
  const [sessionQuery, setSessionQuery] = useState("");
  const [enabledExtras, setEnabledExtras] = useState<Array<keyof ExtraValues>>([]);
  const [extras, setExtras] = useState<ExtraValues>(initialExtras);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(() => Object.fromEntries(columns.map((column) => [column.key, ["time", "agentName", "duration", "channel", "session", "reason", "status", "sentiment"].includes(column.key)])) as Record<ColumnKey, boolean>);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenPanel(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenPanel(null); };
    document.addEventListener("pointerdown", dismiss); window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", escape); };
  }, []);

  const agentDirectory = useMemo(() => new Map(agentOptions.map((option) => [option.id, option])), [agentOptions]);
  // Every field below is stored by the reconciliation. They were previously
  // literal em dashes in both the table and the export, which made a synchronized
  // call look like it had no summary, latency or post-call analysis at all.
  const sessions: Row[] = useMemo(() => kind === "call" ? calls.map((call) => {
    const directoryEntry = agentDirectory.get(call.agentId ?? "");
    const custom = call.custom ?? {};
    // A web call has no phone endpoints, so neither end is a withheld number.
    const webCall = (call.channel ?? "") === "web_call";
    const endpoint = (value?: string) => value ?? (webCall ? DASH : call.number || "Protected contact");
    return {
      id: call.sessionId ?? `${call.agent}-${call.time}`, time: call.time, startedAt: call.startedAt, agent: call.agent,
      agentId: directoryEntry?.providerId ?? call.agentId ?? DASH, agentVersion: String(call.agentVersion ?? directoryEntry?.version ?? DASH),
      transferAgent: /transfer/i.test(`${call.endReason} ${call.outcome}`) ? "Transferred" : "", batchId: "",
      duration: call.duration, channel: call.channel ?? "phone_call", cost: call.cost ?? DASH,
      reason: call.endReason ?? call.outcome, status: call.status ?? "ended", sentiment: call.sentiment ?? "Not analyzed",
      successful: /success|book|resolved|qualified|completed/i.test(call.outcome), outcome: call.outcome,
      latency: call.latencyMs == null ? DASH : `${Math.round(call.latencyMs)} ms`, summary: call.summary ?? DASH,
      leadName: custom.lead_name ?? DASH, leadContact: custom.lead_contact ?? DASH, serviceInterest: custom.service_interest ?? DASH, appointmentOutcome: custom.appointment_outcome ?? DASH,
      from: endpoint(call.fromNumber), to: endpoint(call.toNumber), direction: call.direction ?? DASH
    };
  }) : chats.map((chat) => {
    const directoryEntry = agentDirectory.get(chat.agentId ?? "");
    const custom = chat.custom ?? {};
    return {
      id: chat.sessionId ?? chat.id, time: chat.time, startedAt: chat.startedAt, agent: chat.agent,
      agentId: directoryEntry?.providerId ?? chat.agentId ?? DASH, agentVersion: String(chat.agentVersion ?? directoryEntry?.version ?? DASH),
      transferAgent: "", batchId: "", duration: `${chat.messages} messages`, channel: "api_chat", cost: chat.cost ?? DASH,
      reason: chat.outcome, status: chat.status, sentiment: chat.sentiment ?? "Not analyzed",
      successful: /success|book|resolved|qualified|completed/i.test(chat.outcome), outcome: chat.outcome,
      latency: DASH, summary: chat.summary ?? DASH,
      leadName: custom.lead_name ?? DASH, leadContact: custom.lead_contact ?? DASH, serviceInterest: custom.service_interest ?? DASH, appointmentOutcome: custom.appointment_outcome ?? DASH,
      from: DASH, to: DASH, direction: DASH
    };
  }), [agentDirectory, calls, chats, kind]);
  const agents = unique([...agentOptions.filter((option) => option.kind === (kind === "call" ? "voice" : "chat")).map((option) => option.name), ...sessions.map((row) => row.agent)]);
  const statuses = unique([...(kind === "call" ? retellCallStatuses : retellChatStatuses), ...sessions.map((row) => row.status)]);
  const sentiments = unique([...retellSentiments, ...sessions.map((row) => row.sentiment)]);
  const channels = unique(sessions.map((row) => row.channel));
  const reasons = unique([...(kind === "call" ? retellDisconnectionReasons : []), ...sessions.map((row) => row.reason)]);
  const rows = sessions.filter((row) => (agent === "all" || row.agent === agent) && (status === "all" || row.status === status) && (sentiment === "all" || row.sentiment === sentiment) && (extras.reason === "all" || row.reason === extras.reason) && row.id.toLowerCase().includes(sessionQuery.toLowerCase()) && matchesExtras(row, enabledExtras.filter((key) => key !== "reason"), extras) && matchesBackfill(row, backfillFilter));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const shownRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const activeFilters = Number(agent !== "all") + Number(status !== "all") + Number(sentiment !== "all") + Number(extras.reason !== "all") + Number(Boolean(sessionQuery)) + enabledExtras.filter((key) => key !== "reason" && extraHasValue(key, extras[key])).length;
  const tabs = kind === "call" ? ["Base", "Post Call Analysis"] : ["Base", "Post Chat Analysis"];
  const fields = kind === "call" ? ["Agent", "Transfer Agent", "Call ID", "Batch Call ID", "Type", "Duration", "From", "To", "User Sentiment", "Disconnection Reason", "Call Status", "Call Successful"] : ["Agent", "Chat ID", "User Sentiment", "Disconnection Reason", "Chat Successful", "Chat Status"];

  function toggle(panel: Exclude<OpenPanel, null>) { setOpenPanel((current) => current === panel ? null : panel); }
  function toggleExtra(field: string) { const key = extraKey[field]; if (!key) return; setEnabledExtras((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); setPage(1); }
  function setExtra(key: keyof ExtraValues, value: string) { setExtras((current) => ({ ...current, [key]: value })); setPage(1); }
  function clearFilters() { setAgent("all"); setStatus("all"); setSentiment("all"); setSessionQuery(""); setEnabledExtras([]); setExtras(initialExtras); setPage(1); }
  function openModal(next: Exclude<Modal, null>) { setOpenPanel(null); setModal(next); }
  function exportRows(keys: ColumnKey[]) { downloadCsv(`${kind}-history.csv`, rows, keys); setModal(null); }
  function saveBackfill() { const conditions = backfillConditions.filter((condition) => condition.value.trim()).map((condition) => ({ ...condition, value: condition.value.trim() })); if (!conditions.length) return; setBackfillFilter(conditions); setPage(1); setModal(null); }

  return <div ref={rootRef} className="glass relative min-h-[520px] rounded-2xl">
    <header className="rounded-t-2xl border-b border-[#dce2e8] bg-white/90 p-4"><h2 className="flex items-center gap-2 font-semibold"><RefreshCw className="size-4 text-[#667487]"/>{kind === "call" ? "Call" : "Chat"} History</h2><div className="mt-4 flex flex-wrap items-center gap-3">
      <DateRangePicker value={dateRange} onChange={onDateRangeChange} minimum={reportingMinimum} align="left"/>
      <div className="relative"><button type="button" aria-expanded={openPanel === "filters"} onClick={() => toggle("filters")} className={`${control} flex items-center gap-2 px-4 ${openPanel === "filters" ? "border-[#4f647e] ring-4 ring-[#4f647e12]" : ""}`}><Filter className="size-4"/>Filter{activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-[#2d394b] text-[10px] font-bold text-white">{activeFilters}</span>}</button>
        {openPanel === "filters" && <Panel className="left-0 w-[min(92vw,540px)]"><div className="flex gap-5 overflow-x-auto border-b px-4 pt-4">{tabs.map((tab) => <button type="button" key={tab} onClick={() => setFilterTab(tab)} className={`whitespace-nowrap border-b-2 pb-3 text-sm ${filterTab === tab ? "border-[#253246] font-semibold" : "border-transparent text-[#697789]"}`}>{tab}</button>)}</div>{filterTab === "Base" ? <div className="max-h-[480px] overflow-y-auto p-4"><div className="grid gap-3 sm:grid-cols-2"><FilterSelect label="Agent" value={agent} setValue={(value) => { setAgent(value); setPage(1); }} values={agents} emptyLabel={`No ${kind === "call" ? "voice" : "chat"} agents connected`}/><FilterSelect label={`${kind === "call" ? "Call" : "Chat"} Status`} value={status} setValue={(value) => { setStatus(value); setPage(1); }} values={statuses}/><FilterSelect label="User Sentiment" value={sentiment} setValue={(value) => { setSentiment(value); setPage(1); }} values={sentiments} emptyLabel="No sentiment recorded"/><TextFilter label={`${kind === "call" ? "Call" : "Chat"} ID`} value={sessionQuery} setValue={(value) => { setSessionQuery(value); setPage(1); }} placeholder="Search exact or partial ID"/>{kind === "call" && <div className="sm:col-span-2 rounded-xl bg-[#f5f7f9] p-3"><FilterSelect label="Disconnection Reason" value={extras.reason} setValue={(value) => setExtra("reason", value)} values={reasons} formatLabel={formatRetellValue}/></div>}</div>
          {enabledExtras.length > 0 && <div className="mt-4 grid gap-3 rounded-xl bg-[#f5f7f9] p-3 sm:grid-cols-2">{enabledExtras.map((key) => <ExtraFilter key={key} filterKey={key} value={extras[key]} setValue={(value) => setExtra(key, value)} channels={channels} reasons={reasons}/>)}</div>}
          <div className="mt-5 border-t pt-4"><p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#84928d]">Available fields</p><div className="grid gap-1 sm:grid-cols-2">{fields.map((field) => { const key = extraKey[field]; const active = coreFields.has(field) || Boolean(key && enabledExtras.includes(key)); return <button type="button" key={field} disabled={coreFields.has(field)} onClick={() => toggleExtra(field)} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition ${active ? "bg-[#e9f1ed] font-semibold text-[#1f7659]" : "text-[#596a7a] hover:bg-[#f1f3f5]"}`}>{active ? <MinusCircle className="size-3.5"/> : <CirclePlus className="size-3.5"/>}{field}<span className="ml-auto text-[10px]">{coreFields.has(field) ? "Shown" : active ? "Added" : "Add"}</span></button>; })}</div></div></div> : <div className="grid min-h-56 place-items-center p-8 text-center text-sm text-[#84928d]">No synchronized fields are available for this category.</div>}<footer className="flex items-center justify-between border-t p-4"><button type="button" onClick={clearFilters} disabled={!activeFilters && !enabledExtras.length} className="text-sm font-semibold text-[#667487] disabled:opacity-35">Clear all</button><button type="button" onClick={() => setOpenPanel(null)} className="rounded-xl bg-[#2d394b] px-5 py-2.5 text-sm font-semibold text-white">Apply filters</button></footer></Panel>}
        {openPanel === "filters" && filterTab !== "Base" && filterTab.includes("Analysis") && <PostAnalysisLocator kind={kind} tabs={tabs} activeTab={filterTab} setActiveTab={setFilterTab} agents={agentOptions.filter((option) => option.kind === (kind === "call" ? "voice" : "chat"))} tenantSlug={tenantSlug} liveSearchEnabled={agentOptions.some((option) => Boolean(option.providerId))} selectedAgent={agent} setSelectedAgent={(value) => { setAgent(value); setPage(1); }} sentiments={sentiments} sentiment={sentiment} setSentiment={(value) => { setSentiment(value); setPage(1); }} successful={extras.successful} setSuccessful={(value) => { setEnabledExtras((current) => current.includes("successful") ? current : [...current, "successful"]); setExtra("successful", value); }} clear={clearFilters} apply={() => setOpenPanel(null)}/>}
      </div>
      <div className="relative ml-auto"><button type="button" aria-label="Manage columns" aria-expanded={openPanel === "columns"} onClick={() => toggle("columns")} className={`${control} grid w-11 place-items-center px-0`}><Settings2 className="size-4"/></button>{openPanel === "columns" && <Panel className="right-0 max-h-[460px] w-72 overflow-y-auto p-3"><p className="sticky top-0 z-10 bg-white px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-[#84928d]">Visible columns</p>{columns.map((column) => <label key={column.key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[#f2f4f7]"><input type="checkbox" checked={visible[column.key]} onChange={() => setVisible((current) => ({ ...current, [column.key]: !current[column.key] }))} className="size-4 accent-[#2d394b]"/>{column.label}</label>)}</Panel>}</div>
      <div className="relative"><button type="button" aria-expanded={openPanel === "actions"} onClick={() => toggle("actions")} className="flex h-11 items-center gap-2 rounded-xl bg-[#2d394b] px-4 text-sm font-semibold text-white">Actions<ChevronDown className={`size-4 transition ${openPanel === "actions" ? "rotate-180" : ""}`}/></button>{openPanel === "actions" && <Panel className="right-0 w-72 p-2">{canExport && <><ActionButton icon={Share2} label="Export" onClick={() => openModal("export")}/><ActionButton icon={History} label="Export records" disabled={!rows.length} onClick={() => exportRows(columns.map((column) => column.key))}/></>}<ActionButton icon={Database} label="Backfill from Post-Call Data" onClick={() => openModal("backfill")}/><ActionButton icon={Settings2} label="Custom attributes" onClick={() => setOpenPanel("columns")}/></Panel>}</div>
    </div></header>
    <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead><tr className="bg-[#f1f3f5] text-xs text-[#596a7a]">{columns.filter((column) => visible[column.key]).map((column) => <th key={column.key} className="whitespace-nowrap p-4">{column.label}</th>)}</tr></thead><tbody>{shownRows.map((row) => <tr key={row.id} className="border-b border-[#dfe4e8] text-sm hover:bg-[#f7f9fb]">{columns.filter((column) => visible[column.key]).map((column) => <td key={column.key} className="max-w-72 truncate whitespace-nowrap p-4" title={column.value(row)}>{column.value(row)}</td>)}</tr>)}</tbody></table>{!shownRows.length && <div className="grid min-h-48 place-items-center gap-3 border-b p-6 text-center text-sm text-[#84928d]">{sessions.length ? <><p>No {kind === "call" ? "calls" : "chats"} match the current filters.</p><button type="button" onClick={clearFilters} className="h-11 rounded-xl border border-[#cad3de] bg-white px-5 font-semibold text-[#253246] transition hover:bg-[#f5f7f9]">Clear all filters</button></> : <p>No {kind === "call" ? "calls" : "chats"} have synchronized for this date range yet.</p>}</div>}</div>
    <footer className="flex flex-col gap-3 rounded-b-2xl bg-white/80 p-4 text-sm text-[#71817c] sm:flex-row sm:items-center"><span>Page {safePage} of {totalPages} · Total Sessions: {rows.length}</span><div className="flex items-center gap-2 sm:ml-auto"><button type="button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="grid size-9 place-items-center rounded-lg border bg-white disabled:opacity-30"><ChevronLeft className="size-4"/></button><span className="grid size-9 place-items-center rounded-lg bg-[#f1f3f7] font-semibold text-[#253246]">{safePage}</span><button type="button" aria-label="Next page" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="grid size-9 place-items-center rounded-lg border bg-white disabled:opacity-30"><ChevronRight className="size-4"/></button><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Rows per page" className="ml-2 h-9 rounded-lg border bg-white px-3"><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select></div></footer>
    {modal === "export" && <ExportModal visible={visible} mode={exportMode} setMode={setExportMode} selected={exportColumns} setSelected={setExportColumns} close={() => setModal(null)} submit={(keys) => exportRows(keys)}/>}
    {modal === "backfill" && <BackfillModal conditions={backfillConditions} setConditions={setBackfillConditions} agents={agents} close={() => setModal(null)} save={saveBackfill}/>}
  </div>;
}

function ActionButton({ icon: Icon, label, onClick, disabled = false }: { icon: typeof Download; label: string; onClick: () => void; disabled?: boolean }) { return <button type="button" onClick={onClick} disabled={disabled} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[#f2f4f7] disabled:opacity-40"><Icon className="size-4 text-[#667487]"/>{label}</button>; }

function ModalShell({ title, close, children, footer }: { title: string; close: () => void; children: React.ReactNode; footer: React.ReactNode }) { useEffect(() => { const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; window.addEventListener("keydown", closeOnEscape); return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); }; }, [close]); return <Portal><div onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }} className="fixed inset-0 z-[200] grid place-items-center overflow-y-auto bg-[#18231f66] p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={title}><section onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[96vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#cad3de] bg-white shadow-2xl sm:max-h-[90vh]"><header className="flex items-center justify-between border-b px-4 py-4 sm:px-6 sm:py-5"><h3 className="min-w-0 truncate text-lg font-semibold">{title}</h3><button type="button" onClick={close} aria-label="Close" className="rounded-lg p-2 transition hover:bg-[#f1f3f5]"><X className="size-5 text-[#84928d]"/></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div><footer className="flex flex-wrap justify-end gap-3 border-t px-4 py-4 sm:px-6 sm:py-5">{footer}</footer></section></div></Portal>; }

function ExportModal({ visible, mode, setMode, selected, setSelected, close, submit }: { visible: Record<ColumnKey, boolean>; mode: "current" | "all"; setMode: (mode: "current" | "all") => void; selected: ColumnKey[]; setSelected: (keys: ColumnKey[]) => void; close: () => void; submit: (keys: ColumnKey[]) => void }) {
  const current = columns.filter((column) => visible[column.key]).map((column) => column.key); const keys = mode === "current" ? current : selected;
  const toggle = (key: ColumnKey) => setSelected(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]);
  return <ModalShell title="Export" close={close} footer={<><button type="button" onClick={close} className="h-11 rounded-xl border px-5 font-semibold">Cancel</button><button type="button" disabled={!keys.length} onClick={() => submit(keys)} className="h-11 rounded-xl bg-[#2d394b] px-5 font-semibold text-white disabled:opacity-40">Export</button></>}><div className="flex flex-wrap gap-7"><Radio label="Current table columns" checked={mode === "current"} onClick={() => setMode("current")}/><Radio label="All columns" checked={mode === "all"} onClick={() => setMode("all")}/></div>{mode === "current" ? <div className="mt-5 max-h-96 overflow-y-auto rounded-xl border px-4">{columns.filter((column) => visible[column.key]).map((column) => <p key={column.key} className="border-b py-3 text-[#596a7a] last:border-0">{column.label}</p>)}</div> : <div className="mt-5 grid max-h-[420px] overflow-hidden rounded-xl border md:grid-cols-2"><div className="overflow-y-auto border-r p-4"><label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={selected.length === columns.length} ref={(input) => { if (input) input.indeterminate = selected.length > 0 && selected.length < columns.length; }} onChange={() => setSelected(selected.length === columns.length ? [] : columns.map((column) => column.key))} className="size-5 accent-[#3977f6]"/>All ({columns.length})</label><div className="mt-3 space-y-1">{columns.map((column) => <label key={column.key} className="flex items-center gap-3 rounded-lg py-2"><input type="checkbox" checked={selected.includes(column.key)} onChange={() => toggle(column.key)} className="size-5 accent-[#3977f6]"/>{column.label}</label>)}</div></div><div className="overflow-y-auto p-4"><div className="flex justify-between"><p>Selected ({selected.length})</p><button type="button" onClick={() => setSelected([])} className="text-blue-600">Clear</button></div><div className="mt-3 space-y-1">{selected.map((key) => <div key={key} className="flex items-center py-2"><span>{columns.find((item) => item.key === key)?.label}</span><button type="button" onClick={() => toggle(key)} className="ml-auto"><X className="size-4 text-[#71817c]"/></button></div>)}</div></div></div>}</ModalShell>;
}

function BackfillModal({ conditions, setConditions, agents, close, save }: { conditions: BackfillCondition[]; setConditions: React.Dispatch<React.SetStateAction<BackfillCondition[]>>; agents: string[]; close: () => void; save: () => void }) {
  const options: Array<{ value: BackfillField; label: string }> = [{ value: "agent", label: "Agent" }, { value: "transferAgent", label: "Transfer Agent" }, { value: "time", label: "Call time" }, { value: "id", label: "Call ID" }, { value: "batchId", label: "Batch Call ID" }, { value: "channel", label: "Type" }, { value: "duration", label: "Duration" }, { value: "latency", label: "E2E Latency" }, { value: "cost", label: "Combined Cost" }, { value: "from", label: "From" }];
  const update = (id: number, patch: Partial<BackfillCondition>) => setConditions((current) => current.map((condition) => condition.id === id ? { ...condition, ...patch } : condition));
  const add = () => setConditions((current) => [...current, { id: Math.max(0, ...current.map((condition) => condition.id)) + 1, field: "agent", value: "" }]);
  const remove = (id: number) => setConditions((current) => current.filter((condition) => condition.id !== id));
  return <ModalShell title="Backfill Post Call Extraction" close={close} footer={<><button type="button" onClick={close} className="h-11 rounded-xl border px-5 font-semibold">Cancel</button><button type="button" disabled={!conditions.some((condition) => condition.value.trim())} onClick={save} className="h-11 rounded-xl bg-[#2d394b] px-5 font-semibold text-white disabled:bg-[#edf0f4] disabled:text-[#9aa5b2]">Save</button></>}><p className="mb-3 text-sm text-[#596a7a]">Filter on calls</p><div className="rounded-xl border bg-[#fafbfc] p-4"><div className="space-y-3">{conditions.map((condition) => <div key={condition.id} className="grid gap-3 sm:grid-cols-[165px_1fr_auto]"><label className="text-xs text-[#71817c]">Type<select value={condition.field} onChange={(event) => update(condition.id, { field: event.target.value as BackfillField, value: "" })} className={`${control} mt-2 w-full`}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{condition.field === "agent" ? <label className="text-xs text-[#71817c]">Value<select value={condition.value} onChange={(event) => update(condition.id, { value: event.target.value })} disabled={!agents.length} className={`${control} mt-2 w-full disabled:cursor-not-allowed disabled:bg-[#f1f3f5] disabled:text-[#84928d]`}><option value="">{agents.length ? "Select agents..." : "No connected agents"}</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></label> : <TextFilter label="Value" value={condition.value} setValue={(value) => update(condition.id, { value })} placeholder={condition.field === "time" ? "Select or enter call time..." : `Enter ${options.find((option) => option.value === condition.field)?.label.toLowerCase()}...`} type={["duration", "latency", "cost"].includes(condition.field) ? "number" : "text"}/>}<button type="button" onClick={() => remove(condition.id)} aria-label="Delete condition" className="mt-6 grid size-11 place-items-center rounded-xl text-[#71817c] hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4"/></button></div>)}</div><button type="button" onClick={add} className="mt-4 flex h-11 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold text-[#253246] shadow-sm hover:bg-[#f5f7f9]"><Plus className="size-4"/>Add</button></div><p className="mt-3 text-xs text-[#84928d]">Save applies every completed condition to synchronized call records currently available in the dashboard.</p></ModalShell>;
}

function Radio({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex items-center gap-3"><span className={`grid size-5 place-items-center rounded-full border ${checked ? "border-[#2d394b]" : "border-[#cad3de]"}`}>{checked && <span className="size-2.5 rounded-full bg-[#2d394b]"/>}</span>{label}</button>; }
function matchesBackfill(row: Row, filters: BackfillCondition[]) { return filters.every((filter) => { const value = filter.value.toLowerCase(); if (filter.field === "duration") return durationSeconds(row.duration) >= Number(value); if (filter.field === "cost") return Number(row.cost.replace(/[^0-9.-]/g, "")) >= Number(value); const values: Record<Exclude<BackfillField, "duration" | "cost">, string> = { agent: row.agent, transferAgent: row.transferAgent, time: row.time, id: row.id, batchId: row.batchId, channel: row.channel, latency: row.latency, from: row.from }; return values[filter.field].toLowerCase().includes(value); }); }

function PostAnalysisLocator({ kind, tabs, activeTab, setActiveTab, agents, tenantSlug, liveSearchEnabled, selectedAgent, setSelectedAgent, sentiments, sentiment, setSentiment, successful, setSuccessful, clear, apply }: { kind: Kind; tabs: string[]; activeTab: string; setActiveTab: (tab: string) => void; agents: DashboardDataset["agents"]; tenantSlug?: string; liveSearchEnabled: boolean; selectedAgent: string; setSelectedAgent: (agent: string) => void; sentiments: string[]; sentiment: string; setSentiment: (value: string) => void; successful: string; setSuccessful: (value: string) => void; clear: () => void; apply: () => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [liveAgents, setLiveAgents] = useState<Array<{ providerAgentId: string; displayName: string; modifiedAt?: number }>>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "live" | "error">("idle");
  useEffect(() => {
    if (!pickerOpen || !liveSearchEnabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      const params = new URLSearchParams({ kind: kind === "call" ? "voice" : "chat", q: search });
      if (tenantSlug) params.set("tenantSlug", tenantSlug);
      try {
        const response = await fetch(`/api/retell/agents?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("RETELL_AGENT_SEARCH_FAILED");
        const payload = await response.json() as { agents?: Array<{ providerAgentId: string; displayName: string; modifiedAt?: number }> };
        setLiveAgents(payload.agents ?? []);
        setSearchState("live");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSearchState("error");
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, liveSearchEnabled, pickerOpen, search, tenantSlug]);
  const localMatches = agents.filter((agent) => `${agent.name} ${agent.providerId ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const matchingAgents = searchState === "live" ? liveAgents.map((live) => {
    const local = agents.find((agent) => agent.providerId === live.providerAgentId);
    return local ? { ...local, name: live.displayName, modifiedAt: live.modifiedAt ? new Date(live.modifiedAt).toISOString() : local.modifiedAt, filterName: local.name } : { id: live.providerAgentId, providerId: live.providerAgentId, name: live.displayName, kind: kind === "call" ? "voice" as const : "chat" as const, calls: 0, chats: 0, score: "—", status: "active", modifiedAt: live.modifiedAt ? new Date(live.modifiedAt).toISOString() : undefined, filterName: live.displayName };
  }) : localMatches.map((agent) => ({ ...agent, filterName: agent.name }));
  const selected = matchingAgents.find((agent) => agent.filterName === selectedAgent) ?? agents.find((agent) => agent.name === selectedAgent);
  const clamp = useViewportClamp<HTMLDivElement>(true);
  return <div ref={clamp} className="absolute left-0 top-[calc(100%+8px)] z-[110] w-[min(92vw,540px)] overflow-visible rounded-2xl border border-[#cad3de] bg-white text-[#253246] shadow-[0_20px_55px_rgba(35,49,67,.22)]">
    <div className="flex gap-5 overflow-x-auto border-b px-4 pt-4">{tabs.map((tab) => <button type="button" key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap border-b-2 pb-3 text-sm ${activeTab === tab ? "border-[#253246] font-semibold" : "border-transparent text-[#697789]"}`}>{tab}</button>)}</div>
    <div className="min-h-72 p-4"><p className="text-sm font-semibold">Locate field with agent selector</p><div className="relative mt-2"><button type="button" aria-expanded={pickerOpen} onClick={() => setPickerOpen((open) => !open)} className={`${control} flex w-full items-center justify-between text-left`}><span className={selectedAgent === "all" ? "text-[#84928d]" : "truncate"}>{selectedAgent === "all" ? "Select agent" : selectedAgent}</span><ChevronDown className={`size-4 transition ${pickerOpen ? "rotate-180" : ""}`}/></button>{pickerOpen && <div className="absolute left-0 top-12 z-[120] grid w-[min(88vw,810px)] overflow-hidden rounded-2xl border border-[#cad3de] bg-white shadow-2xl md:grid-cols-[410px_400px]"><div className="border-r border-[#dfe4ea]"><div className="border-b p-3"><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search agents..." className={`${control} w-full`}/><p className={`mt-2 px-1 text-[11px] ${searchState === "error" ? "text-rose-600" : "text-[#71817c]"}`}>{searchState === "loading" ? "Searching Retell AI…" : searchState === "live" ? "Live results from Retell AI" : searchState === "error" ? "Retell search unavailable; showing synchronized agents." : liveSearchEnabled ? "Type to search Retell AI in real time." : "Showing available agents."}</p></div><div className="max-h-72 overflow-y-auto p-2"><button type="button" onClick={() => setSelectedAgent("all")} className={`w-full rounded-xl px-3 py-3 text-left text-sm font-semibold hover:bg-[#f1f3f5] ${selectedAgent === "all" ? "bg-[#f0f1f3]" : ""}`}>All agents</button>{matchingAgents.map((option) => <button type="button" key={option.id} onClick={() => setSelectedAgent(option.filterName)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#f1f3f5] ${selectedAgent === option.filterName ? "bg-[#f0f1f3]" : ""}`}><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{option.name}</span><span className="block truncate text-xs text-[#84928d]">{option.providerId ?? "Provider ID unavailable"}</span></span><ChevronRight className="size-4 shrink-0 text-[#71817c]"/></button>)}{!matchingAgents.length && searchState !== "loading" && <p className="p-5 text-center text-sm text-[#84928d]">No agents match this search.</p>}</div></div><div className="min-h-80 bg-white p-5">{selected ? <><div className="border-b pb-4"><p className="text-xs text-[#84928d]">Agent</p><p className="mt-1 font-semibold">{selected.name}</p><p className="mt-1 break-all text-xs text-[#84928d]">{selected.providerId ?? "Provider ID unavailable"}</p></div><div className="grid grid-cols-[1fr_auto] gap-3 border-b py-4 text-sm"><span className="text-[#84928d]">Tags</span><span className="rounded bg-[#edf0f4] px-2 py-1 text-xs font-semibold capitalize">{selected.status}</span><span className="text-[#84928d]">Latest synchronized</span><span>{selected.modifiedAt ? new Date(selected.modifiedAt).toLocaleDateString() : "Available"}</span></div><div className="pt-4"><p className="text-xs text-[#84928d]">Source</p><p className="mt-2 text-sm">Live Retell AI agent metadata with dashboard access boundaries applied.</p></div></> : <div className="grid h-full place-items-center text-center text-sm text-[#84928d]">Select an agent to inspect its live details.</div>}</div></div>}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><FilterSelect label="User Sentiment" value={sentiment} setValue={setSentiment} values={sentiments}/><FilterSelect label={`${kind === "call" ? "Call" : "Chat"} Successful`} value={successful} setValue={setSuccessful} values={["yes", "no"]}/></div><p className="mt-4 text-xs text-[#84928d]">Only analysis fields returned by Retell are shown. Selecting an agent or field filters the history table immediately.</p>
    </div><footer className="flex items-center justify-between border-t p-4"><button type="button" onClick={clear} className="text-sm font-semibold text-[#667487]">Clear all</button><button type="button" onClick={apply} className="rounded-xl bg-[#2d394b] px-5 py-2.5 text-sm font-semibold text-white">Apply filters</button></footer>
  </div>;
}

function matchesExtras(row: Row, enabled: Array<keyof ExtraValues>, values: ExtraValues) { return enabled.every((key) => { const value = values[key].trim().toLowerCase(); if (!extraHasValue(key, value)) return true; if (key === "channel") return row.channel.toLowerCase() === value; if (key === "reason") return row.reason.toLowerCase() === value; if (key === "successful") return row.successful === (value === "yes"); if (key === "minimumDuration") return durationSeconds(row.duration) >= Number(value); return String(row[key]).toLowerCase().includes(value); }); }
function extraHasValue(key: keyof ExtraValues, value: string) { return key === "channel" || key === "reason" || key === "successful" ? value !== "all" : Boolean(value); }
function durationSeconds(value: string) { const [minutes = 0, seconds = 0] = value.split(":").map(Number); return Number.isFinite(minutes + seconds) ? minutes * 60 + seconds : 0; }
function ExtraFilter({ filterKey, value, setValue, channels, reasons }: { filterKey: keyof ExtraValues; value: string; setValue: (value: string) => void; channels: string[]; reasons: string[] }) { if (filterKey === "channel") return <FilterSelect label="Type" value={value} setValue={setValue} values={channels}/>; if (filterKey === "reason") return <FilterSelect label="Disconnection Reason" value={value} setValue={setValue} values={reasons}/>; if (filterKey === "successful") return <FilterSelect label="Successful" value={value} setValue={setValue} values={["yes", "no"]}/>; const labels: Record<string, string> = { transferAgent: "Transfer Agent", batchId: "Batch Call ID", minimumDuration: "Minimum duration (seconds)", from: "From", to: "To" }; const label = labels[filterKey] ?? "Filter"; return <TextFilter label={label} value={value} setValue={setValue} placeholder={`Filter by ${label.toLowerCase()}`} type={filterKey === "minimumDuration" ? "number" : "text"}/>; }
function Panel({ className, children }: { className: string; children: React.ReactNode }) {
  const clamp = useViewportClamp<HTMLDivElement>(true);
  return <div ref={clamp} className={`absolute top-[calc(100%+8px)] z-[100] max-h-[75vh] overflow-y-auto overscroll-contain rounded-2xl border border-[#cad3de] bg-white text-[#253246] shadow-[0_20px_55px_rgba(35,49,67,.22)] ${className}`}>{children}</div>;
}
function FilterSelect({ label, value, setValue, values, formatLabel = (item) => item, emptyLabel = "None available" }: { label: string; value: string; setValue: (value: string) => void; values: string[]; formatLabel?: (value: string) => string; emptyLabel?: string }) { return <label className="text-xs font-semibold text-[#596a7a]">{label}<select value={value} onChange={(event) => setValue(event.target.value)} disabled={!values.length} className={`${control} mt-2 w-full disabled:cursor-not-allowed disabled:bg-[#f1f3f5] disabled:text-[#84928d]`}><option value="all">{values.length ? "All" : emptyLabel}</option>{values.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}</select></label>; }
function TextFilter({ label, value, setValue, placeholder, type = "text" }: { label: string; value: string; setValue: (value: string) => void; placeholder: string; type?: string }) { return <label className="text-xs font-semibold text-[#596a7a]">{label}<input type={type} min={type === "number" ? 0 : undefined} value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className={`${control} mt-2 w-full`}/></label>; }
function unique(values: string[]) { return Array.from(new Set(values.filter(Boolean))).sort(); }
function formatRetellValue(value: string) { return value.split("_").map((word) => ["ivr", "asr", "llm", "sip"].includes(word) ? word.toUpperCase() : `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" "); }
function exportTimestamp(row: Row) {
  if (!row.startedAt) return row.time;
  const started = new Date(row.startedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())} ${pad(started.getHours())}:${pad(started.getMinutes())}:${pad(started.getSeconds())}`;
}

// Spreadsheets read a leading =, +, - or @ as the start of a formula, and the
// text in these cells comes from what a caller said. The apostrophe keeps the
// value visible while stopping it from being evaluated.
function csvCell(value: string) {
  const text = String(value ?? "");
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Row[], keys: ColumnKey[]) {
  if (!rows.length || !keys.length) return;
  const selected = keys.map((key) => columns.find((column) => column.key === key)).filter((column): column is (typeof columns)[number] => Boolean(column));
  const body = [
    selected.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) => selected.map((column) => csvCell((column.exportValue ?? column.value)(row))).join(","))
  ].join("\r\n");
  // Without the byte order mark Excel opens the file as Windows-1252 and every
  // em dash and accented character arrives as mojibake.
  const url = URL.createObjectURL(new Blob(["\uFEFF", body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

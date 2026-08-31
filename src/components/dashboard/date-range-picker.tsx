"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type DateRangeValue = { start: string; end: string; startTime: string; endTime: string; utcOffset: string; label: string };
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const shift = (value: string, days: number) => iso(new Date(parseDate(value).getTime() + days * DAY_MS));
const addMonths = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12));
const formatDate = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }).format(parseDate(value));
const formatMonth = (date: Date) => new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
const UTC_OFFSETS = Array.from({ length: 105 }, (_, index) => {
  const minutes = -12 * 60 + index * 15;
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
});
const browserUtcOffset = () => {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
};

function monthDays(month: Date) {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 12));
  const count = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0, 12)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push(iso(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day, 12))));
  while (cells.length % 7) cells.push(null);
  return cells;
}

function CalendarMonth({ month, start, end, maximum, onSelect }: { month: Date; start: string; end: string; maximum: string; onSelect: (date: string) => void }) {
  return <div className="min-w-0"><p className="mb-4 text-center text-sm font-semibold text-[#202b3c]">{formatMonth(month)}</p><div className="grid grid-cols-7 text-center">
    {WEEKDAYS.map((day) => <span key={day} className="pb-2 text-[11px] font-medium text-[#8290a0]">{day}</span>)}
    {monthDays(month).map((date, index) => {
      if (!date) return <span key={`blank-${index}`} className="aspect-square"/>;
      const selectedEdge = date === start || date === end; const inRange = date > start && date < end; const disabled = date > maximum;
      return <button type="button" key={date} disabled={disabled} onClick={() => onSelect(date)} aria-label={formatDate(date)} aria-pressed={selectedEdge || inRange} className={cn("relative grid aspect-square place-items-center text-xs transition", inRange && "bg-[#eef1f6]", date === start && start !== end && "rounded-l-lg", date === end && start !== end && "rounded-r-lg", selectedEdge && "z-10 rounded-lg bg-[#2d394b] font-bold text-white shadow-sm", !disabled && !selectedEdge && "hover:rounded-lg hover:bg-[#e5e9ef]", disabled && "cursor-not-allowed text-[#c5ccd5]")}>{parseDate(date).getUTCDate()}</button>;
    })}
  </div></div>;
}

export function DateRangePicker({ value, onChange, minimum, buttonLabel, align = "right" }: { value: DateRangeValue; onChange: (value: DateRangeValue) => void; minimum?: string; buttonLabel?: string; align?: "left" | "right" }) {
  const maximum = iso(new Date());
  const [open, setOpen] = useState(false); const [draftStart, setDraftStart] = useState(value.start); const [draftEnd, setDraftEnd] = useState(value.end); const [draftStartTime, setDraftStartTime] = useState(value.startTime ?? "00:00:00"); const [draftEndTime, setDraftEndTime] = useState(value.endTime ?? "23:59:59"); const [draftUtcOffset, setDraftUtcOffset] = useState(value.utcOffset ?? browserUtcOffset()); const [selectingEnd, setSelectingEnd] = useState(false); const [visibleMonth, setVisibleMonth] = useState(() => addMonths(parseDate(value.end), -1));
  const presets = useMemo(() => [
    { label: "Today", start: maximum }, { label: "Last 7 days", start: shift(maximum, -6) }, { label: "Last 4 weeks", start: shift(maximum, -27) }, { label: "Last 3 months", start: shift(maximum, -89) }, { label: "Week to date", start: shift(maximum, -parseDate(maximum).getUTCDay()) }, { label: "Month to date", start: `${maximum.slice(0, 8)}01` }, { label: "Year to date", start: `${maximum.slice(0, 4)}-01-01` }, { label: "All time", start: minimum ?? shift(maximum, -29) }
  ], [maximum, minimum]);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [open]);
  function show() { setDraftStart(value.start); setDraftEnd(value.end); setDraftStartTime(value.startTime ?? "00:00:00"); setDraftEndTime(value.endTime ?? "23:59:59"); setDraftUtcOffset(value.utcOffset ?? browserUtcOffset()); setSelectingEnd(false); setVisibleMonth(addMonths(parseDate(value.end), -1)); setOpen(true); }
  function normalized(start: string) { return minimum && start < minimum ? minimum : start; }
  function choosePreset(start: string) { setDraftStart(normalized(start)); setDraftEnd(maximum); setDraftStartTime("00:00:00"); setDraftEndTime("23:59:59"); setSelectingEnd(false); setVisibleMonth(addMonths(parseDate(maximum), -1)); }
  function selectDate(date: string) { if (!selectingEnd || date < draftStart) { setDraftStart(date); setDraftEnd(date); setSelectingEnd(true); } else { setDraftEnd(date); setSelectingEnd(false); } }
  function apply() { if (!draftStart || !draftEnd || draftStart > draftEnd || (draftStart === draftEnd && draftStartTime > draftEndTime)) return; const preset = presets.find((item) => normalized(item.start) === draftStart && maximum === draftEnd && draftStartTime === "00:00:00" && draftEndTime === "23:59:59"); onChange({ start: draftStart, end: draftEnd, startTime: draftStartTime, endTime: draftEndTime, utcOffset: draftUtcOffset, label: preset?.label ?? `${formatDate(draftStart)} – ${formatDate(draftEnd)}` }); setOpen(false); }

  return <div className="relative"><button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => open ? setOpen(false) : show()} className="flex h-11 min-w-36 items-center justify-between gap-3 rounded-xl border border-[#d9dee7] bg-white px-4 text-sm font-medium shadow-sm transition hover:border-[#aeb8c8] focus:outline-none focus:ring-4 focus:ring-[#1f765915]"><CalendarDays className="size-4 text-[#667487]"/><span className="max-w-56 truncate">{buttonLabel ?? value.label}</span><ChevronDown className={cn("size-4 text-[#71817c] transition", open && "rotate-180")}/></button>
    {open && <><button type="button" aria-label="Close date range" onClick={() => setOpen(false)} className="fixed inset-0 z-[140] cursor-default bg-black/10"/><div role="dialog" aria-label="Select date range" className={cn("absolute top-[calc(100%+10px)] z-[150] w-[min(94vw,960px)] overflow-hidden rounded-2xl border border-[#d9dee7] bg-white shadow-2xl", align === "left" ? "left-0" : "right-0")}>
      <header className="flex items-center justify-between border-b px-5 py-4"><div><p className="flex items-center gap-2 text-sm font-semibold text-[#202b3c]"><CalendarDays className="size-4 text-[#667487]"/>Date Range: Between</p><p className="mt-1 text-xs text-[#71817c]">Select dates, exact times, and your business UTC offset.</p></div><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-[#f1f3f5]"><X className="size-4"/></button></header>
      <div className="grid md:grid-cols-[190px_1fr]"><aside className="space-y-1 border-r bg-[#fafbfc] p-4">{presets.map((preset) => <button type="button" key={preset.label} onClick={() => choosePreset(preset.start)} className={cn("w-full rounded-xl px-4 py-2.5 text-left text-sm font-medium transition hover:bg-white", normalized(preset.start) === draftStart && maximum === draftEnd ? "bg-[#eef1f7] text-[#253246]" : "text-[#596a7a]")}>{preset.label}</button>)}</aside>
        <section className="p-5"><div className="mb-4 flex items-center justify-between"><button type="button" aria-label="Previous month" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} className="rounded-lg p-2 hover:bg-[#f1f3f5]"><ChevronLeft className="size-5"/></button><p className="text-xs text-[#71817c]">{selectingEnd ? "Choose an end date" : "Choose a start date"}</p><button type="button" aria-label="Next month" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} disabled={addMonths(visibleMonth, 1) > parseDate(maximum)} className="rounded-lg p-2 hover:bg-[#f1f3f5] disabled:opacity-30"><ChevronRight className="size-5"/></button></div><div className="grid gap-7 sm:grid-cols-2"><div><CalendarMonth month={visibleMonth} start={draftStart} end={draftEnd} maximum={maximum} onSelect={selectDate}/><TimeBoundary label="Start time" value={draftStartTime} onChange={setDraftStartTime}/></div><div><CalendarMonth month={addMonths(visibleMonth, 1)} start={draftStart} end={draftEnd} maximum={maximum} onSelect={selectDate}/><TimeBoundary label="End time" value={draftEndTime} onChange={setDraftEndTime}/></div></div><label className="mt-4 flex items-center justify-end gap-3 text-xs font-semibold text-[#596a7a]">Business timezone<select aria-label="Business UTC offset" value={draftUtcOffset} onChange={(event) => setDraftUtcOffset(event.target.value)} className="h-10 rounded-xl border border-[#d9dee7] bg-white px-3 text-sm font-medium text-[#253246] outline-none"><option value="+00:00">UTC</option>{UTC_OFFSETS.filter((offset) => offset !== "+00:00").map((offset) => <option key={offset} value={offset}>UTC{offset}</option>)}</select></label></section>
      </div><footer className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center"><p className="mr-auto text-xs text-[#596a7a]">Range: <b>{formatDate(draftStart)} {draftStartTime} – {formatDate(draftEnd)} {draftEndTime} (UTC{draftUtcOffset})</b></p><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl border border-[#d9dee7] bg-white px-5 text-sm font-semibold">Cancel</button><button type="button" onClick={apply} disabled={!draftStart || !draftEnd || draftStart > draftEnd || selectingEnd || (draftStart === draftEnd && draftStartTime > draftEndTime)} className="h-10 rounded-xl bg-[#253246] px-6 text-sm font-semibold text-white disabled:opacity-40">Apply</button></footer>
    </div></>}
  </div>;
}

function TimeBoundary({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="mt-4 block text-[11px] font-semibold text-[#596a7a]">{label}<input type="time" step="1" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#d9dee7] bg-white px-3 text-sm text-[#253246] outline-none focus:border-[#4f647e] focus:ring-4 focus:ring-[#4f647e12]"/></label>; }

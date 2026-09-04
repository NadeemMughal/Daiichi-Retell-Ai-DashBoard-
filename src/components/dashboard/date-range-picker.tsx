"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useViewportClamp } from "./use-viewport-clamp";

export type DateRangeValue = { start: string; end: string; startTime: string; endTime: string; utcOffset: string; label: string };
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, month, 1, 12))));
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
const UTC_ZONES = [
  { offset: "-08:00", city: "Los Angeles" }, { offset: "-05:00", city: "New York" }, { offset: "-03:00", city: "São Paulo" },
  { offset: "+00:00", city: "London" }, { offset: "+01:00", city: "Paris" }, { offset: "+02:00", city: "Cairo" },
  { offset: "+03:00", city: "Riyadh" }, { offset: "+03:30", city: "Tehran" }, { offset: "+04:00", city: "Dubai" },
  { offset: "+04:30", city: "Kabul" }, { offset: "+05:00", city: "Karachi" }, { offset: "+05:30", city: "New Delhi" },
  { offset: "+05:45", city: "Kathmandu" }, { offset: "+06:00", city: "Dhaka" }, { offset: "+07:00", city: "Bangkok" },
  { offset: "+08:00", city: "Singapore" }, { offset: "+09:00", city: "Tokyo" }, { offset: "+10:00", city: "Sydney" },
  { offset: "+12:00", city: "Auckland" }
];
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
  const [open, setOpen] = useState(false); const panelClamp = useViewportClamp<HTMLDivElement>(open); const [draftStart, setDraftStart] = useState(value.start); const [draftEnd, setDraftEnd] = useState(value.end); const [draftStartTime, setDraftStartTime] = useState(value.startTime ?? "00:00:00"); const [draftEndTime, setDraftEndTime] = useState(value.endTime ?? "23:59:59"); const [draftUtcOffset, setDraftUtcOffset] = useState(value.utcOffset ?? browserUtcOffset()); const [selectingEnd, setSelectingEnd] = useState(false); const [visibleMonth, setVisibleMonth] = useState(() => addMonths(parseDate(value.end), -1));
  const presets = useMemo(() => [
    { label: "Today", start: maximum }, { label: "Last 7 days", start: shift(maximum, -6) }, { label: "Last 4 weeks", start: shift(maximum, -27) }, { label: "Last 3 months", start: shift(maximum, -89) }, { label: "Week to date", start: shift(maximum, -parseDate(maximum).getUTCDay()) }, { label: "Month to date", start: `${maximum.slice(0, 8)}01` }, { label: "Year to date", start: `${maximum.slice(0, 4)}-01-01` }, { label: "All time", start: minimum ?? shift(maximum, -29) }
  ], [maximum, minimum]);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [open]);
  useEffect(() => { if (!open) return; const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previousOverflow; }; }, [open]);
  function show() { setDraftStart(value.start); setDraftEnd(value.end); setDraftStartTime(value.startTime ?? "00:00:00"); setDraftEndTime(value.endTime ?? "23:59:59"); setDraftUtcOffset(value.utcOffset ?? browserUtcOffset()); setSelectingEnd(false); setVisibleMonth(addMonths(parseDate(value.end), -1)); setOpen(true); }
  function normalized(start: string) { return minimum && start < minimum ? minimum : start; }
  function choosePreset(start: string) { setDraftStart(normalized(start)); setDraftEnd(maximum); setDraftStartTime("00:00:00"); setDraftEndTime("23:59:59"); setSelectingEnd(false); setVisibleMonth(addMonths(parseDate(maximum), -1)); }
  // Jumping by month and typing a date directly, so reaching a month a year back
  // does not mean twelve clicks on the arrow.
  const selectableYears = useMemo(() => {
    const last = parseDate(maximum).getUTCFullYear();
    const earliest = Math.min(minimum ? parseDate(minimum).getUTCFullYear() : last - 5, last - 5);
    return Array.from({ length: last - earliest + 1 }, (_, index) => earliest + index);
  }, [maximum, minimum]);
  function goToMonth(year: number, month: number) {
    const requested = new Date(Date.UTC(year, month, 1, 12));
    const latest = new Date(Date.UTC(parseDate(maximum).getUTCFullYear(), parseDate(maximum).getUTCMonth(), 1, 12));
    setVisibleMonth(requested > latest ? latest : requested);
  }
  function typeStart(date: string) {
    if (!date) return;
    const clamped = date > maximum ? maximum : date;
    setDraftStart(clamped);
    if (clamped > draftEnd) setDraftEnd(clamped);
    setSelectingEnd(false);
    setVisibleMonth(new Date(Date.UTC(parseDate(clamped).getUTCFullYear(), parseDate(clamped).getUTCMonth(), 1, 12)));
  }
  function typeEnd(date: string) {
    if (!date) return;
    const clamped = date > maximum ? maximum : date;
    setDraftEnd(clamped < draftStart ? draftStart : clamped);
    setSelectingEnd(false);
  }
  function selectDate(date: string) { if (!selectingEnd || date < draftStart) { setDraftStart(date); setDraftEnd(date); setSelectingEnd(true); } else { setDraftEnd(date); setSelectingEnd(false); } }
  function apply() { if (!draftStart || !draftEnd || draftStart > draftEnd || (draftStart === draftEnd && draftStartTime > draftEndTime)) return; const preset = presets.find((item) => normalized(item.start) === draftStart && maximum === draftEnd && draftStartTime === "00:00:00" && draftEndTime === "23:59:59"); onChange({ start: draftStart, end: draftEnd, startTime: draftStartTime, endTime: draftEndTime, utcOffset: draftUtcOffset, label: preset?.label ?? `${formatDate(draftStart)} – ${formatDate(draftEnd)}` }); setOpen(false); }

  return <div className="relative"><button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => open ? setOpen(false) : show()} className="flex h-11 min-w-36 items-center justify-between gap-3 rounded-xl border border-[#d9dee7] bg-white px-4 text-sm font-medium shadow-sm transition hover:border-[#aeb8c8] focus:outline-none focus:ring-4 focus:ring-[#1f765915]"><CalendarDays className="size-4 text-[#667487]"/><span className="max-w-56 truncate">{buttonLabel ?? value.label}</span><ChevronDown className={cn("size-4 text-[#71817c] transition", open && "rotate-180")}/></button>
    {open && <><button type="button" aria-label="Close date range" onClick={() => setOpen(false)} className="fixed inset-0 z-[140] cursor-default bg-black/10"/><div ref={panelClamp} role="dialog" aria-label="Select date range" className={cn("fixed inset-x-2 top-16 z-[150] flex max-h-[calc(100dvh-72px)] flex-col overflow-hidden rounded-2xl border border-[#d9dee7] bg-white shadow-2xl lg:absolute lg:inset-x-auto lg:top-[calc(100%+10px)] lg:max-h-[calc(100vh-110px)] lg:w-[min(94vw,970px)]", align === "left" ? "lg:left-0" : "lg:right-0")}>
      <header className="flex shrink-0 items-center justify-between border-b px-5 py-4"><div><p className="flex items-center gap-2 text-sm font-semibold text-[#202b3c]"><CalendarDays className="size-4 text-[#667487]"/>Date Range: Between</p><p className="mt-1 text-xs text-[#71817c]">Select dates, exact times, and your business UTC offset.</p></div><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-[#f1f3f5]"><X className="size-4"/></button></header>
      <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain md:grid-cols-[190px_1fr]"><aside className="flex gap-1 overflow-x-auto border-b bg-[#fafbfc] p-3 md:block md:space-y-1 md:border-b-0 md:border-r md:p-4">{presets.map((preset) => <button type="button" key={preset.label} onClick={() => choosePreset(preset.start)} className={cn("shrink-0 rounded-xl px-4 py-2.5 text-left text-sm font-medium transition hover:bg-white md:w-full", normalized(preset.start) === draftStart && maximum === draftEnd ? "bg-[#eef1f7] text-[#253246]" : "text-[#596a7a]")}>{preset.label}</button>)}</aside>
        <section className="p-5">
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#596a7a]"><span className="w-9 shrink-0">From</span><input type="date" value={draftStart} max={maximum} onChange={(event) => typeStart(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-[#d9dee7] bg-white px-2 text-sm font-normal outline-none focus:border-[#4f647e] focus:ring-4 focus:ring-[#4f647e12]"/></label>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#596a7a]"><span className="w-9 shrink-0">To</span><input type="date" value={draftEnd} min={draftStart} max={maximum} onChange={(event) => typeEnd(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-[#d9dee7] bg-white px-2 text-sm font-normal outline-none focus:border-[#4f647e] focus:ring-4 focus:ring-[#4f647e12]"/></label>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-[#f1f3f5]"><ChevronLeft className="size-5"/></button>
            <div className="flex flex-1 items-center justify-center gap-2">
              <label className="sr-only" htmlFor="range-month">Month</label>
              <select id="range-month" aria-label="Month" value={visibleMonth.getUTCMonth()} onChange={(event) => goToMonth(visibleMonth.getUTCFullYear(), Number(event.target.value))} className="h-10 min-w-0 flex-1 rounded-lg border border-[#d9dee7] bg-white px-2 text-sm font-medium sm:flex-none">{MONTH_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}</select>
              <label className="sr-only" htmlFor="range-year">Year</label>
              <select id="range-year" aria-label="Year" value={visibleMonth.getUTCFullYear()} onChange={(event) => goToMonth(Number(event.target.value), visibleMonth.getUTCMonth())} className="h-10 min-w-0 rounded-lg border border-[#d9dee7] bg-white px-2 text-sm font-medium">{selectableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select>
            </div>
            <button type="button" aria-label="Next month" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} disabled={addMonths(visibleMonth, 1) > parseDate(maximum)} className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-[#f1f3f5] disabled:opacity-30"><ChevronRight className="size-5"/></button>
            <p className="w-full text-center text-xs text-[#71817c] sm:w-auto sm:flex-1 sm:basis-full">{selectingEnd ? "Choose an end date" : "Choose a start date"}</p>
          </div>
          <div className="grid gap-7 sm:grid-cols-2"><div><CalendarMonth month={visibleMonth} start={draftStart} end={draftEnd} maximum={maximum} onSelect={selectDate}/><TimeBoundary label="Start time" value={draftStartTime} onChange={setDraftStartTime} utcOffset={draftUtcOffset} onUtcOffsetChange={setDraftUtcOffset}/></div><div><CalendarMonth month={addMonths(visibleMonth, 1)} start={draftStart} end={draftEnd} maximum={maximum} onSelect={selectDate}/><TimeBoundary label="End time" value={draftEndTime} onChange={setDraftEndTime} utcOffset={draftUtcOffset} onUtcOffsetChange={setDraftUtcOffset}/></div></div><p className="mt-3 text-right text-[11px] text-[#71817c]">The UTC offset applies to both boundaries and all dashboard reporting pages.</p></section>
      </div><footer className="flex shrink-0 flex-col gap-3 border-t bg-white px-5 py-4 sm:flex-row sm:items-center"><p className="mr-auto text-xs text-[#596a7a]">Range: <b>{formatDate(draftStart)} {draftStartTime} – {formatDate(draftEnd)} {draftEndTime} (UTC{draftUtcOffset})</b></p><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl border border-[#d9dee7] bg-white px-5 text-sm font-semibold">Cancel</button><button type="button" onClick={apply} disabled={!draftStart || !draftEnd || draftStart > draftEnd || selectingEnd || (draftStart === draftEnd && draftStartTime > draftEndTime)} className="h-10 rounded-xl bg-[#253246] px-6 text-sm font-semibold text-white disabled:opacity-40">Apply</button></footer>
    </div></>}
  </div>;
}

function TimeBoundary({ label, value, onChange, utcOffset, onUtcOffsetChange }: { label: string; value: string; onChange: (value: string) => void; utcOffset: string; onUtcOffsetChange: (value: string) => void }) { const [zonesOpen, setZonesOpen] = useState(false); const zoneClamp = useViewportClamp<HTMLDivElement>(zonesOpen); const namedOffsets = new Set(UTC_ZONES.map((zone) => zone.offset)); const zones = [...UTC_ZONES, ...UTC_OFFSETS.filter((offset) => !namedOffsets.has(offset)).map((offset) => ({ offset, city: "UTC offset" }))].sort((a, b) => a.offset.localeCompare(b.offset)); return <fieldset className="mt-4"><legend className="text-[11px] font-semibold text-[#596a7a]">{label}</legend><div className="relative mt-1 flex h-11 rounded-xl border border-[#d9dee7] bg-white focus-within:border-[#4f647e] focus-within:ring-4 focus-within:ring-[#4f647e12]"><Clock3 className="ml-3 mt-3 size-4 shrink-0 text-[#84928d]"/><input aria-label={label} type="time" step="1" value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[#253246] outline-none"/><button type="button" aria-label={`${label} UTC offset`} aria-expanded={zonesOpen} onClick={() => setZonesOpen((current) => !current)} className="flex shrink-0 items-center gap-1 border-l border-[#d9dee7] bg-[#f5f7f9] px-2 text-xs font-semibold text-[#667487]">UTC{utcOffset}<ChevronDown className="size-3"/></button>{zonesOpen && <div ref={zoneClamp} className="absolute bottom-[calc(100%+8px)] right-0 z-[180] max-h-80 w-[min(88vw,18rem)] overflow-y-auto rounded-xl border bg-white p-2 text-left shadow-2xl">{zones.map((zone, index) => <button type="button" key={`${zone.offset}-${zone.city}-${index}`} onClick={() => { onUtcOffsetChange(zone.offset); setZonesOpen(false); }} className={cn("flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-[#f1f3f7]", zone.offset === utcOffset && "bg-[#f0f1f6]")}><span><span className="block text-sm font-medium">UTC{zone.offset === "+00:00" ? "" : zone.offset}</span><span className="block text-xs text-[#84928d]">{zone.city}</span></span>{zone.offset === utcOffset && <Check className="ml-auto size-4"/>}</button>)}</div>}</div></fieldset>; }

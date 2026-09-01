"use client";

import { AlertTriangle, LayoutDashboard, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export function DashboardError({ error, reset, operations = false }: { error: Error & { digest?: string }; reset: () => void; operations?: boolean }) {
  useEffect(() => { console.error("Dashboard failed to load", error); }, [error]);
  return <main className="subtle-grid grid min-h-screen place-items-center p-6"><section className="glass w-full max-w-lg rounded-3xl p-8 text-center shadow-2xl"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700"><AlertTriangle className="size-7"/></span><h1 className="mt-5 text-2xl font-semibold tracking-tight">Dashboard temporarily unavailable</h1><p className="mt-2 text-sm leading-6 text-[#71817c]">Your account is still secure. Retry the live data request, or return to a safe page while the connection recovers.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button onClick={reset} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#164f3e] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#1f7659]"><RefreshCw className="size-4"/>Try again</button><Link href={operations ? "/admin" : "/"} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#173f3320] bg-white px-5 text-sm font-semibold text-[#164f3e] transition hover:border-[#1f7659]"><LayoutDashboard className="size-4"/>{operations ? "Open operations" : "Return home"}</Link></div>{error.digest && <p className="mt-5 text-[11px] text-[#9aa6a2]">Reference: {error.digest}</p>}</section></main>;
}

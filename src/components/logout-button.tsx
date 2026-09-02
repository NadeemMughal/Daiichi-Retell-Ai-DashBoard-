"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

export function LogoutButton({ loginPath = "/login", dark = false, className }: { loginPath?: string; dark?: boolean; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { error: signOutError } = await createClient().auth.signOut();
      if (signOutError) throw signOutError;
      router.replace(loginPath);
      router.refresh();
    } catch {
      setError("Unable to sign out. Please try again.");
      setBusy(false);
    }
  }

  return <div className={className}><button type="button" onClick={() => void logout()} disabled={busy} className={cn("flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-60", dark ? "border border-white/10 text-white/70 hover:bg-white/10 hover:text-white" : "border border-[#173f3320] bg-white text-[#164f3e] hover:border-[#1f7659] hover:bg-[#f2f7f4]")}>{busy ? <LoaderCircle className="size-[18px] animate-spin"/> : <LogOut className="size-[18px]"/>}{busy ? "Signing out…" : "Logout"}</button>{error && <p role="alert" className={cn("mt-2 text-xs", dark ? "text-rose-200" : "text-rose-700")}>{error}</p>}</div>;
}

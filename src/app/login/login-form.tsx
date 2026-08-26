"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      router.replace("/"); router.refresh();
    } catch {
      setError("Sign-in failed. Check your email and password.");
    } finally { setLoading(false); }
  }

  return <form onSubmit={submit} className="mt-8 space-y-5"><label className="block"><span className="text-sm font-semibold">Work email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#173f3320] bg-white px-4 outline-none focus:border-[#1f7659] focus:ring-4 focus:ring-[#1f765915]" placeholder="you@company.com" /></label><label className="block"><span className="text-sm font-semibold">Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#173f3320] bg-white px-4 outline-none focus:border-[#1f7659] focus:ring-4 focus:ring-[#1f765915]" placeholder="Your password" /></label>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#164f3e] font-semibold text-white transition hover:bg-[#1f7659] disabled:opacity-60">{loading ? <LoaderCircle className="size-5 animate-spin" /> : <>Sign in securely <ArrowRight className="size-4" /></>}</button></form>;
}


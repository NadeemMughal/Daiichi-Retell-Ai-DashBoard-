import Link from "next/link";
import { Crown, ShieldCheck, UserRound } from "lucide-react";
import { LoginForm, type LoginRole } from "./login-form";

const portals = {
  super_admin: { label: "Super Admin", title: "System control", description: "Full dashboard, operations, administrator, client and agent management.", icon: Crown },
  admin: { label: "Admin", title: "Operations portal", description: "Manage clients, agents, assignments and operational dashboards.", icon: ShieldCheck },
  client: { label: "Client", title: "Client dashboard", description: "View your assigned workspace, agents and reporting pages.", icon: UserRound }
} as const;

export function PortalLogin({ role }: { role: LoginRole }) {
  const portal = portals[role];
  return <main className="subtle-grid grid min-h-screen lg:grid-cols-[1.05fr_.95fr]"><section className="hidden bg-[#123e32] p-14 text-white lg:flex lg:flex-col lg:justify-between"><Link href="/login" className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#d7f55b] text-xl font-black text-[#123e32]">D</div><div><p className="text-xs uppercase tracking-[.25em] text-white/55">Daiichi</p><p className="font-semibold">Agent Intelligence</p></div></Link><div className="max-w-xl"><p className="text-sm font-bold uppercase tracking-[.2em] text-[#d7f55b]">{portal.label} access</p><h1 className="mt-5 text-6xl font-semibold leading-[1.02] tracking-[-.06em]">{portal.title}</h1><p className="mt-7 max-w-lg text-lg leading-8 text-white/60">{portal.description}</p></div><p className="text-xs text-white/35">Secure role verification · Tenant-isolated data</p></section><section className="grid place-items-center p-6"><div className="glass w-full max-w-md rounded-[28px] p-8 md:p-10"><div className="grid size-12 place-items-center rounded-2xl bg-[#e5f3eb] text-[#1f7659]"><portal.icon className="size-6"/></div><h2 className="mt-6 text-3xl font-semibold tracking-[-.04em]">{portal.label} sign in</h2><p className="mt-2 text-sm leading-6 text-[#71817c]">Use the credentials assigned to your {portal.label.toLowerCase()} account.</p><LoginForm expectedRole={role}/><Link href="/login" className="mt-5 block text-center text-sm font-semibold text-[#1f7659] transition hover:underline">Choose another portal</Link></div></section></main>;
}

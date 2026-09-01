import { Crown, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";

const portals = [
  { href: "/login/super-admin", label: "Super Admin", detail: "Full system control", icon: Crown },
  { href: "/login/admin", label: "Admin", detail: "Operations management", icon: ShieldCheck },
  { href: "/login/client", label: "Client", detail: "Assigned dashboard only", icon: UserRound }
];

export default function LoginPage() {
  return <main className="subtle-grid grid min-h-screen place-items-center p-6"><section className="w-full max-w-5xl"><div className="text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#164f3e] text-xl font-black text-[#d7f55b] shadow-lg">D</div><p className="mt-5 text-xs font-bold uppercase tracking-[.24em] text-[#1f7659]">Daiichi Agent Intelligence</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.05em]">Choose your secure portal</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#71817c]">Each login verifies the account role before opening protected dashboard data.</p></div><div className="mt-9 grid gap-5 md:grid-cols-3">{portals.map((portal) => <Link key={portal.href} href={portal.href} className="glass group rounded-3xl p-7 transition duration-200 hover:-translate-y-1 hover:border-[#1f765955] hover:shadow-2xl"><span className="grid size-12 place-items-center rounded-2xl bg-[#e5f3eb] text-[#1f7659] transition group-hover:bg-[#164f3e] group-hover:text-[#d7f55b]"><portal.icon className="size-6"/></span><h2 className="mt-6 text-xl font-semibold">{portal.label}</h2><p className="mt-2 text-sm text-[#71817c]">{portal.detail}</p><span className="mt-6 block text-sm font-semibold text-[#1f7659]">Open portal →</span></Link>)}</div></section></main>;
}

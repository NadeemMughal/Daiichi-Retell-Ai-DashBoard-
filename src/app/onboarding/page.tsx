import { CircleAlert } from "lucide-react";

export default function OnboardingPage() {
  return <main className="subtle-grid grid min-h-screen place-items-center p-6"><section className="glass max-w-lg rounded-[28px] p-10 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><CircleAlert className="size-6" /></div><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em]">Workspace assignment pending</h1><p className="mt-3 leading-7 text-[#71817c]">Your account is active but is not assigned to a client workspace. Ask a Daiichi administrator to complete your membership.</p></section></main>;
}

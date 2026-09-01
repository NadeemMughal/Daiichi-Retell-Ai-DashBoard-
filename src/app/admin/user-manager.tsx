"use client";

import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type User = { userId: string; tenantId: string; name: string; email: string; tenantName: string; status: string };
type Tenant = { id: string; name: string };

export function UserManager({ users, tenants }: { users: User[]; tenants: Tenant[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<User | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const primaryTenantId = tenants[0]?.id ?? "";
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("admin-membership-changes").on("postgres_changes", { event: "*", schema: "public", table: "tenant_memberships" }, () => router.refresh()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/admin/users", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "User update failed");
      setAdding(false); setEditing(null); setMessage(editing ? "User details updated." : "User created successfully."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "User update failed"); }
    finally { setBusy(false); }
  }

  async function remove(user: User) {
    if (!window.confirm(`Remove ${user.name || user.email}? Their agent access will also be revoked.`)) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/users", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.userId, tenantId: user.tenantId }) });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) return setMessage(result.error ?? "User removal failed");
    setMessage("User removed and agent access revoked."); router.refresh();
  }

  return <article id="client-users" className="glass mt-5 scroll-mt-6 rounded-2xl p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="flex items-center gap-2 font-semibold"><UserRound className="size-5 text-[#1f7659]"/>Client users</h2><p className="mt-1 text-xs text-[#71817c]">Create and manage dashboard-only users. Agent visibility is assigned separately below.</p></div><button onClick={() => { setEditing(null); setAdding(true); }} disabled={!tenants.length} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#164f3e] px-4 text-sm font-semibold text-white disabled:opacity-40"><Plus className="size-4"/>Add new user</button></div>
    {message && <p className="mt-4 rounded-xl bg-[#e8f3ed] px-4 py-3 text-sm font-semibold text-[#1f7659]">{message}</p>}
    {(adding || editing) && <form onSubmit={submit} className="mt-5 grid gap-3 rounded-2xl border border-[#173f3310] bg-white/70 p-5 md:grid-cols-2 xl:grid-cols-3">
      <input type="hidden" name="userId" value={editing?.userId ?? ""}/>
      {editing ? <input type="hidden" name="tenantId" value={editing.tenantId}/> : <label className="text-xs font-semibold text-[#596a64]">Client workspace<select name="tenantId" required defaultValue={primaryTenantId} className="mt-2 h-11 w-full rounded-xl border border-[#173f3320] bg-white px-3 text-sm">{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>}
      <label className="text-xs font-semibold text-[#596a64]">Full name<input name="name" required minLength={2} defaultValue={editing?.name} className="mt-2 h-11 w-full rounded-xl border border-[#173f3320] bg-white px-3 text-sm"/></label>
      <label className="text-xs font-semibold text-[#596a64]">Email<input name="email" type="email" required defaultValue={editing?.email} className="mt-2 h-11 w-full rounded-xl border border-[#173f3320] bg-white px-3 text-sm"/></label>
      {!editing && <label className="text-xs font-semibold text-[#596a64]">Temporary password<input name="password" type="password" required minLength={8} className="mt-2 h-11 w-full rounded-xl border border-[#173f3320] bg-white px-3 text-sm"/></label>}
      <div className="flex items-end gap-2"><button disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#164f3e] px-4 text-sm font-semibold text-white">{busy && <LoaderCircle className="size-4 animate-spin"/>}{editing ? "Save changes" : "Create user"}</button><button type="button" onClick={() => { setAdding(false); setEditing(null); }} className="grid size-11 place-items-center rounded-xl border border-[#173f3320] bg-white"><X className="size-4"/></button></div>
    </form>}
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b border-[#173f3310] text-xs uppercase tracking-wider text-[#84928d]"><th className="p-3">Client user</th><th className="p-3">Access</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{users.map((user) => <tr key={`${user.tenantId}:${user.userId}`} className="border-b border-[#173f3309]"><td className="p-3"><p className="text-sm font-semibold">{user.name || "Unnamed user"}</p><p className="text-xs text-[#71817c]">{user.email}</p></td><td className="p-3"><span className="rounded-full bg-[#e8f3ed] px-3 py-1 text-xs font-semibold text-[#1f7659]">Assigned agents only</span></td><td className="p-3"><div className="flex justify-end gap-2"><Link href={`/admin/view-as/${user.userId}`} className="flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">View as</Link><button onClick={() => { setAdding(false); setEditing(user); }} className="flex h-9 items-center gap-2 rounded-lg border border-[#173f3320] bg-white px-3 text-xs font-semibold"><Pencil className="size-3"/>Edit</button><button disabled={busy} onClick={() => remove(user)} className="flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700"><Trash2 className="size-3"/>Remove</button></div></td></tr>)}</tbody></table>{!users.length && <p className="p-8 text-center text-sm text-[#71817c]">No active client users exist yet.</p>}</div>
  </article>;
}

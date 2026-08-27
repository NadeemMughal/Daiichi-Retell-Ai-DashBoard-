import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizationContext } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

const optionalUuid = z.preprocess((value) => value === "" ? undefined : value, z.string().uuid().optional());
const optionalPassword = z.preprocess((value) => value === "" ? undefined : value, z.string().min(8).max(128).optional());
const details = z.object({ userId: optionalUuid, name: z.string().trim().min(2).max(100), email: z.string().trim().email().transform((v) => v.toLowerCase()), password: optionalPassword });
const removal = z.object({ userId: z.string().uuid() });
async function requireSuperAdmin() { const context = await requireAuthorizationContext(); if (!context.platformRoles.includes("super_admin")) return null; return context; }

export async function POST(request: Request) {
  const context = await requireSuperAdmin(); if (!context) return NextResponse.json({ error: "SUPER_ADMIN_REQUIRED" }, { status: 403 });
  const parsed = details.safeParse(await request.json()); if (!parsed.success || !parsed.data.password) return NextResponse.json({ error: "INVALID_ADMIN_DETAILS" }, { status: 400 });
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({ email: parsed.data.email, password: parsed.data.password, email_confirm: true, user_metadata: { display_name: parsed.data.name } });
  if (created.error || !created.data.user) return NextResponse.json({ error: created.error?.message ?? "ADMIN_CREATE_FAILED" }, { status: 409 });
  const userId = created.data.user.id;
  const profile = await admin.from("profiles").update({ display_name: parsed.data.name, email: parsed.data.email, status: "active", updated_at: new Date().toISOString() }).eq("id", userId);
  const role = await admin.from("platform_role_assignments").insert({ user_id: userId, role: "operations_admin", granted_by: context.userId });
  if (profile.error || role.error) { await admin.auth.admin.deleteUser(userId); return NextResponse.json({ error: "ADMIN_ROLE_CREATE_FAILED" }, { status: 503 }); }
  await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "platform_admin.created", target_type: "profile", target_id: userId, safe_metadata: { email: parsed.data.email } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const context = await requireSuperAdmin(); if (!context) return NextResponse.json({ error: "SUPER_ADMIN_REQUIRED" }, { status: 403 });
  const parsed = details.safeParse(await request.json()); if (!parsed.success || !parsed.data.userId) return NextResponse.json({ error: "INVALID_ADMIN_DETAILS" }, { status: 400 });
  const admin = createAdminClient();
  const { data: role } = await admin.from("platform_role_assignments").select("id").eq("user_id", parsed.data.userId).eq("role", "operations_admin").is("revoked_at", null).maybeSingle();
  if (!role) return NextResponse.json({ error: "ADMIN_NOT_FOUND" }, { status: 404 });
  const auth = await admin.auth.admin.updateUserById(parsed.data.userId, { email: parsed.data.email, user_metadata: { display_name: parsed.data.name } });
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: 409 });
  const profile = await admin.from("profiles").update({ display_name: parsed.data.name, email: parsed.data.email, updated_at: new Date().toISOString() }).eq("id", parsed.data.userId);
  if (profile.error) return NextResponse.json({ error: "ADMIN_UPDATE_FAILED" }, { status: 503 });
  await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "platform_admin.updated", target_type: "profile", target_id: parsed.data.userId, safe_metadata: { email: parsed.data.email } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await requireSuperAdmin(); if (!context) return NextResponse.json({ error: "SUPER_ADMIN_REQUIRED" }, { status: 403 });
  const parsed = removal.safeParse(await request.json()); if (!parsed.success || parsed.data.userId === context.userId) return NextResponse.json({ error: "INVALID_ADMIN_REMOVAL" }, { status: 400 });
  const admin = createAdminClient(); const now = new Date().toISOString();
  const revoked = await admin.from("platform_role_assignments").update({ revoked_at: now }).eq("user_id", parsed.data.userId).eq("role", "operations_admin").is("revoked_at", null).select("id").maybeSingle();
  if (revoked.error || !revoked.data) return NextResponse.json({ error: "ADMIN_NOT_FOUND" }, { status: 404 });
  await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "platform_admin.removed", target_type: "profile", target_id: parsed.data.userId, safe_metadata: {} });
  return NextResponse.json({ ok: true });
}

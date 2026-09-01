import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

const optionalUuid = z.preprocess((value) => value === "" ? undefined : value, z.string().uuid().optional());
const optionalPassword = z.preprocess((value) => value === "" ? undefined : value, z.string().min(8).max(128).optional());
const details = z.object({ userId: optionalUuid, name: z.string().trim().min(2).max(100), email: z.string().trim().email().transform((v) => v.toLowerCase()), password: optionalPassword, role: z.enum(["super_admin", "operations_admin"]).default("operations_admin") });
const removal = z.object({ userId: z.string().uuid() });
async function requirePlatformAdmin() { const context = await requireAuthorizationContext(); requirePermission(context, "platform.manage"); return context; }

export async function POST(request: Request) {
  const context = await requirePlatformAdmin();
  const parsed = details.safeParse(await request.json()); if (!parsed.success || !parsed.data.password) return NextResponse.json({ error: "INVALID_ADMIN_DETAILS" }, { status: 400 });
  if (parsed.data.role === "super_admin" && !context.permissions.has("super_admin.manage")) return NextResponse.json({ error: "SUPER_ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({ email: parsed.data.email, password: parsed.data.password, email_confirm: true, user_metadata: { display_name: parsed.data.name } });
  if (created.error || !created.data.user) return NextResponse.json({ error: created.error?.message ?? "ADMIN_CREATE_FAILED" }, { status: 409 });
  const userId = created.data.user.id;
  const profile = await admin.from("profiles").update({ display_name: parsed.data.name, email: parsed.data.email, status: "active", updated_at: new Date().toISOString() }).eq("id", userId);
  const role = await admin.from("platform_role_assignments").insert({ user_id: userId, role: parsed.data.role, granted_by: context.userId });
  if (profile.error || role.error) { await admin.auth.admin.deleteUser(userId); return NextResponse.json({ error: "ADMIN_ROLE_CREATE_FAILED" }, { status: 503 }); }
  await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "platform_admin.created", target_type: "profile", target_id: userId, safe_metadata: { email: parsed.data.email } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const context = await requirePlatformAdmin();
  const parsed = details.safeParse(await request.json()); if (!parsed.success || !parsed.data.userId) return NextResponse.json({ error: "INVALID_ADMIN_DETAILS" }, { status: 400 });
  const admin = createAdminClient();
  const { data: role } = await admin.from("platform_role_assignments").select("id,role").eq("user_id", parsed.data.userId).in("role", ["super_admin", "operations_admin"]).is("revoked_at", null).maybeSingle();
  if (!role) return NextResponse.json({ error: "ADMIN_NOT_FOUND" }, { status: 404 });
  if ((role.role === "super_admin" || parsed.data.role === "super_admin") && !context.permissions.has("super_admin.manage")) return NextResponse.json({ error: "SUPER_ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  const auth = await admin.auth.admin.updateUserById(parsed.data.userId, { email: parsed.data.email, user_metadata: { display_name: parsed.data.name } });
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: 409 });
  const profile = await admin.from("profiles").update({ display_name: parsed.data.name, email: parsed.data.email, updated_at: new Date().toISOString() }).eq("id", parsed.data.userId);
  if (profile.error) return NextResponse.json({ error: "ADMIN_UPDATE_FAILED" }, { status: 503 });
  if (role.role !== parsed.data.role) {
    const roleUpdate = await admin.from("platform_role_assignments").update({ role: parsed.data.role }).eq("id", role.id);
    if (roleUpdate.error) return NextResponse.json({ error: "ADMIN_ROLE_UPDATE_FAILED" }, { status: 503 });
  }
  await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "platform_admin.updated", target_type: "profile", target_id: parsed.data.userId, safe_metadata: { email: parsed.data.email } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await requirePlatformAdmin();
  const parsed = removal.safeParse(await request.json()); if (!parsed.success || parsed.data.userId === context.userId) return NextResponse.json({ error: "INVALID_ADMIN_REMOVAL" }, { status: 400 });
  const admin = createAdminClient(); const now = new Date().toISOString();
  const { data: targetRole } = await admin.from("platform_role_assignments").select("role").eq("user_id", parsed.data.userId).in("role", ["super_admin", "operations_admin"]).is("revoked_at", null).maybeSingle();
  if (!targetRole) return NextResponse.json({ error: "ADMIN_NOT_FOUND" }, { status: 404 });
  if (targetRole.role === "super_admin" && !context.permissions.has("super_admin.manage")) return NextResponse.json({ error: "SUPER_ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  const revoked = await admin.from("platform_role_assignments").update({ revoked_at: now }).eq("user_id", parsed.data.userId).in("role", ["super_admin", "operations_admin"]).is("revoked_at", null).select("id").maybeSingle();
  if (revoked.error || !revoked.data) return NextResponse.json({ error: "ADMIN_NOT_FOUND" }, { status: 404 });
  await admin.from("audit_logs").insert({ actor_user_id: context.userId, action: "platform_admin.removed", target_type: "profile", target_id: parsed.data.userId, safe_metadata: {} });
  return NextResponse.json({ ok: true });
}

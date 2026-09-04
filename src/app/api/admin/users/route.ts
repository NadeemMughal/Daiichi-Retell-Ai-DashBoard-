import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});
// An empty field means "leave the password alone", so it has to become undefined
// before the length check rather than failing validation as a short string.
const optionalPassword = z.preprocess((value) => value === "" || value == null ? undefined : value, z.string().min(8).max(128).optional());
const updateSchema = z.object({
  userId: z.string().uuid(), tenantId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: optionalPassword
});
const removeSchema = z.object({ userId: z.string().uuid(), tenantId: z.string().uuid() });

async function ownerContext() {
  const context = await requireAuthorizationContext();
  requirePermission(context, "members.manage");
  return context;
}

export async function POST(request: Request) {
  const context = await ownerContext();
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_USER_DETAILS" }, { status: 400 });
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id").eq("id", parsed.data.tenantId).neq("status", "archived").maybeSingle();
  if (!tenant) return NextResponse.json({ error: "CLIENT_NOT_FOUND" }, { status: 404 });
  const created = await admin.auth.admin.createUser({ email: parsed.data.email, password: parsed.data.password, email_confirm: true, user_metadata: { display_name: parsed.data.name } });
  if (created.error || !created.data.user) return NextResponse.json({ error: created.error?.message ?? "USER_CREATE_FAILED" }, { status: 409 });
  const userId = created.data.user.id;
  const profile = await admin.from("profiles").update({ display_name: parsed.data.name, email: parsed.data.email, status: "active", updated_at: new Date().toISOString() }).eq("id", userId);
  const membership = await admin.from("tenant_memberships").insert({ tenant_id: tenant.id, user_id: userId, role: "viewer", status: "active", invited_by: context.userId, joined_at: new Date().toISOString() });
  if (profile.error || membership.error) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "USER_MEMBERSHIP_CREATE_FAILED" }, { status: 503 });
  }
  await admin.from("audit_logs").insert({ tenant_id: tenant.id, actor_user_id: context.userId, action: "client_user.created", target_type: "profile", target_id: userId, safe_metadata: { email: parsed.data.email } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const context = await ownerContext();
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_USER_DETAILS" }, { status: 400 });
  const admin = createAdminClient();
  const { data: membership } = await admin.from("tenant_memberships").select("id").eq("tenant_id", parsed.data.tenantId).eq("user_id", parsed.data.userId).neq("status", "removed").maybeSingle();
  if (!membership) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  const authUpdate = await admin.auth.admin.updateUserById(parsed.data.userId, { email: parsed.data.email, user_metadata: { display_name: parsed.data.name }, ...(parsed.data.password ? { password: parsed.data.password } : {}) });
  if (authUpdate.error) return NextResponse.json({ error: authUpdate.error.message }, { status: 409 });
  const profile = await admin.from("profiles").update({ display_name: parsed.data.name, email: parsed.data.email, updated_at: new Date().toISOString() }).eq("id", parsed.data.userId);
  if (profile.error) return NextResponse.json({ error: "USER_UPDATE_FAILED" }, { status: 503 });
  await admin.from("audit_logs").insert({ tenant_id: parsed.data.tenantId, actor_user_id: context.userId, action: "client_user.updated", target_type: "profile", target_id: parsed.data.userId, safe_metadata: { email: parsed.data.email, passwordReset: Boolean(parsed.data.password) } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await ownerContext();
  const parsed = removeSchema.safeParse(await request.json());
  if (!parsed.success || parsed.data.userId === context.userId) return NextResponse.json({ error: "INVALID_USER_REMOVAL" }, { status: 400 });
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const membership = await admin.from("tenant_memberships").update({ status: "removed", updated_at: now }).eq("tenant_id", parsed.data.tenantId).eq("user_id", parsed.data.userId).neq("status", "removed").select("id").maybeSingle();
  if (membership.error || !membership.data) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  await admin.from("user_agent_access").update({ revoked_at: now }).eq("tenant_id", parsed.data.tenantId).eq("user_id", parsed.data.userId).is("revoked_at", null);
  await admin.from("audit_logs").insert({ tenant_id: parsed.data.tenantId, actor_user_id: context.userId, action: "client_user.removed", target_type: "profile", target_id: parsed.data.userId, safe_metadata: {} });
  return NextResponse.json({ ok: true });
}

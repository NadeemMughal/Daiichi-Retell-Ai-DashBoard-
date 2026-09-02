import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ tenantId: z.string().uuid(), agentId: z.string().uuid(), reason: z.string().trim().min(8).max(500) });

export async function POST(request: Request) {
  const context = await requireAuthorizationContext();
  requirePermission(context, "agents.manage");
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "INVALID_ASSIGNMENT", details: body.error.flatten().fieldErrors }, { status: 400 });
  const admin = createAdminClient();
  const [{ data: tenant }, { data: agent }, { data: active }] = await Promise.all([
    admin.from("tenants").select("id,status").eq("id", body.data.tenantId).maybeSingle(),
    admin.from("retell_agents").select("id").eq("id", body.data.agentId).maybeSingle(),
    admin.from("agent_assignments").select("id,tenant_id").eq("agent_id", body.data.agentId).is("valid_to", null).maybeSingle()
  ]);
  if (!tenant || !agent || tenant.status === "archived") return NextResponse.json({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
  if (active) return NextResponse.json({ error: "AGENT_ALREADY_ASSIGNED", assignmentId: active.id }, { status: 409 });
  const { data: assignment, error } = await admin.from("agent_assignments").insert({ tenant_id: tenant.id, agent_id: agent.id, assigned_by: context.userId, assignment_reason: body.data.reason }).select("id").single();
  if (error) return NextResponse.json({ error: "ASSIGNMENT_FAILED" }, { status: error.code === "23505" ? 409 : 503 });
  await admin.from("audit_logs").insert({ tenant_id: tenant.id, actor_user_id: context.userId, action: "agent.assigned", target_type: "retell_agent", target_id: agent.id, reason: body.data.reason, safe_metadata: { assignmentId: assignment.id } });
  await admin.from("dashboard_refresh_signals").upsert({ tenant_id: tenant.id, resource: "agents", changed_at: new Date().toISOString() }, { onConflict: "tenant_id,resource" });
  return NextResponse.json({ ok: true, assignmentId: assignment.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await requireAuthorizationContext();
  requirePermission(context, "agents.manage");
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "INVALID_ASSIGNMENT", details: body.error.flatten().fieldErrors }, { status: 400 });
  const admin = createAdminClient();
  const [{ data: tenant }, { data: agent }, { data: active }] = await Promise.all([
    admin.from("tenants").select("id,status").eq("id", body.data.tenantId).maybeSingle(),
    admin.from("retell_agents").select("id,status").eq("id", body.data.agentId).maybeSingle(),
    admin.from("agent_assignments").select("id,tenant_id").eq("agent_id", body.data.agentId).is("valid_to", null).maybeSingle()
  ]);
  if (!tenant || !agent || tenant.status === "archived" || agent.status !== "active") return NextResponse.json({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
  if (active && active.tenant_id === tenant.id) return NextResponse.json({ ok: true, assignmentId: active.id, unchanged: true });
  const changedAt = new Date().toISOString();
  if (active) {
    const [{ error: closeError }, { error: revokeError }] = await Promise.all([
      admin.from("agent_assignments").update({ valid_to: changedAt }).eq("id", active.id).is("valid_to", null),
      admin.from("user_agent_access").update({ revoked_at: changedAt }).eq("agent_id", agent.id).eq("tenant_id", active.tenant_id).is("revoked_at", null)
    ]);
    if (closeError || revokeError) return NextResponse.json({ error: "ASSIGNMENT_MOVE_CLEANUP_FAILED" }, { status: 503 });
  }
  const { data: assignment, error } = await admin.from("agent_assignments").insert({ tenant_id: tenant.id, agent_id: agent.id, assigned_by: context.userId, assignment_reason: body.data.reason }).select("id").single();
  if (error) return NextResponse.json({ error: "ASSIGNMENT_MOVE_FAILED", code: error.code }, { status: error.code === "23505" ? 409 : 503 });
  const affectedTenantIds = new Set([tenant.id, ...(active ? [active.tenant_id] : [])]);
  for (const tenantId of affectedTenantIds) await admin.from("dashboard_refresh_signals").upsert({ tenant_id: tenantId, resource: "agents", changed_at: changedAt }, { onConflict: "tenant_id,resource" });
  await admin.from("audit_logs").insert({ tenant_id: tenant.id, actor_user_id: context.userId, action: active ? "agent.reassigned" : "agent.assigned", target_type: "retell_agent", target_id: agent.id, reason: body.data.reason, safe_metadata: { assignmentId: assignment.id, previousTenantId: active?.tenant_id ?? null } });
  return NextResponse.json({ ok: true, assignmentId: assignment.id }, { status: 201 });
}

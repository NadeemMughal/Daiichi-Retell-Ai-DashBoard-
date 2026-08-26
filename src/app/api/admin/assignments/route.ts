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
  return NextResponse.json({ ok: true, assignmentId: assignment.id }, { status: 201 });
}


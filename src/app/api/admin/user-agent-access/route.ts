import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  agentId: z.string().uuid(),
  action: z.enum(["grant", "revoke"])
});

export async function POST(request: Request) {
  const context = await requireAuthorizationContext();
  requirePermission(context, "members.manage");
  requirePermission(context, "agents.manage");
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_ACCESS_CHANGE" }, { status: 400 });
  const { tenantId, userId, agentId, action } = parsed.data;
  const admin = createAdminClient();
  const [{ data: membership }, { data: agent }, { data: tenantAssignment }, { data: activeGrant }] = await Promise.all([
    admin.from("tenant_memberships").select("id").eq("tenant_id", tenantId).eq("user_id", userId).eq("status", "active").maybeSingle(),
    admin.from("retell_agents").select("id,status").eq("id", agentId).eq("status", "active").maybeSingle(),
    admin.from("agent_assignments").select("id,tenant_id").eq("agent_id", agentId).is("valid_to", null).maybeSingle(),
    admin.from("user_agent_access").select("id").eq("tenant_id", tenantId).eq("user_id", userId).eq("agent_id", agentId).is("revoked_at", null).maybeSingle()
  ]);
  if (!membership || !agent) return NextResponse.json({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });

  if (action === "grant") {
    if (tenantAssignment && tenantAssignment.tenant_id !== tenantId) return NextResponse.json({ error: "AGENT_ASSIGNED_TO_ANOTHER_TENANT" }, { status: 409 });
    if (!tenantAssignment) {
      const assignment = await admin.from("agent_assignments").insert({ tenant_id: tenantId, agent_id: agentId, assigned_by: context.userId, assignment_reason: "Assigned while granting read-only user access" });
      if (assignment.error) return NextResponse.json({ error: "TENANT_ASSIGNMENT_FAILED" }, { status: 503 });
    }
    if (!activeGrant) {
      const granted = await admin.from("user_agent_access").insert({ tenant_id: tenantId, user_id: userId, agent_id: agentId, granted_by: context.userId, reason: "Granted by Daiichi system owner" });
      if (granted.error) return NextResponse.json({ error: granted.error.code === "23505" ? "ACCESS_ALREADY_GRANTED" : "ACCESS_GRANT_FAILED" }, { status: granted.error.code === "23505" ? 409 : 503 });
    }
  } else if (activeGrant) {
    const revoked = await admin.from("user_agent_access").update({ revoked_at: new Date().toISOString() }).eq("id", activeGrant.id);
    if (revoked.error) return NextResponse.json({ error: "ACCESS_REVOKE_FAILED" }, { status: 503 });
  }

  await admin.from("audit_logs").insert({ tenant_id: tenantId, actor_user_id: context.userId, action: action === "grant" ? "user_agent_access.granted" : "user_agent_access.revoked", target_type: "retell_agent", target_id: agentId, safe_metadata: { userId } });
  return NextResponse.json({ ok: true, action });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizationContext, requirePermission } from "@/lib/auth/context";
import { listRetellAgents } from "@/lib/retell/client";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get("tenantSlug")?.trim() || undefined;
  const kind = request.nextUrl.searchParams.get("kind") === "chat" ? "chat" : "voice";
  const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const context = await requireAuthorizationContext(tenantSlug);
  requirePermission(context, "agents.read");

  try {
    const live = await listRetellAgents();
    let allowedProviderIds: Set<string> | null = null;

    if (context.tenantId) {
      const admin = createAdminClient();
      const { data: assignments, error: assignmentError } = await admin
        .from("agent_assignments")
        .select("agent_id,retell_agents(provider_agent_id)")
        .eq("tenant_id", context.tenantId)
        .is("valid_to", null);
      if (assignmentError) throw new Error(`AGENT_ASSIGNMENTS_${assignmentError.code}`);

      const assignedIds = new Set((assignments ?? []).map((assignment) => assignment.agent_id));
      let allowedAgentIds = assignedIds;
      if (!context.platformRoles.length) {
        const { data: grants, error: grantError } = await admin
          .from("user_agent_access")
          .select("agent_id")
          .eq("tenant_id", context.tenantId)
          .eq("user_id", context.userId)
          .is("revoked_at", null);
        if (grantError) throw new Error(`AGENT_ACCESS_${grantError.code}`);
        allowedAgentIds = new Set((grants ?? []).map((grant) => grant.agent_id).filter((id) => assignedIds.has(id)));
      }

      allowedProviderIds = new Set((assignments ?? []).flatMap((assignment) => {
        if (!allowedAgentIds.has(assignment.agent_id)) return [];
        const relation = Array.isArray(assignment.retell_agents) ? assignment.retell_agents[0] : assignment.retell_agents;
        return relation?.provider_agent_id ? [relation.provider_agent_id] : [];
      }));
    }

    const agents = live[kind]
      .filter((agent) => !allowedProviderIds || allowedProviderIds.has(agent.providerAgentId))
      .filter((agent) => !query || `${agent.displayName} ${agent.providerAgentId}`.toLowerCase().includes(query))
      .slice(0, 100);

    return NextResponse.json({ agents, synchronizedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("Live Retell agent search failed", { requestId, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "RETELL_AGENT_SEARCH_FAILED", requestId }, { status: 503 });
  }
}

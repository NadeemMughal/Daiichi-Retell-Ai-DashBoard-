export type AgentOwnershipGrant = { userId: string };
export type AgentOwnershipRecord = { tenantId: string | null; grants: AgentOwnershipGrant[] };
export type AssignmentFilter = "all" | "assigned" | "unassigned";

export function matchesAgentOwnershipFilters(agent: AgentOwnershipRecord, workspaceId: string, assignmentFilter: AssignmentFilter) {
  const matchesWorkspace = workspaceId === "all" || agent.tenantId === workspaceId;
  const hasUserAssignment = new Set(agent.grants.map((grant) => grant.userId)).size > 0;
  const matchesAssignment = assignmentFilter === "all" || (assignmentFilter === "assigned" ? hasUserAssignment : !hasUserAssignment);
  return matchesWorkspace && matchesAssignment;
}

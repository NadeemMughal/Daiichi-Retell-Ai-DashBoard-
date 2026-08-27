export const permissions = [
  "platform.manage",
  "tenants.read",
  "tenants.manage",
  "members.read",
  "members.manage",
  "agents.read",
  "agents.manage",
  "calls.read",
  "chats.read",
  "transcripts.read",
  "recordings.play",
  "recordings.download",
  "contacts.view_unmasked",
  "analytics.read",
  "reports.export",
  "billing.read",
  "billing.manage",
  "retell_connections.manage",
  "reconciliation.manage",
  "audit.read"
] as const;

export type Permission = (typeof permissions)[number];
export type PlatformRole = "super_admin" | "operations_admin" | "agent_engineer" | "quality_analyst" | "support" | "billing_admin" | "auditor";
export type TenantRole = "owner" | "admin" | "manager" | "analyst" | "billing" | "viewer";

const platformRolePermissions: Record<PlatformRole, readonly Permission[]> = {
  super_admin: permissions,
  operations_admin: ["tenants.read", "tenants.manage", "members.read", "members.manage", "agents.read", "agents.manage", "calls.read", "chats.read", "transcripts.read", "recordings.play", "analytics.read", "reports.export", "retell_connections.manage", "reconciliation.manage", "audit.read"],
  agent_engineer: ["tenants.read", "agents.read", "agents.manage", "calls.read", "chats.read", "transcripts.read", "recordings.play", "analytics.read"],
  quality_analyst: ["tenants.read", "agents.read", "calls.read", "chats.read", "transcripts.read", "recordings.play", "analytics.read", "reports.export"],
  support: ["tenants.read", "members.read", "agents.read", "calls.read", "chats.read", "analytics.read"],
  billing_admin: ["tenants.read", "billing.read", "billing.manage", "analytics.read", "audit.read"],
  auditor: ["tenants.read", "agents.read", "analytics.read", "billing.read", "audit.read"]
};

const tenantRolePermissions: Record<TenantRole, readonly Permission[]> = {
  owner: ["tenants.read", "agents.read", "calls.read", "chats.read", "transcripts.read", "recordings.play", "analytics.read", "billing.read"],
  admin: ["tenants.read", "agents.read", "calls.read", "chats.read", "transcripts.read", "recordings.play", "analytics.read", "billing.read"],
  manager: ["tenants.read", "agents.read", "calls.read", "chats.read", "transcripts.read", "recordings.play", "analytics.read"],
  analyst: ["tenants.read", "agents.read", "calls.read", "chats.read", "analytics.read"],
  billing: ["tenants.read", "billing.read"],
  viewer: ["tenants.read", "agents.read", "analytics.read"]
};

export function permissionsForPlatformRole(role: PlatformRole) {
  return platformRolePermissions[role];
}

export function permissionsForTenantRole(role: TenantRole) {
  return tenantRolePermissions[role];
}

export function applicablePlatformRoles(
  assignments: ReadonlyArray<{ role: string; scope_tenant_id: string | null }>,
  tenantId?: string
) {
  return assignments
    .filter((assignment) => tenantId === undefined ? assignment.scope_tenant_id === null : assignment.scope_tenant_id === null || assignment.scope_tenant_id === tenantId)
    .map((assignment) => assignment.role as PlatformRole);
}

export const permissions = [
  "super_admin.manage", "platform.manage", "tenants.read", "tenants.manage", "members.read", "members.manage",
  "agents.read", "agents.manage", "calls.read", "calls.initiate", "chats.read", "chats.respond",
  "transcripts.read", "recordings.play", "recordings.download", "contacts.view_unmasked",
  "analytics.read", "reports.export", "billing.read", "billing.manage",
  "retell_connections.manage", "reconciliation.manage", "audit.read"
] as const;

export type Permission = (typeof permissions)[number];
export type PlatformRole = "super_admin" | "operations_admin" | "agent_engineer" | "quality_analyst" | "support" | "billing_admin" | "auditor";
export type TenantRole = "owner" | "admin" | "manager" | "analyst" | "billing" | "viewer";
export type EffectiveRole = "super_admin" | "admin" | "client";

const everyPermission: readonly Permission[] = permissions;
const adminPermissions: readonly Permission[] = permissions.filter((permission) => permission !== "super_admin.manage");
const clientPermissions: readonly Permission[] = [
  "tenants.read", "members.read", "agents.read", "calls.read", "calls.initiate",
  "chats.read", "chats.respond", "analytics.read", "reports.export"
];
const clientOverrideablePermissions = new Set<Permission>([...clientPermissions, "transcripts.read", "recordings.play", "recordings.download", "contacts.view_unmasked"]);

export function effectiveRole(platformRoles: readonly PlatformRole[], tenantRole: TenantRole | null): EffectiveRole | null {
  if (platformRoles.includes("super_admin")) return "super_admin";
  if (platformRoles.length) return "admin";
  return tenantRole ? "client" : null;
}

export function permissionsForPlatformRole(role: PlatformRole) { return role === "super_admin" ? everyPermission : adminPermissions; }
export function permissionsForTenantRole(role: TenantRole) { void role; return clientPermissions; }

const dashboardViewPermissions = [
  ["Home", "analytics.read"], ["Agents", "agents.read"], ["Phone Numbers", "agents.read"],
  ["Call History", "calls.read"], ["Chat History", "chats.read"], ["Contacts", "calls.read"],
  ["Analytics", "analytics.read"], ["Team", "members.read"]
] as const satisfies ReadonlyArray<readonly [string, Permission]>;

export function dashboardViewsForPermissions(granted: ReadonlySet<Permission>) {
  return dashboardViewPermissions.filter(([, permission]) => granted.has(permission)).map(([view]) => view);
}

export function applyPermissionOverrides(base: Iterable<Permission>, overrides: ReadonlyArray<{ permission: string; allowed: boolean }>, ceiling: ReadonlySet<Permission> = clientOverrideablePermissions) {
  const result = new Set<Permission>(base);
  const known = new Set<string>(permissions);
  for (const override of overrides) {
    if (!known.has(override.permission) || !ceiling.has(override.permission as Permission)) continue;
    const permission = override.permission as Permission;
    if (override.allowed) result.add(permission); else result.delete(permission);
  }
  return result;
}

export function applyTenantDataFlags(base: Iterable<Permission>, flags: { transcriptAccessEnabled: boolean; recordingAccessEnabled: boolean; recordingDownloadEnabled: boolean; contactMaskingEnabled: boolean }) {
  const result = new Set(base);
  if (!flags.transcriptAccessEnabled) result.delete("transcripts.read");
  if (!flags.recordingAccessEnabled) { result.delete("recordings.play"); result.delete("recordings.download"); }
  if (!flags.recordingDownloadEnabled) result.delete("recordings.download");
  if (flags.contactMaskingEnabled) result.delete("contacts.view_unmasked");
  return result;
}

export function applicablePlatformRoles(assignments: ReadonlyArray<{ role: string; scope_tenant_id: string | null }>, tenantId?: string) {
  return assignments
    .filter((assignment) => tenantId === undefined ? assignment.scope_tenant_id === null : assignment.scope_tenant_id === null || assignment.scope_tenant_id === tenantId)
    .map((assignment) => assignment.role as PlatformRole);
}

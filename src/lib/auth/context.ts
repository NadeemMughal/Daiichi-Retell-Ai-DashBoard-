import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { applicablePlatformRoles, applyPermissionOverrides, applyTenantDataFlags, effectiveRole, permissionsForPlatformRole, permissionsForTenantRole, type EffectiveRole, type Permission, type PlatformRole, type TenantRole } from "./permissions";

export type AuthorizationContext = {
  userId: string;
  tenantId: string | null;
  platformRoles: PlatformRole[];
  tenantRole: TenantRole | null;
  effectiveRole: EffectiveRole | null;
  permissions: Set<Permission>;
};

export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

export async function requireAuthorizationContext(tenantSlug?: string): Promise<AuthorizationContext> {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "active") redirect("/login?reason=suspended");

  const { data: platformRows } = await admin.from("platform_role_assignments").select("role,scope_tenant_id").eq("user_id", user.id).is("revoked_at", null);
  let platformRoles: PlatformRole[] = [];
  let tenantId: string | null = null;
  let tenantRole: TenantRole | null = null;
  let membershipId: string | null = null;
  let tenantFlags = { transcriptAccessEnabled: false, recordingAccessEnabled: false, recordingDownloadEnabled: false, contactMaskingEnabled: true };

  if (tenantSlug) {
    const { data: tenant } = await admin.from("tenants").select("id,status,transcript_access_enabled,recording_access_enabled,recording_download_enabled,contact_masking_enabled").eq("slug", tenantSlug).maybeSingle();
    if (!tenant || tenant.status === "archived") notFound();
    tenantId = tenant.id;
    tenantFlags = { transcriptAccessEnabled: tenant.transcript_access_enabled, recordingAccessEnabled: tenant.recording_access_enabled, recordingDownloadEnabled: tenant.recording_download_enabled, contactMaskingEnabled: tenant.contact_masking_enabled };
    platformRoles = applicablePlatformRoles(platformRows ?? [], tenant.id);
    const { data: membership } = await admin.from("tenant_memberships").select("id,role,status").eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
    if (membership?.status === "active") { tenantRole = membership.role as TenantRole; membershipId = membership.id; }
    if (!tenantRole && !platformRoles.length) notFound();
  } else {
    platformRoles = applicablePlatformRoles(platformRows ?? []);
  }

  let granted = new Set<Permission>();
  for (const role of platformRoles) for (const permission of permissionsForPlatformRole(role)) granted.add(permission);
  if (tenantRole) for (const permission of permissionsForTenantRole(tenantRole)) granted.add(permission);
  if (membershipId && !platformRoles.length) {
    const { data: overrides } = await admin.from("membership_permission_overrides").select("permission,allowed").eq("membership_id", membershipId);
    granted = applyPermissionOverrides(granted, overrides ?? []);
  }
  if (tenantId && !platformRoles.length) granted = applyTenantDataFlags(granted, tenantFlags);
  return { userId: user.id, tenantId, platformRoles, tenantRole, effectiveRole: effectiveRole(platformRoles, tenantRole), permissions: granted };
}

export function requirePermission(context: AuthorizationContext, permission: Permission) {
  if (!context.permissions.has(permission)) notFound();
}

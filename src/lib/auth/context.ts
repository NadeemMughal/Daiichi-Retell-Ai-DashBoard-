import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { applicablePlatformRoles, permissionsForPlatformRole, permissionsForTenantRole, type Permission, type PlatformRole, type TenantRole } from "./permissions";

export type AuthorizationContext = {
  userId: string;
  tenantId: string | null;
  platformRoles: PlatformRole[];
  tenantRole: TenantRole | null;
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

  if (tenantSlug) {
    const { data: tenant } = await admin.from("tenants").select("id,status").eq("slug", tenantSlug).maybeSingle();
    if (!tenant || tenant.status === "archived") notFound();
    tenantId = tenant.id;
    platformRoles = applicablePlatformRoles(platformRows ?? [], tenant.id);
    const { data: membership } = await admin.from("tenant_memberships").select("role,status").eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
    if (membership?.status === "active") tenantRole = membership.role as TenantRole;
    if (!tenantRole && !platformRoles.length) notFound();
  } else {
    platformRoles = applicablePlatformRoles(platformRows ?? []);
  }

  const granted = new Set<Permission>();
  for (const role of platformRoles) for (const permission of permissionsForPlatformRole(role)) granted.add(permission);
  if (tenantRole) for (const permission of permissionsForTenantRole(tenantRole)) granted.add(permission);
  return { userId: user.id, tenantId, platformRoles, tenantRole, permissions: granted };
}

export function requirePermission(context: AuthorizationContext, permission: Permission) {
  if (!context.permissions.has(permission)) notFound();
}

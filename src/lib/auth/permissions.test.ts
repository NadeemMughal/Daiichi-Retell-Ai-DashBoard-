import { describe, expect, it } from "vitest";
import { applicablePlatformRoles, permissionsForPlatformRole, permissionsForTenantRole } from "./permissions";

describe("role permissions", () => {
  it("does not let a client owner administer Retell connections", () => {
    expect(permissionsForTenantRole("owner")).not.toContain("retell_connections.manage");
  });
  it("makes every client tenant role read-only", () => {
    for (const role of ["owner", "admin", "manager", "analyst", "billing", "viewer"] as const) {
      expect(permissionsForTenantRole(role).some((permission) => permission.endsWith(".manage"))).toBe(false);
      expect(permissionsForTenantRole(role)).not.toContain("reports.export");
    }
  });
  it("does not give billing users transcript access", () => {
    expect(permissionsForTenantRole("billing")).not.toContain("transcripts.read");
  });
  it("keeps support away from recordings by default", () => {
    expect(permissionsForPlatformRole("support")).not.toContain("recordings.play");
  });
  it("grants super admins the platform-management permission", () => {
    expect(permissionsForPlatformRole("super_admin")).toContain("platform.manage");
  });
  it("does not apply a tenant-scoped platform role globally or to another tenant", () => {
    const rows = [{ role: "support", scope_tenant_id: "tenant-a" }];
    expect(applicablePlatformRoles(rows)).toEqual([]);
    expect(applicablePlatformRoles(rows, "tenant-b")).toEqual([]);
    expect(applicablePlatformRoles(rows, "tenant-a")).toEqual(["support"]);
  });
});

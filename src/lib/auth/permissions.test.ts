import { describe, expect, it } from "vitest";
import { applicablePlatformRoles, applyPermissionOverrides, applyTenantDataFlags, dashboardViewsForPermissions, effectiveRole, permissions, permissionsForPlatformRole, permissionsForTenantRole, type Permission } from "./permissions";

const clientPages = ["Home", "Agents", "Phone Numbers", "Call History", "Chat History", "Contacts", "Analytics", "Team"];

describe("three-role authorization model", () => {
  it("gives Super Admin every system permission", () => {
    expect(effectiveRole(["super_admin"], null)).toBe("super_admin");
    expect(permissionsForPlatformRole("super_admin")).toEqual(permissions);
  });

  it("maps every active non-super platform role to full Admin access", () => {
    for (const role of ["operations_admin", "agent_engineer", "quality_analyst", "support", "billing_admin", "auditor"] as const) {
      expect(effectiveRole([role], null)).toBe("admin");
      expect(permissionsForPlatformRole(role)).toEqual(permissions);
    }
  });

  it("maps every legacy tenant role to the same read-only Client role", () => {
    for (const role of ["owner", "admin", "manager", "analyst", "billing", "viewer"] as const) {
      const granted = permissionsForTenantRole(role);
      expect(effectiveRole([], role)).toBe("client");
      expect(granted.some((permission) => permission.endsWith(".manage"))).toBe(false);
      expect(granted).toContain("members.read");
      expect(granted).toContain("reports.export");
      expect(granted).toContain("calls.initiate");
      expect(granted).toContain("chats.respond");
      expect(dashboardViewsForPermissions(new Set(granted))).toEqual(clientPages);
    }
  });

  it("applies explicit membership allow and deny overrides", () => {
    const base = permissionsForTenantRole("viewer");
    const result = applyPermissionOverrides(base, [
      { permission: "reports.export", allowed: false },
      { permission: "transcripts.read", allowed: true },
      { permission: "agents.manage", allowed: true },
      { permission: "not.a.permission", allowed: true }
    ]);
    expect(result.has("reports.export")).toBe(false);
    expect(result.has("transcripts.read")).toBe(true);
    expect(result.has("agents.manage")).toBe(false);
    expect(result.has("not.a.permission" as Permission)).toBe(false);
  });

  it("enforces tenant transcript, recording, download and masking flags", () => {
    const result = applyTenantDataFlags(permissions, { transcriptAccessEnabled: false, recordingAccessEnabled: true, recordingDownloadEnabled: false, contactMaskingEnabled: true });
    expect(result.has("transcripts.read")).toBe(false);
    expect(result.has("recordings.play")).toBe(true);
    expect(result.has("recordings.download")).toBe(false);
    expect(result.has("contacts.view_unmasked")).toBe(false);
  });

  it("does not apply tenant-scoped platform roles globally or to another tenant", () => {
    const rows = [{ role: "support", scope_tenant_id: "tenant-a" }];
    expect(applicablePlatformRoles(rows)).toEqual([]);
    expect(applicablePlatformRoles(rows, "tenant-b")).toEqual([]);
    expect(applicablePlatformRoles(rows, "tenant-a")).toEqual(["support"]);
  });
});

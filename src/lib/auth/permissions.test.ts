import { describe, expect, it } from "vitest";
import { permissionsForPlatformRole, permissionsForTenantRole } from "./permissions";

describe("role permissions", () => {
  it("does not let a client owner administer Retell connections", () => {
    expect(permissionsForTenantRole("owner")).not.toContain("retell_connections.manage");
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
});


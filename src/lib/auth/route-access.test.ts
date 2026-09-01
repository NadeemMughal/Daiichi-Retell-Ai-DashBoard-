import { describe, expect, it } from "vitest";
import { permissionsForPlatformRole, permissionsForTenantRole, type Permission } from "./permissions";

const protectedRoutes: ReadonlyArray<{ route: string; required: readonly Permission[]; clientAllowed: boolean }> = [
  { route: "/api/admin/agents/import", required: ["agents.manage", "retell_connections.manage"], clientAllowed: false },
  { route: "/api/admin/assignments", required: ["agents.manage"], clientAllowed: false },
  { route: "/api/admin/contacts", required: ["retell_connections.manage"], clientAllowed: false },
  { route: "/api/admin/invoices", required: ["billing.manage"], clientAllowed: false },
  { route: "/api/admin/platform-admins", required: ["platform.manage"], clientAllowed: false },
  { route: "/api/admin/user-agent-access", required: ["members.manage", "agents.manage"], clientAllowed: false },
  { route: "/api/admin/users", required: ["members.manage"], clientAllowed: false },
  { route: "/api/retell/agents", required: ["agents.read"], clientAllowed: true },
  { route: "/api/retell/health", required: ["retell_connections.manage"], clientAllowed: false }
];

describe("protected route access matrix", () => {
  it.each(["super_admin", "operations_admin"] as const)("allows %s to use every protected route", (role) => {
    const granted = new Set(permissionsForPlatformRole(role));
    for (const policy of protectedRoutes) {
      expect(policy.required.every((permission) => granted.has(permission)), policy.route).toBe(true);
    }
  });

  it.each(["owner", "admin", "manager", "analyst", "billing", "viewer"] as const)("maps legacy tenant role %s to the Client route boundary", (role) => {
    const granted = new Set(permissionsForTenantRole(role));
    for (const policy of protectedRoutes) {
      expect(policy.required.every((permission) => granted.has(permission)), policy.route).toBe(policy.clientAllowed);
    }
  });

  it("keeps secret-authenticated ingestion routes outside dashboard role grants", () => {
    const serviceRoutes = ["/api/webhooks/retell", "/api/cron/process-webhooks", "/api/admin/agents/import#scheduled"];
    expect(serviceRoutes).toHaveLength(3);
    expect(protectedRoutes.some(({ route }) => serviceRoutes.includes(route))).toBe(false);
  });
});

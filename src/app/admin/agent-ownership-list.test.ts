import { describe, expect, it } from "vitest";
import { matchesAgentOwnershipFilters } from "./agent-ownership-filter";

const workspaceA = "workspace-a";
const assigned = { id: "agent-1", name: "Assigned", kind: "voice", tenantId: workspaceA, tenantName: "Workspace A", grants: [{ userId: "user-1", name: "User", email: "user@example.com" }] };
const noUserGrant = { id: "agent-2", name: "No grant", kind: "voice", tenantId: workspaceA, tenantName: "Workspace A", grants: [] };
const otherWorkspace = { ...assigned, id: "agent-3", tenantId: "workspace-b", tenantName: "Workspace B" };

describe("agent ownership filters", () => {
  it("shows only agents with user grants when Assigned agents is selected", () => {
    expect([assigned, noUserGrant].filter((agent) => matchesAgentOwnershipFilters(agent, workspaceA, "assigned"))).toEqual([assigned]);
  });

  it("shows agents without user grants when Unassigned agents is selected", () => {
    expect([assigned, noUserGrant].filter((agent) => matchesAgentOwnershipFilters(agent, workspaceA, "unassigned"))).toEqual([noUserGrant]);
  });

  it("applies workspace and assignment status together", () => {
    expect([assigned, otherWorkspace].filter((agent) => matchesAgentOwnershipFilters(agent, workspaceA, "assigned"))).toEqual([assigned]);
  });

  it("uses real user grant records and ignores workspace ownership alone", () => {
    expect(matchesAgentOwnershipFilters(noUserGrant, workspaceA, "assigned")).toBe(false);
    expect(matchesAgentOwnershipFilters(noUserGrant, workspaceA, "unassigned")).toBe(true);
  });
});

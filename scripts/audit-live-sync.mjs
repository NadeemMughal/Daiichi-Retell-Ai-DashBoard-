import fs from "node:fs";
import Retell from "retell-sdk";
import { createClient } from "@supabase/supabase-js";

const configuration = {};
for (const filename of [".env", ".env.local"]) {
  if (!fs.existsSync(filename)) continue;
  for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) configuration[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const required = ["RETELL_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
if (required.some((name) => !configuration[name])) throw new Error("Missing live audit configuration.");

const retell = new Retell({ apiKey: configuration.RETELL_API_KEY, timeout: 20_000, maxRetries: 2 });
const supabase = createClient(configuration.NEXT_PUBLIC_SUPABASE_URL, configuration.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const [provider, providerContacts, tenantsResult, connectionsResult, agentsResult, assignmentsResult, grantsResult, callsResult, chatsResult, contactsResult, signalsResult] = await Promise.all([
  retell.agent.list({ filter_criteria: { channel: { type: "string", op: "eq", value: "voice" } } }),
  retell.contact.list({ limit: 1000 }),
  supabase.from("tenants").select("id,slug,display_name,status").neq("status", "archived"),
  supabase.from("retell_connections").select("id,name,status,last_sync_at").eq("status", "active"),
  supabase.from("retell_agents").select("id,provider_agent_id,display_name,kind,status").eq("status", "active"),
  supabase.from("agent_assignments").select("agent_id,tenant_id").is("valid_to", null),
  supabase.from("user_agent_access").select("agent_id,user_id").is("revoked_at", null),
  supabase.from("calls").select("id,tenant_id,agent_id,provider_call_id", { count: "exact" }),
  supabase.from("chats").select("id,tenant_id,agent_id,provider_chat_id", { count: "exact" }),
  supabase.from("contacts").select("id,tenant_id,provider_contact_id", { count: "exact" }),
  supabase.from("dashboard_refresh_signals").select("tenant_id,resource,changed_at")
]);

for (const result of [tenantsResult, connectionsResult, agentsResult, assignmentsResult, grantsResult, callsResult, chatsResult]) if (result.error) throw result.error;
if (signalsResult.error && signalsResult.error.code !== "PGRST205") throw signalsResult.error;
if (contactsResult.error && contactsResult.error.code !== "PGRST205") throw contactsResult.error;
const providerAgents = [...new Map((provider.items ?? []).map((agent) => [agent.agent_id, { providerId: agent.agent_id, name: agent.agent_name, channel: agent.channel }])).values()];
const assignments = assignmentsResult.data ?? [];
const grants = grantsResult.data ?? [];
const dashboardAgents = (agentsResult.data ?? []).map((agent) => ({
  providerId: agent.provider_agent_id,
  name: agent.display_name,
  kind: agent.kind,
  tenantIds: assignments.filter((assignment) => assignment.agent_id === agent.id).map((assignment) => assignment.tenant_id),
  userGrantCount: new Set(grants.filter((grant) => grant.agent_id === agent.id).map((grant) => grant.user_id)).size
}));
const providerIds = new Set(providerAgents.map((agent) => agent.providerId));
const dashboardIds = new Set(dashboardAgents.map((agent) => agent.providerId));

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  tenants: tenantsResult.data,
  activeConnections: connectionsResult.data,
  providerAgents,
  dashboardAgents,
  missingFromDashboard: [...providerIds].filter((id) => !dashboardIds.has(id)),
  staleInDashboard: [...dashboardIds].filter((id) => !providerIds.has(id)),
  callCount: callsResult.count ?? callsResult.data?.length ?? 0,
  chatCount: chatsResult.count ?? chatsResult.data?.length ?? 0,
  retellContactCount: providerContacts.total ?? providerContacts.items?.length ?? 0,
  databaseContactCount: contactsResult.error?.code === "PGRST205" ? "MIGRATION_REQUIRED" : contactsResult.count ?? contactsResult.data?.length ?? 0,
  refreshSignals: signalsResult.error?.code === "PGRST205" ? "MIGRATION_REQUIRED" : signalsResult.data
}, null, 2));

import "server-only";
import Retell from "retell-sdk";
import { z } from "zod";

const envSchema = z.object({ RETELL_API_KEY: z.string().min(20) });

export function createRetellClient() {
  const { RETELL_API_KEY } = envSchema.parse({ RETELL_API_KEY: process.env.RETELL_API_KEY });
  return new Retell({ apiKey: RETELL_API_KEY, timeout: 15_000, maxRetries: 2, logLevel: "error" });
}

export async function listRetellAgents() {
  const client = createRetellClient();
  const channelFilter = (value: "voice" | "chat") => ({
    filter_criteria: { channel: { type: "string" as const, op: "eq" as const, value } }
  });
  const [voice, chat] = await Promise.all([
    client.agent.list(channelFilter("voice")),
    client.chatAgent.list(channelFilter("chat"))
  ]);
  const unique = <T extends { agent_id: string; agent_name: string; user_modified_timestamp: number }>(items: T[], fallback: string) => [...new Map(items.sort((a, b) => b.user_modified_timestamp - a.user_modified_timestamp).map((agent) => [agent.agent_id, { providerAgentId: agent.agent_id, displayName: agent.agent_name || fallback, modifiedAt: agent.user_modified_timestamp }])).values()];
  return {
    voice: unique(voice.items ?? [], "Unnamed voice agent"),
    chat: unique(chat.items ?? [], "Unnamed chat agent")
  };
}

export async function listRetellPhoneNumbers() {
  const response = await createRetellClient().phoneNumber.list({ limit: 1000 });
  return (response.items ?? []).map((number) => ({
    number: number.phone_number,
    prettyNumber: number.phone_number_pretty ?? number.phone_number,
    nickname: number.nickname ?? "Retell phone number",
    type: number.phone_number_type,
    inboundAgentIds: (number.inbound_agents ?? []).map((agent) => agent.agent_id),
    outboundAgentIds: (number.outbound_agents ?? []).map((agent) => agent.agent_id),
    modifiedAt: new Date(number.last_modification_timestamp).toISOString()
  }));
}

export async function listRetellContacts() {
  const response = await createRetellClient().contact.list({ limit: 1000, sort_order: "desc" });
  return response.items ?? [];
}

export async function listRetellHistory() {
  const client = createRetellClient();
  const [calls, chats] = await Promise.all([
    client.call.list({ limit: 1000, sort_order: "descending" }),
    client.chat.list({ limit: 1000, sort_order: "descending" })
  ]);
  return {
    calls: [...new Map((calls.items ?? []).map((call) => [call.call_id, call])).values()],
    chats: [...new Map((chats.items ?? []).map((chat) => [chat.chat_id, chat])).values()]
  };
}

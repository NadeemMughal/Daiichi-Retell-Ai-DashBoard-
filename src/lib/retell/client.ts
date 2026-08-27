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
  return {
    voice: (voice.items ?? []).map((agent) => ({ providerAgentId: agent.agent_id, displayName: agent.agent_name || "Unnamed voice agent", modifiedAt: agent.user_modified_timestamp })),
    chat: (chat.items ?? []).map((agent) => ({ providerAgentId: agent.agent_id, displayName: agent.agent_name || "Unnamed chat agent", modifiedAt: agent.user_modified_timestamp }))
  };
}

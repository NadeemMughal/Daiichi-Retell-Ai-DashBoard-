-- A Retell agent ID represents one agent channel. Prevent an outdated or
-- incorrectly filtered provider response from storing the same provider agent
-- twice as both voice and chat.

create unique index if not exists retell_agent_provider_identity_idx
  on public.retell_agents (connection_id, provider_agent_id);

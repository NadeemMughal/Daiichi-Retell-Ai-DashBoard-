-- Per-user visibility beneath the tenant boundary.
-- Tenant membership alone does not grant access to agent-derived data.

create table public.user_agent_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  agent_id uuid not null references public.retell_agents(id) on delete restrict,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text not null,
  check (revoked_at is null or revoked_at >= granted_at)
);

create unique index user_agent_one_active_grant_idx
  on public.user_agent_access (tenant_id, user_id, agent_id)
  where revoked_at is null;
create index user_agent_access_lookup_idx
  on public.user_agent_access (tenant_id, user_id, revoked_at);

alter table public.user_agent_access enable row level security;

create policy user_agent_access_own_read
on public.user_agent_access
for select to authenticated
using (
  (user_id = auth.uid() and public.is_tenant_member(tenant_id))
  or public.is_platform_staff(tenant_id)
);

revoke all on public.user_agent_access from anon;
revoke all on public.user_agent_access from authenticated;

-- Provider rows remain server-returned only. The policy is defense in depth;
-- authenticated browsers have no direct table grant and no write policy.

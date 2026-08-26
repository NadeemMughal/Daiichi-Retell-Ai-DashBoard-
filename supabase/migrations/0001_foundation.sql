-- Daiichi Retell AI Client Portal foundation
-- Supabase Auth identities live in auth.users; every exposed tenant table uses RLS.

create extension if not exists pgcrypto;

create type public.user_status as enum ('active', 'suspended', 'archived');
create type public.tenant_status as enum ('onboarding', 'active', 'suspended', 'archived');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');
create type public.platform_role as enum ('super_admin', 'operations_admin', 'agent_engineer', 'quality_analyst', 'support', 'billing_admin', 'auditor');
create type public.tenant_role as enum ('owner', 'admin', 'manager', 'analyst', 'billing', 'viewer');
create type public.agent_kind as enum ('voice', 'chat');
create type public.sync_status as enum ('pending', 'processing', 'processed', 'failed', 'dead_letter', 'quarantined');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  status public.user_status not null default 'active',
  mfa_required boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  legal_name text not null,
  display_name text not null,
  status public.tenant_status not null default 'onboarding',
  timezone text not null default 'UTC',
  transcript_access_enabled boolean not null default false,
  recording_access_enabled boolean not null default false,
  recording_download_enabled boolean not null default false,
  contact_masking_enabled boolean not null default true,
  retention_days integer check (retention_days between 1 and 730),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.platform_role not null,
  scope_tenant_id uuid references public.tenants(id) on delete cascade,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique nulls not distinct (user_id, role, scope_tenant_id)
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.tenant_role not null,
  status public.membership_status not null default 'invited',
  invited_by uuid references public.profiles(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.membership_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.tenant_memberships(id) on delete cascade,
  permission text not null,
  allowed boolean not null,
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (membership_id, permission)
);

create table public.retell_connections (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Daiichi shared Retell workspace',
  external_workspace_reference text,
  public_webhook_id uuid not null default gen_random_uuid() unique,
  history_secret_reference text not null,
  admin_secret_reference text,
  webhook_secret_reference text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  last_sync_at timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.retell_agents (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.retell_connections(id) on delete restrict,
  provider_agent_id text not null,
  kind public.agent_kind not null,
  display_name text not null,
  provider_version integer,
  status text not null default 'active',
  safe_metadata jsonb not null default '{}'::jsonb,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_agent_id, kind)
);

create table public.agent_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  agent_id uuid not null references public.retell_agents(id) on delete restrict,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  assigned_by uuid not null references public.profiles(id),
  assignment_reason text not null,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);

create unique index agent_one_active_tenant_idx on public.agent_assignments(agent_id) where valid_to is null;
create index agent_assignments_tenant_idx on public.agent_assignments(tenant_id, valid_from desc);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  connection_id uuid not null references public.retell_connections(id) on delete restrict,
  agent_id uuid not null references public.retell_agents(id) on delete restrict,
  provider_call_id text not null,
  status text not null,
  direction text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  disconnection_reason text,
  contact_masked text,
  summary text,
  sentiment text,
  outcome text,
  transcript_text text,
  recording_locator text,
  provider_cost_minor bigint,
  provider_cost_currency text,
  source_revision integer not null default 1,
  synchronized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_call_id)
);

create index calls_tenant_started_idx on public.calls(tenant_id, started_at desc);
create index calls_tenant_agent_started_idx on public.calls(tenant_id, agent_id, started_at desc);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  connection_id uuid not null references public.retell_connections(id) on delete restrict,
  agent_id uuid not null references public.retell_agents(id) on delete restrict,
  provider_chat_id text not null,
  status text not null,
  started_at timestamptz,
  ended_at timestamptz,
  ai_message_count integer not null default 0 check (ai_message_count >= 0),
  summary text,
  sentiment text,
  outcome text,
  transcript_text text,
  provider_cost_minor bigint,
  provider_cost_currency text,
  source_revision integer not null default 1,
  synchronized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_chat_id)
);

create index chats_tenant_started_idx on public.chats(tenant_id, started_at desc);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.retell_connections(id) on delete restrict,
  provider text not null check (provider in ('retell', 'stripe')),
  deduplication_key text not null,
  event_type text not null,
  provider_object_id text,
  signature_verified_at timestamptz not null,
  payload_sha256 text not null,
  payload_encrypted text,
  status public.sync_status not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, connection_id, deduplication_key)
);

create index webhook_processing_idx on public.webhook_events(status, next_attempt_at, received_at);

create table public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.retell_connections(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status public.sync_status not null default 'processing',
  window_start timestamptz not null,
  window_end timestamptz not null,
  calls_seen integer not null default 0,
  chats_seen integer not null default 0,
  differences_found integer not null default 0,
  error_code text
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  request_id text,
  ip_hash text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_tenant_created_idx on public.audit_logs(tenant_id, created_at desc);

create table public.data_access_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  resource_type text not null check (resource_type in ('transcript', 'recording', 'export')),
  resource_id uuid not null,
  action text not null,
  request_id text,
  created_at timestamptz not null default now()
);

create table public.manual_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  invoice_number text not null unique,
  period_start date not null,
  period_end date not null,
  call_count integer not null default 0 check (call_count >= 0),
  voice_seconds bigint not null default 0 check (voice_seconds >= 0),
  chat_ai_messages integer not null default 0 check (chat_ai_messages >= 0),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (char_length(currency) = 3),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  external_reference text,
  notes text,
  issued_at timestamptz,
  paid_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index manual_invoices_tenant_period_idx on public.manual_invoices(tenant_id, period_start desc);

-- Authorization helpers are security definer functions with a fixed search path.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;

create or replace function public.is_tenant_member(requested_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.tenant_memberships m
    where m.user_id = auth.uid() and m.tenant_id = requested_tenant and m.status = 'active'
  );
$$;

create or replace function public.is_platform_staff(requested_tenant uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.platform_role_assignments p
    where p.user_id = auth.uid() and p.revoked_at is null
      and (p.scope_tenant_id is null or p.scope_tenant_id = requested_tenant)
  );
$$;

grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_platform_staff(uuid) to authenticated;

-- RLS: customer-visible tables permit tenant reads; provider/admin tables remain server-only.
alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.platform_role_assignments enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.membership_permission_overrides enable row level security;
alter table public.retell_connections enable row level security;
alter table public.retell_agents enable row level security;
alter table public.agent_assignments enable row level security;
alter table public.calls enable row level security;
alter table public.chats enable row level security;
alter table public.webhook_events enable row level security;
alter table public.reconciliation_runs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.data_access_logs enable row level security;
alter table public.manual_invoices enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid() and public.is_active_user());
create policy tenants_member_read on public.tenants for select to authenticated using (public.is_tenant_member(id) or public.is_platform_staff(id));
create policy memberships_member_read on public.tenant_memberships for select to authenticated using (public.is_tenant_member(tenant_id) or public.is_platform_staff(tenant_id));
create policy agents_assigned_read on public.retell_agents for select to authenticated using (
  exists (select 1 from public.agent_assignments a where a.agent_id = id and a.valid_to is null and (public.is_tenant_member(a.tenant_id) or public.is_platform_staff(a.tenant_id)))
);
create policy assignments_tenant_read on public.agent_assignments for select to authenticated using (public.is_tenant_member(tenant_id) or public.is_platform_staff(tenant_id));
create policy calls_tenant_read on public.calls for select to authenticated using (public.is_tenant_member(tenant_id) or public.is_platform_staff(tenant_id));
create policy chats_tenant_read on public.chats for select to authenticated using (public.is_tenant_member(tenant_id) or public.is_platform_staff(tenant_id));
create policy invoices_tenant_read on public.manual_invoices for select to authenticated using (public.is_tenant_member(tenant_id) or public.is_platform_staff(tenant_id));
create policy audit_platform_read on public.audit_logs for select to authenticated using (public.is_platform_staff(tenant_id));
create policy data_access_own_read on public.data_access_logs for select to authenticated using (actor_user_id = auth.uid() or public.is_platform_staff(tenant_id));

-- Explicit authenticated grants. No browser writes to synchronized or financial tables.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
-- Only identity discovery is directly readable through the Supabase Data API.
-- Provider IDs, transcripts, recordings, invoices and audit data are returned only
-- through server routes that apply fine-grained application permissions.
grant select on public.profiles, public.tenants, public.tenant_memberships to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.retell_connections(id) on delete cascade,
  provider_contact_id text not null,
  phone_number text not null,
  first_name text,
  last_name text,
  do_not_call boolean not null default false,
  external_id text,
  conversation_count integer not null default 0 check (conversation_count >= 0),
  last_conversation_at timestamptz,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  custom_fields jsonb not null default '{}'::jsonb,
  synchronized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_contact_id)
);

create index if not exists contacts_tenant_latest_idx on public.contacts (tenant_id, last_conversation_at desc nulls last);
create index if not exists contacts_tenant_phone_idx on public.contacts (tenant_id, phone_number);

alter table public.contacts enable row level security;
comment on table public.contacts is 'Server-managed mirror of Retell contacts. Direct browser access is denied by RLS.';

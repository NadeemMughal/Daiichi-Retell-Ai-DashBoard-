-- Safe tenant-scoped change notifications. Raw Retell rows remain server-only.
create table public.dashboard_refresh_signals (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource text not null check (resource in ('calls', 'chats')),
  changed_at timestamptz not null default now(),
  primary key (tenant_id, resource)
);

alter table public.dashboard_refresh_signals enable row level security;
create policy dashboard_refresh_signal_read on public.dashboard_refresh_signals
for select to authenticated
using (public.is_tenant_member(tenant_id) or public.is_platform_staff(tenant_id));
grant select on public.dashboard_refresh_signals to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.dashboard_refresh_signals;
exception when duplicate_object then null;
end
$$;

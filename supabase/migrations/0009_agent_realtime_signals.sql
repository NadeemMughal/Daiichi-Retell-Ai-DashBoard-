-- Notify open dashboards when scheduled Retell reconciliation discovers agent changes.
alter table public.dashboard_refresh_signals
  drop constraint if exists dashboard_refresh_signals_resource_check;

alter table public.dashboard_refresh_signals
  add constraint dashboard_refresh_signals_resource_check
  check (resource in ('calls', 'chats', 'agents'));

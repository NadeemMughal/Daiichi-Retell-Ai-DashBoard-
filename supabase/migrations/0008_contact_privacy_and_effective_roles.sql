-- Supports the three effective application roles while preserving legacy enum
-- values for backward-compatible deployments. Sensitive contact data remains
-- server-only and is returned only after permission and tenant-flag checks.
alter table public.calls add column if not exists contact_unmasked text;
revoke all on public.calls from anon, authenticated;

comment on column public.calls.contact_unmasked is
  'Sensitive caller identifier. Server loaders must require contacts.view_unmasked.';

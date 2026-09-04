-- Every export column below was rendered as a literal em dash because the
-- reconciliation never stored the value, even though Retell returns all of
-- them on the call and chat payloads. The columns are additive so an
-- unapplied migration only costs those columns, never an ingestion run.

alter table public.calls add column if not exists call_type text;
alter table public.calls add column if not exists from_number text;
alter table public.calls add column if not exists to_number text;
alter table public.calls add column if not exists latency_ms integer check (latency_ms is null or latency_ms >= 0);
alter table public.calls add column if not exists agent_version integer;
alter table public.calls add column if not exists custom_analysis jsonb;

alter table public.chats add column if not exists agent_version integer;
alter table public.chats add column if not exists custom_analysis jsonb;

-- calls.direction carried the channel for web calls, so "Channel Type" and
-- "Direction" exported the same value and neither was the caller direction.
-- Split the two and leave direction null where the channel never had one.
update public.calls set call_type = 'web_call' where call_type is null and direction = 'web_call';
update public.calls set call_type = 'phone_call' where call_type is null and direction in ('inbound', 'outbound');
update public.calls set direction = null where direction = 'web_call';

-- from_number and to_number are caller identifiers with the same sensitivity as
-- contact_unmasked: reachable only through the service role, and returned to a
-- tenant only after the contacts.view_unmasked check.
revoke all on public.calls from anon, authenticated;

comment on column public.calls.call_type is 'Retell channel: web_call or phone_call. Distinct from direction.';
comment on column public.calls.direction is 'Caller direction for phone calls: inbound or outbound. Null for web calls.';
comment on column public.calls.from_number is 'Sensitive caller identifier. Server loaders must require contacts.view_unmasked.';
comment on column public.calls.to_number is 'Sensitive caller identifier. Server loaders must require contacts.view_unmasked.';
comment on column public.calls.latency_ms is 'Median end-to-end response latency reported by Retell, in milliseconds.';
comment on column public.calls.custom_analysis is 'Retell post-call custom analysis fields, stored verbatim for reporting.';

notify pgrst, 'reload schema';

-- Realtime access changes. RLS limits client subscriptions to their own rows.
grant select on public.user_agent_access to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.user_agent_access;
exception
  when duplicate_object then null;
end
$$;

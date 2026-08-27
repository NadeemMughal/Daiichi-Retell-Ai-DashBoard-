-- Immediately refresh owner and client sessions when workspace membership changes.
do $$
begin
  alter publication supabase_realtime add table public.tenant_memberships;
exception
  when duplicate_object then null;
end
$$;

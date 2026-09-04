-- Scheduled Retell reconciliation.
--
-- Discovers agents created or deleted in the Daiichi Technologies Retell
-- workspace, assigns every new agent to the client workspace, retires deleted
-- ones, and refreshes call, chat and contact history.
--
-- Vercel Hobby only supports daily cron, so Supabase Cron owns this schedule the
-- same way it owns setup_process_webhooks.sql. Run this once in the Supabase SQL
-- Editor after the production URL exists. Both scripts share the same two vault
-- secrets; running either one keeps them in step.
--
-- Replace both placeholder values below. Do not commit the real URL or secret.
-- Keep daiichi_cron_secret identical to the CRON_SECRET environment variable.

do $$
declare
  app_url text := 'https://YOUR-PRODUCTION-DOMAIN.vercel.app';
  cron_secret text := 'REPLACE_WITH_YOUR_CRON_SECRET';
  secret_id uuid;
begin
  if app_url like 'https://YOUR-%' or cron_secret = 'REPLACE_WITH_YOUR_CRON_SECRET' then
    raise exception 'Replace app_url and cron_secret before running this script.';
  end if;
  if app_url like '%/' then
    raise exception 'Remove the trailing slash from app_url.';
  end if;

  select id into secret_id from vault.secrets where name = 'daiichi_app_url';
  if secret_id is null then
    perform vault.create_secret(app_url, 'daiichi_app_url', 'Production URL used by the Daiichi scheduled jobs');
  else
    perform vault.update_secret(secret_id, app_url);
  end if;

  select id into secret_id from vault.secrets where name = 'daiichi_cron_secret';
  if secret_id is null then
    perform vault.create_secret(cron_secret, 'daiichi_cron_secret', 'Bearer token used by the Daiichi scheduled jobs');
  else
    perform vault.update_secret(secret_id, cron_secret);
  end if;
end
$$;

-- Make the script safe to rerun when replacing the schedule.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daiichi-sync-retell-agents') then
    perform cron.unschedule('daiichi-sync-retell-agents');
  end if;
end
$$;

-- Every five minutes. A run reads up to 3000 provider records, so tighten this
-- only if the Retell rate limit and the 60 second route budget allow it.
select cron.schedule(
  'daiichi-sync-retell-agents',
  '*/5 * * * *',
  $job$
    select net.http_get(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'daiichi_app_url'
        limit 1
      ) || '/api/admin/agents/import',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'daiichi_cron_secret'
          limit 1
        ),
        'User-Agent',
        'Supabase-Cron/1.0'
      ),
      timeout_milliseconds := 55000
    );
  $job$
);

-- Verification queries:
--
-- 1. The job is registered and active:
-- select jobid, jobname, schedule, active from cron.job where jobname = 'daiichi-sync-retell-agents';
--
-- 2. Recent invocations succeeded:
-- select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'daiichi-sync-retell-agents')
--   order by start_time desc limit 10;
--
-- 3. The route answered 200 and every agent is assigned. unassignedAgentCount
--    must be 0; anything higher means agents are importing without a workspace:
-- select status_code, content::jsonb ->> 'unassignedAgentCount' as unassigned, created
--   from net._http_response order by created desc limit 10;
--
-- 4. The connection clock is advancing:
-- select name, status, last_sync_at from public.retell_connections where status = 'active';

-- NOTE: vercel.json also declares this job. Install this script only if the
-- deployment is not on Vercel, or remove the crons from vercel.json first.

-- Run this once in the Supabase SQL Editor AFTER the production Vercel URL is
-- available. Replace both placeholder values before running it.
--
-- Keep the CRON_SECRET identical to the CRON_SECRET environment variable in
-- Vercel. Do not commit the real URL or secret to this file.

select vault.create_secret(
  'https://YOUR-PRODUCTION-DOMAIN.vercel.app',
  'daiichi_app_url',
  'Production URL used by the webhook processing cron'
);

select vault.create_secret(
  'REPLACE_WITH_YOUR_CRON_SECRET',
  'daiichi_cron_secret',
  'Bearer token used by the webhook processing cron'
);

-- Make the script safe to rerun when replacing the schedule.
do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'daiichi-process-webhooks'
  ) then
    perform cron.unschedule('daiichi-process-webhooks');
  end if;
end
$$;

select cron.schedule(
  'daiichi-process-webhooks',
  '*/5 * * * *',
  $job$
    select net.http_get(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'daiichi_app_url'
        limit 1
      ) || '/api/cron/process-webhooks',
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
      timeout_milliseconds := 50000
    );
  $job$
);

-- Verification queries:
-- select jobid, jobname, schedule, active from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 20;

-- Supabase Cron runs the webhook worker because Vercel Hobby only supports
-- daily cron jobs. These extensions are available on hosted Supabase projects.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

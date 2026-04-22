-- 003_schedule_reminders.sql
-- Schedules the webinar reminder endpoint to run every hour via pg_cron + pg_net.
--
-- Prerequisites (enable via Supabase Dashboard → Database → Extensions):
--   - pg_cron
--   - pg_net
--
-- Verify extensions are enabled before running:
--   SELECT extname FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');
--
-- Run this file in the Supabase SQL Editor after enabling the extensions above.

SELECT cron.schedule(
  'webinar-send-reminders',
  '0 * * * *',  -- top of every hour
  $$
  SELECT net.http_post(
    url     := 'https://ljsvkaidlzflewnimupz.supabase.co/functions/v1/webinar-api/internal/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

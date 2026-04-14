-- ============================================================
-- Enable RLS on ALL public tables (project iobxudcyihqfdwiggohz)
-- Fixes Supabase Security Advisor: "RLS Disabled in Public"
-- ============================================================
-- Pattern:
--   SELECT → allowed for anon + authenticated (dashboard reads)
--   INSERT/UPDATE/DELETE → service_role only (scripts write via service key)
-- ============================================================

-- 1. calendar_events
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_events_select" ON public.calendar_events FOR SELECT USING (true);
CREATE POLICY "calendar_events_insert" ON public.calendar_events FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "calendar_events_update" ON public.calendar_events FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "calendar_events_delete" ON public.calendar_events FOR DELETE USING (auth.role() = 'service_role');

-- 2. monitor_alerts
ALTER TABLE public.monitor_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitor_alerts_select" ON public.monitor_alerts FOR SELECT USING (true);
CREATE POLICY "monitor_alerts_insert" ON public.monitor_alerts FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "monitor_alerts_update" ON public.monitor_alerts FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "monitor_alerts_delete" ON public.monitor_alerts FOR DELETE USING (auth.role() = 'service_role');

-- 3. monitor_daily_metrics
ALTER TABLE public.monitor_daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitor_daily_metrics_select" ON public.monitor_daily_metrics FOR SELECT USING (true);
CREATE POLICY "monitor_daily_metrics_insert" ON public.monitor_daily_metrics FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "monitor_daily_metrics_update" ON public.monitor_daily_metrics FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "monitor_daily_metrics_delete" ON public.monitor_daily_metrics FOR DELETE USING (auth.role() = 'service_role');

-- 4. monitor_lost_alerts
ALTER TABLE public.monitor_lost_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitor_lost_alerts_select" ON public.monitor_lost_alerts FOR SELECT USING (true);
CREATE POLICY "monitor_lost_alerts_insert" ON public.monitor_lost_alerts FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "monitor_lost_alerts_update" ON public.monitor_lost_alerts FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "monitor_lost_alerts_delete" ON public.monitor_lost_alerts FOR DELETE USING (auth.role() = 'service_role');

-- 5. monitor_lost_daily_summary
ALTER TABLE public.monitor_lost_daily_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitor_lost_daily_summary_select" ON public.monitor_lost_daily_summary FOR SELECT USING (true);
CREATE POLICY "monitor_lost_daily_summary_insert" ON public.monitor_lost_daily_summary FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "monitor_lost_daily_summary_update" ON public.monitor_lost_daily_summary FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "monitor_lost_daily_summary_delete" ON public.monitor_lost_daily_summary FOR DELETE USING (auth.role() = 'service_role');

-- 6. monitor_lost_deals
ALTER TABLE public.monitor_lost_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitor_lost_deals_select" ON public.monitor_lost_deals FOR SELECT USING (true);
CREATE POLICY "monitor_lost_deals_insert" ON public.monitor_lost_deals FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "monitor_lost_deals_update" ON public.monitor_lost_deals FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "monitor_lost_deals_delete" ON public.monitor_lost_deals FOR DELETE USING (auth.role() = 'service_role');

-- 7. monitor_team_baselines
ALTER TABLE public.monitor_team_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitor_team_baselines_select" ON public.monitor_team_baselines FOR SELECT USING (true);
CREATE POLICY "monitor_team_baselines_insert" ON public.monitor_team_baselines FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "monitor_team_baselines_update" ON public.monitor_team_baselines FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "monitor_team_baselines_delete" ON public.monitor_team_baselines FOR DELETE USING (auth.role() = 'service_role');

-- 8. monitor_weekly_summary
ALTER TABLE public.monitor_weekly_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitor_weekly_summary_select" ON public.monitor_weekly_summary FOR SELECT USING (true);
CREATE POLICY "monitor_weekly_summary_insert" ON public.monitor_weekly_summary FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "monitor_weekly_summary_update" ON public.monitor_weekly_summary FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "monitor_weekly_summary_delete" ON public.monitor_weekly_summary FOR DELETE USING (auth.role() = 'service_role');

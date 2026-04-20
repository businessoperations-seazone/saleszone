-- 003_add_fup_sent_at.sql
-- Coluna para dedup do FUP automático pós-webinar.
-- Setada apenas quando o envio via Timelines.ai retorna sucesso.

ALTER TABLE webinar_registrations
  ADD COLUMN IF NOT EXISTS fup_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webinar_registrations_fup_pending
  ON webinar_registrations (is_opportunity, fup_sent_at)
  WHERE is_opportunity = true AND fup_sent_at IS NULL;

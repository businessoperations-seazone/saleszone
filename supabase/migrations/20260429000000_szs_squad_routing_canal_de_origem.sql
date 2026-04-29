-- SZS squad routing: add canal_de_origem to deals + is_paid to daily_counts
--
-- Contexto:
-- Novas regras de roteamento de squads SZS dependem de 2 dados que hoje
-- não chegam ao banco:
--   1. canal_de_origem (campo built-in `channel` do Pipedrive) — usado pra
--      classificar Squad 1 (Marketing MP) quando canal != Marketing mas
--      a origem do lead é Marketing.
--   2. is_paid — derivado de rd_source ILIKE '%Pag%'. Hoje a ETL
--      sync-szs-dashboard agrega counts por canal_group sem segregar
--      pago vs orgânico, fazendo Marketing Orgânico cair no mesmo squad
--      do Marketing Pago.
--
-- Esta migration só altera schema. ETL (sync-szs-deals e
-- sync-szs-dashboard) precisa ser redeployada e re-rodada pra popular.
-- Backfill: NULL para canal_de_origem, FALSE para is_paid (default).

-- ── szs_deals: armazena option ID do Pipedrive como TEXT (mesmo padrão do canal)
ALTER TABLE public.szs_deals
  ADD COLUMN IF NOT EXISTS canal_de_origem TEXT NULL;

COMMENT ON COLUMN public.szs_deals.canal_de_origem IS
  'Pipedrive built-in field `channel` (option ID as text). Marketing=3153, Indicação de Franquia=3144, Indicação de Corretor=3150, Indicação de outros Parceiros=3146, Expansão=3267, etc.';

-- ── szs_daily_counts: flag is_paid pra segregar Marketing Pago vs Orgânico
ALTER TABLE public.szs_daily_counts
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.szs_daily_counts.is_paid IS
  'TRUE quando rd_source ILIKE ''%Pag%''. Usado para classificar Squad 1 (Marketing pago) vs Squad 3 (Marketing orgânico).';

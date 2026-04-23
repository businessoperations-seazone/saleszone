ALTER TABLE squad_deals ADD COLUMN IF NOT EXISTS reserva_entered_at TIMESTAMPTZ;
ALTER TABLE squad_deals ADD COLUMN IF NOT EXISTS contrato_entered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_squad_deals_reserva_entered_at ON squad_deals (reserva_entered_at);
CREATE INDEX IF NOT EXISTS idx_squad_deals_contrato_entered_at ON squad_deals (contrato_entered_at);

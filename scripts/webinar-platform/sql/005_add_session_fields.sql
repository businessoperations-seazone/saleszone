-- Add cidade and tipo_imovel to webinar_slots (sessions inherit from slot)
ALTER TABLE webinar_slots ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE webinar_slots ADD COLUMN IF NOT EXISTS tipo_imovel text;

-- Add observacoes to webinar_registrations (closer notes per lead)
ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS observacoes text;

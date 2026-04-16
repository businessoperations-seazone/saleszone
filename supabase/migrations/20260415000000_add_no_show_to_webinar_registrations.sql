-- Add no_show_at column to webinar_registrations
ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS no_show_at timestamptz;

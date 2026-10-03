-- Per-notification anonymous aliases for the private activity surface.
-- The alias is random event metadata and is never derived from a HIDN handle.

ALTER TABLE hidn_notifications ADD COLUMN actor_alias TEXT;

CREATE INDEX IF NOT EXISTS idx_hidn_notifications_alias
  ON hidn_notifications (actor_alias);

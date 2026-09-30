-- Moderation decisions are append-only so hide/restore actions remain auditable.
-- The public demo can also use these events before room content is fully D1-backed.

CREATE TABLE IF NOT EXISTS hidn_moderation_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'reply')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve', 'hide', 'reject')),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidn_moderation_events_target_created
  ON hidn_moderation_events (target_type, target_id, created_at DESC);

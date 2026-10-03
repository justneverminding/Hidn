-- Private activity notifications.
-- Public room content remains anonymous; these relationships are only used
-- inside the authenticated recipient's private account surface.

ALTER TABLE hidn_reactions ADD COLUMN actor_user_id TEXT REFERENCES hidn_users (user_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_hidn_reactions_actor_target
  ON hidn_reactions (actor_user_id, target_type, target_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidn_reactions_actor_like
  ON hidn_reactions (actor_user_id, target_type, target_id, reaction_type)
  WHERE actor_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS hidn_notifications (
  notification_id TEXT PRIMARY KEY NOT NULL,
  recipient_user_id TEXT NOT NULL REFERENCES hidn_users (user_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('reaction', 'reply')),
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'reply')),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hidn_notifications_recipient_created
  ON hidn_notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hidn_notifications_recipient_unread
  ON hidn_notifications (recipient_user_id, read_at, created_at DESC);

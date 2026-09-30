-- Anonymous room content.
-- No names, usernames, profiles, wallet addresses, browser fingerprints, or
-- public sender identifiers are stored with ordinary room content.

CREATE TABLE IF NOT EXISTS hidn_threads (
  thread_id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES room_credentials (room_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'IDENTITY',
  moderation_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_state IN ('visible', 'pending', 'hidden', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  hidden_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hidn_threads_room_created
  ON hidn_threads (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hidn_threads_moderation
  ON hidn_threads (moderation_state, created_at DESC);

CREATE TABLE IF NOT EXISTS hidn_replies (
  reply_id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL REFERENCES hidn_threads (thread_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  moderation_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_state IN ('visible', 'pending', 'hidden', 'rejected')),
  created_at TEXT NOT NULL,
  hidden_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hidn_replies_thread_created
  ON hidn_replies (thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_hidn_replies_moderation
  ON hidn_replies (moderation_state, created_at DESC);

CREATE TABLE IF NOT EXISTS hidn_reactions (
  reaction_id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'reply')),
  target_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT 'like'
    CHECK (reaction_type IN ('like')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidn_reactions_target
  ON hidn_reactions (target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hidn_moderation_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'reply')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve', 'hide', 'reject')),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidn_moderation_events_target
  ON hidn_moderation_events (target_type, target_id, created_at DESC);

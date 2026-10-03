-- Application-level anonymous participation boundary.
--
-- These tables deliberately do not reference hidn_users. They support a
-- browser-held secret, a Poseidon membership commitment, scope nullifiers,
-- and capability-based anonymous notifications. Direct requests can still
-- expose network metadata to Cloudflare until a relay or Tor is added.

CREATE TABLE IF NOT EXISTS hidn_anonymous_members (
  commitment TEXT PRIMARY KEY NOT NULL,
  leaf_index INTEGER NOT NULL UNIQUE,
  display_alias TEXT NOT NULL,
  notification_capability_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidn_anonymous_members_leaf
  ON hidn_anonymous_members (leaf_index);

CREATE TABLE IF NOT EXISTS hidn_anonymous_roots (
  root TEXT PRIMARY KEY NOT NULL,
  leaf_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidn_anonymous_roots_created
  ON hidn_anonymous_roots (created_at DESC);

CREATE TABLE IF NOT EXISTS hidn_anonymous_actions (
  nullifier TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  binding TEXT NOT NULL UNIQUE,
  action_type TEXT NOT NULL CHECK (action_type IN ('post', 'reply', 'reaction')),
  target_type TEXT,
  target_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidn_anonymous_actions_scope
  ON hidn_anonymous_actions (scope, created_at DESC);

CREATE TABLE IF NOT EXISTS hidn_anonymous_notifications (
  notification_id TEXT PRIMARY KEY NOT NULL,
  recipient_capability_hash TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('reaction', 'reply')),
  actor_alias TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'reply')),
  target_id TEXT NOT NULL,
  thread_id TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hidn_anonymous_notifications_recipient_created
  ON hidn_anonymous_notifications (recipient_capability_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hidn_anonymous_notifications_recipient_unread
  ON hidn_anonymous_notifications (recipient_capability_hash, read_at, created_at DESC);

ALTER TABLE hidn_threads ADD COLUMN anonymous_root TEXT;
ALTER TABLE hidn_threads ADD COLUMN anonymous_nullifier TEXT;
ALTER TABLE hidn_threads ADD COLUMN anonymous_binding TEXT;
ALTER TABLE hidn_threads ADD COLUMN anonymous_alias TEXT;
ALTER TABLE hidn_threads ADD COLUMN anonymous_notification_capability_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidn_threads_anonymous_nullifier
  ON hidn_threads (anonymous_nullifier)
  WHERE anonymous_nullifier IS NOT NULL;

ALTER TABLE hidn_replies ADD COLUMN anonymous_root TEXT;
ALTER TABLE hidn_replies ADD COLUMN anonymous_nullifier TEXT;
ALTER TABLE hidn_replies ADD COLUMN anonymous_binding TEXT;
ALTER TABLE hidn_replies ADD COLUMN anonymous_alias TEXT;
ALTER TABLE hidn_replies ADD COLUMN anonymous_notification_capability_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidn_replies_anonymous_nullifier
  ON hidn_replies (anonymous_nullifier)
  WHERE anonymous_nullifier IS NOT NULL;

ALTER TABLE hidn_reactions ADD COLUMN anonymous_nullifier TEXT;
ALTER TABLE hidn_reactions ADD COLUMN anonymous_alias TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidn_reactions_anonymous_nullifier
  ON hidn_reactions (anonymous_nullifier)
  WHERE anonymous_nullifier IS NOT NULL;

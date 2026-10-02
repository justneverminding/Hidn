-- Public room activity feed.
-- Activity is intentionally detached from hidn_users: the public feed gets a
-- short-lived anonymous signal reference, never a username or user_id.

CREATE TABLE IF NOT EXISTS hidn_activity_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  signal_ref TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidn_activity_events_created
  ON hidn_activity_events (created_at DESC);

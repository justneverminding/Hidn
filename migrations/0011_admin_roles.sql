CREATE TABLE IF NOT EXISTS hidn_admin_users (
  admin_id TEXT PRIMARY KEY NOT NULL,
  access_subject_hash TEXT UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('super_admin', 'moderator', 'reviewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS hidn_admin_users_role_status_idx
  ON hidn_admin_users(role, status);

CREATE TABLE IF NOT EXISTS hidn_admin_audit_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS hidn_admin_audit_events_created_idx
  ON hidn_admin_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS hidn_admin_audit_events_admin_idx
  ON hidn_admin_audit_events(admin_id, created_at DESC);

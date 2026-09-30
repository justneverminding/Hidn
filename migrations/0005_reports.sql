-- User-submitted moderation reports.
-- Reports are tied to a pseudonymous account session, not a public identity.

CREATE TABLE IF NOT EXISTS hidn_reports (
  report_id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'reply', 'account')),
  target_id TEXT NOT NULL,
  target_excerpt TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL CHECK (reason IN (
    'spam',
    'harassment',
    'threats',
    'sexual_content',
    'personal_data',
    'self_harm',
    'other'
  )),
  details TEXT NOT NULL DEFAULT '',
  reporter_user_id TEXT NOT NULL REFERENCES hidn_users (user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_hidn_reports_status_created
  ON hidn_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hidn_reports_target
  ON hidn_reports (target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hidn_reports_reporter_created
  ON hidn_reports (reporter_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidn_reports_open_reporter_target
  ON hidn_reports (reporter_user_id, target_type, target_id)
  WHERE status = 'open';

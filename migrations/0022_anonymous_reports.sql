-- Reports now come from anonymous members instead of handle accounts.
-- A report carries the one-time nullifier from the reporter's membership
-- proof, so it can be checked and deduplicated without naming anyone.
-- SQLite cannot relax NOT NULL in place, so the table is rebuilt; existing
-- reports are kept as they are.

PRAGMA defer_foreign_keys = true;

CREATE TABLE hidn_reports_next (
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
  reporter_user_id TEXT,
  reporter_nullifier TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_note TEXT NOT NULL DEFAULT ''
);

INSERT INTO hidn_reports_next
  (report_id, target_type, target_id, target_excerpt, reason, details,
   reporter_user_id, status, created_at, reviewed_at, reviewer_note)
SELECT report_id, target_type, target_id, target_excerpt, reason, details,
       reporter_user_id, status, created_at, reviewed_at, reviewer_note
FROM hidn_reports;

DROP TABLE hidn_reports;
ALTER TABLE hidn_reports_next RENAME TO hidn_reports;

CREATE INDEX IF NOT EXISTS idx_hidn_reports_status_created
  ON hidn_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hidn_reports_target
  ON hidn_reports (target_type, target_id, created_at DESC);

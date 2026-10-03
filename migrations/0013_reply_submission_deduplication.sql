-- Prevent accidental duplicate replies from the same authenticated account.
-- The submission key is private implementation data and is never exposed on room surfaces.

ALTER TABLE hidn_replies ADD COLUMN submission_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidn_replies_author_submission
  ON hidn_replies (author_user_id, submission_id)
  WHERE author_user_id IS NOT NULL AND submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hidn_replies_thread_author_content
  ON hidn_replies (thread_id, author_user_id, content);

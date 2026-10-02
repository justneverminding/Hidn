-- Associate private-room replies with the authenticated account that created them.
-- This ownership is used only by the authenticated profile history endpoint;
-- replies remain anonymous to every public room surface.

ALTER TABLE hidn_replies ADD COLUMN author_user_id TEXT REFERENCES hidn_users (user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hidn_replies_author_created
  ON hidn_replies (author_user_id, created_at DESC);

-- Personal confession links.
--
-- A member shares /to/<slug>; anyone holding the link can leave an anonymous
-- message in that member's inbox. The owner is identified only by the hash of
-- an inbox key their browser derives from the recovery key, so the link is not
-- tied to the member's commitment, alias or any of their room content.
-- Senders are not stored in any form.

CREATE TABLE IF NOT EXISTS hidn_link_inboxes (
  link_id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_key_hash TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL DEFAULT '',
  tip_address TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hidn_link_messages (
  message_id TEXT PRIMARY KEY NOT NULL,
  link_id TEXT NOT NULL REFERENCES hidn_link_inboxes (link_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tip_code TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hidn_link_messages_link_created
  ON hidn_link_messages (link_id, created_at DESC);

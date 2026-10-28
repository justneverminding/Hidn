-- End-to-end encrypted notifications.
--
-- hidn_notification_keys: for each post's or reply's one-off notification key
--   (stored only as a hash), the public half of a key pair whose private half
--   stays in the author's browser. Registered by the browser, proving it holds
--   the notification key.
-- hidn_anonymous_notifications.sealed: the notification's details (like or
--   reply, which post) sealed to that public key. When set, the plain columns
--   hold fixed placeholders and say nothing about the event.
CREATE TABLE IF NOT EXISTS hidn_notification_keys (
  recipient_capability_hash TEXT PRIMARY KEY NOT NULL,
  public_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE hidn_anonymous_notifications ADD COLUMN sealed TEXT;

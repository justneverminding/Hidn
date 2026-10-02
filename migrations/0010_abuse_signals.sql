-- Short-lived, privacy-preserving abuse signals for anonymous room actions.
-- signal_key contains a pseudonymous account key or a rotating hash of the
-- edge address. Raw IP addresses, user agents, and message text are never
-- stored here. Expired rows can be removed without affecting room history.

CREATE TABLE IF NOT EXISTS hidn_abuse_signals (
  signal_key TEXT PRIMARY KEY NOT NULL,
  window_started_at TEXT NOT NULL,
  action_count INTEGER NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  last_content_hash TEXT,
  last_content_at TEXT,
  cooldown_until TEXT,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidn_abuse_signals_expiry
  ON hidn_abuse_signals (expires_at);

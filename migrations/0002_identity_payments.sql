-- HIDN account and payment boundary.
-- Recovery codes and sessions are stored as hashes. Payment references are
-- intentionally one-time identifiers; raw memos are never persisted.

CREATE TABLE IF NOT EXISTS hidn_users (
  user_id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  recovery_code_hash TEXT NOT NULL UNIQUE,
  access_level TEXT NOT NULL DEFAULT 'read_only'
    CHECK (access_level IN ('read_only', 'full')),
  created_at TEXT NOT NULL,
  verified_at TEXT,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hidn_users_recovery_code_hash
  ON hidn_users (recovery_code_hash);

CREATE TABLE IF NOT EXISTS hidn_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  session_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES hidn_users (user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidn_sessions_hash
  ON hidn_sessions (session_hash);

CREATE INDEX IF NOT EXISTS idx_hidn_sessions_user
  ON hidn_sessions (user_id);

CREATE TABLE IF NOT EXISTS payment_intents (
  payment_intent_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES hidn_users (user_id) ON DELETE CASCADE,
  payment_reference TEXT NOT NULL UNIQUE,
  expected_amount_zat INTEGER NOT NULL,
  receiving_address TEXT,
  refund_address_ciphertext TEXT,
  refund_address_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'detected', 'confirmed', 'underpaid', 'overpaid',
      'expired', 'refund_pending', 'refunded', 'reorged'
    )),
  transaction_id TEXT,
  output_index INTEGER,
  observed_amount_zat INTEGER,
  confirmations INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  refund_transaction_id TEXT,
  refunded_at TEXT,
  UNIQUE (transaction_id, output_index)
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_user
  ON payment_intents (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_intents_reference
  ON payment_intents (payment_reference);

CREATE INDEX IF NOT EXISTS idx_payment_intents_status
  ON payment_intents (status);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  payment_intent_id TEXT REFERENCES payment_intents (payment_intent_id) ON DELETE SET NULL,
  transaction_id TEXT NOT NULL,
  output_index INTEGER NOT NULL,
  amount_zat INTEGER NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('detected', 'confirmed', 'reorged', 'unmatched')),
  created_at TEXT NOT NULL,
  UNIQUE (transaction_id, output_index, event_type)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_intent
  ON payment_events (payment_intent_id);

CREATE TABLE IF NOT EXISTS unmatched_payments (
  unmatched_payment_id TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL,
  output_index INTEGER NOT NULL,
  amount_zat INTEGER NOT NULL,
  payment_reference TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (transaction_id, output_index)
);

CREATE INDEX IF NOT EXISTS idx_unmatched_payments_created
  ON unmatched_payments (created_at);

CREATE TABLE IF NOT EXISTS room_credentials (
  room_id TEXT PRIMARY KEY NOT NULL,
  credential_hash TEXT NOT NULL UNIQUE,
  memo_reference TEXT NOT NULL UNIQUE,
  return_address TEXT NOT NULL DEFAULT '',
  amount_usd_cents INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified')),
  created_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_room_credentials_hash
  ON room_credentials (credential_hash);

CREATE INDEX IF NOT EXISTS idx_room_credentials_status
  ON room_credentials (status);

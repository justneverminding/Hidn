-- Browser-generated Schnorr credentials for the account milestone.
-- D1 stores the public commitment only. The recovery secret never crosses
-- the account API and is used in the browser to produce a proof of knowledge.

ALTER TABLE hidn_users ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'recovery_code';
ALTER TABLE hidn_users ADD COLUMN identity_commitment TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidn_users_identity_commitment
  ON hidn_users (identity_commitment)
  WHERE identity_commitment IS NOT NULL;

CREATE TABLE IF NOT EXISTS hidn_auth_challenges (
  challenge_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES hidn_users (user_id) ON DELETE CASCADE,
  challenge_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hidn_auth_challenges_user
  ON hidn_auth_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hidn_auth_challenges_expiry
  ON hidn_auth_challenges (expires_at);

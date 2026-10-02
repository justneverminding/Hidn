-- Account-backed posting for the canonical private room.
-- The system credential is an internal room anchor; it is not exposed as a
-- user-facing access code. Posts never expose the author_user_id publicly.

INSERT OR IGNORE INTO room_credentials
  (room_id, credential_hash, memo_reference, return_address, amount_usd_cents, status, created_at, verified_at)
VALUES
  ('HIDN-MAIN-ROOM', '9a26675b6e66b3b04ef22a58bdaa2712a71f0d4dab1938c7562331e306573306', 'HIDN-MAIN-ROOM', '', 0, 'verified', '2026-10-02T00:00:00.000Z', '2026-10-02T00:00:00.000Z');

ALTER TABLE hidn_threads ADD COLUMN channel TEXT NOT NULL DEFAULT 'general';
ALTER TABLE hidn_threads ADD COLUMN author_user_id TEXT REFERENCES hidn_users (user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hidn_threads_room_channel_created
  ON hidn_threads (room_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hidn_threads_author_created
  ON hidn_threads (author_user_id, created_at DESC);

-- Version 1 testnet tipping.
-- Only public shielded receiving addresses are stored. Spending keys, viewing
-- keys, balances, and payment history stay outside HIDN.

ALTER TABLE hidn_users ADD COLUMN tip_address TEXT;
ALTER TABLE hidn_threads ADD COLUMN tip_address TEXT;

CREATE INDEX IF NOT EXISTS idx_hidn_threads_tip_address
  ON hidn_threads (tip_address);

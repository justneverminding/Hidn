-- End-to-end encrypted private-link messages.
--
-- e2e_public_key: the link's P-256 public key (base64url), shared with senders.
-- e2e_wrapped_key: the matching private key, AES-GCM-wrapped by a key only the
--   owner's browser can derive from their recovery secret. The server cannot
--   open it.
-- encrypted: 1 when hidn_link_messages.content is sealed to the link's key and
--   only the owner's browser can read it; 0 for messages sent before this.
ALTER TABLE hidn_link_inboxes ADD COLUMN e2e_public_key TEXT;
ALTER TABLE hidn_link_inboxes ADD COLUMN e2e_wrapped_key TEXT;
ALTER TABLE hidn_link_messages ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0;

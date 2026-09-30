# HIDN ZK boundary

This package contains the first account-credential proof boundary for HIDN.
It uses the maintained `@noble/curves` secp256k1 Schnorr implementation to
create a browser-held secret, derive a public commitment, and produce a
challenge-bound proof of knowledge at login.

The Worker stores the public commitment and verifies the proof. It does not
receive the recovery secret. This is a proof-of-knowledge credential, not an
anonymous group-membership protocol: the commitment is intentionally linked to
the selected HIDN handle for account login. It does not hide IP addresses,
timing, browser metadata, payment linkage, or the account's private history.

The package does not yet define circuits, Merkle trees, nullifiers, proving
keys, verification keys, or an operator-blind posting protocol. Those remain a
separate protocol milestone and must not be implied by this credential flow.

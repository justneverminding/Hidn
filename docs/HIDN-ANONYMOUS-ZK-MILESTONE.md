# HIDN anonymous ZK milestone

This milestone adds a separate anonymous participation path without removing
the existing Schnorr account path. It is intentionally additive while the
protocol is tested.

## What is implemented

- A browser-held 31-byte anonymous secret with a `HIDN-ANON-...` recovery key.
- A Poseidon commitment and fixed-depth (8-level, 256-member) membership tree.
- A Circom 2 circuit using Groth16:
  - membership commitment proves tree membership;
  - `Poseidon(secret, scope)` creates a one-use nullifier;
  - `Poseidon(nullifier, messageHash)` binds the proof to the action.
- D1 records for anonymous members, historical roots, nullifiers, anonymous
  posts/replies/reactions, and capability-based notifications.
- Anonymous read, enrollment, post, reply, reaction, and notification API
  contracts under `/api/anonymous/*`.
- The anonymous API sends requests with `credentials: omit`, so it does not
  reuse the existing account session cookie.
- Seven-day anonymous notification retention, matching the existing private
  activity retention policy.
- A local protocol test and a real local Groth16 proof test. The proof test
  also rejects a tampered public message binding.

## The privacy boundary in this milestone

The Worker does not receive the anonymous secret, username, account ID, Merkle
leaf index, or proof witness when an anonymous action is posted. It receives a
public root, nullifier, message binding, proof, content, and the temporary
display alias needed for the room experience.

This is not yet network anonymity. Without Tor or a relay, a direct request
still reaches Cloudflare and can be correlated with edge request metadata,
timing, enrollment, and the content of the request. The existing rotating
edge signal remains a short-lived abuse-control signal; it is not an identity
system. Tor/relay transport is the next separate milestone.

The notification capability is a bearer secret held locally by the browser.
The current version protects it by storing only its SHA-256 hash in D1, but it
does not yet provide end-to-end encrypted notification payloads. The content
and target remain visible to the Worker when an event is created.

## Circuit and local setup

The source circuit is:

`packages/anonymous-zk/circuits/hidn_membership.circom`

Compile it with:

```sh
npm --workspace @hidn/anonymous-zk run build:circuit
```

For local development only, create a disposable Groth16 setup, export a
verification key, and keep all generated files under the ignored `build/`
directory. The setup must be replaced by a documented multi-party ceremony
before production use. A locally generated zkey is not a production trust
anchor.

The Worker needs these non-source configuration values:

```text
ANONYMOUS_ZK_ENABLED=true
ANONYMOUS_ZK_VERIFICATION_KEY=<JSON verification key>
```

The verification key is public cryptographic material, but it still belongs in
Worker configuration rather than the public repository for operational control.
The proving zkey and any ceremony secrets must never be committed.

## API shape

1. `GET /api/anonymous/status` reports whether the Worker is configured.
2. `POST /api/anonymous/enroll` accepts a commitment and local notification
   capability, then returns a temporary alias and Merkle witness.
3. `POST /api/anonymous/posts` verifies a proof and stores a post with no
   `author_user_id`.
4. `POST /api/anonymous/replies` verifies a proof and stores a reply with no
   `author_user_id`.
5. `POST /api/anonymous/reactions` verifies a proof and stores an anonymous
   like. The first milestone treats a like as a one-way action; unlike/toggle
   semantics need a follow-up scope design.
6. `GET /api/anonymous/notifications` and
   `POST /api/anonymous/notifications/read` use the local capability header.

The client request helpers are in
`apps/web/src/product/room-api.ts`. The existing account UI still uses the
Schnorr/recovery flow; the anonymous UI can now be integrated behind a feature
flag after the Worker configuration and D1 migration are applied.

## Remaining before production

- Use a reviewed, multi-party Groth16 ceremony or a proof system with a
  different trusted-setup model.
- Add the actual browser room UI path and store the local vault in a hardened
  IndexedDB/WebCrypto design rather than treating local storage as a secure
  vault.
- Add deterministic reaction scopes for unlike/toggle behavior.
- Encrypt notification payloads end to end.
- Add a relay/Tor transport so Cloudflare cannot directly observe the user's
  network address.
- Replace or independently review the current `snarkjs` runtime dependency
  chain before production enablement; the local audit still reports upstream
  transitive advisories.
- Conduct circuit, protocol, abuse, moderation, recovery, and independent
  cryptographic review before describing the product as fully anonymous.

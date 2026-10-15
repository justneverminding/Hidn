# HIDN anonymous ZK milestone

This milestone added the anonymous participation path. It is now the only way
into the room: the earlier Schnorr handle accounts have been removed.

## What is implemented

- A browser-held 31-byte anonymous secret with a `HIDN-ANON-...` recovery key.
- A Poseidon commitment and fixed-depth (20-level, 1,048,576-member) membership tree.
- A Circom 2 circuit using Groth16:
  - membership commitment proves tree membership;
  - `Poseidon(secret, scope)` creates a one-use nullifier;
  - `Poseidon(nullifier, messageHash)` binds the proof to the action;
  - public signals (version 2): root, nullifier, binding and scope.
- D1 records for anonymous members, historical roots, nullifiers, anonymous
  posts/replies/reactions, and capability-based notifications.
- Anonymous read, enrollment, post, reply, reaction, and notification API
  contracts under `/api/anonymous/*`.
- The anonymous API sends requests with `credentials: omit`, so no session
  cookie is involved.
- Seven-day anonymous notification retention, matching the existing private
  activity retention policy.
- A local protocol test and a real local Groth16 proof test. The proof test
  also rejects a tampered public message binding.

## The privacy boundary in this milestone

The Worker does not receive the anonymous secret, username, account ID, Merkle
leaf index, or proof witness when an anonymous action is posted. It receives a
public root, nullifier, message binding, scope, proof, content, and the
temporary display alias needed for the room experience.

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

The circuit is depth 20 (1,048,576 members), protocol
`hidn-anonymous-groth16-v2`. Version 2 makes the nullifier scope a public
signal. In version 1 the scope was private, so the Worker could not check
which scope a nullifier was made with, and a member could like the same post
again under a different scope; version 2 closes that.

The trusted setup for the version 2 circuit: phase 1 is the public Hermez
Powers of Tau (`powersOfTau28_hez_final_15.ptau`, 37,831,832 bytes, BLAKE2b
checked against the value published in the snarkjs README, so it is the
official file byte for byte). The official
Hermez hosts no longer serve the file; it was fetched from a GitHub mirror
and accepted only because its hash matches. Phase 2 has one HIDN contribution
made with random entropy that was not kept, followed by a public beacon from
Zcash mainnet block 3,518,070
(`0000000000585c54434ac0a2668dd57c9ba78510db55432ea829a9f94e964611`, checked
on two explorers; 2^10 iterations). `snarkjs zkey verify` passes against the
circuit and the Hermez file. Phase 2 is still a single-party contribution, so
it is not yet a full multi-party ceremony: more independent phase-2
contributions are needed before it can be called one.

The version 1 setup (depth 20, beacon block 3,515,842) is kept only so pages
loaded before version 2 can still post; the Worker accepts version 1 proofs
for posts, replies, reports and links, never for likes.

Generated build files stay under the ignored `build/` directory, with the
setup output in `build/v2/`; the Vite build copies only that folder to
`public/anonymous-zk/v2/`. Published proving files are versioned by path
because they are served as immutable. Browsers holding an older, shorter proof
path fetch a fresh one automatically on their next action.

The Worker needs these non-source configuration values:

```text
ANONYMOUS_ZK_ENABLED=true
ANONYMOUS_ZK_VERIFICATION_KEY_V2=<JSON verification key, version 2>
ANONYMOUS_ZK_VERIFICATION_KEY=<JSON verification key, version 1, for older pages>
```

The verification key is public cryptographic material, but it still belongs in
Worker configuration rather than the public repository for operational control.
Ceremony secrets (contribution entropy) must never be committed.

## API shape

1. `GET /api/anonymous/status` reports whether the Worker is configured.
2. `POST /api/anonymous/enroll` accepts a commitment and local notification
   capability, then returns a temporary alias and Merkle witness.
3. `POST /api/anonymous/posts` verifies a proof and stores a post with no
   `author_user_id`.
4. `POST /api/anonymous/replies` verifies a proof and stores a reply with no
   `author_user_id`.
5. `POST /api/anonymous/reactions` verifies a version 2 proof whose public
   scope is the one fixed to the target, and stores an anonymous like. A like
   is one-way; unlike/toggle semantics need a follow-up scope design.
6. `GET /api/anonymous/notifications` and
   `POST /api/anonymous/notifications/read` use the local capability header.

The client request helpers are in
`apps/web/src/product/room-api.ts`. Reports use the same proof, with the
`report` action bound to the target and reason (migration 0022).

Content is not groupable by member (migration 0024). Posts, replies and likes
store no member alias. Each post and reply carries its own one-off
notification key, generated and kept in the browser; the server stores only a
hash per item, and a member reads notifications by sending the keys of their
own items, which the server matches for that request without recording them
together. Likes use a scope fixed to the target, and the scope is a public proof
signal, so a repeat like by the same member on the same post reuses its
nullifier and is refused, while likes on
different posts remain unlinkable. Notifications never name the actor.

## Remaining before production

- Use a reviewed, multi-party Groth16 ceremony or a proof system with a
  different trusted-setup model.
- Add the actual browser room UI path and store the local vault in a hardened
  IndexedDB/WebCrypto design rather than treating local storage as a secure
  vault.
- Add unlike/toggle behavior on top of the fixed reaction scopes.
- Encrypt notification payloads end to end.
- Add a relay/Tor transport so Cloudflare cannot directly observe the user's
  network address.
- Replace or independently review the current `snarkjs` runtime dependency
  chain before production enablement; the local audit still reports upstream
  transitive advisories.
- Conduct circuit, protocol, abuse, moderation, recovery, and independent
  cryptographic review before describing the product as fully anonymous.

# HIDN

HIDN is a privacy-first anonymous expression platform: a private room for
thoughts, confessions, and conversations without public names.

The product is built around a simple boundary:

**WRITE FREELY / STAY PRIVATE**

This repository contains the current web product, its Cloudflare Worker and
D1 room boundary, the nameless anonymous proof flow, and the shared visual
system.

## Current build

HIDN is an active pre-release workspace. The package version is currently
`0.0.0`; there is no published semver release yet.

The current build includes:

- A Vite + TypeScript web application served through a Cloudflare Worker.
- A terminal-style interface throughout (CRT scanlines, glitch titles, typed
  text) with the `>hidn▌` logo; a lighter mode for phones and low-power devices.
- Nameless access only: a recovery key created and kept in the browser. No
  accounts, usernames, emails or passwords.
- A private profile with a rotating `ANON-…` name, a time-limited recovery-key
  reveal, a local tip address and on-device history.
- Six rooms (General, Letting Go, Blackbox, Redacted, Night Shift and The
  Underground) as a live terminal feed, plus a 3D museum: a private main room,
  a hallway, themed rooms that hang real posts, and a library with ZecHub
  lessons, a wallet kiosk and an in-room learning TV.
- Anonymous posts, replies, likes and reports backed by the Groth16 protocol
  described below; posts and replies are capped at 500 characters.
- Direct shielded mainnet ZEC tips from a member's wallet to a post's address.
  HIDN never holds the funds or a spending key.
- Shareable terminal-style thread cards with the signature redacted.
- A private moderation console behind Cloudflare Access.
- Zcash verification is planned and shown as "coming soon"; it is not live.

The live Worker deployment is
[hidn.justneverminding.workers.dev](https://hidn.justneverminding.workers.dev/).
The repository deployment configuration is in
[`wrangler.jsonc`](wrangler.jsonc).

This is not a security-audited or universally anonymous release. In
particular, the current anonymous protocol still needs an independently
reviewed multi-party Groth16 ceremony, relay or Tor transport, hardened local
vault storage, end-to-end encrypted notifications, and independent protocol
review before it should be described as fully anonymous.

## Run the web app locally

Requirements: Node.js with npm workspaces enabled.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run build
npm run check
```

The Vite server uses the Cloudflare Worker origin configured in
`apps/web/vite.config.ts` for local API proxying. Set
`HIDN_ROOM_API_ORIGIN` when you need to use a different Worker origin.

## Public routes

| Route | Purpose |
| --- | --- |
| `/` | Homepage and Signal/Quiet theme selector |
| `/room/access` | Create anonymous access, return with a recovery key, or enter the account flow |
| `/room` | Private room index after access |
| `/room/channel/general` | General room |
| `/room/channel/love` | Letting Go room |
| `/room/channel/blackbox` | Blackbox room |
| `/room/channel/redacted` | Redacted room |
| `/room/channel/night-shift` | Night Shift room |
| `/room/channel/underground` | The Underground room |
| `/room/profile` | Local profile, recovery-key controls, activity, and optional Zcash verification |
| `/how-it-works` | Access and privacy explanation |
| `/manifesto` | HIDN product principles |
| `/privacy` | Concrete privacy boundaries and limitations |

`/explore` is kept as a compatibility route and redirects to `/room`.
`/system` is an internal, noindex design-system preview. `/c/:id` is a
noindex thread-detail surface. Admin routes are not linked from the public
shell and require their configured administrative access boundary.

## Anonymous ZK protocol

Nameless access is the only way into the room: there are no accounts,
usernames, emails or passwords.

### Anonymous room actions

- The browser creates and holds a 31-byte anonymous secret.
- The secret becomes a Poseidon commitment in a 20-level Merkle membership
  tree with room for 1,048,576 members.
- Circom 2 and Groth16 prove membership without sending the secret, username,
  account ID, leaf index, or Merkle witness to the Worker.
- `Poseidon(secret, scope)` produces a one-use nullifier.
- `Poseidon(nullifier, message binding)` binds the proof to the exact post,
  reply, reaction or report.
- Likes use a scope fixed to the post, so each member can like a post once,
  while likes on different posts stay unlinkable.
- Posts, replies and likes store no member alias. Each post and reply carries
  its own one-off notification key, kept in the browser, so the server cannot
  group a member's posts together.
- The `ANON-…` name shown on a member's profile is cosmetic and changes on
  every login: the server issues a fresh random alias and overwrites the old
  one, so no label follows a member between visits.
- A dedicated browser Web Worker runs proof generation locally.
- The Cloudflare Worker verifies the proof, accepted Merkle root, action
  binding, and nullifier replay state before writing D1 records.

Source and verification points:

- Circuit: [`packages/anonymous-zk/circuits/hidn_membership.circom`](packages/anonymous-zk/circuits/hidn_membership.circom)
- Protocol and Merkle helpers: [`packages/anonymous-zk/src/protocol.ts`](packages/anonymous-zk/src/protocol.ts) and [`packages/anonymous-zk/src/merkle.ts`](packages/anonymous-zk/src/merkle.ts)
- Browser prover: [`packages/anonymous-zk/src/prover.ts`](packages/anonymous-zk/src/prover.ts)
- Browser proof worker: [`apps/web/src/anonymous-proof-worker.ts`](apps/web/src/anonymous-proof-worker.ts)
- Worker verifier: [`packages/anonymous-zk/src/verifier.ts`](packages/anonymous-zk/src/verifier.ts)
- Cloudflare request validation and replay protection: [`apps/web/src/worker.ts`](apps/web/src/worker.ts)
- Public browser proving assets: [`public/anonymous-zk/`](public/anonymous-zk/)

The Worker still sees the request content, public proof signals, temporary
display alias, and normal edge request metadata. Without a relay or Tor,
network address and timing are not hidden from the edge. Anonymous
notification capabilities are hashed in D1, but notification payloads are not
currently end-to-end encrypted.

The committed proving key (`public/anonymous-zk/depth20/`) is public browser
material. The trusted setup for the depth-20 circuit: phase 1 is the public Hermez
Powers of Tau (`powersOfTau28_hez_final_15.ptau`, BLAKE2b checked against the
value published in the snarkjs README, and its contribution chain verified
with `snarkjs powersoftau verify`). Phase 2
has one HIDN contribution made with random entropy that was not kept, followed
by a public beacon from Zcash mainnet block 3,515,842
(`000000000033ba47…6da69e8`); `snarkjs zkey verify` passes against the circuit
and the Hermez file. Phase 2 is still a single-party contribution, so it is not
yet a full multi-party ceremony: more independent phase-2 contributions are
needed before it can be called one. Ceremony toxic waste and all private deployment secrets
must never be committed.

## Architecture

```text
apps/web/
  Vite frontend
  Cloudflare Worker API and asset boundary

packages/ui/             shared tokens, typography, effects, and components
packages/anonymous-zk/   Circom/Groth16 anonymous membership protocol
packages/privacy/        privacy protocol boundary
packages/shared/         cross-surface types and vocabulary
packages/zcash/          reusable Zcash integration boundary

apps/admin/              reserved/private administrative surface
apps/api/                reserved API extraction boundary
migrations/              Cloudflare D1 migrations
public/                  brand assets, metadata, and public ZK assets
docs/                    product, privacy, brand, architecture, and protocol notes
```

The Worker uses the `ROOM_DB` D1 binding for anonymous membership roots,
nullifiers, posts, replies, reactions, notifications, reports, and moderation
state. Room access is nameless only: there are no usernames, handles or
account sessions.

## Verify the anonymous protocol locally

Compile the source circuit and run the protocol and proof tests:

```bash
npm --workspace @hidn/anonymous-zk run build:circuit
npm --workspace @hidn/anonymous-zk run test:protocol
npm --workspace @hidn/anonymous-zk run test:proof
```

The proof test generates a real local Groth16 proof and checks that changing
the public message binding causes verification to fail. Generated circuit
outputs belong under the ignored `packages/anonymous-zk/build/` directory.

The anonymous Worker configuration requires the public protocol switch and a
JSON verification key:

```text
ANONYMOUS_ZK_ENABLED=true
ANONYMOUS_ZK_VERIFICATION_KEY=<JSON verification key>
```

Keep Worker secrets, admin credentials, RPC credentials, spending keys,
recovery keys, and ceremony secrets outside Git.

## Zcash and payment boundary

HIDN keeps Zcash optional. Ordinary room use does not require a wallet. The
room tip surface sends ZEC directly between members' shielded wallets; HIDN
never holds funds. Zcash verification is planned; see
[`docs/HIDN-MAINNET-ZCASH-VERIFICATION-MILESTONE.md`](docs/HIDN-MAINNET-ZCASH-VERIFICATION-MILESTONE.md).

## Source-of-truth documentation

Before changing the product, privacy claims, architecture, or visual system,
read the relevant documents in `docs/`:

- [`HIDN-PRODUCT.md`](docs/HIDN-PRODUCT.md)
- [`HIDN-BRAND.md`](docs/HIDN-BRAND.md)
- [`HIDN-PRIVACY.md`](docs/HIDN-PRIVACY.md)
- [`HIDN-ARCHITECTURE.md`](docs/HIDN-ARCHITECTURE.md)
- [`HIDN-ANONYMOUS-ZK-MILESTONE.md`](docs/HIDN-ANONYMOUS-ZK-MILESTONE.md)
- [`HIDN-PAYMENTS.md`](docs/HIDN-PAYMENTS.md)
- [`HIDN-ROADMAP.md`](docs/HIDN-ROADMAP.md)

The HIDN logo is the prompt mark `>hidn▌`; its files live in
[`public/brand/`](public/brand/), and the original reference artwork is kept
unchanged in `public/brand/references/`.

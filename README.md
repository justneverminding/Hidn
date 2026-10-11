# HIDN

HIDN is a privacy-first anonymous expression platform: a private room for
thoughts, confessions, and conversations without public names.

The product is built around a simple boundary:

**WRITE FREELY / STAY PRIVATE**

This repository contains the current web product, its Cloudflare Worker and
D1 room boundary, the browser-held account and anonymous proof flows, the
shared visual system, and the separate Zcash payment-watcher boundary.

## Current build

HIDN is an active pre-release workspace. The package version is currently
`0.0.0`; there is no published semver release yet.

The current build includes:

- A Vite + TypeScript web application served through a Cloudflare Worker.
- Signal Mode as the first-visit default, with Quiet Mode available from the
  homepage. The selected theme is remembered locally in the browser.
- A browser-local recovery-key flow for anonymous room access and a separate
  pseudonymous account flow.
- Private room access, profile, session validation, recovery-key reveal, room
  activity, moderation/report boundaries, and optional Zcash verification.
- Six rooms: General, Letting Go, Blackbox, Redacted, Night Shift, and The
  Underground.
- Anonymous posts, replies, and reactions backed by the anonymous Groth16
  protocol described below.
- Free posts and replies capped at 500 characters. Verified access has higher
  limits in the current UI.
- Direct shielded testnet TAZ tips from a wallet to a post destination. HIDN
  does not hold the funds or a spending key.
- Responsive desktop and mobile layouts, signal-console effects, the Quiet
  editorial surface, and the shared UI token/effect packages.

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

The current anonymous participation path is a separate protocol from the
ordinary account credential flow.

### Anonymous room actions

- The browser creates and holds a 31-byte anonymous secret.
- The secret becomes a Poseidon commitment in an 8-level Merkle membership
  tree with a current maximum of 256 members.
- Circom 2 and Groth16 prove membership without sending the secret, username,
  account ID, leaf index, or Merkle witness to the Worker.
- `Poseidon(secret, scope)` produces a one-use nullifier.
- `Poseidon(nullifier, message binding)` binds the proof to the exact post,
  reply, or reaction action.
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

The committed proving key is public browser material. The current local
Groth16 setup has not been replaced by a reviewed multi-party ceremony, so the
repository must not be presented as having a production-trustworthy ceremony
yet. Ceremony toxic waste and all private deployment secrets must never be
committed.

### Account credential flow

The ordinary account path uses a separate secp256k1 Schnorr proof-of-knowledge
credential from [`packages/zk/`](packages/zk/). The browser holds the recovery
secret; the Worker stores the public commitment and verifies a challenge-bound
proof. This credential is intentionally linked to a selected HIDN handle. It
is not the anonymous group-membership protocol and does not hide IP address,
timing, browser metadata, payment linkage, or account history.

## Architecture

```text
apps/web/
  Vite frontend
  Cloudflare Worker API and asset boundary

packages/ui/             shared tokens, typography, effects, and components
packages/anonymous-zk/   Circom/Groth16 anonymous membership protocol
packages/zk/             account Schnorr proof-of-knowledge boundary
packages/privacy/        privacy protocol boundary
packages/shared/         cross-surface types and vocabulary
packages/zcash/          reusable Zcash integration boundary

apps/payment-watcher/    separate watch-only Zcash RPC observer
apps/admin/              reserved/private administrative surface
apps/api/                reserved API extraction boundary
migrations/              Cloudflare D1 migrations
public/                  brand assets, metadata, and public ZK assets
docs/                    product, privacy, brand, architecture, and protocol notes
```

The Worker uses the `ROOM_DB` D1 binding for account sessions, payment
intents, anonymous membership roots, nullifiers, posts, replies, reactions,
notifications, reports, and moderation state. The payment watcher is a
separate Node process: it observes a configured Zcash RPC wallet and forwards
signed normalized events; it must never receive a spending key.

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

Keep Worker secrets, admin credentials, payment watcher secrets, RPC
credentials, spending keys, recovery keys, and ceremony secrets outside Git.

## Zcash and payment boundary

HIDN keeps Zcash optional. Ordinary room use does not require a wallet. The
current room tip surface uses shielded testnet destinations and labels the
asset as TAZ. The account verification/payment boundary is separate from
anonymous room membership and requires the Worker, D1 migrations, configured
payment secrets, and the watch-only payment watcher before real intake is
enabled.

See [`docs/HIDN-PAYMENTS.md`](docs/HIDN-PAYMENTS.md) and
[`apps/payment-watcher/README.md`](apps/payment-watcher/README.md) for the
operational boundary.

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

The supplied brand references and canonical eye asset are preserved in
[`public/brand/`](public/brand/).

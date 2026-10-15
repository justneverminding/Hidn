# HIDN

**Say it. No names.**

HIDN is a privacy-first place for anonymous confessions. There are no
accounts, usernames, emails or passwords: you get a recovery key that stays in
your browser, and every post carries a zero-knowledge proof that a member
wrote it, without showing which one.

**Live:** [hidn.justneverminding.workers.dev](https://hidn.justneverminding.workers.dev/)
· **Read without joining:** [/read](https://hidn.justneverminding.workers.dev/read)
· **How it works:** [/how-it-works](https://hidn.justneverminding.workers.dev/how-it-works)
· **Privacy:** [/privacy](https://hidn.justneverminding.workers.dev/privacy)

Built on Zcash. Runs on a Cloudflare Worker with a D1 database
(configuration in [`wrangler.jsonc`](wrangler.jsonc)).

> HIDN is pre-release (`0.0.0`) and has not had a security audit. Read
> [What HIDN does not hide yet](#what-hidn-does-not-hide-yet) before relying
> on it.

## What you can do

- **Post, reply and like anonymously.** Posts and replies are up to 500
  characters. Links are not allowed anywhere; say it in words.
- **Browse the feed.** Recent posts from every room, 20 at a time, with a
  live pulse that briefly shows new posts (delayed at least two minutes, plus
  a random wait, so a post can't be matched to the moment it was written).
- **Pick a room** and share it. Each room has its own link and preview card;
  someone who opens it and taps SAY IT gets a key and lands in that room.
- **Get anonymous messages.** Open one private link (`/to/<name>`) and anyone
  can send you a message, with an optional shielded ZEC tip. Up to 120
  messages a day. Messages can be shared or saved as images.
- **Tip in shielded ZEC.** Tips go straight from one wallet to another; HIDN
  never holds funds or a spending key.
- **Walk the museum.** A 3D main room, a hallway, themed rooms that hang real
  posts, and a library with ZecHub lessons, a wallet kiosk and a learning TV.

## Rooms

| Room | About | Share link |
| --- | --- | --- |
| General | everything people are saying | [/r/general](https://hidn.justneverminding.workers.dev/r/general) |
| Things I've Never Told Anyone | say it here first | [/r/never-told-anyone](https://hidn.justneverminding.workers.dev/r/never-told-anyone) |
| Talk About Your Ex | women and men spill | [/r/talk-about-your-ex](https://hidn.justneverminding.workers.dev/r/talk-about-your-ex) |
| Ragebait Me | say the take that starts a fight | [/r/ragebait-me](https://hidn.justneverminding.workers.dev/r/ragebait-me) |
| The Wildest Thing You've Done | no names. no judgment. just tell it | [/r/wildest-thing](https://hidn.justneverminding.workers.dev/r/wildest-thing) |
| Student Secrets | school, uni, everything in between | [/r/student-secrets](https://hidn.justneverminding.workers.dev/r/student-secrets) |
| Crypto Confessions | wins, losses, things you'd never tweet | [/r/crypto-confessions](https://hidn.justneverminding.workers.dev/r/crypto-confessions) |

The room list lives in
[`apps/web/src/product/room-links.ts`](apps/web/src/product/room-links.ts),
shared by the site and the Worker.

## Pages

Public:

| Page | What it is |
| --- | --- |
| [`/`](https://hidn.justneverminding.workers.dev/) | Homepage, with a ticker of recent posts |
| [`/read`](https://hidn.justneverminding.workers.dev/read) | Read-only feed, no key needed |
| `/r/<room>` | One room's share link (see [Rooms](#rooms)) |
| `/to/<name>` | Someone's private link: send them an anonymous message |
| [`/how-it-works`](https://hidn.justneverminding.workers.dev/how-it-works) | How access and privacy work |
| [`/manifesto`](https://hidn.justneverminding.workers.dev/manifesto) | HIDN's principles |
| [`/privacy`](https://hidn.justneverminding.workers.dev/privacy) | Concrete privacy boundaries and limitations |

Inside the room (after getting a key at
[`/room/access`](https://hidn.justneverminding.workers.dev/room/access)):

| Tab | Route |
| --- | --- |
| FEED | `/room/feed` (where members land) |
| ROOMS | `/room/rooms`, one room at `/room/channel/<key>` |
| MUSEUM | `/room/main`, hallway `/room/hall`, library `/room/library` |
| INBOX | `/room/inbox`: private-link messages and link settings |
| ME | `/room/profile`: my posts, recovery key (shown for 20 seconds), settings |

`/explore` redirects into the room. `/c/:id` is a thread page and is not
indexed. `/system` is an internal design preview. The moderation console is
behind Cloudflare Access and is not linked anywhere.

## How the anonymity works

- Your browser creates a 31-byte secret. Its recovery key form
  (`HIDN-ANON-…`) is the only way back in, so save it.
- The browser sends only a Poseidon **commitment** to that secret, which joins
  a 20-level Merkle tree (room for 1,048,576 members).
- Every post, reply, like and report carries a **Groth16 proof**, made in the
  browser, that the sender's commitment is in the tree. The secret, the leaf
  position and the Merkle path never leave the browser.
- `Poseidon(secret, scope)` gives a one-use **nullifier**, so a proof can't be
  replayed. `Poseidon(nullifier, message)` binds the proof to that exact post,
  reply, like or report.
- **One like per post.** A like uses a scope fixed to its post, and the scope
  is a public signal of the proof (protocol v2), so the Worker checks it: a
  second like on the same post is refused, while likes on different posts
  can't be linked to each other.
- **Posts aren't grouped by person.** Posts, replies and likes store no member
  name. Each post and reply gets its own one-off notification key, kept in the
  browser. The `ANON-…` name on your profile is cosmetic and changes on every
  visit.
- **Private links:** the inbox opens with a key derived from your recovery
  key; the server stores only its hash, not which member owns the link.

Where to look in the code:

- Circuit: [`packages/anonymous-zk/circuits/hidn_membership.circom`](packages/anonymous-zk/circuits/hidn_membership.circom)
- Protocol and Merkle helpers: [`protocol.ts`](packages/anonymous-zk/src/protocol.ts), [`merkle.ts`](packages/anonymous-zk/src/merkle.ts)
- Browser prover: [`prover.ts`](packages/anonymous-zk/src/prover.ts) in a Web Worker, [`anonymous-proof-worker.ts`](apps/web/src/anonymous-proof-worker.ts)
- Verifier: [`verifier.ts`](packages/anonymous-zk/src/verifier.ts)
- Request checks, replay protection, rate limits, link blocking: [`apps/web/src/worker.ts`](apps/web/src/worker.ts)
- Public proving files: [`public/anonymous-zk/v2/`](public/anonymous-zk/v2/)

### Trusted setup

- **Phase 1:** the public Hermez Powers of Tau
  (`powersOfTau28_hez_final_15.ptau`). Its BLAKE2b hash matches the value
  published in the snarkjs README, and `snarkjs powersoftau verify` passes.
- **Phase 2:** one HIDN contribution made with random entropy that was not
  kept, then a public beacon from Zcash mainnet block 3,518,070
  (`0000000000585c54…4e964611`). `snarkjs zkey verify` passes against the
  circuit and the Hermez file.

Phase 2 is single-party, so it is **not yet a multi-party ceremony**. Full
details are in
[`docs/HIDN-ANONYMOUS-ZK-MILESTONE.md`](docs/HIDN-ANONYMOUS-ZK-MILESTONE.md).

### What HIDN does not hide yet

- **Your network address and timing.** Requests go straight to Cloudflare;
  there is no relay or Tor transport yet.
- **What you write.** The Worker sees post content, public proof signals and
  normal request metadata.
- **Notifications and private-link messages** are stored in plain text. They
  are not end-to-end encrypted, so the operator can read them.
- **The setup** needs more independent phase-2 contributions, and the
  protocol needs an independent review, before HIDN should be called fully
  anonymous.

## Run it locally

Requirements: Node.js with npm workspaces.

```bash
npm install
npm run dev
```

Checks:

```bash
npm run typecheck
npm run build
npm run check
```

The Vite dev server proxies API calls to the Worker origin set in
`apps/web/vite.config.ts`. Set `HIDN_ROOM_API_ORIGIN` to use a different one.

The Worker needs:

```text
ANONYMOUS_ZK_ENABLED=true
ANONYMOUS_ZK_VERIFICATION_KEY_V2=<JSON verification key, v2>
ANONYMOUS_ZK_VERIFICATION_KEY=<JSON verification key, v1, for pages loaded before v2>
```

Keep Worker secrets, admin credentials, spending keys, recovery keys and setup
entropy out of Git.

### Test the proof system

```bash
npm --workspace @hidn/anonymous-zk run build:circuit
npm --workspace @hidn/anonymous-zk run test:protocol
npm --workspace @hidn/anonymous-zk run test:proof
```

`test:proof` makes a real Groth16 proof and checks that a tampered message
binding or scope is rejected. It needs a proving key in
`packages/anonymous-zk/build/`; generated files there are ignored by Git.

## Repository

```text
apps/web/                Vite frontend and the Cloudflare Worker (API + assets)
packages/anonymous-zk/   Circom/Groth16 membership circuit, prover, verifier
packages/ui/             shared tokens, typography, effects, components
packages/shared/         cross-surface types and vocabulary
packages/privacy/        privacy protocol boundary
packages/zcash/          Zcash integration boundary
apps/admin/, apps/api/   reserved
migrations/              D1 migrations (database `hidn-room`)
public/                  brand assets, metadata, public proving files
docs/                    product, privacy, brand, architecture, protocol notes
marketing/               ad and image renderers
```

D1 holds membership roots, nullifiers, posts, replies, likes, notifications,
reports, private links and their messages, and moderation state. There are no
user accounts.

## Docs

Read the relevant one before changing the product, privacy claims,
architecture or visuals:

- [Product](docs/HIDN-PRODUCT.md) · [Privacy](docs/HIDN-PRIVACY.md) ·
  [Architecture](docs/HIDN-ARCHITECTURE.md) · [Brand](docs/HIDN-BRAND.md) ·
  [Roadmap](docs/HIDN-ROADMAP.md)
- [Anonymous ZK protocol](docs/HIDN-ANONYMOUS-ZK-MILESTONE.md) ·
  [Zcash verification (planned)](docs/HIDN-MAINNET-ZCASH-VERIFICATION-MILESTONE.md) ·
  [Old account/payment design (retired)](docs/HIDN-PAYMENTS.md)

The logo is the prompt mark `>hidn▌`; its files are in
[`public/brand/`](public/brand/).

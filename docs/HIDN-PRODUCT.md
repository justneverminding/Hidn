# HIDN Product Source of Truth

> **Canonical status:** This document is the product source of truth for HIDN.
> Future agents and contributors must read it before changing product scope,
> identity assumptions, or the anonymous confession flow.

## Product

HIDN is a privacy-first anonymous confession platform built around
zero-knowledge technology and Zcash. The primary product is anonymous
confession, not a social network, crypto dashboard, or identity product.

The core interaction is:

**VISIT → CONFESS → PROVE PRIVATELY → POST ANONYMOUSLY**

The intended basic experience should not require a person to:

- create an account;
- provide an email address;
- choose a username;
- create a profile;
- create a public identity; or
- build a visible confession history.

The anonymous confession system must not be architected around a traditional
`users` table. Personal HIDN pages, anonymous inboxes, communities, and
advanced Zcash functionality are later extensions, not Phase 0 requirements.

## Current build (October 2026)

The phases below are kept as history. What is live now:

- nameless access with a browser-held recovery key and Groth16 membership
  proofs on every post, reply, like and report (see `HIDN-ANONYMOUS-ZK-MILESTONE.md`);
- a persistent D1-backed feed, seven topic rooms with shareable `/r/<slug>`
  links, a public `/read` feed and a 3D museum;
- private links (`/to/<slug>`): one per member, anonymous messages from anyone,
  120 a day, optional shielded ZEC tip, inbox in the room;
- direct shielded ZEC tips on posts (HIDN never holds funds);
- links blocked in all user text; a private moderation console behind
  Cloudflare Access.

Still deferred: paid link features and any ZEC payment watcher, Zcash
verification, communities, relay/Tor transport and end-to-end encrypted
notifications or link messages.

## Product principles

1. **Show the thought. Hide the person.** The confession is the product
   surface; the sender should not become a public identity.
2. **Reveal less by default.** Every new field, event, and integration must
   answer: “What does this reveal, and can we reveal less?”
3. **Privacy is not a marketing absolute.** HIDN must describe concrete
   controls and limitations rather than promise “100% untraceable” behavior.
4. **Consumer-first privacy.** Basic confession remains free and does not
   require a wallet connection. Zcash appears when a person intentionally
   chooses a future ZEC feature.
5. **Human before protocol.** Zero-knowledge and Zcash support the product;
   they should not make the consumer surface feel like a crypto exchange.

## Phase 0 product boundary

Phase 0 establishes source-of-truth documentation, the brand foundation, a
TypeScript web scaffold, shared visual tokens, metadata policy, and a minimal
application shell. It does not ship a confession form or persistence.

The shell is deliberately not a complete homepage. It exists to make the
visual and architectural boundary concrete while later product decisions are
reviewed.

Phase 1 adds only the reusable visual design system and an internal `/system`
preview. It does not add submission behavior, persistence, or any
identity-bearing surface.

## Phase 2 product boundary

Phase 2 adds the public product experience as a browser-only demonstration:
homepage, identityless room/explore feed, anonymous detail route, and
lightweight manifesto/how-it-works/privacy pages. The dedicated `/confess`
page and its mock proof/posting flow are not shipped in the current build;
the reviewed proofed posting path remains deferred.

Phase 2 does not create a backend, database, real proof, credential,
nullifier, Merkle tree, wallet request, Zcash transaction, moderation system,
analytics event, or persistent anonymous identity. Every proof-related state
must be labelled as a mock/demo state until the reviewed protocol exists.

## Phase 2.6 product-experience boundary

Phase 2.6 reshapes the public frontend around a private conversation surface:
the homepage composer is immediate, the explore route uses message rows, and
ambient transmission arrivals are simulated from local mock data only. The
homepage may show receiving, cursor, pulse, scan, and short reveal motion, but
must label the stream as simulated and must not claim live users, live typing,
or real network activity. `prefers-reduced-motion` disables automatic stream
movement and decorative motion.

This remains a browser-only experience. Phase 2.6 does not create a backend,
database, real-time connection, real proof, wallet request, Zcash transaction,
moderation system, analytics event, or persistent anonymous identity.

## Phase 2.7 product refinement boundary

Phase 2.7 is a visual refinement pass over the existing browser-only product.
It improves composer hierarchy, transmission rhythm, control feedback, dark
surface depth, dialog consistency, responsive spacing, and motion hierarchy.
It does not change the homepage conversation model, local mock behavior,
privacy claims, route structure, or anonymous product boundary. Large
atmospheric surfaces should fade into the page background, and message rows
should read as a continuous stream rather than a stack of cards.

No backend, database, real-time connection, ZK, Zcash transaction, wallet,
moderation, analytics, account, username, profile, or Phase 3 work is included.

## Deferred product features (Phase 0–2, historical)

At Phase 0–2 the following were deferred. Proofs, nullifiers, tips,
persistence, feeds, personal links/inboxes and the admin console have since
shipped; see Current build above.

- ZK proofs, Merkle trees, nullifiers, and proof circuits;
- wallet connections, shielded addresses, transactions, tips, or ZEC value
  attachment;
- confession persistence, real feeds, personal pages, inboxes, and communities;
- authentication for confessors and any traditional anonymous-user account;
- moderation tooling and the private admin console;
- crawler tracking, invasive analytics, and browser fingerprinting.

## Language guardrails

Approved system language may include `NO ACCOUNT`, `NO USERNAME`, `NO
HISTORY`, `ANONYMOUS SESSION`, and `BUILT ON ZCASH` when technically true.
Do not claim that a proof makes a person universally untraceable or that a
future network state is online before it has been verified.

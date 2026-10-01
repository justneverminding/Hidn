# HIDN Roadmap Source of Truth

> **Canonical status:** This document is the milestone source of truth for
> HIDN. Phase 2.6 ends here; later phases require review and do not start
> automatically.

## Phase 0 — Source of truth + project foundation

**Status: complete in this checkout.**

Delivered:

- product, brand, privacy, architecture, and roadmap documentation;
- a clean Vite + TypeScript workspace foundation;
- reserved `web`, `admin`, `api`, `ui`, `shared`, `privacy`, `zk`, and `zcash`
  boundaries;
- semantic dark-first design tokens and reusable restrained visual effects;
- display, body, and mono/system typography roles;
- responsive and accessibility guardrails;
- metadata foundations for SEO, Open Graph, robots, sitemap, and structured
  data;
- a minimal shell with navigation and footer placeholders;
- canonical brand asset locations without modifying or inventing supplied art.

## Phase 1 — Visual design system

**Status: complete in this checkout.**

Delivered:

- refined semantic HIDN tokens with no purple primary palette;
- responsive display, body, and mono/system type scale;
- spacing, container, reading-width, editorial-grid, and full-bleed layout
  primitives;
- reusable grain, vignette, scanline, halftone, CRT, paper-distress, static,
  and scan-sweep effects;
- fast, standard, and deliberate motion tokens with reduced-motion behavior;
- reusable identityless controls, confession card, composer shell, states,
  dialogs, navigation, footer, and surveillance components;
- internal noindex `/system` preview with the canonical reference artwork;
- responsive and accessibility verification at desktop and mobile widths.

No Phase 2 product logic was added.

## Phase 2 — Public product experience

**Status: complete in this checkout.**

Delivered as a frontend-only, local mock experience:

- public homepage at `/` using the approved reference artwork unchanged;
- identityless `/room`/`/explore` messaging and an individual `/c/:id` detail
  route;
- the dedicated `/confess` flow, mock proof states, and simulated posting are
  removed from the current build; reviewed proofed posting remains deferred;
- identityless `/explore` feed with latest, random, and felt views;
- lightweight `/manifesto`, `/how-it-works`, and `/privacy` pages;
- responsive public navigation, footer, editorial composition, accessibility
  labels, reduced-motion behavior, and page-level metadata;
- individual anonymous confession routes marked non-indexable; no dedicated
  confession-flow route is shipped;
- no account, username, profile, persistent history, analytics, admin surface,
  or wallet call-to-action.

The mock message list and browser-local content actions reset with a page
reload. No backend, database, real proof, moderation, wallet, or persistence
work is included in this phase.

## Phase 2.5 — Homepage clarity pass

**Status: complete in this checkout.**

Delivered as a homepage-only information hierarchy pass:

- plain-English product definition and one obvious primary confession action;
- trust signals moved into the first viewport alongside the emotional headline;
- concise `HOW HIDN WORKS`, confession previews, `WHY HIDN`, privacy, and
  manifesto sections moved below the hero in a clear sequence;
- Zcash and zero-knowledge language kept secondary and explicitly framed as
  design direction, with the current proof interaction still labelled a mock;
- responsive first-viewport, touch-target, no-overflow, image-load, and route
  regression checks across desktop, tablet, and mobile sizes.

No design-system, route, backend, privacy-flow, or Phase 3 work was started.

## Phase 2.6 — Messaging experience + live motion pass

**Status: complete in this checkout.**

Delivered as a browser-only public frontend experience:

- homepage reshaped into an immediate composer plus anonymous transmission
  stream instead of a long landing-page section stack;
- local mock transmission arrivals, receiving status, restrained reveal,
  cursor, signal-pulse, scan, and ambient-drift behavior;
- simulated activity explicitly labelled with no fake live-user, typing, or
  network metrics;
- `/explore` converted from a card directory into filterable message rows;
- homepage and room messaging surfaces aligned to the same private-channel
  conversation language;
- reduced-motion behavior disables automatic stream movement and decorative
  motion while preserving full usability.

No backend, database, real-time connection, ZK, Zcash transaction, wallet,
admin, account, username, profile, or Phase 3 work was started.

## Phase 2.7 — Premium UI refinement

**Status: complete in this checkout.**

Refined the existing public product without expanding its behavior or scope:

- strengthened the composer hierarchy and tactile button/input states;
- softened stream rhythm with atmospheric rows and fading separators;
- aligned confession flow, Explore, dialogs, and the internal system preview;
- added restrained rounded geometry and tonal depth while preserving sharp
  editorial and surveillance details;
- reduced decorative noise and maintained the existing typewriter, arrival, and
  reduced-motion behavior across responsive layouts.

No backend, database, real-time connection, ZK, Zcash transaction, wallet,
admin, account, username, profile, or Phase 3 work was started.

## Phase 3.0 — Account and payment boundary

**Status: backend foundation implemented; production activation pending.**

Delivered in the current checkout:

- D1 tables for pseudonymous accounts, hashed recovery codes, HttpOnly
  sessions, payment intents, payment events, and unmatched payments;
- browser-generated secp256k1 Schnorr proof-of-knowledge credentials for new
  accounts, with D1-stored public commitments and five-minute single-use login
  challenges;
- read-only account access before payment and a Worker-controlled full-access
  flag after exact amount plus confirmation checks;
- encrypted refund-address storage when `REFUND_ENCRYPTION_KEY` is configured;
- HMAC-signed, timestamp-bounded payment-event intake with idempotent
  transaction/output handling and reorg-aware access recalculation;
- a separate Node watcher built around wallet-visible Zcash RPC received-note
  data, with an atomic local state file and no spending-key authority.

Still required before calling this a live mainnet payment release:

- apply the D1 migrations, including the browser-proof migration, remotely;
- configure and rotate the Worker secrets;
- deploy and test the watcher against a dedicated watch-only wallet/RPC node;
- decide whether to use one dedicated receiving address per intent or accept
  the operational tradeoffs of a shared address plus memo reference;
- add the separately controlled refund/payout signer and manual-review policy;
- replace the browser-local confession content actions with authenticated
  server routes before treating replies and reactions as production data.

The browser-proof account path is a credential foundation, not completion of
the later anonymous-posting protocol. Private profile history, rotating public
signals, anonymous nullifiers, and operator-blind retrieval still require a
separate protocol review and implementation milestone.

## Later milestones

The order below is a planning sequence, not permission to implement it during
Phase 2.6.

### Phase 3 — Confession surface definition

Define the smallest visitor-to-confession experience, content rules, abuse
prevention constraints, error states, and the exact privacy language shown to
the person before they post. No account should be introduced as a convenience
shortcut.

**Gate:** privacy review of every input, retained field, and visible state.

### Phase 4 — Private proof and posting protocol

Design and implement the reviewed proof flow, eligibility model, replay
prevention, and anonymous posting path. This is where ZK circuits, Merkle
trees, nullifiers, verification, and persistence may be evaluated.

**Gate:** protocol threat model, test vectors, failure handling, and clear
limits on what the proof does and does not prove.

### Phase 5 — Moderation and private operations

Build moderation, reports, proof inspection, retention controls, and the
isolated `admin.hidn.xyz` console. Admin access must not become a routine
identity bridge to anonymous confessors.

**Gate:** access control, audit-log minimization, abuse response, and deletion
behavior reviewed before deployment.

### Phase 6 — Optional Zcash features

Evaluate opt-in shielded tips, value attachment, and anonymous entitlements.
The default confession path remains free and wallet-free.

**Gate:** user comprehension, wallet threat model, transaction failure states,
and separation from ordinary confession metadata.

### Phase 7 — Public discovery and measurement

Add reviewed public SEO, Open Graph images, structured data, GEO/AI discovery
guidance, crawler controls, and privacy-conscious aggregate analytics.

**Gate:** individual anonymous confessions remain noindex unless an explicit
product decision changes that policy with a privacy review.

## Open decisions

The following require product and privacy review later:

- exact proof eligibility and abuse-prevention model;
- whether any confession content becomes publicly discoverable;
- content retention and deletion policy;
- moderation access and escalation model;
- final approved font and logo asset formats;
- optional Zcash feature scope;
- hosting/API topology and operational logging boundaries.

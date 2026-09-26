# HIDN Roadmap Source of Truth

> **Canonical status:** This document is the milestone source of truth for
> HIDN. Phase 2 ends here; later phases require review and do not start
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
- `/confess` flow with `01 PROVE`, `02 CONFESS`, and `03 PREVIEW` states;
- explicit mock proof states with no cryptographic, credential, nullifier,
  wallet, network, or backend behavior;
- local in-memory confession preview, simulated posting, success state, and
  individual `/c/:id` detail route;
- identityless `/explore` feed with latest, random, and felt views;
- lightweight `/manifesto`, `/how-it-works`, and `/privacy` pages;
- responsive public navigation, footer, editorial composition, accessibility
  labels, reduced-motion behavior, and page-level metadata;
- individual confession and confession-flow routes marked non-indexable;
- no account, username, profile, persistent history, analytics, admin surface,
  or wallet call-to-action.

The mock confession list and posting flow are reset with a page reload. No
backend, database, real proof, moderation, wallet, or persistence work is
included in this phase.

## Later milestones

The order below is a planning sequence, not permission to implement it during
Phase 2.

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

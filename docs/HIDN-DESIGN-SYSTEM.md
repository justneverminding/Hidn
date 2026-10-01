# HIDN Visual Design System Source of Truth

> **Canonical status:** This document governs reusable Phase 1 UI work and its
> Phase 2 public product composition. It supplements `HIDN-BRAND.md`.

## Phase 1 boundary

Phase 1 turns the approved HIDN direction into reusable tokens, layouts,
effects, motion rules, and visual components. It does not implement
persistence, accounts, proofs, wallets, Zcash transactions, moderation,
analytics, or backend behavior.

## Phase 2 composition boundary

Phase 2 composes the system into the public homepage, confession flow,
identityless explore feed, anonymous detail route, and lightweight supporting
pages. Product styling belongs in `apps/web/src/product/product.css` and
reuses the shared components rather than introducing a new visual language.

The proof, posting, and feed behavior in this phase is local mock behavior.
The interface must not imply that a real proof, credential, nullifier, wallet,
network, or persistent confession record exists.

The research translation companion is
`docs/HIDN-ANONYMOUS-NOIR-REFERENCE-BRIEF.md`. It documents how external
visual references inform HIDN without replacing the approved brand source of
truth or authorizing third-party asset reuse.

## Source locations

- `packages/ui/src/tokens.css` — semantic colors, type scale, spacing, layout,
  radius, and motion values;
- `packages/ui/src/typography.css` — display, body, mono/system utilities;
- `packages/ui/src/layout.css` — containers, reading width, editorial grid,
  stacks, and full-bleed primitive;
- `packages/ui/src/effects.css` — optional grain, vignette, scanline,
  halftone, CRT, distress, static, and sweep layers;
- `packages/ui/src/motion.css` — cursor, signal pulse, and transmission
  motion;
- `packages/ui/src/components/` — reusable DOM component functions;
- `packages/ui/src/components.css` — component presentation rules;
- `apps/web/src/system/` — internal noindex design-system preview.

The shared geometry tokens include `--hidn-radius-sm`, `--hidn-radius-md`,
and `--hidn-radius-lg`. The shared depth tokens are intentionally restrained:
`--hidn-shadow-frame` supports framed specimens, while
`--hidn-shadow-soft` and `--hidn-shadow-raised` provide tonal separation for
interactive surfaces without introducing a glossy card language.

## Composition rules

HIDN uses near-black space, bone text, and signal green as the primary
relationship. Zcash gold is sparse and contextual. Editorial display type
communicates the thought; mono/system type communicates state and metadata.

Sharp borders, small functional radii, double-line or bracket framing, and
redaction details are preferred to soft SaaS cards. Negative space is a
structural tool, not unused space.

## Identityless confession UI

Confession cards show the thought first and use only anonymous system context:
time, category, reactions, share, and report affordances. They never contain
an avatar, username, handle, follower count, verification badge, or persistent
anonymous identifier.

The composer is visual-only in Phase 1. It contains a large textarea, category
control, visibility control, anonymous action, and privacy reassurance line,
but no submission event or data persistence.

## Effects and motion

Effects remain optional and low contrast. Do not stack every texture treatment
on a single surface. Motion is short and purposeful; reduced-motion users get
static equivalents.

Public product surfaces should recede into the page atmosphere. Large
decorative regions and transmission streams use masked gradients and fading
separators rather than hard outer edges. Rounded geometry is reserved for
composers, dialogs, controls, and compact state surfaces; editorial headings,
surveillance frames, and transmission dividers retain sharper language.

## Preview

Open `/system` locally to review the full system. The page is marked
`noindex, nofollow, noarchive, nosnippet` and is excluded from public
navigation.

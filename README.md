# HIDN

HIDN is a privacy-first anonymous expression platform: a place to share
thoughts you cannot or do not want to say publicly.

This repository contains completed Phase 0 foundation work, the Phase 1 visual
design system, and the Phase 2 public frontend experience: source-of-truth
documentation, a TypeScript web app, shared tokens, reusable visual
components, local mock confession flow, metadata foundations, and reserved
future application/package boundaries. It also contains the first server-backed
Room Access boundary: Cloudflare Worker + D1 account sessions, payment intents,
and a separate Zcash watcher process.

## Start the shell

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run build
```

The public experience is available at `/`, `/confess`, and `/explore` while the
local dev server is running. Supporting pages are available at `/manifesto`,
`/how-it-works`, and `/privacy`. The individual `/c/:id` route is a local
mock detail surface and is noindex. The internal design-system preview is
available at `/system`; it is also noindex and is not linked from the public
shell. `/room/access` is the account and payment entry point; `/room` remains
closed until an account session is present.

The confession stream and its current content actions remain a browser-local
mock. Account records, sessions, payment intents, and watcher events use the
Cloudflare Worker + D1 path when deployed. Real mainnet intake is not enabled
until the D1 migration, Worker secrets, a watch-only Zcash RPC wallet, and the
separate payment watcher are configured. Refund sending still requires a
separate payout signer and policy.

See [`docs/HIDN-PAYMENTS.md`](docs/HIDN-PAYMENTS.md) and
[`apps/payment-watcher/README.md`](apps/payment-watcher/README.md) for the
setup boundary.

## Source of truth

Read the documents in `docs/` before changing the product boundary, brand,
privacy behavior, or architecture:

- `HIDN-PRODUCT.md`
- `HIDN-BRAND.md`
- `HIDN-PRIVACY.md`
- `HIDN-ARCHITECTURE.md`
- `HIDN-ROADMAP.md`

The canonical eye logo and supplied references belong in `public/brand/` and
`public/brand/references/`. The supplied reference images are now preserved at
`public/brand/references/hidn-brand-reference-01.png` and
`public/brand/references/hidn-brand-reference-02.png`. Standalone logo and
symbol files were not supplied, so neither was recreated or extracted.

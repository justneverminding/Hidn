# HIDN Architecture Source of Truth

> **Canonical status:** This document is the architecture source of truth for
> HIDN Phase 0, Phase 1, and the planned application boundaries.

## Repository shape

HIDN uses a lightweight TypeScript workspace so future surfaces can be
isolated without forcing blockchain or identity code into the consumer app.

```text
apps/
  web/       public consumer product
  payment-watcher/  separate Zcash wallet/RPC observer
  admin/     private administrative console (reserved)
  api/       backend API boundary (reserved)
packages/
  ui/        shared tokens and visual effects
  shared/    product vocabulary and cross-surface types
  privacy/   privacy protocol boundary (reserved implementation)
  zk/        browser proof-of-knowledge boundary and future ZK protocols
  zcash/     Zcash integration boundary (reserved)
public/
  brand/     supplied canonical brand assets
docs/        source-of-truth product, brand, privacy, and architecture docs
```

The public frontend and its Cloudflare Worker live in `apps/web`. The first
account/payment boundary is implemented there with D1 migrations. The
separate `payment-watcher` process observes a configured Zcash wallet RPC
endpoint and sends signed events to the Worker. `admin`, `api`, `zk`, and
`zcash` remain explicit extraction boundaries rather than public browser
surfaces.

## Deployment boundaries

The intended future topology is:

- `hidn.xyz` — public consumer product;
- `admin.hidn.xyz` — private administrative console;
- `api.hidn.xyz` — separate API domain if the service architecture requires
  one.

The admin surface must not be linked from public navigation. Deployment,
authentication, secrets, and access controls for it are later work.

## Web foundation

`apps/web` is a Vite + TypeScript shell with:

- semantic HTML landmarks and a skip link;
- shared design tokens, layout primitives, motion, effects, and DOM components
  from `@hidn/ui`;
- restrained reusable visual effects;
- a metadata module for title, description, canonical URLs, Open Graph,
  Twitter cards, robots policy, and optional JSON-LD;
- responsive breakpoints at the mobile layout boundary and the narrow-screen
  fallback;
- an internal `/system` visual design-system preview marked noindex and kept
  out of public navigation;
- public Phase 2 routes at `/`, `/room`, `/explore`, `/c/:id`,
  `/manifesto`, `/how-it-works`, and `/privacy`;
- local in-memory mock data for message content and room interactions;
  - a Worker + D1 Room Access boundary for pseudonymous accounts, browser-held
  Schnorr proof credentials, legacy hashed recovery codes, HttpOnly sessions,
  payment intents, and signed watcher events;
- a separate Node payment watcher that may observe a shielded address but has
  no spending-key or refund-signing authority.

The repository-level `/public` directory is configured as the Vite public
directory so brand assets, `robots.txt`, and `sitemap.xml` have one canonical
location.

## Metadata architecture

The metadata module separates page kind from content. Its current policy is:

- shell, public-home, public-page, and explore pages: `index, follow` by
  default;
- the internal design-system preview: `noindex, nofollow, noarchive,
  nosnippet`;
- individual anonymous confession pages: `noindex, nofollow, noarchive,
  nosnippet` until explicitly reviewed;
- admin and API surfaces: non-indexable.

When dynamic routes exist, the same rule must be emitted server-side in HTTP
headers or rendered HTML. A future server must repeat the reviewed metadata
policy in HTTP headers or rendered HTML. A sitemap should contain only intentionally public, canonical
URLs. Structured data should describe public product surfaces only; it must
never serialize confession content or sender-identifying material.

## Future privacy seams

The API and persistence design must keep confession content, proof validity,
replay prevention, moderation state, and operational metadata as separate
concerns. A future implementation must document every retained field, access
path, retention period, and deletion behavior before shipping.

The web shell must not import a general-purpose identity helper. Privacy,
proof, and Zcash logic belong behind their named package boundaries so that
the consumer surface can remain understandable and wallet-free by default.
The account milestone uses `@hidn/zk` for a browser-generated Schnorr
proof-of-knowledge credential; it is intentionally linked to the selected HIDN
handle and is not yet an operator-blind anonymous-posting protocol.

## Observability boundary

No analytics or crawler tracking ships in Phase 0. Future measurement must
prefer aggregate product signals, avoid behavioral identity, and be reviewed
against the privacy source of truth. Infrastructure logs are not permission
to create a confession history.

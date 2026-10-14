# HIDN API — reserved host boundary

This directory reserves a future standalone API host. The current API lives in
`apps/web/src/worker.ts`, shipped with the frontend as one Cloudflare Worker:
nameless membership (`/api/anonymous/*`), posts, replies, likes, reports,
notifications, moderation, room activity and Zcash network data.

The earlier account and payment endpoints were removed; see
`docs/HIDN-PAYMENTS.md` for that retired boundary.

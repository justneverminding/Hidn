# HIDN API — reserved host boundary

This directory reserves the future `api.hidn.xyz` service boundary. The first
server-backed account and payment endpoints currently live in
`apps/web/src/worker.ts` so the static frontend and Cloudflare Worker can ship
from the same deployment.

The separate host remains reserved for a later extraction. The current Worker
boundary is documented in `docs/HIDN-PAYMENTS.md`; it does not make the
browser-local confession mock a persistent public content API.

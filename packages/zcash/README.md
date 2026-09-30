# HIDN Zcash boundary

The future reusable Zcash integration belongs here. The current payment
watcher lives in `apps/payment-watcher` and uses a separate watch-only wallet
or node RPC process; it never holds a spending key. The Cloudflare Worker
receives only signed, normalized payment events and applies the D1 matching
rules described in `docs/HIDN-PAYMENTS.md`.

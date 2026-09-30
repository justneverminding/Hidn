# HIDN payment watcher

This is a separate Node process. It is not deployed inside the Cloudflare Worker.

It polls a wallet-enabled Zcash RPC endpoint with `z_listreceivedbyaddress`, extracts the one-time `HIDN-PAY-...` reference from the shielded memo when available, and forwards a signed event to the Worker. The Worker remains the authority that matches the reference, checks the exact zatoshi amount, waits for confirmations, and changes D1 access.

## Required environment

```sh
export ZCASH_RPC_URL="http://127.0.0.1:8232/"
export ZCASH_RPC_USER="..."
export ZCASH_RPC_PASSWORD="..."
export ZCASH_WATCH_ADDRESS="your-shielded-address"
export HIDN_WORKER_EVENTS_URL="https://your-hidn-host.example/api/internal/payments/events"
export PAYMENT_WATCHER_SECRET="the-same-secret-set-on-the-worker"
```

Optional values:

```sh
export WATCHER_POLL_INTERVAL_MS="15000"
export WATCHER_STATE_FILE="/var/lib/hidn/payment-watcher-state.json"
export WATCHER_FORWARD_UNMATCHED="true"
```

Run it with:

```sh
npm --workspace @hidn/payment-watcher start
```

The state file is written with mode `0600` and atomically replaced. It contains transaction IDs, output indexes, amounts, confirmation counts, and delivery status, but never stores RPC credentials or raw memos.

## Wallet boundary

Use a dedicated watch-only/viewing-capable wallet or node identity for observation. Do not give this process a spending key. Do not put a spending key in the Worker, D1, or the browser. A separate payout service or manual process is required before automatic refunds can be enabled.

The watcher should be started and tested before the first real payment is accepted. When using a shared receiving address, review historical wallet outputs before enabling unmatched forwarding; a unique receiving address per payment intent is the stronger production design.

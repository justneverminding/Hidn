# HIDN account and payment boundary

This is the first server-backed account/payment milestone for HIDN.

## What is implemented

- `POST /api/account/signup` creates a pseudonymous `HIDN-` plus letters/numbers handle and returns one random recovery code.
- `POST /api/account/login` checks the `HIDN-` plus letters/numbers handle and recovery-code hash and starts an HttpOnly session cookie.
- `GET /api/account/session` returns the current access level without exposing a recovery code.
- `POST /api/account/logout` revokes the current session.
- `POST /api/payments/intents` creates a one-time payment reference for the logged-in account.
- `GET /api/payments/intents/:id` returns the payment state for its owner.
- `POST /api/internal/payments/events` accepts signed events from a separate payment watcher.
- Exact amount, confirmation count, transaction ID, and output index are recorded in D1.
- Confirmed payment changes the account from `read_only` to `full`.
- Underpaid, overpaid, unknown-reference, expired, and reorged payments do not grant full access.
- Refund addresses are encrypted before storage when the encryption secret is configured.

The existing `room_credentials` demo endpoints remain for backward compatibility. They are not the live payment path.

## D1 migration

Apply the new migration to the configured database before deploying the Worker:

```sh
npx wrangler d1 migrations apply hidn-room --remote
```

The migration creates `hidn_users`, `hidn_sessions`, `payment_intents`, `payment_events`, and `unmatched_payments`.

## Required Worker secrets/configuration

Live payment intake intentionally stays unavailable until these values exist:

```sh
npx wrangler secret put ROOM_SHIELDED_ADDRESS
npx wrangler secret put ROOM_PAYMENT_ZATOSHIS
npx wrangler secret put PAYMENT_WATCHER_SECRET
npx wrangler secret put REFUND_ENCRYPTION_KEY
```

- `ROOM_SHIELDED_ADDRESS`: the receiving shielded address watched by the separate watcher.
- `ROOM_PAYMENT_ZATOSHIS`: the exact fixed amount expected for a payment intent. Store zatoshis, not a floating-point ZEC amount.
- `PAYMENT_WATCHER_SECRET`: a long random secret shared only by the watcher and this Worker.
- `REFUND_ENCRYPTION_KEY`: exactly 32 bytes, supplied as 64 hex characters or base64. Keep it separate from D1 and the watcher.
- `PAYMENT_MIN_CONFIRMATIONS` may be set as a Wrangler variable; it defaults to `3`.

The amount is fixed by configuration so a price change cannot silently change an already-created payment request. Change it deliberately and document the effective time.

## Watcher event contract

The watcher sends a JSON body to `/api/internal/payments/events`:

```json
{
  "network": "mainnet",
  "paymentReference": "HIDN-PAY-...",
  "transactionId": "...",
  "outputIndex": 0,
  "amountZat": 100000,
  "confirmations": 3
}
```

It must include:

- `X-HIDN-WATCHER-TIMESTAMP`: an ISO timestamp close to the current time.
- `X-HIDN-WATCHER-SIGNATURE`: `sha256=` followed by an HMAC-SHA256 hex digest of `timestamp + "." + rawRequestBody`.

`paymentReference` may be omitted when the sender did not include a memo. The Worker records that output as unmatched rather than granting access.

The Worker rejects missing, stale, malformed, or incorrectly signed events. The watcher must be idempotent: it may resend the same transaction/output as confirmations increase. The `(transaction_id, output_index, event_type)` key prevents duplicate event rows.

The repository now includes a separate `apps/payment-watcher` Node process that polls a wallet-enabled `zcashd` RPC endpoint and signs these events. It still needs a real watch-only/viewing-capable wallet, RPC credentials, Worker URL, and secrets before it can observe mainnet. Spending keys must stay outside the Worker and outside D1.

## Matching and failure behavior

The payment reference is the link between a payment intent and an account. The watcher resolves it to `payment_intents.user_id`, then checks the exact zatoshi amount and confirmation threshold.

- Correct reference + exact amount + enough confirmations: `confirmed`, account becomes `full`.
- Correct reference + exact amount + too few confirmations: `detected`, account remains `read_only`.
- Less than expected: `underpaid`, no full access.
- More than expected: `overpaid`, no full access; route to manual review/refund policy.
- Missing/unknown reference: stored in `unmatched_payments`, no full access.
- Confirmation rollback: `reorged`, then the account is recalculated from any other confirmed intent.

Funds are not automatically returned by this code. A refund address is encrypted and retained for an authorized refund process, but an automatic refund requires a separately controlled payout signer and an explicit review policy.

## Inspecting D1

The Cloudflare dashboard's D1 SQL console can inspect the tables. From a terminal, use read-only queries such as:

```sh
npx wrangler d1 execute hidn-room --remote \
  --command="SELECT user_id, username, access_level, created_at, verified_at FROM hidn_users ORDER BY created_at DESC LIMIT 50"

npx wrangler d1 execute hidn-room --remote \
  --command="SELECT payment_intent_id, user_id, status, expected_amount_zat, observed_amount_zat, confirmations, created_at FROM payment_intents ORDER BY created_at DESC LIMIT 50"

npx wrangler d1 execute hidn-room --remote \
  --command="SELECT * FROM unmatched_payments ORDER BY created_at DESC LIMIT 50"
```

Recovery-code hashes, session hashes, and encrypted refund addresses should not be exported as a public spreadsheet. If an admin export is added later, it should be a separately authenticated, redacted endpoint.

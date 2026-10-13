# HIDN account and payment boundary (retired)

> **Retired.** Handle accounts, account sessions, recovery questions, payment
> intents, the watcher ingestion route and access-code sessions were removed.
> Room access is nameless only (see `HIDN-ANONYMOUS-ZK-MILESTONE.md`), and
> reports now carry an anonymous membership proof. This document is kept as
> history for the planned Zcash verification work; none of the endpoints below
> exist any more.

This was the first server-backed account/payment milestone for HIDN.

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
- Direct tips are separate from verification: a post may expose an author-controlled
  shielded mainnet `u1` or `zs1` address and a `zcash:` payment request.
- HIDN never receives, holds, watches, or confirms direct tips. The sender chooses
  the amount in their own Zcash wallet, and the recipient controls the destination.

The existing `room_credentials` demo endpoints remain for backward compatibility. They are not the live payment path.

## Direct ZEC tips

Direct tips do not use the verification wallet, viewing key, watcher, or VPS.
An author saves an optional shielded mainnet receiving address in the profile, or
chooses a different address when composing a post. HIDN validates the address
shape, stores only the public destination, and renders a `zcash:` request with a
QR code on posts that allow tips.

The sender selects any amount in their own mainnet wallet. HIDN does not create a
receipt, grant access, or display `TIP CONFIRMED`. Address reuse can make posts
easier to associate, so authors can use a fresh shielded destination per post
when their wallet supports that workflow.

## D1 migration

Apply the new migration to the configured database before deploying the Worker:

```sh
npx wrangler d1 migrations apply hidn-room --remote
```

The migrations create `hidn_users`, `hidn_sessions`, `payment_intents`, `payment_events`, `unmatched_payments`, `hidn_reports`, and the append-only `hidn_moderation_events` audit table.

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
- `REPORT_ADMIN_TOKEN`: a long random migration secret. It is ignored unless `ALLOW_LEGACY_ADMIN_TOKEN=true`; Cloudflare Access remains the required administrator boundary by default. Never commit it or place it in frontend source.
- `ALLOW_LEGACY_ADMIN_TOKEN`: keep unset or `false` in normal operation. Set it to `true` only for a time-boxed migration window while Cloudflare Access is being configured, then remove the token and variable.
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

## Moderation reports

Logged-in accounts can submit a report for a thread or reply with a reason and
optional context. D1 stores the report target, a short content snapshot, the
pseudonymous reporter account ID, and a review status. Report submission is
rate-limited and duplicate open reports from the same account for the same
target are rejected.

The private operator console is available at `/admin/reports` after the Worker
is protected by Cloudflare Access and the Access identity is provisioned as an
active HIDN administrator. A short-lived migration can opt into the legacy
`REPORT_ADMIN_TOKEN` path with `ALLOW_LEGACY_ADMIN_TOKEN=true`; the token is
entered in memory, sent as a Bearer token, and is not saved by the browser.
The admin API can list and update report statuses, hide reported thread/reply
content, and restore a previously hidden item. Hiding is reversible and
records an event rather than deleting the report or content. Moderation
visibility is administrator-only; public room queries already filter hidden
content server-side. It never returns recovery-code hashes, session hashes, or
wallet secrets.

## Inspecting D1

The Cloudflare dashboard's D1 SQL console can inspect the tables. From a terminal, use read-only queries such as:

```sh
npx wrangler d1 execute hidn-room --remote \
  --command="SELECT user_id, username, access_level, created_at, verified_at FROM hidn_users ORDER BY created_at DESC LIMIT 50"

npx wrangler d1 execute hidn-room --remote \
  --command="SELECT payment_intent_id, user_id, status, expected_amount_zat, observed_amount_zat, confirmations, created_at FROM payment_intents ORDER BY created_at DESC LIMIT 50"

npx wrangler d1 execute hidn-room --remote \
  --command="SELECT * FROM unmatched_payments ORDER BY created_at DESC LIMIT 50"

npx wrangler d1 execute hidn-room --remote \
  --command="SELECT report_id, target_type, target_id, reason, status, created_at FROM hidn_reports ORDER BY created_at DESC LIMIT 50"

npx wrangler d1 execute hidn-room --remote \
  --command="SELECT event_id, target_type, target_id, action, reason, created_at FROM hidn_moderation_events ORDER BY created_at DESC LIMIT 50"
```

Recovery-code hashes, session hashes, and encrypted refund addresses should not be exported as a public spreadsheet. If an admin export is added later, it should be a separately authenticated, redacted endpoint.

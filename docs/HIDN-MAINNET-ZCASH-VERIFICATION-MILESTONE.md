# HIDN Mainnet Zcash Verification + Direct Tips

> **Status:** planned milestone; pre-funding work can use local Docker and
> testnet. Mainnet activation is funding-gated.

## Outcome

HIDN keeps ordinary anonymous room use free and adds two separate Zcash flows:

1. **Direct tips:** a reader sends ZEC directly to an author's shielded
   address. HIDN does not hold the funds and does not claim to confirm the
   payment.
2. **Optional verified access:** a person chooses `VERIFY WITH ZEC`, sends an
   exact payment to HIDN with a one-time memo reference, and receives the
   Worker's current confirmed-payment access after the watch-only wallet
   reports the required confirmations. The exact privileges can be edited
   later.

Zcash verification is a payment/access signal, not proof of real-world
identity. `CONTINUE FREE` remains available.

## Launch policy

The future mainnet verification amount is `0.001 ZEC`. Verification payments
are deferred until funding is available for production hosting and
maintenance. Direct mainnet tips are separate and can be enabled without HIDN
holding funds or running a verification watcher.

| Setting | Initial value |
| --- | --- |
| Verification network | Zcash mainnet |
| Verification amount | `0.001 ZEC` / `100000` zatoshi |
| Minimum confirmations | `3` |
| Direct tips | Any amount selected by the sender |
| Direct-tip custody | None; paid directly to the author's address |
| Verification wallet | Dedicated watch-only wallet |
| Spending key | Never stored on the VPS, Worker, D1, or browser |

The amount and confirmation threshold must remain configuration values rather
than being hardcoded in browser code. Before funding, use explicit `TESTNET`
or `DEMO` labels for verification and never imply that a simulated or testnet
payment is a real mainnet verification. Direct mainnet tips remain
non-custodial.

## What already exists in HIDN

- D1 tables for accounts, payment intents, payment events, and unmatched
  payments.
- Worker routes for creating and checking payment intents.
- Signed watcher-event intake.
- Exact zatoshi matching.
- Confirmation thresholds.
- Idempotent transaction/output handling.
- Reorg-aware access recalculation.
- A separate Node watcher process in `apps/payment-watcher`.
- Direct mainnet tip-address and payment-request UI (without HIDN custody or a
  payment watcher).

References:

- [Payment boundary and deployment requirements](./HIDN-PAYMENTS.md)
- [Payment watcher README](../apps/payment-watcher/README.md)
- [Architecture source of truth](./HIDN-ARCHITECTURE.md)

## What will be reused

We may reuse the open-source watch-only wallet engine used by ZECpublish,
such as `zcash-walletd`, as server-side infrastructure. We will not reuse
ZECpublish's address, viewing key, wallet data, database, callback endpoint,
or live operational environment.

The current HIDN watcher expects `zcashd` JSON-RPC received-note data. If the
chosen wallet engine exposes a different REST/API shape, add an adapter that
normalizes its output into the existing HIDN watcher event contract.

## Phase 0 — Confirm the product contract

### Decisions

- [ ] Direct tips are non-custodial and do not require HIDN confirmation.
- [ ] Zcash verification is optional; free access remains available.
- [ ] Confirm the verification amount: `0.001 ZEC`.
- [ ] Confirm the minimum confirmations or approve `3`.
- [ ] Use the Worker's current confirmed-payment access provisionally.
- [ ] Record that the access benefits may be edited in a later entitlement
  review.
- [ ] Agree on user-facing language: verification is not identity proof.

### Gate

The payment system may use the Worker's current confirmed-payment access for
the first release. Treat that access as provisional and review its exact
privileges before a broader public launch.

## Phase 1 — Create the wallet identity

### Owner actions

- [ ] Create a dedicated mainnet shielded wallet for HIDN verification.
- [ ] Create or record the shielded receiving address.
- [ ] Export the corresponding viewing key.
- [ ] Record the wallet birth height or scan start height.
- [ ] Store the spending key/seed offline and separately.

The viewing key is also sensitive: it can reveal incoming notes and memos for
the watched wallet. Do not paste it into chat, Git, frontend code, D1, or an
issue tracker.

### Gate

- [ ] Confirm the receiving address is shielded and intended only for HIDN
  verification.
- [ ] Confirm the address and viewing key correspond.
- [ ] Confirm no spending key is present on the server.

## Phase 2 — Provision the watcher host

### Pre-funding path

- [ ] Run the wallet engine and watcher locally with Docker for development
  and testnet acceptance.
- [ ] Keep mainnet viewing keys and mainnet receiving addresses out of local
  development configuration.
- [ ] Keep mainnet Worker intake disabled.

### Funded production path

### Owner actions

- [ ] Create a VPS, initially a small Ubuntu LTS instance with approximately
  2 GB RAM.
- [ ] Add an SSH public key; keep the private key private.
- [ ] Enable a firewall allowing SSH only from an approved administration
  source and no public wallet API.
- [ ] Install Docker Engine and Docker Compose from the official Docker
  instructions.
- [ ] Enable automatic security updates or establish a patch schedule.

### Required server properties

- Persistent storage for wallet scan state.
- Restart-on-failure for wallet and watcher services.
- Encrypted or access-controlled environment secrets.
- Outbound HTTPS access to the HIDN Worker.
- Monitoring for process failure, disk exhaustion, and stale scans.

### Gate

- [ ] The VPS can be reached over SSH.
- [ ] Docker runs a harmless test container.
- [ ] Wallet APIs are private and not exposed to the public internet.

## Phase 3 — Run the watch-only wallet engine

### Implementation

- [ ] Pin a reviewed wallet-engine image/version.
- [ ] Mount a persistent wallet data directory.
- [ ] Inject the viewing key through the server secret mechanism.
- [ ] Configure the mainnet network and scan start height.
- [ ] Configure the lightwalletd/Zcash data source.
- [ ] Disable or omit all spending-key functionality.
- [ ] Add a health check and logs that do not print the viewing key or raw
  memo contents.
- [ ] Run a controlled incoming test and verify that the note is visible to
  the watch-only wallet.
- [ ] Before funding, perform this validation on testnet or with a local
  fixture only.

### Gate

The wallet service must detect a test note without possessing any authority to
spend from the wallet.

## Phase 4 — Connect the HIDN watcher

### Implementation

- [ ] Add the wallet-engine adapter if required.
- [ ] Read transaction ID, output index, amount, memo/reference, and
  confirmations.
- [ ] Decode and validate the `HIDN-PAY-...` reference.
- [ ] Normalize the event to:

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

- [ ] Sign the raw event body with the watcher HMAC secret.
- [ ] Retry failed Worker deliveries.
- [ ] Persist watcher state with restrictive file permissions.
- [ ] Resend confirmation updates as the count increases.
- [ ] Detect an output disappearing and report a reorg state.

### Gate

- [ ] The same output can be delivered repeatedly without duplicate access.
- [ ] A wrong amount never grants verified access.
- [ ] A missing or unknown memo reference never grants verified access.
- [ ] A reorg removes access until another valid confirmed payment exists.

## Phase 5 — Configure Worker and D1

### Owner actions

Apply the D1 migrations:

```sh
npx wrangler d1 migrations apply hidn-room --remote
```

Set secrets through Wrangler or the approved deployment secret manager:

```text
ROOM_SHIELDED_ADDRESS
ROOM_PAYMENT_ZATOSHIS
PAYMENT_WATCHER_SECRET
REFUND_ENCRYPTION_KEY
```

Set or verify:

```text
PAYMENT_MIN_CONFIRMATIONS=3
```

Do not commit any of these values to the repository.

### Implementation checks

- [ ] The Worker accepts only signed watcher events.
- [ ] The event timestamp window is enforced.
- [ ] The network must be `mainnet`.
- [ ] The expected amount is compared in zatoshi.
- [ ] Payment intents expire.
- [ ] Underpaid and overpaid payments do not grant access.
- [ ] Refund addresses remain encrypted and refunds remain manual until a
  separately controlled payout process exists.

### Gate

The Worker must remain unavailable for live intake until the receiving address,
amount, watcher secret, and encryption key are configured.

## Phase 6 — Build the verification UI

- [ ] Keep `CONTINUE FREE` visible.
- [ ] Add or refine `VERIFY WITH ZEC`.
- [ ] Create a one-time payment intent.
- [ ] Display the exact amount in ZEC and zatoshi-safe backend data.
- [ ] Display the receiving address.
- [ ] Display the one-time memo reference.
- [ ] Generate a ZIP-321 payment URI and QR code where supported.
- [ ] Show `WAITING FOR PAYMENT`.
- [ ] Show confirmation progress, for example `2 / 3 CONFIRMATIONS`.
- [ ] Show `PAYMENT VERIFIED` or `VERIFIED ACCESS` only after the Worker
  confirms the payment.
- [ ] Use the current Worker access behavior initially and keep its privileges
  documented as provisional.
- [ ] Explain that the payment is not identity verification.

## Phase 7 — Enable direct mainnet tips (no VPS required)

- [x] Change direct-tip address validation from testnet-only to shielded
  mainnet addresses.
- [x] Keep the tip destination author-controlled.
- [x] Do not require the author's viewing key.
- [x] Use a direct Zcash payment URI and QR code.
- [x] Clearly label the flow `DIRECT TIP`.
- [x] Do not show `TIP CONFIRMED` unless a separate recipient-wallet
  confirmation system is later added.
- [x] Preserve the warning that address reuse can make posts easier to
  associate.

## Phase 8 — Testnet and mainnet acceptance

### Testnet acceptance

- [ ] Create a test payment intent.
- [ ] Send a testnet payment with the memo reference.
- [ ] Confirm watcher detection.
- [ ] Confirm Worker signature validation.
- [ ] Confirm `detected` status before the threshold.
- [ ] Confirm `confirmed` status at the threshold.
- [ ] Confirm the UI changes to `VERIFIED ACCESS`.
- [ ] Test underpayment, overpayment, missing memo, duplicate delivery, and
  reorg behavior.

### Mainnet canary

- [ ] Confirm the funding gate has been satisfied.
- [ ] Provision the funded production watcher host.
- [ ] Configure the mainnet address, viewing key, and Worker secrets.
- [ ] Use a fresh verification intent.
- [ ] Configure the verification amount as `0.001 ZEC` / `100000` zatoshi.
- [ ] Send one controlled small mainnet payment.
- [ ] Confirm the watcher sees the correct transaction/output.
- [ ] Confirm D1 records the exact amount and confirmation count.
- [ ] Confirm access changes only after the configured threshold.
- [ ] Confirm no spending capability exists on the VPS.
- [ ] Confirm direct tips still go directly to authors.

## Phase 9 — Funding gate and production launch

Do not activate mainnet ZEC payments until funding is available for the
production watcher host, secure secret storage, and ongoing maintenance.

After the funding gate is satisfied, require all of the following:

- [ ] Mainnet payment was verified end to end.
- [ ] The verification amount is configured as `0.001 ZEC` / `100000` zatoshi.
- [ ] Worker, watcher, and wallet logs contain no secrets.
- [ ] Wallet API is not public.
- [ ] Secrets are not in Git, browser bundles, D1 rows, or screenshots.
- [ ] Persistent wallet data has a recovery/backup procedure.
- [ ] Watcher restart and replay behavior has been tested.
- [ ] D1 migrations are applied remotely.
- [ ] Direct tips are clearly distinguished from verified access.
- [ ] The UI does not claim that payment proves identity.
- [ ] The current confirmed-payment access has been reviewed and is clearly
  marked as provisional if its final privileges have not been decided.
- [ ] A manual-review process exists for overpayments, underpayments, and
  refunds.

## Definition of done

The milestone is complete when a person can use HIDN for free, optionally
request ZEC verification, send the exact mainnet amount with a one-time memo,
and receive `VERIFIED ACCESS` only after the watch-only wallet and Worker have
confirmed the payment, while direct tips remain non-custodial and go directly
to authors.

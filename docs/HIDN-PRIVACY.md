# HIDN Privacy Source of Truth

> **Canonical status:** This document is the privacy source of truth for HIDN.
> It describes design commitments and boundaries, not a claim that Phase 0 is
> a completed anonymous confession protocol.

## Core question

For every field, event, integration, and log:

**WHAT DOES THIS REVEAL, AND CAN WE REVEAL LESS?**

HIDN must measure the product, not the person. Basic confession should be
possible without an account, email address, username, profile, public sender
identifier, or visible confession history.

## Identity boundary

Do not model anonymous confessors as ordinary users. In particular, do not add
a traditional `users` table merely to make anonymous posting convenient.

Future proof and moderation designs must distinguish:

- the confession content and its moderation state;
- the proof or eligibility material needed to validate a post;
- any nullifier or replay-prevention value; and
- operational metadata that is strictly necessary to run the service.

These boundaries must not silently become a persistent public identity or a
cross-confession behavioral history.

## Data minimization defaults

Until a later milestone specifies and justifies a field, assume that HIDN
should not collect or retain:

- email, password, or account profile data for basic confession;
- persistent public sender identifiers;
- wallet addresses attached to ordinary confessions;
- browser fingerprints;
- invasive analytics identifiers;
- more location, device, or network metadata than an explicitly reviewed
  abuse-prevention requirement needs.

“Anonymous” is not a promise that every layer of a future deployment has zero
metadata. Product copy must name concrete behavior and known limitations.

## ZK and Zcash boundary

Room access is nameless. The browser creates a secret, which is also the
recovery key, and sends the Worker only a Poseidon commitment to join the
member tree. Each post, reply, reaction and report carries a Groth16 proof that
the sender is a member, without revealing which one. The Worker never receives
the secret. This does not hide transport metadata such as IP addresses or
timing; that needs a relay or Tor transport. Handle accounts were removed.

Likes use a nullifier scope fixed to the post, and the scope is a public
proof signal (protocol version 2), so each member can like a post once while
likes on different posts stay unlinkable. HIDN must not imply that a wallet is required for
basic confession, or that Zcash verification is live (it is "coming soon").

Shielded ZEC tips are live and opt-in: they go wallet to wallet, and HIDN
stores only the public receiving address the author chose. Future paid
features must stay opt-in, separately explained, and isolated from the
default confession path.

## Private links

A member's private link (`/to/<slug>`) accepts messages from anyone, with no
key needed to send. The server stores the link, its prompt, an optional tip
address and the hash of an inbox key derived in the browser from the member's
recovery key; it does not store which member owns the link. Messages are
stored as plain text and are readable by the link owner and the service
operator; they are not end-to-end encrypted. Sending is rate-limited at the
edge and capped at 120 messages a day per link.

## Admin and moderation

The moderation console currently runs behind Cloudflare Access on the main
Worker and is not public navigation (a separate `admin.hidn.xyz` is planned). Admins must eventually be able to manage content, reports,
moderation, proofs, nullifiers, SEO, crawler policy, settings, and audit logs
without being given a routine mechanism to identify anonymous confessors.

Moderation authority and operational access are not evidence of sender
identity. Admin audit logs must themselves be reviewed for data minimization.

## Discovery and analytics

Individual anonymous confession pages should initially be treated as
`noindex, nofollow, noarchive, nosnippet` until a later product decision
explicitly changes that policy. This is also represented in the shared
metadata policy (`anonymous-confession` page kind).

`robots.txt` is a crawler hint, not a privacy control. Dynamic page metadata
and server-side response headers will need to agree when the public product is
implemented. No crawler tracking or analytics system is built in Phase 0.

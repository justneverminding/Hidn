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

The broader zero-knowledge and Zcash protocol remain future technical
components. HIDN must not imply that a proof has been verified for an
anonymous post, that a Zcash network is online, or that a wallet is required
for basic confession.

Future ZEC features may include shielded tips, optional value attachment, or
anonymous entitlements. Those flows must be opt-in, separately explained,
and isolated from the default confession path.

## Admin and moderation

The future admin product lives at `admin.hidn.xyz` and is not public
navigation. Admins must eventually be able to manage content, reports,
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

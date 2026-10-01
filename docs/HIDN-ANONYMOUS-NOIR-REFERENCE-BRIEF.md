# HIDN Anonymous Internet Noir Reference Brief

> **Status:** Research translation only. This brief does not authorize a new
> visual redesign, asset replacement, or product-phase expansion.

## Purpose

This brief translates the Kroma research references into HIDN-specific visual
rules. The references are mood, composition, and interaction studies only.
HIDN's approved brand assets, existing product direction, and design-system
tokens remain authoritative.

The central HIDN idea is:

**CONTENT EMERGING FROM DARKNESS.**

The interface should feel like one continuous anonymous communication space:
near-black atmosphere, a readable thought, quiet system signals, and texture
that dissolves before it becomes a visible panel.

## Research translation

### 1. Private communication should feel intentional, not social

The Session reference is useful for the feeling of private communication and
for treating metadata minimization as a product concern rather than a visual
decoration. HIDN should communicate presence without exposing a persona.

Translate this into:

- thought-first content;
- no avatars, usernames, handles, follower counts, or persistent anonymous IDs;
- short privacy reassurance near the action;
- system context that explains state without creating a social profile;
- visual anonymity without claiming that the interface itself proves technical
  anonymity.

### 2. Terminal language should clarify state

Terminal references are useful for hierarchy, status, transmission, and
system-context language. They should make the interface feel received and
deliberate, not turn HIDN into developer software.

Translate this into:

- mono labels for channel, visibility, time, status, and transmission state;
- bone or muted text for the thought itself;
- signal green for active, available, or confirmed states;
- short labels such as `PRIVATE SURFACE`, `READ ONLY`, or `TRANSMISSION`;
- no terminal-only copy when plain language is clearer.

### 3. Black space is a field, not a card stack

Dark editorial references are useful for contrast, scale, and atmosphere. HIDN
should use blackness as the surrounding field and let content sit inside it
without exposing the bounds of decorative layers.

Translate this into:

- near-black global canvas with restrained tonal shifts;
- strong bone display type for the central thought;
- generous negative space around the composer and message stream;
- asymmetric or editorial composition where it improves focus;
- no glossy SaaS surfaces, repeated floating cards, or heavy panel borders.

### 4. Green is a signal, not wallpaper

Dark-green references are useful for state contrast and phosphor-era mood. HIDN
should keep green sparse so it remains meaningful.

Translate this into:

- signal green for primary action, active state, cursor, and selected status;
- muted green for quiet borders and secondary system information;
- bone for readable content and major statements;
- gold only for a sparse, contextual Zcash relationship;
- no purple Web3 palette and no full-screen neon wash.

### 5. Texture should dissolve before the container edge

CRT, grain, scanline, and dark-background references support HIDN's noir
atmosphere, but the effect must feel environmental rather than layered inside
a rectangular box.

Translate this into:

- use one or two low-contrast effects at a time;
- mask grain, glow, scanlines, halftone, and CRT layers at their edges;
- fade horizontal dividers near both sides instead of terminating them hard;
- continue the page atmosphere through message regions;
- remove or reduce texture when it competes with reading or controls;
- never use texture as the only carrier of meaning.

## HIDN visual rules

### Hierarchy

1. The confession or headline is the first visual read.
2. The composer action is the second read.
3. Privacy and visibility context comes next.
4. Technical metadata remains available but quiet.
5. Atmosphere supports the hierarchy and never becomes the subject.

### Typography

- Use editorial display type for the thought, manifesto, and primary headline.
- Use a neutral sans for explanatory copy, forms, and readable body text.
- Use mono/system type for state, labels, timestamps, and transmission cues.
- Preserve readable line length and deliberate line breaks on mobile.
- Do not use mono type for every sentence.

### Layout and edges

- Treat large message and transmission regions as full atmospheric fields.
- Prefer masked gradients, soft shadows, and fading separators to vertical
  borders.
- Let decorative layers fade before the viewport or content boundary.
- Keep individual message rows tonally close to the global background.
- Preserve generous breathing room without introducing empty ornamental space.
- Test 390px, 430px, mobile landscape, tablet, and wide desktop layouts for
  overflow and accidental seams.

### Motion

- Use short transmission reveals, restrained cursor behavior, and signal
  feedback only where they clarify state.
- Keep the composer available immediately.
- Respect `prefers-reduced-motion: reduce` with static equivalents.
- Do not use sound, screen shake, aggressive glitching, or cinematic delays.

### Privacy language

Visual design must not make technical claims that the implementation does not
support. The words `anonymous`, `private`, `no history`, or similar labels must
match the actual product behavior and deployment architecture. A noir surface,
hidden identity, or redaction effect is not proof of IP protection, metadata
protection, zero knowledge, or a cryptographic protocol.

## Approved asset boundary

- Preserve `/public/brand/references/hidn-brand-reference-01.png` and
  `/public/brand/references/hidn-brand-reference-02.png` byte-for-byte.
- Use the approved logo derivatives documented in `HIDN-BRAND.md` where the
  product explicitly calls for the HIDN mark.
- Do not generate substitute logos, crop new references, recolor the eye, or
  import third-party imagery to stand in for HIDN's approved artwork.
- Any future texture or image asset must be separately reviewed for source,
  license, and brand fit.

## Kroma research references

These links are research sources, not approved HIDN assets. The URLs do not
grant permission to reuse screenshots, logos, illustrations, code, or copy.

1. [Session Private Messenger](https://getsession.org/) — privacy-first
   messaging framing and a non-social communication posture. Session branding,
   interface, and assets remain its own.
2. [Terminal Design System](https://uidesignprompts.com/prompts/terminal-design)
   — terminal hierarchy, labels, and state language. Reuse only general ideas
   unless the source terms explicitly permit more.
3. [Dribbble terminal-interface search](https://dribbble.com/search/terminal-interface)
   — broad visual studies of terminal layouts and green-on-black treatments.
   Individual shots belong to their creators.
4. [Awwwards black websites](https://www.awwwards.com/websites/black/) —
   curated dark composition, contrast, and editorial scale. Follow the terms
   of each linked site; the gallery is not a reuse license.
5. [ReallyGoodDesigns black website examples](https://reallygooddesigns.com/black-website-examples/)
   — depth, atmosphere, and bold typography on black fields. Examples and
   screenshots remain copyrighted by their respective owners.
6. [Wholegrain Digital dark colour web design](https://www.wholegraindigital.com/blog/dark-colour-web-design/)
   — readable dark palettes and controlled green contrast. Article content and
   examples are reference material, not HIDN assets.
7. [Tubik Studio dark-background UI inspiration](https://tubikstudio.com/blog/ui-inspiration-14-elegant-interfaces-using-dark-background/)
   — practical dark UI composition and restrained visual separation. Do not
   copy its illustrations, screens, or layouts.
8. [Shutterstock black-background web design](https://www.shutterstock.com/blog/black-background-design-for-websites)
   — using texture, gradients, and imagery against black. Shutterstock imagery
   and examples may require paid licenses; none should be copied into HIDN.

## Decision gate for future implementation

Before applying research to the interface, confirm:

- the change improves thought-first readability;
- the change preserves HIDN's near-black, bone, and signal-green relationship;
- decorative layers remain continuous and do not reveal hard rectangles;
- the change does not introduce social identity, wallet-first, or generic Web3
  patterns;
- any privacy wording is true of the current implementation;
- any new asset has a verified license and is not a substitute for approved
  HIDN artwork; and
- desktop, mobile portrait, and mobile landscape remain usable with reduced
  motion enabled.


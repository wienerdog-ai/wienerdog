---
id: WP-quarantine-banner-location
title: Fix the self-falsifying quarantine banner and pin its slot
status: Draft
model: sonnet
size: S
depends_on: [WP-preservation-abort-widening]
adrs: [ADR-0004]
epic: dream-promotion
---

# WP-quarantine-banner-location: Fix the self-falsifying quarantine banner and pin its slot

> **Draft stub from the 2026-08-31 handover.** Measured during the
> promote-in family's round-1 verification; owner-sequenced AFTER
> `WP-preservation-abort-widening`. The cited lines were measured at family
> time (`ledger.js:449` and `:472`) — line numbers rot on every merge, so
> re-locate by content, not by number.

## Context (read this, nothing else)

Two banner defects were measured in `src/core/dream/ledger.js` (at the time:
`:449`, `:472`): the quarantine banner as rendered contradicts the state it
reports — a self-falsifying banner ("must not slip further than its slot"
was the owner's phrasing: the banner's message must stay attached to the
entry it describes, and must not migrate to a position where it describes a
different entry). After `WP-preservation-abort-widening` lands, the banner
must READ the preservation record rather than re-deriving its own account of
what was preserved — one source of truth, the same registered-mirror
discipline the family used everywhere.

## What done means

1. The banner's text and position agree with the ledger state it reports, for
   every entry shape the ledger can hold (including the only-copy abort
   entries introduced by the dependency WP).
2. The banner is derived from the preservation record — no second derivation.
3. Tests: a RED for the measured misplacement (banner beside the wrong
   entry), and a RED for a banner that contradicts its own entry's state.

## Watch out

- Digest/report rendering has strict neutralization rules (see
  `docs/THREAT-MODEL.md`, the digest bounding bullet): any value carried into
  a banner is either code-owned or passes a named neutralizer. Do not widen
  the injection surface while fixing the location.

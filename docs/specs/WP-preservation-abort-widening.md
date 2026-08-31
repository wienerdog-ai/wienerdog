---
id: WP-preservation-abort-widening
title: Widen the only-copy abort trigger from the named case to its class
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0012]
epic: dream-promotion
---

# WP-preservation-abort-widening: Widen the only-copy abort trigger from the named case to its class

> **Draft stub from the 2026-08-31 handover.** Owner-ruled during the
> promote-in family (2026-08-31 rounds); ruled to land AFTER the family's
> merges and BEFORE `WP-quarantine-banner-location` (sequencing is an owner
> ruling — keep it). Mature to Ready before implementing; the table/row ids
> below live in `docs/specs/done/WP-dream-promote-in-workspace.md` — read
> them there, and re-measure every claim.

## Context (read this, nothing else)

During the promote-in design rounds the owner ruled on the "only-copy abort
hole": when a preservation step leaves the workspace holding the SOLE
surviving copy of content, the run must abort rather than continue — and the
ruling widened the G5 trigger from the specific named case to the whole
class, on Q4's "every party" binding. The Q18 message fields carry what the
abort must say. The ledger banner must read the preservation record (not
re-derive its own account) — that half is `WP-quarantine-banner-location`'s
subject and depends on this WP landing first.

## What done means

1. G5's trigger covers the CLASS (any only-copy state produced by a failed
   preservation), not the enumerated case; the canonical row states the class
   and cites the ruling.
2. The abort's user-facing message carries the Q18 fields.
3. Tests: one RED per class member the trigger must catch, plus a mutation
   proof that the widened trigger cannot be narrowed back silently.

## Watch out

- The class widening must not weaken the family's iron rule: the run never
  touches the user's index or vault outside the promotion chokepoint; an
  abort path is not licensed to "clean up" user state.
- Whichever surface states the trigger (row, code comment, test name) —
  registered mirrors move together, in the same commit.

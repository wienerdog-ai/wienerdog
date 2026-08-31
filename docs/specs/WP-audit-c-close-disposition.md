---
id: WP-audit-c-close-disposition
title: Measure C2 (git seam) and C3 (layout) against the landed promote-in architecture and close group C
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0012]
epic: audit-close
---

# WP-audit-c-close-disposition: Measure C2 (git seam) and C3 (layout) against the landed promote-in architecture and close group C

> **Draft stub from the 2026-08-31 handover.** A disposition pass, not a
> build: mostly measurement and recording. Mature to Ready before running.

## Context (read this, nothing else)

The audit's group C ("dream write fence" — the dream could write
machinery-controlling files: harness-instruction files, git control state,
gitignored/invisible paths) was split during the program into C1 (the fence
itself) → C2 (the git seam) → C3 (layout), serialized. C1's structural answer
is the promote-in family, now Done: the brain writes a workspace, only
promoted content enters the vault through a single identity-anchored
chokepoint, and the run's own git calls are default-deny shape-pinned.

C2 and C3 were never dispositioned — they await MEASUREMENT against the
landed architecture. The strong hypothesis is that much of both is mooted
(the brain no longer writes the vault at all; the validator's old in-vault
`git add`/`git commit` path was retired; the run's git env/index handling is
contracted in Table W), but "likely mooted" is not a disposition.

## What done means

For each original C2/C3 finding (source: the audit's group C ruling — the
original findings are M7, M9, M10; their measured basis is recorded in the
group C section of the audit ruling and partially in
`docs/specs/done/` fence-family Superseded specs):

1. Measure on the current tree whether the finding's mechanism still exists.
2. Record the disposition in a logbook entry: **mooted** (with the retiring
   cause named — the standing discipline: a narrowing/mooting records what
   retired it and where protection now lives) or **open** (in which case it
   becomes its own Draft WP, not a fix inside this one).
3. Group C is then formally closed in `docs/HANDOVER.md`'s status table (or
   its successor tracking doc).

## Watch out

- Do not trust the original line-number citations — they are a month of
  merges old. Grep by content.
- The archive's harness-refusal measurement for `.git` writes was explicitly
  ruled non-load-bearing (unverified third-party behavior); if a disposition
  needs it, re-measure it live or route around it.

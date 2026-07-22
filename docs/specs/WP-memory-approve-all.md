---
id: WP-memory-approve-all
title: memory approve --all convenience (batch-ratify pending identity notes)
status: Draft
model: opus
size: S
depends_on: [WP-identity-seed-gate-couple]
adrs: [ADR-0021]
epic: p0-ungate
---

# WP-memory-approve-all: batch-ratify pending identity notes

## Context (read this, nothing else)

Post-0.10.0-unfreeze, `seedApprovals` no longer auto-trusts identity notes on
`sync` (the dream can now author them — WP-identity-seed-gate-couple), so a fresh
adopt→sync leaves the four identity notes unapproved until the human ratifies each
via `wienerdog memory approve <note>`. Approving four notes one at a time is
avoidable friction (accepted residual I-R1). This adds `wienerdog memory approve
--all` to ratify all PENDING notes in one command — **without weakening** the
security boundary: it shows EACH pending note's exact bytes, then takes ONE
typed-word "approve" confirmation from a real TTY (no `--yes`/headless/env bypass),
and iterates the FIXED `KNOWN` allowlist (never an arbitrary path).

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/memory.js | `approve --all`: collect the pending (exists on disk AND current-bytes ≠ approved-hash) notes from the fixed KNOWN allowlist; show each note's bytes + evidence; ONE typed-word confirmation ratifies the batch; skip already-approved; no-op message when none pending. Single-note path unchanged. |
| modify | tests/unit/memory-cli.test.js | `--all` ratifies all pending with ONE prompt; skips already-approved; no-op when all approved; cancels on non-"approve" and records nothing |

## Security checklist

- [ ] `--all` preserves the see-the-bytes property (every ratified note's exact
      bytes are displayed) and the TTY typed-word confirmation (no `--yes`/headless/
      env bypass); it iterates the fixed KNOWN allowlist, never an arbitrary path;
      cancel records nothing.

## Acceptance criteria

- [ ] `wienerdog memory approve --all` ratifies every pending identity note with a
      single confirmation; already-approved notes are skipped; nothing pending → no-op.
- [ ] `npm test` + `npm run lint` pass.

## Definition of done

1. Verification passes.
2. Conventional commit `feat(memory): approve --all batch-ratifies pending identity notes (WP-memory-approve-all)`.
3. Spec `status:` → In-Review.

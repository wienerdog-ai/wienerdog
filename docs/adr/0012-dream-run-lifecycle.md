# ADR-0012: Dream run lifecycle — session-edit pre-commit, crash revert, durable alerts

Status: Accepted
Date: 2026-07-04

## Context

The first production night (2026-07-04) exposed three lifecycle gaps: ordinary
interactive-session vault edits left the tree dirty, so the dream's clean-tree
gate starved it for 10 hours of silent hourly retries; a transiently-crashed
brain left unvalidated writes that the same gate then refused forever
(self-starvation); and the failure surface — a digest banner regenerated away
by the next sync — proved transient exactly when durability was needed.

## Decision

The dream run adopts a three-part lifecycle (WP-039/WP-041):

1. **Pre-commit of session edits.** After acquiring the lock and before the
   brain runs, the orchestrator commits any uncommitted vault changes as its
   own commit (`vault: session edits before dream`). This is versioning of the
   user's OWN working-tree state — no model-authored content — and it
   preserves one-commit-per-dream revertibility for the dream's writes.
2. **Crash revert by construction.** Because of (1), any dirt present after a
   nonzero brain exit is brain-authored by construction; the orchestrator
   reverts it (scoped git restore/clean of the vault) before releasing the
   lock. A crashed dream can no longer starve future dreams.
3. **Durable alerts.** Job failures append to `state/alerts.jsonl`
   (mechanics, not vault); the digest renderer prepends a plain-language alert
   block while unresolved alerts exist; the next successful run of the same
   job clears them. Email stays best-effort; the transient banner is removed.

## Consequences

- Users' vault edits get committed automatically with a fixed, recognizable
  message — a new durable behavior: the vault's git history now interleaves
  `vault: session edits before dream` commits with dream commits. Documented
  in user-facing docs; reversible like any commit.
- Failures stay visible across digest regenerations until resolved (accepted:
  clears one regeneration after success, not instantly).
- Threat model: the pre-commit introduces no model-writable surface (it
  records existing user state); alerts are rendered as plain text with no
  instruction-following framing and live outside the vault. T6 updated.

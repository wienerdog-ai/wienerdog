---
date: 2026-09-26
title: "WP-ep2-retention-prune-timing-test superseded by its two Done successors"
related_wps: [WP-ep2-retention-prune-timing-test, WP-ep2-n2-rehome, WP-ep2-prune-once-per-run-test]
---

# WP-ep2-retention-prune-timing-test: Superseded (2026-09-26)

The 2026-09-18 assessment (`2026-09-18-ep2-retention-prune-timing-test-stale.md`)
found the package architecturally stale and named two successors, both then
`Draft`. Measured on `main` at `37b35c37` today, both are `Done`:

| Successor | Landed | What it closed |
|-----------|--------|----------------|
| `WP-ep2-n2-rehome` | PR #285, merge `862f8277` | Table N row N2 and its mirrors re-homed onto `src/cli/dream.js`'s one prune call |
| `WP-ep2-prune-once-per-run-test` | PR #293, merge `85029a8e` | the missing detector: one pipeline-suite test plus one ADR-0042 RED declaration |

Nothing this package promised remains undelivered, so it takes the terminal
status `Superseded` and moves to `done/`, per `docs/specs/README.md`. Handover
pass #20 listed "delete or keep" as an owner decision; the owner's 2026-09-26
instruction to drive the queue is the basis, and `Superseded` is the
process-conformant form of "delete" — the evidence stays findable and the
specs root holds only pending work. The July 2026 text is preserved unedited
under the banners, as history.

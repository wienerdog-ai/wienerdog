---
date: 2026-08-13
title: "Vault-snapshot gating: three design blockers and the measurement that reopens the parked report-provenance decision"
related_wps: [WP-gate-vault-snapshot]
---

# Vault-snapshot gating: design blockers found in review (2026-08-13)

`WP-gate-vault-snapshot` was drafted from the 2026-08-13 intent brief and taken
through the full review regime: template conformance (clean-context executor),
an internal coherence pass, and three external adversarial rounds. Round zero
returned CONFORMANT with 23 coherence findings, all fixed. Rounds 1, 2 and 3
each returned **NO-SHIP**, and each landed findings that changed the mechanism
rather than the wording.

The loop is stopped at round 3 rather than patched a fourth time, per
`docs/runbooks/codex-review.md`: "when two consecutive rounds land findings of
the same kind, the next step is a design question, never another textual
patch." The surface had grown from roughly 480 to 667 lines across the rounds —
the growth pattern that runbook names as the treadmill, not the convergence.

**What survives review intact:** the snapshot's own per-file gate chain (the
spec's Table A) — a single read, a UTF-8 faithfulness check, the digest's
provenance gate reused rather than reimplemented, and the digest's secret scan,
every skip visible through the existing `skipped[]`. No round found a fault in
it. All three blockers below are about the dream-report provenance STAMP and
the product behaviour it drives.

## Blocker 1 — the stamp lives in a model-writable file, so read-back cannot be authenticated

The stamp is a code-written `derived_from_untrusted` frontmatter block on the
dream report. To stop a clean second run from relabelling a tainted report, the
spec made the write raise-only: the value written is the OR of this run's
computed value and any value already in a code-owned leading block.

That argument held only within one run. Measured escape, reproduced against
`parseNoteResult` at HEAD:

1. Run 1 takes tainted input; code stamps `true`; the report commits.
2. A second run starts **on the same date** — the report file is date-keyed.
3. The dream model, which is instructed to author the report body
   (`skills/wienerdog-dream/SKILL.md:409-425`), rewrites the leading block to
   `false` and leaves run 1's tainted body in place.
4. Run 2's own computed value is `false`.
5. The code reads the "prior" value back out of the file the model just
   rewrote. `false OR false` is `false`.
6. `parseNoteResult` returns `null` — trusted — and the report reaches the
   snapshot.

The shape of the block proves nothing about who wrote it, so no read-back from
that artifact is trustworthy. A fix has to derive the prior value from a
pre-brain baseline or from code-owned state outside the vault. That is a design
change, not a patch.

## Blocker 2 — the message-dropping signal does not exist inside the WP's boundary

The stamp must fire when the run's transcripts may have LOST a `tool_result`
message, because transcript intake keeps the newest messages and drops the
oldest: the evidence can disappear while the assistant text derived from it
survives.

It must NOT fire on a per-message text cap, where the message and its role
survive and nothing can be hidden.

Today one boolean, `truncated`, covers both. The extract that reaches
`validateAndCommit` carries only the final `messages` array and that conflated
flag; the original message count, the count-cap drop and the water-filling drop
are all gone by then. The `truncatedToFit` fact exists only in `collectExtracts`'
`entries` metadata, and production passes `validateAndCommit` just `sel.wrote`
— an array of scratch paths.

So the distinction cannot be derived from the consumer input. Carrying it
requires a new code-owned field propagated from the producer sites in
`src/core/transcripts/index.js` and `src/core/dream/scratch.js` — neither of
which is in this WP's Deliverables table, which CI enforces as a hard
permission boundary.

## Blocker 3 — the measurement, which reopens the parked product decision

This is the measurement the work package was supposed to deliver **after**
implementation. Review delivered it first, which is cheaper, and it is decisive.

Measured over the transcripts discoverable on the maintainer's machine:

| Quantity | Result |
|---|---:|
| Transcripts discovered | 10,118 |
| Parseable extracts | 9,927 |
| Contain a `tool_result` message | 89.94% |
| `truncated === true` | 97.13% |
| Naive `truncated OR tool_result` rule fires | 98.64% |
| Refined rule (message-dropping only, or `tool_result`) fires | 89.99% |
| **Plausible daily runs whose stamp fires** | **98.57%** (138 of 140) |

The run-level figure is what matters, because a run's stamp fires if ANY of its
transcripts does. `daily-digest`'s only snapshot input is the newest dream
report, so a firing stamp empties its snapshot completely.

Refining the rule barely helped: the residual rate is dominated by
`tool_result` presence at 89.94%, not by truncation. **Exclusion as the interim
behaviour would starve `daily-digest` on essentially every run.**

The "plausible runs" grouping is an inference — extracts grouped into calendar
days by local mtime, then the current 8 MB water-filling rule applied — not a
historical run ledger, because `cleanScratch` destroys scratch after every run.

This is exactly the expectation recorded when the decision was parked in
`docs/specs/logbook/2026-08-05-parked-report-provenance-product-decision.md`:
"the stamp will fire often, and the daily-digest routine's *only* snapshot input
is the newest dream report — so frequent exclusion starves that routine." The
measurement confirms it at a rate that makes the interim behaviour untenable.

**The decision is the owner's and is not ruled here.** Exclusion versus
label + warn + inherit is the parked question, and it now has the number it was
waiting for.

## Two smaller findings, recorded so a later round does not re-derive them

- **The atomicity criterion contradicts the unchanged append path.** Making the
  stamp write atomic protects the leading block, but the enforcement and
  redaction sections are still appended afterwards, so an interruption between
  those appends still leaves a logically partial report that the next run's
  `precommitSessionEdits` can commit as a user edit. Either the whole final
  report is assembled in memory and swapped once, or the criterion is narrowed
  to the leading block and the append residual is named honestly.
- **A `grep` gate is not proof of reuse.** The gate asserting that the snapshot
  calls the digest's `parseNoteResult` passes on a file containing only a
  comment mentioning the name — verified in a throwaway clone. The same
  false-green class as the neutralizer gate fixed in round 2. Reuse has to be
  proven behaviourally, not lexically.

## Discovered issue (not in scope, not fixed)

`activeQuarantines` (`src/core/dream/ledger.js`) passes
`String(rec.reason || 'unreadable')` from the dream ledger into a digest
control-plane banner without re-validating it against the set that wrote it. A
corrupt or forward-schema ledger could put raw text, newlines included, into
that banner. The ledger is Wienerdog-written under `state/`, so this is a
robustness gap rather than a live path.

## Lessons

- A provenance fact must not be stored in an artifact the actor it describes can
  write. Any read-back is then unauthenticated, and single-run reasoning about
  the write hides multi-run sequences that break it.
- Measure every branch of a decision rule, not the branch that motivated it.
  Measuring only `tool_result` share would have hidden that a conflated
  `truncated` flag fires on 97% of the corpus by itself.
- A rule needing a signal the consumer cannot see is a scope question, not an
  implementation detail: check that the signal survives to the decision point
  before specifying the decision.
- `git diff --numstat <base> -- <file> | cut -f2` yields an empty string for an
  untouched file, so `test "$(…)" = 0` reports a deletion that did not happen.
  The shape is inherited from
  `docs/specs/done/WP-daily-summary-per-line-framing.md`. Default it (`${VAR:-0}`).
- A `grep` for an identifier proves the identifier appears, never that it is
  imported, called, or load-bearing — and a bare `grep "function name"` matches
  a renamed `nameBROKEN` by prefix.

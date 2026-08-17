---
date: 2026-08-17
title: "WP-frontmatter-recognition-failopen review rounds — the record, with each round's raw-output commit"
related_wps: [WP-frontmatter-recognition-failopen]
---

# WP-frontmatter-recognition-failopen review rounds (2026-08-16/17)

Each round's raw final output is committed alongside this entry, one file per
round, and each row below cites that file's path AND the SHA of the commit
that introduced it — the rule at `docs/runbooks/codex-review.md` ("Rules"). A
round row without that SHA is a round where the raw-commit rule did not run.

## The rounds

| # | Round | Backend | Result | Findings | Raw file | Raw commit |
|---|---|---|---|---|---|---|
| 0a | Template conformance | internal, clean context (spec + template only) | PASS | 0 blocking, 5 non-blocking | `2026-08-16-…-r0-template-conformance-raw.md` | `4c5cb1d` |
| 0b | Internal coherence | internal, same session as drafting | 2 findings | 2 fixed | `2026-08-16-…-r0-internal-coherence-raw.md` | `4c5cb1d` |
| 1 | Adversarial design review | gptsol | NEEDS-ATTENTION | 4 (3 high / 1 medium) | `2026-08-16-…-round-1-raw.md` | `7be88c0` |
| 2 | Adversarial design review | gptsol | NEEDS-ATTENTION | 4 (2 high / 2 medium) | `2026-08-16-…-round-2-raw.md` | `17e34b9` |
| 3 | Adversarial design review | gptsol | NEEDS-ATTENTION | 2, both high | `2026-08-16-…-round-3-raw.md` | `e168e11` |
| 4 | Adversarial design review | gptsol | NEEDS-ATTENTION | 3 (2 high / 1 medium) | `2026-08-16-…-round-4-raw.md` | `74550a9` |
| — | **ABORTED, no verdict** | gptsol | infrastructure failure | — | `2026-08-17-…-round-5-aborted-raw.md` | `29fc701` |
| 5 | Adversarial design review (retry) | gptsol | NEEDS-ATTENTION | 3 (2 high / 1 medium) | `2026-08-17-…-round-5-raw.md` | `2424372` |
| 6 | Adversarial design review | gptsol | NEEDS-ATTENTION | 3 (1 high / 2 medium) | `2026-08-17-…-round-6-raw.md` | `57196ad` |

The aborted attempt is listed as a row with no number because it produced no
verdict and read nothing. It must not be counted toward the loop's closure
condition, which is a round that finds nothing **about the product**.

## When each raw output was committed — the part that is not recoverable later

**Rounds 1 through 6, and the aborted attempt: committed BEFORE adjudication**,
in the SHAs above. Nothing in them was judged, paraphrased or shaped before the
commit existed.

**Round 0b: committed AFTER adjudication.** It ran inline during drafting and
both findings were fixed in the same breath, so the ordering property did not
hold for it; its raw file says so in place. This is the **third consecutive
package** where round zero's internal pass has this defect
(`2026-08-15-snapshot-read-path-review-rounds.md`,
`2026-08-14-vault-snapshot-review-rounds.md`). All three are round zero and all
three are the *internal* pass, which is the signal: the rule as written is
only satisfiable by a pass that runs in a different context from the one that
fixes. Raised as a runbook question, not patched here.

## What the loop actually cost, and what turned it

Findings per round: 4, 4, 2, 3, 3, 3. Spec length: 375 → 480 → 508 → 572 →
709 → 513 lines. The count never fell, and for five rounds the surface grew —
the treadmill condition named in `docs/runbooks/codex-review.md`
("The loop converges by freezing surface, not by patience").

**Six findings across the loop were one recurring kind**: a claim about a
specific code path asserted without measuring *that* path — Table A's
rationale (round 1), the daily banner's visibility and the corpus predicate
(round 2), the partition universal (round 3), the normalization order
(round 4), and the invisible-prefix rationale (round 5). Two structural
answers were tried and both were defeated **by the same blind spot they were
meant to catch**, because the relay authored both the contract and its proof:
per-cell reproduction commands, then a totality probe whose case list the
relay chose.

**What turned it was a ruling change, not another mechanism.** After round 5
the owner revoked the earlier ratification that recognized BOM and CRLF
openers, and ruled that recognition never widens: the exact form stays the
only recognized form, and every other delimiter attempt fails closed. That
deleted the unbounded question — "which deviations do we recognize" — that
had consumed five rounds. Consequences: ADR-0022's §1 uniqueness sentinel
survived untouched, which removed an entire verification burden; the spec
shrank for the first time; and round 6's findings came from the round-5 fix
rather than from a new shape family.

Round 6 then resolved by simplifying again — two triggers and a silent
twelve-line window collapsed into one structural predicate — which is the
third time in this package that going simpler closed more than the
elaboration it replaced.

## Dispositions

Every finding across rounds 1–6 was accepted and fixed; none was dropped as a
residual, and none was rejected. The owner ruled on six scope questions:
covering the dream validator's third path; splitting the daily-path
visibility and then reversing that split when ADR-0022's Consequences made
visibility binding; closing the unclosed-block case; the (B) re-ruling and
its stated price; and the round-6 criterion recorded below.

Named residuals carried forward:

- `tests/scenarios/run-scenarios.js:68,111` holds a private clone of the
  pre-fix lexer. Harness, not a security gate, outside ADR-0022's `src/core/`
  scope, not run by `npm test`.
- Successor `WP-shared-line-boundary`: `parse`, `DAILY_LINE_BREAK`,
  `extractSection` and the secret scanner do not agree on what a line is.
  Round 4's and round 5's measurements are carried into it.

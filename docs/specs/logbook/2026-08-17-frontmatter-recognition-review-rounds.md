---
date: 2026-08-17
title: "WP-frontmatter-recognition-failopen review rounds — the record, with each round's raw-output commit"
related_wps: [WP-frontmatter-recognition-failopen]
---

# WP-frontmatter-recognition-failopen review rounds (2026-08-16/19)

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
| 7 | Adversarial design review — **INVALID**, see below | gptsol | NEEDS-ATTENTION | 4 (2 high / 2 medium), 3 design-level | `2026-08-17-…-round-7-raw.md` | `b061f5b` |
| 8 | Adversarial design review of the narrowed package | gptsol | NEEDS-ATTENTION | 2 (1 design-level / 1 mechanical) | `2026-08-17-…-round-8-raw.md` | `2167b76` |
| 9 | Adversarial design review | gptsol | NEEDS-ATTENTION | 3 (1 design-level / 2 mechanical) | `2026-08-17-…-round-9-raw.md` | `68f6732` |
| 10 | Adversarial design review of the digest half | gptsol | NEEDS-ATTENTION | 3 (2 design-level / 1 mechanical) | `2026-08-18-…-round-10-raw.md` | `6fc7943` |
| 11 | Adversarial design review — **the closing round** | gptsol | NEEDS-ATTENTION | 3, all LIGHT under weighted closure | `2026-08-18-…-round-11-raw.md` | `28dc9f7` |

The aborted attempt is listed as a row with no number because it produced no
verdict and read nothing. It must not be counted toward the loop's closure
condition, which is a round that finds nothing **about the product**.

## When each raw output was committed — the part that is not recoverable later

**Every external round, and the aborted attempt: committed BEFORE
adjudication**, in the SHAs above. Nothing in them was judged, paraphrased or
shaped before the commit existed.

**Round 7 is INVALID under the read-only invariant, and the cause was the
relay's.** `git status --porcelain` was not byte-identical across the run
because the relay created this very file while the round was in flight. The
reviewer detected it and declared its own run invalid, correctly. Its three
design-level findings were therefore re-verified independently from a clean
tree before any of them was acted on. Rounds 8, 9 and 10 were byte-identical
on both sides.

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

Findings per round: 4, 4, 2, 3, 3, 3, 4, 2, 3, 3. Spec length: 375 → 480 →
508 → 572 → 709 → 513 → 477 → 331 → 264 → 317 → 385 lines. The count never
fell below two, and for five rounds the surface grew — the treadmill
condition named in `docs/runbooks/codex-review.md` ("The loop converges by
freezing surface, not by patience"). What eventually moved it was not a
better mechanism but **three successive narrowings of what the package
claims**: recognition frozen (after round 5), the recognition work dropped
entirely (after round 7), and the validator half chartered out (after round
9). Each narrowing removed a class of question rather than answering it
again.

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

Every finding across all ten rounds was accepted; none was rejected and none
was dropped as a style residual. The owner ruled on nine scope questions:
covering the dream validator's third path; splitting the daily-path
visibility and then reversing that split when ADR-0022's Consequences made
visibility binding; closing the unclosed-block case; the (B) re-ruling that
froze recognition, and its stated price; the fallback that removed the
recognition work; the split at the two consumer holes; and the ruling that
the banner's remedy accuracy is a successor rather than this package's work.

**Two pre-agreed criteria were set and both fired as written**, which is why
the last three narrowings took one turn each instead of a debate: a
design-level finding rooted in the previous fix triggered the fallback
(round 7) and then a stop-and-ask (round 9).

Named residuals carried forward:

- `tests/scenarios/run-scenarios.js:68,111` holds a private clone of the
  pre-fix lexer. Harness, not a security gate, outside ADR-0022's `src/core/`
  scope, not run by `npm test`.
- Successor `WP-shared-line-boundary`: `parse`, `DAILY_LINE_BREAK`,
  `extractSection` and the secret scanner do not agree on what a line is.
  Round 4's and round 5's measurements are carried into it.
- Residual `R-RECOGNITION`, and two charters in the spec itself: the dream
  validator's `malformed` hole (needs the commit pipeline's read/decide/commit
  ordering in scope) and the digest banner's remedy accuracy across all six
  exclusion classes. Each carries its measurements so a successor starts from
  evidence.

## How the loop closed

Round 11 returned three findings and **none of them was about the product**,
which is the runbook's stated closure condition. Under weighted closure a
finding is HEAVY only when fixing it changes what the implementer builds:

- The ordered-table finding changed how the contract is *expressed and
  asserted*. Table A's rows 4 and 5 — the only behaviour this package changes
  — are byte-identical to what round 10 landed.
- The cap finding surfaced a real user-visible consequence, but its fix was
  to **state and pin** the displacement rather than alter it: the prefix-first
  policy is pre-existing and deliberate (`digest.js:580-582`), and this WP
  adds one line to a list six other sites already write to. The owner
  adjudicated this LIGHT explicitly.
- The count finding was a number in a successor charter.

All three landed and were verified mechanically, so the loop closed without a
twelfth external round, exactly as the runbook prescribes for LIGHT findings.

**Dispatch-time re-verification** then ran against `4461227`: seven executable
Current-state claims — the discarded `r.exclusion` at `:748`, the six push
sites, `memory.js`'s `KNOWN` allowlist and `approve`'s hash-only scope, the
spec's own `node -e` measurement, Table A's order against `:745-772`,
`readNoteBounded`'s fifth `absent` class, and Table B's two cap lines — all
reproduced. The spec moved to `Ready` on that evidence.

## The PR gates — PR #11

The design loop above ends at `Ready`. These are the two merge gates, run on
the implementation diff, and they are a separate sequence.

| # | Gate | Result | Findings | Raw file | Raw commit |
|---|---|---|---|---|---|
| 1 | wd-reviewer (spec fidelity) | REQUEST-CHANGES | 7 | `2026-08-18-…-pr11-wd-reviewer-raw.md` | `16af28d` |
| 1 | external (frozen pr-rubric, no focus text) | patch is incorrect | 2, both P2 | `2026-08-18-…-pr11-external-raw.md` | `16af28d` |
| 2 | wd-reviewer | **APPROVE** | 4 text-only nits | `2026-08-18-…-pr11-wd-reviewer-round2-raw.md` | `513665e` |
| 2 | external | patch is incorrect | 2 (P1, P2) | `2026-08-18-…-pr11-external-round2-raw.md` | `513665e` |
| 3 | external | **patch is correct, zero findings** | 0 | `2026-08-19-…-pr11-external-round3-raw.md` | (this commit) |

**Both gates are clean.** Every finding across both was accepted and fixed;
none was rejected, and none was dropped as style.

**The one finding that mattered most was a vacuous test of mine.** Round 1's
row-3 fixture created a *directory* named `2026-07-01.md`, but `newestDaily`
recurses into directories and collects only `entry.isFile()` matches, so it
yielded no candidate and the test silently duplicated row 1. The proof was a
mutation: pushing on `absent` too — a direct contract violation — left all 75
tests green. After the fix that mutation goes red. Both gates found it
independently.

**One finding could not be fully closed, and is recorded as a measured
limit rather than a fix.** The byte-cap assertion cannot be driven past
`MAX_BYTES` through `renderDigest`: each identity note is capped to
`MAX_NOTE_BYTES` (8 KiB) before joining, four notes cannot reach the 32 KiB
whole-digest ceiling, and the line cap trims first. Measured maximum with all
four notes filled and 60 projects: 31.4 KiB. The fixture was widened from 6.7
KiB to that maximum and the limit written into the test as measurement.
Closing it needs an exported `capDigest` or different caps — neither in this
WP's contract. Round 3 did not re-flag it.

**Twice I stated a mechanism I had not run.** Round 1's blocker was one (a
directory does not make `newestDaily` produce a candidate); round 2 found the
second, in a comment — "a directory is never openable as a file, so
`fs.openSync` throws". Measured: `openSync` succeeds on a directory;
`readSync` throws `EISDIR`. The assertion was right for the wrong reason.

## Lessons — the package's bullets, for the PR body

One bullet per lesson, prefixed with the WP id, per CLAUDE.md. They are kept
here rather than in `memory/lessons/inbox.md` because a WP branch must not
edit that file — parallel branches conflict on it.

- `WP-frontmatter-recognition-failopen`: **zero findings is not readiness if
  the review's focus never went there.** The digest half was called "clean
  across three rounds" and used as the argument for shipping it; the first
  round that actually attacked it returned two design-level findings. A
  finding count only means something over surface the reviewer was pointed
  at — say which surface a clean round covered, never just that it was clean.
- `WP-frontmatter-recognition-failopen`: a claim about a specific code path
  must be measured on *that* path. Six findings across the loop were this one
  defect — a rationale, a banner's visibility, a corpus predicate, a partition
  universal, a normalization order, an invisible-prefix justification.
- `WP-frontmatter-recognition-failopen`: when the same author writes both the
  contract and its proof, the proof inherits the contract's blind spots. Two
  structural answers — per-cell reproduction, then a totality sweep — were each
  defeated by the very blind spot they were built to catch. A property whose
  oracle calls the implementation's own helper is a tautology.
- `WP-frontmatter-recognition-failopen`: a fail-closed guard belongs at the
  decision, not in the view it reads. Emptying a record on `malformed` erased
  the difference between *absent* and *hidden*, and every preservation check
  reads absence as agreement — four detected violations became zero.
- `WP-frontmatter-recognition-failopen`: an enumeration cannot prove a
  partition exhaustive. Three enumerated case lists were each defeated by a
  shape outside the list; only a ruling change — recognition never widens —
  removed the unbounded question instead of answering it again.
- `WP-frontmatter-recognition-failopen`: do not write into the reviewed
  checkout while a review gate is running, logbook files included. Round 7 was
  invalidated by exactly that, and the invariant cannot tell my write from the
  reviewer's.
- `WP-frontmatter-recognition-failopen`: **a test that names a case does not
  necessarily reach it.** Two of this package's assertions named a thing they
  never touched — a fixture that produced no candidate at all, and a byte-cap
  assertion 20% below its ceiling. Both looked like coverage and were green.
  The only reliable check is a mutation that violates the contract: if the
  suite stays green, the assertion is decorative.
- `WP-frontmatter-recognition-failopen`: literal control characters do not
  survive a copy/paste round trip. A probe silently lost its NEL/VT/FF and
  reported a healthy-looking wrong classification. Escapes only, and print the
  code points before asserting anything.

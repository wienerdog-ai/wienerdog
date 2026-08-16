---
date: 2026-08-15
title: "WP-snapshot-read-path-hardening review rounds — the record, with each round's raw-output commit"
related_wps: [WP-snapshot-read-path-hardening]
---

# WP-snapshot-read-path-hardening review rounds (2026-08-15)

Each round's raw final output is committed alongside this entry, one file per
round, and each row below cites that file's path AND the SHA of the commit that
introduced it — the rule at `docs/runbooks/codex-review.md` ("Rules"), landed in
`79ba77f`, which this package is the first to run under.

## The rounds

| # | Round | Backend | Result | Findings | Raw file | Raw commit |
|---|---|---|---|---|---|---|
| 0a | Template conformance | internal, clean context (spec + template only) | CONFORMANT | — | `2026-08-15-snapshot-read-path-r0-template-conformance-raw.md` | `a74fd99` |
| 0b | Internal coherence | internal, fresh context | 20 findings | 6 heavy / 14 light | `2026-08-15-snapshot-read-path-r0-internal-coherence-raw.md` | `a74fd99` |
| 1 | Adversarial design review | gptsol | NEEDS-ATTENTION | 3, all heavy | `2026-08-15-snapshot-read-path-codex-round-1-raw.md` | `a82de32` |
| 2 | Adversarial design review, round 2 | gptsol | NEEDS-ATTENTION | 2, both heavy | `2026-08-15-snapshot-read-path-codex-round-2-raw.md` | `d71cbfb` |
| 3 | Adversarial design review, round 3 | gptsol | NEEDS-ATTENTION | 3, all heavy | `2026-08-15-snapshot-read-path-codex-round-3-raw.md` | `4606e36` |
| 4 | Adversarial design review, round 4 | gptsol | NEEDS-ATTENTION | 1, LIGHT | `2026-08-15-snapshot-read-path-codex-round-4-raw.md` | `056e22c` |

## When each raw output was committed — the part that is not recoverable later

**Round 1: committed BEFORE adjudication**, as the rule requires. Nothing in it
was judged, paraphrased or shaped before `a82de32` existed. One transport
artifact was decoded on the way in (`&amp;&amp;` → `&&` inside one `executed`
string) and is disclosed in that file's header; no finding text, verdict,
confidence or line number was altered.

**Rounds 2, 3 and 4: committed BEFORE adjudication**, in `d71cbfb`, `4606e36` and `056e22c`, same as round 1.

**Rounds 0a and 0b: committed AFTER adjudication**, retrospectively, in
`a74fd99`. The text is verbatim, but the ordering property the rule buys was not
in force for those two — it is either done at the time or it is not, and for
round zero it was not. Anyone weighing those findings later should know it. The
same defect is recorded for the predecessor package
(`2026-08-14-vault-snapshot-review-rounds.md`), which is why the rule was
tightened; this entry is the first place the tightened form applies, and it
caught its own gap in the same session.

## Dispositions

### Round 0b — 18 fixed, 2 dropped

Applied in `7e012a9`. The heavy six: a Deliverables row that permitted a repair
its acceptance criterion forbade; a table row citing a test comment as "still
holds" while abolishing half of it; a descriptor exit-path enumeration that
omitted a throw; an open-failure contract no criterion asserted; a claim that
the snapshot's symlink posture lived in exactly one place, when the user-visible
skip reason is a second; and a platform table that generalized a darwin
measurement to POSIX and asserted an unmeasured win32 fact. The twelve light
ones were counts, citations, unregistered mirrors and duplicated statements.

**Two findings were dropped after the orchestrator re-ran them**, and the raw
file keeps them as written — the record is the reviewer's, not the
adjudicator's:

- Finding 9 claimed `SCAN_MAX_BYTES` sits at `src/core/secret-scan.js:23`. It is
  at `:22`, as the spec cited.
- Finding 4 claimed no test covers the mode-000 `unreadable` case. The test
  exists at `tests/unit/vault-snapshot.test.js:310-321`. The grep that "proved"
  its absence was a false negative: that test file holds raw high bytes in its
  fixtures, so `file` reports `data` and this environment's `grep` shim (ugrep
  with `-I`) silently skips it. **The finding's remaining half stood** — no
  acceptance criterion asserted the open-failure mapping — and that half was
  fixed.

Also dropped as machinery, on the finding's own evidence: both drafted
verification greps. Neither guarded its stated behaviour and each would have
gone red on a correct implementation, because the spec itself orders comments
that must name the very idioms the greps forbid.

### Round 1 — 3 fixed, 0 residual, 0 dropped

Applied in `b0f18a0`. All three reproduced on the orchestrator's machine before
being acted on, per the spot-check rule.

1. **The descriptor scope was wrong at its START.** A directory OPENS
   successfully under the contract's flags and is then refused by the `fstat`
   type check having read nothing, so a `finally` around the read alone never
   runs and the descriptor leaks. The scope now begins immediately after a
   successful `open`. A new close-posture row states what is promised (one close
   per successful open, on every path) and what is not (darwin documents `EINTR`
   on `close(2)`, so "no descriptor is ever left open" was unguaranteeable).
2. **The bounded-read criterion did not discriminate.** `readFileSync` of the
   120,965,360-byte node binary succeeds in ~10 ms, so slurp-then-compare-length
   returns the same per-file cap reason while keeping the resource-exhaustion
   defect. The criterion now states the bound at the READ PRIMITIVE. This also
   corrects the round-zero note that dropped the greps: its stated fallback
   guard did not hold either.
3. **The socket criterion was unrealizable.** A socket's open fails before any
   descriptor exists, so it can never reach `fstat`. Refusals are now ordered by
   the first operation that fails.

### Round 2 — 2 fixed, extracted rather than patched

Applied in `58de7ea`. The reviewer was required, as a round ≥ 2, to verify each
round-1 finding was genuinely fixed rather than re-worded, and returned:
descriptor scope **genuinely-fixed**, socket precedence **genuinely-fixed**,
bounded read **partially-fixed** — the bound covered bytes read but not bytes
allocated. Both new findings reproduced on the orchestrator's machine first.

1. **The primitive bound still permitted whole-source allocation.** A Buffer
   sized to a 120,965,360-byte source and filled with only `MAX_FILE_BYTES + 1`
   bytes satisfies "never request or accumulate more than the cap" and still
   holds 461× the cap. Boundedness is now three named quantities — bytes
   requested, bytes accumulated, allocated capacity — each with its own
   assertion, because the first two do not give the third.
2. **The operation order could not preserve today's reason assignment.** See the
   ruling below.

### The circuit-breaker fired, and the fix is an extraction

Rounds 1 and 2 each landed a finding on the SAME two contract families:

| Family | Round 1 | Round 2 |
|---|---|---|
| What exactly is bounded, and what pins it | the criterion did not distinguish bounded from unbounded reading | the primitive bound still permitted whole-source allocation |
| Refusal order and reason assignment | the socket criterion contradicted open-failure precedence | the new order could not preserve today's reason assignment |

Two consecutive rounds on the same contract family is ADR-0031's circuit-breaker
condition (`docs/runbooks/codex-review.md`, "Loop circuit-breaker"), and the
runbook's own rule is that the next step is a design question, never another
textual patch. So round 2 was closed by **extracting Table C — the refusal
ladder**: ten rows in evaluation order, each with the reason it produces and
whether that assignment differs from today, with Table A's six affected rows
reduced to citations. The scattered ordering prose that both rounds kept hitting
no longer exists to be hit.

### Owner ruling, 2026-08-16 — the crossover is accepted and stated

The design question the breaker surfaced: deciding the caps on the bytes
actually read necessarily moves access, type and read failures AHEAD of the cap
reasons, so a candidate that fails both reports the access failure. Measured: a
300 KiB mode-`000` file reports `exceeds the 262144-byte per-file cap` today and
`unreadable` under the new contract.

- **Option A — accept and state it.** One cap decision surface; the spec drops
  its false "nothing observable changes" claim and names the one assignment that
  changes.
- **Option B — restore an `lstat`-size pre-check** purely to preserve the old
  assignment, with the authoritative decision still on bytes read. Cost: the cap
  rule appears twice.

**The owner ruled A on 2026-08-16.** Grounds: what this WP preserves is the
reason VOCABULARY and the visible-skip property, not every assignment produced
by the `lstat`-size-first order the WP exists to replace; and a second cap
surface is exactly the duplication the original defect came from. Recorded in
Table C, row 3.

### Round 3 — 3 fixed, one of them against the reviewer's own recommendation

Applied in `57eb54c`. The reviewer verified round 2's crossover fix as
**genuinely-fixed** and its allocation fix as **partially-fixed**. All three new
findings reproduced on the orchestrator's machine first.

Two were errors in the Table C extraction itself — the injected-defect rate the
runbook measures, not a design problem:

1. **Table C denied a crossover it created.** It claimed rows 3 and 5 were the
   only reason-assignment changes while row 6 said otherwise. Measured: an
   over-cap candidate whose read fails reports the cap reason today, without the
   read being attempted. The closing contract now separates CHANGED PRECEDENCE
   (rows 3, 4, 6) from a NEW REFUSAL (row 5), and a criterion covers both halves
   of the crossover.
2. **The reason set said eight strings; there are ten.**
   `provenance gate: <exclusion>` is one form but three strings, and Table A
   requires the class verbatim. Enumerated once in Table C, cited elsewhere.

The third was different in kind, and its disposition **departs from the
reviewer's recommendation**, with the owner ratifying the departure on
2026-08-16:

**The allocation bound had no testable unit.** Measured: a 262,145-byte view
keeps a 120,965,360-byte backing store alive, so a length assertion proves
nothing. The reviewer recommended defining a memory metric — aggregate
backing-store capacity, aliases counted once, gate representations excluded by a
named multiple. That was NOT taken: a metric of that shape is test design, which
`docs/runbooks/spec-authoring.md` puts on the implementer's side of the line,
and three consecutive rounds of trying to pin this family as a metric produced
three different readings. The spec now states the MECHANISM instead — the read
stage allocates at the bound, never at the source size or the `fstat` report,
and hands onward that buffer or a copy of its filled prefix, never a view onto a
larger allocation — which is one sentence, is checkable, and refuses both
counterexamples outright.

### Round 4 — 1 fixed, and the loop closes

Applied in `7158956`. The reviewer verified round 3's allocation mechanism and
Table C crossover split as **genuinely-fixed**, and its reason set as
**partially-fixed** — right as code vocabulary, wrong as reachable outcomes.

Its single finding: Table C called all ten reason strings concrete outcomes of
today's code, and an acceptance criterion demanded exactly that set. Measured
2026-08-16, `MAX_FILES` is 32 while the frozen plans expose at most 1, 14 and 0
candidates, so `exceeds the 32-file cap` is a literal the code contains and no
valid call can emit — the criterion was unassertable. The vocabulary (ten
literals) and the reachable set (nine) are now two rows, asserted separately.
The dormancy is pre-existing and stays: the plans and the cap values are in the
preserved-unchanged row, and widening either to make a string reachable was
explicitly refused.

**Why this closes the loop rather than buying a fifth round.** The runbook's own
test: a finding is HEAVY when fixing it changes what the implementer builds in
the product; a finding about the spec's own verification machinery is LIGHT, and
"the loop is DONE when a round finds nothing about the product. Machinery
findings at that point are fixed or accepted as named residuals; they do not
extend the loop." Round 4 found nothing about the product — the reviewer said so
in its own summary, unprompted except by being asked to distinguish the two —
and the fix landed and was verified by a mirror walk over every surface stating
the reason count. The stop condition below was therefore never needed: the loop
ended on the runbook's criterion, not on the budget.

### The declared stop condition

Three consecutive rounds have landed findings in the same two families:

| Family | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| What exactly is bounded | the criterion did not distinguish bounded from unbounded | the bound permitted whole-source allocation | the allocation bound had no testable unit |
| Refusal order and reason assignment | the socket criterion contradicted open-failure precedence | the order could not preserve today's assignment | Table C denied its own crossover; the reason count was wrong |

The circuit-breaker already fired once and produced Table C, so a further
extraction is not the answer, and the runaway-loop lesson this repo has twice
survived says a loop with no declared end is the failure mode. **Agreed with the
owner before round 4 ran:** round 4 is the last one this package pays for on
these families. If either family produces again, what remains is closed as a
NAMED RESIDUAL and the spec goes to `Ready` with it, rather than a fifth patch.
Round 4 ran on `57eb54c` and did not need it — see above. It is recorded because
the condition was agreed BEFORE the round ran, which is the only time such a
condition means anything; a stop condition invented after seeing the result is
not one.

## Where the package stands

Design review is complete: four external rounds plus round zero's two internal
passes, twenty-nine findings, all dispositioned — fixed, or dropped after the
orchestrator re-ran them. No finding is carried as an unaccepted residual. The
spec awaits the owner's sign-off to move `Draft` → `Ready`
(`docs/specs/README.md`: only the architect or the owner moves a spec to
`Ready`; `docs/runbooks/codex-review.md`: a spec does not move until the review
returns no findings the owner has not explicitly accepted). Implementation then
runs in this same package, under the same branch, and faces the two PR gates on
its diff.

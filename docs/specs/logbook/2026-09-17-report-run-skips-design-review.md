---
title: WP-dream-report-run-skips design review — rounds 1, 2 and the confirming round
date: 2026-09-17
related_wps: [WP-dream-report-run-skips, WP-dream-filtered-input-budget, WP-quarantine-warnings-file, WP-dream-promote-module]
---

# WP-dream-report-run-skips design review — dispositions

## Round 1

Independent design gate against tip `5dc06883`, verdict **needs-attention**, six
findings. The raw result is preserved unaltered beside this file as
`2026-09-17-report-run-skips-design-r1-raw.json`, with its focus and meta notes;
it was committed before adjudication. **Nothing here records the owner accepting
anything** — the two questions this round raised for the owner are parked as
owner items 4 and 5 in the spec, undecided.

All six are fixed or dispositioned in one revision; none is dropped. Four changed
a contract row, so the surface went back for a full fresh external round rather
than a delta read — that is round 2, below.

| # | Finding | Band | Weight | Disposition |
|---|---------|------|--------|-------------|
| F1 | Quarantine counts disappear whenever no session is admitted | high | heavy | **FIX THE CLAIM, not the product** |
| F2 | The oversized-session promise omits real retry conditions | high | heavy | **FIX** — the byte-exact bullet is rewritten |
| F3 | Acceptance criterion 5 requires an impossible collector state | high | light | **FIX** — split into two runs |
| F4 | The warnings pointer can target a missing or stale file | medium | heavy | **NAMED RESIDUAL + owner item** — the cheap fix is not available |
| F5 | The code-owned heading is not reserved from brain-authored content | medium | heavy | **MIRROR THE EXISTING RULE** — which is: no rule. Pinned by fixtures, routed |
| F6 | The inline integers-only gate accepts plausible coercion bugs | medium | light | **FIX** — full-string expectation, unsafe integer, third RED proof |

### F1 — the claim was false; the product stays the size it was

The reviewer is right and its recommendation is out of scope. The spec's coverage
boundary said the throw path "carries every exclusion count" and let
`reports/warnings.md` and `doctor` stand in for the rest. Both halves are wrong:
`exclusions` is built from the four collector counts alone
(`src/cli/dream.js:683-700`), so **every quarantine-only run takes the idle return
at `:746-757`** — no report, `stillQuarantined` emitted nowhere, `newlyQuarantined`
surviving only as a count of console lines — and the standing surfaces carry the
ledger's set *as it stands*, which is not this run's per-run counts.

The subject of this package is the dream **report**. Carrying counts through a path
that writes no report means either writing a vault file on a run that makes no
commit (ADR-0012's one-run-one-commit) or editing the failure message ADR-0012's
2026-09-15 amendment fixed. Either is a separate package with its own ADR question.
So: the row now states, path by path, what is carried and what is not; a residual
names it; acceptance criterion 12 pins it; it is routed under Discovered issues;
and owner item 4 asks whether zero-admission runs should get durable accounting,
recommending yes-but-not-here.

### F2 — the user-facing sentence has to be true

Row B3 already said the memo is invalidated by a fingerprint **or package-version**
change and that the skip holds only while the measurement exceeds the **current**
limit. The rendered bullet said "every night until the session file changes or you
raise dream_max_input_bytes" — which omits the version release, implies any rise in
the limit helps, and promises nothing about re-measurement. Final text:

> `- N session transcript(s) are too big to dream over on their own. Wienerdog will
> keep passing over them until the session changes, until Wienerdog is updated, or
> until dream_max_input_bytes in config.yaml is raised past their size; after any of
> those it measures them again, and may still find them too big.`

Both worked examples, the inline gate's `B3` literal, row B3, the Context
paragraph, the claim register, acceptance criterion 3, owner item 1 and RED proof
2's `find` moved in the same commit. The wording keeps the two properties the gate
depends on: no apostrophe, and the word *skipped* still appears only in the two
quarantine bullets and the pointer.

### F3 — an unsatisfiable criterion

Confirmed by reading: the capacity stop (`scratch.js:91-94`, `:124-127`) and the
deadline stop (`:95-98`) each `break` the one admission loop, so whichever fires
first excludes the other and no run exhibits five arms. Criterion 5 now asserts the
partition over **two** runs — one ending in a capacity stop, one in a deadline stop
— each exercising the three *continuing* arms (quarantine, oversized, read-deferred)
before its stop.

### F4 — measured, and the cheap fix is not available

`refreshWarnings` never throws; a refused or unreadable `reports/warnings.md` comes
back as `{written:false, reason}` and the run continues
(`src/core/dream/warnings.js:230-311`). So the pointer can name an absent or stale
file while its counts are exact. The proposed fix — one boolean on `runSkips` —
needs the refresh result **before** `promote()`, and the ordering gives it only
half the time: refresh point 1 (`src/cli/dream.js:729`) runs pre-promotion but
**only when the run minted a new quarantine**; point 3 (`:755`) is on the idle path
that returns; point 2 (`:1187`) runs after the commit. A
`stillQuarantined`-only run — the 191-session case this package exists for — has no
refresh result at composition time, so the flag would be false there and would
delete the pointer from the main use case. Honest alternatives (a fourth refresh
call site; moving point 2 ahead of the commit) restructure another package's
surface and ADR-0012's ordering. Recorded as a named residual with its bound (the
ledger stays ground truth; the next successful refresh repairs the file) and owner
item 5.

### F5 — the existing rule is that there is no rule

Measured at `545df8bd`: `ENFORCEMENT_HEADING`, `REDACTION_HEADING` and
`PRESERVED_HEADING` (`src/core/dream/promote.js:584-591`) appear **only** where they
are emitted (`:708`, `:737`, `:751`). Nothing scans the candidate body, strips a
prior code-owned block or dedupes. Two consequences already ship: a brain that
writes `## Refused by policy (promotion enforcement)` into its body gets a second
one appended beneath it, and a second run on the same date appends a second copy of
the whole accounting block. Giving the new heading an ownership rule would leave
three shipped headings without one and put two document models in one composer. So
this package applies the identical (absent) rule, **pins** the behaviour with
criterion 11's two fixtures — a same-day second run, and a candidate body
containing the exact heading — and routes the shared gap under Discovered issues
for whichever package owns `composeRecord`'s document model. A later fix now has to
move a fixture, which is the point of pinning it.

### F6 — the gate was enumerating the bad

The old hostile assertion scanned the render for `passwd|1\.5|-1|NaN`. Measured:
a guard rewritten as `Number.isFinite(Number(v)) … Math.floor(Number(v))` renders
`oversized: 1.5` as a plausible `1` and `Number.MAX_SAFE_INTEGER + 1` in full, and
the old gate stayed **green** through both. The gate now compares the hostile render
and a new unsafe-integer render to hand-written expected strings, and Table C gains
a third RED proof whose mutation is exactly that guard rewrite, declared against
T3. This is the repo's own rule arriving one level down: **enumerate your own good,
never the forbidden set.** Table A also pins the guard as byte-identical to
`secretRevertSummaryLine`'s (`ledger.js:500`), which is both a no-drift contract and
the literal that proof 3 mutates.

### Evidence for the round-1 revision

Run in a uniquely named scratch subdirectory against a stub exporting the
formatter, both directions: compliant → exit 0; module absent → exit 1; and four
violating states — coerce-and-floor guard, pointer tied to the heading, oversized
bullet reworded, pointer sentence reworded — each → exit 1; compliant again → exit
0. Separately, the spec's two worked-example fences were re-derived from the stub
and compared byte for byte, and each proof's `find` was checked against both
renders: proof 1 reaches the six-count render only, proof 2 both, proof 3 neither
(it is a code mutation, so reaching a render would mean it could redden T1/T2 for
the wrong reason).

## Round 2

Independent design gate against tip `ea116788` (pre-rebase), verdict
**needs-attention**, two findings plus one machinery finding. The raw result is
preserved unaltered beside this file as
`2026-09-17-report-run-skips-design-r2-raw.json` with its focus and meta notes,
committed before adjudication at `37ac751a`.

**Round 2 confirmed the round-1 work:** F2, F4, F5 and F6 are substantively
dispositioned and their runtime claims check out, and **all 43 explicit
`file:line` citations in the three scoped documents resolve** to existing files
and in-range lines.

| # | Finding | Band | Weight | Disposition |
|---|---------|------|--------|-------------|
| R2-1 | F1 remains contradicted by the spec's opening product claim | medium | light | **FIX THE CLAIM** — qualify both sentences and sweep for others |
| R2-2 | The read-deferred count cannot reliably observe the condition it promises | high | light | **FIX THE CLAIM + ROUTE THE DEFECT** — B6 says what it counts; the reader bug goes to its own package |
| R2-M | Criterion 5 can prove read-deferred disjointness only with an unreachable state | medium | light | **FOLDED INTO R2-2** — the criterion now states that it asserts the partition of what the collector CLASSIFIED, and explicitly does not claim production reachability |

**Both are CLAIM fixes. Neither changes what the implementer builds** — no
Deliverables row, no contract value, no test identity and no RED declaration
moved — so under `docs/runbooks/codex-review.md`'s weighted-closure rule they are
LIGHT and the loop closes here without a further external round.

### R2-1 — the opening paragraphs still said every run writes a report

Table A's coverage row was corrected in round 1; the Context section that a reader
meets first was not, leaving two coverage contracts in one document. Five
sentences changed, all of them claims and none of them mechanism:

1. the ADR-0004 opening — "a markdown file the dream already writes" → **"on the
   runs that write one"**, plus "no write on a run that writes nothing today";
2. the report definition — "Each run writes a **dream report**" → **"A run that
   admits at least one session writes"**, with the bound stated outright: only a
   real, non-dry run that admitted at least one session and reached `promote()`
   composes one, and a run that admitted nothing throws or returns idle;
3. the motivating example — "A run that skipped 191 sessions produces a report"
   → **a MIXED run**, one that consolidated some sessions and so wrote a report
   while skipping 191, with the zero-admission variant named as the harder case
   that stays out of scope (owner item 4);
4. the build-history sentence — a gap should be discoverable "from the report of
   the night it happened" → **"of a night that had one"**, plus the sentence that
   a night which consolidated nothing left no page to write on;
5. the idempotence criterion — "a block the run already composes" → **"a block
   that a report-writing run already composes"**.

### R2-2 — B6 counts a classification, and the reader under-reports it

Verified in `src/core/transcripts/stream.js`: `sizeBytes` is documented at `:71`
as "the discovery-recorded fs size (avoids a second stat)", and `:129-138`
declares exhaustion only when `bytesConsumed < sizeBytes`. A transcript at or
below the 50 MiB discovery ceiling that grows past the 200 MiB per-session
allowance mid-read therefore consumes 209,715,200 bytes against a recorded size of
at most 52,428,800, the comparison is false, `runExhausted` stays false, and the
loop takes the *file fully read* path with a partial extract in hand.

**That is a pre-existing collector defect** — it arrived with the fresh
per-session allowance in `WP-dream-filtered-input-budget` — **and this package
neither fixes it nor depends on it.** Row B6 now defines the count as *the number
of transcripts this run's collector CLASSIFIED as read-deferred*, states the
direction of the error (**it can under-count and cannot over-count**: every
transcript it counts really was an incomplete read with unread bytes), and drops
any coverage claim. Criterion 4's "each count is exact" became "each count equals
what its row defines", with B1–B5 exact against their sources and B6 exact against
the classification. **The byte-exact B6 bullet was re-checked and left alone**: it
speaks only of the transcripts it counts, so an under-count makes it say less,
never something false. The reader defect is routed under Discovered issues with
its `file:line`, trigger, consequence and fix direction (decide unread-bytes from
the open descriptor, not the stale discovery size).

The machinery finding falls out of the same fix: criterion 5 asserts the partition
of what the collector classified — a transcript the reader failed to classify as
read-deferred is classified as something else in the same pass and still
contributes exactly once — and it now says so, and says that a green there is not
evidence that production coverage is complete.

### Closure — and it did not hold

**Round 2 found nothing that changes the product this WP builds. Both items were
LIGHT, both were fixed and mechanically verified, and the loop was closed under
`docs/runbooks/codex-review.md`'s weighted-closure rule**; the spec moved to
`Ready` at `360d7d82`. **A confirming round then re-opened it** — see round 3.

**What the round-2 reviewer executed**, from its raw result: `git rev-parse HEAD`
with `git merge-base` against `545df8bd` and the scoped diff (confirmed the target
and the two-file documentation scope); `git diff --check` over the scoped range
(no whitespace errors); a read-only Node citation-range checker over the three
scoped Markdown documents (**all 43 citations resolved**); and a Node inspection of
the intake constants (`PRE_READ_CEILING_BYTES` = 52,428,800,
`MAX_RUN_BYTES` = 209,715,200). It ran no product test and no lint, because the
branch is documentation only and the formatter does not exist yet.

### Evidence for the round-2 revision

Re-run in a uniquely named scratch subdirectory, both directions, after the
round-2 edits: compliant → exit 0; module absent → exit 1; the four violating
states (coerce-and-floor guard, pointer tied to the heading, oversized bullet
reworded, pointer sentence reworded) → exit 1 each; compliant again → exit 0. The
two worked-example fences and all three proof `find` sets were re-checked against
the stub renders and still agree. `npm run lint` passes and `git diff --check` is
clean.

## Round 3 — the confirming round, by a different reviewer and a different model

Codex plugin 1.0.6 adversarial review, model `gpt-6-astra`, against tip
`360d7d82` with base `2d5e2465`. Verdict **needs-attention**, two findings, no
machinery findings. Raw preserved before adjudication at `9db06cca` as
`2026-09-17-report-run-skips-design-r3-astra-raw.json`, with focus and meta.

**What it confirmed:** the coverage boundary, the stale-pointer residual and the
absent heading-ownership rule all match the code; 46 named-file references in
range; the proof JSON parses, its mutation literals are present, and the worked
examples survive neutralisation.

**What it found — both by EXECUTING the collector and the ledger, not by reading
them.** Both are user-visible sentences, and both were untrue.

| # | Finding | Band | Weight | Disposition |
|---|---------|------|--------|-------------|
| A-1 | Deferred counts can promise retries for permanently memoized oversized sessions | medium | heavy (user-visible sentence) | **FIX** — B4/B5/B6 promise only reconsideration; new canonical row B12 |
| A-2 | Re-quarantined sessions are falsely reported as skipped for the first time | medium | heavy (user-visible sentence) | **FIX** — B1 states this run's decision, not the session's history |

### A-1 — a stop classifies the remainder before it looks at the memos

Verified in `src/core/dream/scratch.js`: the prior memos are pruned into
`oversizedExtracts` **before** the admission loop (`:66-74`, whose own comment
says "Valid unvisited records survive either admission stop"), and inside the loop
the capacity check (`:91-94`) and the deadline check (`:95-98`) each
`deferRemaining(...)` and `break` **before** the memo is consulted at `:101-105`.
The reviewer reproduced it: an admitted session followed by a memoised oversized
one, either stop, and the memoised session lands in `deferred`/`deadlineDeferred`
with `oversized` at 0 — then on the next run is passed over from its memo without
being parsed at all.

So the shipped-to-be sentence "will be retried on the next run" misrepresented a
persistent exclusion as temporary, and "these sessions carry no ledger record" was
simply false for that case. New canonical row **B12** owns both rules; B4, B5 and
B6 now promise only that Wienerdog will *consider* the session again, naming the
oversized outcome as possible, and the record claim is narrowed to *no QUARANTINE
record*. Criterion 5's two runs each gained a memoised-oversized session behind the
stop, and the inline gate now fails on the literal `will be retried` anywhere in
the render.

### A-2 — "for the first time" was a claim about history the run cannot make

`ledger.js:242` is `if (rec.fingerprint !== fingerprint(disc)) return 'select';
// the file changed → reprocess`. A previously quarantined file whose fingerprint
changes is therefore selected again and, if it still fails the ceiling or the
parse (`scratch.js:58`, `:111`), enters `newlyQuarantined` **again**. The reviewer
reproduced exactly that alongside an admitted session. This spec's own criterion
4(c) required that classification and never reconciled it with the sentence the
report would print.

Row B1 now defines the count as *transcripts this run decided to quarantine* and
forbids the first-ever claim outright; the bullet states the decision and its
consequence — set aside by this run, skipped from now on until they change — and
criterion 4(c) asserts that rendered wording for the re-quarantine case. B2 is
unchanged and still partitions cleanly against it, because the two are fed by
different `selectState` outcomes (`'select'` then a failure → B1;
`'skip-quarantined'` → B2), and `selectState` returns exactly one value per file.
**Checked and clean:** no shipped surface carries the same untruth — `grep -n
"first time"` over the warnings renderer, the ledger, the dream CLI and `doctor`
returns nothing — so nothing was filed and nothing else was touched.

### The lesson

**A confirming round by a second model found two untrue sentences that the first
model's two rounds had passed — and it found them by EXECUTING the collector
rather than reading it.** Both prior rounds read `scratch.js` and `ledger.js`
closely enough to confirm harder structural claims; neither ran them. The two
defects live in orderings that reading tends to smooth over: a `break` that
precedes a lookup by four lines, and a comparison whose false branch is the
interesting one. A second reviewer is not only a second opinion on the same
method — **a different method is what the second reviewer was actually worth.**

### Evidence for the round-3 revision

Re-run in a uniquely named scratch subdirectory, both directions: compliant →
exit 0; module absent → exit 1; the four violating states → exit 1 each;
compliant again → exit 0. Both worked examples were **regenerated from the
contract render** rather than retyped, and all three proof `find` sets re-checked
against them. The two lexical properties the gate depends on were re-measured on
the new wording: zero apostrophes anywhere in the section, and the word *skipped*
absent from the quarantine-free render. The gate additionally now asserts that
neither `first time` nor `will be retried` appears in any render, and **both of
those new assertions were RED-tested by restoring the exact sentences this round
removed**: putting back "were skipped for the first time this run" → exit 1, and
putting back "They will be retried on the next run." → exit 1, compliant → exit 0.
`npm run lint` passes and `git diff --check` is clean.

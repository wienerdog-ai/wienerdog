---
date: 2026-09-05
title: "Design-gate rounds: WP-quarantine-preserve-durability"
related_wps: [WP-quarantine-preserve-durability, WP-quarantine-disposal-durability, WP-preservation-abort-widening, WP-quarantine-banner-location, WP-secret-fence-ep2-redact-arm, WP-dream-promote-module]
---

# Design-gate rounds — WP-quarantine-preserve-durability

Round zero is the architect's own internal coherence pass
(`docs/runbooks/codex-review.md`, "Internal coherence pass"), plus a mechanical
template-conformance diff. The orchestrator's clean-context executors and the
external rounds are appended below it.

## Round zero — architect, 2026-09-05, tree at `0fd50422`

`0fd50422` is `origin/main` after PR #217 merged `WP-quarantine-banner-location`
at `Ready`. `git diff --stat 0fd50422 HEAD -- src tests scripts` is **empty** on
this branch, so every measurement below is against the base the spec pins. **No
measurement mutated the worktree**: the candidate fix, the rehearsal tests, the
RED-proof runs and the ten V-block trees all live under the session scratchpad,
and the worktree holds only the three committed documents plus the
`node_modules` symlink it needs for `npm run lint` (removed before each commit).

### 0.1 The candidate fix, and why every "after" number is a run

Round zero applied the fix the spec specifies to `git archive` scratch copies, so
that no "after" value is a prediction. The `src/` edit is exactly what the
Deliverables table names:

```text
src/core/dream/validate.js  + DURABILITY_AVAILABLE (win32 branch), the two flag sets
                            + flushOne(p, isDir), flushPreservation(dest, qdir, firstCreated)
                            ~ qdir and firstCreated hoisted out of quarantinePreserve's try
                            ~ mkdirSync's return captured
                            ~ the verified-read-back success line guarded by the flush
```

### 0.2 Baselines

```text
npm test        tests 2618 / suites 0 / pass 2606 / fail 0 / skipped 12   exit 0
npm run lint    Linting: 637 file(s) | Summary: 0 error(s) | lint passed  exit 0
                frontmatter check passed: 267 spec(s), 4 agent(s)
npm run red-proofs (on a pristine `git archive` copy, real node_modules)
                5 declared proof(s), 5 selected
                PROVEN  dot-segment-admit-reverted        (WP-dot-segment-denial criterion 1)
                PROVEN  dot-segment-layout-reverted       (WP-dot-segment-denial criterion 1)
                PROVEN  dream-private-index-dropped       (WP-show-slot-own-value-kind criterion 3)
                PROVEN  known-calls-show-slot-widened     (WP-show-slot-own-value-kind criterion 2)
                PROVEN  instruction-basenames-reverted    (WP-instruction-basename-currency criterion 7)
                RUN: PROVEN                                              exit 0
```

The lane was run on a scratch copy with a real `node_modules`: it refuses a
worktree whose `node_modules` is a symlink
(`ERROR: SNAPSHOT — unsupported entry type: symbolic link at node_modules`). That
trap is recorded in the spec's Implementation notes so an implementer does not
read the refusal as a failure of their work.

### 0.3 The defect, DRIVEN rather than argued

`grep -rn 'fsync\|fdatasync\|F_FULLFSYNC' src/ tests/ scripts/` returns nothing,
exit 1 — the same result `WP-preservation-abort-widening` recorded at `fc506110`.
That is an absence claim, so it was backed by driving the gate rather than by the
grep alone. `makeGates({stateDir}).secret(…)` with a hard-secret finding, with
`fs.openSync` and `fs.fsyncSync` instrumented so every flush resolves to the path
its descriptor names:

```text
ARM = hard (the withhold arm)
VERDICT = {"refuse":true,"preserved":[{"artifact":"2026-09-05-fp.md","location":"quarantine"}]}
mkdirSync     <T>/state/quarantine        returned="<T>/state/quarantine"
writeFileSync <T>/state/quarantine/.tmp-96183-fp.md
renameSync    <T>/state/quarantine/.tmp-96183-fp.md
readFileSync  <T>/state/quarantine/2026-09-05-fp.md
--- fsync count = 0
```

A `{refuse:true}` verdict, a P0b-verified artifact on the preservation record, and
**not one byte or directory entry flushed**. The redact arm is the same one level
down, with `mkdirSync('…/quarantine/redacted')` returning `…/quarantine` — the
recursively-created-parent case the stub named, now measured rather than asserted.

### 0.4 What changed under the fix, measured on five driven states

```text
hard, quarantine/ ALREADY EXISTS   [dest, quarantine]
hard, NOTHING under state/ yet     [dest, quarantine, state]
soft, NOTHING under state/ yet     [dest, quarantine/redacted, quarantine, state]
hard, DIRECTORY flush made to fail → the P1/P2 abort; RM=[dest]; quarantine/=["redacted"]
soft, DIRECTORY flush made to fail on BOTH shelves → the P3 abort; RM=[both artifacts]
```

Both abort messages are `WP-preservation-abort-widening` Table P's shipped values,
unedited — which is the point of Dispatch item 2: the new failure class reaches an
abort that already exists.

### 0.5 The full suite under the candidate fix — ZERO existing tests break

`node tests/with-temp-root.js tests/run.js` on a scratch copy carrying only the
`src/` fix: `tests 2618 / pass 2606 / fail 0 / skipped 12`, exit 0. With the five
rehearsal identities added: `tests 2623 / pass 2611 / fail 0 / skipped 12`, exit 0.

That zero is a design result, not luck — see finding **Z7**.

### 0.6 The RED proofs were RUN, not designed

Five identities were written on the rehearsal tree and the declaration file placed
beside them. `npm run red-proofs` unfiltered:

```text
10 declared proof(s), 10 selected
PROVEN  preservation-flush-removed     (WP-quarantine-preserve-durability criterion 1)
PROVEN  flush-failure-swallowed        (WP-quarantine-preserve-durability criterion 2)
PROVEN  directory-entry-not-flushed    (WP-quarantine-preserve-durability criterion 3)
PROVEN  created-parents-not-flushed    (WP-quarantine-preserve-durability criterion 4)
PROVEN  flush-order-inverted           (WP-quarantine-preserve-durability criterion 5)
… the four pre-existing criteria roll-ups, all PROVEN …
PROVEN  WP-quarantine-preserve-durability criterion 1 — preservation-flush-removed=PROVEN
PROVEN  WP-quarantine-preserve-durability criterion 2 — flush-failure-swallowed=PROVEN
PROVEN  WP-quarantine-preserve-durability criterion 3 — directory-entry-not-flushed=PROVEN
PROVEN  WP-quarantine-preserve-durability criterion 4 — created-parents-not-flushed=PROVEN
PROVEN  WP-quarantine-preserve-durability criterion 5 — flush-order-inverted=PROVEN
RUN: PROVEN                                                              exit 0
```

So every declared `expectRed` set is measured, `evaluateRed`'s own-body equality
included, and the four pre-existing proofs are undisturbed. Before that, each
declaration was validated statically: every `find` occurs exactly once in
`src/core/dream/validate.js`, every `marker` is in its own `replace` and absent
from the pristine file, and every mutated file passes `node --check`.

**This is further than round zero reached on the predecessor package**, where the
identities did not exist yet and V3's PROVEN state was unobserved by construction.

### 0.7 V1 and V2 extracted from the spec's fenced block and RUN, in TEN states

Each run was produced by cutting the ```bash block out of the finished spec file
and piping it to a shell, in a scratch git repo whose `main` is a pristine
`0fd50422` and which carries this spec — so the clause and sentence extractions
run against the real document.

```text
UNTOUCHED                       V1 NO FLUSH IS ISSUED AT ALL
                                V1 GUARANTEE SENTENCE APPEARS 0 TIME(S) … expected 1
                                V2 ROW P0b IS NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL 5
                                V2 WP-preservation-abort-widening.md DIFF IS empty, expected 1/1
                                V2 ROW B3b IS NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL 2
                                V2 WP-secret-fence-ep2-redact-arm.md DIFF IS empty, expected 1/1
                                V1/V2 RED                                             rc=1
COMPLIANT                       V1 OK / V2 OK / V1/V2 GREEN                            rc=0
COMPLIANT, SENTENCE WRAPPED     V1 OK / V2 OK / V1/V2 GREEN                            rc=0
  (a real 4-line JSDoc wrap)
validate.js REMOVED             V1 MISSING DELIVERABLE: …                              rc=1
SENTENCE REWORDED               V1 GUARANTEE SENTENCE APPEARS 0 TIME(S) … expected 1   rc=1
SENTENCE RETYPED TWICE          V1 GUARANTEE SENTENCE APPEARS 2 TIME(S) … expected 1   rc=1
fs.fsyncSync REMOVED            V1 NO FLUSH IS ISSUED AT ALL                           rc=1
P0b CLAUSE IN CELL 2            V2 ROW P0b IS NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL 5  rc=1
+ ONE UNRELATED EDITED LINE     V2 WP-preservation-abort-widening.md DIFF IS 2/2        rc=1
+ P0b CELL 5 REAUTHORED         V2 ROW P0b IS NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL 5  rc=1
```

Eight red states, each failing for its own reason, and two greens — the second of
which is the one a red-before-work run cannot reach: **a check that punished the
implementer for hard-wrapping a JSDoc sentence would look identical from the red
side.** Findings **Z6** and **Z8** both came out of these runs.

### 0.7b Every acceptance criterion with a runnable form was RUN

The runbook requires the coherence pass to execute, not read, every criterion and
verification step that can be executed on the pinned base with what the spec
itself provides. All eleven are accounted for:

| criterion | how it was run | result |
|---|---|---|
| 1–5 | `npm run red-proofs`, unfiltered, on the full rehearsal tree (0.6) | five `PROVEN` proof lines, five `PROVEN` criteria lines, `RUN: PROVEN`, exit 0 |
| 6 | V1, extracted from the spec, seven of the ten trees in 0.7 | discriminates in four distinct red states and both greens |
| 7 | V2, extracted from the spec, six of the ten trees in 0.7 | discriminates in four distinct red states |
| 8 | `npm test` on the rehearsal tree with the five identities | `2623 / 2611 / 0 / 12`, exit 0 — baseline + exactly five |
| 9 | the same `red-proofs` run | `10 declared proof(s), 10 selected`, `RUN: PROVEN` |
| 10 | `N/A` by the template's own rule; the reason is stated in the criterion | — |
| 11 | `npm test` and `npm run lint` | exit 0 / `0 error(s)` |

**Criterion 6 is the only one whose evidence is lexical, and that is deliberate**
— what a flush achieves is not something a test can assert (0.11 item 6). It is
also the criterion whose first form was broken and was caught by running it (Z6).

### 0.8 Template conformance — mechanical, and NOT the runbook's round zero

`grep -nE '^#{1,3} '` over `docs/specs/_TEMPLATE.md` and over the spec, compared
section by section: **every template section is present.** `## Contract reference`
carries two named canonical tables (**Table F**, **Table C**) in place of the
template's `### Contract table(s)` scaffold, which is what the template itself
prescribes and what `WP-quarantine-banner-location` and `WP-dot-segment-denial`
both do. `## Security checklist` is kept (the package opens descriptors on paths
derived from a sanitized basename). Nothing is silently absent; the one
non-template section is the `## Dispatch precondition`, an addition rather than an
omission, following the same-family precedent.

**This diff was run by the author**, so it is mechanical evidence and not the
runbook's clean-context conformance read, which *"runs in a clean context: an
executor that took no part in drafting"*. That executor is still owed — see 0.12.

### 0.9 Citations resolved, by construct name

The spec carries **no `file:LINE` citation at all** (`grep -oE
'`[a-zA-Z0-9_/.-]+\.(js|md|json):[0-9]+(-[0-9]+)?`'` over it returns nothing), so
the range-drift class the runbook names is structurally absent. Everything is
cited by construct, row id, test identity or quoted sentence, each verified to
exist at `0fd50422`:

| Cited construct | Resolves in |
|---|---|
| `quarantinePreserve`, `removeOwnedQuarantinePath`, `pruneRedactedOriginals`, `REDACTED_SUBDIR`, `REDACTED_RETENTION_CAP = 50`, `makeGates(…).secret` | `src/core/dream/validate.js` |
| `writeFilePrivate` (and the measured ABSENCE of any reference to it from `validate.js`) | `src/core/private-fs.js` |
| the win32-posture quotations *"POSIX modes do not exist there…"* and *"win32 → {insecure: 0} (POSIX-only guarantee, owner-approved)"* | `src/core/private-fs.js` |
| the explicit-branch idiom *"deliberately not the `fs.constants.X \|\| 0` idiom, which makes a missing flag look like a present one"* | `src/core/dream/vault-write.js`, echoed in `src/core/dream/workspace.js` |
| `getPaths` (`core = $WIENERDOG_HOME \|\| ~/.wienerdog`; `state`) | `src/core/paths.js` |
| `evaluateRed`, `rollUp`, `--wp` | `scripts/red-proofs.js` |
| Table P rows **P0**, **P0b**, **P1**, **P2**, **P3**; Table D rows **D1**, **D2**, **D3**, **D4**; the *"What this WP does not make durable"* paragraph | `docs/specs/done/WP-preservation-abort-widening.md` |
| Table B row **B3b** (6 cells → 3; its 2026-09-02 clause in cell 2), Table Q row **Q18** | `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` |
| Table Q rows **Q4**, **Q9** | `docs/specs/done/WP-dream-promote-module.md` |
| the third owner item and its Out-of-scope routing of the delivery stamp | `docs/specs/WP-quarantine-banner-location.md` |
| *"fail-loud confirmed"*, the ruled chain | `docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md` |
| *"let us go with your recommendations"* | `docs/specs/logbook/2026-09-05-owner-rulings-banner-queue.md` |

Row **P0b** was split on `' | '` and has **6** cells, its durability pointer in
cell **5**; row **B3b** has **3**, its 2026-09-02 clause in cell **2**. Both
splits round-trip byte-exactly, which is what V2's reconstruction depends on.

### 0.10 Findings this pass raised against its own draft, and their disposition

| # | Finding | Disposition |
|---|---|---|
| **Z1** | The stub located the preservation writes in `src/core/private-fs.js`'s `writeFilePrivate` temp+rename shape. Measured false: `src/core/dream/validate.js` does not require `private-fs` at all, and `quarantinePreserve` writes with `fs.writeFileSync` directly | **FIXED, with the correction stated in place** — Current state carries the census and the corrected seam, so a reader can tell a correction from an omission. `src/core/private-fs.js` is named in the "explicitly NOT in the boundary" list with this reason |
| **Z2** | The stub named its canonical table **Table D**, which is `WP-preservation-abort-widening`'s table for artifact ownership and disposal — a table this spec cites on almost every row. That is the exact row-id collision `WP-quarantine-banner-location` had to write a Context paragraph about for the two Table Qs | **FIXED by renaming to Table F**, with the reason stated in Current state and a sentence under Table F saying that every "Table D" in this spec is the predecessor's |
| **Z3** | The stub put *"a directory sync after an unlink, so a disposed artifact cannot reappear"* inside this package's canonical table. Measured: it is a different invariant (not-retained vs not-lost), over three call sites, two of which are shipped `best-effort` contracts, and its failure disposition cannot be "preservation failure" because the preservation has already failed | **FIXED by SPLIT.** `docs/specs/WP-quarantine-disposal-durability.md` filed as `Draft`, `depends_on` this package; Table F row **F7(a)** states the boundary as a RULE (the file is inside this boundary, so a file-exclusion would not have said it); Dispatch item **4** states the split with the cost of overruling |
| **Z4** | The stub required the honest guarantee to carry Node/libuv's silent `F_FULLFSYNC` → `F_BARRIERFSYNC` → `fsync` fallback. That is upstream implementation detail this package cannot RUN, and the runbook's rule is *paste the reproduction or do not state the behaviour* | **FIXED by not asserting it.** The chain appears nowhere in the spec as a claim. What it was cited FOR is established by two measurements instead — `fs.constants.F_FULLFSYNC` is `undefined` and `fs.fsyncSync` returns `undefined`, so the product can neither request the strong barrier nor observe which one it got — and the guarantee sentence rests on those. Current state records the substitution rather than dropping the stub's claim silently |
| **Z5** | The stub's disposition — *a flush that errors OR IS UNAVAILABLE is a preservation failure* — is fail-closed, and on win32 a directory may not be flushable through Node at all. Taken literally it would abort EVERY dream run that withholds a note on Windows, on the strength of a behaviour nothing in this pipeline can measure | **FIXED by scoping the guarantee, and RAISED as Dispatch item 1.** Table F row **F5** makes the protocol POSIX-only through an explicit named platform branch — not a swallowed error, which could not tell "no such call here" from "this flush really failed" — following the repo's owner-approved win32 posture and its explicit-branch idiom, both quoted. The overrule cost is stated: it needs a measurement on a Windows host first |
| **Z6** | **V1 went RED on the compliant tree.** Its single `grep -F 'Durability here is what the platform'` matched the sentence AND **the V-block's own extractor line**, which contains the key — so V1 reported two sentences where there is one. **Found by extracting the block from the finished spec and running it, not by reading it** | **FIXED with a two-stage structural key** — the second literal (`is on the medium.`) appears only in the sentence — and the block's comment says why the second stage is not decoration. Re-run in all ten states after the fix; every `rc=` in 0.7 is from after it |
| **Z7** | The obvious implementation — replace `fs.writeFileSync(tmp, …)` with an `openSync`/`writeSync`/`fsyncSync`/`closeSync` shape so the fd can be flushed — silently breaks **seven** existing failure injections in `tests/unit/dream-validate.test.js`, all of which patch `fs.writeFileSync` and match a STRING path. `fs.writeFileSync(fd, …)` defeats them the same way | **FIXED by choosing the other seam.** The artifact is flushed AFTER the rename, on `dest`, so the write is untouched and the blast radius is zero (measured, 0.5). The post-condition is identical — at the moment success is reported every flush in the set has completed — and Table F row **F6** states what the file-before-directory ORDER actually buys, which is not the post-condition but what a crash MID-protocol leaves behind |
| **Z8** | The first V-commentary claimed a wrapped-sentence tree was measured green. The script meant to wrap the sentence had died on shell quoting, so that tree was the ORDINARY compliant tree: **a green attributed to the wrong state** — the runbook's *a number from the wrong base looks like evidence and is not*, one level down | **FIXED by re-running it from a script file.** The wrap is a real four-line JSDoc wrap, `node --check` clean, and it is green. Recorded here because the failure mode is invisible in the output: both states print `V1 OK` |
| **Z9** | The first cut of Table C had each identity assert several facts at once. Under `evaluateRed`'s own-body EQUALITY that makes every mutation redden the full set, so the declared sets stop distinguishing anything and four of the five proofs become decoration | **FIXED by narrowing each identity to ONE fact** and then MEASURING each `expectRed` by running the lane (0.6). The narrowness is stated in Table C as the reason, not as a style note |
| **Z10** | `depends_on` named only `WP-preservation-abort-widening`, while the 2026-09-02 ruling had said this spec's `depends_on` *"gains nothing"* | **FIXED, with the reason stated so it is not read as re-deciding the sequencing.** What changed since the ruling is mechanical: both packages amend `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` (different rows), so an out-of-order merge puts two branches in one file. The entry makes the tooling enforce the order the owner already ruled |

### 0.11 Design decisions taken at round zero, with their reasons

1. **The artifact is flushed AFTER the rename, not before it.** The canonical
   recipe fsyncs the temp before renaming; the post-condition of both orders is
   identical here, because `quarantinePreserve` reports success only once every
   flush in the set has completed, so a crash mid-protocol cannot produce a
   reported success at all. What decided it is Z7: the shipped write is a
   string-path `fs.writeFileSync` that seven tests intercept.
2. **The created-directory set comes from `mkdirSync`'s own return**, not from a
   list anybody maintains: `fs.mkdirSync(p,{recursive:true})` returns the topmost
   path it created and `undefined` when it created none (measured three ways). So
   the walk is `dirname(qdir)` up to and including `dirname(firstCreated)`, and the
   set is closed by construction.
3. **The order that IS load-bearing is file-before-directory**, and the honest
   reason is not the post-condition: with the entry flushed first, a crash can
   leave a durable, reachable artifact over unflushed bytes — a SHORT file on the
   shelf the user is told to restore from, which the next run's collision loop then
   preserves under a `-1` name forever.
4. **POSIX-only, by an explicit branch** (Z5).
5. **The split** (Z3), and the delivery stamp **declined** — Dispatch item 3, whose
   deciding reason is that a stamp added later does not separate the classes: the
   records written between `WP-quarantine-banner-location` and a stamp are SOUND
   and UNSTAMPED, so any hedge keyed on the stamp hedges for them too.
6. **The evidence line is drawn in the spec, in its own paragraph.** The proofs
   establish that the flushes are issued on the right objects in the right order
   and that a failed flush fails the preservation. They establish nothing about a
   medium, and the spec says so and tells the implementer not to name a test for
   crash survival. The one thing that guards the over-claim is a **spec-owned
   sentence pinned lexically by V1**, because what a flush achieves is not
   something any test can assert.

### 0.12 What round zero did NOT establish

- **No clean-context executor has read this draft, and no external channel has.**
  The conformance diff in 0.8 was run by the author and is mechanical evidence
  only; the runbook's conformance read and coherence read both require an executor
  that took no part in drafting. Both are owed before round 1.
- **The five identities are the ARCHITECT's rehearsal, not the shipped tests.**
  What Table C fixes is the identity names, the band markers, the mutations and the
  declaration; the fixtures, helper and assertion shapes are the implementer's. A
  round that reviews the rehearsal code rather than the contract is reviewing
  something that will not ship.
- **Windows is unmeasured, by construction.** Dispatch item 1 says so and prices
  the alternative; nothing here claims what Node does on win32.
- **Crash survival is unmeasured, by construction**, and the spec's own evidence
  paragraph is where that is stated rather than worked around.
- **The disposal half is scoped out, not analysed.** `WP-quarantine-disposal-durability`
  is a stub whose first job is the value question, which may answer "no".

**STOP CRITERION (pinned before round 1):** the loop closes when an external round
returns no material design finding on either channel — a preserved artifact that
can still be reported successful without a completed flush; a directory entry the
protocol's set misses; a flush failure that does not reach the shipped abort, or
that reaches a NEW one; a RED proof whose mutation reddens an identity outside its
`expectRed` (or none) under the declared `testNamePattern`; an acceptance criterion
a wrong implementation passes (a flush assertion that only COUNTS calls; a clause
in the wrong cell; the created-ancestor row asserted only in the steady state,
where it is invisible); a statement anywhere that claims more than the platform's
flush provides; or a scope leak — into the disposal successor, into
`WP-quarantine-banner-location`'s carriers, or into Table P/Table D's trigger and
message taxonomy — and machinery/wording findings at that point are fixed within
the frozen surface or accepted as named residuals. **Escalations:** (i) two
consecutive rounds landing findings of the same kind → a design question per
ADR-0031, never another textual patch; (ii) a finding whose only honest fix adds
durable state beyond the artifact itself, changes one of the two shipped
`best-effort` removal postures, changes an owner-ruled value, or depends on a
measurement on a Windows host is PARKED — to the owner or to
`WP-quarantine-disposal-durability`; (iii) each of the FOUR Dispatch-precondition
items is the owner's, so a finding that only re-argues one is routed as a scope
objection and does not count toward the verdict.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review --base
main`, run from the branch worktree); shadow = hermetic Codex (`codex exec -s
read-only`, `CODEX_HOME=~/.codex-review-home`, detached worktree at the round's
tip, no approvals). Raw outputs are committed BEFORE adjudication as
`2026-09-05-quarantine-durability-gate-raw-round<N>-<channel>.txt`, and each round
row below cites the raw file's path AND the SHA of the commit that introduced it.

### Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| — | *(not yet run)* | — | — |

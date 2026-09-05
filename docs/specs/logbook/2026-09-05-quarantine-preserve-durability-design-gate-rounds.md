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

## Round zero — orchestrator's executors, 2026-09-05, on `284144db`

Two clean-context executors (claude-sonnet-5, read-only; raws
`2026-09-05-durability-round0-raw-template-executor.txt` and
`…-coherence-executor.txt`, committed pre-adjudication in `f000d006`):

- **Template conformance: CONFORMANT in practice.** Every template section is
  present, named and ordered as the template has it; the frontmatter passes
  `scripts/check-frontmatter.js` (268 specs, 4 agents, both `depends_on` and all
  ADR ids resolve); the verification block is one extractable fence. The five
  deviations listed are each a precedented corpus convention (the `Dispatch
  precondition` section and the "Explicitly NOT in the boundary" bullets, both
  shipped by the Ready `WP-quarantine-banner-location`; bare `Contract reference`
  / `Security checklist` headings; letter-named canonical tables). The executor's
  one substantive observation is about the REPO, not this spec: the Draft-stub
  shape `WP-quarantine-disposal-durability` follows (blockquote + partial
  sections, no `N/A —` placeholders) is what fourteen of the seventeen Draft
  stubs in `docs/specs/` use and is documented nowhere in `_TEMPLATE.md` or
  `spec-authoring.md` → **routed to `WP-process-runbook-sweeps`** as a runbook
  gap, not counted.
- **Coherence: 1 finding, C, DROPPED.** Under Implementation notes the five
  byte-exact source forms sit inside one bulleted list item, so fences (b)–(d)
  carry a two-space list margin over their real two-space indent while (a)'s raw
  bytes happen to equal the real form. Measured to have zero contract effect:
  `scripts/red-proofs.js` counts unanchored substrings, every `find` still occurs
  exactly once in a candidate built from the forms, every marker is absent
  pre-mutation and present once post-mutation, all five mutants pass
  `node --check`; the prose beside each fence and the top-level Table C JSON both
  state the real indent. Everything else the executor re-derived matched the
  architect's round zero: the empty `fsync` grep, the one-function seam, the
  Node measurements (`F_FULLFSYNC` undefined, `fsyncSync` → `undefined`,
  `mkdirSync({recursive:true})`'s three return states), the seven string-path
  `patchFs('writeFileSync')` injections, P0b (6 cells, clause in cell 5) and B3b
  (3 cells, clause in cell 2), the V-block untouched → `rc=1` byte-identical to
  the spec's claimed output, deliverable-absent → `MISSING DELIVERABLE`, the
  compliant candidate → `V1 OK / V2 OK` and `5/5 PROVEN` red-proofs, and item 3's
  scoping against the banner spec's Out of scope (no gap).

Round zero is closed with no change to the spec. External rounds follow.

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
| 6 (`1e38f90d`) | needs-attention / needs-attention | `…gate-raw-round6-codex-plugin.txt`, `…gate-raw-round6-herdr-shadow.txt` (both `d19941a1`) | Plugin 2 B + 1 C; shadow 2 A + 2 B; no scope objections. **BOTH CHANNELS VALIDATED THE DESIGN** — no false-SUCCESS path in the prescribed sequence, exactly three pathname removals each gated, the create-failure branch removing nothing, the chains complete and ordered, A12 cited correctly, the stub carrying its routed items. What remained is **evidence form and mirror rot**: no new object, no reopened family. **[A, shadow] `ownsName`'s failure-closed form was unspecified and untested** — F8 makes it load-bearing at four gates but pinned only its `lstat` line, so a predicate with no `catch` passed every identity and would emit a raw `ENOENT` (leaking the fd) the moment the in-scope user deletes a name before a gate; and a comparison narrowed to `Number` lets DISTINCT inodes above `MAX_SAFE_INTEGER` compare equal and authorize a deletion. → FIX: the WHOLE BODY becomes a byte-exact source form, F8 states what `false` means at each gate (fail closed, remove nothing, descriptor still closed), QPD-5 gains an ENOENT case and a doctored-bigint case, QPD-6 gains an ENOENT case, and two proofs — `ownership-check-not-failure-closed`, `ownership-check-narrows-to-number` — pin them. **[A, shadow] O_EXCL provenance was unscoped** against Node's own "might not work with network file systems" caveat, while a user's core can sit on a network-mounted home. → settled as a PRODUCT boundary: **Dispatch precondition item 7** — state the precondition (a local POSIX filesystem with atomic `O_EXCL` and hard links), disclose network-mounted cores as a named residual (what fails: exclusivity, hence provenance under overlapping runs; what holds: everything that consults only the held descriptor), and add **no runtime check**, because a cheap probe cannot tell "this filesystem does not honour `O_EXCL`" from "nothing raced me just now". **[B, converged] QPD-6 said SIX cases and listed five** → `(f)` added and the row re-counted to seven with the ENOENT case. **[B, converged] F10's operative mirrors still carried the round-4 model** ("three residuals, one destructive") in Exact contracts, the proof-scope paragraph and the Security checklist, and the checklist's blast-radius entry still said five tests / two seams → all rewritten, and the count audit extended to cardinals ONE–FOUR, which is exactly how they survived. **Correction carried:** Linux `fsync` does NOT require a write-open descriptor — that is System V's rule — so F5's rationale for `O_RDWR` is now "this function writes through it". All FIX. **Round 7 runs on both channels as the closing confirmation.** |
| 5 (`7a2b8a57`) | needs-attention / needs-attention | `…gate-raw-round5-codex-plugin.txt`, `…gate-raw-round5-herdr-shadow.txt` (both `38cabb26`) | Plugin 1 A + 1 B + 1 C; shadow 1 A + 1 B; no scope objections; nobody re-argued A12, the declined pinning or the six items. **THE NARROWED CONTRACT HELD — no channel found a false-SUCCESS path** — but its DISCLOSURE was incomplete and one canonical row was stale. Round 5 is therefore disclosure completeness and mirror rot on the design settled at round 4: **not a new object, not a reopened family**. **Converged (A):** F10's residual set was FALSE. The same irreducible check-then-unlink sits at BOTH temp removals as well as the `dest` one — and on the post-commit temp removal the run still reports **SUCCESS**, so that damage is silent; the premise *"the temp name is random and unpublished"* was also false (`.tmp-${process.pid}-${stem}${ext}`, `validate.js:720`). → FIX by COMPLETING the disclosure: F10 now names ONE CLASS with an instance at each of this call's three pathname removals, three destructive, plus the after-gate success window; the temp-name premise is corrected AND turned into the reason GUARANTEED (1) still holds (distinct pids ⇒ distinct temp names ⇒ overlapping runs never contend for one); item 6 re-priced over all three removals — **recommendation UNCHANGED and now stronger**, because never removing the post-commit temp would leave a second link at a deterministic pid-derived name and make the next same-pid run fail a preservation that should succeed; QPD-6 and criterion 7 narrowed to substitutions BEFORE a gate, with the after-gate windows disclosed and deliberately untested. **Plugin (A):** the inherited `tmpOwned` heuristic — written for `writeFileSync`, which combines create and write — was carried onto a standalone `O_CREAT`+`O_EXCL` open, so a non-EEXIST create failure could delete a foreign file. → FIX: `fd < 0` ⇒ this invocation created nothing ⇒ removes nothing; `let tmpOwned` deleted; new proof `create-failure-removes-unowned` and a sixth QPD-6 case. **Converged (B):** canonical F1 still described the superseded pathname write → rewritten to the round-4 descriptor form, with every mirror swept. **[C] counts** → the by-shape rule applied completely, verified by a recorded grep. All FIX. **Round 6 runs on both channels as the closing confirmation.** |
| 4 (`80cf27de`) | needs-attention / needs-attention | `…gate-raw-round4-codex-plugin.txt`, `…gate-raw-round4-herdr-shadow.txt` (both `bda158e2`) | Plugin 1 A; shadow 4 A + 1 C; no scope objections; nobody re-argued A12, the declined directory pinning, or the owner items. **THE THIRD CONSECUTIVE ROUND to find a window inside the "user's own hand" class F10 put IN SCOPE** (round 2 rename→open, round 3 link→open and the unconditional temp removal, round 4 create→open adoption, the D1 catch after a successful open, and a check-to-unlink race). **Node has no `unlinkat`, so a pathname unlink after a pathname check is irreducibly TOCTOU** — the shadow said so in its own words and asked for an explicit disposition rather than a fifth window fix. → **THE ANSWER IS TO NARROW THE CONTRACT, and row F10 is rewritten as GUARANTEED / DISCLOSED / OUTSIDE.** GUARANTEED: overlapping runs, closed by construction; and against the user's hand, that no substitution can produce a false SUCCESS. DISCLOSED: three residuals, only the third destructive — (a) `tmp` substituted before the commit leaves a spare link, nothing deleted; (b) `dest` substituted after the last gate on the SUCCESS path; (c) `dest` substituted between the ownership gate and the unlink on the FAILURE path, which deletes the replacement and which nothing in Node can close. PRICED as **owner item 6**: never removing on failure closes (c) but contradicts Table D rows D2/D3 and would leave this product's own secret-bearing artifact behind on every failed preservation — recommendation, keep the removal and disclose. **Two concrete fixes taken:** provenance moves to the EXCLUSIVE CREATE (`O_RDWR`, `O_CREAT` and `O_EXCL`, with the write and the read through that descriptor), which closes the adoption window by construction AND fixes `fsync`'s Linux `EBADF` on a read-only descriptor — F5 now scopes the darwin measurement honestly and names CI's `[ubuntu-latest, macos-latest]` matrix as where Linux is proved; and the shared D1 `catch` is gated wherever the descriptor exists, the unconditional rule narrowed to the create-failure state alone. **[C] the count mirrors** were swept completely, the by-shape rule applied to the last four. All FIX. **Round 5 runs on both channels and is the closing confirmation only if the NARROWED contract holds.** |
| 3 (`95f07f36`) | needs-attention / needs-attention | `…gate-raw-round3-codex-plugin.txt`, `…gate-raw-round3-herdr-shadow.txt` (both `444d8d80`) | Plugin 1 A, shadow 1 A + 1 B, one routed objection. **BOTH CHANNELS VERIFIED EVERY ROUND-2 DISPOSITION CLOSED** — F10's A12 citation accurate and consistent with the threat model, F9's `linkSync` an atomic EEXIST no-clobber decision at the commit instant, the `lstat`+`isFile`+`bigint` pin closing the symlink case, the 18-case matrix accounting for every site with coherent routes, criterion 8 / DoD item 2 honest about V1's bound, SHAs and counts matching, the stub sound. **Neither re-litigated A12 or the declined directory pinning, so the family did NOT reopen at the design level** — escalation (i) does not fire again: what remained was the RESIDUE of round 2's design, an implementation-SHAPE defect in the prescribed SEQUENCE. **Converged (A):** the ownership handoff after the link acted on PATHNAMES this invocation may no longer own — (a) `dest` replaced between the link and the open bound the descriptor to the replacement, the byte comparison short-circuited before the ownership check, and the mandated cleanup deleted the user's file; (b) the temp name replaced between the link and its unconditional removal was unlinked by an invocation that no longer owned it. Both sit inside F10's IN-SCOPE "user's own hand". → FIX by the closed form **"ACT ONLY ON THE INODE YOU HOLD"**: open `tmp` ONCE before the commit, and gate every pathname act on `ownsName(p, fd)` — the temp removal, the last gate, and the failure removal of `dest`. **The read moves onto that descriptor, which DELETES the post-commit window rather than narrowing it** (measured: the fd's inode survives `linkSync`, `dest` names it, `nlink` 2 → 1). The `replaced` flag disappears: one predicate, three gates. QPD-5 gains the post-commit substitution, QPD-6 gains the temp substitution, and four RED proofs are added or retargeted so detection and non-removal are proved separately. **[B/C] stale count mirrors** → every prose count removed and the checklist given a COUNTS-BY-SHAPE rule. **Routed (shadow):** the pruning pass excludes only its own run's basenames, so an overlapping run can select a still-running invocation's fresh artifact for eviction — added to the disposal stub's call-site list as a live-run ownership question durable unlink does not answer. All FIX. HEAVY (the source forms change) → **round 4 is the closing confirmation on both channels.** |
| 2 (`f0c4f615`) | needs-attention / needs-attention | `…gate-raw-round2-codex-plugin.txt`, `…gate-raw-round2-herdr-shadow.txt` (both `95262ac1`, `e4012314` before the rebase) | Plugin 4 A + 1 B, shadow 3 A + 1 C, one routed objection, no owner-item scope objection; both runs valid. **THE PINNED CIRCUIT BREAKER FIRES — escalation (i), the same-UID substitution family for the SECOND consecutive round** (round 1: the pathname reopen; round 2: plugin A1 the rename/open ownership split, plugin A2 path-resolved directory inodes, shadow A2 a following `stat`, plus the routed pre-rename `existsSync` race). **The answer is a CONTRACT, not a third pin: Table F row F10 — THE ADVERSARY.** F8 and F9 defend against OVERLAPPING RUNS and THE USER'S OWN HAND; arbitrary same-user native code is a NAMED RESIDUAL citing `docs/THREAT-MODEL.md`'s **A12**, because a process that can swap `qdir` aside mid-flush can also delete the copy after this function returns, so no protocol holds against it and every pin implies a false guarantee. Parked as **Dispatch-precondition item 5** with its overrule cost. **For the in-scope adversary, the smallest mechanism that closes it, measured:** row **F9**, a NO-CLOBBER commit (`linkSync` + temp removal) — which also makes F8's "remove nothing" decidable and ABSORBS the routed race. **Shadow A2 TAKEN** (`lstat` + `isFile()` + bigint), not as an A12 defence but because a following `stat` is wrong for the non-hostile case too. **Plugin A2 DECLINED** as an A12 defence, in Out of scope with the reason. **Converged (A): V1 accepts a contradictory over-claim** → V1 gains an `on the medium` count (the shadow's exact fixture now RED), criterion 8 NARROWED to what V1 measures, and the absence obligation moved to Definition of done item 2 as a PR-gate duty; the differently-worded over-claim is recorded GREEN as the measured bound. **Plugin A3 + shadow A1: QPD-2 was not the site matrix and the redacted/P3 route was never exercised** → QPD-2 becomes the complete 18-case matrix over BOTH arms plus three abort routes (P1/P2, P3, and no-abort); `state-directory-not-flushed` added for the one chain member with no mutation. **[B] stale base** → rebased onto `38562ec4`, every baseline and count re-measured. **[C] disposal stub** → fixed. All FIX. HEAVY (the commit primitive changes) → **round 3 runs as a full external round.** |
| 1 (`cb18367a`) | needs-attention / needs-attention | `…gate-raw-round1-codex-plugin.txt`, `…gate-raw-round1-herdr-shadow.txt` (both `e4012314`) | Plugin 3 A, shadow 3 A, one scope objection routed to the disposal stub and not counted; both runs valid (porcelain empty before and after). **Converged (A) — the inode:** the shipped read-back is `readFileSync(dest)` by pathname and the prescribed flush reopened the pathname, so a same-UID rename between them makes the function flush one inode and report bytes from another; `O_NOFOLLOW` does not refuse a regular file, and neither mode 0700 nor the steal-able dream lock excludes the user's own processes → FIX: row **F8** — ONE descriptor carries the read-back, the comparison and F1's flush, and `dest` must still name its `(dev, ino)` as the LAST gate before success; a mismatch fails and removes NOTHING. **Converged (A) — F4's evidence:** QPD-2 injected only at the artifact, so an implementation whose directory flush swallows its failure passed every declared mutation → FIX: QPD-2 now injects at five sites (artifact `fsync`; `qdir` `fsync` and `open`; anchor `fsync` and `open`), each asserting `null`, `dest` absent and the shipped abort, plus a new `directory-flush-failure-swallowed` proof. **Plugin (A) — the anchor, settled as a DESIGN question:** F3's created-set derivation misses an ancestor an EARLIER STEP OF THE SAME RUN created, and `acquireLock`'s `mkdirSync(stateDir, {recursive:true})` is that step (measured: created-set → 3 flushes stopping at `state/`; fixed chain → 4 ending at the core) → FIX: F3 becomes a FIXED chain to an anchor, `path.dirname(stateDir)`, deleting the `mkdirSync`-return derivation entirely; road not taken and its cost recorded. **Shadow (A) — QPD-4/QPD-5:** neither forced the two-level redacted chain nor a bottom-up order → FIX: QPD-3 and QPD-4 assert the exact ORDERED sequence on each arm, with `intermediate-shelf-not-flushed` and `anchor-not-flushed` as their narrow mutations. **Routed, not counted (shadow):** a crash after D2's removal before return — confirmed covered and now named in the disposal stub. All FIX, applied in this commit. Escalation (i) does not fire (four kinds, one round); escalation (ii) checked against all four and fires on none, so no fifth owner item. HEAVY (the shipped read-back shape and the flush set both change) → **round 2 runs as a full external round on both channels.** |

## Round 1 — architect's revision pass, 2026-09-05

### Round 1 fixes

| # | Finding (channel) | Fix |
|---|---|---|
| **1** [A, both] | Path-based reopen can flush a different inode than the one read back | **Row F8, new.** `dest` is opened ONCE after the rename; the read-back, the byte comparison and F1's flush all go through that descriptor; `dest` must still name its `(dev, ino)` as the last gate before success — the latest observable moment, hence the narrowest window. A mismatch removes NOTHING (Table D row D1's ownership rule applied to `dest`), which the Security checklist states a second time because disposing of a replacement would hand a same-UID process a way to make this run delete a file at a name they control. **Two bounds are stated IN the row rather than implied:** the check narrows the window and cannot close it, and it is only as strong as the platform's `(dev, ino)`. Identity **QPD-5**, proofs `inode-pin-removed` and `replacement-removed-on-mismatch`, criterion 6 |
| **2** [A, both] | F4's evidence covered only the artifact flush | **QPD-2 now injects at FIVE sites** — the artifact's `fsyncSync`, and both `openSync` and `fsyncSync` for `qdir` and for the anchor — each asserting `null`, `dest` absent, and the exact shipped P1/P2 abort. New proof `directory-flush-failure-swallowed`; row **F4** rewritten to say the row is not about the artifact alone |
| **3** [A, plugin] | Pre-existing, never-flushed ancestors are outside F3's set | **Row F3 is now a FIXED chain to an ANCHOR**: `qdir`, the shelf when distinct, `stateDir`, `path.dirname(stateDir)`. The `mkdirSync`-return derivation, source form (e) and the loop's root guard are all deleted — the fixed chain is strictly stronger AND simpler, and it is what makes QPD-3/QPD-4's exact-sequence assertions possible (finding 4). New proof `anchor-not-flushed` |
| **4** [A, shadow] | QPD-4/QPD-5 did not force the redacted chain or the F6 order | **QPD-3 and QPD-4 assert the exact ORDERED sequence**, one per arm; QPD-4 is pinned to the redact arm with neither directory present, which is the only state that can see the intermediate shelf. New proof `intermediate-shelf-not-flushed`; `flush-order-inverted` retargeted at both sequence identities; criterion 5 now covers all of F6 |
| — | Routed (shadow): a crash after D2's removal before return | **Confirmed covered** and now named explicitly in `WP-quarantine-disposal-durability`'s call-site list, with why it cannot make this call report success |

### 1.1 Measurements

Every "after" number below is a run on a `git archive` scratch copy of
`0fd50422`; the worktree holds only the documents.

```text
src fix alone                    npm test  2618 / 2602 / fail 4      exit 1
  the four:  quarantinePreserve (P0b, Table D row D2) × 2
             quarantinePreserve (Table D row D3)
             quarantinePreserve (Table D row D4)
  — all four inject through patchFs('readFileSync') on a STRING path, which
    row F8 makes a descriptor. NO ASSERTION CHANGES; one shared fd→path helper
    moves the injection point.
+ migrated injections            npm test  2618 / 2606 / fail 0      exit 0
+ the five identities            npm test  2623 / 2611 / fail 0      exit 0
npm run red-proofs (unfiltered)  14 declared proof(s), 14 selected
                                 all 14 PROVEN; RUN: PROVEN          exit 0
  six criteria roll-up lines for this WP:
    criterion 1 — preservation-flush-removed=PROVEN
    criterion 2 — artifact-flush-failure-swallowed=PROVEN; directory-flush-failure-swallowed=PROVEN
    criterion 3 — containing-directory-not-flushed=PROVEN; intermediate-shelf-not-flushed=PROVEN
    criterion 4 — anchor-not-flushed=PROVEN
    criterion 5 — flush-order-inverted=PROVEN
    criterion 6 — inode-pin-removed=PROVEN; replacement-removed-on-mismatch=PROVEN
```

**The anchor decision, measured on three tree states rather than argued.** Driven
over `makeGates({stateDir}).secret(…)` with every flush resolved through its
descriptor:

```text
tree state                                   created-set (round 0)   fixed chain (round 1)
quarantine/ + redacted/ already exist        2 flushes               4 / 5
nothing under the core exists yet            3 / 4                   4 / 5
state/ created by acquireLock THIS RUN       3 flushes, stops at     4 flushes, ends at
                                             <T>/.wienerdog/state    <T>/.wienerdog
```

The last row is the plugin's finding reproduced: the core directory holds the
`state/` entry `acquireLock` had just created, and only the fixed chain flushes it.
**The fixed chain is invariant across all three states**, which is what lets QPD-3
and QPD-4 assert an exact ordered sequence at all. **Cost:** one directory
`open`+`fsync`+`close` is **0.018 ms** on this machine's APFS volume (200
iterations, 3.7 ms), so the chain adds under a tenth of a millisecond per preserved
note. **Road not taken:** walking above the core to `$HOME` and `/` — it would close
one further condition (a user who deletes the install between scheduling and the
run) at the price of flushing directories this product does not own, on every
preservation. Named as a residual in the spec rather than closed.

**V1/V2 re-extracted from the revised spec and re-run in the same TEN trees**, each
a scratch git repo whose `main` is a pristine `0fd50422` carrying this spec:
untouched → 6 findings, `rc=1`; **compliant → `V1 OK / V2 OK`, `rc=0`**; **compliant
with the guarantee sentence hard-wrapped over four JSDoc lines → `rc=0`**;
`validate.js` removed → `MISSING DELIVERABLE`; sentence reworded → `APPEARS 0
TIME(S)`; sentence retyped → `APPEARS 2 TIME(S)`; `fs.fsyncSync` removed → `NO FLUSH
IS ISSUED AT ALL`; P0b's clause in cell 2 → `NOT ITS BASE ROW PLUS ITS CLAUSE IN
CELL 5`; one unrelated edited line → `DIFF IS 2/2`; P0b's cell 5 reauthored →
`NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL 5`. Both byte-exact `Done`-spec clauses
were rewritten this round (the chain wording and the identity condition), so V2's
extraction was re-verified rather than assumed.

### 1.2 What round 1 did NOT change

- **The four Dispatch-precondition items.** Escalation (ii) was checked against all
  four findings: none adds durable state beyond the artifact, none changes either
  shipped `best-effort` removal posture, none changes an owner-ruled value, and none
  needs a Windows measurement. **No fifth owner item**, and the check is recorded in
  the spec so its absence is visible.
- **The guarantee sentence**, byte for byte, and the evidence line it draws. Row F8
  is a verification property, not a durability claim, and nothing in this round
  widened what a flush is said to achieve.
- **Table P and Table D.** No new abort, no new message, no new field, no new
  disposal path. Row F8's mismatch arm is a NEW state Table D never had — the
  shipped rows are about `tmp` and `dest` under the shipped code — so Table F owns
  it, and the spec says why it is not D2 rather than re-authoring D2.
- **The split.** The disposal half stays in `WP-quarantine-disposal-durability`;
  the one case the shadow routed there is now named in that stub.
- **`src/core/dream/lock.js`.** `acquireLock`'s unflushed `mkdirSync` is the
  measurement that settled the anchor, not a defect this package fixes: the fixed
  chain makes the preservation independent of what any earlier step did.

**Round 2 runs as a FULL external round on both channels**, per weighted closure:
finding 1 changes the shipped read-back's shape and findings 2–4 change the flush
set and its evidence, so every fix is HEAVY.

## Round 2 — architect's revision pass, 2026-09-05

### Round 2 fixes

**The circuit breaker fired, and this is the contract it extracted.** Two
consecutive rounds landed findings in one family — a same-UID process substituting
an object the protocol depends on — so ADR-0031 and the pinned criterion both say
the next step is a design question, never another textual patch. **The contract is
Table F row F10: WHO the protocol defends against.** It was never stated, which is
exactly why each round could find another unpinned object: the artifact's inode
(round 1), then the destination's ownership, the directory inodes, and the symlink
form of the check (round 2). A protocol with no named adversary has no fixed point.

**The tree already owned the answer.** `docs/THREAT-MODEL.md` classes arbitrary
same-user native code as **A12** and says Wienerdog is *"not a boundary against
arbitrary software already running as the same user"*; of a keyed MAC proposed for
the same class it says such a mechanism *"would only imply a false guarantee"*. Row
F10 applies that, with a reason that is decisive rather than economic: **a process
that can swap `qdir` aside during its flush can also delete the preserved copy one
instruction after this function returns.**

| # | Finding (channel) | Disposition |
|---|---|---|
| **A1** [plugin] | The ownership split between `renameSync(tmp, dest)` and `openSync(dest)`: run B commits over run A and finishes; A opens B's file, short-circuits before `stillNamed`, and the prescribed non-disposal guard does not fire, so A deletes B's only copy | **FIX — row F9, the NO-CLOBBER commit.** `fs.linkSync(tmp, dest)` fails `EEXIST` rather than replacing, then the temp name is removed outside the commit's `catch` (Table D row D3's fail-loud rule). This is an IN-SCOPE adversary under F10 — the product creates overlapping runs itself — and the damage is data loss, so it is closed here rather than routed. It also makes F8's "remove nothing on a mismatch" decidable: after a successful link, `dest` is this invocation's by construction. Identity **QPD-6**, proofs `commit-clobbers-destination` and `tmp-not-removed-after-commit` |
| **A2** [plugin] | Directory inodes are path-resolved, never pinned: a same-UID process can swap `qdir` aside during its flush and restore it before the final gate | **DECLINED as an A12 defence, and parked as owner item 5.** Retaining a descriptor per chain directory to the last gate with a bigint re-compare defends only against the actor F10 puts outside the boundary. Recorded in Out of scope with the reason, and in the Dispatch precondition with the overrule cost |
| **A2** [shadow] | `stillNamed` may follow symlinks: a hard link of the verified inode into an unflushed directory plus a symlink at `dest` passes a `statSync` check | **FIX — `fs.lstatSync(dest, {bigint:true})` + `isFile()`.** Taken NOT as an A12 defence but because a following stat is wrong for the non-hostile case too, and it costs two words. QPD-5 gains the symlink-to-hard-link substitution; proof `identity-check-follows-symlinks` |
| **A3** [plugin] + **A1** [shadow] | QPD-2 was not the full failure-site matrix (no artifact `openSync`, no `stateDir`, no intermediate shelf) and the redacted/P3 route was never exercised under failure | **FIX — one matrix.** QPD-2 is now 18 cases: every chain member of every arm × `openSync` and `fsyncSync`, each asserting `null`, `dest` absent and no temp left. Plus the three abort ROUTES: P1/P2 on the withheld arm, **P3** when the failing target is on both chains, and **no abort** when only the redacted shelf fails. `state-directory-not-flushed` added for the one chain member that had no mutation |
| **A4** [plugin] + **A3** [shadow] | V1 accepts a contradictory over-claim beside the approved sentence | **FIX, within the frozen surface, in three parts.** (1) V1 counts `on the medium` and requires exactly one — the shadow's own fixture is now RED, measured. (2) Acceptance criterion **8** is NARROWED to exactly what V1 measures; it no longer claims semantic absence. (3) The absence obligation moves to **Definition of done item 2**, a PR-gate duty naming the blocking class. **The byte-exact-whole-block alternative was rejected**: it would make `@param` lines contract and take code structure from the implementer, and it still could not see a claim written elsewhere in the file. A differently worded over-claim is recorded GREEN in the V-block table as the measured bound |
| **B** [plugin] | Stale base | **FIX — rebased onto `38562ec4`** (docs-only, no conflicts, raw filenames unique). Every baseline, count and SHA re-measured |
| **C** [shadow] | The disposal stub still said "created-ancestor walk" | **FIX**, plus the commit and the identity check named there so the successor's implementer is pointed at the shipped design |
| routed [shadow] | The shipped pre-rename `existsSync(dest)` is an ownership race | **ABSORBED, not routed.** Row F9 does not close the window; it removes the commit's ability to act on it. The residue — a preservation that fails instead of picking the next free name — is stated in Out of scope |

**The road not taken, recorded because it was the reviewers' own recommendation.**
Both channels proposed pinning descriptors for the directory chain. It is declined
by F10's ruling, and the decline is an owner item rather than an architect's
preference, because *where the adversary is pinned* is a threat-model statement and
`docs/THREAT-MODEL.md` is the owner's document.

### 2.1 Measurements

```text
BASELINES at 38562ec4 (post-rebase)
  npm test          tests 2623 / pass 2611 / fail 0 / skipped 12       exit 0
  npm run lint      Linting: 637 file(s) | 0 error(s) | lint passed    exit 0
                    frontmatter check passed: 267 spec(s), 4 agent(s)
  npm run red-proofs  11 declared proof(s), 11 selected; RUN: PROVEN   exit 0

THE CANDIDATE
  src fix alone     tests 2623 / pass 2606 / fail 5                    exit 1
    ✖ quarantinePreserve (P0b, Table D row D2): a corrupted artifact is a FAILURE and is removed
    ✖ quarantinePreserve (P0b, Table D row D2): an artifact that cannot be read back is a FAILURE and is removed
    ✖ quarantinePreserve (Table D row D1): the rename fails after a successful write — tmp is removed, dest was never created
    ✖ quarantinePreserve (Table D row D3): a dest that cannot be removed after a failed verification fails LOUD
    ✖ quarantinePreserve (Table D row D4): every failure leaves this invocation owning nothing, over a NON-EMPTY quarantine tree
  + migrated (5)    tests 2623 / pass 2611 / fail 0                    exit 0
  + six identities  tests 2629 / pass 2617 / fail 0 / skipped 12       exit 0

  npm run red-proofs (unfiltered, rehearsal tree)
    24 declared proof(s), 24 selected — ALL PROVEN; RUN: PROVEN        exit 0
    criterion 1 — preservation-flush-removed=PROVEN
    criterion 2 — artifact-flush-failure-swallowed=PROVEN; directory-flush-failure-swallowed=PROVEN
    criterion 3 — containing-directory-not-flushed=PROVEN; intermediate-shelf-not-flushed=PROVEN
    criterion 4 — state-directory-not-flushed=PROVEN; anchor-not-flushed=PROVEN
    criterion 5 — flush-order-inverted=PROVEN
    criterion 6 — inode-pin-removed=PROVEN; replacement-removed-on-mismatch=PROVEN; identity-check-follows-symlinks=PROVEN
    criterion 7 — commit-clobbers-destination=PROVEN; tmp-not-removed-after-commit=PROVEN
```

**Two shipped `renameSync` injections do NOT break, and neither could have been
predicted from the call name.** `(… herdr-shadow round 1 P1): a FOREIGN file
already at the tmp pathname` never reaches its rename injection — the exclusive
`wx` create refuses first. `(Table D row D3): a tmp that cannot be removed after a
failed rename fails LOUD` passes for an EQUIVALENT reason under row F9: the commit
succeeds, the post-commit temp removal hits its `rmSync` injection, and the same
`WienerdogError` matching `/\.tmp-/` is raised.

**V1/V2 re-extracted from the revised spec and run in TWELVE trees** (`main` = a
pristine `38562ec4`, each carrying this spec): untouched → 7 findings, `rc=1`;
**compliant → `V1 OK / V2 OK`, `rc=0`**; **wrapped compliant → `rc=0`**;
`validate.js` removed → `MISSING DELIVERABLE`; **the round-2 shadow's over-claim
fixture → `'on the medium' APPEARS 2 TIME(S) … expected 1`, `rc=1`**; sentence
reworded → 2 findings; sentence retyped → 2 findings; `fs.fsyncSync` removed → `NO
FLUSH IS ISSUED AT ALL`; P0b's clause in cell 2 → `NOT ITS BASE ROW PLUS ITS CLAUSE
IN CELL 5`; one unrelated edited line → `DIFF IS 2/2`; P0b's cell 5 reauthored →
`NOT ITS BASE ROW …`; **and a DIFFERENTLY WORDED over-claim → `V1 OK / V2 OK`,
`rc=0` — GREEN, deliberately recorded, because it is the bound on what V1 can do.**

### 2.2 What round 2 did NOT change

- **The guarantee sentence**, byte for byte, and the evidence line it draws. Every
  round-2 fix is about ownership and verification, not about what a flush achieves.
- **Table P and Table D.** No new abort, no new message, no new field. Row F9
  substitutes "the commit" for "the rename" in D1/D2's trigger wording; the path
  each state owns is unchanged, and the P0b clause names the substitution rather
  than leaving it to be inferred.
- **Rows F1–F7.** The flush set, its order, the anchor, the POSIX-only scope and the
  F7 exclusions are exactly as round 1 left them; what grew is the EVIDENCE for
  them (QPD-2's matrix, `state-directory-not-flushed`).
- **The split, and the four earlier owner items.** Item 5 is added; items 1–4 stand
  with their recommendations unchanged.
- **The collision loop's naming rule.** Row F9 makes the commit refuse rather than
  making the SELECTION atomic. A create-or-retry loop over the numbered candidates
  is a different contract and nothing here needs it.

**Round 3 runs as a FULL external round on both channels**: the commit primitive
changes, so the fix is HEAVY by the weighted-closure rule.

## Round 3 — architect's revision pass, 2026-09-05

### Round 3 fixes

**The family did NOT reopen, and saying so is the point of this section.** Both
channels explicitly verified every round-2 disposition closed and neither
re-litigated A12 or the declined directory-inode pinning. Round 2 settled the
DESIGN — *who* the protocol defends against (row **F10**) and *how* it refuses a
name it did not create (row **F9**). Round 3's finding is the residue of that
design: the SEQUENCE still acted on pathnames after the commit, so the predicate was
right and its application was late. **Escalation (i) therefore does not fire a
second time**: two consecutive rounds in one family triggers a design question, and
that question was asked and answered at round 2. This is form, not predicate.

| # | Finding (channel) | Disposition |
|---|---|---|
| **A1** [converged] | The ownership handoff after the link acts on pathnames this invocation may no longer own. **(a)** `dest` replaced between the link and the open → the descriptor binds to the replacement, `Buffer.compare` short-circuits BEFORE the ownership check, and the mandated cleanup deletes the user's file. **(b)** the temp name replaced between the link and its unconditional removal → the invocation unlinks a path it no longer owns. QPD-5 injected only from inside the artifact flush and QPD-6 only a destination planted before the link, so the faulty sequence passed both criteria | **FIX — "ACT ONLY ON THE INODE YOU HOLD."** Identity is established ONCE, by opening `tmp` immediately before the commit; `ownsName(p, fd)` (`lstat` + `isFile()` + bigint `(dev, ino)` against `fstat(fd)`) gates **three** acts: the temp removal, the last gate before success, and the failure removal of `dest`. **The read-back and F1's flush move onto that descriptor, which DELETES window (a) rather than narrowing it** — there is no second pathname lookup to race. The `replaced` flag disappears; one predicate replaces it. QPD-5 gains the post-commit substitution, QPD-6 gains the temp substitution, and the proofs split detection from non-removal because a single mutation cannot see both |
| **B1** [shadow] | Five operative mirrors still named counts the tables had moved past (identities, RED declarations, mutations, owner items, and a criterion number) | **FIX, and the class is closed rather than the instances.** Every prose count is removed and replaced by a pointer to the table that owns it; the Mirrored Surface Checklist gains a **COUNTS ARE REGISTERED BY SHAPE, NOT BY NUMBER** rule that names the only numbers this spec may still write in prose — the ones an acceptance criterion or a verification step must ASSERT — and lists each of those as a mirror in its own right |
| routed [shadow] | The pruning pass excludes only its own run's basenames, so a lock-stealing overlapping run can select a still-running invocation's fresh `redacted/` artifact for eviction | **CONFIRMED COVERED and now named** in `WP-quarantine-disposal-durability`'s call-site list, with the reason it is not this package's: durable unlink does not answer whether the artifact was safe to SELECT, which is live-run ownership |

**The road not taken, because it looks like the obvious closure and is not.**
Establishing identity at the exclusive CREATE — writing through the descriptor —
would close the last remaining sliver, the window between the create and the open.
It is not taken, and the reason is measured rather than argued:
**`fs.readFileSync(fd)` immediately after `fs.writeFileSync(fd)` returns EMPTY**,
because the descriptor's position sits at EOF, so that shape needs explicit
position management AND moves seven shipped injections. Row F8 therefore states the
bound instead: identity begins at the OPEN, a substitution before it is
indistinguishable from this invocation's own write, it is bounded by the exclusive
create that made the name this invocation's (Table D row D1), and it cannot cost a
copy because the byte comparison then fails.

### 3.1 Measurements

```text
BASELINES at 38562ec4 (unchanged from round 2)
  npm test          tests 2623 / pass 2611 / fail 0 / skipped 12        exit 0
  npm run red-proofs  11 declared proof(s), 11 selected; RUN: PROVEN    exit 0
  npm run lint      Linting: 637 file(s) | 0 error(s)                   exit 0

THE PROBES THAT DECIDED THE SHAPE (Node v25.9.0, darwin)
  fd inode survives linkSync unchanged                     true
  dest names the fd's inode after the link                 true   (nlink 2)
  after unlink(tmp): fd valid, same inode, dest names it   true   (nlink 1)
  readFileSync(fd) after link+unlink                       "the judged bytes\n"
  fsyncSync(fd) on an O_RDONLY fd                          undefined (i.e. ok)
  after a substitution at dest: fd inode unchanged         true
                                ownsName(dest, fd)         FALSE
  readFileSync(fd) right after writeFileSync(fd)           ""   ← why the write stays a pathname call

THE CANDIDATE
  src fix alone     tests 2623 / pass 2606 / fail 5                     exit 1
    (the same five as round 2 — the round-3 reshape adds no blast radius)
  + migrated (5)    tests 2623 / pass 2611 / fail 0                     exit 0
  + six identities  tests 2629 / pass 2617 / fail 0 / skipped 12        exit 0

  npm run red-proofs (unfiltered, rehearsal tree)
    25 declared proof(s), 25 selected — ALL PROVEN; RUN: PROVEN         exit 0
    criterion 1 — preservation-flush-removed
    criterion 2 — artifact-flush-failure-swallowed; directory-flush-failure-swallowed
    criterion 3 — containing-directory-not-flushed; intermediate-shelf-not-flushed
    criterion 4 — state-directory-not-flushed; anchor-not-flushed
    criterion 5 — flush-order-inverted
    criterion 6 — destination-ownership-gate-removed; destination-removal-not-gated;
                  ownership-check-follows-symlinks
    criterion 7 — commit-clobbers-destination; tmp-removal-dropped; tmp-removal-not-gated
```

**Every `expectRed` set was correct on the first run**, including the two that cross
identities and which reading would not have predicted: restoring the replacing
rename strands BOTH substitution identities, because each takes the commit call as
its seam; and dropping the temp removal reddens QPD-2 as well as QPD-6, because the
site matrix asserts that no temp is left behind on a failure path too.

**V1/V2 re-extracted and re-run in all TWELVE trees** against the round-3 candidate
and the re-worded clauses — the third consecutive round in which the clauses moved:
untouched → 7 findings, `rc=1`; **compliant → `V1 OK / V2 OK`, `rc=0`**; **wrapped
compliant → `rc=0`**; `validate.js` removed → `MISSING DELIVERABLE`, `rc=1`; the
round-2 over-claim fixture → `'on the medium' APPEARS 2 TIME(S)`, `rc=1`; sentence
reworded → 2 findings; sentence retyped → 2 findings; `fs.fsyncSync` removed → `NO
FLUSH IS ISSUED AT ALL`, `rc=1`; P0b's clause in cell 2 → `NOT ITS BASE ROW PLUS ITS
CLAUSE IN CELL 5`, `rc=1`; one unrelated edited line → `DIFF IS 2/2`; P0b's cell 5
reauthored → `NOT ITS BASE ROW …`; **and the differently worded over-claim → `V1 OK
/ V2 OK`, `rc=0`, still deliberately GREEN.**

### 3.2 What round 3 did NOT change

- **The DESIGN settled at round 2.** Row F10's adversary, the A12 residual, the
  declined directory-inode pinning, the no-clobber commit and the POSIX-only flush
  scope all stand exactly as round 2 left them, and both channels confirmed each.
- **The guarantee sentence**, byte for byte, and the evidence line it draws. Round 3
  touched ownership, not what a flush achieves.
- **Table P and Table D.** Still no new abort, no new message, no new field. Row F8
  now gates two removals that Table D decides the SHAPE of, and the P0b clause names
  that rather than leaving it to be inferred. **The shipped D1 `catch` cleanup is
  deliberately NOT gated** — in the state where the identity open itself failed
  there is nothing to gate on, and D1's disposal is the predecessor's row; Out of
  scope says so.
- **The five Dispatch-precondition items**, each with its recommendation unchanged.
- **The blast radius.** The round-3 reshape breaks exactly the same five shipped
  injections round 2 did, and no more; what changed is that the four read-back
  injections now match by INODE rather than by name, because the descriptor is
  opened on `tmp`.

**Round 4 is the closing confirmation on BOTH channels**: the byte-exact source
forms change, so the fix is HEAVY by the weighted-closure rule.

## Round 4 — architect's revision pass, 2026-09-05

### Round 4 fixes

**Three rounds in a row found a window in one class, and that is the finding.**
Rounds 2, 3 and 4 each closed a window inside F10's IN-SCOPE "user's own hand" and
each time a new one appeared one step earlier or later in the sequence. Round 4's
shadow named the reason: **Node exposes no descriptor-relative unlink**, so "check
the name, then act on the name" is irreducibly two operations, and the last window
cannot be closed by a fifth check. **The answer is therefore a narrower CONTRACT,
not a fifth fix** — and the failure this loop was heading for is worse than the
residual: a spec that keeps claiming a class is closed while each round shows it is
not.

| # | Finding (channel) | Disposition |
|---|---|---|
| **A1** [shadow] | Opening `tmp` after the write can ADOPT a foreign inode: a substitution between the exclusive create and the identity open is written over, linked as the artifact and reported as this invocation's. The round-3 bound — "a byte mismatch cannot cost a copy" — was **false** | **FIX, by construction.** Provenance moves to the exclusive create: ONE `openSync(tmp, O_RDWR\|O_CREAT\|O_EXCL, 0o600)`, the content written through it at an explicit position, the read-back read from position 0 through it. There is no second lookup between the create and the last gate, so nothing can be adopted. New proof `provenance-adopted-not-created`, whose mutation reverts to the pathname write plus a separate open — the only mutation that can take the property away |
| **A2** [shadow] + **A1** [plugin] (converged) | The shared D1 `catch` runs in two states, and the round-3 rationale covered only one: where the COMMIT throws, the descriptor exists and identity IS available, yet the cleanup was unconditional and could delete a replacement | **FIX.** The catch computes `fd >= 0 ? ownsName(tmp, fd) : tmpOwned`, closes, then removes only on a positive result. Out of scope is narrowed to the create-failure state, which is the only one with nothing to gate on. New proof `d1-cleanup-not-gated`; QPD-6 gains the failed-commit case |
| **A3** [shadow] | The failure removal has a check-to-unlink race: a replacement landing after `ownsName` returns true and before the unlink is deleted. QPD-5's three cases all precede the gate | **NOT CLOSED — DISCLOSED, and this is the design answer of the pass.** Row F10 becomes GUARANTEED / DISCLOSED / OUTSIDE and names this residual (c) explicitly, with why it cannot be closed. **It is deliberately left untested**: a test could stage it, but pinning a disclosed residual enshrines the behaviour. Dispatch precondition **item 6** prices the only mechanism that removes it and recommends against it |
| **B1** [shadow] | `O_RDONLY` + `fsync` returns `EBADF` on Linux; F5 claimed POSIX from a darwin-only measurement | **FIX at the root**, by the same create-open: the descriptor is `O_RDWR`. F5 now states that this is a portability requirement, says what was measured (darwin) and what was not (Linux, no host available), and names **CI's `[ubuntu-latest, macos-latest]` matrix** as where the Linux half is proved — a read-only descriptor would fail the ubuntu leg on every preserving test |
| **C1** [shadow] | Count mirrors survived round 3's sweep — a dangling "nine proofs", "six identities", "five migrated injections" | **FIX, completely.** Every remaining table-derived prose count now points at its table. The exceptions the by-shape rule allows — the suite totals, the declared-proof total, the roll-up line count, the Dispatch heading, and the MEASURED blast radius — are each asserted by a criterion or measured in Current state |

**The alternative that was priced and not taken**, because both channels raised it:
retaining a failed artifact instead of removing it. It closes residual (c)
completely, and it contradicts `WP-preservation-abort-widening` Table D row **D2**
while re-creating row **D3**'s stated hazard. **The trade runs the wrong way:** (c)
needs an adversary acting inside a millisecond window during a locked run, while
retention would leave this product's own secret-bearing artifact behind on EVERY
failed preservation, with no cleanup pass to collect it. Owner item 6 states it so
the owner can overrule.

### 4.1 Measurements

```text
BASELINES at 38562ec4 (unchanged)
  npm test          tests 2623 / pass 2611 / fail 0 / skipped 12        exit 0
  npm run red-proofs  11 declared proof(s), 11 selected; RUN: PROVEN    exit 0
  npm run lint      Linting: 637 file(s) | 0 error(s)                   exit 0

THE CLAIM FOUR ROUNDS REPEATED AND NOBODY RAN — corrected by running it
  src fix alone (the wx-descriptor form)   tests 2623 / pass 2598 / fail 13   exit 1
    ✖ EP2 redact arm (P0b regression): a CORRUPTED redacted/ artifact …
    ✖ EP2 redact arm R0 (FI-13, tracked) / (untracked): ENOSPC on the whole quarantine tree
    ✖ EP2 redact arm R1: the redacted/ preserve fails → withhold, no copy, index cleared
    ✖ dream-validate: EP2 redact arm R0b (tracked) / (untracked): a durable copy EXISTS …
    ✖ quarantinePreserve (P0b, Table D row D2) × 2
    ✖ quarantinePreserve (Table D row D1): the rename fails after a successful write
    ✖ quarantinePreserve (Table D row D1): the write fails before any rename
    ✖ quarantinePreserve (Table D row D1, round-3 review): a failure AFTER the exclusive create
    ✖ quarantinePreserve (Table D row D3) / (Table D row D4)
  ALL THIRTEEN FAIL LOUDLY. Round zero recorded — and rounds 1-3 repeated — that
  they would stop intercepting SILENTLY. That was never run and it is false.

  + migrated (three seams: the exclusive CREATE, the descriptor WRITE, the
    descriptor READ matched by inode)        tests 2623 / pass 2611 / fail 0   exit 0
  + six identities                           tests 2629 / pass 2617 / fail 0   exit 0

  npm run red-proofs (unfiltered, rehearsal tree)
    27 declared proof(s), 27 selected — ALL PROVEN; RUN: PROVEN               exit 0
    criterion 7 — commit-clobbers-destination; tmp-removal-dropped;
                  tmp-removal-not-gated; d1-cleanup-not-gated;
                  provenance-adopted-not-created
```

**Every `expectRed` set was correct on the first run again** — sixteen declarations,
including the two cross-identity sets and the two new round-4 proofs.

**V1/V2 re-extracted and re-run against the round-4 candidate**: untouched → RED;
compliant → `V1 OK / V2 OK`, `rc=0`; wrapped compliant → `rc=0`; the over-claim
fixture → RED; `fs.fsyncSync` removed → RED; P0b's clause in cell 2 → RED; **and the
differently worded over-claim → GREEN, still deliberately the measured bound.**

### 4.2 What round 4 did NOT change, and what the loop now CLAIMS versus DISCLOSES

- **The flush protocol.** Rows F1–F7 — the set, the fixed chain, the anchor, the
  order, the failure disposition and the F7 exclusions — are exactly as rounds 1–2
  left them. What changed is the descriptor they run on.
- **The guarantee sentence**, byte for byte. Round 4 touched ownership and
  portability, not what a flush achieves.
- **Table P and Table D.** Still no new abort, no new message, no new field. The D1
  `catch` is now gated where identity exists; D1's own rule for the create-failure
  state is untouched, and Out of scope says so.
- **A12 and the declined directory pinning.** Neither channel re-argued them.

**What the loop CLAIMS, in one place:** a preservation that reports success has
written, verified and flushed one inode it created; that inode's bytes and every
directory entry it depends on have had the platform's flush complete; and `dest`
named that inode at the last gate. Against overlapping runs — the concurrency this
product creates — that holds by construction.

**What the loop DISCLOSES:** against a user editing the quarantine shelf while a
preservation executes, three residuals remain, and one of them deletes a
replacement. Against arbitrary same-user native code, nothing holds, and the threat
model says why. **Both are stated in row F10, priced in Dispatch precondition items
5 and 6, and repeated nowhere else as a closure.**

**Round 5 runs on both channels. It is the closing confirmation only if the
NARROWED contract holds** — that is, if a round finds no window that the guarantees
claim to close, and no disclosure that understates what it costs.

## Round 5 — architect's revision pass, 2026-09-05

### Round 5 fixes

**What round 5 is, stated because the escalation check turns on it.** Round 4
narrowed F10 into GUARANTEED / DISCLOSED / OUTSIDE, and round 5 confirmed that
narrowing: **no channel found a false-SUCCESS path, and nobody re-argued A12, the
declined directory pinning or any of the six owner items.** What both channels found
instead is that the DISCLOSURE was incomplete — it named three residuals when the
class has four instances, and asserted a premise about the temp name that the
shipped code contradicts — and that one canonical row still described a superseded
design. **That is disclosure completeness and mirror rot, not a new object and not a
reopened family**, so escalation (i) does not fire.

| # | Finding (channel) | Disposition |
|---|---|---|
| **A1** [converged] | F10's residual set is FALSE. The irreducible check-then-unlink sits at BOTH temp removals as well as `dest`'s: after a successful commit, `ownsName(tmp, fd)` → true, the user replaces `tmp`, the removal deletes the replacement **and the run then reports SUCCESS**; on a commit failure after a successful create, the catch checks, closes, then removes by name. Item 6 priced only the `dest` removal, and QPD-6 substitutes only BEFORE the gates, so criterion 7 passed the exact vulnerable sequence. The premise *"the temp name is random and unpublished"* is also false | **FIX by COMPLETING the disclosure, not by redesign — and the redesign question was asked and answered first: there is NO removal shape in Node ≥18 whose ownership test is not separable from its act.** F10 now states ONE CLASS with an instance at each of the three pathname removals — (i) post-commit `tmp`, whose damage is SILENT because the run still succeeds; (ii) `tmp` on a write/commit failure; (iii) `dest` on the failure path — plus (iv) the non-destructive after-gate success window, and the non-destructive pre-commit outcome. The temp-name premise is corrected to the shipped `.tmp-${process.pid}-${stem}${ext}` **and turned into the reason GUARANTEED (1) survives**: distinct pids give distinct temp names, so overlapping runs contend only for `dest`, which F9 refuses. QPD-6's row and criterion 7 are scoped to substitutions BEFORE a gate and say so |
| **A2** [plugin] | The inherited create-failure inference. `tmpOwned` was set on any non-EEXIST error because `writeFileSync` combined create and write; carried onto a standalone `openSync(O_CREAT\|O_EXCL)` it makes an ENOSPC/EACCES create failure delete a foreign file at the temp name | **FIX.** `const ownedTmp = fd >= 0 && ownsName(tmp, fd);` — the create is ATOMIC, so no descriptor means nothing was created and nothing is removed. `let tmpOwned` is deleted outright. Out of scope is reconciled: D1's own rule stands, and what is retired is the INFERENCE it was applied through — the create-failure disposal stays D1's **only where a file was provably created, which with `O_EXCL` is never on a throw**. New proof `create-failure-removes-unowned`; QPD-6 gains a sixth case |
| **B1** [converged] | Canonical F1 still required the superseded pathname write, contradicting F8 and the byte-exact source forms | **FIX.** F1 rewritten to the round-4 form — one exclusive-create descriptor, explicit-position write and read, no pathname reopen — and every mirror swept: Current state's two-measurements paragraph, the observability block's `writeFileSync` line, and traps (i) and (ii) |
| **C1** [plugin] | Count mirrors survived round 4's sweep — five Dispatch items (six), a nine-proofs paragraph, six traps (seven), an injection census of thirteen against fourteen seams | **FIX, and verified by a recorded grep** (4.2 below). The injection census is now by SEAM, which is what an implementer acts on, and points at Current state for the measured count |

### 5.1 Measurements

```text
BASELINES at 38562ec4 (unchanged)
  npm test 2623 / 2611 / 0 / 12  exit 0 | red-proofs 11 declared, RUN: PROVEN  exit 0

THE CANDIDATE (round-4 form + the round-5 create-failure gate)
  npm test                       tests 2629 / pass 2617 / fail 0 / skipped 12   exit 0
  npm run red-proofs (unfiltered)
    28 declared proof(s), 28 selected — ALL PROVEN; RUN: PROVEN                 exit 0
    criterion 7 — commit-clobbers-destination; tmp-removal-dropped;
                  tmp-removal-not-gated; d1-cleanup-not-gated;
                  provenance-adopted-not-created; create-failure-removes-unowned
  Every expectRed set correct on the first run again — seventeen declarations.

V1/V2 re-extracted and re-run against the round-5 candidate
  untouched RED rc=1 | compliant V1 OK / V2 OK rc=0 | wrapped compliant rc=0
  over-claim fixture RED rc=1 | P0b clause in cell 2 RED rc=1
  differently worded over-claim  V1 OK / V2 OK  rc=0   ← still the measured bound
```

**One harness note, recorded because it produced a false red.** An intermediate lane
run reported `RUN: ERROR — "find" occurs 0 time(s)` for
`provenance-adopted-not-created`, and `npm test` died with `uv_cwd ENOENT`. Neither
was the work: two background jobs shared one scratch directory and the second
`rm -rf`'d it under the first. Re-run in a fresh copy, the lane is `28/28 PROVEN`.
**A red whose cause is the harness is not evidence either way** — the rule that
caught it is the same one that catches a false green: run it again, cleanly, before
believing it.

### 5.2 The count grep, verbatim

Every cardinal number written in prose, with the noun it counts:

```text
$ grep -noE '\b(FIVE|SIX|SEVEN|NINE|THIRTEEN|FOURTEEN|SIXTEEN|SEVENTEEN|five|six|seven|
    eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|twenty-seven)\b [A-Za-z]+' \
    docs/specs/WP-quarantine-preserve-durability.md
17:SIX owner            17:six recommendations   24:six has            24:six changes
174:SIX are             181:six changes          366:THIRTEEN TESTS    371:eight that
374:thirteen live       395:six others           567:five places       654:SIX cases
1145:seven roll         1178:five observability  1474:five prose       1621:six new
1624:thirteen loud      1728:SEVEN roll          1827:THIRTEEN shipped 1918:seven roll
```

**Each survivor is one of the four kinds the by-shape rule allows**, and nothing
else remains: the Dispatch item count in its own heading and its closing paragraph
(`SIX owner`, `six recommendations`, `six has`, `six changes`, `SIX are`); a count an
acceptance criterion ASSERTS (`SEVEN roll`/`seven roll` — criterion 11's roll-up
lines; `six new` — criterion 10's new tests); a MEASURED value Current state owns
(`THIRTEEN TESTS`, `thirteen live`, `thirteen loud`, `THIRTEEN shipped`, `eight
that`, `six others`, `five observability`); and a historical record of an earlier
round (`five places`, `five prose`). `SIX cases` is inside Table C's own QPD-6 cell,
which is where that fact is decided.

### 5.3 What round 5 did NOT change

- **The design settled at round 4.** F10's three-tier shape, the exclusive-create
  provenance, the no-clobber commit, the fixed flush chain, the anchor, the
  POSIX-only scope and the A12 boundary all stand; both channels confirmed the
  narrowed contract held.
- **The recommendation on item 6.** Re-pricing over all three removals made the case
  for KEEPING them stronger, not weaker — see the item.
- **The guarantee sentence**, byte for byte.
- **Table P and Table D.** No new abort, no new message, no new field. Row D1's own
  rule is untouched; what was retired is the `writeFileSync`-shaped inference it had
  been applied through.

### 5.4 The statement the closing round is asked to verify verbatim

**GUARANTEED.** A preservation that reports success has written, verified and
flushed one inode it CREATED; that inode's bytes and every directory entry it
depends on have had the platform's flush complete, in the order Table F fixes; and
`dest` was a regular file naming that inode at the last gate. Against **overlapping
runs** — the concurrency this product creates itself — this holds by construction:
distinct pids give distinct temp names, and F9's commit refuses a destination it did
not create. Against **the user's own hand**, no substitution at any point can
produce a false SUCCESS.

**DISCLOSED.** One class — a check-then-unlink window — with an instance at each of
this call's three pathname removals, because Node ≥18 has no descriptor-relative
unlink and no removal shape whose ownership test is not separable from its act. All
three can delete a replacement; on the post-commit temp removal the run still
reports success, so that one is silent. A fourth, non-destructive instance is a
substitution at `dest` after the last gate. Every instance is untested by design, and
Dispatch precondition item 6 prices the only mechanism that removes the class.

**OUTSIDE.** Arbitrary same-user native code — `docs/THREAT-MODEL.md`'s **A12** —
against which no durability protocol can hold, and for which every added pin would
imply a false guarantee.

## Round 6 — architect's revision pass, 2026-09-05

### Round 6 fixes

**Both channels validated the design.** The shadow's own `validated_points` list
records the success expression's order, the descriptor-based write/read/flush, the
two directory chains, **exactly three pathname-removal paths each with a preceding
ownership check and no fourth destructive act**, the create-failure short-circuit,
the A12 citation and the disposal stub's routed items. Nothing re-argued A12, the
declined pinning or the six standing owner items. **Round 6 is therefore evidence
form and mirror rot — no new object, no reopened family**, and escalation (i) does
not fire.

| # | Finding (channel) | Disposition |
|---|---|---|
| **A1** [shadow] | `ownsName`'s failure-closed form unspecified and untested. F8 makes it load-bearing at four gates but the exact form pinned only its `lstat` line, and Table C mutated only gate removal, ungated disposal and `lstat`→`stat`. A predicate with **no catch** passes QPD-5/QPD-6 and emits a raw `ENOENT` — leaking the held descriptor — when the user deletes a name before a gate; a comparison narrowed to **`Number`** lets distinct inodes above `MAX_SAFE_INTEGER` compare equal and authorize a deletion | **FIX.** The WHOLE BODY of `ownsName` is now a byte-exact source form — both stats `bigint`, `isFile()` on the named entry, bigint `dev`/`ino` equality, `return false` on either stat throwing. F8 states **what `false` MEANS at each of the four gates** (temp: not unlinked, the preservation may still succeed; last gate: the preservation fails; failure path: `dest` not removed — and the descriptor is closed in every case, because the close is on no gate's path). QPD-5 gains (d) `dest` deleted before the last gate and (e) doctored stats whose inodes are distinct as `BigInt` and equal as `Number`; QPD-6 gains (g) the temp name deleted before its gate. Two proofs pin them |
| **A2** [shadow] | The `O_EXCL` provenance guarantee is unscoped against Node's documented "might not work with network file systems" caveat, and a user's core can sit on a network-mounted home | **SETTLED AS A PRODUCT BOUNDARY — Dispatch precondition item 7.** F8 now carries the precondition inline and F10 discloses it as a second, non-adversarial residual. **No runtime check is proposed, and the reason is measurable:** a probe cheap enough to run per preservation cannot distinguish "this filesystem does not honour `O_EXCL`" from "nothing else raced me just now", so it is a false-negative by construction; and a fail-closed check keyed on mount type would abort dreams on filesystems that work. Nothing in the repo states a filesystem assumption today — the nearest frame is `docs/THREAT-MODEL.md`'s **single-user-machine trust model**, which this boundary sits beside |
| **B1** [converged] | QPD-6 said SIX cases and listed five — the round-5 create-failure case existed in criterion 7 and in `create-failure-removes-unowned` but not in the canonical row | **FIX.** `(f)` added explicitly, and the row is now SEVEN with the round-6 ENOENT case |
| **B2** [converged] | F10's operative mirrors still carried the round-4 model — Exact contracts, the proof-scope paragraph and the Security checklist all said "three residuals, one destructive" — and the Mirrored Surface Checklist's blast-radius entry still said five tests / two seams | **FIX, and the audit that missed them is fixed too.** Every mirror now states one check-then-unlink class, three destructive removal instances plus the non-destructive after-gate one. The blast-radius entry stops restating a number and points at Current state, which measures it; Current state's own "three seams" is corrected to enumerate the four |
| — | **Correction carried from the shadow's `fsync(2)` check** | Linux `fsync` does **not** require a write-open descriptor — that requirement is System V's (HP-UX, AIX). F5's rationale for `O_RDWR` is now the true one: **this function writes the artifact through that descriptor.** Nothing in the design depended on the false premise; the round-4 record keeps it as history, and the SPEC no longer asserts it |

### 6.1 Measurements

```text
BASELINES at 38562ec4 (unchanged)
  npm test 2623 / 2611 / 0 / 12  exit 0 | red-proofs 11 declared, RUN: PROVEN  exit 0

THE CANDIDATE (round-5 form + the round-6 evidence)
  npm test                       tests 2629 / pass 2617 / fail 0 / skipped 12   exit 0
    (the three new cases live INSIDE QPD-5 and QPD-6, so the test count is unchanged)
  npm run red-proofs (unfiltered)
    30 declared proof(s), 30 selected — ALL PROVEN; RUN: PROVEN                 exit 0
    criterion 6 — destination-ownership-gate-removed; destination-removal-not-gated;
                  ownership-check-follows-symlinks; ownership-check-not-failure-closed;
                  ownership-check-narrows-to-number
    criterion 7 — commit-clobbers-destination; tmp-removal-dropped;
                  tmp-removal-not-gated; d1-cleanup-not-gated;
                  provenance-adopted-not-created; create-failure-removes-unowned
  Both new expectRed sets correct on the first run.

V1/V2 unchanged by this pass and re-verified on the round-6 candidate: untouched RED,
compliant GREEN, wrapped compliant GREEN, over-claim fixture RED, P0b-in-cell-2 RED,
differently worded over-claim GREEN (still the measured bound).
```

**One fixture that had to be corrected before it measured anything.** The
above-`MAX_SAFE_INTEGER` case first asserted `Number(9007199254740993n) !== 9007199254740993`
— which is false, because the source literal collapses to the same double. The
meaningful assertions are that the two fixture inodes are **distinct as `BigInt`**
and **equal as `Number`**, and the case only became evidence once it said that.

### 6.2 The count audit, extended and recorded

Round 5's grep began at FIVE, which is exactly how "three residuals, one destructive"
survived it. The audit now runs in two stages:

```text
(1) grep -noE '\b(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|THIRTEEN|FOURTEEN|
      SIXTEEN|SEVENTEEN|one|two|three|four|five|six|seven|eight|nine|ten|eleven|
      twelve|thirteen|fourteen|fifteen|sixteen|seventeen|thirty)\b [A-Za-z]+' SPEC
(2) …filtered to the NOUNS a table enumerates — residual, identity, proof, mutation,
      declaration, case, item, gate, removal, seam, test, instance, site, criterion,
      roll-up, window — which is the class the by-shape rule covers.
```

Stage 2's output after the sweep:

```text
154:three removals   154:three windows   221:four gates    444:one test
626:FOUR instances   626:one instance    674:one mutation  689:TWO sites
692:FIVE cases       693:SEVEN cases     695:one declaration 696:one declaration
698:one proof        706:two gates       1150:four gates   1254:seven roll-up
1299:one-mutation    1299:two residual   1492:one identity 1764:one proof
1861:SEVEN roll-up   1975:one case       2051:seven roll-up
```

**Every hit is legitimate under the rule, and each was checked individually:**
`154` is item 6 counting this call's three removals, which F10 decides and the item
prices; `221` is the DREAM's four gates (ADR-0034), unrelated; `626` is F10's own
cell; `689`/`692`/`693` are Table C's own cells; `706` and `1150` are historical or
inside a proof's `why`; `1254`/`1861`/`2051` are criterion 11's asserted roll-up
count; the rest are "one X" singulars. **The one stale hit the extension caught was
Current state's "three seams"**, which the migration had made four — now enumerated
rather than counted.

### 6.3 What round 6 did NOT change

- **The design.** Both channels validated it: the sequence, the three gated removals,
  the create-failure short-circuit, the chains, the A12 boundary. Rows F1–F4, F6, F7
  and F9 are untouched.
- **The recommendation on items 1–6.** Item 7 is added; none of the others moves.
- **The guarantee sentence**, byte for byte.
- **Table P and Table D.**
- **The disposal stub**, which both channels confirmed carries its routed items
  without the success protocol depending on it.

### 6.4 The statement the closing round is asked to verify verbatim

**GUARANTEED.** A preservation that reports success has written, verified and
flushed one inode it CREATED; that inode's bytes and every directory entry it
depends on have had the platform's flush complete, in the order Table F fixes; and
`dest` was a regular file naming that inode at the last gate. Against **overlapping
runs** — the concurrency this product creates itself — this holds by construction on
the supported filesystem: distinct pids give distinct temp names, and F9's commit
refuses a destination it did not create. Against **the user's own hand**, no
substitution at any point can produce a false SUCCESS, and no name deleted before a
gate produces an error escaping this function.

**DISCLOSED.** *(1)* One class — a check-then-unlink window — with an instance at
each of this call's three pathname removals, because Node ≥18 has no
descriptor-relative unlink and no removal shape whose ownership test is separable
from its act. **All three can delete a replacement; on the post-commit temp removal
the run still reports success, so that one is silent.** A fourth, non-destructive
instance is a substitution at `dest` after the last gate. Every instance is untested
by design, and Dispatch precondition item 6 prices the only mechanism that removes
the class. *(2)* A filesystem precondition: a local POSIX filesystem with atomic
`O_EXCL` and hard links. On a network-mounted core exclusivity — and therefore
provenance under overlapping runs — is not guaranteed; everything that consults only
the held descriptor still holds. Dispatch precondition item 7.

**OUTSIDE.** Arbitrary same-user native code — `docs/THREAT-MODEL.md`'s **A12** —
against which no durability protocol can hold, and for which every added pin would
imply a false guarantee.

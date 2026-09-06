---
date: 2026-09-06
title: "Design-gate rounds: WP-quarantine-failed-preserve-disposal-flush"
related_wps: [WP-quarantine-failed-preserve-disposal-flush, WP-quarantine-disposal-durability, WP-quarantine-preserve-durability, WP-preservation-abort-widening]
---

# Design-gate rounds — WP-quarantine-failed-preserve-disposal-flush

Round zero is the architect's own measurement, internal coherence pass and
both-directions gate proof (`docs/runbooks/codex-review.md`, "Internal coherence
pass"). The orchestrator's clean-context executors (template conformance,
internal coherence) and the external double-channel rounds are appended below it.

## Round zero — architect, 2026-09-06, tree at `b1d20ce0`

`b1d20ce0` is `origin/main`. The worktree
`/Users/gyulafeher/Documents/Claude_Projects/wienerdog-wt/fpdf-design` (branch
`docs/wp-quarantine-failed-preserve-disposal-flush`) was created from it and holds
**docs only** — the matured spec and this record, plus the `node_modules` symlink
lint needs. Every measurement below is against `b1d20ce0`.

**No measurement mutated the worktree, and none wrote into the main checkout.**
The pristine, compliant, ungated and five broken states are `git archive` exports
and copies under the session scratchpad
(`…/scratchpad/architect5/{tree,tree-compliant,tree-ungated,bad-ungated,bad-before,bad-third-site,bad-half,bad-absent}`).
`git status --porcelain` in the worktree showed only the two files this record's
commits add.

**Every measurement was run FROM A FILE**, never through a shell one-liner with
nested quotes (`codex-review.md:385-392`), and **every exit code was captured as
its own statement on the line after the command**, with no `tail` in the pipeline
(`codex-review.md:430-438`). The drivers are `fp-p1.js`, `fp-p2.js`, `fp-p4.js`,
`fp-p5.js`, `fp-p6.js`, `fp-p7.js`, `v1.js`, `build-variants.js`,
`build-violating.js` and `run-probes.sh`.

### 0.1 STOP CRITERION — pinned BEFORE round 1

Pinned here per `codex-review.md:90-108`, before any adversarial round runs.
Materiality bands are the runbook's: **A** = silent wrong behaviour with a
data-loss or security consequence; **B** = caught downstream; **C** = hygiene. The
bands grade a finding's CONSEQUENCE; LIGHT/HEAVY grades its FIX. This criterion
uses both.

**Step 0 — the band gate.** Every finding is banded A, B or C before it is
dispositioned. A round reported as counts without bands is not decision-grade and
is re-run rather than adjudicated.

**The per-finding ladder, in order. The FIRST rung that matches decides.**

1. **OWNER.** A finding arguing that the value question should answer NO, that the
   flush-failure disposition should be fail-loud rather than best-effort, that one
   of the two acts should be dropped, or that a third removal act should be added.
   Those are owner items **O12** and **O13** and the F7(a) exclusion split, and a
   contract change is the owner's act — never a fold-in
   (`codex-review.md:52-53`, `:59-66`). It is recorded as a proposed dated
   amendment and the loop continues under the standing recommendation.
2. **DESIGN.** A finding that falsifies a MEASUREMENT Table Z rests on — the
   flushed directory is not `qdir` on some arm, `flushDir` does carry a platform
   gate, an existing RED declaration IS re-targeted, an existing assertion DOES
   change, or the two inserted lines are not textually distinct. The answer is to
   re-measure and rewrite the row, never to patch the sentence.
3. **EXTRACTION (ADR-0031's circuit-breaker, `codex-review.md:422-429`).** Two
   consecutive rounds landing a finding on the **flush-contract family** — any row
   of **Table Z**, in any of its registered mirrors. The response is one
   re-derivation into Table Z with every registered mirror updated in the same
   commit, not a third row patch. **The table is Table Z**; its mirrors are the
   spec's Mirrored Surface Checklist.
4. **HEAVY.** Any other finding that changes what the implementer builds — the two
   inserted lines, their gating, their placement, an acceptance criterion's
   subject. Fixes land, then a full fresh external round.
5. **LIGHT.** A finding about this spec's own verification machinery — V1's
   program, a citation range, a table's wording, a checklist entry. Fixes land and
   are verified mechanically by re-running `run-probes.sh` and `npm run lint`; no
   further external round.
6. **CLOSE.** A round whose findings are all LIGHT and none of which changes a
   Table Z cell, an owner item's verdict, or the Deliverables table.

**Round rule.** A HEAVY or DESIGN fix owes a fresh external round and this
criterion is re-stated at its head. Two consecutive rounds of the same KIND
escalate to a design question rather than a third patch
(`codex-review.md:79-80`).

**FALLBACK.** If V1's structural program itself draws findings in two consecutive
rounds, drop it and verify rows Z1/Z2 by the RED declarations (V2) plus the
reviewer's read. Verification machinery may grow only to guard a product
behaviour, in the smallest form that guards it (`codex-review.md:186-196`).

### 0.2 The probes — `FP-P1` … `FP-P7`, and V1 in both directions

**These are ROUND ZERO's runs, against round zero's comment text.** Round 1
re-ran every probe and added `FP-P8` and `FP-P9`; **the current output — and the
corrected `FP-P5` and `FP-P6` figures — are in the Round 1 section, which
supersedes this fence wherever the two differ.**

`run-probes.sh` runs all of them in one pass. Its output below is that run's,
line for line, with **exactly four departures, all named under the fence** —
three blocks abridged and one re-flowed. The untruncated capture is `PROBES.txt`
in the same scratchpad; a line-by-line diff of the fence against it returns
exactly those four and nothing else:

```text
== FP-P1  the win32 conjunct: is it necessary? ==
### FP-P1 tree / darwin  rc=0
  shared-catch         withheld  fsyncs=0 [] ret=null
  shared-catch         redacted  fsyncs=0 [] ret=null
  post-commit-failure  withheld  fsyncs=1 [file:.tmp-<pid>-fp.md] ret=null
  post-commit-failure  redacted  fsyncs=1 [file:.tmp-<pid>-fp.md] ret=null
### FP-P1 tree / win32  rc=0
  shared-catch         withheld  fsyncs=0 [] ret=null
  shared-catch         redacted  fsyncs=0 [] ret=null
  post-commit-failure  withheld  fsyncs=0 [] ret=object
  post-commit-failure  redacted  fsyncs=0 [] ret=object
### FP-P1 tree-compliant / darwin  rc=0
  shared-catch         withheld  fsyncs=1 [dir:quarantine] ret=null
  shared-catch         redacted  fsyncs=1 [dir:redacted] ret=null
  post-commit-failure  withheld  fsyncs=2 [file:.tmp-<pid>-fp.md, dir:quarantine] ret=null
  post-commit-failure  redacted  fsyncs=2 [file:.tmp-<pid>-fp.md, dir:redacted] ret=null
### FP-P1 tree-compliant / win32  rc=0
  shared-catch         withheld  fsyncs=0 [] ret=null
  shared-catch         redacted  fsyncs=0 [] ret=null
  post-commit-failure  withheld  fsyncs=0 [] ret=object
  post-commit-failure  redacted  fsyncs=0 [] ret=object
### FP-P1 tree-ungated / darwin  rc=0
  shared-catch         withheld  fsyncs=1 [dir:quarantine] ret=null
  shared-catch         redacted  fsyncs=1 [dir:redacted] ret=null
  post-commit-failure  withheld  fsyncs=2 [file:.tmp-<pid>-fp.md, dir:quarantine] ret=null
  post-commit-failure  redacted  fsyncs=2 [file:.tmp-<pid>-fp.md, dir:redacted] ret=null
### FP-P1 tree-ungated / win32  rc=0
  shared-catch         withheld  fsyncs=1 [dir:quarantine] ret=null
  shared-catch         redacted  fsyncs=1 [dir:redacted] ret=null
  post-commit-failure  withheld  fsyncs=0 [] ret=object
  post-commit-failure  redacted  fsyncs=0 [] ret=object

### FP-P3a  node tests/run.js  PRISTINE  rc=0
ℹ tests 2693
ℹ pass 2681
ℹ fail 0
ℹ skipped 12
### FP-P3b  node tests/run.js  COMPLIANT  rc=0
ℹ tests 2693
ℹ pass 2681
ℹ fail 0
ℹ skipped 12

### FP-P4  no existing RED declaration is re-targeted  rc=0
{
  "declaration_files": [ 12 files, alphabetical, ending "quarantine-preserve-durability.proofs.json" ],
  "proofs_checked": 64,
  "declarations_re_targeted": [],
  "new_line_tmp_occurrences_in_compliant": 1,
  "new_line_dest_occurrences_in_compliant": 1,
  "new_lines_are_textually_distinct": true,
  "dest_literal_matches_inside_tmp_line": false
}

### FP-P5  the cost, re-measured on this base  rc=0
{ "host": "darwin node v25.9.0", "samples": 200,
  "dirty_ms": { "min": 0.9457, "median": 2.5675, "p90": 3.1181, "max": 10.4488 },
  "clean_ms": { "min": 0.0174, "median": 0.0469, "p90": 0.1147, "max": 0.2276 } }

### FP-P6  rc=0   (16 rows; every one identical)
  <kind> <arm> <pristine|compliant> fault={n/a|none|open|fsync} ret=null threw=null qdir_after=[]

### FP-P7  every cited range, checked at BOTH ends  rc=0
ALL 21 RANGES RESOLVE AT BOTH ENDS   (24 after the LIGHT fixes; re-run rc=0)

== V1 BOTH DIRECTIONS  absent / untouched / four violating / compliant ==
### V1 on bad-absent  rc=1
V1: src/core/dream/validate.js is absent
### V1 on tree  rc=1
V1: Z1: the flush line occurs 0 time(s), want 1
### V1 on bad-ungated  rc=1
V1: Z2: the flush line occurs 0 time(s), want 1
### V1 on bad-before  rc=1
V1: Z1: the flush is not AFTER the removal
### V1 on bad-third-site  rc=1
V1: lines containing "flushDir(": 5 (want 4 — the declaration, the call inside flushPreservation, and Z1 and Z2)
### V1 on bad-half  rc=1
V1: Z2: the flush line occurs 0 time(s), want 1
### V1 on tree-compliant  rc=0
V1 OK: Z1 and Z2 each carry one gated flush, after their removal and immediately before `return null;`
```

**The four departures, named exhaustively.** ABRIDGED, because long rather than
informative: `FP-P4`'s twelve filenames, `FP-P6`'s sixteen identical rows, and
`FP-P2`'s JSON. RE-FLOWED, values unchanged: `FP-P5`'s JSON, from twelve lines
onto three. Nothing else in the fence differs from `PROBES.txt` by a character. `FP-P2`'s result, stated in full because it
is a Table Z fact: on all four (act × arm) combinations every removal's parent is
`qdir` — `quarantine` on the withheld arm, `quarantine/redacted` on the redact
arm, `parent_is_qdir: true` in every row — and the post-commit-failure arm removes
TWO entries in that one directory (`.tmp-<pid>-fp.md` at `:995`, then
`2026-07-02-fp.md` at `:1020`).

### 0.3 What each probe establishes, and what it does not

| Probe | Establishes | Does NOT establish |
|---|---|---|
| **FP-P1** | today's flush count on both failure arms (zero directory flushes); the compliant state's count (exactly one `fsync` of `qdir` per act); and that the `&& DURABILITY_AVAILABLE` conjunct is **necessary** — the ungated variant issues a directory `fsync` on forced `win32`, which row **F5** forbids | anything about a real win32 host: `process.platform` is forced before the module loads, so this measures the CODE's branch, not the platform |
| **FP-P2** | the flushed directory is the removal's own parent, `qdir`, on both acts and both arms | — |
| **FP-P3** | the compliant state changes no shipped assertion: identical 2681/0/12 on the pristine and compliant trees, `[QPD-3]`/`[QPD-4]` (the success path's exact flush chain) included | that the new assertions the WP owes exist — they do not yet; this is the BASELINE for them |
| **FP-P4** | all 64 existing `find` literals still occur exactly their declared count, so no declaration is re-targeted; and the two new literals occur once each, are distinct, and neither matches inside the other | that the two NEW declarations pass the runner — that is the WP's V2 |
| **FP-P5** | the cost of one dirty-directory `fsync` on this host, re-measured rather than inherited | the cost on any other filesystem |
| **FP-P6** | that a flush that does not complete is invisible at `quarantinePreserve`'s interface: identical `null`, no throw, empty `qdir`, across 16 runs | the gate-level fall-through, which is CODE-DERIVED from `validate.js:1406-1429` plus the shipped `tests/unit/dream-validate.test.js:1670-1695`; since the return value is identical, no caller can distinguish the two |
| **FP-P7** | all cited ranges resolve at BOTH ends — 21 at `bee6514f`, 24 after the LIGHT fixes below added two test-file citations and 0.5's `Table Z` heading citation | that the cited text SAYS what the citing sentence claims |
| **V1** | the new gate is neither vacuous nor over-strict: red on absent, red on untouched, red on four distinct violations each with its own message, green on the hand-built compliant state | whether a flush ever completes on a real medium — no test can, and the spec says so |

**The crash itself is not staged and is not claimed anywhere.** `QD-P1` (the
predecessor's record) removed a file under a 0700 directory with no directory
flush 400 times across clean exits and `SIGKILL`s with zero reappearances, which
establishes only that a PROCESS crash is not the hazard.

### 0.4 The three questions this gate settled

- **The value question — YES** (owner item **O12**). One `flushDir` per failure
  path, single-digit milliseconds on this host (Round 1's recorded pass: medians
  **2.65, 2.50, 1.26 ms** over three runs of 200), on an arm already heading for
  a preservation failure, buys exactly this: on the paths where the flush COMPLETES, the artifact a
  completed and published run removed can no longer come back. The success path
  pays nothing (`FP-P3`). It is an ADDITION — `WP-preservation-abort-widening.md:419-433`
  already states that no D1/D2 removal is crash-durable — so no existing guarantee
  is being repaired and none is being weakened.
- **The disposition of a flush that does not complete — BEST-EFFORT** (owner item
  **O13**). Measured indistinguishable at the interface (`FP-P6`). Fail-loud would
  make a redacted preservation that today falls through to the withhold arm abort
  the whole run, and would leave the same residual.
- **Both acts, not one.** The scope is D4's two owned paths, an acceptance
  predicate over the contract. `FP-P2` shows both removals land in the same
  directory, so the two call sites are the same shape; taking only `:1020` would
  buy one line and a half-true contract.

**A fourth question the gate raised and answered, which the stub had not asked.**
`flushDir` carries no platform gate — only `flushPreservation` does — so a naive
insertion would have issued an `fsync` on win32 and broken row **F5**. `FP-P1`
measured it on the ungated variant. That is Table Z row **Z4**.

### 0.5 The canonical table's letter — `Z`, chosen on ROW IDS after `I` was measured wrong

The stub instructed a documented letter collision per
`docs/specs/done/WP-dream-promote-report.md:356-372`. **The first draft took `I`
instead, because a HEADING sweep found `Table I` in zero files. That was the right
sweep for the wrong question, and finding C-4 below is the correction.** A reader's
ambiguity is over ROW IDS, not headings, and `node scripts/mirror-walk.js` said so:

```text
row I1 → WP-quarantine-failed-preserve-disposal-flush.md | WP-secret-fence-ep2-redact-arm.md   (1 entry)
row I2 → WP-quarantine-failed-preserve-disposal-flush.md | WP-secret-fence-ep2-redact-arm.md   (1 entry)
```

`WP-secret-fence-ep2-redact-arm` carries **invariants I1 and I2** (its report
boundary and its index-first ordering, Table T) — the SAME family, which is the
worst place for a row-id collision.

**The re-sweep, with a positive control, over the four specs this package cites
plus `WP-quarantine-only-copy-shelf` and `src/core/dream/validate.js`**
(`/tmp/rowids.sh`; pattern `(^|[^A-Za-z0-9])<L>[0-9]([^A-Za-z0-9]|$)`):

```text
positive control (I in ep2-redact-arm): 40
… A=50 B=281 C=10 D=200 E=39 F=257 G=23 H=55 I=52 J=41 K=139 L=1 M=123
  N=142 O=21 P=192 Q=194 R=300 S=47 T=10 U=7 V=108 W=0 X=0 Y=0 Z=0
```

`W`, `X`, `Y` and `Z` are free of family row-id hits. `X` is rejected — this tree
uses `### Table X` as its metasyntactic placeholder
(`docs/specs/done/WP-dream-promote-report.md:432-434`); `Y` is that spec's own
letter. **`Z` is taken, as a DOCUMENTED collision and not as a free letter.**
`WP-dream-promote-report` carries its own **Table Z** with rows **Z1–Z5**
(`:327`), and the heading also appears in `WP-dream-promote-in-workspace` and
`WP-dot-segment-denial`; none is in this family and none decides anything this
spec relies on. `mirror-walk` accordingly reports `Z1`, `Z2` and `Z3` as ambiguous
against that spec — reported, never failed — and the spec carries the
path-qualification sentence the precedent requires. **The difference from `I` is
the one that matters to a reader: `I1`/`I2` collided INSIDE this family, with
`WP-secret-fence-ep2-redact-arm`'s two invariants; `Z1`–`Z4` collide only outside
it.**

**The sweep that got this wrong the first time was a ZERO-HIT sweep that had not
read its targets.** Two consecutive attempts used `for f in $FAM` under zsh, where
an unquoted parameter is NOT word-split, so `grep` was handed one nonexistent
filename, wrote to a suppressed stderr and reported zero for every letter — the
exact shape `codex-review.md:447-456` names. The third attempt ran from a `bash`
script with an array, an existence check per file, and a positive control whose
expected value was non-zero.

### 0.6 Internal coherence pass — four findings, all fixed

Read end to end after the first draft was committed (`74c5d224`), fixed in
`7d541dc5`.

| # | Band | Finding | Fix |
|---|---|---|---|
| **C-1** | B | The Context's acceptance predicate and owner item **O12** both stated the closed window as *"a published record can no longer be contradicted by an entry that record omits"*. That is row **Z2**'s case. Row **Z1**'s leftover is a `.tmp-<pid>-<stem>` that **no record names at all**, so the generalization claimed something the row does not | both sentences narrowed to "the removed artifact can no longer come back", with the two rows' differing cases named and Table Z left as the place they are decided |
| **C-2** | C | The ADR-0031 activation paragraph said *"five mirrored surfaces"* and then listed six | corrected to six; the list is unchanged |
| **C-3** | C | The header blockquote named the measurements `FP-P1`…`FP-P6` after a seventh probe (the range check) had been run | corrected to `FP-P1`…`FP-P7` |
| **C-4** | B | **Self-found by running `node scripts/mirror-walk.js` rather than reading the spec.** The canonical table was `I` on the strength of a HEADING sweep; the ROW IDS `I1`/`I2` collide with `WP-secret-fence-ep2-redact-arm`'s invariants **I1** and **I2**, in this same family, and the walk reported both as ambiguous. The record also asserted that the walk *"reports no ambiguity for this spec"*, which was false at the moment it was written | the table is renamed **Z** (0.5), chosen on a row-id sweep with a positive control; the spec's letter paragraph now states the heading collision and the path-qualification rule; the false sentence is deleted; every probe and the compliant, ungated and five broken states were REBUILT and re-run under the new comment text, and this record's pasted output is that re-run |

**Every acceptance criterion and verification step with a runnable form was RUN,
not read.** V1 ran on seven states (0.2). V2 (`npm run red-proofs --wp …`), V3
(`npm test`) and V4 (`npm run lint`) name deliverables that do not exist yet, so
they are not runnable on this tree and are not reported as green here — what IS
established is their BASELINE: `node tests/run.js` is green on both the pristine
and the compliant tree (`FP-P3`), and `npm run lint` is green on this worktree
(0.7).

### 0.7 Size, and the lint run

- The spec was **455 lines** at `d8d14372`; Round 1's line count is in that
  section. Over the 400 aimed for and stated rather than
  rounded. The 4-row × 8-column Table Z, the two byte-exact code blocks, V1's
  21-line program and the template's own section list account for it; nothing was
  cut that a Sonnet implementer needs under the One-Document Rule (ADR-0005).
- **Deliverables: 3 files** — `src/core/dream/validate.js`,
  `tests/unit/dream-validate.test.js`, and the new
  `tests/red-proofs/quarantine-failed-preserve-disposal-flush.proofs.json`.
  `docs/specs/done/WP-quarantine-preserve-durability.md` is deliberately NOT among
  them: row **F7(a)**'s 2026-09-06 clause already states this package's contract
  for rows M2/M3, so the YES/best-effort verdict falsifies nothing there. That
  decision is registered in the Mirrored Surface Checklist with the condition that
  would reverse it.
- **Two RED declarations, not one**, decided on the runner's rules: `find` is a
  plain substring with a declared occurrence count, and `evaluateRed` enforces SET
  EQUALITY over own-body assertion failures. One declaration cannot remove one of
  two separate call sites, and a single declaration covering both would prove
  neither act's flush individually. Two declarations sharing one
  `testNamePattern` that runs both acts' assertions is what makes each mutation
  attributable.
- `npm run lint` — `markdownlint` 0 errors over 656 files, `shellcheck` clean,
  `PSScriptAnalyzer` clean, frontmatter check 271 specs / 4 agents, **lint
  passed**.

## The executor passes — clean-context template conformance and internal coherence, on `bee6514f`

Both run per `docs/runbooks/codex-review.md:129-139` ("Template conformance
(round zero, before any review)") and `:141-170` ("Internal coherence pass"), in
contexts that took no part in drafting. **Round zero is adjudicated on
`bee6514f`: no finding above band C, and all four are LIGHT** — none changes the
two inserted lines, their gating, their placement, a Table Z decision, an owner
item's verdict or the Deliverables table. They therefore land and are verified
mechanically; no fresh external round is owed, per the criterion pinned in 0.1.

### T — template conformance: NON-CONFORMANT on two non-precedented items, both FIXED

| # | Band | Finding | Disposition |
|---|---|---|---|
| **T1** | C | `## Definition of done` item 5 dropped the template's closing clause | **FIX.** Restored verbatim: *": this list is complete only when review is."* |
| **T2** | C | The Mirrored Surface Checklist merged the template's *"Acceptance criteria that assert its facts"* and *"Verification commands / greps"* into one bullet (*"Acceptance criteria 1–5 and the steps V1–V3 that assert them"*), so the template's five categories were four list items | **FIX.** Split into two bullets — criteria **1**–**5**, and steps **V1**–**V3** with what each checks. The spec's additional bullets are unchanged; the checklist is now 13 entries |

**Confirmed present by the same pass and recorded so a later round does not
re-ask:** the Security checklist with the template's untrusted-identifier item
explicitly `N/A`-marked; acceptance criterion **7**'s idempotence `N/A` with its
reason; Definition of done items 1–4; and the precedented shape items.

### X — internal coherence: no A, no B, two C, both FIXED

Every citation resolved at both ends, **including the three RED declarations
keeping `occurrences: 1` after the insertions**, `traceFlushes`
(`tests/unit/dream-validate.test.js:2697-2717`), `patchFs` (`:1433-1438`), and
`WP-quarantine-preserve-durability` row **F7(a)**'s 2026-09-06 clause already
pointing rows M2/M3 at this WP.

| # | Band | Finding | Disposition |
|---|---|---|---|
| **X1** | C | Acceptance criterion **4**'s suite-side clause — *"and in the suite by whatever form the implementer chooses"* — named no verification step, so it read as a second check when only V1's byte-exact `&& DURABILITY_AVAILABLE` match existed | **FIX, by naming the suite form rather than withdrawing it, because it is realizable with no new `src/` seam.** `DURABILITY_AVAILABLE` binds at module load (`validate.js:696`) and the suite already deletes `require.cache[VALIDATE_ID]` and re-requires (`stubCollaborators`, `tests/unit/dream-validate.test.js:1485-1502`), so forcing `process.platform` before that same re-require is the identical mechanism. Criterion 4 now names **V1** and **V3**, says what each reaches, and repeats that a real win32 host is not available and is not claimed; an Implementation note carries the seam, the `finally`-restore requirement (`:1414-1415`) and `FP-P1` as the discrimination evidence |
| **X2** | C | The unscoped `node scripts/mirror-walk.js` exits **1** from 14 pre-existing UNRESOLVED entries in unrelated specs, while this spec's Z-row ambiguity is *"Reported, NEVER failed"* — a reviewer running the bare command sees rc 1 and may misattribute it | **FIX.** A new **V5** names the SCOPED invocation (`--scope quarantine-failed-preserve-disposal-flush`, measured **rc 0**, 13 entries, no UNRESOLVED), and its comment states that the unscoped rc 1 is the base's own: measured on `b1d20ce0` itself at rc 1, and the UNRESOLVED block `diff`s **byte-identical** between the base and this branch. Acceptance criterion **6** now covers V5 |

### The executor's runs — what was EXECUTED, with each exit code its own statement

| Command | Result |
|---|---|
| `npm test` | **rc 0** — tests 2693, pass 2681, fail 0, skipped 12 |
| whole-tree `scripts/red-proofs.js` on a `git archive` copy | **rc 0** — `64/64 RUN: PROVEN` |
| the same runner with `--wp WP-quarantine-failed-preserve-disposal-flush` | **rc 1, VACUOUS — expected**, and it is the correct answer: this package's two declarations do not exist yet |
| `npm run lint` | **rc 0** |
| `scripts/boundary-check.js` under `bash`, on the three changed docs files | **rc 0** |
| `node scripts/mirror-walk.js` (unscoped) | **rc 1**, from the 14 pre-existing entries; rows **Z1**–**Z3** reported AMBIGUOUS and never failing — this is X2's subject |
| `v1.js` re-run on the untouched tree | **red**, at `Z1: the flush line occurs 0 time(s), want 1` |

**The executor's discrimination assessment, recorded because "a criterion that
cannot discriminate is a round-zero finding" (`codex-review.md:149-159`):** AC1
byte-exact and structural; AC2 reachable through the existing `traceFlushes`;
AC3 falsifiable through `patchFs` fault injection; AC5's set equality live in the
runner; AC7's idempotence `N/A` honest.

### Re-verification after the four LIGHT fixes

Run on the fixed tree, each exit code its own statement:

```text
npm run lint                                              rc=0   (markdownlint 0 errors / 657 files; frontmatter 271 specs, 4 agents)
node scripts/mirror-walk.js --scope quarantine-…-flush     rc=0   13 checklist entries, 1 spec, no UNRESOLVED
node fp-p7.js  (24 ranges, incl. the two X1 added)         rc=0   ALL 24 RANGES RESOLVE AT BOTH ENDS
```

**No probe was re-run beyond `FP-P7`, and that is deliberate:** the four fixes
touch only this spec's prose, its criteria and its verification steps. None
changes the two inserted lines, so the compliant, ungated and five broken states
under the scratchpad are unchanged and `FP-P1`…`FP-P6`'s results stand as pasted
in 0.2.

## Round 1 — two channels, both `needs-attention`, on `d8d14372`

**The criterion of §0.1 is unchanged and is restated here because a HEAVY fix
fired** (`docs/runbooks/codex-review.md:90-108`): **R1-B is a Table Z CONTRACT
cell, so it is HEAVY under rung 4 and round 2 owes a fresh external round on the
revised tip.** The other four are LIGHT — criterion/machinery, mirror and record
— and land inside the existing surface. **No finding touched O12 or O13**, and
neither channel proposed a scope reversal.

| Channel | Raw | Commit that introduced it |
|---|---|---|
| Codex plugin | `docs/specs/logbook/2026-09-06-failed-preserve-flush-gate-raw-round1-codex-plugin.txt` | `95e75ff9` |
| hermetic shadow | `docs/specs/logbook/2026-09-06-failed-preserve-flush-gate-raw-round1-herdr-shadow.txt` | `a6815d5d` |

Both committed pre-adjudication; porcelain identical before and after each run.
**Both channels reported that `npm test`, `npm run red-proofs` and (for the
shadow) `npm run lint` did NOT run** — `mkdtemp` denied with `EPERM` in the
read-only sandbox, and markdownlint's dependency lookup needed blocked network.
Their verdicts are therefore readings on those three, and say so; the runs that
DID execute are listed in each raw.

### The findings and their dispositions

| # | Band | Weight | Finding | Disposition |
|---|---|---|---|---|
| **R1-A** | B | LIGHT (criterion/machinery) | **The forced-win32 row Z2 recipe was VACUOUS.** On win32 `flushPreservation` returns before issuing any flush, so the prescribed artifact-`fsync` fault never reaches `:1020` — the preservation SUCCEEDS. `FP-P1`'s own round-zero output shows `ret=object` there for the pristine, compliant AND ungated trees, so an ungated Z2 would have passed the advertised check | **FIX, and the replacement is measured.** New probe **`FP-P8`**: a POST-FLUSH VERIFICATION failure (the read-back corrupted through the artifact's own descriptor) reaches `:1020` on both arms under forced `win32`, and the probe asserts `fault_fired`, `dest_removed` and `returned_null` **before** it reports a flush count. Discrimination measured on both arms: the Z2-ungated variant issues **one** `qdir` `fsync` (`dir:quarantine` / `dir:redacted`), the gated one **zero**. Criterion 4 and the Implementation notes now carry the per-act recipes and name the vacuous one |
| **R1-B** | B | **HEAVY (product/contract, Table Z row Z3)** | **Row Z3 said unconditionally that after the flush "the caller carries on and the run publishes and commits".** True of the measured redacted→withheld fallback; FALSE for a failed WITHHELD preservation, where `quarantinePreserve` returns `null` and the gate throws at `validate.js:1442-1459` — that run publishes nothing | **FIX.** Z3 now states the exact observable contract — the flush result does not change what `quarantinePreserve` RETURNS (`null`, nothing thrown), measured over 12 fault cases and 4 baselines — and says that downstream behaviour is BRANCH-SPECIFIC and unchanged, naming both branches with their line ranges. Swept: **O13**'s FP-P6 sentence, the two source comments (whose third line now reads *"it does not change what this function returns, and what the caller then does is its own branch"*), and the Context predicate, which was already conditional and stays |
| **R1-C** | B | LIGHT (mirror) | **Row Z2's residual cell said "as Z1"**, importing the dot-prefixed temp's consequences — unlisted, and the next preservation returns `null`. `dest` differs on every count | **FIX, written independently and measured.** New probe **`FP-P9`**: the `<date>-<stem>` leftover IS listed by the shipped `listSecretQuarantine` on the withheld shelf and is NOT on `redacted/`; and the next preservation does not fail — the collision loop (`validate.js:960-963`) commits as `2026-07-02-fp-1.md` on both arms and the leftover stays. Z1's own cell is unchanged and now cites `FP-P9` too |
| **R1-D** | C | LIGHT (mirror) | **The two verbatim comment mirrors had no owner.** V1 only checked that intervening lines began with `//`; the shadow executed V1-equivalent logic against a source with both comments replaced by `// WRONG COMMENT` and it PASSED | **FIX, in the smallest form and with no new step.** V1 now matches each act's WHOLE four-line block — removal line, three comment lines, flush call — byte-for-byte and requires it exactly once. New Table Z row **Z5** decides the ownership; acceptance criterion **1** asserts it; both checklist entries cite it. V1's eighth direction, `bad-comment`, is red |
| **R1-E** | C | LIGHT (record) | **`FP-P5` held one median while §0.4 claimed a band and the spec claimed three medians, two of which were nowhere in the repository**; and `FP-P6`'s "16 runs = 2 acts × 2 arms × 3 faults" is 12, not 16 | **FIX.** `FP-P5` now runs three times in ONE pass and records all three: medians **2.65 / 2.50 / 1.26 ms**, clean-directory medians 0.03–0.07. **The claim is narrowed to what survives a re-run: single-digit milliseconds, the same order as `QD-P2`'s 2.0–2.7, with the figure moving with machine load between passes and the decision not turning on its precise value.** `FP-P6` is now stated as **12 fault cases (2 acts × 2 arms × {none, open, fsync}) + 4 pristine baselines**, with the eight fault rows printed |
| **size audit** | C | LIGHT | Seven rationale paragraphs outside Table Z and the owner items | **FIX for six, and the seventh is superseded rather than cut.** Compressed to one sentence each: the predecessor-exclusion note, the Exact-contracts preamble, the table-letter paragraph, the unbraced-removal note, the substring-matching note, and the security-improvement item. **The seventh (the test-seam paragraph) was replaced by R1-A's required per-act recipe contract, which is longer and is not rationale.** The spec is **469 lines** — up from 455, because R1-A's recipe, R1-C's independent Z2 cell and R1-D's row Z5 are all additions the round required |

### The re-measurement — `run-probes.sh` on the revised comment text

Every state was REBUILT (the comment's third line changed under R1-B) and every
probe re-run. `FP-P8`, `FP-P9` and a `tree-ungated-z2` variant are new. Each exit
code its own statement, nothing piped through `tail`:

```text
### FP-P1 tree / win32  rc=0
  post-commit-failure  withheld  fsyncs=0 [] ret=object      <- R1-A: the OLD recipe never reaches Z2
  post-commit-failure  redacted  fsyncs=0 [] ret=object

### FP-P8 tree-compliant / win32  rc=0   (rc 3 would mean Z2 was NOT reached)
  Z2_REACHED_ON_BOTH_ARMS: true
  withheld  fault_fired=true dest_removed=true returned_null=true -> fsyncs=0 []
  redacted  fault_fired=true dest_removed=true returned_null=true -> fsyncs=0 []
### FP-P8 tree-ungated-z2 / win32  rc=0
  Z2_REACHED_ON_BOTH_ARMS: true
  withheld  fault_fired=true dest_removed=true returned_null=true -> fsyncs=1 [dir:quarantine]
  redacted  fault_fired=true dest_removed=true returned_null=true -> fsyncs=1 [dir:redacted]

### FP-P9  rc=0
  Z1 withheld  leftover=.tmp-<pid>-fp.md  banner_lists=false next_preserve=null                leftover_still_there=true
  Z1 redacted  leftover=.tmp-<pid>-fp.md  banner_lists=false next_preserve=null                leftover_still_there=true
  Z2 withheld  leftover=2026-07-02-fp.md  banner_lists=true  next_preserve=2026-07-02-fp-1.md  leftover_still_there=true
  Z2 redacted  leftover=2026-07-02-fp.md  banner_lists=false next_preserve=2026-07-02-fp-1.md  leftover_still_there=true

### FP-P3a  node tests/run.js  PRISTINE   rc=0   tests 2693 pass 2681 fail 0 skipped 12
### FP-P3b  node tests/run.js  COMPLIANT  rc=0   tests 2693 pass 2681 fail 0 skipped 12
### FP-P4  rc=0   proofs_checked=64 across 12 files; re-targeted=[]; Z1=1 Z2=1 distinct=true one-inside-other=false
### FP-P5  rc=0   run 1 dirty median=2.652  run 2 =2.4985  run 3 =1.2613   clean medians 0.0339 / 0.0603 / 0.0749
### FP-P6  rc=0   16 rows = 12 COMPLIANT fault cases + 4 PRISTINE baselines; every row returned=null threw=null qdir empty
### FP-P7  rc=0   ALL 27 RANGES RESOLVE AT BOTH ENDS   (24 -> 27: the three code ranges R1-B and R1-C cite)

== V1 IN EIGHT DIRECTIONS ==
### V1 on bad-absent      rc=1   V1: src/core/dream/validate.js is absent
### V1 on tree            rc=1   V1: Z1: the removal, its three-line comment and its flush do not appear as one byte-exact block exactly once (found 0)
### V1 on bad-ungated     rc=1   V1: Z2: … (found 0)
### V1 on bad-before      rc=1   V1: Z1: … (found 0)
### V1 on bad-third-site  rc=1   V1: lines containing "flushDir(": 5 (want 4 — the declaration, the call inside flushPreservation, and Z1 and Z2)
### V1 on bad-half        rc=1   V1: Z2: … (found 0)
### V1 on bad-comment     rc=1   V1: Z1: … (found 0)          <- R1-D's state: one comment mirror replaced by `// WRONG COMMENT`
### V1 on tree-compliant  rc=0   V1 OK: Z1 and Z2 each carry their byte-exact comment-and-flush block after their removal and immediately before `return null;`
```

**Abridged here and named:** `FP-P1`'s darwin rows and its compliant/ungated
blocks, `FP-P8`'s two darwin blocks, `FP-P2`, and `FP-P6`'s per-row listing. The
untruncated capture is `PROBES.txt` in the session scratchpad, and the drivers
are the files named in §0's preamble plus `fp-p8.js` and `fp-p9.js`.

**One thing the `bad-comment` state teaches, recorded because it is the same
hazard the spec warns about:** the builder replaced the **2-space** comment line,
which is a SUBSTRING of the 4-space one, so the edit landed inside row **Z1**'s
block and V1 named Z1 rather than Z2. The state is still a correct
deliberately-broken state and V1 is still red on it — but it is the third time in
this package that a 2-space literal matched inside a 4-space one, and it is why
row **Z5** matches whole blocks rather than fragments.

### Re-verification after the round-1 pass

```text
npm run lint                                            rc=0
node scripts/mirror-walk.js --scope quarantine-…-flush   rc=0
diff <spec's V1 program> <the proven scratch v1.js>      rc=0   (the spec ships the program that was proved)
```

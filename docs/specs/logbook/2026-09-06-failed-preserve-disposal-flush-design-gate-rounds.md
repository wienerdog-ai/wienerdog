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
ALL 21 RANGES RESOLVE AT BOTH ENDS

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
| **FP-P7** | all 21 cited ranges resolve at BOTH ends | that the cited text SAYS what the citing sentence claims |
| **V1** | the new gate is neither vacuous nor over-strict: red on absent, red on untouched, red on four distinct violations each with its own message, green on the hand-built compliant state | whether a flush ever completes on a real medium — no test can, and the spec says so |

**The crash itself is not staged and is not claimed anywhere.** `QD-P1` (the
predecessor's record) removed a file under a 0700 directory with no directory
flush 400 times across clean exits and `SIGKILL`s with zero reappearances, which
establishes only that a PROCESS crash is not the hazard.

### 0.4 The three questions this gate settled

- **The value question — YES** (owner item **O12**). One `flushDir` per failure
  path at 2.9–3.0 ms median, on an arm already heading for a preservation failure,
  buys exactly this: on the paths where the flush COMPLETES, the artifact a
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

- The spec is **423 lines** — over the 400 aimed for and stated rather than
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

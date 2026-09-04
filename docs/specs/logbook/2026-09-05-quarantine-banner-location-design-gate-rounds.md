---
date: 2026-09-05
title: "Design-gate rounds: WP-quarantine-banner-location"
related_wps: [WP-quarantine-banner-location, WP-preservation-abort-widening, WP-quarantine-preserve-durability, WP-secret-fence-ep2-redact-arm, WP-dream-promote-module]
---

# Design-gate rounds — WP-quarantine-banner-location

Round zero is the architect's own internal coherence pass
(`docs/runbooks/codex-review.md`, "Internal coherence pass"). The orchestrator
appends the external rounds below it.

## Round zero — architect, 2026-09-05, tree at `8302ce8e`

`8302ce8e` is `origin/main` after PRs #215/#216 merged `WP-dot-segment-denial`.
`git diff --stat 8302ce8e HEAD -- src tests scripts` is **empty** on this branch,
so every measurement below is against the base the spec pins. **No measurement
mutated the worktree**: the candidate fix, the pristine RED-proof baseline and
the two deliberately-broken trees all live under the session scratchpad, and
`git status --short` in the worktree shows only the two edited documents plus
the `node_modules` symlink the worktree needs for `npm run lint` (removed before
the commit).

### 0.1 The candidate fix, and why the "after" numbers are runs

Round zero applied the fix the spec specifies to a `git archive HEAD` scratch
copy so that every "after" value is a **run**, not a prediction. The edits are
exactly the ones the Deliverables table names for `src/`:

```text
src/core/dream/ledger.js    + PRESERVED_COPIES_POINTER, exported
                            ~ the secret-revert-exhausted banner sentence
                            ~ secretRevertSummaryLine's closing sentence
src/core/dream/warnings.js  ~ SECRET_EXHAUSTED_REMEDIATION = the imported constant
src/cli/doctor.js           ~ quarantineReport's secret-revert-exhausted row
```

Four trees were measured: **UNTOUCHED** (`8302ce8e`), **FULL FIX**,
**ABSENT** (the full fix with `src/core/dream/warnings.js` removed) and
**VIOLATING** (the full fix plus a byte-identical retyped copy of the pointer
sentence appended to `src/cli/doctor.js`).

### 0.2 Baselines

```text
npm test        tests 2618 / suites 0 / pass 2606 / fail 0 / skipped 12   exit 0
npm run lint    Linting: 635 file(s) | Summary: 0 error(s) | lint passed  exit 0
                frontmatter check passed: 267 spec(s), 4 agent(s)
npm run red-proofs (on a pristine `git archive` copy)
                5 declared proof(s), 5 selected
                PROVEN  dot-segment-admit-reverted        (WP-dot-segment-denial criterion 1)
                PROVEN  dot-segment-layout-reverted       (WP-dot-segment-denial criterion 1)
                PROVEN  dream-private-index-dropped       (WP-show-slot-own-value-kind criterion 3)
                PROVEN  known-calls-show-slot-widened     (WP-show-slot-own-value-kind criterion 2)
                PROVEN  instruction-basenames-reverted    (WP-instruction-basename-currency criterion 7)
                RUN: PROVEN                                              exit 0
```

The lane was run on a scratch copy rather than in the worktree: it refuses a
worktree whose `node_modules` is a symlink
(`ERROR: SNAPSHOT — unsupported entry type: symbolic link at node_modules`).
That trap is recorded in the spec's Implementation notes so an implementer does
not read the refusal as a failure of their work.

### 0.3 The defect, DRIVEN rather than argued

The spec's whole claim is that four surfaces name a quarantine shelf they cannot
observe, and that the shelf they name is wrong on a shipped arm. Round zero drove
that arm directly against `makeGates({stateDir}).secret(…)` — a soft
(redact-severity) finding, `fs.writeFileSync` made to throw `EACCES` for paths
directly under `quarantine/` but not under `quarantine/redacted/` (the same
injection the shipped R0b tests use), and `addedLineNumbers` naming a line the
note does not have, so the gate's own scan still sees the finding while
`scrubAddedLines`'s bounds check refuses:

```text
THREW = null
VERDICT = { "refuse": true,
            "reason": "content matched a secret pattern (high-entropy); not promoted",
            "preserved": [ { "artifact": "2026-09-05-fp.md",
                             "location": "quarantine/redacted" } ] }
quarantine/          listing = ["redacted"]
quarantine/redacted/ listing = ["2026-09-05-fp.md"]
listSecretQuarantine(stateDir) = []

[console summary line] wienerdog: dream — the secret check withheld 1 note(s); 1 session
transcript(s) will be retried on the next run and 0 were skipped after too many withheld
runs in a row. The withheld notes are in state/quarantine/.

[ledger banner] > [!warning] Wienerdog: 1 session transcript(s) are no longer being
dreamed over — … The withheld copies are in state/quarantine/: restore what you meant to
keep and delete the rest of the files there (not the redacted/ folder inside it). …
```

A refusal, a non-empty record, no abort, the note's only copy on the other
shelf, no digest banner at all — and two surfaces telling the user the copy is
somewhere it is not. **This is the finding the package exists for, and it is a
run, not a reading.**

### 0.4 What changed under the fix, measured on all four surfaces

```text
[ledger banner]  > [!warning] Wienerdog: 2 session transcript(s) are no longer being
dreamed over — … : sess-a.jsonl, sess-b.jsonl. Copies of the withheld notes are kept
outside your vault; each dream report names its own copies and the folder each one is in.
The session files themselves are untouched.

[summary line]   wienerdog: dream — the secret check withheld 2 note(s); 3 session
transcript(s) will be retried on the next run and 0 were skipped after too many withheld
runs in a row. Copies of the withheld notes are kept outside your vault; each dream
report names its own copies and the folder each one is in.

[doctor]         [warn] 1 session transcript(s) are being skipped: the notes made from
them were withheld by the secret check too many times in a row. Copies of the withheld
notes are kept outside your vault; each dream report names its own copies and the folder
each one is in.

[reports/warnings.md]
### The notes made from these sessions were withheld by the secret check too many times in a row — 1

Copies of the withheld notes are kept outside your vault; each dream report names its own copies and the folder each one is in.

- spent.jsonl
```

### 0.5 The full suite under the candidate fix — exactly six existing tests break

`node tests/with-temp-root.js tests/run.js` on the scratch copy:
`tests 2618 / pass 2600 / fail 6`.

```text
✖ dream-integration: the bounded episode — three deferrals, then an exhausted quarantine that an append cannot reset
✖ doctor: every Table A reason class renders its exact message, in row order, with exact counts, zero-member groups omitted, and no name ever leaks
✖ dream-warnings: every reason class renders under its own heading, in the fixed order
✖ dream-warnings: the remediation line rides the secret-exhausted group and no other
✖ ledger: quarantineBannerLine renders the exhausted sentence, names no command, and states no count
✖ ledger: secretRevertSummaryLine is built from integers alone
```

Four files, six assertions — **exactly** the four test files the Deliverables
table names for updated pins, row for row. No hidden coupling anywhere else in
the suite. The spec states this so a seventh break in review is read as a
finding rather than as a fixture to update.

### 0.6 V1 and V2 extracted from the spec's fenced block and RUN, in four states

Each run was produced by cutting the ```bash block out of the spec file and
piping it to a shell, so the shipped escaping is exercised rather than described.

```text
UNTOUCHED 8302ce8e
  V1 SHELF CLAIM SURVIVES: src/core/dream/ledger.js (2 occurrence(s))
  V1 SHELF CLAIM SURVIVES: src/core/dream/warnings.js (1 occurrence(s))
  V1 SHELF CLAIM SURVIVES: src/cli/doctor.js (1 occurrence(s))
  V2 SENTENCE HAS 0 AUTHOR(S) IN src/, expected 1
  V2 NOT WIRED: src/core/dream/ledger.js
  V2 NOT WIRED: src/core/dream/warnings.js
  V2 NOT WIRED: src/cli/doctor.js
  V1/V2 RED                                                              rc=1
FULL FIX
  V1 OK
  V2 OK                                                                  rc=0
ABSENT (src/core/dream/warnings.js removed)
  V1 MISSING DELIVERABLE: src/core/dream/warnings.js
  V2 MISSING DELIVERABLE: src/core/dream/warnings.js
  V1/V2 RED                                                              rc=1
VIOLATING (the pointer sentence retyped once more under src/cli/)
  V1 OK
  V2 SENTENCE HAS 2 AUTHOR(S) IN src/, expected 1
  V1/V2 RED                                                              rc=1
```

**And running it caught a defect reading it did not.** The first draft's fenced
block ended at `[ "$v2" = 0 ] && echo "V2 OK"` and therefore **exited 0 while
printing seven failure lines** — the never-failing check
`docs/runbooks/spec-authoring.md` forbids, in the exact shape it warns about.
The explicit `V1/V2 VERDICT` line was added, with a comment saying it was found
by extraction and not by reading. Every `rc=` above is from after that fix.

**V3 and V4 were not run to completion on a fixed tree**, and the reason is
recorded rather than papered over: the three RED declarations and the three test
identities do not exist yet, so V3's discriminating content — the three roll-up
lines naming this WP — cannot appear until the implementer writes them. V3's
baseline (0.2) and V4 on the untouched tree with both edited documents present
(`lint passed`, `0 error(s)`) are what round zero can reach.

### 0.7 Citations resolved, by construct name

The spec deliberately carries **no `file:LINE` citation into a live source
file**; the two line numbers it does mention (`ledger.js:449`, `:472`) appear only
inside a quotation of the Draft stub, and both were checked to still resolve
today. Everything else is cited by construct or by test identity, each verified
to exist at `8302ce8e`:

| Cited construct | Resolves in |
|---|---|
| `getPaths` (`core = $WIENERDOG_HOME \|\| ~/.wienerdog`; `state`, `vault`) | `src/core/paths.js` |
| `quarantinePreserve`, `REDACTED_SUBDIR`, `REDACTED_RETENTION_CAP = 50`, `pruneRedactedOriginals`, `scrubAddedLines`, `makeGates(…).secret` | `src/core/dream/validate.js` |
| `copyClause`, `REMEDIATION_GUIDANCE`, `withRemediation`, `readRecord`, the row-Q3 comment *"`state/quarantine/` announces nothing on its own"* | `src/core/dream/promote.js` |
| `quarantineBannerLine`, `secretRevertSummaryLine`, `activeQuarantines`, `displayName`, `hasFreshInformationalQuarantine` | `src/core/dream/ledger.js` |
| `SECRET_EXHAUSTED_REMEDIATION`, `WARNINGS_REL`, `composeWarnings` | `src/core/dream/warnings.js` |
| `secretQuarantineWarn`, `listSecretQuarantine`, `capDigest` | `src/core/digest.js` |
| `quarantineReport` | `src/cli/doctor.js` |
| `// 20. ROW G11 — EVERY RECORD THIS RUN PRODUCED REACHES THE USER.` | `src/cli/dream.js` |
| `dream-validate: EP2 redact arm R0b (tracked\|untracked): a durable copy EXISTS, so the run is recoverable and does NOT abort` | `tests/unit/dream-validate.test.js` |
| `listSecretQuarantine: the redacted/ SUBDIRECTORY never enters the withhold banner` | `tests/unit/digest.test.js` |
| Table Q rows **Q1**, **Q2**, **Q3**, **Q4**, **Q9**, **Q14** | `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` |
| Table Q rows **Q3**, **Q7**, **Q9** | `docs/specs/done/WP-dream-promote-module.md` |
| Table P row **P3** | `docs/specs/done/WP-preservation-abort-widening.md` |

### 0.8 Findings this pass raised against its own draft, and their disposition

| # | Finding | Disposition |
|---|---|---|
| Z1 | The stub's *"including the only-copy abort entries introduced by the dependency WP"* asserts ledger entry shapes that do not exist. Measured: `git log -- src/core/dream/ledger.js` names `e75620a8` (`WP-quarantine-banner-decay`) as that file's last change, so `WP-preservation-abort-widening` never touched it; and its abort throws out of `promote()` before the transcript advance, `writeLedger`, the summary line or the digest regeneration are reached | **FIXED, with the correction stated in place** — Current state carries a numbered block checking all three of the stub's claims, so a reader can tell a correction from an omission |
| Z2 | The stub's *"The banner is derived from the preservation record — no second derivation"* is not achievable as written: none of the four surfaces is handed a preservation record, and the record is per-run and never persisted | **FIXED by restating the intent in its satisfiable form** — Table L row **L0**, which is `WP-dream-promote-module` Table Q row Q9's own *none re-derives one, and none adds a carrier beside it* applied to the four surfaces that were never brought under it |
| Z3 | The stub's title, *"pin its slot"*, implies a positional defect. None was found: `capDigest` reserves the whole prefix by line count and by bytes and truncates only the body, so no banner can be squeezed or split | **FIXED by retiring the title**, with the reason stated in Current state rather than by silent rewording |
| Z4 | The first draft read the digest banner's `(not the redacted/ folder inside it)` as steering the user AWAY from their only copy, and proposed deleting it. It does the opposite: it exempts `redacted/` from a DELETE instruction, and `tests/unit/digest.test.js` carries a test whose name records why it was added | **FIXED by withdrawing the claim entirely.** `src/core/digest.js` left the boundary, row **L5** records why, and the parenthetical is explicitly preserved. The mis-reading is recorded here because it is the shape a reviewer should look for again: a protective clause read as a misdirecting one |
| Z5 | The first draft called the report's `remediation: 'delete'` on a refused path a defect. It is an owner ruling — `WP-dream-promote-module` Table Q row Q9, 2026-08-29, *"every refusing arm's value on both shelves"* | **FIXED by downgrading it to a recorded TENSION** between two ratified surfaces (the report says *delete that copy*, the digest banner says *restore what you meant to keep*), routed to the PR's "Discovered issues" and to the owner, with the ruling quoted so nobody re-derives it as a bug |
| Z6 | Current state said **two** registered mirrors in `WP-secret-fence-ep2-redact-arm` are falsified. Re-reading the cells whole found a **third**: row **Q1**'s closing reason, *"The parenthetical is byte-identical to Q2's, deliberately"*, which goes false when Q2's banner loses its parenthetical — and it is mirrored again in a two-line comment in `tests/unit/digest.test.js` | **FIXED**: Q1 joins the Deliverables row and gains its own byte-exact clause (its decided TEXT is unchanged; only one sentence of its reasoning is scoped), `tests/unit/digest.test.js` joins the boundary as a comment-only row, and the Mirrored Surface Checklist registers both |
| Z7 | Q2's amendment clause misdescribed the byte-identity that row records — it is the PREFIX's stability across Q2's own change, kept so the integration substring assertion would survive, not an identity with the digest banner | **FIXED in the byte-exact clause**, which now names the integration assertion and says explicitly that the file moves inside this package's Deliverables |
| Z8 | **Two different canonical tables in this family are both called Table Q, and their row ids collide** (Q1, Q2, Q3, Q9 exist in both `WP-dream-promote-module` and `WP-secret-fence-ep2-redact-arm`). The draft cited both by row id alone in six places | **FIXED**: a paragraph in Context states the collision, and every citation in the spec now names the owning spec. The draft's one factual casualty — attributing the `remediation` values to the wrong Table Q — was corrected with it |
| Z9 | Counting errors, each fixed by a re-count: *"nine are JSDoc or code comments"* (eight); *"pinned in five test files"* (four); *"the six failures are exactly those five files' assertions"* (four); the activation trigger's *"five test pins, and two rows"* (six assertions, three rows) | **FIXED by count** |
| Z10 | The extracted V block exited 0 while printing failures | **FIXED** — see 0.6 |
| Z11 | Acceptance criterion 1 credited the exhausted banner with a *"freshness gate"*. It has none — the exhausted sentence never decays; the seven-day window is the informational sentence's | **FIXED**, and the criterion now pins both facts separately |

### 0.9 Design decisions taken at round zero, with their reasons

1. **The fix is a POINTER, not a second shelf name.** The alternative — naming
   both shelves, or naming the record's `location` — is impossible for three of
   the four carriers, which never see a record. Pointing is also what
   `docs/runbooks/spec-authoring.md` prescribes: *"A place that keeps going
   stale predicting another surface's content stops predicting and points."*
2. **The pointer's target is the dream report, not `reports/warnings.md`.**
   The report is the surface that actually holds each copy's folder
   (`copyClause`), and `WP-dream-promote-module` Table Q row Q3 already calls
   that line *the user's ONLY route back to* a redacted-shelf copy. Row G11 of
   `src/cli/dream.js` guarantees the record reaches the user even when the report
   itself is refused, so the pointer is not a dead pointer.
3. **`src/core/digest.js` is OUT.** It observes the folder it names, so it
   satisfies L0. Its real gap — it cannot announce an only-copy on the other
   shelf — needs durable state the product does not have, and that is a product
   decision, routed as the proposed successor `WP-quarantine-only-copy-shelf`.
4. **`src/cli/doctor.js` is IN even though the stub named only `ledger.js`.**
   The sweep-the-claim rule: leaving one surface stating the corrected fact and
   another stating the false one is the drift ADR-0031 exists to stop.
5. **No split, and `size: S` becomes `size: M`.** Every seam runs through the
   same sentence, so half a chain would deliberately create that drift. The
   package stays one because the change has no control flow: three source files,
   one exported constant, four substitutions.
6. **One canonical constant in CODE, not four agreeing literals.** A retyped
   byte-identical copy cannot be caught by any runtime assertion, so the
   single-author property is V2's alone and the spec says so in those words
   rather than implying a test covers it.
7. **`doctor.js` gets no RED proof.** `quarantineReport` is not exported and its
   suite spawns the CLI; a proof would need its own declaration file and a
   spawn-per-phase run for a one-line literal. Named as a residual in Table C
   rather than left as an implied gap.

### 0.10 What round zero did NOT establish

- **No external channel has read this draft.** Template conformance and the
  clean-context coherence read are the orchestrator's round-zero executors and
  have not run.
- **The shipped tests do not exist yet.** What was rehearsed is the SOURCE fix
  and its blast radius; the three Table C identities, their markers and their
  declarations were designed but not written, so V3's PROVEN state is
  unobserved by construction.
- **The `remediation` tension is recorded, not adjudicated.** Round zero
  measured that the report says *delete that copy* about a copy the same run
  proves can be the only one, and stopped there.
- **`docs/runbooks/secret-incident.md` was read for the claim and judged
  unaffected, not re-verified end to end.** It carries a bullet for each shelf
  (`WP-secret-fence-ep2-redact-arm` Table Q rows Q3 and Q4) and states no
  universal about where a withheld copy is; a reviewer who disagrees should say
  so, because that file would then join the boundary.

## Round zero — orchestrator's executors, 2026-09-05, on `ef9be766`

The clean-context **template-conformance** executor reported the spec
CONFORMANT with nothing silently absent. The **coherence** executor reproduced
everything else independently: all 13 `state/quarantine` hits across 7 files, the
5 user-facing carriers, the 6 pinned assertions in 4 test files, the `fail 6`
rehearsal down to the exact six test names, V1/V2 as extracted (RED with the
verdict line, exit 1), the R0b path and `listSecretQuarantine(stateDir) === []`
on an independent fixture, all four "Exact contracts" renderings byte for byte,
and Table C's three mutations each reddening **exactly** its declared identity
under `testNamePattern` — **and not without it**, which confirms the pattern is
load-bearing rather than decorative, with all three `find` strings unique.

**Three findings, FIX on all three.** No rebase: `ef9be766` already sits on
`8302ce8e`. The fixes land as a second commit above it; `status:` stays `Draft`.

| # | Finding | Disposition |
|---|---|---|
| **1** [A] | Implementation notes stated the `Done`-spec amendment convention as *"appended at the end of the row's FIRST content cell"*, but Table Q rows are **four** columns and all three clauses self-describe content that lives in column 4 (`why`) — Q1's *"this cell's closing reason"*, Q9's *"the reason it gave"*. A literal implementer would produce a clause in column 2 whose own sentence does not describe column 2, and **acceptance criterion 8 cannot catch it**, because a Table Q row is one line so the wrong cell is still one changed line | **FIXED, three ways.** (a) The rule is restated as **append to the cell that carries the claim it scopes**, with a measured per-row target table (Q1 → 4, Q2 → 4, Q9 → 4), each verified by splitting the row on `' \| '`. (b) A new verification step **V5** checks placement mechanically and is the only check that can; acceptance criterion 8 now names V5 as the owner of its placement half, and the Mirrored Surface Checklist registers both. (c) **The finding's premise about the precedent was itself measured and corrected in place**: Q18's clause sits in cell **2** of a 4-cell row while the universals it scopes are in cells 3–4, and B3b's sits in cell **2** of a 3-cell row while its *"stays true"* claim is in cell 3 — so Q18/B3b are a precedent for the clause's SHAPE, not for its placement, and the spec now says so, because copying that placement is exactly the mistake |
| **2** [C] | The Q9 byte-exact clause quoted the source as *"…are, which stays true"* (comma) where `:1640` reads *"…are — which stays true."* (em dash, U+2014) | **FIXED.** Byte-compared with `xxd`: the source is `65 20 e2 80 94 20 77` (`e — w`), the draft had `65 2c 20 77` (`e, w`). One character; the clause is now byte-faithful. Current state's own quotation of the same sentence already carried the em dash and was left alone |
| **3** [C] | `src/core/dream/warnings.js`'s doc comment claims byte-identity with *"the sentence the digest banner uses for the same class"* — the wrong surface: the identity is with **L1**, `ledger.js`'s exhausted banner, not with **L5**, `digest.js`'s. Table L row L3 described the comment as asserting identity *"with it"* without noting the misnaming | **FIXED in one clause, in both mirrors.** Row L3's shipped-behaviour cell and Current state's carrier census now both say the comment names the wrong surface and which surface the identity actually holds with. L3 already replaces the comment, so no Deliverables row moves |

**The observation was accepted and left alone:** the spec's only `file:LINE`
into another document is `tests/integration/dream.test.js:1437`, and it appears
only inside a verbatim quotation of the `Done` spec's Q2 cell. Quoting a stale
citation faithfully is correct; silently modernising it to `:1640` would make the
quotation false.

### 0.11 V5 measured in four directions, extracted from the spec and run

```text
UNTOUCHED 8302ce8e (clause absent)
  V5 CLAUSE NOT IN THE why CELL OF ROW Q1
  V5 CLAUSE NOT IN THE why CELL OF ROW Q2
  V5 CLAUSE NOT IN THE why CELL OF ROW Q9
  V5 RED                                                                   rc=1
EACH CLAUSE IN ITS ROW'S CELL 4
  V5 OK                                                                    rc=0
EACH CLAUSE IN ITS ROW'S CELL 2 (the literal reading of the Q18 precedent)
  V5 CLAUSE NOT IN THE why CELL OF ROW Q1
  V5 CLAUSE NOT IN THE why CELL OF ROW Q2
  V5 CLAUSE NOT IN THE why CELL OF ROW Q9
  V5 RED                                                                   rc=1
THE FILE RENAMED AWAY
  V5 MISSING DELIVERABLE: docs/specs/done/WP-secret-fence-ep2-redact-arm.md
  V5 RED                                                                   rc=1
```

The cell-4 tree also keeps `npm run lint` at `Linting: 636 file(s)`,
`0 error(s)` — appending inside a table cell adds no line and trips no rule.
And the whole fenced block, extracted and run on a tree carrying **both** the
source fix and the cell-4 clauses, gives `V1 OK / V2 OK / V5 OK`, `rc=0`; on the
untouched tree it stops at `V1/V2 RED`, `rc=1`, which is the intended
short-circuit.

**Running V5 caught a defect in V5 that reading it had not — the second time
this pass.** The first draft of the step embedded an apostrophe in an
error message using the `'"'"'` idiom, which is the escape for a single quote
inside SINGLE quotes and is unbalanced inside the double-quoted string it was
written into: extracted and run, the block died with
`unexpected EOF while looking for matching '"'`, `rc=2`. The message was
rewritten without the apostrophe. Together with the missing V1/V2 verdict line
(§0.6), that is two shipped-escaping defects in one spec, both invisible to
reading and both found by `bash -n` plus one execution.

### 0.12 What round zero still has NOT established

Unchanged from §0.10, plus: **V5's own compliant state depends on a clause the
implementer has not written yet.** The four runs above used the spec's three
byte-exact clauses, extracted from the spec by pattern and appended
programmatically — which proves the CHECK discriminates, not that the
implementer's hand-placed clause will land in the same cell. That is precisely
why V5 exists.

## External rounds

Round zero closed at `2f7ed9e0` (architect self-check `ef9be766` → the
orchestrator's two clean-context executors, template CONFORMANT and coherence
3 findings — 1 A, 2 C — all FIX in `2f7ed9e0`: the amendment-placement rule
restated as "append to the cell that carries the claim", V5 checks it
mechanically; the Q9 quotation byte-corrected; the `warnings.js` comment's
wrong surface named).

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material design finding on either channel — a user-facing
surface that still names a folder a preserved copy may not be in, or still
instructs a delete, after this package; a second author of the pointer sentence
that V2 cannot see; a RED proof whose mutation reddens an identity outside its
`expectRed` (or none) under the declared `testNamePattern`; an acceptance
criterion a wrong implementation passes (the placement of the three Done-spec
amendment clauses; the digest's own L5 banner being changed when it must not
be); or a scope leak into `WP-quarantine-preserve-durability` (durable state,
the retention cap, the shelf a fall-through copy lands on) — and machinery/
wording findings at that point are fixed within the frozen surface or accepted
as named residuals. **Escalations:** (i) two consecutive rounds landing findings
of the same kind → a design question per ADR-0031; (ii) a finding whose only
honest fix adds durable state, changes the owner-ruled `remediation: 'delete'`
value (`WP-dream-promote-module` Table Q row Q9), or touches the digest's L5
banner is PARKED — to the owner or to the durability successor; (iii) the
Dispatch-precondition item (the four surfaces stop naming a folder and stop
instructing a delete; recommended confirm) is the owner's, so a finding that
only re-argues it is routed as a scope objection and does not count toward the
verdict.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from the branch worktree); shadow = hermetic Codex
(`codex exec -s read-only`, `CODEX_HOME=~/.codex-review-home`, detached worktree
at the round's tip, no approvals). Raw outputs committed BEFORE adjudication as
`2026-09-05-quarantine-banner-gate-raw-round<N>-<channel>.txt`.

### Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| 1 (`007858a7`) | needs-attention / needs-attention | `…round1-codex-plugin.txt`, `…round1-herdr-shadow.txt` (both `7f4fc5d0`) | Plugin 2 A + 1 B, shadow 2 A + 1 B, four scope objections routed and not counted; both confirmed the census (13 hits / 7 files, no template or skill carrier), the six pins and the L1–L4 / L5 split. **Converged (A):** the byte-exact pointer sentence named "each dream report", but on the refused arm no report is written and `report.record` goes only to command output (dream.js's own "not stored anywhere else"; the shipped test proves no report is staged) → FIX: the sentence names the real destinations — "in its dream report or in the output it printed" — with a measured four-arm table (published / unpublished / fallback / refused) under Exact contracts; renderings, pins and `find` literals re-derived. **Converged (A):** V2 was lexical — an unused import plus a sentence composed from two literals (split inside the prefix) passed V1/V2 and every runtime pin → FIX by the runbook's fixed point, not a stronger parser: a runtime DERIVATION PROOF — a marker appended inside L0's literal must move every carrier, with identities pinned against HAND-WRITTEN literals so a composed carrier stays green and `evaluateRed`'s "declared identity did not fail" IS the detection (measured: correct tree MOVED×3, composed defeat MOVED/MOVED/unmoved; the doctor line carries the marker through a real CLI spawn, 385 ms per phase, so the doctor carrier stops being a residual); V2 shrunk to the contiguous-retype case it can honestly claim. **Plugin (B):** V5 accepted a marker-only amendment → extracts each clause from the spec by a STRUCTURAL key and requires the row's cell-4 suffix to be the whole clause plus a `3/3` numstat on the Done spec; rehearsed untouched / cell 4 / marker-only / cell 2 / extra-line. **Shadow (B):** the RED declaration was not writable from the implementer's reading set → two complete declaration files inlined in Table C (six proofs) with five byte-exact source forms, each `find` unique, each mutated file `node --check`ed. **Parked (escalation (ii)) → second owner item:** both channels observed L5's "this notice clears when no withheld copies are left" is false in the mixed-shelf state; the parenthetical stays correct; recommendation: route to the successor because the wording is downstream of the shelf decision, cost of overruling stated. All FIX, applied in `f8549561`. HEAVY (a user-facing sentence and every pin; two declaration files; four identities) → round 2 runs as the closing confirmation. |
| 2 (`44aa930d`) | needs-attention / needs-attention | `…round2-codex-plugin.txt`, `…round2-herdr-shadow.txt` (both `903dbe90`) | **Both channels verified R1-A/B/D hold** (the four arms coherent; both derivation proofs sound; six inlined mutations each match once and parse); four scope objections routed. **Converged (A):** V5 accepted a same-line reauthoring inside an amended row — numstat counts lines, not bytes → FIX by deleting the step that had to be right: each candidate row must EQUAL `git show main:` base row + its clause, byte for byte; seven rehearsed states. **Shadow (B):** Out of scope still forbade the doctor RED proof Deliverables now require; "three identities" stale → FIX. **Shadow (A) — the pointer-truth family for the SECOND consecutive round → escalation (i), a design question:** dream.js persists the ledger, prints the pointer-bearing summary, regenerates the digest and refreshes warnings BEFORE it prints the undelivered `report.record`, so a crash in that window leaves a durable pointer whose destination never completed. Measured, then settled as option (a) — DELETE THE WINDOW: two hunks relocating the undelivered-record print to step 17b (no line rewritten), full suite unchanged by the move (`2618/2600/6`, the same six wording pins), a failure-injection test discriminating both ways (reordered pass 1; shipped ordering fail 1 with "the record was delivered BEFORE the fault"); `src/cli/dream.js` and `tests/unit/dream-pipeline.test.js` enter Deliverables, Table L row L7, criterion 6 (old 6–11 renumbered with every reference swept). Escalation (ii) does not apply (no durable state). Trap recorded for the implementer: the atomic writer uses `openSync` on a random temp, so the injection seam is `fs.renameSync` on the destination. All FIX in `b7e34215`. HEAVY → round 3 runs as the closing confirmation. |

### Round 1 fixes — architect, 2026-09-05, on top of `7f4fc5d0`

Both channels returned **needs-attention** with **two CONVERGED A findings**, one
B each, and four scope objections routed and uncounted. All four counted findings
are **FIXED**. Both channels independently confirmed the census (13 hits, 7 files,
no template or skill carrier), the six existing pins, the L1–L4 / L5 split and
the Q1/Q2/Q9 cell placement — none of that moved.

| # | Finding | Disposition |
|---|---|---|
| **1** [A, CONVERGED] | The byte-exact pointer promised that *"each dream report names its own copies and the folder each one is in"*, which is false on two of the report's four outcome arms: on `refused` no report is written and `report.record` goes to command output only (*"not stored anywhere else"*, and `dream-pipeline`'s shipped test asserts the report path is **not** in the commit); on `promoted` with `accounting.published === false` the report exists without its enforcement section. A durable banner read weeks later would point at a file that was never created — the same class of false pointer this package exists to remove | **FIXED by naming what row G11 actually guarantees, which is a DISJUNCTION.** The sentence is now *"…the dream run that withheld them names each copy and its folder, in its dream report or in the output it printed."* A new four-row table under "Exact contracts" states where the record lands on each of `promoted`-published, `promoted`-unpublished, `fallback` and `refused` — **measured, and `fallback` is a fourth arm neither channel named**: it publishes the enforcement section to the vault, so it belongs on the report side of the disjunction. All four rendered strings, the four hand-written pins and Table C's `find` literals were re-derived from the new sentence and re-measured on the rehearsal tree. The sentence also lost its apostrophes on purpose, so the JS literal needs no escaping and the declarations' `find` strings stay readable |
| **2** [A, CONVERGED] | V2 is lexical: it counts contiguous occurrences of the sentence prefix and checks each carrier CONTAINS the identifier. Both channels built the defeat — import the constant, never use it, rebuild the byte-identical sentence from two literals split INSIDE the prefix — and measured V1/V2 green with every runtime pin green. Criterion 5's single-author guarantee was unproven | **FIXED with a DERIVATION PROOF, and V2 shrunk to what it can claim.** Reproduced here first: the split-inside-the-prefix form scores `V1 OK / V2 OK`, `rc=0` (my own first attempt split *after* the prefix and V2 caught it — recorded because it is the difference between a defeat that works and one that does not). **The runbook's fixed point was respected: no stronger source parser.** Instead the derivation is made observable at runtime — appending a marker inside `PRESERVED_COPIES_POINTER`'s own literal must move every carrier's rendered output. **Measured on two trees:** correct → banner/summary/warnings all `MOVED`; composed defeat → `MOVED / MOVED / unmoved`. The doctor carrier was measured the same way through a real CLI spawn and comes back carrying the marker. **And the mechanism is the OPPOSITE of the one the finding suggested, deliberately:** pinning a carrier against the IMPORTED constant moves both sides together and stays green under the mutation, proving nothing. The identities are therefore full-string equalities against **hand-written** literals; the mutation reddens every deriving carrier, and a composed carrier stays green — which `evaluateRed` reports as *the declared identity did not fail under the mutation*. That refusal IS the detection. Criterion 5 now cites the proofs; V2 keeps only the contiguous-retype case and says so |
| **3** [B, plugin] | V5 accepted marker-only amendments: appending just the dated marker to Q1/Q2/Q9's cell 4 passed while none of the three byte-exact clauses existed, and an unrelated edit on the same line was invisible | **FIXED, three ways.** V5 now (a) EXTRACTS each clause from this spec by a **structural key** — the claim it scopes (`this row's TEXT is UNCHANGED`, `… sentence is RETIRED`, `… disposition is WITHDRAWN`), never by the order they appear — and requires the row's cell-4 SUFFIX to be that whole clause; and (b) requires `git diff --numstat main` on the Done spec to be exactly `3/3`. Rehearsed in **five** scratch git repos whose `main` is the pristine tree: absent → RED, cell 4 → `V5 OK`, marker-only → RED, cell 2 → RED, compliant-plus-one-unrelated-line → `V5 DONE-SPEC DIFF IS 4/4, expected 3/3` → RED. Four RED states, each failing for its own reason |
| **4** [B, shadow] | The declaration file was a `create` deliverable described only semantically, while `validateProof` requires `suite`, `wp`, `criterion`, `why`, `file`, exact `find`, `replace` containing `marker`, `testNamePattern` and structured `expectRed` — and neither the runner nor a shipped declaration is in the implementer's reading set | **FIXED by INLINING, as the finding preferred.** Table C now carries **two complete declaration files** verbatim (one per suite — `suite` is top-level, and the doctor carrier's evidence is a CLI spawn in its own suite), **six proofs**, and a companion block of **five byte-exact source forms** the `find` strings quote. Validated mechanically against the rehearsal tree: both JSON blocks parse, each `find` occurs exactly once in its file, each `marker` is in its own `replace` and absent from the pristine file, and **every mutated file passes `node --check`** — a mutation that does not parse is a proof that can never run, which nothing in the runner would have told the implementer |

**The doctor carrier is now PROVEN rather than a residual.** Round zero named it
an uncoverable gap; measuring the cost showed otherwise —
`node tests/with-temp-root.js --test --test-name-pattern … tests/unit/doctor.test.js`
is **385 ms**, so a second declaration file with its own suite is affordable, and
File B carries both a shelf proof (criterion 4) and a derivation proof
(criterion 5) for it. The named residual it replaces is gone, and criterion 7
now expects **five** roll-up lines rather than three.

**PARKED, and put to the owner rather than absorbed** (escalation (ii)): both
channels observed that row **L5**'s closing sentence — *this notice clears when
no withheld copies are left* — is false in a mixed state, because
`listSecretQuarantine` excludes `redacted/`, so removing the last direct file
clears the notice while a fall-through only-copy remains. It is now the Dispatch
precondition's **second owner item**, with the measured state, the exact cost of
absorbing it (one Table L row, `src/core/digest.js` entering the boundary, one
updated pin in a file already in the boundary) and a recommendation.
**Recommendation: route it to the successor, because the wording is DOWNSTREAM
of a decision nobody has made** — if `WP-quarantine-only-copy-shelf` moves such a
copy to the withheld shelf, or records it durably and lists it, the shipped
sentence becomes true again and a narrowing landed now would have to be
reverted. Only the "leave it unannounced" branch makes the narrowing permanent.

### 1.1 Round-1 measurements

**The four report arms, measured** (finding 1's evidence, and the reason the
sentence names two channels):

| `report.outcome` | where the enforcement record lands |
|---|---|
| `promoted`, `published === true` | the dream report in the vault |
| `promoted`, `published === false` | body in the vault; **section printed to the run's output** |
| `fallback` | published to the vault — the section alone, or appended |
| `refused` | **nothing in the vault; printed to the run's output only** |

**The derivation, measured on two trees** (finding 2's evidence):

```text
CORRECT TREE + marker appended inside the constant's literal
  L1 banner : MOVED     L2 summary: MOVED     L3 warnings: MOVED
COMPOSED-DEFEAT TREE + the same mutation
  L1 banner : MOVED     L2 summary: MOVED     L3 warnings: unmoved
DOCTOR, through a real CLI spawn on the mutated correct tree
  actual: '[warn] 1 session transcript(s) … in the output it printed. RP_MUT_POINTER_TEXT_MOVED'
```

**The lexical steps on the composed defeat** — green on every one, which is the
whole point of the proof:

```text
V1 OK
V2 OK
V5 OK                                                                     rc=0
```

**V5 in five states**, each a scratch git repo whose `main` is the pristine
`8302ce8e`:

```text
UNTOUCHED          3 × "… DOES NOT END WITH ITS FULL CLAUSE" + "DIFF IS empty, expected 3/3"   rc=1
CELL 4 (compliant) V5 OK                                                                        rc=0
MARKER-ONLY        3 × "… DOES NOT END WITH ITS FULL CLAUSE"                                    rc=1
CELL 2             3 × "… DOES NOT END WITH ITS FULL CLAUSE"                                    rc=1
CELL 4 + 1 EXTRA   "V5 DONE-SPEC DIFF IS 4/4, expected 3/3"                                     rc=1
```

**The six declarations, validated mechanically** against the rehearsal tree:

```text
suite tests/unit/ledger.test.js — 4 proof(s)
  banner-shelf-claim-restored      crit=1 find x1 marker_in_replace=True marker_absent_from_src=True OK
  summary-shelf-claim-restored     crit=2 find x1 marker_in_replace=True marker_absent_from_src=True OK
  warnings-shelf-claim-restored    crit=3 find x1 marker_in_replace=True marker_absent_from_src=True OK
  pointer-derivation-ledger-suite  crit=5 find x1 marker_in_replace=True marker_absent_from_src=True OK
suite tests/unit/doctor.test.js — 2 proof(s)
  doctor-shelf-claim-restored      crit=4 find x1 marker_in_replace=True marker_absent_from_src=True OK
  pointer-derivation-doctor        crit=5 find x1 marker_in_replace=True marker_absent_from_src=True OK
ALL OK — and all six mutated files pass `node --check`
```

**Unchanged by the whole round:** the blast radius. `npm test` on a rehearsal
copy carrying the revised sentence is again `tests 2618 / pass 2600 / fail 6`,
the same six assertions in the same four files. The pointer's wording moved; what
it breaks did not. `npm run lint` on the worktree with both revised documents:
`Linting: 636 file(s)`, `0 error(s)`, `frontmatter check passed: 267 spec(s)`.

### 1.2 What round 1 did not change

- **No acceptance criterion was weakened.** Criterion 5 moved from a lexical
  claim to a runtime one; criterion 7 went from three roll-up lines to five;
  criterion 4 gained a proof. Nothing lost evidence.
- **No verification step was added beyond the frozen surface.** V1, V2, V5, V3
  and V4 are the same five steps; V2 shrank its claim, V5 grew two checks inside
  its existing body to guard a product surface (the Done spec's canonical rows),
  and V3's expected content changed. The growth is Table C's — two declaration
  files instead of one — and it buys the fourth carrier's proof, which was a
  named residual before.
- **The boundary did not widen into `src/core/digest.js` or
  `src/core/dream/promote.js`.** Both stayed out; L5's false sentence is an owner
  item and L6 is unchanged.
- **The Q1/Q2/Q9 clause texts are byte-identical to round zero's**, apart from
  nothing at all: finding 3 changed how V5 checks them, not what they say.

### Round 2 fixes — architect, 2026-09-05, on top of `903dbe90`

Both channels returned **needs-attention** and both verified that round 1's
fixes A/B/D genuinely hold: the four report arms are coherent, both derivation
proofs are sound (the shadow confirmed at `red-proofs.js:1641-1642` that an
unmoved declared identity throws **FAILED**, not ERROR — which is what makes the
composed-carrier detection a real verdict), and the six inlined mutations each
match exactly once and parse. **Three findings, all FIXED, one of them by a
design move rather than a patch.**

| # | Finding | Disposition |
|---|---|---|
| **1** [A, CONVERGED] | V5 still accepted unauthorised edits INSIDE the three amended rows. It checked that cell 4 ends with the clause and that the file's numstat is `3/3` — but numstat counts LINES, so inserting the correct clause AND reauthoring Q1's earlier text keeps the diff at three changed lines and passes every predicate. Both channels built it (*"MATERIAL UNAUTHORIZED REAUTHORING"*) and got `V5 OK`. It contradicted V5's own comment and the round-1 record | **FIXED by deleting the step that had to be right and replacing it with one that cannot be wrong.** V5 now reads each row's base with `git show main:<file>`, extracts its clause from this spec by the same structural key, and requires the candidate row to equal `${base% \|} <clause> \|` **byte for byte**. That single comparison subsumes presence-in-full and placement, and it is the only thing that can see a same-line edit. The numstat check survives for what it alone covers — a FOURTH line moving. Rehearsed in **seven** trees (below): both same-line defeats are now RED and name the row |
| **2** [B, shadow] | The spec contradicted itself on the doctor proof: an Out-of-scope bullet still forbade a `doctor.js` RED proof and called the second declaration and spawn disallowed, while Deliverables File B, criteria 4 and 5 and V3's roll-up require exactly that; the Table C residual it referenced no longer existed; and Implementation notes still said Table C fixes "the three identities" | **FIXED by deletion and a count.** The obsolete bullet is gone, "three identities" became "the four identities … and the two declaration files that carry them". The round-zero decision that named it a residual stays in this logbook as history, where a superseded decision belongs |
| **3** [A, shadow — escalation (i)] | **The pointer-truth family for the SECOND consecutive round.** The four-arm table treats the two output-bearing arms as if `report.record` had already been printed, but `src/cli/dream.js` writes the ledger, prints the pointer-bearing summary, regenerates the digest and refreshes the vault warnings file BEFORE it prints the undelivered record. A throw in that window leaves durable state claiming the run named each copy and its folder while the only complete record died in memory — on the refused redacted-only-copy arm, the user's only route to a bounded-shelf copy. The sentence was true only on the success path | **SETTLED AS A DESIGN QUESTION, and option (a) was TAKEN: delete the window.** Measured first, as the escalation requires. The move is **two hunks** — one insertion, one deletion of the same block — with **no line rewritten** except an eleven-line comment header, and the block relocates to step **17b**, immediately before step 18, following this file's own `5b.` precedent so steps 18-20 keep their ids. **The full suite is unchanged by the move** (`2618 / 2600 / 6`, the same six wording pins), and **no test in the suite asserts the order of the run's output** — measured, not assumed. Row **L7** and acceptance criterion **6** are new; `src/cli/dream.js` and `tests/unit/dream-pipeline.test.js` join Deliverables. **Escalation (ii) does not apply: no durable state is added, nothing is started, ADR-0004 is untouched.** The road not taken — narrowing the sentence to a directive to look rather than a claim that the record was printed — is stated in the spec with its cost: it would leave the user a pointer and no destination on exactly the arm that costs them their bytes, in exchange for saving two hunks |

**Why this is a design move and not a third wording patch.** Rounds 1 and 2 both
landed an A finding on the same family — *is the pointer's destination real?* —
which is ADR-0031's circuit-breaker condition. Round 1 answered it by narrowing
the sentence to a disjunction. Round 2 showed the disjunction is itself
conditional on an ORDERING the code does not provide. A third narrowing would
have been the next sentence about the same defect; reordering removes the defect
and makes the sentence unconditional. That is the extraction move applied to
behaviour rather than to prose.

### 2.1 Round-2 measurements

**The reorder, measured on `git archive` copies of `8302ce8e`:**

```text
diff of src/cli/dream.js, four-carrier fix vs fix+reorder:
  @@ -1073,6 +1073,48 @@      (the block, plus its 9 new comment lines, inserted)
  @@ -1129,39 +1171,6 @@      (the same block deleted)
  node --check src/cli/dream.js                                            rc=0

full suite, four-carrier fix only            tests 2618 / pass 2600 / fail 6
full suite, fix + reorder                    tests 2618 / pass 2600 / fail 6
full suite, fix + reorder + injection test   tests 2619 / pass 2601 / fail 6
  (the same six wording pins in the same four files, every time)
```

**The failure-injection evidence, both directions.** Refused-report arm (the
shipped symlinked-report fixture), fault injected at the digest write:

```text
REORDERED (option a)      tests 1 / pass 1 / fail 0
SHIPPED ORDERING          tests 1 / pass 0 / fail 1
    AssertionError: the record was delivered BEFORE the fault:
    (…the captured output carried no record at all)
```

**A trap worth recording, found by the seam failing silently.** The first
injection patched `fs.writeFileSync` on a path containing `digest.md` and the
run completed normally — `writeFilePrivate` writes through
`openSync`/`writeSync` on a **randomly named** temp and only then renames, so no
`writeFileSync` call ever carries the destination name. Patching `fs.renameSync`
on the destination is what reaches it. Recorded in the spec so an implementer
does not read the non-firing seam as evidence that the window is unreachable.

**V5 in seven trees**, each a scratch git repo whose `main` is the pristine
`8302ce8e`:

```text
UNTOUCHED             3 × "IS NOT ITS BASE ROW PLUS ITS CLAUSE" + "DIFF IS empty, expected 3/3"  rc=1
CELL 4 (compliant)    V5 OK                                                                       rc=0
MARKER-ONLY           3 × "IS NOT ITS BASE ROW PLUS ITS CLAUSE"                                   rc=1
CELL 2                3 × "IS NOT ITS BASE ROW PLUS ITS CLAUSE"                                   rc=1
CELL 4 + EXTRA LINE   "V5 DONE-SPEC DIFF IS 4/4, expected 3/3"                                    rc=1
CELL 4 + Q1 PREFIX    "V5 ROW Q1 IS NOT ITS BASE ROW PLUS ITS CLAUSE"                              rc=1
CELL 4 + Q1 MIDDLE    "V5 ROW Q1 IS NOT ITS BASE ROW PLUS ITS CLAUSE"                              rc=1
```

The last two are round 2's defeat and its sibling: both keep the file at three
changed lines, and both passed the round-1 form of the step.

**The whole fenced block, extracted and run:** untouched → `V1/V2 RED`, `rc=1`;
a tree carrying the four-carrier fix, row L7's reorder and the cell-4 clauses →
`V1 OK / V2 OK / V5 OK`, `rc=0`. `npm run lint` on the worktree with both revised
documents: `Linting: 636 file(s)`, `0 error(s)`,
`frontmatter check passed: 267 spec(s), 4 agent(s)`.

### 2.2 What round 2 did not change

- **No acceptance criterion was weakened**, and the renumbering is recorded so a
  reviewer can follow it: the new L7 criterion is **6**, and the old 6-10 became
  **7-11**. Every internal reference moved with them (V3's comment, V5's comment,
  the Mirrored Surface Checklist, the placement rule).
- **The pointer sentence did not change again.** Round 2's finding is about when
  the destination is completed, not about what the sentence names; round 1's
  wording stands and is now true on every arm rather than on the success path.
- **The boundary did not widen into `src/core/digest.js` or
  `src/core/dream/promote.js`.** L5's false clearing sentence remains the
  Dispatch precondition's second owner item; L6 is unchanged.
- **The Q1/Q2/Q9 clause texts are byte-identical to round zero's.** Findings 1
  and 3 of round 1, and finding 1 of round 2, all changed how they are CHECKED,
  never what they say.

### Round 3 fixes — architect, 2026-09-05, on top of `9671821c`

**Nothing about the product's design.** Both channels confirmed R2-A closed by
V5's byte comparison (extracted and run: RED on the untouched tree; the clauses
carry no `|` and their backticks survive shell capture), R2-B closed, the R2-C
reorder coherent, all six declarations matching once and parsing, and **size M /
one atomic WP honest** — the plugin's own words: *"L7 is mechanically separable
but semantically required by the new pointer sentence, so splitting creates
sequencing risk."* **Zero scope objections counted.** Two findings, both about
row L7's EVIDENCE rather than its design, and both **LIGHT** under weighted
closure: fixed inside the frozen surface, no new machinery.

| # | Finding | Disposition |
|---|---|---|
| **1** [A, CONVERGED] | The L7 detector faulted at the DIGEST rename — a whole step downstream of the first durable claim. An implementation that moved the record print to just after `writeLedger` (before `regenerateDigest`) would pass it while keeping a real window: `writeLedger` renames `transcript-ledger.json` and only then chmods it, so a crash, a termination or a chmod failure in that gap leaves the final ledger durable with the only complete record undelivered — exactly the family L7 claims to close | **FIXED by moving the detector to the LEDGER boundary.** It patches `fs.renameSync` for the destination ending in `transcript-ledger.json`, **delegates that rename first** so the final ledger is genuinely on disk, then throws immediately, and asserts the announcing line and every `report.record` line were already captured. Criterion 6 is now explicitly **three-state** — shipped ordering RED, after-`writeLedger` RED, step 17b GREEN — with the discrimination stated as the criterion and the mechanism left to the implementer. Table L row L7's evidence cell and the seam-trap paragraph were updated in the same pass |
| **2** [C, shadow] | Criterion 10's idempotence rationale still described the pre-L7, text-only package (*"ships no command … only changes four rendered sentences"*), while L7 moves an output block around writes | **FIXED, verdict kept.** `N/A` stands; the justification now states the actual invariant — L7 adds no write, no persistent state and no retry, it moves an existing output block so it runs before writes that already happen, in the order they already happen; the other four changes are text substitutions |

### 3.1 Round-3 measurements — the detector in three states, and the old one failing

All three trees are `git archive` copies of `8302ce8e` carrying the four-carrier
fix; they differ only in where the record-print block sits.

```text
DETECTOR AT THE LEDGER RENAME (the fix)
  shipped ordering (step 20)                     tests 1 / pass 0 / fail 1
  after writeLedger, before the digest (WRONG)   tests 1 / pass 0 / fail 1
  step 17b (specified)                           tests 1 / pass 1 / fail 0

DETECTOR AT THE DIGEST RENAME (round 2's form) — the false green, reproduced
  after writeLedger, before the digest (WRONG)   tests 1 / pass 1 / fail 0
```

The failing diagnostic in both RED states is
`AssertionError: the announcing line was already printed:` over an output that
carries none. **The middle row of the first block and the single row of the
second are the whole finding**: the same wrong implementation, checked two
different ways, and only the ledger-boundary check sees it.

**Three preconditions the rehearsal had to get right, each recorded in the spec
because each one silently weakens the test:**

1. **Delegate the rename before throwing.** A patch that throws *instead* of
   renaming tests a ledger that never became durable — a different and much
   weaker claim.
2. **`fs.writeFileSync` is the wrong seam.** `writeFilePrivate` writes through
   `openSync`/`writeSync` on a randomly named temp, so the destination name only
   ever appears at the rename. (This trap was already recorded in round 2 and
   still applies.)
3. **The fixture must carry no `state/watermarks.json`.** Otherwise step 4's
   one-time migration writes the ledger first and the fault lands before
   `promote()` has run, which would make the assertion vacuous. The rehearsal
   asserts the precondition rather than assuming it, and the ledger rename is
   asserted to have fired exactly once.

**Unchanged:** the full suite on the step-17b tree with the new detector is
`tests 2619 / pass 2601 / fail 6` — the same six wording pins in the same four
files as every round since round zero. `npm run lint` with both revised
documents: `Linting: 636 file(s)`, `0 error(s)`,
`frontmatter check passed: 267 spec(s), 4 agent(s)`. V1/V2/V5 extracted from the
fenced block and run on the untouched tree: `V1/V2 RED`, `rc=1`.

### 3.2 What round 3 did not change

- **No product behaviour, and no design.** Row L7's move, the pointer sentence,
  Table L, Table C's six declarations, V5 and the three Q-clauses are all
  byte-identical to round 2. Only the EVIDENCE for L7 changed, plus one stale
  rationale sentence.
- **No new machinery.** The detector moved seam; it did not become a second
  test, a second declaration file or a new verification step. That is the
  frozen-surface rule applied to a finding about the machinery itself.
- **No acceptance criterion was weakened**, and none was renumbered: criterion 6
  gained its third state and criterion 10 gained an honest reason.
- **Both owner items stand untouched** in the Dispatch precondition — the
  four surfaces' confirmation, and L5's false clearing sentence with its
  recommendation to route to the successor. Both channels routed them as scope
  objections and neither counted toward the verdict.

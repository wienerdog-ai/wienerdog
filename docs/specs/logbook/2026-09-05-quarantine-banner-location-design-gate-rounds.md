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

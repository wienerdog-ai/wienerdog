---
id: WP-ep2-retention-prune-timing-test
title: Give Table N row N2 (the retention prune runs once per run) its missing test
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0005]
epic: secret-lifecycle
---

> **`depends_on: []` is correct and is NOT the whole story — read this before
> dispatching.** This WP's real precondition has no WP id to list: the two cells it
> edits (**M-48**'s mutation row and its row in the **AC-15 coverage census**) exist
> only after **PR #124** — the post-Done errata pass on
> `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` — has merged. `depends_on`
> takes work-package ids and that pass is a spec-less architect PR, so there is
> nothing well-formed to put in the list; leaving it empty is honest and stating the
> precondition here is the repair. **Do not dispatch this WP until PR #124 is on
> `main`.** Verification step 0 below checks it by running rather than by trusting:
> if the census heading or the M-48 gap disposition is not there, stop and report it.

# WP-ep2-retention-prune-timing-test: give N2 (prune once per run) its missing test

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack" that writes configuration files
into a user's Claude Code / Codex CLI setup. **IRON RULE (ADR-0004): Wienerdog is
just files.** This WP adds one test. It starts no process, writes nothing to a
user machine, and adds no dependency.

The **dream** job is the nightly consolidation run. Before it commits anything it
runs a **secret gate** (called EP2) over the notes it is about to write. On a
finding whose severity is `redact`, the gate takes a **redact arm**: it preserves
the unredacted original into `state/quarantine/redacted/`, rewrites only the lines
that run added to their sanitized form, stages the scrub, and commits the note.
That `redacted/` folder is capped, and a **retention prune** deletes the oldest
copies when it grows past the cap.

The retention contract is four facts, and they were extracted into a canonical
table (**Table N**) in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` after
three consecutive review rounds kept landing findings on them. **This WP is about
exactly one of them:**

- **N1** — the cap: at most **50** files.
- **N2** — **the trigger: the prune runs ONCE PER GATE RUN, after the loop over
  changed paths, and only when the run completed at least one redaction.** This is
  the fact this WP tests.
- **N3** — the candidate set: date-prefixed regular files in `redacted/`, **minus
  every basename this run created**.
- **N4** — the ordering: `(mtimeMs, name)` ascending over N3's candidates.

**Why N2 matters, in the user's terms.** A single dream run can redact several
notes. If the prune ran once per redaction instead of once per run, an early copy
this run just wrote could be deleted before the run finishes — and the dream report
the user reads would name a file that no longer exists. N3's exclusion is what
normally prevents that, but N3 and N2 are separate facts held at separate places in
the code, and **only N3 is currently tested**.

## Current state

**Every claim in this section was executed on 2026-07-28 against `main` at the
merge of PR #124. Re-run them before you start (see "Verification steps") — a
dependency landing in between can falsify any of them.**

### The gap this WP closes, measured rather than argued

`docs/specs/done/WP-secret-fence-ep2-redact-arm.md`'s mutation row **M-48** names
the N2 mutation: *"prune per call instead of per run — move the
`pruneRedactedOriginals` call from its post-loop site into the B4 loop, passing the
accumulated `redactedCreated` set unchanged."* That mutation was applied in
isolation and the suite run:

```
all five EP2 retention cases      green
tests/unit/dream-validate.test.js tests 136  | pass 136  | fail 0
whole suite (node tests/run.js)   tests 1807 | pass 1802 | fail 0
```

**Nothing in the repository catches it.** M-48's cell records this as an
`undetected-today gap`, the **AC-15 coverage census** in that spec gives M-48 the
`gap` limb, and both name this WP as the owner. Closing the gap is this WP's whole
content.

**Why the existing sweep did not catch it either.** PR #122's mutation sweep
recorded `M-48 RED (ok)` — but it ran M-48 in its **conjoined** pre-split form,
which also dropped N3's exclusion. N3 *is* tested, so the row went red on the half
that was covered. The split (PR #124) separated them and exposed the real state.

### The code

`src/core/dream/validate.js`, all line numbers read on 2026-07-28 and stated
content-first — if the content has moved but is present, that is drift and you
report it; if the content is absent, stop and say so.

- **The prune helper** — `pruneRedactedOriginals(stateDir, created)`, module-private.
  It reads `<stateDir>/quarantine/redacted/`, returns immediately when the file
  count is at or below the cap, filters to date-prefixed regular files **not** in
  `created`, sorts by `(mtimeMs, name)` ascending, and deletes from the front until
  the count is back at the cap. Every failure is swallowed — *"best-effort: a failed
  prune never fails the arm"*.
- **The call site, which is the subject of this WP** — a single statement after the
  loop over changed paths, under the comment `// Retention, once per run and only
  after a completed redaction.`:

  ```js
  if (secretRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);
  ```

- **The exclusion set** — `const redactedCreated = new Set();` declared before the
  loop with the comment *"every basename this run wrote into quarantine/redacted/"*,
  and filled inside the loop by `if (redactCopy) redactedCreated.add(redactCopy.name);`
  immediately after each successful redact-preserve. **The set is run-scoped; the
  call is post-loop. They are two independent facts, which is why the N2 mutation
  can be made without touching the set.**

### The tests that exist today

`tests/unit/dream-validate.test.js` holds five EP2 retention cases. Their exact
titles, so you can see what is already covered and not duplicate it:

| existing test title | holds |
|---|---|
| `EP2 retention: the prune evicts by (mtimeMs, name), not by filename alone` | **N4** — asserts *which* old files were deleted (`gone === seeded.slice(-11)`) |
| `EP2 retention: a run NEVER evicts its own copies, even when they are the oldest by both keys` | **N3** — the exclusion, against a skewed clock |
| `EP2 retention: above the cap, the cap YIELDS; a zero-redaction run leaves the overshoot` | **N5**, **N6** |
| `EP2 retention: above the cap from a FULL directory, the run keeps exactly its own copies` | **N5** |
| `EP2 retention: a B5/B5a fall-through never prunes, and the prune stays inside redacted/` | the fall-through rule, and the blast radius |

**None of them constrains the prune's timing**, which is the gap. The file's own
helpers you will reuse — `redactFixture()`, `seedNotes()`, `seedRedacted()`,
`lsRedacted()`, `RUN()`, `CAP` — are already in it; read them before writing.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/dream-validate.test.js | **Add exactly one test**, in the EP2 retention block beside the five above. It must go red under the N2-only mutation and green on unmodified `src/`. Change no existing test |
| modify | docs/specs/WP-ep2-retention-prune-timing-test.md | **This spec file — the `status:` transition ONLY** (`Draft` → `In-Review`, per Definition of done item 4). No other line of this file may change. *Listed explicitly rather than relied on as a convention: `docs/specs/_TEMPLATE.md` carries a self-file exception in a comment above its Deliverables table and this spec did not copy it, so a conforming implementer had a Definition-of-done item its permission boundary forbade. Making the row explicit is the smaller fix and it survives a reader who never opens the template* |
| modify | docs/specs/done/WP-secret-fence-ep2-redact-arm.md | **Two cells only.** **M-48**'s row: replace the `NOTHING — …` / `undetected-today gap` disposition with the name of the new test and the recorded run that reddens it. The **AC-15 coverage census** row for **M-48**: move its limb from `gap` to `executed` and record the same run. **Touch nothing else in that file** — it is `Done`, and its V-11/V-18/V-20/V-33 digests pin regions you must not enter |

**`src/` is NOT in this table.** If you find yourself editing `validate.js` to make
the test reachable, stop: the fault is already reachable (it is a one-line move of
an existing call), and a test that needs a production change to become possible is a
different WP.

## Exact contracts

**The mutation this test must catch, stated so there is no ambiguity.** Apply it
by hand to verify red, then revert:

1. Delete the post-loop statement `if (secretRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);`
2. Insert `pruneRedactedOriginals(stateDir, redactedCreated);` immediately after the
   `secretRedactions += 1;` line inside the B4 arm.

### The post-loop call-site checks — canonical, stated once

**Three assertions over `src/core/dream/validate.js`. Both the dispatch gate
(step 0d) and the new test's structural half run THESE; neither restates the
algorithm, because two hand-copied versions of one check are two checks that can
disagree.**

1. **Adjacency** — the guarded call `if (secretRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);`
   immediately follows its `Retention, once per run` comment; exactly one such
   adjacent pair.
2. **Uniqueness** — `pruneRedactedOriginals(stateDir, redactedCreated)` appears
   exactly once in the file.
3. **Scope** — the call's line is **after** the `scanTokens` loop's matching
   closing brace. Find the loop header, scan forward keeping a brace balance, take
   the first line where it returns to zero. **Derive that close TWICE — character
   balance, and line shape (only a trailing `{` opens, only a line-leading `}`
   closes) — and REFUSE if they disagree.**

**Why 3 exists, proven rather than argued.** Assertions 1 and 2 are both satisfied
by relocating the **comment and the call together** into a guard inside the loop
(`if (i >= scanTokens.length - 2) { … }`) — executed, and both returned 1 on a file
with N2 violated. The seam ordering holds there too. Only assertion 3 catches it.

**The honest limit of 3, stated and then checked.** Character brace-balance is
wrong in general for JS. Measured in this region today the only brace-bearing
literals are template interpolations — `` `HEAD:${rel}` `` and the
`${REDACTED_SUBDIR}` reason string — and `${…}` is self-balancing, so both
derivations agree (loop `1200..1331`, call `1333`). The cross-check is what turns
that from an assumption into something that will announce itself: add a bare `'{'`
literal and the methods diverge and the check blocks.

**`redactedCreated` is passed unchanged** — that is what makes this an N2-only
mutation. If your test also fails when only N3 is broken, it is not isolating N2 and
the existing N3 test already covers that.

**What the fixture must make observable.** Under per-call pruning, the prune runs
while `redactedCreated` holds only the copies made *so far*. The exclusion therefore
still protects them, so a fixture cannot show the difference in what the directory
ends up holding — it must make the prune **observably fire more than once**. That is
a statement about a seam, not about a final state, and the sweep recorded below is
why the distinction is load-bearing rather than stylistic.

**There is exactly ONE strategy, and the second one this spec used to offer was
removed because it is UNSATISFIABLE.**

- **Observational — the only form** — a seam on `pruneRedactedOriginals`'s directory
  read (`fs.readdirSync` on `<stateDir>/quarantine/redacted/`), asserting **two**
  things across a run that completes **three** redactions.

  **(1) CARDINALITY — the read happens exactly once.** Direct, independent of cap
  arithmetic, and not satisfiable by accident.

  **(2) ORDERING — the read happens AFTER the whole loop, and it is WITNESSED, not
  inferred from the count.** N2 says *once* **and** *after the loop over changed
  paths*; cardinality alone proves only the first half. **A call guarded to fire on
  the first redaction satisfies `count === 1` while running far too early** — before
  the later redactions have even created their copies — so the row would pass while
  the timing half is violated. That mutation is real enough to be an acceptance
  criterion of its own (**AC-3b**).

  **The witness, concretely, because "add an ordering assertion" is not
  implementable as advice.** The fixture carries a **trailing changed path that
  produces no redaction** — an ordinary note with added lines and no finding, named
  so it sorts **last** among the changed paths (e.g. `04-Atomic/zzz-trailing.md`;
  git emits `--name-status` in path order). The loop reaches that path and calls
  `git diff --cached --numstat -z -- <rel>` on it — **unconditionally, before any
  finding logic**, which is what makes it a reliable "the loop got here" event.

  **Both events are visible through seams this test file already uses.** Install ONE
  ordered event log written by two recorders — the `spawnPinnedSync` wrapper
  (`stubSpawn`, which the R7/R9/FI-19 cases already use) appending every git
  invocation with its args, and an `fs.readdirSync` patch appending the prune's read
  of `<stateDir>/quarantine/redacted/`. This is the three-method ordered-event-log
  technique **FI-15** already runs in this file; nothing new is needed. Then assert:

  - **(a1) cardinality** — the log holds **exactly one** prune-read event;
  - **(a2) ordering, anchored on the trailing path's LAST git event** — the prune
    read's index is **greater than** the index of the trailing path's
    `git diff --cached -U0 -- <rel>`, **not its `numstat`**. *Read from source
    (`src/core/dream/validate.js`): for a path with added lines and no finding the
    iteration runs `numstat` → `-U0` → `scanAndRedact` → `continue`, so `numstat`
    marks the **start** of the last iteration and `-U0` is its last GIT event. An
    ordering anchored on `numstat` is satisfied by a prune that runs late **inside**
    that same iteration, which is not "after the loop" at all;*
  - **(a3) the trailing path's `-U0` is the last per-path git event in the log** —
    asserted as a **precondition**, so a fixture whose paths emerged in an
    unexpected order fails loudly instead of proving nothing. *Stated as "last
    **git** event" deliberately: `scanAndRedact` does follow `-U0` inside the
    iteration and is invisible to the spawn log, which is exactly why (a) is
    necessary and NOT sufficient — see (b).*

  **(b) THE SUFFICIENCY HALF — the structural, source-level assertion, and it must
  be BRACE-AWARE.** The seam cannot distinguish "after the loop" from "late inside
  the final iteration", because after the trailing path's `-U0` there is no further
  git event to order against. So the test **also** reads `validate.js` and asserts
  its structure. **Three assertions, and the third is the one that matters:**

  1. the guarded call **immediately follows** its `Retention, once per run` comment;
  2. `pruneRedactedOriginals(stateDir, redactedCreated)` occurs **exactly once**;
  3. **the call's line is AFTER the `scanTokens` loop's matching closing brace.**

  *Assertions 1 and 2 are not sufficient and this was proven, not argued. Relocate
  the COMMENT AND THE CALL TOGETHER into a last-path guard inside the loop —
  `if (i >= scanTokens.length - 2) { <comment> <call> }` — and adjacency still reads
  1, the file-wide count still reads 1, and the seam ordering still holds because
  the prune fires after the trailing path's last git event. **Executed: both old
  checks returned 1, i.e. PASS, on a file with N2 violated.** Only assertion 3
  catches it.*

  **The three assertions are the canonical post-loop call-site checks defined
  under "Exact contracts" — run them, do not restate them.** The dispatch gate
  (step 0d) runs the same three against main's copy; a check written out twice is
  two checks that can drift, which is the defect this whole work package's parent
  spec keeps recording.

  Assert all three inside the test — a precondition that only runs at dispatch does
  not protect the test from a later refactor.

  **Which half catches which mutation family — record this, because the two are not
  interchangeable:**

  | mutation family | caught by |
  |---|---|
  | prune fires **early** — in the loop, or guarded to the first redaction (**AC-3b**) | **(a2)** — the prune read precedes the trailing path's `-U0` |
  | prune fires **more than once** — per call, unguarded | **(a1)** — cardinality |
  | prune fires **once, late inside the FINAL iteration** — after the trailing `-U0` | **(b) ONLY.** (a) is blind to it by construction: there is no later git event to be after |
  | the call is **duplicated**, one post-loop and one in-loop | **(a1)** and **(b)**'s occurs-exactly-once |

**The removed option, and why removing it is the point.** Until 2026-07-28 this
spec also offered a *consequential* strategy — "a fixture seeded to the cap where a
per-call prune evicts a pre-existing copy that a per-run prune would keep". **No
such fixture exists.** With the exclusion set passed unchanged (which is what makes
the mutation N2-*only*), every prune protects every copy created so far, both
orderings draw deletions from the same pre-existing pool in the same
`(mtimeMs, name)` order, and both stop at the cap or when candidates run out — so
the **final states converge for every fixture**. An implementer who picked the
documented option would have been asked for something that cannot be built.

*Proven by execution, 2026-07-28, not argued.* A faithful model of
`pruneRedactedOriginals` was driven under both orderings across **23,505**
configurations — caps 3/5/12/50, seeded copies 0…cap+6, run sizes 0…cap+4, three
`mtimeMs` regimes (monotone, all-tied, reversed against name order), plus
non-date-prefixed files that inflate the total but are never candidates, plus a run
copy whose basename collides with a pre-existing one. **Final-state differences
found: 0.** The runs are recorded in PR #124's round-10 disposition.

**What survives is the reason the observational seam is the right one anyway:** N2
is a statement about *how many times something runs*, and a property of the call
count is not visible in the final state at all. Assert the thing the row is about.

## Contract reference

**N/A — this WP states no new contract.** Table N already decides N1–N7 and this WP
adds a test for **N2** as that table already states it. Under ADR-0031's 2-of-7
activation test, zero conditions fire: no shape, taxonomy, parsing, error-path,
authority-boundary, downstream-consumer or multi-mirror change. The two Deliverables
cells above are the only surfaces that mirror the outcome, and they are named.

*Row **A1** of ADR-0036 — `Proposed`, unsigned, and cited here as a proposal and
never as authority — asks a mutation row to name the assertion that fires only
inside the produced cell. The M-48 cell you update should do that: name the test,
the assertion and the counts, not a verdict.*

## Implementation notes & constraints

- **Never run the suite as root**, and never run bare `node --test` — `tests/run.js`
  is the only place `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set.
- The retention fixtures are the slow ones (a 51-note run is several seconds of git
  spawns). Budget for it; do **not** shrink the existing fixtures to speed yours up.
- **Restore `src/` after every mutation run and verify the tree is clean** before
  committing. A mutation driver that edits `src/` in place makes the working tree
  lie for the duration.
- When uncertain: choose the simpler option and record it under "Decisions made".

## Acceptance criteria

- [ ] **AC-1** `tests/unit/dream-validate.test.js` gains **exactly one** test, and
      no existing test in that file changes. Verified by the diff.
- [ ] **AC-2** The new test **passes** against unmodified `src/`.
- [ ] **AC-3** The new test **fails** under the N2-only mutation stated in "Exact
      contracts", applied and reverted by hand, with the output pasted into the PR.
- [ ] **AC-3c** The new test **fails** under the **late-in-final-iteration**
      mutation: one call, fired once, placed inside the loop **after** the
      trailing path's `-U0` diff (e.g. guarded to run on the last changed path).
      **The seam cannot see this one** — cardinality is 1 and the prune still
      follows every git event the log contains — so it must be caught by the
      structural assertion **(b)**. *This criterion is what makes (b) load-bearing
      rather than belt-and-braces; without it the sufficiency half is untested and
      the test proves only what the seam can see.*
- [ ] **AC-3b** The new test **fails** under the **timing-only** mutation that
      preserves cardinality: move the single call inside the loop and guard it to
      fire on the **first** completed redaction only (e.g. `if (secretRedactions === 1)`),
      so `fs.readdirSync` is still entered exactly once. **This is the mutation
      cardinality cannot see** — the count assertion stays green and the ordering
      assertion must go red. Paste both runs. *Without this criterion the
      observational seam proves only half of N2, which states once **and** after the
      loop.* **The premise is proven at the EVENT level, not merely modelled:** the
      round-12 review instrumented the real flow and observed that the timing-only
      mutation produces `NUMSTAT` / `PRUNE_READ` event streams with **identical
      cardinality and violated ordering** — exactly the pair of properties this
      criterion separates, and the reason a count assertion alone would ship green.
- [ ] **AC-4** The new test still **passes** under the N3-only mutation (drop
      `&& !created.has(e.name)`), demonstrating it isolates N2 rather than
      re-testing the exclusion the second existing test already holds.
- [ ] **AC-5** `npm test` and `npm run lint` pass.
- [ ] **AC-6** **M-48's mutation row and its AC-15 census row are extracted
      SEPARATELY, and each is asserted on its own.** In each extracted row: the new
      test's title occurs **exactly once**; the AC-3 pass/fail counts are present; the
      census row's **limb CELL equals `executed`**; and the mutation row no longer
      **states** the gap (the exact phrases `undetected-today gap` and its
      `NOTHING — AND THAT IS THE POINT` disposition are absent). **Both directions are proven, not one**: the step is run on the untouched tree
      (expect red — non-vacuity) **and** on hand-constructed expected post-work
      rows that include a history-recounting sentence (expect green — not
      over-strict) **and that V-30 itself accepts** (step 5g splices them into a
      copy of the ep2 spec and runs the gate over it). *That last part is what
      stops AC-6 and V-30 drifting apart: an earlier draft's fixture carried the
      counts but no literal `RED`, so it satisfied AC-6 and would have failed the
      mandatory gate two steps later.* *Red-before-work and rejects-the-right-answer look identical
      from one side, which is how an earlier draft of this step shipped a
      bare-word ban that rejected the very sentence this criterion recommends.*
      **Prose that recounts the history stays legal** — a row saying "this recorded an undetected
      gap until this WP closed it" is what *should* be written, and a check that
      forbade the word would be stricter than the contract it guards. *A whole-file grep cannot do this
      job and the earlier draft of this criterion tried: the routed slug already
      occurs in both cells, so counting it proves nothing; a bare count with no
      expected value passes on any number; and a negative grep for
      `undetected-today gap` over the file would clear a census row whose limb was
      never moved off `gap`, because that phrase lives in the mutation cell and the
      limb lives in the census. **Extract each row, assert each row.***

## Verification steps (run these; paste output in the PR)

```bash
# 0. THE DISPATCH BLOCKER, AND IT MUST BE RUN FIRST.
#    ANY FAILURE HERE BLOCKS DISPATCH. Do not start, do not work around it,
#    report it and stop.
#
#    EVERY CHECK BELOW READS AUTHORITATIVE MAIN, NEVER YOUR CHECKOUT. That is the
#    whole shape of this step and it is not a detail: a dispatcher standing on a
#    stale or topic branch would otherwise get a green record describing a tree the
#    implementer will never see — the revision-skew failure the dispatch rule in
#    `docs/runbooks/codex-review.md` exists to prevent, reproduced inside the gate
#    that cites it. *Demonstrated on the authoring checkout: HEAD `8868b80`,
#    `origin/main` `5f0ffc0`, and the census grep printed "on main" while main did
#    not contain it.*
SPEC=docs/specs/done/WP-secret-fence-ep2-redact-arm.md
V=src/core/dream/validate.js
T=tests/unit/dream-validate.test.js

# 0a. RESOLVE AUTHORITATIVE MAIN. `origin/main` is the authority, not a local
#     `main` branch, because a local `main` can lag with no signal and it is
#     `origin/main` that CI merges into.
git fetch --quiet origin main || {
  echo "BLOCKED: cannot reach origin. This gate cannot be satisfied offline —"
  echo "         every claim below is about main, not about your checkout."; exit 1; }
MAIN=$(git rev-parse origin/main)
echo "dispatch SHA (origin/main): $MAIN"
#     RECORD THAT SHA IN THE DISPATCH MESSAGE, and start the implementer worktree
#     from it — both are required by the dispatch rule in the codex-review runbook.

# 0b. IS PR #124 ACTUALLY ON MAIN? Asked of main's content, not of your files.
#     CONTENT is the authority here rather than commit ancestry: a squash-merge
#     would break `merge-base --is-ancestor <branch sha> origin/main` while the
#     content this WP depends on is present and correct. Ancestry answers "was that
#     commit merged"; content answers "is the thing I need there", which is the
#     question. (`git merge-base --is-ancestor` remains a fine extra check on a repo
#     that never squashes; this one merges with merge commits today, so both would
#     pass — content is chosen because it stays true if that ever changes.)
git show "$MAIN:$SPEC" | grep -q '^### AC-15 coverage census' || {
  echo "BLOCKED: the AC-15 coverage census is NOT on origin/main ($MAIN)."
  echo "         PR #124 has not merged. Do not start this WP."; exit 1; }

# 0c. The census must still carry M-48 on the 'gap' limb ON MAIN — i.e. nobody has
#     done this work already. Cell equality, not a substring.
limb=$(git show "$MAIN:$SPEC" | grep -m1 '^| \*\*M-48\*\* |' | awk -F'|' '{gsub(/[* ]/,"",$3); print $3}')
test "$limb" = "gap" || {
  echo "BLOCKED: on main the census limb for M-48 is '$limb', expected 'gap'."
  echo "         Either this work is already done or the census moved."; exit 1; }
echo "ok: PR #124 is on main and the gap is still open"

#     Materialize main's copies of the two files every later check reads.
MV=$(mktemp -t validate); MT=$(mktemp -t dvtest)
git show "$MAIN:$V" > "$MV"
git show "$MAIN:$T" > "$MT"

# 0d. THE CALL-SITE STRUCTURE, all three assertions, run against MAIN's copy.
#     These are the canonical post-loop call-site checks defined once under
#     "Exact contracts" — this step and the new test's structural half BOTH run
#     them, and neither restates the algorithm. **Assertion 3 is not optional and
#     is not redundant**: adjacency and occurs-once are both satisfied by moving
#     the comment and the call TOGETHER into a guard inside the loop, which is
#     exactly the regression this WP targets.
node - "$MV" <<'LOOPCHK'
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const CALL = 'if (secretRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);';
const fail = (m) => { console.error('BLOCKED: ' + m); process.exit(1); };

// (1) adjacency: the guarded call immediately follows its comment.
let adj = 0;
for (let i = 1; i < lines.length; i++) {
  if (/Retention, once per run/.test(lines[i - 1]) && lines[i].includes(CALL)) adj++;
}
if (adj !== 1) fail(`the guarded call does not immediately follow its "Retention, once per run" comment (${adj} adjacent occurrences, want 1).`);

// (2) exactly one call site in the whole file.
const n = lines.filter((l) => l.includes('pruneRedactedOriginals(stateDir, redactedCreated)')).length;
if (n !== 1) fail(`pruneRedactedOriginals is called ${n} times, want exactly 1. A second call site is the per-call form.`);

// (3) the call is AFTER the scanTokens loop's matching closing brace.
const hdr = lines.findIndex((l) => /for \(let i = 0; i < scanTokens\.length; i\+\+\) \{/.test(l));
if (hdr < 0) fail('the scanTokens loop header is not where this spec says it is.');
const callIdx = lines.findIndex((l) => l.includes(CALL));
let d = 0, closeA = -1;
for (let i = hdr; i < lines.length; i++) {
  for (const ch of lines[i]) { if (ch === '{') d++; else if (ch === '}') d--; }
  if (d === 0) { closeA = i; break; }
}
let e = 0, closeB = -1;
for (let i = hdr; i < lines.length; i++) {
  if (/\{\s*$/.test(lines[i])) e++;
  if (/^\s*\}/.test(lines[i])) { e--; if (e === 0) { closeB = i; break; } }
}
if (closeA < 0 || closeB < 0) fail("could not find the loop's closing brace.");
if (closeA !== closeB) fail(`the two brace derivations disagree (char=${closeA + 1}, line-shape=${closeB + 1}). An unbalanced brace inside a string literal or comment is the usual cause. This check REFUSES rather than guessing — report it.`);
if (callIdx <= closeA) fail(`the prune call is at line ${callIdx + 1}, INSIDE the scanTokens loop (header ${hdr + 1}, closes ${closeA + 1}). N2 requires it after the loop. Adjacency and once-file-wide are both satisfiable from inside the loop — this is the check that is not.`);
console.log(`ok: loop ${hdr + 1}..${closeA + 1}, prune call at ${callIdx + 1} — after the loop, both derivations agree`);
LOOPCHK

grep -q 'every basename this run wrote into' "$MV" || {
  echo "BLOCKED: the run-scoped exclusion set's declaration is gone from main."; exit 1; }

# 0e. THE TEST BASELINE, BY EXACT TITLE, on main's copy. A count of five is also
#     satisfied by five DIFFERENT tests — including an N2 test somebody already
#     added under another name, which would dispatch you to redo existing work.
while IFS= read -r want; do
  n=$(grep -c -F "$want" "$MT")
  test "$n" = "1" || {
    echo "BLOCKED: on main, expected exactly 1 test titled:"; echo "           $want"
    echo "         found $n. The baseline this spec was written against has moved."
    echo "         STOP AND REPORT."; exit 1; }
done <<'TITLES'
EP2 retention: the prune evicts by (mtimeMs, name), not by filename alone
EP2 retention: a run NEVER evicts its own copies, even when they are the oldest by both keys
EP2 retention: above the cap, the cap YIELDS; a zero-redaction run leaves the overshoot
EP2 retention: above the cap from a FULL directory, the run keeps exactly its own copies
EP2 retention: a B5/B5a fall-through never prunes, and the prune stays inside redacted/
TITLES
t=$(grep -c 'EP2 retention:' "$MT")
test "$t" = "5" || {
  echo "BLOCKED: on main, found $t 'EP2 retention:' tests, want exactly 5 — a SIXTH exists."
  echo "         Somebody may already have written this WP's test. STOP AND REPORT."; exit 1; }

for h in 'function redactFixture(' 'const RUN =' 'const lsRedacted =' \
         'const CAP = 50;' 'function seedRedacted(' 'function seedNotes('; do
  grep -qF "$h" "$MT" || {
    echo "BLOCKED: the helper '$h' this spec builds on is gone from main's $T."
    echo "         STOP AND REPORT — do not re-create it."; exit 1; }
done
rm -f "$MV" "$MT"
echo "ok: call site, exclusion set, the 5 exact titles and the 6 helpers — all as stated, ON MAIN"

# 0f. THE CENTRAL CURRENT-STATE CLAIM, EXECUTED — not read, not trusted.
#     This spec's whole reason to exist is "the isolated N2 mutation reddens
#     nothing". That claim was executed on 2026-07-28 and it is executable by
#     construction, so the dispatch rule this repo adopted (re-run every EXECUTABLE
#     current-state claim) makes running it here mandatory rather than optional.
#     If it has stopped being true, somebody has already given N2 a detector and
#     this WP is either done or has changed shape.
#
#     WHY A dispatch STEP MAY WRITE TO src/ AT ALL, stated rather than assumed:
#     it writes only under `git` supervision, it refuses to run unless the file is
#     already clean, it restores with `git checkout --`, and it verifies the
#     restore by BLOB HASH before continuing. Nothing is left behind and nothing
#     uncommitted can be destroyed. A probe that cannot meet those four conditions
#     does not belong in a dispatch step; this one does.
git diff --quiet -- "$V" && git diff --cached --quiet -- "$V" || {
  echo "BLOCKED: $V has uncommitted changes. This probe restores with"
  echo "         'git checkout --', which would destroy them. Commit or stash first."
  exit 1; }
DEPLOYED_BEFORE=$(git hash-object "$V")
#     The worktree is cut from `$MAIN` (resolved in step 0a), NOT from HEAD. Cutting
#     from HEAD probes whatever branch the dispatcher happens to stand on, which is
#     the same skew step 0 exists to close — and it would report a green central
#     claim about a tree the implementer will never see.

#     ISOLATION: THE PROBE NEVER WRITES TO THIS TREE. It runs in a disposable
#     `git worktree`, and that is a safety requirement rather than a preference.
#     **This checkout is what the deploy symlink resolves to.** A probe that
#     mutates `validate.js` here opens a window in which (a) the SCHEDULED DREAM
#     can fire and LOAD the mutation into a real run — per-call prune timing
#     against a real vault's quarantine copies, irreversible — and (b) a SIGKILL
#     or a power loss strands it beyond the reach of any trap. Traps cannot close
#     either one; not touching the live tree closes both by construction.
#     *An earlier draft of this spec used traps on an in-place edit and justified
#     it with "the worktree variant could not be executed here". That was wrong:
#     what had failed was a single compound shell command rejected by the author's
#     own tooling for its SHAPE, with the rejection literally saying to break it
#     into separate commands — which was never retried. Re-examined and executed in
#     round 14: `git worktree add --detach` works from any checkout, and the
#     retention suite runs in a BARE worktree with NO `node_modules` at all
#     (`tests/run.js` shells `node --test`; nothing on this path imports the
#     project's one runtime dependency), so no install step is needed. Measured,
#     not assumed.*
WTBASE=$(mktemp -d)
WT="$WTBASE/probe"
OUT=$(mktemp -t n2probe)

#     Cleanup is NOT suppressed. A worktree left behind is inert — the deployed
#     tree was never written — but a cleanup failure you did not NOTICE is how
#     "cleaned up" becomes a false report.
cleanup() {
  if [ -d "$WT" ]; then
    git worktree remove --force "$WT" || {
      echo "FATAL: could not remove the probe worktree at $WT."
      echo "       It is INERT — the deployed tree was never written — but remove"
      echo "       it by hand before continuing."
      rm -f "$OUT"; exit 3; }
  fi
  rm -rf "$WTBASE"; rm -f "$OUT"
}
trap 'cleanup; echo "PROBE INTERRUPTED — nothing in the deployed tree was ever written"; exit 130' INT TERM
trap cleanup EXIT

git worktree add --detach "$WT" "$MAIN" >/dev/null    # MAIN, never HEAD

#     `set +e` MUST COVER THE MUTATION HEREDOC TOO, not just the test run. Under
#     this block's `set -euo pipefail` a python exiting 1 would kill the script
#     BEFORE `probe_applied=$?`, making the anchor-miss diagnosis below unreachable
#     dead text — a `must_not` the parent spec's gate-polarity preamble names.
set +e
python3 - "$WT/$V" <<'MUT'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
call = '  if (secretRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);'
inc  = '          secretRedactions += 1; // increments LAST, only after the scrub is staged'
if s.count(call) != 1 or s.count(inc) != 1:
    print('PROBE-ANCHOR-MISS'); sys.exit(1)
s = s.replace(call + '\n', '')
s = s.replace(inc, inc + '\n          pruneRedactedOriginals(stateDir, redactedCreated);')
open(p, 'w', encoding='utf-8').write(s)
MUT
probe_applied=$?

#     THE COMPLETE SUITE, not one file. This spec's Current-state claim is
#     repository-wide — "the isolated N2 mutation reddens NOTHING" — and a run
#     scoped to one file's `EP2 retention` prefix cannot support it. **Decided by
#     measurement, round 15: the full 1807-test suite runs in a BARE worktree in
#     46 seconds** (`node tests/run.js`, no `node_modules`, no install). That is
#     affordable for a dispatch step, so the honest form is the one that ships and
#     the claim needs no narrowing.
( cd "$WT" && node tests/run.js ) >"$OUT" 2>&1
probe_exit=$?
set -e

test "$probe_applied" = "0" || {
  echo "BLOCKED: the probe's anchors are gone — the code this spec describes has moved."
  echo "         STOP AND REPORT."; exit 1; }
test "$probe_exit" = "0" || {
  echo "BLOCKED: the N2-only mutation REDDENED something. This spec's central"
  echo "         Current-state claim ('N2 has no detector') is no longer true:"
  sed -n '1,40p' "$OUT"
  echo "         Somebody has given N2 a detector. STOP AND REPORT — this WP is"
  echo "         either already done or has changed shape."; exit 1; }
echo "ok: the isolated N2 mutation still reddens nothing, ACROSS THE WHOLE SUITE"

#     And the deployed tree is asserted untouched. It should be impossible for it
#     to have changed; assert it anyway, because "impossible by construction" is
#     the class of claim this whole work package exists to stop trusting.
DEPLOYED_AFTER=$(git hash-object "$V")
test "$DEPLOYED_BEFORE" = "$DEPLOYED_AFTER" || {
  echo "FATAL: the DEPLOYED $V changed during the probe. It should never have been"
  echo "       written at all. Investigate before running anything else."; exit 2; }
echo "ok: deployed tree byte-identical throughout ($DEPLOYED_AFTER)"

# 1. AC-2 — green on unmodified src/
node tests/run.js --test-name-pattern "EP2 retention" tests/unit/dream-validate.test.js

# 2. AC-3 — apply the N2-only mutation by hand, then:
node tests/run.js --test-name-pattern "EP2 retention" tests/unit/dream-validate.test.js
#    Expect: the new test FAILS and the other five still pass. Revert src/ and
#    confirm `git status --short` shows no source file.

# 3b. AC-3b — the TIMING-ONLY mutation: move the call inside the loop AND guard it
#     to fire once (`if (secretRedactions === 1)`), so cardinality is preserved.
#     Expect: the cardinality assertion still passes, the ORDERING assertion FAILS.
#     If your test stays green here, it is asserting a count and calling it timing.
#     Revert src/ and confirm `git status --short` shows no source file.
node tests/run.js --test-name-pattern "EP2 retention" tests/unit/dream-validate.test.js

# 3c. AC-3c — the LATE-IN-FINAL-ITERATION mutation. One call, fired once, moved
#     inside the loop AFTER the trailing path's -U0 — e.g. relocate the comment and
#     the call together into a last-path guard:
#         if (i >= scanTokens.length - 2) {
#           // Retention, once per run and only after a completed redaction.
#           if (secretRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);
#         }
#     Expect: the CARDINALITY assertion passes (still one prune read), the SEAM
#     ORDERING assertion passes (the prune still follows the trailing path's last
#     git event), and the STRUCTURAL assertion (b3) FAILS — "the prune call is at
#     line N, INSIDE the scanTokens loop". If your test goes green here, its
#     structural half is not brace-aware and (b) is decorative.
node tests/run.js --test-name-pattern "EP2 retention" tests/unit/dream-validate.test.js
#     Revert src/ and confirm `git status --short` shows no source file.

# 3. AC-4 — apply the N3-only mutation by hand, then the same command.
#    Expect: the SECOND existing test fails and YOUR test still passes.
#    Revert src/ and confirm the tree is clean.

# 4. AC-5
npm test
npm run lint

# 5. AC-6 — the two documentation cells, EXTRACTED SEPARATELY and asserted
#    separately. Set TITLE to the exact title of the test you added.
SPEC=docs/specs/done/WP-secret-fence-ep2-redact-arm.md
TITLE='<the exact title of your new test>'
COUNTS='<the exact pass/fail counts your AC-3 run printed, e.g. "pass 5, fail 1">'
# GUARD BOTH, AND GUARD THEM LOUDLY. `COUNTS` was referenced by 5c and never
# assigned at all until round 9 — and an unset or empty COUNTS turns
# `grep -qF "$COUNTS"` into an EMPTY-PATTERN match, which matches every line, so
# the assertion passes on any tree in silence. That is a worse polarity than a
# false red: this repo's logbook records an unbound `$ADR` producing five false
# REDs, which at least announced itself. A silent green does not.
: "${TITLE:?set TITLE to the exact title of the test you added}"
: "${COUNTS:?set COUNTS to the exact pass/fail counts your AC-3 run printed}"
case "$TITLE"  in *'<the exact'*) echo "FAIL: TITLE is still the placeholder";  exit 1;; esac
case "$COUNTS" in *'<the exact'*) echo "FAIL: COUNTS is still the placeholder"; exit 1;; esac

# 5a. the MUTATION row: the one line beginning with the M-48 cell in the
#     "Mutation checks" table (the LAST of the two M-48 lines in the file).
grep -n '^| \*\*M-48\*\* |' "$SPEC" | tail -1 | cut -d: -f1 \
  | xargs -I{} sed -n '{}p' "$SPEC" > /tmp/m48-mutation-row.txt
# 5b. the CENSUS row: the FIRST of the two, inside the AC-15 coverage census.
grep -n '^| \*\*M-48\*\* |' "$SPEC" | head -1 | cut -d: -f1 \
  | xargs -I{} sed -n '{}p' "$SPEC" > /tmp/m48-census-row.txt

# 5c. BOTH rows: the new test is named exactly once and the AC-3 counts are there.
for f in /tmp/m48-mutation-row.txt /tmp/m48-census-row.txt; do
  echo "--- $f"
  test -s "$f"            || { echo "FAIL: row extracted EMPTY — the anchor moved"; exit 1; }
  n=$(grep -c -F "$TITLE" "$f" || true)
  test "$n" = "1"         || { echo "FAIL: test title occurs $n times, want exactly 1"; exit 1; }
  grep -qF "$COUNTS" "$f" || { echo "FAIL: the AC-3 counts ($COUNTS) are absent"; exit 1; }
  echo "ok: names the test once, carries the counts"
done

# 5d. The CENSUS row ONLY: the limb is a CELL, so assert the cell, case-folded.
limb=$(awk -F'|' '{gsub(/[* ]/,"",$3); print tolower($3)}' /tmp/m48-census-row.txt)
test "$limb" = "executed" || { echo "FAIL: census limb is '$limb', want 'executed'"; exit 1; }
echo "ok: census limb cell = executed"

# 5e. The MUTATION row ONLY: it must no longer STATE the gap. Two exact phrases.
grep -qF 'undetected-today gap' /tmp/m48-mutation-row.txt \
  && { echo "FAIL: mutation row still states 'undetected-today gap'"; exit 1; }
grep -qF 'NOTHING — AND THAT IS THE POINT' /tmp/m48-mutation-row.txt \
  && { echo "FAIL: mutation row still carries the no-detector disposition"; exit 1; }
echo "ok: mutation row no longer states the gap"

#    FOUR THINGS ABOUT THIS STEP, all decided rather than incidental.
#    (i) POLARITY. The two `grep -q … && { … exit 1; }` lines fail on PRESENCE.
#        Under `set -e` a bare failing grep would abort the step, so each is a
#        printing branch — the trap the parent spec's gate-polarity preamble records.
#    (ii) NO BARE-WORD BAN. An earlier draft rejected the word `gap` anywhere in
#        either row. That forbids honest history: a row reading "this recorded an
#        undetected gap until this WP closed it" is exactly what SHOULD be written,
#        and it is the sentence AC-6 itself recommends. A check stricter than the
#        contract it guards is drift in the direction that reads like rigour.
#    (iii) LIMB IS CENSUS-ONLY AND CASE-FOLDED. The mutation row carries no
#        lowercase `executed` today and is not required to gain one; only the
#        census carries a limb. `tolower` because neighbouring cells are mixed
#        case, and cell EQUALITY — not a substring search — is the assertion.
#    (iv) COUNTS. Set COUNTS to what your AC-3 run actually printed. Do not paste
#        a figure you did not observe — and note the guard at the top of this step
#        exists because an UNSET COUNTS makes `grep -qF "$COUNTS"` an empty-pattern
#        match that matches everything. The failure mode of a forgotten variable
#        here is a SILENT GREEN, not a red, so it is guarded rather than trusted.

# 5f. THE SECOND-DIRECTION PROOF — run this BEFORE you edit the real spec.
#     Red-before-work proves a gate is not vacuous. It does NOT prove the gate is
#     not OVER-STRICT: a check that rejects the correct answer is also red before
#     the work and looks identical from that side. So construct the expected
#     post-work rows by hand and assert the step goes GREEN on them.
mkdir -p /tmp/second-direction
#     Write the two rows you INTEND to ship — including a sentence that recounts
#     the history, which is the case an over-strict check would reject:
#     BOTH ROWS MUST CARRY A LITERAL `RED`. V-30's `executed` limb requires a
#     POSITIVE failure count AND a named reddened target; a fixture with counts but
#     no `RED` passes step 5 and then fails step 6, which is the contradiction the
#     round-13 review found in an earlier draft of this spec.
cat > /tmp/second-direction/census-row.txt <<'ROW'
| **M-48** | **executed** | Closed by the new test. `<TITLE>` goes **RED** under the isolated N2-only mutation, `<COUNTS>`. This row recorded an undetected gap until this WP landed |
ROW
cat > /tmp/second-direction/mutation-row.txt <<'ROW'
| **M-48** | **prune per call instead of per run** — the call moved into the B4 loop, accumulated set unchanged. Violates **Table N row N2** and nothing else | **`<TITLE>`**, which goes **RED** under it — `<COUNTS>`. *This row recorded an executed no-detector gap until this WP closed it* |
ROW
#     Substitute your real TITLE/COUNTS into both, then re-run 5c/5d/5e against
#     these two files instead of the extracted ones. EXPECT: every assertion ok.

# 5g. AND RUN V-30 AGAINST THE SAME FIXTURE — this is what keeps step 5 and step 6
#     from ever diverging again. Build a whole copy of the ep2 spec with your two
#     intended rows spliced in, and run its V-30 block against that copy. The GATE
#     validates the fixture, so "my rows satisfy AC-6" and "my rows satisfy V-30"
#     stop being two independent claims.
python3 - <<'SPLICE'
import re
SRC = 'docs/specs/done/WP-secret-fence-ep2-redact-arm.md'
cen = open('/tmp/second-direction/census-row.txt', encoding='utf-8').read().strip()
mut = open('/tmp/second-direction/mutation-row.txt', encoding='utf-8').read().strip()
s = open(SRC, encoding='utf-8').read().split('\n')
top = next(i for i, l in enumerate(s) if l.startswith('### AC-15 coverage census'))
idx = [i for i in range(top, len(s)) if re.match(r'^\| \*\*M-48\*\* \|', s[i])]
assert len(idx) == 2, idx
s[idx[0]] = cen      # the census row comes first in the file
s[idx[1]] = mut
open('/tmp/second-direction/postwork.md', 'w', encoding='utf-8').write('\n'.join(s))
SPLICE
#     …then extract the V-30 block from the ep2 spec exactly as step 6 does and run
#     it against /tmp/second-direction/postwork.md. EXPECT exit 0.
#     If any of 5c–5g fails, the STEP or the FIXTURE is wrong and not your work —
#     fix it and say so in the PR under "Decisions made".

# 6. The Done spec's own gates must stay green — you are editing inside them.
#    Extract and run V-30 and V-31 from that spec's Verification steps, and
#    recompute its four pinned digests (V-11, V-18, V-20, V-33). None may move.
```

## Out of scope (do NOT do these)

- **Do not edit `src/`.** The N2 behaviour is correct as shipped; only its test is
  missing.
- **Do not add tests for N1, N3, N4, N5 or N6** — all five already have cases, listed
  in Current state.
- **Do not re-run or re-record the other 36 mutation rows.** The AC-15 census marks
  them `swept` with their verdicts inherited from PR #122 and is explicit that this
  is not a claim they would still redden today. Re-establishing them is a separate
  sweep and a separate WP.
- **Do not touch any other part of `WP-secret-fence-ep2-redact-arm.md`** — two cells,
  named above.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **all THREE mutation runs** — **AC-3** (the N2-only mutation), **AC-3b** (the
   timing-only mutation that preserves cardinality) and **AC-3c** (the
   late-in-final-iteration mutation) — plus **AC-4**'s N3-only control run, and the
   clean `git status` after each. *Round 15 corrected this item, which said "both
   mutation runs" while the criteria required three: a count in prose drifted the
   moment a third criterion was added, which is the same defect class as the
   registration sentences that stated a number instead of a list.*
2. Conventional commits; PR titled `test(dream): … (WP-ep2-retention-prune-timing-test)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

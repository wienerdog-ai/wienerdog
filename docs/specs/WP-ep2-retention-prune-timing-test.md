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

**`redactedCreated` is passed unchanged** — that is what makes this an N2-only
mutation. If your test also fails when only N3 is broken, it is not isolating N2 and
the existing N3 test already covers that.

**The shape of a fixture that discriminates.** Under per-call pruning, the prune
runs while `redactedCreated` holds only the copies made *so far*. The exclusion
therefore still protects them, so a fixture must make the prune **observably fire
more than once**. Two shapes work and either is acceptable; pick one and say which
in the PR:

- **Observational** — a counting seam on `pruneRedactedOriginals`'s directory read
  (`fs.readdirSync` on `<stateDir>/quarantine/redacted/`), asserting it is entered
  **exactly once** across a run that completes **three** redactions. This is a
  direct assertion of N2 and does not depend on cap arithmetic.
- **Consequential** — a fixture seeded to the cap where the run completes several
  redactions, arranged so a per-call prune evicts a **pre-existing** copy that a
  per-run prune would keep. This asserts the user-visible consequence but is
  sensitive to N5's yields-precedence, so check it against the third existing test
  before relying on it.

**Prefer the observational form.** It is what the row is about, it cannot be
satisfied by accident, and its assertion names the fact directly.

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
      over-strict). *Red-before-work and rejects-the-right-answer look identical
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
#    report it and stop — the two cells this WP edits do not exist yet.
SPEC=docs/specs/done/WP-secret-fence-ep2-redact-arm.md

# 0a. The AC-15 coverage census must exist. It arrived in PR #124; before that
#     merge this grep finds nothing and this step is RED, which is the point.
grep -q '^### AC-15 coverage census' "$SPEC" || {
  echo "BLOCKED: the AC-15 coverage census is not in $SPEC."
  echo "         PR #124 has not merged. Do not start this WP."; exit 1; }

# 0b. The census must still carry M-48 on the 'gap' limb — i.e. nobody has done
#     this work already. Cell equality, not a substring.
limb=$(grep -m1 '^| \*\*M-48\*\* |' "$SPEC" | awk -F'|' '{gsub(/[* ]/,"",$3); print $3}')
test "$limb" = "gap" || {
  echo "BLOCKED: the census limb for M-48 is '$limb', expected 'gap'."
  echo "         Either this work is already done or the census moved."; exit 1; }
echo "ok: PR #124 is on main and the gap is still open"

# 0c. Now the code and test claims this spec makes. Same rule: a miss stops you.
grep -n 'Retention, once per run' src/core/dream/validate.js
grep -n 'every basename this run wrote into' src/core/dream/validate.js
grep -c 'EP2 retention:' tests/unit/dream-validate.test.js     # expect 5 before your change

# 1. AC-2 — green on unmodified src/
node tests/run.js --test-name-pattern "EP2 retention" tests/unit/dream-validate.test.js

# 2. AC-3 — apply the N2-only mutation by hand, then:
node tests/run.js --test-name-pattern "EP2 retention" tests/unit/dream-validate.test.js
#    Expect: the new test FAILS and the other five still pass. Revert src/ and
#    confirm `git status --short` shows no source file.

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
cat > /tmp/second-direction/census-row.txt <<'ROW'
| **M-48** | **executed** | Closed by the new test. Recorded an undetected gap until this WP landed. <TITLE> ⇒ <COUNTS> |
ROW
cat > /tmp/second-direction/mutation-row.txt <<'ROW'
| **M-48** | prune per call instead of per run | <TITLE> ⇒ <COUNTS>. This row recorded an undetected gap until this WP closed it |
ROW
#     Substitute your real TITLE/COUNTS into both, then re-run 5c/5d/5e against
#     these two files instead of the extracted ones. EXPECT: every assertion ok.
#     If any fails, the STEP is wrong and not your work — fix the step and say so
#     in the PR under "Decisions made".

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
   both mutation runs and the clean `git status` after each.
2. Conventional commits; PR titled `test(dream): … (WP-ep2-retention-prune-timing-test)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

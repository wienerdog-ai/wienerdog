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
- [ ] **AC-6** M-48's cell and the AC-15 census row both name the new test and carry
      the AC-3 run; neither still says the gap is open.

## Verification steps (run these; paste output in the PR)

```bash
# 0. RE-VERIFY THE CURRENT STATE FIRST. If any of these is not where this spec
#    says, stop and report it — do not work around it.
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

# 5. AC-6 — the two documentation cells
grep -c 'WP-ep2-retention-prune-timing-test' docs/specs/done/WP-secret-fence-ep2-redact-arm.md
grep -n 'undetected-today gap' docs/specs/done/WP-secret-fence-ep2-redact-arm.md   # expect no hit after your edit

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

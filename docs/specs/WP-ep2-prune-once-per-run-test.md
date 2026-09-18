---
id: WP-ep2-prune-once-per-run-test
title: Give Table N row N2 its missing detector at the pipeline's one prune invocation
status: In-Review
model: sonnet
size: S
depends_on: [WP-ep2-n2-rehome]
adrs: [ADR-0004, ADR-0005, ADR-0031, ADR-0042]
epic: secret-lifecycle
---

# WP-ep2-prune-once-per-run-test: one test for "the prune runs once per run"

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack" that writes configuration files
into a user's Claude Code / Codex CLI setup. **IRON RULE (ADR-0004): Wienerdog is
just files.** This work package adds one test and one inert JSON declaration. It
starts no process, writes nothing to a user machine, and adds no dependency.

The **dream** job is the nightly consolidation run. Before it commits anything it
runs a **secret gate** (called EP2) over the notes it is about to write. On a
finding whose severity is `redact`, the gate preserves the unredacted original
into `state/quarantine/redacted/`, rewrites only the lines that run added to their
sanitized form, stages the scrub, and commits the note. That `redacted/` folder is
capped at **50** files (`REDACTED_RETENTION_CAP`, `src/core/dream/validate.js:663`),
and a **retention prune** deletes the oldest copies when it grows past the cap.

The retention contract is seven facts decided in one canonical table — **Table N**
in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`. **This work package is
about exactly one of them:**

- **N1** — the cap: at most **50** files.
- **N2** — **the trigger: the prune runs ONCE PER RUN, and only when the run
  completed at least one redaction.** This is the fact this WP tests.
- **N3** — the candidate set: date-prefixed regular files in `redacted/`, **minus
  every basename this run created**.
- **N4** — the ordering: `(mtimeMs, name)` ascending over N3's candidates.
- **N5** — when N1 and N3 conflict, **N3 wins and the cap yields**.
- **N6** — an overshoot lasts until the next run that completes a redaction.
- **N7** — failure is best-effort; a failed prune never fails the arm.

**Why N2 matters, in the user's terms.** A single dream run can redact several
notes. If the prune ran once per redaction instead of once per run, an early copy
this run just wrote could be deleted before the run finishes — and the dream
report the user reads would name a recovery file that no longer exists. N3's
exclusion is what normally prevents that, but N3 and N2 are separate facts held at
separate places in the code, and **only N3 is currently tested**.

**N2 has never had a detector.** That was measured on 2026-07-28 and recorded in
mutation row M-48 of the ep2 spec; it was re-measured on 2026-09-18 and is still
true — `grep -rn 'pruneRedacted' tests/` returns exactly one hit, and that hit is
inside a test *harness*, not inside a test.

**Why this WP depends on `WP-ep2-n2-rehome`.** The test's assertion message cites
the contract row it enforces. Until that package lands, row N2 describes a per-path
loop inside the gate that no longer exists, and this test watches
`src/cli/dream.js`. A detector that cites a row describing a different call site is
the drift this family has already paid for twice.

## Current state

**Pinned to `main` at `08de2bc3`. Every cite was located by finding the construct.
Re-derive them before you start — if the content has moved but is present, that is
drift and you report it; if the content is absent, stop and say so.**

> **Re-pinned 2026-09-18 by `WP-ep2-n2-rehome`'s erratum 1, and this package is
> the successor, so its cites describe the tree AFTER that package lands.** The
> re-homed JSDoc block in `src/core/dream/validate.js` is two lines longer than
> the one at `08de2bc3` (that spec's row **N2R-14**), so **every `validate.js`
> construct below it is cited here at `+2`** — `:1176`, `:1180`, `:1182`, `:1194`,
> `:1322`, `:1324`, `:1417`, `:1420`, `:1558-1560`. **`src/` stays pinned at
> `08de2bc3`**: the change is comment text only, so no executable byte moves and
> nothing but the line numbers is affected. `:663` and every `dream.js`,
> `private-fs.js` and test-file cite are unchanged. *The sweep is the whole set,
> not the three the PR gate named — a line count that moved is wrong wherever any
> sentence states it.*

### Where the prune is triggered from

**`src/core/dream/validate.js`** builds the run state and the precondition:

- `let completedRedactions = 0;` — **`:1324`**, closure-scoped in `makeGates()`,
  incremented at **`:1420`** (`completedRedactions += 1; // increments LAST, only
  after a verified scrub`).
- `const redactedCreated = new Set();` — **`:1322`**, filled at **`:1417`**.
- **The guard, `:1558-1560`**, the last member of `makeGates`'s returned object:

  ```js
      pruneRedacted: () => {
        if (completedRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);
      },
  ```

- `pruneRedactedOriginals(stateDir, created)` — **`:1176`**. After the `stateDir`
  guard its body is, in order: `fs.readdirSync(dir, { withFileTypes: true })` over
  `<stateDir>/quarantine/redacted/` (**`:1180`**); **`if (total <=
  REDACTED_RETENTION_CAP) return;`** (**`:1182`**); then the date-prefix +
  exclusion filter, the `(mtimeMs, name)` sort, and a delete loop that also breaks
  at the cap (**`:1194`**). **Everything after the read is gated on the directory
  being over the cap** — that is the single fact Table P row P-6 turns on.

**`src/cli/dream.js`** owns the timing:

- `makeGates` is imported **by destructuring at require time**, `:34-39` (`const {`
  on `:34`, `} = require('../core/dream/validate');` on `:39`).
- `const gates = makeGates({ stateDir: paths.state });` — **`:1060`**.
- **The one invocation, `:1100-1102`:**

  ```js
      // Retention, once per run and only after a completed redaction — the
      // point the gate's per-path loop used to be followed by.
      gates.pruneRedacted();
  ```

  Unconditional, after the `try`/`catch` around `promote()`. It is the only call
  in `src/`.

### What already exists in `tests/`, measured

- **`tests/unit/dream-pipeline.test.js`** drives the **real** `src/cli/dream.js`
  through `runDream(ctx, argv, o)` (`:347`) over a `setup()` fixture (`:288`), and
  **already produces real redacting runs**. The worked example is
  `dream-pipeline: a REDACTED transcript IS marked processed — only 'withheld'
  defers (row G4)` (`:1349`), which plants a context-free high-entropy blob via
  `brainWrites()` (`:1162`) — REDACT severity — and asserts the sanitized bytes
  landed. **This is the only suite in the repo from which N2 is observable.**
- The suite already uses `t.mock.method(fs, 'rmSync', …)` (`:939`, `:987`,
  `:2550`, `:2699`, `:2725`) with a path-scoped delegate-or-intercept body, so the
  technique Table P row P-6 requires is established in the file rather than new.
- **`tests/unit/dream-validate.test.js` is the WRONG host and must not be used.**
  Its `gateFixture()` helper calls `gates.pruneRedacted()` itself at **`:242`**
  (reached via `RUN` at `:1552`). A cardinality assertion added there would measure
  the fixture, not `src/`. The five existing `EP2 retention:` tests in that file
  cover N3, N4, N5 and N6 and are correct where they are; leave them alone.
- **Nothing anywhere asserts the prune's cardinality or timing.**
  `grep -rn 'pruneRedacted' tests/` → one hit, `dream-validate.test.js:242`.
  `grep -n 'prune' tests/unit/dream-pipeline.test.js` → one hit, `:2280`, which is
  about pruned *size evidence* on an idle run and is unrelated.

### The RED-proof lane, as it works today

ADR-0042 (`docs/adr/0042-machine-run-red-proofs.md`, Accepted, OWNER-SIGNED
2026-09-02) decides how a criterion's RED evidence is produced. A **RED proof** is
a declared exact-substring mutation plus the named assertions it must redden,
committed as **JSON that is parsed and validated, never executed**, beside the
suite it proves. The runner is `npm run red-proofs`
(`node tests/with-temp-root.js scripts/red-proofs.js`); it runs BASELINE in a
pristine copy, APPLIES the mutation into a fresh copy, observes RED there, and
runs a CONTROL in a further fresh pristine copy, requiring the declared assertions
— and only those — to fail **as assertion failures of their own test bodies**.

**Four declaration files already name this suite** —
`dream-digest-omits-own-job-alerts`, `dream-git-env-pinning`,
`dream-lock-stale-owner-loud-pipeline`, `dream-primary-collection-pipeline` — so a
fifth is the established shape, not a new one.

**The declaration format, taken from a shipped example**
(`tests/red-proofs/dream-git-env-validate-seam.proofs.json`):

```json
{
  "suite": "tests/unit/dream-validate.test.js",
  "proofs": [
    {
      "id": "validate-git-inherits-git-dir",
      "wp": "WP-dream-git-env-validate-seam",
      "criterion": "1",
      "why": "<why this mutation is SEMANTICALLY RELEVANT to the assertion>",
      "file": "src/core/dream/validate.js",
      "find": "    env: buildGitEnv(),",
      "replace": "    env: …, /* RP_MUT_VALIDATE_GIT_INHERITS_GIT_DIR */",
      "marker": "RP_MUT_VALIDATE_GIT_INHERITS_GIT_DIR",
      "occurrences": 1,
      "testNamePattern": "git-env-validate-seam AC",
      "expectRed": [
        {
          "test": ["<the exact full test title>"],
          "signal": "AC1-GIT_DIR-must-not-decide-the-verdict"
        }
      ]
    }
  ]
}
```

**Schema facts the runner enforces** (`scripts/red-proofs.js:639-717`):
`id` is a kebab slug, unique across the whole declaration directory; `wp`,
`criterion`, `why`, `file`, `find`, `replace` and `marker` are non-empty strings;
`replace` must differ from `find` and must contain `marker`; `file` may not be the
suite it reddens; `expectRed[].test` is a non-empty array of names **outermost
first** (a top-level test is a one-element array); and **`signal` is a non-empty
substring the runner searches for in the failing diagnostic** — an empty one is
refused, because it matches every diagnostic. **So the test's assertion message
must literally contain the signal string.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/dream-pipeline.test.js | **Add exactly one test**, appended to the end of the file, plus whatever helper that one test needs **inside its own body**. Its title, its assertion signal, its seam and its fixture are decided by **Table P**. Change no existing test and no existing shared helper |
| create | tests/red-proofs/ep2-prune-once-per-run.proofs.json | **Exactly one declaration file carrying exactly TWO proofs**, per **Table P** row P-9 — one per regression schedule in P-8. `suite` is `tests/unit/dream-pipeline.test.js` |
| modify | docs/specs/WP-ep2-prune-once-per-run-test.md | **This spec file — the `status:` transition ONLY** (`Ready` → `In-Review`, per Definition of done item 4). No other line of this file may change |

**`src/` is NOT in this table.** The N2 behaviour is correct as shipped; only its
detector is missing. Table P row P-6 pins a seam that needs **no** production
change, and it names the two alternatives that would have needed one. If you find
yourself editing `dream.js` or `validate.js`, stop.

**`tests/unit/dream-validate.test.js` is NOT in this table**, deliberately. See
Current state for why it cannot host this test.

**`docs/specs/done/WP-secret-fence-ep2-redact-arm.md` is NOT in this table**, also
deliberately. Moving M-48's census limb off `gap` and naming this test in M-48's
cell is a documentation pass over a `Done` spec guarded by four pinned digests and
two mechanized gates. See Out of scope.

### Exact contracts

**Everything this WP ships is decided in Table P.** Nothing here restates it.

## Contract reference

**The ADR-0031 activation trigger fires — two of seven conditions are true:**

- **(v) the task crosses an authority boundary.** `makeGates()` records the run
  state and owns the *precondition*; `src/cli/dream.js:1102` owns the *timing*.
  This test's whole subject is that boundary — it watches a caller honour a
  contract about a callee's invocation count.
- **(vii) the same contract must appear in multiple mirrored surfaces.** The test
  title, the assertion's `signal`, the `expectRed[].test` array and the
  `testNamePattern` in the JSON declaration must all agree **exactly**, across two
  files, or the declaration silently stops proving anything. That is four
  hand-copied spellings of one fact — the classic multi-mirror shape.

### Contract table(s)

#### Table P — canonical: the one test, its seam, its fixture, and its proof

**This table is the single place these facts are decided. The Deliverables cells,
every acceptance criterion, every verification grep and every sentence of prose in
this spec defer to it and restate nothing. A value changed here changes in every
registered mirror in the same commit.** Measured at `08de2bc3`.

| id | fact | value |
|----|------|-------|
| **P-1** | **the host suite** | `tests/unit/dream-pipeline.test.js` — the only suite that drives the real `src/cli/dream.js`. One test appended at the end of the file |
| **P-2** | **the exact test title** | `dream-pipeline: the retention prune runs EXACTLY ONCE per run, and only after a completed redaction (Table N row N2)` |
| **P-3** | **the assertion signal** | `N2-prune-must-run-exactly-once-per-run` — a literal substring of **every** assertion message in the test body, per `scripts/red-proofs.js:716-717`. Every assertion carries it, not just one, so whichever leg fails the runner's `signal` search finds it |
| **P-4** | **what the test asserts, half one — CARDINALITY** | over a run that completes **two** redactions against P-7's fixture, the prune's delete path attempts **exactly two** deletions — the count a single correct prune makes when the directory ends **two** over the cap. **The assertion is on the delete-path count, not on an invocation count**, because the invocation is not directly observable (Table S). Every schedule that violates N2 attempts a different number: P-8 measures them |
| **P-5** | **what the test asserts, half two — THE PRECONDITION** | over a second run, in the same test body, that completes **zero** redactions with the directory already **one** over the cap, the prune's delete path attempts **zero** deletions. This is the half `if (completedRedactions > 0)` holds, and it is what keeps P-4 from passing on a prune that always fires |
| **P-6** | **THE SEAM — what is observed** | the prune's **delete path** over `<stateDir>/quarantine/redacted/`: `fs.rmSync` calls, mocked with `t.mock.method`, whose target's directory is that directory **and** whose basename is one of the fixture's own seeded names (P-7). Those calls are **recorded and NEUTRALIZED — counted, not performed**; every other `fs.rmSync` delegates to the real one. Neutralizing is what makes a later invocation observable: the helper returns at `validate.js:1182` whenever the directory is at or below the cap, and a performed prune leaves it exactly at the cap, so **an un-neutralized later invocation deletes nothing and is invisible**. The scoping to seeded basenames is mandatory and **measured**: neutralizing *every* `rmSync` under `redacted/` also swallows `quarantinePreserve`'s own temp cleanup and the run throws `quarantinePreserve: "…/.tmp-…" still exists after its removal was attempted` |
| **P-7** | **the fixture** | built from the suite's own existing helpers — `setup()` (`:288`), `brainWrites()` (`:1162`), `runDream()` (`:347`). **Leg one:** two notes, each carrying a distinct context-free high-entropy blob (REDACT severity, established by the suite's `:1349` test), plus **50** seeded files in `<state>/quarantine/redacted/` that this run did not create, named `<YYYY-MM-DD>-<name>` so N3's date-prefix filter admits them, mode `0600` inside `0700`. **50 is the load-bearing number, and 49 is a measured defect** (design round 1, Astra, band B): at 49 the directory is at the cap after the first redaction, so a per-redaction prune returns without deleting and the run's total is **one** — identical to a correct once-per-run prune, and the detector misses the regression N2 exists for. At 50 the directory is **two** over the cap at the end of the run, so every schedule in P-8 separates. **Leg two:** one clean note and **51** seeded files, one over the cap, so an unconditional prune would attempt a deletion. **Reuse the suite's helpers; add no shared helper** |
| **P-8** | **the regression schedules the test must catch** | **three, every one of them N2-only** — the accumulated set is untouched in all three, so N3 stays satisfied and no existing `EP2 retention:` test moves. **(a) DUPLICATE AT THE CALL SITE:** a second `gates.pruneRedacted();` beside `src/cli/dream.js:1102`. This is the mutation `WP-ep2-n2-rehome` re-keys M-48 to (that spec's Table N2R row N2R-9), so the row and proof (a) state one mutation byte-for-byte. **(b) PER-REDACTION, ADDED:** `pruneRedactedOriginals(stateDir, redactedCreated);` inserted immediately after `completedRedactions += 1;` in the secret gate's redact arm (`src/core/dream/validate.js:1420`), the end call left in place. **This is the modern spelling of M-48's own 2026-07-28 mutation** and the schedule the 49-seed fixture missed. **(c) PER-REDACTION, MOVED:** (b) with the `src/cli/dream.js:1102` call removed — a true move. **(a) and (b) are single-file and are declared (P-9); (c) spans two files, so a RED proof cannot express it and it is measured by hand (P-10).** All three attempt a delete count different from P-4's two |
| **P-9** | **the RED declaration** | **two proofs** in `tests/red-proofs/ep2-prune-once-per-run.proofs.json`. Shared by both: `suite` = P-1; `wp` = `WP-ep2-prune-once-per-run-test`; `criterion` = `2`; `occurrences` = `1`; `testNamePattern` = `retention prune runs EXACTLY ONCE`; `expectRed[0].test` = `[P-2]`; `expectRed[0].signal` = P-3. **Proof (a)** — `id` = `ep2-prune-runs-once-per-run`; `file` = `src/cli/dream.js`; `find` = the exact `gates.pruneRedacted();` line at `:1102`, **including its six leading spaces**; `replace` = that line plus a newline and a duplicate carrying the marker; `marker` = `RP_MUT_EP2_PRUNE_TWICE`. **Proof (b)** — `id` = `ep2-prune-not-once-per-redaction`; `file` = `src/core/dream/validate.js`; `find` = the exact `completedRedactions += 1; // increments LAST, only after a verified scrub` line at `:1420`, **including its ten leading spaces** (measured: it occurs once in the file); `replace` = that line plus a newline and `pruneRedactedOriginals(stateDir, redactedCreated);` at the same indent carrying the marker; `marker` = `RP_MUT_EP2_PRUNE_PER_REDACTION`. Both identifiers are module-scope or closure-scope at that point, so the insertion compiles |
| **P-10** | **the MEASURED red sets** | each schedule hand-applied at `08de2bc3` in a worktree carrying the candidate test, the **whole** suite run each time. **Every one of the three gives `tests 2905, pass 2892, fail 1, skipped 12`, the single failure being P-2 and NOTHING ELSE IN THE REPOSITORY reddening.** The delete counts the diagnostic reports: **(a) duplicate → 4** (`n2seed-00, n2seed-01, n2seed-00, n2seed-01`); **(b) per-redaction added → 5**; **(c) per-redaction moved → 3**. Control, same tree unmutated: **`tests 2905, pass 2893, fail 0, skipped 12`**, delete count **2**. *These are measurements of the candidate implementation, not promises about the implementer's; the implementer re-establishes (a) and (b) mechanically through P-11* |
| **P-11** | **the check** | the **UNFILTERED** `npm run red-proofs` → `RUN: PROVEN`, zero `FAILED`, `VACUOUS`, `UNCONTROLLED`, `FILTERED` or `ERROR`. **A `--wp`-scoped run reports `RUN: FILTERED` and exits 1 by construction, so it can never satisfy a criterion and must never be written as a must-pass line** |
| **P-12** | **what this WP does NOT assert** | N1, N3, N4, N5, N6, N7 — all six already have cases in `tests/unit/dream-validate.test.js` (five `EP2 retention:` tests). **Adding a second test for any of them exceeds this WP** |

#### Table S — canonical: the seams that were measured and rejected

**Recorded so the design is attributable and so nobody re-runs the dead ends under
time pressure. Each verdict is a measurement, not a reading.**

| id | candidate | verdict and evidence at `08de2bc3` |
|----|-----------|------------------------------------|
| **S-1** | **replace or wrap `makeGates` from the test** | **IMPOSSIBLE without a production change.** `src/cli/dream.js:34-39` destructures `makeGates` at require time, so `t.mock.method(validateLib, 'makeGates', …)` cannot reach the binding `dream.js` captured at `:1060`. `dream.run`'s JS-only opts seam carries `now`, `spawnGit`, `platform`, `probeCmd`, `skipContainmentProbe`, `reapTree`, `reapGroup`, `writeFilePrivate`, `pollDelayMs` and `writeFile` — **no gates seam**. Adopting S-1 puts `src/` in the Deliverables and makes this a different, larger package |
| **S-2** | **count `fs.readdirSync` calls on `<stateDir>/quarantine/redacted/`** | **MEASURED CONTAMINATED — 3 reads, not 1**, on a two-redaction pipeline run. One is the prune (`validate.js:1180`); the other two come from `scanPrivateModes` → `insecureEntries` → `listPrivateEntries` → `listNames` (`src/core/private-fs.js:393`), the private-mode audit, which a successful run reaches **twice** through `regenerateDigest` (`src/cli/dream.js:1300` and `:1341`). A cardinality assertion over that count measures the audit as much as the prune, and it goes red whenever an unrelated package changes how the audit walks the private tree |
| **S-3** | **a plain observable side effect, with the deletes performed** | **MEASURED UNOBSERVABLE.** `pruneRedactedOriginals` returns at `validate.js:1182` whenever the directory is at or below the cap, and the delete loop breaks at the same bound (`:1194`), so a performed first prune leaves the directory exactly at the cap and a second invocation returns before it stats or deletes anything. Every post-read step is gated on `total > cap` — which is why P-6 neutralizes the seeded deletes rather than performing them |

### Mirrored Surface Checklist

**Every surface below mirrors Table P (or Table S). All move in the SAME COMMIT as
the table — no commit may exist in which a registered mirror and its table
disagree. Any further mirror found in review is added here on the spot.**

**A. Mirrors inside this spec:**

- [ ] **Deliverables-table cells that restate a path or rule** — all three rows.
      Each names its path and defers to a P-row for its content.
- [ ] **Acceptance criteria that assert its facts** — AC-1 … AC-8 below; each cites
      a P-row id.
- [ ] **Verification commands / greps** — V-1 … V-5 below. Every literal string
      they grep for is a Table P value.
- [ ] **Current-state description** — the `src/` and `tests/` cites, the
      declaration-format excerpt and the schema-facts paragraph.
- [ ] **Operative prose steps that apply it** — Context's N1–N7 recap, the
      dependency paragraph, and Out of scope's exclusions.

**B. Mirrors in the shipped artifacts — the four spellings of one identity, which
is why Table P exists**

- [ ] **the test's title string in `tests/unit/dream-pipeline.test.js`** = **P-2**,
      byte-exact.
- [ ] **every assertion message in that test** contains **P-3**, byte-exact.
- [ ] **`expectRed[0].test[0]` in BOTH proofs** = **P-2**, byte-exact.
- [ ] **`expectRed[0].signal` in BOTH proofs** = **P-3**, byte-exact.
- [ ] **`testNamePattern` in BOTH proofs** = P-9's value, and it must **match
      P-2** — a pattern that matches nothing exits 0 with a pass count, which is a
      failure mode ADR-0042's Context names explicitly.
- [ ] **the delete count asserted in the test body** = **P-4**'s two, and it is
      the number P-7's seed count of 50 produces. **A change to either moves the
      other and both move here**, because the seed count and the expected count
      are one fact written twice.

**C. The cross-package mirror:**

- [ ] **`WP-ep2-n2-rehome`'s Table N2R row N2R-9** states the same mutation as
      **P-8 schedule (a)**, byte-for-byte. M-48 states exactly one mutation
      (ADR-0036 row A3), so schedules (b) and (c) are this package's alone and the
      ep2 spec gains no row for them. The two packages ship in that order and
      neither may restate the other's value in a different form. *Registered here
      rather than assumed: this is the only fact this WP shares with its dependency.*

## Implementation notes & constraints

- **Never run the suite as root**, and never run bare `node --test` —
  `tests/run.js` is the only place `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set.
- **Reuse the suite's helpers; add no shared one.** P-7 names the three you need.
  Anything the one test needs beyond them lives inside that test's own body.
- **Enumerate your own good.** The `rmSync` interception (P-6) is scoped to the
  fixture's own seeded basenames — the set we intend to observe — and delegates
  everything else. A forbidden-set enumeration over a filesystem cannot be closed,
  and the un-scoped form is measured to break the run (P-6).
- **Two redactions, not one (P-4).** A run with a single redaction cannot
  distinguish once-per-run from once-per-redaction; both fire once.
- **Fifty seeded, not forty-nine (P-7).** The seed count is what makes the
  schedules separable, and it was a band-B finding in design round 1. Changing it
  changes P-4's expected count in the same edit.
- **The zero-redaction leg is not optional (P-5).** Without it, a mutation that
  makes the prune unconditional passes the cardinality half.
- **`t.mock.restoreAll()` between the two legs**, so leg two's interception counts
  only leg two. Both legs run inside one test body (P-1 permits exactly one test),
  and P-3 is on every assertion so the failing identity stays findable.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

**N/A — this work package adds one test and one inert JSON declaration.** It ships
no production code, introduces no identifier that flows into a filesystem path or
a shell command, and reads no untrusted input. The RED declaration is **data**:
ADR-0042 decision 1 requires it to be parsed and validated, never executed.

## Acceptance criteria

- [ ] **AC-1 (P-1, P-2)** `tests/unit/dream-pipeline.test.js` gains **exactly one**
      test, titled byte-exactly P-2, and **no existing test or shared helper in that
      file changes**. Verified by the diff. (V-1)
- [ ] **AC-2 (P-4, P-5, P-6, P-7)** The new test **passes** against unmodified
      `src/`, and it asserts **both** halves: exactly one prune delete-path firing
      on a two-redaction run, and zero on a zero-redaction run with the directory
      already over the cap. (V-4)
- [ ] **AC-3 (P-8, P-9, P-11)** The **UNFILTERED** `npm run red-proofs` reports
      `RUN: PROVEN` with zero `FAILED`, `VACUOUS`, `UNCONTROLLED`, `FILTERED` or
      `ERROR`, **including BOTH of this package's proofs,
      `ep2-prune-runs-once-per-run` and `ep2-prune-not-once-per-redaction`**. This
      is the whole of the machine-run RED evidence; schedule (c) is hand-measured
      provenance only (P-10) and is not re-run. (V-4)
- [ ] **AC-4 (Checklist B)** The four identity spellings agree byte-exactly: the
      test title, `expectRed[0].test[0]`, the `signal` in every assertion message
      and in the JSON, and a `testNamePattern` that actually matches P-2. Asserted
      by V-2, which compares the files rather than trusting either.
- [ ] **AC-5 (P-12)** The five existing `EP2 retention:` tests in
      `tests/unit/dream-validate.test.js` are **unchanged and still green**, and
      that file is not in the diff. (V-3)
- [ ] **AC-6 (Checklist C)** Proof (a)'s mutation is the one
      `WP-ep2-n2-rehome`'s Table N2R row N2R-9 names, and mutation row M-48 of the
      ep2 spec already states it. **If it does not, the dependency has not landed
      and this package is not dispatchable** — stop and report rather than editing
      the ep2 spec. Recorded as a verdict in the PR body.
- [ ] **AC-7** `npm test` and `npm run lint` pass. (V-4)
- [ ] **AC-8 Idempotence** `N/A — this WP ships no command and writes nothing
      outside the repository; it adds a test and a declaration.`

## Verification steps (run these; paste output in the PR)

> **Both directions were observed while this spec was written, at `08de2bc3`,
> against a candidate implementation of Table P** — green on the compliant tree
> and red under **all three** of P-8's schedules, with the measured red sets
> recorded as **P-10**. The implementer re-establishes (a) and (b) mechanically
> through V-4's unfiltered `npm run red-proofs`; the hand measurements are
> provenance, not the evidence.

```bash
set -euo pipefail
T=tests/unit/dream-pipeline.test.js
J=tests/red-proofs/ep2-prune-once-per-run.proofs.json
BASE=08de2bc335baa4a97bba2f33bca224f2f3a28517
TITLE='dream-pipeline: the retention prune runs EXACTLY ONCE per run, and only after a completed redaction (Table N row N2)'
SIGNAL='N2-prune-must-run-exactly-once-per-run'

# V-1  AC-1 — exactly one new test, nothing else in the suite moved.
n=$({ grep -o -F "$TITLE" "$T" || true; } | wc -l | tr -d ' ')
test "$n" = "1" || { echo "FAIL V-1: the test title occurs $n time(s) in $T, want 1"; exit 1; }
del=$(git diff --numstat "$BASE" -- "$T" | awk '{print $2}')
test "${del:-0}" = "0" || { echo "FAIL V-1: $del line(s) DELETED from the suite"; exit 1; }
echo "ok V-1: one new test, nothing removed"

# V-2  AC-4 — the four spellings agree. Compared across files, never trusted.
test -f "$J" || { echo "FAIL V-2: the declaration was not created"; exit 1; }
grep -qF "$SIGNAL" "$T" || { echo "FAIL V-2: no assertion message carries the signal"; exit 1; }
node - "$J" "$TITLE" "$SIGNAL" <<'CHK'
const fs = require('fs');
const [, , file, title, signal] = process.argv;
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = (m) => { console.error('FAIL V-2: ' + m); process.exit(1); };
if (d.suite !== 'tests/unit/dream-pipeline.test.js') fail(`suite is ${d.suite}`);
if (!Array.isArray(d.proofs) || d.proofs.length !== 2) fail(`want exactly 2 proofs, got ${d.proofs && d.proofs.length}`);
const want = new Map([
  ['ep2-prune-runs-once-per-run', 'src/cli/dream.js'],
  ['ep2-prune-not-once-per-redaction', 'src/core/dream/validate.js'],
]);
for (const p of d.proofs) {
  if (!want.has(p.id)) fail(`unexpected proof id ${p.id}`);
  if (p.file !== want.get(p.id)) fail(`${p.id}: file is ${p.file}`);
  want.delete(p.id);
  if (p.occurrences !== 1) fail(`${p.id}: occurrences is ${p.occurrences}, want 1`);
  if (!p.replace.includes(p.marker)) fail(`${p.id}: the replacement does not carry its marker`);
  if (p.replace === p.find) fail(`${p.id}: replace equals find`);
  if (p.expectRed.length !== 1) fail(`${p.id}: want exactly one expectRed entry`);
  if (p.expectRed[0].test.length !== 1 || p.expectRed[0].test[0] !== title) fail(`${p.id}: expectRed[0].test[0] != the test title`);
  if (p.expectRed[0].signal !== signal) fail(`${p.id}: expectRed[0].signal != the signal`);
  if (!new RegExp(p.testNamePattern).test(title)) fail(`${p.id}: testNamePattern ${JSON.stringify(p.testNamePattern)} does not match the title`);
}
if (want.size) fail(`missing proof(s): ${[...want.keys()].join(', ')}`);
console.log('ok V-2: both proofs carry all four spellings');
CHK

# V-3  AC-5 — the sibling suite is untouched and its five cases are intact.
if git diff --name-only "$BASE" | grep -qx 'tests/unit/dream-validate.test.js'; then
  echo "FAIL V-3: this PR edited dream-validate.test.js, which is out of scope."; exit 1; fi
five=$({ grep -o 'EP2 retention:' tests/unit/dream-validate.test.js || true; } | wc -l | tr -d ' ')
test "$five" = "5" || { echo "FAIL V-3: $five EP2 retention cases, want 5"; exit 1; }
echo "ok V-3: sibling suite untouched"

# V-4  AC-2, AC-3, AC-7 — the suite, the RED lane, and lint.
node tests/run.js tests/unit/dream-pipeline.test.js
npm test
npm run red-proofs        # UNFILTERED. Expect RUN: PROVEN, zero FAILED/VACUOUS/
                          # UNCONTROLLED/FILTERED/ERROR. NEVER pass --wp here:
                          # a scoped run is RUN: FILTERED, exit 1, by construction.
npm run lint

# V-5  AC-6 — the dependency landed: M-48 already states P-8 schedule (a).
EP2=docs/specs/done/WP-secret-fence-ep2-redact-arm.md
mrow=$(grep -n '^| \*\*M-48\*\* |' "$EP2" | tail -1 | cut -d: -f1)
row=$(sed -n "${mrow}p" "$EP2")
case "$row" in *'src/cli/dream.js:1102'*) ;; *)
  echo "FAIL V-5: M-48 does not yet name the re-keyed call site — WP-ep2-n2-rehome has not landed."; exit 1;; esac
echo "ok V-5: the dependency landed"
```

## Out of scope (do NOT do these)

- **Do not edit `src/`.** The N2 behaviour is correct as shipped; only its detector
  is missing. Table S records the two candidate seams that would have required a
  production change and why neither was taken.
- **Do not add tests for N1, N3, N4, N5, N6 or N7** (P-12) — all six already have
  cases in `tests/unit/dream-validate.test.js`.
- **Do not add a test to `tests/unit/dream-validate.test.js`**, and do not change
  its `gateFixture()` helper. That file's harness calls `gates.pruneRedacted()`
  itself (`:242`), so a cardinality assertion there measures the fixture.
- **Do not edit `docs/specs/done/WP-secret-fence-ep2-redact-arm.md.`** Moving
  M-48's census limb off `gap` and naming this test in M-48's cell is a separate
  documentation pass over a `Done` spec guarded by four pinned digests and two
  mechanized gates. **Note it under "Discovered issues" in the PR body so the
  architect can route it; do not do it here.**
- **Do not touch `docs/specs/WP-ep2-retention-prune-timing-test.md`.** It is parked
  with a `SUPERSEDED-PENDING` banner; retiring it is the owner's call.
- **Do not add a THIRD proof to the declaration** (P-9 fixes it at two), and do
  not re-run or re-record any other mutation row. Schedule (c) is deliberately not
  declared: it spans two files and a RED proof mutates one.

## Definition of done

**Dispatch precondition — the design gate is CLOSED.** Closed **2026-09-18 at
round 2**: round 1 (Astra, medium, adversarial) returned one band-B finding, fixed
on the same branch; round 2 (Astra) returned **approve, no findings**, having
executed the real prune helper against mocked entries to confirm the revised
counts and the zero-redaction guard. Raws: `6b9e515d` (round 1) and `5ced42cd`
(round 2), under `docs/specs/logbook/`; dispositions in
`docs/specs/logbook/2026-09-18-ep2-successors-design-review.md`. **This is a
REVIEW GATE, not owner approval**, and it grants nothing the owner has not been
asked for: this package's own dispatch still waits on `WP-ep2-n2-rehome` landing.
**Owner item O-1 in that spec was taken under the standing process on 2026-09-18**
and is no longer a blocker — the gate neither granted nor could grant it.

1. All verification steps pass locally; output pasted into the PR body, including
   the **unfiltered** `npm run red-proofs` summary line.
2. Conventional commits; PR titled
   `test(dream): … (WP-ep2-prune-once-per-run-test)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.

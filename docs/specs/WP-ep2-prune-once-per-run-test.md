---
id: WP-ep2-prune-once-per-run-test
title: Give Table N row N2 its missing detector at the pipeline's one prune invocation
status: Draft
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

### Where the prune is triggered from

**`src/core/dream/validate.js`** builds the run state and the precondition:

- `let completedRedactions = 0;` — **`:1322`**, closure-scoped in `makeGates()`,
  incremented at **`:1418`** (`completedRedactions += 1; // increments LAST, only
  after a verified scrub`).
- `const redactedCreated = new Set();` — **`:1320`**, filled at **`:1415`**.
- **The guard, `:1556-1558`**, the last member of `makeGates`'s returned object:

  ```js
      pruneRedacted: () => {
        if (completedRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);
      },
  ```

- `pruneRedactedOriginals(stateDir, created)` — **`:1174`**. After the `stateDir`
  guard its body is, in order: `fs.readdirSync(dir, { withFileTypes: true })` over
  `<stateDir>/quarantine/redacted/` (**`:1178`**); **`if (total <=
  REDACTED_RETENTION_CAP) return;`** (**`:1180`**); then the date-prefix +
  exclusion filter, the `(mtimeMs, name)` sort, and a delete loop that also breaks
  at the cap (**`:1192`**). **Everything after the read is gated on the directory
  being over the cap** — that is the single fact Table P row P-6 turns on.

**`src/cli/dream.js`** owns the timing:

- `makeGates` is imported **by destructuring at require time**, `:33-38`.
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
| create | tests/red-proofs/ep2-prune-once-per-run.proofs.json | **Exactly one declaration**, per **Table P** row P-9. `suite` is `tests/unit/dream-pipeline.test.js` |
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
| **P-4** | **what the test asserts, half one — CARDINALITY** | over a run that completes **two** redactions, the prune's delete path fires **exactly once**. This is the half a per-call or duplicated prune violates |
| **P-5** | **what the test asserts, half two — THE PRECONDITION** | over a second run, in the same test body, that completes **zero** redactions with the directory already over the cap, the prune's delete path fires **zero** times. This is the half `if (completedRedactions > 0)` holds, and it is what keeps P-4 from passing on a prune that always fires |
| **P-6** | **THE SEAM — what is observed** | the prune's **delete path** over `<stateDir>/quarantine/redacted/`: `fs.rmSync` calls, mocked with `t.mock.method`, whose target's directory is that directory **and** whose basename is one of the fixture's own seeded names (P-7). Those calls are **recorded and NEUTRALIZED — counted, not performed**; every other `fs.rmSync` delegates to the real one. Neutralizing is what makes a second invocation observable: the helper returns at `validate.js:1180` whenever the directory is at or below the cap, and a performed first prune leaves it exactly at the cap, so **an un-neutralized second invocation deletes nothing and is invisible**. The scoping to seeded basenames is mandatory and **measured**: neutralizing *every* `rmSync` under `redacted/` also swallows `quarantinePreserve`'s own temp cleanup and the run throws `quarantinePreserve: "…/.tmp-…" still exists after its removal was attempted` |
| **P-7** | **the fixture** | built from the suite's own existing helpers — `setup()` (`:288`), `brainWrites()` (`:1162`), `runDream()` (`:347`). **Leg one:** two notes, each carrying a distinct context-free high-entropy blob (REDACT severity, established by the suite's `:1349` test), plus **49** seeded files in `<state>/quarantine/redacted/` that this run did not create, named `<YYYY-MM-DD>-<name>` so N3's date-prefix filter admits them, mode `0600` inside `0700`. 49 seeded + 2 created = **51**, one over the cap of 50, so every prune invocation deletes exactly one seeded file. **Leg two:** one clean note and **51** seeded files. **Reuse the suite's helpers; add no shared helper** |
| **P-8** | **the mutation the test must catch** | **duplicate the invocation**: a second `gates.pruneRedacted();` beside `src/cli/dream.js:1102`. It is an N2-only mutation — the accumulated set is untouched, so N3 stays satisfied and no existing `EP2 retention:` test moves. It is the same mutation `WP-ep2-n2-rehome` re-keys M-48 to (that spec's Table N2R row N2R-9), so the row and the proof state one mutation |
| **P-9** | **the RED declaration** | one proof in `tests/red-proofs/ep2-prune-once-per-run.proofs.json`: `suite` = P-1; `id` = `ep2-prune-runs-once-per-run`; `wp` = `WP-ep2-prune-once-per-run-test`; `criterion` = `2`; `file` = `src/cli/dream.js`; `find` = the exact `gates.pruneRedacted();` line as it appears at `src/cli/dream.js:1102`, **including its six leading spaces**; `replace` = that line plus a newline and a duplicate carrying the marker; `marker` = `RP_MUT_EP2_PRUNE_TWICE`; `occurrences` = `1`; `testNamePattern` = `retention prune runs EXACTLY ONCE`; `expectRed[0].test` = `[P-2]`; `expectRed[0].signal` = P-3 |
| **P-10** | **the MEASURED red set** | hand-applied at `08de2bc3` in a worktree carrying the candidate test, the whole suite run: **`tests 2905, pass 2892, fail 1, skipped 12`**, the single failure being **P-2**, with the diagnostic `N2-prune-must-run-exactly-once-per-run: the prune's delete path ran 2 time(s) over a run that completed two redactions; Table N row N2 permits exactly one.` **Nothing else in the repository reddens.** Control, same tree without the mutation: `tests 2905, pass 2893, fail 0, skipped 12`. *This is a measurement of the candidate implementation, not a promise about the implementer's; the implementer re-establishes it through P-11* |
| **P-11** | **the check** | the **UNFILTERED** `npm run red-proofs` → `RUN: PROVEN`, zero `FAILED`, `VACUOUS`, `UNCONTROLLED`, `FILTERED` or `ERROR`. **A `--wp`-scoped run reports `RUN: FILTERED` and exits 1 by construction, so it can never satisfy a criterion and must never be written as a must-pass line** |
| **P-12** | **what this WP does NOT assert** | N1, N3, N4, N5, N6, N7 — all six already have cases in `tests/unit/dream-validate.test.js` (five `EP2 retention:` tests). **Adding a second test for any of them exceeds this WP** |

#### Table S — canonical: the seams that were measured and rejected

**Recorded so the design is attributable and so nobody re-runs the dead ends under
time pressure. Each verdict is a measurement, not a reading.**

| id | candidate | verdict and evidence at `08de2bc3` |
|----|-----------|------------------------------------|
| **S-1** | **replace or wrap `makeGates` from the test** | **IMPOSSIBLE without a production change.** `src/cli/dream.js:33-38` destructures `makeGates` at require time, so `t.mock.method(validateLib, 'makeGates', …)` cannot reach the binding `dream.js` captured at `:1060`. `dream.run`'s JS-only opts seam carries `now`, `spawnGit`, `platform`, `probeCmd`, `skipContainmentProbe`, `reapTree`, `reapGroup`, `writeFilePrivate`, `pollDelayMs` and `writeFile` — **no gates seam**. Adopting S-1 puts `src/` in the Deliverables and makes this a different, larger package |
| **S-2** | **count `fs.readdirSync` calls on `<stateDir>/quarantine/redacted/`** | **MEASURED CONTAMINATED — 3 reads, not 1**, on a two-redaction pipeline run. One is the prune (`validate.js:1178`); the other two come from `scanPrivateModes` → `insecureEntries` → `listPrivateEntries` → `listNames` (`src/core/private-fs.js:393`), the private-mode audit. A cardinality assertion over that count measures the audit as much as the prune, and it goes red whenever an unrelated package changes how the audit walks the private tree |
| **S-3** | **a plain observable side effect, with the deletes performed** | **MEASURED UNOBSERVABLE.** `pruneRedactedOriginals` returns at `validate.js:1180` whenever the directory is at or below the cap, and the delete loop breaks at the same bound (`:1192`), so a performed first prune leaves the directory exactly at the cap and a second invocation returns before it stats or deletes anything. Every post-read step is gated on `total > cap` — which is why P-6 neutralizes the seeded deletes rather than performing them |

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
- [ ] **`expectRed[0].test[0]` in the proofs JSON** = **P-2**, byte-exact.
- [ ] **`expectRed[0].signal` in the proofs JSON** = **P-3**, byte-exact.
- [ ] **`testNamePattern` in the proofs JSON** = P-9's value, and it must **match
      P-2** — a pattern that matches nothing exits 0 with a pass count, which is a
      failure mode ADR-0042's Context names explicitly.

**C. The cross-package mirror:**

- [ ] **`WP-ep2-n2-rehome`'s Table N2R row N2R-9** states the same mutation as
      **P-8**. The two packages ship in that order and neither may restate the
      other's value in a different form. *Registered here rather than assumed: this
      is the only fact this WP shares with its dependency.*

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
      `ERROR`, **including this package's declaration
      `ep2-prune-runs-once-per-run`**. This is the whole of the RED evidence; no
      hand-applied mutation is pasted into the PR. (V-4)
- [ ] **AC-4 (Checklist B)** The four identity spellings agree byte-exactly: the
      test title, `expectRed[0].test[0]`, the `signal` in every assertion message
      and in the JSON, and a `testNamePattern` that actually matches P-2. Asserted
      by V-2, which compares the files rather than trusting either.
- [ ] **AC-5 (P-12)** The five existing `EP2 retention:` tests in
      `tests/unit/dream-validate.test.js` are **unchanged and still green**, and
      that file is not in the diff. (V-3)
- [ ] **AC-6 (Checklist C)** The mutation the declaration applies is the one
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
> and red under P-8's mutation, with the measured red set recorded as **P-10**.
> The implementer re-establishes it mechanically through V-4's unfiltered
> `npm run red-proofs`; the hand measurement is provenance, not the evidence.

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
if (!Array.isArray(d.proofs) || d.proofs.length !== 1) fail('want exactly 1 proof');
const p = d.proofs[0];
if (p.id !== 'ep2-prune-runs-once-per-run') fail(`id is ${p.id}`);
if (p.file !== 'src/cli/dream.js') fail(`file is ${p.file}`);
if (p.occurrences !== 1) fail(`occurrences is ${p.occurrences}, want 1`);
if (!p.replace.includes(p.marker)) fail('the replacement does not carry its marker');
if (p.replace === p.find) fail('replace equals find');
if (p.expectRed.length !== 1) fail('want exactly one expectRed entry');
if (p.expectRed[0].test.length !== 1 || p.expectRed[0].test[0] !== title) fail('expectRed[0].test[0] != the test title');
if (p.expectRed[0].signal !== signal) fail('expectRed[0].signal != the signal');
if (!new RegExp(p.testNamePattern).test(title)) fail(`testNamePattern ${JSON.stringify(p.testNamePattern)} does not match the title`);
console.log('ok V-2: all four spellings agree');
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

# V-5  AC-6 — the dependency landed: M-48 already states P-8's mutation.
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
- **Do not add a second proof to the declaration**, and do not re-run or re-record
  any other mutation row.

## Definition of done

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

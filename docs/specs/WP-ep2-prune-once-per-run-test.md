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

> # ⚠️ BACKLOG ENTRY — NOT DISPATCHABLE
>
> **This draft has had no design round.** It was written on 2026-09-18 as the
> routing target of a staleness assessment
> (`docs/specs/logbook/2026-09-18-ep2-retention-prune-timing-test-stale.md`), not
> as a matured package. It is pinned to `main` at **`622ca04b`** and every cite
> below was re-derived construct by construct at that sha. Before it may be
> dispatched it needs the design gate (round zero plus an adversarial round,
> `docs/runbooks/codex-review.md`), a re-pin if `main` has moved, **its
> dependency `WP-ep2-n2-rehome` landed**, and an architect's `status: Ready`.
>
> **The seam is an OPEN DESIGN QUESTION, stated rather than decided** — see
> "Open design questions". Two candidate seams are measured below; picking one is
> the design round's job, not an implementer's.
>
> **This package replaces `WP-ep2-retention-prune-timing-test`**, which is parked
> `SUPERSEDED-PENDING` because the loop, the seam and the Deliverables boundary it
> was built on no longer exist.

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
capped at **50** files, and a **retention prune** deletes the oldest copies when it
grows past the cap.

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

## Current state

**Pinned to `main` at `622ca04b`. Every cite was located by finding the construct.
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

- `pruneRedactedOriginals(stateDir, created)` — **`:1174`**. Its **first** action
  after the `stateDir` guard is
  `fs.readdirSync(dir, { withFileTypes: true })` over
  `path.join(stateDir, 'quarantine', REDACTED_SUBDIR)`. **That read is the
  observable event** under seam candidate B below.

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
  landed. `dream-pipeline: a REDACTED acceptance is registered too` (`:1258`) is a
  second. **This is the only suite in the repo from which N2 is observable.**
- The suite already uses `t.mock.method(fs, 'rmSync', …)` (`:939`, `:987`) and
  mocks other module members freely, so the mocking technique this WP needs is
  established in the file rather than new.
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
(`node tests/with-temp-root.js scripts/red-proofs.js`); it copies the repo, applies
the mutation into a fresh copy, and requires the declared assertions — and only
those — to fail **as assertion failures of their own test bodies**, with a fresh
post-RED control run green.

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

**The `signal` is a non-empty substring the runner searches for in the failing
diagnostic** — the runner refuses an empty one (`scripts/red-proofs.js:716-717`),
because an empty signal matches every diagnostic. **So the test's assertion
message must literally contain the signal string.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/dream-pipeline.test.js | **Add exactly one test**, appended to the end of the file. Its title and its assertion signal are decided by **Table P** below. Change no existing test and no existing helper |
| create | tests/red-proofs/ep2-prune-once-per-run.proofs.json | **Exactly one declaration**, per **Table P** row P-7. `suite` is `tests/unit/dream-pipeline.test.js` |
| modify | docs/specs/WP-ep2-prune-once-per-run-test.md | **This spec file — the `status:` transition ONLY** (`Ready` → `In-Review`, per Definition of done item 4). No other line of this file may change |

**`src/` is NOT in this table.** The N2 behaviour is correct as shipped; only its
detector is missing. If you find yourself editing `dream.js` or `validate.js` to
make the test reachable, stop — the fault is already reachable (it is a one-line
move of an existing call), and a test that needs a production change to become
possible is a different work package.

**`tests/unit/dream-validate.test.js` is NOT in this table**, deliberately. See
Current state for why it cannot host this test.

**`docs/specs/done/WP-secret-fence-ep2-redact-arm.md` is NOT in this table**,
also deliberately. Moving M-48's census limb off `gap` and naming this test in
M-48's cell is a documentation pass, and it is `WP-ep2-n2-rehome`'s successor
concern, not this package's. See Out of scope.

### Exact contracts

**The mutation this test must catch** is given as Table P row P-6, and the RED
declaration that machine-runs it as row P-7. Nothing here is restated in prose.

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

#### Table P — canonical: the one test, its identity, and its proof

**This table is the single place these facts are decided. The Deliverables cells,
every acceptance criterion, every verification grep and every sentence of prose in
this spec defer to it and restate nothing. A value changed here changes in every
registered mirror in the same commit.**

| id | fact | value |
|----|------|-------|
| **P-1** | **the host suite** | `tests/unit/dream-pipeline.test.js` — the only suite that drives the real `src/cli/dream.js`. One test appended at the end of the file |
| **P-2** | **the exact test title** | `dream-pipeline: the retention prune runs EXACTLY ONCE per run, and only after a completed redaction (Table N row N2)` |
| **P-3** | **the assertion signal** | `N2-prune-must-run-exactly-once-per-run` — a literal substring of the failing assertion's message, per `scripts/red-proofs.js:716-717` |
| **P-4** | **what the test asserts, half one — CARDINALITY** | over a run that completes **at least two** redactions, the prune fires **exactly once**. This is the half a per-call prune violates |
| **P-5** | **what the test asserts, half two — THE PRECONDITION** | over a second run in the same test that completes **zero** redactions, the prune fires **zero** times. This is the half `if (completedRedactions > 0)` holds, and it is what keeps P-4 from passing on a prune that always fires |
| **P-6** | **the mutation the test must catch** | **duplicate the invocation**: a second `gates.pruneRedacted();` beside `src/cli/dream.js:1102`. It is an N2-only mutation — the accumulated set is untouched, so N3 stays satisfied and no existing `EP2 retention:` test moves |
| **P-7** | **the RED declaration** | one proof in `tests/red-proofs/ep2-prune-once-per-run.proofs.json`: `suite` = P-1; `id` = `ep2-prune-runs-once-per-run`; `wp` = `WP-ep2-prune-once-per-run-test`; `criterion` = `2`; `file` = `src/cli/dream.js`; `find` = the exact `gates.pruneRedacted();` line as it appears at `src/cli/dream.js:1102`, INCLUDING its six leading spaces; `replace` = that line plus a duplicate carrying the marker; `marker` = `RP_MUT_EP2_PRUNE_TWICE`; `occurrences` = `1`; `testNamePattern` = `retention prune runs EXACTLY ONCE`; `expectRed[0].test` = `[P-2]`; `expectRed[0].signal` = P-3 |
| **P-8** | **the fixture** | built from the suite's own existing helpers — `setup()` (`:288`), `brainWrites()` (`:1162`), `runDream()` (`:347`) — with **two** notes each carrying a context-free high-entropy blob, which is REDACT severity (established by the suite's `:1349` test). **Reuse; create no new helper** |
| **P-9** | **the check** | the **UNFILTERED** `npm run red-proofs` → `RUN: PROVEN`, zero `FAILED`, `VACUOUS`, `UNCONTROLLED`, `FILTERED` or `ERROR`. **A `--wp`-scoped run reports `RUN: FILTERED` and exits 1 by construction, so it can never satisfy a criterion and must never be written as a must-pass line** |
| **P-10** | **what this WP does NOT assert** | N1, N3, N4, N5, N6, N7 — all six already have cases in `tests/unit/dream-validate.test.js`. **Adding a second test for any of them exceeds this WP** |

### Mirrored Surface Checklist

**Every surface below mirrors Table P. All move in the SAME COMMIT as the table —
no commit may exist in which a registered mirror and Table P disagree. Any further
mirror found in review is added here on the spot.**

**A. Mirrors inside this spec:**

- [ ] **Deliverables-table cells that restate a path or rule** — all three rows.
      Each names its path and defers to a P-row for its content.
- [ ] **Acceptance criteria that assert its facts** — AC-1 … AC-7 below; each cites
      a P-row id.
- [ ] **Verification commands / greps** — V-1 … V-4 below. Every literal string
      they grep for is a Table P value.
- [ ] **Current-state description** — the `src/` and `tests/` cites, and the
      declaration-format excerpt.
- [ ] **Operative prose steps that apply it** — Context's N1–N7 recap and Out of
      scope's exclusions.

**B. Mirrors in the shipped artifacts — the four spellings of one identity, which
is why this table exists**

- [ ] **the test's title string in `tests/unit/dream-pipeline.test.js`** = **P-2**,
      byte-exact.
- [ ] **the assertion message in that test** contains **P-3**, byte-exact.
- [ ] **`expectRed[0].test[0]` in the proofs JSON** = **P-2**, byte-exact.
- [ ] **`expectRed[0].signal` in the proofs JSON** = **P-3**, byte-exact.
- [ ] **`testNamePattern` in the proofs JSON** = P-7's value, and it must **match
      P-2** — a pattern that matches nothing exits 0 with a pass count, which is a
      failure mode ADR-0042's Context names explicitly.

## Implementation notes & constraints

- **Never run the suite as root**, and never run bare `node --test` —
  `tests/run.js` is the only place `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set.
- **Reuse the suite's helpers; add none.** P-8 names the three you need.
- **Enumerate your own good.** Where the test inspects what the prune touched,
  assert the set of paths we intend it to touch, never a forbidden set — a
  forbidden-set enumeration over a filesystem cannot be closed.
- **`gates.pruneRedacted` cannot be intercepted by mocking the validate module.**
  Measured: `src/cli/dream.js:33-38` destructures `makeGates` at require time, so
  `t.mock.method(validateLib, 'makeGates', …)` cannot reach the binding
  `dream.js` captured. Any seam that relies on replacing `makeGates` after require
  is a dead end — this is recorded so nobody rediscovers it under time pressure.
- **Two redactions, not one (P-4).** A run with a single redaction cannot
  distinguish once-per-run from once-per-redaction; both fire once.
- **The zero-redaction leg is not optional (P-5).** Without it, a mutation that
  makes the prune unconditional passes the cardinality half.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

**N/A — this work package adds one test and one inert JSON declaration.** It ships
no production code, introduces no identifier that flows into a filesystem path or
a shell command, and reads no untrusted input. The RED declaration is **data**:
ADR-0042 decision 1 requires it to be parsed and validated, never executed.

## Acceptance criteria

- [ ] **AC-1 (P-1, P-2)** `tests/unit/dream-pipeline.test.js` gains **exactly one**
      test, titled byte-exactly P-2, and **no existing test or helper in that file
      changes**. Verified by the diff.
- [ ] **AC-2 (P-4, P-5)** The new test **passes** against unmodified `src/`, and it
      asserts **both** halves: exactly one prune on a two-redaction run, and zero
      prunes on a zero-redaction run.
- [ ] **AC-3 (P-6, P-7, P-9)** The **UNFILTERED** `npm run red-proofs` reports
      `RUN: PROVEN` with zero `FAILED`, `VACUOUS`, `UNCONTROLLED`, `FILTERED` or
      `ERROR`, **including this package's declaration
      `ep2-prune-runs-once-per-run`**. This is the whole of the RED evidence; no
      hand-applied mutation is pasted into the PR.
- [ ] **AC-4 (Checklist B)** The four identity spellings agree byte-exactly: the
      test title, `expectRed[0].test[0]`, the `signal` in the assertion message and
      in the JSON, and a `testNamePattern` that actually matches P-2. Asserted by
      V-2, which compares the files rather than trusting either.
- [ ] **AC-5 (P-10)** The five existing `EP2 retention:` tests in
      `tests/unit/dream-validate.test.js` are **unchanged and still green**, and
      that file is not in the diff.
- [ ] **AC-6** `npm test` and `npm run lint` pass.
- [ ] **AC-7 Idempotence** `N/A — this WP ships no command and writes nothing
      outside the repository; it adds a test and a declaration.`

## Verification steps (run these; paste output in the PR)

> **Design-round note.** These steps are sketched at the right shape but have
> **not** been executed, and no negative control has been run on any of them. The
> design round must run each one both directions — green on the intended
> post-work state, red on the untouched tree — before this spec may go `Ready`.

```bash
set -euo pipefail
T=tests/unit/dream-pipeline.test.js
J=tests/red-proofs/ep2-prune-once-per-run.proofs.json
TITLE='dream-pipeline: the retention prune runs EXACTLY ONCE per run, and only after a completed redaction (Table N row N2)'
SIGNAL='N2-prune-must-run-exactly-once-per-run'

# V-1  AC-1 — exactly one new test, nothing else in the suite moved.
n=$(grep -c -F "$TITLE" "$T" || true)
test "$n" = "1" || { echo "FAIL V-1: the test title occurs $n times in $T, want 1"; exit 1; }
git diff --numstat 622ca04b -- "$T" | awk '{ if ($2 != 0) { print "FAIL V-1: " $2 " lines DELETED from the suite"; exit 1 } }'
echo "ok V-1: one new test, nothing removed"

# V-2  AC-4 — the four spellings agree. Compared across files, never trusted.
grep -qF "$SIGNAL" "$T" || { echo "FAIL V-2: the assertion message does not carry the signal"; exit 1; }
node - "$J" "$TITLE" "$SIGNAL" <<'CHK'
const fs = require('fs');
const [, , file, title, signal] = process.argv;
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = (m) => { console.error('FAIL V-2: ' + m); process.exit(1); };
if (d.suite !== 'tests/unit/dream-pipeline.test.js') fail(`suite is ${d.suite}`);
if (d.proofs.length !== 1) fail(`${d.proofs.length} proofs, want exactly 1`);
const p = d.proofs[0];
if (p.expectRed.length !== 1) fail('want exactly one expectRed entry');
if (p.expectRed[0].test.length !== 1 || p.expectRed[0].test[0] !== title) fail('expectRed[0].test[0] != the test title');
if (p.expectRed[0].signal !== signal) fail('expectRed[0].signal != the signal');
if (!title.includes(p.testNamePattern)) fail(`testNamePattern ${JSON.stringify(p.testNamePattern)} does not match the title`);
if (p.occurrences !== 1) fail(`occurrences is ${p.occurrences}, want 1`);
if (!p.replace.includes(p.marker)) fail('the replacement does not carry its marker');
console.log('ok V-2: all four spellings agree');
CHK

# V-3  AC-5 — the sibling suite is untouched and its five cases are intact.
git diff --name-only 622ca04b | grep -qx 'tests/unit/dream-validate.test.js' && {
  echo "FAIL V-3: this PR edited dream-validate.test.js, which is out of scope."; exit 1; }
test "$(grep -c 'EP2 retention:' tests/unit/dream-validate.test.js)" = "5" || {
  echo "FAIL V-3: the five EP2 retention cases moved"; exit 1; }
echo "ok V-3: sibling suite untouched"

# V-4  AC-2, AC-3, AC-6 — the suite, the RED lane, and lint.
node tests/run.js tests/unit/dream-pipeline.test.js
npm test
npm run red-proofs        # UNFILTERED. Expect RUN: PROVEN, zero FAILED/VACUOUS/
                          # UNCONTROLLED/FILTERED/ERROR. NEVER pass --wp here:
                          # a scoped run is RUN: FILTERED, exit 1, by construction.
npm run lint
```

## Out of scope (do NOT do these)

- **Do not edit `src/`.** The N2 behaviour is correct as shipped; only its detector
  is missing.
- **Do not add tests for N1, N3, N4, N5, N6 or N7** (P-10) — all six already have
  cases in `tests/unit/dream-validate.test.js`.
- **Do not add a test to `tests/unit/dream-validate.test.js`**, and do not change
  its `gateFixture()` helper. That file's harness calls `gates.pruneRedacted()`
  itself (`:242`), so a cardinality assertion there measures the fixture.
- **Do not edit `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`.** Moving
  M-48's census limb off `gap` and naming this test in M-48's cell is a separate
  documentation pass over a `Done` spec guarded by four pinned digests and two
  mechanized gates. **Note it under "Discovered issues" in the PR body so the
  architect can route it; do not do it here.**
- **Do not touch `docs/specs/WP-ep2-retention-prune-timing-test.md`.** It is parked
  with a `SUPERSEDED-PENDING` banner; retiring it is the owner's call.
- **Do not re-run or re-record any other mutation row.**

## Open design questions

**All three must be settled by the design round. None is left for an implementer
to decide silently.**

1. **THE SEAM — the central open question.** Two candidates were measured at
   `622ca04b`; neither is chosen here.
   - **Candidate A — wrap the closure.** Call `makeGates` in the test, wrap the
     returned `pruneRedacted` in a counter, and inject it. **Blocked as stated:**
     `src/cli/dream.js:33-38` destructures `makeGates` at require time and `:1060`
     calls its own captured binding, so there is no injection point today. Adopting
     A would require a production seam, which puts `src/` in the Deliverables and
     makes this a different, larger package.
   - **Candidate B — count the prune's directory read.**
     `t.mock.method(fs, 'readdirSync', …)`, counting calls whose resolved first
     argument is `<stateDir>/quarantine/redacted/`. That read is
     `pruneRedactedOriginals`'s first action after the `stateDir` guard (`:1174`),
     the suite already mocks `fs` members this way (`:939`, `:987`), and it needs no
     production change. **Its cost:** it observes the *helper's* read rather than
     the *closure's* invocation, so a mutation that made `pruneRedacted` fire twice
     while the helper returned early both times would be invisible. Whether that
     matters depends on P-6, which is a duplicate-invocation mutation over a fixture
     seeded above the cap — but the design round must confirm the fixture puts the
     directory above the cap, or the mutation is unobservable through B.
   **Decide, pin the choice in Table P, and add the fixture precondition B needs if
   B wins.**
2. **Does the fixture need the `redacted/` directory seeded above the cap?** Under
   candidate B, `pruneRedactedOriginals` returns before its `readdirSync` only when
   `stateDir` is absent — the cap check comes *after* the read — so the read fires
   regardless of directory size. That reading says no seeding is needed. **It is
   stated as a question rather than a fact because it was read from the source and
   not executed**, and this family of packages has a recorded history of exactly
   that error.
3. **Should the zero-redaction leg (P-5) be a second `test()` or a second
   `runDream` inside the one test?** The Deliverables boundary says **exactly one
   test**, which forces the second option, and one RED declaration naming one title
   is simpler. But two legs in one body make the failing-assertion identity that
   `expectRed` names coarser. **Confirm the one-test shape or amend P-1 and the
   Deliverables together.**

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

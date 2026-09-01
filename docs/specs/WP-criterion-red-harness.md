---
id: WP-criterion-red-harness
title: Ship the RED-proof runner — a declared mutation, machine-applied, that must redden a named assertion
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0031, ADR-0042]
epic: test-quality
---

# WP-criterion-red-harness: ship the RED-proof runner

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): every tool this repo ships runs and exits.
Nothing here starts a process that outlives its job.

The repo's evidence rule is already both-directions — a new verification step is
trusted only after a real green on the compliant state **and** a real red on a
deliberately broken one. That rule is sound; keeping it *by hand* is what failed.
Across the promote-in family's review rounds, **more than ten vacuous
(false-green) assertions** were found — tests that pass whether or not the thing
they claim to check is true. Every one was found by mutation or by value-dumping;
**none** by an existence check or by a criterion→test-name mapping, which is
structurally blind to the class (a vacuous test exists and passes, which is
exactly what a mapping certifies). The owner ruled the mutation proof, not the
mapping, the load-bearing piece.

Three of the six measured failure shapes (Table C) were failures of the
*evidence-gathering itself*, not of the test under it: mutations that were never
applied because shell escaping mangled the injection and the unapplied runs read
as greens; a probe that located the git index *through* the production seam it
was measuring and so reddened three cells for its own reason rather than the
cell's; and infrastructure that died silently — a decoupled guard sitting at
3 pass / 0 fail while enforcing nothing, and the standing trap that a
`--test-name-pattern` matching nothing exits 0 with a pass count.

This WP ships the mechanism that makes those preconditions machine-checked: a
**RED proof** — a declared exact-substring mutation plus the set of named
assertions it must redden — and the **RED-proof runner** that applies it inside a
disposable copy of the repository, proves it landed, requires exactly the
declared assertions to fail for their own stated reason, restores, and requires
green again. ADR-0042 records the decision and its lane; it is **Proposed and
unsigned**, and this WP does not wait on it (Out of scope explains what the
signature unlocks and what it does not).

**Naming, because the obvious word is taken.** `docs/GLOSSARY.md:5` defines
**harness** as *the AI CLI tool Wienerdog installs into* — Claude Code or Codex
CLI. This WP's id keeps the word for queue continuity and **never uses it in that
other sense**: the artifact is the *RED-proof runner*, and the two new terms are
added to the glossary here.

## Current state

Every claim below is runnable at `49d3d467`.

- **The test entry.** `npm test` is `node tests/with-temp-root.js tests/run.js`
  (`package.json`, whose `"//"` key states the rule: any script that runs tests
  goes through the temp-root wrapper). `tests/run.js` is 12 lines: it sets
  `WIENERDOG_TEST_NO_REAL_SCHEDULER: '1'` for the whole suite and spawns
  `node --test` with its own argv forwarded, so `--test-reporter`,
  `--test-name-pattern` and a file path all pass through.
  `tests/with-temp-root.js` runs `process.execPath [<script.js>, ...args]` — a
  Node script path plus arguments, never a shell command — with TMPDIR/TMP/TEMP
  pointed at one run-scoped directory it deletes afterwards.
- **`scripts/` today** holds `boundary-check.js`, `check-frontmatter.js`,
  `gen-agents-md.js`, `lint.js`, `measure-secret-fp.js`, `mirror-walk.js` and two
  shell scripts. All are plain Node ≥ 18 or bash, zero runtime dependencies,
  exit-coded. **`scripts/mirror-walk.js` is the precedent this WP follows**: a
  scripts-hosted checker that states its own narrowed claim in its header, prints
  a `REACH` footer saying what a green does and does not establish, carries an
  explicit vacuity guard (a run that reads zero files exits 1 in every mode), and
  exits 1 with every offender named.
- **The adoption target.** `tests/unit/dream-pipeline.test.js` (1668 lines)
  carries the index guard: `watchIndexWrites(vault)` returns
  `{ spawnGit, violations, seen, classify }`, and three parameterised tests named
  ``dream-pipeline: the run does not touch the user's git index — at all,
  <layout> vault (row G8)`` for layouts `plain`, `separate-git-dir` and
  `linked-worktree`. Each carries, by hand, the family's non-vacuity canaries —
  `classify` must reject an unpinned shape, must reject the two-token
  `read-tree --index-output=<user index>` and `show --output=<user index>`
  redirects, and must still accept `show HEAD:reports/warnings.md` and
  `rev-parse HEAD`, so that a matcher accepting everything and a matcher
  rejecting everything both fail — plus `seen.length > 0`, and a whole-index
  byte-identity comparison. The pinned call set lives in
  `tests/unit/dream-pipeline.known-calls.js` and its source form is held by a
  SHA-256 constant, `KNOWN_CALLS_SOURCE_DIGEST`, in the test file.
  **Measured runtime of that one suite file at `49d3d467`: 14.6 s
  (`duration_ms 14589`, 44 tests, 0 fail).**
- **A production-side mutation reaching that guard exists.** `src/cli/dream.js`
  builds the private index environment at exactly one site — the `indexEnv`
  constant, `{ ...process.env, GIT_INDEX_FILE: tmpIndex }`. This is stated as an
  existence proof that a single-substring production mutation can redden the
  index guard; **which mutations the adopted set declares is the implementer's**.
- **Nothing runs mutation proofs today.** `package.json` has no such script.
  `.github/workflows/ci.yml` has four jobs: `lint`, `test` (ubuntu + macOS),
  `boundary`, `pr-title`.
- **The permission boundary.** `scripts/boundary-check.js` admits, without
  listing, only this spec file, `package-lock.json`, `memory/lessons/inbox.md`
  and `docs/specs/logbook/`. A Deliverables path ending in `/` allows that
  directory tree.
- **`docs/adr/0042-machine-run-red-proofs.md` already exists on this branch**,
  written by the architect in this spec's commit. It is not a Deliverable and the
  implementer does not touch it (Out of scope).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | scripts/red-proofs.js | the runner. CLI, declaration schema and phase order per Tables A, B and D; its report ends with a REACH footer stating Table C's limits |
| create | tests/red-proofs/dream-pipeline.proofs.js | the adopted declaration set for `tests/unit/dream-pipeline.test.js`; coverage property in acceptance criterion 9 |
| create | tests/unit/red-proofs.test.js | the runner's own suite, run by `npm test`; exercises the runner against the fixture repo below, never against a real suite |
| create | tests/fixtures/red-proofs/ | the repository tree(s) the runner's own tests point `--root` at. What Tables A and D require of **any** root, and therefore of these: a `tests/red-proofs/` declaration directory, a `tests/run.js` the runner spawns to start the suite, a `suite` path resolving inside the tree, and a `file` the declarations can mutate. **The trees' number and contents are the implementer's** — with one structural consequence to plan around, not a prescription: a LOAD-phase ERROR aborts a whole run, so the deliberately invalid declarations criterion 1 requires cannot all be reachable from one root |
| modify | package.json | add exactly one script entry, per Table D |
| modify | docs/GLOSSARY.md | add the two new terms, **RED proof** and **RED-proof runner**, and nothing else |

### Exact contracts

```text
node scripts/red-proofs.js [--root <dir>] [--wp <WP-id>] [--proof <proof-id>]
```

`--root` defaults to the repository root containing the script, and **implies the
declaration directory `<root>/tests/red-proofs`** — one flag, not two.
`--wp` and `--proof` select a subset; a selection matching nothing is a vacuous
run, not an empty success (Table B, row V2).

A declaration file is CommonJS with no dependencies:

```js
'use strict';
module.exports = {
  suite: 'tests/unit/<name>.test.js',
  proofs: [ /* one object per Table A */ ],
};
```

The two glossary entries are these definitions, copied — not reworded:

```text
RED proof — a committed declaration (`tests/red-proofs/*.proofs.js`) naming one exact-substring mutation and the set of named assertions it must make fail. Its unit of meaning is one acceptance criterion of one work package. (Not: "mutation test", "red test".)
RED-proof runner — `scripts/red-proofs.js`, run by `npm run red-proofs`. It applies each RED proof inside a disposable copy of the repository, proves the mutation landed, requires exactly the declared assertions to fail, restores, and requires green again. It never writes outside its copy. (Not: "harness" — that word names the AI CLI Wienerdog installs into.)
```

## Contract reference

Activation (ADR-0031, 2-of-7 — three are true): (i) a new interface **shape** is
introduced (the declaration format); (iii) structured input **parsing and schema
acceptance** is introduced (its validation); (vi) **successor specs and every
future declaration set inherit the contract**.

### Table A — the RED-proof declaration

The single place the declaration's facts are decided. Every field is validated at
LOAD; a violation is an ERROR naming the declaration file and the proof id, never
a skip and never a pass.

| Field | Required | Value / rule |
|-------|----------|--------------|
| `suite` | yes | repo-relative path of the test file the proofs run; must exist inside the sandbox |
| `proofs` | yes | array; **empty is an ERROR**, not a clean run over nothing |
| `proofs[].id` | yes | kebab slug, unique across every declaration file under the declaration directory; the `--proof` selector |
| `proofs[].wp` | yes | the spec id whose criterion this proves, `WP-<slug>` |
| `proofs[].criterion` | yes | string — the criterion label exactly as that spec writes it (`3`, `4a`) |
| `proofs[].why` | yes | one sentence naming the vacuity this red rules out; printed in the roll-up, so a reader sees what the proof is for without opening the spec |
| `proofs[].file` | yes | repo-relative path of the file mutated |
| `proofs[].find` | yes | exact substring. Not a regex, not a pattern, never passed through a shell |
| `proofs[].replace` | yes | exact replacement; must differ from `find` and must contain `marker` |
| `proofs[].marker` | yes | the token that proves the mutation landed. Must be **ABSENT** from the pristine `file` and **PRESENT** after the write — a marker already present proves nothing |
| `proofs[].occurrences` | no (default 1) | the exact number of times `find` must occur in the pristine `file`. Any other count is an ERROR |
| `proofs[].testNamePattern` | no | forwarded to `--test-name-pattern` to scope the run. Scoping never weakens the BASELINE requirement (Table B, row 3) |
| `proofs[].expectRed` | yes | non-empty array of `{ test, signal }`. `test` is the full test name; `signal` is a substring that must appear in that test's failure diagnostic. **The set of failing tests observed must EQUAL the set of `test` values** — an unlisted failure is an ERROR, because a red whose reason is not the cell's is not a measurement |

### Table B — the phases, in order, and what each rules out

A proof is `PROVEN` only when all seven rows hold. Rows `V*` are the runner's own
vacuity guard and apply to the run as a whole.

| # | Phase | What must hold | What it rules out |
|---|-------|----------------|-------------------|
| 1 | LOAD | at least one declaration file; at least one proof after selection; every Table A rule satisfied | a run over nothing; a malformed declaration read as a skip |
| 2 | SANDBOX | the `--root` tree is copied to a disposable directory the run deletes; `suite` and every `file` resolve inside it; **no path outside it is written** | crash residue; a dirty-checkout false red; a tool that edits the developer's tree (ADR-0042 decision 3) |
| 3 | BASELINE | the suite runs green in the sandbox **and every `expectRed[].test` is observed as a test that RAN and PASSED** in that run | a renamed or deleted test; a `testNamePattern` matching nothing, which exits 0 with a pass count; a suite already red for ambient reasons |
| 4 | APPLY | `find` occurs exactly `occurrences` times in the pristine `file`; `marker` absent from it; after the write, `marker` present and the file's SHA-256 changed | the measured shell-escaping class — a mutation never applied and read as a green; a marker that certified nothing because it was already there |
| 5 | RED | the suite re-runs; the observed failing-test set **equals** the `expectRed` test set, and each carries its `signal` | a vacuous assertion, which stays green; a red for a reason that is not the cell's — the measured production-seam class |
| 6 | RESTORE | the pristine bytes are written back, the file's SHA-256 equals the pristine digest, and the suite runs green again | a red caused by ambient state rather than by the mutation |
| 7 | REPORT | per-proof verdict, rolled up per `(wp, criterion)`; the report ends with the REACH footer stating Table C's limits | a green read as "this criterion is non-vacuous" |
| V1 | — | zero declaration files found | an empty scan and a clean scan reading identically |
| V2 | — | zero proofs after `--wp` / `--proof` selection | a typo'd selector reporting success over nothing |
| V3 | — | zero mutations applied while the run reports success | the infrastructure dying silently, which is this WP's own failure shape |
| V4 | — | exit 0 **only** when at least one proof ran and every proof reached `PROVEN`; every other outcome exits non-zero with `VACUOUS` or `FAILED` and names every offender | a non-zero-but-ignored verdict; a partial run read as a pass |

### Table C — the six measured shapes, the runner's reach, and the standing limit

The first six rows are the shapes; the last is the limit that holds over all of
them. Each shape occurred at least once, in the promote-in family's review rounds
(`memory/lessons/inbox.md`, `docs/specs/done/WP-dream-promote-in-workspace.md`
row W1(c), `docs/specs/done/WP-show-slot-own-value-kind.md`). **Reach is stated
honestly: an honest limit is fine, a silent one is not.**

| Shape | Reach |
|-------|-------|
| a guard that cannot fail because the test itself established the condition it certifies | **ENFORCED once declared.** The mutation breaks the thing the guard reads; a guard that stays green is a FAILED proof, and the criterion is reported unproven |
| a non-vacuity guard whose pattern matches an unrelated fixture line | **REACHABLE ONLY IF DECLARED.** A mutation that removes the intended content while leaving the unrelated line must redden the guard. The runner cannot tell that the declared mutation is the *right* one |
| infrastructure dying silently — the guard must notice its own death | **ENFORCED, on the runner itself.** Rows 3, 4, V1–V4: a run that read nothing, selected nothing, applied nothing, or whose named tests never ran, exits non-zero |
| a mutation "matrix" whose mutations were never applied (shell escaping) | **ENFORCED.** Row 4: exact-substring replacement in Node, an occurrence count, a marker absent-then-present, and a changed digest. No shell touches the mutation path |
| a canary differing from the exploit by ARITY, dying before the slot under test | **REACHABLE ONLY IF DECLARED.** Mutate the slot the canary claims to exercise: a canary that stays green is arity-blind. Argument count is not a property the runner can inspect |
| an endpoint comparison blind to a transient write-then-restore effect | **REACHABLE ONLY IF DECLARED.** A mutation that writes then restores must redden the comparison; if it does not, the comparison is blind and the proof FAILS |
| **THE STANDING LIMIT, printed in the report** | A green proves that each **declared** mutation reddens the **named** assertions and only those. It does **not** establish that the declared set is complete, that a criterion carries any proof at all, or that a test is non-vacuous in a way nobody declared. **Completeness is a review judgment; there is no criterion-inventory check** — locating criteria inside spec prose was retired by measurement (`WP-show-slot-own-value-kind`: a checker that must find its subject inside a large file enumerates the ways the format can hide it, and that never closes) |

### Table D — the lane

| Fact | Value |
|------|-------|
| Entry | `npm run red-proofs` → `node tests/with-temp-root.js scripts/red-proofs.js` — the temp-root wrapper fronts it, per `package.json`'s `"//"` rule |
| Never in `npm test` | `npm test` does not run RED proofs. A proof re-executes a whole suite once per mutation, the adopted suite measuring 14.6 s per run (Current state), and `npm test` must stay a fast, side-effect-free regression signal (ADR-0042 decision 2) |
| Suite invocation | the runner spawns the **sandbox's** `tests/run.js`, never `node --test` directly, so `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` applies to every suite it starts. The env var is set in exactly one place and this WP does not add a second |
| Reporter | TAP (`--test-reporter=tap`, forwarded through `tests/run.js`), so failing test names and their diagnostics are machine-readable |
| Production seams | the runner requires **nothing under `src/`** and nothing outside Node's standard library, and spawns no `git`. Instrumentation through the production seam is itself an unrecognised call under a default-deny guard — measured, and the reason this row exists |
| CI | **no CI job in this WP.** ADR-0042 records the lane decision and gates the job on its signature (Out of scope) |

### Mirrored Surface Checklist

Every surface in this spec that mirrors a table above, so one finding updates the
table and all its mirrors in one pass, and a mirror found in review is added here
on the spot.

- [ ] **Deliverables-table cells** — the `scripts/red-proofs.js` row (cites A, B,
      D, and Table C's standing-limit row for the report's REACH footer), the
      `tests/red-proofs/dream-pipeline.proofs.js` row (cites criterion 9's
      coverage property), the
      `tests/fixtures/red-proofs/` row (states what Tables A and D require of any
      `--root`, and cites criterion 1 for the invalid declarations — it
      prescribes no fixture contents), the `package.json` row (cites Table D), the
      `docs/GLOSSARY.md` row — whose two entries are the byte-exact block under
      "Exact contracts", copied rather than reworded, so the definition is
      decided in one place
- [ ] **Acceptance criteria** — 1 asserts Table A; 2 asserts Table B's order and
      row 4; 3 asserts row 3; 4 asserts row 5; 5 asserts row 6; 6 asserts
      V1–V4; 7 and 12 assert row 2; 8 asserts Table D's seam and suite-invocation
      rows; 9 asserts the adoption coverage; 10 asserts Table B row 7 and Table
      C's standing-limit row; 11 asserts Table D's "never in `npm test`" row; 13
      asserts nothing in these tables
- [ ] **Verification commands** — the vacuous-selection red (V2), the
      working-tree diff (row 2), the two guarded negated greps (Table D's seam
      row and its "never in `npm test`" row). Both greps are a **FLOOR on source
      text only**, and the both-directions paragraph says so
- [ ] **Current-state description** — the entry chain and `tests/run.js`'s env
      var (Table D), the measured 14.6 s (Table D's `npm test` row), the
      `mirror-walk.js` precedent (Table B row 7, Table C's standing-limit row), the
      `indexEnv` existence proof (criterion 9)
- [ ] **Operative prose** — Context's three evidence-gathering failures (Table C
      rows 3–4 and Table D's seam row) and its naming paragraph (the `harness`
      collision, mirrored by the glossary block and by Out of scope's last
      bullet); "Exact contracts" (`--root` implying the declaration directory:
      Table A's `id` uniqueness scope and Table B's V1/V2; and the two glossary
      definitions);
      Implementation notes (the sandbox mechanics for Table B row 2, and the
      named temp-directory residual)
- [ ] **ADR-0042** — its decisions 1–5 restate Tables B, C and D at ADR altitude.
      It is **unsigned**: while it stays Proposed it moves with these tables. Once
      the owner signs it, a divergence is fixed by a new dated amendment, never by
      rewriting it (ADR-0035's discipline: no agent writes, moves or reformats an
      owner signature line). **Its STATUS string has a second copy**, in
      `docs/adr/README.md`'s index row, which mirrors it in full by family
      convention — so the owner's signature moves two surfaces, not one. Both are
      outside this WP's Deliverables and neither is the implementer's to touch

## Implementation notes & constraints

- **Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step; no
  TypeScript in `src/` and none here** (CLAUDE.md). The runner runs and exits —
  no daemon, no server, no telemetry (ADR-0004).
- **The sandbox (Table B row 2).** The mechanics are the implementer's; a
  known-workable one is `fs.cpSync` of the `--root` tree with a filter
  excluding `.git` and `node_modules`, then a symlink for `node_modules` so the
  copy resolves the same modules — the tracked tree measured 20 MB at
  `49d3d467`. Whatever the mechanism, BASELINE green in the sandbox is what
  proves the copy is equivalent, so a sandbox that silently loses something
  cannot pass.
- **Named residual:** an interrupted run leaves its sandbox directory behind
  under the temp root. The working tree is unaffected by construction (nothing
  outside the sandbox is written), and `tests/with-temp-root.js` scopes and
  deletes the run's temp root when the run completes. This is the same residual
  that wrapper already documents for signal-terminated runs, and it is not
  widened here.
- **Do not add a second place that sets `WIENERDOG_TEST_NO_REAL_SCHEDULER`.**
  Spawning the sandbox's `tests/run.js` is what keeps it at one (Table D).
- **Failure-set identification is a property, not a parser.** The runner must
  determine which named tests failed and what their diagnostics said; TAP is the
  reporter because it is machine-readable. How it is read is the implementer's.
- **Do not enumerate criteria out of spec markdown**, and do not add a check that
  a spec's criteria all carry proofs — Table C's standing-limit row records why that
  direction was retired by measurement.
- Test design, fixture topology and the choice of mutations are the
  implementer's; the criteria state the properties and the evidence required.
- **Ambiguity → the simpler option, recorded under "Decisions made"** in the PR
  body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted identifier
      reaches a filesystem path or a shell command.** Declaration files are
      committed, developer-authored repository content, not input from a user
      machine, and the runner spawns `process.execPath` with an argument array —
      never a shell command string, and never a `find`/`replace` value on a
      command line.
- [ ] **The one security-relevant property: the runner writes nothing outside its
      own disposable sandbox** (Table B row 2, criterion 7). It ships nothing to
      a user machine — `package.json`'s `files` list is `bin/`, `src/`, `skills/`,
      `templates/`, none of which this WP touches — and it adds no runtime
      dependency, no network access and no process that outlives the run.
- [ ] **Named residual:** the interrupted-run sandbox directory, above. It
      contains only a copy of committed repository content.

## Acceptance criteria

- [ ] 1. **The declaration format is Table A, and a violation is an ERROR.**
      Every required field's absence, and every stated rule's violation —
      `replace` equal to `find`, `replace` not containing `marker`, a duplicate
      `id`, an `occurrences` count that does not match, a `marker` already
      present in the pristine file, an empty `proofs` array — is reported as an
      ERROR naming the declaration file and the proof id, and exits non-zero.
      Never a skip, never a pass.
- [ ] 2. **The phases run in Table B's order and each rules out what its row
      names.** In particular a proof cannot reach RED without APPLY having proved
      the mutation landed (`marker` absent → present, digest changed).
- [ ] 3. **BASELINE proves the named tests exist and pass before anything is
      mutated.** A declared `expectRed[].test` that does not RUN in the baseline —
      renamed, deleted, or excluded by `testNamePattern` — is an ERROR, not a
      pass. Show it against a pattern that matches nothing, which `node --test`
      reports as 0 failures.
- [ ] 4. **RED is the cell's own.** With the mutation applied, the observed
      failing-test set equals the declared set and each carries its `signal`. A
      green run, an unlisted failing test, or a missing `signal` each makes the
      proof FAILED and the run exit non-zero. Show all four outcomes.
- [ ] 5. **RESTORE closes the loop.** The pristine digest is restored and the
      suite is green again; a restored run that is still red is an ERROR — the
      red was ambient, not the mutation's.
- [ ] 6. **The runner's own vacuity guard, observed in both directions.** Zero
      declaration files, zero proofs after selection, and zero mutations applied
      each exit non-zero with a `VACUOUS` verdict. **A run over an empty
      declaration set must be shown RED**, beside a real green on the adopted
      set — a runner that reports green on nothing is the exact failure it
      exists to catch.
- [ ] 7. **Nothing outside the sandbox is written.** `git status --porcelain` is
      byte-identical before and after a full run, and after a run in which a
      proof FAILED. No clean-tree precondition is needed, and none is added.
- [ ] 8. **No production seam is borrowed** (Table D). The runner requires
      nothing under `src/` and nothing outside Node's standard library, spawns no
      `git`, and starts every suite through the sandbox's `tests/run.js` rather
      than `node --test`, so the scheduler guard applies to every child.
- [ ] 9. **Adopted on one existing suite, and `npm run red-proofs` reports every
      proof PROVEN.** `tests/red-proofs/dream-pipeline.proofs.js` declares **at
      least two** proofs against `tests/unit/dream-pipeline.test.js`, satisfying
      both: **(a)** at least one whose `file` is under `src/`, so the runner is
      shown reaching production code; **(b)** at least one whose `expectRed`
      names one of that guard's own non-vacuity canaries (Current state lists
      them), so a canary is shown to be non-vacuous. **Those canaries live inside
      the three parameterised tests, not in tests of their own, so it is the
      `signal` that names the canary and the `test` that names its host.** Which
      mutations achieve this is the implementer's.
- [ ] 10. **The report states its own reach.** Every run — green or red — ends
      with a footer carrying Table C's standing limit in the runner's own output,
      following `scripts/mirror-walk.js`'s `REACH` precedent, so a green is never
      read as "this criterion is non-vacuous".
- [ ] 11. **`npm test` does not run RED proofs** (Table D). The runner's own
      suite runs against `tests/fixtures/red-proofs/` via `--root` and loads no
      declaration from `tests/red-proofs/`, so `npm test` starts no real suite
      through the runner.
- [ ] 12. **Idempotency:** two consecutive `npm run red-proofs` runs give the
      same verdict and leave `git status --porcelain` byte-identical — the
      command writes nothing outside its disposable sandbox.
- [ ] 13. `npm test` and `npm run lint` pass; `boundary-check` is clean.

## Verification steps (run these; paste output in the PR)

```bash
# The runner's own suite. GUARDED: a path or --test-name-pattern matching
# nothing exits 0 with a pass count.
test -f tests/unit/red-proofs.test.js && npm test -- tests/unit/red-proofs.test.js
npm test
npm run lint

# Criterion 9 — the adopted proofs. Capture the exit code as its own statement,
# never behind a pipe.
npm run red-proofs
echo "red-proofs exit=$?"

# Criterion 6 — the vacuity guard, RED. This is an ASSERTION, not a printed
# number: the leading `!` makes the whole statement exit non-zero if the runner
# ever exits 0 over a selection matching no proof.
! npm run --silent red-proofs -- --proof no-such-proof-exists \
  && echo "vacuity guard: an empty selection exits non-zero"

# Criterion 7 — a full run leaves the working tree untouched.
git status --porcelain > /tmp/wd-tree-before.txt
npm run red-proofs
git status --porcelain > /tmp/wd-tree-after.txt
diff /tmp/wd-tree-before.txt /tmp/wd-tree-after.txt \
  && echo "working tree unchanged by a full run"

# Criterion 8 — a FLOOR on the runner's source text, not a proof of its imports.
# GUARDED: a bare negated grep passes hardest when the file does not exist.
test -f scripts/red-proofs.js \
  && ! grep -qE "require\('(\.\./)+src/" scripts/red-proofs.js \
  && echo "the runner imports nothing from src/"

# Criterion 11 — the same FLOOR caveat: npm test does not enter the proof lane.
test -f package.json \
  && ! grep -q '"test": .*red-proofs' package.json \
  && echo "npm test does not run the RED-proof lane"

# The permission boundary. Run on the IMPLEMENTATION branch, whose diff is this
# WP's own.
node scripts/boundary-check.js docs/specs/WP-criterion-red-harness.md \
  $(git diff --name-only main...HEAD)
```

**Both directions are required for every NEW assertion**, and each is a real run
pasted in full — a green on the finished state and a red on a deliberately broken
one:

- the vacuity guard: green on the adopted set, RED on an empty declaration
  directory and on the unmatched `--proof` selector above (criterion 6);
- the working-tree diff: green after a full run, and green again after a run in
  which a proof FAILED (criterion 7);
- **both guarded negated greps in all THREE states** — file absent → RED, file
  compliant → green, file violating → RED. They establish only that the source
  text lacks a pattern; criterion 8's substance rests on criterion 9's pasted
  runs and on review;
- every ERROR and FAILED outcome criteria 1, 3, 4 and 5 enumerate, each shown as
  a non-zero exit with the offender named. Those criteria own their lists and
  this inventory does not restate them.

## Out of scope (do NOT do these)

- **`docs/adr/0042-machine-run-red-proofs.md`** — already written by the
  architect in this spec's commit. Do not author it, do not revise it, and **do
  not sign it**: replacing its `Status: Proposed — awaiting owner signature` line
  is the owner's act and no agent may make it (ADR-0035). It is deliberately not
  a Deliverable.
- **The CI job.** ADR-0042 decision 2 records that the lane gets one; adding a
  blocking PR gate before the ADR is signed would put the doctrine in force ahead
  of the ruling. Successor: `WP-red-proofs-ci-lane` **(proposed id; not yet
  filed — no such spec exists under `docs/specs/`)**.
- **Making any spec *require* machine-run REDs** — the runbook and template
  changes (the stub's fourth "done means" item) are the doctrine, and they wait
  on the same signature. Successor: `WP-red-proofs-doctrine` **(proposed id; not
  yet filed)**, which would own `docs/runbooks/spec-authoring.md` and
  `docs/specs/_TEMPLATE.md`.
- **Widening the adopted declaration set** beyond criterion 9's minimum,
  including the four REDs `WP-index-guard-residuals` criterion 4 requires. That
  WP is **not** a dependency of this one and need not land first: this WP adopts
  what is merged at its base. Successor: `WP-red-proofs-adopt-index-guard`
  **(proposed id; not yet filed)**.
- **Any change to `tests/unit/dream-pipeline.test.js`,
  `tests/unit/dream-pipeline.known-calls.js` or `src/`.** The adopted proofs
  mutate copies inside the sandbox; the tracked files are read, never edited.
  Re-pinning `KNOWN_CALLS_SOURCE_DIGEST` is therefore never owed by this WP.
- **A criterion-inventory check** over spec markdown (Table C's standing-limit row records
  why), and any second place that sets `WIENERDOG_TEST_NO_REAL_SCHEDULER`.
- **Using "harness" as the name of anything this WP ships** — `docs/GLOSSARY.md`
  owns that word for the AI CLI.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, with the
   both-directions pairs above.
2. Conventional commits; PR titled
   `test(scripts): ship the RED-proof runner (WP-criterion-red-harness)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`, not restated here.
   `In-Review` marks the START of review: this list is complete only when review
   is.

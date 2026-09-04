---
id: WP-criterion-red-harness
title: Ship the RED-proof runner — a declared mutation, machine-applied, that must redden a named assertion
status: Done
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
**RED proof** — inert committed data declaring one exact-substring mutation plus
the named assertions it must redden — and the **RED-proof runner** that applies
it inside a fresh, disposable copy of the repository in which no test has yet
run, proves the exact expected bytes landed, requires exactly the declared
assertions to fail **as assertion failures of their own test bodies**, and pairs
that red with a pristine copy running green. ADR-0042 records the decision and
its lane; it is **Proposed and unsigned**, and this WP does not wait on it (Out of scope explains what the
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
  **Measured runtime of that one suite file: 14.6 s at `49d3d467`
  (`duration_ms 14589`, 44 tests, 0 fail), and 15.4 s re-measured during round 4
  of this spec's design gate (`duration_ms 15380`, same counts).** Table D's cost
  model uses both.
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
| create | tests/red-proofs/dream-pipeline.proofs.json | the adopted declaration set for `tests/unit/dream-pipeline.test.js`. **Inert JSON, never executed** (Table A); coverage property in acceptance criterion 9 |
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

**A declaration file is INERT DATA — JSON, parsed and validated, NEVER executed.**
`tests/red-proofs/<name>.proofs.json`:

```json
{
  "suite": "tests/unit/<name>.test.js",
  "proofs": [ ]
}
```

**Why the format is data and not code, since the obvious choice was CommonJS.**
LOAD runs before SANDBOX exists, so an executable declaration runs *before there
is any confinement*: a `.proofs.js` calling `process.exit(0)` ends the run
successfully before a single proof is counted — defeating every vacuity guard in
Table B at once — and one calling `fs.writeFileSync` writes into the real
checkout before the copy is made. "No dependencies" is a convention, not a
mechanism: it cannot stop a built-in or a top-level side effect. JSON has no
execution semantics, so neither attack has a surface. **The runner therefore
loads declarations with `JSON.parse` and never with `require`, `import`, `eval`
or a `Function` constructor**, and every value is validated as data (Table A).

The two glossary entries are these definitions, copied — not reworded:

```text
RED proof — a committed declaration (`tests/red-proofs/*.proofs.json`) naming one exact-substring mutation and the assertions it must make fail. Inert data: it is parsed and validated, never executed. Its unit of meaning is one acceptance criterion of one work package. (Not: "mutation test", "red test".)
RED-proof runner — `scripts/red-proofs.js`, run by `npm run red-proofs`. It applies each RED proof inside a fresh disposable copy of the repository in which no test has yet run, proves the mutation landed, requires the named assertions to fail as assertion failures, and pairs that red with a pristine copy running green. It never writes into a tree that has already run test code. (Not: "harness" — that word names the AI CLI Wienerdog installs into.)
```

## Contract reference

Activation (ADR-0031, 2-of-7 — three are true): (i) a new interface **shape** is
introduced (the declaration format); (iii) structured input **parsing and schema
acceptance** is introduced (its validation); (vi) **successor specs and every
future declaration set inherit the contract**.

### Table A — the RED-proof declaration

The single place the declaration's facts are decided. **The file is inert JSON,
parsed and never executed** ("Exact contracts"). Every field is validated at
LOAD; a violation is an ERROR naming the declaration file and the proof id, never
a skip and never a pass. **Every string field must be non-empty** — an empty
`signal` matches every diagnostic and an empty `find` has no defined replacement
semantics, so emptiness is rejected field by field, not left to good sense.

| Field | Required | Value / rule |
|-------|----------|--------------|
| `suite` | yes | repo-relative path of the test file the proofs run; must exist inside the sandbox |
| `proofs` | yes | array; **empty is an ERROR**, not a clean run over nothing |
| `proofs[].id` | yes | kebab slug, unique across every declaration file under the declaration directory; the `--proof` selector |
| `proofs[].wp` | yes | the spec id whose criterion this proves, `WP-<slug>` |
| `proofs[].criterion` | yes | string — the criterion label exactly as that spec writes it (`3`, `4a`) |
| `proofs[].why` | yes | one sentence naming the vacuity this red rules out; printed in the roll-up, so a reader sees what the proof is for without opening the spec |
| `proofs[].file` | yes | repo-relative path of the file mutated. **It must canonicalise inside the fresh copy at APPLY** (a value resolving outside it — via `..`, an absolute path or a symlink — is an ERROR, criterion 7(a)). **It must NOT be `suite`**, must not be the runner or any file under the declaration directory, and must not be a path the runner itself needs to operate |
| `proofs[].find` | yes | exact non-empty substring. Not a regex, not a pattern, never passed through a shell. **Matching is left-to-right and non-overlapping** |
| `proofs[].replace` | yes | exact replacement; must differ from `find` and must contain `marker`. It may legitimately still contain `find` — the expected-bytes rule below is what decides whether the mutation landed, so no restriction is placed on that |
| `proofs[].marker` | yes | the token that proves the mutation landed. Must be **ABSENT** from the pristine `file` and **PRESENT** after the write — a marker already present proves nothing |
| `proofs[].occurrences` | no (default 1) | a **positive integer**; the exact number of left-to-right non-overlapping occurrences of `find` in the pristine `file`. Any other count is an ERROR. **Every counted occurrence is replaced**, and the expected post-mutation bytes are computed from that; APPLY compares the written bytes against them (Table B row 4) |
| `proofs[].testNamePattern` | no | forwarded to `--test-name-pattern` to scope the run. Scoping never weakens the BASELINE requirement (Table B, row 3) |
| `proofs[].expectRed` | yes | non-empty array of `{ test, signal }`, no two entries sharing a `test`. **`test` is a hierarchical identity** — a non-empty array of non-empty names, outermost first, ending at the test itself — never a bare name, because duplicate names across parameterised tests and nested subtests make a bare name ambiguous. `signal` is a non-empty substring that must appear in that test's own failure diagnostic. **THE EQUALITY SET IS OVER OWN-BODY TERMINAL FAILURES** (see the identity rules below); an observed own-body failure that is not declared makes the proof **`FAILED`** (Table E2 owns every verdict, and this row states no other), because a red whose reason is not the cell's is not a measurement |

**Identity, ancestors and the equality set.** A test runner reports a nested
failure more than once, so "the failing set" needs a rule or every nested
assertion is either a violation of equality or a violation of own-body
attribution. **Measured on Node v25.9.0 during round 2 of this spec's design
gate:** a nested assertion failure emits `not ok` for the CHILD with code
`ERR_ASSERTION`, and then `not ok` for its PARENT with
`failureType: subtestsFailed`.

- The **equality set is over OWN-BODY terminal failures** — the nodes that failed
  in their own body. Declared identities are compared against that set.
- An **ancestor** whose failure is `subtestsFailed` and is mechanically
  attributable to a declared descendant is **permitted and not counted** — it is
  propagation, not an unlisted failure, and it need not be declared.
- **A PEER's own-body failure is an unlisted own-body failure, so it is
  `FAILED`** — not ERROR. The line runs between *kinds of failure*, not between
  declared and undeclared: an undeclared test failing its own assertion is a red
  the proof did not account for (`FAILED`), while an ancestor **not**
  attributable to a declared descendant is propagation the runner cannot
  attribute, and that is `ERROR` (Table E2).
- If a declared identity matches **more than one** observed node, the run is an
  ERROR. **Measured on the same Node:** two nested tests sharing a name emit two
  indistinguishable `[parent, child]` identities, so hierarchy alone does not
  disambiguate them. **The runner refuses; it never picks one.**

**Scoping interacts with identity, and it was measured rather than assumed.**
On Node v25.9.0, a `--test-name-pattern` matching a PARENT runs its children,
while a child-only pattern and a full-path pattern each ran **zero** tests. So a
`testNamePattern` cannot be assumed to select a declared identity: **BASELINE
requires each declared identity to actually run, and a pattern that would
exclude one is an ERROR** (Table B row 3), never a quiet zero-test pass. A
pattern that selects nothing is the **unmatched-pattern class pinned below** —
zero tests RAN under either of its two pinned reporter shapes.

**The TAP shapes this spec relies on, pinned with their provenance.** Measured on
**Node v25.9.0** during round 2 of this spec's design gate: an own-body assertion
failure carries `failureType: testCodeFailure` with code **`ERR_ASSERTION`**; a
non-assertion thrown error carries the SAME `failureType: testCodeFailure` but
code **`ERR_TEST_FAILURE`** — so `failureType` alone does NOT separate an
assertion from a thrown error, and the code is what does; a propagated ancestor
carries `failureType: subtestsFailed`. Node documents reporter output as unstable
for programmatic use, so **an expected field that is absent on the running Node
is a loud ERROR** (criterion 4a) — never an assumption that a failure was an
assertion.

**THE UNMATCHED-PATTERN CLASS — pinned on TWO Nodes, because a one-version pin
was falsified by this repository's own CI.** A `--test-name-pattern` that matches
no test does not report itself uniformly; the reporter shape is
version-dependent. **Both observed shapes are normative here, and a proof, a
parser or a test that recognises only one is wrong on the other:**

| Node | Observed shape when the pattern matches nothing | Exit |
|------|------------------------------------------------|------|
| **≥ 25** — measured **v25.9.0**, round 2 of this spec's design gate | an **inner `1..0` plan** under an outer file-level `ok`: zero test points inside | **0** |
| **20.x** — measured **v20.20.2**, PR #204 round 1, CI run `33627135545`, ubuntu **and** macOS | **no zero-plan at all**: every test is reported as one `ok N - <name> # SKIP test name does not match pattern` line (`ok: true`, `directive: 'SKIP'`) | **0** |

**The runner's rule is identical under both, and it is the RULE — not either
shape — that the runner implements: an unmatched pattern is an ERROR because
ZERO TESTS RAN** (criterion 3), whether the reporter says so with an empty plan
or by marking every test SKIP. Note what the two shapes share and what a naive
check does with them: both exit 0, neither emits a `not ok`, and **"the run was
green" passes under both** — which is why this class is pinned in the contract
rather than left to the parser's discretion.

**Measurement provenance, so the two data points are the repository's own.** CI
runs Node 20 on every job (`.github/workflows/ci.yml`, `node-version: 20`, ubuntu
and macOS) while this spec's design-gate rounds measured a local Node 25 — so the
two pinned shapes are exactly the two Nodes this repository actually executes
tests on, not a survey. **This WP does NOT raise `engines` and does NOT add a CI
matrix leg**; both stay parked owner options (Out of scope — the owner's
2026-09-02 ruling parked them per this spec's recommendations).

**What a proof may mutate, and why the rule is not just `file !== suite`.** The
mutation must target the **condition or input the named assertion observes** —
never the assertion itself, its expected literal, its message, or the file that
hosts it. Replacing an assertion's expected value with a wrong one makes the
named test fail, restores cleanly, and reports PROVEN while the behaviour under
test never moved: the proof would then certify only that the assertion can be
edited. The three mechanical rules in the `file` row (not `suite`, not the
runner, not a declaration) block the direct form of that move; **the general
property is a review judgment and is named as such in Table C's standing-limit
row.** A mutation is also not permitted to work by breaking the module so it
fails to parse or load — Table B row 5 requires the RED to be an *assertion*
failure of the named test.

### Table B — the phases, in order, and what each rules out

A proof is `PROVEN` only when every numbered row holds. Rows `V*` are the
runner's own vacuity guard and apply to the run as a whole.

| # | Phase | What must hold | What it rules out |
|---|-------|----------------|-------------------|
| 1 | LOAD | declarations are read with `JSON.parse` and **never executed**; at least one declaration file; at least one proof after selection; every Table A rule satisfied | a run over nothing; a malformed declaration read as a skip; **a declaration that exits, writes or otherwise acts before confinement exists** — LOAD precedes SANDBOX, so an executable format would run unconfined |
| 2 | SNAPSHOT | **THE INVARIANT: no two phases share any writable path THE RUNNER PROVIDES, and the runner never writes into a tree in which suite code has already run.** Before any suite code runs, the runner takes ONE snapshot of the `--root` tree and records a **copy manifest** over its declared domain (Table E). Every phase copy is derived from that snapshot and **verified against the manifest before use**; a copy error, a missing entry, a mode difference or a digest mismatch is an ERROR | a concurrent edit to `--root` mid-run; a silently truncated or partial copy; **"the trees differ only by the declared mutation" being ASSERTED rather than established** |
| 2a | COPY | each phase gets its OWN copy, which the run deletes. **The copy contains NO `node_modules` and no dependency link of any kind**, and **the copy step REFUSES symlinks: any symlink encountered in the source tree is an ERROR naming its path.** A copy is either written by the runner (before any child starts in it) or executed (after which the runner writes nothing into it) — never both, in that order | the check/use race the one-copy design carried — a suite replacing the validated target, or a parent of it, with a symlink into the real checkout so a later write follows it out; **and the shared dependency target: measured, `fs.cpSync` recreates an outward symlink AS a symlink, and writing through the copied path changes the external file** |
| 2b | PHASE ISOLATION | **THE PROVIDED SET, redirected per phase INTO that phase's own copy** (e.g. `<copy>/.red-proofs-tmp/`, `<copy>/.red-proofs-home/`): the working directory; `TMPDIR`, `TMP`, `TEMP`; `HOME`; the four `XDG_CONFIG_HOME` / `XDG_CACHE_HOME` / `XDG_DATA_HOME` / `XDG_STATE_HOME`. **THE WIENERDOG NAMES GO THE OTHER WAY — every name in `src/core/paths.js`'s exported `OVERRIDE_VARS` (today `WIENERDOG_HOME`, `WIENERDOG_VAULT`, `WIENERDOG_CLAUDE_DIR`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `paths.js:11`) is REMOVED from each phase's environment, never set to a phase-local path.** Measured at PR #204 round 1 and reproduced by the reviewer: **any SET `WIENERDOG_CLAUDE_DIR` beats the `CLAUDE_CONFIG_DIR` the adopted suite installs for its own children**, because `getPaths` takes `WIENERDOG_CLAUDE_DIR` ahead of it (`src/core/paths.js:56-61`) — a phase-local value reddened BASELINE at **37 of 44** tests, so "set it into the copy" and criterion 9 could not both hold. **Removal preserves the property the redirect was for:** all five names DEFAULT under `HOME` (`paths.js:54-62` — `home`, `core`, `vault`, `claudeDir`, `codexDir`), and `HOME` IS redirected, so `getPaths(phaseEnv(copy))` still resolves every one of those roots **inside that phase's own copy**. The runner carries the name list as a constant and **its own suite asserts the constant still covers `OVERRIDE_VARS`, failing `npm test` on drift** (criterion 8b) — so the list moves with the code without the runner importing it. **Additionally the copies' COMMON PARENT is held non-writable (mode 0500) for the lifetime of each child and restored on exit**, closing the direct `..` write; **and each phase copy is created, manifest-verified and locked immediately before its OWN phase, so no unused copy exists while another phase's child runs, and nothing writable the runner provides is reachable from a phase copy by traversal** (criterion 7(b2) requires both refusals observed; the mechanism is the implementer's). Anything else a suite writes to is **outside the provided set** — see the lane limit below | **the shared-state channels, all measured:** the wrapper fronts the runner ONCE and injects only `TMPDIR`/`TMP`/`TEMP` (`tests/with-temp-root.js:186`), while `tests/run.js:7` spreads `process.env`, so **`HOME` was identical across phases**; and a sentinel written by BASELINE to the copies' writable common parent (`../sentinel`) **was observed by RED**. Either lets a stateful suite pass → redden the declared assertion → pass for a reason that is not the mutation. **A missed name is not a subtle risk: measured, running the adopted row with an ambient absolute `WIENERDOG_CLAUDE_DIR` made BASELINE FAIL with the git-seam canary unexercised — the developer's own environment breaking the lane.** **And a 0500 parent alone does not close traversal, demonstrated end-to-end at PR #204 round 1: with all three copies created up front under one 0500 parent, a BASELINE child traversed the parent (r-x permits traversal) into the sibling `red` copy, planted `../red/subject/subject.js`, and APPLY then read the planted bytes; the same channel exists one level up, where a 0500 parent still lets a child write `../../counter` into the writable sandbox above it** |
| 3 | BASELINE | in a manifest-verified PRISTINE copy — one the runner has not written to — the suite runs green, and each declared identity is observed **exactly once, as a terminal PASS**, with no SKIP, TODO or CANCELLED record matching it; duplicate observed identities, and any file-, parse-, load-, hook- or suite-level failure, are ERRORs | a renamed or deleted test; a `testNamePattern` matching nothing — **under EITHER of Table A's two pinned unmatched-pattern shapes, both of which exit 0 and neither of which emits a `not ok`; the rule this row enforces is ZERO TESTS RAN, never one Node's reporter shape (Table A's unmatched-pattern class is cited here, not restated)**; a duplicate name letting one instance pass while another is skipped; a suite already red for ambient reasons |
| 4 | APPLY | a **FRESH manifest-verified copy is made and no child has run in it**; `file` canonicalises inside THAT copy — one that does not is an ERROR, and because nothing has executed there the check cannot be raced; `find` occurs exactly `occurrences` times (left-to-right, non-overlapping) in the pristine `file`; `marker` absent from it; **every counted occurrence is replaced and the written bytes EQUAL the expected post-mutation bytes computed from that replacement**; `marker` present afterwards | the measured shell-escaping class — a mutation never applied and read as a green; a marker that certified nothing because it was already there; **a "digest changed" postcondition that a partial or overlapping replacement also satisfies** |
| 5 | RED | the suite runs in the MUTATED copy; the observed own-body failing-identity set **equals** the declared set on Table A's rules; **each declared failure is an ASSERTION failure of that test's own body** — not a parse, load, hook, timeout or cancellation — and its diagnostic carries the entry's `signal` | a vacuous assertion, which stays green; a red for a reason that is not the cell's — the measured production-seam class; **a mutation that "works" by making a module fail to load, which never reaches the assertion at all** |
| 6 | CONTROL (was RESTORE) | **nothing is restored, because nothing was mutated in place.** The control is a **FRESH pristine copy, run AFTER RED**, in its own isolated phase — and it must be green. The mutated copy and both pristine copies derive from the one manifest-verified snapshot, so they differ only by the declared mutation. **A post-RED control is REQUIRED for PROVEN: a pair resting on BASELINE's earlier green alone is reported `UNCONTROLLED` and is not PROVEN** | a red caused by ambient state, ordering or drift rather than by the mutation. Reusing BASELINE's green is observability, not a counterfactual: it cannot rule out that the suite turned red between the two runs for a reason the mutation did not cause |
| 7 | REPORT | per-proof verdict; a `(wp, criterion)` roll-up reports **PROVEN only when every declaration for that pair was selected, ran and passed** — otherwise `FILTERED`, naming what was left out. The report ends with the REACH footer stating Table C's limits, described over the **selected** evidence | a green read as "this criterion is non-vacuous"; **a `--proof`-filtered run reporting a criterion PROVEN on one of its two proofs** |
| V1 | — | zero declaration files found | an empty scan and a clean scan reading identically |
| V2 | — | zero proofs after `--wp` / `--proof` selection | a typo'd selector reporting success over nothing |
| V3 | — | zero mutations applied while the run reports success | the infrastructure dying silently, which is this WP's own failure shape |
| V4 | — | exit 0 **only** when at least one proof ran, every proof reached `PROVEN`, and no criterion is `FILTERED`. **Every verdict, its exit class and the precedence when several apply are Table E2's** — this row adds no taxonomy of its own | a non-zero-but-ignored verdict; **a partial run read as a pass — a `--proof`-filtered selection whose selected proofs all pass would otherwise satisfy a literal "every proof PROVEN" exit condition** |

**Why a copy with no dependencies and no symlinks is possible here, measured
rather than hoped.** At `9870f79a`: every `require()` under `tests/` resolves to
a Node builtin (`fs`, `path`, `node:*`) — there is no third-party import in the
test tree — and the review shadows ran the **full suite green, twice, in detached
worktrees that contain no `node_modules` directory at all**. Separately,
`git ls-files -s | awk '$1=="120000"'` returns **zero tracked symlinks**, so the
refusal in row 2a rejects nothing that exists today; **the rule is what keeps it
that way**, and it is a refusal precisely because a symlink introduced later must
stop the lane rather than silently widen it.

**THE LANE LIMIT, and why the invariant is narrowed rather than hardened.**
Isolating a child's filesystem *completely* needs OS-level confinement — a
sandbox, a container, a mount namespace. Wienerdog is just files and starts no
such thing (ADR-0004), and nothing portable across macOS, Linux and Windows is
available to a zero-dependency Node script. So the universal claim is
**withdrawn** rather than defended: the runner controls the paths it hands the
child, and **a suite that writes anywhere outside the provided set is UNSUPPORTED
BY THE LANE** — a limit printed in the REACH footer, never a guarantee. Named
residuals, both outside the lane: **absolute locations the runner does not own**
(`/dev/shm`, a hard-coded `/tmp/...`, any absolute path a suite chooses), and **a
suite that chmods its way out** of the non-writable parent. That is the same
**same-user boundary `docs/THREAT-MODEL.md` already draws for A12** — code
running as the user can reach anything the user can — and this WP does not
re-draw it.

**The adopted suite sits inside the provided set, measured.**
`tests/unit/dream-pipeline.test.js:40-43` declares its `ENV_KEYS` as `HOME`,
`WIENERDOG_HOME`, `WIENERDOG_VAULT`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME` (plus its
fake-clock and `PATH` keys) and overrides them per child onto directories under
`os.tmpdir()`. Every one of those is in the provided set above, which is why
criterion 9's adoption is sound under the narrowed contract — **and why the set
is enumerated from what the suites actually rely on rather than guessed.**
**This is also exactly why row 2b REMOVES the Wienerdog names instead of setting
them:** the suite installs its own `CLAUDE_CONFIG_DIR` per child, and `getPaths`
puts `WIENERDOG_CLAUDE_DIR` ahead of it (`paths.js:56-61`), so a phase-local
`WIENERDOG_CLAUDE_DIR` would override the suite's own redirect — measured at
PR #204 round 1 as BASELINE 37/44 red. With the names removed, the suite's
`ENV_KEYS` redirect stands and every derived root still lands under the phase's
redirected `HOME`.

**The consequence, stated so it is not read as an oversight:** a suite that
genuinely needs an installed dependency is **outside this lane**. Its declaration
would fail at BASELINE for a missing module, and **that is an honest red, not a
lane bug** — the runner reports it as the ERROR it is, and the suite is either
made builtin-only or left out of the lane.

### Table C — the six measured shapes, the runner's reach, and the standing limit

The first six rows are the shapes; the last is the limit that holds over all of
them. Each shape occurred at least once, in the promote-in family's review rounds
(`memory/lessons/inbox.md`, `docs/specs/done/WP-dream-promote-in-workspace.md`
row W1(c), `docs/specs/done/WP-show-slot-own-value-kind.md`). **Reach is stated
honestly: an honest limit is fine, a silent one is not.**

| Shape | Reach |
|-------|-------|
| a guard that cannot fail because the test itself established the condition it certifies | **ENFORCED once declared, FOR A RELEVANT MUTATION.** The mutation breaks the thing the guard reads; a guard that stays green is a FAILED proof, and the criterion is reported unproven. The mechanical half — the mutation is not the assertion, its host suite, the runner or a declaration, and the RED is an assertion failure — is enforced by Table A's `file` row and Table B row 5. **Whether the mutation targets what the assertion actually observes is not machine-decidable and is carried by the standing-limit row below** |
| a non-vacuity guard whose pattern matches an unrelated fixture line | **REACHABLE ONLY IF DECLARED.** A mutation that removes the intended content while leaving the unrelated line must redden the guard. The runner cannot tell that the declared mutation is the *right* one |
| infrastructure dying silently — the guard must notice its own death | **ENFORCED, on the runner itself.** Rows 3, 4, V1–V4: a run that read nothing, selected nothing, applied nothing, or whose named tests never ran, exits non-zero |
| a mutation "matrix" whose mutations were never applied (shell escaping) | **ENFORCED.** Row 4: exact-substring replacement in Node, a left-to-right non-overlapping occurrence count, a marker absent-then-present, and **written bytes equal to the computed expected bytes** — not merely "the digest changed", which a partial replacement also satisfies. No shell touches the mutation path |
| a canary differing from the exploit by ARITY, dying before the slot under test | **REACHABLE ONLY IF DECLARED.** Mutate the slot the canary claims to exercise: a canary that stays green is arity-blind. Argument count is not a property the runner can inspect |
| an endpoint comparison blind to a transient write-then-restore effect | **REACHABLE ONLY IF DECLARED.** A mutation that writes then restores must redden the comparison; if it does not, the comparison is blind and the proof FAILS |
| **THE STANDING LIMIT, printed in the report** | A green proves that each **selected declared** mutation reddens the **named** assertions, only those, and as assertion failures. It does **not** establish: that the declared set is **complete**; that a criterion carries any proof at all; that a test is non-vacuous in a way nobody declared; or — **the limit this round added** — that a declared mutation is SEMANTICALLY RELEVANT, i.e. that it changes the condition the assertion observes rather than something merely upstream of the same failure. The mechanical rules reject the direct self-mutation move, not every indirect one. **Completeness and relevance are review judgments; there is no criterion-inventory check** — locating criteria inside spec prose was retired by measurement (`WP-show-slot-own-value-kind`: a checker that must find its subject inside a large file enumerates the ways the format can hide it, and that never closes) |

### Table D — the lane

| Fact | Value |
|------|-------|
| Entry | `npm run red-proofs` → `node tests/with-temp-root.js scripts/red-proofs.js` — the temp-root wrapper fronts it, per `package.json`'s `"//"` rule |
| Never in `npm test` | `npm test` does not run RED proofs. **Each proof costs THREE suite executions (BASELINE, RED, post-RED CONTROL) and THREE manifest-verified copies**, none shared. The adopted suite measured **14.6 s** (round 1) and **15.4 s** (round 4) per run, so the adopted two-proof lane costs **~90 s of suite runtime minimum**, plus one snapshot and six copy/manifest operations. `npm test` must stay a fast, side-effect-free regression signal (ADR-0042 decision 2) |
| Suite invocation | the runner spawns the **sandbox's** `tests/run.js`, never `node --test` directly, so `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` applies to every suite it starts. The env var is set in exactly one place and this WP does not add a second |
| Reporter | TAP (`--test-reporter=tap`, forwarded through `tests/run.js`), so hierarchical identities, terminal statuses and failure diagnostics are machine-readable. **Node documents reporter output as subject to change between versions, and Table A pins each shape with the Node version it was measured on — v25.9.0, plus v20.20.2 for the unmatched-pattern class, which is the Node CI runs** — so the parser's compatibility evidence is criterion 4b: the runner's own TAP fixtures run under whatever Node executes `npm test`, **asserting version-tolerant invariants rather than one Node's parse tree**, and the report names the Node version it ran on |
| Node floor — **THE LANE'S, NOT THE REPOSITORY'S** | `--test-reporter=tap` landed in Node **18.15.0** and `--test-name-pattern` in **18.11.0**, while `package.json` declares `>=18` — so Node 18.0–18.14 cannot run this lane at all. The runner **checks `process.versions.node` at LOAD and REFUSES below 18.15.0**: exit non-zero with `UNSUPPORTED` and a plain message naming the flag and the version, never a vacuous pass and never a silent skip. **`npm test` and every other repository entry point are unaffected, and this WP does NOT raise `engines`** — that is the owner's product decision, parked in Out of scope |
| Write boundaries | **NO TWO PHASES SHARE ANY WRITABLE PATH THE RUNNER PROVIDES** — the qualifier is load-bearing, not hedging. (1) The runner's only write into any tree is the declared mutation, into a **fresh manifest-verified copy in which no child has run** — containment is a property of the phase order, not of a check that can be raced. (2) Each phase gets its own working directory, temp, `HOME` and the four XDG roots — all inside its own copy — while **row 2b's `OVERRIDE_VARS`-derived Wienerdog names (`WIENERDOG_CLAUDE_DIR` included) are REMOVED from the phase environment rather than set, so their roots land inside that phase's copy via the redirected `HOME`**; the copies' common parent is non-writable while a child runs, and each copy is created, verified and locked immediately before its own phase so no sibling copy is reachable by traversal. **This cell CITES row 2b's set, its removal rule and its copy lifetime, and never restates any of them.** (3) A copy carries no `node_modules`, no dependency link and no symlink at all. **A suite writing outside that provided set is unsupported by the lane, not guarded.** Table B rows 2, 2a and 2b own this; criterion 7 states what each check can establish |
| Production seams | the runner requires **nothing under `src/`** and nothing outside Node's standard library, and spawns no `git`. Instrumentation through the production seam is itself an unrecognised call under a default-deny guard — measured, and the reason this row exists. **This removes one contamination class; it is not on its own a proof that a red is the cell's** (ADR-0042 decision 4). **The rule survived round 5 intact:** the name list row 2b REMOVES from each phase environment must track `paths.js`'s `OVERRIDE_VARS`, but the runner carries a constant and **its own SUITE** does the drift check (criterion 8b) — a test importing `src/` is unremarkable, so the runner keeps importing nothing and criterion 8's grep is unchanged |
| CI | **no CI job in this WP.** ADR-0042 records the lane decision and gates the job on its signature (Out of scope) |

### Table E — the snapshot domain, and the total verdict/exit taxonomy

**E1 — the snapshot's declared domain and recorded facts.** A manifest of
relative path, size and digest is blind to exactly the differences that change
how a suite behaves: **measured this round, two trees compared manifest-EQUAL
across a 0755→0644 mode change and across a missing empty directory**, and this
repo tracks executable fixtures (`tests/fixtures/dream/fake-brain.js` is
`100755`). So the snapshot is defined over **every `lstat` entry in the domain**,
and the domain is part of the contract rather than an implementation note.

| Fact | Value |
|------|-------|
| Domain | every entry under `--root` **except `.git/` and `node_modules/`**, which are excluded by declaration here — not by an implementation note. A suite that depends on the root being a git repository is **outside the lane** (its BASELINE fails honestly) |
| Recorded per FILE | entry type, **mode bits**, size, content digest |
| Recorded per DIRECTORY | entry type and **mode bits** — so an empty directory is a manifest entry and its loss is detectable |
| Unsupported entry types | **symlink, device, socket, FIFO — each an ERROR naming the path** (row 2a's refusal, stated once here) |
| Verification | each phase copy is compared to the manifest **before use**; any missing entry, extra entry, type difference, mode difference, size difference or digest mismatch is an ERROR |

**E2 — the total verdict taxonomy.** Every verdict, where it can be reached, and
its exit class. **Partial evidence is never success in automation**, so `FILTERED`
exits non-zero like every other non-`PROVEN` outcome.

| Verdict | Applies to | Meaning | Exit |
|---------|-----------|---------|------|
| `PROVEN` | proof, criterion, run | every phase held; for a criterion, **every** declaration for it was selected, ran and passed | 0 — **the only zero** |
| `FAILED` | proof, criterion, run | a phase's condition was not met: the mutated copy stayed green, the observed own-body failing set differed from the declared one — **including an undeclared PEER failing its own assertion** — a `signal` was absent, or a declared failure was not an own-body assertion failure | non-zero |
| `ERROR` | proof, criterion, run | **reserved for the runner being unable to obtain a trustworthy result at all** — never for a red it simply did not expect: schema violation, unsupported entry type, manifest mismatch, escape refusal, a declared identity that did not run or ran more than once (ambiguous identity), an absent expected TAP field, **non-own-body propagation the runner cannot attribute**, or any file-, parse-, load-, hook- or suite-level failure | non-zero |
| `UNCONTROLLED` | proof, criterion, run | RED was observed but no fresh post-RED pristine control was run (Table B row 6) | non-zero |
| `FILTERED` | criterion, run | not every declaration for the criterion was selected, so its evidence is partial — **even when every selected proof is `PROVEN`** | non-zero |
| `VACUOUS` | run | zero declaration files, zero proofs after selection, or zero mutations applied (V1–V3) | non-zero |
| `UNSUPPORTED` | run | the running Node is below the lane's floor (Table D) | non-zero |

| Precedence | Rule |
|------------|------|
| Within a run | `UNSUPPORTED` > `ERROR` > `VACUOUS` > `FAILED` > `UNCONTROLLED` > `FILTERED` > `PROVEN`. The run's verdict is the **highest-precedence verdict any proof or criterion reached**, and the report lists every contributing verdict rather than only the winner |
| `UNSUPPORTED` vs `VACUOUS` at LOAD | the Node floor is checked **first**: a runner that cannot parse the reporter flags cannot report meaningfully on a declaration set, so `UNSUPPORTED` wins even over an empty set |
| `FILTERED` with `FAILED`/`ERROR` | the higher-precedence verdict is the run's, and the criterion is reported as BOTH — a filtered run that also failed is not reported as merely filtered |

### Mirrored Surface Checklist

Every surface in this spec that mirrors a table above, so one finding updates the
table and all its mirrors in one pass, and a mirror found in review is added here
on the spot.

- [ ] **Deliverables-table cells** — the `scripts/red-proofs.js` row (cites A, B,
      D, and Table C's standing-limit row for the report's REACH footer), the
      `tests/red-proofs/dream-pipeline.proofs.json` row (cites criterion 9's
      coverage property), the
      `tests/fixtures/red-proofs/` row (states what Tables A and D require of any
      `--root`, and cites criterion 1 for the invalid declarations — it
      prescribes no fixture contents), the `package.json` row (cites Table D), the
      `docs/GLOSSARY.md` row — whose two entries are the byte-exact block under
      "Exact contracts", copied rather than reworded, so the definition is
      decided in one place
- [ ] **Acceptance criteria** — 1 asserts Table A; **1a asserts Table B row 1's
      inert-load rule**; 2 and **2a** assert Table B row 4; 3 asserts row 3; 4
      asserts row 5; 5 asserts row 6; 6 asserts V1–V4; **6a asserts row 7's
      roll-up rule**; 7 and 12 assert rows 2, 2a and 2b and Table D's
      write-boundaries row; 8 asserts Table D's seam and suite-invocation rows;
      9 asserts the adoption coverage **and Table A's mutation-target rule**; 10
      asserts Table B row 7 and Table C's standing-limit row; 11 asserts Table
      D's "never in `npm test`" row; 13 asserts nothing in these tables.
      **Added in round 2: 4a asserts Table A's identity/ancestor rules and its
      pinned TAP shapes; 5 asserts Table B row 6's redefined CONTROL; 7(b)
      asserts row 2's fresh-copy invariant; and Table D's Node-floor row is
      asserted by the runner's `UNSUPPORTED` refusal. Added in round 3: 4b
      asserts Table D's reporter-compatibility rule; 5 also asserts row 2's
      snapshot/manifest and row 6's `UNCONTROLLED` verdict; 7(b2) asserts row
      2a's no-symlink/no-dependency rules and row 2b's per-phase temp. **Round 5:
      row 2b's `OVERRIDE_VARS`-derived provided set is mirrored by Table D's
      write-boundaries and seam rows, the security checklist and criteria 7/8b —
      all of which CITE row 2b rather than restating the names, so a variable
      added to `paths.js` changes exactly one cell plus criterion 8b's check.** Added in
      round 4: 5 also asserts **Table E1**'s mode and empty-directory facts; 6a
      asserts **Table E2**'s `FILTERED` exit class; 7(b2) asserts row 2b's full
      provided set (parent, `HOME`); 10 asserts the REACH footer's LANE LIMIT**
- [ ] **Added at PR #204 round 1 — three registrations.** (i) **Table A's
      UNMATCHED-PATTERN CLASS** (both pinned reporter shapes and the
      zero-tests-RAN rule) is mirrored by Table A's scoping paragraph, Table B
      row 3's rules-out cell, criterion 3, criterion 4b and Table D's reporter
      row, and by Out of scope's parked `engines` and CI-matrix bullets — every
      one of them CITES the class rather than restating either shape, so a third
      measured Node changes one block plus its provenance note. (ii) **Row 2b's
      REMOVAL rule** for the `OVERRIDE_VARS` names is mirrored by Table D's
      write-boundaries and seam rows, the adopted-suite paragraph after Table B,
      the security checklist's write-boundary item, criteria 7(b2), 8b and 10's
      required footer text, and the `OVERRIDE_VARS`-tracking implementation note.
      (iii) **Row 2b's per-phase copy lifetime** (created, manifest-verified and
      locked immediately before its own phase; nothing writable reachable by
      traversal) is mirrored by Table D's write-boundaries row, the security
      checklist's write-boundary item, and criterion 7(b2)'s sibling-copy and
      writable-ancestor refusals
- [ ] **Table E's mirrors** — E1 is mirrored by Table B row 2 (the manifest
      cited, not restated), row 2a's entry-type refusal, and criterion 5's three
      rejection cases; E2 is mirrored by Table B row V4 and row 7's roll-up, by
      Table A's `expectRed` verdict word, by criteria 4/5/6/6a/7's verdict names,
      and by ADR-0042's consequences. **No other surface states an exit class**
- [ ] **Verification commands** — the vacuous-selection red (V2), the
      tracked-checkout diff (rows 2/2b, and it is labelled with what it cannot
      see), the two guarded negated greps (Table D's seam row and its "never in
      `npm test`" row). Both greps are a **FLOOR on source text only**, and the
      both-directions paragraph says so; that paragraph also carries the
      roll-up pair (6a) and the escape ERRORs (7a)
- [ ] **Current-state description** — the entry chain and `tests/run.js`'s env
      var (Table D), the measured suite runtimes feeding Table D's cost model
      (`npm test` row), the
      `mirror-walk.js` precedent (Table B row 7, Table C's standing-limit row), the
      `indexEnv` existence proof (criterion 9)
- [ ] **Operative prose** — Context's three evidence-gathering failures (Table C
      rows 3–4 and Table D's seam row) and its naming paragraph (the `harness`
      collision, mirrored by the glossary block and by Out of scope's last
      bullet); "Exact contracts" — the JSON shape and the **why-not-CommonJS
      paragraph** (Table B row 1, ADR-0042 decision 1 and its rejected
      alternative), `--root` implying the declaration directory (Table A's `id`
      uniqueness scope and Table B's V1/V2), and the two glossary definitions;
      **Table A's mutation-target paragraph** (Table C's first row and
      standing-limit row, criterion 9); Implementation notes (the sandbox
      mechanics and its no-dependency-link warning for Table B rows 2a and 2b,
      the copy budget and the LINEAGE note for row 2's invariant, the
      identity/failure-kind note for row 5, and the named temp-directory
      residual); **the measured provenance paragraph after Table B, which carries
      row 2a's no-deps/no-symlink basis**; **Out of scope's
      parked `engines` bullet, which mirrors Table D's Node-floor row**
- [ ] **ADR-0042** — its decisions 1–5 restate Tables B, C, D and E at ADR
      altitude; **decision 3 carries Table B row 2's fresh-copy invariant, the
      round-4 narrowing and the rejected hardening alternative; decision 2 and
      the consequences carry Table D's cost model and Table E2's `FILTERED`
      exit rule — each moves with its table**.
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
- **The sandbox (Table B rows 2, 2a and 4).** The mechanics are the
  implementer's; a known-workable one is `fs.cpSync` of the `--root` tree with a
  filter excluding `.git` **and `node_modules`** — the tracked tree measured
  20 MB at `49d3d467`. **Do NOT link `node_modules` back in.** An earlier draft
  of this note did, and round 3 measured why it is wrong: the link is a writable
  path every phase shares, and restricting the RUNNER's writes does nothing about
  the SUITE's. The tests need no dependency tree (see the measured provenance
  under Table B). Whatever the mechanism, a manifest-verified copy plus BASELINE
  green is what proves the copy is equivalent, so a sandbox that silently loses
  something cannot pass.
- **Copy budget, since the invariant costs copies. THREE per proof, none
  shared.** BASELINE, APPLY/RED and the post-RED CONTROL each get their own copy,
  all derived from the one manifest-verified snapshot and all deleted after.
  **The round-2 note that a baseline copy could be shared across proofs is
  WITHDRAWN**: each child's temp directory now lives inside its own copy, so
  sharing a copy would put two phases on one writable path — exactly what the
  invariant forbids. The copies carry **no `node_modules`**, so each is the
  tracked tree alone (20 MB at `49d3d467`, and less without dependencies) —
  cheap beside the ~14 s suite run each phase spends anyway. **Do not optimise by
  reusing a copy a child has run in, or by sharing one between phases: that
  reuse IS the defect this design removes.**
- **How the name list tracks `OVERRIDE_VARS`, and the two mechanisms NOT
  taken.** **Row 2b decides what the runner DOES with those names — it REMOVES
  them from each phase environment; this note decides only how the LIST stays
  current.** The list must move with `src/core/paths.js` or it silently rots —
  round 5 measured an ambient `WIENERDOG_CLAUDE_DIR` failing BASELINE from the
  developer's environment alone. **Taken:** a constant in the runner, with the
  runner's OWN SUITE asserting it covers `OVERRIDE_VARS` (criterion 8b).
  **Rejected (a): the runner imports `paths.js` and iterates the export.** The
  list would move silently, but it puts a `src/` import inside the runner —
  weakening Table D's bright line and forcing criterion 8's cheap grep to grow an
  exception, and coupling the runner to a production symbol's shape. **Rejected
  (b): a hard-coded list plus a drift check inside the runner.** Same import,
  same grep exception, and the check would run only when the lane runs.
  **The suite-side check dominates both**: the runner stays seam-free, the grep
  is unchanged, the contract is readable in one place, and drift is caught on
  every `npm test` rather than only when someone runs the lane.
- **LINEAGE, so a closed frame is not reopened.** Containment took three review
  rounds and moved twice: **single copy** (round 1 — the "nothing outside the
  sandbox is written" claim was unsatisfiable) → **fresh copy per phase**
  (round 2 — the single copy let a suite swap the validated target for a symlink
  between check and write) → **no shared writable path at all** (round 3 — fresh
  directories still shared one TMPDIR, one real `node_modules`, and symlinks that
  `fs.cpSync` recreates as symlinks) → **no shared writable path THE RUNNER
  PROVIDES, with the rest declared out of lane** (round 4 — the universal claim
  was false without OS-level confinement, which ADR-0004 and portability put out
  of reach: `HOME` was shared across phases and a sentinel passed through the
  copies' common parent). The first three moves deleted a step that had to be
  right; **the fourth deleted a CLAIM that could not be kept** — the same fixed
  point one level up. **Re-proposing a shared copy, a shared temp root, a
  dependency link, or a universal "nothing is shared" guarantee is re-opening a
  frame that measurement closed.**
- **Named residual:** an interrupted run leaves its sandbox directory behind
  under the temp root. The tracked checkout is unaffected by construction (the
  runner's only writes go into fresh copies), and `tests/with-temp-root.js` scopes
  and deletes the run's temp root when the run completes. This is the same
  residual that wrapper already documents for signal-terminated runs, and it is
  not widened here.
- **The spawned suite IS confined to its own copy now, and that changed in round
  3** (Table B row 2b). The adopted suite `mkdtemp`s under `os.tmpdir()`;
  pointing each child's TMPDIR/TMP/TEMP inside its own copy was optional in
  round 2 and is **required** here, because the outer wrapper fronts the runner
  once and would otherwise hand every phase the same temp root — a channel by
  which BASELINE seeds state that RED observes.
- **Do not add a second place that sets `WIENERDOG_TEST_NO_REAL_SCHEDULER`.**
  Spawning the sandbox's `tests/run.js` is what keeps it at one (Table D).
- **Identity, terminal status and failure kind are properties, not a parser.**
  The runner must determine which declared identities ran, whether each reached a
  terminal PASS, which failed, whether a failure was an assertion failure of the
  test's own body rather than a load/parse/hook/timeout event, and what its
  diagnostic said. TAP is the reporter because it carries all of that; **how it
  is read is the implementer's.** Node's TAP diagnostics expose the distinction
  (a test-code assertion failure versus other failure types) — use whatever field
  the running Node version actually emits, and fail loudly if it is absent rather
  than assuming a failure was an assertion. **The measured shapes and the Node
  floor are pinned under Table A** — note especially that `failureType` alone
  does not separate an assertion from a thrown error; the error CODE does.
- **Do not enumerate criteria out of spec markdown**, and do not add a check that
  a spec's criteria all carry proofs — Table C's standing-limit row records why that
  direction was retired by measurement.
- Test design, fixture topology and the choice of mutations are the
  implementer's; the criteria state the properties and the evidence required.
- **DOCUMENTED FALLBACK IF THE SESSION RUNS LONG: criterion 9 is the clean
  cut.** This WP is sized M on the judgement that the adoption is two
  declarations while the volume sits in the runner's own fixture matrix. If that
  judgement proves wrong in the session — **and the concrete trigger is the cost
  model in Table D: ~90 s of suite runtime per full lane run, three copies and
  three suite executions per proof, which is what makes iterating on a declared
  mutation slow** — **cut criterion 9 — the adoption — into
  `WP-red-proofs-adopt-index-guard` (proposed id; not yet filed)**, together with
  its Deliverables row `tests/red-proofs/dream-pipeline.proofs.json`. Criteria
  1–8 and 10–13 then stand as a coherent, fully verified core: the runner, its
  own suite, the lane entry and every both-directions proof survive the cut
  intact, because none of them depends on the adopted declaration set. **Taking
  the cut is recorded under "Decisions made" in the PR body — never silently**,
  and the PR says which criteria moved so the successor inherits a stated
  boundary rather than a guess.
- **Ambiguity → the simpler option, recorded under "Decisions made"** in the PR
  body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted identifier
      reaches a filesystem path or a shell command.** Declaration files are
      committed, developer-authored repository content, not input from a user
      machine; they are **parsed as JSON and never executed**; and the runner
      spawns `process.execPath` with an argument array — never a shell command
      string, and never a `find`/`replace` value on a command line.
- [ ] **`file` is a path this repo's own content controls, and it is still
      validated as if it were not.** It must canonicalise inside the fresh copy
      at APPLY: `..`, an absolute path and a symlink escape are each an ERROR,
      and the check is on the RESOLVED path, not the literal — a start-anchored
      or literal-only check accepts `a/../../x`. Criterion 7(a) requires each
      escape observed as a red.
- [ ] **The check cannot be raced, and that is structural rather than careful.**
      The validate-then-write pair happens in a copy **in which no child has
      run**, so there is no interval in which suite code can swap the target or a
      parent for a symlink. This replaced a design that validated once and then
      executed the suite before writing — where exactly that swap transiently
      reached the real checkout while every required check stayed green
      (round 2). **No revalidation step exists to get wrong.**
- [ ] **The security-relevant property: NO TWO PHASES SHARE ANY WRITABLE PATH
      THE RUNNER PROVIDES** (Table B rows 2, 2a and 2b). The runner's ONLY write
      into any tree is the declared mutation, into a fresh manifest-verified copy
      no child has run in; each phase's working directory, temp, `HOME` and XDG
      variables point inside its own copy and die with it, while **row 2b's
      `OVERRIDE_VARS`-derived Wienerdog names (`WIENERDOG_CLAUDE_DIR` included —
      cited, not restated) are REMOVED from the phase environment, so their roots
      resolve inside that copy through the redirected `HOME` instead of
      overriding what the suite sets for its own children**; the
      copies' common parent is non-writable while a child runs **and each copy is
      created, verified and locked immediately before its own phase, so a sibling
      copy is not reachable by traversal**; and a copy
      carries no `node_modules`, no dependency link and no symlink. **Restricting
      the RUNNER's writes was not enough: suite code writes too**, which is what
      rounds 2 and 3 measured.
- [ ] **The limit is declared, not implied** (round 4). Full filesystem
      confinement of a child needs OS-level sandboxing, which ADR-0004 and
      portability put out of reach. Absolute paths the runner does not own, and a
      suite that chmods out of the non-writable parent, are **outside the lane** —
      printed in the REACH footer, and the same same-user boundary
      `docs/THREAT-MODEL.md` already draws for A12. **This WP does not re-draw
      that boundary and does not claim to close it.**
      **Neither is a universal "nothing outside is written"**, and criterion 7
      says what its check can and cannot see. The runner ships nothing to a user
      machine — `package.json`'s `files` list is `bin/`, `src/`, `skills/`,
      `templates/`, none of which this WP touches — and adds no runtime
      dependency, no network access and no process that outlives the run.
- [ ] **Named residual:** the interrupted-run sandbox directory, above. It
      contains only a copy of committed repository content.

## Acceptance criteria

- [ ] 1. **The declaration format is Table A, and a violation is an ERROR.**
      Every required field's absence, and every stated rule's violation —
      an empty string in any string field (`signal` and `find` included),
      `replace` equal to `find`, `replace` not containing `marker`, a duplicate
      `id`, a duplicate `test` identity within one `expectRed`, an
      `occurrences` value that is not a positive integer or does not match the
      counted occurrences, a `marker` already present in the pristine file, a
      `file` equal to `suite`, a `file` naming the runner or a declaration, and
      an empty `proofs` array — is reported as an ERROR naming the declaration
      file and the proof id, and exits non-zero. Never a skip, never a pass.
- [ ] 1a. **Declarations are inert.** They are loaded with `JSON.parse` and never
      executed. Show it: a declaration file whose bytes would, under an
      executing loader, terminate the process successfully or write to the
      checkout is instead **rejected as invalid JSON or invalid schema**, and
      the run exits non-zero having written nothing. LOAD precedes SANDBOX, so
      this is the one phase where confinement does not yet exist.
- [ ] 2. **The phases run in Table B's order and each rules out what its row
      names.** In particular a proof cannot reach RED without APPLY having proved
      the mutation landed — `marker` absent → present, and the written bytes
      **equal the expected post-mutation bytes**.
- [ ] 2a. **APPLY's transformation is exact** (Table A's `find`/`occurrences`
      rows). Occurrences are counted left-to-right and non-overlapping; every
      counted occurrence is replaced; the result must equal the computed
      expected bytes. Show that a declaration whose `occurrences` disagrees with
      the counted number is an ERROR, and that a `find` with overlapping
      candidates (`aa` in `aaa`) is counted and replaced by that one rule rather
      than by whichever the implementation happened to pick.
- [ ] 3. **BASELINE proves each declared identity ran, passed, and did so once.**
      A declared identity that does not RUN — renamed, deleted, or excluded by
      `testNamePattern` — is an ERROR, not a pass; so is one observed as SKIP,
      TODO or CANCELLED, one observed more than once, and any file-, parse-,
      load-, hook- or suite-level failure. Show it against a pattern matching
      nothing. **The reporter shape for that case is VERSION-DEPENDENT and Table
      A pins both observed forms — an inner `1..0` plan on Node ≥ 25, every test
      reported `ok … # SKIP test name does not match pattern` on Node 20.x — and
      both exit 0**, so a naive "the run was green" check passes under either.
      This criterion is over the RULE, not the shape: zero tests RAN → ERROR.
      **The demonstration must therefore hold on whatever Node runs `npm test`
      (CI runs Node 20), which means asserting criterion 4b's version-tolerant
      invariants and never a deep-equal against one Node's parse tree.**
- [ ] 4. **RED is an assertion failure of the named test, and the cell's own.**
      With the mutation applied, the observed failing-identity set equals the
      declared set; each failure is a **test-code assertion failure of that
      test's own body**, not a parse, load, hook, timeout or cancellation; and
      each diagnostic carries its non-empty `signal`. A green run, an unlisted
      own-body failing identity, a missing `signal`, and a failure that is not an
      own-body assertion failure each make the proof **`FAILED`** (Table E2), and
      the run exits non-zero.
      Show all five outcomes — **one of them with a mutation that makes the
      module fail to load, which reddens the named test without ever reaching
      its assertion.**
- [ ] 4a. **Nested failures and missing fields are handled by rule, not by
      guess.** A declared identity nested inside a parent is satisfied when the
      CHILD fails in its own body and the parent's `subtestsFailed` propagation
      is attributed to it — that propagation is not an unlisted failure. An
      ancestor not attributable to a declared descendant is an **`ERROR`**
      (unattributable propagation), while **a PEER that fails its own assertion
      is an unlisted own-body failure and therefore `FAILED`, not `ERROR`**
      (Table E2). **Show a peer-own-body fixture asserting that exact verdict**,
      since this is the one place the two verdicts are easy to swap. A declared identity matching more than one observed node is an
      ERROR — **the runner refuses rather than picking one.** And an expected TAP
      field that the running Node does not emit is a loud ERROR, never an
      assumption that a failure was an assertion. Show the nested case and the
      ambiguous-identity refusal.
- [ ] 4b. **The TAP parser's compatibility evidence is a real run, not a claim —
      and its assertions are VERSION-TOLERANT INVARIANTS, never a deep-equal
      against one Node's parse tree.** Table A pins the shapes with their
      measured Node versions; Node documents reporter output as subject to
      change. So the runner's own TAP-parsing fixtures — assertion failure,
      thrown error, nested propagation, skip, and no-match — run as part of
      `npm test`, under **whatever Node executes it**, which makes CI's existing
      ubuntu/macOS matrix the compatibility evidence at no extra lane cost.
      **The runner's report names the Node version it ran on**, so a green is
      always attributable to a version.
      **Why the invariant form is required, measured rather than argued:** a
      deep-equal against the Node 25 unmatched-pattern tree FAILS on Node 20,
      which is the Node CI runs (Table A's unmatched-pattern class). For the
      no-match fixture the required assertions are exactly these three
      invariants, and no fourth: **(i) zero tests RAN; (ii) no `not ok` record
      appears; (iii) the observed identity set is EMPTY once every record
      carrying a SKIP directive is excluded.** The same discipline binds the
      other four fixtures: assert the property the runner depends on, not the
      shape the reporter happened to print.
- [ ] 5. **The CONTROL closes the loop, and nothing is restored** (Table B row
      6). The red is paired with a **fresh pristine copy run AFTER RED**, in its
      own isolated phase, and that copy must be green; a pristine tree that is
      red is an ERROR — the red was ambient, not the mutation's. **A run that
      offers only BASELINE's earlier green is reported `UNCONTROLLED` and is NOT
      PROVEN**; show both outcomes. All three copies derive from the one
      manifest-verified snapshot, so "the trees differ only by the mutation" is
      established rather than asserted. **Show each of these rejected as an
      ERROR: a missing file, a MODE DRIFT (0755→0644 on a tracked executable),
      and a MISSING EMPTY DIRECTORY** — the last two are the cases a
      path/size/digest manifest was measured to pass (Table E1).
- [ ] 6. **The runner's own vacuity guard, observed in both directions.** Zero
      declaration files, zero proofs after selection, and zero mutations applied
      each exit non-zero with a `VACUOUS` verdict. **A run over an empty
      declaration set must be shown RED**, beside a real green on the adopted
      set — a runner that reports green on nothing is the exact failure it
      exists to catch.
- [ ] 6a. **A filtered run never reports a criterion PROVEN on part of its
      evidence** (Table B row 7). With two proofs declared for one
      `(wp, criterion)`, selecting one with `--proof` reports that proof PROVEN
      and the criterion **`FILTERED`**, naming the declaration left out — **and
      the run EXITS NON-ZERO even though every proof it ran passed** (Table E2:
      partial evidence is never success in automation). Only an unfiltered run in
      which both ran and passed reports PROVEN and exits 0. **Show both, with
      their exit codes.**
- [ ] 7. **Containment is a property of the phase order, and it is shown to be**
      (Table B rows 2, 2b and 4). **(a)** A declaration whose `file`
      canonicalises outside the fresh copy — by `..`, by an absolute path, and by
      a symlink, each shown — is an ERROR before any write. **(b) The race the
      one-copy design carried is shown to be CLOSED BY CONSTRUCTION, not
      patched:** with a fixture whose BASELINE run plants a symlink into the real
      checkout at the mutation target's path (and another at a parent of it), the
      proof still writes into a **fresh copy where that symlink does not exist**,
      the checkout is untouched, and no revalidation step is involved. **A
      conforming runner has no window to get wrong, because it never writes into
      a tree a child has run in.** **(b2) NO TWO PHASES SHARE A WRITABLE PATH THE
      RUNNER PROVIDES, shown by SIX fixtures** (Table B row 2b): a suite that
      **writes a sentinel into its temp directory during BASELINE** must not
      observe it during RED; a suite that writes **`../sentinel`, into the
      copies' common parent**, must not observe it either — **and because that
      parent is held at mode 0500 for the child's lifetime, BASELINE's write
      itself FAILS: show that failure, not merely the absence at RED**; a
      suite writing a **HOME-relative sentinel** must not observe it, HOME being
      redirected into each phase's own copy; **and with an ambient absolute
      `WIENERDOG_CLAUDE_DIR` exported into the runner's own environment, no phase
      observes it** — because row 2b REMOVES that name from the phase
      environment, so `getPaths` falls through to a root under the redirected
      `HOME` (`paths.js:56-61` puts `WIENERDOG_CLAUDE_DIR` ahead of
      `CLAUDE_CONFIG_DIR`, which is why setting it would break the adopted suite
      rather than isolate it).
      **The two remaining fixtures are traversal, and they are REQUIRED observed
      refusals because a 0500 parent alone does not stop either** (both
      demonstrated end-to-end at PR #204 round 1): **(i) THE SIBLING-COPY WRITE** —
      a BASELINE child writing `../<other-phase-copy>/<some file>` must be
      refused, and the bytes must never be visible to the phase that owns that
      copy (the reviewer planted `../red/subject/subject.js` from BASELINE and
      APPLY read the planted bytes, because r-x on the parent permits traversal
      into a writable sibling); **(ii) THE WRITABLE-ANCESTOR WRITE** — a child
      writing `../../<name>` into the sandbox directory ABOVE the locked parent
      must be refused, and no later phase may observe it.
      **The contract consequence, already implied by rows 2b, 4 and 6 ("FRESH";
      "verified before use"; no two phases sharing a writable path the runner
      provides), and stated here so it is not left to be inferred: each phase
      copy is created, manifest-verified and locked immediately before its own
      phase, no unused copy exists while another phase's child runs, and nothing
      writable the runner provides is reachable from a phase copy by traversal.
      The MECHANISM that achieves that is the implementer's; this criterion
      requires only the two refusals observed.** Additionally a **source tree
      containing a symlink is an ERROR naming the path**, and a copy carries no
      `node_modules`, so there is no shared dependency target to write through.
      **What this does NOT establish is criterion 10's business:** a suite
      writing to an absolute path the runner does not own is outside the lane. **(c)** `git status --porcelain` is
      byte-identical before and after a full run and after a run in which a proof
      FAILED; **this establishes only that the tracked checkout is unchanged
      NET** — it cannot see a write-then-restore, an untracked write, or a write
      elsewhere on disk, which is exactly why (b) carries the boundary rather
      than this. **(d)** No clean-tree precondition is needed, and none is added.
- [ ] 8. **No production seam is borrowed** (Table D). The runner requires
      nothing under `src/` and nothing outside Node's standard library, spawns no
      `git`, and starts every suite through the sandbox's `tests/run.js` rather
      than `node --test`, so the scheduler guard applies to every child.
- [ ] 8b. **The provided set cannot silently fall behind the code.** The runner's
      name constant — **the names row 2b REMOVES from each phase environment** —
      is asserted by the runner's OWN SUITE to cover
      every name in `src/core/paths.js`'s exported `OVERRIDE_VARS`; a name added
      there and not here fails `npm test` with both lists printed. **The test
      imports `paths.js`; the runner does not** — which is why criterion 8's grep
      is unchanged. Show the drift case red against a local copy of the export
      carrying an extra name.
- [ ] 9. **Adopted on one existing suite, and `npm run red-proofs` reports every
      proof PROVEN.** `tests/red-proofs/dream-pipeline.proofs.json` declares **at
      least two** proofs against `tests/unit/dream-pipeline.test.js`, satisfying
      both: **(a)** at least one whose `file` is under `src/`, so the runner is
      shown reaching production code; **(b)** at least one whose `expectRed`
      names one of that guard's own non-vacuity canaries (Current state lists
      them), so a canary is shown to be non-vacuous. **Those canaries live inside
      the three parameterised tests, not in tests of their own, so it is the
      `signal` that names the canary and the `test` that names its host.**
      **The mutation-to-canary relationship must be stated and checked, not
      assumed:** for (b) the PR must say which input the canary observes and how
      the mutation changes it — a proof that instead edits the canary's expected
      value or its host suite is rejected by Table A's `file` row and does not
      satisfy this criterion. A worked, legitimate shape (**an existence proof,
      not a prescription**): the canary asserts that `classify` rejects the
      two-token `read-tree --index-output=<user index>`, and what it observes is
      the pinned call set, so widening that slot in
      `tests/unit/dream-pipeline.known-calls.js` changes the observed condition
      rather than the assertion. **If that module is the one mutated, note that
      its source form is digest-pinned** — the pin test fails too, so it belongs
      in `expectRed` or must be excluded by `testNamePattern`; Table B row 5's
      EQUAL rule makes an unlisted collateral failure **`FAILED`** (Table E2 —
      it is an undeclared own-body red, not an infrastructure fault), and that is
      the intended behaviour, not an obstacle. Which mutations are declared remains
      the implementer's.
- [ ] 10. **The report states its own reach.** Every run — green or red — ends
      with a footer carrying Table C's standing limit in the runner's own output,
      following `scripts/mirror-walk.js`'s `REACH` precedent, so a green is never
      read as "this criterion is non-vacuous". The footer names **completeness**
      and **semantic relevance of the declared mutation** as the two things it
      does not establish, and describes the run's **selected** evidence — on a
      filtered run it says so rather than saying "each declared mutation".
      **It also prints the LANE LIMIT:** isolation covers only the paths the
      runner provides. **The footer's REQUIRED TEXT, whose facts Table B row 2b
      decides and this criterion only requires printed: the per-phase working
      directory, temp, `HOME` and the four XDG roots live inside that phase's own
      copy, and the Wienerdog `OVERRIDE_VARS` names are REMOVED from the phase
      environment so their roots land inside the copy via that redirected
      `HOME`.** A suite that writes outside that set
      — an absolute path the runner does not own, or a chmod out of the
      non-writable parent — is unsupported by the lane rather than guarded
      against.
- [ ] 11. **`npm test` does not run RED proofs** (Table D). The runner's own
      suite runs against `tests/fixtures/red-proofs/` via `--root` and loads no
      declaration from `tests/red-proofs/`, so `npm test` starts no real suite
      through the runner.
- [ ] 12. **Idempotency:** two consecutive `npm run red-proofs` runs give the
      same verdict and leave `git status --porcelain` byte-identical — the
      runner's only writes are declared mutations into fresh copies it then
      deletes, and each child's scratch stays inside its own copy and dies with
      it (Table B rows 2, 2a and 2b).
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

# Criterion 7(b) — the tracked checkout is unchanged NET by a full run. This
# cannot see a write-then-restore, an untracked write, or a write elsewhere:
# 7(a)'s escape ERRORs are what carry the boundary.
git status --porcelain > /tmp/wd-tree-before.txt
npm run red-proofs
git status --porcelain > /tmp/wd-tree-after.txt
diff /tmp/wd-tree-before.txt /tmp/wd-tree-after.txt \
  && echo "tracked checkout unchanged (net) by a full run"

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
- the roll-up: PROVEN on an unfiltered run over both of a criterion's proofs,
  `FILTERED` on the same criterion with one selected (criterion 6a);
- the working-tree diff: green after a full run, and green again after a run in
  which a proof FAILED (criterion 7b) — **paired with 7(a)'s three escape
  ERRORs (`..`, absolute, symlink), which are what the boundary actually rests
  on**;
- **both guarded negated greps in all THREE states** — file absent → RED, file
  compliant → green, file violating → RED. They establish only that the source
  text lacks a pattern; criterion 8's substance rests on criterion 9's pasted
  runs and on review;
- every ERROR and FAILED outcome criteria 1, 1a, 2a, 3, 4 and 5 enumerate, each
  shown as a non-zero exit with the offender named. Those criteria own their
  lists and this inventory does not restate them. **Two deserve naming as the
  ones this round's gate produced:** the load-failure mutation of criterion 4,
  which reddens the named test without reaching its assertion, and criterion 1a's
  inert-format case.

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
- **RAISING `package.json`'s `engines` FLOOR — a PARKED OWNER OPTION, not a
  precondition and not this WP's to take.** The lane needs Node ≥ 18.15.0 for
  `--test-reporter=tap`, and it enforces that **for itself** by refusing below
  it (Table D). Raising the repository floor from `>=18` would drop support for
  Node 18.0–18.14 for every user of the installer, which is a product decision.
  **Recommendation if the owner ever takes it up: raise it** — those releases are
  long unsupported upstream — but nothing here depends on the answer. **Owner
  ruling 2026-09-02: PARKED per that recommendation. This WP does not raise
  `engines`, and PR #204's Node 20 finding does not reopen it** — the fix for
  that finding is Table A's two-shape pin plus criterion 4b's version-tolerant
  invariants, not a narrower supported range.
- **A SUPPORTED-NODE REPORTER COMPATIBILITY MATRIX — a second parked owner
  option.** Table A's TAP shapes are pinned on the Node versions this repository
  actually runs (v25.9.0 locally, v20.20.2 in CI), and criterion 4b makes CI's
  existing ubuntu/macOS matrix the compatibility evidence. Running the TAP
  fixtures across every supported Node major (18.15, 20, 22, 24, …) would be
  stronger and costs a CI matrix expansion; it is **not** taken here and is
  **not** a precondition. Recommendation: revisit it together with the `engines`
  question, since the two decide the same range. **Owner ruling 2026-09-02:
  PARKED per that recommendation — no CI matrix leg is added by this WP.**
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

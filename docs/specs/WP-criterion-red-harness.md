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
**RED proof** — inert committed data declaring one exact-substring mutation plus
the named assertions it must redden — and the **RED-proof runner** that applies
it inside a disposable copy of the repository, proves the exact expected bytes
landed, requires exactly the declared assertions to fail **as assertion failures
of their own test bodies**, restores, and requires green again. ADR-0042 records the decision and its lane; it is **Proposed and
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
RED-proof runner — `scripts/red-proofs.js`, run by `npm run red-proofs`. It applies each RED proof inside a disposable copy of the repository, proves the mutation landed, requires the named assertions to fail as assertion failures, restores, and requires green again. Its own writes stay inside that copy. (Not: "harness" — that word names the AI CLI Wienerdog installs into.)
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
| `proofs[].file` | yes | repo-relative path of the file mutated. **It must canonicalise inside the sandbox copy** (a value resolving outside it — via `..`, an absolute path or a symlink — is an ERROR, criterion 7(a)). **It must NOT be `suite`**, must not be the runner or any file under the declaration directory, and must not be a path the runner itself needs to operate |
| `proofs[].find` | yes | exact non-empty substring. Not a regex, not a pattern, never passed through a shell. **Matching is left-to-right and non-overlapping** |
| `proofs[].replace` | yes | exact replacement; must differ from `find` and must contain `marker`. It may legitimately still contain `find` — the expected-bytes rule below is what decides whether the mutation landed, so no restriction is placed on that |
| `proofs[].marker` | yes | the token that proves the mutation landed. Must be **ABSENT** from the pristine `file` and **PRESENT** after the write — a marker already present proves nothing |
| `proofs[].occurrences` | no (default 1) | a **positive integer**; the exact number of left-to-right non-overlapping occurrences of `find` in the pristine `file`. Any other count is an ERROR. **Every counted occurrence is replaced**, and the expected post-mutation bytes are computed from that; APPLY compares the written bytes against them (Table B row 4) |
| `proofs[].testNamePattern` | no | forwarded to `--test-name-pattern` to scope the run. Scoping never weakens the BASELINE requirement (Table B, row 3) |
| `proofs[].expectRed` | yes | non-empty array of `{ test, signal }`, no two entries sharing a `test`. **`test` is a hierarchical identity** — a non-empty array of non-empty names, outermost first, ending at the test itself — never a bare name, because duplicate names across parameterised tests and nested subtests make a bare name ambiguous. `signal` is a non-empty substring that must appear in that test's own failure diagnostic. **The set of failing identities observed must EQUAL the set of declared `test` identities** — an unlisted failure is an ERROR, because a red whose reason is not the cell's is not a measurement |

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
| 2 | SANDBOX | the `--root` tree is copied to a disposable directory the run deletes; `suite` and every `file` canonicalise **inside** the copy, and one that does not is an ERROR; **every write the RUNNER performs — the copy, the mutation, the restore — lands inside the copy** (boundary 1 of two; see the row below and Table D) | crash residue; a dirty-checkout false red; a tool that edits the developer's tree (ADR-0042 decision 3); a `file` escaping the copy by `..`, an absolute path or a symlink |
| 2b | SANDBOX (boundary 2) | the spawned suite's own scratch writes go to the **wrapper-owned temp root**, not into the copy: `tests/with-temp-root.js` redirects TMPDIR/TMP/TEMP and deletes that root. Dependency links into the real `node_modules` are **resolution-only** — read, never written through | a claim the runner cannot keep. The adopted suite `mkdtemp`s under `os.tmpdir()`, so a single "nothing outside the sandbox is written" promise is unsatisfiable and would be silently narrowed by any implementation |
| 3 | BASELINE | the suite runs green in the sandbox, and each declared identity is observed **exactly once, as a terminal PASS**, with no SKIP, TODO or CANCELLED record matching it; duplicate observed identities, and any file-, parse-, load-, hook- or suite-level failure, are ERRORs | a renamed or deleted test; a `testNamePattern` matching nothing — **measured this round: an unmatched pattern printed an inner `1..0` under an outer file-level `ok` and exited 0**; a duplicate name letting one instance pass while another is skipped; a suite already red for ambient reasons |
| 4 | APPLY | `find` occurs exactly `occurrences` times (left-to-right, non-overlapping) in the pristine `file`; `marker` absent from it; **every counted occurrence is replaced and the written bytes EQUAL the expected post-mutation bytes computed from that replacement**; `marker` present afterwards | the measured shell-escaping class — a mutation never applied and read as a green; a marker that certified nothing because it was already there; **a "digest changed" postcondition that a partial or overlapping replacement also satisfies** |
| 5 | RED | the suite re-runs; the observed failing-identity set **equals** the declared set; **each failure is an ASSERTION failure of that test's own body** — a test-code assertion failure, not a parse, load, hook, timeout or cancellation — and its diagnostic carries the entry's `signal` | a vacuous assertion, which stays green; a red for a reason that is not the cell's — the measured production-seam class; **a mutation that "works" by making a module fail to load, which never reaches the assertion at all** |
| 6 | RESTORE | the pristine bytes are written back, the file's SHA-256 equals the pristine digest, and the suite runs green again | a red caused by ambient state rather than by the mutation |
| 7 | REPORT | per-proof verdict; a `(wp, criterion)` roll-up reports **PROVEN only when every declaration for that pair was selected, ran and passed** — otherwise `FILTERED`, naming what was left out. The report ends with the REACH footer stating Table C's limits, described over the **selected** evidence | a green read as "this criterion is non-vacuous"; **a `--proof`-filtered run reporting a criterion PROVEN on one of its two proofs** |
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
| Never in `npm test` | `npm test` does not run RED proofs. A proof re-executes a whole suite once per mutation, the adopted suite measuring 14.6 s per run (Current state), and `npm test` must stay a fast, side-effect-free regression signal (ADR-0042 decision 2) |
| Suite invocation | the runner spawns the **sandbox's** `tests/run.js`, never `node --test` directly, so `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` applies to every suite it starts. The env var is set in exactly one place and this WP does not add a second |
| Reporter | TAP (`--test-reporter=tap`, forwarded through `tests/run.js`), so hierarchical identities, terminal statuses and failure diagnostics are machine-readable |
| Write boundaries | **two, and neither is "nothing outside the sandbox".** (1) Runner-controlled writes — copy, mutation, restore — stay inside the copied tree. (2) The spawned suite's scratch writes stay inside the wrapper-owned temp root. Links into the real `node_modules` are resolution-only. Table B rows 2 and 2b own this; criterion 7 states what each check can establish |
| Production seams | the runner requires **nothing under `src/`** and nothing outside Node's standard library, and spawns no `git`. Instrumentation through the production seam is itself an unrecognised call under a default-deny guard — measured, and the reason this row exists. **This removes one contamination class; it is not on its own a proof that a red is the cell's** (ADR-0042 decision 4) |
| CI | **no CI job in this WP.** ADR-0042 records the lane decision and gates the job on its signature (Out of scope) |

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
      roll-up rule**; 7 and 12 assert rows 2 and 2b and Table D's
      write-boundaries row; 8 asserts Table D's seam and suite-invocation rows;
      9 asserts the adoption coverage **and Table A's mutation-target rule**; 10
      asserts Table B row 7 and Table C's standing-limit row; 11 asserts Table
      D's "never in `npm test`" row; 13 asserts nothing in these tables
- [ ] **Verification commands** — the vacuous-selection red (V2), the
      tracked-checkout diff (rows 2/2b, and it is labelled with what it cannot
      see), the two guarded negated greps (Table D's seam row and its "never in
      `npm test`" row). Both greps are a **FLOOR on source text only**, and the
      both-directions paragraph says so; that paragraph also carries the
      roll-up pair (6a) and the escape ERRORs (7a)
- [ ] **Current-state description** — the entry chain and `tests/run.js`'s env
      var (Table D), the measured 14.6 s (Table D's `npm test` row), the
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
      mechanics and the `node_modules` resolution-only note for Table B rows 2
      and 2b, the identity/failure-kind note for row 5, and the named
      temp-directory residual)
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
  cannot pass. **That `node_modules` link is resolution-only** — the runner
  reads through it and never writes through it (Table B row 2b), so it is not a
  hole in boundary 1.
- **Named residual:** an interrupted run leaves its sandbox directory behind
  under the temp root. The tracked checkout is unaffected by construction (the
  runner's own writes go inside the copy), and `tests/with-temp-root.js` scopes
  and deletes the run's temp root when the run completes. This is the same
  residual that wrapper already documents for signal-terminated runs, and it is
  not widened here.
- **The spawned suite is not confined to the copy, and the spec does not pretend
  it is** (Table B row 2b). The adopted suite `mkdtemp`s under `os.tmpdir()`,
  which the wrapper points at its own run root. Redirecting the child's
  TMPDIR/TMP/TEMP *into* the copy is a legitimate implementation choice and would
  tighten boundary 2; it is **not required**, because the wrapper already deletes
  what it scopes and no acceptance criterion rests on the stronger claim.
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
  than assuming a failure was an assertion.
- **Do not enumerate criteria out of spec markdown**, and do not add a check that
  a spec's criteria all carry proofs — Table C's standing-limit row records why that
  direction was retired by measurement.
- Test design, fixture topology and the choice of mutations are the
  implementer's; the criteria state the properties and the evidence required.
- **DOCUMENTED FALLBACK IF THE SESSION RUNS LONG: criterion 9 is the clean
  cut.** This WP is sized M on the judgement that the adoption is two
  declarations while the volume sits in the runner's own fixture matrix. If that
  judgement proves wrong in the session, **cut criterion 9 — the adoption — into
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
      validated as if it were not.** It must canonicalise inside the sandbox
      copy: `..`, an absolute path and a symlink escape are each an ERROR, and
      the check is on the RESOLVED path, not the literal — a start-anchored or
      literal-only check accepts `a/../../x`. Criterion 7 requires the escape
      case observed as a red.
- [ ] **The security-relevant property, stated as the two boundaries it actually
      keeps** (Table B rows 2 and 2b): the runner's own writes — copy, mutation,
      restore — stay inside the copied tree, and the spawned suite's scratch
      writes stay inside the wrapper-owned temp root that the wrapper deletes.
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
      nothing: **measured this round, that prints an inner `1..0` under an outer
      file-level `ok` and exits 0**, so a naive "the run was green" check passes
      there.
- [ ] 4. **RED is an assertion failure of the named test, and the cell's own.**
      With the mutation applied, the observed failing-identity set equals the
      declared set; each failure is a **test-code assertion failure of that
      test's own body**, not a parse, load, hook, timeout or cancellation; and
      each diagnostic carries its non-empty `signal`. A green run, an unlisted
      failing identity, a missing `signal`, and a failure that is not an
      assertion failure each make the proof FAILED and the run exit non-zero.
      Show all five outcomes — **the last one with a mutation that makes the
      module fail to load, which reddens the named test without ever reaching
      its assertion.**
- [ ] 5. **RESTORE closes the loop.** The pristine digest is restored and the
      suite is green again; a restored run that is still red is an ERROR — the
      red was ambient, not the mutation's.
- [ ] 6. **The runner's own vacuity guard, observed in both directions.** Zero
      declaration files, zero proofs after selection, and zero mutations applied
      each exit non-zero with a `VACUOUS` verdict. **A run over an empty
      declaration set must be shown RED**, beside a real green on the adopted
      set — a runner that reports green on nothing is the exact failure it
      exists to catch.
- [ ] 6a. **A filtered run never reports a criterion PROVEN on part of its
      evidence** (Table B row 7). With two proofs declared for one
      `(wp, criterion)`, selecting one with `--proof` reports that proof PROVEN
      and the criterion **`FILTERED`**, naming the declaration left out; only an
      unfiltered run in which both ran and passed reports it PROVEN. Show both.
- [ ] 7. **The two write boundaries hold, and each check is reported for what it
      establishes** (Table B rows 2 and 2b). **(a)** A declaration whose `file`
      canonicalises outside the copy — by `..`, by an absolute path, and by a
      symlink, each shown — is an ERROR before any write. **(b)**
      `git status --porcelain` is byte-identical before and after a full run and
      after a run in which a proof FAILED; **this establishes only that the
      tracked checkout is unchanged NET** — it cannot see a write-then-restore,
      an untracked write, or a write elsewhere on disk, and the criterion says so
      rather than resting the boundary on it. **(c)** No clean-tree precondition
      is needed, and none is added.
- [ ] 8. **No production seam is borrowed** (Table D). The runner requires
      nothing under `src/` and nothing outside Node's standard library, spawns no
      `git`, and starts every suite through the sandbox's `tests/run.js` rather
      than `node --test`, so the scheduler guard applies to every child.
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
      EQUAL rule makes an unlisted collateral failure an ERROR, and that is the
      intended behaviour, not an obstacle. Which mutations are declared remains
      the implementer's.
- [ ] 10. **The report states its own reach.** Every run — green or red — ends
      with a footer carrying Table C's standing limit in the runner's own output,
      following `scripts/mirror-walk.js`'s `REACH` precedent, so a green is never
      read as "this criterion is non-vacuous". The footer names **completeness**
      and **semantic relevance of the declared mutation** as the two things it
      does not establish, and describes the run's **selected** evidence — on a
      filtered run it says so rather than saying "each declared mutation".
- [ ] 11. **`npm test` does not run RED proofs** (Table D). The runner's own
      suite runs against `tests/fixtures/red-proofs/` via `--root` and loads no
      declaration from `tests/red-proofs/`, so `npm test` starts no real suite
      through the runner.
- [ ] 12. **Idempotency:** two consecutive `npm run red-proofs` runs give the
      same verdict and leave `git status --porcelain` byte-identical — the
      runner's own writes stay inside its disposable copy, and the suite's
      scratch inside the wrapper-owned temp root the wrapper deletes (Table B
      rows 2 and 2b).
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

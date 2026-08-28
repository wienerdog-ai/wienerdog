---
title: Round 2 — external adversarial design review (raw), WP-dream-write-fence-control-files
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. -->

# Round 2 — external adversarial design review (raw)

Backend: `gptsol`. Reviewer instructions: `docs/runbooks/review-prompts/adversarial.md`,
verbatim, placeholders filled, plus the round-≥2 duty to verify each prior finding is
genuinely fixed rather than re-worded. Spec under review at commit `99a860a`.
Output language pinned to English in the dispatch (the round-1 leak, fixed).
Read-only proof: `git status --porcelain` empty before and after, pasted by the reviewer.

## Verbatim reviewer output

---

## Part 1 — Round-1 verdicts

| Round-1 finding | Verdict | Evidence executed |
|---|---|---|
| **R1-1 — Same-run ignore bypass** | **PARTIALLY FIXED** | Table A now defines the required commit-time postcondition, makes `.gitignore` reverts precede other denials, requires `git rm --cached`, gives a finite-state termination argument, and caps iteration. On a quiescent repository, restoring each touched `.gitignore` to HEAD is monotonic, so I did not construct an uncapped static-state oscillation. However, the spec places the fixpoint in the Step-2 classification loop while the real pipeline still executes `git add -A` later at `validate.js:1223` and `:1412`. I reproduced that `git rm --cached -- CLAUDE.md` followed by `git add -A` stages `CLAUDE.md` again. The commit-time postcondition forbids this result, but the ordering contract does not require a final fence pass after the last `git add -A`; it therefore leaves the implementation algorithm internally under-specified. |
| **R1-2 — Denial destroyed user data** | **PARTIALLY FIXED** | Table D now reaches both normal fence revert shapes and makes preservation failure non-destructive. But the existing passing test at `tests/unit/dream-validate.test.js:2322-2368` proves a save landing after `quarantinePreserve` and before `checkout`/`rmSync` is still permanently lost; `npm test` passed that test as an intentionally retained residual. Directories and unreadable paths make `readFileSync` return through the `null` path and are left untouched, as is a missing `stateDir`. A symlink is not preserved as a symlink: an in-vault symlink causes `readFileSync` to copy its referent bytes, while an escaping symlink is handled by the earlier containment branch and destroyed without Table D preservation. |
| **R1-3 — Git seam runs repository-controlled programs** | **PARTIALLY FIXED** | The hook mitigation is concrete, but Table E is not a complete account of the residual class. I configured local `diff.external` in a throwaway repository and ran `git -c core.hooksPath=/dev/null diff --cached -U0 -- note.md`; the configured executable ran and wrote a marker. The validator invokes this exact diff shape at `validate.js:1257`. `diff.external` and driver-specific external diff commands are absent from Table E. |
| **R1-4 — Layout silently repointed** | **NOT FIXED** | `sync.js:270` is only one of four `readVaultLayout` callers. `dream.js:329`, `memory.js:87`, and `scheduler/descriptor.js:188` consume the fallback without the proposed notice. In particular, a user can edit `config.yaml` after their last sync and let the scheduled dream run; the dream silently switches to defaults before any `sync` notice exists. The spec explicitly leaves those callers untouched, so the affected non-sync path remains silent. |
| **R1-5 — Idempotence criterion was unsatisfiable** | **NOT FIXED** | The narrowed criterion still requires a byte-identical enforcement line on a repeated denied write. `quarantinePreserve` deliberately gives collisions numeric suffixes (`validate.js:721-730`), and the focused collision test passed, creating `2026-07-02-leak-1.md`. Because the enforcement suffix embeds that basename, a second preserved denial cannot produce the same line while the first quarantine copy remains. The criterion remains unsatisfiable rather than discriminating. |

**Ship verdict: NO-SHIP — the specification still permits forbidden residue to cross the next-run precommit boundary, omits a verified repository-controlled execution surface, leaves the migration silent on the operational path, and exceeds a credible single-session security change.**

## 1. Preservation failure turns a current-run denial into a next-run precommit bypass

**File:** `docs/specs/WP-dream-write-fence-control-files.md:234-244, 363-377`; `src/cli/dream.js:491-566`; `src/core/dream/validate.js:122-135`
**Confidence:** 0.99

**What can go wrong?**

A hostile, visible `CLAUDE.md` whose quarantine copy fails is left on disk and merely unstaged for the current run. On the next dream run, `precommitSessionEdits` runs before the brain and before `validateAndCommit`, stages every visible change with `git add -A`, and commits the hostile file as a supposed user edit. The control-file fence never sees that commit.

The same cross-run escalation is possible after a fixpoint failure that leaves a forbidden path visible in the worktree.

**Why is this code path vulnerable?**

Table D explicitly requires this state on preservation failure:

- leave the forbidden path on disk untouched;
- unstage it;
- continue without committing it.

There is no persistent provenance marker, dirty-vault wedge, or next-run recovery gate. The next run executes:

1. `precommitSessionEdits(vaultDir)` at `dream.js:493`;
2. `git add -A` at `validate.js:125`;
3. the session-edit commit at `validate.js:126-134`;
4. only later, after the brain, `validateAndCommit` at `dream.js:558`.

This is especially damaging because the spec correctly states that disk is the real attack surface. Its fallback intentionally grants the attacker that persistence and then allows the existing precommit path to promote it into history.

A missing `stateDir` is normal for older direct callers and integration tests according to `validate.js:1044-1046`; production can also reach `null` through an unreadable source, an unwritable/full quarantine destination, or other filesystem failure.

**Likely impact**

- A planted instruction file persists on disk immediately and can steer a user-started Claude or Codex session.
- A later scheduled dream can commit it before the fence runs.
- The commit is mislabeled as "session edits before dream," obscuring provenance and making recovery harder.
- The specification therefore cannot claim closure of M7 under its own preservation-failure contract.

**Concrete recommendation**

Do not permit a visible forbidden path to survive as ordinary precommit-eligible dirt.

Define a durable failure state and require the next dream to halt before `precommitSessionEdits` until the residue is resolved. Alternatively, guarantee an atomic preservation-and-removal operation that either relocates the exact filesystem object or leaves a durable marker that the precommit path checks. This likely requires adding `src/cli/dream.js` to the deliverables.

Add an acceptance test spanning two runs:

1. force `quarantinePreserve` to return `null` for a visible `CLAUDE.md`;
2. confirm the first run does not destroy or commit it;
3. start a second dream;
4. assert that `precommitSessionEdits` does not commit it and that the brain never starts.

The same test family should inject a revert failure after `.gitignore` has been restored and verify that no subsequent run can precommit the newly visible forbidden file.

## 2. Table E misses `diff.external`, which the validator executes during secret scanning

**File:** `docs/specs/WP-dream-write-fence-control-files.md:209-219, 246-255, 318-322`; `src/core/dream/validate.js:1257`
**Confidence:** 1.00

**What can go wrong?**

Repository-local configuration can name an external diff program. The validator executes it while examining staged content, despite both proposed hook mitigations being active.

**Why is this code path vulnerable?**

The validator runs:

```text
git diff --cached -U0 -- <rel>
```

Git honors local `diff.external` for that command. I reproduced this in a throwaway repository with:

```text
git -c core.hooksPath=/dev/null diff --cached -U0 -- note.md
```

The configured executable ran and wrote its marker. `--no-verify` is irrelevant because this is not a commit hook.

Table E claims to state the residual class "in full" but enumerates only filters, `core.fsmonitor`, `gpg.program`, `.git/info/exclude`, and `core.excludesFile`. It omits at least:

- `diff.external`;
- driver-specific external diff commands selected through attributes;
- associated diff helper configuration that can launch programs.

**Likely impact**

If repository control state is hostile or compromised, the validator launches attacker-selected code with the Wienerdog process's filesystem and network privileges while performing its security scan. The named successor would also miss this channel if it implements only Table E's stated members.

**Concrete recommendation**

Add external diff configuration to Table E and to the successor's pre-flight/doctor charter. Require validator-owned diff invocations to disable external diff and text-conversion helpers explicitly, for example through the appropriate `git diff` flags, and verify both directions in a throwaway repository.

The test must configure local `diff.external`, demonstrate that the current command executes it, and demonstrate that the hardened validator command does not.

## 3. The layout migration notice is absent from the path that applies the migration

**File:** `docs/specs/WP-dream-write-fence-control-files.md:221-232, 388-398`; `src/cli/dream.js:329`; `src/cli/memory.js:87`; `src/scheduler/descriptor.js:188`; `src/cli/sync.js:267-345`
**Confidence:** 0.98

**What can go wrong?**

A user with a previously valid dot-prefixed layout edits or retains their configuration and then runs a dream, memory command, or scheduler path without running `sync`. The command silently falls back to built-in directories and writes or reads a second vault structure.

**Why is this code path vulnerable?**

The proposed diagnostic is emitted only by `sync.js`. The actual rejection happens in the shared `readVaultLayout`, whose signature and return value are required to remain unchanged. Its three other callers receive no rejection metadata.

The dream path reads the layout directly before precommit and brain execution. Nothing in the inspected path requires a preceding sync after a configuration edit.

**Likely impact**

- Dream reports, skills, identity notes, or daily content can be read from or written to default locations instead of the user's established locations.
- The user may discover the migration only after data has split across two structures.
- Scheduled/headless operation makes the failure harder to notice than an attended sync warning.
- The original silent-repoint defect remains on the operational path that matters most.

**Concrete recommendation**

Make rejection diagnostics available at the shared layout-reading boundary and consume them wherever fallback can affect behavior. Preserve compatibility with a companion API if changing `readVaultLayout` itself is undesirable.

At minimum, the dream path must either halt with a durable alert or emit a durable warning before using a fallback caused by the new dot rule. Add a test that edits the configuration after the last sync and invokes the dream path directly, asserting that fallback is not silent.

## 4. The work package exceeds the repository's one-session sizing contract

**File:** `docs/specs/WP-dream-write-fence-control-files.md:137-151, 186-255`; `docs/specs/README.md:9-11`
**Confidence:** 0.96

**What can go wrong?**

One implementation and review session must simultaneously change:

- the validator's security-critical classification algorithm and fixpoint;
- destructive-path preservation and failure behavior;
- every validator Git invocation;
- commit options;
- two duplicated layout validators;
- the layout rejection diagnostic API;
- sync presentation;
- four test surfaces.

This makes it likely that interactions such as final restaging, next-run recovery, EP2 ordering, skill registration, and partial rollback receive insufficient implementation or review attention.

**Why is this code path vulnerable?**

The repository permits M-sized work only when it fits one session and explicitly lists "zero 'and also' clauses" as a sizing heuristic. This specification has exactly eight deliverables—the file-count ceiling—but contains at least three independent mechanisms:

1. the M7/M10 fence and preservation behavior;
2. the M9 Git execution seam;
3. the layout compatibility migration and notice.

The 460-line specification itself is longer than the repository's approximate 400-line new-content heuristic, before implementation begins. The validator change is not a local guard: it restructures the ordering of several existing gates.

**Likely impact**

A broad implementation diff will be harder to reason about atomically and harder for adversarial review to isolate. A defect in any one mechanism delays all three audit remediations and increases the probability of shipping a superficially compliant but incorrectly ordered fixpoint.

**Concrete recommendation**

Split at the natural seams:

1. **Fence package:** Table A plus Table D, validator tests, failure recovery, and the cross-run precommit contract.
2. **Git-seam package:** Table B, the complete Table E residual class, and execution-surface reproductions.
3. **Layout migration package:** Table C, both layout implementations, diagnostics for every behavior-changing consumer, and sync/dream tests.

Sequence them if overlapping edits to `validate.js` make parallel implementation undesirable.

## Execution record

The checkout remained unchanged. The initial and final outputs were byte-identical:

```text
Initial: git status --porcelain
(empty)
Exit status: 0

Final: git status --porcelain
(empty)
Exit status: 0
```

Commands executed: 30 tool invocations, all exit 0 — full reads of the review set,
targeted validator inspections, `/usr/bin/grep` sweeps for preservation, symlink,
collision, notice, external-diff, fsmonitor, signing and exclude coverage, two
throwaway-repository reproductions (`diff.external`; `git rm --cached` followed by
`git add -A`), `npm test` (2,037 tests, 2,028 passed, 9 skipped, 0 failed),
`npm run lint` (passed; local shellcheck and PowerShell layers skipped, binaries
unavailable), and a focused run of the quarantine name-collision test (1 passed).

The full baseline test suite ran. There is no implementation of this draft
specification yet, so these tests validate the current tree and the cited residual
behavior, not a completed WP implementation.

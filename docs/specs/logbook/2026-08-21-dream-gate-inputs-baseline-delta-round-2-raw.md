---
title: Round 2 — external adversarial design review (raw), WP-dream-gate-inputs-baseline-delta
date: 2026-08-21
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. TWO deviations, declared:
     (1) the reviewer's empty-output fences are rendered as the word (empty);
     (2) one AWS-key-shaped test literal in Finding 3's reproduction is written
     AKIA<redacted> so a secret-shaped string is not committed to this repo. The
     finding's meaning is unchanged. Nothing else was altered. -->

# Round 2 — external adversarial design review (raw)

Backend: `gptsol`, English-pinned. Reviewer instructions:
`docs/runbooks/review-prompts/adversarial.md`, verbatim, placeholders filled.
Spec at commit `936c651` (416 lines). Base: `main` @ `e648284`.

Round ≥ 2 dispatch per `docs/runbooks/codex-review.md`: the four round-1 findings
were listed and the reviewer was asked to verify each is genuinely fixed rather
than re-worded (PART A), then to run a full fresh round on the current text
(PART B). Same scope rule, four routed classes. Read-only verified both sides.

## Verbatim reviewer output

---

NO-SHIP — the one-shot HEAD check still does not establish the claimed `isNew === untracked` invariant, and the captured baseline/delta can become stale while later `git add -A` commits bytes the four gates never classified.

## PART A — Round-1 findings

| Finding | Verdict | Evidence |
|---|---|---|
| **F1 — baseline/HEAD invariant asserted, not enforced** | **NOT FIXED** | Table A adds a HEAD identity and checks it once before classification at spec `:173-176`. That does not make `isNew` and `untracked` equivalent. I reproduced a stable-HEAD state where a baseline-new skill is staged after capture: HEAD remained unchanged, `isNew=true`, but `git status` returned `A ` and the existing parser therefore yields `untracked=false`. The check passes while the facts diverge. I also reproduced a commit landing immediately after the prescribed pre-classification check; the check passed, then HEAD changed before classification. The check is neither index-aware nor held across classification. The explicitly named residual — unvalidated brain writes being swept into the next run — is a real hazard introduced by refusing where the current path continues, but its routing to package 2 is explicit and owner-ruled, so it is reported under **Routed** rather than counted again here. |
| **F1b — seven `change.untracked` consumers** | **PARTIAL** | Table D is exhaustive against the current tree: `/usr/bin/grep -an '\.untracked' src/core/dream/validate.js` found exactly the seven listed sites at `:333`, `:554`, `:1150`, `:1176`, `:1189`, `:1196`, and `:1202`. The `:1202` conjunction does fail toward "not dream-owned" in the reproduced staged-add state, so it does not mis-register that skill. However, the assignments at `:333` and `:554` still rely on the false claim that the HEAD check makes `isNew` and `untracked` agree. A staged add with unchanged HEAD reaches those sites with `isNew=true` and `untracked=false`, skipping checks that the current implementation runs. The map is exhaustive, but its safety argument is not. |
| **F2 — per-substitution divergence proof** | **PARTIAL** | Table E now gives the Tier-3 live-file-to-`afterBytes` substitution its own valid discriminator at spec `:240`, so the specific round-1 blind spot is fixed. But the EP2 row at `:241` still combines at least four independent replacements — path list, `binary`, `addedLineNumbers`, and scan text — under one "delta vs staged diff" discriminator. An outcome can flip because only the path list changed while `binary` and added-line extraction still read git. Similarly, the two distinct `change.untracked -> isNew` consumers are bundled at `:242`. This is still per row/gate-family, not per actual substitution as the heading and acceptance criterion claim. |
| **F3 / R1 — stale citation ranges** | **PARTIAL** | The three named corrections are accurate: `skillBodyViolation` is `src/core/dream/validate.js:320-413`; `ledgerViolation` is `:516-613`; EP2 Step 3 is `:1211-1372`, with Step 4 beginning at `:1374`. However, the required full citation sweep is not clean: the spec cites `precommitSessionEdits` as `validate.js:122-144`, while the function ends at `:137` and `:139-144` belongs to the next declaration's JSDoc; it also cites the two unit-test helpers as `tests/unit/dream-validate.test.js:39-63`, but `writeVault` closes at `:64`. |

## PART B — Fresh adversarial findings

### Finding 1 — A stable HEAD does not prevent index drift, so the central equality still fails

- **Affected file:** `docs/specs/WP-dream-gate-inputs-baseline-delta.md`
- **line_start:** 173
- **line_end:** 226
- **Confidence:** 0.99

1. **What can go wrong?**

   A path absent from the baseline can be staged after capture without creating a commit. HEAD remains unchanged, so the new drift check passes. The delta says `isNew=true`, while current `git status` says the path is staged rather than untracked. The proposed skill-body guard then skips revision authorization where the current validator runs it.

   The `:1202` conjunction avoids registering the skill, but that does not undo the already weakened gate: a floor-passing skill may be committed while remaining permanently absent from the ownership registry.

2. **Why is this path vulnerable?**

   Table A checks only HEAD identity. `change.untracked` is not a HEAD-presence fact; the current parser defines it as status code `??`.

   I ran this state:

   ```text
   head_unchanged=true
   baseline_isNew=true
   status_code=A
   parser_untracked=false
   registry_conjunction=false
   ```

   This directly disproves the claims at spec `:193`, `:226`, and `:242` that the HEAD invariant makes the two facts agree wherever the run continues.

   A separate reproduction also showed the one-shot check has a post-check window:

   ```text
   precheck_passed=true
   baseline_isNew=true
   git_status= M 05-Skills/newone/SKILL.md
   ```

   The concurrent commit occurred after the check and before the later use of HEAD.

3. **What is the likely impact?**

   The package can silently weaken the skill-body and ledger gates despite its behavior-preservation requirement. In the skill case, user or concurrent-process content may be committed as an accepted but unregistered skill. That content bypasses the current ownership/authorization rejection and is then stranded from all future autonomous revision.

4. **What concrete change would reduce the risk?**

   Define and enforce a generation invariant that includes HEAD, index, and worktree — not HEAD alone — and hold or revalidate it across every decision/enforcement use. At minimum, abort if the index or HEAD differs from the clean captured generation before classification and again before commit. The spec must not claim `isNew === untracked` from HEAD identity alone.

---

### Finding 2 — The separate clean check and baseline capture can bless dirty bytes as the baseline

- **Affected file:** `docs/specs/WP-dream-gate-inputs-baseline-delta.md`
- **line_start:** 133
- **line_end:** 177
- **Confidence:** 0.98

1. **What can go wrong?**

   A user or another process can modify a tracked file after `assertCleanTree` succeeds but before `captureBaseline` reads it. The baseline then carries dirty worktree bytes together with an unchanged HEAD identity. Because those bytes are treated as pre-brain baseline, they are absent from the delta and bypass all four decision gates. The untouched final `git add -A` can nevertheless stage and commit them as dream output.

2. **Why is this path vulnerable?**

   The spec requires this sequence:

   ```text
   assertCleanTree
   captureBaseline
   brain
   ```

   It does not require capture to verify that the captured bytes equal the recorded HEAD tree, nor does it re-run the clean check after capture.

   I reproduced the relevant state:

   ```text
   status_at_assert=''
   expected_head=34c631cca49a131245431c0d6b6de5b51ef2dfc6
   captured_head=34c631cca49a131245431c0d6b6de5b51ef2dfc6
   captured_bytes='user edit after assertCleanTree'
   head_bytes='committed'
   status_at_capture=' M note.md'
   head_check_would_pass=true
   ```

   This contradicts Table A's statement that the captured bytes and commit "equal" and "travel together."

3. **What is the likely impact?**

   Unclassified content — including secret-bearing or below-policy content — can be committed under the dream commit. On rejection of a later brain edit to the same file, enforcement can also restore HEAD and erase the intervening user edit because the baseline incorrectly treated it as pre-existing state.

4. **What concrete change would reduce the risk?**

   Make baseline capture establish a coherent clean generation: read the expected HEAD, capture bytes, then verify both that HEAD is unchanged and that the index/worktree still exactly match that HEAD. Retry or refuse if either check fails. A successful `assertCleanTree` before capture is not sufficient.

---

### Finding 3 — A one-time delta can miss late writes that the untouched final staging step commits

- **Affected file:** `docs/specs/WP-dream-gate-inputs-baseline-delta.md`
- **line_start:** 181
- **line_end:** 209
- **Confidence:** 0.97

1. **What can go wrong?**

   After `computeDelta` produces the records consumed by classification and EP2, another writer can add or modify a vault file. The late path is absent from the delta, so no policy or secret decision examines it. The existing final `git add -A` and commit still include it.

2. **Why is this path vulnerable?**

   Table B defines one canonical delta "for the vault as it stands" and Table C replaces EP2's live staged file list with that delta's path list. No contract verifies that the worktree still matches the delta immediately before staging or committing. The HEAD identity can remain unchanged throughout.

   I ran the underlying git sequence with a delta-equivalent empty path set, then wrote and staged a secret-bearing file:

   ```text
   head_check_passed=true
   delta_path_count=0
   staged_after_late_write=04-Atomic/note.md
   committed_bytes=$'clean\nAKIA<redacted>'
   ```

   The conclusion that the proposed EP2 decision would not see this path is an inference from Table C's required use of the prior delta; the staging and commit behavior was executed.

3. **What is the likely impact?**

   A late secret, binary, malformed Tier-3 file, or unauthorized skill change can be committed without any of the four gates seeing it. This is a silent gate bypass created by replacing EP2's staged-diff evidence with an earlier snapshot.

4. **What concrete change would reduce the risk?**

   Bind the committed bytes to the classified delta. Before final staging/commit, recompute the delta and require it to be byte-identical to the classified generation, or stage only blobs proven by that generation and refuse any additional worktree/index change. A HEAD-only check cannot detect this case.

---

### Finding 4 — The complete citation sweep still contains two incorrect ranges

- **Affected file:** `docs/specs/WP-dream-gate-inputs-baseline-delta.md`
- **line_start:** 101
- **line_end:** 176
- **Confidence:** 1.0

1. **What can go wrong?**

   The spec can pass dispatch with ranges that do not resolve to the constructs they claim to identify.

2. **Why is this path vulnerable?**

   Against the pinned tree:

   - `precommitSessionEdits` is `src/core/dream/validate.js:122-137`, not `:122-144`; `:139-144` is the JSDoc for `restoreVaultToHead`.
   - The combined `tempVault` / `writeVault` helper range must extend through `tests/unit/dream-validate.test.js:64`; the cited `:39-63` omits `writeVault`'s closing brace.

3. **What is the likely impact?**

   The spec's own dispatch precondition says any unresolved citation blocks dispatch. The first error is the same cross-declaration range defect found in round 1.

4. **What concrete change would reduce the risk?**

   Correct those two ranges and re-run the complete citation inventory before dispatch. The three specifically ruled round-1 ranges should remain `:320-413`, `:516-613`, and `:1211-1372`.

## Routed (out of this package's scope)

- **Abort residual:** On detected drift, the package intentionally leaves the brain's unvalidated writes in the live vault. The next run's `precommitSessionEdits` can commit them as user session edits without validation. This is a serious recovery hazard, but the spec and owner ruling explicitly route the fate of `precommitSessionEdits` and the live-vault write target to package 2, so it is not counted toward this verdict.
- I found no additional issue limited solely to EP2 enforcement mechanics, the git-execution seam, the layout dot-rule, or policy-value tuning.

## What I executed

All repository commands were run from the reviewed checkout.

- Read the complete target spec, all four supplied logbook records, all six cited source/test files, and the three process documents using `cat`, `sed`, `nl`, and `/usr/bin/grep` — **exit 0**.
- Enumerated all `file:line` citations and checked them against numbered source — **exit 0**.
- Enumerated every `.untracked` occurrence in `src/core/dream/validate.js` — **exit 0**; exactly 7 occurrences.
- `git log --oneline main..HEAD`, `git rev-parse HEAD main`, `git diff --name-only main...HEAD`, and `git diff --stat main...HEAD` — **exit 0**.
- `npm test` — **exit 0**: 2048 tests, 2039 passed, 0 failed, 9 skipped.
- `npm run lint` — **exit 0**: markdownlint and frontmatter passed; shellcheck and PSScriptAnalyzer were unavailable and explicitly skipped by the lint runner.
- `npm test -- --test-name-pattern "dream-validate"` — **exit 0**: 187 passed, 0 failed.
- `npm test -- --test-name-pattern "dream-delta"` — **exit 0**: command passed, but this docs-only branch has no `dream-delta` test yet; the runner reported 105 wrapper/file subtests and no implemented delta-specific behavior.
- Stable-HEAD/staged-add reproduction under a system temporary directory — **exit 0**.
- Concurrent commit after the prescribed HEAD check reproduction under a system temporary directory — **exit 0**.
- Dirty edit between clean check and baseline capture reproduction under a system temporary directory — **exit 0**.
- Late secret write after an empty delta-equivalent snapshot, followed by staging and commit, under a system temporary directory — **exit 0**.
- Current-validator reproduction showing a Tier-3-reverted binary skill does not survive into EP2 — **exit 0**.
- The first attempt at the concurrent-commit reproduction used zsh's reserved read-only variable `status` — **exit 1**; I corrected the variable name and reran it successfully.
- Every temporary directory was outside the checkout and removed by `trap`.
- `npm run scenarios` was **not run**.

## `git status --porcelain` proof

**Before** — exit 0, output: (empty). **After** — exit 0, output: (empty).
The before and after outputs are byte-identical.

---

## Orchestrator spot-check (not the reviewer's words)

Per `docs/runbooks/codex-review.md` → Rules, every load-bearing claim was re-run
against the tree before anything was acted on.

| Reviewer claim | Measured | Verdict |
|---|---|---|
| `untracked` is a status-code fact, not a HEAD fact | `changedPaths` sets `untracked: code === '??'` (`validate.js:1031`), parsed from `git status --porcelain -z -uall` (`:1021`). A staged add carries code `A `, so `untracked` is false while HEAD is untouched | **CONFIRMED — and it is decisive.** A HEAD-identity pin cannot constrain an index fact. The ruled route (a) as folded is insufficient **by construction**, not by wording |
| Table D is exhaustive | exactly seven `.untracked` occurrences, all seven in the table | **CONFIRMED** (the map is right; its safety argument is what fails) |
| `precommitSessionEdits` is `:122-137`, `:139-144` is the next JSDoc | `:137` is its closing brace; `:139` opens `restoreVaultToHead`'s JSDoc | **CONFIRMED** |
| the test helpers run to `:64` | `writeVault` closes at `:64`; `:66` is the next declaration | **CONFIRMED** |
| Finding 3: a late write is committed unclassified | the spec leaves Step 5's `git add -A` (`:1412`) and EP2's opening `git add -A` (`:1223`) untouched, while replacing EP2's `diff --cached` list with the snapshot. Today that `diff --cached` is read AFTER `add -A`, so a late write IS seen; under the substitution it is not | **CONFIRMED — this is a behaviour REGRESSION, not preservation.** It removes a check that exists today |
| Finding 2: nothing re-checks cleanliness at capture | Table A orders `assertCleanTree` then capture and requires no re-verification; the window is real | **CONFIRMED** |

**Orchestrator note on the citation class (third occurrence).** Round zero fixed
twelve citations, round 1 found two more, round 2 found two more — all the same
defect: a cited RANGE that crosses into the next declaration. Round zero verifies
that a claim's NAMED LINE resolves; it has never verified that a range ENDS where
its construct ends. That is a checkable property and a candidate round-zero
improvement, recorded here for the owner rather than fixed inside this package.

---
title: Round 1 — external adversarial design review (raw), WP-dream-denied-object-disposal
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. The 35-item command list
     is condensed to its load-bearing entries with results preserved; the full list
     is in the agent transcript. Everything above that point is byte-verbatim. -->

# Round 1 — external adversarial design review (raw), the HAND

Backend: `gptsol`, English-pinned. Reviewer instructions:
`docs/runbooks/review-prompts/adversarial.md`, verbatim. Spec at commit `c54166a`.
The dispatch carried the eye/hand boundary as a scope rule and isolated the parent's
record as evidence, not review credit. Read-only verified: `git status --porcelain`
empty before and after.

## Verbatim reviewer output

---

NO-SHIP — the HAND contract can still destroy or strand user data, and its standalone pre-spawn protection is bypassable before the EYE lands.

## 1. Residue is deleted by uninstall and has no complete user-recovery lifecycle

**Files:** `docs/specs/WP-dream-denied-object-disposal.md:135-150,230-234,278-290`; `src/core/manifest.js:1110-1149`
**Confidence:** 0.99

1. **What can go wrong?**
   A user object successfully moved from the vault into `state/residue/` can be permanently deleted by `wienerdog uninstall`. Even without uninstall, a process crash or failed pairing-index write can leave it outside the vault without a reliable way for the user to locate and restore it.

2. **Why is this path vulnerable?**
   The current uninstall implementation recursively removes all of `paths.state`. Its documented invariant says that `state/` contains only Wienerdog-authored runtime artifacts and nothing user-authored. This package invalidates that invariant by moving user-reachable objects under `state/residue/`, but neither `src/core/manifest.js` nor uninstall tests are deliverables.

   The recovery contract is also incomplete:
   - The residue-index filename, schema, update protocol, and durability requirements are not defined.
   - There is no specified startup replay consumer for journal entries left incomplete by a crash.
   - The spec explicitly permits relocation after the pairing index fails.
   - The fallback claim that the original path can be recovered from the residue filename does not define a reversible, collision-safe encoding.
   - There is no user-facing list or recover operation.
   - Independent index/report fault tests do not cover their realistic common-cause failure, such as metadata-space exhaustion.

3. **Likely impact:**
   Wienerdog can remove the only surviving copy of user data while still reporting that the vault was preserved during uninstall. Before uninstall, the object may be technically present but operationally unrecoverable because neither its original path nor a supported recovery procedure is available.

4. **Concrete recommendation:**
   Amend the HAND package to treat residue as user-owned recovery data:
   - Add the uninstall implementation and its tests to the deliverables.
   - Make uninstall return residue entries to free original paths, preserve the residue store with an explicit warning, or refuse destructive uninstall until the user resolves it.
   - Define an exact, versioned journal/index schema and atomic update protocol.
   - Define startup replay before any brain can spawn.
   - Require an injective, reversible filename fallback if relocation may proceed without an index.
   - Add a supported list/recover surface.
   - Test crashes at every journal transition and compound index-plus-report failure.

## 2. The specified total-failure fallback invokes the existing destructive operation

**Files:** `docs/specs/WP-dream-denied-object-disposal.md:127-150,195-197,215-236`; `src/core/dream/validate.js:139-149`; `src/cli/dream.js:533-550`
**Confidence:** 0.99

1. **What can go wrong?**
   When an object cannot be preserved, restored, or moved, Table B requires `restoreVaultToHead`. That function currently runs `git reset --hard HEAD` followed by `git clean -fd`, exactly the bulk destructive behavior the package is supposed to replace. A concurrent user-created directory or tracked-path occupant can therefore be erased on the package's fail-closed path.

2. **Why is this path vulnerable?**
   The spec names `restoreVaultToHead` as the total-failure action without defining preservation-aware replacement semantics for it. Its Current State section lists `revertPath` as destructive but omits this second destructive primitive. The CLI also invokes it after brain failure and scratch-integrity failure, outside the validator's per-path classification loop.

   I reproduced both underlying behaviors in a throwaway repository:
   - `git checkout HEAD -- tracked` exited 0 and removed a non-empty directory occupying the tracked pathname.
   - `git clean -fd` removed an untracked directory and its contents.

   The incomplete EXDEV contract makes this fallback reachable for additional shapes: Table A promises relocation for hard links, FIFOs, sockets, and device nodes, while Table B defines cross-filesystem copying only for regular files, symlinks, and directories.

3. **Likely impact:**
   A storage, permission, EXDEV, or shape-handling failure can convert a recoverable denied object or concurrent user save into permanent data loss. The run may fail, but failure does not restore the lost bytes.

4. **Concrete recommendation:**
   Do not invoke bulk `reset --hard` or `clean -fd` after disposal has failed. Specify that every dirty path, including paths handled by existing CLI aborts, must pass through the same preservation-aware classifier before any reset. The total-failure acceptance test must assert byte survival for the blocked object and unrelated concurrent saves, not merely "vault restored to HEAD." Define behavior for every Table A shape on EXDEV; unsupported shapes must remain untouched and produce a durable recovery record.

## 3. The named classify-to-act race contradicts the package's absolute safety criteria

**File:** `docs/specs/WP-dream-denied-object-disposal.md:123-133,148-149,188-203,215-224`
**Confidence:** 0.98

1. **What can go wrong?**
   An object can appear after the action-time `lstat` revalidation but before `git checkout HEAD -- <path>`. Git can then silently remove that newly arrived object.

2. **Why is this path vulnerable?**
   Table A correctly admits that classification and action are separate operations and that the remaining race cannot be closed by revalidation. However, the same spec then asserts:
   - restoration occurs "only onto a pathname claimed at action time";
   - "a restore never lands on an occupied pathname";
   - an occupant created "between classification and the action" is not removed.

   Those statements are true only if the named residual never fires. A second `lstat` narrows the window but does not bound it: the process may be descheduled for an arbitrary duration before checkout. The acceptance test can inject an occupant before revalidation and pass while leaving the actual post-revalidation window untested.

3. **Likely impact:**
   The implementation and tests can satisfy the written mechanism while still deleting a real concurrent user save. Reviewers would receive a false safety guarantee from the absolute acceptance criterion.

4. **Concrete recommendation:**
   The house rule requires more than another path-based check. Restore through an atomic no-clobber claim appropriate to the HEAD object type, or refuse restoration where the platform cannot provide that guarantee. For a regular file, this can involve materializing HEAD content separately and claiming the destination with exclusive creation rather than invoking checkout on the user pathname. Add a test seam exactly between final revalidation and the destructive action. If no portable no-clobber mechanism is adopted, remove the absolute guarantees and explicitly accept that the package does not yet satisfy "every destruction is paired with preservation."

## 4. A hostile instruction file can become tracked-and-clean while the HAND is deployed alone

**Files:** `docs/specs/WP-dream-denied-object-disposal.md:27-39,152-160,174-181,292-304`; `src/core/dream/validate.js:1144-1209`
**Confidence:** 1.00

1. **What can go wrong?**
   During a HAND-only deployment, a dream can create `CLAUDE.md`, have the current validator commit it, and leave it tracked-and-clean. On the next run, Table C's narrowed pre-spawn assert deliberately ignores it.

2. **Why is this path vulnerable?**
   Table C's trusted-clean reasoning only becomes valid after the EYE prevents instruction-shaped files from entering commits. The HAND explicitly adds no such rule and claims it ships first and alone.

   I proved the reachable state using the current validator in a throwaway vault. An untracked root `CLAUDE.md` containing ordinary instruction text produced:

   ```text
   {"committed":["CLAUDE.md","reports/dreams/2026-08-20.md"],"reverted":[]}
   tracked=yes
   clean=yes
   ```

   The spec is internally inconsistent: its Context says the HAND ships first and alone, while Definition of Done says HAND and EYE must be merged together and that no night may run on half a fence.

3. **Likely impact:**
   The pre-spawn assert can provide no protection against exactly the tracked-clean hostile state reachable during the standalone interval. The spec identifies the user's own harness sessions in the vault and future Codex wiring as consumers of that instruction file.

4. **Concrete recommendation:**
   Do not deploy or merge the HAND separately. Keep the implementation dependency but make the EYE and HAND one deployment boundary, as the existing Definition of Done already requires, and remove the contradictory "ships first and alone" claims. If standalone deployment is non-negotiable, the HAND needs a provenance mechanism that distinguishes instruction files trusted before HAND activation from files committed during a HAND-run interval; mere tracked-and-clean state is not evidence of user authorship. This does not require moving the EYE's denial rule into the HAND.

## 5. The HAND remains larger than one implementer session and its verification contract is not executable as written

**File:** `docs/specs/WP-dream-denied-object-disposal.md:83-172,210-276`
**Confidence:** 0.97

1. **What can go wrong?**
   An implementer can complete the happy-path relocation while missing crash replay, common-cause storage failure, unusual filesystem objects, uninstall ownership, CLI orchestration, or one of the race windows. The review burden is too broad for the repository's one-session work-package rule.

2. **Why is this path vulnerable?**
   The 304-line spec has five deliverables and fourteen acceptance criteria, not thirteen. The HAND still combines: no-follow type classification; action-time revalidation; no-clobber allocation; same-filesystem relocation; type-specific EXDEV copying and cleanup; journal/index state transitions; rollback and crash recovery; report-failure behavior; private-state repair; CLI pre-spawn policy.

   It additionally requires every acceptance criterion to be demonstrated red against a deliberately broken implementation. The Verification Steps provide only three aggregate commands and no literal mapping from each criterion to its corresponding test. The mutation examples at lines 266-270 prescribe test design despite `docs/runbooks/spec-authoring.md` saying fixture and mutation design belongs to the implementer.

3. **Likely impact:**
   The package is likely to produce a superficially green implementation with under-tested failure transitions. Its most dangerous omissions are precisely the cross-stage and lifecycle failures that broad `npm test` output will not identify.

4. **Concrete recommendation:**
   The EYE/HAND authority boundary is conceptually sound, but the HAND packaging is still too large. Split the HAND internally into dependency-ordered packages, for example: a residue storage/lifecycle package covering exact journal schema, relocation, crash replay, recovery, and uninstall; a validator-integration package covering classification, no-clobber restoration, report/commit rollback, and all existing destructive sites; a CLI pre-spawn package after the trusted-state assumptions are valid.

   Give every acceptance criterion a named test and literal test-name-pattern command. Keep mutation design out of the spec; require red/green evidence for each newly introduced verification command rather than fourteen ad hoc implementation mutations.

## ROUTED, not folded in

- **EYE — `WP-dream-fence-candidate-set`:** The permanent denial rule and inventory that prevent instruction-shaped objects from entering a commit belong to the EYE. I did not recommend pulling that rule into the HAND. Finding 4 is specifically about the HAND's unsafe standalone deployment claim and its narrowed assert before the EYE's invariant exists.
- **C2 git-execution seam:** No additional routed finding.
- **C3 layout dot rule:** No additional routed finding.

## Execution record (condensed; all commands exited 0)

35 invocations, read-only against the checkout, throwaway experiments under
`mktemp -d`. Load-bearing entries: throwaway reproduction of
`git checkout HEAD -- tracked` removing a non-empty directory and `git clean -fd`
removing an untracked directory; a throwaway-vault invocation of `validateAndCommit`
with an untracked root `CLAUDE.md`, yielding
`{"committed":["CLAUDE.md","reports/dreams/2026-08-20.md"],"reverted":[]}` with
`tracked=yes clean=yes`; location of the uninstall implementation and reads of
`disposeCoreMechanics` and its CLI caller;
`npm test -- --test-name-pattern "dream|private-fs"` — 343 passed, 0 failed, 1
skipped; `npm test` — 2028 passed, 0 failed, 9 skipped; `npm run lint` — passed,
shellcheck and PSScriptAnalyzer skipped as unavailable. Start and final
`git status --porcelain` both empty and byte-identical.

## Session lesson

- WP-dream-denied-object-disposal: Moving user-authored objects under machine-owned
  state invalidates uninstall's existing ownership assumption; recovery data must be
  protected as user data across the entire lifecycle.

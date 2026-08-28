---
title: Round 2 — external adversarial design review (raw), WP-dream-denied-object-disposal
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. The 36-item command log
     is condensed to its load-bearing entries with exit statuses preserved; the full
     list is in the agent transcript. Everything above it is byte-verbatim. -->

# Round 2 — external adversarial design review (raw), the HAND

Backend: `gptsol`, English-pinned. Spec at commit `b587362`. Scope rule carried; the
routed section is populated and correctly separates the lifecycle successor, the EYE,
C2 and C3. Read-only verified: `git status --porcelain` empty and byte-identical.

## Verbatim reviewer output

---

## Part 1 — Round-1 findings

| Round-1 finding | Verdict | Evidence |
|---|---|---|
| **R1-1 — uninstall deleted relocated user data** | **NOT FIXED** | Refusal is the safe default, but the specified implementation boundary cannot enforce the complete contract. `src/core/manifest.js:1133-1150` has no confirmation input, while confirmation and `--yes` handling live in `src/cli/uninstall.js:38-112`, which is not a deliverable. Live uninstall calls `manifestLib.reverse()` before the guarded sweep at `src/cli/uninstall.js:114-127`, so a refusal there happens only after partial uninstall. The second sweep at `:183-186` is another call. A non-interactive `--yes` invocation bypasses the only existing confirmation. Users can eventually unblock uninstall by manually emptying residue, but no recovery surface exists yet and the filename/index contract is undefined, so this is an operational denial of service with unsafe manual recovery as the only exit. |
| **R1-2 — destructive `restoreVaultToHead` on total failure** | **PARTIALLY FIXED** | The CLI's two existing destructive sites are correctly identified and routed: `src/cli/dream.js:535` and `:550` still call `restoreVaultToHead`. The HAND's replacement is not coherent yet: "attempts relocation best-effort before any reset" at spec lines 157-160 does not require every object to have been durably preserved before the reset. If relocation succeeds for one object and fails for another, `git reset --hard` plus `git clean -fd` still destroys the unpreserved object. This contradicts acceptance lines 262-265, which require both the blocked object and unrelated concurrent saves to survive. |
| **R1-3 — no-clobber restore guarantee** | **PARTIALLY FIXED** | The core destination claim is real. I measured both `linkSync` and `symlinkSync` returning `EEXIST` against an occupied regular file, non-empty directory, and symlink without replacing the occupant. A temporary regular file placed beside the target is necessarily on the same filesystem, so `linkSync` does not have the relocation path's `EXDEV` problem. Cleanup reduces the restored file's link count from 2 to 1. However, restoring only blob bytes loses the Git entry mode: a committed `100755` file restored through `writeFileSync` plus `linkSync` became `0644` and remained modified in `git status`. A `160000` gitlink cannot be materialized with `git show HEAD:<path>` at all. The spec also does not require cleanup of the temporary hard link on every success/failure path. The claimed restoration guarantee therefore does not cover all HEAD shapes or metadata. |
| **R1-4 — HAND deployed before EYE** | **PARTIALLY FIXED** | Context lines 31-38 and Definition of done lines 336-337 correctly require one stacked deployment, and the pre-fence hostile-file residual at lines 217-221 is honest. But implementation note lines 189-192 still call the HAND "shippable ahead of the EYE," and the sibling spec says the HAND "ships first" at `docs/specs/WP-dream-fence-candidate-set.md:36-39`. Those sentences still authorize the unsafe deployment interpretation that the revised context forbids. The residual covers historical hostile tracked-and-clean files; it does not make a new HAND-only deployment safe. |

**NO-SHIP:** the revised specification still permits data destruction, destination clobbering, incomplete restoration, and mutually incompatible lifecycle implementations.

## 1. The no-clobber restore does not restore the complete Git entry

**File:** `docs/specs/WP-dream-denied-object-disposal.md:134-141, 240-249` — **Confidence:** 0.99

A denied deleted executable can be restored with correct bytes but the wrong mode. A deleted gitlink cannot be restored by the specified mechanism. An incompletely cleaned temporary hard link can remain in the vault and become another staged path or a hidden alias to the restored inode.

Table A specifies materializing `git show HEAD:<rel>` bytes and linking that temporary file into place. Git blob bytes do not contain the tree-entry mode. I reproduced the concrete mode failure:

```text
HEAD mode: 100755
temp mode: 644
destination mode: 644
status after restore:  M tool.sh
```

Git trees can contain `100644`, `100755`, `120000`, and `160000` entries. The spec handles regular files and symlinks but does not define the gitlink case. In a throwaway submodule repository, `git show HEAD:sub` exited 128 with `fatal: bad object HEAD:sub`. Before deleting the temporary pathname the destination has `nlink=2`; after deleting it, `nlink=1`. The spec calls it a temporary file but does not make cleanup on every branch an acceptance condition.

**Recommendation:** make the restore operate on a parsed Git tree entry, not blob bytes alone — read and validate the exact HEAD mode and object type; support `100644`, `100755`, `120000` explicitly; apply the committed mode to the temporary inode before `linkSync`; fail closed with a defined outcome for `160000` and any unknown mode; require exclusive temporary creation beside the destination; require temporary-path cleanup after both successful and failed claims; add behavioural criteria for executable mode, symlink target text, gitlinks, cleanup, and final `git status`.

## 2. The uninstall guard cannot be reached with the required confirmation semantics

**File:** `docs/specs/WP-dream-denied-object-disposal.md:93-101, 158-160, 266-269`; `src/cli/uninstall.js:38-127, 179-186`; `src/core/manifest.js:1128-1150` — **Confidence:** 1.00

Uninstall either refuses only after other installation components have already been removed, remains blocked even after the user confirms, or treats `--yes` as authorization to destroy residue despite the requirement for explicit confirmation.

The spec allows changes only to `src/core/manifest.js` and `tests/unit/manifest.test.js` for this behavior. The actual confirmation state belongs to `src/cli/uninstall.js`: `--yes` is parsed at line 40; the generic interactive prompt runs at lines 93-112; `manifestLib.reverse()` starts destructive work at lines 114-118; `disposeCoreMechanics()` is called only afterward at lines 124-127 and again at lines 183-186. `disposeCoreMechanics()` currently receives only `dryRun` and `vaultPath`. It cannot distinguish an interactive confirmation from `--yes`, and the permitted files do not include the caller needed to pass an explicit residue-destruction authorization.

**Recommendation:** add `src/cli/uninstall.js` and `tests/unit/uninstall.test.js` to the deliverables. Require a residue preflight before `manifestLib.reverse()`: interactive operation must show the entries and request a distinct residue-destruction confirmation; headless operation must fail closed unless a separately defined explicit override is present; generic `--yes` must be explicitly defined as accepted or rejected; both mechanics sweeps must receive the same proven authorization; refusal must leave the manifest and every install artifact byte-identical. The low-level guard should remain as defense in depth, not the only enforcement point.

## 3. "Best-effort relocation then reset" still permits the data loss it claims to prevent

**File:** `docs/specs/WP-dream-denied-object-disposal.md:147-160, 257-265` — **Confidence:** 0.98

Suppose three working-tree objects exist when disposal fails: one relocates successfully; one cannot be moved because residue metadata allocation fails; one is an unrelated concurrent user save. A best-effort pass can partially succeed and then run `restoreVaultToHead`. The reset deletes or overwrites objects 2 and 3.

The operative requirement says only that relocation is "attempted" before reset. It does not make reset conditional on a complete, durable preservation proof for every path the reset or clean can affect. `restoreVaultToHead` is a bulk operation (`git reset --hard HEAD`; `git clean -fd`) acting beyond the single blocked path. The spec also requires a `suffix-blocked` reason recorded while committing nothing, without identifying a durable non-vault destination for that reason if the report write failed or the reset removes the report.

**Recommendation:** do not run the bulk reset unless every affected working-tree object has a verified durable representation and its pairing record is durable. If any preservation step fails: leave the working tree untouched from that point onward; fail loudly; record the blocked outcome outside the vault in a defined durable record; never use "best-effort" as sufficient authorization for a destructive reset. The acceptance criterion should inject partial success and prove no subsequent reset destroys the second object or an unrelated save.

## 4. Exclusive destination allocation does not make `renameSync` no-clobber

**File:** `docs/specs/WP-dream-denied-object-disposal.md:149-155, 253-254` — **Confidence:** 0.98

A user or same-user process can create or replace the selected residue destination after its exclusive allocation but before `renameSync`. `renameSync` then silently overwrites that occupant. Node's `renameSync` does not provide `RENAME_NOREPLACE`. An earlier `O_EXCL` allocation is only a check; it does not bind the later pathname-based rename. I reproduced the sequence — exclusively create the destination; remove it; create an occupant at the same pathname; call `renameSync`:

```text
destination after exclusive-allocation/swap/rename: source
```

The occupant was overwritten. This directly contradicts "Relocation never replaces" and its absolute acceptance criterion.

**Recommendation:** either provide an actual no-replace primitive for every supported platform and object shape, or narrow the contract honestly — define which object types have a true exclusive claim; state the pathname-swap residual directly in the `Never replaces` row and acceptance criterion; on platforms or shapes without a no-replace operation, fail before a destructive rename rather than claim atomic collision safety; test substitution after allocation and immediately before rename. A collision-suffix loop alone is not a no-clobber guarantee.

## 5. Renaming one hard-link pathname does not move the object out of the vault

**File:** `docs/specs/WP-dream-denied-object-disposal.md:134-139, 147-152` — **Confidence:** 0.99

If a denied pathname and another vault pathname are hard links to the same inode, renaming the denied pathname into residue leaves the other vault alias attached to the residue inode. Writes through the alias continue changing the supposedly preserved residue bytes. `lstat` reports a hard link as a regular file; it must be identified through `nlink > 1`. I measured two hard links, moved one to residue, then wrote through the vault alias:

```text
before: both inode=60121132, nlink=2
residue bytes after alias write: changed
after: residue and vault alias still inode=60121132, nlink=2
```

The residue entry is therefore neither isolated evidence nor an object wholly moved out of the vault.

**Recommendation:** give multi-link regular files a separate disposal contract — detect `nlink > 1`; create a detached, private copy in residue; verify the copied bytes and mode; only then remove or restore the denied pathname; never describe a pathname-only rename as moving the hard-linked object; test that later writes through every remaining vault alias cannot alter residue.

## 6. The HAND writes a durable journal whose schema is deferred to another package

**File:** `docs/specs/WP-dream-denied-object-disposal.md:153-160, 225-230, 257-261`; `src/core/dream/validate.js:1432-1448`; `src/cli/dream.js:568-611` — **Confidence:** 0.97

Different implementers can invent incompatible index paths, journal formats, states, filename encodings, or completion boundaries. A later lifecycle implementation may be unable to recover entries written by this package. The journal can also be marked complete after the Git commit even though later fallible stages still exist — `recordSkills()` at `validate.js:1448`, ledger writing at `dream.js:597`, digest regeneration at `dream.js:611`. "Complete after the run's commit succeeds" and "return if a later stage fails" therefore identify different transaction boundaries.

The HAND requires an index mapping entry names to original paths, filename fallback encoding, journal-before-move, completion after commit, return-on-later-failure, and Table C lookup by residue-index membership — but no path, version, encoding, record shape, state machine, or atomic update rule is defined, while the spec simultaneously says the successor owns the journal schema. **That split is wrong for this specific contract: the package that first persists journal bytes must own their initial versioned schema.**

**Recommendation:** move the initial journal schema into the HAND's exact contract — exact path and version; record fields and filename encoding; pending/moved/committed/returned/retained states; atomic update protocol; ownership of partial index writes; precise transaction completion boundary; behavior for every post-commit failure point. The successor should own replay, migration, list/recover, and user workflows — not the initial on-disk format already required here.

## 7. The package remains larger than one implementer session

**File:** `docs/specs/WP-dream-denied-object-disposal.md:88-101, 235-286, 325-337` — **Confidence:** 0.96

The spec declares size `M`, but currently has seven deliverables; four production files; 15 acceptance criteria; classification, no-clobber restoration, EXDEV copying, collision allocation, journaling, rollback, private-mode repair, uninstall confirmation, and pre-spawn behavior; and a requirement to demonstrate every criterion both green and red. This is not one-session work, especially in a data-loss-critical path.

**Recommendation:** split the HAND into reviewable implementation packages while preserving the single stacked deployment with the EYE. At minimum, separate: (1) object classification plus complete no-clobber HEAD restoration; (2) residue transaction, initial journal schema, rollback, and EXDEV behavior; (3) uninstall preflight and pre-spawn consumption. This is not a recommendation to fold the lifecycle successor into the HAND.

## ROUTED, not folded in

**Residue-lifecycle successor WP** — `src/cli/dream.js:535` and `:550` still use destructive `restoreVaultToHead` after brain failure and scratch-integrity failure; already-routed, not counted against the HAND. Crash replay, uninstall return-to-original-path, and user-facing list/recover remain successor work. The initial schema finding above is counted against the HAND only because this package itself must write and consume those bytes before the successor exists.

**WP-dream-fence-candidate-set — EYE** — `docs/specs/WP-dream-fence-candidate-set.md:36-39` still says the HAND "ships first." That wording should be changed to "is built and reviewed first" to match the joint-deployment rule. No new candidate-set, denial-rule, visibility, stabilization, or report-bridge finding is folded into this review.

**C2 — git-execution seam:** no new routed finding. **C3 — layout dot rule:** no new routed finding.

## Test-suite and repository-state verification

`npm test` — **exit 0**: 2,037 tests, 2,028 passed, 0 failed, 9 skipped. `npm run lint` — **exit 0**; markdownlint and frontmatter passed; local shellcheck and PSScriptAnalyzer skipped, binaries unavailable. These run against a spec-only branch and do not validate the proposed implementation. Initial and final `git status --porcelain` both empty and byte-identical.

## Command log (condensed; exit statuses preserved)

36 invocations. Load-bearing: throwaway repository measuring executable-mode and
link-count behaviour for `writeFileSync` + `linkSync` (**0**); throwaway filesystem
measuring hard-link relocation and subsequent alias writes (**0**); throwaway
filesystem testing `linkSync`/`symlinkSync` against occupied files, non-empty
directories and symlinks (**0**); throwaway parent/submodule repository testing
`git show HEAD:<gitlink>` (**0**, inner `git show` intentionally returned 128);
throwaway filesystem demonstrating occupant replacement between exclusive destination
allocation and `renameSync` (**0**); `df -T` probe (**1**, Darwin's `df` rejected the
GNU-style flag, so no cross-mount test was derived from it); `npm test` (**0**);
`npm run lint` (**0**); reads of `src/cli/uninstall.js`, `src/core/manifest.js`,
`src/core/dream/validate.js`, `src/cli/dream.js`, `src/core/private-fs.js`,
`src/core/prompt.js` and both specs (all **0**).

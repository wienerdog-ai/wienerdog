---
title: Round 2 — external adversarial design review (raw), WP-dream-control-file-fence
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. -->

# Round 2 — external adversarial design review (raw), C1

Backend: `gptsol`, English-pinned. Reviewer instructions:
`docs/runbooks/review-prompts/adversarial.md`, verbatim, plus the round-≥2 duty to
verify each prior finding is genuinely fixed. Spec at commit `b9ad76a`. SCOPE RULE
carried again; the reviewer returned an explicitly EMPTY routed section, confirming
nothing was smuggled in from C2/C3. Read-only verified: `git status --porcelain`
zero bytes before and after.

## Verbatim reviewer output

---

# Part 1 — Round-1 finding verification

| Round-1 finding | Verdict | Evidence executed |
|---|---|---|
| **R1-1 — deleted tracked `.gitignore`** | **NOT FIXED** | The ordinary and nested happy paths work: `git checkout HEAD -- nested/.gitignore` restored the ignore file, reconstructed a removed parent directory, re-hid `private.txt`, and both the current and next status were clean. However, two adversarial cases fail. First, when a directory containing `.gitignore` and an ignored `private.txt` is renamed, restoring `old/.gitignore` and denying `new/.gitignore` exposes `new/private.txt`; the following `git add -A` staged it. Second, if the deleted tracked `.gitignore` path has been replaced by a non-empty directory, `git checkout HEAD -- path` returned 0 while deleting the directory and its `user-data` file. An unwritable parent produced checkout exit 255, while the spec defines no safe per-path failure disposition. |
| **R1-2 — literal residue exclusions** | **FIXED** | In a throwaway repository, `:(top,literal,exclude)<path>` excluded exactly the intended path while staging an unrelated comparison path for all tested names: `*`, `?`, `[`, `]`, leading `:`, leading `-`, backslash, and non-ASCII `café`. Every tested `git add` exited 0. |
| **R1-3 — copy-based preservation and non-regular files** | **PARTIALLY FIXED** | `/src/core/dream/validate.js:703-737` confirms that the regular-file helper still performs a byte-buffer copy into a 0600 file under a 0700 directory. A hard link appears to Git as a regular untracked file; FIFO and empty-directory entries did not appear in `git status --porcelain -z -uall`, while a symlink did. The deny-without-destroy design is not safe across runs because the denied path remains available to the next Codex brain before the new report is written. The acceptance criteria are also contradictory: lines 305-307 require preserving a symlink "AS a symlink" and preserving a directory, while lines 319-321 require preserving neither. |
| **R1-4 — commit-boundary stabilization** | **FIXED** | The revised seven-step sequence is coherent for its intended, writable-filesystem path: the denial set is monotonic, the report is rebuilt rather than repeatedly appended in bridge mode, re-fencing can discover further paths, and a hard iteration cap terminates the process. Deriving counts and registry candidates only after stabilization fixes the original sequencing defect. The new findings below concern unsafe restoration, unavailable durable state, and the bridge rather than an inherent step-4/step-5 loop. |

**Ship verdict: NO-SHIP — C1 still permits cross-run instruction persistence, can expose or destroy user data while restoring `.gitignore`, and its bridge is unsafe for filesystem aliases.**

## 1. A directory rename turns `.gitignore` enforcement into private-file disclosure

- **Lines:** 149-151, 294-315
- **Confidence:** 0.99

1. **What can go wrong?**
   A denied directory rename can expose and commit a file that the original `.gitignore` had kept invisible.

2. **Why is this path vulnerable?**
   The rule processes `.gitignore` paths first, but it treats the deletion and addition independently. I created tracked `old/.gitignore` containing `private.txt`, added an ignored `old/private.txt`, and renamed `old` to `new`. Initial status omitted `new/private.txt` because `new/.gitignore` still hid it. Restoring the deleted `old/.gitignore` and removing the denied added `new/.gitignore` then made `new/private.txt` visible. The next `git add -A` staged:

   ```text
   R100 old/kept.txt new/kept.txt
   A    new/private.txt
   ```

   Restoring the old ignore rule does not re-hide the renamed private file because it is now under a different directory.

3. **Likely impact**
   Previously ignored user data can enter the dream commit. This is the exact data-disclosure class that `.gitignore` ordering is intended to prevent.

4. **Concrete recommendation**
   Extend C1's `.gitignore` visibility contract to cover paired deletion/addition and directory-renaming shapes. Before applying ignore-file denials, retain the visibility boundary that existed before the rename, and ensure files exposed solely by denying the destination `.gitignore` are neither staged nor classified as ordinary dream output. Add an acceptance case for a directory rename carrying both an ignore file and a file hidden by that ignore file.

This belongs in C1: it is a failure of C1's own tree-based `.gitignore` fence, not the C2 git-execution seam or C3 layout rule.

## 2. Unconditional deletion restoration can silently destroy replacement data

- **Lines:** 150, 170-179, 298-315
- **Confidence:** 1.0

1. **What can go wrong?**
   Restoring a deleted tracked control file can delete unrelated user data that now occupies the same path.

2. **Why is this path vulnerable?**
   The spec says every denied deletion is restored unconditionally with `git checkout HEAD -- <path>` and excludes deletions from preservation. I deleted tracked `nested/.gitignore`, replaced that pathname with a non-empty directory, and wrote `nested/.gitignore/user-data`. Status contained both the tracked deletion and the untracked child. Running the mandated checkout returned exit 0, removed the replacement directory and `user-data`, and restored the tracked file. The resulting status was clean, so the loss is not detectable from Git afterward.

   This also defeats the "`.gitignore` first" ordering: the checkout destroys the child before the ordinary classification pass can preserve or deny it.

3. **Likely impact**
   Silent, irreversible user-data loss, despite the package's stated "nothing is destroyed without a durable copy" invariant.

4. **Concrete recommendation**
   Before deletion restoration, inspect the current pathname without following links. Restore directly only when the path is absent. If any filesystem object occupies the pathname, classify and preserve that object under the same destruction rules before checkout; if it cannot be preserved, leave it as residue and do not run checkout. Define a fail-closed outcome for checkout failure, including the measured unwritable-parent case where checkout exited 255.

This is C1 scope because the destructive operation is introduced by C1's deletion rule.

## 3. Residue remains an active instruction channel before the next fence runs

- **Lines:** Spec 173-193, 250-255, 277-280, 308-321; `brain.js` 187-190; `dream.js` 493-558
- **Confidence:** 1.0

1. **What can go wrong?**
   A denied `AGENTS.md`, `CLAUDE.md`, or equivalent instruction path that becomes residue can steer the next dream despite never being committed.

2. **Why is this path vulnerable?**
   Table C excludes residue from the next precommit, but deliberately leaves the filesystem object in place. The Codex brain then starts with the vault as its working directory at `brain.js:187-190`. The M7 audit establishes that instruction files in that working directory are the persistence channel. The next run's report is produced only after the brain has run, so "reported loudly in every run" is too late to prevent consumption.

   This applies directly to:
   - a regular instruction file whose quarantine copy failed;
   - a denied symlink at an instruction filename;
   - a denied directory used by a dot-prefixed harness configuration path.

3. **Likely impact**
   M7 remains open. A steered dream can obtain durable cross-run control from uncommitted working-tree state, and the next run can execute under hostile instructions before the validator reports the residue.

4. **Concrete recommendation**
   C1 must ensure residue cannot be consumed as harness control before spawning the brain. At minimum, instruction-bearing residue must block the affected brain before spawn; a stronger solution is to move it outside the vault using a preservation representation that safely handles symlinks and directories. Merely excluding it from Git is insufficient. The acceptance criteria must prove that a second Codex run does not read or act under a residue `AGENTS.md`/`CLAUDE.md`, not only that Git does not commit it.

This is not scope accretion: preventing the denied instruction file from persisting into the next harness run is the core M7 closure claimed by C1.

## 4. The forceable full-disk scenario also defeats the residue marker and report

- **Lines:** Spec 179, 185-194, 308-311; `validate.js` 703-736
- **Confidence:** 0.97

1. **What can go wrong?**
   The same full disk used to force preservation failure can prevent the durable residue marker and enforcement report from being written. The next run then has no reliable exclusion source.

2. **Why is this path vulnerable?**
   `quarantinePreserve` catches any write failure and returns `null`. Table C then requires a durable marker and report but does not define their location, atomic write protocol, or failure behavior. Under the default layout, the vault and `~/.wienerdog/state` ordinarily share the home filesystem. A filesystem with no free blocks does not selectively reject the quarantine copy while guaranteeing that the marker and report remain writable.

   The spec also leaves the marker's "final shape" for a later owner ruling at lines 194 and 230-234, even though durable marker behavior is required to make the cross-run safety claim.

3. **Likely impact**
   Either:
   - residue is left without a durable exclusion and can be promoted later; or
   - marker/report failure aborts the run, giving the attacker exactly the cheap dream off-switch that Table C says is forbidden.

   The stated dual constraint is therefore not satisfied by the specified mechanism.

4. **Concrete recommendation**
   Define the marker representation and its atomic failure contract before C1 becomes Ready. A preservation failure must not return control until either durable exclusion state is confirmed or the system takes an explicitly ruled fail-closed action. Add a fault-injection acceptance case where quarantine, marker, and report writes fail independently. Do not use "full disk" as the reason to reject halting unless the alternative remains safe under that same full-disk condition.

## 5. The bridge's full-file write follows links and can overwrite another vault file

- **Lines:** Spec 156-158, 281-284, 325-330; `validate.js` 1378-1391
- **Confidence:** 1.0

1. **What can go wrong?**
   A pre-planted symlink or hard link at the exempted report path causes the mandated full-file write to overwrite the linked target instead of replacing the report-path object.

2. **Why is this path vulnerable?**
   The bridge exempts the exact report path and says a full-file code-owned write is sufficient hardening. It does not require no-follow behavior, an object-type check, or atomic replacement. I tested both forms:
   - `.reports/2026-08-20.md` as a symlink to `CLAUDE.md`;
   - the same report path as a hard link to `CLAUDE.md`.

   In both cases, Node's `fs.writeFileSync` changed `CLAUDE.md` to `# code-owned report`.

   A symlink to an ordinary dot-free note is worse for the final fence: the target note is not itself denied, so the report bytes can be committed as a modification of that note while the exempted report path remains a symlink.

3. **Likely impact**
   User-data corruption, a committed malicious filesystem alias at the exempted path, and repeated corruption on later report writes. The bridge's claim that pre-planted bytes cannot affect the commit is false for pre-planted filesystem identity.

4. **Concrete recommendation**
   Require an atomic replacement of the report leaf rather than a truncating write through the existing object: create a private temporary regular file in a verified, non-symlinked report directory and rename it over the report path. Verify every ancestor and the leaf with no-follow semantics, reject unsupported object types, and test symlink, hard-link, and symlinked-parent cases.

This is necessarily C1 work because C1 introduces and hardens the bridge.

## 6. Literal bridge identity fails on a case-insensitive filesystem

- **Lines:** 144, 155-158, 325-330
- **Confidence:** 0.98

1. **What can go wrong?**
   A valid dot-prefixed report layout can fail to receive the exemption, causing the validator's own report to be denied or preventing stabilization.

2. **Why is this path vulnerable?**
   The spec requires one exact literal report path but does not define filesystem-identity comparison. On the current case-insensitive filesystem, I configured/wrote `.Reports/2026-08-20.md` while `.reports` already existed. Git reported the path as `.reports/2026-08-20.md`:

   ```text
   configured_rel= .Reports/2026-08-20.md
   git_reported_rel= .reports/2026-08-20.md
   literal_equal= False
   casefold_equal= True
   ```

   Thus the pinned configured spelling and Git's staged spelling can name the same file while failing literal equality.

3. **Likely impact**
   Supported existing configurations can lose their dream report or hit the stabilization cap on macOS and other case-insensitive filesystems.

4. **Concrete recommendation**
   Define the bridge by verified filesystem identity rather than raw string equality, while still permitting only one leaf. Add an acceptance case where configured and Git-reported casing differ on a case-insensitive filesystem. The implementation must not broaden the exception to a prefix.

## 7. The mandatory verification commands are green before any C1 behavior exists

- **Lines:** Spec 286-375, 396-400
- **Confidence:** 1.0

1. **What can go wrong?**
   A C1 implementation can omit material acceptance behavior while still satisfying every mandatory verification command.

2. **Why is this path vulnerable?**
   I ran all three commands against the current spec-only branch, before C1 implementation exists. All three exited 0:
   - `npm test -- --test-name-pattern "dream"`
   - `npm test`
   - `npm run lint`

   Therefore, the verification block does not independently prove that any fence, residue, deletion, bridge, or stabilization behavior was added. The spec delegates all enforcement to tests the implementer is expected to design, while supplying no command-level requirement that those behavioral contracts exist or fail on a broken implementation.

   The definition of done also still requires "the both-directions run for the new assertion" at line 399, although the verification section explicitly says there is no new assertion.

3. **Likely impact**
   The package can present a completely green verification transcript without implementing its security contract. Review becomes the only safeguard against omitted tests and omitted behavior.

4. **Concrete recommendation**
   Keep the rejection of source-text greps, but require behavior-level verification mapped to the acceptance groups. The implementation review must show each required test failing against a deliberately broken implementation and passing against the completed implementation. Update the definition of done to refer to these behavioral checks rather than a nonexistent source assertion. Resolve the contradictory acceptance criteria for symlink/directory preservation before dispatch.

# ROUTED, not folded in

No additional C2 or C3 finding was discovered that should be counted against C1. The known `core.hooksPath`, `--no-verify`, `--no-ext-diff`, repository-local Git state, and layout dot-rule work remains correctly routed to C2 and C3 respectively. None of the findings above requires pulling those successor packages into C1.

# Commands executed

25 invocations, all read-only against the checkout, with throwaway experiments under
`mktemp -d`. Highlights: literal-pathspec probe across `*`, `?`, `[`, `]`, leading
`:`, leading `-`, backslash and non-ASCII (exit 0); directory-rename and
checkout-obstruction experiment (exit 0); replacement-directory checkout experiment
(internal checkout exit 0, child data deleted); FIFO/hard-link/symlink/directory
status experiment (exit 0); case-sensitivity probe (exit 0); symlink and hard-link
full-file-write experiment (exit 0, both targets overwritten); unwritable-parent
restoration (internal checkout exit 255, `Permission denied`);
`npm test -- --test-name-pattern "dream"` exit 0; `npm test` exit 0; `npm run lint`
exit 0 (shellcheck skipped, binary unavailable).

Start and end `git status --porcelain` were both zero bytes and byte-identical. No
repository file was created, modified, or deleted.

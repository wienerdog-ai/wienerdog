---
title: Round 3 — external adversarial design review (raw), WP-dream-control-file-fence
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. The 33-item command
     table at the end is condensed to its load-bearing entries with the exit
     statuses preserved; the full list is in the agent transcript. Everything
     above that point is byte-verbatim. -->

# Round 3 — external adversarial design review (raw), C1

Backend: `gptsol`, English-pinned. Reviewer instructions:
`docs/runbooks/review-prompts/adversarial.md`, verbatim, plus the round-≥2 duty to
verify each prior finding. Spec at commit `38f2597`. SCOPE RULE carried; the reviewer
again returned an explicitly empty routed section and argued why finding 1 is C1's,
not C2's. Read-only verified: `git status --porcelain` zero bytes before and after.

## Verbatim reviewer output

---

# Part 1 — Round-2 finding verification

| Round-2 finding | Verdict | Evidence executed |
|---|---|---|
| **R2-1 — directory rename widened ignore visibility** | **NOT FIXED** | In a throwaway repository, `old/.gitignore` hid `old/private.txt`; after renaming `old` to `new`, Git reported only the deleted and added `.gitignore` paths. `git check-ignore` returned 1 for both reported candidates, while the unreported `new/private.txt` returned 0. After denying `new/.gitignore`, restoring `old/.gitignore`, and running `git add -A`, `new/private.txt` was staged. Nested rules and negation themselves behave correctly when the path is known (`check-ignore` returned 0 for an ignored path and 1 for a negated visible path), but a per-status-candidate probe cannot discover the hidden path. I also verified that an untracked root `.gitignore` containing `*` hides both itself and `CLAUDE.md`, leaving `git status --porcelain -uall` empty. The invariant therefore has neither a complete input set nor a mechanism protecting the next precommit. |
| **R2-2 — checkout deleted an occupant at a tracked deletion** | **PARTIALLY FIXED** | The required no-follow `lstat` prevents checkout over an occupant that already exists when classified. It does not make "classify then act" atomic. I reproduced `lstat → ENOENT`, then created a non-empty directory at the path, then ran `git checkout HEAD -- CLAUDE.md`; checkout exited 0 and silently deleted the directory and its child. An occupant seen in time is routed through relocation, but a concurrent user/editor replacement after `lstat` is still destroyed. The spec also lacks a transactional disposition for objects already relocated before a later path or later pipeline stage fails. |
| **R2-3 — residue remained an instruction channel** | **PARTIALLY FIXED** | Successful relocation removes the denied object from the vault and therefore closes the direct next-run instruction channel. The fourth state is not complete, however: destination creation, collision-safe naming, index atomicity, rollback, recovery, retention, and post-relocation failure behavior are unspecified. `fs.renameSync` was measured overwriting an existing destination file. `src/cli/dream.js` has no restore catch around `validateAndCommit`, so relocation can succeed and a later report/staging/commit failure can leave the user's object outside the vault with no committed report. |
| **R2-4 — full disk defeated the marker and report** | **NOT FIXED** | The claim that same-filesystem rename makes disk fill irrelevant is false. The local `rename(2)` documentation states `ENOSPC` occurs when the destination directory must be extended. Creating `state/residue/`, allocating its destination directory entry, writing the pairing index, and writing the report can all require metadata space. Directory contents and extended attributes need not be copied on the same filesystem, but that does not guarantee the rename itself can complete. The spec names relocation failure, yet its blocked reason and report can fail for the same full-disk condition, leaving no durable account of the event. |
| **R2-5 — bridge write followed symlinks and hard links** | **PARTIALLY FIXED** | Atomic temp-plus-rename avoids truncating through the existing report leaf and safely breaks a pre-existing hard link when correctly implemented. The recipe remains incomplete: it does not require an `O_EXCL|O_NOFOLLOW` temp open, post-open identity verification, collision behavior, or ancestor revalidation at rename time. The no-follow classification and later pathname-based rename retain a same-user ancestor/leaf swap window. Existing `private-fs.js` documents this exact class of path-based residual, but the bridge does not name or constrain it. |
| **R2-6 — bridge identity failed on case-insensitive filesystems** | **PARTIALLY FIXED** | On the current case-insensitive filesystem, `lstat` showed `.Reports/report.md` and `.reports/report.md` have the same `(dev, ino)`, while a symlink has a different no-follow identity. That handles case aliases without following a symlink. But a hard-linked `.evil.md` also has exactly the same `(dev, ino)` as the configured report. Filesystem identity alone therefore does not "admit exactly one leaf"; a naive identity predicate exempts every hard-link alias. The spec must define directory/leaf identity and hard-link disposition, not merely require "filesystem identity." |
| **R2-7 — verification was green before implementation** | **PARTIALLY FIXED** | The rewritten spec now requires RED and GREEN evidence for every acceptance criterion, which is materially stronger. It remains weakly enforceable: 19 top-level criteria, several containing four or five independent behaviors, map only to three broad commands. One globally broken implementation can make all tests red without showing that each test detects the named defect. The current spec-only tree still passes the dream-focused suite, full suite, and lint. A criterion-to-test-to-targeted-mutation evidence table is not required. |

**Ship verdict: NO-SHIP — C1 still misses a tree-based self-hiding `.gitignore`, retains a reproducible data-loss TOCTOU, and makes relocation an irreversible non-transactional operation without a complete recovery contract.**

## 1. An untracked `.gitignore` can hide itself and the instruction file from the entire fence

- **Lines:** 159–180, 252–254, 307–327
- **Confidence:** 1.0

### What can go wrong?

A steered dream can create an untracked root `.gitignore` containing `*` and an untracked `CLAUDE.md`. Neither path appears in `git status --porcelain -uall`, so neither enters the classification primitive, visibility probe, relocation path, report, or staged-set fixed point.

### Why is this code path vulnerable?

Table A defines the fence over Git-reported candidates, while the implementation notes explicitly decline `--ignored`. I reproduced the following state in a fresh repository:

```text
.gitignore contents: *
CLAUDE.md exists
git status --porcelain -uall: <empty>
git check-ignore .gitignore: exit 0
git clean -fd: leaves both files
```

This is a tree-based hiding channel created by the dream itself, not a pre-existing user ignore rule and not `.git/info/exclude` or `core.excludesFile`.

The pre-spawn assertion may protect a later dream if it independently discovers every hidden instruction file, but it does not remove the object and cannot protect the user's own harness sessions in the vault. That leaves the core M7 persistence impact intact.

### Likely impact

The dream can leave a durable, uncommitted `CLAUDE.md` in the user's vault while the validator reports no denial. User-started Claude or Codex sessions can consume it. The `.gitignore` also persists through `restoreVaultToHead` because `git clean -fd` does not remove ignored files.

This falsifies Table A's claim that C1 closes tree-based hiding and the acceptance criterion covering every untracked dot-prefixed path.

### Concrete recommendation

Add a Git-status-independent, no-follow inventory for control filenames that C1 itself promises to deny, at minimum `.gitignore` at every relevant depth and the four instruction basenames. Use that inventory both:

1. before the first staging operation, to capture hidden control files and the paths whose visibility they affect; and
2. at the final commit boundary, to prove no denied object remains in the vault.

Do not broaden this into processing all ignored user data. The inventory can remain narrowly scoped to C1's code-owned denial names. Add an acceptance case where an untracked `.gitignore` hides itself and `CLAUDE.md`.

## 2. Relocation is non-transactional and can remove user data from the vault without a recoverable run record

- **Lines:** Spec 169–170, 194–207, 290–295, 317–346; `dream.js` 558–564
- **Confidence:** 0.99

### What can go wrong?

The fence can successfully move a user-reachable object into `state/residue/`, then fail while processing another path, rebuilding the report, staging, scanning, or committing. The object remains outside the vault even though the run produced no commit and potentially no report or usable pairing index.

### Why is this code path vulnerable?

Relocation is applied while the validator is still processing a multi-stage run. It is not part of a transaction. The current caller catches and restores failures around the brain, but not failures thrown by `validateAndCommit`; after that call begins, `dream.js` proceeds directly to ledger updates.

The new durable state is also under-specified:

- `fs.renameSync` replaces an existing destination regular file; I verified that the old destination bytes were lost.
- No collision-safe, no-replace allocation protocol is specified.
- The residue index has no schema, atomic-write rule, or ordering relative to the move.
- The filename encoding used when the index cannot be written is not defined.
- The EXDEV "copy" fallback does not define how directories, symlinks, hard links, FIFOs, or partial copies are handled.
- There is no rollback or recovery behavior when later pipeline work fails.
- There is no retention policy, operator-facing recovery operation, or bound on growth.
- `private-fs.js` registration repairs existing entries; it does not by itself guarantee that the destination directory can be safely created during this run.
- On a full filesystem, `rename(2)` can return `ENOSPC` when the destination directory needs another entry, contrary to the unconditional "allocates no data blocks" conclusion.

### Likely impact

A normal editor save made during the dream can be mistaken for brain output and moved out of the user's vault. A subsequent unrelated Git or report failure leaves the save unavailable at its original path. The user may receive only a generic failed-run alert, with no committed report and no guaranteed original-path mapping.

Repeated steered writes can also grow `state/residue/` without bound.

### Concrete recommendation

Define relocation as a recoverable transaction:

1. Allocate a collision-resistant destination without replacement.
2. Durably write an atomic journal entry containing run ID, original path, destination, object type, and state.
3. Move or safely copy the object.
4. Mark the journal entry complete only after the commit/report succeeds.
5. On any later run failure, restore the object to its original path only if that path is still empty; otherwise retain it and emit a durable recovery alert.
6. Define EXDEV behavior separately for regular files, symlinks, and directories, including partial-copy cleanup.
7. Define retention and an explicit user recovery/acknowledgement lifecycle.

Add fault-injection acceptance cases for every stage after a successful relocation: index write, report write, staging, secret scan, commit, and registry update.

## 3. The shared `lstat` primitive does not prevent checkout from deleting a concurrent replacement

- **Lines:** 182–192, 263–277, 328–333
- **Confidence:** 1.0

### What can go wrong?

A user or editor can create an object at a deleted tracked pathname after the fence observes `ENOENT` but before `git checkout HEAD -- <path>`. Checkout then silently removes that new object.

### Why is this code path vulnerable?

The contract is "classify first, then act," using two pathname-based operations with no binding between them. I reproduced the exact sequence:

1. Delete tracked `CLAUDE.md`.
2. `lstat("CLAUDE.md")` returns `ENOENT`.
3. Create `CLAUDE.md/note.txt`.
4. Run `git checkout HEAD -- CLAUDE.md`.
5. Checkout exits 0; the directory and `note.txt` disappear; the tracked file is restored.

This is not merely an owner-level malicious race. The spec itself says a user's editor may write while the brain runs and that user bytes are indistinguishable from brain bytes. The new primitive therefore introduces an unnamed data-loss window in the expected operating environment.

The acceptance criterion covers only an occupant already present before classification, so it does not detect this race.

### Likely impact

Silent, irreversible loss of a concurrent user save. Git reports a clean path afterward, so the loss is not observable through the validator's staged set or report.

### Concrete recommendation

Do not run `git checkout` directly onto a pathname merely because a prior `lstat` saw it empty. Specify a no-clobber restoration protocol that atomically claims the empty pathname before materializing HEAD bytes, or fails closed if the pathname is occupied.

If portable Node APIs cannot provide the required atomic no-replace transition, explicitly name the residual and change the behavior to preserve availability rather than restore: leave the tracked deletion uncommitted, fail the run, and never invoke destructive checkout after a separate emptiness check.

Add a fault-injection test that creates a non-empty replacement between classification and restoration.

## 4. "Filesystem identity" cannot distinguish the one bridge leaf from hard-link aliases

- **Lines:** 171–175, 334–340
- **Confidence:** 0.97

### What can go wrong?

A second denied path hard-linked to the report has the same filesystem identity as the configured report. An implementation following the stated identity rule can exempt both paths, committing a forbidden dot-prefixed alias.

### Why is this code path vulnerable?

I created `.Reports/2026-08-20.md` and hard-linked it as `.evil.md`. `lstat` reported identical `(dev, ino)` for:

- `.Reports/2026-08-20.md`
- the case alias `.reports/2026-08-20.md`
- `.evil.md`

The first two must compare equal on this case-insensitive filesystem. The third must not receive the bridge exemption. Plain filesystem identity cannot express both requirements.

Using `realpath` to recover the configured spelling is not a safe substitute because it follows symlinks. A no-follow inode comparison avoids that problem but admits every hard-link alias.

### Likely impact

A malicious dot-prefixed path can survive the fence under the validator's own exemption. Depending on operation ordering, it can remain staged or committed even though the postcondition claims that exactly one leaf is exempt.

### Concrete recommendation

Define bridge matching as a compound identity, not leaf inode equality:

1. Verify the configured report directory and every ancestor without following links.
2. Match the Git-reported candidate to that verified parent directory.
3. Resolve only the leaf's case spelling under that parent.
4. Reject or atomically replace a pre-existing leaf with `nlink > 1`.
5. Apply the exemption only to the single candidate under that parent, never to another path sharing the inode.
6. Revalidate the parent identity at the atomic rename boundary.

Add a test containing both a case alias and a separate hard-link alias in the staged set.

## 5. C1 is not bounded to one implementer session, and its verification evidence can pass without proving each mechanism

- **Lines:** Spec 100–111, 155–215, 301–378; authoring runbook 3–22; README 13–25
- **Confidence:** 0.94

### What can go wrong?

The implementation can omit a security sub-mechanism or provide non-targeted RED evidence while still appearing to satisfy the package's definition of done.

### Why is this code path vulnerable?

Five deliverables alone are not excessive. The actual mechanism count is:

- iterative staged-set stabilization;
- visibility preservation across ignore changes;
- no-follow object classification;
- tracked restoration;
- relocation and EXDEV fallback;
- residue indexing;
- private-mode integration;
- report bridge identity;
- atomic bridge replacement;
- a pre-spawn invariant;
- rollback/failure behavior;
- count and registry recomputation.

The spec has 19 top-level acceptance criteria. Several contain four or five independently fail-able assertions. It then requires every criterion to be shown RED and GREEN but maps all of them only to three broad commands. A single broken common prerequisite can make every test red without proving sensitivity to each named mechanism.

The spec is also 414 lines and repeats owned facts across Table A/Table C, implementation notes, security checklist, and acceptance criteria instead of consistently citing one owner. It prescribes several test mutations and code-level mechanisms despite the authoring rule that a spec should state the contract and verification target, not duplicate test design and implementation structure.

### Likely impact

Implementation and review are likely to become multi-session work despite the `size: M` declaration. Under that pressure, fault paths such as post-relocation failure, EXDEV copying, bridge aliases, or next-run visibility can be omitted while the required command transcript remains green.

### Concrete recommendation

Split C1 internally, without pulling in C2 or C3:

1. **C1a:** complete control-file discovery, visibility invariant, and staged-set stabilization.
2. **C1b:** no-clobber restoration, relocation transaction, recovery lifecycle, and pre-spawn behavior.
3. **C1c:** temporary report bridge identity and atomic replacement.

If an insecure intermediate activation would result, land helper/test packages first and activate the fence only in the final C1 package.

Require a PR evidence table mapping each independently observable acceptance behavior to:

- the exact test name;
- the targeted defect introduced;
- the RED result;
- the GREEN result.

That remains behavioral verification and does not require source-text assertions.

# ROUTED, not folded in

No new C2 or C3 finding was counted against C1.

- **C2 — git-execution seam:** `core.hooksPath`, `--no-verify`, `--no-ext-diff`, `.git/info/exclude`, `core.excludesFile`, and the wider repository-local-state class remain correctly routed to C2 or the disclosure package. They should not be pulled into C1.
- **C3 — layout dot rule:** rejecting dot-prefixed layout values and adding its diagnostic remain correctly routed to C3. The bridge defects above belong to C1 because C1 introduces and relies on that temporary exemption.

The self-hiding untracked `.gitignore` finding is not C2: it is an ordinary tree `.gitignore`, produced inside the vault, and directly contradicts C1's own tree-based fence contract.

# Commands executed (condensed; exit statuses preserved)

33 invocations, all read-only against the checkout, with throwaway repositories under
`mktemp -d`. Load-bearing entries:

- Directory-rename visibility experiment — exit 0; both status candidates `check-ignore` exit 1, hidden `new/private.txt` exit 0, final `git add -A` staged it.
- Self-ignoring `.gitignore` experiment — exit 0; `git status --porcelain -uall` zero bytes, `git check-ignore .gitignore` exit 0, `git clean -fd` left both files.
- Nested ignore/negation probe — exit 0 for the ignored path, exit 1 for the negated visible path.
- `fs.renameSync` destination-collision experiment — exit 0; existing destination bytes replaced.
- Deleted-path `lstat`/checkout race — internal checkout exit 0; replacement directory and child deleted.
- Case-insensitive identity and symlink probe — exit 0; case aliases shared identity, symlink's no-follow identity differed.
- Hard-link bridge-identity experiment — exit 0; configured spelling, case alias and separate hard-link alias all shared `(dev, ino)`.
- `man 2 rename` — exit 0; documents `ENOSPC` when the destination directory cannot be extended.
- `node -e "console.log(fs.constants.RENAME_NOREPLACE)"` — exit 0; output `undefined`.
- `npm test -- --test-name-pattern dream` — exit 0; 308 passed, 0 failed.
- `npm test` — exit 0; 2,028 passed, 0 failed, 9 skipped.
- `npm run lint` — exit 0; shellcheck and PSScriptAnalyzer skipped, binaries unavailable.
- Acceptance-criteria count — exit 0; 19 top-level criteria.
- Start and final `git status --porcelain` — exit 0, zero bytes, byte-identical.

# Lesson / gotcha

- `WP-dream-control-file-fence`: A status-based control-file fence cannot claim complete tree-based `.gitignore` coverage unless it independently discovers an untracked `.gitignore` that hides itself.

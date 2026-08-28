---
title: Round 1 — external adversarial design review (raw), WP-dream-control-file-fence
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. -->

# Round 1 — external adversarial design review (raw), C1

Backend: `gptsol`. Reviewer instructions: `docs/runbooks/review-prompts/adversarial.md`,
verbatim, placeholders filled. Output language pinned to English. Spec under review at
commit `92f566b`. Dispatch carried a SCOPE RULE — findings belonging to C2 or C3 must be
reported in a separate "ROUTED, not folded in" section and may not be counted against C1 —
and isolated the predecessor's review record as evidence about the code, never as review
credit. Read-only proof: `git status --porcelain` empty before and after, pasted below.

## Verbatim reviewer output

---

# NO-SHIP — C1 still has paths that can commit previously ignored user data, over-exclude unrelated files, violate quarantine guarantees, and leave the commit-boundary state internally inconsistent.

## 1. A deleted `.gitignore` residue can promote previously ignored user data into the current or next commit

**File:** `docs/specs/WP-dream-control-file-fence.md:148-183, 275-288`
**Related code:** `src/core/dream/validate.js:122-135, 1223, 1412`
**Confidence:** 0.99

### What can go wrong?

When the dream deletes a tracked `.gitignore`, rename-first preservation cannot preserve the missing working-tree path. Table B therefore classifies it as residue and leaves the deletion untouched. The missing ignore file makes previously ignored user files visible. Excluding only the residue path from `git add -A` does not exclude those newly visible files, so they are staged and committed.

This can happen in the current run at the later `git add -A` sites, or in the next run during `precommitSessionEdits`.

### Why is this code path vulnerable?

Table B says preservation applies to tracked and untracked paths, but its mechanism operates on a working-tree object. A tracked deletion has no object to rename or copy. Its prescribed failure behavior is to leave the path untouched and mark only that path as residue.

Table C then treats the residue marker as the complete exclusion set. It does not account for paths whose visibility changed because the residue is a missing `.gitignore`.

I reproduced the failure in a throwaway repository:

```text
STATUS_AFTER_DREAM_DELETION
 D .gitignore
?? private.txt
STAGED_WITH_DELETED_GITIGNORE_EXCLUDED
A	private.txt
STATUS_AFTER_TARGETED_ADD
 D .gitignore
A  private.txt
```

The command used the intended literal exclusion for `.gitignore`; `private.txt` was nevertheless staged.

### Likely impact

A file the user intentionally kept outside Git history can be committed without consent. It may contain Obsidian state, local configuration, secrets, or other private data. This directly contradicts the preservation requirement and weakens M10 rather than closing its tree-based portion.

### Concrete recommendation

Add an explicit contract for deleted visibility-affecting paths before C1 is implementable:

- Define how a tracked deletion is preserved as user state even though no filesystem object exists.
- Do not leave a deleted `.gitignore` active while staging unrelated paths.
- Either restore the HEAD ignore state while recording the user-visible deletion separately, or carry the complete set of paths exposed by the missing ignore state into every exclusion set.
- Add a binary acceptance case for a deleted tracked `.gitignore` that previously ignored an ordinary, dot-free user file. The user file must remain untracked, untouched, unreported, and uncommitted in both the current and next run.
- Apply the same analysis to nested `.gitignore` deletions.

---

## 2. The residue pathspec is not literal, so one residue can exclude unrelated paths

**File:** `docs/specs/WP-dream-control-file-fence.md:180-183, 226-234`
**Confidence:** 0.99

### What can go wrong?

A residue path containing Git pathspec metacharacters such as `*`, `?`, or `[]` is interpreted as a pattern. The exclusion can therefore suppress unrelated legitimate user edits or dream output from every `git add -A` site.

### Why is this code path vulnerable?

The spec requires pathspecs shaped as:

```text
:(exclude)<path>
```

The security checklist argues that passing the value as a separate argv element is sufficient. That prevents shell interpretation, but Git itself still interprets pathspec metacharacters.

I reproduced this with a residue named `.foo/a*.md`:

```text
NON_LITERAL
.foo/other.txt
LITERAL
.foo/abc.md
.foo/other.txt
```

With `:(exclude).foo/a*.md`, both the literal file `a*.md` and the unrelated `abc.md` were excluded. With `:(top,literal,exclude).foo/a*.md`, only the exact residue path was excluded.

### Likely impact

A steered dream that reaches the residue branch can create a persistent, path-controlled exclusion pattern. Subsequent runs may silently omit multiple user files from precommit and dream commits. This creates hidden dirty state and can become a denial-of-service mechanism against selected path families.

### Concrete recommendation

Make the exclusion contract explicitly literal and root-relative:

```text
:(top,literal,exclude)<vault-relative-path>
```

Also require tests covering filenames containing `*`, `?`, `[`, `]`, and a leading `:`. The security checklist must state that separate argv elements prevent shell injection but do not disable Git pathspec parsing.

---

## 3. Rename-first preservation contradicts the existing quarantine mode, visibility, and concurrency contracts

**File:** `docs/specs/WP-dream-control-file-fence.md:164-172`
**Related code:** `src/core/dream/validate.js:679-738`; `src/core/digest.js:807-863`; `src/core/private-fs.js:592-668`
**Confidence:** 0.98

### What can go wrong?

The prescribed rename preserves the source inode's permissions rather than the quarantine helper's 0600 file mode. Directories and symlinks are also incompatible with existing quarantine consumers, which expect regular files. In addition, an application holding an open descriptor continues writing to the renamed quarantine object rather than the restored vault path.

### Why is this code path vulnerable?

The spec requires rename-first preservation while "keeping `quarantinePreserve`'s destination, modes and naming" and says the existing pending-review banner and mode contract are unchanged.

Measured rename behavior contradicts that claim:

```text
MODE=666 TYPE=Regular File
DIR_MODE=755 TYPE=Directory
LINK_MODE=755 TYPE=Symbolic Link
```

A 0666 source remained 0666 after moving into the 0700 quarantine directory. A directory remained 0755.

The existing consumers are also type-specific:

- `listSecretQuarantine` includes only `Dirent.isFile()` entries, so preserved directories and symlinks are absent from the existing pending-review banner.
- `listPrivateEntries` classifies dynamic quarantine leaves as files. A directory or symlink is surfaced as an anomaly rather than as a valid quarantined copy.
- The spec does not define a type-specific mode contract. A directory needs traversal permission, while chmod on a symlink is platform-dependent and can affect the referent if implemented incorrectly.

I also measured the open-handle behavior:

```text
QUARANTINE_CONTENT=before|after-open-save|
VAULT_PATH_EXISTS=no
```

After the rename, a write through an already-open file descriptor went into the quarantine copy. For a tracked path, the validator would then recreate the HEAD version at the original path, silently splitting later user saves from the file the user believes is open. This is not the inherited copy-then-revert race described at line 171; rename changes the race semantics.

### Likely impact

Possible outcomes include:

- quarantined user bytes retaining weak source permissions;
- preserved directories or symlinks being absent from the existing review banner;
- private-mode diagnostics reporting the new valid preservation objects as anomalies;
- user edits continuing into quarantine after the vault path has been restored to different content.

These are privacy, recovery, and silent-data-divergence failures.

### Concrete recommendation

Before selecting rename-first, define and measure a complete per-type preservation contract:

- regular file: resulting mode, ownership, atomicity, and open-descriptor behavior;
- directory: destination shape, recursive contents, and traversable private modes;
- symlink: preserved link text, no referent traversal, and platform behavior;
- tracked deletion: metadata representation;
- EXDEV fallback: equivalent output shape and cleanup after partial copies.

Either choose a quarantine representation that existing consumers can safely enumerate, or explicitly add the consumers that must understand directories and symlinks to the deliverables. Do not claim the existing mode and banner contracts remain unchanged unless tests demonstrate that for every supported preserved type.

---

## 4. The final fence pass has no coherent sequencing with report generation, staged accounting, and skill registration

**File:** `docs/specs/WP-dream-control-file-fence.md:150-156, 178-185`
**Related code:** `src/core/dream/validate.js:1374-1448`
**Confidence:** 0.95

### What can go wrong?

If the required commit-boundary pass discovers and reverts a forbidden path, the implementation must update the enforcement report. But the report is currently assembled before the last `git add -A`. Updating it after the final pass changes the working tree after the allegedly final staged-set evaluation.

The implementation must then choose one of several bad outcomes unless another stabilization cycle is specified:

- commit without the required enforcement line;
- leave the updated report unstaged and the vault dirty;
- stage the report without rechecking the exact committed set;
- compute `committed`, note/skill counts, or `newSkills` from a pre-fence staged set;
- register a skill in Step 6 that the final pass removed.

### Why is this code path vulnerable?

Table A places the last evaluation after the last `git add -A` and immediately before commit. It also requires every denial to be reported through the existing report and CLI plumbing. The spec never defines how the report update is staged without invalidating that finality.

The existing code derives all of these before commit:

- enforcement report at `1374-1409`;
- final stage at `1412`;
- committed paths and counts at `1413-1430`;
- commit at `1432-1440`;
- skill registry update at `1443-1448`.

The specification names the final pass but does not assign these consumers to the final stabilized set.

### Likely impact

A late denial can be missing from the durable report, can leave uncommitted state, can produce incorrect summaries, or can create a registry entry for a path not present in the commit. These failures are difficult to detect because the Git commit itself may still succeed.

### Concrete recommendation

Define the commit boundary as an explicit stabilization protocol, not a single pass:

1. Stage using the complete residue exclusion set.
2. Fence the staged set.
3. Rebuild the enforcement report from the final denial set.
4. Stage the report using a targeted, residue-aware operation.
5. Re-read and re-fence the exact staged set.
6. Only after the staged set is stable, derive `committed`, counts, and skill-registry candidates.
7. Commit immediately from that exact set.

Add an acceptance case where a path is first detected only at the boundary and assert the report bytes, committed path list, counts, clean-tree state, and skill registry together.

---

# ROUTED, not folded in

## C3 — current valid dot-prefixed layout values conflict with C1's universal staged-set postcondition

**Package:** C3, the layout dot-rule and diagnostic
**Evidence:** `docs/specs/WP-dream-control-file-fence.md:142-158`; `src/core/layout.js:65-70, 114-118`

The current layout validator accepts dot-prefixed mapped directories. I verified that:

```text
.reports
```

was returned for:

```yaml
vault_layout:
  reports_dir: .reports
```

C1's postcondition rejects every staged path containing a dot-prefixed segment. A code-generated dream report under `.reports/` will therefore violate the fence even though the current configuration is valid.

This is routed to C3 under the supplied scope rule and is not counted as an additional C1 finding. C3 must define the migration and diagnostic for currently accepted dot-prefixed mappings, including the report directory. The serial package plan should explicitly account for the interval in which C1 has shipped but C3 has not.

No additional C2 issue was found beyond the already-routed git-execution seam.

---

# Execution record

Initial `git status --porcelain`, exit 0: empty. Final `git status --porcelain`, exit 0:
empty. Byte-identical. Branch `wp/dream-write-fence-control-files`, HEAD
`92f566bdebb3b13a2cc44925a59c2d4fa58f29ba`.

- `npm test` — exit 0: 2,037 tests, 2,028 passed, 0 failed, 9 skipped.
- `npm run lint` — exit 0: markdownlint and frontmatter checks passed; local `shellcheck`
  and `pwsh` layers reported their tools missing and were skipped.
- 38 tool invocations in total: reads of the review set, the repository rules, the audit
  findings, the predecessor logbook, the deliverables and the claimed-about source; `grep`
  sweeps for validator control points, quarantine consumers and alert surfaces; and six
  throwaway-repository experiments — a literal/non-literal pathspec pair, a rename
  mode/type probe, a deleted-`.gitignore` residue reproduction, an open-file-descriptor
  rename probe, and a `readVaultLayout` dot-directory probe. One wrapper exited 1 because
  zsh reserves `status` as a read-only variable, after both Git reads had already
  succeeded; it mutated nothing. One experiment exited 128 because its throwaway
  directory had not been created, and was rerun correctly.

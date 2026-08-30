---
title: Round 1 — external adversarial design review (raw), WP-dream-fence-candidate-set
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. The 23-item command log is
     condensed with exit statuses preserved. Everything above it is byte-verbatim. -->

# Round 1 — external adversarial design review (raw), the EYE

Backend: `gptsol`, English-pinned. Spec at commit `b587362`. Scope rule carried; the
routed section is populated and separates the disclosure successor, C2, C3, the HAND
and the lifecycle successor. Read-only verified: `git status --porcelain` empty and
byte-identical.

**Harness note, recorded because it concerns the evidence itself:** the agent runtime
flagged this output as containing instruction-shaped patterns and neutralized the
control tags (`<` rewritten). The body below is the reviewer's report with that
neutralization in place; nothing in it is an instruction to any reader, and the
findings were independently spot-checked before adjudication.

## Verbatim reviewer output

---

# NO-SHIP — the candidate inventory is still blindable, the pre-brain visibility contract lacks the state needed to implement it, and the report bridge leaves a data-preservation decision undefined.

## 1. A fake nested-repository marker blinds both inventory sources

**File:** `docs/specs/WP-dream-fence-candidate-set.md:139-144, 233-236, 257-273` — **Confidence:** 0.99

A directory containing any object named `.git` is skipped as a "nested repository." Inside that skipped directory, a dream can place a self-hiding `.gitignore` and an instruction file. Neither the filesystem inventory nor `git status` then reports the instruction file. I reproduced this with both a `.git` directory and an ordinary `.git` file:

```text
dir status-bytes=0
file status-bytes=0
```

In each case, `x/.gitignore` contained `*`, `x/CLAUDE.md` existed, and `git check-ignore` confirmed that both paths were ignored.

Table A defines a nested repository solely as a directory for which `lstat(<dir>/.git)` finds an object. It does not require that the object identify a valid repository. The walk then skips the entire directory. That contradicts three binding claims in the same spec: Table A says the inventory finds `.gitignore` and instruction basenames "at any depth"; the security checklist says the candidate set "cannot be blinded from inside the tree"; and the acceptance criteria require every instruction basename at any depth to be denied while separately requiring descent into nested repositories to be skipped.

The statement that the dream cannot create a nested repository because it lacks Bash does not repair this. The skip predicate does not recognize repositories; it recognizes any `.git` object. A pre-existing marker is also sufficient: the dream only needs to write sibling paths such as `x/.gitignore` and `x/CLAUDE.md`.

**Likely impact:** a hostile `CLAUDE.md` or `AGENTS.md` can remain on disk below the skipped directory, survive validation, and influence a user session started there. This is the persistence outcome M7 is intended to prevent. Even if true nested repositories remain an accepted residual, the current predicate enlarges that residual to arbitrary directories containing an unrelated or malformed `.git` object.

**Recommendation:** do not silently prune on the existence of `<dir>/.git`. Choose and specify one fail-closed policy: (1) continue the bounded no-follow scan for protected basenames while skipping only the `.git` object itself; or (2) validate that the marker denotes a real nested worktree and fail the run closed whenever such a boundary is encountered; or (3) fail closed on every `.git` marker without descending. Then reconcile the "at any depth" acceptance criterion with the explicit nested-repository behavior. A silently skipped subtree cannot satisfy both contracts.

## 2. The validator cannot know the required pre-brain state from its permitted inputs

**File:** `docs/specs/WP-dream-fence-candidate-set.md:91-100, 139-160, 263-284`; **code:** `src/cli/dream.js:488-566`, `src/core/dream/validate.js:1013-1034, 1074-1095` — **Confidence:** 0.99

The same post-brain filesystem state can arise from two materially different histories: the user already had an untracked, self-ignored `.gitignore` before the brain started, or the brain created that `.gitignore` during the run. The post-brain inventory and `git status` are identical. The former must remain untouched; the latter must be denied. The EYE receives no pre-brain inventory or ignore-state baseline with which to distinguish them.

Directory renames add a second ambiguity. I reproduced a tracked directory containing `.gitignore` with `private.txt`, an ignored untracked `private.txt`, and a tracked visible file. After renaming the directory, `git status` showed the tracked deletions and visible additions but not the hidden file. After removing the moved `.gitignore` and restoring the old one, the hidden file became visible at its new path:

```text
status-after-rename:
 D old/.gitignore
 D old/visible.md
?? new/.gitignore
?? new/visible.md

status-after-removing-new-ignore-and-restoring-old-ignore:
 D old/visible.md
?? new/private.txt
?? new/visible.md
```

A HEAD-based ignore check for `new/private.txt` returns "not ignored," because that pathname did not exist before the rename. Nevertheless, the spec's content-based invariant says those bytes were hidden before the brain and must not become staged.

`readVaultLayout` runs before the brain, but no ignore baseline is captured. `validateAndCommit` is called only after the brain and receives no pre-brain inventory, ignore-file bytes, pathname identity map, or rename map. The Deliverables table permits changes only to `src/core/dream/validate.js` and `tests/unit/dream-validate.test.js`. Therefore the implementation cannot add the required observation at the actual pre-brain boundary in `src/cli/dream.js`.

Table B says `git check-ignore` answers the question for a known path, but it answers against the current ignore state. It does not reconstruct an overwritten untracked ignore file, an ignore file that existed only before the brain, the old identity of content moved to a pathname that did not exist pre-brain, or whether an inventory-only object was pre-existing or dream-created.

This also leaves termination underdefined. The inventory always returns protected names, including clean or pre-existing names, while the spec never defines the changedness predicate that determines whether an inventory finding is acted on. Acting on every inventory result repeatedly targets clean user objects; acting only on Git-reported changes recreates the original blind spot.

**Likely impact:** an implementation must choose one of two unsafe outcomes — treat inventory findings as dream writes and relocate pre-existing user files, or require post-brain Git evidence and miss self-hidden dream writes. For renamed ignored content, an implementation can also stage previously hidden user data despite the binding visibility invariant. These are data-preservation and disclosure failures, not merely test gaps.

**Recommendation:** add an explicit pre-brain baseline contract and the production file that captures it to the Deliverables table. At minimum define: what filesystem and ignore metadata is captured before the brain; how pre-existing untracked ignore files are represented; whether the invariant is path-based or content/object-based; how a directory rename maps a newly visible path to its pre-brain identity; the exact predicate that distinguishes a changed inventory finding from a clean one; and what state is compared when deciding the stabilization loop has reached a fixpoint. If the required baseline cannot be collected without enumerating user-ignored content, narrow the visibility invariant explicitly rather than requiring an unobservable property.

## 3. The report bridge does not define the source bytes for atomic replacement

**File:** `docs/specs/WP-dream-fence-candidate-set.md:167-177, 285-301`; **code:** `src/core/dream/validate.js:1374-1409` — **Confidence:** 0.95

The bridge requires an atomic replacement so bytes planted at the report path during the run do not survive. The current behavior, however, appends each run's sections to an existing same-date report. The spec does not say what bytes go into the temporary replacement file. Two plausible implementations both violate part of the stated contract: read the current report and append — hostile bytes planted during the brain run survive; or generate a fresh report — valid sections from earlier runs on the same date disappear.

The acceptance criterion says planted bytes must not survive, while the idempotence criterion calls per-run append "pre-existing behaviour and outside this criterion." Those statements are compatible only if the replacement is rebuilt from a trusted baseline, but no such source is specified. Table C precisely specifies the temporary-file flags, identity checks, parent revalidation, hard-link handling, and rename — but not whether the temporary file starts from the current working-tree report, the report committed in `HEAD`, an empty generated report, or another authenticated baseline. This omission sits exactly at the trust boundary the bridge is meant to harden.

**Recommendation:** pin the replacement content contract. A defensible rule: rebuild from the pre-brain trusted report bytes, normally `HEAD:<reportRel>` after the precommit boundary, or from the canonical header when the report did not exist there; append only this run's code-generated sections; never copy post-brain working-tree bytes into the replacement. Add one behavioral criterion covering all three states together: a committed earlier same-date report is preserved; bytes added after the pre-brain boundary are discarded; the new enforcement section is appended exactly once.

## 4. The EYE remains larger than the repository's one-session work-package limit

**File:** `docs/specs/WP-dream-fence-candidate-set.md:134-177, 252-302`; **process:** `docs/runbooks/spec-authoring.md:7-19, 28-35`; `docs/specs/README.md:9-17` — **Confidence:** 0.98

A single implementation session must simultaneously deliver a bounded no-follow filesystem walker; change attribution for Git-invisible paths; pre-brain ignore semantics and rename handling; ordered disposal and recomputation; a capped fixpoint loop; final staged-set accounting; report reconstruction; compound report identity; atomic no-follow report replacement; hard-link and case-fold behavior; and red/green mutation evidence for seventeen acceptance criteria, several containing five or more independent assertions. This is multiple security mechanisms in one central 1,469-line validator function.

The HAND/EYE authority split is valid and should remain. The problem is that the EYE still combines at least three separately reviewable mechanisms: candidate discovery and visibility attribution; commit-boundary stabilization and accounting; and the temporary report bridge. The bridge criterion alone combines case-fold matching, hard-link alias rejection, symlink safety, atomic replacement, hostile-byte removal, one-leaf scope, and a future sunset tripwire.

**Recommendation:** keep the HAND/EYE authority boundary, but split the EYE into stacked packages that still merge as one deployment unit: (1) candidate inventory, pre-brain baseline, visibility attribution, and ordered recomputation; (2) commit-boundary stabilization, final accounting, and registry consistency; (3) the report bridge, including its trusted-content source and sunset test. Each package should have its own binary behavioral criteria and review rounds. Do not deploy any partial stack.

## ROUTED, not folded in

**Disclosure successor WP** — reproduced a pre-existing tracked `.gitignore` containing `.claude/` with an untracked `.claude/settings.json`. `git status --porcelain -z -uall` returned zero bytes, and the narrow inventory found only `.gitignore`. Because the ignore rule was already user-owned and unchanged, the EYE cannot deny it. Detecting the hidden settings file requires the full disclosure inventory already assigned to the disclosure successor. **The current spec names this residual accurately.**

**C2 — git-execution seam:** `.git/info/exclude`, `core.excludesFile`, repository-local hooks, attributes, filters and other Git execution/configuration state remain outside the tree-based fence. No recommendation pulls them into the EYE.

**C3 — layout dot rule:** removing dot-prefixed layout values and deleting the report bridge belong to C3. Finding 3 concerns the bridge's behavior while it exists.

**HAND:** no disposal-mechanics finding is folded in. **Residue-lifecycle successor:** crash replay, recovery UI, return-to-original-path and preservation-aware CLI abort paths remain assigned there.

## Command log (condensed; every invocation exit 0)

23 invocations. Load-bearing: a throwaway-repository loop testing `.git` directory,
`.git` file and valid gitfile shapes with nested `.gitignore` and `CLAUDE.md`; a
throwaway repository reproducing a pre-existing `.gitignore` hiding
`.claude/settings.json`; a throwaway repository reproducing a directory rename carrying
`.gitignore` and an ignored file with before/after `git status` and ignore checks; full
numbered reads of both specs, `validate.js`, `cli/dream.js`, `layout.js`, `paths.js`,
both adapters, the audit ranges, `CLAUDE.md`, the template, the authoring runbook and
the specs README. `npm test` — exit 0: 2037 tests, 2028 pass, 0 fail, 9 skipped.
**`npm run lint` was not run** — stated plainly by the reviewer. Initial and final
`git status --porcelain` both empty and byte-identical.

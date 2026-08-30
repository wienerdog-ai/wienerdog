---
id: WP-dream-control-file-fence
title: Deny the dream every control-file write, over a candidate set git cannot be blinded to
status: Superseded
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0025]
epic: audit-2026-07-29
---

# WP-dream-control-file-fence: the fence, over the committed set

> **SUPERSEDED 2026-08-20 — never implemented; kept as the record of why.**
> Three adversarial rounds and one re-charter left this package at thirteen
> mechanisms and twenty-four acceptance criteria. The size self-check that followed
> the re-charter found it fits only one of its heuristics, so the owner split it in
> two at the **eye/hand** boundary — the same boundary the two families that kept
> failing sat astride:
>
> | Successor | Owns | Ships |
> |---|---|---|
> | `WP-dream-denied-object-disposal` (the HAND) | everything that touches the disk: classification, no-clobber restoration, relocation into `state/residue/`, pairing, fault injection, the pre-spawn assert | FIRST — a strict improvement on today's candidate set, adding no denial rules and closing no finding by itself |
> | `WP-dream-fence-candidate-set` (the EYE) | everything that decides and accounts for what enters the commit: the git-independent inventory, the denial rules, the visibility invariant, the recompute ordering, the stabilization protocol, the report bridge | SECOND, `depends_on` the HAND; closes M7 and M10 as far as a fence reaches |
>
> The two PRs are **stacked and merged together** — no night may run on half a fence.
> Why, in full, with every round's raw output and the owner's rulings:
> `docs/specs/logbook/2026-08-20-dream-control-file-fence-review-rounds.md`.
> **Nothing below this banner was implemented.** It is retained because its
> measurements — the self-hiding `.gitignore` that empties `git status`, the `checkout`
> that silently deletes a replacement directory, the write that follows a symlink out
> of the report path — are the reasons the successors are shaped as they are.

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** spawns a headless AI
brain under a code-owned hermetic runtime profile (ADR-0025), lets it write into
the user's Obsidian **vault** — which is a git repository — and then runs a
code-owned **validator** (`src/core/dream/validate.js` `validateAndCommit`) that
classifies the changes, reverts what policy forbids, and commits the rest as one
revertible commit with a report. The validator is the dream's **write fence**: the
brain proposes, code disposes. The brain's input is untrusted by construction, so
a **steered dream** (threat class T2) is the standing assumption; the profile
denies it Bash, network and MCP (`src/core/runtime-profile.js:58`, `:81`), leaving
Write and Edit inside the vault.

**The fence has no notion of files that control machinery.** Its classification
knows three special cases — containment escape, the learnings ledger, Tier-3
(identity and skills) — and everything else falls through to "keep and commit". A
vault-root `CLAUDE.md`, an `AGENTS.md` at any depth, or a `.gitignore` is none of
them. The 2026-07-29 audit reproduced this on a live dream-profile run as **M7**
(`docs/security-audit/2026-07-29/CURRENT-IMPLEMENTATION-REVIEW.md:676` — a planted
instruction file re-steers later runs and any session the user starts in the vault)
and **M10** (`:931` — the dream can write the ignore file, and an ignored path never
enters the classification loop).

This package is **C1 of three**, the first and only one running now (WIP = 1). Its
predecessor, `docs/specs/done/WP-dream-write-fence-control-files.md`, was superseded
without ever being implemented: two adversarial rounds showed it carried three
independent mechanisms. C1 takes the fence itself; **C2** takes the git-execution
seam (M9); **C3** takes the layout rule. Neither starts before C1 closes. Read the
predecessor only if you want the evidence — everything C1 needs is here.

**Four measured facts shape this package, and each contradicts an obvious design.**

1. **A fence over one `git status` snapshot is not a fence.** The dream writes a
   `.gitignore` hiding `CLAUDE.md` plus the `CLAUDE.md`; the loop sees only the
   `.gitignore`; denying it **un-hides** the instruction file, and a later
   `git add -A` stages and commits it. Measured.
2. **That naive fence is worse than doing nothing, not at parity.** Measured on the
   untouched tree: with the hostile `.gitignore` in force at `git add -A`,
   `CLAUDE.md` does **not** enter the committed tree — it sits on disk, untracked and
   ignored, surviving `git clean -fd`. **Do not write the argument "it would be
   committed today anyway" into this spec.** The reason the fence is still worth
   building is the disk, which is what a harness actually reads.
3. **Denying a path can destroy user data.** A user who saves a `CLAUDE.md` while the
   brain runs is indistinguishable from brain output; and if the dream drops a rule
   from a tracked `.gitignore`, a previously-ignored user file such as
   `.obsidian/workspace.json` becomes visible in the same snapshot. Both were
   reproduced being permanently deleted, with no commit and no copy.

4. **A fence whose candidate set comes from `git status` can be blinded from inside
   the tree, by the very file class this package exists to deny.** Measured: the dream
   writes an untracked root `.gitignore` containing `*` and an untracked `CLAUDE.md`;
   `git status --porcelain -z -uall` is then **empty**, so no candidate, no
   classification, no denial and no report line exist — and `git reset --hard HEAD`
   followed by `git clean -fd` leaves **both** files on disk. This is why the candidate
   set no longer comes from git.

So the fence draws its candidates from a **git-independent inventory** (Table A),
evaluates them over the set the run commits, iterates, and moves out of the vault
whatever it cannot restore.

## Current state

`src/core/dream/validate.js` (1469 lines), `src/cli/dream.js`. Verified at `1d4c092`:

- Pipeline order: `precommitSessionEdits` (`dream.js:493`) → brain (`:510`) →
  `validateAndCommit` (`:558`). The precommit call (`validate.js:122-137`) runs
  `git add -A` then commits `vault: session edits before dream` — **unconditionally,
  over everything visible**, before the brain and before the fence.
- `changedPaths` (`:1020-1021`): `git status --porcelain -z -uall`. No `--ignored`.
- The classification loop (`:1145-1209`): (a) containment escape (`:1148`) → revert +
  `outOfVaultDetailed`; ledger (`:1154`); Tier-3 (`:1170`, `isTier3` at `:1087-1090`
  matching only the layout's identity- and skills-dir prefixes); (c) fall-through
  "keep" (`:1208`).
- `git add -A` runs **again** at `:1223` (before the EP2 secret gate) and `:1412`
  (before the commit). **Neither re-consults the classification.**
- Denials record `{path, reason}` on `reverted[]` (`:1100-1101`), rendered into the
  committed report (`:1384-1391`) and counted at `dream.js:617`. Transcript deferral
  keys on `secretReverts`, not `reverted[]` (`:1062-1072`, `dream.js:578`).
- `revertPath` (`:660-667`): `fs.rmSync` when untracked, else `git checkout HEAD -- rel`.
  Both destroy working-tree bytes.
- `quarantinePreserve(stateDir, vaultDir, rel, date, kind)` (`:703-738`): copies bytes
  with `fs.readFileSync` into `<stateDir>/quarantine/` (dir 0700, file 0600, atomic
  rename of a tmp file), name `<date>-<sanitized-basename>` **with a numeric collision
  suffix** (`:721-730`), returns `{name, bytes}` or `null`. The EP2 gate uses it and at
  `:1296-1312` refuses to destroy when no durable copy was saved.
- `restoreVaultToHead` (`:146-149`): `git reset --hard HEAD` + `git clean -fd`, not
  `-x` (`:141-143`) — `src/core/adopt-git.js:15-21` shows why: the project's own
  default ignore set covers Obsidian plugin binaries, `.obsidian/workspace*`,
  `.DS_Store`, `.trash/`, all real user data.
- `tests/unit/dream-validate.test.js` (2798 lines) is the only test file exercising
  this pipeline, precommit included.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | the fence per Table A, the shared classification primitive per Table B, relocation per Table C |
| modify | src/cli/dream.js | the pre-spawn invariant assert per Table D, at the `precommitSessionEdits` seam |
| modify | src/core/private-fs.js | register `state/residue/` as an A5-scoped private directory so `sync`/`doctor` repair its modes like every other state area |
| modify | tests/unit/dream-validate.test.js | cover the acceptance criteria below (the implementer designs the cases) |
| modify | tests/unit/private-fs.test.js | as above, for the new state area |

### Exact contracts

The denial reason strings are code-owned literals — the single place their bytes are
decided. Each is a **base** plus exactly one **outcome suffix**. All are NEW; no
existing reason string changes. **No suffix names a filename**: the residue area
appends a collision suffix, so embedding a basename would make a repeated denial
produce a different enforcement line and break idempotence. The path ↔ copy pairing
lives in the residue index (Table C).

```text
base-dotseg:  control-file fence: a path segment starting with "." is outside the dream's writable surface
base-instr:   control-file fence: an AI-instruction filename is outside the dream's writable surface at any depth
suffix-restored: ; the deletion was reverted and the file restored from the last commit.
suffix-reverted: ; reverted, and the working-tree copy was preserved.
suffix-moved:    ; moved out of the vault into the run's residue area.
suffix-blocked:  ; NOT removed — it could not be moved out of the vault, so the vault was restored to its last commit and nothing was committed this run.
```

Worked example — the reproduced attack. A run writes `.gitignore` (hiding
`CLAUDE.md`), `CLAUDE.md`, and a legitimate `07-Daily/2026-08-20.md`. Pass 1 sees the
`.gitignore` and the daily note; the `.gitignore` denial runs first, un-hiding
`CLAUDE.md`; pass 2 denies it. The daily note is committed and **the vault is left
clean**:

```markdown
## Reverted by orchestrator (policy enforcement)
- `.gitignore` — control-file fence: a path segment starting with "." is outside the dream's writable surface; moved out of the vault into the run's residue area.
- `CLAUDE.md` — control-file fence: an AI-instruction filename is outside the dream's writable surface at any depth; moved out of the vault into the run's residue area.
```

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** the denial-reason taxonomy gains entries;
**(iv)** reason-code, revert and failure behaviour change; **(v)** the fence emits
durable state under `state/` whose lifecycle `sync`/`doctor` own; **(vi)** the dream
report, the CLI summary and the C2/C3 successors inherit the contract. Four of seven.

**The guiding sentence of this package: git tells you WHERE to look; only the disk
can tell you WHAT is there.** Round 2 measured the cost of ignoring it — a `checkout`
that silently deleted a directory full of user data, and a full-file write that
followed a symlink out of the report path into a user's note.

### Table A — the candidate set: a git-independent inventory

| Fact / rule | Value |
|-------------|-------|
| **Why it exists** | measured (Context, fact 4): a self-hiding `.gitignore` empties `git status` completely, so a git-sourced candidate set can be blanked from inside the tree by the exact class this package denies. **Git is no longer the candidate source.** It remains useful for what it is good at — telling the fence what CHANGED among visible paths — but it can no longer decide what the fence is allowed to see |
| **What the inventory is** | a bounded, **no-follow** walk of the vault that reports paths by name, independent of every ignore mechanism |
| **PINNED NARROW — this is the whole list** | exactly the **code-owned denial names**: a basename of `.gitignore` at any depth, and the four instruction basenames of Table B (below) (`AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `CLAUDE.local.md`, matched case-insensitively). **NOT all ignored user data**, and not the dot-prefixed class at large |
| **Why narrow is sufficient — the load-bearing argument** | the inventory only has to find the *hiding mechanism* and the *instruction files*. Everything else rule 1 denies (`.claude/`, `.obsidian/`, `.mcp.json`, …) becomes visible to git the moment the hiding `.gitignore` is denied and the set is recomputed (Table B's ordering). So a narrow inventory plus recomputation covers the broad rule, without the fence ever enumerating the user's ignored data — which is what the 2026-08-05 ruling forbade by refusing `git clean -x` |
| **What it deliberately does NOT close** | a region the **user** ignored independently, containing no code-owned denial name. That is M10's remaining half and belongs to the disclosure WP's full inventory, not here |
| Bounds | the walk skips `.git/`, does not descend into a nested repository (`lstat` of `<dir>/.git` marks one), follows no symlink, and is bounded in depth and entries; exceeding a bound fails the run closed rather than silently truncating |
| **Both consumers** | the inventory feeds the fence's candidate set **and** the pre-spawn assert (Table E). One walk, two readers — the assert must not be able to disagree with the fence about what is in the vault |
| Union with git | the fence's candidates are the inventory's findings **union** the paths `git status --porcelain -z -uall` reports. Git contributes changed visible paths; the inventory contributes what git cannot see. Neither alone is the contract |

### Table B — the fence

| Fact / rule | Value |
|-------------|-------|
| **Candidate source** | **Table A's inventory, unioned with git's reported changes.** Never git alone — measured, git can be blinded from inside the tree |
| **What it is evaluated over** | the set of paths the run **commits** — never one snapshot, at any single moment |
| Rule 1 | any `rel` with at least one `/`-separated segment whose first character is `.` |
| Rule 2 | any `rel` whose `path.basename(rel)` is in the instruction-name set, **case-insensitively** |
| Instruction-name set (code-owned) | `AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `CLAUDE.local.md` |
| Why those four | `AGENTS.md` and `CLAUDE.md` are the names **this repository itself installs managed instruction blocks into** (`src/adapters/codex.js:50`, `src/adapters/claude.js:39`). The other two are near-variants: a false denial costs nothing the dream needs, a miss is a persistence hole |
| Precedence | rule 1 first; a path matching both records rule 1's base |
| Where the first pass runs | the classification loop (`:1145`), after containment (`:1148`) and before the ledger (`:1154`) |
| **Ordering within a pass** | denials of paths that can change ignore visibility — a `.gitignore` at any depth — are applied **first**, and visibility is recomputed only after them |
| **VISIBILITY INVARIANT (binding), keyed to the PRE-BRAIN state** | **content the user had hidden before the brain ran never becomes staged because of what the fence does.** The reference point is the ignore state in force **before the brain started**, not the state at each intervention — a per-candidate probe was measured insufficient: a directory rename carrying both a `.gitignore` and a file it hid produced a status listing neither the hidden file nor any clue to it, the per-path rules were each individually correct, and the outcome was still disclosure (`A new/private.txt`). Keying to the pre-brain state also settles the converse correctly: a file the DREAM hid during the run was not hidden pre-brain, so it is fair game for the fence. `git check-ignore` answers the question for a KNOWN path (exit 0 = ignored, exit 1 = not — measured); enumerating which paths to ask about is Table A's job. The mechanism is the implementer's; the contract is this row |
| **The final evaluation is at the commit boundary** | measured: `git rm --cached <p>` followed by a later `git add -A` re-stages `<p>`, and the pipeline runs `git add -A` at `:1223` and `:1412` |
| **The commit-boundary stabilization protocol** | (1) stage; (2) fence the staged set; (3) rebuild the enforcement report from the final denial set; (4) re-stage the report; (5) re-read and re-fence the staged set; (6) only once stable, derive `committed`, the counts and the skill-registry candidates from **that** set; (7) commit from it. Without this a boundary denial misses the report, dirties the tree, or registers a skill the commit lacks — the report is assembled at `:1388`, **before** the last `git add -A` at `:1412`, and `committed`/counts (`:1413-1430`) and the registry (`:1443-1448`) all read a pre-fence set |
| **Termination** | iterate until the staged set stops changing. Bounded: relocation and restoration are monotonic — each removes a path from the vault or returns it to its HEAD state, neither of which is a change. The implementer caps iterations and **fails closed** on the cap: `restoreVaultToHead`, commit nothing, record the reason |
| **The postcondition** | at the moment of the commit, no path in the staged set violates rule 1 or rule 2, **except** the one path the bridge exempts — **and the vault working tree contains no denied object at all** (Table C) |
| **BRIDGE — the validator's own report path (sunsets with C3)** | `reports_dir: .reports` is a valid layout value today (measured), so the fence would deny the dream report itself. The fence exempts EXACTLY the report path the validator writes this run (`:1378`), only when the layout maps it under a dot-prefixed segment. Pinned before the brain starts from `paths.config` = `~/.wienerdog/config.yaml` (`src/core/paths.js:67`), outside the vault (`:63`), so the dream cannot rewrite it. One leaf, never a prefix |
| **Bridge identity is a COMPOUND identity, not leaf inode equality** | measured, both halves: on a case-insensitive filesystem a configured `.Reports/2026-08-20.md` is reported by git as `.reports/2026-08-20.md` — same file, unequal strings, so string equality fails; and a hard link `.evil.md` shares the report leaf's `(dev, ino)` exactly (`nlink=2`), so leaf-inode equality **exempts every hard-link alias**. The exemption is therefore: verify the configured report directory and every ancestor **no-follow**; match the candidate to that verified parent; resolve only the leaf's spelling under it; apply the exemption to that single candidate and never to another path sharing the inode |
| **Bridge write is an ATOMIC REPLACEMENT, never a truncating write** | measured: `fs.writeFileSync` through a symlink at the report path **overwrote the link target** — a vault `CLAUDE.md` became the report body while the report path stayed a symlink. The recipe: open the temporary file with `O_EXCL\|O_NOFOLLOW` in the no-follow-verified report directory, verify its identity after opening, **revalidate the parent's identity at the rename boundary**, and rename over the leaf. A pre-existing leaf with `nlink > 1` is not written through — it is replaced by a fresh leaf, never truncated, so no hard-link alias receives the report bytes. Scoped to the exempted case: for a dot-free `reports_dir` — every default install — the existing behaviour is byte-unchanged |
| **Named residual — the path-based swap window** | the no-follow classification and the later pathname-based rename are two operations, so a same-user ancestor or leaf swap between them cannot be excluded by any portable Node API. `src/core/private-fs.js` already documents this residual class. Stated, bounded by revalidation at the rename boundary, and **not** claimed to be atomic |
| **Sunset clause** | C3 removes dot-prefixed layout values, deleting this case. C1 leaves a test that **fails once the case is gone**, so the bridge cannot outlive its reason |
| Reason vocabulary | the literals under "Exact contracts". No existing reason string is edited or reused |
| Report and CLI | existing plumbing (`:1384-1391`, `dream.js:617`); no new surface |
| Transcript deferral | unchanged: keys on `secretReverts`, never `reverted[]` |
| Covered for free by rule 1 | `.git/`, `.gitignore`, `.gitattributes`, `.claude/`, `.codex/`, `.mcp.json`, `.obsidian/`, `.smart-env/`, `.cursorrules`, and every future dot-prefixed convention |
| **The bound of the whole mechanism** | it closes **tree-based** hiding only. Measured: `.git/info/exclude` and `core.excludesFile` hide from `git status --porcelain -uall` exactly as `.gitignore` does, and neither is stageable. Named residual; C2 owns the class, the disclosure WP owns detection |

### Table C — the shared classification primitive

| Fact / rule | Value |
|-------------|-------|
| **The rule** | **every** path the fence is about to act on is classified FIRST, in this pass, with a **no-follow `lstat`**. Git decides where to look; the disk decides what is there. There is one primitive and every action below routes through it |
| Tracked modification of a regular file | preserve, then `git checkout HEAD -- <rel>` (restore to the committed bytes) |
| Untracked regular file | relocate (Table C) |
| **Deleted path** | restore with `git checkout HEAD -- <rel>` **only when the pathname is empty**. If any object occupies it, that occupant's fate is decided first by this same primitive, and the restore happens after. Measured: `checkout` over a pathname replaced by a non-empty directory **exits 0 and silently deletes the directory and its contents**, leaving a clean `git status` — the loss is invisible to git afterwards |
| Symlink, directory, hard link, FIFO, socket, device node, or anything else | relocate (Table C). No preservation attempt reads through them |
| **Action-time revalidation, and an honest residual** | classification and action are two operations, so the primitive **re-validates immediately before acting** — but the remaining window cannot be closed portably and is a **NAMED RESIDUAL**, on the EP2 precedent. **No atomicity is claimed.** Measured why it matters: `lstat` returned `ENOENT`, a non-empty directory was then created at the pathname, and `git checkout HEAD -- <path>` exited 0 and silently deleted it. Because the window cannot be eliminated, the restore is **not** authorised by an earlier emptiness check alone: it claims the pathname at action time or fails closed for that path |
| Restore failure | fail closed for that path: do not retry destructively, record it, and let the run's fail-closed path handle it. Measured: an unwritable parent makes `checkout` exit 255 |
| Why no-follow is load-bearing | measured twice in round 2 — a `checkout` that destroyed a replacement directory, and a report write that followed a symlink into a user's note. Both are shape confusions that only an `lstat` before acting can prevent |

### Table D — relocation, the fourth state

| Fact / rule | Value |
|-------------|-------|
| **The fourth state** | a denied object that cannot be restored from HEAD is **moved out of the vault**, not left in it and not destroyed. This is the DEFAULT fate, on the main path |
| Destination | `<stateDir>/residue/` — a **NEW** area with its own minimal contract. Deliberately **not** the secret quarantine, whose consumers (`listSecretQuarantine`'s `isFile()` enumeration, the pending-review banner, `private-fs`'s diagnostics) round 1 measured as incompatible with directories and symlinks |
| **Destination allocation is collision-safe and never replaces** | measured: `fs.renameSync` silently overwrites an existing destination file. The destination is therefore allocated exclusively; a collision picks a new name rather than replacing what is already there |
| Mechanism | `fs.renameSync`. It moves a regular file, a **symlink as a symlink** with its target text intact, and a **directory whole** — all measured |
| **NO disk-fill immunity is claimed** | an earlier draft argued a same-filesystem rename allocates no data blocks and therefore cannot fail on a full disk. **That over-claimed and is withdrawn:** `rename(2)` returns `ENOSPC` when the destination directory must be extended, and creating the residue directory, its entries, the pairing index and the report all need metadata space. The honest contract is not immunity but **traceability**: the relocation-failure path must leave a durable trace, and the acceptance criteria carry fault-injection cases in which the relocation, the pairing index and the report each fail independently |
| Modes | the area is registered as an A5-scoped private directory in `src/core/private-fs.js` (beside `state/quarantine`, `:110-113`), so `sync` and `doctor` repair its modes exactly as they do every other state area. Contents keep their source modes — they are evidence, not fresh artefacts, and nothing enumerates them by type |
| **What this buys, and the spec must say all of it** | the vault is **CLEAN after the fence**. So: the `:(exclude)` + marker + retry apparatus leaves the main path entirely; cross-run promotion has nothing left to promote; the user's own harness sessions in the vault can no longer read a denied instruction file; and the structural-denial premise is restored — a denied object is gone, not merely un-committed |
| Pairing record | a residue index in the area maps the residue entry to its original vault-relative path. The reason strings name no filename (see "Exact contracts") |
| **Named residual (a) — the EXDEV corner** | `fs.renameSync` across filesystems raises `EXDEV`, and `<stateDir>` and the vault can sit on different mounts. There the fallback is a copy, defined separately for a regular file, a symlink (recreate the link, never read through it) and a directory (recursive, with partial-copy cleanup on failure). Named; the disclosure WP watches for the split-mount condition |
| **Named residual (b) — a degraded pairing record** | on a full disk the index may not be writable. The **relocation still happens** — moving is what protects the vault — and the pairing degrades to the encoding in the residue entry's own filename |
| **Named residual (c) — relocation itself failing** | if the object can be neither restored nor moved out, the run fails closed: `restoreVaultToHead`, commit nothing, record with `suffix-blocked`. This is the only path on which a denied object survives in the vault, and Table D is its second line |
| Inherited unchanged | the EP2 gate's preserve→destroy race window and its pinning test (`tests/unit/dream-validate.test.js:2322-2368`); the secret quarantine's own retention, modes and banner |

### Table E — the pre-spawn invariant assert (second line)

| Fact / rule | Value |
|-------------|-------|
| **What it is** | a small invariant assert in `src/cli/dream.js`, before the brain is spawned: if a forbidden instruction-shaped object is still sitting in the vault, **that evening's brain is loudly skipped**. Everything else in the run proceeds |
| **Its input is Table A's inventory** | the same walk the fence uses, so the assert and the fence can never disagree about what is in the vault — and, critically, the assert sees a self-hidden instruction file that `git status` would not report |
| **Not load-bearing, and the spec says so** | reaching it requires first defeating relocation (Table C's residual (c)). If an attacker manages that, not starting the brain is the correct answer, so the off-switch objection does not apply here as it did to a general halt gate |
| **The consumer it protects, stated correctly** | the live Claude brain does **not** run in the vault — `brain.js:196-198` gives it a neutral staging cwd (D-DREAM-CWD, WP-130); the vault cwd at `:189` belongs to the **dead** Codex branch. The real consumers of a residue instruction file are therefore the **user's own harness sessions in the vault** and any future Codex wiring. Relocation (Table C) protects both; this assert protects only the second, which is why it is the second line and not the first |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row cites the table that decides it)
- [ ] Acceptance criteria that assert each table's facts
- [ ] Verification steps
- [ ] The "Current state" description of what each table replaces
- [ ] The reason literals under "Exact contracts" — and their deliberate absence of a
      filename, which Table C's pairing row depends on
- [ ] Implementation notes and the Out-of-scope list
- [ ] Security checklist (the residual set)
- [ ] **Table A's bound and the C2 successor's class** — the two exclude channels
      appear in both and move together
- [ ] **The bridge** — Table A's exemption, its identity rule, its atomic write, its
      sunset test, and the Out-of-scope note that C3 deletes it
- [ ] **`state/residue/`** — Table C's contract, the `private-fs.js` deliverable row,
      and the acceptance criterion for its modes
- [ ] **Table A's inventory** — its pinned name list, the fence's candidate union, and
      Table E's assert all read it; if the list changes, all three change
- [ ] **Table E's consumer statement** — `brain.js:196-198` (live, staging cwd) versus
      `:189` (dead Codex branch); if either moves, Table E and the Context both change

## Implementation notes & constraints

- Zero new dependencies; plain Node >= 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing this package adds outlives its job.
- **The protected consumer of rule 2 is outside this repository** — the user's own
  vault and any coding-agent session started in it. There is no `file:line` caller
  chain to cite for it, and none is expected in review.
- **Do not argue that a denied file "would be committed today anyway."** Measured on
  the untouched tree: with a hostile `.gitignore` in force at `git add -A`,
  `CLAUDE.md` does **not** enter the committed tree — it sits on disk, untracked and
  ignored, surviving `git clean -fd`. The reason the fence is worth building is the
  disk, which is what a harness reads.
- **The residue marker / `:(exclude)` / retry apparatus is GONE from the main path.**
  Relocation empties the vault of denied objects, so there is nothing to exclude. The
  only path that still leaves an object in the vault is Table C's residual (c), and
  that path fails the run closed rather than carrying state into the next one.
- **`--ignored` on the status call stays declined**, and Table A is why it is not
  needed: `--ignored` would put `.obsidian/plugins/*/bin/`, `.smart-env/` and
  `.trash/` in front of rule 1 — the user data the ruling protects by refusing
  `git clean -x` — whereas the inventory is pinned to code-owned denial names and
  never enumerates the user's ignored content at all.
- **Aborting the run on any denial is still rejected**; Table D's assert is narrow,
  conditional on relocation having already failed, and skips only the brain.
- `git clean -fd` and its missing `-x` are not touched.
- When uncertain: choose the simpler option and note it in the PR under "Decisions
  made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item **applies**. The untrusted identifiers
      are the vault paths in `git status --porcelain -z` output. They reach the
      filesystem through the existing `resolveContainment` check (`:1147`), evaluated
      before this package's case, and then through Table B's primitive, which
      classifies every one of them with a **no-follow `lstat` before acting**. New
      spawn shapes are `git check-ignore` and `git rm --cached`, on paths that already
      passed containment; a separate argv element prevents SHELL interpretation but
      **not** git's own pathspec parsing (measured), so any pathspec this package
      passes carries the `literal` magic word.
- [ ] The surface is **an untrusted-by-construction agent's writes into a git
      repository**. Containment after this package: no denied object remains in the
      vault at all (Table C), no denial widens visibility (Table A's invariant), no
      action is taken on a path whose shape was not just measured (Table B), and the
      bridge's one exemption is a filesystem-identity match written by atomic
      replacement.
- [ ] **Named residual — non-tree hiding channels.** `.git/info/exclude` and
      `core.excludesFile` hide from every status-based fence and are not stageable
      (measured). C2 owns the class; the disclosure WP owns detection. **Neither may
      ever be cited as closing M9 or M10.**
- [ ] **Named residual — pre-existing user ignore entries (M10).** A region the user
      ignored independently produces no status entry at any pass. The disclosure WP's
      git-independent inventory is its closure.
- [ ] **Named residual — nested repositories.** Invisible to the outer `git status` or
      collapsed to one directory record; `git clean -fd` refuses them. The dream
      cannot CREATE one (no Bash, so no `git init` — `runtime-profile.js:58`, `:81`).
- [ ] **Named residual — unknown instruction filenames (ruled).** A tool Table A's set
      does not name passes rule 2.
- [ ] **Named residual — the EXDEV corner** (Table C residual (a)): on a split mount
      relocation falls back to a copy and the disk-fill lever returns there.
- [ ] **Named residual — a degraded pairing record** (Table C residual (b)): the move
      still happens; the pairing degrades to the residue entry's filename encoding.
- [ ] **Named residual — relocation itself failing** (Table C residual (c)): the run
      fails closed and Table D's pre-spawn assert is the second line.
- [ ] **Named residual — the EP2 preserve→destroy race window**, inherited unchanged
      and ruled; `tests/unit/dream-validate.test.js:2322-2368` pins it.
- [ ] **Named residual — the classify→act window** (Table C). Re-validation at action
      time narrows it; no portable Node API closes it, and **no atomicity is claimed**.
      Same shelf as the EP2 window.
- [ ] **Named residual — the path-based swap window at the bridge rename** (Table B),
      the class `src/core/private-fs.js` already documents.
- [ ] **Named residual — no disk-fill immunity** (Table D). `rename(2)` can return
      `ENOSPC` when the destination directory must be extended, so a full disk can
      defeat relocation, the pairing index and the report alike. The contract is a
      durable trace and fault-injection coverage, not immunity.
- [ ] **Named residual — the bridge's exempted report path.** One leaf, matched by
      filesystem identity, written by atomic replacement, deleted entirely by C3.

## Acceptance criteria

Every criterion below is behavioural and binary. The PR must show each of them
**failing against a deliberately broken implementation** as well as passing against
the finished one — see Verification steps.

- [ ] A dream-produced change at a path with any dot-prefixed segment is denied and
      recorded with `base-dotseg` — at the vault root, at depth, tracked and
      untracked, whatever the layout maps.
- [ ] A dream-produced change whose basename is any member of Table A's set, in any
      letter case, at any depth, is denied and recorded with `base-instr`.
- [ ] A path matching both rules records rule 1's base.
- [ ] **The reproduced attack fails**: a run writing a `.gitignore` that hides an
      instruction file *and* that instruction file commits neither and names both.
- [ ] **A self-hiding ignore file does not blind the fence**: with an untracked
      `.gitignore` containing `*` and an untracked `CLAUDE.md` — a state in which
      `git status --porcelain -z -uall` is EMPTY (measured) — both are found, both are
      denied and named in the report, and neither remains in the vault.
- [ ] **The inventory stays narrow**: a user-ignored region containing no code-owned
      denial name is not enumerated, not reported and not touched.
- [ ] **The pre-spawn assert sees what git cannot**: a self-hidden instruction file
      left in the vault stops that evening's brain.
- [ ] **No path violating rule 1 or rule 2 is in the staged set at commit time**,
      including one staged by a `git add -A` that ran after the classification loop.
- [ ] **The vault is clean of denied objects afterwards**: every denied object is
      either restored from HEAD or present in `state/residue/` and absent from the
      vault. Verified for a regular file, a symlink (still a symlink, target text
      intact), and a non-empty directory (moved whole).
- [ ] **`state/residue/` carries the private modes** `sync`/`doctor` apply to every
      other state area, and a fresh install repairs them idempotently.
- [ ] **The visibility invariant holds**: with a directory rename carrying both a
      `.gitignore` and a file it hid, the previously hidden file is not staged — not
      in this run, and not by the next run's precommit.
- [ ] **A user's previously-ignored file is untouched** when the dream drops its
      ignore rule.
- [ ] **A deletion is restored only onto a pathname claimed at action time**: when the
      deleted tracked path is occupied by a non-empty directory — whether before
      classification or created between classification and the action — that directory
      and its contents are not silently removed; the restore either claims an empty
      pathname or fails closed for that path.
- [ ] **Relocation never replaces**: a destination collision allocates a new name and
      the object already there keeps its bytes.
- [ ] **Fault injection**: with the relocation, the pairing index and the report write
      each failing independently, the run leaves a durable trace of what happened and
      never reports success.
- [ ] **No action follows a link**: a symlink at a denied path is moved as a symlink
      and its target is not read, written, or removed.
- [ ] **The bridge is exactly one leaf, matched by identity, written atomically**:
      with `reports_dir` mapped under a dot segment, the validator's own report for
      THIS run is committed while every other dot-prefixed path is denied; a
      configured spelling differing only in case from git's reported spelling still
      matches on a case-insensitive filesystem; a **separate hard-link alias sharing
      the report leaf's inode is still denied** and never receives the exemption; a
      symlink or hard link pre-planted at the report path does not cause any other
      file to be written; and a test fails
      once dot-prefixed layout values are gone.
- [ ] **The commit boundary stabilizes**: for a path first denied at the boundary,
      the report contains its line, the commit contains exactly the stabilized set,
      `committed` and the counts match it, the skill registry gains no entry for a
      path the commit lacks, and the worktree is clean afterwards.
- [ ] **Relocation failure fails the run closed**: nothing is committed, the vault is
      restored to HEAD, and the reason is recorded with `suffix-blocked`.
- [ ] **The pre-spawn assert skips only the brain**: with a forbidden
      instruction-shaped object still in the vault, the brain is not spawned, the
      skip is announced, and the rest of the run proceeds.
- [ ] Denial precedes the ledger and Tier-3 cases.
- [ ] No existing denial reason string changes, and every change accepted today at a
      dot-free, non-instruction path is still accepted and committed.
- [ ] Idempotence (the template's criterion; this package changes a command that
      writes outside the repo): a second dream run reproducing the same denied write
      produces a **byte-identical enforcement line** — which holds because no reason
      string names a filename. The report's per-run append is pre-existing behaviour
      and outside this criterion.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream"
npm test
npm run lint
```

**These three commands are green on a spec-only branch, before any of this package
exists — measured. They therefore prove nothing on their own, and the real gate is
the paragraph below.**

- **Every acceptance criterion above is a behavioural test the implementer writes, and
  the PR must demonstrate each one RED against a deliberately broken implementation
  and GREEN against the finished one.** Green-on-green is not evidence: a test that
  cannot fail looks identical to a test that passes. Break the thing the criterion
  names — remove the `lstat`, skip the visibility probe, let the restore run onto an
  occupied pathname, write the report through the existing object instead of renaming
  over it — and paste the red.
- **There is deliberately NO source-level assertion.** Round zero measured two
  candidates and both were defective: one was vacuous on the untouched tree, and one
  was shape-dependent, scoring 0/2 and 1/2 against two hand-built equally correct
  implementations, because the reason bases contain both an apostrophe and a double
  quote and JavaScript escapes one or the other depending on quoting style. **A
  source-text grep is not a sound way to assert a contract string. Do not re-add one.**

## Out of scope (do NOT do these)

- **The git-execution seam** — `core.hooksPath`, `--no-verify`, `--no-ext-diff`, and
  the repo-local-state residual class: **C2**, which starts only after C1 closes.
- **The layout dot rule and its diagnostic**: **C3**. C1 does not change what
  `readVaultLayout` accepts; it only bridges the one circularity that acceptance
  creates (Table A), and leaves a test that forces the bridge's removal once C3 lands.
- **The disclosure WP** — `doctor` detectors, the pre-flight config check, and the
  git-independent vault inventory.
- **`--ignored`**, **`git clean -x`**, and **aborting the run on any denial**.
- **`src/core/dream/brain.js`**: the unreachable Codex branch stays as it is.
- **`src/core/adopt-git.js`**: its ignore set is user data.
- **`src/core/frontmatter.js`**: its recognition fail-open is a finished package's
  named residual.
- **`state/quarantine/`'s retention, modes and banner** — reused, not redesigned.
- Every other finding in the 2026-07-29 audit.

## Definition of done

1. All verification steps pass locally, and the PR body carries the both-directions
   evidence the Verification steps require: every acceptance criterion shown RED
   against a deliberately broken implementation and GREEN against the finished one.
2. Conventional commits; PR titled
   `fix(dream): deny control-file writes over the committed set (WP-dream-control-file-fence)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully dispositioned —
   defined in `docs/runbooks/codex-review.md`, not restated here. `In-Review` marks
   the START of review: this list is complete only when review is.

---
id: WP-dream-fence-candidate-set
title: Deny the dream every control-file write, over a candidate set git cannot be blinded to
status: Superseded
model: opus
size: M
depends_on: [WP-dream-denied-object-disposal]
adrs: [ADR-0004, ADR-0025]
epic: audit-2026-07-29
---

# WP-dream-fence-candidate-set: the eye

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** spawns a headless AI brain
under a hermetic runtime profile (ADR-0025), lets it write into the user's Obsidian
**vault** — a git repository — and then runs a code-owned **validator**
(`src/core/dream/validate.js` `validateAndCommit`) that classifies the changes,
reverts what policy forbids, and commits the rest as one revertible commit with a
report. The brain's input is untrusted by construction, so a **steered dream**
(threat class T2) is the standing assumption; the profile denies it Bash, network and
MCP (`src/core/runtime-profile.js:58`, `:81`), leaving Write and Edit inside the vault.

**The fence has no notion of files that control machinery.** Its classification knows
three special cases — a containment escape, the learnings ledger, and Tier-3 (identity
and skills) — and everything else falls through to "keep and commit". A vault-root
`CLAUDE.md`, an `AGENTS.md` at any depth, or a `.gitignore` is none of them. The
2026-07-29 audit reproduced this on a live dream-profile run as **M7**
(`docs/security-audit/2026-07-29/CURRENT-IMPLEMENTATION-REVIEW.md:676`) and **M10**
(`:931`).

**This package is the EYE: everything that decides and accounts for what enters the
commit.** Its sibling, the HAND (`WP-dream-denied-object-disposal`), owns everything
that touches the disk and ships first — this spec commands a hand that is already
safe, and **must not be built before it**. `depends_on` says so.

**Four measured facts shape the design, and each contradicts an obvious approach.**

1. **A fence over one `git status` snapshot is not a fence.** The dream writes a
   `.gitignore` hiding `CLAUDE.md` plus the `CLAUDE.md`; the loop sees only the
   `.gitignore`; denying it **un-hides** the instruction file, and a later
   `git add -A` stages and commits it. Measured.
2. **That naive fence is worse than doing nothing, not at parity.** Measured on the
   untouched tree: with the hostile `.gitignore` in force at `git add -A`,
   `CLAUDE.md` does **not** enter the committed tree — it sits on disk, untracked and
   ignored, surviving `git clean -fd`. **Do not write "it would be committed today
   anyway" into this spec.** The reason the fence is worth building is the disk, which
   is what a harness reads.
3. **A fence whose candidate set comes from `git status` can be blinded from inside
   the tree, by the very file class it exists to deny.** Measured: an untracked root
   `.gitignore` containing `*` plus an untracked `CLAUDE.md` leaves
   `git status --porcelain -z -uall` **empty** — no candidate, no denial, no report
   line — and `git reset --hard HEAD` followed by `git clean -fd` leaves **both** files
   on disk. This is why the candidate set no longer comes from git.
4. **Per-path visibility probing is not enough.** A directory rename carrying both a
   `.gitignore` and a file it hid produced a status naming neither the hidden file nor
   any clue to it; the per-path rules were each individually correct and the outcome
   was still disclosure (`A new/private.txt` staged).

## Current state

All line numbers verified at `1d4c092`. `src/core/dream/validate.js` (1469 lines):

- `changedPaths(vaultDir)` (`:1020-1021`): `git status --porcelain -z -uall`. No
  `--ignored`, so an ignored path produces no entry (M10) — and, per fact 3, a
  self-hiding ignore file produces no entries at all.
- The classification loop (`:1145-1209`): (a) containment escape (`:1148`); the ledger
  (`:1154`); Tier-3 (`:1170`, `isTier3` at `:1087-1090` matching only the layout's
  identity- and skills-dir prefixes); (c) fall-through "keep" (`:1208`).
- `git add -A` runs **again** at `:1223` (before the EP2 secret gate) and `:1412`
  (before the commit). **Neither re-consults the classification.**
- The enforcement report is assembled at `:1384-1391` — **before** the last
  `git add -A` at `:1412` — and `committed`/counts (`:1413-1430`) and the skill
  registry (`:1443-1448`) all read a pre-fence staged set. The header is written only
  when the file is absent (`:1380-1383`); the section is **appended** (`:1388`).
- `paths.config` is `~/.wienerdog/config.yaml` (`src/core/paths.js:67`), a sibling of
  the state dir and **outside the vault** (`:63`), so the dream cannot rewrite it.
- `src/adapters/codex.js:50` and `src/adapters/claude.js:39` are where this repository
  itself installs managed instruction blocks — into `AGENTS.md` and `CLAUDE.md`.

**From the HAND, already shipped when this package starts:** the no-follow
classification primitive, action-time revalidation, no-clobber restoration, the
relocation transaction into `state/residue/`, the pairing index, and the pre-spawn
assert with its code-owned instruction-name list. This package adds no disposal
mechanics; it decides *what* the hand is pointed at.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | the inventory (Table A), the denial rules and accounting (Table B), and the report bridge (Table C) |
| modify | tests/unit/dream-validate.test.js | cover the acceptance criteria (the implementer designs the cases) |

### Exact contracts

The denial reason bases are code-owned literals — the single place their bytes are
decided. They combine with the HAND's outcome suffixes. Both are NEW; no existing
reason string changes.

```text
base-dotseg:  control-file fence: a path segment starting with "." is outside the dream's writable surface
base-instr:   control-file fence: an AI-instruction filename is outside the dream's writable surface at any depth
```

Worked example — a run writes `.gitignore` (containing `*`), `CLAUDE.md`, and a
legitimate `07-Daily/2026-08-20.md`. The inventory finds the first two even though
`git status` is empty; the daily note is committed and the vault is left clean:

```markdown
## Reverted by orchestrator (policy enforcement)
- `.gitignore` — control-file fence: a path segment starting with "." is outside the dream's writable surface; moved out of the vault into the run's residue area.
- `CLAUDE.md` — control-file fence: an AI-instruction filename is outside the dream's writable surface at any depth; moved out of the vault into the run's residue area.
```

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** the denial-reason taxonomy gains entries;
**(iv)** reason-code and fallback behaviour change; **(v)** the fence's accounting
decides what a downstream commit, report and registry record; **(vi)** the dream
report, the CLI summary and the C2/C3 successors inherit the contract.

### Contract table(s)

One canonical table per dense contract, each named below. Operative prose
cites the table rather than restating it.

#### Table A — the candidate set: a git-independent inventory

| Fact / rule | Value |
|-------------|-------|
| **Why it exists** | measured (Context, fact 3): a self-hiding `.gitignore` empties `git status` completely, so a git-sourced candidate set can be blanked from inside the tree by the exact class this package denies. **Git is no longer the candidate source.** It stays useful for what it is good at — reporting what CHANGED among visible paths — but it no longer decides what the fence is allowed to see |
| **What it is** | a bounded, **no-follow** walk of the vault that reports paths by name, independent of every ignore mechanism |
| **PINNED NARROW — this is the whole list** | exactly the **code-owned denial names**: a basename of `.gitignore` at any depth, plus the four instruction basenames (`AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `CLAUDE.local.md`, case-insensitive — the same list the HAND's pre-spawn assert owns; the two must not diverge). **NOT all ignored user data**, and not the dot-prefixed class at large |
| **Why narrow is sufficient — the load-bearing argument** | the inventory only has to find the *hiding mechanism* and the *instruction files*. Everything else rule 1 denies (`.claude/`, `.obsidian/`, `.mcp.json`, …) becomes visible to git the moment the hiding `.gitignore` is denied and the set recomputed (Table B's ordering). A narrow inventory plus recomputation covers the broad rule **without the fence ever enumerating the user's ignored data** — which is what the 2026-08-05 ruling forbade by refusing `git clean -x` |
| **What it deliberately does NOT close** | a region the **user** ignored independently, containing no code-owned denial name. That is M10's remaining half and belongs to the disclosure WP's full inventory |
| Bounds | skips `.git/`; does not descend into a nested repository (`lstat` of `<dir>/.git` marks one); follows no symlink; bounded in depth and entries, and **fails the run closed** on exceeding a bound rather than truncating silently |
| Union with git | the fence's candidates are the inventory's findings **union** what `git status --porcelain -z -uall` reports. Git contributes changed visible paths; the inventory contributes what git cannot see. Neither alone is the contract |

#### Table B — the fence and its accounting

| Fact / rule | Value |
|-------------|-------|
| Rule 1 | any `rel` with at least one `/`-separated segment whose first character is `.` |
| Rule 2 | any `rel` whose `path.basename(rel)` is in the instruction-name set, **case-insensitively** (a case-insensitive filesystem makes `claude.md` the same file — the reason `isTier3` lowercases its identity prefix, `:1087`) |
| Why those four names | `AGENTS.md` and `CLAUDE.md` are the names **this repository itself installs managed instruction blocks into** (`src/adapters/codex.js:50`, `src/adapters/claude.js:39`) — in-repo evidence, not a claim about a tool this project cannot test. The other two are near-variants: a false denial costs nothing the dream needs, a miss is a persistence hole. **Named residual:** an instruction file belonging to a tool this list does not name passes rule 2; no structural marker like the dot prefix exists for that class |
| Precedence | rule 1 first; a path matching both records rule 1's base |
| Where the first pass runs | the classification loop (`:1145`), after containment (`:1148`) and before the ledger (`:1154`), so ledger, Tier-3 and the `:1208` keep are unreachable for a denied path whatever the layout maps |
| Disposal | **the HAND's**, unchanged: Table A of `WP-dream-denied-object-disposal` classifies, Table B disposes. This package chooses the target; it never touches the disk itself |
| **Ordering within a pass** | denials of paths that can change ignore visibility — a `.gitignore` at any depth — are applied **first**, and the candidate set is recomputed only after them |
| **VISIBILITY INVARIANT (binding), keyed to the PRE-BRAIN state** | **content the user had hidden before the brain ran never becomes staged because of what the fence does.** The reference point is the ignore state in force **before the brain started**, not the state at each intervention — a per-candidate probe was measured insufficient (Context, fact 4). Keying to the pre-brain state also settles the converse correctly: a file the DREAM hid during the run was not hidden pre-brain, so the fence may act on it. `git check-ignore` answers the question for a KNOWN path (exit 0 = ignored, exit 1 = not — measured); enumerating which paths to ask about is Table A's job. The mechanism is the implementer's; the contract is this row |
| **The final evaluation is at the commit boundary** | measured: `git rm --cached <p>` followed by a later `git add -A` re-stages `<p>`, and the pipeline runs `git add -A` at `:1223` and `:1412`. A fence that runs only inside the classification loop is defeated by the pipeline's own re-staging |
| **The stabilization protocol** | (1) stage; (2) fence the staged set; (3) rebuild the enforcement report from the final denial set; (4) re-stage the report; (5) re-read and re-fence; (6) only once stable, derive `committed`, the counts and the skill-registry candidates from **that** set; (7) commit from it. Without this a boundary denial misses the report, dirties the tree, or registers a skill the commit lacks |
| **Termination** | iterate until the staged set stops changing. Bounded: relocation and restoration are monotonic — each removes a path from the vault or returns it to its HEAD state, neither of which is a change. The implementer caps iterations and **fails closed** on the cap |
| **The postcondition** | at the moment of the commit, no path in the staged set violates rule 1 or rule 2, **except** the one leaf Table C exempts — and, by the HAND's contract, no denied object remains in the vault |
| Report and CLI | existing plumbing (`:1384-1391`, `dream.js:617`); no new surface |
| Transcript deferral | unchanged: keys on `secretReverts`, never `reverted[]` |
| Covered for free by rule 1 | `.git/`, `.gitignore`, `.gitattributes`, `.claude/`, `.codex/`, `.mcp.json`, `.obsidian/`, `.smart-env/`, `.cursorrules`, and every future dot-prefixed convention |
| **The bound of the whole mechanism** | it closes **tree-based** hiding only. Measured: `.git/info/exclude` and `core.excludesFile` hide from `git status --porcelain -uall` exactly as `.gitignore` does, and **neither is stageable**. Named residual; C2 owns the class, the disclosure WP owns detection. **Neither may ever be cited as closing M9 or M10** |

#### Table C — the report bridge (sunsets with C3)

| Fact / rule | Value |
|-------------|-------|
| Why it exists | `reports_dir: .reports` is a valid layout value today (measured), so rule 1 would deny the dream report **itself** — the file the denials are written into. Circular, so one exemption exists |
| Scope | EXACTLY the report path the validator writes this run (`:1378`), and only when the layout maps it under a dot-prefixed segment. Pinned before the brain starts from `paths.config` (`src/core/paths.js:67`), which is outside the vault (`:63`). One leaf, never a prefix |
| **Identity is COMPOUND, not leaf inode equality** | measured, both halves: on a case-insensitive filesystem a configured `.Reports/2026-08-20.md` is reported by git as `.reports/2026-08-20.md` — same file, unequal strings, so string equality fails; and a hard link `.evil.md` shares the leaf's `(dev, ino)` exactly (`nlink=2`), so leaf-inode equality **exempts every hard-link alias**. The rule: verify the configured report directory and every ancestor **no-follow**; match the candidate to that verified parent; resolve only the leaf's spelling under it; apply the exemption to that single candidate and never to another path sharing the inode |
| **Write is an ATOMIC REPLACEMENT** | measured: `fs.writeFileSync` through a symlink at the report path **overwrote the link target** — a vault `CLAUDE.md` became the report body while the report path stayed a symlink. And the report is **appended** today (`:1388`), with the header written only when the file is absent (`:1380-1383`), so pre-planted bytes would survive beneath the code-owned section. The recipe: open a temporary file with `O_EXCL\|O_NOFOLLOW` in the no-follow-verified report directory, verify its identity after opening, **revalidate the parent at the rename boundary**, and rename over the leaf. A leaf with `nlink > 1` is replaced by a fresh leaf, never written through |
| Scope of the hardening | the exempted case only. For a dot-free `reports_dir` — every default install — the existing behaviour is byte-unchanged |
| **Named residual — the path-based swap window** | the no-follow classification and the later pathname-based rename are two operations; a same-user ancestor or leaf swap between them cannot be excluded by any portable Node API. `src/core/private-fs.js` already documents this class. Bounded by revalidation at the rename boundary, and **not** claimed to be atomic |
| **Sunset clause** | C3 removes dot-prefixed layout values, deleting this case. This package leaves a test that **fails once the case is gone**, so the bridge cannot outlive its reason |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row cites the table that decides it)
- [ ] Acceptance criteria that assert each table's facts
- [ ] The reason bases under "Exact contracts" and the worked example
- [ ] Implementation notes and the Out-of-scope list
- [ ] Security checklist (the residual set)
- [ ] **The instruction-name list** — shared with `WP-dream-denied-object-disposal`'s
      Table C; if it changes, both specs change
- [ ] **Table B's bound and the C2 successor's class** — the two exclude channels
      appear in both and move together
- [ ] **Table C** — its identity rule, its atomic write, its sunset test, and the
      Out-of-scope note that C3 deletes it

## Implementation notes & constraints

- Zero new dependencies; plain Node >= 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing this package adds outlives its job.
- **This package changes the SET, not the VERB.** Disposal is the HAND's and is
  already in place; do not reimplement, wrap, or alter it.
- **The protected consumer of rule 2 is outside this repository** — the user's own
  vault and any coding-agent session started in it. There is no `file:line` caller
  chain to cite for it, and none is expected in review.
- **Do not argue that a denied file "would be committed today anyway"** — Context,
  fact 2 measured the opposite.
- **`--ignored` on the status call stays declined**, and Table A is why it is not
  needed: `--ignored` would put `.obsidian/plugins/*/bin/`, `.smart-env/` and
  `.trash/` in front of rule 1 — the user data the ruling protects by refusing
  `git clean -x` — whereas the inventory is pinned to code-owned denial names and
  never enumerates the user's ignored content at all.
- When uncertain: choose the simpler option and note it in the PR under "Decisions
  made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item **applies**. The untrusted identifiers
      are vault paths from the inventory walk and from `git status --porcelain -z`.
      They reach the filesystem only through the HAND's no-follow primitive; this
      package adds no disposal action of its own. New spawn shapes are
      `git check-ignore` and `git rm --cached`, on paths that already passed
      `resolveContainment` (`:1147`); a separate argv element prevents SHELL
      interpretation but **not** git's own pathspec parsing (measured), so any
      pathspec this package passes carries the `literal` magic word.
- [ ] The surface is **an untrusted-by-construction agent's writes into a git
      repository**. Containment after this package: the candidate set cannot be
      blinded from inside the tree (Table A), no denial widens visibility (Table B),
      no denied path is in the staged set at commit time, and the single bridge
      exemption is a compound-identity match written by atomic replacement.
- [ ] **Named residual — non-tree hiding channels.** `.git/info/exclude` and
      `core.excludesFile` hide from every status-based fence and are not stageable
      (measured). C2 owns the class; the disclosure WP owns detection.
- [ ] **Named residual — pre-existing user ignore entries (M10's remaining half).** A
      region the user ignored independently, containing no code-owned denial name, is
      not enumerated. The disclosure WP's full inventory is its closure.
- [ ] **Named residual — nested repositories.** Invisible to the outer `git status` or
      collapsed to one directory record, and skipped by the inventory's own bound. The
      dream cannot CREATE one (no Bash, so no `git init` — `runtime-profile.js:58`,
      `:81`).
- [ ] **Named residual — unknown instruction filenames** (Table B).
- [ ] **Named residual — the path-based swap window at the bridge rename** (Table C).
- [ ] **Inherited residuals from the HAND**, unchanged and not re-opened: the
      disposal residual window, the EP2 preserve→destroy race, the absence of
      disk-fill immunity, the EXDEV corner, and the CLI's two `restoreVaultToHead`
      call sites.
- [ ] **Named residual — a pre-fence hostile instruction file.** A vault may already
      carry a `CLAUDE.md` that an earlier, unfenced dream committed, sitting
      tracked-and-clean and indistinguishable from the user's own. **This package
      denies future writes; it does not retroactively un-commit history.** Watched by
      the disclosure WP's detector list.
- [ ] **Scheduled successor — the residue lifecycle** (journal schema, crash replay,
      return-to-original-path, the list/recover surface, preservation-aware CLI abort
      paths). Queues behind group C beside the disclosure WP.

## Acceptance criteria

Every criterion is behavioural and binary. The PR must show each **failing against a
deliberately broken implementation** as well as passing against the finished one.

- [ ] A dream-produced change at a path with any dot-prefixed segment is denied and
      recorded with `base-dotseg` — at the vault root, at depth, tracked and
      untracked, whatever the layout maps.
- [ ] A dream-produced change whose basename is any member of Table B's set, in any
      letter case, at any depth, is denied and recorded with `base-instr`.
- [ ] A path matching both rules records rule 1's base.
- [ ] **A self-hiding ignore file does not blind the fence**: with an untracked
      `.gitignore` containing `*` and an untracked `CLAUDE.md` — a state in which
      `git status --porcelain -z -uall` is EMPTY (measured) — both are found, both are
      denied and named in the report, and neither remains in the vault.
- [ ] **The two-file attack fails**: a run writing a `.gitignore` that hides an
      instruction file *and* that instruction file commits neither and names both.
- [ ] **The inventory stays narrow**: a user-ignored region containing no code-owned
      denial name is not enumerated, not reported and not touched.
- [ ] **The inventory respects its bounds**: it does not follow a symlink, does not
      descend into a nested repository, and fails the run closed rather than
      truncating when a bound is exceeded.
- [ ] **No path violating rule 1 or rule 2 is in the staged set at commit time**,
      including one staged by a `git add -A` that ran after the classification loop.
- [ ] **The visibility invariant holds**: with a directory rename carrying both a
      `.gitignore` and a file it hid, the previously hidden file is not staged — not
      in this run, and not by the next run's precommit.
- [ ] **A user's previously-ignored file is untouched** when the dream drops its
      ignore rule.
- [ ] **The commit boundary stabilizes**: for a path first denied at the boundary, the
      report contains its line, the commit contains exactly the stabilized set,
      `committed` and the counts match it, the skill registry gains no entry for a
      path the commit lacks, and the worktree is clean afterwards.
- [ ] **The bridge is exactly one leaf, matched by compound identity, written
      atomically**: with `reports_dir` mapped under a dot segment, the validator's own
      report for THIS run is committed while every other dot-prefixed path is denied; a
      configured spelling differing only in case from git's reported spelling still
      matches; a **separate hard-link alias sharing the leaf's inode is still denied**;
      a symlink or hard link pre-planted at the report path does not cause any other
      file to be written; bytes pre-planted at the exempted path do not survive into
      the commit; and a test fails once dot-prefixed layout values are gone.
- [ ] Denial precedes the ledger and Tier-3 cases.
- [ ] No existing denial reason string changes, and every change accepted today at a
      dot-free, non-instruction path is still accepted and committed.
- [ ] **The HAND's contracts are untouched**: disposal, the residue area, the pairing
      index and the pre-spawn assert behave exactly as that package shipped them.
- [ ] Idempotence (the template's criterion; this package changes a command that
      writes outside the repo): a second run reproducing the same denied write produces
      a **byte-identical enforcement line**. The report's per-run append is
      pre-existing behaviour and outside this criterion.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream"
npm test
npm run lint
```

**These commands are green on a spec-only branch, before any of this package exists —
measured. They prove nothing alone, and the real gate is below.**

- **Every acceptance criterion is a behavioural test the implementer writes, and the
  PR must demonstrate each one RED against a deliberately broken implementation and
  GREEN against the finished one.** Green-on-green is not evidence. Break the thing
  the criterion names — skip the inventory, drop the recompute ordering, match the
  bridge by string equality — and paste the red.
- **There is deliberately NO source-level assertion.** Two candidates were measured
  defective on the predecessor: one vacuous on the untouched tree, one shape-dependent
  (0/2 and 1/2 against two equally correct implementations, because a contract string
  containing both an apostrophe and a double quote is escaped differently depending on
  the implementer's quoting style). **Do not re-add one.**

## Out of scope (do NOT do these)

- **All disposal mechanics** — the classification primitive, no-clobber restoration,
  relocation, the residue area, the pairing index, fault injection and the pre-spawn
  assert: `WP-dream-denied-object-disposal`, already shipped when this starts.
- **The git-execution seam** (`core.hooksPath`, `--no-verify`, `--no-ext-diff`, the
  repo-local-state class) — C2.
- **The layout dot rule and its diagnostic** — C3. This package does not change what
  `readVaultLayout` accepts; it bridges the one circularity that acceptance creates
  (Table C) and leaves a test forcing the bridge's removal once C3 lands.
- **The disclosure WP** — `doctor` detectors, the pre-flight config check, and the
  full git-independent vault inventory that closes M10's remaining half.
- **`--ignored`**, **`git clean -x`**, and aborting the run on any denial.
- **`src/core/dream/brain.js`**: the unreachable Codex branch stays as it is.
- Every other finding in the 2026-07-29 audit.

## Definition of done

1. All verification steps pass locally, and the PR body carries the both-directions
   evidence: every acceptance criterion shown RED against a deliberately broken
   implementation and GREEN against the finished one.
2. Conventional commits; PR titled
   `fix(dream): fence the dream over an unblindable candidate set (WP-dream-fence-candidate-set)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run and are clean or fully dispositioned
   (`docs/runbooks/codex-review.md`).
6. **Merge discipline: this PR and the HAND's are stacked and merged TOGETHER**, only
   after both are green on both gates. No night may run on half a fence.

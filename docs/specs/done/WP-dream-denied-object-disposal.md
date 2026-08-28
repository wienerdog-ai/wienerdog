---
id: WP-dream-denied-object-disposal
title: Move a denied object out of the vault instead of destroying it
status: Superseded
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0025]
epic: audit-2026-07-29
---

# WP-dream-denied-object-disposal: the hand

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** spawns a headless AI brain
under a hermetic runtime profile (ADR-0025), lets it write into the user's Obsidian
**vault** — a git repository — and then runs a code-owned **validator**
(`src/core/dream/validate.js` `validateAndCommit`) that classifies the changes,
reverts what policy forbids, and commits the rest as one revertible commit with a
report. The brain's input is untrusted by construction, so a **steered dream**
(threat class T2) is the standing assumption.

**This package is the HAND: everything that touches the disk.** Its sibling, the EYE
(`WP-dream-fence-candidate-set`), owns everything that decides and accounts for what
enters the commit. They were split out of a single package after three adversarial
rounds measured it at thirteen mechanisms — too large for one session, and large in a
way that let fault paths hide. The HAND is **built and reviewed FIRST**, because it is
a strict improvement on the candidate set the validator **already has today**: it
replaces destruction with relocation, and adds no new denial surface. **It is not
DEPLOYED first.** The two PRs are stacked and merged together (Definition of done,
item 6), and that is the only deployment truth — measured why it has to be: during a
HAND-only interval the current validator commits a dream-written `CLAUDE.md`, leaving
it tracked-and-clean, which is exactly the state Table C's assert is designed to
trust.

**What this package does NOT do, stated plainly so nobody cites it wrongly.** It adds
no denial rules — not the dot-prefixed-segment rule, not the instruction-filename
rule. It therefore **closes no audit finding on its own.** M7 and M10 are closed by
the EYE, which cannot be built safely until the hand it commands is safe. Anyone
reaching for this spec as evidence that a finding is closed has the wrong document.

**The problem it solves is measured, not theoretical.** Everywhere the validator
today reverts an unwanted change, it destroys the working-tree bytes —
`fs.rmSync` for an untracked path, `git checkout HEAD -- rel` for a tracked one — and
three separate reproductions showed that destroying is the wrong verb:

1. A user who saves a file **while the brain runs** is indistinguishable from brain
   output. Their save is reverted and gone.
2. `git checkout HEAD -- <path>` over a pathname now occupied by a **non-empty
   directory** exits 0, silently deletes the directory and its contents, and leaves a
   clean `git status` — the loss is invisible to git afterwards.
3. Preservation by copy reads **through** a symlink: a link to `/etc/hosts` was
   "preserved" as 213 bytes of `/etc/hosts`, and a directory failed `EISDIR`
   outright.

The answer is a fourth state. A denied object that cannot be restored from its last
commit is **moved out of the vault**, not destroyed and not left behind.

## Current state

All line numbers verified at `1d4c092`. `src/core/dream/validate.js` (1469 lines):

- `revertPath(vaultDir, rel, untracked)` (`:660-667`): `fs.rmSync` when untracked,
  else `git checkout HEAD -- rel`. **Both destroy working-tree bytes.** It is called
  from the containment case (`:1150`), the ledger case (`:1162`), and the Tier-3
  cases (`:1176`, `:1189`, `:1196`).
- `quarantinePreserve(stateDir, vaultDir, rel, date, kind)` (`:703-738`) copies bytes
  with `fs.readFileSync` into `<stateDir>/quarantine/` — dir 0700, file 0600, atomic
  tmp+rename, name `<date>-<sanitized-basename>` with a numeric collision suffix
  (`:721-730`) — and returns `{name, bytes}` or `null`. The EP2 secret gate uses it,
  and at `:1296-1312` **refuses to destroy** a file when no durable copy was saved,
  naming the mid-run-save case explicitly. That is the precedent this package
  generalises.
- Denials record `{path, reason}` on `reverted[]` (`:1100-1101`), rendered into the
  committed report (`:1384-1391`) and counted at `src/cli/dream.js:617`.
- `src/core/private-fs.js:106-113` lists the A5-scoped private state directories that
  `sync`/`doctor` repair — `state/quarantine` and `state/quarantine/redacted` among
  them. A new state area must join that list or its modes go unrepaired.
- `src/cli/dream.js`: `precommitSessionEdits` (`:493`) → brain (`:510`) →
  `validateAndCommit` (`:558`). The brain's live path gets a **neutral staging cwd**,
  not the vault (`src/core/dream/brain.js:196-198`, D-DREAM-CWD/WP-130); the vault cwd
  at `:189` belongs to the **dead** Codex branch, reachable from no producer.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | the classification primitive (Table A) and the disposal contract (Table B) at every site that today destroys working-tree bytes |
| modify | src/cli/dream.js | the pre-spawn assert (Table C) |
| modify | src/core/private-fs.js | register `state/residue/` as an A5-scoped private directory |
| modify | src/core/manifest.js | the minimal uninstall guard of Table B — refuse while residue is non-empty. **Nothing else in uninstall is touched** |
| modify | tests/unit/manifest.test.js | cover the uninstall guard |
| modify | tests/unit/dream-validate.test.js | cover the acceptance criteria (the implementer designs the cases) |
| modify | tests/unit/private-fs.test.js | as above, for the new state area |

### Exact contracts

Two NEW outcome suffixes join the validator's reason vocabulary. No existing reason
string changes. **No suffix names a filename** — the residue area appends a collision
suffix, so embedding one would make a repeated disposal produce a different
enforcement line. The path ↔ object pairing lives in the residue index (Table B).

```text
suffix-moved:   ; moved out of the vault into the run's residue area.
suffix-blocked: ; NOT removed — it could not be moved out of the vault, so the vault was restored to its last commit and nothing was committed this run.
```

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** the outcome taxonomy gains entries; **(iv)**
revert and failure behaviour change; **(v)** the package emits durable state under
`state/` whose lifecycle `sync`/`doctor` own; **(vi)** the EYE inherits all of it.

**The guiding sentence: git tells you WHERE to look; only the disk can tell you WHAT
is there.** Both measured failures above are shape confusions that only an `lstat`
before acting can prevent.

### Contract table(s)

One canonical table per dense contract, each named below. Operative prose
cites the table rather than restating it.

#### Table A — the shared classification primitive

| Fact / rule | Value |
|-------------|-------|
| **The rule** | **every** path the validator is about to act on is classified FIRST, in this pass, with a **no-follow `lstat`**. One primitive; every action routes through it |
| Tracked modification of a regular file | preserve, then `git checkout HEAD -- <rel>` |
| Untracked regular file | relocate (Table B) |
| **Deleted path** | restore from HEAD by **atomically claiming the pathname**, never by running a destructive git verb at it. Measured: `fs.linkSync` refuses `EEXIST` against an occupied regular file, a **non-empty directory** and a symlink alike, leaving the occupant's bytes intact in all three — so the HEAD bytes are materialised beside the target (the validator already reads them, `git show HEAD:<rel>` at `:340`, `:398`, `:555`) and the destination is claimed by an exclusive link, with `symlinkSync` playing the same role when HEAD holds a symlink. If the claim is refused, the occupant's fate is decided by this same primitive and the restore is retried after. **This is a real guarantee, not a narrowed window** |
| Symlink, directory, hard link, FIFO, socket, device node, anything else | relocate. No preservation attempt reads through them |
| **Why the claim replaced the check** | measured on the predecessor: `lstat` returned `ENOENT`, a non-empty directory was then created at the pathname, and `git checkout HEAD -- <path>` exited 0 and **silently deleted it**. An emptiness check followed by a destructive verb is not safe at any window size, which is why the restore now claims the path atomically instead of checking it |
| **The honest residual that remains** | the exclusive claim covers the DESTINATION. It does not make the whole disposal one transaction: the temporary file's own placement, and any shape for which no exclusive-create primitive exists, keep a same-user window that no portable Node API closes. NAMED RESIDUAL on the EP2 precedent; **no whole-operation atomicity is claimed** |
| Restore failure | fail closed for that path; record it. Measured: an unwritable parent makes `checkout` exit 255 |

#### Table B — disposal: relocation as the fourth state

| Fact / rule | Value |
|-------------|-------|
| **The house rule** | reverting can destroy user data, because a mid-run save is indistinguishable from brain output. **Every destruction is therefore paired with a preservation, or it does not happen** |
| Regular files | today's copy-based `quarantinePreserve` (`:703-738`), used **byte-unchanged**. Its 0600/0700 modes, naming, collision suffix, the pending-review banner and `private-fs`'s diagnostics are untouched |
| **Everything else → relocation** | the object is **moved out of the vault** into `<stateDir>/residue/` with `fs.renameSync`, which moves a regular file, a **symlink as a symlink** with its target text intact, and a **directory whole** — all measured. Copying cannot do this: `readFileSync` reads through a symlink and fails `EISDIR` on a directory |
| Destination | `<stateDir>/residue/` — a NEW area with its own minimal contract, deliberately **not** the secret quarantine, whose consumers (`listSecretQuarantine`'s `isFile()` enumeration, the banner, `private-fs`'s diagnostics) were measured incompatible with directories and symlinks |
| **Never replaces** | measured: `fs.renameSync` silently overwrites an existing destination file. The destination is allocated exclusively; a collision picks a new name |
| Modes | the area is registered as an A5-scoped private directory in `private-fs.js` (beside `state/quarantine`, `:106-113`), so `sync`/`doctor` repair it like every other state area. Contents keep their source modes — they are evidence, and nothing enumerates them by type |
| Pairing record | a residue index maps each entry to its original vault-relative path. If the index cannot be written, **the relocation still happens** and the pairing degrades to the encoding in the entry's own filename |
| **NO disk-fill immunity is claimed** | `rename(2)` returns `ENOSPC` when the destination directory must be extended, and the residue directory, its entries, the index and the report all need metadata space. The contract is **traceability, not immunity**: the failure path leaves a durable trace, and the acceptance criteria carry fault-injection cases where relocation, the index and the report each fail independently |
| **Named residual — the EXDEV corner** | across filesystems `renameSync` raises `EXDEV`; `<stateDir>` and the vault can sit on different mounts. The fallback is a copy, defined separately for a regular file, a symlink (recreate the link, never read through it) and a directory (recursive, with partial-copy cleanup on failure) |
| **Recoverable, not fire-and-forget** | relocation is journaled before the move and marked complete only after the run's commit succeeds. If a later stage fails, the object is returned to its original path when that path is still free; otherwise it stays in residue and a durable alert says so. **A user's file is never left outside the vault with no record** |
| On total failure | if an object can be neither preserved, restored nor moved, the run fails closed: `restoreVaultToHead`, commit nothing, record with `suffix-blocked` |
| **Uninstall must not delete what it does not own** | `disposeCoreMechanics` removes `paths.state` recursively (`src/core/manifest.js:1137`, `:1148`), and its own doc states the invariant it relies on: state, logs, schedules and secrets hold "only Wienerdog-authored runtime artifacts … **none user-authored**" (`:1113-1116`). **Relocation breaks that invariant** — residue is user data on machine-owned ground. The MINIMAL guard: a destructive uninstall **loudly refuses** while `state/residue/` is non-empty, naming the entries and the ways to resolve them, and proceeds only on explicit user confirmation. Returning entries to their original paths and any recovery surface are **NOT this package's** — they belong to the residue-lifecycle successor, so today's data-lie ends without the package becoming an uninstall refactor |
| **The total-failure path is preservation-aware** | `restoreVaultToHead` (`validate.js:146-149`) is a SECOND destructive primitive — `git reset --hard HEAD` then `git clean -fd` — so naming it as the fail-closed action would reintroduce exactly the bulk destruction this package removes. This package's own total-failure path therefore attempts relocation best-effort **before** any reset |
| **Named residual — the CLI's two existing call sites** | `src/cli/dream.js:535` (brain failure) and `:550` (scratch-integrity failure) call `restoreVaultToHead` outside the validator's classification loop. That is **today's behaviour, unchanged by this package**; making those paths preservation-aware is routed to the residue-lifecycle successor, not folded in here |
| Inherited unchanged | the EP2 preserve→destroy race window and its pinning test (`tests/unit/dream-validate.test.js:2322-2368`); the secret quarantine's retention, modes and banner |

#### Table C — the pre-spawn assert (second line)

| Fact / rule | Value |
|-------------|-------|
| **What it is** | a small invariant assert in `src/cli/dream.js` before the brain is spawned: if a **suspect** instruction-shaped object is sitting in the vault at one of the code-owned names (`AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `CLAUDE.local.md`, case-insensitive), **that evening's brain is loudly skipped**; everything else in the run proceeds |
| **SUSPECT is a narrow, three-way test — the assert never fires on anything else** | the object must be **untracked**, **or modified relative to HEAD**, **or named in the residue index**. A **tracked-and-clean** instruction file is the user's own committed decision and can NEVER knock out the brain. Two reasons, and both matter: once the EYE has landed, a denied instruction file cannot reach a tracked-and-clean state at all — the fence will not let it into a commit — so anything tracked-and-clean is the user's by construction; and without the narrowing, one legitimate `CLAUDE.md` in a vault would kill dreaming **every night**, which would make this assert a product decision and would make the "not load-bearing" row below simply false |
| **Not load-bearing, and the spec says so** | reaching it requires disposal to have already failed. If an attacker manages that, not starting the brain is the correct answer, so the "cheap off-switch" objection does not apply as it would to a general halt |
| **The consumer it protects, stated correctly** | the live Claude brain does **not** run in the vault — `brain.js:196-198` gives it a neutral staging cwd; the vault cwd at `:189` is the **dead** Codex branch. The real consumers are the user's **own** harness sessions in the vault and any future Codex wiring |
| **Its input is a disk check, not a fence rule** | this package adds no denial rules. The assert reads the disk for a fixed name list; the EYE later reuses that list as part of its inventory, and the two must not diverge |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row cites the table that decides it)
- [ ] Acceptance criteria that assert each table's facts
- [ ] The suffix literals under "Exact contracts" — and their deliberate absence of a
      filename, which Table B's pairing row depends on
- [ ] Implementation notes and the Out-of-scope list
- [ ] Security checklist (the residual set)
- [ ] **The instruction-name list** — Table C owns it here; the EYE's inventory reads
      the same list, so the two specs move together
- [ ] **`state/residue/`** — Table B's contract and the `private-fs.js` deliverable row

## Implementation notes & constraints

- Zero new dependencies; plain Node >= 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing this package adds outlives its job.
- **This package changes the VERB, not the SET.** The set of paths the validator acts
  on is exactly today's; only what happens to them changes. That is what makes it
  shippable ahead of the EYE, and what makes every intermediate state safer than the
  one before it.
- `git clean -fd` and its missing `-x` are not touched.
- When uncertain: choose the simpler option and note it in the PR under "Decisions
  made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item **applies**. The untrusted identifiers
      are vault paths from `git status --porcelain -z` output; they reach the
      filesystem through the existing `resolveContainment` check (`:1147`), evaluated
      before this package's code, and then through Table A's primitive, which
      classifies every one with a **no-follow `lstat` before acting**. No new pathspec
      or shell construction is introduced.
- [ ] The surface is **an untrusted-by-construction agent's writes into the user's
      vault**. Containment after this package: nothing is destroyed without a durable
      copy; a non-regular object is moved out rather than read through; a restore
      never lands on an occupied pathname; and a failed disposal fails the run closed.
- [ ] **Named residual — the classify→act window** (Table A): narrowed by action-time
      revalidation, not closed, **no atomicity claimed**; same shelf as EP2's.
- [ ] **Named residual — the EP2 preserve→destroy race**, inherited unchanged;
      `tests/unit/dream-validate.test.js:2322-2368` pins it.
- [ ] **Named residual — no disk-fill immunity** (Table B): the contract is a durable
      trace plus fault-injection coverage.
- [ ] **Named residual — the EXDEV corner** (Table B): on a split mount the fallback
      is a copy, and the disk-fill lever returns there.
- [ ] **Named residual — a pre-fence hostile instruction file.** A vault may already
      carry a `CLAUDE.md` that an earlier, unfenced dream committed; it sits
      **tracked-and-clean** and is indistinguishable from the user's own. Table C's
      assert deliberately does not fire on it, and the EYE does not retroactively
      un-commit it. Watched by the disclosure WP's detector list.
- [ ] **Named residual — the CLI's two `restoreVaultToHead` call sites**
      (`src/cli/dream.js:535`, `:550`): today's behaviour, routed to the
      residue-lifecycle successor.
- [ ] **Scheduled successor — the residue lifecycle.** One WP owns the journal schema,
      crash replay, returning entries to their original paths, the user-facing
      list/recover surface, and making the CLI abort paths preservation-aware. It
      queues behind group C alongside the disclosure WP; the final order is decided
      when group C closes. **This package does not grow further — every new lifecycle
      requirement routes there.**
- [ ] **Scheduled successor, not a residual:** this package closes no audit finding.
      M7 and M10-as-far-as-a-fence-reaches are the EYE's
      (`WP-dream-fence-candidate-set`), which depends on this one.

## Acceptance criteria

Every criterion is behavioural and binary. The PR must show each **failing against a
deliberately broken implementation** as well as passing against the finished one.

- [ ] **A concurrent user save is not destroyed**: a file saved while the brain runs
      is either preserved before the revert or moved to residue — never lost with no
      copy.
- [ ] **A restore claims its pathname atomically**: when the deleted tracked path is
      occupied by a non-empty directory, a file, or a symlink — present before
      classification, or created at any point up to the claim itself — the occupant's
      bytes survive and the restore is refused rather than destructive. **Except the
      named residual**: the temporary file's own placement, and any shape with no
      exclusive-create primitive, keep a same-user window this package does not close
      and does not claim to.
- [ ] **No action reads or writes through a link**: a symlink is moved AS a symlink
      with its target text intact, and its target is not read, written or removed.
- [ ] **A directory is moved whole**, with its contents intact.
- [ ] **Relocation never replaces**: a destination collision allocates a new name and
      the object already there keeps its bytes.
- [ ] **`state/residue/` carries the private modes** `sync`/`doctor` apply to every
      other state area, repaired idempotently.
- [ ] **Relocation is recoverable**: when a later stage of the run fails, the object
      returns to its original path if that path is free, or stays in residue with a
      durable alert — never outside the vault with no record.
- [ ] **Fault injection**: with relocation, the pairing index and the report write each
      failing independently, the run leaves a durable trace and never reports success.
- [ ] **Total failure fails closed WITHOUT bulk destruction**: relocation is attempted
      best-effort first, nothing is committed, and the reason is recorded with
      `suffix-blocked`. The blocked object's bytes, and any unrelated concurrent save,
      both survive — asserted directly, not inferred from "the vault was restored".
- [ ] **Uninstall refuses while residue is non-empty**: a destructive
      `wienerdog uninstall` names the residue entries and the ways to resolve them and
      does not proceed without explicit confirmation; with residue empty, uninstall
      behaves exactly as it does today.
- [ ] **The pre-spawn assert skips only the brain**: with a SUSPECT instruction-shaped
      object still in the vault at a code-owned name, the brain is not spawned, the
      skip is announced, and the rest of the run proceeds.
- [ ] **The assert never fires on the user's own file**: with a legitimate
      **tracked-and-clean** `CLAUDE.md` committed in the vault, the dream runs
      normally, every night, with no skip and no warning; the same file **untracked**,
      or modified against HEAD, or named in the residue index, does produce the loud
      skip.
- [ ] **Nothing else changes**: every path the validator accepts and commits today is
      still accepted and committed, every existing reason string is unchanged, and the
      EP2 secret gate's own behaviour is untouched.
- [ ] Idempotence (the template's criterion; this package changes a command that
      writes outside the repo): a second run reproducing the same disposal produces a
      **byte-identical enforcement line** — which holds because no suffix names a
      filename. The report's per-run append is pre-existing behaviour and outside this
      criterion.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream|private-fs"
npm test
npm run lint
```

**These commands are green on a spec-only branch, before any of this package exists —
measured on the predecessor. They prove nothing alone, and the real gate is below.**

- **Every acceptance criterion is a behavioural test the implementer writes, and the
  PR must demonstrate each one RED against a deliberately broken implementation and
  GREEN against the finished one.** Green-on-green is not evidence. Break the thing
  the criterion names — remove the `lstat`, let the restore run onto an occupied
  pathname, copy instead of moving a symlink — and paste the red.
- **There is deliberately NO source-level assertion.** Two candidates were measured
  defective on the predecessor: one vacuous on the untouched tree, one shape-dependent
  (0/2 and 1/2 against two equally correct implementations, because a contract string
  containing both an apostrophe and a double quote is escaped differently depending on
  the implementer's quoting style). **A source-text grep is not a sound way to assert
  a contract string. Do not re-add one.**

## Out of scope (do NOT do these)

- **The denial rules** (dot-prefixed segments, instruction filenames as a *fence*
  rule), the **candidate set**, the **visibility invariant**, the **recompute
  ordering**, the **stabilization protocol** and the **report bridge** — all the EYE's
  (`WP-dream-fence-candidate-set`).
- **The git-execution seam** (`core.hooksPath`, `--no-verify`, `--no-ext-diff`, the
  repo-local-state class) — C2.
- **The layout dot rule and its diagnostic** — C3.
- **`--ignored`**, **`git clean -x`**, and aborting the run on any denial.
- **`src/core/dream/brain.js`**: the unreachable Codex branch stays as it is.
- **`state/quarantine/`'s retention, modes and banner** — reused, not redesigned.
- Every other finding in the 2026-07-29 audit.

## Definition of done

1. All verification steps pass locally, and the PR body carries the both-directions
   evidence: every acceptance criterion shown RED against a deliberately broken
   implementation and GREEN against the finished one.
2. Conventional commits; PR titled
   `fix(dream): move denied objects out of the vault (WP-dream-denied-object-disposal)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run and are clean or fully dispositioned
   (`docs/runbooks/codex-review.md`).
6. **Merge discipline: this PR and the EYE's are stacked and merged TOGETHER**, only
   after both are green on both gates. No night may run on half a fence.

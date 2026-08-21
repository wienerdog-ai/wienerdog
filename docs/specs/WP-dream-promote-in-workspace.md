---
id: WP-dream-promote-in-workspace
title: Move the brain's write target into a system-built workspace and promote approved content into the vault
status: Draft
model: opus
size: M
depends_on: [WP-dream-baseline-delta-primitive]
adrs: [ADR-0004, ADR-0012, ADR-0020, ADR-0025, ADR-0031, ADR-0034]
epic: audit-2026-07-29
---

# WP-dream-promote-in-workspace: the workspace becomes the write target, and promotion replaces filtering

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Dispatch precondition.** This spec is written against the tree at
`025021fc0fa8f871f1eb960a8ad57a14d223360e` (`025021f`), verified as both `main`
and `origin/main` at authoring time. Before dispatch, re-run every `file:line`
citation and every measurement below against the tree the implementer will find
(`docs/specs/README.md` → Dispatch-time re-verification). A citation that does
not resolve blocks the dispatch. **Range citations are checked at BOTH ends.**

Note for the re-verifier: an unmerged branch `wp/dream-write-fence-control-files`
(`7093079`, **not** an ancestor of `main`) carries two Draft specs from the
superseded filter-out design (`WP-dream-fence-candidate-set`,
`WP-dream-denied-object-disposal`). They are recorded, not deleted, and are
superseded by this package's shape. Nothing here depends on them and nothing
here may be merged on top of them.

## SIZE SELF-CHECK — THIS SPEC DOES NOT FIT ONE SESSION

`docs/specs/README.md` sizes a package at ≤ ~400 lines of new non-test content,
≤ 8 files touched, zero "and also" clauses, and forbids `L`. Measured against
this spec's own Deliverables table: **11 files touched, two new modules, four
gates changing input and order, and at least five independent "and also"
clauses.** The frontmatter carries `M` because the schema
(`tests/schemas/spec.schema.json`) admits only `S` and `M`; `status: Draft`
keeps it undispatchable, and this section is the honest value.

**The seam, named in advance so the split is a decision and not a discovery** —
it is the seam the intent brief already named, and this spec's Deliverables and
contract tables are grouped along it so an owner split is mechanical:

- **Part i — the workspace and the brain re-target.** Tables A and B; the
  workspace lifecycle, the copy-in, the constructed baseline, the six re-target
  sites, the reap precondition. Leaves the product WORKING only if promotion
  exists, so it does not ship alone: this is a stacked pair.
- **Table F belongs to BOTH parts** and is not divisible: its first rows are
  Part i's claims, its containment rows are Part i's walk, and its attribution
  of M10's closure is what Part ii's gate migration rests on. A split copies it
  into both halves or leaves it on the first and has the second cite it — an
  owner call, named here so it is not discovered mid-split.
- **Part ii — promotion.** Tables C, D and E; the three-way compare,
  conservative merge, refuse-and-report, the window close, gate re-ordering and
  re-input, promotion accounting, atomicity, and the pipeline rewiring.

**The split is the owner's ruling, not the reviewer's and not the author's.**

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** (ADR-0012) spawns a
headless AI brain, lets it write notes, and then runs a code validator that
classifies every write, reverts what fails policy, and makes one commit in the
vault.

Today the brain's tool roots are `[vaultDir, scratchDir]`
(`src/core/dream/brain.js:98`, verified) — **the brain writes into the live
vault**, and the validator afterwards tries to filter the damage out of a
namespace that already holds the user's data. Three designs tried to make that
filtering sound and each failed on the same root: the pre-brain baseline was an
OBSERVED property of a contaminated namespace, and each of the three observation
mechanisms tried was measured to be blindable from inside the tree. **That is
three measured failures, not a proof about all possible observations** — what
replaces it is not a fourth observation but a constructed baseline, which needs
no such proof. The full reasoning, the measurements and
the owner's rulings live in the war-room decision log and are **not repeated
here**.

This package inverts the direction. The system builds a **workspace**, copies
the vault's readable content into it, and captures the exact bytes it just
wrote — so the baseline is **constructed**, known by construction rather than
inferred. The brain's write target moves to that workspace — a change at **six
measured sites, not one** (Table B) — after which no argv element and no
environment value handed to either harness carries the vault path. The validator
classifies the brain's writes against that
constructed baseline using the git-free delta primitive this package's
dependency shipped (`src/core/dream/delta.js`, consumed by nothing until now).
Only approved content is **promoted into** the vault. Filtering out becomes
promoting in.

Two audit findings close here, and each closure names the mechanism that
prevents it rather than the policy that catches it. **M7** (a hostile
`CLAUDE.md` persists in the vault and re-steers later runs,
`docs/security-audit/2026-07-29/CURRENT-IMPLEMENTATION-REVIEW.md:676-752`): the
brain cannot write the vault at all, and promotion admits paths by a positive
allowlist (Table C) rather than denying two known filenames — the file never
comes into existence in the vault. **M10** (the dream writes `.gitignore` and
blinds every gate, `:931-989`): classification is a filesystem walk that never
consults git, so an ignore file has nothing to blind. The mechanism is absent,
not defeated. **Read Table F before trusting either sentence** — it states what
was measured, and it corrects the mechanism attribution for M10.

## Current state

- `src/core/dream/brain.js` — the vault path reaches the brain process through
  **six** distinct sites, not one: `:57` (prompt text "your only write target"),
  `:65` (absolute vault-prefixed layout lines), `:98` (`addDirs` — the Claude
  tool roots), `:120` (`--cd vaultDir` — THE Codex write fence, because
  `--add-dir` does not fence `apply_patch`), `:172` (`WIENERDOG_DREAM_VAULT` in
  the child env), `:189` (`cwd = vaultDir` on the Codex path). The Claude path
  already runs from a neutral staging cwd (`:198`, `ensureBrainStaging`).
- `src/core/dream/validate.js` (1469 lines) — Step 1 scratch integrity
  (`:1107`), Step 2 per-path classification (`:1144`), Step 3 the EP2 secret
  gate (`:1211`), Step 4 the dream report (`:1374`), Step 5 stage-and-commit
  (`:1411`, whose `git add -A` is at `:1412` — Table E owns that call), Step 6
  the skill ownership registry (`:1443`). Table D owns what each gate's evidence
  is today and what it becomes. The compare-then-write guard this package reuses
  is at `:884-889`.
- `src/cli/dream.js` — `precommitSessionEdits(vaultDir)` at `:493` followed by
  `assertCleanTree(vaultDir)` at `:494`; `restoreVaultToHead(vaultDir)` at
  `:535` (brain failed/timed out) and `:550` (scratch changed mid-run);
  `runBrainWithWatchdog` at `:137`, whose reap verdict is computed at `:272`
  and **discarded** — the function returns without surfacing it.
- `src/core/dream/delta.js` — `captureBaseline` and `computeDelta`, git-free,
  spawns nothing, **consumed by nothing**. This package is its first consumer.
- `src/core/layout.js:21-29` — the seven `LAYOUT_KEYS`. `:32-42` — the
  defaults.
- `skills/wienerdog-dream/SKILL.md:52` — the brain reads existing notes across
  the vault for dedupe ("any note whose topic a candidate matches"); `:115-117`
  — it writes into `02-Areas/` and `03-Resources/`, which are **not**
  layout-mapped. Both measured. **This file is not edited here**, and Out of
  scope owns the reason.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

Grouped along the seam named in the size self-check.

| Part | Action | Path | Notes |
|------|--------|------|-------|
| i | create | src/core/dream/workspace.js | build / copy-in / capture / verify / tear down (Table A) |
| i | modify | src/core/dream/brain.js | re-target all six sites (Table B) |
| i | create | tests/unit/dream-workspace.test.js | Table A + Table B + Table F evidence |
| ii | create | src/core/dream/promote.js | three-way decide + merge + promote (Tables C and E) |
| ii | modify | src/core/dream/validate.js | gate inputs and order (Table D); the EP2 enforcement half |
| ii | modify | src/cli/dream.js | pipeline rewiring, the reap precondition, the abort paths |
| ii | create | tests/unit/dream-promote.test.js | Tables C, D and E |
| ii | modify | tests/unit/dream-validate.test.js | the gates' new inputs and order |
| ii | modify | tests/integration/dream.test.js | pipeline wiring and abort behaviour |
| — | modify | docs/GLOSSARY.md | two canonical names: **workspace**, **promotion** |
| — | modify | docs/adr/0012-dream-run-lifecycle.md | the lifecycle this package changes |

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

### Exact contracts

```js
/** Build the run's workspace, copy the vault's readable content into it, and
 *  capture the bytes just written as the run's constructed baseline (Table A).
 *  Verifies Table A's two structural postconditions before returning.
 *  @param {{vaultDir:string, paths:import('../paths').Paths, date:string,
 *           layout:import('../layout').VaultLayout}} o
 *  @returns {{workspaceDir:string, baseline:import('./delta').Baseline,
 *             copied:number, skipped:Array<{rel:string, reason:string}>}}
 *    throws WienerdogError when a postcondition fails (fail closed, before spawn) */
function createWorkspace(o)

/** Remove the workspace tree. Idempotent; never touches the vault. */
function destroyWorkspace(workspaceDir)

/** Decide, per changed path, what happens to it — and promote what survives.
 *  Pure decision first, writes second: no vault byte is written until every
 *  decision in the run is made (Table E's atomicity row).
 *  @param {{vaultDir:string, workspaceDir:string,
 *           baseline:import('./delta').Baseline, layout:import('../layout').VaultLayout,
 *           gates}} o
 *    gates  the four decision functions of Table D, injected rather than
 *           imported so `promote.js` does not depend on `validate.js`; each
 *           takes candidate bytes and returns a refusal reason or null
 *  @returns {{promoted:string[], refused:Array<{rel:string, reason:string}>}} */
function promote(o)
```

## Contract reference

Activation (ADR-0031, 2-of-7 — six are true): (i) two new module interfaces
appear; (ii) a promotion outcome taxonomy is introduced; (iv) refusal and
fallback behaviour changes across four gates; (v) the workspace records data
whose interpretation and lifecycle the validator owns; (vi) the successor
residue-lifecycle package inherits the workspace contract; (vii) the gate order
is mirrored in `validate.js`, the tests and the dream report.

### Table A — the workspace and the constructed baseline

| Fact / rule | Value |
|-------------|-------|
| Placement | under the canonical core's private state (`paths.state`), one directory per run, created 0700 through the existing private-fs primitives. **Not** under the vault, and the reason is the unconditional one: a workspace inside the vault would put the brain's write root inside the promotion TARGET, so every brain write would land in the vault directly — today's failure with an extra directory. (It would also sit inside a git repository, since the vault is one; that is a second reason and, per Postcondition 2 and Table F, a weaker one — the property it names is not establishable by construction) |
| The depth question, measured and answered | `private-fs.js:671-677` justifies its 64-pass directory-repair cap on the real private tree being SHALLOW ("depth 4"), and aborts fail-closed if the cap is hit. A vault-shaped workspace has arbitrary depth and would invalidate that **justification** without necessarily exceeding the cap. The workspace therefore sits at a fixed shallow path whose own repair is bounded, and **its interior is not subject to the fixed-point repair**: the run creates it, the run owns it, the run removes it. If the implementer finds the repair does walk into it, that is a finding, not a fix |
| Copy-in scope | **the brain's REAL read/write need — approximately the whole readable vault — NOT the seven `LAYOUT_KEYS`.** Measured: the brain reads across the vault for dedupe (`SKILL.md:52`) and writes outside the mapped dirs (`:115-117`). Narrowing to the seven keys silently degrades the product: blind dedupe produces duplicates, and Tier-2 writes land in the void. **Width does not weaken the guarantee, and this row is where that is defended rather than per review round:** the guarantee is that the baseline is KNOWN, not that it is small. A wide baseline is exactly as known as a narrow one, because the system wrote every byte of it |
| Copy-in exclusions | `.git/` at any depth (Postcondition 1); the layout's `reports_dir` (the dream report is code-owned — Table D); and the harness control-file shapes `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.codex/`, `.mcp.json` at any depth. **The control-file exclusion is defense in depth on the Claude arm and load-bearing on the Codex arm:** measured in the war-room, the Claude brain does not load an instruction file from an `--add-dir` root (the `--help` "(CLAUDE.md dirs)" text is misleading), while the Codex arm's write root IS its cwd (`brain.js:120`, `:189`), which is where instruction discovery happens. Every exclusion is REPORTED in `skipped`, never silently dropped. Excluding a shape from copy-in keeps it out of the BASELINE; what keeps a brain-CREATED one out of the vault is the promotion allowlist (Table C9) — the two are different barriers at different moments, and neither is a restatement of the other |
| Copy-in mechanism | a real byte copy, or a copy-on-write clone where the platform provides one. **NEVER a hardlink mirror** — measured: a hardlink alias writes the vault inode, so the brain would be editing the real vault through the mirror, reproducing today's failure with an extra step. Measured on the primary platform (macOS 15 / APFS, Node 24.18): `fs.constants.COPYFILE_FICLONE_FORCE` fails **ENOSYS**, and plain `COPYFILE_FICLONE` is indistinguishable in wall-clock from a plain copy (165 ms vs 165 ms for 2 000 files / 7.8 MB). **So copy-on-write is not available through Node's API here, and no design may depend on it** |
| Copy-in cost, measured | ~85 µs per file, dominated by per-file syscall overhead rather than bytes: 2 000 files / 7.8 MB → ~165 ms; 20 000 files → ~1.7 s. On a nightly job that is not a cost that needs mitigating, and this spec deliberately specifies none. What DOES need a bound is the baseline's memory (row below) |
| The constructed baseline | `captureBaseline(workspaceDir)` (the dependency's primitive) runs **after** copy-in and **before** the brain is spawned. It captures the workspace, not the vault: capturing the vault would re-introduce the observed baseline this whole direction exists to escape. The baseline holds **BYTES, not only hashes** — owner-ruled, because the merge (Table C) needs bytes |
| Named residual: baseline memory | the baseline is proportional to the copied vault: ~7.8 MB for 2 000 notes, ~78 MB for 20 000. The dependency named this and handed the scope decision here. **This package sets no cap and states why:** a cap would have to drop files, and a baseline that silently omits a file reports that file as `added` later, which is a false accusation against whoever wrote it. If a real vault is ever measured past the point where this matters, the answer is an on-disk pristine copy, not a partial baseline |
| **POSTCONDITION 1 — no `.git` object anywhere in the workspace** | asserted by a walk over the finished workspace before the brain is spawned. Any entry named `.git` — directory, file or symlink — fails the run closed |
| **POSTCONDITION 2 — no product code runs git with a cwd at or beneath the workspace root** | this is the checkable form of "the workspace is not a git repository", and it is the form that is TRUE. Measured: a plain directory nested anywhere under a repository IS inside that repository for every git command — `git rev-parse --show-toplevel` from `<repo>/sub/workspace` resolves to `<repo>`. So the absence of a `.git` entry does **not** establish the property, and no construction of ours can: whether an ancestor of the private core is a repository is a property of the user's filesystem (`$HOME` as a dotfiles repo is a common habit). What IS ours is where we point git, and Table F states what each half actually carries |
| **The no-live-actor precondition for the post-brain walk** | `computeDelta` runs on the workspace only after the brain's process group is **verifiably** empty. `runBrainWithWatchdog` (`cli/dream.js:137`) already computes that verdict at `:272` — `reapGroupFn(...)` returning `{reaped:true}` — and today **discards it**; on `{reaped:false}` it retains the pidfile for run-job's backstop and returns anyway. This package surfaces the verdict and **refuses the run fail-closed** on anything but a verified reap, rather than walking a workspace a surviving process can still mutate. This converts the dependency's explicitly-unverified hypothesis (2) into an enforced precondition (Table F) |
| Teardown | the workspace is removed on every exit path — success, refusal, brain failure, timeout — **with one named exception: a run that refused because the reap was not verified does NOT tear down.** Removing a tree a surviving process may still be writing is not a cleanup, and the row above is the whole reason that state is distinguishable. Teardown never touches the vault. A workspace left behind by that refusal, or by a crash, is the residue-lifecycle successor's subject, not this package's |

### Table B — the brain re-target, site by site (CLAIM 1)

**This table IS the first claim's evidence.** The intent brief states the change
as `brain.js:98`; measured, the vault path reaches the brain through six sites,
and two of them are Codex-specific with a different mechanism. A re-target that
changes only `addDirs` leaves the Codex arm writing the vault.

| Site (measured at `025021f`) | Today | After | Why it is not optional |
|---|---|---|---|
| `brain.js:57` | prompt: `Vault directory (your only write target): ${vaultDir}` | the workspace path | the brain writes where the prompt tells it to; a stale path here is a write outside the fence |
| `brain.js:65` | `layoutPromptLines(lay, date, vaultDir)` — ABSOLUTE vault-prefixed tier paths | workspace-prefixed | absolute paths bypass the write root entirely |
| `brain.js:98` | `addDirs: [vaultDir, scratchDir]` | `[workspaceDir, scratchDir]` | the Claude tool roots. `--add-dir` grants read AND write on both harnesses; there is no directory-level read-only option in either, so under this design the brain simply loses vault access rather than depending on a permission layer |
| `brain.js:120` | `--cd vaultDir` | `--cd workspaceDir` | **THE Codex write fence** — `--add-dir` does not fence `apply_patch` (openai/codex#24214). Leaving this is leaving the Codex brain writing the vault |
| `brain.js:172` | `WIENERDOG_DREAM_VAULT: vaultDir` | the workspace path | read by the WP-026 mapped fake brain; a real brain has no Bash to read env. Re-pointed for consistency of the fence, not as a control |
| `brain.js:189` | `cwd = vaultDir` (Codex arm) | `cwd = workspaceDir` | instruction discovery happens at cwd — this is M7's step 3 |
| **The claim's runnable form** | — | — | for **both** harnesses: build the argv and the child env, and assert `vaultDir` (and any prefix of it) appears in **no** argv element and **no** env value. A grep over the source is not sufficient — renaming the variable would pass it. The assertion is over the composed values. Measured on the pinned base as a red-side proof that the check discriminates: the composed Codex argv carries the vault path in **two** elements today — the `--cd` operand and the positional prompt |
| **The claim's behavioural form** | — | — | a real `spawnBrain` run against the pinned fake brain that deliberately attempts a vault write, after which the vault is **byte-identical** to its pre-run state. Proven RED by pointing one site back at the vault, one site at a time — six reds, because a single red does not prove the other five sites are covered |

### Table C — the promotion decision

The three-way state triple per relative path: **baseline** (what copy-in wrote),
**after** (the workspace now), **vault-now** (the live vault at decision time).
**Rows C1–C8 are the evaluated conditions**, top to bottom, first match decides. C9 is the definition C1 refers to, and M1–M3 are mechanics that apply to whichever row selected them; none of those four is itself a condition.

| # | Condition | Outcome |
|---|---|---|
| C1 | the path is not admitted by the promotion allowlist (row C9) | **refuse-and-report.** Nothing is written to the vault |
| C2 | delta status is `deleted` (present in baseline, gone from the workspace) | **refuse-and-report — promotion never deletes.** The vault keeps the note. Named rather than traded off: a deletion is unrecoverable and the brain has no business making one |
| C3 | delta status is `added` and `vault-now` has no such path | **promote** the workspace bytes (Table E's write) |
| C4 | delta status is `added` and `vault-now` HAS the path | **refuse-and-report.** The user created a note at that path during the run; the brain's version does not displace it |
| C5 | delta status is `modified` and `vault-now` bytes equal `baseline` bytes | **promote** — the user did not touch it, so there is nothing to merge |
| C6 | delta status is `modified` and `vault-now` differs from `baseline`, and the three-way merge exits clean | **promote the MERGED bytes** |
| C7 | delta status is `modified`, `vault-now` differs, and the merge conflicts | **refuse-and-report. The note stays in the USER's live version** |
| C8 | delta status is `modified` and the path is gone from `vault-now` (the user deleted it during the run) | **refuse-and-report** — modify/delete is a conflict, and the user's deletion wins |
| C9 | **the promotion allowlist** | a path is admitted when ALL hold: (a) it is under one of the layout's writable tier directories — `identity_dir`, `daily_dir`, `projects_dir`, `skills_dir`, `inbox_dir` (`layout.js:21-29`; `reports_dir` is excluded, and `daily_filename` is not a directory) — or under `02-Areas/` or `03-Resources/`; (b) its final component ends in `.md`; (c) its basename is not `CLAUDE.md` or `AGENTS.md` at any depth. (a) and (b) are a positive allowlist and close the class M7's remediation asks for — a vault-root `CLAUDE.md`, a `.gitignore`, a `.claude/settings.json` and an Obsidian plugin binary are all outside it without anyone enumerating them. (c) is a **named deny-list and is stated as one: it will not cover the next harness convention.** It exists because (a) and (b) cannot reach an `AGENTS.md` written inside a tier directory |
| M1 | Merge mechanics | **Merge on a COPY; promote only on a clean merge.** Measured on git 2.50.1: `git merge-file` exits 1 and writes conflict markers **INTO the target** — for a divergent edit and for modify/delete alike — so merging on the user's live note would violate the very guarantee refuse-and-report exists to keep. Clean divergent edits exit 0 with correct merged bytes |
| M2 | The merge's git invocation | The merge exit code is a security decision (clean → promote), so the invocation takes the dependency's **constructed-environment** discipline verbatim (`WP-dream-baseline-delta-primitive`, Table C): an environment BUILT from nothing rather than filtered, config and attribute roots pointed at directories this run created empty, a cwd outside any repository, and the verified absolute executable via `spawnPinnedSync`. **This spec does not restate that recipe — the dependency owns it.** Measured here as corroboration, not as the guarantee: an armed `merge=` driver via `core.attributesFile` does not reach `merge-file`, and a hostile global config did not move an exit code. That enumeration is not trusted — this program's record at enumerating git's influence channels is 0 for 4, which is precisely why the answer is construction rather than a blocklist. **Named residual, inherited:** absolute verified invocation prevents PATH selection of an impostor; it does not freeze the executable's bytes |
| M3 | Repository attribute sensitivity | **DISCHARGED here, as the dependency required.** The dependency named this as the successor's obligation. Discharged structurally: classification is `computeDelta`, which is git-free and reads no attributes; the workspace contains no `.git` (Postcondition 1); and the only git this package runs is the merge, under the constructed roots above. There is no path by which a repository attribute reaches a promotion decision |

### Table D — the four gates: input and order

Today all four derive their evidence from git in the vault (`validate.js`
Steps 2 and 3). After this package none of them consults git: the secret gate
judges the brain's added lines against the baseline, and the other three judge
the MERGED candidate bytes — which include the user's diverging edits, and are
therefore exactly what would be promoted. The **order inverts** relative to
today: today the secret gate runs LAST (`:1211`, after Step 2's three); after
this package it runs FIRST.

| Gate | Today | Decision input after | Position | Refusal remedy |
|---|---|---|---|---|
| EP2 secret gate (ADR-0034) | `validate.js:1211` — `git add -A` then `git diff --cached --numstat` per path | the delta's `addedLineNumbers` and derived scan text over the workspace's after-bytes vs the baseline — exactly the bytes this run is responsible for, which is the same property the staged-diff form had | **BEFORE the merge** | withhold from promotion + preserve to quarantine. **There is nothing to revert**, because nothing was written to the vault: the enforcement half that reverts, re-stages and drops index entries (`:1324-1364` is its revert core) has no subject and goes. **No line count is stated here**: the figure this row originally carried came from the war-room log and was not measured against the tree, and a spec that repeats an unmeasured number lends it authority it never had |
| Skill-body guard (ADR-0020) | `validate.js:1187` `skillBodyViolation` | the merged candidate bytes. **Its authorizing input is the BASELINE ledger, never the post-brain one** — otherwise the brain authorizes its own skill rewrite within a single run | AFTER the merge | refuse-and-report; the note stays in the user's live version |
| Tier-3 floor | `validate.js:1194` `tier3Decision` | the merged candidate bytes | AFTER the merge | refuse-and-report |
| Ledger validation | `validate.js:1156` `ledgerViolation` | the merged candidate bytes | AFTER the merge | refuse-and-report |
| **Why this order, measured both ways** | — | — | — | a secret merged into the candidate bytes can only be remedied by discarding the whole note **along with the user's diverging edits**; and a gate judging pre-merge bytes would not be judging what is promoted. Violating this in either direction is punished by data loss, which is why it is a contract and not an implementation detail |
| **Atomicity: the skill-guard ↔ ledger pair** | — | — | — | the pair promotes **atomically**. The guard authorizes the skill from the ledger and the ledger is validated from the skill, so promoting one while refusing the other leaves the vault inconsistent. Enforced by Table E's decide-then-write ordering |
| The dream report | `validate.js:1374` — written into the vault, and brain-writable because it lives in the vault | code-written into the **vault**, after promotion. `reports_dir` is excluded from copy-in (Table A), so it is not in the workspace, not in the baseline, and not a promotion candidate | after promotion | N/A — the brain can no longer reach it. **The report bridge dissolves**, confirmed rather than inherited |

### Table E — the promotion write, and the one new window

| Fact / rule | Value |
|-------------|-------|
| Decide, then write | every path's outcome is decided before **any** vault byte is written. This is what makes Table D's atomicity row enforceable and what keeps a mid-run failure from leaving half a decision applied |
| **The compare→promote window** | the only genuinely new window this direction introduces, and it is milliseconds against today's minutes-long silent window. Closed by conditional write: the last act before publishing a promoted path is to re-read the vault target and compare it byte-for-byte against the `vault-now` bytes the decision used. On a difference the write is **abandoned** and the path becomes refuse-and-report. The repo already contains exactly this guard to copy — `validate.js:884-889`, whose comment states the same reason ("a mid-dream editor save lands here, and overwriting it would destroy the only copy of what the user actually wrote") |
| The publish itself | write to a temporary file beside the target, then `rename` — the same shape as the cited precedent, so the target is never observed half-written |
| Promotion accounting | every path gets exactly one recorded outcome: `promoted`, or `refused` with a reason. The dream report's enforcement section is written from that record. A path with no outcome is a bug, and the acceptance criteria assert the partition |
| `precommitSessionEdits` **does not survive** | measured: its stated job is "so the subsequent dream diff is exactly the brain's writes" (`validate.js:113-115`). Under this package the brain writes nothing in the vault, so there is no such diff, and the three-way compare reads `vault-now` from the **filesystem** rather than from git. What remains is only its cost: it commits the user's in-flight edits under the `wienerdog` identity without asking. It goes, and `assertCleanTree(vaultDir)` (`cli/dream.js:494`) goes with it |
| The dream commit stages **only promoted paths** | consequence of the row above, and not optional: with no pre-commit, `git add -A` (`validate.js:1412`) would sweep the user's uncommitted edits into the dream commit. The commit stages the promoted paths and the code-written report explicitly. ADR-0012's "one dream run = one git commit in the vault" is unchanged — the commit now contains only what the dream promoted, which is strictly closer to what that ADR says |
| **The abort paths change, and leaving them would be a data-loss regression** | `restoreVaultToHead` (`validate.js:139-149` — `reset --hard` + `clean -fd`) is called at `cli/dream.js:535` and `:550`. Both mean "discard the brain's unvalidated writes". Under this package the brain wrote nothing in the vault, so there is nothing to discard — and with `precommitSessionEdits` gone, a `reset --hard` there would destroy **all** of the user's uncommitted work for a failure that never touched the vault. Both call sites become `destroyWorkspace`. `restoreVaultToHead` itself is left in place and exported: **the intent brief routed the abort paths to the residue-lifecycle successor, and this row is narrower than that** — it changes only which function the two sites call, not the crash-replay, journal or uninstall-restore subject |

### Table F — what the two claims actually establish (measured, not asserted)

The intent brief marks two sentences as this package's to DEMONSTRATE, because
an earlier advisor passed them on as established when they stood only in a plan.
Measured on the tree, one holds as stated and one needs its mechanism
re-attributed. **This table is the honest form; the prose above cites it.**

| Claim | Measured verdict |
|---|---|
| **1. The brain's roots become `[workspaceDir, scratchDir]`, and no other path grants the brain vault access** | **Holds, but is a six-site change, not a one-line one** (Table B). `brain.js:98` is one of six sites and the only one the brief names; `:120` and `:189` are the Codex arm, where the mechanism is `--cd`/cwd rather than `--add-dir`. Runnable form: the composed-argv-and-env assertion plus the byte-identity behavioural test, each proven red six times, one site at a time |
| **2a. No `.git` object exists in the workspace** | **Holds by construction and is checked** (Postcondition 1) |
| **2b. "The workspace is not a git repository"** | **Does NOT hold as stated, and no construction of ours can make it hold.** Measured: `git rev-parse --show-toplevel` from a plain directory nested under a repository resolves to that ancestor repository. Whether an ancestor of the private core is a repository is the user's filesystem, not ours. The checkable and true form is Postcondition 2: **no product code runs git with a cwd at or beneath the workspace root** |
| **What M10's closure actually rests on** | **the git-free classification, not the not-a-repository property.** `computeDelta` is a filesystem walk that never consults git — the dependency asserts this mechanically (its module requires no `child_process`). An ignore file cannot hide a path from a filesystem walk, on any platform, regardless of any ancestor repository. Postcondition 2 is a second, independent barrier whose failure would be bounded to our own git invocations, and this package makes exactly one — the merge (Table C, row M2) — whose cwd is a constructed neutral directory outside any repository, never the workspace. **The intent brief attributes the closure to the second half; measurement puts it on the first.** Nothing about the closure weakens — it gets stronger, because the load-bearing half is unconditional. Measured on the pinned base, both directions: in one tree holding a self-hiding `.gitignore` (`*`) and a payload under a project dir, `git status --porcelain -z -uall` returns **zero bytes** (M10 reproduced) while `computeDelta` reports the payload `added` |
| **The containment residual the dependency handed over — hypothesis (1), the brain's tool set** | **FALSE on the Codex arm, and that is a correction to an inherited assumption.** Measured: the code-owned `dream` hermetic runtime profile (ADR-0025) allows `Read`/`Write`/`Edit`/`Glob`/`Grep` and disallows `Bash` (`getProfile('dream')`, `src/core/runtime-profile.js`) — so on the Claude arm the brain has no tool that creates a symlink or renames a directory. But the Codex arm runs `--sandbox workspace-write` (`brain.js:117-118`), which permits shell **inside** the workspace. The dependency called this hypothesis weak because tool capability is a harness detail; measured, it is not merely weak, it is arm-dependent |
| **The containment residual — hypothesis (2), capture-before-spawn ordering** | **Holds, and this package makes it ENFORCED rather than assumed, on both walks.** Copy-in and `captureBaseline` both run before the brain is spawned, so during capture there is no actor. The post-brain `computeDelta` walk is the one the dependency could not speak for; Table A's reap precondition closes it by refusing to walk until the brain's process group is verifiably empty. With no live actor, the residual reduces to statically-planted objects, and a static symlink — to a file or a directory — is refused by the dependency's classification and appears in no baseline and no record |
| **The real exposure, stated PER PLATFORM as the dependency required** | the race needs a writer CONCURRENT WITH THE WALK, and the reap precondition removes the only one. The brain is the sole actor with workspace write access — on the Codex arm it can even run shell there (row above) — and it is verifiably dead before the walk begins; what remains would have to be some other process writing inside the 0700 private core, which is not a threat this project's model carries. **This is the whole reason the reap precondition is a contract row and not a nicety:** without it, the Codex arm's brain is exactly the live actor the dependency's caller invariant forbids. **The platform condition therefore does not bite here**: `O_NOFOLLOW`'s absence on win32 costs WHEN the refusal happens, not whether it happens — the `(dev, ino)` revalidation refuses at `fstat` before any byte is read — and with no live actor there is no window to widen. The surviving residual is inode reuse, which exists on every platform. **No cross-platform guarantee is claimed:** what is claimed is that this package does not depend on the flag |
| **The precedent for the workspace walk** | `src/core/vault-snapshot.js:45-61`, not `private-fs.js`. The former states the platform question and answers it with an explicit branch that NAMES what is lost, deliberately rejecting the `fs.constants.X \|\| 0` idiom "which makes a missing flag look like a present one". `private-fs.js:683-684` and `manifest.js:746` do use `\|\| 0`, and both consciously name what carries the weight on win32 — **the repo is inconsistent in IDIOM, not in substance**, and no stronger phrasing than that is supported |

### Mirrored Surface Checklist

- [ ] Deliverables-table `Notes` cells (each cites its owning table)
- [ ] `### Exact contracts`' three signatures and their return shapes
- [ ] Acceptance criteria that assert Tables A–F
- [ ] Verification steps (the assertions mirror Tables A and B)
- [ ] Current-state description (the six re-target sites, the validator's steps, the discarded reap verdict)
- [ ] Implementation notes (the merge-on-a-copy trap, the six-reds requirement, the CoW measurement)
- [ ] Out of scope (what the residue-lifecycle successor and C2 own)
- [ ] **The SIZE SELF-CHECK section and the Dispatch-precondition block** — registered on the spot per register-new-mirrors: the self-check mirrors the Deliverables row count, the gate count and the contract-table grouping; the dispatch block mirrors the pinned base every citation is measured against. A finding that changes any of those updates this section too
- [ ] **Every surface that states what a claim establishes** — registered here because the intent brief's own prose over-attributed M10's mechanism and this spec must not reproduce it: the Context paragraph, Table A's two postconditions, Table F, the Security checklist, and the acceptance criteria. **No surface may say the workspace is not a git repository without qualification, and none may attribute M10's closure to that property.**
- [ ] **Every surface that describes the brain re-target** — the Context paragraph, Table B, Table F, the acceptance criteria and the verification steps. **None may describe it as a one-line change to `addDirs`.**

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: the workspace is files, created and removed within one
  run; nothing outlives the job.
- **Merge on a copy — the trap, measured.** `git merge-file` mutates its first
  operand in place on conflict. The obvious shape (merge the vault note against
  the workspace note) leaves conflict markers in the user's live file on exactly
  the path where refuse-and-report promised not to touch it.
- **Six reds, not one.** The re-target's negative proof must break one site at a
  time. A single red passes with five sites still pointing at the vault, and
  five of the six are invisible to a test that only checks `addDirs`.
- **Copy-on-write is measured absent through Node's API on the primary
  platform** (Table A). Do not write a fast path that assumes it and a slow path
  that never runs; write the copy, and let `COPYFILE_FICLONE` be a hint the
  platform may ignore.
- **The reap verdict already exists** (`cli/dream.js:272`) and is discarded.
  Surfacing it is a return-value change, not new machinery — resist rebuilding
  a reap check beside the one that is already there.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item applies twice over. Relative
      paths from the workspace walk are attacker-influenceable and flow into
      filesystem writes **into the vault** — the promotion allowlist (Table C9)
      is anchored per path segment and rejects `/`, `\` and `..` before any path
      is joined to the vault root, and containment is re-resolved against the
      vault's realpath at write time, not only at decision time.
- [ ] **The dependency's caller invariant is discharged here, and Table F says
      how.** The dependency establishes no containment and hands its caller a
      checkable duty: prevent an untrusted actor from replacing the root entry
      or any ancestor or directory entry used to reach an enumerated path, for
      the duration of each call. Discharged by ordering rather than by a
      mechanism: both pre-brain walks run before any actor exists, and the
      post-brain walk runs only after a verified reap. **No surface may claim
      the walk establishes containment.**
- [ ] The failure mode that matters is a **silently incomplete baseline**: a
      file omitted at copy-in or capture is later reported as `added` and
      promoted over the user's version. Copy-in reports every exclusion in
      `skipped`; capture throws rather than skipping (the dependency's rule).
- [ ] The merge's git invocation is a security decision and takes the
      dependency's constructed-environment discipline (Table C). Named
      residual, inherited and not closed: executable-identity influence at a
      verified absolute path.
- [ ] Named residual: on the Codex arm the brain can run shell inside the
      workspace (Table F). This package does not close that and does not claim
      to; the reap precondition is what keeps it from mattering to the walk.

## Acceptance criteria

- [ ] **CLAIM 1, structurally.** For both harnesses, the composed argv and the
      composed child env contain no element equal to, and no element containing,
      the vault path. Proven RED **six times** — once per Table B site,
      re-pointed one at a time.
- [ ] **CLAIM 1, behaviourally.** A `spawnBrain` run against a fake brain that
      deliberately attempts a vault write leaves the vault **byte-identical** to
      its pre-run state, on both harness paths.
- [ ] **CLAIM 2a.** No entry named `.git` — directory, file or symlink — exists
      anywhere under the finished workspace. Proven RED by placing a `.git`
      directory in the source vault and asserting copy-in excludes it and the
      postcondition fires when it does not.
- [ ] **CLAIM 2b.** No product code invokes git with a cwd at or beneath the
      workspace root: asserted by a test that substitutes the git seam and fails
      if it is ever called with such a cwd. Proven RED by a deliberate git call
      from the workspace. **A test asserting the workspace "is not a git
      repository" is asserting something Table F measures to be unestablishable
      — the criterion is the cwd assertion, not a repository probe.**
- [ ] **M10's mechanism.** A workspace containing a self-hiding `.gitignore`
      (`*`) and a payload file yields a delta record for the payload — the
      classification is unaffected. This is the criterion that pins the closure
      to the git-free walk rather than to the workspace's repository status.
- [ ] **M7's mechanism.** A brain that writes `<workspace>/CLAUDE.md`,
      `<workspace>/AGENTS.md`, `<workspace>/01-Projects/x/AGENTS.md`,
      `<workspace>/.gitignore` and `<workspace>/01-Projects/x/.claude/settings.json`
      promotes **none** of them, each with a recorded reason, and the vault
      contains none of them afterwards.
- [ ] **The reap precondition.** With the reap verdict forced to
      `{reaped:false}`, the run refuses fail-closed and no delta walk runs.
      Proven green on a verified reap.
- [ ] **Table C's decision matrix**, one case per row C1–C8, each asserting both
      the outcome and the vault's resulting bytes.
- [ ] **The merge never touches the user's live note.** On a conflicting
      three-way state the vault file is byte-identical to its `vault-now`
      version afterwards and contains no conflict marker.
- [ ] **The compare→promote window.** With the vault target changed between the
      decision and the write, the write is abandoned and the path is reported
      refused; the vault keeps the changed bytes.
- [ ] **Gate order and input (Table D).** A secret in the brain's added lines is
      withheld before the merge and never appears in a merged candidate; and a
      Tier-3 / skill-guard / ledger refusal is shown to have judged the
      **merged** bytes, demonstrated by a case whose pre-merge bytes would pass
      and whose merged bytes must not.
- [ ] **ADR-0020's authorizing input.** A brain that rewrites both a skill and
      the ledger in the same run is refused, because the guard reads the
      **baseline** ledger.
- [ ] **Atomicity.** A run where the skill passes and the ledger fails promotes
      **neither**.
- [ ] **The dream commit contains only promoted paths and the report.** With an
      unrelated uncommitted user edit present in the vault, that edit is **not**
      in the dream commit and is **not** lost.
- [ ] **The abort paths.** Brain failure and mid-run scratch change each remove
      the workspace and leave the vault byte-identical, including uncommitted
      user edits. Proven RED against the current `restoreVaultToHead` call,
      which destroys them.
- [ ] **Promotion accounting partitions the delta**: every record is either
      `promoted` or `refused` with a reason, and the counts sum to the record
      count.
- [ ] Idempotence: `N/A — a dream run is not a repeatable command; it consumes a
      moving watermark and writes a date-stamped report, so a second run is a
      different run by construction.` What this package ships in its place is the
      promotion partition above: a run in which the brain writes nothing
      promotes nothing and changes no vault note.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream-workspace"
npm test -- --test-name-pattern "dream-promote"
npm test
npm run lint
# CLAIM 1 (structural + behavioural) and CLAIM 2a/2b live in the deliverable
# test files, not in a helper of their own. The spec fixes only the test NAME
# here, because a verification command must be runnable; what the tests contain
# is the implementer's.
npm test -- --test-name-pattern "claim-1"
npm test -- --test-name-pattern "claim-2"
# The pipeline no longer pre-commits the user's edits (Table E). This is a
# grep on a file that MUST exist, so guard the absence case first: grep on a
# missing file exits 2, which `!` would turn into a false green.
test -f src/cli/dream.js && ! grep -q "precommitSessionEdits" src/cli/dream.js
```

- The two `claim-` runs and the `precommitSessionEdits` grep are NEW steps and
  each is an ASSERTION: it exits non-zero on failure rather than printing
  something a reader must judge. Paste a real green on the finished state AND a
  real red from a deliberately broken state — one Table B site re-pointed at
  the vault (six times, one site each); a git call added with the workspace as
  cwd; the `precommitSessionEdits` call restored — so a check that cannot fail
  is caught before anyone believes it. Verify each **also** goes red when its
  deliverable is ABSENT.
- **CLAIM 2b is asserted through the git seam, never through a grep.** A source
  grep for a workspace-rooted cwd cannot discriminate: it is green today, green
  on a correct implementation, and green on a broken one that passes the path
  through a variable. Measured during this spec's round zero — the grep this
  section originally carried was green on the unmodified tree, which is the
  same false green the `test -f` rule above exists to prevent, arriving through
  a different door.

## Out of scope (do NOT do these)

- **M9** — repo-local git configuration naming executable programs. Owner-ruled
  open on 2026-08-05, C2's package. This package may not claim it, and the
  validator still runs git in the vault for the commit.
- **C3** — the layout dot-rule and its notice. Table C9's allowlist is a
  directory-and-extension rule, deliberately **not** a dot-rule, so it does not
  step on C3.
- **The residue-lifecycle successor** — the journal schema, crash replay,
  uninstall restore, and a workspace surviving a crash. Table E's abort row is
  narrower and says so.
- **An ADR for the promote-in inversion.** The war-room decision log owns the
  reasoning and this spec cites the rulings; whether the inversion also needs an
  indexed ADR is an owner call, not an implementer's. `docs/adr/0012` is
  amended here only where it states the lifecycle this package changes.
- **`skills/wienerdog-dream/SKILL.md`.** Every path measured in it (`:52` and
  `:115-117` — the two Current state cites, and the only ones this spec checked)
  is either relative to the write root or comes from the prompt, so re-pointing
  the write root re-points them. **The claim is bounded to those two**: if the
  implementer finds a path there which is neither, that is a finding for the PR
  body, not a licence to edit the file — editing it churns the WP-129
  vendored-skill digest, which is a separate cost.
- **The dependency's own contract** — the delta primitive, its binary/text
  equivalence, its `addedLineNumbers` property. This package CONSUMES
  `computeDelta`'s fields and does not re-derive them, which is why the two gaps
  the dependency handed over do not recur here: `addedLineNumbersFromDiff` is
  not exported (measured — `validate.js` exports seven names and not that one),
  and its equality obligation cannot be weakened to a superset; both were the
  dependency's to prove and it proved them (`tests/unit/dream-delta.test.js:816-840`
  is the extraction shape it used). Restating either here is how a proved
  property becomes a drifting copy.
- **Any bound on the baseline's memory** — Table A states why a cap would be
  worse than the cost.
- **The superseded predecessor's Tables C, D and E**
  (`docs/specs/done/WP-dream-gate-inputs-baseline-delta.md`). Tables C, D and E
  here are RECOMPUTED in this package's own terms against the tree at
  `025021f`. Copying a table out of a superseded record is how a dead contract
  comes back to life.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken
   red; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): move the brain into a workspace and promote into the vault (WP-dream-promote-in-workspace)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.

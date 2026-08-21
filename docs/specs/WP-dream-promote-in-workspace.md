---
id: WP-dream-promote-in-workspace
title: Promote approved workspace content into the vault and re-wire the dream pipeline
status: Draft
model: opus
size: M
depends_on: [WP-dream-workspace-retarget, WP-dream-baseline-delta-primitive]
adrs: [ADR-0004, ADR-0012, ADR-0020, ADR-0031, ADR-0034]
epic: audit-2026-07-29
---

# WP-dream-promote-in-workspace: promotion replaces filtering

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — second half of a stacked pair.** This WP and
`WP-dream-workspace-retarget` are one design split along an owner-ruled seam
(logbook: `2026-08-21-dream-promote-in-workspace-split-ruling.md`). Contract
table letters are package-wide: the sibling owns **Tables A, B and F**; this
spec owns **C, D, E and G**. **Table F — what the package's claims actually
establish, measured — lives in the sibling and is CITED here, never restated**
(owner ruling; the pattern is the same as row M2's treatment of the delta
primitive's recipe). This WP is dispatchable only after the sibling is `Done`:
it consumes `createWorkspace`/`destroyWorkspace` and the re-targeted
`spawnBrain`, and it replaces the sibling's transitional call-site argument
with the run's real workspace — the line where the package's claims become
true of the running product.

**Dispatch precondition.** This spec is written against the tree at
`025021fc0fa8f871f1eb960a8ad57a14d223360e` (`025021f`), verified as both `main`
and `origin/main` at authoring time. **The sibling merges before this WP is
dispatched and WILL shift line numbers in `src/core/dream/brain.js` and
`src/cli/dream.js` — the shift is certain, not hypothetical.** Before dispatch,
re-run every `file:line` citation and every measurement below against the tree
the implementer will find (`docs/specs/README.md` → Dispatch-time
re-verification). A citation that does not resolve blocks the dispatch.
**Range citations are checked at BOTH ends.**

Note for the re-verifier: an unmerged branch `wp/dream-write-fence-control-files`
(`7093079`, **not** an ancestor of `main`) carries two Draft specs from the
superseded filter-out design (`WP-dream-fence-candidate-set`,
`WP-dream-denied-object-disposal`). They are recorded, not deleted, and are
superseded by this package's shape. Nothing here depends on them and nothing
here may be merged on top of them.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** (ADR-0012) spawns a
headless AI brain, lets it write notes, and then runs a code validator that
classifies every write, reverts what fails policy, and makes one commit in the
vault. Today that classification derives its evidence from git in the vault —
a namespace that already holds the user's data, written by the brain itself.

The sibling WP inverted the write direction: the system builds a **workspace**,
copies the vault's readable content into it, captures the exact bytes it just
wrote as a **constructed baseline**, and `spawnBrain` takes the workspace as
its write target. What the sibling deliberately did NOT do is flip the running
pipeline — its transitional call-site argument still passes the vault, because
a brain writing into a workspace nothing promotes is an inert product.

This WP completes the inversion. The pipeline builds the workspace, points the
brain at it, classifies the brain's writes against the constructed baseline
using the git-free delta primitive (`src/core/dream/delta.js` — this WP is
`computeDelta`'s first consumer), and **promotes** only approved content into
the vault. Filtering out becomes promoting in.

Two audit findings close here, and each closure names the mechanism that
prevents it rather than the policy that catches it. **M7** (a hostile
`CLAUDE.md` persists in the vault and re-steers later runs,
`docs/security-audit/2026-07-29/CURRENT-IMPLEMENTATION-REVIEW.md:676-752`): the
brain cannot write the vault at all, and promotion admits paths by a positive
allowlist (Table C) rather than denying two known filenames — the file never
comes into existence in the vault. **M10** (the dream writes `.gitignore` and
blinds every gate, `:931-989`): classification is a filesystem walk that never
consults git, so an ignore file has nothing to blind. The mechanism is absent,
not defeated. **M10's closure rests on that git-free classification — never on
any repository-status property of the workspace** (sibling Table F measures
the latter unestablishable); no surface in this spec may attribute it
otherwise.

## Current state

At dispatch the tree also contains the sibling's deliverables; both states are
listed and both are re-verified then.

- From the sibling (cited by contract, line numbers unknowable here):
  `src/core/dream/workspace.js` — `createWorkspace` (copy-in + captured
  baseline + two postconditions, its Table A) and `destroyWorkspace`
  (idempotent, never touches the vault); `spawnBrain` takes `workspaceDir` as
  its write target (its Table B); the single production call site passes the
  vault as a transitional argument, marked for this WP.
- `src/core/dream/validate.js` (1469 lines at `025021f`) — Step 1 scratch
  integrity (`:1107`), Step 2 per-path classification (`:1144`), Step 3 the EP2
  secret gate (`:1211`), Step 4 the dream report (`:1374`), Step 5
  stage-and-commit (`:1411`, whose `git add -A` is at `:1412` — Table E owns
  that call), Step 6 the skill ownership registry (`:1443`). Table D owns what
  each gate's evidence is today and what it becomes. The compare-then-write
  guard this package reuses is at `:884-889`.
- `src/cli/dream.js` — `precommitSessionEdits(vaultDir)` at `:493` followed by
  `assertCleanTree(vaultDir)` at `:494`; `restoreVaultToHead(vaultDir)` at
  `:535` (brain failed/timed out) and `:550` (scratch changed mid-run);
  `runBrainWithWatchdog` at `:137`, whose reap verdict is computed at `:272`
  and **discarded** — the function returns without surfacing it.
- `src/core/dream/delta.js` — `captureBaseline` and `computeDelta`, git-free,
  spawns nothing. The sibling consumes `captureBaseline`; `computeDelta` is
  consumed by nothing until this WP.
- `src/core/layout.js:21-29` — the seven `LAYOUT_KEYS`. `:32-42` — the
  defaults.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/promote.js | three-way decide + merge + promote (Tables C and E) |
| modify | src/core/dream/validate.js | gate inputs and order (Table D); the EP2 enforcement half goes |
| modify | src/cli/dream.js | pipeline rewiring (Table G): the workspace lifecycle, the reap precondition, the abort paths |
| create | tests/unit/dream-promote.test.js | Tables C, D, E and G |
| modify | tests/unit/dream-validate.test.js | the gates' new inputs and order |
| modify | tests/integration/dream.test.js | pipeline wiring and abort behaviour |
| modify | docs/GLOSSARY.md | one canonical name: **promotion** |
| modify | docs/adr/0012-dream-run-lifecycle.md | the lifecycle this package changes |

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

### Exact contracts

```js
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

Activation (ADR-0031, 2-of-7 — five are true): (i) a new module interface
appears; (ii) a promotion outcome taxonomy is introduced; (iv) refusal and
fallback behaviour changes across four gates; (vi) the residue-lifecycle
successor inherits the pipeline contract; (vii) the gate order is mirrored in
`validate.js`, the tests and the dream report.

### Table C — the promotion decision

The three-way state triple per relative path: **baseline** (what the sibling's
copy-in wrote), **after** (the workspace now), **vault-now** (the live vault at
decision time). **Rows C1–C8 are the evaluated conditions**, top to bottom,
first match decides. C9 is the definition C1 refers to, and M1–M3 are mechanics
that apply to whichever row selected them; none of those four is itself a
condition.

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
| M3 | Repository attribute sensitivity | **DISCHARGED here, as the dependency required.** The dependency named this as the successor's obligation. Discharged structurally: classification is `computeDelta`, which is git-free and reads no attributes; the workspace contains no `.git` (sibling Table A, Postcondition 1); and the only git this package runs against workspace content is the merge, under the constructed roots above. There is no path by which a repository attribute reaches a promotion decision |

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
| The dream report | `validate.js:1374` — written into the vault, and brain-writable because it lives in the vault | code-written into the **vault**, after promotion. `reports_dir` is excluded from copy-in (sibling Table A), so it is not in the workspace, not in the baseline, and not a promotion candidate | after promotion | N/A — the brain can no longer reach it. **The report bridge dissolves**, confirmed rather than inherited |

### Table E — the promotion write, and the one new window

| Fact / rule | Value |
|-------------|-------|
| Decide, then write | every path's outcome is decided before **any** vault byte is written. This is what makes Table D's atomicity row enforceable and what keeps a mid-run failure from leaving half a decision applied |
| **The compare→promote window** | the only genuinely new window this direction introduces, and it is milliseconds against today's minutes-long silent window. Closed by conditional write: the last act before publishing a promoted path is to re-read the vault target and compare it byte-for-byte against the `vault-now` bytes the decision used. On a difference the write is **abandoned** and the path becomes refuse-and-report. The repo already contains exactly this guard to copy — `validate.js:884-889`, whose comment states the same reason ("a mid-dream editor save lands here, and overwriting it would destroy the only copy of what the user actually wrote") |
| The publish itself | write to a temporary file beside the target, then `rename` — the same shape as the cited precedent, so the target is never observed half-written |
| Promotion accounting | every path gets exactly one recorded outcome: `promoted`, or `refused` with a reason. The dream report's enforcement section is written from that record. A path with no outcome is a bug, and the acceptance criteria assert the partition |
| `precommitSessionEdits` **does not survive** | measured: its stated job is "so the subsequent dream diff is exactly the brain's writes" (`validate.js:113-115`). Under this package the brain writes nothing in the vault, so there is no such diff, and the three-way compare reads `vault-now` from the **filesystem** rather than from git. What remains is only its cost: it commits the user's in-flight edits under the `wienerdog` identity without asking. It goes, and `assertCleanTree(vaultDir)` (`cli/dream.js:494`) goes with it |
| The dream commit stages **only promoted paths** | consequence of the row above, and not optional: with no pre-commit, `git add -A` (`validate.js:1412`) would sweep the user's uncommitted edits into the dream commit. The commit stages the promoted paths and the code-written report explicitly. ADR-0012's "one dream run = one git commit in the vault" is unchanged — the commit now contains only what the dream promoted, which is strictly closer to what that ADR says |

### Table G — the pipeline: wiring, the reap precondition, the abort paths

| Fact / rule | Value |
|-------------|-------|
| The run's workspace lifecycle | `createWorkspace` runs before the brain is spawned (which is what makes the sibling's capture-before-spawn ordering a pipeline fact, not just a module fact); the sibling's transitional call-site argument is replaced by the run's workspace; after the brain, `computeDelta` then `promote`; `destroyWorkspace` on every exit path (exception below). **This is the line where the sibling's CLAIM 1 becomes true of the running product**, and the acceptance criteria re-assert its composed-argv form at pipeline level |
| **The reap precondition** | `computeDelta` runs on the workspace only after the brain's process group is **verifiably** empty. `runBrainWithWatchdog` (`cli/dream.js:137`) already computes that verdict at `:272` — `reapGroupFn(...)` returning `{reaped:true}` — and today **discards it**; on `{reaped:false}` it retains the pidfile for run-job's backstop and returns anyway. This package surfaces the verdict and **refuses the run fail-closed** on anything but a verified reap, rather than walking a workspace a surviving process can still mutate. This converts the dependency's explicitly-unverified hypothesis (2) into an enforced precondition (sibling Table F), and it is what keeps the Codex arm's in-workspace shell from mattering to the walk |
| Teardown wiring | the workspace is removed on every exit path — success, refusal, brain failure, timeout — **with one named exception: a run that refused because the reap was not verified does NOT tear down.** Removing a tree a surviving process may still be writing is not a cleanup, and the row above is the whole reason that state is distinguishable. Teardown never touches the vault. A workspace left behind by that refusal, or by a crash, is the residue-lifecycle successor's subject, not this package's |
| **The abort paths change, and leaving them would be a data-loss regression** | `restoreVaultToHead` (`validate.js:139-149` — `reset --hard` + `clean -fd`) is called at `cli/dream.js:535` and `:550`. Both mean "discard the brain's unvalidated writes". Under this package the brain wrote nothing in the vault, so there is nothing to discard — and with `precommitSessionEdits` gone, a `reset --hard` there would destroy **all** of the user's uncommitted work for a failure that never touched the vault. Both call sites become `destroyWorkspace`. `restoreVaultToHead` itself is left in place and exported: **the intent brief routed the abort paths to the residue-lifecycle successor, and this row is narrower than that** — it changes only which function the two sites call, not the crash-replay, journal or uninstall-restore subject |

### Mirrored Surface Checklist

- [ ] Deliverables-table `Notes` cells (each cites its owning table)
- [ ] `### Exact contracts`' signature and its return shape
- [ ] Acceptance criteria that assert Tables C–E and G
- [ ] Verification steps (the assertions mirror Tables C–E and G)
- [ ] Current-state description (the validator's steps, the discarded reap
      verdict, the sibling's handed-over state)
- [ ] Implementation notes (the merge-on-a-copy trap, the existing reap verdict)
- [ ] Out of scope (what the residue-lifecycle successor and C2 own)
- [ ] **The package note and the dispatch-precondition block** — the note
      mirrors the pair's table-letter division and the Table F citation rule;
      the dispatch block mirrors the pinned base and the certain line-number
      shift. A finding that changes either updates this section too
- [ ] **Every surface that states what a claim establishes** — the Context
      paragraph, rows M3 and G, the Security checklist, and the acceptance
      criteria. **No surface may say the workspace is not a git repository
      without qualification, none may attribute M10's closure to any
      repository-status property (sibling Table F), and none may restate
      Table F's content instead of citing it.**

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing outlives the job.
- **Merge on a copy — the trap, measured.** `git merge-file` mutates its first
  operand in place on conflict. The obvious shape (merge the vault note against
  the workspace note) leaves conflict markers in the user's live file on exactly
  the path where refuse-and-report promised not to touch it.
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
- [ ] **The dependency's caller invariant is discharged across the pair, and
      sibling Table F says how.** The pre-brain walks are the sibling's, run
      before any actor exists; the post-brain walk is this WP's and runs only
      after a verified reap (Table G). **No surface may claim the walk
      establishes containment.**
- [ ] The merge's git invocation is a security decision and takes the
      dependency's constructed-environment discipline (Table C, row M2). Named
      residual, inherited and not closed: executable-identity influence at a
      verified absolute path.
- [ ] Named residual: on the Codex arm the brain can run shell inside the
      workspace (sibling Table F). This package does not close that and does
      not claim to; the reap precondition (Table G) is what keeps it from
      mattering to the walk.

## Acceptance criteria

- [ ] **CLAIM 1 at pipeline level, structurally.** In a production-shaped run,
      the composed argv and child env handed to either harness contain no
      element equal to, and no element containing, the vault path. Proven RED
      by restoring the sibling's transitional vault argument at the call site.
- [ ] **CLAIM 1 at pipeline level, behaviourally.** A full dream run against a
      fake brain that deliberately attempts a vault write leaves the vault
      **byte-identical** to its pre-run state on every path except promotion's
      own writes, on both harness paths.
- [ ] **CLAIM 2b.** No product code invokes git with a cwd at or beneath the
      workspace root: asserted by a test that substitutes the git seam and fails
      if it is ever called with such a cwd. Proven RED by a deliberate git call
      from the workspace. **A test asserting the workspace "is not a git
      repository" is asserting something sibling Table F measures to be
      unestablishable — the criterion is the cwd assertion, not a repository
      probe.**
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
      Proven green on a verified reap. The refusing run does NOT tear down the
      workspace (Table G's exception); every other exit path does.
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
npm test -- --test-name-pattern "dream-promote"
npm test -- --test-name-pattern "dream-validate"
npm test
npm run lint
# The pipeline no longer pre-commits the user's edits (Table E). This is a
# grep on a file that MUST exist, so guard the absence case first: grep on a
# missing file exits 2, which `!` would turn into a false green.
test -f src/cli/dream.js && ! grep -q "precommitSessionEdits" src/cli/dream.js
```

- The `precommitSessionEdits` grep is a NEW step and an ASSERTION: it exits
  non-zero on failure rather than printing something a reader must judge. Paste
  a real green on the finished state AND a real red from a deliberately broken
  state — the sibling's transitional vault argument restored at the call site;
  a git call added with the workspace as cwd; the `precommitSessionEdits` call
  restored — so a check that cannot fail is caught before anyone believes it.
  Verify each **also** goes red when its deliverable is ABSENT.
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
  uninstall restore, and a workspace surviving a crash. Table G's abort row is
  narrower and says so.
- **An ADR for the promote-in inversion.** The war-room decision log owns the
  reasoning and this spec cites the rulings; whether the inversion also needs an
  indexed ADR is an owner call, not an implementer's. `docs/adr/0012` is
  amended here only where it states the lifecycle this package changes.
- **`skills/wienerdog-dream/SKILL.md`** — the sibling's Out of scope owns the
  bounded claim and the reason; nothing here changes it.
- **The sibling's contract** — the workspace module, the constructed baseline,
  the six re-target sites, Table F. This WP CONSUMES them and cites them;
  restating a proved property is how it becomes a drifting copy.
- **The dependency's own contract** — the delta primitive, its binary/text
  equivalence, its `addedLineNumbers` property. This package CONSUMES
  `computeDelta`'s fields and does not re-derive them, which is why the two gaps
  the dependency handed over do not recur here: `addedLineNumbersFromDiff` is
  not exported (measured — `validate.js` exports seven names and not that one),
  and its equality obligation cannot be weakened to a superset; both were the
  dependency's to prove and it proved them (`tests/unit/dream-delta.test.js:816-840`
  is the extraction shape it used). Restating either here is how a proved
  property becomes a drifting copy.
- **The superseded predecessor's Tables C, D and E**
  (`docs/specs/done/WP-dream-gate-inputs-baseline-delta.md`). Tables C, D and E
  here are RECOMPUTED in this package's own terms against the tree at
  `025021f`. Copying a table out of a superseded record is how a dead contract
  comes back to life.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken
   red; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): promote approved workspace content into the vault (WP-dream-promote-in-workspace)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.

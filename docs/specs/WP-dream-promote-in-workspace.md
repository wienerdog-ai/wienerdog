---
id: WP-dream-promote-in-workspace
title: Rewire the dream pipeline onto the workspace and promotion
status: Draft
model: opus
size: M
depends_on: [WP-dream-workspace-retarget, WP-dream-vault-write-primitive, WP-dream-baseline-delta-primitive, WP-dream-promote-module]
adrs: [ADR-0004, ADR-0012, ADR-0020, ADR-0031, ADR-0034]
epic: audit-2026-07-29
---

# WP-dream-promote-in-workspace: the pipeline where promotion replaces filtering

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — the pipeline half of the promote split.** This WP and
`WP-dream-promote-module` are one design, split along the seam the owner ruled
at the PR-review gate (logbook:
`2026-08-21-dream-promote-pair-review-rounds.md`, "Owner ruling on the
verdicts"): **Tables C, D, E and R became the `promote.js` package, shipped
consumed by nothing; Table G — this spec — became the pipeline package.** The
split's input record is `2026-08-28-promote-split-inputs.md` and the split's own
decisions are recorded in `2026-08-28-promote-split.md`.

**Contract table letters are family-wide, across four packages.**
`WP-dream-workspace-retarget` owns **Tables A, B and F**;
`WP-dream-vault-write-primitive` owns **Table H**; `WP-dream-promote-module`
owns **C, D, E and R**; this spec owns **G**. Every cross-package reference
CITES its owner and never restates it — the pattern the family already uses for
Table F and for the delta primitive's constructed-environment recipe.

**This is the package where the family's claims become true of the running
product.** The three modules it consumes all shipped consumed by nothing:
`workspace.js` builds a workspace no pipeline uses yet, `vault-write.js`
publishes for no caller, `promote.js` decides for no run. This WP replaces the
sibling's transitional `spawnBrain` argument with the run's real workspace,
classifies what the brain wrote with `computeDelta`, hands it to `promote()`,
and makes the dream commit from what promotion returned. **It also discharges
the two HANDOFF rows `WP-dream-promote-module` states and does not itself
satisfy:** extracting the four real gates into their Table D input shape (and
removing the EP2 enforcement half from `validate.js`), and Table E's rule that
the commit carries the DECIDED bytes.

## Dispatch precondition

**Written against the tree at `36c2ce51562aadb3eea83ccfe51a40bc728d9680`
(`36c2ce5`), verified as both `main` and `origin/main` at authoring time.**
Three of the four dependencies are `Done` on that tree; `WP-dream-promote-module`
is not yet built, and **this WP is dispatchable only after it is `Done`** — it
consumes `promote()` and its return shape. That package's Deliverables exclude
both files this spec cites by line, so its merge should shift nothing here —
**"should" is why the re-verification below is not optional**, and any other
merge landing in the same window shifts them for real. Before dispatch, re-run
every `file:line` citation and
every measurement below against the tree the implementer will find
(`docs/specs/README.md` → Dispatch-time re-verification). A citation that does
not resolve blocks the dispatch. **Range citations are checked at BOTH ends.**

**Containment semantics are stated by CITATION, and no surface here paraphrases
a path-containment rule (owner ruling, 2026-08-28).** The shipped truth is
kernel-faithful resolution plus `(dev, ino)` identity. It is owned by **Table H**
(`docs/specs/done/WP-dream-vault-write-primitive.md`, rows H1 and H2) and
implemented in `src/core/dream/vault-write.js` and `src/core/dream/workspace.js`
(`isAtOrBeneath`, exported). The reason this is a ruling rather than a
preference is recorded in `memory/lessons/inbox.md` under
`WP-dream-workspace-retarget`: **every string answer to "is this path inside
that directory" is wrong**, and eleven review rounds went into the answer that
holds. Re-deriving it in prose is how those eleven rounds get paid for twice.
**This package writes no containment check of its own**; the two it depends on
are already shipped and exported.

Note for the re-verifier: the superseded filter-out design
(`WP-dream-fence-candidate-set`, `WP-dream-denied-object-disposal`, and their
two parent specs) is filed in `docs/specs/done/` as `Superseded`, with its round
records in the logbook. Nothing here depends on it and nothing here may build on
it.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** (ADR-0012) spawns a
headless AI brain, lets it write notes, and then runs a code validator that
classifies every write, reverts what fails policy, and makes one commit in the
vault. Today that classification derives its evidence from git in the vault — a
namespace that already holds the user's data, written by the brain itself.

Three packages have already built the replacement, and none of them is wired in.
`WP-dream-workspace-retarget` builds the **workspace** (a private copy of the
vault's readable content, plus a **constructed baseline** of the exact bytes it
just wrote) and re-targets `spawnBrain` at it — but its production call site
still passes the vault as a transitional argument, because a brain writing into
a workspace nothing promotes is an inert product.
`WP-dream-vault-write-primitive` built `writeIntoVault`, the one sanctioned way
to put a content file into the vault. `WP-dream-promote-module` built
`promote()`, which decides per path what happens and publishes what survives.

**This WP is the wiring, and it is the line where the inversion becomes real.**
The run builds the workspace, points the brain at it, waits for a verified reap,
classifies the brain's writes against the constructed baseline with the git-free
delta primitive, promotes what policy admits, commits exactly that, and tears
the workspace down. Everything the old direction needed in the vault —
pre-committing the user's edits so the diff would be clean, reverting the
brain's unvalidated writes on failure, deriving gate evidence from git — either
has no subject any more or becomes a data-loss regression if left in place.

One audit finding closes with this package's mechanism, and the closure names
the mechanism rather than the policy. **M10** (the dream writes `.gitignore` and
blinds every gate,
`docs/security-audit/2026-07-29/CURRENT-IMPLEMENTATION-REVIEW.md:931-989`):
classification is a filesystem walk that never consults git, so an ignore file
has nothing to blind. The mechanism is absent, not defeated. **M10's closure
rests on that git-free classification — never on any repository-status property
of the workspace** (sibling Table F measures the latter unestablishable); no
surface in this spec may attribute it otherwise. **M7** closes with the
promotion allowlist and is `WP-dream-promote-module`'s to claim, not this one's.

## Current state

- **From `WP-dream-promote-module` (its `Done` spec is the contract; the
  implementer reads the shipped signature from the code by path):**
  `src/core/dream/promote.js` exports `promote(o)`. It is required by nothing
  and called by nothing on the tree this WP starts from.
- **From `WP-dream-workspace-retarget`, shipped:**
  `src/core/dream/workspace.js` exports `createWorkspace`, `destroyWorkspace`
  and `isAtOrBeneath`. `spawnBrain` (`src/core/dream/brain.js:384`) takes
  `workspaceDir` as its write target; **its `vaultDir` option is REQUIRED and is
  explicitly NOT a write target** — it exists so the vault can be kept out of the
  child (PATH sanitising and the allowlisted-value refusal), it must be the
  vault the RUN uses (`cfg.vault`), and it throws when absent. **The shipped
  JSDoc at `brain.js:352-383` is the canonical statement of that option set and
  is CITED, not restated here** — the pre-split spec froze an option set that the
  implementation then had to violate, and that gap is what this citation closes.
  The single production call site opens at `src/cli/dream.js:153` and passes the
  vault as the transitional write target on `:159` (`workspaceDir: vaultDir`),
  marked for this WP in the comment above it.
- **From `WP-dream-vault-write-primitive`, shipped:**
  `src/core/dream/vault-write.js` (481 lines) exports `writeIntoVault`. This
  package calls it nowhere — `promote()` is the only caller — and cites it only
  for Table H's rules.
- `src/core/dream/delta.js` — `captureBaseline` and `computeDelta`, git-free,
  spawns nothing. **`computeDelta` has no consumer on this tree; this package is
  the first to call it.**
- `src/core/dream/validate.js` (1469 lines) — Step 1 scratch integrity
  (`:1107`), Step 2 per-path classification (`:1144`), Step 3 the EP2 secret gate
  (`:1211`), Step 4 the dream report (`:1374`), Step 5 stage-and-commit
  (`:1411`, whose `git add -A` is at `:1412`), Step 6 the skill ownership
  registry (`:1443`). The four gates live inside Steps 2 and 3:
  `ledgerViolation` (`:1156`), `skillBodyViolation` (`:1187`), `tier3Decision`
  (`:1194`), and the EP2 gate itself, whose redact arm is at `:1269-1291`, whose
  separate counters are at `:1064-1072`, whose unscannable-binary refusal is at
  `:1239-1255`, and whose **enforcement half — the revert core — is at
  `:1324-1364`**. `precommitSessionEdits`' stated job is at `:113-115`;
  `restoreVaultToHead` (`reset --hard` + `clean -fd`) is at `:139-149`. The
  module exports exactly seven names (measured:
  `validateAndCommit parseFrontmatter assertGitRepo assertCleanTree
  precommitSessionEdits restoreVaultToHead scrubAddedLines`) and none of the
  four gates is among them.
- `src/cli/dream.js` (646 lines) — `precommitSessionEdits(vaultDir)` at `:507`
  followed by `assertCleanTree(vaultDir)` at `:508`; a SECOND
  `assertCleanTree(vaultDir)` at `:251` is the unknown-command non-vacuity guard
  (its marker branch opens at `:224`), a distinct consumer that does not go with
  the precommit; `restoreVaultToHead(vaultDir)` at `:549` (brain failed/timed
  out) and `:564` (scratch changed mid-run); `runBrainWithWatchdog` at
  `:139-296`, whose reap verdict is computed at `:286` **inside `if (pidfile)`
  (`:270`)** and consumed only to gate the pidfile unlink; `pidfile` is `null`
  on a tokenless manual run (`:163-166`), so the verdict is absent there.
  **Measured: the function has no `return` statement at all, its single caller
  discards its value (`:524`), and it decides the unknown-command abort itself
  at `:224-266`** — so neither signal row G2 and row G3 need is available to the
  caller today. The transcript-advance that consumes today's `secretReverts`
  signal is at `:582-610`.
- `src/core/reap.js:25-33` states that the leaderless-reparented-member
  guarantee is POSIX-only this release; `:505-519` is the win32 branch, which
  returns `{reaped:false}` whenever `taskkill` cannot reach an already-exited
  leader.
- `docs/adr/0012-dream-run-lifecycle.md` — the accepted lifecycle this package
  changes.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/dream.js | the whole of Table G: workspace lifecycle, the re-pointed write target, delta, promote, the reap precondition, non-vacuity, transcript-advance, abort paths, the commit |
| modify | src/core/dream/validate.js | the gate-extraction handoff (Table G, row G7): the four gates become injectable in the input shape `WP-dream-promote-module`'s Table D assigns them; the EP2 enforcement half (`:1324-1364`) and the git-derived evidence go |
| create | tests/unit/dream-pipeline.test.js | Table G, and pipeline-level CLAIM 1 and CLAIM 2b |
| modify | tests/unit/dream-validate.test.js | the gates' new inputs and the removed enforcement half |
| modify | tests/integration/dream.test.js | pipeline wiring and abort behaviour |
| modify | docs/adr/0012-dream-run-lifecycle.md | the lifecycle this package changes |

**Not in this package, and the exclusions are load-bearing.**
`src/core/dream/promote.js`, `src/core/dream/vault-write.js`,
`src/core/dream/workspace.js`, `src/core/dream/delta.js` and
`src/core/reap.js` are all CONSUMED and none is modified.
`docs/GLOSSARY.md` is `WP-dream-promote-module`'s (the name **promotion**).

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

### Exact contracts

This package introduces no new module interface. The two it consumes are stated
by their owners and read from the code by path at dispatch:
`promote(o)` in `WP-dream-promote-module`'s `### Exact contracts`, and
`spawnBrain(o)` in the shipped JSDoc at `src/core/dream/brain.js:352-383`
(Current state). **The one contract this package itself changes is
`runBrainWithWatchdog`'s return**, because BOTH of the run's post-settle signals
are currently trapped inside it:

```js
/** Today this function returns NOTHING — measured, there is no `return`
 *  statement anywhere in its body (`cli/dream.js:139-296`), and its single
 *  caller discards the value (`:524`). It also decides the unknown-command
 *  abort itself, at `:224-266`, from a `result` local. Table G needs both
 *  signals in the caller, so both are surfaced:
 *  @returns {Promise<{sawUnknownCommand:boolean,
 *                     reap:{verified:boolean, why?:string}}>}
 *    sawUnknownCommand  the brain's rejection marker. **The abort DECISION
 *          moves out of this function to its caller (row G3)**, because the
 *          second half of that decision — an empty workspace delta — is not
 *          known until the brain has settled and the walk has run, which is the
 *          caller's ground and not this function's. Its two other aborts stay
 *          here: a non-zero brain exit and the watchdog timeout each rest on
 *          evidence this function already holds
 *    reap  the post-settle reap verdict, computed on EVERY run — tokenized
 *          scheduler run and tokenless manual run alike (row G2) — and
 *          surfaced rather than discarded. Today it is computed at `:286`
 *          INSIDE `if (pidfile)` (`:270`) and consumed only to gate the
 *          pidfile unlink. `verified:false` and an ABSENT verdict are the same
 *          thing to the caller: unverified, refuse fail-closed */
async function runBrainWithWatchdog(o)
```

## Contract reference

Activation (ADR-0031, 2-of-7 — four are true): (ii) a run-abort outcome
taxonomy changes; (iv) refusal, fallback and precondition behaviour changes
across the run's exit paths; (v) this package emits the run's decisions but
`WP-dream-promote-module` owns their interpretation; (vi) the residue-lifecycle
successor inherits the pipeline contract.

### Table G — the pipeline: wiring, the reap precondition, and the abort paths

| # | Fact / rule | Value |
|---|-------------|-------|
| G1 | The run's workspace lifecycle | `createWorkspace` runs before the brain is spawned (which is what makes the sibling's capture-before-spawn ordering a pipeline fact, not just a module fact); the sibling's transitional call-site argument (`cli/dream.js:159`) is replaced by the run's workspace; after the brain, `computeDelta` then `promote`; `destroyWorkspace` on every exit path (exception in G5). **This is the line where the sibling's CLAIM 1 becomes true of the running product**, and the acceptance criteria re-assert its composed-argv form at pipeline level. `createWorkspace` throws rather than returning on a failed build, and removes what it had built — so no exit path here can reach a partial tree, and none may try |
| G2 | **The reap precondition** | `computeDelta` runs on the workspace only after the brain's process group is **verifiably** empty. `runBrainWithWatchdog` (`cli/dream.js:139`) computes a reap verdict at `:286` — `reapGroupFn(...)` returning `{reaped:true}` — and today consumes it only to gate the pidfile unlink, never surfacing it to its caller. **Measured caveat: that verdict is computed INSIDE `if (pidfile)` (`:270`), and `pidfile` is `null` on a tokenless manual `wienerdog dream` (`:163-166`) — so on a standalone success the verdict is not merely discarded, it is ABSENT.** This package therefore requires an **unconditional post-settle reap verdict** — computed on every run, tokenized scheduler run and tokenless manual run alike — surfaced to the caller (`### Exact contracts`), and it **refuses the run fail-closed** on anything but a verified reap, rather than walking a workspace a surviving process can still mutate. A missing verdict is treated as unverified, never as success. This converts the dependency's explicitly-unverified hypothesis into an enforced precondition (sibling Table F), and it is what keeps a live actor from mutating the workspace during the walk. **PLATFORM-SCOPED, and the scope is the repo's own:** `src/core/reap.js:25-33` states that the leaderless-reparented-member guarantee is POSIX-only this release, and `:505-519` shows the win32 branch returning `{reaped:false}` whenever `taskkill` cannot reach an already-exited leader — so a fail-closed rule keyed on a verified group reap would refuse NORMAL Windows runs. On win32 the precondition is therefore satisfied by the brain leader's verified exit plus the existing tree-kill attempt, and **the leaderless-member residual is named, not solved: it is `WP-a10-windows-reap`'s subject**, the package the primitive's own platform note already defers it to. `src/core/reap.js` is in no Deliverables table here and is not modified |
| G3 | **The unknown-command non-vacuity signal** | today the "the brain did not run — the CLI rejected the trigger prompt" abort keys off vault-cleanliness (`cli/dream.js:251`, `assertCleanTree`, inside the marker branch that opens at `:224`), sound only because the tree was asserted clean immediately before spawn — the premise `precommitSessionEdits` supplied and G6 removes. Under this package the brain writes the WORKSPACE, so the non-vacuity evidence moves there: a genuine rejection produced an EMPTY workspace delta (the brain did no work), so the abort keys off `sawUnknownCommand` AND an empty `computeDelta` result, never off the vault. **The abort DECISION therefore moves out of `runBrainWithWatchdog` (`:224-266`) into its caller**, which is the only place both halves of it are known; the marker is surfaced instead (`### Exact contracts`). The function's other two aborts — a non-zero brain exit, the watchdog timeout — stay where they are. **This is why the pipeline calls `computeDelta` and hands the result to `promote()` rather than letting the module compute it (split decision, `2026-08-28-promote-split.md`): the run needs that result for a decision `promote()` is not making, and computing it twice would let the two answers disagree.** A run that emitted the marker but DID write the workspace proceeds into promotion, exactly as today's guard let a writing run proceed into validation. The vault's cleanliness is no longer evidence of anything the brain did |
| G4 | **The pipeline consumes EP2's disposition** | `promote()` returns a typed EP2 disposition summary (its `### Exact contracts`), and the pipeline's transcript-advance consumes it the way today's `secretReverts` signal does (`cli/dream.js:582-610`): a transcript whose only note was **WITHHELD** for a secret is NOT marked processed, so it regenerates next run rather than being silently lost. **A REDACTED note does NOT defer** — measured canonical semantics (`validate.js:1064-1072`: redacted files "consumed their transcripts normally and MUST NOT defer, which is why they are counted separately and never enter `reverted[]`"): the sanitized note WAS promoted, so its transcript was consumed and regenerating it would re-do consumed work and mint a second quarantine artifact. `redactions` is an accounting and reporting field, never a deferral trigger. **The pipeline reads the typed fields, never a human-readable refusal reason — parsing prose would be an undocumented security interface.** A refusal for a NON-secret reason (allowlist, conflict) advances the transcript normally |
| G5 | Teardown wiring | the workspace is removed on every exit path — success, refusal, brain failure, timeout — **with one named exception: a run that refused because the reap was not verified (G2) does NOT tear down.** Removing a tree a surviving process may still be writing is not a cleanup, and G2 is the whole reason that state is distinguishable. Teardown never touches the vault. A workspace left behind by that refusal, or by a crash, is the residue-lifecycle successor's subject, not this package's |
| G6 | **`precommitSessionEdits` does not survive, and one of its two neighbours must be re-based** | measured: its stated job is "so the subsequent dream diff is exactly the brain's writes" (`validate.js:113-115`). Under this package the brain writes nothing in the vault, so there is no such diff, and `promote()`'s three-way compare reads `vault-now` from the **filesystem** rather than from git. What remains is only its cost: it commits the user's in-flight edits under the `wienerdog` identity without asking. The call at `cli/dream.js:507` goes, and the `assertCleanTree(vaultDir)` at `:508` — its precommit-pairing use — goes with it. **The SECOND consumer of `assertCleanTree` does NOT go and must be re-based: G3 owns it.** `cli/dream.js:251` uses vault-cleanliness to tell a genuine brain rejection from a working run, and that signal's premise (the tree was clean immediately before spawn) is exactly what removing the precommit destroys |
| G7 | **The gate-extraction handoff, discharged here** | `WP-dream-promote-module`'s Table D states what `promote()` does with the four gates it is HANDED, and names the extraction as this package's. Discharged here: the four gates become functions this pipeline can inject — the EP2 gate returning the ADR-0034 taxonomy, the other three returning `reason\|null` — each taking the input `WP-dream-promote-module`'s Table D assigns it, none consulting git. **`validate.js`'s EP2 enforcement half goes with them:** the revert core at `:1324-1364` reverts, re-stages and drops index entries for bytes that, under promotion, were never written to the vault, so it has no subject. **What survives the removal is the redact DISPOSITION, on the promotion side rather than the revert side** — Table D's EP2 row is the owner of that distinction and this row does not restate it. **The gates' semantics are not this package's to change**: the extraction moves where their evidence comes from, per that Table D, and nothing else |
| G8 | **The dream commit, and the staged-bytes handoff discharged here** | `WP-dream-promote-module`'s Table E states the rule and names it as this package's to satisfy: the commit contains **only promoted paths, and the DECIDED bytes**. First: with no pre-commit (G6), a wholesale stage would sweep the user's uncommitted edits into the dream commit, so the commit carries the promoted paths and the report, and nothing else — which is also what keeps a staging object surviving a primitive refusal (Table H, H7) out of it. Second: **naming the path is not enough** — staging re-reads the working tree, so a user save landing between the publish and the staging call is what enters the commit, ungated. Measured: with a save in that gap, `git add -- <path>` stages the user's post-publish bytes. **The committed content must therefore be the bytes `promote()` returned, not a fresh read of the path.** **How that is achieved is the implementer's — round-4 CUT ruling.** ADR-0012's "one dream run = one git commit in the vault" is unchanged. **The user's post-publish save remains as an uncommitted working-tree modification**: it is not committed and it is not discarded |
| G9 | **The abort paths change, and leaving them would be a data-loss regression** | `restoreVaultToHead` (`validate.js:139-149` — `reset --hard` + `clean -fd`) is called at `cli/dream.js:549` and `:564`. Both mean "discard the brain's unvalidated writes". Under this package the brain wrote nothing in the vault, so there is nothing to discard — and with `precommitSessionEdits` gone (G6), a `reset --hard` there would destroy **all** of the user's uncommitted work for a failure that never touched the vault. Both call sites become `destroyWorkspace`. `restoreVaultToHead` itself is left in place and exported: this row changes only which function the two sites call, not the crash-replay, journal or uninstall-restore subject, which is the residue-lifecycle successor's |

### Mirrored Surface Checklist

- [ ] Deliverables-table `Notes` cells (each cites its owning row or table)
- [ ] `### Exact contracts`' `runBrainWithWatchdog` return shape (row G2)
- [ ] Acceptance criteria that assert Table G's rows
- [ ] Verification steps (the assertions mirror Table G)
- [ ] Current-state description (the validator's steps and four gates, the
      discarded reap verdict, the two `assertCleanTree` consumers, the shipped
      `spawnBrain` option set)
- [ ] Implementation notes (the existing reap verdict, the second
      `assertCleanTree` consumer)
- [ ] Out of scope (what `WP-dream-promote-module`, the residue-lifecycle
      successor, `WP-a10-windows-reap` and audit finding C2 own)
- [ ] **The package note and the dispatch-precondition block** — the note
      mirrors the four-package table-letter division and the two discharged
      handoffs; the dispatch block mirrors the pinned base and the containment
      citation. A finding that changes either updates this section too
- [ ] **The containment-by-citation rule** — the dispatch block and the Security
      checklist. **No surface here may paraphrase a path-containment rule, and
      this package writes no containment check.**
- [ ] **Every surface that states what a claim establishes** — the Context
      paragraph, rows G1 and G2, the Security checklist, and the acceptance
      criteria. **No surface may say the workspace is not a git repository
      without qualification, none may attribute M10's closure to any
      repository-status property (sibling Table F), none may restate Table F's
      content instead of citing it, and none may claim M7 (it is
      `WP-dream-promote-module`'s).**
- [ ] **The EP2 disposition taxonomy** — row G4 and the transcript-deferral
      acceptance criterion. **No surface may reduce EP2 to `reason|null`, drop
      the `redacted` outcome, or make `redactions` defer a transcript.**
- [ ] **The two discharged HANDOFF rows** — G7 (gate extraction) and G8 (staged
      bytes). Both name `WP-dream-promote-module` as the owner of the rule and
      this package as the discharger, in the package note, the Deliverables
      Notes cells, the rows themselves and their acceptance criteria
- [ ] **The reap precondition's platform scope** — row G2, row G5's exception,
      the Security checklist, the acceptance criteria. **No surface may state a
      platform-blind fail-closed rule, which would refuse normal Windows runs.**

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing outlives the job.
- **The reap verdict already exists** (`cli/dream.js:286`) and is discarded.
  Surfacing it is a return-value change, not new machinery — resist rebuilding a
  reap check beside the one that is already there. What IS new is making it
  unconditional (row G2).
- **`assertCleanTree` has two consumers and they are not the same consumer.**
  Removing `precommitSessionEdits` removes one of them (`:508`) and destroys the
  PREMISE of the other (`:251`). Row G6 says which is which; deleting both, or
  neither, are both wrong.
- **Do not build a containment check.** The one rule the family has is the
  primitive's, and it took eleven review rounds — see the Dispatch precondition.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] **The dependency's caller invariant is discharged across the family, and
      sibling Table F says how.** The invariant, stated so the reader knows what
      is being discharged: no untrusted actor may replace the root entry, or any
      ancestor or directory entry used to reach an enumerated path, for the
      duration of each walk. The pre-brain walks are the sibling's, and they are
      **NOT discharged by ordering alone — the two walks differ:**
      `captureBaseline` reads the run-built workspace under the 0700 private
      core, where nothing else writes, and is genuinely actorless; **copy-in
      reads the LIVE vault**, where no untrusted actor exists but the user's
      editor or synchroniser is a benign concurrent writer, and it is discharged
      only through the sibling's three layers (its Table A). **The post-brain
      walk is this WP's and runs only after a verified reap (row G2). No surface
      may claim the walk establishes containment.**
- [ ] **The reap precondition is a security control, and it is fail-closed and
      platform-scoped** (row G2). An absent verdict is unverified. A
      platform-blind rule would refuse every normal Windows run, which is the
      product not running — the same severity as the gap it was meant to close.
- [ ] **The refusing run does not tear down** (row G5). Removing a tree a
      surviving process may still be writing is not a cleanup.
- [ ] **The abort paths must not destroy user work** (row G9). With
      `precommitSessionEdits` gone, `reset --hard` in the vault on a failure
      that never touched the vault destroys all of the user's uncommitted work.
- [ ] **The pipeline reads typed fields, never prose** (row G4). Parsing a
      human-readable refusal reason to decide a transcript's fate would be an
      undocumented security interface.
- [ ] Containment and vault-write discipline are the primitive's (Table H),
      applied by it and cited here. **This package writes no vault content
      byte** — `promote()` is the only writer — and it implements no path
      containment of its own.

## Acceptance criteria

- [ ] **CLAIM 1 at pipeline level, structurally.** In a production-shaped run,
      the composed argv and child env handed to either harness contain no
      element equal to, and no element containing, the vault path. Proven RED
      by restoring the sibling's transitional vault argument at the call site.
- [ ] **CLAIM 1 at pipeline level, behaviourally.** A full dream run against a
      fake brain that deliberately attempts a vault write leaves the vault
      **byte-identical** to its pre-run state on every path except promotion's
      own writes, on both harness paths.
- [ ] **CLAIM 2b, product-wide.** No product code invokes git with a cwd at or
      beneath the workspace root, over a whole run: asserted by a test that
      substitutes the git seam and fails if it is ever called with such a cwd.
      Proven RED by a deliberate git call from the workspace. **A test asserting
      the workspace "is not a git repository" is asserting something sibling
      Table F measures to be unestablishable — the criterion is the cwd
      assertion, not a repository probe.** This is the pipeline-wide form the
      sibling deferred; `WP-dream-promote-module` asserts the same rule for its
      merge seam alone.
- [ ] **M10's mechanism.** A workspace containing a self-hiding `.gitignore`
      (`*`) and a payload file yields a delta record for the payload — the
      classification is unaffected. This is the criterion that pins the closure
      to the git-free walk rather than to the workspace's repository status.
- [ ] **The reap precondition, both run types and per platform (row G2).** With
      the reap verdict forced to `{reaped:false}` on a POSIX run, the run
      refuses fail-closed and no delta walk runs. Proven green on a verified
      reap. Asserted on BOTH a tokenized scheduler run and a tokenless manual
      run — on the latter, an ABSENT verdict is treated as unverified (refuse),
      not as success. **On win32 an ordinary successful run — leader exited,
      `taskkill` unable to reach it — is NOT refused**, which is the case a
      platform-blind rule breaks. The refusing run does NOT tear down the
      workspace (row G5); every other exit path does.
- [ ] **The unknown-command non-vacuity signal (row G3).** A run whose brain
      emits the unknown-command marker and writes NOTHING to the workspace
      aborts as "brain did not run" and advances no transcript ledger; a run
      that emits the marker but DID write the workspace proceeds into promotion.
      The decision keys off the empty workspace delta, not vault cleanliness —
      asserted with a dirty vault present, which must not change the outcome.
- [ ] **The pipeline defers a secret-WITHHELD transcript, and only that (row
      G4).** A fresh transcript whose only note EP2 withholds is NOT marked
      processed — it regenerates on the next run. A transcript whose only note
      was REDACTED **IS** marked processed (the sanitized note was promoted, so
      the transcript was consumed) — asserted as its own case, because inverting
      it re-does consumed work and mints a second quarantine artifact. Both
      asserted through `secretDisposition`, never a parsed reason. A non-secret
      refusal advances the transcript.
- [ ] **`precommitSessionEdits` is gone and the second `assertCleanTree`
      consumer is re-based (row G6).** The pipeline no longer pre-commits the
      user's edits, and the unknown-command guard still discriminates a genuine
      rejection from a working run without reading the vault. Proven RED against
      an implementation that deletes both `assertCleanTree` uses, which makes
      the non-vacuity guard vacuous.
- [ ] **The gates keep their meaning after extraction (row G7).** Each extracted
      gate returns the same verdict for the same content as its pre-extraction
      form, judged on the input `WP-dream-promote-module`'s Table D assigns it and
      consulting no git; and
      the EP2 enforcement half is gone. Proven RED by an extraction that hands a
      post-merge gate the pre-merge bytes, and separately by one that leaves the
      revert core reachable.
- [ ] **The dream commit contains only promoted paths and the report (row G8).**
      With an unrelated uncommitted user edit present in the vault, that edit is
      **not** in the dream commit and is **not** lost.
- [ ] **The commit carries the decided bytes, not a fresh read (row G8).** With
      a user save landing between the publish and the staging call, the
      committed content for that path is the bytes promotion approved, and the
      user's post-publish bytes are neither committed nor lost. Proven RED
      against an implementation that stages by naming the path. **How the bytes
      reach the index is not asserted** — round-4 CUT ruling.
- [ ] **The abort paths (row G9).** Brain failure and mid-run scratch change
      each remove the workspace and leave the vault byte-identical, including
      uncommitted user edits. Proven RED against the current
      `restoreVaultToHead` call, which destroys them.
- [ ] **ADR-0012 states the changed lifecycle.**
      `docs/adr/0012-dream-run-lifecycle.md` describes the workspace → promote
      run shape (the grep below is the anchor; the amendment's wording is the
      implementer's).
- [ ] Idempotence: `N/A — a dream run is not a repeatable command; it consumes a
      moving watermark and writes a date-stamped report, so a second run is a
      different run by construction.` What this package ships in its place is
      the abort and precondition behaviour above: a run that refuses changes no
      vault note and advances no ledger.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# A --test-name-pattern with ZERO matching tests exits 0 (measured, Node 24),
# so pattern runs against a CREATED file are guarded by its existence — the
# guard is what makes the deliverable-ABSENT state red instead of vacuously
# green. (dream-validate needs no guard: its file exists today, a modify
# deliverable.)
test -f tests/unit/dream-pipeline.test.js && npm test -- --test-name-pattern "dream-pipeline"
npm test -- --test-name-pattern "dream-validate"
npm test
npm run lint
# Pipeline-level CLAIM 1 and CLAIM 2b live in the deliverable test file; the
# spec fixes only the test NAMES, because a verification command must be
# runnable; what the tests contain is the implementer's.
test -f tests/unit/dream-pipeline.test.js && npm test -- --test-name-pattern "claim-1-pipeline"
test -f tests/unit/dream-pipeline.test.js && npm test -- --test-name-pattern "claim-2b-pipeline"
# The pipeline no longer pre-commits the user's edits (row G6). This is a
# grep on a file that MUST exist, so guard the absence case first: grep on a
# missing file exits 2, which `!` would turn into a false green.
test -f src/cli/dream.js && ! grep -q "precommitSessionEdits" src/cli/dream.js
# The unknown-command guard's re-based consumer survives (row G6): deleting
# both assertCleanTree uses would make it vacuous.
test -f src/cli/dream.js && grep -q "assertCleanTree" src/cli/dream.js
test -f docs/adr/0012-dream-run-lifecycle.md && grep -qi "promot" docs/adr/0012-dream-run-lifecycle.md
```

- The two `claim-` runs, both `dream.js` greps and the ADR grep are NEW steps
  and each is an ASSERTION: it exits non-zero on failure rather than printing
  something a reader must judge. Paste a real green on the finished state AND a
  real red from a deliberately broken state — the sibling's transitional vault
  argument restored at the call site (reddens `claim-1-pipeline`); a git call
  added with the workspace as cwd (reddens `claim-2b-pipeline`); the
  `precommitSessionEdits` call restored (reddens its grep); both
  `assertCleanTree` uses deleted (reddens its grep); the ADR text reverted
  (reddens the docs grep) — so a check that cannot fail is caught before anyone
  believes it. Verify each **also** goes red when its deliverable is ABSENT —
  for the pattern runs that is the file-existence guard's job.
- **CLAIM 2b is asserted through the git seam, never through a grep.** A source
  grep for a workspace-rooted cwd cannot discriminate: it is green today, green
  on a correct implementation, and green on a broken one that passes the path
  through a variable. Measured during the pre-split spec's round zero — the grep
  that section originally carried was green on the unmodified tree.
- **The `assertCleanTree` grep is a presence check, not a proof.** It catches
  the delete-both mistake and nothing finer; the behaviour is proven by the
  non-vacuity acceptance criterion, which is where the discrimination lives.

## Out of scope (do NOT do these)

- **`WP-dream-promote-module`'s contracts** — Tables C, D, E and R: the
  promotion decision, the allowlist, the merge, the gate inputs and order, the
  EP2 taxonomy, the publish through the primitive, the report and its fallback.
  This package CONSUMES `promote()` and cites those tables; it may not restate
  them, re-implement any part of them, or write a vault content byte of its own.
  The two rows it DOES discharge (G7, G8) are the two that module names as
  handoffs, and nothing beyond them.
- **`src/core/reap.js`** — row G2 scopes the reap precondition per platform and
  names `WP-a10-windows-reap` as the owner of the win32 leaderless-member
  residual. Changing the reap primitive is that package's subject, not this
  one's.
- **Audit finding M9** — repo-local git configuration naming executable
  programs. Owner-ruled open on 2026-08-05, audit finding C2's package. This
  package may not claim it, and the validator still runs git in the vault for
  the commit. (The "audit" prefix distinguishes these ids from this spec's own
  row ids.)
- **Audit finding C3** — the layout dot-rule and its notice.
- **The residue-lifecycle successor** (not yet drafted — it has no WP id yet) —
  the journal schema, crash replay, uninstall restore, a workspace surviving a
  crash, and the rollback/replay of a PARTIAL PUBLISH. Row G9 is narrower and
  says so; row G5's teardown exception hands it the workspace it leaves behind.
- **An ADR for the promote-in inversion.** The war-room decision log owns the
  reasoning and this spec cites the rulings; whether the inversion also needs an
  indexed ADR is an owner call, not an implementer's. `docs/adr/0012` is amended
  here only where it states the lifecycle this package changes.
- **`skills/wienerdog-dream/SKILL.md`** — the sibling's Out of scope owns the
  bounded claim and the reason; nothing here changes it.
- **The siblings' contracts** — the workspace module, the constructed baseline,
  the seven re-target sites and Table F (`WP-dream-workspace-retarget`); and the
  vault-write primitive's filesystem discipline, Table H
  (`WP-dream-vault-write-primitive`). This WP consumes both and cites them;
  restating a proved property is how it becomes a drifting copy.
- **`docs/GLOSSARY.md`** — the name **promotion** is
  `WP-dream-promote-module`'s deliverable.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken
   red; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): rewire the dream pipeline onto the workspace and promotion (WP-dream-promote-in-workspace)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.

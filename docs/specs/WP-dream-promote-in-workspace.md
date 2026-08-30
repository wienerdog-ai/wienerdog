---
id: WP-dream-promote-in-workspace
title: Rewire the dream pipeline onto the workspace and promotion
status: Ready
model: opus
size: M
depends_on: [WP-dream-workspace-retarget, WP-dream-vault-write-primitive, WP-dream-baseline-delta-primitive, WP-dream-promote-module, WP-dream-promote-report, WP-quarantine-warnings-file]
adrs: [ADR-0004, ADR-0012, ADR-0020, ADR-0031, ADR-0034]
epic: audit-2026-07-29
---

# WP-dream-promote-in-workspace: the pipeline where promotion replaces filtering

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — one of THREE packages, and the ruling quoted below is the
PRE-T1 one.** The seam ruling reproduced here split the work TWO ways; **the T1
tripwire later cut a third package, `WP-dream-promote-report`, which this spec
depends on and whose absence its Dispatch precondition treats as blocking.** The
quotation is kept as history — **current ownership is the canonical map, cited
above.** This WP and `WP-dream-promote-module` were one design, split along the
seam the owner ruled at the PR-review gate (logbook:
`2026-08-21-dream-promote-pair-review-rounds.md`, "Owner ruling on the
verdicts"): **Tables C, D, E and R became the `promote.js` package, shipped
consumed by nothing; Table G — this spec — became the pipeline package.** The
split's input record is `2026-08-28-promote-split-inputs.md` and the split's own
decisions are recorded in `2026-08-28-promote-split.md`.

**Contract table letters are family-wide. The canonical map lives in ONE LIVING
surface — `docs/specs/logbook/2026-08-29-promote-family-map.md` — and this
spec CITES it rather than restating it.** It was restated in three
specs until the PR gate found two of them stale. **A cut that moves a table
updates that map AND sweeps each spec's Out-of-scope ownership prose, which stays
hand-maintained** — an earlier form of this sentence said "and nothing else",
which the next gate falsified by finding one of those bullets already drifted.
Every cross-package reference cites its owner and never restates it.

**This is the package where the family's claims become true of the running
product.** Every entry point it needs is shipped and called by nobody —
**stated as entry points, not as modules, because two of the modules already
have a consumer** (measured on `36c2ce5`): `createWorkspace` and
`destroyWorkspace` have no caller in `src/`, though `brain.js:18` requires
`workspace.js` for the `isAtOrBeneath` helper; `computeDelta` has no caller,
though `workspace.js:63` requires `delta.js` for `captureBaseline`;
`writeIntoVault` has no caller and `vault-write.js` has no requirer at all;
and `promote.js` will ship the same way. This WP replaces the
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
**Three of the SIX dependencies are `Done` on that tree;
`WP-dream-promote-module`, `WP-dream-promote-report` AND
`WP-quarantine-warnings-file` are not yet built, and this WP is dispatchable only
after ALL THREE are `Done`** — it consumes `promote()`, its return shape, the
`report` arm the report package adds, and the `records` input row G12 fills, and
row G8 reconciles the warnings file that third package creates into this run's
commit **by calling that package's exported `composeWarnings`** — a seam that does
not exist until it is `Done`. **Dispatching after the module alone would leave rows G11 and G12
consuming fields that do not exist yet.** Neither promotion package's Deliverables
include the files this spec cites by line, so their merges should shift nothing
here — **but `WP-quarantine-warnings-file`'s DO**: it adds three `refreshWarnings`
call sites to `src/cli/dream.js` and one counting condition to
`src/core/dream/validate.js`, so its merge WILL move the line citations below.
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
- **From `WP-dream-promote-report` (`Done` at dispatch):** the same module,
  extended — `promote()` composes and publishes the dream report, takes the
  `records` input row G12 fills, and returns the `report` arm rows G11 and G8
  consume. **Its `### Exact contracts` is the shape; it is cited, not restated.**
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
  (`:1194`), and the EP2 gate itself, whose redact arm is at `:1269-1294`, whose
  separate counters are at `:1064-1072`, whose unscannable-binary refusal is at
  `:1239-1255`, and whose **enforcement half — the revert, re-stage and
  index-drop core — is at `:1324-1332`**, with the refusal-reason suffixes it
  composes at `:1333-1337` and the `reverted[]` accounting they feed at
  `:1361-1363`. **Between the suffixes and the accounting sits the
  identity-gated deletion of the redact arm's redundant copy (`:1338-1360`),
  which is NOT enforcement and must survive** (Table V, row V3) — **and its keep
  branch (`:1357-1359`) announces the copy it keeps by appending to that same
  doomed `reason`, whose only consumer is `:1361` inside the removal; measured,
  `awk 'NR>=1233 && NR<=1364 && /reason/'` over the loop prints NINE lines that
  mention `reason`, and exactly ONE of them CONSUMES it — `:1361`, inside the
  removal; the others declare, assign, append to or comment on it** (the
  description said the command "finds exactly one consumer", which is the
  claim's conclusion rather than the command's output — corrected 2026-08-29,
  round 4); the preservation-failure abort is at
  `:1298-1323`, just above the revert core, and the retention prune fires at
  `:1365-1366`, immediately after the enclosing per-path loop (`:1233-1364`)
  closes. **The redact arm's accounting count is `addedLineNumbers.length` (`:1286`)** — every added line `scrubAddedLines` ran over (`:838-840`), a clean one rewritten byte-identically — **and the shipped report line renders it (`:1401`); row G7 carries a PENDING named input that would narrow it, and this is the value the extraction preserves until that decision.**
  `precommitSessionEdits`' stated job is at `:113-115`;
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
| modify | src/core/dream/validate.js | the gate-extraction handoff (Table G, row G7): the four gates become injectable in the input shape `WP-dream-promote-module`'s Table D assigns them; the EP2 enforcement half — the revert, re-stage and index-drop core (`:1324-1332`), the refusal-reason suffixes it composes (`:1333-1337`) and the `reverted[]` accounting they feed (`:1361-1363`) — and the git-derived evidence go. **The identity-gated deletion at `:1338-1360` sits between those suffixes (`:1333-1337`) and that accounting (`:1361-1363`), inside the same per-path loop (`:1233-1364`), and MUST SURVIVE — with ONE carrier change, its keep branch at `:1357-1359`, which today announces the kept copy by appending to the same doomed `reason`** (row G7, row V3). Also row G10's side of the ownership registry: `isNewSkillDraft` (`:300`) is reused and exported if the new call site needs it. **AND ONE PENDING INPUT, which is NOT authorization to build it:** row G7 carries a named but PENDING narrowing of the EP2 gate's redaction-accounting `lines`, blocked on an owner decision against the pin in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`. Until that decision the extracted gate keeps the shipped `addedLineNumbers.length` (`:1286`) |
| create | tests/unit/dream-pipeline.test.js | Table G, and pipeline-level CLAIM 1 and CLAIM 2b |
| modify | tests/unit/dream-validate.test.js | the gates' new inputs and the removed enforcement half |
| modify | tests/integration/dream.test.js | pipeline wiring and abort behaviour |
| modify | docs/adr/0012-dream-run-lifecycle.md | the lifecycle this package changes |

**Not in this package, and the exclusions are load-bearing.**
`src/core/dream/promote.js`, `src/core/dream/vault-write.js`,
`src/core/dream/workspace.js`, `src/core/dream/delta.js`,
**`src/core/dream/warnings.js` (row G8's third clause calls its exported
`composeWarnings` and changes nothing in it)** and
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

**Two canonical tables.** **Table G** is the pipeline's own contract. **Table V**
is the inheritance ledger — what the code this package replaces owns today, and
which Table G row takes each piece — extracted by the ADR-0031 circuit-breaker
after four findings in two rounds lived in the gap between them.

### Contract table(s)

`N/A — this spec's dense contracts are two NAMED canonical tables (G and V)
rather than one unnamed table under this heading.` Naming them is what makes a
row addressable by letter across the whole family
(`docs/specs/logbook/2026-08-29-promote-family-map.md` maps letters to owners).
The heading stays in place rather than being deleted, per
`docs/runbooks/spec-authoring.md`: a section's absence must be visible and
checkable. **The named-table substitution is pre-existing in all three specs of
this family — noted by the round-zero pass of 2026-08-29 and closed then. What
changed on 2026-08-29 is that each spec now states its OWN tables here:** until
then all three carried one byte-identical paragraph, registered by no Mirrored
Surface Checklist, and its claim was false in one of them.

### Table G — the pipeline: wiring, the reap precondition, and the abort paths

| # | Fact / rule | Value |
|---|-------------|-------|
| G1 | The run's workspace lifecycle | `createWorkspace` runs before the brain is spawned (which is what makes the sibling's capture-before-spawn ordering a pipeline fact, not just a module fact); the sibling's transitional call-site argument (`cli/dream.js:159`) is replaced by the run's workspace; after the brain, `computeDelta` then `promote`; `destroyWorkspace` on every exit path (exception in G5). **This is the line where the sibling's CLAIM 1 becomes true of the running product**, and the acceptance criteria re-assert its composed-argv form at pipeline level. `createWorkspace` throws rather than returning on a failed build, and removes what it had built — so no exit path here can reach a partial tree, and none may try. **The DRY-RUN preview moves with the target (Table V, row V8):** it prints the composed argv, so once the real run writes a workspace, a preview still naming the vault describes a run that no longer happens. It is the same composition or it is not a preview |
| G2 | **The reap precondition** | `computeDelta` runs on the workspace only after the brain's process group is **verifiably** empty. `runBrainWithWatchdog` (`cli/dream.js:139`) computes a reap verdict at `:286` — `reapGroupFn(...)` returning `{reaped:true}` — and today consumes it only to gate the pidfile unlink, never surfacing it to its caller. **Measured caveat: that verdict is computed INSIDE `if (pidfile)` (`:270`), and `pidfile` is `null` on a tokenless manual `wienerdog dream` (`:163-166`) — so on a standalone success the verdict is not merely discarded, it is ABSENT.** This package therefore requires an **unconditional post-settle reap verdict** — computed on every run, tokenized scheduler run and tokenless manual run alike — surfaced to the caller (`### Exact contracts`), and it **refuses the run fail-closed** on anything but a verified reap, rather than walking a workspace a surviving process can still mutate. A missing verdict is treated as unverified, never as success. This converts the dependency's explicitly-unverified hypothesis into an enforced precondition (sibling Table F), and it is what keeps a live actor from mutating the workspace during the walk. **PLATFORM-SCOPED, and the scope is the repo's own:** `src/core/reap.js:25-33` states that the leaderless-reparented-member guarantee is POSIX-only this release, and `:505-519` shows the win32 branch returning `{reaped:false}` whenever `taskkill` cannot reach an already-exited leader — so a fail-closed rule keyed on a verified group reap would refuse NORMAL Windows runs. On win32 the precondition is therefore satisfied by the brain leader's verified exit plus the existing tree-kill attempt, and **the leaderless-member residual is named, not solved: it is `WP-a10-windows-reap`'s subject**, the package the primitive's own platform note already defers it to. `src/core/reap.js` is in no Deliverables table here and is not modified |
| G3 | **The unknown-command non-vacuity signal** | today the "the brain did not run — the CLI rejected the trigger prompt" abort keys off vault-cleanliness (`cli/dream.js:251`, `assertCleanTree`, inside the marker branch that opens at `:224`), sound only because the tree was asserted clean immediately before spawn — the premise `precommitSessionEdits` supplied and G6 removes. Under this package the brain writes the WORKSPACE, so the non-vacuity evidence moves there: a genuine rejection produced an EMPTY workspace delta (the brain did no work), so the abort keys off `sawUnknownCommand` AND an empty `computeDelta` result, never off the vault. **The abort DECISION therefore moves out of `runBrainWithWatchdog` (`:224-266`) into its caller**, which is the only place both halves of it are known; the marker is surfaced instead (`### Exact contracts`). The function's other two aborts — a non-zero brain exit, the watchdog timeout — stay where they are. **This is why the pipeline calls `computeDelta` and hands the result to `promote()` rather than letting the module compute it (split decision, `2026-08-28-promote-split.md`): the run needs that result for a decision `promote()` is not making, and computing it twice would let the two answers disagree.** A run that emitted the marker but DID write the workspace proceeds into promotion, exactly as today's guard let a writing run proceed into validation. The vault's cleanliness is no longer evidence of anything the brain did |
| G4 | **The pipeline consumes EP2's disposition** | `promote()` returns a typed EP2 disposition summary (its `### Exact contracts`), and the pipeline's transcript-advance consumes it the way today's `secretReverts` signal does (`cli/dream.js:582-610`): a transcript whose only note was **WITHHELD** for a secret is NOT marked processed, so it regenerates next run rather than being silently lost. **A REDACTED note does NOT defer** — measured canonical semantics (`validate.js:1064-1072`: redacted files "consumed their transcripts normally and MUST NOT defer, which is why they are counted separately and never enter `reverted[]`"): the sanitized note WAS promoted, so its transcript was consumed and regenerating it would re-do consumed work and mint a second quarantine artifact. `redactions` is an accounting and reporting field, never a deferral trigger. **The pipeline reads the typed fields, never a human-readable refusal reason — parsing prose would be an undocumented security interface.** A refusal for a NON-secret reason (allowlist, conflict) advances the transcript normally. **The digest is regenerated AFTER the ledger is persisted, and the ORDER is the content (Table V, row V10):** `state/digest.md` is the next session's context, so regenerating it before the ledger lands shows that session a state this run has already changed. This row changes what the ledger records, not when the digest runs — but it is the row that could break the ordering, so it owns it |
| G5 | Teardown wiring | the workspace is removed on every exit path — success, refusal, brain failure, timeout — **with one named exception: a run that refused because the reap was not verified (G2) does NOT tear down.** Removing a tree a surviving process may still be writing is not a cleanup, and G2 is the whole reason that state is distinguishable. Teardown never touches the vault. A workspace left behind by that refusal, or by a crash, is the residue-lifecycle successor's subject, not this package's. **THE ONLY-COPY INVARIANT BINDS TEARDOWN (`WP-dream-promote-module`, Table Q row Q4, cited not restated):** under promotion the destruction risk moves from the vault to the WORKSPACE rather than vanishing, so nothing here may remove a workspace holding the sole surviving copy of a note whose redaction and whose withheld preservation both failed — that run refuses fail-loud instead, exactly as the shipped abort does. **Scratch and the lock keep their shipped ordering (Table V, row V9):** scratch is removed, then the lock is released, and both only if this process still owns the lock, which is what keeps a superseded stale holder from deleting the current owner's live extracts |
| G6 | **`precommitSessionEdits` does not survive, and one of its two neighbours must be re-based** | measured: its stated job is "so the subsequent dream diff is exactly the brain's writes" (`validate.js:113-115`). Under this package the brain writes nothing in the vault, so there is no such diff, and `promote()`'s three-way compare reads `vault-now` from the **filesystem** rather than from git. What remains is only its cost: it commits the user's in-flight edits under the `wienerdog` identity without asking. The call at `cli/dream.js:507` goes, and the `assertCleanTree(vaultDir)` at `:508` — its precommit-pairing use — goes with it. **The SECOND consumer of `assertCleanTree` does NOT go and must be re-based: G3 owns it.** `cli/dream.js:251` uses vault-cleanliness to tell a genuine brain rejection from a working run, and that signal's premise (the tree was clean immediately before spawn) is exactly what removing the precommit destroys |
| G7 | **The gate-extraction handoff, discharged here** | `WP-dream-promote-module`'s Table D states what `promote()` does with the four gates it is HANDED, and names the extraction as this package's. Discharged here: the four gates become functions this pipeline can inject — the EP2 gate returning the ADR-0034 taxonomy, the other three returning `reason\|null` — each taking the input `WP-dream-promote-module`'s Table D assigns it, none consulting git. **`validate.js`'s EP2 enforcement half goes with them:** the revert core at `:1324-1332` reverts, re-stages and drops index entries for bytes that, under promotion, were never written to the vault, so it has no subject; the refusal-reason suffixes it composes (`:1333-1337`) go with it; and so does the `reverted[]` accounting they feed (`:1361-1363`) — `promote()`'s own refusal accounting replaces all three. **What must NOT go with them is the identity-gated deletion of the redact arm's redundant copy (`:1338-1360`), which sits between the suffixes and the accounting, inside the same per-path loop (`:1233-1364`), and is durable-lifecycle behaviour rather than enforcement** (row V3). **An earlier form of this row named `:1324-1364` as the removal — a range that CONTAINS that deletion and ends on the enclosing loop's own closing brace, so it could not be applied literally without unbalancing the function. Corrected 2026-08-29.** **AND THE MUST-SURVIVE SPAN TAKES EXACTLY ONE CHANGE, which is this row's hardest instruction and was found by a design round the same day: its KEEP BRANCH (`:1357-1359`) announces the copy it keeps by appending to `reason`, and `reason`'s only consumer in the loop is `:1361`, inside the removal — so preserving that span byte-for-byte would preserve a behaviour whose output channel this row deletes.** The DECISION is unchanged and stays exactly as its owner decides it — the byte-identity guard, which copy is deleted, which is kept. **What changes is the CARRIER: the kept copy becomes an entry on the PRESERVATION RECORD** (`WP-dream-promote-module`, Table Q rows Q1 and Q9) — the GATE fills that entry's `artifact` and `location`, and `promote()` fills its `remediation`, which is that spec's row Q9's per-field provenance and is cited here rather than restated, reaching the user through the dream report's preserved-copy line instead of through a refusal reason — which is also what Table Q row Q8 requires of every fact about a preserved copy, and why prose could not have stayed the carrier. **This is an owner-authorized change to how a shipped `Done` package's contract item is carried, ruled 2026-08-29, not an implementer's latitude:** that package's own Table Q registers the suffix as the only thing announcing that copy, so the obligation is discharged rather than dropped, and an extraction that removes the suffix without adding the record entry loses the copy. **What survives the removal is the redact DISPOSITION, on the promotion side rather than the revert side** — Table D's EP2 row is the owner of that distinction and this row does not restate it. **The gates' semantics are not this package's to change, WITH ONE ANNOUNCED EXCEPTION — the named input below, which is PENDING and NOT authorized**: the extraction moves where their evidence comes from, per that Table D, and beyond that one input, nothing else. **An earlier form closed this sentence with "and nothing else" and then appended the input AFTER the closing universal, leaving a universal the next sentence falsifies — round 5's H2, and the contrast is the carrier change above, which is announced BEFORE its universal closes.** **ONE NAMED INPUT, PENDING, and it IS a semantic change — routed here by the owner ruling of 2026-08-29 (round 4's B1) because this package owns `src/core/dream/validate.js` and extracts this gate: the extracted EP2 gate WOULD return, as its redaction accounting's `lines`, THE NUMBER OF ADDED LINES WHOSE POST-REDACTION BYTES DIFFER FROM THEIR CAPTURED BYTES.** Today's shipped value is `addedLineNumbers.length` (`validate.js:1286`) — every added line the scrub RAN OVER, because `scrubAddedLines` rewrites each one as `scanAndRedact(line).text` (`:838-840`) and a clean line is rewritten byte-identically — so the shipped count can exceed the number of lines whose bytes CHANGED, and the shipped report line renders it as "line(s) scrubbed" (`:1401`). **`WP-dream-promote-module`'s Table Q row Q10 states that shipped truth and names the gap in place; the FIELD's shape, its provenance and its carriers are that row's and are not restated here — what is this package's is the counting.** **PENDING, AND THE BLOCKER IS QUOTED HERE RATHER THAN ONLY CITED — the authorization is NOT granted (owner ruling, 2026-08-29, round 5's C4).** The value this input changes is PINNED in a shipped `Done` package, `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`, which pins the dream report's redaction line and says so in as many words — quoted here rather than only cited, per the ruling. **QUOTED VERBATIM: the three fragments below are exact contiguous text of that source, ellipses appear only BETWEEN exact fragments, the source's own bold markers are not reproduced, and no emphasis is added here** — "The line format is pinned here, not illustrated. … Every byte outside the angle-bracket placeholders is literal … where `<n>` is `addedLineNumbers.length`". **An earlier form re-cased two of the three fragments and still called itself a quotation (round 6's CD-2). The mis-quoted sentence was the one saying that every byte outside the placeholders is literal, which is why this is a contract defect and not a typo: this is the family's ONE exception to cite-never-restate, and an exception that alters the bytes it exists to reproduce has not been taken.** **So the input changes exactly `<n>`, in the spec that pins it. UNBLOCKING IT REQUIRES AN OWNER DECISION AGAINST THAT PIN — it is not this package's to grant, not an implementer's latitude, and not resolvable by reading this row. If the owner authorizes it at the pipeline round, the settlement is an AMENDMENT to that `Done` spec, exactly as the carrier change's is.** **UNTIL THAT DECISION AN IMPLEMENTER OF THIS PACKAGE BUILDS THE SHIPPED COUNT AND NOT THIS ONE**, and no surface in this family may describe `lines` as a count of CHANGED lines (`WP-dream-promote-module`, row Q10). **THIS IS THE SECOND EXCEPTION IN THIS ROW'S OUT-OF-SCOPE BULLET AND IT IS THE PENDING ONE; the carrier change above is the AUTHORIZED one, and the two do NOT have the same status** — round 5's C4 was exactly that contradiction, this row reading as an instruction to ship while both Out-of-scope bullets said there was exactly one authorized exception and this was not it. **No acceptance criterion is added for it, deliberately and now doubly so:** the pass ROUTES the change rather than performing it, the change is not authorized, and growing this package's verification surface for work it has not been given is what this family's stop criterion forbids. The criterion lands with the counting change, after the decision |
| G8 | **The dream commit, and the staged-bytes handoff discharged here** | `WP-dream-promote-module`'s Table E states the rule and names it as this package's to satisfy: the commit contains **nothing but the run's NAMED commit set, each member carrying ITS CLASS's decided bytes** — three classes, and that table names the byte source of each (promoted and redacted outcomes, and the published report arm, from Table S; the code-owned warnings file from this row's third clause, which Table E cites rather than restates). **Table E's pre-round-2 shorthand for this — "only promoted paths" — is superseded and no surface may state it**, this row included: it read as exhaustive while the set is not. First: with no pre-commit (G6), a wholesale stage would sweep the user's uncommitted edits into the dream commit, so the commit carries a NAMED set of paths and nothing else — the promoted paths, the report, and the third clause's warnings file — which is also what keeps a staging object surviving a primitive refusal (Table H, the PRIMITIVE's row H7) out of it. Second: **naming the path is not enough** — staging re-reads the working tree, so a user save landing between the publish and the staging call is what enters the commit, ungated. Measured: with a save in that gap, `git add -- <path>` stages the user's post-publish bytes. **The committed content must therefore be the DECIDED BYTES — `WP-dream-promote-module`'s Table S, which owns what they are, which outcomes carry them and what may be derived from them, and which this row cites rather than restates.** That table was extracted after two consecutive rounds landed on it; this row is one of its two named consumers. **How that is achieved is the implementer's — round-4 CUT ruling.** ADR-0012's "one dream run = one git commit in the vault" is unchanged. **The user's post-publish save remains as an uncommitted working-tree modification**: it is not committed and it is not discarded. **THE REPORT PATH ON A PARTIAL PUBLISH (round 4's A1, ruled 2026-08-29):** when `promote()` returns `report.outcome === 'promoted'` with `accounting.published === false`, **THIS RUN PUBLISHED the body and the enforcement section never reached the vault**. This row commits the report path on BOTH forms of `accounting`, and what it commits is that arm's `bytes` — **the bytes THIS RUN PUBLISHED for that path** — never `report.record` and never a fresh read (`WP-dream-promote-module`, Table S rows S1 and S4). **`bytes` IS NOT A CLAIM ABOUT WHAT THE TARGET HOLDS, and this row may not make one:** on the `published:false` form the refusal's own cause can be, and on an `expect` conflict IS, the target no longer holding those bytes, so what it holds at the end of the run is refusal-cause-specific (`WP-dream-promote-report`, **Table Y**, rows **Y4** and **Y5**). **This row was NOT TOUCHED in the window that killed that claim and carried it one round longer in the reworded form "the bytes the vault holds" — while this spec's checklist entry for the partially published report NAMED THIS VERY CLAUSE as a mirror, four lines above its own prohibition against the claim (round 6's CD-1). The registration was correct and nothing walked it; `scripts/mirror-walk.js` exists because of this finding.** **A commit that SKIPS the report path on that form drops a published, gated file out of the run's one commit; a commit that MANUFACTURES the missing section commits bytes no gate judged and no primitive published.** The outcome itself is `WP-dream-promote-report`'s **Table Y** and is not restated here  Third, **the commit RECONCILES the code-owned vault warnings file — by CONTENT, never by authorship (quarantine-surface review, round 1 finding 3 and round 2 finding 3; owner-ruled direction A, 2026-08-29).** `WP-quarantine-warnings-file` writes `reports/warnings.md` into the vault at run points the dream commit does not cover, and it relied on the NEXT run's `precommitSessionEdits` to sweep it in — the call row G6 removes. **The eligibility test is therefore NOT "did this run write the file"** — that wording, which this row carried until round 2, misses the two refresh points that matter: point 2 runs AFTER this commit and point 3 runs on an idle run that makes no commit at all, and on the next run the file is already correct on disk so nothing rewrites it and the authorship test excludes it forever. **The test is a comparison instead.** At commit construction the run composes this file's canonical bytes with `composeWarnings` — `WP-quarantine-warnings-file`'s `### Exact contracts`, the family's ONLY composer of that document, whose module is CONSUMED and never modified here — over the **pinned state** (that spec's Table C pinned-state row, which pins exactly ONE argument: the run's in-memory `ledger` binding, not mutated between its refresh point 1 and this commit — the post-commit `recordProcessed` / `recordSecretExhausted` mutations are deliberately outside it). **The render takes the ledger and NOTHING else — no carried snapshot, no date, and never the file on disk** (owner ruling of 2026-08-30, which dropped that file's `## Run log` section; before it, a carried snapshot and a date were pinned here too, and round 3 found the date unpinned across the two callers and the carried bytes user-controlled). **Passing a different LEDGER is therefore the only way these bytes can disagree with what the run wrote, which is why that row pins it and this row does not restate it.** **If those composed bytes differ from the file's content at `HEAD`, the commit includes `reports/warnings.md` with THOSE COMPOSED BYTES as its decided bytes — no matter whether, or when, anything wrote the file on disk. If `HEAD` does not hold the file at all, the same is true PROVIDED the ledger holds at least one active quarantine; a vault that has never had one gets no file (`WP-quarantine-warnings-file`'s Table C row 4, cited not restated). If the composed bytes equal the content at `HEAD`, the file is omitted: no churn commit.** So the commit contains **the promoted paths, the report, AND `reports/warnings.md` whenever its canonical render differs from HEAD — subject, on the absent-`HEAD` arm alone, to the empty-ledger guard just stated: a vault whose ledger holds no active quarantine gets no file** — and still nothing else. Two consequences this row states rather than leaves implicit. **(a) A stray user edit to this code-owned file is never committed — and that now holds for the WHOLE file, not merely part of it:** the entire document is rendered from the ledger and the composer is never shown the bytes on disk, so nothing a user or another process leaves anywhere in the file can be in the composed bytes; the commit carries the canonical render and **writes nothing to disk**, so the user's edit survives as an uncommitted working-tree modification until a refresh point legitimately rewrites the file whole. (An earlier form of that spec carried the file's `## Run log` section forward verbatim, which made those bytes user-controlled input to this commit — round 3, finding 1. The owner dropped the section on 2026-08-30, so there is no carry left to qualify this claim with.) **(b) The decided bytes for this path come from the commit-time render, NOT from Table S** — nothing was promoted, no primitive returned a buffer, and no buffer is carried across the pipeline; that is why direction A dissolved round 2's finding 2 rather than answering it. Naming the path is safe for exactly the reason naming a user path is not: the file is **CODE-OWNED**, written whole from the transcript quarantine ledger, never brain-authored, so committing it sweeps no user bytes. This is still an INHERITANCE, not a new contract: `WP-quarantine-warnings-file` owns what the file contains, when it is written and how it is composed, and is cited, not restated; this row owns only the render-versus-HEAD test and the passage into the run's single commit |
| G9 | **The abort paths change, and leaving them would be a data-loss regression** | `restoreVaultToHead` (`validate.js:139-149` — `reset --hard` + `clean -fd`) is called at `cli/dream.js:549` and `:564`. Both mean "discard the brain's unvalidated writes". Under this package the brain wrote nothing in the vault, so there is nothing to discard — and with `precommitSessionEdits` gone (G6), a `reset --hard` there would destroy **all** of the user's uncommitted work for a failure that never touched the vault. Both call sites become `destroyWorkspace`. `restoreVaultToHead` itself is left in place and exported: this row changes only which function the two sites call, not the crash-replay, journal or uninstall-restore subject, which is the residue-lifecycle successor's |
| G10 | **The skill-ownership registry survives the rewiring — a durable POST-COMMIT side effect the validator owns today and Table G must inherit (round 2, F1)** | today `validateAndCommit` does this in two halves: it collects accepted NEW dream-created skill drafts during classification (`validate.js:1200-1205`) and calls `recordSkills` after the commit (`:1443-1448`, Step 6), so the registry only ever names committed skills. **The shipped contract requires an entry for every new dream-created skill the orchestrator accepts and commits** (`docs/specs/done/WP-083-skill-ownership-registry.md`, its acceptance criteria) — and a skill that is committed but unregistered is not dream-owned, so every later autonomous revision of it fails closed. **Replacing the validator's classification, gates, report and commit without carrying this obligation would leave the old code and its passing unit test in place while production registration is dead** — green tests, missing product. This row assigns it. Three things it fixes, and each is a consequence of the inversion rather than a port: (i) **"NEW" can no longer be `change.untracked`** (`validate.js:1202`), which is a git INDEX fact — the same class of evidence whose absence made this family's predecessor `Superseded` — so newness comes from the run's delta status `added` for a path the promotion outcome shows PUBLISHED, ordinary or redacted alike; (ii) **`id` and `created` are derived from the DECIDED BYTES**, never by re-reading the vault path as `:1203` does today (`WP-dream-promote-module`, Table S, row S4 — this row is its second named consumer); (iii) **the call still runs only after the commit succeeds**, which is what keeps the registry from naming an uncommitted skill. Refused paths, modifications of existing tracked skills, and shipped `wienerdog-*` skills are registered by nobody, exactly as today. `src/core/dream/skill-registry.js` is NOT modified — `recordSkills` is called, not changed; `isNewSkillDraft` (`validate.js:300`) is reused, exported if the call site needs it |
| G11 | **The run's accounting and output — every record this run produces reaches the user (round 3, F1 and F7 of Table V)** | today the run ends with a user-visible summary built from the validator's return (`cli/dream.js:628-631`: the commit sha, note and skill counts, the reverted count and the out-of-vault count). Table V row V7 shows the pipeline consumes five of seven fields and that no row owned the channel. This row owns it. The obligations it must carry that the pre-round-3 text left homeless — **the COUNT is dropped rather than renumbered, exactly as round 4's F-3 dropped an orphaned ordinal: this cell said "two" and listed more, it was already wrong before the window that noticed it, and a later pass added an item without touching it (round 5's N2).** **THE SENTENCE THAT REPLACED IT THEN INTRODUCED TWO FRESH NUMBERS OF ITS OWN AND BOTH WERE FALSE (round 6's COH-2) — inside the very sentence warning that counts beside lists go stale.** **It is replaced by one that states no count at all, which is the only durable fix: a number beside a list inside a cell this long is a number waiting to be falsified, and a corrected number is only a number that has not been falsified yet** — are: **(i) the REFUSED report arm.** When `promote()` returns `report.outcome === 'refused'`, `report.record` holds the COMPLETE enforcement record and the vault holds none of it — `WP-dream-promote-report`'s Table R, row R4, is explicit that the vault object is left untouched and the record travels through the run's log and output instead. **The module RETURNS it; returning is not delivering, and this row is the delivery.** Nothing is staged or committed on that arm — there are no bytes to commit (`WP-dream-promote-module`, Table S, row S3). **(i-b) THE PARTIALLY PUBLISHED REPORT ARM (round 4's A1, ruled 2026-08-29).** When `report.outcome` is `'promoted'` and `report.accounting.published` is `false`, **THIS RUN PUBLISHED the body**, the enforcement SECTION never reached the vault, and `report.record` again holds the COMPLETE record — the redaction line and every preserved-copy line the refused section would have carried included. **This row delivers it to the run's log and output exactly as it delivers R4's, and the run's accounting states plainly that the enforcement section was not published, naming `report.accounting.reason`.** It differs from (i) in ONE respect, and stating it is the point: here something IS committed — the report path, from that arm's `bytes` (row G8) — so (i)'s "nothing is staged or committed" is (i)'s clause alone. **What the target HOLDS at the end of such a run is refusal-cause-specific and this row states nothing about it (`WP-dream-promote-report`, Table Y row Y4); an earlier form said "the body is in the vault", which that row forbids (round 6's CD-1).** The outcome is `WP-dream-promote-report`'s **Table Y**'s. **(ii) the out-of-vault records from row G12**, which reach the same channel. **(iii) the note and skill COUNTS, whose semantics are exact and are inherited, not re-derived (Table V, row V7; inventory I078/I085):** today a count increments once per staged added-or-modified path, notes for anything outside the skills and reports directories, skills for **any** path under the skills directory — not only `SKILL.md` — with deletions and the report counted in neither. **The code-owned `reports/warnings.md` is counted in neither either, and that exclusion is INHERITED rather than invented here:** the file sits outside both the skills and the reports directories, so the rule as stated would count row G8's reconciliation of it as a user note. `WP-quarantine-warnings-file`'s Table D adds exactly that exclusion to today's counting code (`validate.js:1427-1429`) and owns it; moving the counting into this row carries it, cited and not restated. They appear in the commit message and in this row's summary, so a changed rule silently changes what a user reads in their own git history. **This row is their producer; before pass (b) the summary promised counts no surface produced.** **(iv) the path list today returned as `committed[]` (inventory I081) is DROPPED, and dropped explicitly rather than by omission:** it has no production consumer — measured, `cli/dream.js` reads `sha`, `counts`, `reverted.length` and `outOfVault.length` and never `committed` — and promotion's own `promoted[]` carries the same information at the point it is decided. A reader looking for it finds this sentence instead of silence. A refusal that names its reason to nobody is the failure `WP-dream-promote-report`'s Table R exists to prevent, arriving one package later |
| G12 | **Scratch integrity — the delete-and-RECORD half, which no row inherited (round 3, F3)** | Table V row V1: today Step 1 deletes any file in the read-only scratch dir that is not an expected extract, deletes an expected extract whose content changed, and RECORDS each as an out-of-vault violation that reaches the report and the run's return. **The pipeline's existing `scratchIntact` (`cli/dream.js:57-78`) is NOT equivalent and must not be mistaken for it: measured, it checks only that expected extracts still exist and byte-match, so an added `EVIL.json` passes it unchanged.** This row keeps both halves: the fail-loud abort for a missing or changed expected input stays exactly as it is, and the enumerate-delete-record behaviour for UNEXPECTED writes is preserved, running after the verified reap (row G2) and before promotion. **Its records reach the user through TWO channels, and needing both is the point:** row G11 delivers them to the run's log and output, and they are passed to `promote()` in its `records` input so they also reach the dream REPORT, which is the durable one (`WP-dream-promote-report`, `### Exact contracts`). **Round 4's F1 was exactly this: the obligation to put them in the report was assigned here with no field to carry them, and the report is composed inside `promote()` — after this row has already run.** A log line is not a durable record; a sandbox-policy breach that survives only in transient output is the observability loss this row exists to prevent. **Rationale, not ceremony:** an unexpected scratch write is a sandbox-policy breach; dropping the record would downgrade a security-visible event into routine teardown, and the file would be deleted by cleanup with nothing left to show it existed. `src/core/dream/scratch.js` is not modified |

### Table V — what `validateAndCommit` owns today, and which row inherits it

**Extracted by the ADR-0031 loop circuit-breaker, its SECOND firing on this
pair.** Round 2's R2-1 and round 3's F1, F2 and F3 are one family: *a durable or
security-visible behaviour of the code this package replaces that no row
inherits, or whose evidence the replacement understates.* Four instances in two
rounds is the breaker's trigger, and its rule is to stop patching and enumerate.

**The root cause, named so it is not repeated:** this spec's Current state
listed `validateAndCommit`'s six steps by NAME and LINE. That is an inventory,
not an enumeration — it says where each step is, never what it CONSUMES or what
it durably PRODUCES, and every one of the four findings lived in that gap. A
1469-line function is replaced safely only by the second kind of reading. **This
table is that reading, and it is the checkable form of the claim the Mirrored
Surface Checklist used to make without one.**

**"No row" is an entry here, never silence.** A behaviour this package drops on
purpose is recorded as dropped, with the ruling that dropped it.

**MEMBERSHIP is decided by the owner-ruled mechanical test, and the full
95-element inventory that applies it is
`docs/specs/logbook/2026-08-28-promote-split-inventory.md` — 76 IN, 19 OUT, every
exclusion listed.** An element is IN when a row or criterion of this package
reads, writes, replaces or reorders it; borderline leans IN. **Table V carries a
ROW for each IN element that needed an owner assigned; the inventory names the
owner for the rest.** If a later round shows an excluded element IS touched,
that is a finding against the inventory, and the inventory is what gets
revisited.

| # | What the validator owns today | Consumes | Durably produces | Inherited by |
|---|---|---|---|---|
| V1 | **Step 1 — scratch integrity** (`validate.js:1107-1142`) | `scratchDir`, `expectedScratch`, `scratchBaseline` | deletes any scratch file that is not an expected extract, deletes an expected extract whose content changed, and **RECORDS each as an out-of-vault violation** (`outOfVaultDetailed`), which reaches the enforcement section (`:1385-1386`) and the return (`:1450-1458`) | **row G12.** **NOT already covered by the pipeline's `scratchIntact`** (`cli/dream.js:57-78`), which only checks that expected extracts still exist and byte-match — measured, an extra `EVIL.json` passes it. The delete-and-record half has no other owner (round 3, F3) |
| V2 | **Step 2 — per-path classification and three gates** (`:1144`) | git evidence in the vault; the four gates' own inputs | the promote/refuse decision per path | rows **G7** (the gates' extraction and evidence) and, for the decision itself, `WP-dream-promote-module`'s Tables C and D |
| V3 | **Step 3 — the EP2 secret gate, its enforcement half, and its DURABLE LIFECYCLE** (`:1211`; revert core `:1324-1332` with its reason suffixes at `:1333-1337` and its `reverted[]` accounting at `:1361-1363`; quarantine `:669-738`; preservation-failure abort `:1298-1323`; identity-gated deletion of the redundant `redacted/` copy `:1338-1360`; retention `:906-946,1365-1366`; report metadata `:1392-1409`) | staged git diffs; the pre-change bytes it preserves; the set of artifacts this run created | withheld/redacted dispositions; **a durable quarantine artifact under a collision-resolved name; a fail-loud abort that refuses to destroy a working copy unless a durable artifact byte-identically holds the CURRENT bytes; once-per-run retention of `redacted/`; and the per-redaction report line carrying path, scrubbed-line count, labels and artifact name**; and the revert, re-stage and index-drop machinery | **rows G7 and G5**, and — for what the gate's RESULT carries into promotion and what promotion does with it — `WP-dream-promote-module`'s **Table Q**, CITED here and never restated. **The DURABLE half of the lifecycle above is neither package's, and saying it was Table Q's was wrong until the reconciliation pass of 2026-08-29 corrected it:** the preservation-failure abort, the identity-gated deletion of a redundant copy and the once-per-run retention of `redacted/` are decided, asserted and mutation-covered in the shipped `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` — cited by spec path because its table letters collide with this family's, the canonical map (`docs/specs/logbook/2026-08-29-promote-family-map.md`) being the one surface that states which — and Table Q rows Q5 and Q6 are pure pointers at it, while row Q4 points at that package's enforcement while owning the invariant as it binds this family. **The extraction here must therefore PRESERVE them, which is what row G7's acceptance criterion asserts:** the geometry is what makes that hard, and it is stated exactly rather than approximately — the revert core that goes (`:1324-1332`) sits below the abort (`:1298-1323`), its reason suffixes (`:1333-1337`) follow it, the identity-gated deletion (`:1338-1360`) follows those, and its `reverted[]` accounting (`:1361-1363`) follows the deletion; all five are inside the per-path loop (`:1233-1364`), and the prune (`:1365-1366`) fires immediately after that loop closes. **The identity-gated deletion is the dangerous one: it is the only must-survive behaviour that lies INSIDE the span an over-wide removal would take**, and until 2026-08-29 this row and rows G7's own Deliverables entry both named a removal range that contained it. **AND PRESERVING IT IS NOT THE SAME AS LEAVING IT BYTE-IDENTICAL:** its keep branch (`:1357-1359`) announces the kept copy through `reason`, whose only consumer in this loop is `:1361` and therefore goes — so row G7 re-carries that announcement on the EP2 gate's preservation record (`WP-dream-promote-module`, Table Q rows Q1 and Q9), by owner ruling of 2026-08-29. Row G7 owns that instruction; this row records that the behaviour is on the must-survive side of the cut and not why. The enforcement half has no subject once nothing is written to the vault, and goes. **Row G5 cites Table Q's row Q4 because under promotion the destruction risk moves to the workspace rather than vanishing. An earlier form of this row listed only "dispositions and the revert machinery" — round 4's F2, and the reason Table Q exists.** **THE SCRUBBED-LINE COUNT's VALUE IS NOT CHANGED BY THIS EXTRACTION:** row G7 carries a PENDING named input that would narrow it, blocked on an owner decision against `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`, which pins it as `addedLineNumbers.length`. This row records that the shipped value is what survives the cut until that decision, and not why (round 5's H3: the input reached row G7 alone, where the carrier change reached every surface its own checklist entry registers). **A number stood here — "six surfaces" — and is DROPPED: it was correct the day it was written and stale the moment a seventh was registered, which is exactly the failure row G11 names one row over (round 6's NIT-3). The registered mirror list is the checkable form, and `scripts/mirror-walk.js` walks it** |
| V4 | **Step 4 — the dream report** (`:1374-1409`) | the run's records | the report body plus the appended enforcement section | `WP-dream-promote-report`'s report row, Table Y and Table R. Its REFUSED arm's delivery, **and the delivery of a `promoted` arm whose SECOND write was refused** (that spec's **Table Y**, round 4's A1), are **row G11**'s; the commit of the report path on that partial form is **row G8**'s |
| V5 | **Step 5 — stage and commit** (`:1411`, `git add -A` at `:1412`) | the working tree | one commit in the vault | **row G8** |
| V6 | **Step 6 — the skill ownership registry** (`:1443-1448`) | accepted new skill drafts collected at `:1200-1205` | `state/skill-registry.json` entries | **row G10** |
| V7 | **The RETURN, and the run's user-visible accounting** | the above | seven fields, of which the pipeline consumes five today: `secretReverts` (`cli/dream.js:592`), and `sha`, `counts.notes`, `counts.skills`, `reverted.length`, `outOfVault.length` in the summary line (`:628-631`) | `secretReverts` → **row G4**; everything else → **row G11**. **This row is why the enumeration was needed at all:** the summary line is the delivery channel V1's records and Table R's refused enforcement record both travel on, and no row owned it |
| V8 | **The dry-run preview** (`cli/dream.js:80-108,472-477`) — inventory I018 | the composed brain argv | terminal text a user reads to see what the run WOULD do | **row G1.** The preview must show the WORKSPACE write target the real run uses; a preview still showing the vault is a false preview of a run that no longer happens |
| V9 | **Teardown ordering and lock ownership** (`cli/dream.js:633-642`) — inventory I095 | the lock's ownership state | scratch removed, then the lock released, **and only if this process still owns it** | **row G5.** A stale holder must touch neither the current owner's scratch nor its lock; the clean-before-release ordering is what closes the acquire-versus-clean race |
| V10 | **The digest regenerated AFTER ledger persistence** (`cli/dream.js:623-625`) — inventory I093 | the run's final ledger and quarantine state | `state/digest.md`, which is the next session's context | **row G4.** The ORDER is the content: regenerating before the ledger is persisted shows the next session a state that has already changed |

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
- [ ] **The package note, the dispatch-precondition block and
      `### Contract table(s)`** — all three cite the canonical table-letter map;
      the `### Contract table(s)` line additionally names THIS spec's own tables
      and is the surface a moved table falsifies first (registered 2026-08-29).
      The note mirrors the citation of the canonical table-letter map and the two discharged
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
      bytes). **G8 cites `WP-dream-promote-module`'s Table S rather than naming
      fields of its own; a decided-bytes fact restated here is drift by
      construction (rounds 1 and 2 both landed on that contract).**
- [ ] **What the dream commit contains** — row G8 decides it (the promoted paths,
      the report, and `reports/warnings.md` whenever its canonical render differs
      from HEAD, guarded on the absent-HEAD arm by the ledger holding at least one
      active quarantine), and its mirrors are the dispatch-precondition dependency
      sentence, the consumed-not-modified exclusion naming
      `src/core/dream/warnings.js`, the Security checklist's vault-writer
      clause, the dream-commit acceptance criterion,
      `WP-dream-promote-module`'s Table E staged-bytes row, and
      `WP-quarantine-warnings-file`'s named residual and Table C rows, which
      cite this row by name. **No surface may state the commit as "only
      promoted paths and the report"** — with `precommitSessionEdits` gone (row
      G6) that omission strands the code-owned warnings file uncommitted forever —
      **and no surface may key the warnings file's eligibility on AUTHORSHIP**
      ("when the run wrote it"), which misses refresh points 2 and 3 and strands it
      just as completely (round 2, finding 3; owner-ruled direction A). The test is
      the render-versus-HEAD comparison, with the empty-ledger guard on its
      absent-HEAD arm, and nothing else. **The empty-ledger guard is part of the
      rule, not a footnote to it:** an empty ledger renders the non-empty
      `No session transcripts are being skipped.` bytes, which differ from an
      absent HEAD file, so any restatement that drops the guard orders the very
      churn commit the guard forbids (PR gate, 2026-08-30). **And the file this
      row puts INTO the commit is excluded from the note COUNT** — that fact's
      mirrors are row G11's counts clause and its acceptance criterion, both
      deferring to `WP-quarantine-warnings-file`'s Table D
- [ ] **The two consumers of the decided bytes** — rows G8 and G10, and row S6
      in `WP-dream-promote-module`, which lists them (row S5 is that table's
      SCOPE row, not its list — a distinction S5's own text records as the
      defect it was written to close). **A third consumer added here without
      being added there is a finding.**
- [ ] **The only-copy invariant, and the durable lifecycle behind it** — row
      G5 and `WP-dream-promote-module`'s Table Q row Q4, which owns the
      invariant as it binds THIS family; row V3 and row G7's acceptance
      criterion for the shipped machinery that enforces it. **No surface here
      may restate the invariant or weaken it to "a copy was attempted";
      teardown cites it. And no surface here may restate the abort, the
      identity-gated deletion or the retention prune — those are
      `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`'s, cited by spec path
      because its table letters collide with this family's — the canonical map
      states which, and no spec here restates that list. This
      package's obligation is that the extraction preserves their DECISIONS,
      nothing more.**
- [ ] **THE ONE CARRIER CHANGE INSIDE THE MUST-SURVIVE SPAN** — the
      identity-gated deletion's keep branch (`validate.js:1357-1359`) announces
      the copy it keeps through a `reason` this package deletes, so the
      announcement moves to the EP2 gate's preservation record
      (`WP-dream-promote-module`, Table Q rows Q1, Q8 and Q9). **Owner ruling,
      2026-08-29 — it changes how a shipped `Done` package's contract item is
      CARRIED, which is not an implementer's call and not this package's to
      re-open.** Its mirrors are the Deliverables `Notes` cell for
      `src/core/dream/validate.js`, Current state's geometry sentence, row G7,
      row V3, row G7's acceptance criterion, **and the Out-of-scope bullet for
      the EP2 gate's durable quarantine lifecycle** — a carrying
      surface this entry omitted for a round, which therefore still said nothing
      may change what those behaviours do (registered 2026-08-29, round 3's
      F4). **THE COUNTING CONVENTION FOR EVERY MIRROR LIST IN THIS SPEC IS
      STATED ONCE, HERE: a list names the surfaces OUTSIDE the entry, and the
      checklist entry itself is always a carrier and is never one of them.
      Round 6's NIT-3 found this entry and the pending-input entry below
      counting by different conventions — an ordinal here that excluded itself,
      an enumeration there that included itself — which is how two structurally
      twin entries came to disagree about the size of the same class of act.
      No mirror list in this spec states a total any more: `scripts/mirror-walk.js`
      walks the lists.** **No surface here may say the
      span survives byte-for-byte, and none may leave the kept copy announced by
      a refusal reason.**
- [ ] **THE PENDING COUNTING INPUT — routed, quoted in place, and NOT
      authorized.** Row G7's named narrowing of the EP2 gate's
      redaction-accounting `lines`. **Owner ruling, 2026-08-29 (round 5's C4):
      the authorization is NOT granted; the blocker is the pin in
      `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`, which row
      G7 QUOTES rather than only cites, and unblocking it needs an owner
      decision against that pin — settled, if it is settled, by an amendment to
      that `Done` spec.** Its carrying surfaces are the Deliverables `Notes`
      cell for `src/core/dream/validate.js`, Current state's validate.js
      bullet, row G7, Table V row V3, the Out-of-scope bullet for the EP2
      gate's durable quarantine lifecycle (where it is the SECOND, PENDING
      exception), **and — in `WP-dream-promote-module`, because the input is
      ROUTED FROM there and the pending state must be legible on both sides —
      row Q10 and Out-of-scope bullet (ii), whose own side of this
      registration is that spec's checklist entry for the pending counting
      input (round 6's COH-1: this entry named NO module surface while the
      module registered the state in neither of its checklists, which is round
      5's H4 one spec over, in the window that fixed H4)**. Per the convention
      stated in the carrier-change entry above, this entry is the registration
      and is not one of the surfaces it lists. **No surface may present it as authorized
      work; none may describe `lines` as a count of CHANGED lines while it is
      pending (`WP-dream-promote-module`, row Q10); and none may add an
      acceptance criterion for it before the decision — the criterion lands
      with the change.** **It reached ONE surface for a round while the carrier
      change — the same class of act, ruled the same day — reached every
      surface its own entry registers: round 5's H3.**
- [ ] **THE PARTIALLY PUBLISHED REPORT — this side of a TWO-SIDED contract,
      which this spec registered NOWHERE for a round (round 5's H4).** The
      contract is `WP-dream-promote-report`'s **Table Y**
      (`accounting:{published:false, reason}` on the `promoted` arm, round 4's
      A1; a lettered table since 2026-08-30, so a citation of it names a ROW)
      and that spec's Table Y checklist entry names rows **G8**, **G11** and
      **V4** as its mirrors; this entry is the registration on this side. Its mirrors here are
      row **G8**'s report-path clause, row **G11**'s obligation **(i-b)**, row
      **V4**'s "Inherited by" cell, the decided-bytes acceptance criterion
      (which asserts G8's clause) and the report-refusal acceptance criterion
      (which asserts G11's, partitioned by WHICH WRITE was refused). **No
      surface here may assert the vault object is byte-unchanged on that form**
      — the body published, and that clause is the refused arm's alone; **none
      may skip the report path in the run's one commit on that form; none may
      manufacture the missing enforcement section; and none may assert that
      arm's `bytes` is byte-equal to what the vault then holds, NOR SAY THE BODY
      IS IN THE VAULT ON THAT FORM** — the refusal's
      own cause can be, and on an `expect` conflict IS, the vault no longer
      holding those bytes (round 5's C5), **and round 6's CD-1 found row G8
      still making the claim in the reworded form "the bytes the vault holds"
      while THIS ENTRY, four lines above this prohibition, already named that
      clause as its mirror. The rule was right and nothing walked it.**
      **One mirror is ADDED (round 6's CD-3): the report-refusal criterion's
      case (b) also asserts the NEUTRALISATION of `report.accounting.reason`,
      because that channel is rendered by this package and composed by neither
      write — `WP-dream-promote-report`'s Table N classifies it and its
      code-authored-section criterion scopes it out of its own domain.**
- [ ] **The `records` handoff** — row G12 produces them, row G11 delivers one
      copy, and `WP-dream-promote-report`'s `records` input takes the other.
      **Two channels, deliberately: a log line is not a durable record.**
- [ ] **Table V — what the validator owns and who inherits it.** Its mirrors are
      Current state's step list, every Table G row named in its "Inherited by"
      column, and the acceptance criteria those rows carry. **The claim this
      bullet used to make — "a Table G row inherits each step" — was asserted
      with nothing to check it against and was FALSE (round 3, F3 found Step 1
      unowned). Table V is the checkable form: a row of it with no owner, or an
      owner that is not a real Table G row, is the finding.** A behaviour dropped
      on purpose is an entry saying so, never an absence. Both name `WP-dream-promote-module` as the owner of the rule and
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
      applied by it and cited here. **This package writes no PROMOTION content
      byte of its own** — `promote()` is the only writer of promoted content —
      and it implements no path containment of its own. **The one other
      vault-content write a run governed by this package performs is the
      code-owned warnings refresh:** `refreshWarnings`
      (`src/core/dream/warnings.js`, imported at `src/cli/dream.js:13`), whose
      content, timing and composition are `WP-quarantine-warnings-file`'s and
      are cited here, never restated. **An earlier form said this package
      writes no vault content byte at all and named `promote()` the only
      writer outright, which that file's refresh points falsify.**

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
      **And the EP2 gate's DURABLE lifecycle SURVIVES the same edit (Table V row
      V3).** All three behaviours are still reachable and still behave as their
      owner decides them: the preservation-failure abort
      (`validate.js:1298-1323`), immediately ABOVE the revert core; the
      identity-gated deletion of a redundant `redacted/` copy (`:1338-1360`),
      below it and inside the same per-path loop, with the revert core's reason
      suffixes (`:1333-1337`) between them; and the once-per-run retention prune
      (`:1365-1366`), immediately after that loop closes.
      **Their contract is
      `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`'s** — cited by spec
      path, because its table letters collide with this family's — **and this
      criterion asserts only that the extraction did not remove or alter their
      DECISIONS**; their own assertions and mutation coverage are that shipped
      package's and are not duplicated here. **Proven RED against an extraction
      that deletes EACH of the three along with the revert core — one RED per
      behaviour, not one for the set.**
      **And ONE further case, which is the identity-gated deletion's ANNOUNCEMENT
      rather than its decision (row G7, row V3):** on the keep combination — the
      redact arm's copy survives the withhold — the run's result carries that
      copy as an entry on the EP2 gate's preservation record, with its own
      `location`, and the refusal reason names no copy at all
      (`WP-dream-promote-module`, Table Q rows Q1, Q8 and Q9). **Proven RED
      against an extraction that preserves `:1338-1360` byte-for-byte**, which
      keeps the append at `:1358` to a `reason` whose only consumer this package
      deletes — the copy is then kept and announced to nobody — **and separately
      RED against one that drops the keep branch without adding the record
      entry**, which loses the announcement the other way. The identity-gated deletion gets its own RED and is
      named first, because it is the only one of the three that lies INSIDE the
      span an over-wide removal takes, and because the removal range this spec
      itself published until 2026-08-29 contained it: a criterion that proves RED
      only on the abort and the prune cannot discriminate the failure it is most
      likely to meet.
- [ ] **The dream commit contains the promoted paths, the report, and the
      code-owned `reports/warnings.md` whenever its canonical render differs from
      HEAD — on the absent-HEAD arm only when the ledger holds at least one active
      quarantine — and nothing else (row G8).** With an unrelated uncommitted user edit
      present in the vault, that edit is **not** in the dream commit and is **not**
      lost. **The warnings file is asserted as a RECONCILIATION, in five cases, and
      the first two are the ones an authorship test fails:** (a) a run writes the
      file at refresh point 2 (after its own commit), quiet nights follow, and the
      next run that commits — a run that writes the file nowhere — still carries it,
      with the bytes the earlier run wrote; (b) the same for a write-if-absent write
      on a fully idle run that makes no commit at all; (c) a run whose render equals
      the content at HEAD omits the file entirely, so an unchanged quarantine set
      produces no churn commit; (d) a run whose ledger moved commits the render for
      the pinned ledger, byte-identical to what
      `WP-quarantine-warnings-file`'s `composeWarnings` returns for that same
      ledger; (e) a run whose ledger holds no active quarantine and whose `HEAD`
      lacks the file commits no warnings file at all.
      With a stray user edit **anywhere** in the file on disk — including bytes
      appended below every heading — the commit carries the canonical render, none
      of the edited bytes appear in it, and the edit stays in the working tree,
      uncommitted and undeleted.
      **Proven RED twice, because the row has two failure modes:** against a commit
      that carries only the promoted paths and the report — which, with
      `precommitSessionEdits` gone (row G6), strands the file uncommitted forever —
      **and against a commit that keys eligibility on whether THIS run wrote the
      file**, which passes (c) and (d) while failing (a) and (b) exactly as round 2
      found.
- [ ] **The commit carries the decided bytes, not a fresh read (row G8).** With
      a user save landing between the publish and the staging call, the
      committed content for that path is the bytes promotion approved, and the
      user's post-publish bytes are neither committed nor lost. Proven RED
      against an implementation that stages by naming the path. Asserted for a
      REDACTED path as well as a promoted one, since both carry `bytes` and both
      enter the commit. **How the bytes reach the index is not asserted** —
      round-4 CUT ruling. **ASSERTED FOR THE REPORT PATH ON A PARTIAL PUBLISH
      TOO (row G8, round 4's A1; this obligation carried no criterion until
      round 5's H4):** when `promote()` returns `report.outcome === 'promoted'`
      with `accounting.published === false`, the report path IS in the run's one
      commit and what is committed is that arm's `bytes` — the body the first
      write published. **Proven RED against a pipeline that SKIPS the report
      path on that form**, which drops a published, gated file out of the run's
      one commit, **and separately RED against one that MANUFACTURES the missing
      enforcement section**, which commits bytes no gate judged and no primitive
      published.
- [ ] **The skill-ownership registry still gets its entry (row G10).** A
      production-shaped run in which the brain writes a new dream-created
      `SKILL.md` that is promoted and committed leaves a `state/skill-registry.json`
      entry for it, whose `id` and `created` come from the DECIDED bytes.
      Asserted for a REDACTED acceptance as well as an ordinary one. Negative
      cases in the same criterion: a REFUSED skill, a modification of an existing
      tracked skill, and a shipped `wienerdog-*` skill each leave no entry.
      **Proven RED against a pipeline that never calls `recordSkills`** — the
      failure mode round 2 found, where the validator's own unit test still
      passes while production registration is dead.
- [ ] **Every report refusal reaches the user, and the TWO refusal shapes are
      asserted APART (row G11, round 3 F1; partitioned by round 5's C3).**
      **(a) THE ONE-WRITE PATH's WRITE IS REFUSED — `report.outcome ===
      'refused'`, `WP-dream-promote-report`'s Table R row R4.** For an `expect`
      conflict AND for a symlinked report target on THAT write, the run's log
      and user-visible output carry the COMPLETE enforcement record and the
      refusal's named reason, the vault object is byte-unchanged, and nothing
      is staged or committed for the report — there are no bytes to commit
      (`WP-dream-promote-module`, Table S row S3).
      **(b) THE BODY PUBLISHED AND THE SECOND WRITE WAS REFUSED —
      `report.outcome === 'promoted'` with `report.accounting.published ===
      false` (round 4's A1).** For an `expect` conflict AND for a symlinked
      target on that SECOND write, the log and output carry the COMPLETE record
      — the redaction line and every preserved-copy line the unpublished
      section would have carried included — and the run's accounting names
      `report.accounting.reason`. **(a)'s OTHER TWO CLAUSES ARE ASSERTED NOT TO
      HOLD HERE, and that is the whole point of the partition:** the vault is
      NOT byte-unchanged, **because THIS RUN'S FIRST WRITE PUBLISHED THE BODY
      INTO IT** — the assertion is about the CHANGE this run made, never about
      what the target holds at the end, which is refusal-cause-specific and is
      `WP-dream-promote-report`'s Table Y row **Y4**'s; **an earlier form said
      "because the body is in it", which that row forbids and which is false on
      both refusal causes (round 6's CD-1)** — and the report path IS
      committed, from that arm's `bytes` (row G8).
      **AND THE REFUSAL REASON IS NEUTRALISED WHERE IT IS RENDERED — the
      assertion round 5 left this channel without (round 6's CD-3).**
      `report.accounting.reason` ORIGINATES WITH THE VAULT-WRITE PRIMITIVE
      (Table H, the PRIMITIVE's row **H7**), and that spec's rows H7 and H9 name
      a surviving staging object or directory whose name DERIVES FROM THE
      BRAIN-CHOSEN PATH — so `WP-dream-promote-report`'s Table N classifies it
      attacker-influenceable BY DERIVATION, and **this criterion is where that
      classification is enforced, because this package is the party that RENDERS
      it: the write that would have composed it is the very one that was
      refused, so that spec's code-authored-section criterion does not reach it
      and says so in place.** **GREEN:** with a report path whose primitive
      refusal reason carries both markdown-active text and a context-dependent
      secret — at least `token=abcdefghijkl` AND `client_secret: abcdefghijkl`,
      because a prefix-shaped secret survives the sanitiser intact and is caught
      in either order — the raw secret bytes appear nowhere in the run's log or
      user-visible output. **RED against a pipeline that renders
      `report.accounting.reason` raw**, which passes every other clause here.
      **Proven RED against a pipeline that consumes
      `promote()`'s published outcomes but never reads `report.record`** — which
      passes every other criterion here while losing the only surviving copy of
      the run's decisions — **and separately RED against one that applies (a)'s
      byte-unchanged and nothing-committed clauses to (b).** **That second RED
      is this criterion's own history:** until round 5 it named (b)'s two
      trigger cases as its ONLY trigger cases and then demanded exactly what
      row G8 requires the opposite of, while re-asserting the untouched-vault
      clause the report package's checklist forbids copying onto that outcome.
- [ ] **An unexpected scratch write is deleted AND recorded (row G12, round 3
      F3).** With every expected extract present and byte-intact, a brain that
      also writes `<scratch>/EVIL.json` does not abort the run; the file is
      removed and the violation appears in the run's output and in the report's
      enforcement section. **Proven RED against `scratchIntact` alone**, which is
      green on that input — the measurement that shows the two are not the same
      check. The fail-loud abort for a MISSING or CHANGED expected extract is
      asserted unchanged in the same criterion.
- [ ] **Teardown never destroys the last copy (row G5, citing Table Q's Q4).**
      With a note whose redaction failed AND whose withheld preservation failed,
      the run refuses fail-loud and the workspace is NOT torn down; the note's
      bytes are still on disk afterwards. Proven RED against a teardown wired to
      every exit path without the exception — which passes every other teardown
      criterion here while destroying the only copy.
- [ ] **Scratch and the lock keep their ordering (row G5, Table V row V9).**
      Scratch is removed before the lock is released, and a process that no
      longer owns the lock removes neither. Proven RED against a teardown that
      releases first, which lets a successor's scratch be deleted underneath it.
- [ ] **The dry-run previews the run that actually happens (row G1, Table V row
      V8).** The composed argv the preview prints is byte-identical to the one
      the real run spawns, workspace target included. Proven RED against a
      preview left pointing at the vault.
- [ ] **The counts keep their exact semantics (row G11, Table V row V7).** A run
      whose brain writes a note, a file under the skills directory that is NOT
      `SKILL.md`, a deletion, and the report produces counts that include the
      note and the skills-directory file, and exclude the deletion and the
      report. Asserted on the commit message AND the summary line, since both
      carry them. Proven RED against an implementation that counts only
      `SKILL.md`, which is the plausible reading of "skills". **`reports/warnings.md`
      is asserted in the same criterion:** a run whose commit carries it (row G8's
      third clause) counts it as neither a note nor a skill. Proven RED against a
      pipeline that re-derives the counting rule without
      `WP-quarantine-warnings-file`'s Table D exclusion, which reports the
      code-owned file as one extra user note in the user's own git history.
- [ ] **The digest is regenerated after the ledger is persisted (row G4, Table V
      row V10).** With a run that defers a transcript, the digest a following
      session reads reflects the persisted ledger, not the pre-run one. Proven
      RED against the reversed order.
- [ ] **Scratch violations reach the durable report, not only the log (row G12,
      round 4's F1).** An unexpected scratch write appears in the dream report's
      enforcement section, having travelled through `promote()`'s `records`
      input. Proven RED against a pipeline that logs the violation and passes
      no records — which satisfies the log half and loses the durable half.
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

- **`WP-dream-promote-report`'s contracts** — Tables N, R and Y and the report row: the neutralisation contract for every attacker-influenceable channel,
  body as a promotion candidate, the code-authored second write, the
  preserve-and-extend fallback and its four cases. This package DELIVERS
  `report.record` (row G11) and PRODUCES the `records` that package consumes
  (row G12); it owns neither contract.
- **`WP-dream-promote-module`'s contracts** — Tables C, D, E, Q and S: the
  promotion decision, the allowlist, the merge, the gate inputs and order, the
  EP2 taxonomy, the publish through the primitive, and the decided bytes. **The
  report and its fallback are `WP-dream-promote-report`'s, listed above.** This package CONSUMES `promote()` and cites those
  tables; it may not restate them, re-implement any part of them, or write a
  vault content byte of its own. **Two relationships, deliberately not the same
  count:** the module names **two HANDOFFS**, discharged by rows G7 and G8 and
  nothing beyond them; Table S names **two CONSUMERS of the decided bytes**,
  rows G8 and G10. G8 is both. G10 is a consumer, not a handoff — the obligation
  it inherits is the validator's Step 6, not one the module ever owned.
- **The EP2 gate's DURABLE quarantine lifecycle as a CONTRACT** — the retention
  prune, the identity-gated deletion and the preservation-failure abort are
  decided, asserted and mutation-covered in the shipped
  `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`. This package touches the
  code they live in, so row G7's criterion asserts that the extraction
  preserves their DECISIONS; it may not change what any of them DECIDES, and it
  may not restate the rules. **TWO EXCEPTIONS, AND THEY DO NOT HAVE THE SAME
  STATUS — ONE AUTHORIZED, ONE PENDING (round 5's C4).**
  **(i) AUTHORIZED, owner-ruled on 2026-08-29
  and not this package's to widen or re-open:** the identity-gated deletion's
  keep branch (`validate.js:1357-1359`) announces the copy it keeps through a
  `reason` this package deletes, so its CARRIER moves to the preservation
  record (`WP-dream-promote-module`, Table Q rows Q1, Q8 and Q9). Which copy is
  deleted and which is kept is unchanged.
  **(ii) PENDING, AND NOT AUTHORIZED (owner ruling, 2026-08-29):** row G7's
  named input would narrow the EP2 gate's redaction-accounting `lines` from the
  shipped `addedLineNumbers.length` to the number of added lines whose
  POST-REDACTION bytes DIFFER — and that shipped package PINS the value, at
  `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`, where `<n>` is
  `addedLineNumbers.length` and every byte outside the placeholders is literal.
  Row G7 quotes that pin in place. **Unblocking it requires an OWNER DECISION
  against the pin; if it is authorized at the pipeline round the settlement is
  an AMENDMENT to that `Done` spec, exactly as the carrier change's is. Until
  then this package BUILDS THE SHIPPED COUNT.**
  **This bullet said they SURVIVE the
  extraction and that nothing may change what they do, which contradicted the
  four surfaces in this spec that landed the carrier change — round 3's F4 — and
  it then said there was EXACTLY ONE exception while row G7 read as an
  instruction to ship a second: an implementer reading here refused what an
  implementer reading there built (round 5's C4).** **Cite that
  spec by path, never by bare table letter — its letters collide with this
  family's.**
- **`src/core/dream/scratch.js`** — row G12 preserves Step 1's behaviour inside
  this package's own deliverables; the scratch module itself is not modified.
- **`src/core/dream/skill-registry.js`** — row G10 CALLS `recordSkills` and does
  not change it. The registry's own file format, atomicity and read behaviour are
  `WP-083-skill-ownership-registry`'s, shipped and untouched here.
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

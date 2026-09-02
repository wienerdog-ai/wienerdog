---
id: WP-dream-promote-in-workspace
title: Rewire the dream pipeline onto the workspace and promotion
status: Done
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
`src/core/dream/validate.js`, so its merge moves the line citations below — and that merge HAS LANDED on this branch (`a76c328`): the citations below are known-shifted, and the re-verification this block mandates is now unconditional, not a contingency.
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
| modify | tests/unit/frontmatter-digest-differential.test.js | **AMENDED IN, owner ruling of 2026-08-30 (see the amendment note below).** Row G7 retires `validateAndCommit`, and this file is the ONE surface outside this table that still calls it (`:72`) — for the validator half of a two-sided parity assertion. It is re-pointed at the extracted `tier3` gate, which IS that decision after the extraction. Nothing else about the file changes |
| modify | docs/adr/0012-dream-run-lifecycle.md | the lifecycle this package changes |
| modify | docs/specs/MILESTONES.md | **AMENDED IN, owner ruling of 2026-08-31 (amendment note 3 below).** Release gate **M3**'s acceptance cell asserts "`git revert` cleanly undoes a run" — the exact claim Table W row W4 measured to be conditional. ONE cell changes; no other milestone row moves |
| modify | docs/THREAT-MODEL.md | **AMENDED IN, owner ruling of 2026-08-31.** Two W4 mirrors: T1's one-commit mitigation bullet (`:84`) and T3's rollback-story sentence (`:115`). **`:415`'s "one revertible commit" is deliberately NOT changed** — it names the PROPERTY, which survives; see amendment note 3 |
| modify | docs/adr/0010-vault-adoption-paths.md | **AMENDED IN, owner ruling of 2026-08-31.** Its Context (`:20`) rests the whole adoption-requires-git decision on the immediate-revert form of the T1 guarantee, so the premise moves with W4 while the decision it supports does not |
| modify | tests/integration/adopt-e2e.test.js | **AMENDED IN, owner ruling of 2026-08-31.** Three assertions Table W row W4 falsifies — `git ls-files` (`:208`), the unguarded `git revert` (`:213`) and the `git status --porcelain` emptiness check (`:217`). **They were unreachable on the author's machine**, which dies earlier at `:204` on an executable-pin mismatch, so the file's measured `+0` delta said nothing about them. **CONDITION: they may not be fixed blind** — the die-point is bypassed in a local scratch run so the amended assertions are proven EXECUTED, red against the old shape and green against the new, before the commit lands |
| modify | src/cli/adopt.js | **AMENDED IN, owner ruling of 2026-08-31.** The adoption-time CLI text carrying the retired one-command claim (`:123`, `:275-277`), moved to the same user-voice phrasing `docs/PRD.md` now carries. User-facing text, not logic |
| modify | docs/adr/0020-skill-revision-lifecycle.md | **AMENDED IN, owner ruling of 2026-08-31.** Decision part 4's rollback sentence (`:147`) and the Consequences' literal "git revert is one command" (`:188`). **`:180`'s "plain, revertible commit" is deliberately NOT changed** — same reason as `docs/THREAT-MODEL.md:415` |
| modify | docs/PRD.md | **AMENDED IN, owner ruling of 2026-08-31 — AND THIS SURFACE WAS MISSED BY THE STOP-POINT'S OWN FIVE-SURFACE LIST.** `:21` reads "revert any night with **one git command**" — the literal claim the ruling retires, in the product's first-person voice. The checklist bullet above exculpated `docs/PRD.md` by name, but that exculpation was measured at `:11` (one commit per run, which W1 genuinely does not touch) and never reached `:21` ten lines below. **A file cleared by association at one line is not cleared at another**, which is this package's own grep-the-claim-not-the-sentence rule turned on its own register |

**Not in this package, and the exclusions are load-bearing.**
`src/core/dream/promote.js`, `src/core/dream/vault-write.js`,
`src/core/dream/workspace.js`, `src/core/dream/delta.js`,
**`src/core/dream/warnings.js` (row G8's third clause calls its exported
`composeWarnings` and changes nothing in it)** and
`src/core/reap.js` are all CONSUMED and none is modified.
`docs/GLOSSARY.md` is `WP-dream-promote-module`'s (the name **promotion**).

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

**AMENDMENT NOTE — 2026-08-30, owner ruling, one row added.** The implementer
stopped on the boundary rather than working around it, which is what this
paragraph asks for. **The rule the ruling states: when a contract RETIRES a
surface, the Deliverables table must list that surface's consumers too — a
table that lists only the surface leaves its callers red with no in-boundary
fix.** Row G7 requires the EP2 revert core to be UNREACHABLE, and its three
named spans (`validate.js:1325-1333`, `:1334-1338`, `:1362-1364`, re-verified
on `152ae3a`) all sit inside `validateAndCommit`'s Step 3; removing them leaves
a validator that preserves a secret and then commits it, so the function is
retired rather than reduced — which is also what Table V's six inheritances
already say. **The grant is ONE EXACT FILE ROW, never a directory prefix**
(`WP-dream-workspace-retarget`'s amendment of 2026-08-27 is the precedent, and
its reason holds here: a trailing-slash row under `tests/unit/` would open the
integrity guards this family's designs exist to satisfy).

**AMENDMENT NOTE 3 — 2026-08-31, owner ruling, FIVE rows added and the
STOP-POINT discharged.** Table W row W4 measured that this package makes
ADR-0012's revertability conditional on `git reset`, and the Mirrored Surface
Checklist registered five OUT-OF-BOUNDARY surfaces that still state it as
immediate. That divergence was routed to the owner rather than papered over.
**The owner ruled AMEND: the drop stands, and the five surfaces are rewritten to
the CONDITIONAL form.** The rows above are that ruling's boundary.

**What the ruling preserves, and what it retires.** What survives is the
PROPERTY — *a run is deterministically and loudly undoable* — which is what the
M3 gate and THREAT-MODEL T1 actually guarantee. What dies is the literal **"one
command"**. **The conditional form is not a weakening of the guarantee; it is the
guarantee stated accurately.** A reversibility mechanism that silently destroyed
unresolved merge stages was self-defeating, and every rewritten surface carries
that reading so a later reader cannot mistake the change for a retreat.

**The route is amendment note 1's rule applied a second time:** *when a contract
retires a surface, the Deliverables table must list that surface's consumers.*
Row W4 retires the immediate-revert claim; these five files are its consumers.
**The grant is FIVE EXACT FILE ROWS, never a directory prefix** — `docs/` carries
ADRs this package has no business editing, and a prefix row would open every one
of them.

**ONE CANONICAL PHRASING, used byte-identically on every amended surface —
`git reset` then `git revert <sha>`, WITHOUT a comma before `then`**, plus the
loudness limb: the revert **refuses (exit 128) rather than applying in part**
when the reset is skipped. The comma is pinned because it was not: the first
draft ran `` `git reset` then `` on four surfaces and `` `git reset`, then `` on
two, which falsifies the word "byte-identically" in the very sentence that
claims it (C-band nit, 2026-08-31).

**AND THE FIRST FIX OF THAT NIT MISSED TWO MORE, WHICH IS THE LESSON RATHER THAN
THE TYPO (round 5, C1/C2).** It reported normalising "all seven occurrences"; the
family-wide, multiline-aware count over every tracked file is **TWELVE**. Two
deviations survived — a comma form in `docs/adr/0020` that WRAPS A LINE BREAK, so
no single-line grep could see it, and a bolded `` **then** `` in `docs/adr/0012`,
on the very surface that says of itself that it decides this fact. **The
denominator failed, not the edit.** So the standing discipline for this phrase,
owner-ruled: **the proof of a fix is the RE-GREP, never the edit** — flattened
across whitespace, over every tracked file, with the output pasted. Measured
after the round-5 pass: 12 occurrences, 12 canonical, 0 deviations.
Five surfaces paraphrasing one fact five ways is how this family earned Table W
in the first place, so the phrasing is fixed rather than left to each site.

**THREE SURFACES ARE DELIBERATELY NOT CHANGED, and the exclusions are load-bearing
because they look like misses.** `docs/THREAT-MODEL.md:415` (*"every run is one
revertible commit surfaced in a readable report"*) and
`docs/adr/0020-skill-revision-lifecycle.md:180` (*"each is a plain, revertible
commit"*) both name the PROPERTY the ruling explicitly preserves, not the
mechanism it retires. Amending them would assert that revertability itself
weakened, which is the misreading this whole note exists to prevent.
`README.md:69` (*"Every night is at most one git commit; anything can be
reverted"*) is excluded on the same ground and therefore takes no row.
**Each is named here so the next sweep does not "fix" it.**

**THREE CONSUMERS FOUND OUTSIDE THE STOP-POINT'S LIST, and two of them are NOT
DOCUMENTATION.** `docs/PRD.md:21` is granted above. The other two are
`src/` and `tests/`, are NOT granted here, and are recorded under
"Discovered issues" instead — see the Implementation-notes bullet
*"the immediate-revert claim outside `docs/`"*, which states what each is and why
neither is fixed from a documentation ruling.

**AMENDMENT NOTE 2 — 2026-08-30, owner ruling, one verification step's POLARITY
inverted.** The step read `grep -q "assertCleanTree" src/cli/dream.js` — a
PRESENCE check. **The rule the ruling states: when a contract requires a call to
disappear, its verification step asserts the ABSENCE, and a presence check
inherited from the pre-contract shape is a mirror the contract already
falsified.** Row G3 says the abort keys off the marker AND an empty workspace
delta, "never off the vault"; the row G6 criterion says the guard discriminates
"without reading the vault". After that re-base there is no vault read left to
grep FOR, so the presence form could only be satisfied by keeping the very call
the contract deletes — and an implementer following the contract would have
shipped a red step. The step is now
`test -f src/cli/dream.js && ! grep -q "assertCleanTree" src/cli/dream.js`,
with the same absence-guard the `precommitSessionEdits` step already carries
(grep on a missing file exits 2, which `!` would turn into a false green).

**Its mirrors were swept in the same pass, which is the part the last inversion
of this class did not do:** row **G6**'s "does NOT go" sentence, now stating that
the CONSUMER is the guard and the guard's CALL is what re-basing replaces; the
Implementation-notes bullet, whose "deleting both, or neither, are both wrong"
became "deleting the GUARD is wrong; keeping the CALL is wrong"; the **row G6
acceptance criterion**, whose RED moved off the withdrawn "deletes both
`assertCleanTree` uses" — not a mutation at all once the correct implementation
has no such use — and onto dropping the guard's DELTA half, which is the vacuity
that matters; the red-proof bullet under Verification steps; and the note
classifying what that grep is worth, now an ABSENCE check. Current state keeps
its `:508`/`:251` citations unchanged: they describe the tree this package
starts from, which the amendment does not move.

**The row is scoped by MEASUREMENT, not by estimate.** Every consumer of
`validateAndCommit` outside `src/` was swept:
`tests/unit/dream-validate.test.js` (a Deliverables row already),
`tests/unit/frontmatter-digest-differential.test.js:72` (granted here) and
**two hits in `tests/fixtures/dream/fake-brain.js` that are COMMENTS**
(`:187`, `:195`) — prose describing the old pipeline, not a call. The fixture
is not granted and the comments are not a contract; their staleness is recorded
under "Discovered issues" instead, exactly as the excluded-file discipline
requires.

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
 *                     reap:{verified:boolean, why:string}}>}
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

**Three canonical tables.** **Table G** is the pipeline's own contract. **Table V**
is the inheritance ledger — what the code this package replaces owns today, and
which Table G row takes each piece — extracted by the ADR-0031 circuit-breaker
after four findings in two rounds lived in the gap between them. **Table W** is
the user's git index: the one vault resource this run deliberately does NOT
write, extracted 2026-08-31 by the same circuit-breaker after **four data-loss
defects in four review rounds** landed in an area no table owned.

**Why Table W exists at all, stated because its absence is the defect it fixes.**
The index-refresh mechanism's rules lived only in code comments, and the one
spec sentence that reached the area declined to contract it. The round-4
spec-fidelity gate's finding is the row above in one line: *a residual no spec
names is a residual no gate can check.* **ADR-0036 does not reach Table W** — its
scope is tables that tell an implementer how to PRODUCE a state (fault-injection
and mutation tables, and any table carrying a `mechanism`/`seam` column), and
Table W states what must be TRUE. It therefore carries this family's ordinary
`Fact / rule | Value` shape, as Tables G and V do.
**That holds after the 2026-08-31 amendments, and the point is worth stating
because the first of them moved row W1's enforcement onto a git execution SEAM
and the second changed what that seam DECIDES — from classifying each
invocation's intent to matching it against the run's own pinned calls.**
ADR-0036's trigger is a **column**, not a word: Table W gains no `mechanism`,
`seam` or `how to produce it` column, and W1 still states a TRUTH — *no git
invocation the run makes falls outside the run's own pinned call set* (the
total ranges over the run's OWN acts; **row W1(a)** defines that scope and this
sentence cites it rather than restating it) — with the seam named as the place
that truth is OBSERVED. **An observation point is
not a state-production recipe**, which is the distinction ADR-0036's scope line
draws. **A pinned call set is not one either**: it enumerates what the run
already does, measured, rather than telling an implementer how to produce a
state — which is why the set lives in W1(c) as a fact and not in a table with
a `mechanism` column. The mutation obligations the amendments add live in row
W5, as measurements already taken, not as a mutation table.

### Contract table(s)

`N/A — this spec's dense contracts are three NAMED canonical tables (G, V and W)
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
| G6 | **`precommitSessionEdits` does not survive, and one of its two neighbours must be re-based** | measured: its stated job is "so the subsequent dream diff is exactly the brain's writes" (`validate.js:113-115`). Under this package the brain writes nothing in the vault, so there is no such diff, and `promote()`'s three-way compare reads `vault-now` from the **filesystem** rather than from git. What remains is only its cost: it commits the user's in-flight edits under the `wienerdog` identity without asking. The call at `cli/dream.js:507` goes, and the `assertCleanTree(vaultDir)` at `:508` — its precommit-pairing use — goes with it. **The SECOND consumer of `assertCleanTree` does NOT go and must be re-based: G3 owns it.** `cli/dream.js:251` uses vault-cleanliness to tell a genuine brain rejection from a working run, and that signal's premise (the tree was clean immediately before spawn) is exactly what removing the precommit destroys. **What "re-based" COSTS that consumer was settled by owner ruling on 2026-08-30, because this row and G3 read as opposite instructions for one round: the CONSUMER is the GUARD, and the guard survives; the guard's CALL to `assertCleanTree` does NOT, because replacing that call IS the re-basing.** G3 says the abort keys off the marker and an empty workspace delta, "never off the vault" — so a guard that still called `assertCleanTree` would not have been re-based at all. The verification step's grep was inverted to match (`! grep -q`), and the amendment note under Deliverables records why a PRESENCE check could not hold beside G3 |
| G7 | **The gate-extraction handoff, discharged here** | `WP-dream-promote-module`'s Table D states what `promote()` does with the four gates it is HANDED, and names the extraction as this package's. Discharged here: the four gates become functions this pipeline can inject — the EP2 gate returning the ADR-0034 taxonomy, the other three returning `reason\|null` — each taking the input `WP-dream-promote-module`'s Table D assigns it, none consulting git. **`validate.js`'s EP2 enforcement half goes with them:** the revert core at `:1324-1332` reverts, re-stages and drops index entries for bytes that, under promotion, were never written to the vault, so it has no subject; the refusal-reason suffixes it composes (`:1333-1337`) go with it; and so does the `reverted[]` accounting they feed (`:1361-1363`) — `promote()`'s own refusal accounting replaces all three. **What must NOT go with them is the identity-gated deletion of the redact arm's redundant copy (`:1338-1360`), which sits between the suffixes and the accounting, inside the same per-path loop (`:1233-1364`), and is durable-lifecycle behaviour rather than enforcement** (row V3). **An earlier form of this row named `:1324-1364` as the removal — a range that CONTAINS that deletion and ends on the enclosing loop's own closing brace, so it could not be applied literally without unbalancing the function. Corrected 2026-08-29.** **AND THE MUST-SURVIVE SPAN TAKES EXACTLY ONE CHANGE, which is this row's hardest instruction and was found by a design round the same day: its KEEP BRANCH (`:1357-1359`) announces the copy it keeps by appending to `reason`, and `reason`'s only consumer in the loop is `:1361`, inside the removal — so preserving that span byte-for-byte would preserve a behaviour whose output channel this row deletes.** The DECISION is unchanged and stays exactly as its owner decides it — the byte-identity guard, which copy is deleted, which is kept. **What changes is the CARRIER: the kept copy becomes an entry on the PRESERVATION RECORD** (`WP-dream-promote-module`, Table Q rows Q1 and Q9) — the GATE fills that entry's `artifact` and `location`, and `promote()` fills its `remediation`, which is that spec's row Q9's per-field provenance and is cited here rather than restated, reaching the user through the dream report's preserved-copy line instead of through a refusal reason — which is also what Table Q row Q8 requires of every fact about a preserved copy, and why prose could not have stayed the carrier. **This is an owner-authorized change to how a shipped `Done` package's contract item is carried, ruled 2026-08-29, not an implementer's latitude:** that package's own Table Q registers the suffix as the only thing announcing that copy, so the obligation is discharged rather than dropped, and an extraction that removes the suffix without adding the record entry loses the copy. **What survives the removal is the redact DISPOSITION, on the promotion side rather than the revert side** — Table D's EP2 row is the owner of that distinction and this row does not restate it. **The gates' semantics are not this package's to change, WITH ONE ANNOUNCED EXCEPTION — the named input below, which is PENDING and NOT authorized**: the extraction moves where their evidence comes from, per that Table D, and beyond that one input, nothing else. **An earlier form closed this sentence with "and nothing else" and then appended the input AFTER the closing universal, leaving a universal the next sentence falsifies — round 5's H2, and the contrast is the carrier change above, which is announced BEFORE its universal closes.** **ONE NAMED INPUT, PENDING, and it IS a semantic change — routed here by the owner ruling of 2026-08-29 (round 4's B1) because this package owns `src/core/dream/validate.js` and extracts this gate: the extracted EP2 gate WOULD return, as its redaction accounting's `lines`, THE NUMBER OF ADDED LINES WHOSE POST-REDACTION BYTES DIFFER FROM THEIR CAPTURED BYTES.** Today's shipped value is `addedLineNumbers.length` (`validate.js:1286`) — every added line the scrub RAN OVER, because `scrubAddedLines` rewrites each one as `scanAndRedact(line).text` (`:838-840`) and a clean line is rewritten byte-identically — so the shipped count can exceed the number of lines whose bytes CHANGED, and the shipped report line renders it as "line(s) scrubbed" (`:1401`). **`WP-dream-promote-module`'s Table Q row Q10 states that shipped truth and names the gap in place; the FIELD's shape, its provenance and its carriers are that row's and are not restated here — what is this package's is the counting.** **PENDING, AND THE BLOCKER IS QUOTED HERE RATHER THAN ONLY CITED — the authorization is NOT granted (owner ruling, 2026-08-29, round 5's C4).** The value this input changes is PINNED in a shipped `Done` package, `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`, which pins the dream report's redaction line and says so in as many words — quoted here rather than only cited, per the ruling. **QUOTED VERBATIM: the three fragments below are exact contiguous text of that source, ellipses appear only BETWEEN exact fragments, the source's own bold markers are not reproduced, and no emphasis is added here** — "The line format is pinned here, not illustrated. … Every byte outside the angle-bracket placeholders is literal … where `<n>` is `addedLineNumbers.length`". **An earlier form re-cased two of the three fragments and still called itself a quotation (round 6's CD-2). The mis-quoted sentence was the one saying that every byte outside the placeholders is literal, which is why this is a contract defect and not a typo: this is the family's ONE exception to cite-never-restate, and an exception that alters the bytes it exists to reproduce has not been taken.** **So the input changes exactly `<n>`, in the spec that pins it. UNBLOCKING IT REQUIRES AN OWNER DECISION AGAINST THAT PIN — it is not this package's to grant, not an implementer's latitude, and not resolvable by reading this row. If the owner authorizes it at the pipeline round, the settlement is an AMENDMENT to that `Done` spec, exactly as the carrier change's is.** **UNTIL THAT DECISION AN IMPLEMENTER OF THIS PACKAGE BUILDS THE SHIPPED COUNT AND NOT THIS ONE**, and no surface in this family may describe `lines` as a count of CHANGED lines (`WP-dream-promote-module`, row Q10). **THIS IS THE SECOND EXCEPTION IN THIS ROW'S OUT-OF-SCOPE BULLET AND IT IS THE PENDING ONE; the carrier change above is the AUTHORIZED one, and the two do NOT have the same status** — round 5's C4 was exactly that contradiction, this row reading as an instruction to ship while both Out-of-scope bullets said there was exactly one authorized exception and this was not it. **No acceptance criterion is added for it, deliberately and now doubly so:** the pass ROUTES the change rather than performing it, the change is not authorized, and growing this package's verification surface for work it has not been given is what this family's stop criterion forbids. The criterion lands with the counting change, after the decision |
| G8 | **The dream commit, and the staged-bytes handoff discharged here** | `WP-dream-promote-module`'s Table E states the rule and names it as this package's to satisfy: the commit contains **nothing but the run's NAMED commit set, each member carrying ITS CLASS's decided bytes** — three classes, and that table names the byte source of each (promoted and redacted outcomes, and the published report arm, from Table S; the code-owned warnings file from this row's third clause, which Table E cites rather than restates). **Table E's pre-round-2 shorthand for this — "only promoted paths" — is superseded and no surface may state it**, this row included: it read as exhaustive while the set is not. First: with no pre-commit (G6), a wholesale stage would sweep the user's uncommitted edits into the dream commit, so the commit carries a NAMED set of paths and nothing else — the promoted paths, the report, and the third clause's warnings file — which is also what keeps a staging object surviving a primitive refusal (Table H, the PRIMITIVE's row H7) out of it. Second: **naming the path is not enough** — staging re-reads the working tree, so a user save landing between the publish and the staging call is what enters the commit, ungated. Measured: with a save in that gap, `git add -- <path>` stages the user's post-publish bytes. **For classes (i) and (ii) the committed content must therefore be the DECIDED BYTES — `WP-dream-promote-module`'s Table S, which owns what they are, which outcomes carry them and what may be derived from them, and which this row cites rather than restates.** That table was extracted after two consecutive rounds landed on it; this row is one of its two named consumers. **How that is achieved is the implementer's — round-4 CUT ruling.** ADR-0012's "one dream run = one git commit in the vault" is unchanged. **The user's post-publish save remains as an uncommitted working-tree modification**: it is not committed and it is not discarded. **WHICH PATH THE REPORT IS COMMITTED AT — READ, NEVER DERIVED HERE.** The path this row stages for the report is `report.rel`, read off the arm `promote()` returned. `WP-dream-promote-report`'s **Table Z** owns it: row **Z1** gives the derivation a SINGLE OWNER inside `promote()`, and row **Z5(e)** decides the field's value arm by arm — the matched body's own `rel` on `promoted`, the derived path on `fallback` and on `refused` — so this row cites those rows and restates neither the derivation nor its segment rule. **THAT FIELD EXISTS BECAUSE THIS ROW READS IT, and row Z5(e)'s own prohibition forbids a second derivation here:** a path this package derived would be wrong on the `promoted` arm in exactly the runs where the brain's spelling and the derived path differ. The two PUBLISHED arms are the ones whose bytes reach this commit; the `refused` arm carries none (`WP-dream-promote-module`, Table S row **S3**). **THE REPORT PATH ON A PARTIAL PUBLISH (round 4's A1, ruled 2026-08-29):** when `promote()` returns `report.outcome === 'promoted'` with `accounting.published === false`, **THIS RUN PUBLISHED the body and the enforcement section never reached the vault**. This row commits the report path on BOTH forms of `accounting`, and what it commits is that arm's `bytes` — **the bytes THIS RUN PUBLISHED for that path** — never `report.record` and never a fresh read (`WP-dream-promote-module`, Table S rows S1 and S4). **`bytes` IS NOT A CLAIM ABOUT WHAT THE TARGET HOLDS, and this row may not make one:** on the `published:false` form the refusal's own cause can be, and on an `expect` conflict IS, the target no longer holding those bytes, so what it holds at the end of the run is refusal-cause-specific (`WP-dream-promote-report`, **Table Y**, rows **Y4** and **Y5**). **This row was NOT TOUCHED in the window that killed that claim and carried it one round longer in the reworded form "the bytes the vault holds" — while this spec's checklist entry for the partially published report NAMED THIS VERY CLAUSE as a mirror, four lines above its own prohibition against the claim (round 6's CD-1). The registration was correct and nothing walked it; `scripts/mirror-walk.js` exists because of this finding.** **A commit that SKIPS the report path on that form drops a published, gated file out of the run's one commit; a commit that MANUFACTURES the missing section commits bytes no gate judged and no primitive published.** The outcome itself is `WP-dream-promote-report`'s **Table Y** and is not restated here. Third, **the commit RECONCILES the code-owned vault warnings file — by CONTENT, never by authorship (quarantine-surface review, round 1 finding 3 and round 2 finding 3; owner-ruled direction A, 2026-08-29).** `WP-quarantine-warnings-file` writes `reports/warnings.md` into the vault at run points the dream commit does not cover, and it relied on the NEXT run's `precommitSessionEdits` to sweep it in — the call row G6 removes. **The eligibility test is therefore NOT "did this run write the file"** — that wording, which this row carried until round 2, misses the two refresh points that matter: point 2 runs AFTER this commit and point 3 runs on an idle run that makes no commit at all, and on the next run the file is already correct on disk so nothing rewrites it and the authorship test excludes it forever. **The test is a comparison instead.** At commit construction the run composes this file's canonical bytes with `composeWarnings` — `WP-quarantine-warnings-file`'s `### Exact contracts`, the family's ONLY composer of that document, whose module is CONSUMED and never modified here — over the **pinned state** (that spec's Table C pinned-state row, which pins exactly ONE argument: the run's in-memory `ledger` binding, not mutated between its refresh point 1 and this commit — the post-commit `recordProcessed` / `recordSecretExhausted` mutations are deliberately outside it). **The render takes the ledger and NOTHING else — no carried snapshot, no date, and never the file on disk** (owner ruling of 2026-08-30, which dropped that file's `## Run log` section; before it, a carried snapshot and a date were pinned here too, and round 3 found the date unpinned across the two callers and the carried bytes user-controlled). **Passing a different LEDGER is therefore the only way these bytes can disagree with what the run wrote, which is why that row pins it and this row does not restate it.** **If those composed bytes differ from the file's content at `HEAD`, the commit includes `reports/warnings.md` with THOSE COMPOSED BYTES as its decided bytes — no matter whether, or when, anything wrote the file on disk. If `HEAD` does not hold the file at all, the same is true PROVIDED the ledger holds at least one active quarantine; a vault that has never had one gets no file (`WP-quarantine-warnings-file`'s Table C row 4, cited not restated). If the composed bytes equal the content at `HEAD`, the file is omitted: no churn commit.** So the commit contains **the promoted paths, the report, AND `reports/warnings.md` whenever its canonical render differs from HEAD — subject, on the absent-`HEAD` arm alone, to the empty-ledger guard just stated: a vault whose ledger holds no active quarantine gets no file** — and still nothing else. Two consequences this row states rather than leaves implicit. **(a) A stray user edit to this code-owned file is never committed — and that now holds for the WHOLE file, not merely part of it:** the entire document is rendered from the ledger and the composer is never shown the bytes on disk, so nothing a user or another process leaves anywhere in the file can be in the composed bytes; the commit carries the canonical render and **writes nothing to disk**, so the user's edit survives as an uncommitted working-tree modification until a refresh point legitimately rewrites the file whole. (An earlier form of that spec carried the file's `## Run log` section forward verbatim, which made those bytes user-controlled input to this commit — round 3, finding 1. The owner dropped the section on 2026-08-30, so there is no carry left to qualify this claim with.) **(b) The decided bytes for this path come from the commit-time render, NOT from Table S** — nothing was promoted, no primitive returned a buffer, and no buffer is carried across the pipeline; that is why direction A dissolved round 2's finding 2 rather than answering it. Naming the path is safe for exactly the reason naming a user path is not: the file is **CODE-OWNED**, written whole from the transcript quarantine ledger, never brain-authored, so committing it sweeps no user bytes. This is still an INHERITANCE, not a new contract: `WP-quarantine-warnings-file` owns what the file contains, when it is written and how it is composed, and is cited, not restated; this row owns only the render-versus-HEAD test and the passage into the run's single commit |
| G9 | **The abort paths change, and leaving them would be a data-loss regression** | `restoreVaultToHead` (`validate.js:139-149` — `reset --hard` + `clean -fd`) is called at `cli/dream.js:549` and `:564`. Both mean "discard the brain's unvalidated writes". Under this package the brain wrote nothing in the vault, so there is nothing to discard — and with `precommitSessionEdits` gone (G6), a `reset --hard` there would destroy **all** of the user's uncommitted work for a failure that never touched the vault. Both call sites become `destroyWorkspace`. `restoreVaultToHead` itself is left in place and exported: this row changes only which function the two sites call, not the crash-replay, journal or uninstall-restore subject, which is the residue-lifecycle successor's |
| G10 | **The skill-ownership registry survives the rewiring — a durable POST-COMMIT side effect the validator owns today and Table G must inherit (round 2, F1)** | today `validateAndCommit` does this in two halves: it collects accepted NEW dream-created skill drafts during classification (`validate.js:1200-1205`) and calls `recordSkills` after the commit (`:1443-1448`, Step 6), so the registry only ever names committed skills. **The shipped contract requires an entry for every new dream-created skill the orchestrator accepts and commits** (`docs/specs/done/WP-083-skill-ownership-registry.md`, its acceptance criteria) — and a skill that is committed but unregistered is not dream-owned, so every later autonomous revision of it fails closed. **Replacing the validator's classification, gates, report and commit without carrying this obligation would leave the old code and its passing unit test in place while production registration is dead** — green tests, missing product. This row assigns it. Three things it fixes, and each is a consequence of the inversion rather than a port: (i) **"NEW" can no longer be `change.untracked`** (`validate.js:1202`), which is a git INDEX fact — the same class of evidence whose absence made this family's predecessor `Superseded` — so newness comes from the run's delta status `added` for a path the promotion outcome shows PUBLISHED, ordinary or redacted alike; (ii) **`id` and `created` are derived from the DECIDED BYTES**, never by re-reading the vault path as `:1203` does today (`WP-dream-promote-module`, Table S, row S4 — this row is its second named consumer); (iii) **the call still runs only after the commit succeeds**, which is what keeps the registry from naming an uncommitted skill. Refused paths, modifications of existing tracked skills, and shipped `wienerdog-*` skills are registered by nobody, exactly as today. `src/core/dream/skill-registry.js` is NOT modified — `recordSkills` is called, not changed; `isNewSkillDraft` (`validate.js:300`) is reused, exported if the call site needs it |
| G11 | **The run's accounting and output — every record this run produces reaches the user (round 3, F1 and F7 of Table V)** | today the run ends with a user-visible summary built from the validator's return (`cli/dream.js:667-670`, re-pinned 2026-08-30: the commit sha, note and skill counts, the reverted count and the out-of-vault count). Table V row V7 shows the pipeline consumes five of seven fields and that no row owned the channel. This row owns it. The obligations it must carry that the pre-round-3 text left homeless — **the COUNT is dropped rather than renumbered, exactly as round 4's F-3 dropped an orphaned ordinal: this cell said "two" and listed more, it was already wrong before the window that noticed it, and a later pass added an item without touching it (round 5's N2).** **THE SENTENCE THAT REPLACED IT THEN INTRODUCED TWO FRESH NUMBERS OF ITS OWN AND BOTH WERE FALSE (round 6's COH-2) — inside the very sentence warning that counts beside lists go stale.** **It is replaced by one that states no count at all, which is the only durable fix: a number beside a list inside a cell this long is a number waiting to be falsified, and a corrected number is only a number that has not been falsified yet** — are: **(i) the REFUSED report arm.** When `promote()` returns `report.outcome === 'refused'`, `report.record` holds the COMPLETE enforcement record and the vault holds none of it — `WP-dream-promote-report`'s Table R, row R4, is explicit that the vault object is left untouched and the record travels through the run's log and output instead. **The module RETURNS it; returning is not delivering, and this row is the delivery.** Nothing is staged or committed on that arm — there are no bytes to commit (`WP-dream-promote-module`, Table S, row S3). **THIS ROW ALSO DELIVERS `report.reason`, WHICH IS A SEPARATE FIELD FROM THE RECORD:** it is either the failed read of the report path or the vault-write primitive's refusal (Table H, the PRIMITIVE's row **H7**), whose rows H7 and H9 name a surviving staging object or directory whose name derives from the brain-chosen path — so `WP-dream-promote-report`'s **Table N** classifies it attacker-influenceable BY DERIVATION. **The section composer never interpolates it** — it is produced by the read or the write that FAILED, after the record was composed — **so it is neutralised WHERE THIS PACKAGE RENDERS IT, and the assertion is the report-refusal criterion's case (a), exactly as `report.accounting.reason`'s is that criterion's case (b).** **(i-b) THE PARTIALLY PUBLISHED REPORT ARM (round 4's A1, ruled 2026-08-29).** When `report.outcome` is `'promoted'` and `report.accounting.published` is `false`, **THIS RUN PUBLISHED the body**, the enforcement SECTION never reached the vault, and `report.record` again holds the COMPLETE record — the redaction line and every preserved-copy line the refused section would have carried included. **This row delivers it to the run's log and output exactly as it delivers R4's, and the run's accounting states plainly that the enforcement section was not published, naming `report.accounting.reason`.** It differs from (i) in ONE respect, and stating it is the point: here something IS committed — the report path, from that arm's `bytes` (row G8) — so (i)'s "nothing is staged or committed" is (i)'s clause alone. **What the target HOLDS at the end of such a run is refusal-cause-specific and this row states nothing about it (`WP-dream-promote-report`, Table Y row Y4); an earlier form said "the body is in the vault", which that row forbids (round 6's CD-1).** The outcome is `WP-dream-promote-report`'s **Table Y**'s. **(ii) the out-of-vault records from row G12**, which reach the same channel. **(iii) the note and skill COUNTS, whose semantics are exact and are inherited, not re-derived (Table V, row V7; inventory I078/I085):** today a count increments once per staged added-or-modified path, notes for anything outside the skills and reports directories, skills for **any** path under the skills directory — not only `SKILL.md` — with deletions and the report counted in neither. **The code-owned `reports/warnings.md` is counted in neither either, and that exclusion is INHERITED rather than invented here:** the file sits outside both the skills and the reports directories, so the rule as stated would count row G8's reconciliation of it as a user note. `WP-quarantine-warnings-file`'s Table D owns exactly that exclusion, and it is SHIPPED in today's counting code (`validate.js:1427-1431`, the exclusion itself at `:1430`; re-pinned 2026-08-30, that package having merged since this row was written); moving the counting into this row carries it, cited and not restated. They appear in the commit message and in this row's summary, so a changed rule silently changes what a user reads in their own git history. **This row is their producer; before pass (b) the summary promised counts no surface produced.** **(iv) the path list today returned as `committed[]` (inventory I081) is DROPPED, and dropped explicitly rather than by omission:** it has no production consumer — measured, `cli/dream.js` reads `sha`, `counts`, `reverted.length` and `outOfVault.length` and never `committed` — and promotion's own `promoted[]` carries the same information at the point it is decided. A reader looking for it finds this sentence instead of silence. A refusal that names its reason to nobody is the failure `WP-dream-promote-report`'s Table R exists to prevent, arriving one package later |
| G12 | **Scratch integrity — the delete-and-RECORD half, which no row inherited (round 3, F3)** | Table V row V1: today Step 1 deletes any file in the read-only scratch dir that is not an expected extract, deletes an expected extract whose content changed, and RECORDS each as an out-of-vault violation that reaches the report and the run's return. **The pipeline's existing `scratchIntact` (`cli/dream.js:57-78`) is NOT equivalent and must not be mistaken for it: measured, it checks only that expected extracts still exist and byte-match, so an added `EVIL.json` passes it unchanged.** This row keeps both halves: the fail-loud abort for a missing or changed expected input stays exactly as it is, and the enumerate-delete-record behaviour for UNEXPECTED writes is preserved, running after the verified reap (row G2) and before promotion. **Its records reach the user through TWO channels, and needing both is the point:** row G11 delivers them to the run's log and output, and they are passed to `promote()` in its `records` input so they also reach the dream REPORT, which is the durable one (`WP-dream-promote-report`, `### Exact contracts`). **Round 4's F1 was exactly this: the obligation to put them in the report was assigned here with no field to carry them, and the report is composed inside `promote()` — after this row has already run.** A log line is not a durable record; a sandbox-policy breach that survives only in transient output is the observability loss this row exists to prevent. **Rationale, not ceremony:** an unexpected scratch write is a sandbox-policy breach; dropping the record would downgrade a security-visible event into routine teardown, and the file would be deleted by cleanup with nothing left to show it existed. `src/core/dream/scratch.js` is not modified |
| G13 | **The out-of-vault line's `reason` is CODE-OWNED, and that is a contract rather than today's coincidence** | Row G11 renders the out-of-vault records to the run's log as `` `wienerdog: dream — out-of-vault: ${neutralise(r.path)} — ${r.reason}` `` (`cli/dream.js:1162`): the PATH goes through the neutraliser and the REASON does not. **That is correct today only because `records` (row G12) has exactly ONE producer** — `cli/dream.js:891`, whose reason is a fixed code-authored literal — **and nothing states that it must stay one.** The JSDoc types both fields as bare `string` (`:884`), so the two carry identical type-level signal while carrying opposite trust; a second producer composing a reason from anything the brain chose would leak an unneutralised value into a rendered line with no gate, no test and no review prompt to catch it. **The rule: every value interpolated into this line other than through `neutralise()` is code-authored — a literal or a code-owned constant — and a producer that cannot promise that must route its value through the path side's treatment instead.** The classification and the transformation are `docs/specs/done/WP-dream-promote-report.md`'s **Table N** (the neutralisation contract, path-qualified per the family's citation rule); this row does not restate them, it states WHICH FIELD is exempt and WHY the exemption is conditional. **This is a latent invariant being written down, not a defect being fixed** — no reachable input violates it at `dd18370`, measured: one producer, one literal. The same shape sits on the warnings-refresh line (`:657`, whose reasons come from code-owned templates in `core/dream/warnings.js` plus error text), so the rule is stated over the CLASS rather than over the one line that provoked it |

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
| V1 | **Step 1 — scratch integrity** (`validate.js:1107-1142`) | `scratchDir`, `expectedScratch`, `scratchBaseline` | **TWO HALVES, and they are stated separately because their INHERITANCE DIFFERS.** **(a) UNEXPECTED WRITES** — deletes any scratch file that is not an expected extract. **(b) CHANGED EXPECTED EXTRACTS** — deletes an expected extract whose content changed. Today BOTH halves end the same way: each is **RECORDED as an out-of-vault violation** (`outOfVaultDetailed`), which reaches the enforcement section (`:1385-1386`) and the return (`:1450-1458`) | **row G12 — which takes the two halves in DIFFERENT SHAPES, and this cell names which, because an earlier form handed both to G12 in half (a)'s shape and so contradicted the very row it names (PR #55, round 1).** **(a) survives INTACT as enumerate-delete-record**, and it is **NOT already covered by the pipeline's `scratchIntact`** (`cli/dream.js:57-78`), which only checks that expected extracts still exist and byte-match — measured, an extra `EVIL.json` passes it; that half has no other owner (round 3, F3). **(b) does NOT survive as delete-and-record. Under G12 a missing or changed expected input is the FAIL-LOUD ABORT, unchanged** — and the reason is structural rather than a preference: the run consolidated nothing, so it is aborted before promotion and there is no report, no return and no `records` handoff for a violation to be recorded INTO. A record produced on that path would have no channel, which is the exact defect round 4's F1 named one row over. **No surface here may say a changed expected extract is deleted-and-recorded under the pipeline** |
| V2 | **Step 2 — per-path classification and three gates** (`:1144`) | git evidence in the vault; the four gates' own inputs | the promote/refuse decision per path | rows **G7** (the gates' extraction and evidence) and, for the decision itself, `WP-dream-promote-module`'s Tables C and D |
| V3 | **Step 3 — the EP2 secret gate, its enforcement half, and its DURABLE LIFECYCLE** (`:1211`; revert core `:1324-1332` with its reason suffixes at `:1333-1337` and its `reverted[]` accounting at `:1361-1363`; quarantine `:669-738`; preservation-failure abort `:1298-1323`; identity-gated deletion of the redundant `redacted/` copy `:1338-1360`; retention `:906-946,1365-1366`; report metadata `:1392-1409`) | staged git diffs; the pre-change bytes it preserves; the set of artifacts this run created | withheld/redacted dispositions; **a durable quarantine artifact under a collision-resolved name; a fail-loud abort that refuses to destroy a working copy unless a durable artifact byte-identically holds the CURRENT bytes; once-per-run retention of `redacted/`; and the per-redaction report line carrying path, scrubbed-line count, labels and artifact name**; and the revert, re-stage and index-drop machinery | **rows G7 and G5**, and — for what the gate's RESULT carries into promotion and what promotion does with it — `WP-dream-promote-module`'s **Table Q**, CITED here and never restated. **The DURABLE half of the lifecycle above is neither package's, and saying it was Table Q's was wrong until the reconciliation pass of 2026-08-29 corrected it:** the preservation-failure abort, the identity-gated deletion of a redundant copy and the once-per-run retention of `redacted/` are decided, asserted and mutation-covered in the shipped `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` — cited by spec path because its table letters collide with this family's, the canonical map (`docs/specs/logbook/2026-08-29-promote-family-map.md`) being the one surface that states which — and Table Q rows Q5 and Q6 are pure pointers at it, while row Q4 points at that package's enforcement while owning the invariant as it binds this family. **The extraction here must therefore PRESERVE them, which is what row G7's acceptance criterion asserts:** the geometry is what makes that hard, and it is stated exactly rather than approximately — the revert core that goes (`:1324-1332`) sits below the abort (`:1298-1323`), its reason suffixes (`:1333-1337`) follow it, the identity-gated deletion (`:1338-1360`) follows those, and its `reverted[]` accounting (`:1361-1363`) follows the deletion; all five are inside the per-path loop (`:1233-1364`), and the prune (`:1365-1366`) fires immediately after that loop closes. **The identity-gated deletion is the dangerous one: it is the only must-survive behaviour that lies INSIDE the span an over-wide removal would take**, and until 2026-08-29 this row and rows G7's own Deliverables entry both named a removal range that contained it. **AND PRESERVING IT IS NOT THE SAME AS LEAVING IT BYTE-IDENTICAL:** its keep branch (`:1357-1359`) announces the kept copy through `reason`, whose only consumer in this loop is `:1361` and therefore goes — so row G7 re-carries that announcement on the EP2 gate's preservation record (`WP-dream-promote-module`, Table Q rows Q1 and Q9), by owner ruling of 2026-08-29. Row G7 owns that instruction; this row records that the behaviour is on the must-survive side of the cut and not why. The enforcement half has no subject once nothing is written to the vault, and goes. **Row G5 cites Table Q's row Q4 because under promotion the destruction risk moves to the workspace rather than vanishing. An earlier form of this row listed only "dispositions and the revert machinery" — round 4's F2, and the reason Table Q exists.** **THE SCRUBBED-LINE COUNT's VALUE IS NOT CHANGED BY THIS EXTRACTION:** row G7 carries a PENDING named input that would narrow it, blocked on an owner decision against `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`, which pins it as `addedLineNumbers.length`. This row records that the shipped value is what survives the cut until that decision, and not why (round 5's H3: the input reached row G7 alone, where the carrier change reached every surface its own checklist entry registers). **A number stood here — "six surfaces" — and is DROPPED: it was correct the day it was written and stale the moment a seventh was registered, which is exactly the failure row G11 names one row over (round 6's NIT-3). The registered mirror list is the checkable form, and `scripts/mirror-walk.js` walks it** |
| V4 | **Step 4 — the dream report** (`:1375-1411`; re-pinned 2026-08-30, the shipped span having moved) | the run's records | the report body plus the appended enforcement section | `WP-dream-promote-report`'s report row, Table Y and Table R. Its REFUSED arm's delivery, **and the delivery of a `promoted` arm whose SECOND write was refused** (that spec's **Table Y**, round 4's A1), are **row G11**'s; the commit of the report path on that partial form is **row G8**'s. **AND THE SHIPPED SECTION HEADING RETIRES WITH THE STEP.** Today's append writes `## Reverted by orchestrator (policy enforcement)` (`validate.js:1391`); under promotion the section is composed by `promote()` under the heading `WP-dream-promote-report`'s **Table R** pins — `## Refused by policy (promotion enforcement)` — and no run may write both. **The RENAME is that package's to decide and is cited here, never restated; the RETIREMENT of the shipped string is THIS package's act**, because this is the package that removes the append: until it lands, both strings live in the tree. The shipped assertions on the old string IN THE REPORT sit in two files this spec already lists as deliverables (`tests/unit/dream-validate.test.js`, `tests/integration/dream.test.js`). **Another surface names the old string to the BRAIN and is NOT this package's — stated without an ordinal, this family's counts beside lists having gone stale before:** `skills/wienerdog-dream/SKILL.md` is Out of scope here, its sentence goes stale when this lands, and its assertion (`tests/unit/dream-skill-structure.test.js`) is not a deliverable either — **recorded as a follow-up rather than silently carried** |
| V5 | **Step 5 — stage and commit** (`:1411`, `git add -A` at `:1412`) | the working tree | one commit in the vault | **row G8** |
| V6 | **Step 6 — the skill ownership registry** (`:1443-1448`) | accepted new skill drafts collected at `:1200-1205` | `state/skill-registry.json` entries | **row G10** |
| V7 | **The RETURN, and the run's user-visible accounting** | the above | seven fields, of which the pipeline consumes five today: `secretReverts` (`cli/dream.js:625`), and `sha`, `counts.notes`, `counts.skills`, `reverted.length`, `outOfVault.length` in the summary line (`:667-670`) — **both re-pinned 2026-08-30 with row G11's, in the same sweep, so the two rows do not carry different answers for one line** | `secretReverts` → **row G4**; everything else → **row G11**. **This row is why the enumeration was needed at all:** the summary line is the delivery channel V1's records and Table R's refused enforcement record both travel on, and no row owned it |
| V8 | **The dry-run preview** (`cli/dream.js:80-108,472-477`) — inventory I018 | the composed brain argv | terminal text a user reads to see what the run WOULD do | **row G1.** The preview must show the WORKSPACE write target the real run uses; a preview still showing the vault is a false preview of a run that no longer happens |
| V9 | **Teardown ordering and lock ownership** (`cli/dream.js:633-642`) — inventory I095 | the lock's ownership state | scratch removed, then the lock released, **and only if this process still owns it** | **row G5.** A stale holder must touch neither the current owner's scratch nor its lock; the clean-before-release ordering is what closes the acquire-versus-clean race |
| V10 | **The digest regenerated AFTER ledger persistence** (`cli/dream.js:623-625`) — inventory I093 | the run's final ledger and quarantine state | `state/digest.md`, which is the next session's context | **row G4.** The ORDER is the content: regenerating before the ledger is persisted shows the next session a state that has already changed |

### Table W — the user's git index: not this run's property

**Canonical for what a dream run does to the user's staging area, for the cost
that decision carries, and for the remedy.** Every other statement of these
facts — in `src/cli/dream.js`'s comment block, in the tests, in the acceptance
criteria, in any ADR — is a mirrored summary that defers here.

**Why the letter `W`, and the collision recorded rather than avoided.** `I` and
`X` remain rejected on the grounds
`docs/specs/logbook/2026-08-29-promote-family-map.md` records, and `Z` is spent,
so this table takes the DELIBERATE collision that map's letter section
anticipates. Measured at `dd18370` with
`git grep -lE '^### Table W( |$)' dd18370 -- docs/specs/` — the file-listing
form, because the letter-census `grep -rhoE '^### Table [A-Z]'` the map uses
counts occurrences and cannot answer "how many specs": `W` occurs in exactly one
spec tree-wide,
`docs/specs/done/WP-symlink-lexical-fallback-removal.md` (its WP-153 mirror
census) — outside this family, cited by no member of it, and reached only
through the path-qualified-citation rule that already governs this family's
neighbours. `W1` carries none of the `I1`-as-`11` or `O1`-as-`01` misreading
hazard that disqualified the free letters.

| # | Fact / rule | Value |
|---|-------------|-------|
| W1 | **The user's index is not this run's property — SCOPE, ENFORCEMENT and the DIAGNOSTICS, in one row because splitting them is what let them drift** | The commit is assembled in a PRIVATE index outside the vault's `.git` (`GIT_INDEX_FILE`, `cli/dream.js:230`) and published with `commit-tree` + `update-ref` (`:261-263`). <br>**(a) SCOPE — a total over THIS PACKAGE'S OWN ACTS, and the boundary sits where it does by RULING, not by what the assertion happened to be able to see.** **No dream run writes, refreshes, resets or otherwise touches the user's index — at all, in any run state, success or failure.** The acts the claim ranges over are the run's OWN: **its own git invocations — those the seam of (c) observes and those it does not — and its own file writes.** **The seam is the ENFORCEMENT, never the boundary of the scope:** its reach is a LIMIT that (c)'s COVERAGE clause states and owns, and it is cited here rather than restated, because the boundary of (a) is AUTHORSHIP, not visibility. The scope is deliberately the WHOLE index rather than "the user's staged entries survive": that narrower form is what the retired mechanism kept claiming while losing a different shape each round, and a total has no shape to miss. <br>**WHAT IS OUT OF SCOPE — the user's own git hooks (OWNER RULING, 2026-08-31), stated in the row rather than left for a reader to infer from what the check misses.** The ruling's reasoning, quoted because it is the narrowing's whole justification: *a `reference-transaction` hook is the user's standing instruction bound to an event class, firing identically for any tool that updates a ref; the act that writes the index is the user's configured code, not this run's. Triggering the contracted `update-ref` does not make the hook's write our act.* **The boundary is AUTHORSHIP, not visibility** — which is what keeps it from being the excuse the assertion's blindness could otherwise become: a write this package's code performs is in scope whether or not any surface can see it, and (c)(i)'s un-seamed `validate.js` invocation is the standing example of exactly that. <br>**THE RESIDUAL, STATED HONESTLY RATHER THAN CLOSED — this is the narrowing's PRICE and it is recorded as one.** A user hook that writes the index during publish is user-owned behaviour and is **NEITHER SUPPRESSED NOR DETECTED** by anything in this package. A user who has such a hook will see their index change across a dream run, and no surface Wienerdog ships will tell them so. **Its surface is bounded and MEASURED rather than estimated — and the RETIREMENT OF THE ALLOWLIST NARROWED IT rather than widening it, which is stated because a retirement is normally the other way.** The live surface is now the pinned call set of (c): **exactly ONE of its nine shapes can fire a hook at all — `update-ref` (`:263`), which this pipeline runs.** `symbolic-ref` in its ref-WRITING form was the second such verb, and it was reachable only because the retired allowlist keyed on the VERB and therefore granted every form of it with no call site; **under default-deny it is not a pinned shape, so the run cannot make it and it drops out of this residual.** **THE MEASUREMENT IS KEPT PINNED AND PAST-TENSE, because it is what bounded the residual and it stays true after the mechanism moves — measured on git 2.50.1:** with a `reference-transaction` hook installed, `update-ref` and a writing `symbolic-ref` each fired it (`prepared`, then `committed`); the other ten verbs of the retired allowlist — `rev-parse`, `rev-list`, `ls-tree`, `cat-file`, `show`, `log`, `hash-object -w`, `commit-tree`, `merge-file`, `config` — fired NO hook, `commit-tree` included, because it is plumbing and does not run `git commit`'s hooks. **The three private-disposition shapes (`update-index`, `read-tree`, `write-tree`) were NOT in that measurement and this row makes no hook claim for them**; a later round that needs one measures it rather than reasoning it. **The brief that ordered the original narrowing named only `update-ref`; `symbolic-ref` was found by measuring the whole set rather than the one verb the finding arrived on.**<br>**THE RETIRED CAUSE — recorded to the standard row W5 sets for its three retirements, because a scope that narrows without its measurement reads as a quiet weakening.** What is retired is the UNBOUNDED form of (a): a total over every write to the user's index during the run, whoever performed it. **It is retired because the assertion form was MEASURED insufficient for it, not because it was argued to be.** With a `reference-transaction` hook in the vault, the pipeline's own allowlisted `update-ref` fires it; the hook runs `git update-index --assume-unchanged` and copies the saved index bytes back. Reproduced twice: hook log `HOOK RAN: index written`; index before `cca0cf329414dfe3` and after `cca0cf329414dfe3`, **identical**; the only invocation the seam observed was `update-ref` — one of the run's own pinned calls, and measured index-safe. **BOTH surfaces of this row are blind to it, and NEITHER can be repaired to see it**, which is why this is a scope question rather than a coverage gap: the hook executes **BELOW the seam** — git spawns it, this package does not, so no substituted `spawnGit` is ever on its path — and the write-then-restore is precisely the endpoint diagnostic's measured blind class from (b). <br>**TWO REMEDIES ARE REJECTED BY NAME, recorded so that neither returns as an obvious improvement.** **(1) SUPPRESSING THE USER'S HOOKS** (`core.hooksPath` or any equivalent) — rejected on **TWO INDEPENDENT grounds, either sufficient alone**: a product change may not be taken under gate pressure; and suppressing hooks would switch off the user's OWN guardrails — a ref-protecting hook among them — on exactly the operation that moves their `HEAD`. **A just-files product does not silently override the user's git configuration** (ADR-0004). **(2) RETREATING TO A STATE-TOTAL** — "the index is byte-identical at run end" — rejected as a regression to the pre-round-7 blindness that (b) measures and row W5 item 2 retires. It is green on every write-then-restore, the hook's included, so it would not even detect the residual it was proposed to cover: it buys nothing and costs the enforcement. **A later gate re-finding this residual does not reopen either rejection** — the residual is the ruling's stated price, and finding it again is confirmation, not a new finding. <br>**(b) WHY NO REPRESENTATION OF THE INDEX ENFORCES THIS ROW — first no projection of it, then not the artifact itself.** **A PROJECTION cannot enforce the total, and this is measured rather than argued.** Two shapes change the index file while the projection a reviewer reaches for compares EQUAL, both reproduced at `cbc7240` on git 2.50.1: (i) re-staging an entry with its OWN identical mode and sha — `git update-index --cacheinfo <its mode> <its sha> <its path>` — rewrites the entry's stat data, so the file differs and **every** `ls-files` projection, `-v --stage` and `-f` alike, compares equal; (ii) setting or clearing `fsmonitor-valid` (only observable at all when `core.fsmonitor` is configured) changes the entry's flags, and `ls-files -v --stage` is blind to it — **only `ls-files -f` prints that bit, so shape (ii) is NOT blind to every projection and this row does not claim it is.** *(An earlier form opened this clause by saying both shapes leave every projection equal, which its own shape-(ii) clause falsified three lines later, and the error then propagated into the blindness rule in (d). Corrected 2026-08-31 against the shipped behaviour, which had it right.)* **`--stage` missed the flag column entirely, `-v` adds one letter and misses these two, and there is no reason a fourth column is the last: the projection cannot be completed by enumeration, which is the same per-shape reasoning that cost this package four data-loss defects.** <br>**AND THEN THE ARTIFACT ITSELF IS NOT ENOUGH EITHER, which is where this row stopped one round too long.** The raw file caught both shapes, and a raw byte compare is total over *representations* — but it is still a compare of an ARTIFACT AT TWO ENDPOINTS, while (a) is a claim about ACTS. Endpoint identity is `final bytes == initial bytes`, which is strictly weaker than "no run touches the index": **any sequence that writes the user's index and ends where it started is GREEN, forever, in every representation.** Measured at `1ac82ac` on git 2.50.1: copy `.git/index` aside, `git update-index --assume-unchanged a.txt` (the index is rewritten — `ls-files -v` goes `H` → `h`), copy the saved bytes back; before and after hash `1a0ec90b…` identically and `ls-files -v` is back to `H`. A real write to the user's index, invisible to any endpoint compare. *(The obvious two-command form does NOT demonstrate this — `--assume-unchanged` followed by `--no-assume-unchanged` lands on a THIRD hash, because git refreshes stat data in passing. The blindness is definitional, not incidental, and the measurement above is the honest one.)* **So the enforcement changes KIND: it observes the acts. A fourth representation is not the answer, and proposing one is this row's characteristic failure mode.** <br>**(c) THE ENFORCEMENT — the GIT EXECUTION SEAM, and THE RUN'S OWN CALLS ARE PINNED. Default-deny: an unknown shape is a violation.** **THE SEAM.** The pipeline already routes git through an injected function: `opts.spawnGit` (`cli/dream.js:562`, defaulting to `spawnGitPinned` at `:178`), funnelled by `gitIn` (`:166`) and forwarded into `commitNamedSet` (`:1042`). A test substitutes it and receives every invocation as `{args, cwd, env, input}`, across the WHOLE run rather than at its two ends. **Shipped as `watchIndexWrites(vault)` in `tests/unit/dream-pipeline.test.js` (`578d17b`)**, returning `{spawnGit, violations, seen, classify}`.<br>**THE DIRECTION, AND THE STRUCTURAL GROUND FOR IT — the owner's words, recorded because it is what makes this closable where the three directions before it were not:** *enumerating the BAD is unclosable because git's grammar is not ours; enumerating our OWN GOOD is closable because the run's call set is ours — default-deny, unknown shape = violation.* **What is retired is INTENT-CLASSIFICATION** — resolving each invocation's verb, deciding which repository or index it would reach, and judging it. **It was retired BY MEASUREMENT, twice, two rounds apart, each refutation reproduced independently; row W5 item 4 holds both** (`--attr-source`, `--index-output`) and this clause names them rather than restating them. What the two exploits have in common IS the reason C closes: each was a shape the run never makes, so each is a violation here for that reason alone, without anything having to understand it.<br>**THE INVARIANT.** Every git invocation the seam observes must match one of the PINNED SHAPES below by STRICT SHAPE-EQUALITY **and** carry that shape's declared `GIT_INDEX_FILE` disposition. Nothing else passes. **Asserted in every run state (a) names**, success and each abort path, because a total that is only observed on the happy path is a projection of the run. **There is no question here about which repository a call reaches or which index it would write:** those questions WERE the retired direction.<br>**MATCHING IS STRICT SHAPE-EQUALITY, NEVER RE-CLASSIFICATION — and the reason is the retirement itself.** Same argument COUNT; every literal token equal in POSITION; a placeholder accepts exactly one token **without inspecting it**. No token is parsed, normalised, or judged. **THERE ARE TWO PLACEHOLDER KINDS, and the second is NARROWER — owner ruling of 2026-08-31, defined at the set below.** A **FREE** slot accepts any one token. An **OWN-VALUE** slot accepts one token only if that token is a string THIS RUN WAS OBSERVED TO PRODUCE. **Neither kind inspects the token, and the own-value slot is not the retired direction returning under a new name:** it parses nothing, normalises nothing and knows no git grammar — it asks SET MEMBERSHIP over our own values, which is the same structural ground the pinned set itself stands on. *Our own values are ours to enumerate; git's grammar is not.* **A fuzzy matcher — prefix matching, option-order tolerance, "this is obviously the same call" — smuggles the retired direction back in under a new name**, because every such tolerance is a small re-classification, and re-classification is precisely what git's growing grammar defeated. **A run whose call no longer matches is a CONTRACT CHANGE, never a matcher bug**, and the fix is the table, not the tolerance.<br>**THE PINNED CALL SET — nine shapes, measured as forty-five invocations across all three vault layouts (`plain`, `separate-git-dir`, `linked-worktree`).** **EVERY SLOT'S KIND IS WRITTEN AT THE SLOT rather than inferred from the token's name**, because a kind stated once for a whole set is a kind that drifts one slot at a time — which is exactly how the gap below was created. A token in `«guillemets»` is a placeholder for exactly one argument: written `«own …»` it is an **OWN-VALUE** slot, admitting that token only if it is a string this run was observed to produce; any other guillemet token is a **FREE** slot, admitting any one token, never inspected. Every token outside guillemets is a literal that must be equal in position. **In the executable copy the two kinds are the symbols `RUN_VALUE` and `ANY`**, and the copies must agree — the pair is registered in the Mirrored Surface Checklist. **THE EXECUTABLE COPY LIVES IN `tests/unit/dream-pipeline.known-calls.js`** — a module of its own, holding the two sentinels, their JSDoc and the set, and nothing else. **Its SOURCE FORM is pinned by `KNOWN_CALLS_SOURCE_DIGEST` in `tests/unit/dream-pipeline.test.js`**, a SHA-256 over the whitespace-collapsed content of that WHOLE file; the constant is named here and its value is deliberately NOT quoted here, so the bytes live in exactly one place. **ANY EDIT TO THAT MODULE RE-PINS THAT DIGEST IN THE SAME COMMIT AS THE CHANGE TO THIS ROW** — a two-file diff by construction, and the one adjacency this design gives up. Without it, a slot rewritten to an expression that resolves to the same token at run time ships GREEN and the relocation tripwire silently does not exist. The disposition is part of the shape, not a side condition. **AND SO IS THE PRODUCING MARKER, written at the shape for the same reason the slot kinds are:** an entry ending **PRODUCING** is a shape whose WHOLE STDOUT the own-value set learns from, its executable spelling is that entry's `produces: true` property in the module named above, and **the two copies must agree SHAPE BY SHAPE** — the pair is registered in the Mirrored Surface Checklist exactly as `«own …»` ↔ `RUN_VALUE` is. An entry without the marker is a shape the set learns nothing from. **(1)** `unset` — `ls-tree «own tree-ish» -- «path»` (`:238`). **(2)** `unset` — `hash-object -w --stdin` (`:253`) — **PRODUCING**. **(3)** `private` — `update-index --add --cacheinfo «mode» «own sha» «path»` (`:256`). **(4)** `unset` — `show HEAD:reports/warnings.md` (`:1004`) — a LITERAL, retyped rather than imported, by clause (2) of WHICH SLOTS TAKE THE PIN below. **(5)** `unset` — `rev-parse HEAD` (`:221`) — **PRODUCING**. **(6)** `private` — `read-tree «own tree-ish»` (`:234`). **(7)** `private` — `write-tree` (`:258`) — **PRODUCING**. **(8)** `unset` — `-c user.name=wienerdog -c user.email=wienerdog@localhost commit-tree «own tree» -p «own parent» -m «msg»` (`:261`) — **PRODUCING**. **(9)** `unset` — `update-ref -m «msg» HEAD «own new» «own old»` (`:263`). **EVERY ENTRY HAS A CALL SITE, by construction rather than by discipline** — the set was derived by instrumenting the seam and recording what the run actually does. That is the property the retired allowlist could not have: six of its twelve verbs had no call site at all and were admissible only while each carried its own separate measurement.<br>**WHY THE OWN-VALUE SLOT EXISTS — OWNER RULING OF 2026-08-31, recorded WITH its measurement because a set that narrows without one reads as a preference.** A free slot was too wide for the object-name slots, and measurably so. `read-tree` accepts `--index-output=<path>` **as its sole argument**, so `read-tree --index-output=<user index>` — TWO tokens — matched the then-current `read-tree «sha»` on argument count, was **ACCEPTED**, and **EMPTIED THE USER'S INDEX**: exit 0, staged content destroyed, with a legitimate private `GIT_INDEX_FILE` set and every disposition clause of this row satisfied. **A data slot that cannot tell data from an option is not pinned at all.** A review gate and the owner measured it independently, two rounds after the direction change that introduced the set.<br>**THE REPAIR DOES NOT INSPECT THE TOKEN, and that is the whole of why it is not the retired direction returning.** An own-value slot compares the token to the run's OWN-VALUE SET. **It states no membership rule of its own:** membership is the predicate in clause **(1)** of WHICH SLOTS TAKE THE PIN below, and the sources are exactly the shapes the set above marks **PRODUCING**. It parses nothing and knows no git grammar; it asks set membership, and the set is ours. **The owner's ground, in his words:** *same structural ground the pinned set stands on — our own values are ours to enumerate; git's grammar is not.* **THE PIN IS AVAILABLE ONLY BECAUSE OF AN ORDERING, and the ordering is part of the contract:** a token is admitted in an own-value slot only after an EARLIER pinned **PRODUCING** call has RETURNED and its whole stdout has joined the own-value set. **That is the ordering and the whole of it:** neither COMPUTED nor READ does any classifying here — which shapes the set learns from is settled at the shape, by the marker. **A value that enters the set through a call the seam REJECTED launders nothing:** the rejection is already recorded as a violation, and the assertion is that there are none — so a poisoned set cannot turn a red run green.<br>**WHICH SLOTS TAKE THE PIN — stated as the RULE and applied to every slot the rule reaches, not only to the one that was exploited.** **THREE CLAUSES THAT PARTITION EVERY SLOT ONCE** (amended 2026-09-01 by `WP-show-slot-own-value-kind`; what stood here until then partitioned two ways — COMPUTED → `own`, merely carried → FREE — and shape (4) is the slot that partition got wrong). **(1)** A slot carrying an OWN-VALUE-SET MEMBER — *an object name git itself emitted as the whole stdout of one of this run's pinned PRODUCING shapes*, and nothing looser — is `own`. **(2)** Of the REMAINING slots, one whose token sits in a POSITION GIT PARSES FOR OPTIONS must be FIXED and spelled as a LITERAL: a value that varies has no place in an option position, and a FREE slot there is not a pin at all. **(3)** Every other remaining slot — a token git consumes positionally, or as a named option's argument, or after `--` — stays FREE; a fixed value there MAY be tightened to a literal as optional hardening, but is not required to be. **CLAUSE (1) CITES THE OWN-VALUE MEMBERSHIP PREDICATE RATHER THAN THE WORD "COMPUTED", AND THE REASON IS A MEASURED OVERLAP:** the run COMPUTES the commit message (`:1041`) and DERIVES the mode from `ls-tree`'s stdout (`:238-239`), yet both slots are correctly FREE — so "computed" and "merely carried" overlap before position is even considered, and a partition built on the loose word classifies two existing slots two ways. **"OPTION POSITION" IS A DESIGN-TIME PREDICATE, NEVER A MATCH-TIME TEST.** It is applied by the author of this row when a shape is added or changed — the same moment, and the same person, that already decides `own` versus FREE. `shapeMatches` is untouched: it still compares literals by equality and admits a placeholder without inspecting the token, so the retired classification direction does not return through this door, and no fourth placeholder kind is introduced. **A future call needing a VARYING token in an option position is a design problem for THAT CALL** — re-shape it so git consumes the token positionally — never a licence for one. **APPLIED TO SHAPE (4), WHICH IS THE SLOT THIS AMENDMENT MOVES: its `show` argument is a LITERAL, not a free slot.** The own-value rule genuinely does not reach that token — it is a string this run BUILDS out of a path, never a value it read back out of git, so no observation pins it — but *therefore FREE* does not follow: git parses `show`'s arguments for options, the run's own argument is the fixed constant built at `cli/dream.js:1004` from `core/dream/warnings.js:72`, and a constant in an option position is pinnable as a LITERAL, the set's third and oldest token kind. Measured: `git show --output=<user index>` exits 0, overwrites the index with the commit text and leaves a repository every index-reading command refuses, and its only recovery destroys the user's staged content — TWO tokens, carrying no `GIT_INDEX_FILE`, so it satisfied both the arity and the disposition of the free form. **SPELLED LITERALLY, NEVER IMPORTED:** an interpolated `WARNINGS_REL` would make the pin follow production silently, which is the exact silent widening default-deny exists to prevent; retyped, relocating the warnings file reddens the guard and forces the owner-visible amendment of this row. The two forms are indistinguishable at RUN TIME, so what holds the choice is the source-form digest registered above and nothing else. **THE OWN-VALUE RULE ITSELF IS UNCHANGED by this amendment.** **The five shapes the rule reaches are (1), (3), (6), (8) and (9)**, and their `own` slots are marked above.<br>**MEASURED IN BOTH DIRECTIONS at `c853245b`** — through the real `classify` in the live fixture and again in isolation: free slot → the two-token redirect is **ACCEPTED** (the gap); own-value slot → the two-token redirect is **REJECTED**; own-value slot → the legitimate `read-tree «own tree-ish»` is **still accepted**, so the narrowing is not a matcher that rejects everything. **Regression on the same tree:** `--attr-source …` and the THREE-token `--index-output` form still rejected on argument count and literals; the in-tree private index still rejected by the working-tree clause; the two-sided vacuity guard still 0 pass / 3 fail against a dead decision in both directions. **The verdict text is unchanged and the FOUR FAILURE MODES below gain no fifth member** — there is one no-match verdict, *UNKNOWN SHAPE*, and a slot mismatch reports it. What changed is what makes a call unknown.<br>**`read-tree` WAS THE ONLY SHAPE CARRYING THE DEFECT — measured, and the measurement's LIMIT is recorded beside it.** Three independent sweeps agree across the nine shapes: six directed vectors, the gate's own probes, then ten exotic ones (`--split-index`, `@`, `--`-position abuse, crafted paths, `--stdin` in a sha slot, an option in a message slot). `read-tree` is singular because `--index-output` is the one SUBCOMMAND flag among the nine that retargets a write off the private index its disposition pins. **That is a measurement over ENUMERATED VECTORS and not a proof over git's grammar, and it must not be read as one** — a proof over git's grammar is precisely what W5 item 4 retired as unclosable. **Which is why the pin is applied by the RULE rather than by the exploit:** the set carries SEVEN `own` slots across five shapes, and the six that are not `read-tree`'s are pinned whether or not anyone has found their vector.<br>**THE ONE RESIDUAL INSIDE THE OWN-VALUE SET IS CLOSED — recorded WITH its cause rather than deleted, to the standard row W5 sets for a retirement.** When this ruling was first recorded, the seam admitted the trimmed one-line stdout of ANY pinned call it observed succeed, which was wider than the sources the ruling itself names: besides the head, blob, tree and commit names it also admitted `ls-tree`'s output line (harmless — it begins with a mode, so it can equal no argument the run passes) and, the one that mattered, **the committed content of the quarantine-warnings file read by shape (4) (`:1004`), whenever that content was one line after trimming** — content that lives in the user's own vault history and is therefore user-controllable, so a run MUTATED to issue the two-token redirect would have been admitted again in a vault whose committed warnings file consisted of exactly that argument. **THE REMEDY THAT CLAUSE SPECIFIED — admit only the output of the shapes whose stdout IS an object name the run computed, which is (2), (5), (7) and (8), excluding (1) and (4) — SHIPPED AT `b19121bb`** (*"test(dream): the own-value set holds what the run MINTED, never what it read back"*; the word MINTED in that subject is quoted as provenance only — it is itself retired, because `rev-parse HEAD` reads the head back from the user's ref and so falsifies it, and the membership predicate above is what stands in its place), and the executable copy has carried it since. **THE CLAUSE RECORDING THE RESIDUAL LANDED AFTER THE FIX IT DESCRIBED** — `53b1519b` is a descendant of `b19121bb` — **so it recorded the pre-fix state; that is the drift this closure ends**, and finding a docs surface stale on the day it was written is the paid-for lesson, not the fix. **NEITHER THIS ROW NOR ANY PROSE SURFACE STATES THE COUNT OF SOURCES AGAIN:** a number beside a list is a second copy that goes stale on its own, and the surface that OWNS this fact is the **PRODUCING** markers standing at the shapes in the set above — with the module's `produces: true` property as their executable mirror, and no third surface.<br>**BOTH DISPOSITIONS ARE ENFORCED, IN BOTH DIRECTIONS.** A shape declared `unset` that arrives carrying a `GIT_INDEX_FILE` is a violation, and a shape declared `private` that arrives without one is a violation. **The `unset` disposition rests on MEASUREMENT rather than on anyone's reading of what the command does:** six of these nine verbs — `rev-parse`, `ls-tree`, `show`, `hash-object -w`, `commit-tree`, `update-ref` — were measured index-safe at `1ac82ac` on git 2.50.1 against a vault whose index carried deliberately STALE cached stat data, which is the state that makes an index-refreshing command rewrite the file, and each in its bare or diff-bearing form rather than only in the form the pipeline happens to use. **That measurement is the one thing that SURVIVED the allowlist's retirement, and it survived because it was never what failed:** the members were right; the RESOLVER that mapped an argv onto a member is what could not be closed (W5 item 4). **Under C there is no resolver — the shape IS the identity.** The three private-disposition shapes were outside that measurement and carry no index-safety claim from it; they need none, because the index they write is the one the disposition pins.<br>**THE PRIVATE INDEX MUST SATISFY BOTH CLAUSES — SETTLED IN THIS ROW, 2026-08-31, because prose and code had diverged and the row is where that is decided.** A `private` shape's `GIT_INDEX_FILE` must RESOLVE (symlinks and `..` included) to a path that is **NEITHER the user's index NOR inside the user's working tree.** **The shipped predicate had checked only the first clause while its own JSDoc promised both**, so `GIT_INDEX_FILE=<vault>/scratch-index` was a violation before that drift and had silently become permitted. **The divergence is settled TOWARDS THE STRONGER SIDE, and the direction is the ruling rather than a preference:** an index materialised inside the vault is a file this run writes into the user's working tree, which (a)'s scope names in as many words — *its own file writes* — and which changes what `git status` reports, so the weaker reading would have permitted an act (a) forbids. **The working-tree clause is LOAD-BEARING under C and is not redundant with the first:** a mutation that leaves a pinned shape's argv byte-identical and moves only its private index into the vault matches the shape, is not the user's index, and is caught by nothing else. **Measured RED at `578d17b`:** `GIT_INDEX_FILE=<vault>/scratch-index write-tree` → *private index lies inside the user's working tree*. **The user's index is named by its RESOLVED path** (located the way (d1) locates it), never by "outside the vault": in a linked worktree the user's own index already lives outside the vault (`<main>/.git/worktrees/<name>/index`), so an "outside the vault" test would accept `GIT_INDEX_FILE` pointed straight at it.<br>**THE FOUR FAILURE MODES ARE PART OF THE CONTRACT rather than test wording**, because each is a distinct way the invariant breaks and each must stay separately reachable: *UNKNOWN SHAPE — not one of the run's pinned calls*; *known shape carrying an unexpected `GIT_INDEX_FILE`*; *known shape missing its private `GIT_INDEX_FILE`*; and the private-index pair *IS the user's index* / *lies inside the user's working tree*. **AND EVERY VERDICT RED CARRIES ITS INVOCATION:** the full `args`, the `cwd`, and whether `GIT_INDEX_FILE` was set and where it resolved. "A violation" without the command is unactionable. **THE SENTENCE IS A UNIVERSAL OVER VERDICTS AND SAYS SO, because the REFUSAL above resolves nothing and would otherwise falsify it.** The refusal's diagnostic is defined here beside them: the harness error carries the full `args`, the `cwd`, the RAW `GIT_INDEX_FILE` value and the UNJUDGED state, and it reports **NO resolved path, because none is computed** — that absence is the outcome, not an omission.<br>**TWO NON-VACUITY GUARDS RIDE WITH THE INVARIANT, and they are part of the contract rather than test hygiene.** **(1) THE SEAM WAS EXERCISED:** `violations` must be empty AND `seen.length > 0` — **a run that invoked no git at all satisfies an emptiness assertion trivially**, so without this a pipeline that stopped calling git, or a wrapper that was never installed, reads identical to a clean run. **(2) THE DECISION MUST NOTICE ITS OWN DEATH — MANDATORY, AND IN THIS FORM.** Observation is not evidence that the DECISION still works, so the check exercises the matcher directly: against a shape that MUST be rejected and against a shape that MUST be accepted, so that a matcher accepting everything and a matcher rejecting everything BOTH fail. **The measured reason this is mandatory and not hygiene:** when an earlier round decoupled the guard from the mechanism it guarded, breaking that mechanism left the assertion at **3 pass / 0 fail** — enforcing nothing, silently. **Measured at `578d17b`:** matcher mutated to accept everything, **0 pass / 3 fail**; mutated to reject everything, **0 pass / 3 fail**; unmutated, 3 pass / 0 fail. This is the `+0`-delta shape the package has now paid for more than once: a check that dies before the behaviour it names reports success forever. **THE REJECT SIDE CARRIES TWO SHAPES, and the second is there because the first certified nothing about it (added 2026-08-31 with the own-value ruling).** The canary asserted rejection of the THREE-token `read-tree --index-output=<path> HEAD`, which no pinned shape can match on argument count alone — so it went green against a set that ACCEPTED the TWO-token form of the same exploit and emptied the user's index. Both forms are asserted now. **The general rule is worth more than the fix: A CANARY THAT DIFFERS FROM THE EXPLOIT BY ARITY PROVES NOTHING ABOUT THE EXPLOIT** — argument count is the first thing shape-equality decides, so such a canary dies before it reaches the slot under test, and it certifies a rejection the set never made. **This is the `+0`-delta shape again, one level in:** the assertion ran, and it ran past the thing it was believed to be checking.<br>**THE PROOF STANDARD FOR A LATER GATE — INSTRUMENTATION MAY NOT MAKE SEAM CALLS OF ITS OWN. This rule is one DEFAULT-DENY INTRODUCED, so a gate that has done this before has not done it under C.** A harness that reaches for git through the production seam issues an unpinned shape and reddens every cell it runs — for its OWN reason rather than the cell's, which proves nothing. **Measured at `578d17b`:** a first pass of the three exploit cells reddened all three because the harness located the index with `rev-parse --git-path index` THROUGH the seam; routed around the seam and re-run, each cell failed for its own reason. **Under the retired direction this was harmless** — an extra read resolved to a repository and passed — **so a gate that inherits a pre-C harness inherits a false red.** A red whose reason is not the cell's is not a measurement.<br>**WHY DEFAULT-DENY, ON PURPOSE, AND WHY THE SET MAY NOT BE WIDENED TO MAKE A TEST PASS.** A denylist of index-writing subcommands is an ENUMERATION — the same shape as the projection (b) retires and the four per-shape tests W5 retires — and it fails the same way: a call nobody listed defaults to LEGAL. Under default-deny a call nobody pinned defaults to VIOLATING, so an edit that adds one cannot land silently. **That asymmetry is the whole reason for the direction.** **The set above is CANONICAL here, so adding a shape is a change to this table — a spec change, and therefore owner-visible by construction rather than by anyone's diligence.** Row **W6**'s standing clause independently reaches the subset of additions that would give a gate, report or accounting field an index-derived input; it is CITED for that and not restated. **The two rules are not co-extensive and the canonicity is the load-bearing one** — a new shape that feeds nothing index-derived is outside W6's clause and is still an owner-visible table change.<br>**ONE ALTERNATIVE IS REJECTED BY NAME: EFFECT-MEASUREMENT** — deciding each invocation by measuring whether the index changed across it. **Rejected because it reimports the write-then-restore blindness (b) measures and W5 item 2 retires**, one call at a time instead of once per run: a call that writes the index and restores it before returning is green, and that is the exact class the enforcement exists to catch. **A later round re-proposing it is not raising a new option.**<br>**ONE MECHANICAL TRAP SURVIVES, and it is about the DISPOSITION rather than the verb.** `GIT_INDEX_FILE` must be RESOLVED, not merely present: `GIT_INDEX_FILE=<vault>/.git/index` IS set, and is exactly the write this row forbids — presence alone grants nothing. The rule it resolves against is the two-clause rule above, which this trap does not restate; what it adds is that the check is on the RESOLVED path, not on the string. **AND THE VALUE MUST BE ABSOLUTE BEFORE ANY OF THAT: a `private` shape carrying a NON-ABSOLUTE `GIT_INDEX_FILE` is REFUSED UNJUDGED** — neither clause is applied to it, no verdict is returned, and the seam wrapper raises a harness ERROR. **A refusal is not a fifth failure mode** (owner ruling, 2026-09-02): the guard declines to decide rather than deciding a new way. **The reason is that resolving a relative value would model GIT'S FRAME, which is the direction this row retires** — two candidate frames, the `-C` directory and the worktree top, were each measured FALSE on git 2.39.5, and a third measurement showed the answer also depends on the invocation's whole environment, so a guard that does not replay that environment answers a different question than the invocation asks. **The run's own value is ABSOLUTE UNDER EVERY SUPPORTED CONFIGURATION — stated that way rather than as "absolute by construction", because it is not:** `paths.state` is forced absolute under `$WIENERDOG_HOME` by `assertSafeOverride` (`core/paths.js:21-31`) while `HOME` is deliberately NOT validated (`core/paths.js:7-10`), so a relative `HOME` is the one producible exception, it is unsupported, and this refusal stops the suite on it rather than judging it. The run's real value is `<stateDir>/dream-index.<pid>.tmp` (`:230`), under `~/.wienerdog/state`. **THE TWO TRAPS THAT ARE GONE went with the direction and may not return as helpers:** resolving a subcommand past leading global options, and asking git which repository an invocation reaches. Under C nothing resolves a verb and nothing asks about a repository — both questions are HOW the retired direction failed, and W5 item 4 records each with its refutation.<br>**COVERAGE — stated as a LIMIT, never implied as a total.** The seam is total over `src/cli/dream.js`, which is where this package's pipeline lives and where every git call it adds goes. **TWO git spawn points on the dream path are NOT on it, and they are named rather than left to a grep — "contains no raw `spawnSync`/`execFileSync`" would be TRUE OF BOTH and would prove nothing, since both spawn git through `spawnPinnedSync`.** **(i) `core/dream/validate.js`'s `git()` (`:64-65`) spawns through `spawnPinnedSync` directly, not through `opts.spawnGit`** — and it runs on every dream: `assertGitRepo(vaultDir)` (`cli/dream.js:587`) issues `git -C <vault> rev-parse --git-dir`, **in the user's repository, invisible to a seam wrapper.** **THIS SPAWN POINT IS IN SCOPE UNDER (a) — it is OUR act, and the hook narrowing does not reach it:** the narrowing covers code the USER configured, not invocations this package itself makes outside its own seam. **ITS CHARACTER CHANGED WITH THE DIRECTION, and the old sentence may not be carried forward.** Under the allowlist it was *an unobserved call argued safe by its fixed form*; under default-deny it is **an unobserved call that WOULD BE A VIOLATION IF IT WERE OBSERVED** — `rev-parse --git-dir` is not one of the nine pinned shapes. **That does not make it unsafe and it is not a defect:** `rev-parse` was measured index-safe at `1ac82ac` from a stale-stat state, and `assertGitRepo` issues exactly that one invocation, so its safety rests on the same standard the `unset` dispositions rest on. **What it does change is that CLOSING THE SEAM IS NOW A TWO-PART CHANGE, of which one part is owner business.** Threading the pipeline's `spawnGit` into `assertGitRepo` is in-boundary — both files are in this WP's Deliverables — but it reddens the suite on its own, because it surfaces a TENTH shape, and admitting that shape is an addition to the pinned set, which is a change to this table. **An implementer who closes the seam and then widens the matcher to get green has done the one thing default-deny exists to prevent.** **THE ELECTION TODAY IS TO LEAVE IT, ADMISSIBLE ONLY ON THAT MEASUREMENT AND NEVER ON (d).** The disjunction this clause once offered — *"either close it … or leave it and rely on (d), which sees an index write whatever spawned it"* — was FALSE and is withdrawn: (d1) is blind to write-then-restore, **measured — a raw `execFileSync` of `git -C <vault> update-index --assume-unchanged` outside the seam, with the bytes restored, is GREEN on all three layouts**, a real index write invisible to BOTH surfaces. (d) sees a PERSISTENT write whatever spawned it and is blind to a TRANSIENT one. **THE ELECTION CARRIES A STANDING TRIGGER: any change to what `validate.js` spawns falsifies it, and the answer is then to close the seam AND bring the new shape to the owner — never to leave it unstated, and never to cite (d) as this spawn point's coverage.**<br>**(ii) `core/dream/promote.js`'s `spawnGitForMerge` (`:311`) is promote's OWN seam and the pipeline does not forward into it** — measured: the pipeline's `promote({ … })` call (`cli/dream.js:941`) passes no `spawnGit`. **It is outside this row's SCOPE by construction rather than by any classification of the call:** its one invocation is `merge-file` on three absolute temp paths, with `cwd` a fresh `mkdtemp` root that `promote.js` asserts is outside the workspace (the block whose refusal reads *"the three-way merge needs a working directory outside the workspace"* — cited by literal, because this family has already paid for line citations that rotted) and which lies outside any repository, under a constructed env — so (a) never reaches it. **Do NOT "fix" this by forwarding the pipeline's seam into `promote()`: the two seams have incompatible conventions** — `spawnGitPinned` passes the directory as `-C <cwd>` and sets no process `cwd`, so the merge would run with the dream process's own cwd and destroy the property that assertion exists to guarantee — **and under default-deny it would also surface `merge-file` as an unpinned tenth shape.** `src/core/dream/promote.js` is outside this package's Deliverables besides. **(iii) `core/vault.js`'s raw `add -A` + `commit` (`:119-123`) is out of scope on row W6's finding, which this clause CITES and does not restate.**<br>**(d) THE DIAGNOSTICS — TWO, both on the red path, and NEITHER of them enforces this row.** **(d1) THE ENDPOINT COMPARE — RETAINED DELIBERATELY, and weighed by name rather than kept by habit.** **What it is still worth:** when the seam reddens it names WHAT changed rather than only which command ran; and it is the one check that sees a **PERSISTENT** write arriving by a path the seam cannot observe — **which is not hypothetical, it is exactly the `validate.js` spawn point (c)(i) names.** **The word PERSISTENT is load-bearing and was missing until 2026-08-31:** a write followed by a restore on that same path is green here too, measured on all three layouts, so this diagnostic is a PARTIAL cover of that spawn point and (c)(i) may not cite it as the spawn point's coverage. **What it CANNOT do, stated because it is why it is no longer the enforcement: it is blind to write-then-restore** — the measured class in (b), and precisely the class (a) exists to forbid. **A carefully reintroduced refresh that restores the original bytes before returning would return GREEN.** It is therefore never the sole surface for this row and no surface may describe it as enforcing it. <br>**LOCATING THE INDEX — `git rev-parse --git-path index`, NEVER a constructed `<vault>/.git/index`.** The constructed form is retired WITH its cause (row W5): it names the wrong file in two producible user layouts, measured at `1ac82ac` on git 2.50.1. **In a LINKED WORKTREE** (`git worktree add`) `<vault>/.git` is a FILE and the live index is at `<main>/.git/worktrees/<name>/index`; a real `git update-index --assume-unchanged` lands there and `ls-files -v` prints `h`, while `<vault>/.git/index` **does not exist before OR after** — so the ABSENT-compares-equal rule below turns `null === null` into a PASS over a run that wrote the index. **Under `--separate-git-dir`** the same shape: `<vault>/.git` is an 87-byte file and the index lives in the separate dir. **A vault in a linked worktree is a producible configuration, not a residual** — adopt requires a git repo and a linked worktree is one (owner ruling, 2026-08-31, rejecting the "no producing workflow" classification). **THE THREE LAYOUTS ARE THEREFORE FIXTURE PARAMETERS, not one happy case:** the index test runs over `plain`, `separate-git-dir` and `linked-worktree` (`buildVaultRepo`). **And the retirement is measured in place rather than argued:** with the constructed locator restored and the vault's index genuinely written, the check was **GREEN on `separate-git-dir` AND on `linked-worktree`** and red only on `plain`; with the `--git-path` locator it is RED on all three. **A single-layout fixture could not have distinguished those.** **Resolution rule, and it has a trap:** `--git-path` returns the RELATIVE `.git/index` in a plain repo and an ABSOLUTE path in the other two, so a correct implementation handles both — and the relative answer is **relative to the repository, not to the caller's cwd** (measured: `git -C <vault> rev-parse --git-path index` from `/` returns `.git/index`), so resolve it against the VAULT. `rev-parse --git-path index` is itself index-safe from a stale-stat state (measured at `1ac82ac`), so taking it before the run costs nothing. **A non-zero exit from `rev-parse` is a test ERROR, never an ABSENT.** <br>**READING IT.** Read the located file directly, never through a git process, so the measurement cannot perturb what it measures: `fs.readFileSync` of that path, taken before the run and after it, compared with `Buffer.equals`. **Compare CONTENT ONLY — never mtime, ctime or inode.** Measured at `cbc7240`: a merely READ-ONLY `git status` replaces `.git/index` with a new inode and a new mtime while the content stays byte-identical, so any check keyed on stat metadata carries a false red. **A missing index is a legitimate VALUE, not an error** — represent it as `null`/`ABSENT` and let absent compare equal to absent, so the diagnostic is total over a vault that has one and a vault that does not. **That rule is only sound once the path came from `--git-path`**: under the constructed path it was the silencer in the worktree layout above, which is how a rule that is right in isolation became a defect. <br>**AND THE FIXTURE DECLARES WHICH KIND OF VAULT IT IS — a precondition, separate from the comparison and not a weakening of it.** `assert.notEqual(before, null, …)` before the run: the comparison stays TOTAL over both kinds of vault, while the fixture states that THIS vault has an index, so an absent reading is a broken fixture rather than a silent pass. **Total-over-absent and declare-your-fixture are not in tension; conflating them is what let a mislocated read read green.** Shipped as `gitIndexPath(vault)` = `path.resolve(vault, git(vault, ['rev-parse','--git-path','index']))`. <br>**(d2) THE PROJECTION MESSAGE — a MESSAGE on the red path, never a second assertion.** A raw hash that differs says nothing about WHAT differs, so on failure the message prints `git ls-files -v --stage` and `git ls-files -f` **as two separate reads**. `ls-files` provably never writes the index (measured at `cbc7240`: after a tracked file's mtime moves, `status` and `diff` rewrite the index and `ls-files -v --stage` does not), so taking both before the run as well costs nothing. **They must NOT be combined into `ls-files -v -f --stage`:** measured at `cbc7240`, the two flags share one letter column and collide — a path carrying ONLY `fsmonitor-valid` prints `h`, which is `-v`'s spelling of `assume-unchanged`, and the house scan regex `/^([a-z]\|S) /` fixed in `docs/specs/done/WP-launcher-no-self-resync-republish.md` would silently reclassify it. **AND THE MESSAGE MUST ANNOUNCE ITS OWN BLINDNESS:** when the endpoint diagnostic is red and **BOTH projections compare equal**, it says so in words, because an empty diff under a failing check reads as a broken test rather than as a caught defect. **That condition is shape (i) and any shape nobody has enumerated — it is NOT shape (ii)**, which `ls-files -f` prints even though `-v --stage` does not; the shipped code omits the sentence for (ii) and is the correct party. *(An earlier form named "shapes (i) and (ii) above", inheriting (b)'s error.)* **The sentence is conditioned on the MEASURED equality of both projections and never on a list of shapes** — a list is the enumeration this row keeps retiring. **THE SEAM'S OWN RED CARRIES ITS INVOCATION TOO, and that requirement is (c)'s — cited here, not restated**, because two copies of it is how this row and W5 once came to name different mechanisms. *(The form that stood here until 2026-08-31 asked for "the resolved subcommand", which the direction change retired: nothing resolves a subcommand any more.)* **Both diagnostics are messages and MAY NOT become the assertion**, in this test or any other: one contract, one enforcement, this row. <br>**(e) THE ONE FALSE-POSITIVE CLASS OF THE ENDPOINT DIAGNOSTIC, named rather than hidden — and now mostly ABSORBED by (c).** Git rewrites the index's cached stat data on its own — measured at `cbc7240`: touch a tracked file so its mtime moves with its content unchanged, then `git status` or `git diff`, and the raw bytes change with no semantic edit. **A red therefore means "a git command that refreshes the index ran in the user's repo", which is a violation of this row whether or not it changed a staged entry.** **Under (c) this is no longer a diagnosis a reader has to make**: neither `status` nor `diff` is a pinned shape, so the seam reddens as an UNKNOWN SHAPE and names the invocation. **Both were measured to refresh, and the measurement is kept because it is the ground of the rule rather than of the allowlist that carried it — at `1ac82ac` on git 2.50.1 from a stale-stat state, `status --porcelain` rewrites the index file and so does `diff`; `diff` must be measured from a FRESH stale state, since a preceding `status` refreshes the index and makes a later `diff` look safe.** The class survives only for a refresh arriving outside the seam's view — the `validate.js` spawn point (c)(i) names, and anything a future edit adds there. That it is not happening today is measured, not assumed: see row W6, whose standing clause already requires owner review before any such command is added. |
| W2 | **The cost, stated rather than hidden** | Because HEAD advances and the index does not, the user's index still describes the PRE-RUN HEAD. `git status` therefore reports the paths the run committed as staged deletions or reverse modifications, and `git diff HEAD` reports phantom deletions. **Measured at `dd18370`** against a reproduction of the exact publish shape: a path the run modified reports `MM`, a path the run added reports `D` in the index column (with the worktree column blank) plus a separate `??` for the same path, and `git diff HEAD --stat` shows a deletion of a file that HEAD contains. **The committed content is unaffected** — `git cat-file -p HEAD:<path>` returns the promoted bytes in every case. The noise is in the index-mediated VIEWS, never in the history |
| W3 | **The remedy, and it is one command** | `git reset` in the vault (no `--hard`, no paths) re-syncs the index to HEAD and clears every symptom in W2. It is safe precisely because W1 holds: the run wrote nothing there, so there is no run state for the reset to destroy — only the user's own pre-run staging, which the user is the party entitled to drop. **Any surface that states the cost states the remedy in the same breath**; a cost recorded without its one-command fix reads as a defect |
| W4 | **`git revert` REFUSES until the remedy is applied — a real precondition on a property ADR-0012 states** | With the stale index in place, `git revert <dream sha>` fails: `error: your local changes would be overwritten by revert` / `fatal: revert failed`, exit 128. **Measured at `dd18370`**, both directions: refusal before `git reset`, clean success after it. So ADR-0012's one-commit-per-run revertability is now **conditional on `git reset`** rather than immediate. **Its registered mirror is the assertion that already pins this exact shape** — `tests/integration/dream.test.js`, the test *"full run commits valid tiers, reverts injection + weak skill, deletes out-of-vault, one revertable commit"*: revert throws, `git reset -q`, revert succeeds, and the post-revert check is made against `HEAD` rather than against `status`. **The wording of that conditionality was NOT settled by this row and was routed as a STOP-POINT on 2026-08-31; the owner ruled AMEND the same day**, so ADR-0012, ADR-0010, ADR-0020, `docs/THREAT-MODEL.md`, `docs/specs/MILESTONES.md` M3 and `docs/PRD.md` are rewritten to the conditional form under the five Deliverables rows amendment note 3 grants. **What the ruling preserves is the PROPERTY — a run is deterministically and loudly undoable — and what it retires is the literal "one command"; the conditional form is the guarantee stated accurately, not a weakening of it.** The canonical phrasing every amended surface carries byte-identically is fixed in that note. **THE MIDDLE PATH — having the run perform the `git reset` itself — IS REJECTED BY NAME** and its reasons are recorded in `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md`, so that it is not re-proposed as an obvious improvement: it would reimport the defect-4 class as designed behaviour, and it would violate row W1 |
| W5 | **THE RETIREMENT REGISTER — the compare/update race, and now FOUR retired mechanisms, each recorded WITH its cause, so that none reads as a silent weakening and none returns as an obvious simplification** | **The TOCTOU.** The retired refresh read each path's existing index entry and then conditionally rewrote it. Two operations over a mutable index with a window between them is a TOCTOU, and a concurrent `git add` in the user's own shell landing in that window was overwritten — one of the four measured data-loss defects. **That race is not mitigated here; it is unrepresentable, because the act that created it — this package writing the user's index — is gone.** No compare, no update, no window. Nothing inherits the race, and nothing needs to: it was created entirely by the mechanism that no longer exists. <br>**THE RETIRED MECHANISMS, recorded to the same standard — and there are now FOUR. The first three are the same mistake at three depths (a representation of the index, then a wider one, then the artifact itself); the FOURTH is a different mistake, and item 4 says which.** **(1) THE PROJECTION.** Between 2026-08-31 and this row, the contract was enforced through a `git ls-files` projection — first `--stage`, then `-v --stage` after a gate found `--stage` blind to index flags. **That patch-a-column-per-round pattern is the retired thing**, and its cause is that a projection is an ENUMERATION of the index and the contract is a TOTAL over it; row W1(b) holds the two measurements that ended it. **Do not "simplify" the enforcement back to an `ls-files` comparison** — it is not simpler, it is a narrower contract wearing the total's words, which is exactly the shape the four defects had. **(2) THE ENDPOINT COMPARE AS THE ENFORCEMENT — retired as a ROLE, not as a check.** The raw-bytes comparison that replaced the projection was the THIRD representation in three rounds, and the round that followed found it insufficient too: **an endpoint compare tests an ARTIFACT and (a) is about ACTS, so a write-then-restore returns green** — measured in W1(b). **The lesson is the one this row exists to record: a fourth representation was never going to close it.** The enforcement changed KIND, to the git seam of W1(c). **The endpoint compare survives as a DIAGNOSTIC (W1(d1)), kept on stated grounds rather than by inertia** — it names what differs, and it is the only check that sees a **persistent** write from the one dream-path spawn point the seam does not observe — a transient one is green there too (W1(c)(i)). **No surface may call it the enforcement of this row.** **RE-PROPOSED AND RE-REJECTED IN ROUND 8, recorded here because that is what this register is for:** the round that measured a user `reference-transaction` hook writing the index below the seam proposed retreating to this state-total — "the index is byte-identical at run end" — as the answer. **Rejected by the owner (2026-08-31) on this item's own ground:** it is green on every write-then-restore, the hook's included, so it would not even detect the residual it was offered to cover. **That residual was resolved as a SCOPE question instead, and the retirement of (a)'s unbounded form is recorded in row W1(a) — this register is not complete without it.** **(3) THE CONSTRUCTED INDEX PATH `<vault>/.git/index` — retired with its cause, to this row's standard rather than by quiet substitution.** It names the wrong file in a linked worktree and under `--separate-git-dir`, and in the worktree layout it turns a real index write into a PASS via the absent-compares-equal rule; the layout measurements are in W1(d1) and the locator is `git rev-parse --git-path index`. **A vault in a linked worktree is a producible user configuration and was explicitly ruled NOT a residual** (owner, 2026-08-31): adopt requires a git repo, and a linked worktree is one. <br>**(4) THE INTENT-CLASSIFICATION DIRECTION — the verb allowlist `INDEX_SAFE_GIT` and the configuration-derived target probe — RETIRED BY MEASUREMENT, and this is the only one of the four retirements that is not a representation problem.** Between the change of kind recorded in item 2 and this row, the seam decided each invocation by UNDERSTANDING it: resolve the subcommand past leading global options, then ask git which repository — later, which index file — the invocation would reach, and admit it if the verb was on a twelve-entry index-safe allowlist. **Two independent refutations, two rounds apart, each reproduced independently, retired it. Both are recorded because either alone is sufficient and they fail the direction in DIFFERENT places.** **REFUTATION 1 — THE GRAMMAR GROWS, so the verb is not reliably derivable from argv.** `git --attr-source log update-index --chmod=+x f.txt` WROTE the user's index — measured, mode `100644` → `100755`, exit 0 — and went unflagged: `--attr-source` is a value-consuming global option added in git 2.40, the resolver did not know it, so the resolver read the verb as `log`, which WAS on the allowlist. **The round before had patched the identical shape for `--namespace`.** The lesson is not the missing entry: **git's global-option grammar is not ours and it grows, so a resolver built on it can always be one entry short — and one entry short HERE grants by omission.** `INDEX_SAFE_GIT` is retired with this refutation as its cause, **not silently dropped**; its twelve members were never measured wrong, and the six that underwrite C's `unset` dispositions are carried forward in W1(c) with their pin. **REFUTATION 2 — THE TARGET IS NOT A PROPERTY OF THE CONFIGURATION.** `GIT_INDEX_FILE=<private> git read-tree --index-output=<user index> HEAD` **DESTROYED the user's staged content** — measured: the user had `two` staged, and after the call the entry was back to the committed `one`, index sha `dd271d29…` → `0097ddb9…` — while the index-identity probe reported the PRIVATE index, so the call went unflagged. **`--index-output` is a SUBCOMMAND flag, not a global option, so no amount of global-option replay reaches it**: the destination is decided by the subcommand's own grammar, which the probe never sees. **A configuration-derived answer to "which index would this write" is therefore not an answer at all**, and widening the replay cannot make it one. **BOTH EXPLOITS FAIL AGAINST C — BUT NOT FOR THE SAME REASON, and the cell that once said they did is CORRECTED HERE rather than quietly dropped, because a register that edits its own measurements silently is worth nothing.** Refutation 1, and refutation 2 in the THREE-token form measured at `578d17b`, fail on argument count and literals alone: no pinned shape has their shape, and neither would pass even if every slot were free. **REFUTATION 2 IN ITS TWO-TOKEN FORM DID NOT FAIL AT ALL UNTIL 2026-08-31.** `read-tree --index-output=<user index>` — the same exploit with `HEAD` omitted, which `read-tree` accepts — matched `read-tree «sha»` on argument count, was ACCEPTED, and emptied the user's index with a legitimate private `GIT_INDEX_FILE` set and every disposition clause satisfied. It is rejected now for ONE reason and it is not the shape's arity: **W1(c)'s own-value slot admits no token this run did not produce.** *(The verdict it reports is still the UNKNOWN-SHAPE red — there is one no-match verdict and W1(c)'s four failure modes gain no fifth member. What changed is what makes a call unknown, and that difference is the whole content of the gap.)* **THE EARLIER FORM OF THIS CELL — *both fail as unknown shapes, each for that reason and no other* — WAS FALSE WHEN IT WAS WRITTEN**, and false in the way this register exists to catch: it certified a CLASS as closed on the strength of one member's argument count. Both forms are measured RED at `5c5d082` and both are asserted by W1(c)'s vacuity guard. **The structural point survives the correction unchanged, in the owner's words:** enumerating the BAD is unclosable because git's grammar is not ours; enumerating our OWN GOOD is closable because the run's call set is ours. **THE RETIREMENT IS TOTAL AND ITS RESIDUE GOES WITH IT:** `INDEX_SAFE_GIT`, the verb resolver, the global-option collector, the vault-git-dir binding they fed, and the rationale comment block that argued the retired predicate in the present tense are all removed rather than left standing beside their replacement — **a superseded rationale is retired WITH its mechanism, because a rationale left in place beside a new mechanism is read as describing it.** **AND ONE REMEDY IS REJECTED BY NAME rather than merely not taken: EFFECT-MEASUREMENT** — deciding each invocation by measuring whether the index changed across it. It reimports item 2's write-then-restore blindness one call at a time, so it is green on the exact class the enforcement exists to catch. W1(c) carries the same rejection at the enforcement.<br>**THE ASSERTION.** One test SOURCE replaces the four retired ones: `tests/unit/dream-pipeline.test.js`, cited by the stable stem of its name — *"the run does not touch the user's git index — at all, `<layout>` vault (row G8)"*. **Cite the STEM, never a whole name: it is ONE `test()` call inside the layout loop and therefore THREE tests at run time** (`plain`, `separate-git-dir`, `linked-worktree`), one per fixture parameter W1(d1) fixes. **The total in that name is W1(a)'s and carries W1(a)'s scope — the run's OWN acts — which this cell points at and does not restate.** **An earlier form of this cell cited a single name without the layout suffix — a name no longer in the file** — which is the citation-rot this table already records for line numbers, arriving through a test title instead: the suffix moves with the layout list, the stem does not. It seeds ordinary staged content, a staged deletion, a staged mode change and a real unresolved merge, then asserts row W1's contract **with row W1's ENFORCEMENT (`watchIndexWrites` and the PINNED CALL SET, `KNOWN_CALLS`) and its two DIAGNOSTICS (`gitIndexPath`, `projV`/`projF`), which this row cites and does not restate** — and it observes the seam across EVERY run state W1(a) names, success and each abort path, not only the one that reaches the publish. **It is parameterised over the three vault layouts (`buildVaultRepo`: `plain`, `separate-git-dir`, `linked-worktree`), for the reason W1(d1) measures.** It has a real RED — measured at `cbc7240` by mutating `commitNamedSet` to re-stage a vault path in the user's index with its own identical mode and sha: the raw comparison went red on every run state that reaches the publish, and `ls-files -v --stage` stayed green on all of them. **That mutation is now the WEAKER of two required reds, and it no longer discriminates the enforcement from the diagnostic** — both catch it. **The mutation that separates them, and which the seam assertion must be proven RED against, is the WRITE-THEN-RESTORE of W1(b):** the endpoint compare is green on it by construction, so a suite that only runs the re-stage mutation cannot tell whether the enforcement shipped at all. **MEASURED at `3a6c183`, each mutation's application grep-proven before its result was believed:** write-then-restore — **RED, and it is the SEAM that fires, not the endpoint**; `assume-unchanged` with the seam live — RED on all three layouts; identical mode+sha re-stage — RED; `fsmonitor-valid` — RED; unmutated control — GREEN. **All four remain required and all four fall under class (1) above — each is a git call the run does not make, so each is an UNKNOWN SHAPE under the pinned set; the write-then-restore is still the one that separates the enforcement from the diagnostic, because the endpoint compare is green on it by construction.** **THE REQUIRED RED SET WAS RE-DERIVED WHEN THE DIRECTION CHANGED, and the re-derivation is stated because a mutation set inherited across a change of direction proves the OLD mechanism.** Under default-deny the classes that discriminate are: **(1)** a git call the run does not already make, **(2)** any change to a pinned call's argv, and **(3)** a private-disposition call whose `GIT_INDEX_FILE` is moved onto the user's index or into the vault. **MEASURED at `578d17b`, each cell's application grep-proven:** `--attr-source log update-index --chmod=+x` — **RED, UNKNOWN SHAPE**; `read-tree --index-output=<user index> HEAD` — **RED, UNKNOWN SHAPE** (**the arity is written into the cell because it is load-bearing: this is the THREE-token form, and the TWO-token form of the same exploit was ACCEPTED by the set of that date** — see the `5c5d082` cells below); `GIT_INDEX_FILE=<vault>/scratch-index write-tree` — **RED, *private index lies inside the user's working tree*** (the working-tree clause W1(c) settles, which nothing else catches); matcher mutated to ACCEPT everything — **0 pass / 3 fail**; matcher mutated to REJECT everything — **0 pass / 3 fail**; unmutated — 3 pass / 0 fail. **AND ONE CELL WAS ADDED AT `5c5d082`, TOGETHER WITH THE SLOT NARROWING THAT MAKES IT PASSABLE (W1(c)'s own-value slot):** `read-tree --index-output=<user index>` — TWO tokens, a legitimate private `GIT_INDEX_FILE` set — **ACCEPTED with a free slot, which is the measured gap, and RED with the own-value slot**; the legitimate `read-tree «own tree-ish»` — **still accepted**, so the narrowing is not a matcher that rejects everything; the three-token form and `--attr-source` — **still RED for their own reason**, argument count and literals. **THE THREE DISCRIMINATING CLASSES ARE UNCHANGED BUT CLASS (1) IS NOT SELF-CERTIFYING, and 2026-08-31 measured why:** a git call the run does not make can still MATCH a pinned shape when a slot is wider than the value that slot holds — which is exactly what the two-token redirect did — so class (1) discriminates only as far as W1(c)'s SLOT KINDS are correct. A cell asserted under class (1) proves the shape is unpinned; it does not prove the slots are. **THE TWO CLASSIFIER-ERA MUTATIONS ARE RECLASSIFIED RATHER THAN CARRIED OR DROPPED.** The **REPEATED `-C`** falls under class (2) — it changes argv, so it is an unknown shape. The **env-borne `GIT_DIR`/`GIT_WORK_TREE`** redirect no longer discriminates the enforcement, because the matcher asks nothing about repositories: **the reason it is not a hole is that no pinned shape can be made to write the user's index by a repository redirect** — the three index-writing shapes carry an explicit `GIT_INDEX_FILE`, which `GIT_DIR` does not override, and an ambient `GIT_INDEX_FILE` arriving on an `unset`-disposition shape is itself a violation. **That is a REASONED ground, not a measured one, and it is marked as such**: a round that wants it measured measures it rather than inheriting this sentence. Their historical colours stay pinned to `28dbcda` as a record of what retired the enumeration. **And the locator pair, which is this row's third retirement stated as a measurement:** the RETIRED constructed locator was **GREEN on `separate-git-dir` and on `linked-worktree`** over a run that DID write the user's index, red only on `plain`; the `--git-path` locator is RED on all three. It covers shapes nobody has enumerated, which the four per-shape tests — two of which passed after the mechanism was deleted — did not. **The pattern this row is an instance of is `docs/specs/logbook/2026-08-30-toctou-class-retired-with-its-cause.md`'s**, and the full record is `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md` |
| W6 | **No downstream consumer reads the user's index — re-derived, not inherited** | The standing condition on the drop is that nothing in the package depends on a refreshed index, **and it was re-derived at `dd18370` rather than taken from the removal commit's claim.** What the sweep found: the run's only index writes go to `GIT_INDEX_FILE`; `core/dream/validate.js` runs exactly four git commands (`rev-parse --git-dir`, `status --porcelain -uall`, `reset --hard HEAD`, `clean -fd`) of which **only `rev-parse --git-dir` still has a caller** (`cli/dream.js:582`) — `assertCleanTree` and `restoreVaultToHead` are exported but called nowhere in `src/`, having been retired by row G3's re-base onto the workspace; `core/vault.js`'s `add -A` + `commit` is the vault-CREATION path, guarded on the repo having no HEAD, and is not on any dream path; `core/dream/promote.js` invokes only `merge-file`; and the two `--cached` strings left in `src/` are PROSE about retired git-derived evidence, one a JSDoc `@param` on a pure string parser with no `src/` caller and one a comment stating that the property is now established from the delta's `addedLineNumbers` over workspace bytes **instead of** from `git diff --cached`. **The gates consult git nowhere**, which is the ADR-0012 amendment's own claim, and it is what makes W1 affordable. **A future change that gives any gate, report or accounting field an index-derived input falsifies this row and must come back to the owner before it lands** |

### Mirrored Surface Checklist

- [ ] **TABLE W — the user's git index (registered 2026-08-31).** Every mirror of
      "what a dream does to the user's staging area", enumerated because the
      absence of this enumeration is what let four data-loss defects land in four
      review rounds. **In-boundary mirrors, which agree with Table W today:**
      the comment block in `src/cli/dream.js` closing `commitNamedSet`,
      **identified by its opening line — `THE USER'S INDEX IS NOT THIS RUN'S
      PROPERTY` — and not by a line range, because ranges rot and this one already
      had**: it was registered here as `` `:270-287` at `dd18370` ``, and measured
      at that same SHA the block runs `:265-282`, `:283` is already
      `return commit;`, and `:270` lands mid-sentence inside it. It is the run's
      own statement of W1, W2 and W3, and the surface an implementer reads first.
      `tests/unit/dream-pipeline.test.js`'s index assertion — **the SEAM
      ENFORCEMENT of W1(c), the ENDPOINT DIAGNOSTIC of W1(d1) including its
      `git rev-parse --git-path index` locator, and the PROJECTION MESSAGE of
      W1(d2)** (W1, W5) — and the retirement note above it naming the four tests
      it replaces; `tests/integration/dream.test.js`'s revert
      throw-reset-succeed sequence (W4), its "ASKED OF HEAD, NOT THE INDEX"
      comment on the committed-paths criterion, and the warnings-file check that
      asks the FILE rather than `status` or `diff HEAD` (W2's reason for both).
      **TWO MIRRORS REGISTERED BY THE 2026-08-31 EXTRACTION PASS, because they
      are where the contract drifted before anyone registered them:** the
      **verification-steps greps** below — now FOUR, the only surfaces that
      CHECK the test carries row W1's mechanism rather than merely asserting
      something about the index, **and the first of them had its polarity
      INVERTED in the same pass**, because the spelling it used to require is the
      spelling W5's third retirement forbids; and
      `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md`'s
      "Where the assertions went" section, which carried its own copy of the
      mechanism and drifted with W5's — **swept again on 2026-08-31 when the
      enforcement changed kind, together with that entry's projection-retirement
      record, which gained the third retirement beside the other two — and a
      THIRD TIME the same day, when the object-name slots were pinned: that
      entry's intent-classification section carried the SECOND copy of the
      *both exploits fail as unknown shapes, each for that reason and no other*
      claim that W5 item 4 corrects, so the correction was worthless in one copy
      alone.** **The logbook needs no Deliverables row:**
      `scripts/boundary-check.js` (`:54`) always allows `docs/specs/logbook/`, so
      the owner's boundary grant of 2026-08-31 is already satisfied structurally,
      and adding a row would put a second statement of the permission beside the
      first — the disease this table treats.
      **THE SCOPE SENTENCE — registered 2026-08-31 with the owner's ruling that
      narrowed W1(a), and the register is the ruling's THIRD CONDITION rather
      than a courtesy.** Every surface that states the total in any form — *"the
      run never writes the user's index"*, *"touches it in no way at all"*,
      *"does not touch it"* — **must either carry the scope sentence (the claim
      ranges over the run's OWN acts: its own git invocations and its own file
      writes) or cite row W1(a), which defines it.** The owner's words: *"no five
      drifting paraphrases again."* **IN-BOUNDARY AND SWEPT IN THIS PASS:** row
      W1(a) itself (the definition), W5 item 2, and
      `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md`'s
      headline claim and its rejection-argument quote.
      **THE OTHER MIRRORS OF THE TOTAL, FOUND BY A REPO-WIDE SWEEP FOR THE CLAIM
      AND ALL SWEPT IN THIS PASS (`2a5e7de`) — every one of them IN BOUNDARY,
      each with its own Deliverables row, which is why the ruling's third
      condition was DISCHARGED here rather than registered as routed work:**
      `src/cli/dream.js` (row at `:226`) — the product's own statement of the
      total, identified by the literal `THE USER'S INDEX IS NOT THIS RUN'S
      PROPERTY`, never by line number, per the rot note above;
      `tests/unit/dream-pipeline.test.js` (`:228`) — the `watchIndexWrites`
      header, the parameterised test's own name-body comment, and the
      replaces-all-four note; `docs/adr/0012-dream-run-lifecycle.md` (`:232`);
      `docs/adr/0010-vault-adoption-paths.md` (`:235`);
      `tests/integration/dream.test.js` and `tests/integration/adopt-e2e.test.js`.
      **`docs/THREAT-MODEL.md` (`:234`) NEEDED NO EDIT and that is a finding, not
      an omission:** its T1 bullet already cites ADR-0012 beside the claim, so it
      inherits the scope from the amended ADR — the citation form this rule
      offers as the alternative to carrying the sentence, working as designed.
      **AN EARLIER FORM OF THIS PASSAGE CALLED THESE SURFACES OUT-OF-BOUNDARY AND
      SAID NONE HAD A DELIVERABLES ROW. That was FALSE and is recorded rather
      than quietly replaced**, because the failure mode is specific and
      repeatable: it confused the SPEC-ONLY LANE an author was working under with
      **the WP's permission boundary, which is decided by `scripts/boundary-check.js`
      against the Deliverables table and by nothing else.** Measured against that
      checker, all five are INSIDE, and the negative control discriminates —
      `README.md` and `src/core/vault.js` both come back OUTSIDE. **Registering
      in-boundary work as un-routable is worse than leaving it unregistered: a
      later gate reads "routed, not fixed" as coverage and stops looking.**
      **HOW A LATER GATE RE-VERIFIES THIS SWEEP — the pattern must be
      WHITESPACE-FLATTENED, and this is a requirement rather than a preference.**
      **Measured during this pass:** a line-oriented grep of the claim family
      found **12** occurrences and reported all 12 swept; the same pattern run
      over whitespace-flattened text found **15**. Three claims WRAP ACROSS LINES
      and are invisible to a line-oriented pattern, and **two of those three were
      genuinely unswept — including `src/cli/dream.js`'s, the product's own.**
      **A line-oriented re-grep therefore certifies a FALSE ALL-CLEAR on exactly
      the surfaces that matter most**, which is this family's
      grep-the-claim-not-the-sentence failure arriving through a new door: the
      claim was not missing, it was merely folded.
      **No surface may state the cost without the W3 remedy, none may narrow W1
      to "the user's staged entries survive", none may assert a post-run
      vault property through `git status` or `git diff HEAD`** — both are
      index-mediated and now carry W2's noise, so an assertion built on them is
      measuring the drop rather than the property it names — **and NO PROSE SURFACE MAY SPELL
      THE MECHANISM — the seam invariant, the PINNED CALL SET, the index locator,
      the endpoint compare — EXCEPT ROW W1.** Every other prose mirror names the
      contract and cites the row; the one thing prose may not do is restate the
      mechanism, because two copies of it is precisely how W1 and W5 came to name
      different ones.
      **THE RULE IS SCOPED TO PROSE AS OF 2026-08-31, AND THE SCOPING IS A FIX
      RATHER THAN A LOOSENING: the earlier form said "no surface", which its own
      registrations three sentences above falsify** — the verification-steps grep
      registered here IS a spelling of the mechanism (that is its entire function:
      it is the only surface that CHECKS the test carries it), and the deliverable
      test IS the mechanism rather than a statement about it, so a literal reading
      required deleting the one grep this row's enforcement is checked by.
      **THREE EXEMPTIONS, and there are no others.** **(i)**
      `tests/unit/dream-pipeline.test.js`, the executable code W1 specifies — a
      test that could not spell it could not run. **(ii)** the
      **verification-steps greps** below, which are checks ON that spelling and
      whose text moves with W1 in the same pass. **(iii)** **a SHA-PINNED
      MEASUREMENT RECORD is not a statement of the mechanism**: a sentence of the
      form *"measured at `<sha>`: `<command>` returned `<x>`"* reports what was run
      on a tree, not what must be run now, and stays true after W1 moves.
      **That is what makes W5's surviving `ls-files -v --stage` legitimate** — it
      sits inside a measurement pinned to `cbc7240`, describing the representation
      that round retired. **A record loses the exemption the moment it drops its
      pin or its past tense**, at which point it is prose stating the mechanism and
      must defer here.
      **REGISTERED 2026-08-31 BY THE DIRECTION CHANGE (owner ruling: the run's own
      calls are PINNED, default-deny) — the mirrors the new enforcement creates,
      registered in the SAME PASS that created them, which is the discipline this
      checklist exists to enforce.** **(1) THE PINNED CALL SET has exactly two
      copies and they are not peers:** row **W1(c)** is where the set is DECIDED,
      and `KNOWN_CALLS` in `tests/unit/dream-pipeline.test.js` is the executable
      copy under exemption (i). **No third copy may be written**, in prose or in
      code — a set that appears twice as prose is the disease this table
      treats, and a shape added to the code copy without the row is exactly the
      silent widening default-deny exists to prevent.
      **THE SLOT KINDS ARE PART OF THE SET AND MOVE WITH IT — registered
      2026-08-31 with the own-value ruling, and registered because this is the
      form the pair actually drifted in.** The defect measured that day was not
      a new shape appearing: it was an existing slot admitting more than the row
      decided. **That failure adds no shape and changes no literal, so
      default-deny does not catch it and NO GREP REACHES IT** — a presence check
      for the placeholder symbol stays green while any one slot still carries
      it. The row writes each slot's kind AT the slot (`«own …»` ↔ `RUN_VALUE`,
      every other guillemet token ↔ `ANY`) so the two copies can be compared
      slot by slot, and that comparison is the reviewer's step (1) below.
      **THE MATCHING RULE IS A THIRD REGISTERED PAIR, distinct from the set:**
      W1(c) decides it, `shapeMatches` with the `ANY`/`RUN_VALUE` JSDoc is the
      executable copy under exemption (i), and reviewer step (1) below STATES it
      for a reviewer — that third surface is a citation of the rule, not a
      fourth copy of the set, and it was corrected in this same pass because it
      had described one placeholder kind where there are now two. **(2) THE TWO-CLAUSE PRIVATE
      INDEX RULE** — *neither the user's index NOR inside their working tree* —
      is decided in W1(c) and mirrored by the `watchIndexWrites` JSDoc and its
      predicate. **This pair is registered BECAUSE IT ALREADY DRIFTED:** the JSDoc
      promised both clauses while the predicate checked one, so the prose was the
      correct party and the code was silently weaker. **The registration is the
      remedy: whichever of the two moves, the other moves in the same pass, and
      the row decides which way.** **(3) THE FOURTH VERIFICATION GREP** below is
      the ABSENCE check on the retired `INDEX_SAFE_GIT` spelling, and it carries
      the same polarity logic as the other two absence checks: the thing it looks
      for is the thing the contract now forbids. **(4) THE HARNESS RULE** —
      instrumentation may not make seam calls of its own — is stated once, in
      W1(c), as part of the row's proof standard; a gate re-deriving W5's measured
      cells reads it there rather than rediscovering it as three false reds.
- [ ] **TABLE W's ONCE-OUT-OF-BOUNDARY mirrors — the STOP-POINT was raised on
      2026-08-31 and RULED the same day (AMEND), so this entry is now the sweep's
      register rather than the gap's.** These surfaces stated the dream's
      revertability as immediate, which W4 measured to be conditional on
      `git reset`. **All are granted rows by amendment note 3 and all move in ONE
      pass, in the canonical phrasing that note fixes:**
      `docs/adr/0012-dream-run-lifecycle.md:23` (inside RETIRED part 1's
      rationale — its carrier is gone but the claim was never restated or
      withdrawn, and a top-down reader meets it 180 lines before learning the part
      is retired, **which is why the ruling requires an explicit WITHDRAWAL NOTE
      legible at the point of reading and not only in the later amendment**),
      `docs/adr/0010-vault-adoption-paths.md:20`,
      `docs/adr/0020-skill-revision-lifecycle.md:147` and `:188`,
      `docs/THREAT-MODEL.md:84` and `:115`, `docs/specs/MILESTONES.md:14`
      (release gate **M3**, "`git revert` cleanly undoes a run"), and — **found by
      the re-sweep this ruling ordered, and absent from the STOP-POINT's own
      five-surface list** — `docs/PRD.md:21` ("revert any night with one git
      command").
      **THE PRD MISS IS THE INSTRUCTIVE ONE and is recorded rather than quietly
      corrected:** the previous form of this entry cleared `docs/PRD.md` BY NAME,
      on a measurement taken at `:11`, which states only ONE COMMIT PER RUN and is
      genuinely untouched by W1. The claim itself sat ten lines below, unread.
      **A file cleared by association at one line is not cleared at another** —
      the same grep-the-claim-not-the-sentence failure this family has now paid
      for at the acceptance-criterion, mutation-row and checklist layers alike.
      **THREE SURFACES ARE DELIBERATELY NOT SWEPT, named so the next pass does not
      "fix" them:** `docs/THREAT-MODEL.md:415`,
      `docs/adr/0020-skill-revision-lifecycle.md:180` and `README.md:69` all name
      the PROPERTY the ruling preserves (*undoable*), never the "one command"
      mechanism it retires. **TWO CONSUMERS LIE OUTSIDE `docs/` and are NOT swept
      here:** `src/cli/adopt.js:275-277` (user-facing CLI text promising "one
      commit you can undo with a single `git revert`") and
      `tests/integration/adopt-e2e.test.js:212-217`, which are the
      Implementation-notes bullet *"the immediate-revert claim outside `docs/`"*'s
      subject and a Discovered-issues item, not this documentation ruling's.
- [ ] **ROW G13 — the code-owned `reason` invariant (registered 2026-08-31).**
      Its mirrors are the JSDoc on `records` (`cli/dream.js:884`), whose two bare
      `string` fields are exactly the missing signal the row supplies; the render
      site itself (`:1162`); the single producer (`:891`); and the
      warnings-refresh line of the same shape (`:657`). **No surface may describe
      that line's `reason` as neutralised** — it is not, and the row's whole
      content is that it does not need to be *while* it stays code-authored.
      **The classification and the transformation are cited, never restated:**
      `docs/specs/done/WP-dream-promote-report.md`'s Table N owns them, and a
      second copy here would be a drifting duplicate of a contract this package
      does not own.
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
- [ ] **THE REPORT PATH — this side of Table Z.** The contract is
      `WP-dream-promote-report`'s **Table Z** (the derivation and its single
      owner, the delta-record identity, the multiple-match outcome and the
      per-consumer authority; owner-ruled 2026-08-30 after escalation trigger
      (i) fired on PR #42, so a citation of it names a ROW). **That spec's
      Table Z checklist entry names row G8 and this spec's Out-of-scope bullet
      as its mirrors here; this entry is the registration on this side** — the
      same two-sided shape as the partially-published-report entry above. Its
      mirrors here are row **G8**'s report-path clause, the decided-bytes
      acceptance criterion (which asserts it) and the Out-of-scope bullet naming
      that package's tables. **Three prohibitions: no surface here may derive
      the report path a second time — the commit READS `report.rel` (row
      **Z5(e)**); none may state the derivation's segment rule, which is row
      **Z1**'s and which is the mirror BOTH of that package's product defects
      came through; and none may claim ONE path value is authoritative for every
      consumer, which row **Z5** gives three answers to.** **This entry exists
      because the gate found row G8 registered as a Table Z mirror while this
      spec had ZERO occurrences of `report.rel` — the registration was correct
      on that side and this side had none (PR #42, round 3's finding 3).**
- [ ] **THE RETIRED REPORT HEADING — this side of Table R's headings row.** The
      heading STRINGS are `WP-dream-promote-report`'s **Table R** headings row
      (pinned 2026-08-30 after PR #42's round-1 finding 4, which found two of
      them invented by an implementer and pinned by nothing). **What is THIS
      package's is the RETIREMENT of the shipped
      `## Reverted by orchestrator (policy enforcement)` string**, which happens
      because this package removes the validator's Step-4 append; that spec's
      headings checklist entry names row **V4** and the retired-heading
      acceptance criterion as its mirrors here, and this entry is the
      registration on this side. Its mirrors here are **Table V row V4**, that
      criterion, and the criterion's verification grep. **No surface here may
      state a heading string as its own decision, and none may restate the
      rename's GROUND** — that under promotion nothing is reverted is
      `WP-dream-promote-module`'s Table D's, cited by the row that renames.
      **`skills/wienerdog-dream/SKILL.md` names the retired string to the BRAIN
      and is Out of scope here:** the criterion records that staleness as a
      follow-up instead of asserting it, so it is carried openly rather than
      silently.
- [ ] **THE REFUSED ARM'S REASON — this side of a Table N channel.** The channel
      is `report.reason` on `promote()`'s `refused` arm, classified by
      `WP-dream-promote-report`'s **Table N** and RENDERED by this package: the
      section composer never interpolates it, so that spec's
      code-authored-section criterion scopes it out of its universal by name and
      this spec's report-refusal criterion, case **(a)**, is where its
      neutralisation is asserted. Its mirrors here are row **G11**'s obligation
      **(i)** and that criterion's case (a). **This is the refused arm's twin of
      the `report.accounting.reason` registration inside the
      partially-published-report entry above, and it is registered SEPARATELY
      because THE TWO ARMS CARRY DIFFERENT FIELDS** — `report.reason` here,
      `report.accounting.reason` there — **so a criterion that asserted one over
      both would leave the other's channel unasserted, which is the shape round
      6's CD-3 closed on the other side** (registered 2026-08-30, with that
      channel's own Table N row; PR #42, round 1's finding 5).
- [ ] **THE NEUTRALISER'S SECOND CODE CARRIER — registered because one security
      contract has TWO code carriers and neither owns it (PR #55, round 1;
      routed to the architect because no in-boundary carrier could be the
      owner).** `WP-dream-promote-report`'s **Table N** classifies the channels,
      and its owner ruling of 2026-08-29 makes **THE MECHANISM THE
      IMPLEMENTER'S** — so Table N names no code carrier, and this entry does not
      give it one. **A second carrier is CONTRACTED, not accidental:** Table N's
      `report.reason` and `accounting.reason` rows both read *"redact, then
      sanitise, **wherever it is RENDERED**"* and name THIS package as the party
      that renders them, because the section composer never touches either
      value. **So the drift risk is not the two-line body — it is the ORDER
      RATIONALE.** Row **N1** is the single owner of WHY redact precedes
      sanitise, and its grounds are a measurement about
      `sanitizeProjectName`'s character class, not a fact about either carrier.
      `src/core/dream/promote.js` restates it above its own composer; **this
      package's carrier CITES row N1 by letter and may not restate the
      measurement, the character class or the `token=…` result** — a rationale
      stated twice is two places to falsify the day the order is re-decided, and
      the second copy is the one nobody walks. Its mirrors here are row
      **G11**'s obligation **(i)** and the report-refusal criterion's cases
      **(a)** and **(b)** — the two channels this package's carrier serves.
      **ROUTED, NOT SETTLED.** Collapsing the two carriers into one is a
      SUCCESSOR's, and this entry pins the two shapes that are already ruled
      out: it may not be an export added to `src/core/dream/promote.js`, whose
      exclusion from the Deliverables table is load-bearing and whose
      `module.exports` a `Done` package pins name by name; and it may not be a
      code carrier named in Table N, which would reverse that table's owner
      ruling. The remaining home is `src/core/secret-scan.js`, which already
      owns `redactOnly` and is what N1's measurement is about — three files
      across two `Done` packages, so it is a WP and not an amendment here.
- [ ] **The `records` handoff** — row G12 produces them, row G11 delivers one
      copy, and `WP-dream-promote-report`'s `records` input takes the other.
      **Two channels, deliberately: a log line is not a durable record.**
      **WHICH SCRATCH EVENTS PRODUCE A RECORD AT ALL is part of this
      registration (PR #55, round 1).** Row G12 splits the retired Step 1 into
      two shapes — enumerate-delete-record for UNEXPECTED writes, the fail-loud
      ABORT for a missing or CHANGED expected input — and only the first
      produces a record. Its mirrors are row **G12**, **Table V row V1**'s
      production and "Inherited by" cells, and the scratch-integrity acceptance
      criterion. **No surface may say a changed expected extract is
      deleted-and-recorded under the pipeline**, and none may assign
      delete-and-record to G12 without naming which half it means. **V1 carried
      exactly that conflation for a round while this entry named G12 as the
      producer and nothing walked the pair** — the same shape as the round-6
      CD-1 finding two entries up, in a table extracted to make owner cells
      checkable.
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
- **The immediate-revert claim outside `docs/` — TWO consumers, NEITHER fixed
  here, and the second one may be RED right now.** The 2026-08-31 AMEND ruling
  rewrote six documentation surfaces to the conditional form (amendment note 3).
  The re-sweep that ruling ordered found the same claim in two places this
  package's Deliverables do not grant, and **a documentation ruling is not
  authorization to change code or tests**:
  **(1)** `src/cli/adopt.js:275-277` prints, to the user, at adoption time:
  *"Wienerdog needs git so a night of auto-written memory is one commit you can
  undo with a single `git revert`."* Its JSDoc says the same at `:123`. That is
  the literal retired claim in USER-FACING product text, and it is the one place
  the user is asked to make a decision on the strength of it.
  **(2)** `tests/integration/adopt-e2e.test.js:212-217` runs
  `git revert --no-edit <sha>` with **no preceding `git reset`** and then asserts
  `git status --porcelain` is empty. **Both halves are now falsified by Table W:**
  W4 measured that the revert REFUSES (exit 128) in exactly that state, and the
  Table W checklist forbids asserting a post-run vault property through
  `git status`, which is index-mediated and now carries W2's noise. Its sibling
  in `tests/integration/dream.test.js` was re-pointed at `dd18370` to the
  throw-`reset`-succeed shape; **this one was not, and the file is one that runs
  red in this environment for unrelated reasons — which is precisely how a real
  regression hides.** Record both under "Discovered issues"; do not fix either
  from this WP.
- **The reap verdict already exists** (`cli/dream.js:286`) and is discarded.
  Surfacing it is a return-value change, not new machinery — resist rebuilding a
  reap check beside the one that is already there. What IS new is making it
  unconditional (row G2).
- **`assertCleanTree` has two consumers and they are not the same consumer, and
  the distinction survives the 2026-08-30 amendment — what changed is what
  "re-based" costs the SECOND one.** Removing `precommitSessionEdits` removes
  one of them (`:508`) outright. The other (`:251`) is the unknown-command
  non-vacuity GUARD, and that guard does NOT go: it is re-based onto the
  workspace delta (row G3). **Its CALL to `assertCleanTree` does go, because
  re-basing it is exactly the act of replacing that call** — the premise the call
  rested on (a tree asserted clean immediately before the spawn) is what removing
  the precommit destroys, and the amendment's point is that a re-based guard
  cannot still be reading the vault. **Deleting the GUARD is wrong; keeping the
  CALL is wrong.** What discriminates a genuine rejection is now the empty
  delta, and the criterion below is where that is proven.
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
      rejection from a working run without reading the vault. **Proven RED
      against an implementation that drops the guard's DELTA half and aborts on
      the marker alone** — which is the vacuity that matters, because the marker
      is attacker-influenceable and a guard resting on it alone re-opens the
      nightly retry-DoS a writing run used to be protected from. **The RED that
      stood here until 2026-08-30 — "deletes both `assertCleanTree` uses" — is
      WITHDRAWN and the reason is the amendment's:** after the re-base the
      correct implementation HAS no `assertCleanTree` use, so that mutation is
      not a mutation at all and the criterion could not fail on it.
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
      (`WP-dream-promote-module`, Table Q rows Q1, Q8 and Q9).
      **AND ONE TRIGGER NARROWED, WITH ITS CAUSE, AND THE NARROWING IS NAMED
      RATHER THAN LEFT TO BE DISCOVERED (owner ruling, 2026-08-30).** The
      preservation-failure abort's identity check used to RE-READ THE VAULT and
      compare that read against the preserved copy; the extracted gate is HANDED
      the bytes it preserves, so the copy holds them by construction. **A whole
      TOCTOU class therefore retired together with its CAUSE — the vault
      re-read — and the two arms only that class could reach ("a copy exists but
      is of the WRONG bytes", "the identity read cannot be performed") are
      unreachable by construction, not by weakening.** What remains is asserted
      in BOTH directions: both preserves failed → fail-loud refuse; a durable
      copy exists → recoverable, no abort. **THE PROTECTION DID NOT VANISH, IT
      MOVED, and this is where a future reader is told so:** a user save landing
      between the judgment and the publish is the vault-write primitive's
      `expect` guard — Table H row **H5**
      (`docs/specs/done/WP-dream-vault-write-primitive.md`), which states the
      conditional publish and names its own residual — and it is ASSERTED THERE,
      in `tests/unit/dream-vault-write.test.js`. This package CITES it and does
      not re-assert it; a second copy here would be a drifting duplicate of a
      contract this package does not own. The move is recorded in
      `docs/specs/logbook/2026-08-30-toctou-class-retired-with-its-cause.md`.
      **Proven RED
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
      enter the commit. **How the bytes reach the run's PRIVATE index is not
      asserted** — round-4 CUT ruling. **The word `index` is qualified here as of
      2026-08-31, and the qualification is the point:** unqualified, this sentence
      read as a decision not to contract the USER's index either, which is the
      area four data-loss defects then landed in across four review rounds. The
      CUT ruling reaches only the private index this criterion is about — the
      staging mechanics behind `commit-tree`. **What happens to the user's index
      is contracted, by Table W, and is not cut.** **A SECOND QUALIFICATION, added
      2026-08-31 with Table W row W1(c)'s direction change, because the two
      surfaces would otherwise read as opposite instructions:** this criterion
      still asserts nothing about the staging mechanics, but **W1(c)'s pinned call
      set now CONSTRAINS them as a side effect** — the run's `hash-object -w
      --stdin`, `update-index --add --cacheinfo`, `read-tree`, `write-tree` and
      `commit-tree` invocations are pinned by shape, so an implementation that
      staged the same bytes by a different git call would be an UNKNOWN SHAPE and
      red. **That is the price of default-deny and it is deliberate:** the remedy
      for a legitimate change of staging mechanics is to amend the pinned set in
      W1(c) — a change to a canonical table, and therefore owner-visible —
      **never to loosen the matcher so the new call slips through.** **ASSERTED FOR THE REPORT PATH ON A PARTIAL PUBLISH
      TOO (row G8, round 4's A1; this obligation carried no criterion until
      round 5's H4):** when `promote()` returns `report.outcome === 'promoted'`
      with `accounting.published === false`, the report path IS in the run's one
      commit and what is committed is that arm's `bytes` — the body the first
      write published. **AND THE PATH IT IS COMMITTED AT IS `report.rel`, READ
      OFF THAT ARM** (`WP-dream-promote-report`'s Table Z, row **Z5(e)**), never
      a path this package derives — **proven RED against a pipeline that
      re-derives the report path from `layout.reports_dir` and the date**, which
      is green on every run where the brain's spelling and the derived path
      agree and, on a case-sensitive volume where they do not, stages a path
      this run never published to. **Proven RED against a pipeline that SKIPS the report
      path on that form**, which drops a published, gated file out of the run's
      one commit, **and separately RED against one that MANUFACTURES the missing
      enforcement section**, which commits bytes no gate judged and no primitive
      published.
- [ ] **The retired report heading (Table V row V4).** After the extraction the
      validator writes no report section of its own, and a completed run's
      report carries `## Refused by policy (promotion enforcement)` — the string
      `WP-dream-promote-report`'s **Table R** pins — while
      `## Reverted by orchestrator (policy enforcement)` appears in neither the
      committed report nor the run's output. **Proven RED against an extraction
      that leaves the validator's Step-4 append in place**, which writes BOTH
      sections into one report and is green on every other criterion here. The
      shipped assertions on the old string move with it, in
      `tests/unit/dream-validate.test.js` and `tests/integration/dream.test.js`.
      **The brain-facing sentence in `skills/wienerdog-dream/SKILL.md` also
      names the old string and is NOT asserted here** — that file is Out of
      scope for this package and its staleness is recorded there as a follow-up.
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
      **AND `report.reason` IS NEUTRALISED WHERE IT IS RENDERED (row G11).**
      `WP-dream-promote-report`'s Table N classifies that channel
      attacker-influenceable BY DERIVATION — it carries the failed read's error
      or the primitive's row **H7** reason, whose H7 and H9 forms name a
      surviving object whose name derives from the brain-chosen path — and names
      THIS case as where the obligation is asserted, because this package is the
      party that RENDERS it and the section composer never interpolates it.
      **GREEN:** with a report path whose refusal reason carries both
      markdown-active text and a context-dependent secret — at least
      `token=abcdefghijkl` AND `client_secret: abcdefghijkl`, because a
      prefix-shaped secret survives the sanitiser intact and is caught in either
      order — the raw secret bytes appear nowhere in the run's log or
      user-visible output. **RED against a pipeline that renders `report.reason`
      raw**, which passes every other clause here. **This is case (b)'s clause
      one arm over, and it is stated rather than inherited because THE TWO ARMS
      CARRY DIFFERENT FIELDS** — `report.reason` here,
      `report.accounting.reason` there — **so a clause written over one would
      leave the other's channel unasserted.**
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
# The unknown-command guard is RE-BASED off the vault (rows G3 and G6), so the
# call goes with the premise it rested on. This is a grep on a file that MUST
# exist, so guard the absence case first: grep on a missing file exits 2, which
# `!` would turn into a false green.
test -f src/cli/dream.js && ! grep -q "assertCleanTree" src/cli/dream.js
# Step 4's report append goes with the step (Table V row V4), retiring the
# shipped `## Reverted by orchestrator` heading. Guard the absence case first:
# grep on a missing file exits 2, which `!` would turn into a false green.
test -f src/core/dream/validate.js && ! grep -q "Reverted by orchestrator" src/core/dream/validate.js
test -f docs/adr/0012-dream-run-lifecycle.md && grep -qi "promot" docs/adr/0012-dream-run-lifecycle.md
# TABLE W row W1's THREE RETIRED FORMS and its one greppable requirement.
# NONE of these proves the ENFORCEMENT: W1(c)'s seam invariant is not greppable
# — a `spawnGit` grep is green on any implementation that also does CLAIM 2b, so
# it discriminates nothing — and that is the reviewer's step, noted below.
# (1) The CONSTRUCTED index path is RETIRED (W1(d1), row W5 item 3):
# `<vault>/.git/index` is the wrong file in a linked worktree and under
# `--separate-git-dir`, and in the worktree layout it turns a real index write
# into a PASS. NOTE THE POLARITY: this step was a PRESENCE check until
# 2026-08-31 and is now an ABSENCE check, for the same reason the
# `assertCleanTree` grep was inverted — the thing it looked for is the thing the
# contract now forbids. The pattern matches the CODE spelling only, so prose
# naming the retired form, or a `worktrees/<name>/index` fixture path, does not
# false-red it. Guard the absence case first: grep on a missing file exits 2,
# which `!` would turn into a false green.
test -f tests/unit/dream-pipeline.test.js && ! grep -qE "path\.join\([^)]*'\.git',\s*'index'\)" tests/unit/dream-pipeline.test.js
# (2) ...and the index the endpoint diagnostic reads is located git's own way
# (W1(d1)): `git rev-parse --git-path index`, which is the only form correct in
# all three layouts. Nothing else in this file has a reason to name `--git-path`,
# so unlike the seam this one does discriminate.
test -f tests/unit/dream-pipeline.test.js && grep -q -- "--git-path" tests/unit/dream-pipeline.test.js
# (3) The RETIRED PROJECTION representation must not be what the index test
# compares (W1(b), row W5 item 1). Deliberately a grep for the retired
# SNAPSHOT-HELPER spelling, not for `ls-files`: W1(d2) REQUIRES `ls-files` in the
# failure message, and the fixture needs `ls-files --unmerged` for its
# precondition, so a bare `! grep ls-files` would be a false red on two correct
# lines.
# THE NAME-COUPLING RESIDUAL IS ACCEPTED WITH ITS REASON, not closed with a
# broken check. A gate finding (C4) noted that this pattern keys on the HELPER'S
# NAME, so a renamed reintroduction passes it, and proposed widening to
# `! grep -qE "const [A-Za-z]+ = .*ls-files.*--stage"`. MEASURED at `3a6c183`:
# that widened form MATCHES `:1519`, `const projV = () => git(ctx.vault,
# ['ls-files', '-v', '--stage'])` — the W1(d2) diagnostic the row REQUIRES — so
# it is a false red on correct code, and the accompanying claim that it does not
# hit `projV` is falsified. No regex separates a projection used as a COMPARISON
# from one used as a MESSAGE, because the difference is the role, not the text.
# The residual therefore stands, and the check that closes it is the reviewer's
# step registered below.
test -f tests/unit/dream-pipeline.test.js && ! grep -qE "const snapshot = .*ls-files" tests/unit/dream-pipeline.test.js
# (4) The RETIRED INTENT-CLASSIFICATION DIRECTION must be gone (W1(c), row W5
# item 4). `INDEX_SAFE_GIT` was the verb allowlist the direction rested on, and
# it is the direction's most greppable residue: an implementation that still
# carries it either kept the classifier or left its rationale standing beside
# the replacement, which is the specific failure W5 item 4 records. SAME
# POLARITY LOGIC AS (1): the thing this looks for is the thing the contract now
# forbids. It keys on the retired CONSTANT'S NAME and therefore carries the same
# name-coupling residual (3) accepts with its reason — a classifier
# reintroduced under another name passes it, and the check that closes THAT is
# the reviewer's step below. Guard the absence case first: grep on a missing
# file exits 2, which `!` would turn into a false green.
test -f tests/unit/dream-pipeline.test.js && ! grep -q "INDEX_SAFE_GIT" tests/unit/dream-pipeline.test.js
```

- The two `claim-` runs, both `dream.js` greps, the `validate.js` heading grep
  and the ADR grep are NEW steps
  and each is an ASSERTION: it exits non-zero on failure rather than printing
  something a reader must judge. Paste a real green on the finished state AND a
  real red from a deliberately broken state — the sibling's transitional vault
  argument restored at the call site (reddens `claim-1-pipeline`); a git call
  added with the workspace as cwd (reddens `claim-2b-pipeline`); the
  `precommitSessionEdits` call restored (reddens its grep); the
  `assertCleanTree` call restored in the guard (reddens its grep); the Step-4 append restored
  (reddens the heading grep); the ADR text reverted
  (reddens the docs grep) — so a check that cannot fail is caught before anyone
  believes it. Verify each **also** goes red when its deliverable is ABSENT —
  for the pattern runs that is the file-existence guard's job.
- **The four Table W greps are PRESENCE and ABSENCE checks, not proofs, and the
  gap is stated so no reviewer treats them as one.** Three prove that a RETIRED
  form is absent — the constructed `<vault>/.git/index` path, the `ls-files`
  snapshot helper, and the `INDEX_SAFE_GIT` verb allowlist of the retired
  intent-classification direction — and one proves the `--git-path` locator is
  present. **None of them reaches row W1's ENFORCEMENT at all**, and the reason
  is structural rather than a gap someone could close with a better regex:
  W1(c)'s invariant is a property of the invocations a substituted seam OBSERVES
  AT RUNTIME, which no source pattern can decide. The same indirection defeats
  them one level down, which is measured: at `cbc7240` the shipped check read
  `assert.equal(snapshot(), before, …)`, and no regex over that line can tell
  which representation `snapshot` returns. **FOUR things are therefore the
  REVIEWER's, against rows W1(c) and W1(d), and they are the steps this package
  has now failed four times — once per round of drifted cell.** **(1) THE
  MATCHER IS STRICT SHAPE-EQUALITY AGAINST THE PINNED SET, and nothing in it
  classifies a token** — same argument count, positionwise literal equality,
  FREE placeholders accepting one token without inspecting it, and OWN-VALUE
  placeholders admitting one token only if it is a string the run was observed
  to produce (W1(c), which writes each slot's kind at the slot). **A SLOT
  SILENTLY WIDENED FROM OWN-VALUE TO FREE IS THE MEASURED DEFECT OF 2026-08-31
  and it is this reviewer's step, because nothing else reaches it:** it adds no
  shape and changes no literal, so default-deny does not catch it and no grep
  can — a presence check for the placeholder symbol stays green while any one
  slot still carries it. Compare the row's `«own …»` markers against the code
  copy slot by slot. **A reviewer's specific
  job here is to look for tolerance**: prefix matching, option-order
  insensitivity, any "same call really" shortcut. Each is a small
  re-classification, and re-classification is the direction W5 item 4 retired by
  measurement. **No `cwd` matching, no repository probe, no verb resolver may
  reappear** — those questions are HOW it failed. **(2) EVERY PINNED SHAPE
  CARRIES ITS `GIT_INDEX_FILE` DISPOSITION AND BOTH DIRECTIONS ARE ENFORCED**,
  with the private arm satisfying BOTH clauses — not the user's index, and not
  inside the user's working tree. The second clause is the one that had already
  silently died once while its own JSDoc promised it. **(3) THE SEAM IS OBSERVED
  IN EVERY RUN STATE W1(a) NAMES**, success and each abort path, not only the one
  that reaches the publish. **(4) THE ENDPOINT COMPARE IS PRESENT AS A DIAGNOSTIC
  ONLY**, never as the thing the test would still pass on if the seam assertion
  were deleted. **The last of those has a mutation, and W5 names it: the
  WRITE-THEN-RESTORE.** The endpoint compare is green on it by construction, so a
  suite that goes red only on the re-stage mutation has not demonstrated that the
  enforcement shipped. **AND ONE PROCEDURAL CHECK RIDES WITH ALL FOUR: the
  harness that produces these reds may not make seam calls of its own** (W1(c)) —
  a harness that reaches for git through the production seam reddens every cell
  for its own reason, which is a measured false red rather than a result.
- **All four greps were run against the shipped test at `578d17b` and are
  green** — the fourth, `INDEX_SAFE_GIT`, being the one the direction change
  added and the one that would have gone red on the tree immediately before it.
  The first one's inverted polarity is what makes that meaningful:
  the literal the old presence-check looked for, `'.git', 'index'`, no longer
  exists in the file, so the pre-2026-08-31 step would have gone falsely RED
  against correct code. **A registered grep that outlives the contract it checks
  is not a neutral leftover — it reddens the right implementation**, which is the
  same failure the `assertCleanTree` polarity inversion fixed and the reason that
  step and this one both carry their inversion in the comment.
- **ONE MIRROR WAS OUT OF THIS LANE'S REACH AND IS NOW DISCHARGED — kept as a
  closed entry rather than deleted, so a re-reader does not re-open it.**
  `tests/unit/dream-pipeline.test.js` cited *"row W1(c)"* for the
  total-over-an-absent-index rule, which the 2026-08-31 lettering moved to
  **W1(d1)** (W1(c) is now the seam enforcement). **The implementation lane
  changed the token at `a7ee950`; verified at `28dbcda`, the citation reads
  `(row W1(d1))`.** It was a stale CITATION and never a stale RULE. **The line
  number this entry originally carried (`:1521`) had already rotted by two
  commits when it was checked** — the same line-number rot the Table W checklist
  records for the `dream.js` comment block; cite by literal, not by line.
- **CLAIM 2b is asserted through the git seam, never through a grep.** A source
  grep for a workspace-rooted cwd cannot discriminate: it is green today, green
  on a correct implementation, and green on a broken one that passes the path
  through a variable. Measured during the pre-split spec's round zero — the grep
  that section originally carried was green on the unmodified tree.
- **The `assertCleanTree` grep is an ABSENCE check, not a proof.** It catches a
  guard still reading the vault and nothing finer; that the guard still
  DISCRIMINATES a genuine rejection from a working run is proven by the
  non-vacuity acceptance criterion, which is where the discrimination lives.
  **Its polarity was inverted on 2026-08-30 (owner ruling — see the amendment
  note under Deliverables).** It was a PRESENCE check, and a presence check
  cannot hold beside row G3: G3 says the abort keys off the marker and an empty
  workspace delta, "never off the vault", and the criterion below says the guard
  discriminates "without reading the vault". After the re-base there is no vault
  read left to grep FOR, so the presence form could only be satisfied by keeping
  a call the contract deletes.

## Out of scope (do NOT do these)

- **`WP-dream-promote-report`'s contracts** — Tables N, R, Y and Z and the report row: the neutralisation contract for every attacker-influenceable channel, the report
  body as a promotion candidate, the code-authored second write, the
  preserve-and-extend fallback and its four cases, **and the report path's
  derivation, its identity, its multiple-match outcome and its per-consumer
  authority (Table Z)**. This package DELIVERS
  `report.record` (row G11), PRODUCES the `records` that package consumes
  (row G12) and READS `report.rel` for the commit (row G8, Table Z row
  **Z5(e)**); **it derives no report path of its own**, and it owns none of
  these contracts. **The count that stood here said "neither" against a list
  longer than two, and no count replaces it.**
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
  bounded claim and the reason; nothing here changes it. **AND THAT HOLDS EVEN
  THOUGH THIS PACKAGE RETIRES A STRING THAT FILE NAMES TO THE BRAIN** —
  `## Reverted by orchestrator (policy enforcement)`
  (`skills/wienerdog-dream/SKILL.md:423-425`, Table V row V4). **The staleness
  is RECORDED as a follow-up rather than fixed here:** widening this package's
  Deliverables to a brain-facing skill is an owner call and not an implementer's,
  and the retired-heading acceptance criterion names the file instead of
  asserting it, so nothing is carried silently.
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

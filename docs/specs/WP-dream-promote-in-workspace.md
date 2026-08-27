---
id: WP-dream-promote-in-workspace
title: Promote approved workspace content into the vault and re-wire the dream pipeline
status: Draft
model: opus
size: M
depends_on: [WP-dream-workspace-retarget, WP-dream-vault-write-primitive, WP-dream-baseline-delta-primitive]
adrs: [ADR-0004, ADR-0012, ADR-0020, ADR-0031, ADR-0034]
epic: audit-2026-07-29
---

# WP-dream-promote-in-workspace: promotion replaces filtering

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — the decision half of a three-package family.** This WP,
`WP-dream-workspace-retarget` and `WP-dream-vault-write-primitive` are one
design, split along an owner-ruled seam (logbook:
`2026-08-21-dream-promote-in-workspace-split-ruling.md`) and then extracted
once more after two review rounds landed on the same family (logbook:
`2026-08-21-dream-promote-pair-review-rounds.md`, round 2). Contract table
letters are family-wide: the workspace sibling owns **Tables A, B and F**, the
write primitive owns **Table H**, and this spec owns **C, D, E and G**.
**This spec owns the DECISIONS and owns no filesystem discipline**: every vault
byte it publishes goes through the primitive's `writeIntoVault` (Table H), and
its policy reaches that primitive as the injected `admit` callback. The
extraction exists because both review rounds found the same shape — a barrier
written in PATHS while the attacks arrived by IDENTITY — and the answer was
ruled to be one correct chokepoint rather than another rule.

**Table F — what the family's claims actually establish, measured — lives in
the workspace sibling and is CITED here, never restated** (owner ruling; the
pattern is the same as row M2's treatment of the delta primitive's recipe).
This WP is dispatchable only after BOTH dependencies are `Done`: it consumes
`createWorkspace`/`destroyWorkspace` and the re-targeted `spawnBrain` from one,
`writeIntoVault` from the other, and it replaces the workspace sibling's
transitional call-site argument with the run's real workspace — the line where
the family's claims become true of the running product.

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
  vault as a transitional argument, marked for this WP. **At dispatch the
  implementer reads the exact signatures from the code by path** —
  `createWorkspace`/`destroyWorkspace` in `src/core/dream/workspace.js`,
  `spawnBrain`'s options in `src/core/dream/brain.js` — cited rather than
  restated here so they cannot drift; the transitional write-target argument
  to replace sits at the single production `spawnBrain` call in
  `src/cli/dream.js` (its line is re-measured at dispatch).
- `src/core/dream/validate.js` (1469 lines at `025021f`) — Step 1 scratch
  integrity (`:1107`), Step 2 per-path classification (`:1144`), Step 3 the EP2
  secret gate (`:1211`), Step 4 the dream report (`:1374`), Step 5
  stage-and-commit (`:1411`, whose `git add -A` is at `:1412` — Table E owns
  that call), Step 6 the skill ownership registry (`:1443`). Table D owns what
  each gate's evidence is today and what it becomes. The compare-then-write
  guard this package reuses is at `:884-890` (`readFileSync`+compare at `:889`,
  `renameSync` at `:890`).
- `src/cli/dream.js` — `precommitSessionEdits(vaultDir)` at `:493` followed by
  `assertCleanTree(vaultDir)` at `:494`; a SECOND `assertCleanTree(vaultDir)` at
  `:237` is the unknown-command non-vacuity guard (Table G, F2), a distinct
  consumer that does not go with the precommit; `restoreVaultToHead(vaultDir)` at
  `:535` (brain failed/timed out) and `:550` (scratch changed mid-run);
  `runBrainWithWatchdog` at `:137`, whose reap verdict is computed at `:272`
  **inside `if (pidfile)` (`:256`)** and consumed only to gate the pidfile
  unlink; `pidfile` is `null` on a tokenless manual run (`:149-152`), so the
  verdict is absent there (Table G, F6). The function surfaces nothing about it
  to its caller.
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
 *           imported so `promote.js` does not depend on `validate.js`. Their
 *           inputs differ BY GATE, and Table D owns them: the EP2 secret gate
 *           judges the delta's added lines against the baseline BEFORE the
 *           merge; the other three judge the MERGED candidate bytes, and the
 *           skill-body guard additionally takes the BASELINE ledger as its
 *           authorizing input. The three post-merge gates return a refusal
 *           reason or null; the EP2 gate returns the ADR-0034 taxonomy —
 *           {ok} | {refuse, reason} | {redact, sanitizedBytes} (Table D)
 *  @returns {{promoted:string[],
 *             redacted:Array<{rel:string}>,
 *             refused:Array<{rel:string, reason:string}>,
 *             secretDisposition:{withheld:number, redactions:number}}}
 *    secretDisposition is the typed signal the pipeline's transcript-advance
 *    consumes (Table G, F9) — never a parsed refusal reason. ONLY `withheld`
 *    defers a transcript; `redactions` is accounting (the sanitized note WAS
 *    promoted, so its transcript was consumed — `validate.js:1065-1072`).
 *    Named `withheld`, not `reverts`: promotion never wrote the bytes, so
 *    there is nothing to revert */
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
| C9 | **the promotion allowlist — this spec's `admit`, applied by the primitive to the RESOLVED path** | **Where it is applied is part of the rule (round 2, F4').** C9 is handed to `writeIntoVault` as its `admit` callback, and the primitive calls it with the path the write actually resolves to, never the candidate path (`WP-dream-vault-write-primitive`, Table H row H1). Measured motivation: a pre-existing vault symlink — `01-Projects/alias` → `../reports/dreams`, or → `../.claude` — makes a lexically admitted `01-Projects/alias/evil.md` land in a denied directory, and vault-containment alone cannot see it because the resolved target is still inside the vault. **Matching is CANONICALISED then CASE-FOLDED, in that order (round 2 F7', round 3 F6):** the primary filesystem is case-insensitive — measured, a file created as `claude.md` answers to `CLAUDE.md` — so a literal comparison admits `agents.override.md` while the harness still loads it as an instruction file (the repo reasons this way already at `validate.js:1083-1086`). Case folding alone is not enough either: macOS enumerates decomposed names while accepting composed ones, and measured, `nfc.toLowerCase() === nfd.toLowerCase()` is FALSE for the same directory inode — so `projects_dir` spelled composed and `reports_dir` spelled decomposed name one directory that the positive test admits and the negative test misses. **Every comparison in this row — the tier prefixes, the `reports_dir` negative, the basenames and the segment names — normalises to NFC first**, and so does every layout value it compares against. With that settled, a path is admitted when ALL hold: (a) it is under one of the layout's writable tier directories — `identity_dir`, `daily_dir`, `projects_dir`, `skills_dir`, `inbox_dir` (`layout.js:21-29`; `reports_dir` is excluded, and `daily_filename` is not a directory) — or under `02-Areas/` or `03-Resources/`; **or under the layout's `reports_dir` — which is ADMITTED, not denied (owner ruling on F2'', 2026-08-27). The earlier negative check existed to keep brain content out of a code-owned report tree; that design is withdrawn. The shipped skill requires the brain to author the report (`skills/wienerdog-dream/SKILL.md:409-425`, verified), so the report is brain content and must be admitted here, and round 4's F10 overlap concern dissolves with the tree it was protecting;** (b) its final component ends in `.md`; (c) its basename is not one of the current harness instruction-file shapes — `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md` — at any depth, AND no path segment is `.claude` or `.codex`, AND the basename is not `.mcp.json`. (a) and (b) are a positive allowlist and close the class M7's remediation asks for — a vault-root `CLAUDE.md`, a `.gitignore`, a `.claude/settings.json` and an Obsidian plugin binary are all outside it without anyone enumerating them. (c) is a **named deny-list of the CURRENT conventions (round 1, F5): the product itself already treats `AGENTS.override.md` as a live shadowing convention (`src/adapters/codex.js`), and `CLAUDE.local.md` / recursively-discovered `.claude/**` are current Claude conventions — so `.md` is not a safe content-only extension, and this list is stated as one that will not cover the NEXT convention.** It exists because (a) and (b) cannot reach an instruction file written inside a tier directory |
| M1 | Merge mechanics | **Merge on a COPY; promote only on a clean merge.** Measured on git 2.50.1: `git merge-file` exits 1 and writes conflict markers **INTO the target** — for a divergent edit and for modify/delete alike — so merging on the user's live note would violate the very guarantee refuse-and-report exists to keep. Clean divergent edits exit 0 with correct merged bytes |
| M2 | The merge's git invocation | The merge exit code is a security decision (clean → promote), so the invocation takes the dependency's **constructed-environment** discipline verbatim (`WP-dream-baseline-delta-primitive`, Table C): an environment BUILT from nothing rather than filtered, config and attribute roots pointed at directories this run created empty, a cwd outside any repository, and the verified absolute executable via `spawnPinnedSync` (`src/core/exec-identity.js`). **This spec does not restate that recipe — the dependency owns it, and its spec is a Done record on main: `docs/specs/done/WP-dream-baseline-delta-primitive.md`, Table C.** Measured here as corroboration, not as the guarantee: an armed `merge=` driver via `core.attributesFile` does not reach `merge-file`, and a hostile global config did not move an exit code. That enumeration is not trusted — this program's record at enumerating git's influence channels is 0 for 4, which is precisely why the answer is construction rather than a blocklist. **Named residual, inherited:** absolute verified invocation prevents PATH selection of an impostor; it does not freeze the executable's bytes |
| M3 | Repository attribute sensitivity | **DISCHARGED here, as the dependency required.** The dependency named this as the successor's obligation. Discharged structurally: classification is `computeDelta`, which is git-free and reads no attributes; the workspace contains no `.git` (sibling Table A, Postcondition 1); and the only git this package runs against workspace content is the merge, under the constructed roots above. There is no path by which a repository attribute reaches a promotion decision |

### Table D — the four gates: input and order

Today all four derive their evidence from git in the vault (`validate.js`
Steps 2 and 3). After this package none of them consults git: the secret gate
judges the brain's added lines against the baseline, and the other three judge
the MERGED candidate bytes — which include the user's diverging edits, and are
therefore exactly what would be promoted. The **order inverts** relative to
today: today the secret gate runs LAST (`:1211`, after Step 2's three); after
this package it runs FIRST.

The EP2 gate is not a two-value gate. Per binding ADR-0034 its disposition is a
**taxonomy**, not `reason|null` (round 1, F7): a context-free high-entropy hit
is REDACTED, not refused — the unredacted copy is preserved to quarantine, the
added lines are scrubbed, the sanitized candidate is promoted, the redaction is
reported, and it is counted separately from a hard refusal (`validate.js:1269-1291`
is the shipped redact arm, `:1064-1072` its separate counters). So EP2 returns
one of {pass, refuse-with-reason, redact-with-sanitized-bytes}; the other three
gates stay `reason|null`.

**Unscannable content is a REFUSAL, never a pass (round 2, F3').** The delta
primitive returns no line numbers for a binary record — deliberately, so the
consumer "withholds what it cannot scan" (`delta.js:517-520`) — and an EP2 gate
defined only over added lines would see an empty scan and pass it, after which
nothing else stops an ordinary `.md` and it is promoted raw. Today's validator
does the missing work explicitly (`validate.js:1239-1255`: binary staged
content "cannot be secret-scanned; not committed"), so passing it would be a
regression against shipped behaviour. **A delta record marked binary, or
carrying bytes that are not lossless UTF-8, is refused by EP2 with that
reason** — the empty scan is never evidence of safety.

| Gate | Today | Decision input after | Position | Refusal remedy |
|---|---|---|---|---|
| EP2 secret gate (ADR-0034) | `validate.js:1211` — `git add -A` then `git diff --cached --numstat` per path | the delta's `addedLineNumbers` and derived scan text over the workspace's after-bytes vs the baseline — exactly the bytes this run is responsible for, which is the same property the staged-diff form had | **BEFORE the merge** | **per ADR-0034's taxonomy:** a hard secret → withhold from promotion + preserve to quarantine; a context-free high-entropy hit → **redact** (scrub the added lines, preserve the unredacted copy to quarantine, promote the sanitized candidate, report it, count it separately). **There is nothing to revert**, because nothing was written to the vault: the enforcement half that reverts, re-stages and drops index entries (`:1324-1364` is its revert core) has no subject and goes — but the redact DISPOSITION survives, on the promotion side rather than the revert side. **No line count is stated here**: the figure this row originally carried came from the war-room log (a war-room record kept outside this repo) and was not measured against the tree, and a spec that repeats an unmeasured number lends it authority it never had |
| Skill-body guard (ADR-0020) | `validate.js:1187` `skillBodyViolation` | the merged candidate bytes. **Its authorizing input is the BASELINE ledger, never the post-brain one** — otherwise the brain authorizes its own skill rewrite within a single run | AFTER the merge | refuse-and-report; the note stays in the user's live version |
| Tier-3 floor | `validate.js:1194` `tier3Decision` | the merged candidate bytes | AFTER the merge | refuse-and-report |
| Ledger validation | `validate.js:1156` `ledgerViolation` | the merged candidate bytes | AFTER the merge | refuse-and-report |
| **Why this order** | — | — | — | EP2 runs first and scans the BRAIN's added bytes because those are what the run authored and is responsible for (ADR-0034 is about the AI's accidental persistence); the other three gates run after the merge because a Tier-3/skill/ledger judgment must be made on the MERGED bytes, which are exactly what would be promoted — a gate judging pre-merge bytes would not be judging what is promoted, and that is a data-loss contract, not an implementation detail. **Owner-ruled correction (round 1, F4):** the earlier rationale — "scanning the merged bytes would force discarding the user's diverging edits" — is FALSE, because refuse-and-report (C7) already leaves the user's live version untouched. EP2 is pre-merge and brain-scoped by CHOICE, not by that false necessity, and the consequence is a named residual (Security checklist): a secret the USER writes into their own note during the run rides a clean C6 merge into the dream commit unscanned. That is the user's own content in their own vault — the dream commits it but did not author it — and making the secret gate refuse or redact a user's own note was ruled the worse trade |
| **Atomicity: the skill-guard ↔ ledger pair** | — | — | — | the pair promotes **atomically at the DECISION** (round 1, F8): both outcomes are decided before either is written, so a policy failure on one refuses BOTH — the guard authorizes the skill from the ledger and the ledger is validated from the skill, and promoting one while refusing the other would leave the vault inconsistent. Enforced by Table E's decide-then-write ordering. **This does NOT claim write-atomicity across the two paths**: if the first `rename` succeeds and the second fails (ENOSPC/EIO/kill), the vault holds a half-applied pair. Same-directory `rename` is atomic for ONE path, not across two, and rollback/crash-replay of a partial publish is the residue-lifecycle successor's subject, named in Out of scope — this row claims decision-atomicity and says so |
| The dream report (owner ruling, F2'', 2026-08-27) | `validate.js:1374-1408` — the brain writes the body into the vault, then code APPENDS its enforcement section to that same file | **BRAIN-AUTHORED, and gated like any other file.** The brain writes `<reports_dir>/<date>.md` in the WORKSPACE; `reports_dir` is copied in (sibling Table A) so a same-day second run's existing report is in the baseline. The body is a normal promotion candidate: the delta sees it, C9 admits `reports_dir`, all four gates judge it, and it is published by the primitive like any other note. **Code does not own the body** — the earlier code-owned design is withdrawn because it silently destroyed the `## Gated out (and why)` accounting the shipped skill requires (`SKILL.md:409-425`): that accounting names candidates the brain did NOT write, and **no filesystem outcome can reconstruct a file that never existed.** After promotion, code appends its own measured accounting to the promoted report — a SECOND write through the primitive, with `expect` set to the bytes the first publish returned (Table H rows H5/H6), never an in-place append. **The fallback is stated because a gate can refuse the body:** if the brain's report is refused or absent, code publishes a report holding its own section alone, so the run's enforcement record always reaches the user | judged with the rest, before the append | the body is refuse-and-reported like any note; the code section is then published on its own |

### Table E — the promotion write, and the one new window

| Fact / rule | Value |
|-------------|-------|
| Decide, then write — **narrowed (owner ruling on F1'', 2026-08-27)** | every path's POLICY outcome — allowlist, merge, all four gates — is decided before **any** vault byte is written, and that is what makes Table D's decision-atomicity row enforceable. **It does NOT mean every outcome is decided first.** The premise-still-holds check is the primitive's `expect` guard and necessarily runs per path at publish time (Table H, H5), so a path can turn into refuse-and-report during the write phase, after earlier paths are already published. **Decision recorded (the simpler of the two options the ruling offered):** the claim is narrowed rather than the primitive's API split into prepare/commit — a two-phase API buys write-atomicity across paths, which this package already disclaims as the residue-lifecycle successor's subject, at the cost of a second contract surface |
| The same-date second run (**F4''**, resolved by the F2'' ruling) | two runs on one date share `<reports_dir>/<date>.md`, and under the ruling that path is an ordinary promotion candidate, so nothing special is needed: run 1 promotes it with `expect` absent (absent from baseline, absent from the vault); run 2 finds it in the baseline because `reports_dir` is copied in, the brain rewrites it, and it promotes as a `modified` with `expect` set to the vault's current bytes. **The append-based workaround is not needed and is forbidden** — it was what re-opened the symlink-following defect F3' closed |
| **The publish goes through the primitive — this spec writes no vault byte itself** | every promoted path is published by `writeIntoVault` (`WP-dream-vault-write-primitive`, Table H): resolved-path policy, symlink-free component chain, unpredictable `O_EXCL\|O_NOFOLLOW` temp, conditional `rename`, and a hash of the bytes actually published. **This spec does not restate that discipline — the primitive owns it.** What this spec supplies is the two caller-side arguments: `admit` (Table C's policy, applied by the primitive to the RESOLVED path) and `expect` (the `vault-now` bytes the decision was made against). A promotion that writes the vault by any other route is a defect, and the acceptance criteria assert the seam |
| **The compare→promote window** | the only genuinely new window this direction introduces, and it is **NARROWED, not closed**, to milliseconds against today's minutes-long silent window. The narrowing is the primitive's `expect` guard (Table H, row H5); this spec's obligation is to PASS the right bytes — the `vault-now` bytes the decision used — and to turn `{written:false}` into refuse-and-report. **The residual is the primitive's and is inherited here unchanged:** a user save landing between the re-read and the `rename` is still lost |
| Promotion accounting | every path gets exactly one recorded outcome: `promoted`, `redacted` (EP2 sanitized-and-promoted, Table D), or `refused` with a reason. The dream report's enforcement section is written from that record. A path with no outcome is a bug, and the acceptance criteria assert the partition |
| `precommitSessionEdits` **does not survive** | measured: its stated job is "so the subsequent dream diff is exactly the brain's writes" (`validate.js:113-115`). Under this package the brain writes nothing in the vault, so there is no such diff, and the three-way compare reads `vault-now` from the **filesystem** rather than from git. What remains is only its cost: it commits the user's in-flight edits under the `wienerdog` identity without asking. It goes, and the `assertCleanTree(vaultDir)` at `cli/dream.js:494` (its precommit-pairing use) goes with it. **A SECOND consumer of `assertCleanTree` does NOT go and must be re-based — Table G's non-vacuity row owns it:** `cli/dream.js:237` uses vault-cleanliness to tell a genuine brain rejection from a working run, and that signal's premise (the tree was clean immediately before spawn) is exactly what removing the precommit destroys |
| The dream commit contains **only promoted paths, and the DECIDED bytes** | two requirements, and the second is the one a path-shaped implementation misses (round 2, F5'). First: with no pre-commit, a wholesale stage would sweep the user's uncommitted edits into the dream commit, so the commit carries the promoted paths and the report, and nothing else. Second: **naming the path is not enough** — staging re-reads the working tree, so a user save landing between the publish and the staging call is what enters the commit, ungated. Measured: with a save in that gap, `git add -- <path>` stages the user's post-publish bytes. **The committed content must therefore be the bytes the primitive returned (Table H, H6), not a fresh read of the path.** **How that is achieved is the implementer's — round-4 CUT ruling (owner, 2026-08-27):** an earlier draft prescribed `git hash-object -w --stdin` and `git update-index --cacheinfo`, and manufactured two contradictions doing so (the invocation exits 128 with nothing binding it to a repository; `--cacheinfo` needs an index mode the spec never gave). Those findings dissolve with the prescription. ADR-0012's "one dream run = one git commit in the vault" is unchanged |

### Table G — the pipeline: wiring, the reap precondition, the abort paths

| Fact / rule | Value |
|-------------|-------|
| The run's workspace lifecycle | `createWorkspace` runs before the brain is spawned (which is what makes the sibling's capture-before-spawn ordering a pipeline fact, not just a module fact); the sibling's transitional call-site argument is replaced by the run's workspace; after the brain, `computeDelta` then `promote`; `destroyWorkspace` on every exit path (exception below). **This is the line where the sibling's CLAIM 1 becomes true of the running product**, and the acceptance criteria re-assert its composed-argv form at pipeline level |
| **The reap precondition** | `computeDelta` runs on the workspace only after the brain's process group is **verifiably** empty. `runBrainWithWatchdog` (`cli/dream.js:137`) computes a reap verdict at `:272` — `reapGroupFn(...)` returning `{reaped:true}` — and today consumes it only to gate the pidfile unlink, never surfacing it to its caller. **Measured caveat (round 1, F6): that verdict is computed INSIDE `if (pidfile)` (`:256`), and `pidfile` is `null` on a tokenless manual `wienerdog dream` (`:149-152`) — so on a standalone success the verdict is not merely discarded, it is ABSENT.** This package therefore requires an **unconditional post-settle reap verdict** — computed on every run, tokenized scheduler run and tokenless manual run alike — surfaced to the caller, and it **refuses the run fail-closed** on anything but a verified reap, rather than walking a workspace a surviving process can still mutate. A missing verdict is treated as unverified (fail-closed), never as success. This converts the dependency's explicitly-unverified hypothesis (2) into an enforced precondition (sibling Table F), and it is what keeps a live actor from mutating the workspace during the walk. **PLATFORM-SCOPED, and the scope is the repo's own (round 2, F2'):** `src/core/reap.js:25-33` states that the leaderless-reparented-member guarantee is POSIX-only this release, and `:503-519` shows the win32 branch returning `{reaped:false}` whenever `taskkill` cannot reach an already-exited leader — so a fail-closed rule keyed on a verified group reap would refuse NORMAL Windows runs. On win32 the precondition is therefore satisfied by the brain leader's verified exit plus the existing tree-kill attempt, and **the leaderless-member residual is named, not solved: it is `WP-a10-windows-reap`'s subject**, the package the primitive's own platform note already defers it to. `src/core/reap.js` is in no Deliverables table here and is not modified |
| **The unknown-command non-vacuity signal (F2)** | today the "the brain did not run — the CLI rejected the trigger prompt" abort keys off vault-cleanliness (`cli/dream.js:237`, `assertCleanTree`), sound only because the tree was asserted clean immediately before spawn — the premise `precommitSessionEdits` supplied (Table E) and this package removes. Under this package the brain writes the WORKSPACE, so the non-vacuity evidence moves there: a genuine rejection produced an EMPTY workspace delta (the brain did no work), so the abort keys off `sawUnknownCommand` AND an empty `computeDelta` result, never off the vault. A run that emitted the marker but DID write the workspace proceeds into promotion, exactly as today's guard let a writing run proceed into validation. The vault's cleanliness is no longer evidence of anything the brain did |
| **The pipeline consumes EP2's disposition (F9)** | `promote()` returns a typed EP2 disposition summary (contract), and the pipeline's transcript-advance consumes it the way today's `secretReverts` signal does (`cli/dream.js:568-596`): a transcript whose only note was **WITHHELD** for a secret is NOT marked processed, so it regenerates next run rather than being silently lost. **A REDACTED note does NOT defer** — measured canonical semantics (`validate.js:1065-1072`: redacted files "consumed their transcripts normally and MUST NOT defer, which is why they are counted separately and never enter `reverted[]`"): the sanitized note WAS promoted, so its transcript was consumed and regenerating it would re-do consumed work and mint a second quarantine artifact. `redactions` is an accounting and reporting field, never a deferral trigger. The pipeline reads the typed fields, never a human-readable refusal reason — parsing prose would be an undocumented security interface. A refusal for a NON-secret reason (allowlist, conflict) advances the transcript normally |
| Teardown wiring | the workspace is removed on every exit path — success, refusal, brain failure, timeout — **with one named exception: a run that refused because the reap was not verified does NOT tear down.** Removing a tree a surviving process may still be writing is not a cleanup, and the row above is the whole reason that state is distinguishable. Teardown never touches the vault. A workspace left behind by that refusal, or by a crash, is the residue-lifecycle successor's subject, not this package's |
| **The abort paths change, and leaving them would be a data-loss regression** | `restoreVaultToHead` (`validate.js:139-149` — `reset --hard` + `clean -fd`) is called at `cli/dream.js:535` and `:550`. Both mean "discard the brain's unvalidated writes". Under this package the brain wrote nothing in the vault, so there is nothing to discard — and with `precommitSessionEdits` gone, a `reset --hard` there would destroy **all** of the user's uncommitted work for a failure that never touched the vault. Both call sites become `destroyWorkspace`. `restoreVaultToHead` itself is left in place and exported: **the package's intent brief (a war-room record kept outside this repo) routed the abort paths to the residue-lifecycle successor, and this row is narrower than that** — it changes only which function the two sites call, not the crash-replay, journal or uninstall-restore subject |

### Mirrored Surface Checklist

- [ ] Deliverables-table `Notes` cells (each cites its owning table)
- [ ] `### Exact contracts`' signature and its return shape
- [ ] Acceptance criteria that assert Tables C–E and G
- [ ] Verification steps (the assertions mirror Tables C–E and G)
- [ ] Current-state description (the validator's steps, the discarded reap
      verdict, the sibling's handed-over state)
- [ ] Implementation notes (the merge-on-a-copy trap, the existing reap verdict)
- [ ] Out of scope (what the residue-lifecycle successor and audit finding C2 own)
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
- [ ] **The EP2 disposition taxonomy (F7/F9)** — the `promote()` return shape,
      Table D's EP2 row and its preamble, the promotion-accounting row, Table G's
      pipeline-consumes-disposition row, and the redact/deferral acceptance
      criteria. **No surface may reduce EP2 to `reason|null` or drop the
      `redacted` outcome or `secretDisposition`.**
- [ ] **The primitive seam** — the package note, Table E's publish row, C9's
      application clause, the staged-bytes row, and their acceptance criteria.
      **No surface may describe filesystem discipline as this spec's (it is
      Table H's), and none may show a vault write that does not go through
      `writeIntoVault`.**
- [ ] **The F4 residual, the F3 narrowed window, and the F8 decision-atomicity**
      — Table D's "Why this order" and atomicity rows, Table E's window row, the
      Security checklist's F4 residual, Out of scope's partial-publish line, and
      their acceptance criteria. **No surface may call the window "closed" or
      claim cross-path write-atomicity, and none may re-assert the withdrawn
      "scanning merged forces discarding the user edit" rationale.**

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
      validates each path SEGMENT (rejecting a segment of `.`, `..`, or one
      containing a separator) before any path is joined to the vault root, and
      containment is re-resolved against the
      vault's realpath at write time, not only at decision time.
- [ ] **Named residual (round 1, F4): a secret the USER writes into their own
      note during the run can enter the dream commit.** EP2 scans the brain's
      added bytes before the merge (Table D); a user credential added to the
      live note during the run rides a clean C6 merge into the committed bytes
      unscanned. Owner-ruled acceptable: it is the user's own content in their
      own vault — the dream commits it but did not author it — and making the
      secret gate refuse or redact a user's own note was ruled the worse trade.
- [ ] **The dependency's caller invariant is discharged across the pair, and
      sibling Table F says how.** The invariant, stated so the reader knows
      what is being discharged: no untrusted actor may replace the root entry,
      or any ancestor or directory entry used to reach an enumerated path, for
      the duration of each walk. The pre-brain walks are the sibling's, run
      before any actor exists; the post-brain walk is this WP's and runs only
      after a verified reap (Table G). **No surface may claim the walk
      establishes containment.**
- [ ] The merge's git invocation is a security decision and takes the
      dependency's constructed-environment discipline (Table C, row M2). Named
      residual, inherited and not closed: executable-identity influence at a
      verified absolute path.
- [ ] On the Codex arm the brain can run shell inside the
      workspace; what that shell can reach is measured, and bounded, in sibling
      Table F — not this package's subject. The reap precondition (Table G)
      closes a different concern: a live actor mutating the workspace during
      the post-brain walk. **The findings this package must close are not the
      brain's routes at all — they are OUR OWN process writing the vault, which
      no harness sandbox constrains (Table H's primitive).**

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
- [ ] **M7's mechanism, current conventions (F5).** A brain that writes
      `<workspace>/CLAUDE.md`, `<workspace>/AGENTS.md`,
      `<workspace>/01-Projects/x/AGENTS.md`,
      `<workspace>/01-Projects/x/CLAUDE.local.md`,
      `<workspace>/01-Projects/x/AGENTS.override.md`,
      `<workspace>/.gitignore`,
      `<workspace>/01-Projects/x/.claude/rules/evil.md` and
      `<workspace>/01-Projects/x/.claude/settings.json`
      promotes **none** of them, each with a recorded reason, and the vault
      contains none of them afterwards.
- [ ] **The brain's report body survives end to end (F2'' ruling).** A brain
      that writes a report containing a `## Gated out (and why)` section sees
      that section, byte-for-byte, in the vault's committed report — with the
      code's own accounting appended below it. Proven RED against a
      code-composed report, which drops the section entirely.
- [ ] **The same-date second run (F4'').** Two runs on one date both land: the
      second finds the first's report in the baseline and promotes a rewritten
      body; neither run refuses the report for existing, and no append-in-place
      is used.
- [ ] **Policy is judged on the RESOLVED path (F4').** With a pre-existing vault
      symlink `01-Projects/alias` → a directory C9 denies (`../.claude`, and a
      vault-root target), a brain-written `01-Projects/alias/evil.md` is
      refused and the victim directory gains nothing. Proven RED against an
      implementation that hands the primitive the candidate path. **The
      `reports_dir` variant this criterion used to carry is withdrawn** — under
      the F2'' ruling that directory is admitted, so it no longer discriminates.
- [ ] **Case variants are denied (F7').** `01-Projects/x/agents.override.md`,
      `claude.local.md`, and a path with a `.CLAUDE` segment are each refused.
- [ ] **Unscannable content is refused (F3').** A brain-written `.md` whose
      delta record is binary is refused by EP2 with that reason and does not
      reach the vault. Proven RED against a gate that treats the empty scan as
      a pass.
- [ ] **Every vault content write goes through the primitive — the REPORT
      included (F3).** Asserted by substituting the primitive's seam and failing
      if any vault content write bypasses it — **both of the report's writes,
      the promoted body and the appended accounting, included**. Proven RED with
      the accounting published by a direct `appendFileSync`, and separately:
      with `reports/dreams/<date>.md` pre-existing as a symlink to another vault
      note, the report write refuses and the victim is byte-unchanged.
- [ ] **The commit carries the decided bytes, not a fresh read.** With a user
      save landing between the publish and the staging call, the committed
      content for that path is the bytes the decision approved, and the user's
      post-publish bytes are neither committed nor lost. Proven RED against an
      implementation that stages by naming the path. **How the bytes reach the
      index is not asserted** — round-4 CUT ruling; the earlier criterion named
      `hash-object`/`update-index` and tested mechanism.
- [ ] **Unicode aliases are denied (F6).** With `projects_dir` spelled composed
      and `reports_dir` spelled decomposed (or vice versa) naming one directory,
      a brain-written `.md` under it is refused; and an instruction-file
      basename in either normal form is refused.
- [ ] **The commit carries the DECIDED bytes (F5').** With a user save landing
      between the publish and the staging call, that path is dropped from the
      dream commit and reported; the commit contains no byte no gate saw.
      Proven RED against a `git add -- <path>` implementation, which stages the
      user's post-publish bytes.
- [ ] **The reap precondition, both run types and per platform (F6, F2').** With
      the reap verdict forced to `{reaped:false}` on a POSIX run, the run
      refuses fail-closed and no delta walk runs. Proven green on a verified
      reap. Asserted on BOTH a tokenized scheduler run and a tokenless manual
      run — on the latter, an ABSENT verdict is treated as unverified (refuse),
      not as success. **On win32 an ordinary successful run — leader exited,
      `taskkill` unable to reach it — is NOT refused**, which is the case a
      platform-blind rule breaks. The refusing run does NOT tear down the
      workspace (Table G's exception); every other exit path does.
- [ ] **EP2's redact disposition (F7, ADR-0034).** A brain-added line that
      triggers only a context-free high-entropy hit is REDACTED: the sanitized
      candidate is promoted, the unredacted copy is preserved to quarantine, the
      path is recorded `redacted`, and `secretDisposition.redactions` counts it
      separately from a hard refusal.
- [ ] **The pipeline defers a secret-WITHHELD transcript, and only that (F9).**
      A fresh transcript whose only note EP2 withholds is NOT marked processed —
      it regenerates on the next run. A transcript whose only note was REDACTED
      **IS** marked processed (the sanitized note was promoted, so the
      transcript was consumed) — asserted as its own case, because inverting it
      re-does consumed work and mints a second quarantine artifact. Both
      asserted through `secretDisposition`, never a parsed reason. A non-secret
      refusal advances the transcript.
- [ ] **The unknown-command non-vacuity signal (F2).** A run whose brain emits
      the unknown-command marker and writes NOTHING to the workspace aborts as
      "brain did not run" and advances no transcript ledger; a run that emits
      the marker but DID write the workspace proceeds into promotion. The
      decision keys off the empty workspace delta, not vault cleanliness —
      asserted with a dirty vault present, which must not change the outcome.
- [ ] **Table C's decision matrix**, one case per row C1–C8, each asserting both
      the outcome and the vault's resulting bytes.
- [ ] **The merge never touches the user's live note.** On a conflicting
      three-way state the vault file is byte-identical to its `vault-now`
      version afterwards and contains no conflict marker.
- [ ] **The compare→promote window is narrowed (F3).** With the vault target
      changed between the decision and the re-read, the write is abandoned and
      the path is reported refused; the vault keeps the changed bytes. The
      criterion asserts the NARROWED window (a change visible at the re-read),
      not a closed one — a save landing between the re-read and the `rename` is
      the stated residual and is not asserted against.
- [ ] **Gate order and input (Table D).** A secret in the brain's added lines is
      withheld before the merge and never appears in a merged candidate; and a
      Tier-3 / skill-guard / ledger refusal is shown to have judged the
      **merged** bytes, demonstrated by a case whose pre-merge bytes would pass
      and whose merged bytes must not.
- [ ] **ADR-0020's authorizing input.** A brain that rewrites both a skill and
      the ledger in the same run is refused, because the guard reads the
      **baseline** ledger.
- [ ] **Atomicity — at the DECISION (F8).** A run where the skill passes and
      the ledger fails-policy promotes **neither**. The criterion covers the
      decision, not a mid-write crash: a partial publish (first `rename`
      succeeds, second fails) is the residue-lifecycle successor's subject
      (Out of scope) and is not asserted against here.
- [ ] **The dream commit contains only promoted paths and the report.** With an
      unrelated uncommitted user edit present in the vault, that edit is **not**
      in the dream commit and is **not** lost.
- [ ] **The abort paths.** Brain failure and mid-run scratch change each remove
      the workspace and leave the vault byte-identical, including uncommitted
      user edits. Proven RED against the current `restoreVaultToHead` call,
      which destroys them.
- [ ] **Promotion accounting partitions the delta**: every record is exactly
      one of `promoted`, `redacted`, or `refused` with a reason, and the counts
      sum to the record count.
- [ ] **The glossary carries the name.** `docs/GLOSSARY.md` defines
      **promotion** as a canonical name (the grep below is the anchor; the
      wording is the implementer's).
- [ ] **ADR-0012 states the changed lifecycle.** `docs/adr/0012-dream-run-lifecycle.md`
      describes the workspace → promote run shape (the grep below is the
      anchor; the amendment's wording is the implementer's).
- [ ] Idempotence: `N/A — a dream run is not a repeatable command; it consumes a
      moving watermark and writes a date-stamped report, so a second run is a
      different run by construction.` What this package ships in its place is the
      promotion partition above: a run in which the brain writes nothing
      promotes nothing and changes no vault note.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# A --test-name-pattern with ZERO matching tests exits 0 (measured, Node 24),
# so pattern runs against a CREATED file are guarded by its existence — the
# guard is what makes the deliverable-ABSENT state red instead of vacuously
# green. (dream-validate needs no guard: its file exists today, a modify
# deliverable.)
test -f tests/unit/dream-promote.test.js && npm test -- --test-name-pattern "dream-promote"
npm test -- --test-name-pattern "dream-validate"
npm test
npm run lint
# Pipeline-level CLAIM 1 and CLAIM 2b live in the deliverable test file; the
# spec fixes only the test NAMES (claim-1-pipeline, claim-2b), because a
# verification command must be runnable; what the tests contain is the
# implementer's.
test -f tests/unit/dream-promote.test.js && npm test -- --test-name-pattern "claim-1-pipeline"
test -f tests/unit/dream-promote.test.js && npm test -- --test-name-pattern "claim-2b"
# The pipeline no longer pre-commits the user's edits (Table E). This is a
# grep on a file that MUST exist, so guard the absence case first: grep on a
# missing file exits 2, which `!` would turn into a false green.
test -f src/cli/dream.js && ! grep -q "precommitSessionEdits" src/cli/dream.js
test -f docs/GLOSSARY.md && grep -q "\*\*promotion\*\*" docs/GLOSSARY.md
test -f docs/adr/0012-dream-run-lifecycle.md && grep -qi "promot" docs/adr/0012-dream-run-lifecycle.md
```

- The two `claim-` runs, the `precommitSessionEdits` grep and the two docs
  greps are NEW steps and each is an ASSERTION: it exits
  non-zero on failure rather than printing something a reader must judge. Paste
  a real green on the finished state AND a real red from a deliberately broken
  state — the sibling's transitional vault argument restored at the call site
  (reddens `claim-1-pipeline`); a git call added with the workspace as cwd
  (reddens `claim-2b`); the `precommitSessionEdits` call
  restored (reddens its grep); the glossary or ADR text reverted (reddens the
  docs greps) — so a check that cannot fail is caught before anyone believes it.
  Verify each **also** goes red when its deliverable is ABSENT — for the
  pattern runs that is the file-existence guard's job.
- **CLAIM 2b is asserted through the git seam, never through a grep.** A source
  grep for a workspace-rooted cwd cannot discriminate: it is green today, green
  on a correct implementation, and green on a broken one that passes the path
  through a variable. Measured during this spec's round zero — the grep this
  section originally carried was green on the unmodified tree, which is the
  same false green the `test -f` rule above exists to prevent, arriving through
  a different door.

## Out of scope (do NOT do these)

- **Audit finding M9** — repo-local git configuration naming executable
  programs. Owner-ruled open on 2026-08-05, audit finding C2's package. This
  package may not claim it, and the
  validator still runs git in the vault for the commit. (The "audit" prefix
  distinguishes these ids from this spec's own Table C row ids.)
- **Audit finding C3** — the layout dot-rule and its notice. Table C9's
  allowlist is a
  directory-and-extension rule, deliberately **not** a dot-rule, so it does not
  step on audit C3.
- **The residue-lifecycle successor** (not yet drafted — it has no WP id yet) —
  the journal schema, crash replay,
  uninstall restore, a workspace surviving a crash, and **the rollback/replay
  of a PARTIAL PUBLISH** (first promoted `rename` succeeds, a later one fails —
  Table D's atomicity row claims decision-atomicity only, F8). Table G's abort
  row is narrower and says so.
- **An ADR for the promote-in inversion.** The war-room decision log owns the
  reasoning and this spec cites the rulings; whether the inversion also needs an
  indexed ADR is an owner call, not an implementer's. `docs/adr/0012` is
  amended here only where it states the lifecycle this package changes.
- **`skills/wienerdog-dream/SKILL.md`** — the sibling's Out of scope owns the
  bounded claim and the reason; nothing here changes it.
- **The siblings' contracts** — the workspace module, the constructed baseline,
  the seven re-target sites and Table F
  (`WP-dream-workspace-retarget`); and the vault-write primitive's filesystem
  discipline, Table H (`WP-dream-vault-write-primitive`) — its resolved-path
  application, symlink refusal, temp creation, conditional publish and
  published-bytes hash. This WP CONSUMES both and cites them; restating a
  proved property is how it becomes a drifting copy. In particular this WP may
  not re-implement a publish path of its own.
- **`src/core/reap.js`** — Table G scopes the reap precondition per platform
  and names `WP-a10-windows-reap` as the owner of the win32 leaderless-member
  residual. Changing the reap primitive is that package's subject, not this
  one's.
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

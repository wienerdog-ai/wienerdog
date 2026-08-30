---
id: WP-dream-workspace-retarget
title: Build the dream run's workspace and re-target the brain's write root into it
status: Done
model: opus
size: M
depends_on: [WP-dream-baseline-delta-primitive]
adrs: [ADR-0004, ADR-0012, ADR-0025, ADR-0031]
epic: audit-2026-07-29
---

# WP-dream-workspace-retarget: the workspace, the constructed baseline, and the brain re-target

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — first half of a stacked pair.** This WP and
`WP-dream-promote-in-workspace` are one design split along an owner-ruled seam
(logbook: `2026-08-21-dream-promote-in-workspace-split-ruling.md`). Contract
table letters are package-wide: this spec owns **Tables A, B and F**; the
successor owns **C, D, E and G** and cites this spec's tables rather than
restating them. **Merging this WP alone changes no behaviour**: the pipeline
keeps passing the vault as the brain's write target through one transitional
line (Table B, last row), so the running product is byte-identical until the
successor re-points it. The package's claims — M7, M10, and CLAIM 1 as a
property of the running product — close when the successor lands: this WP
ships the workspace, the constructed baseline and the re-target those closures
rest on, while M7's allowlist half and M10's classification consumer ship with
the successor.

**Dispatch precondition.** This spec is written against the tree at
`2cfb2b1d9bb47dbe44664ef49b40823d5deb7c26` (`2cfb2b1`), verified as both `main`
and `origin/main`. Tables A, B and F were first measured at
`025021fc0fa8f871f1eb960a8ad57a14d223360e` (`025021f`) and are re-pinned forward
to `2cfb2b1` without re-measurement, on this evidence: `025021f` is an ancestor
of `2cfb2b1`, and the diff between them touches **only `docs/`** — measured,
`git diff --name-only 025021f 2cfb2b1` yields twelve paths and **zero** outside
`docs/`. Every `src/` and `tests/` citation therefore resolves identically at
both commits. Before dispatch, re-run every `file:line`
citation and every measurement below against the tree the implementer will find
(`docs/specs/README.md` → Dispatch-time re-verification). A citation that does
not resolve blocks the dispatch. **Range citations are checked at BOTH ends.**

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
no such proof. The full reasoning, the measurements and the owner's rulings live
in the war-room decision log — a war-room record kept outside this repo — and
are **not repeated here**.

The pair closes two audit findings, both in
`docs/security-audit/2026-07-29/CURRENT-IMPLEMENTATION-REVIEW.md`: **M7**
(`:676-752` — a hostile `CLAUDE.md` persists in the vault and re-steers later
runs) and **M10** (`:931-989` — the dream writes `.gitignore` and blinds every
git-derived gate). Both close with the successor; Table F states what of that
closure this WP's measurements actually establish.

The package inverts the direction. The system builds a **workspace**, copies
the vault's readable content into it, and captures the exact bytes it just
wrote — so the baseline is **constructed**, known by construction rather than
inferred. This WP ships that workspace module and re-targets the brain's spawn
seam: after it, `spawnBrain` takes a **workspace** as its write target, and —
given a workspace distinct from the vault — no argv element and no environment
value handed to either harness carries the vault path. The re-target is a
change at **seven measured sites, not one** (Table B). What this WP does **not**
do is flip the running pipeline: promotion does not exist yet, and a dream
whose brain writes into a workspace nothing promotes would be an inert product.
The successor builds promotion and re-points the one call site (Table B, last
row); until then the transitional line passes the vault and behaviour is
unchanged.

## Current state

- `src/core/dream/brain.js` — the vault path reaches the brain process through
  **seven** distinct sites, not one — six that carry the path explicitly: `:57` (prompt text "your only write target"),
  `:65` (absolute vault-prefixed layout lines), `:98` (`addDirs` — the Claude
  tool roots), `:120` (`--cd vaultDir` — THE Codex write fence, because
  `--add-dir` does not fence `apply_patch`), `:172` (`WIENERDOG_DREAM_VAULT` in
  the child env), `:189` (`cwd = vaultDir` on the Codex path). The Claude path
  already runs from a neutral staging cwd (`:198`, `ensureBrainStaging`). All
  six derive from the single `vaultDir` option of `spawnBrain`; the seventh is
  the INHERITED child environment (`:169-178` spreads `...baseEnv` and then sets
  exactly **three** Wienerdog-owned names — `WIENERDOG_DREAM_VAULT`,
  `WIENERDOG_DREAM_SCRATCH`, `WIENERDOG_DREAM_LAYOUT` — while
  `cli/dream.js:144-146` hands it `process.env`), which carries the vault path
  whenever an ambient variable holds it. That inherited spread is also the only
  channel the repo's fake-brain fixtures are steered through today, which is why
  cutting it is a test-surface change as well as a security one (Table B's
  fixture-control row).
- `src/cli/dream.js:144-145` — the only production `spawnBrain` call, inside
  `runBrainWithWatchdog` (`:137`); the call opens at `:144` and its write-target
  argument sits at `:145`. This WP touches that one argument and nothing else
  in the file.
- `src/core/dream/delta.js` — `captureBaseline` and `computeDelta`, git-free,
  spawns nothing, **consumed by nothing**. This WP is `captureBaseline`'s first
  consumer; `computeDelta`'s first consumer is the successor.
- `src/core/layout.js:21-29` — the seven `LAYOUT_KEYS`. `:32-42` — the
  defaults.
- `skills/wienerdog-dream/SKILL.md:52-54` — the brain reads existing notes across
  the vault for dedupe ("any note whose topic a candidate matches"); `:115-117`
  — it writes into `02-Areas/` and `03-Resources/`, which are **not**
  layout-mapped. Both measured. **This file is not edited here**, and Out of
  scope owns the reason.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/workspace.js | build / copy-in / capture / verify / tear down (Table A) |
| modify | src/core/dream/brain.js | the write-target input becomes the workspace; all seven sites, including the constructed child env (Table B) |
| modify | src/cli/dream.js | ONE transitional argument at the spawn call (`:144-145`) — Table B, last row. Nothing else in this file: the pipeline is the successor's |
| create | tests/unit/dream-workspace.test.js | Table A + Table B + Table F evidence |
| modify | tests/unit/dream-brain.test.js | Table B — the `vaultDir → workspaceDir` option rename, at **eleven** measured sites where `vaultDir` is passed as an option to `spawnBrain` / `buildClaudeArgs` (`:25`, `:105`, `:126`, `:138`, `:191`, `:236`, `:271`, `:359`, `:417`, `:447`, `:471`) |
| modify | tests/unit/codex-adapter.test.js | Table B — the same rename, at **three** measured option-passing sites (`:330`, `:355` for `buildCodexArgs`, `:454` for `spawnBrain`) |
| modify | tests/integration/dream.test.js | Table B — the rename at the direct `spawnBrain` call (`:1481`) AND the fixture-control move (Table B's fixture-control row). Behavioural assertions do not change; the acceptance criteria say so |
| modify | tests/integration/reap-escape.test.js | Table B's fixture-control row — its brain-shaped invocations select a `spawn-variant.js` mode through the ambient env (`:950-951`, `:1005`, `:1041`, `:1074`, measured) |
| modify | tests/fixtures/dream/fake-brain.js | Table B's fixture-control row — mode selection and the run date move off the ambient env |
| modify | tests/fixtures/adopt/fake-brain-mapped.js | Table B's fixture-control row — its only ambient input is the run date (`:15`); the other two are already constructed |
| modify | tests/fixtures/reap/spawn-variant.js | Table B's fixture-control row — mode and out-file selection move off the ambient env for the brain-shaped invocation (`:49-50`) |
| modify | docs/GLOSSARY.md | one canonical name: **workspace** |

**Why the test surface is inside the boundary.** This spec's own Exact contracts
break it, so excluding it would be asking the implementer to deliver a red tree:
the `vaultDir → workspaceDir` rename breaks every existing call site, and the
constructed child env (Table B, site 7) cuts the ambient channel the fake-brain
fixtures were driven by. The rows above are the **exact** files that break —
file rows, not directory grants, so the boundary keeps its least-privilege
shape. In particular `tests/unit/a7-integrity-negatives.test.js` stays OUTSIDE
the boundary and passes unchanged: it is the guard this WP's fixture-control
design is built to satisfy, and a boundary that could edit it would be a
boundary that could retire it. **`tests/golden/` is likewise NOT granted:**
golden fixtures change only when a spec explicitly says so, and this one does
not. **`tests/integration/adopt-e2e.test.js` is NOT granted either** — its one
failing test is red at the pinned base for a machine-environment reason: a real
`claude` on the developer's `PATH` defeats the test's temp-bin pin, and
`resolvePinnedSpawn` refuses that drift. **Site 7 does not move that verdict.**
The refusal is driven by `PATH` RESOLUTION inside
`spawnPinned`/`resolvePinnedSpawn`, which receives the composed child env
(`brain.js:169-178` composes it, `:208` hands it to `spawnPinned`) — so the
order is env-first, and no surface may say the refusal happens before any child
env is composed. What insulates the test is the sanitiser's rule (Table B, site
7): the test's temp bin dir is not at or beneath the vault, so the sanitised
`PATH` still carries it and the pre-existing drift refusal is unchanged.
Measured on the implementer's branch at `819bca9`, the file's failure delta is
**+0** (5 tests, 4 pass, 1 fail — the same one, at the same base). Its fixture
is granted, its test file is not.
The ruling and its evidence are recorded in
`docs/specs/logbook/2026-08-27-workspace-retarget-deliverables-amendment.md`.

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

### Exact contracts

```js
/** Build the run's workspace, copy the vault's readable content into it, and
 *  capture the bytes just written as the run's constructed baseline (Table A).
 *  Asserts POSTCONDITION 1 (no
 *  `.git` entry), and refuses a capture that reports anomalies, before
 *  returning; POSTCONDITION 2 is a static property of this module, asserted by
 *  tests rather than checked at runtime.
 *  @param {{vaultDir:string, paths:import('../paths').WienerdogPaths, date:string,
 *           layout:import('../layout').VaultLayout}} o
 *  @returns {{workspaceDir:string, baseline:import('./delta').Baseline,
 *             copied:number, skipped:Array<{rel:string, reason:string}>}}
 *    throws WienerdogError when a postcondition fails (fail closed, before
 *    spawn) — and **removes whatever of the workspace it had already built
 *    before it throws** (Table A's failed-construction row). It is the only
 *    party that can: on the throw path the caller never receives
 *    `workspaceDir`, so no pipeline exit path can reach the partial tree */
function createWorkspace(o)

/** Remove the workspace tree. Idempotent; never touches the vault. */
function destroyWorkspace(workspaceDir)
```

`spawnBrain`'s write-target option is renamed `vaultDir` → `workspaceDir`; its
other options are unchanged. Six of Table B's sites read that one input; the
seventh, the child environment, is constructed rather than inherited.

## Contract reference

Activation (ADR-0031, 2-of-7 — four are true): (i) a new module interface
appears; (v) the workspace records data whose interpretation and lifecycle the
successor's validator owns; (vi) the successor and the residue-lifecycle
package inherit the workspace contract; (vii) the contract is mirrored across
this spec's surfaces and the successor's citations.

### Table A — the workspace and the constructed baseline

| Fact / rule | Value |
|-------------|-------|
| Placement | under the canonical core's private state (`paths.state`), one directory per run, created 0700 through the existing private-fs primitives. **Not** under the vault, and the reason is the unconditional one: a workspace inside the vault would put the brain's write root inside the promotion TARGET, so every brain write would land in the vault directly — today's failure with an extra directory. (It would also sit inside a git repository, since the vault is one; that is a second reason and, per Postcondition 2 and Table F, a weaker one — the property it names is not establishable by construction) |
| The depth question, measured and answered | `private-fs.js:671-677` justifies its 64-pass directory-repair cap on the real private tree being SHALLOW ("depth 4"), and aborts fail-closed if the cap is hit. A vault-shaped workspace has arbitrary depth and would invalidate that **justification** without necessarily exceeding the cap. The workspace therefore sits at a fixed shallow path whose own repair is bounded, and **its interior is not subject to the fixed-point repair**: the run creates it, the run owns it, the run removes it. If the implementer finds the repair does walk into it, that is a finding, not a fix |
| Copy-in scope | **the brain's REAL read/write need — approximately the whole readable vault — NOT the seven `LAYOUT_KEYS`.** Measured: the brain reads across the vault for dedupe (`SKILL.md:52-54`) and writes outside the mapped dirs (`:115-117`). Narrowing to the seven keys silently degrades the product: blind dedupe produces duplicates, and Tier-2 writes land in the void. **Width does not weaken the guarantee, and this row is where that is defended rather than per review round:** the guarantee is that the baseline is KNOWN, not that it is small. A wide baseline is exactly as known as a narrow one, because the system wrote every byte of it |
| Copy-in exclusions | `.git/` at any depth (Postcondition 1); symlinks at any depth — **measured: the dependency's capture does NOT fail on one**, it records a `{rel, kind:'symlink'}` anomaly and returns (`delta.js:104-105` Anomaly typedef, `:131` `entryKind`; its `@throws` at `:457-458` covers only unreadable entries), so the exclusion may not lean on capture failing closed: `createWorkspace` itself treats a non-empty `anomalies` list as a postcondition failure (contract above); and the harness control-file shapes at any depth — the instruction-file basenames `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md`, and any path with a `.claude` or `.codex` segment, plus `.mcp.json` (the same set the successor's promotion allowlist denies — its Table C9, kept identical so the baseline and the promotion barrier cover the same shapes). **Matched CANONICALISED then CASE-FOLDED (round 2 F7', round 3 F6):** the primary filesystem is case-insensitive — measured, a file created as `claude.md` answers to `CLAUDE.md` — so a literal comparison lets `agents.override.md` through while the harness still loads it. The repo already reasons this way at `validate.js:1083-1086` ("a case-variant identity dir … is the same inode on a case-insensitive FS"). Folding alone is still insufficient: macOS enumerates DECOMPOSED names while accepting composed ones, and measured, lowercasing does not make the two forms equal — so every name is normalised to NFC before it is folded and compared, layout values included. **The control-file exclusion is defense in depth on the Claude arm and load-bearing on the Codex arm:** measured in the war-room, the Claude brain does not load an instruction file from an `--add-dir` root (the `--help` "(CLAUDE.md dirs)" text is misleading), while the Codex arm's write root IS its cwd (`brain.js:120`, `:189`), which is where instruction discovery happens. Every exclusion is REPORTED in `skipped`, never silently dropped. Excluding a shape from copy-in keeps it out of the BASELINE; what keeps a brain-CREATED one out of the vault is the successor's promotion allowlist (its Table C) — the two are different barriers at different moments, and neither is a restatement of the other. **`reports_dir` is NOT excluded — owner ruling on F2'', 2026-08-27.** An earlier draft excluded it because the report was to be code-owned; that design is withdrawn. The shipped skill REQUIRES the brain to author the report (`skills/wienerdog-dream/SKILL.md:409-425`, verified), so `reports_dir` must be inside the brain's write root, and the run's existing report for the same date must be in the BASELINE — otherwise a second run on one date writes a path that already exists in the vault and the successor's C4 refuses it, losing the report on every same-day re-run |
| Copy-in mechanism | a real byte copy, or a copy-on-write clone where the platform provides one. **NEVER a hardlink mirror** — a hardlink alias writes the vault inode, so the brain would be editing the real vault through the mirror, reproducing today's failure with an extra step. Measured on the primary platform (macOS / APFS, Node 24.18): `fs.constants.COPYFILE_FICLONE_FORCE` fails **ENOSYS**, and plain `COPYFILE_FICLONE` is indistinguishable in wall-clock from a plain copy (165 ms vs 165 ms for 2 000 files / 7.8 MB). **So copy-on-write is not available through Node's API here, and no design may depend on it** |
| Copy-in cost, measured | ~85 µs per file, dominated by per-file syscall overhead rather than bytes: 2 000 files / 7.8 MB → ~165 ms; 20 000 files → ~1.7 s. On a nightly job that is not a cost that needs mitigating, and this spec deliberately specifies none. What DOES need a bound is the baseline's memory (row below) |
| The constructed baseline | `captureBaseline(workspaceDir)` (the dependency's primitive) runs **after** copy-in, inside `createWorkspace`, so the returned baseline describes the finished workspace. It captures the workspace, not the vault: capturing the vault would re-introduce the observed baseline this whole direction exists to escape. The baseline holds **BYTES, not only hashes** — owner-ruled, because the successor's merge (its Table C) needs bytes. `createWorkspace` fails closed on a capture that reports anomalies — the exclusions row above is why that check has teeth. That `createWorkspace` as a whole runs before the brain is spawned is the successor's pipeline ordering (its Table G) |
| Named residual: baseline memory | the baseline is proportional to the copied vault: ~7.8 MB for 2 000 notes, ~78 MB for 20 000. The dependency named this and handed the scope decision here. **This package sets no cap and states why:** a cap would have to drop files, and a baseline that silently omits a file reports that file as `added` later, which is a false accusation against whoever wrote it. If a real vault is ever measured past the point where this matters, the answer is an on-disk pristine copy, not a partial baseline |
| **POSTCONDITION 1 — no `.git` object anywhere in the workspace** | asserted by a walk over the finished workspace inside `createWorkspace`, before it returns. Any entry named `.git` — directory, file or symlink — fails the run closed |
| **POSTCONDITION 2 — no product code runs git with a cwd at or beneath the workspace root** | this is the checkable form of "the workspace is not a git repository", and it is the form that is TRUE. Measured: a plain directory nested anywhere under a repository IS inside that repository for every git command — `git rev-parse --show-toplevel` from `<repo>/sub/workspace` resolves to `<repo>`. So the absence of a `.git` entry does **not** establish the property, and no construction of ours can: whether an ancestor of the private core is a repository is a property of the user's filesystem (`$HOME` as a dotfiles repo is a common habit). What IS ours is where we point git, and Table F states what each half actually carries. This WP's share: `workspace.js` runs no git — it spawns nothing at all. The pipeline-wide git-seam assertion is the successor's |
| **The no-UNTRUSTED-actor obligation, in three layers — split across the pair** | both walks this WP ships run inside `createWorkspace`, before any brain exists — but **they walk DIFFERENT trees, and only one of them is live.** `captureBaseline` reads the WORKSPACE, which this run just built under the 0700 private core; nothing else writes there, so for that walk the actorless claim is true and stays. **Copy-in reads the VAULT, and that is where the earlier form of this row overstated it (round 9, R9-1): during the copy-in window there is no UNTRUSTED actor — not "no actor".** The brain does not exist yet; **the user's own editor or file synchroniser is a live BENIGN writer of the vault throughout**, so brain ordering alone does not discharge the dependency's caller invariant for copy-in's vault-side reads. Three layers do, each an established pattern in this family. **(1) FILE-LEVEL CONTAINMENT — fail-closed, observable:** an entry that becomes a symlink between the check and the read is NEVER followed; copy-in skips it and reports it in `skipped`. This closes the one genuine security edge — **bytes from outside the vault cannot enter the workspace through a swap.** The mechanism is the implementer's; this row states the visible behaviour. **(2) CHAIN-LEVEL SUBSTITUTION — NAMED RESIDUAL:** portable Node cannot bind a path's component chain against concurrent replacement (`delta.js:22-40`, owner-ruled 2026-08-21), the same citation and the same treatment as H3 and everywhere else in this family. **(3) COHERENCE — NAMED BOUNDED RESIDUAL:** a copy of a live tree is not atomic, so a concurrent user save during the window can hand the dream a view mixing two moments. **Its damage bound: this affects what the dream SEES — input quality — never what enters the VAULT unvetted**, because every return path runs through C9 admission, the four gates and the primitive. Detectable anomalies are reported; undetectable mixing is the accepted residual. The POST-brain walk (`computeDelta` over the workspace) is the successor's, and so is the reap precondition that guards it (successor Table G): `runBrainWithWatchdog` computes a reap verdict at `cli/dream.js:272` and today consumes it only to gate the pidfile unlink — it is never surfaced to the caller; surfacing it and refusing the walk on anything but a verified reap is the successor's contract. **No surface here may claim the post-brain walk is guarded — this WP does not run it** |
| **Failed construction cleans up after itself (Codex PR gate, 2026-08-27)** | when `createWorkspace` throws — a postcondition failure, a capture anomaly, an unreadable source — **it removes whatever it had already built before the throw propagates.** Measured that this cannot be delegated: the throw path returns no `workspaceDir`, so the pipeline (successor Table G) is never handed the path and **no exit path there can reach the partial tree**; Table G's teardown presupposes a successful create. Without this row an implementation could leave a private copy of the user's vault on disk and still satisfy every other criterion, which ADR-0004 forbids — nothing this job creates outlives it. **Distinct from the residue-lifecycle successor's subject**, which is a workspace that survives a CRASH; this is an ordinary, in-process failure with a live stack |
| Teardown | `destroyWorkspace` removes the workspace tree; idempotent; never touches the vault. **Wiring it into every pipeline exit path — and the one named exception, a run that refused because the reap was not verified and therefore does NOT tear down — is the successor's (its Table G)**, because the exit paths live in the pipeline this WP does not touch. A workspace left behind by a crash is the residue-lifecycle successor's subject, not this package's |

### Table B — the brain re-target, site by site (CLAIM 1)

**This table IS the first claim's evidence.** The package's intent brief (a
war-room record kept outside this repo) states the change
as `brain.js:98`; measured, the vault path reaches the brain through seven sites,
and two of them are Codex-specific with a different mechanism. A re-target that
changes only `addDirs` leaves the Codex arm writing the vault.

| Site (measured at `2cfb2b1`) | Today | After | Why it is not optional |
|---|---|---|---|
| `brain.js:57` | prompt: `Vault directory (your only write target): ${vaultDir}` | the workspace path | the brain writes where the prompt tells it to; a stale path here is a write outside the fence |
| `brain.js:65` | `layoutPromptLines(lay, date, vaultDir)` — ABSOLUTE vault-prefixed tier paths | workspace-prefixed | absolute paths bypass the write root entirely |
| `brain.js:98` | `addDirs: [vaultDir, scratchDir]` | `[workspaceDir, scratchDir]` | the Claude tool roots. `--add-dir` grants read AND write on both harnesses; there is no directory-level read-only option in either, so under this design the brain simply loses vault access rather than depending on a permission layer |
| `brain.js:120` | `--cd vaultDir` | `--cd workspaceDir` | **THE Codex write fence** — `--add-dir` does not fence `apply_patch` (openai/codex#24214). Leaving this is leaving the Codex brain writing the vault |
| `brain.js:172` | `WIENERDOG_DREAM_VAULT: vaultDir` | the workspace path (the env var NAME stays — renaming it churns the WP-026 fake-brain fixtures for no guarantee) | read by the WP-026 mapped fake brain. On the Claude arm the real brain has no Bash to read env (the dream profile); on the Codex arm it CAN run shell and so CAN read env (Table F) — which is exactly why the var is re-pointed for consistency of the fence and no arm may treat it as a control |
| `brain.js:189` | `cwd = vaultDir` (Codex arm) | `cwd = workspaceDir` | instruction discovery happens at cwd — this is M7's step 3 |
| **Site 7 — the INHERITED environment (round 2, F8')** | `spawnBrain` spreads the ambient env (`brain.js:169-178`, `...baseEnv`) and the production call hands it `process.env` (`cli/dream.js:144-146`) | the child env is **CONSTRUCTED** — an allowlist of what the harness actually needs — rather than inherited and then overwritten. **`PATH` is on the allowlist, SANITISED, not omitted (round 3, F7):** `spawnPinned` re-resolves the logical harness name through the env it is handed (`exec-identity.js:451-472`, `:621-627`), so dropping `PATH` breaks pin verification before the child starts, while copying it verbatim can carry a vault-rooted component and violate the claim. **THE EXACT CONTRACT (owner ruling, 2026-08-27): the child's `PATH` is THE JOB'S OWN `PATH` with every component at or beneath the vault removed — FILTERED, never REBUILT.** It is not composed from the system defaults: on the primary platform the pinned harness lives in a version-manager bin dir the system defaults do not contain, so a defaults-built `PATH` would fail pin resolution and break the product, while the claim's security goal — no vault-derived component on the child's `PATH` — is delivered identically either way. Grounds in `docs/specs/logbook/2026-08-27-workspace-retarget-deliverables-amendment.md`. The rest of the allowlist is what each harness measurably needs to start (`HOME`, the harness's own config/auth variables, `TMPDIR`), and the implementer establishes that set by starting each harness under the constructed env — a harness that will not start is a finding, not a licence to widen the list back to ambient | Measured: with an ambient `WIENERDOG_VAULT` set, the vault path reaches the child env regardless of what the six named sites do, and the Codex arm's shell can read its own environment. Re-pointing one assigned value cannot establish "no env value carries the vault path"; only construction can. **This makes the re-target a SEVEN-site change** |
| **THE FIXTURE-CONTROL CHANNEL — Site 7's consequence, not an eighth site.** This row is the CANONICAL statement of the channel; the Deliverables `Notes` cells for the four test files and the three fixtures, and the fixture-control acceptance criterion, all defer to it | The three fixtures that stand in for the brain read their scenario selection and the run date from the INHERITED env: `fake-brain.js:16` (`WIENERDOG_FAKE_TODAY`), its nine mode switches at `:19`, `:33`, `:44`, `:53`, `:65`, `:77`, `:85`, `:139`, `:150` (`WIENERDOG_FAKE_BRAIN_MODE`) and `:66` (`WIENERDOG_HOME`, for the flag path one mode plants); `fake-brain-mapped.js:15` (`WIENERDOG_FAKE_TODAY`); `spawn-variant.js:49-50` (`WD_SPAWN_VARIANT_MODE` / `_OUT` — its argv route at `:48-50` is unreachable on a brain spawn, because `brain.js` composes brain-shaped argv). Every one of these arrives only because the child env is inherited | **Two channels, neither of them the environment. (a) RUN INPUTS travel the way the REAL brain receives them.** Vault, scratch and layout already arrive in the three constructed `WIENERDOG_DREAM_*` values (`brain.js:169-178`, measured — exactly `WIENERDOG_DREAM_VAULT`, `_SCRATCH`, `_LAYOUT`). The run DATE arrives in the PROMPT, which is an argv element on both arms — Claude `runtime-profile.js:189` (`'-p', prompt`), Codex `brain.js:129` (positional, last) — and `brain.js:58` composes the literal line `Today's date: ${date}`. A fixture reads its own `process.argv`; `spawn-variant.js:43` already does exactly this for `--version`. **(b) SCENARIO SELECTION travels in a control file.** NAME: one JSON file, resolved by the fixture from its own `__dirname`, carrying the mode and any test-owned absolute path that mode needs (the `git-break.flag` path, the variant out-file). OWNER: the test that installs the pinned command. WHO MAY SET IT: only that test, at install time — every fixture brain is installed by COPYING it into a test-owned temp bin dir and pinning that path (`dream.test.js:186-187`, `reap-escape.test.js:868-869`, `adopt-e2e.test.js:107-108`, measured), so the fixture's `__dirname` at run time is that temp dir, never the repo. ABSENT the file, a fixture keeps its present defaults. **PRECEDENCE — the control file is the FALLBACK, never an override: a fixture's own argv selection wins over it.** Measured, `spawn-variant.js:49` already prefers `argv[2]` when it is not flag-shaped and consults the ambient env only otherwise; the control file takes the ENV's place in that fallback, not `argv[2]`'s. **This does not contradict the middle column's "unreachable":** on a BRAIN spawn `brain.js` composes flag-shaped argv, so `argv[2]` never selects and the control file is the only route — which is why the channel exists at all; on the fixture's OWN self-re-spawn `argv[2]` is a literal mode name and the argv route IS the selector. Two different invocations, one precedence rule. **This precedence is what keeps the ADR-0004 fork-bomb guard alive** — `spawnSleeper` re-spawns THIS SAME script with `'sleep'` as `argv[2]` and clears the env mode vars today (`spawn-variant.js:64-72`), but the re-spawned child resolves the SAME `__dirname` and would therefore re-read the SAME control file; under argv precedence it still runs `sleep` and cannot inherit the parent's spawning mode. An implementation in which the control file overrode argv would fork-bomb | **WHY IT IS NOT A PRODUCTION SEAM, and why no env name may be added instead.** Adding a test-control name to the constructed env would be a WP-155-class production test seam: `src/` would name a variable that exists only so tests can steer the child. The A7 guard is narrower than that and must be cited at its real strength — measured, `tests/unit/a7-integrity-negatives.test.js:383` greps `src/` for exactly four literals (`WIENERDOG_RUNJOB_CMD`, `WIENERDOG_DREAM_CMD`, `WIENERDOG_FAKE_TODAY`, `WIENERDOG_RUNJOB_TIMEOUT_MS`); it would catch a re-added `WIENERDOG_FAKE_TODAY` and would **not** catch a newly-invented name, `WIENERDOG_DREAM_`-prefixed or otherwise. **So the guard is a backstop for one of the four names, never the reason** — the reason is this row. The channel above touches no `src/` file: the constructed env keeps exactly its three names, production `wienerdog sync` pins a real harness and writes no control file, and the only readers are three files under `tests/fixtures/`. **REJECTED ALTERNATIVE — fixture args in argv:** `spawn-variant.js:48-50` selects a mode from `argv[2]`, but on a brain spawn `brain.js` owns every argv element and the pin store record carries NO argv slot — measured, its fields are exactly `commandPath`, `installDir`, `version`, `pinnedAt` (`dream.test.js:189`) — so no test argument can reach the child. Measured; that is why the control file exists and the argv route carries only what the real brain also receives |
| **The claim's runnable form** | — | — | for **both** harnesses: build the argv and the child env with a `workspaceDir` DISTINCT from the vault, and assert the vault path (and any element containing it) appears in **no** argv element and **no** env value — asserted with a vault-valued ambient variable SET, which is the case site 7 exists for. A grep over the source is not sufficient — renaming the variable would pass it. The assertion is over the composed values. Measured on the pinned base as a red-side proof that the check discriminates: the composed Codex argv carries the vault path in **two** elements today — the `--cd` operand and the positional prompt |
| **The claim's behavioural form** | — | — | a real `spawnBrain` run against the pinned fake brain that deliberately attempts a vault write, after which the vault is **byte-identical** to its pre-run state. Proven RED by pointing one site back at the vault, one site at a time — **seven** reds, because a single red does not prove the other **six** sites are covered. **The count is Table B's SITE-row count and nothing else — the six `brain.js:<line>` rows plus Site 7 (round 8, R8-2):** Table B also carries rows that are NOT sites (this one, the structural form above, the fixture-control channel, and the transitional call site), and none of them raises the count. This sentence once said six-and-five, arithmetic left behind when round 2's F8' added Site 7, while every other surface — Table F, the implementation notes, the acceptance criteria and the verification steps — already said seven. An implementer following this cell would have omitted behavioural coverage for the inherited-environment site |
| **The transitional call site** (`cli/dream.js:144-145`) | `spawnBrain({ vaultDir, ... })` | `spawnBrain({ workspaceDir: vaultDir, ... })` — the vault, passed explicitly as the write target, with a comment naming the successor | keeps the running product byte-identical until the successor builds the workspace in the pipeline and re-points this argument. Re-pointing it HERE, without promotion, would leave the dream writing notes that nothing promotes — an inert product, which is what the stacked split exists to avoid. **CLAIM 1 is therefore a property of the spawn seam in this WP, and becomes a property of the running product in the successor** |

### Table F — what the two claims actually establish (measured, not asserted)

The intent brief marks two sentences as this package's to DEMONSTRATE, because
an earlier advisor passed them on as established when they stood only in a plan.
Measured on the tree, one holds as stated and one needs its mechanism
re-attributed. **This table is the honest form; the prose of BOTH halves cites
it — the successor never restates it (owner ruling, split logbook entry).**

| Claim | Measured verdict |
|---|---|
| **1. The brain's roots become `[workspaceDir, scratchDir]`, and no other path grants the brain vault access** | **Holds, but is a SEVEN-site change, not a one-line one** (Table B). `brain.js:98` is one of **seven** sites and the only one the brief names; `:120` and `:189` are the Codex arm, where the mechanism is `--cd`/cwd rather than `--add-dir`. Runnable form: the composed-argv-and-env assertion plus the byte-identity behavioural test, each proven red seven times, one site at a time. **Scope note:** this WP proves the property at the spawn seam; the running product acquires it when the successor re-points the transitional call site (Table B, last row) |
| **2a. No `.git` object exists in the workspace** | **Holds by construction and is checked** (Postcondition 1) |
| **2b. "The workspace is not a git repository"** | **Does NOT hold as stated, and no construction of ours can make it hold.** Measured: `git rev-parse --show-toplevel` from a plain directory nested under a repository resolves to that ancestor repository. Whether an ancestor of the private core is a repository is the user's filesystem, not ours. The checkable and true form is Postcondition 2: **no product code runs git with a cwd at or beneath the workspace root** |
| **What M10's closure actually rests on** | **the git-free classification, not the not-a-repository property.** `computeDelta` is a filesystem walk that never consults git — the dependency asserts this mechanically (its module requires no `child_process`). An ignore file cannot hide a path from a filesystem walk, on any platform, regardless of any ancestor repository. Postcondition 2 is a second, independent barrier whose failure would be bounded to our own git invocations — and across the whole pair there is exactly one, the successor's merge (its Table C, row M2), whose cwd is a constructed neutral directory outside any repository, never the workspace. **The intent brief attributes the closure to the second half; measurement puts it on the first.** Nothing about the closure weakens — it gets stronger, because the load-bearing half is unconditional. Measured on the pinned base, both directions: in one tree holding a self-hiding `.gitignore` (`*`) and a payload under a project dir, `git status --porcelain -z -uall` returns **zero bytes** (M10 reproduced) while `computeDelta` reports the payload `added` |
| **The containment residual the dependency handed over — hypothesis (1), the brain's tool set** | **FALSE on the Codex arm, and that is a correction to an inherited assumption.** Measured: the code-owned `dream` hermetic runtime profile (ADR-0025) allows `Read`/`Write`/`Edit`/`Glob`/`Grep` and disallows `Bash` (`getProfile('dream')`, `src/core/runtime-profile.js`) — so on the Claude arm the brain has no tool that creates a symlink or renames a directory. But the Codex arm runs `--sandbox workspace-write` (`brain.js:117-118`), which permits shell **inside** the workspace. The dependency called this hypothesis weak because tool capability is a harness detail; measured, it is not merely weak, it is arm-dependent |
| **What the Codex arm's shell can actually reach — MEASURED, and it is not the vault (round 2 correction)** | The concern was that the in-workspace shell could alias a vault inode into the workspace (`ln`) and write through it, mutating the vault DURING the run, where neither the reap precondition nor `computeDelta` would catch it. **Measured and refuted at a realistic vault location** (`codex-cli 0.146.0`, macOS 26.5.2, vault under `$HOME`, product-shaped `codex exec --sandbox workspace-write --cd <workspace>`): the sandbox DENIES hardlinking a vault file into the workspace, hardlinking a workspace file into the vault, direct vault writes, `mv` into the vault, and **writing through a symlink that resolves into the vault** — it denies by RESOLVED destination, not by lexical path. Verified from outside the sandbox: the vault note byte-unchanged, inode unchanged, `nlink=1`. An earlier round measured the opposite because its fake vault sat in `/tmp`, which the sandbox banner lists among its granted roots (`workspace-write [workdir, /tmp, $TMPDIR]`); a probe there reproduced the "success" exactly. **BOUNDS this row may not exceed:** that platform, that harness version, and a vault outside `/tmp`/`$TMPDIR`. It is a HARNESS guarantee — defense in depth, never the primary barrier, which stays "the vault path is not handed to the brain, and promotion is the only writer". A harness that later widens its sandbox weakens this row and nothing else |
| **The containment residual — hypothesis (2), capture-before-spawn ordering** | **Holds ONLY against the UNTRUSTED actor, and that is the whole of what ordering buys (round 9, R9-1).** Copy-in and `captureBaseline` run inside `createWorkspace` before the brain is spawned, so **no untrusted actor exists during them** — but the vault they walk is live, and the user's editor or file synchroniser writes it throughout. **The earlier form of this row said "there is no actor" and concluded that the residual reduces to statically-planted objects. Both are WITHDRAWN**: neither is true of a live vault, and the reduction was the load-bearing half. What replaces them is Table A's three layers — fail-closed file-level containment, the chain-level residual under the standing platform ruling, and the bounded coherence residual. The post-brain `computeDelta` walk is a different question and remains the successor's, closed there by its reap precondition (its Table G) refusing to walk until the brain's process group is verifiably empty. **This row no longer claims any reduction to statically-planted objects, and a static symlink — to a file or a directory — is surfaced by the dependency's walks as an anomaly, never followed, and appears in no baseline and in no delta record |
| **The real exposure, stated PER PLATFORM as the dependency required — for the WORKSPACE walks only** | **Scope, stated first because Table A now distinguishes two trees (round 9, R9-1):** this row is about the walks over the WORKSPACE — `captureBaseline` here and `computeDelta` in the successor. **It says nothing about copy-in's reads of the live VAULT**, whose exposure is Table A's three layers, and an earlier form of this row read as if it covered every walk. For the workspace walks the race needs a writer CONCURRENT WITH THE WALK, and the successor's reap precondition removes the only one. The brain is the sole actor with workspace write access — on the Codex arm it can even run shell there (row above) — and it is verifiably dead before the walk begins; what remains would have to be some other process writing inside the 0700 private core, which is not a threat this project's model carries. **This is the whole reason the reap precondition is a contract row (successor Table G) and not a nicety:** without it, the Codex arm's brain is exactly the live actor the dependency's caller invariant forbids. **The platform condition therefore does not bite here**: `O_NOFOLLOW`'s absence on win32 costs WHEN the refusal happens, not whether it happens — the `(dev, ino)` revalidation refuses at `fstat` before any byte is read — and with no live actor there is no window to widen. The surviving residual is inode reuse, which exists on every platform. **No cross-platform guarantee is claimed:** what is claimed is that this package does not depend on the flag |
| **The precedent for the workspace walk** | `src/core/vault-snapshot.js:45-61`, not `private-fs.js`. The former states the platform question and answers it with an explicit branch that NAMES what is lost, deliberately rejecting the `fs.constants.X \|\| 0` idiom "which makes a missing flag look like a present one". `private-fs.js:683-684` and `manifest.js:746` do use `\|\| 0`, and both consciously name what carries the weight on win32 — **the repo is inconsistent in IDIOM, not in substance**, and no stronger phrasing than that is supported |

### Mirrored Surface Checklist

- [ ] Deliverables-table `Notes` cells (each cites its owning table)
- [ ] `### Exact contracts`' two signatures, their return shapes, and the
      `spawnBrain` option rename
- [ ] Acceptance criteria that assert Tables A, B and F
- [ ] Verification steps (the assertions mirror Tables A and B)
- [ ] Current-state description (the seven re-target sites, the single call site)
- [ ] Implementation notes (the seven-reds requirement, the CoW measurement)
- [ ] Out of scope (what the successor and the residue-lifecycle package own)
- [ ] **The package note and the dispatch-precondition block** — the note
      mirrors the pair's table-letter division and the transitional line; the
      dispatch block mirrors the pinned base every citation is measured against.
      A finding that changes either updates this section too
- [ ] **Every surface that states what a claim establishes** — the Context
      paragraph, Table A's two postconditions, Table F, the Security checklist,
      and the acceptance criteria. **No surface may say the workspace is not a
      git repository without qualification; none may attribute M10's closure to
      that property; and none may claim this WP alone changes the running
      product's write target.**
- [ ] **Every surface that describes the brain re-target** — the Context
      paragraph, Table B, Table F, the acceptance criteria and the verification
      steps. **None may describe it as a one-line change to `addDirs`, and none
      may state a site count other than Table B's SITE-row count (seven: the six
      `brain.js:<line>` rows plus Site 7). Table B's non-site rows — the two
      claim-form rows, the fixture-control row and the transitional call site —
      never raise that count.**
- [ ] **The fixture-control channel.** Table B's fixture-control row is the ONE
      place the channel's facts are decided. Its registered mirrors: the
      Deliverables `Notes` cells for `tests/unit/dream-brain.test.js`,
      `tests/unit/codex-adapter.test.js`, `tests/integration/dream.test.js`,
      `tests/integration/reap-escape.test.js` and the three
      `tests/fixtures/` rows; the "Why the test surface is inside the boundary"
      paragraph; the fixture-control and transitional-call-site acceptance
      criteria; the A7 verification step; **the Current-state sentence naming the
      inherited spread as the only channel the fake-brain fixtures are steered
      through**; and **both Out-of-scope bullets that rest on the channel** —
      the `tests/unit/a7-integrity-negatives.test.js` bullet and the
      `tests/integration/adopt-e2e.test.js` bullet. **No surface may name a new
      environment variable as the channel, may state that the constructed child
      env carries any WIENERDOG-OWNED name beyond its three `WIENERDOG_DREAM_*`
      names (the allowlist's non-Wienerdog entries — `PATH`, `HOME`, `TMPDIR`,
      the harness's own config/auth variables — are site 7's, not this row's), or may
      describe `tests/unit/a7-integrity-negatives.test.js` as forbidding
      test-only names in `src/` generally — it greps four literals (`:383`).**
      A finding that changes the channel updates every mirror in the same pass.
- [ ] **What the Codex arm's shell can reach** — Table F's measured row and
      the Security checklist's Codex residual. **No surface may state the
      sandbox result without its three bounds (platform, harness version, vault
      outside `/tmp`/`$TMPDIR`), and none may promote a harness guarantee to
      the primary barrier.**

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: the workspace is files, created and removed within one
  run; nothing outlives the job.
- **Seven reds, not one.** The re-target's negative proof must break one site at a
  time. A single red passes with **six** sites still pointing at the vault, and
  six of the seven are invisible to a test that only checks `addDirs`.
- **Copy-on-write is measured absent through Node's API on the primary
  platform** (Table A). Do not write a fast path that assumes it and a slow path
  that never runs; write the copy, and let `COPYFILE_FICLONE` be a hint the
  platform may ignore.
- The prompt label at `brain.js:57` is the implementer's wording, but
  `skills/wienerdog-dream/SKILL.md` is not editable here (Out of scope) — keep
  the label compatible with how the vendored skill refers to its write target.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] Relative paths from the vault walk flow into filesystem writes under the
      workspace root. Containment is the template's anchored-segment discipline,
      and symlinks are never followed into the copy — they are excluded and
      REPORTED (Table A's exclusions row), because the dependency's capture
      refuses them and a workspace the system built must pass its own capture.
- [ ] The failure mode that matters is a **silently incomplete baseline**: a
      file omitted at copy-in or capture is later reported as `added` and
      promoted over the user's version. Copy-in reports every exclusion in
      `skipped`; capture throws on unreadable entries rather than skipping
      (the dependency's rule), and records a symlink as an anomaly rather than
      throwing — which is why `createWorkspace` fails closed on any anomaly
      (Table A) instead of leaning on the capture to do it.
- [ ] **The dependency's caller invariant, this WP's share — discharged in
      THREE layers, not by ordering (Table A).** Both walks run before any brain
      exists, so no UNTRUSTED actor is present. `captureBaseline` reads only the
      workspace this run just built, where nothing else writes, so it is
      genuinely actorless. **Copy-in reads the live VAULT, where the user's
      editor is a benign writer throughout, and there ordering does not
      discharge the invariant on its own.** (1) File-level containment is fail-closed: an entry
      that becomes a symlink between check and read is never followed, so
      out-of-vault bytes cannot enter the workspace. (2) Chain-level
      substitution is a named residual under the standing platform ruling
      (`delta.js:22-40`). (3) Coherence is a named bounded residual: a
      non-atomic copy can mix two moments, which affects what the dream SEES,
      never what enters the vault unvetted. The post-brain walk and its reap
      precondition are the successor's. **No surface may claim the walk
      establishes containment, and none may claim there is no actor.**
- [ ] On the Codex arm the brain can run shell inside the workspace. What that
      shell can reach is MEASURED in Table F, with its three bounds: on the
      measured platform and harness version, and for a vault outside the
      sandbox's granted roots, every route from the workspace into the vault is
      denied — including through a symlink. **That is a harness guarantee and
      this package leans on it only as defense in depth.** The successor's reap
      precondition closes a different concern: a live actor mutating the
      workspace during the post-brain walk.

## Acceptance criteria

- [ ] **CLAIM 1 at the spawn seam, structurally.** For both harnesses, with a
      `workspaceDir` distinct from the vault, the composed argv and the composed
      child env contain no element equal to, and no element containing, the
      vault path. Proven RED **seven times** — once per Table B site, re-pointed
      one at a time; the seventh red is an ambient `WIENERDOG_VAULT` (and a
      vault-rooted `PATH` component) surviving into the child.
- [ ] **Both harnesses start under the constructed environment.** A real
      `spawnBrain` reaches a running child on each arm with the allowlisted env
      — the criterion that keeps the allowlist honest, since an env that
      satisfies the assertion above but cannot start a harness is not a fence,
      it is a broken product. Pin verification still resolves (the sanitised
      `PATH` is present).
- [ ] **CLAIM 1 at the spawn seam, behaviourally.** A `spawnBrain` run against a
      fake brain that deliberately attempts a vault write leaves the vault
      **byte-identical** to its pre-run state, on both harness paths.
- [ ] **CLAIM 2a.** No entry named `.git` — directory, file or symlink — exists
      anywhere under the finished workspace. Proven RED by placing a `.git`
      directory in the source vault and asserting copy-in excludes it and the
      postcondition fires when it does not.
- [ ] **The module runs no git.** `src/core/dream/workspace.js` spawns nothing —
      it requires no `child_process` (the dependency's own mechanical assertion
      shape). This is this WP's share of Postcondition 2; the pipeline-wide
      git-seam assertion is the successor's criterion.
- [ ] **Copy-in scope.** A file outside the seven `LAYOUT_KEYS` directories
      (e.g. under `02-Areas/`) is copied. **An existing
      `<reports_dir>/<date>.md` is copied in and present in the baseline** —
      the F2'' ruling's precondition, and the criterion goes RED if
      `reports_dir` is treated as an exclusion. Every exclusion — `.git/`,
      a symlink, each control-file shape
      (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md`, a
      `.claude`/`.codex` segment, `.mcp.json`) — appears in
      `skipped` with a reason, and nothing else is skipped.
- [ ] **Fail closed, AND it leaves nothing behind.** A POSTCONDITION 1 failure,
      or a capture that reports any anomaly, makes `createWorkspace` throw and
      return no workspace handle — **and after the throw no part of the
      workspace it had begun building remains on disk.** Proven RED against an
      implementation that throws without cleaning up, which is otherwise
      indistinguishable: with no handle returned, no later exit path can find
      the partial tree to remove it.
- [ ] **Copy-in over a LIVE vault, all three layers (R9-1).** Layer 1, the
      security edge, fail-closed: a vault entry that becomes a symlink between
      the check and the read is NOT followed — its target's bytes appear nowhere
      in the workspace and the entry is reported in `skipped`. Proven RED
      against an implementation that reads by name after checking. Layer 2:
      **no criterion asserts that a replaced PARENT component is caught** — it
      is the named residual under `delta.js:22-40`, and a test claiming
      otherwise asserts what portable Node cannot deliver. Layer 3: a file
      modified during the window yields either moment's bytes, and the criterion
      asserts only the BOUND — that whatever was copied still reaches the vault
      solely through admission, the gates and the primitive, never directly.
- [ ] **Teardown.** `destroyWorkspace` removes the tree, is idempotent (second
      call: no-op, no throw), and never touches the vault — the vault is
      byte-identical across create → destroy.
- [ ] **The transitional call site changes no behaviour.**
      `cli/dream.js:144-145` passes the vault as `workspaceDir` (Table B, last
      row), so the running product is byte-identical.
      `tests/integration/dream.test.js` IS modified — it is in the Deliverables
      — but **only** for the two mechanical consequences its row names: the
      `vaultDir → workspaceDir` option rename at `:1481`, and the
      fixture-control move (Table B's fixture-control row). **No behavioural
      assertion in it changes**: same test names, same expected vault contents,
      same counts, same error messages. The evidence is the file's own diff —
      no `assert*` expectation is edited — and a green `npm test` on it.
      The same holds for `tests/integration/reap-escape.test.js`.
- [ ] **Fixture control adds no production seam (Table B's fixture-control
      row).** Three checks, each an assertion. (i) The constructed child env
      sets exactly the three names it sets today — `WIENERDOG_DREAM_VAULT`,
      `WIENERDOG_DREAM_SCRATCH`, `WIENERDOG_DREAM_LAYOUT` — and no fourth
      Wienerdog-owned name; asserted over the composed env, not by grep. (ii)
      No file under `src/` names the control file, and none contains any of the
      four literals `tests/unit/a7-integrity-negatives.test.js:383` greps
      (`WIENERDOG_RUNJOB_CMD`, `WIENERDOG_DREAM_CMD`, `WIENERDOG_FAKE_TODAY`,
      `WIENERDOG_RUNJOB_TIMEOUT_MS`). (iii)
      `tests/unit/a7-integrity-negatives.test.js` is NOT in the Deliverables and
      passes unchanged — the boundary enforces the first half, `npm test` the
      second.
- [ ] **The glossary carries the name.** `docs/GLOSSARY.md` defines
      **workspace** as a canonical name (the grep below is the anchor; the
      wording is the implementer's).
- [ ] Idempotence: `N/A — createWorkspace is per-run by construction (one
      directory per run); what this WP ships in its place is destroyWorkspace's
      idempotence above.`
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# A --test-name-pattern with ZERO matching tests exits 0 (measured, Node 24),
# so every pattern run is guarded by the deliverable file's existence — the
# guard is what makes the deliverable-ABSENT state red instead of vacuously
# green.
test -f tests/unit/dream-workspace.test.js && npm test -- --test-name-pattern "dream-workspace"
npm test
npm run lint
# CLAIM 1 (structural + behavioural) and CLAIM 2a live in the deliverable test
# file, not in a helper of their own. The spec fixes only the test NAME here,
# because a verification command must be runnable; what the tests contain is
# the implementer's.
test -f tests/unit/dream-workspace.test.js && npm test -- --test-name-pattern "claim-1"
test -f tests/unit/dream-workspace.test.js && npm test -- --test-name-pattern "claim-2a"
test -f docs/GLOSSARY.md && grep -q "\*\*workspace\*\*" docs/GLOSSARY.md
# Fixture control adds no production seam (Table B's fixture-control row).
# grep exits 1 when it finds nothing, so `!` makes ABSENCE the passing state;
# this is the same four-literal set tests/unit/a7-integrity-negatives.test.js:383
# greps, asserted here so the PR carries the evidence directly.
! grep -rqE 'WIENERDOG_RUNJOB_CMD|WIENERDOG_DREAM_CMD|WIENERDOG_FAKE_TODAY|WIENERDOG_RUNJOB_TIMEOUT_MS' src/
# The guard itself is outside the Deliverables and must be byte-unchanged.
git diff --quiet origin/main -- tests/unit/a7-integrity-negatives.test.js
test -f tests/unit/a7-integrity-negatives.test.js && npm test -- --test-name-pattern "a7-integrity-negatives"
```

- The two `claim-` runs, the glossary grep and the three fixture-control /
  A7 steps are NEW steps and each is an
  ASSERTION: it exits
  non-zero on failure rather than printing something a reader must judge. Paste
  a real green on the finished state AND a real red from a deliberately broken
  state — one Table B site re-pointed at the vault (seven times, one site each);
  the `.git` exclusion disabled; the glossary entry removed — so a check that
  cannot fail is caught before
  anyone believes it. Verify each **also** goes red when its deliverable is
  ABSENT — for the pattern runs that is the file-existence guard's job, and
  the guard exists because the bare pattern is green on a missing test file.

## Out of scope (do NOT do these)

- **Promotion, the gates, the pipeline flip, the reap precondition, the abort
  paths, and the dream commit** — all `WP-dream-promote-in-workspace`. This WP
  may not re-point the transitional call site at a real workspace.
- **The residue-lifecycle successor** (not yet drafted — it has no WP id yet) —
  the journal schema, crash replay,
  uninstall restore, and a workspace surviving a crash. Table A's teardown row
  is narrower and says so.
- **`skills/wienerdog-dream/SKILL.md`.** Every path measured in it (`:52-54` and
  `:115-117` — the two Current state cites, and the only ones this spec checked)
  is either relative to the write root or comes from the prompt, so re-pointing
  the write root re-points them. **The claim is bounded to those two**: if the
  implementer finds a path there which is neither, that is a finding for the PR
  body, not a licence to edit the file — editing it churns the WP-129
  vendored-skill digest, which is a separate cost.
- **The dependency's own contract** — the delta primitive, its binary/text
  equivalence, its `addedLineNumbers` property. This WP CONSUMES
  `captureBaseline` and does not re-derive it. Restating a proved property is
  how it becomes a drifting copy.
- **Any bound on the baseline's memory** — Table A states why a cap would be
  worse than the cost.
- **`tests/unit/a7-integrity-negatives.test.js`.** It is the guard Table B's
  fixture-control row is designed to satisfy. If it goes red, the fixture-control
  design is wrong and that is a finding for the PR body — never an edit to the
  guard.
- **`tests/integration/adopt-e2e.test.js`, and any other test not in the
  Deliverables.** `adopt-e2e`'s fixture is granted; its test file is not. Its one
  failing test is red at the pinned base for a machine-environment reason and
  fails on drift inside `resolvePinnedSpawn`, which resolves the harness on the
  `PATH` it is HANDED — the composed child env, not a pre-env state. The test's
  temp bin dir is not at or beneath the vault, so site 7's sanitised `PATH`
  leaves it in place and the refusal is unchanged: measured failure delta **+0**,
  and nothing in this WP moves its verdict. If the fixture-control move leaves it needing a
  control file the test cannot write, that is a finding for the PR body and a
  follow-on WP, not a licence to widen the boundary.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken
   red; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): build the run workspace and re-target the brain's write root (WP-dream-workspace-retarget)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.

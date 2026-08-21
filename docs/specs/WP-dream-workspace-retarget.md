---
id: WP-dream-workspace-retarget
title: Build the dream run's workspace and re-target the brain's write root into it
status: Draft
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
change at **six measured sites, not one** (Table B). What this WP does **not**
do is flip the running pipeline: promotion does not exist yet, and a dream
whose brain writes into a workspace nothing promotes would be an inert product.
The successor builds promotion and re-points the one call site (Table B, last
row); until then the transitional line passes the vault and behaviour is
unchanged.

## Current state

- `src/core/dream/brain.js` — the vault path reaches the brain process through
  **six** distinct sites, not one: `:57` (prompt text "your only write target"),
  `:65` (absolute vault-prefixed layout lines), `:98` (`addDirs` — the Claude
  tool roots), `:120` (`--cd vaultDir` — THE Codex write fence, because
  `--add-dir` does not fence `apply_patch`), `:172` (`WIENERDOG_DREAM_VAULT` in
  the child env), `:189` (`cwd = vaultDir` on the Codex path). The Claude path
  already runs from a neutral staging cwd (`:198`, `ensureBrainStaging`). All
  six derive from the single `vaultDir` option of `spawnBrain`.
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
| modify | src/core/dream/brain.js | the write-target input becomes the workspace; all six sites (Table B) |
| modify | src/cli/dream.js | ONE transitional argument at the spawn call (`:144-145`) — Table B, last row. Nothing else in this file: the pipeline is the successor's |
| create | tests/unit/dream-workspace.test.js | Table A + Table B + Table F evidence |
| modify | docs/GLOSSARY.md | one canonical name: **workspace** |

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

### Exact contracts

```js
/** Build the run's workspace, copy the vault's readable content into it, and
 *  capture the bytes just written as the run's constructed baseline (Table A).
 *  Verifies POSTCONDITION 1 (no `.git` entry) and refuses a capture that
 *  reports anomalies, before returning; POSTCONDITION 2 is a static property
 *  of this module, asserted by tests rather than checked at runtime.
 *  @param {{vaultDir:string, paths:import('../paths').WienerdogPaths, date:string,
 *           layout:import('../layout').VaultLayout}} o
 *  @returns {{workspaceDir:string, baseline:import('./delta').Baseline,
 *             copied:number, skipped:Array<{rel:string, reason:string}>}}
 *    throws WienerdogError when a postcondition fails (fail closed, before spawn) */
function createWorkspace(o)

/** Remove the workspace tree. Idempotent; never touches the vault. */
function destroyWorkspace(workspaceDir)
```

`spawnBrain`'s write-target option is renamed `vaultDir` → `workspaceDir`; its
other options are unchanged. The six sites of Table B all read that one input.

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
| Copy-in exclusions | `.git/` at any depth (Postcondition 1); the layout's `reports_dir` (the dream report stays code-owned — successor Table D); symlinks at any depth — **measured: the dependency's capture does NOT fail on one**, it records a `{rel, kind:'symlink'}` anomaly and returns (`delta.js:104-105` Anomaly typedef, `:131` `entryKind`; its `@throws` at `:457-458` covers only unreadable entries), so the exclusion may not lean on capture failing closed: `createWorkspace` itself treats a non-empty `anomalies` list as a postcondition failure (contract above); and the harness control-file shapes `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.codex/`, `.mcp.json` at any depth. **The control-file exclusion is defense in depth on the Claude arm and load-bearing on the Codex arm:** measured in the war-room, the Claude brain does not load an instruction file from an `--add-dir` root (the `--help` "(CLAUDE.md dirs)" text is misleading), while the Codex arm's write root IS its cwd (`brain.js:120`, `:189`), which is where instruction discovery happens. Every exclusion is REPORTED in `skipped`, never silently dropped. Excluding a shape from copy-in keeps it out of the BASELINE; what keeps a brain-CREATED one out of the vault is the successor's promotion allowlist (its Table C) — the two are different barriers at different moments, and neither is a restatement of the other |
| Copy-in mechanism | a real byte copy, or a copy-on-write clone where the platform provides one. **NEVER a hardlink mirror** — measured: a hardlink alias writes the vault inode, so the brain would be editing the real vault through the mirror, reproducing today's failure with an extra step. Measured on the primary platform (macOS 15 / APFS, Node 24.18): `fs.constants.COPYFILE_FICLONE_FORCE` fails **ENOSYS**, and plain `COPYFILE_FICLONE` is indistinguishable in wall-clock from a plain copy (165 ms vs 165 ms for 2 000 files / 7.8 MB). **So copy-on-write is not available through Node's API here, and no design may depend on it** |
| Copy-in cost, measured | ~85 µs per file, dominated by per-file syscall overhead rather than bytes: 2 000 files / 7.8 MB → ~165 ms; 20 000 files → ~1.7 s. On a nightly job that is not a cost that needs mitigating, and this spec deliberately specifies none. What DOES need a bound is the baseline's memory (row below) |
| The constructed baseline | `captureBaseline(workspaceDir)` (the dependency's primitive) runs **after** copy-in, inside `createWorkspace`, so the returned baseline describes the finished workspace. It captures the workspace, not the vault: capturing the vault would re-introduce the observed baseline this whole direction exists to escape. The baseline holds **BYTES, not only hashes** — owner-ruled, because the successor's merge (its Table C) needs bytes. `createWorkspace` fails closed on a capture that reports anomalies — the exclusions row above is why that check has teeth. That `createWorkspace` as a whole runs before the brain is spawned is the successor's pipeline ordering (its Table G) |
| Named residual: baseline memory | the baseline is proportional to the copied vault: ~7.8 MB for 2 000 notes, ~78 MB for 20 000. The dependency named this and handed the scope decision here. **This package sets no cap and states why:** a cap would have to drop files, and a baseline that silently omits a file reports that file as `added` later, which is a false accusation against whoever wrote it. If a real vault is ever measured past the point where this matters, the answer is an on-disk pristine copy, not a partial baseline |
| **POSTCONDITION 1 — no `.git` object anywhere in the workspace** | asserted by a walk over the finished workspace inside `createWorkspace`, before it returns. Any entry named `.git` — directory, file or symlink — fails the run closed |
| **POSTCONDITION 2 — no product code runs git with a cwd at or beneath the workspace root** | this is the checkable form of "the workspace is not a git repository", and it is the form that is TRUE. Measured: a plain directory nested anywhere under a repository IS inside that repository for every git command — `git rev-parse --show-toplevel` from `<repo>/sub/workspace` resolves to `<repo>`. So the absence of a `.git` entry does **not** establish the property, and no construction of ours can: whether an ancestor of the private core is a repository is a property of the user's filesystem (`$HOME` as a dotfiles repo is a common habit). What IS ours is where we point git, and Table F states what each half actually carries. This WP's share: `workspace.js` runs no git — it spawns nothing at all. The pipeline-wide git-seam assertion is the successor's |
| **The no-live-actor obligation — split across the pair** | both walks this WP ships (copy-in and `captureBaseline`) run inside `createWorkspace`, before any brain exists, so during them there is no actor. The POST-brain walk (`computeDelta` over the workspace) is the successor's, and so is the reap precondition that guards it (successor Table G): `runBrainWithWatchdog` computes a reap verdict at `cli/dream.js:272` and today consumes it only to gate the pidfile unlink — it is never surfaced to the caller; surfacing it and refusing the walk on anything but a verified reap is the successor's contract. **No surface here may claim the post-brain walk is guarded — this WP does not run it** |
| Teardown | `destroyWorkspace` removes the workspace tree; idempotent; never touches the vault. **Wiring it into every pipeline exit path — and the one named exception, a run that refused because the reap was not verified and therefore does NOT tear down — is the successor's (its Table G)**, because the exit paths live in the pipeline this WP does not touch. A workspace left behind by a crash is the residue-lifecycle successor's subject, not this package's |

### Table B — the brain re-target, site by site (CLAIM 1)

**This table IS the first claim's evidence.** The package's intent brief (a
war-room record kept outside this repo) states the change
as `brain.js:98`; measured, the vault path reaches the brain through six sites,
and two of them are Codex-specific with a different mechanism. A re-target that
changes only `addDirs` leaves the Codex arm writing the vault.

| Site (measured at `025021f`) | Today | After | Why it is not optional |
|---|---|---|---|
| `brain.js:57` | prompt: `Vault directory (your only write target): ${vaultDir}` | the workspace path | the brain writes where the prompt tells it to; a stale path here is a write outside the fence |
| `brain.js:65` | `layoutPromptLines(lay, date, vaultDir)` — ABSOLUTE vault-prefixed tier paths | workspace-prefixed | absolute paths bypass the write root entirely |
| `brain.js:98` | `addDirs: [vaultDir, scratchDir]` | `[workspaceDir, scratchDir]` | the Claude tool roots. `--add-dir` grants read AND write on both harnesses; there is no directory-level read-only option in either, so under this design the brain simply loses vault access rather than depending on a permission layer |
| `brain.js:120` | `--cd vaultDir` | `--cd workspaceDir` | **THE Codex write fence** — `--add-dir` does not fence `apply_patch` (openai/codex#24214). Leaving this is leaving the Codex brain writing the vault |
| `brain.js:172` | `WIENERDOG_DREAM_VAULT: vaultDir` | the workspace path (the env var NAME stays — renaming it churns the WP-026 fake-brain fixtures for no guarantee) | read by the WP-026 mapped fake brain. On the Claude arm the real brain has no Bash to read env (the dream profile); on the Codex arm it CAN run shell and so CAN read env (Table F) — which is exactly why the var is re-pointed for consistency of the fence and no arm may treat it as a control |
| `brain.js:189` | `cwd = vaultDir` (Codex arm) | `cwd = workspaceDir` | instruction discovery happens at cwd — this is M7's step 3 |
| **The claim's runnable form** | — | — | for **both** harnesses: build the argv and the child env with a `workspaceDir` DISTINCT from the vault, and assert the vault path (and any element containing it) appears in **no** argv element and **no** env value. A grep over the source is not sufficient — renaming the variable would pass it. The assertion is over the composed values. Measured on the pinned base as a red-side proof that the check discriminates: the composed Codex argv carries the vault path in **two** elements today — the `--cd` operand and the positional prompt |
| **The claim's behavioural form** | — | — | a real `spawnBrain` run against the pinned fake brain that deliberately attempts a vault write, after which the vault is **byte-identical** to its pre-run state. Proven RED by pointing one site back at the vault, one site at a time — six reds, because a single red does not prove the other five sites are covered |
| **The transitional call site** (`cli/dream.js:144-145`) | `spawnBrain({ vaultDir, ... })` | `spawnBrain({ workspaceDir: vaultDir, ... })` — the vault, passed explicitly as the write target, with a comment naming the successor | keeps the running product byte-identical until the successor builds the workspace in the pipeline and re-points this argument. Re-pointing it HERE, without promotion, would leave the dream writing notes that nothing promotes — an inert product, which is what the stacked split exists to avoid. **CLAIM 1 is therefore a property of the spawn seam in this WP, and becomes a property of the running product in the successor** |

### Table F — what the two claims actually establish (measured, not asserted)

The intent brief marks two sentences as this package's to DEMONSTRATE, because
an earlier advisor passed them on as established when they stood only in a plan.
Measured on the tree, one holds as stated and one needs its mechanism
re-attributed. **This table is the honest form; the prose of BOTH halves cites
it — the successor never restates it (owner ruling, split logbook entry).**

| Claim | Measured verdict |
|---|---|
| **1. The brain's roots become `[workspaceDir, scratchDir]`, and no other path grants the brain vault access** | **Holds, but is a six-site change, not a one-line one** (Table B). `brain.js:98` is one of six sites and the only one the brief names; `:120` and `:189` are the Codex arm, where the mechanism is `--cd`/cwd rather than `--add-dir`. Runnable form: the composed-argv-and-env assertion plus the byte-identity behavioural test, each proven red six times, one site at a time. **Scope note:** this WP proves the property at the spawn seam; the running product acquires it when the successor re-points the transitional call site (Table B, last row) |
| **2a. No `.git` object exists in the workspace** | **Holds by construction and is checked** (Postcondition 1) |
| **2b. "The workspace is not a git repository"** | **Does NOT hold as stated, and no construction of ours can make it hold.** Measured: `git rev-parse --show-toplevel` from a plain directory nested under a repository resolves to that ancestor repository. Whether an ancestor of the private core is a repository is the user's filesystem, not ours. The checkable and true form is Postcondition 2: **no product code runs git with a cwd at or beneath the workspace root** |
| **What M10's closure actually rests on** | **the git-free classification, not the not-a-repository property.** `computeDelta` is a filesystem walk that never consults git — the dependency asserts this mechanically (its module requires no `child_process`). An ignore file cannot hide a path from a filesystem walk, on any platform, regardless of any ancestor repository. Postcondition 2 is a second, independent barrier whose failure would be bounded to our own git invocations — and across the whole pair there is exactly one, the successor's merge (its Table C, row M2), whose cwd is a constructed neutral directory outside any repository, never the workspace. **The intent brief attributes the closure to the second half; measurement puts it on the first.** Nothing about the closure weakens — it gets stronger, because the load-bearing half is unconditional. Measured on the pinned base, both directions: in one tree holding a self-hiding `.gitignore` (`*`) and a payload under a project dir, `git status --porcelain -z -uall` returns **zero bytes** (M10 reproduced) while `computeDelta` reports the payload `added` |
| **The containment residual the dependency handed over — hypothesis (1), the brain's tool set** | **FALSE on the Codex arm, and that is a correction to an inherited assumption.** Measured: the code-owned `dream` hermetic runtime profile (ADR-0025) allows `Read`/`Write`/`Edit`/`Glob`/`Grep` and disallows `Bash` (`getProfile('dream')`, `src/core/runtime-profile.js`) — so on the Claude arm the brain has no tool that creates a symlink or renames a directory. But the Codex arm runs `--sandbox workspace-write` (`brain.js:117-118`), which permits shell **inside** the workspace. The dependency called this hypothesis weak because tool capability is a harness detail; measured, it is not merely weak, it is arm-dependent |
| **The containment residual — hypothesis (2), capture-before-spawn ordering** | **Holds for the pre-brain walks by this WP's construction, and becomes ENFORCED for the post-brain walk in the successor.** Copy-in and `captureBaseline` both run inside `createWorkspace`, before the brain is spawned, so during capture there is no actor. The post-brain `computeDelta` walk is the one the dependency could not speak for; the successor's reap precondition (its Table G) closes it by refusing to walk until the brain's process group is verifiably empty. With no live actor, the residual reduces to statically-planted objects, and a static symlink — to a file or a directory — is surfaced by the dependency's walks as an anomaly, never followed, and appears in no baseline and in no delta record |
| **The real exposure, stated PER PLATFORM as the dependency required** | the race needs a writer CONCURRENT WITH THE WALK, and the successor's reap precondition removes the only one. The brain is the sole actor with workspace write access — on the Codex arm it can even run shell there (row above) — and it is verifiably dead before the walk begins; what remains would have to be some other process writing inside the 0700 private core, which is not a threat this project's model carries. **This is the whole reason the reap precondition is a contract row (successor Table G) and not a nicety:** without it, the Codex arm's brain is exactly the live actor the dependency's caller invariant forbids. **The platform condition therefore does not bite here**: `O_NOFOLLOW`'s absence on win32 costs WHEN the refusal happens, not whether it happens — the `(dev, ino)` revalidation refuses at `fstat` before any byte is read — and with no live actor there is no window to widen. The surviving residual is inode reuse, which exists on every platform. **No cross-platform guarantee is claimed:** what is claimed is that this package does not depend on the flag |
| **The precedent for the workspace walk** | `src/core/vault-snapshot.js:45-61`, not `private-fs.js`. The former states the platform question and answers it with an explicit branch that NAMES what is lost, deliberately rejecting the `fs.constants.X \|\| 0` idiom "which makes a missing flag look like a present one". `private-fs.js:683-684` and `manifest.js:746` do use `\|\| 0`, and both consciously name what carries the weight on win32 — **the repo is inconsistent in IDIOM, not in substance**, and no stronger phrasing than that is supported |

### Mirrored Surface Checklist

- [ ] Deliverables-table `Notes` cells (each cites its owning table)
- [ ] `### Exact contracts`' two signatures, their return shapes, and the
      `spawnBrain` option rename
- [ ] Acceptance criteria that assert Tables A, B and F
- [ ] Verification steps (the assertions mirror Tables A and B)
- [ ] Current-state description (the six re-target sites, the single call site)
- [ ] Implementation notes (the six-reds requirement, the CoW measurement)
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
      steps. **None may describe it as a one-line change to `addDirs`.**

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: the workspace is files, created and removed within one
  run; nothing outlives the job.
- **Six reds, not one.** The re-target's negative proof must break one site at a
  time. A single red passes with five sites still pointing at the vault, and
  five of the six are invisible to a test that only checks `addDirs`.
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
- [ ] **The dependency's caller invariant, this WP's share:** both walks this WP
      ships run before any brain exists (Table A's no-live-actor row), so there
      is no actor to replace a root entry or ancestor during them. The
      post-brain walk and its reap precondition are the successor's. **No
      surface may claim the walk establishes containment.**
- [ ] Named residual: on the Codex arm the brain can run shell inside the
      workspace (Table F). This package does not close that and does not claim
      to; the successor's reap precondition is what keeps it from mattering to
      the walk.

## Acceptance criteria

- [ ] **CLAIM 1 at the spawn seam, structurally.** For both harnesses, with a
      `workspaceDir` distinct from the vault, the composed argv and the composed
      child env contain no element equal to, and no element containing, the
      vault path. Proven RED **six times** — once per Table B site, re-pointed
      one at a time.
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
      (e.g. under `02-Areas/`) is copied. Every exclusion — `.git/`, the
      layout's `reports_dir`, a symlink, each control-file shape — appears in
      `skipped` with a reason, and nothing else is skipped.
- [ ] **Fail closed.** A POSTCONDITION 1 failure, or a capture that reports
      any anomaly, makes `createWorkspace` throw; no workspace handle is
      returned.
- [ ] **Teardown.** `destroyWorkspace` removes the tree, is idempotent (second
      call: no-op, no throw), and never touches the vault — the vault is
      byte-identical across create → destroy.
- [ ] **The transitional call site changes no behaviour.**
      `tests/integration/dream.test.js` is not modified (it is not in the
      Deliverables — the boundary enforces this) and passes unchanged.
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
```

- The two `claim-` runs and the glossary grep are NEW steps and each is an
  ASSERTION: it exits
  non-zero on failure rather than printing something a reader must judge. Paste
  a real green on the finished state AND a real red from a deliberately broken
  state — one Table B site re-pointed at the vault (six times, one site each);
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

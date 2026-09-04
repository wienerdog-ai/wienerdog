---
id: WP-audit-c-close-disposition
title: Measure C2 (git seam) and C3 (layout) against the landed promote-in architecture and disposition group C
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0031]
epic: audit-close
---

# WP-audit-c-close-disposition: measure the group C findings and record their disposition

## Dispatch precondition

**ONE OWNER RULING, and it blocks dispatch — and it is no longer the ratification
this spec carried before round 1.** The gate reproduced two live mechanisms, so
"group C closes" is withdrawn: recording a disposition of **open** is a finding
of fact and needs nobody's signature (Table D), and there is no closure left to
sign. What remains the owner's is a **severity call**, and it changes what
happens next rather than what the logbook says.

**The call: are D1's open halves a queued work package, or an incident?**
Measured through the production write path (V1 (b) and (c), whose samples this
does not repeat): current, documented instruction files — `GEMINI.md`, `QWEN.md`,
`WARP.md` — are **admitted** beneath an ordinary project folder, with no dot
segment and no unusual name, and the production write is **demonstrated for
`QWEN.md`** (the others are admitted by the same predicate, not separately
written); dot-segment control paths are admitted the same way, with the
production write demonstrated for `.github/copilot-instructions.md`. Both are the
class group C exists to deny.

- **(i) QUEUED — the recommendation.** Both successors join the queue in the
  normal order, **`WP-instruction-basename-currency` first and
  `WP-dot-segment-denial` immediately after it** — currency first because it is
  the smaller change against the more ordinary path, dot-segment second because
  it is the structural rule and the larger package. Grounds: the brain must
  choose the path itself, the four ENUMERATED names still hold at every depth
  (V1 (a)), and the vault is the user's own repository.
- **(ii) INCIDENT.** `WP-instruction-basename-currency` jumps the queue as a
  hotfix and an incident entry is filed against *that* dispatch;
  **`WP-dot-segment-denial` follows it directly, ahead of the rest of the queue
  but not as a second hotfix** — it is the class rule, and rushing a class rule
  is how the enumerations in this spec's own history got written. Grounds for the
  hotfix: a shipped product writes current, documented instruction files the audit
  ruled KEEP, by an ordinary path.

**Either way this WP's own deliverables are identical** — it records, it does not
fix, and it files no incident entry of its own. The ruling changes only the
successors' priority; **the dispatch message records it**, and neither branch
touches Table D or Table E.

## Context (read this, nothing else)

Wienerdog is an installer that writes files: a CLAUDE.md/AGENTS.md managed block,
a markdown **vault**, skills, hooks and OS-native schedules. **Wienerdog is just
files (ADR-0004)** — nothing here starts a process that outlives its job. The
nightly **dream** run is a CLI process that consolidates recent sessions into the
vault and exits.

A security audit ruled five remediation groups, A–E. **Group C** was "the dream
write fence": the dream could write files that control the machinery. Its three
findings, whose measured bases are preserved verbatim in
`docs/specs/logbook/2026-08-31-audit-group-c-ruling-harvest.md`:

- **M7 — harness-instruction persistence.** A brain-written vault-root
  `CLAUDE.md`/`AGENTS.md` was kept and committed; the fence's `isTier3` predicate
  was identity- and skills-prefix only, so instruction files fell through its
  keep-everything branch.
- **M9 — git control state inside the write fence.** No `.git` carve-out
  anywhere; the validator ran `git add`/`git commit` in the vault repo with the
  parent's privileges **and unfiltered env**, no `--no-verify`, no neutral hooks
  path.
- **M10 — the gitignored/invisible region.** Classification ran `git status
  --porcelain -z -uall` with no `--ignored`, cleanup ran `git clean -fd` (not
  `-x`), and `.gitignore` itself fell through the keep branch.

The ruling's fix was **structural, not enumerated** — the era had already
measured twice that *"a wider enumeration is still an enumeration"*. Its item 1
was **"no write to any path with a dot-prefixed segment"**, stated as a class so
future control directories need no maintenance. Its item 2 was a **name list**
for instruction filenames, accepted *with a named residual* precisely because no
structural marker exists there. **Those two framings — a class and a maintained
list — are what this disposition measures against, and between them three
verdicts turned.**

The group was split C1 (the fence) → C2 (the git seam) → C3 (layout).
**C1's fix was superseded before it shipped.** What landed instead is the
promote-in inversion, five WPs now in `docs/specs/done/`: the brain writes a
**workspace**, never the vault; only promoted content enters the vault through
one identity-anchored chokepoint; and the run's own git calls are default-deny
shape-pinned. **C2 and C3 were never dispositioned.**

This work package dispositions them. **It is a measurement and recording pass: it
changes no behaviour and touches nothing in `src/` or `tests/`.** The measurements
were taken on `49d3d467` and re-taken at the round-1 gate; the implementer re-runs
them and records the result. Where a measurement disagrees with Table D, that is
a spec bug — say so in the PR and stop; do not adjust the table to match.

**One honesty rule, inherited from the ruling and binding here.** The archive's
harness-refusal measurement for `.git` writes was explicitly ruled
**non-load-bearing** — it rests on unverified third-party behaviour this project
neither owns nor tests. **No disposition rests on it**: every Table D cell rests
on a command in Verification steps. **Naming it as excluded is required, not
forbidden**, and only in that form — see AC5 for the literal property that is
actually checked, and for what that check does not reach.

## Current state

What an implementer needs to locate; the *verdicts* are Table D's and are not
repeated here.

- `src/core/dream/promote.js` — `makeAdmit` (exported) is row C9, the promotion
  allowlist, handed to `writeIntoVault` as its `admit` callback. Clause (c) is
  three enumerations: `INSTRUCTION_BASENAMES` (`:96`, four names),
  `DENIED_SEGMENTS` (`:99`, exactly `.claude` and `.codex`) and `DENIED_BASENAME`
  (`:102`, `.mcp.json`). Clause (a) is the writable tier directories, clause (b)
  is an `.md` extension.
- `src/core/dream/vault-write.js` — `writeIntoVault` owns **no policy**: it
  throws without an `admit` (`:210-211`) and applies it to the **resolved** path
  (`:333`).
- `src/core/dream/warnings.js` — a **second** vault-writing authority:
  `refreshWarnings` (`:224`) calls `writeIntoVault` with its own
  `admitWarningsPath` (`:192`), fixed to `WARNINGS_REL = 'reports/warnings.md'`
  (`:72`). `src/cli/dream.js:1009` pushes that same constant straight into the
  commit member list.
- `src/cli/dream.js` — `commitNamedSet` builds the run's commit in a **private
  index** (`GIT_INDEX_FILE`) and publishes with `commit-tree` + `update-ref`;
  it never invokes `git commit`. Every call's env is `process.env`, spread
  (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
- `src/core/dream/validate.js` — no `git add`, no `git commit`. `assertCleanTree`
  and `restoreVaultToHead` have no `src/` consumer (`:1166-1177` states that as
  the contract); `assertGitRepo` is called once, at `src/cli/dream.js:587`.
- `tests/unit/dream-pipeline.known-calls.js` — nine pinned shapes, default-deny.
- `src/core/dream/delta.js` — the classifier; requires only `node:fs`,
  `node:path`, `../errors`.
- `src/core/layout.js` — `isSafeRelativePath` (`:65-71`) rejects empty, absolute,
  backslashed and `..`. **`src/core/layout-infer.js:40-46` holds a COPIED
  validator** whose own comment says *"Copied from layout.js's private
  `isSafeRelativePath`"*; `inferLayout` (`:104`) applies it at `:131`.
  `src/cli/adopt.js:347` infers the layout, `:381` writes it into `config.yaml`
  via `renderLayoutBlock`, and `--yes` skips the confirmation (`:349`).
- `docs/HANDOVER.md` carries the audit status table; its group C row today reads
  *"Structurally closed by the promote-in family … Remaining: formal C2/C3
  disposition"*.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | docs/specs/logbook/2026-09-02-audit-group-c-disposition.md | the disposition record. If the implementation day differs, use that day's date — `docs/specs/logbook/` is boundary-free either way, and V6 resolves the file by glob |
| create | docs/specs/WP-dot-segment-denial.md | the Draft stub for the dot-segment class (Table D rows D1 (b) and D5) |
| create | docs/specs/WP-instruction-basename-currency.md | the Draft stub for the stale instruction-basename list (Table D row D1 (c)) |
| modify | docs/HANDOVER.md | **the group C row's Status cell only** — Table E's text for the recorded ruling. No other cell, no other line |

**`docs/specs/WP-dream-git-env-pinning.md` is NOT a deliverable, and the
implementer must not edit it.** D2 (b)'s channel-set obligation already lives in
that WP's own "What done means", as the section
`## Amendment, 2026-09-02 — the channel set is part of "done"`, landed on `main`
by commit `93072b1d` during this spec's round-4 closing fixes — so E2's pointer
already declines to trust a green that skips the mechanism. A branch cut from
`main` carries that section untouched; V6 only checks that it is **still
present**, and the file's absence from the table above keeps
`scripts/boundary-check.js` rejecting any change to it.

### Exact contracts

**The logbook entry** carries: (1) one paragraph naming the tree measured and the
honesty rule; (2) **Table D reproduced in full**, plus Table E's
retired-mechanism paragraph — the two retired closure triggers with their cause,
because that lesson outlives this spec; (3) the command output pasted for each of
V1–V5; (4) the Dispatch precondition's severity ruling, quoted, with its date. Reproducing Table D is a **transfer of ownership, not a duplicate**:
this spec is Table D's authority while it is worked, and on the flip to Done the
logbook becomes it — which is why Table E's cell cites the logbook, not this file.

**The C3/dot-segment stub** is a Draft stub in the sense `docs/HANDOVER.md`
defines — context, intent, known traps and a done-definition, **not** a reviewed
spec. Frontmatter, verbatim:

```yaml
---
id: WP-dot-segment-denial
title: Deny dot-prefixed path segments at the promotion allowlist and at every layout validator
status: Draft
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004]
epic: audit-close
---
```

**One work package covering two enforcement points, with a stated cause:** the
2026-08-05 ruling's item 3 (config-side) existed *to make item 1 (path-side)
unconditional*, so landing either alone leaves the class open. It may be split at
maturation; it may not be half-landed. Its body states:

1. **The rule, as ruled: no write to any path with a dot-prefixed SEGMENT** — a
   class, not a list. Today's `DENIED_SEGMENTS` (`promote.js:99`) enumerates two
   names, so `.github`, `.husky`, `.git`, `.obsidian` and `.cursor` are admitted
   beneath an admitted tier. Reproduce with V1 (b), not from this sentence.
2. **Two enforcement points, both required.** (a) `makeAdmit`'s clause (c) —
   segment-level, applied to the resolved path. (b) The layout validators — a
   dot-prefixed layout value makes a dot directory a *tier*, which is the other
   way the class opens.
3. **The layout side is TWO validators, not one, and one of them is a producer.**
   `layout.js:65-71` (reader) and the copied `layout-infer.js:40-46` (producer);
   `adopt --yes` infers, writes the block into `config.yaml` and scaffolds the
   directories with no confirmation. **So the value is not solely the user's —
   Wienerdog can generate it.** Decide explicitly: one validation authority
   (export and reuse the predicate) or reject at both. A **round-trip acceptance
   case is required**: `adopt --yes` on a vault containing a dot-prefixed
   directory must not persist a mapping a later run silently discards.
4. **The inherited notice, not to be changed there.** The reader's per-key
   fallback to the built-in default is **silent** by the existing contract; a dot
   rejection inherits that silence. Whether to notify is that WP's decision to
   take deliberately, not to absorb by accident.
5. **The residual this rule does NOT close, named rather than implied.** The
   instruction-basename list (`promote.js:96`) stays a list; an unknown tool's
   dot-free instruction file inside a tier still passes. That was accepted at
   ruling time and is not reopened here.
6. **ADR-0004 bounds the fix.** Nothing resident re-reads `config.yaml`: a bad
   value is read by one CLI run that then exits. The fix is a validation
   condition — never anything that watches.
7. **The pointer that must move with it.** `promote.js`'s *"Deliberately NOT a
   dot-rule: audit finding C3 owns the layout dot-rule and its notice"* is a live
   deferral to this WP; landing it means updating that comment in the same pass.

**Its REQUIRED VERIFICATION — the part this spec may state and may not itself
assert.** The proof must establish the **class predicate**, not a list:

- **The property:** *no path segment and no layout segment beginning with `.` is
  admitted or emitted, at any depth, in any case.* Stated as a universal over the
  segment alphabet, not over a set of examples.
- **All three enforcement points**, separately: `makeAdmit`, `readVaultLayout`,
  `inferLayout`/`adopt`. One passing implies nothing about the others — measured.
- **The proof is graded on HELD-OUT segments** — dot-prefixed segments the proof
  does not name, generated rather than listed. Stated as the property, not the
  generator: *a segment whose first character is `.` is refused, at every depth,
  in any case, at all three enforcement points.*
- **The RED mutant is the CURRENT PRODUCTION ENUMERATION** — `DENIED_SEGMENTS`
  as shipped — which must FAIL the held-out set. **An enumeration of the names
  the proof itself exercises is NOT a valid mutant**: it agrees with the
  predicate on every value it is graded against, so it cannot go red. (Measured:
  zero disagreement on the exercised set; the shipped enumeration, by contrast,
  admitted 7 of 7 held-out segments.) A broader finite matcher — a prefix table,
  a bounded-length rule, a regex fitted to the fixtures — must fail the same way,
  which is what held-out grading buys and a fixed list cannot.
- **Case folding is in scope:** measured, `.GiThUb/copilot-instructions.md` is
  admitted today while the enumerated `ClAuDe.md` is refused, so the existing
  fold covers only enumerated names.

**The instruction-currency stub** is the second Draft stub. Frontmatter, verbatim:

```yaml
---
id: WP-instruction-basename-currency
title: Bring the instruction-basename denial current and give the list a maintenance obligation
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
epic: audit-close
---
```

**Why it is SEPARATE from `WP-dot-segment-denial`.** Those two are one rule split
across two enforcement points, so half-landing either leaves the class open.
These are **two KINDS of rule and neither reaches the other**: a dot-segment rule
does not refuse `01-Projects/example/GEMINI.md` (measured — no dot segment), and a
basename list does not refuse `.husky/pre-commit.md`. A class rule **closes**; an
enumeration **never closes**. Merging them would put an unclosable item inside a
closable WP. Its body states:

1. **The gap, measured.** `INSTRUCTION_BASENAMES` (`promote.js:96`) holds four
   names. Production `makeAdmit` **admits** `01-Projects/example/GEMINI.md`,
   `01-Projects/example/QWEN.md` and `01-Projects/example/WARP.md`, and the real
   `writeIntoVault` with that `admit` **wrote** `01-Projects/example/QWEN.md` —
   the other two are admitted by the same predicate and were not separately
   written. Mixed case passes too: `Gemini.md` is admitted while the enumerated
   `ClAuDe.md` is refused. Reproduce with V1 (c), not from this sentence.
2. **These are documented conventions, not guesses** — `GEMINI.md` (Gemini CLI),
   `QWEN.md` (Qwen Code), `WARP.md` (Warp). **Re-confirm every one against
   current vendor documentation when this WP is picked up, and cite a URL per
   entry**: a stale list is the defect being fixed, so a stale citation would
   repeat it.
3. **What is NOT this WP's:** anything denied by a dot segment rather than by its
   basename. Two worked examples. (i) `.cursor/rules.md` — its basename is merely
   `rules.md`, so only the dot rule can reach it. (ii) `copilot-instructions.md`
   — a bare tier-local one is **not** a documented Copilot discovery path and is
   an ordinary note; GitHub documents repository-wide instructions at
   `.github/copilot-instructions.md` and path-specific ones at
   `.github/instructions/NAME.instructions.md` (source: docs.github.com,
   *"Adding repository custom instructions for GitHub Copilot"*), and both are
   reached by the dot rule. So neither basename belongs in this WP's inventory;
   both belong to `WP-dot-segment-denial`. Keeping them here would double-count
   one residual, let each WP assume the other closed it, and — for
   `copilot-instructions.md` — deny legitimate ordinary notes.
4. **The list stays a list, and an enumeration NEVER CLOSES.** The 2026-08-05
   ruling took item 2 as a name list *with a named residual* because no structural
   marker exists for instruction filenames. This WP does not overturn that. **Say
   so plainly in the spec rather than implying completeness** — the honest shape
   is "current as of a date", never "complete".
5. **So the deliverable is a DATED INVENTORY plus an OBLIGATION, not MERELY a
   patch.** (i) a dated inventory of documented instruction-file conventions, each
   with its citation; (ii) **accepted omissions recorded explicitly** — anything
   found and deliberately not denied, with the reason; (iii) a standing maintenance
   obligation carrying a **named owner** and an **objective trigger** (for example
   "re-inventory at every minor release, recorded in the release runbook") —
   never an unowned comment. **The inventory drives a source change, and that
   change is part of the deliverable:** every inventoried basename that is not an
   accepted omission must reach denial, which means editing
   `INSTRUCTION_BASENAMES` (`promote.js:96`) and its tests. **The matured WP's
   Deliverables table must list `src/core/dream/promote.js` and the test files
   that pin the basename set** — a docs-only package would leave D1 (c) open.
6. **The residual that remains after this WP, named rather than implied.** A
   genuinely unknown or undocumented tool's instruction file still passes. That is
   the ruling's own accepted residual and is not reopened.
7. **ADR-0004 bounds the fix**: a name list, a dated document and a written
   obligation. Nothing that watches, polls or runs.

**Its REQUIRED VERIFICATION.** Every entry in the dated inventory must be shown
to reach **denial across case and depth** — the inventory, not a sample, is the
completeness boundary, and the accepted-omission list is what makes the boundary
honest. **This spec states that requirement and asserts none of it**: the
inventory does not exist yet, and pre-writing its contents here would be the
fourth enumeration.

## Contract reference

Activation (ADR-0031's 2-of-7 test) — **four** of seven fire: (ii) a result
taxonomy is introduced (mooted / open, each with a required cause); (v) the task
crosses an authority boundary; (vi) downstream consumers inherit the dispositions;
(vii) the same facts appear in multiple mirrored surfaces.

### Table D — the disposition of audit group C

The single place every disposition fact is decided. A **mooted** row names what
retired the mechanism; an **open** row names the WP that owns it. Every measured
cell is the output of the step in its last column, and of nothing else.
**Rows D1 and D2 were MOOTED before the round-1 gate; both were reproduced live
and split. The retired verdicts are recorded here, with their cause, rather than
quietly replaced.**

| # | Finding | Mechanism, as ruled 2026-08-05 | Measured | Verdict | Cause / owner | Step |
|---|---------|--------------------------------|----------|---------|---------------|------|
| D1 | **M7** — harness-instruction persistence | the brain writes an instruction file; the fence misses it; it is kept and committed. Item 1 of the fix denied **any dot-prefixed segment**, as a class; item 2 denied instruction filenames as a **name list**, accepted with a named residual | (a) all four ENUMERATED basenames are refused at every depth (16/16). (b) `.github`, `.husky`, `.git`, `.obsidian`, `.cursor` are **admitted beneath an admitted tier** (5/5), and the real `writeIntoVault` with the production `admit` **wrote** `01-Projects/example/.github/copilot-instructions.md`. (c) `GEMINI.md`, `QWEN.md` and `WARP.md` — all tier-local, **no dot segment** — are **admitted** (5/5, counting a second depth and mixed-case `Gemini.md`), and the production path is **demonstrated for `QWEN.md`**: the real `writeIntoVault` with the production `admit` wrote it. The others are admitted by the same predicate and were not separately written. The enumerated `ClAuDe.md` is refused | **SPLIT — (a) MOOTED, (b) OPEN, (c) OPEN** | (a) retired by the promote-in inversion: clause (a)+(b) put a vault-**root** instruction file outside the allowlist without enumeration, and `INSTRUCTION_BASENAMES` covers **the four names it enumerates** at any depth. **The claim is scoped to the enumeration and may never be worded as "the current names"** — that wording is what hid (c). (b) **`DENIED_SEGMENTS` (`promote.js:99`) is an ENUMERATION of two names where the ruling required a class**, so item 1 is unmet beneath tiers. Owner: **`WP-dot-segment-denial`**, which must prove the predicate **as a class**, with anti-enumeration evidence (its stub's required verification; the reason is Table E's retirement paragraph, not restated here). (c) **`INSTRUCTION_BASENAMES` (`promote.js:96`) is STALE, which is a different defect from being a list.** `GEMINI.md` is Gemini CLI's documented hierarchical instruction file and postdates the list; `QWEN.md` and `WARP.md` are likewise documented conventions, and all three are admitted tier-local with **no dot segment**, so **the dot-segment fix does not reach them** — (b) and (c) need separate owners. Owner: **`WP-instruction-basename-currency`**, whose required verification is a **dated inventory** rather than a longer list (its stub; cause in Table E's retirement paragraph). This is NOT the residual accepted at ruling time ("an *unknown* tool's instruction file passes"): these are current, documented conventions. **`.cursor/rules.md` and `.github/copilot-instructions.md` are NOT in this row** — `rules.md` is merely a basename, and GitHub documents Copilot's repository-wide instructions at `.github/copilot-instructions.md` and its path-specific ones at `.github/instructions/NAME.instructions.md` (source: docs.github.com, *"Adding repository custom instructions for GitHub Copilot"*), so a bare tier-local `copilot-instructions.md` is an ordinary note and not a documented discovery path. Only the dot rule reaches these two, and they belong wholly to (b). **RETIRED VERDICTS:** this row read MOOTED until round 1, whose evidence tested dot paths only at the vault ROOT, where clause (a) rejects them for being out-of-tier — the probe moved two variables and attributed the refusal to the wrong one. Round 1's replacement then read **(a) MOOTED** on the words "the four current names", which round 2 falsified: the probe enumerated exactly the names the code enumerates, so it could not have failed | V1 |
| D2 | **M9** — git control state inside the write fence | the validator runs `git add`/`git commit` in the vault repo, parent privileges, **unfiltered env**, no `--no-verify`, no neutral hooks path | (a) `validate.js` has no `add`/`commit`; the run never invokes `git commit`; nine pinned shapes carry none of `add commit clean reset status stash`. (b) **V2 (b)'s three probes, and nothing wider — every clause here is that step's own recorded output.** With an inherited `GIT_DIR`: (i) the pinned `hash-object -w --stdin` write was **redirected** into the other repository and not the vault, and (ii) the pinned `commit-tree` + `update-ref` pair **advanced the other repository's HEAD** — `moved=yes`, old → new — while the vault's own HEAD stayed unchanged. With `GIT_DIR` unset and an inherited `GIT_OBJECT_DIRECTORY` alone: (iii) the same pinned `hash-object -w --stdin` write landed under the other repository and not under the vault | **SPLIT — (a) MOOTED, (b) OPEN** | (a) retired by `commitNamedSet`: private index + `commit-tree` + `update-ref`, so `--no-verify` has nothing to suppress — the pre-commit/commit-msg path is **structurally absent**, not disabled. (b) the ruled mechanism **names the unfiltered env**, and `commitNamedSet` spreads `process.env` into every call; a scheduled run gets run-job's clean env, a manual `wienerdog dream` inherits the shell. Owner: **`WP-dream-git-env-pinning`** — Draft, **needs an owner product decision and has not landed**. **The requirement now lives in THAT WP's own done-contract** (its dated 2026-09-02 amendment, landed on `main` at commit `93072b1d`, not a Deliverable of this WP) — because E2's pointer trusts each successor's own green, and a requirement recorded only here would not reach it. What that amendment obliges: its canonical table must **enumerate every inherited write-target and config channel the pinned shapes honour** — at least `GIT_DIR`, `GIT_WORK_TREE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_CONFIG_*`, `GIT_NAMESPACE`, and `GIT_INDEX_FILE` (already ours) — so that *pin*, *pin-with-exceptions* and *don't-pin* each name their channel set. **Measured by V2 (b)'s third probe, and this is why the enumeration is the requirement:** with `GIT_DIR` unset, an inherited `GIT_OBJECT_DIRECTORY` alone redirected the pinned `hash-object -w --stdin` write out of the vault — so a `GIT_DIR`-only pin would report success while the mechanism stayed live. **Neither this row nor the amendment asserts an outcome:** *don't-pin* is a legitimate ruling in which the residual is accepted and named, not retired — the amendment adds an obligation, not a verdict. **RETIRED VERDICT:** this row read MOOTED until the round-1 gate, on the reasoning that the env half was "already owned"; **a registered future decision is not a retiring cause**, and that is the general rule this row now carries. **NOT reopened:** the `reference-transaction` hook residual, ruled out of scope by the owner on 2026-08-31 (`WP-dream-promote-in-workspace` Table W row W1, which also rejects `core.hooksPath` suppression by name). **Not a residual:** `assertGitRepo` is a read-only `rev-parse --git-dir` and writes no control state | V2 |
| D3 | **M10** — the gitignored/invisible region | `git status … -uall` without `--ignored` classifies; `git clean -fd` (not `-x`) cleans; a dream-written `.gitignore` blinds both | `delta.js` requires only `node:fs`, `node:path`, `../errors` — no route to a process spawner. `assertCleanTree` and `restoreVaultToHead` have no `src/` consumer | **MOOTED** | Retired by the **git-free classifier**: `computeDelta` is a filesystem walk that never consults git, so an ignore file has nothing to blind — **absent, not defeated**, and unaffected by D1's open halves (neither a dot-segment nor an unenumerated-instruction write restores a git dependency the classifier no longer has). **Standing-discipline note:** `restoreVaultToHead`'s `clean -fd` still exists, exported for fixtures and unreachable from `src/`; a future WP that re-wires it re-opens M10's `-fd`-not-`-x` question and must re-run V3 and V4 | V3, V4 |
| D4 | **C2** — the git seam | ruling item 4: give the seam its own third-party-independent defense — `--no-verify` and a neutralized hooks path | follows D2 exactly | **SPLIT — own-defense half VOID, env half OPEN** | The `--no-verify`/hooks-path half is void by construction: there is no `git commit` to harden. The environment half is D2 (b), OPEN, owned by `WP-dream-git-env-pinning`. **RETIRED VERDICT:** this row read MOOTED with *"nothing new is owed"*; that sentence is **withdrawn** — the seam still owes an independent, constructed environment | V2 |
| D5 | **C3** — layout | ruling item 3: reject dot-prefixed layout values in `isSafeRelativePath`, so the item-1 write rule is unconditional | `readVaultLayout` returns `projects_dir: .git` unchanged and `makeAdmit` on that layout admits `.git/hooks/note.md`; the **copied** `layout-infer.js` validator has the same gap, and `inferLayout` on a vault holding `.projects/` produced `projects_dir: ".projects"` | **OPEN** | Owner: **`WP-dot-segment-denial`** — the same WP as D1 (b), because item 3 exists to make item 1 unconditional and half-landing either leaves the class open. **Widened at round 1:** the finding is not one condition at one site — it is two validators, one of which (`layout-infer.js`, reached by `adopt --yes`) is a **producer**, so the dot value is not solely the user's | V5 |

### Table E — the group C row in `docs/HANDOVER.md`

The group C row has three cells. **Only the third — Status — changes**, replaced
verbatim with the text below; the `C` and
`Dream write fence (machinery-controlling files)` cells stay byte-identical.
Neither text re-lists the five Done promote-in slugs the current row names: their
status lives in spec frontmatter and would go stale here, so both cite the
logbook, which owns the disposition facts. `<LOGBOOK>` is the created entry's
repo-relative path.

**E1 is the recommendation.** With D1 (b), D1 (c), D2 (b) and D5 open, "group C
closes" is not an honest cell.

**E2 IS A POINTER, NOT A PRE-WRITTEN ASSERTION SET — and that is the round-3
correction.** Group C closes by a **later disposition act**, taken when every
successor named in Table D is Done and that successor's own verification is
green. **This spec pre-writes no closed-state assertion, and may not acquire
one.** What it *does* do is make sure each successor's own green covers its
mechanism: where a successor's done-contract was narrower than the residual it
owns, the fix is to amend **that contract** rather than to assert the proof here
— which is why `WP-dream-git-env-pinning` carries a dated channel-set amendment,
landed on `main` at commit `93072b1d` ahead of dispatch rather than left as work
for this WP's implementer.

**The retired mechanism, with its cause, because it took findings two rounds
running.** Round 2 retired *"V1 (b), V2 (b) and V5 have gone red"* — a
defect-presence conjunction a partial fix satisfies. Its replacement, a table of
per-residual closed-state assertions, was retired at round 3 for the **same
underlying reason in a new costume**: every one of those assertions was a
**finite enumeration**, and each was defeated by a partial fix that satisfied the
listed cases while the class stayed live — a five-name segment list passing while
`.vscode/instructions.md` was written; `.git`/`.projects` fixtures passing while
the reader still accepted `.github` and the producer emitted `.identity`; four
currency examples passing while `QWEN.md` and `WARP.md` were written; a
`GIT_DIR`-only pin passing while `GIT_OBJECT_DIRECTORY` still redirected the
write. **The lesson is structural, not another list: a CLASS property can only be
asserted by the work package that implements the class rule.** A disposition pass
records what is mooted and what is open; the proof that an open residual is
closed belongs to the successor that closes it. That content now lives in the
successor stubs, as their required verification — which is where it is closable.

| # | State | The Status cell, verbatim |
|---|-------|---------------------------|
| E1 | **open** — recommended today | **Open — four residuals** — the promote-in family retired M10 and the git-commit half of M9, and the promotion allowlist retired the enumerated instruction basenames; four mechanisms remain live, measured. Basis per finding in `<LOGBOOK>`. Owners: `WP-dot-segment-denial`, `WP-instruction-basename-currency`, `WP-dream-git-env-pinning` |
| E2 | **closed** — a later act, not a trigger | **Closed** — every group C mechanism retired or accepted; basis in `<LOGBOOK>`. Written by a later disposition act once every successor in that entry's Table D is Done with its own verification green |

### Mirrored Surface Checklist

Every surface that mirrors Table D, E or F. A finding updates the table **and**
every mirror below in one pass; a new mirror found in review is registered here
on the spot.

- [ ] **Deliverables-table cells** — the logbook row (mirrors D1–D5 as
      its content contract), the two stub rows (mirror D1 (b)+D5 and D1 (c), and
      the fact that they are two WPs), the HANDOVER row (mirrors Table E's
      Status-cell-only rule), and the **not-a-deliverable note under the table**
      (mirrors D2 (b)'s owner status and the landed `93072b1d` amendment).
- [ ] **Acceptance criteria** — AC1 (D1's three halves and D1 (a)'s *enumerated*
      wording), AC2 (both stubs, their body items, and the currency stub's
      `INSTRUCTION_BASENAMES` source-change clause — whose V6 (c) floor entry is
      that clause's mirror and moves with it), AC3 (Table E's E1 count and
      owners), AC2b (both stubs' presence floor), AC3b (E2 as a pointer, and the
      ban on closure assertions here), AC4
      (D2's residual owners and
      the not-reopened hook ruling), AC5 (the honesty rule's literal property),
      AC6 (boundary-check's mandatory arguments, and the guard that makes V6's
      exit code carry all three repo gates).
- [ ] **Verification commands** — V1 mirrors D1's three halves, V2 mirrors D2/D4's
      two halves — and **V2 (b)'s three probes are the WHOLE basis of D2 (b)'s
      Measured cell**, so a claim added to that cell must arrive as a probe in
      that step, never as a citation to a gate raw — V3 and V4 mirror D3, V5
      mirrors D5. **V6 mirrors the most and is
      checked first on any finding**: the Deliverables, Table E's two Status cells
      **verbatim** (via `RULING`), and AC2–AC6. **V1–V6 are MEASUREMENTS OF
      TODAY'S STATE, never closure triggers** — no step here may be reworded into
      one.
- [ ] **Current state** — locations only; it states no verdict, so a verdict
      change must NOT edit it. What it does mirror is the *citation* set — if a
      Table D cell's file or symbol moves, both move.
- [ ] **Operative prose** — the Dispatch precondition (mirrors D1 (b) and D1 (c)'s
      measured cells and their severity), the Context's class-versus-list
      paragraph (mirrors what D1 and D5 measure against), Table E's
      retired-mechanism paragraph (mirrors both retired triggers and their cause),
      the Implementation-notes open-evidence bullet (mirrors the same), and both
      stubs' required-verification items — **which are where the closure proofs
      moved, and the only place they may live**.

## Implementation notes & constraints

- **Docs-only. Nothing in `src/` or `tests/` may change**, and no fix for any open
  row may be attempted here. Found something else broken? "Discovered issues".
- **This WP edits one cell of an existing hand-maintained table; it does not
  create one.** Whether `docs/HANDOVER.md`'s audit table should exist at all
  under ADR-0029 is **parked, not answered here** — an owner-visible question,
  raised in the PR body and left open. Nothing in this spec rests on a reading of
  ADR-0029, and an earlier draft's gloss on it ("ADR-0029 forbids only
  frontmatter-derived status tables") is **withdrawn**: it is not what the ADR
  says. The reason Table E's cells drop the five WP slugs is the ordinary
  state-a-fact-once rule, not ADR-0029.
- **Do not trust the 2026-08-05 line citations** in the harvest logbook. This
  spec's own citations were measured at `49d3d467`; V1–V6 depend on none of them.
- **Re-measure; do not transcribe.** If any of V1–V5 disagrees with its Table D
  cell, that is a spec bug: report it and stop.
- **V1–V6 measure TODAY'S STATE; none of them is a closure trigger.** V1 (b),
  V1 (c), V2 (b) and V5 pass *while the defect exists*, which makes them honest
  evidence for Table D and nothing more. A red there is news, not a closure: each
  reddens on a PARTIAL fix (measured, twice — Table E's retired-mechanism
  paragraph). **Do not rewrite any step into a closure assertion**; that is the
  move this spec retired. Never "fix the check".

## Security checklist

- [ ] N/A — this WP writes three documentation files and consumes no untrusted
      input. The untrusted-path reasoning it *records* belongs to
      `WP-dot-segment-denial`, which owns the fix.

## Acceptance criteria

- [ ] **AC1** — V1–V4 pass and the logbook records Table D's verdicts as split:
      **M7 (a) mooted / (b) open / (c) open**, **M9 (a) mooted / (b) open**,
      **M10 mooted**, **C2 own-defense void / env open** — each with the cause
      Table D names, and each retired verdict recorded with its cause rather than
      replaced. **D1 (a)'s wording is part of the criterion: it says the names the
      allowlist ENUMERATES, never "the current names".**
- [ ] **AC2** — V5 passes, the logbook records **C3 OPEN**, and **both** stubs
      exist with `status: Draft`: `WP-dot-segment-denial` with its seven body
      items, naming both enforcement points and both layout validators; and
      `WP-instruction-basename-currency` with its seven, naming `GEMINI.md`,
      `QWEN.md`, `WARP.md`, the maintenance obligation, and the source change to
      `INSTRUCTION_BASENAMES` its matured Deliverables must carry. The logbook
      records **why they are two WPs and not one** (Table D row D1 (c)).
- [ ] **AC2b** — each stub carries its **REQUIRED VERIFICATION** section complete:
      `WP-dot-segment-denial` states the class property, all three enforcement
      points, **held-out** grading and the shipped-enumeration RED mutant;
      `WP-instruction-basename-currency` states the dated inventory as the
      completeness boundary, case-and-depth mapping, accepted omissions, and the
      named owner plus objective trigger. **This is a PRESENCE FLOOR and is
      stated as one:** V6 checks that the obligations are written down, never that
      any of them holds — the outcomes are the successors' to prove. Without it a
      frontmatter-only stub passes (measured).
- [ ] **AC3** — `docs/HANDOVER.md`'s group C row is Table E's cell for the
      recorded state (**E1, four residuals, three owners**), `<LOGBOOK>` resolved,
      the other two cells byte-identical, and **that file changed by exactly one
      line**. Checked by V6 (d).
- [ ] **AC3b** — the logbook records that **E2 is a later disposition act, not a
      trigger**, and reproduces Table E's retired-mechanism paragraph with its
      cause. **No deliverable states a closed-state assertion**, and none implies
      E2 follows from a V-step going red.
- [ ] **AC4** — the logbook names `WP-dream-git-env-pinning` as D2 (b)'s owner
      **and** states that the 2026-08-31 hook ruling
      (`WP-dream-promote-in-workspace` Table W row W1) is *not* reopened.
      Checked by V6 (a).
- [ ] **AC5** — **the literal property V6 (b) checks**, stated as exactly that:
      every line of the logbook containing `harness-refusal` also contains
      `non-load-bearing`, at least one such line exists, and neither the stub nor
      `docs/HANDOVER.md` contains the phrase. **Named limit:** this is a
      lexical check — reliance expressed by a pronoun or a synonym passes it, and
      closing that gap is a reviewer's job, not a grep's.
- [ ] **AC6** — V6 passes end to end with all four deliverables present, including
      `node scripts/check-frontmatter.js`, `npm run lint`, and
      **`node scripts/boundary-check.js <this spec> $(git diff --name-only main...HEAD)`**
      — that script takes mandatory arguments and exits 1 on its usage message
      without them, so the argument-less form can never satisfy this criterion.
      **All three are guarded with `|| { echo "FAIL: …"; exit 1; }` so V6's own
      exit code carries them.** Unguarded, V6's status is `echo "V6 OK"`'s: it
      printed `V6 OK` and exited 0 with a stray `src/STRAY.js` committed and
      boundary-check red (measured, PR #202 round 1).
- [ ] Idempotence — `N/A`: this WP ships no command and writes only inside the repo.

## Verification steps (run these; paste output in the PR)

Run from the repo root; each step exit-codes.

**WHAT THESE STEPS ARE.** They MEASURE TODAY'S STATE, and that is their whole
job: V1 (a), V2 (a), V3 and V4 evidence a *mooted* verdict; V1 (b), V1 (c),
V2 (b) and V5 evidence an *open* one and are therefore **green precisely because
the defect is live**. **None of them is a closure trigger, and none may be
reworded into one** — the samples they carry establish that a residual exists,
never that one is gone. Closure proofs belong to the successors named in Table D,
in the required-verification clauses of their stubs.

**Every step must be observed in all the states its band requires — for V6, the
deliverable-ABSENT state as well as compliant and violating.** How to produce the
violating state is the implementer's to choose; what must be reported is the
state exercised, the command, and its output.

```bash
# V1 — D1, all three halves. (a) is the mooted claim; (b) and (c) pass WHILE THEIR
# DEFECT LIVES. (a) tests only the names the code ENUMERATES, which is why it cannot
# see (c) — the gap round 2 found, kept as the reason the halves are split.
# These lists are SAMPLES that establish the residual is live. They are NOT a
# completeness boundary and must never be read as one: the class proof is
# WP-dot-segment-denial's, the inventory is WP-instruction-basename-currency's.
node -e '
const fs=require("fs"),os=require("os"),path=require("path");
const {makeAdmit}=require("./src/core/dream/promote.js");
const {defaultLayout}=require("./src/core/layout.js");
const {writeIntoVault}=require("./src/core/dream/vault-write.js");
const admit=makeAdmit(defaultLayout());
const base=["CLAUDE.md","AGENTS.md","CLAUDE.local.md","AGENTS.override.md"];  // the ENUMERATED four
const depths=["","06-Identity/","01-Projects/example/","02-Areas/x/y/"];
const leaked=[];
for(const d of depths) for(const b of base) if(admit(d+b)===null) leaked.push(d+b);
if(leaked.length){console.error("(a) BROKEN, admitted: "+leaked.join(", "));process.exit(1);}
console.log("(a) mooted: "+(depths.length*base.length)+" ENUMERATED-basename paths refused at every depth");
const dotted=["01-Projects/example/.github/copilot-instructions.md","01-Projects/example/.husky/pre-commit.md",
  "01-Projects/example/.git/hooks/note.md","06-Identity/.obsidian/x.md","01-Projects/example/.cursor/rules.md"];
const open=dotted.filter(p=>admit(p)===null);
const v=fs.mkdtempSync(path.join(os.tmpdir(),"v1-"));
const resB=writeIntoVault({vaultDir:v,rel:"01-Projects/example/.github/copilot-instructions.md",
  bytes:Buffer.from("x\n"),admit});
console.log("(b) OPEN: "+open.length+"/"+dotted.length+" dot-segment paths admitted beneath a tier; writeIntoVault written="+resB.written);
// (c) carries NO dot-segment path: those belong to (b), and double-counting one
// residual would let each successor assume the other closed it.
// A bare tier-local `copilot-instructions.md` is NOT here: GitHub documents
// `.github/copilot-instructions.md` and `.github/instructions/NAME.instructions.md`,
// both of which the dot rule reaches, so it belongs to (b).
const unenum=["01-Projects/example/GEMINI.md","06-Identity/GEMINI.md","01-Projects/example/QWEN.md",
  "01-Projects/example/WARP.md","01-Projects/example/Gemini.md"];
const openC=unenum.filter(p=>admit(p)===null);
const resC=writeIntoVault({vaultDir:v,rel:"01-Projects/example/QWEN.md",bytes:Buffer.from("x\n"),admit});
const folded=admit("01-Projects/example/ClAuDe.md")!==null;   // enumerated names ARE folded
console.log("(c) OPEN: "+openC.length+"/"+unenum.length+" documented instruction paths admitted (incl. mixed-case Gemini.md); production write of QWEN.md written="+resC.written+"; enumerated ClAuDe.md refused="+folded);
process.exit(open.length===dotted.length&&resB.written===true
          && openC.length===unenum.length&&resC.written===true&&folded?0:1);'

# V2 (a) — D2's mooted half: no `git add`/`git commit` on the dream path, and none pinned.
for f in src/cli/dream.js src/core/dream/validate.js src/core/dream/promote.js \
         tests/unit/dream-pipeline.known-calls.js; do
  test -f "$f" || { echo "MISSING FILE THIS STEP RESTS ON: $f"; exit 1; }
done
if grep -nE "'(add|commit)'[,)]" src/cli/dream.js src/core/dream/validate.js src/core/dream/promote.js; then
  echo "FAIL: a raw git add/commit survives on the dream path"; exit 1
fi
node -e '
const {KNOWN_CALLS}=require("./tests/unit/dream-pipeline.known-calls.js");
const forbidden=new Set(["add","commit","clean","reset","status","stash"]);
const hit=KNOWN_CALLS.flatMap(k=>k.args).filter(x=>typeof x==="string"&&forbidden.has(x));
if(hit.length){console.error("pinned set carries: "+hit.join(","));process.exit(1);}
console.log("(a) pinned set = "+KNOWN_CALLS.length+" shapes, none of: "+[...forbidden].join(" "));'

# V2 (b) — D2's OPEN half, in THREE probes, and Table D's D2 (b) Measured cell is
# exactly their output and nothing wider. (i) an inherited GIT_DIR redirects the
# run's own pinned `hash-object -w --stdin` write away from the vault; (ii) the
# pinned `commit-tree` + `update-ref` pair under the same env ADVANCES THE OTHER
# REPOSITORY'S HEAD while the vault's HEAD stays put; (iii) `GIT_OBJECT_DIRECTORY`
# alone, with GIT_DIR unset, redirects the object write on its own — which is why
# D2 (b)'s owner cell requires a channel ENUMERATION and not a GIT_DIR-only pin.
# Everything happens in mktemp-only scratch repos; the repo tree is untouched.
V=$(mktemp -d); O=$(mktemp -d); IDX=$(mktemp -d)/index
git init -q "$V" && git -C "$V" -c user.email=a@b -c user.name=a commit -q --allow-empty -m vault
git init -q "$O" && git -C "$O" -c user.email=a@b -c user.name=a commit -q --allow-empty -m other
SHA=$(printf payload | GIT_DIR="$O/.git" git -C "$V" hash-object -w --stdin)
git -C "$V" cat-file -e "$SHA" 2>/dev/null && { echo "object landed in the vault — the env residual may have CLOSED; re-measure D2 (b)"; exit 1; }
GIT_DIR="$O/.git" git cat-file -e "$SHA" || { echo "FAIL: object landed nowhere expected"; exit 1; }
echo "(b) OPEN: pinned hash-object wrote into the redirected repo, not the vault ($SHA)"
# (ii) the pinned commit-tree/update-ref pair, same inherited GIT_DIR. The tree
# comes from `write-tree` over a private GIT_INDEX_FILE, as commitNamedSet does.
VB=$(git -C "$V" rev-parse HEAD); OB=$(git -C "$O" rev-parse HEAD)
T=$(GIT_DIR="$O/.git" GIT_INDEX_FILE="$IDX" git -C "$V" write-tree)
C=$(GIT_DIR="$O/.git" git -C "$V" -c user.name=wienerdog -c user.email=wienerdog@localhost commit-tree "$T" -p "$OB" -m probe)
GIT_DIR="$O/.git" git -C "$V" update-ref -m probe HEAD "$C" "$OB" || { echo "FAIL: the pinned update-ref did not run"; exit 1; }
OA=$(git -C "$O" rev-parse HEAD); VA=$(git -C "$V" rev-parse HEAD)
[ "$OA" = "$C" ] && [ "$OA" != "$OB" ] && [ "$VA" = "$VB" ] || { echo "FAIL: the HEAD advance did not reproduce (other $OB->$OA, vault $VB->$VA) — re-measure D2 (b)"; exit 1; }
echo "(b) OPEN: pinned commit-tree+update-ref advanced the other repo's HEAD $OB -> $OA moved=yes; vault HEAD $VB unmoved"
# (iii) GIT_OBJECT_DIRECTORY alone, GIT_DIR explicitly unset for this call.
SHA2=$(printf payload2 | env -u GIT_DIR GIT_OBJECT_DIRECTORY="$O/.git/objects" git -C "$V" hash-object -w --stdin)
git -C "$V" cat-file -e "$SHA2" 2>/dev/null && { echo "FAIL: GIT_OBJECT_DIRECTORY did not redirect — re-measure D2 (b)"; exit 1; }
git -C "$O" cat-file -e "$SHA2" || { echo "FAIL: object landed nowhere expected"; exit 1; }
echo "(b) OPEN: GIT_OBJECT_DIRECTORY alone redirected the pinned hash-object write into the other repo, not the vault ($SHA2)"

# V3 — D3: the classifier has no route to a process spawner. A bare child_process
# grep is insufficient — validate.js reaches git via ../exec-identity.
node -e '
const f=process.argv[1];const s=require("fs").readFileSync(f,"utf8");
const reqs=[...s.matchAll(/require\(\s*["\x27]([^"\x27]+)["\x27]\s*\)/g)].map(m=>m[1]);
const bad=reqs.filter(r=>/child_process|exec-identity/.test(r));
if(bad.length){console.error(f+" reaches a process spawner via: "+bad.join(", "));process.exit(1);}
console.log(f+": requires "+reqs.join(", ")+" — no route to a spawner");
' src/core/dream/delta.js

# V4 — D3: the git status/clean path has no consumer in src/.
if grep -rn 'assertCleanTree\|restoreVaultToHead' src --include='*.js' \
   | grep -v '^src/core/dream/validate.js:'; then
  echo "FAIL: a src/ consumer of the retired git path reappeared"; exit 1
fi
echo "OK: no src/ consumer outside validate.js"

# V5 — D5's OPEN half, BOTH validators. Passes WHILE THE DEFECT LIVES.
node -e '
const fs=require("fs"),os=require("os"),p=require("path");
const {readVaultLayout}=require("./src/core/layout.js");
const {inferLayout}=require("./src/core/layout-infer.js");
const {makeAdmit}=require("./src/core/dream/promote.js");
const d=fs.mkdtempSync(p.join(os.tmpdir(),"c3-"));
const c=p.join(d,"config.yaml"); fs.writeFileSync(c,"vault_layout:\n  projects_dir: .git\n");
const read=readVaultLayout(c);
const vault=fs.mkdtempSync(p.join(os.tmpdir(),"c3v-"));
fs.mkdirSync(p.join(vault,".projects"),{recursive:true});
const inferred=inferLayout(vault);
const admitted=makeAdmit(read)(".git/hooks/note.md")===null;
console.log("reader   readVaultLayout -> projects_dir="+JSON.stringify(read.projects_dir)+"; .git/hooks/note.md admitted="+admitted);
console.log("producer inferLayout     -> projects_dir="+JSON.stringify(inferred.projects_dir));
process.exit(read.projects_dir===".git"&&admitted&&String(inferred.projects_dir).startsWith(".")?0:1);'

# V6 — the deliverables exist, agree with Table D/E, and pass the repo gates.
RULING=E1   # or E2, per Table E — E1 today; E2 is a later act, not this WP's

n=$(ls docs/specs/logbook/*-audit-group-c-disposition.md 2>/dev/null | wc -l | tr -d ' ')
[ "$n" = 1 ] || { echo "FAIL: expected exactly 1 disposition logbook entry, found $n"; exit 1; }
LOG=$(ls docs/specs/logbook/*-audit-group-c-disposition.md)

# (a) AC1 and AC4 — the logbook carries every required fact.
for pat in 'M7' 'M9' 'M10' 'MOOTED' 'OPEN' 'WP-dot-segment-denial' \
           'WP-instruction-basename-currency' 'GEMINI.md' 'QWEN.md' 'WARP.md' \
           'WP-dream-git-env-pinning' 'WP-dream-promote-in-workspace' \
           'Table W row W1' 'not reopened' '2026-08-31'; do
  grep -q "$pat" "$LOG" || { echo "FAIL: logbook entry is missing $pat"; exit 1; }
done

# (b) AC5 — the literal property, nothing wider.
grep -qiE 'harness[- ]refusal' "$LOG" || { echo "FAIL: $LOG never states the honesty rule"; exit 1; }
grep -niE 'harness[- ]refusal' "$LOG" | grep -viq 'non-load-bearing' \
  && { echo "FAIL: $LOG has a harness-refusal line not marked non-load-bearing"; exit 1; }
for f in docs/specs/WP-dot-segment-denial.md docs/specs/WP-instruction-basename-currency.md \
         docs/specs/WP-dream-git-env-pinning.md docs/HANDOVER.md; do
  test -f "$f" || { echo "FAIL: missing required file $f"; exit 1; }
  grep -niE 'harness[- ]refusal' "$f" && { echo "FAIL: $f mentions it"; exit 1; }
done

# (c) AC2 — the stub exists and is Draft.
for stub in docs/specs/WP-dot-segment-denial.md docs/specs/WP-instruction-basename-currency.md; do
  grep -q '^status: Draft' "$stub" || { echo "FAIL: $stub is absent or not Draft"; exit 1; }
  grep -q 'REQUIRED VERIFICATION' "$stub" \
    || { echo "FAIL: $stub carries no REQUIRED VERIFICATION section"; exit 1; }
done
# AC2b, a PRESENCE FLOOR: the obligations must be written down. This asserts that
# each stub SAYS what its proof must establish — never that any of it holds.
# `INSTRUCTION_BASENAMES` is the floor for AC2's source-change clause: without it
# a docs-only currency stub passes, and D1 (c) would stay open after its WP lands.
for pat in 'held-out' 'DENIED_SEGMENTS' 'makeAdmit' 'readVaultLayout' 'inferLayout'; do
  grep -qi "$pat" docs/specs/WP-dot-segment-denial.md \
    || { echo "FAIL: dot-segment stub's required verification is missing $pat"; exit 1; }
done
for pat in 'dated inventory' 'accepted omission' 'owner' 'trigger' 'QWEN' 'WARP' \
           'INSTRUCTION_BASENAMES'; do
  grep -qi "$pat" docs/specs/WP-instruction-basename-currency.md \
    || { echo "FAIL: currency stub's required verification is missing $pat"; exit 1; }
done
grep -q '2026-09-02' docs/specs/WP-dream-git-env-pinning.md \
  && grep -q 'GIT_OBJECT_DIRECTORY' docs/specs/WP-dream-git-env-pinning.md \
  || { echo "FAIL: the env stub's dated channel-set amendment is absent"; exit 1; }

# (d) AC3 — the EXACT substituted row occurs once; HANDOVER changed by one line.
case "$RULING" in
  E1) CELL='**Open — four residuals** — the promote-in family retired M10 and the git-commit half of M9, and the promotion allowlist retired the enumerated instruction basenames; four mechanisms remain live, measured. Basis per finding in `'"$LOG"'`. Owners: `WP-dot-segment-denial`, `WP-instruction-basename-currency`, `WP-dream-git-env-pinning`' ;;
  E2) CELL='**Closed** — every group C mechanism retired or accepted; basis in `'"$LOG"'`. Written by a later disposition act once every successor in that entry'"'"'s Table D is Done with its own verification green' ;;
  *)  echo "FAIL: set RULING to E1 or E2"; exit 1 ;;
esac
ROW="| C | Dream write fence (machinery-controlling files) | $CELL |"
CNT=$(grep -cFx "$ROW" docs/HANDOVER.md)
[ "$CNT" = 1 ] || { echo "FAIL: Table E row $RULING occurs $CNT times in HANDOVER, want exactly 1"; exit 1; }
NS=$(git diff --numstat main -- docs/HANDOVER.md)
[ "$NS" = "$(printf '1\t1\tdocs/HANDOVER.md')" ] \
  || { echo "FAIL: HANDOVER numstat is [$NS], want [1<TAB>1<TAB>docs/HANDOVER.md]"; exit 1; }

# The last three gates carry V6's exit code the same way every check above does.
# Without the `|| { …; exit 1; }` the block's status is `echo`'s, and V6 printed
# `V6 OK` and exited 0 with a stray `src/STRAY.js` committed (measured, PR #202
# round 1) — the false-green class ADR-0042 exists for. `set -e` is deliberately
# NOT used: it would change the semantics of the `[ … ] ||` lines above.
node scripts/check-frontmatter.js || { echo "FAIL: check-frontmatter"; exit 1; }
# boundary-check REQUIRES the spec path AND the changed-file list (no arguments =
# usage, exit 1). The list is built as `.github/workflows/ci.yml` builds it, and
# asserted non-vacuous first: an uncommitted tree yields a list without the
# deliverables and would pass for the wrong reason.
CHANGED=$(git diff --name-only main...HEAD)
# The list must contain THE DELIVERABLES, not merely this spec — the spec is
# already in it from earlier commits. (Measured on an uncommitted fixture.)
# `docs/specs/WP-dream-git-env-pinning.md` is deliberately NOT in this list: its
# amendment landed on main at 93072b1d, so a branch cut from main leaves it out
# of the diff, and its presence is checked above instead.
for d in "$LOG" docs/specs/WP-dot-segment-denial.md \
         docs/specs/WP-instruction-basename-currency.md \
         docs/HANDOVER.md; do
  printf '%s\n' "$CHANGED" | grep -qx "$d" \
    || { echo "FAIL: commit first — $d is absent from the CI-shaped changed-file list"; exit 1; }
done
node scripts/boundary-check.js docs/specs/WP-audit-c-close-disposition.md $CHANGED \
  || { echo "FAIL: boundary-check"; exit 1; }
npm run lint || { echo "FAIL: npm run lint"; exit 1; }
echo "V6 OK (ruling $RULING)"
```

## Out of scope (do NOT do these)

- **Fixing anything.** `WP-dot-segment-denial` owns D1 (b) and D5;
  `WP-instruction-basename-currency` owns D1 (c); `WP-dream-git-env-pinning` owns
  D2 (b). This WP creates the two stubs and stops.
- **Applying Table E row E2, or writing ANY closed-state assertion.** Proving a
  class property belongs to the WP that implements the class rule; two rounds of
  attempts here were retired. Nothing in this spec may pre-judge a successor.
- **Reopening the `reference-transaction` hook ruling** of 2026-08-31, or touching
  `WP-dream-promote-in-workspace` Table W or its Mirrored Surface Checklist.
- **Re-wiring `restoreVaultToHead` or `assertCleanTree`**, or removing either.
- **Answering the parked ADR-0029 question** about `docs/HANDOVER.md`'s table.
- **Dispositioning audit groups D or E** — `WP-audit-d-code-derived-recipients`
  and `WP-audit-e-ledger-parser-corpus`.
- **Rewriting any other row of `docs/HANDOVER.md`**, including its numbered queue.

## Definition of done

0. **DISPATCH PRECONDITION.** Not dispatched until the owner has ruled D1 (b)'s
   severity — queued (recommended) or incident. The dispatch message records it.
   Neither branch changes this WP's deliverables.
1. All verification steps pass locally; output pasted into the PR body, with the
   states each step required.
2. Conventional commits; PR titled
   `docs(specs): disposition audit group C, four residuals open (WP-audit-c-close-disposition)`.
3. PR template filled, including "Decisions made" (or "none"), `Generated-by:`,
   and "Discovered issues" carrying the parked ADR-0029 question.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`, not restated here.
   `In-Review` marks the START of review: this list is complete only when review is.

---
id: WP-audit-c-close-disposition
title: Measure C2 (git seam) and C3 (layout) against the landed promote-in architecture and disposition group C
status: Ready
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
Measured through the production write path: `makeAdmit` admits
`01-Projects/example/GEMINI.md` and `writeIntoVault` **wrote it**
(V1 (c)) — `GEMINI.md` is Gemini CLI's current hierarchical instruction file, and
that path needs no dot segment and no unusual name, only an ordinary project
folder. The dot-segment half (V1 (b)) writes
`01-Projects/example/.github/copilot-instructions.md` the same way. Both are the
class group C exists to deny.

- **(i) QUEUED — the recommendation.** `WP-instruction-basename-currency` and
  `WP-dot-segment-denial` join the queue, currency first. Grounds: the brain must
  choose the path itself, the four ENUMERATED names still hold at every depth
  (V1 (a)), and the vault is the user's own repository.
- **(ii) INCIDENT.** `WP-instruction-basename-currency` jumps the queue as a
  hotfix, and an incident entry is filed against *that* dispatch. Grounds: a
  shipped product writes a current, documented instruction file the audit ruled
  KEEP, by an ordinary path.

**Either way this WP's own deliverables are identical** — it records, it does not
fix, and it files no incident entry of its own. The ruling changes only the
successors' priority; **the dispatch message records it**, and neither branch
touches Table D, E or F.

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
  via `renderLayoutBlock`, and `--yes` skips the confirmation (`:348`).
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

### Exact contracts

**The logbook entry** carries: (1) one paragraph naming the tree measured and the
honesty rule; (2) **Tables D and F reproduced in full** — F because it is E2's
only trigger and outlives this spec; (3) the command output pasted for each of
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

**It is filed as ONE work package covering two enforcement points, and that is a
decision with a stated cause:** the 2026-08-05 ruling's item 3 (config-side)
existed *to make item 1 (path-side) unconditional*. Landing either alone leaves
the class open — which is the exact shape of the defect the round-1 gate found.
It may be split at maturation; it may not be half-landed. Its body states:

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

**Why it is SEPARATE from `WP-dot-segment-denial`, stated because the round-1
gate punished the opposite call.** Those two are one rule split across two
enforcement points, so half-landing either leaves the class open. These are
**two different KINDS of rule** and neither reaches the other: a dot-segment
class rule does not refuse `01-Projects/example/GEMINI.md` (measured — no dot
segment), and a basename list does not refuse `.husky/pre-commit.md`. A class
rule **closes**; an enumeration **never closes** and can only be brought current
and given a standing obligation. Merging them would put an unclosable item
inside a closable WP. Its body states:

1. **The gap, measured.** `INSTRUCTION_BASENAMES` (`promote.js:96`) holds four
   names. Production `makeAdmit` admits `01-Projects/example/GEMINI.md`,
   `06-Identity/GEMINI.md`, `01-Projects/example/copilot-instructions.md` and
   `01-Projects/example/.cursor/rules.md`; the real `writeIntoVault` wrote
   `GEMINI.md`. Reproduce with V1 (c), not from this sentence.
2. **`GEMINI.md` is not a guess.** It is Gemini CLI's documented hierarchical
   instruction file. `copilot-instructions.md` is GitHub Copilot's. **Confirm
   both against current vendor documentation when this WP is picked up** — a
   stale list is exactly the defect being fixed, and a stale citation would
   repeat it.
3. **The list stays a list, and that is the accepted design.** The 2026-08-05
   ruling took item 2 as a name list *with a named residual* because no
   structural marker exists for instruction filenames. This WP does not overturn
   that. **What it adds is the obligation the ruling left implicit: a list nobody
   revisits silently rots**, which is what happened here.
4. **So the deliverable is TWO things, not one.** (i) the names, brought current;
   (ii) a stated maintenance obligation — where it is written down, and what
   event triggers a review. Whether that is a comment, a runbook line or a
   periodic check is this WP's decision to take deliberately.
5. **The residual that remains after this WP, named rather than implied.** A
   genuinely unknown tool's instruction file still passes. That is the ruling's
   own accepted residual and is not reopened.
6. **ADR-0004 bounds the fix**: a name list and a written obligation. Nothing
   that watches, polls or runs.

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
| D1 | **M7** — harness-instruction persistence | the brain writes an instruction file; the fence misses it; it is kept and committed. Item 1 of the fix denied **any dot-prefixed segment**, as a class; item 2 denied instruction filenames as a **name list**, accepted with a named residual | (a) all four ENUMERATED basenames are refused at every depth (16/16). (b) `.github`, `.husky`, `.git`, `.obsidian`, `.cursor` are **admitted beneath an admitted tier** (5/5), and the real `writeIntoVault` with the production `admit` **wrote** `01-Projects/example/.github/copilot-instructions.md`. (c) `GEMINI.md`, `copilot-instructions.md` (tier-local, **no dot segment**) and `.cursor/rules.md` are admitted (4/4), and the production write of `01-Projects/example/GEMINI.md` returned `written:true` | **SPLIT — (a) MOOTED, (b) OPEN, (c) OPEN** | (a) retired by the promote-in inversion: clause (a)+(b) put a vault-**root** instruction file outside the allowlist without enumeration, and `INSTRUCTION_BASENAMES` covers **the four names it enumerates** at any depth. **The claim is scoped to the enumeration and may never be worded as "the current names"** — that wording is what hid (c). (b) **`DENIED_SEGMENTS` (`promote.js:99`) is an ENUMERATION of two names where the ruling required a class**, so item 1 is unmet beneath tiers. Owner: **`WP-dot-segment-denial`**. (c) **`INSTRUCTION_BASENAMES` (`promote.js:96`) is STALE, which is a different defect from being a list.** `GEMINI.md` is Gemini CLI's documented hierarchical instruction file and postdates the list; `copilot-instructions.md` is admitted tier-local, so **the dot-segment fix does not reach either** — (b) and (c) need separate owners. Owner: **`WP-instruction-basename-currency`**. This is NOT the residual accepted at ruling time ("an *unknown* tool's instruction file passes"): these are current, documented conventions. **RETIRED VERDICTS:** this row read MOOTED until round 1, whose evidence tested dot paths only at the vault ROOT, where clause (a) rejects them for being out-of-tier — the probe moved two variables and attributed the refusal to the wrong one. Round 1's replacement then read **(a) MOOTED** on the words "the four current names", which round 2 falsified: the probe enumerated exactly the names the code enumerates, so it could not have failed | V1 |
| D2 | **M9** — git control state inside the write fence | the validator runs `git add`/`git commit` in the vault repo, parent privileges, **unfiltered env**, no `--no-verify`, no neutral hooks path | (a) `validate.js` has no `add`/`commit`; the run never invokes `git commit`; nine pinned shapes carry none of `add commit clean reset status stash`. (b) with an inherited `GIT_DIR`, the pinned `hash-object -w --stdin` wrote its object into the **redirected** repository and not the vault; `commit-tree` + `update-ref` under the same env **advanced the other repository's HEAD** | **SPLIT — (a) MOOTED, (b) OPEN** | (a) retired by `commitNamedSet`: private index + `commit-tree` + `update-ref`, so `--no-verify` has nothing to suppress — the pre-commit/commit-msg path is **structurally absent**, not disabled. (b) the ruled mechanism **names the unfiltered env**, and `commitNamedSet` spreads `process.env` into every call; a scheduled run gets run-job's clean env, a manual `wienerdog dream` inherits the shell. Owner: **`WP-dream-git-env-pinning`** — Draft, **needs an owner product decision and has not landed**. **RETIRED VERDICT:** this row read MOOTED until the round-1 gate, on the reasoning that the env half was "already owned"; **a registered future decision is not a retiring cause**, and that is the general rule this row now carries. **NOT reopened:** the `reference-transaction` hook residual, ruled out of scope by the owner on 2026-08-31 (`WP-dream-promote-in-workspace` Table W row W1, which also rejects `core.hooksPath` suppression by name). **Not a residual:** `assertGitRepo` is a read-only `rev-parse --git-dir` and writes no control state | V2 |
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

**E1 is the recommendation** — with D1 (b), D1 (c), D2 (b) and D5 open, "group C
closes" is not an honest cell. **E2 is pre-written for the day the residuals
land, and its trigger is Table F** — not "the open-evidence steps went red".

| # | State | The Status cell, verbatim |
|---|-------|---------------------------|
| E1 | **open** — recommended today | **Open — four residuals** — the promote-in family retired M10 and the git-commit half of M9, and the promotion allowlist retired the enumerated instruction basenames; four mechanisms remain live, measured. Basis per finding in `<LOGBOOK>`. Owners: `WP-dot-segment-denial`, `WP-instruction-basename-currency`, `WP-dream-git-env-pinning` |
| E2 | **closed** — not yet | **Closed** — every group C mechanism retired or accepted; basis per finding in `<LOGBOOK>`. Apply only when every row of that entry's Table F holds |

### Table F — E2's closure preconditions

**Why this table exists, stated because an earlier draft got it wrong.** E2's
trigger used to be *"V1 (b), V2 (b) and V5 have gone red"*. That is a
**defect-presence conjunction, not a closure proof**: each of those steps exits
non-zero as soon as *any one* of the mechanisms it touches changes. Executed —
with only `makeAdmit` fixed, the reader still returned `projects_dir: ".git"` and
the producer still emitted `".projects"`, yet V5 exited 1. **A partial fix met
the old trigger while D5 stayed live.** So the trigger is now the **expected
CLOSED-state result, per residual, never an arbitrary non-zero exit**.

Each row must hold **independently**; no row may be inferred from another's
result, and "the successor WP merged" is a process fact that satisfies no row.

| # | Residual | The assertion that must hold, with its expected result |
|---|----------|--------------------------------------------------------|
| F1 | D1 (b) — dot segments | Production `makeAdmit` **refuses all five** of V1 (b)'s dotted paths, **and** the real `writeIntoVault` call on `01-Projects/example/.github/copilot-instructions.md` returns `written:false`. Both, by their expected values — not by the step exiting non-zero |
| F2 | D1 (c) — stale basename list | Production `makeAdmit` **refuses all four** of V1 (c)'s paths, **and** the real `writeIntoVault` call on `01-Projects/example/GEMINI.md` returns `written:false`, **and** `WP-instruction-basename-currency`'s own verification is green — the maintenance obligation's shape is that WP's to define, so this clause is a pointer, deliberately, rather than a guess at it |
| F3 | D2 (b) — the git environment | **This row's closed state is not knowable from here**, because `WP-dream-git-env-pinning` is a decision WP whose outcome may be *pin*, *don't pin*, or *pin-with-exceptions*. The trigger is therefore **that WP's own verification green, plus its outcome recorded in its canonical table** — including the *don't-pin* outcome, where the residual is **accepted and named**, not retired. Stating a redirect-refusal assertion here would presume a ruling nobody has made |
| F4 | D5 — layout dot values | `readVaultLayout` on `vault_layout: projects_dir: .git` **does not return `.git`** (rejects or falls back — whichever `WP-dot-segment-denial` rules), **and** `inferLayout` on a vault containing `.projects/` **does not emit a dot-prefixed value**. Both validators, separately: F1 passing says nothing about either |

### Mirrored Surface Checklist

Every surface that mirrors Table D, E or F. A finding updates the table **and**
every mirror below in one pass; a new mirror found in review is registered here
on the spot.

- [ ] **Deliverables-table cells** — the logbook row (mirrors D1–D5 and F1–F4 as
      its content contract), the two stub rows (mirror D1 (b)+D5 and D1 (c), and
      the fact that they are two WPs), the HANDOVER row (mirrors Table E's
      Status-cell-only rule).
- [ ] **Acceptance criteria** — AC1 (D1's three halves and D1 (a)'s *enumerated*
      wording), AC2 (both stubs and their body items), AC3 (Table E's E1 count and
      owners), AC3b (Table F as E2's only trigger), AC4 (D2's residual owners and
      the not-reopened hook ruling), AC5 (the honesty rule's literal property),
      AC6 (boundary-check's mandatory arguments).
- [ ] **Verification commands** — V1 mirrors D1's three halves, V2 mirrors D2/D4's
      two halves, V3 and V4 mirror D3, V5 mirrors D5. **V6 mirrors the most and is
      checked first on any finding**: the Deliverables, Table E's two Status cells
      **verbatim** (via `RULING`), and AC2–AC6. **Table F has no V-step and must
      not acquire one** — its assertions are future states.
- [ ] **Current state** — locations only; it states no verdict, so a verdict
      change must NOT edit it. What it does mirror is the *citation* set — if a
      Table D cell's file or symbol moves, both move.
- [ ] **Operative prose** — the Dispatch precondition (mirrors D1 (b) and D1 (c)'s
      measured cells and their severity), the Context's class-versus-list
      paragraph (mirrors what D1 and D5 measure against), Table F's preamble
      (mirrors the retired conjunction trigger), the Implementation-notes
      open-evidence bullet (mirrors the same), and both stubs' body items.

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
- **The open rows are evidence-bearing.** V1 (b), V1 (c), V2 (b) and V5 pass
  *while the defect exists*. A red there is good news — but it is **not** E2's
  trigger and never was: each of those steps also reddens on a PARTIAL fix
  (measured — see Table F's preamble). Table F is the trigger. Never "fix the
  check".

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
      `WP-instruction-basename-currency` with its six, naming `GEMINI.md`, the
      tier-local `copilot-instructions.md`, and the maintenance obligation. The
      logbook records **why they are two WPs and not one** (Table D row D1 (c)).
- [ ] **AC3** — `docs/HANDOVER.md`'s group C row is Table E's cell for the
      recorded state (**E1, four residuals, three owners**), `<LOGBOOK>` resolved,
      the other two cells byte-identical, and **that file changed by exactly one
      line**. Checked by V6 (d).
- [ ] **AC3b** — the logbook reproduces **Table F**, whose rows are E2's only
      trigger. No deliverable states or implies that E2 follows from an
      open-evidence step going red.
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
- [ ] **AC6** — V6 passes end to end with both stubs present, including
      `node scripts/check-frontmatter.js`, `npm run lint`, and
      **`node scripts/boundary-check.js <this spec> $(git diff --name-only main...HEAD)`**
      — that script takes mandatory arguments and exits 1 on its usage message
      without them, so the argument-less form can never satisfy this criterion.
- [ ] Idempotence — `N/A`: this WP ships no command and writes only inside the repo.

## Verification steps (run these; paste output in the PR)

Run from the repo root; each step exit-codes. **Every step must be observed in
all the states its band requires — for V6, the deliverable-ABSENT state as well
as compliant and violating.** How to produce the violating state is the
implementer's to choose; what must be reported is the state exercised, the
command, and its output.

```bash
# V1 — D1, all three halves. (a) is the mooted claim; (b) and (c) pass WHILE THEIR
# DEFECT LIVES. (a) tests only the names the code ENUMERATES, which is why it cannot
# see (c) — that is the gap round 2 found, kept here as the reason the halves are split.
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
const unenum=["01-Projects/example/GEMINI.md","06-Identity/GEMINI.md",
  "01-Projects/example/copilot-instructions.md","01-Projects/example/.cursor/rules.md"];
const openC=unenum.filter(p=>admit(p)===null);
const resC=writeIntoVault({vaultDir:v,rel:"01-Projects/example/GEMINI.md",bytes:Buffer.from("x\n"),admit});
console.log("(c) OPEN: "+openC.length+"/"+unenum.length+" current-but-unenumerated instruction paths admitted; production write of GEMINI.md written="+resC.written);
process.exit(open.length===dotted.length&&resB.written===true
          && openC.length===unenum.length&&resC.written===true?0:1);'

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

# V2 (b) — D2's OPEN half. Passes WHILE THE DEFECT LIVES: an inherited GIT_DIR
# redirects the run's own pinned write shape away from the vault.
V=$(mktemp -d); O=$(mktemp -d)
git init -q "$V" && git -C "$V" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init
git init -q "$O" && git -C "$O" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init
SHA=$(printf payload | GIT_DIR="$O/.git" git -C "$V" hash-object -w --stdin)
git -C "$V" cat-file -e "$SHA" 2>/dev/null && { echo "object landed in the vault — the env residual may have CLOSED; re-measure D2 (b)"; exit 1; }
GIT_DIR="$O/.git" git cat-file -e "$SHA" || { echo "FAIL: object landed nowhere expected"; exit 1; }
echo "(b) OPEN: pinned hash-object wrote into the redirected repo, not the vault ($SHA)"

# V3 — D3: the classifier has no route to a process spawner. A bare child_process
# grep is NOT sufficient (validate.js spawns git via ../exec-identity and reads green).
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
RULING=E1   # or E2, per Table E — E1 until every Table F row holds

n=$(ls docs/specs/logbook/*-audit-group-c-disposition.md 2>/dev/null | wc -l | tr -d ' ')
[ "$n" = 1 ] || { echo "FAIL: expected exactly 1 disposition logbook entry, found $n"; exit 1; }
LOG=$(ls docs/specs/logbook/*-audit-group-c-disposition.md)

# (a) AC1 and AC4 — the logbook carries every required fact.
for pat in 'M7' 'M9' 'M10' 'MOOTED' 'OPEN' 'WP-dot-segment-denial' \
           'WP-instruction-basename-currency' 'GEMINI.md' 'Table F' \
           'WP-dream-git-env-pinning' 'WP-dream-promote-in-workspace' \
           'Table W row W1' 'not reopened' '2026-08-31'; do
  grep -q "$pat" "$LOG" || { echo "FAIL: logbook entry is missing $pat"; exit 1; }
done

# (b) AC5 — the literal property, and nothing wider than it.
grep -qiE 'harness[- ]refusal' "$LOG" || { echo "FAIL: $LOG never states the honesty rule"; exit 1; }
grep -niE 'harness[- ]refusal' "$LOG" | grep -viq 'non-load-bearing' \
  && { echo "FAIL: $LOG has a harness-refusal line not marked non-load-bearing"; exit 1; }
for f in docs/specs/WP-dot-segment-denial.md docs/specs/WP-instruction-basename-currency.md \
         docs/HANDOVER.md; do
  test -f "$f" || { echo "FAIL: missing deliverable $f"; exit 1; }
  grep -niE 'harness[- ]refusal' "$f" && { echo "FAIL: $f mentions it"; exit 1; }
done

# (c) AC2 — the stub exists and is Draft.
for stub in docs/specs/WP-dot-segment-denial.md docs/specs/WP-instruction-basename-currency.md; do
  grep -q '^status: Draft' "$stub" || { echo "FAIL: $stub is absent or not Draft"; exit 1; }
done

# (d) AC3 — the EXACT, fully substituted row occurs exactly once, and HANDOVER
#     changed by exactly one line with no other hunk.
case "$RULING" in
  E1) CELL='**Open — four residuals** — the promote-in family retired M10 and the git-commit half of M9, and the promotion allowlist retired the enumerated instruction basenames; four mechanisms remain live, measured. Basis per finding in `'"$LOG"'`. Owners: `WP-dot-segment-denial`, `WP-instruction-basename-currency`, `WP-dream-git-env-pinning`' ;;
  E2) CELL='**Closed** — every group C mechanism retired or accepted; basis per finding in `'"$LOG"'`. Apply only when every row of that entry'"'"'s Table F holds' ;;
  *)  echo "FAIL: set RULING to E1 or E2"; exit 1 ;;
esac
ROW="| C | Dream write fence (machinery-controlling files) | $CELL |"
CNT=$(grep -cFx "$ROW" docs/HANDOVER.md)
[ "$CNT" = 1 ] || { echo "FAIL: Table E row $RULING occurs $CNT times in HANDOVER, want exactly 1"; exit 1; }
NS=$(git diff --numstat main -- docs/HANDOVER.md)
[ "$NS" = "$(printf '1\t1\tdocs/HANDOVER.md')" ] \
  || { echo "FAIL: HANDOVER numstat is [$NS], want [1<TAB>1<TAB>docs/HANDOVER.md]"; exit 1; }

node scripts/check-frontmatter.js
# boundary-check REQUIRES the spec path AND the changed-file list; with no arguments
# it prints its usage and exits 1, so an argument-less call can never pass. The list
# is built the way `.github/workflows/ci.yml` builds it (three-dot, committed work) —
# and asserted non-vacuous first, because an uncommitted tree yields a list that does
# not contain the deliverables and would pass this check for the wrong reason.
CHANGED=$(git diff --name-only main...HEAD)
# Non-vacuity: the list must contain THE DELIVERABLES, not merely this spec. Checking
# only the spec is not enough — it is already in the list from this WP's earlier
# commits, so boundary-check would run over a list holding none of the new files and
# pass for the wrong reason. (Measured on a compliant-but-uncommitted fixture.)
for d in "$LOG" docs/specs/WP-dot-segment-denial.md \
         docs/specs/WP-instruction-basename-currency.md docs/HANDOVER.md; do
  printf '%s\n' "$CHANGED" | grep -qx "$d" \
    || { echo "FAIL: commit first — $d is absent from the CI-shaped changed-file list"; exit 1; }
done
node scripts/boundary-check.js docs/specs/WP-audit-c-close-disposition.md $CHANGED
npm run lint
echo "V6 OK (ruling $RULING)"
```

## Out of scope (do NOT do these)

- **Fixing anything.** `WP-dot-segment-denial` owns D1 (b) and D5;
  `WP-instruction-basename-currency` owns D1 (c); `WP-dream-git-env-pinning` owns
  D2 (b). This WP creates the two stubs and stops.
- **Applying Table E row E2, or asserting any Table F row.** F's assertions are
  future states; nothing here may run or pre-judge them.
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

---
title: Audit group C disposition — C2 (git seam) and C3 (layout) measured, recorded
date: 2026-09-02
related_wps: [WP-audit-c-close-disposition, WP-dot-segment-denial, WP-instruction-basename-currency, WP-dream-git-env-pinning]
---

<!-- markdownlint-disable -->

# 2026-09-02 — audit group C disposition: C2 and C3 measured against the landed promote-in architecture

## 1. Tree measured, and the honesty rule

This entry's Table D verdicts, and every V1–V5 output pasted below, were
measured on commit `5c90419c` of branch `wp/audit-c-close-disposition`
(tip at the time of measurement; the spec's own dispatch-time reconciliation
and round-5 gate raws are already folded into that tip). **Honesty rule,
inherited from the 2026-08-05 ruling and binding here:** the archive's
harness-refusal measurement for `.git` writes is explicitly ruled non-load-bearing — it rests on unverified third-party behaviour this project neither owns nor tests, and no disposition below rests on it; every Table D cell rests instead on a command in the Verification steps pasted in section 3.

## 2. Table D — the disposition of audit group C (reproduced from the spec; this entry is now its authority)

The single place every disposition fact is decided. A **mooted** row names what
retired the mechanism; an **open** row names the WP that owns it. Every measured
cell is the output of the step in its last column, and of nothing else.
**Rows D1 and D2 were MOOTED before the round-1 gate; both were reproduced live
and split. The retired verdicts are recorded here, with their cause, rather than
quietly replaced.**

| # | Finding | Mechanism, as ruled 2026-08-05 | Measured | Verdict | Cause / owner | Step |
|---|---------|--------------------------------|----------|---------|---------------|------|
| D1 | **M7** — harness-instruction persistence | the brain writes an instruction file; the fence misses it; it is kept and committed. Item 1 of the fix denied **any dot-prefixed segment**, as a class; item 2 denied instruction filenames as a **name list**, accepted with a named residual | (a) all four ENUMERATED basenames are refused at every depth (16/16). (b) `.github`, `.husky`, `.git`, `.obsidian`, `.cursor` are **admitted beneath an admitted tier** (5/5), and the real `writeIntoVault` with the production `admit` **wrote** `01-Projects/example/.github/copilot-instructions.md`. (c) `GEMINI.md`, `QWEN.md`, `WARP.md` and `copilot-instructions.md` — all tier-local, **no dot segment** — are admitted and were **written** through the production path; mixed-case `Gemini.md` is admitted while the enumerated `ClAuDe.md` is refused | **SPLIT — (a) MOOTED, (b) OPEN, (c) OPEN** | (a) retired by the promote-in inversion: clause (a)+(b) put a vault-**root** instruction file outside the allowlist without enumeration, and `INSTRUCTION_BASENAMES` covers **the four names it enumerates** at any depth. **The claim is scoped to the enumeration and may never be worded as "the current names"** — that wording is what hid (c). (b) **`DENIED_SEGMENTS` (`promote.js:99`) is an ENUMERATION of two names where the ruling required a class**, so item 1 is unmet beneath tiers. Owner: **`WP-dot-segment-denial`**, which must prove the predicate **as a class**, with anti-enumeration evidence (its stub's required verification; the reason is Table E's retirement paragraph, not restated here). (c) **`INSTRUCTION_BASENAMES` (`promote.js:96`) is STALE, which is a different defect from being a list.** `GEMINI.md` is Gemini CLI's documented hierarchical instruction file and postdates the list; `copilot-instructions.md` is admitted tier-local, so **the dot-segment fix does not reach either** — (b) and (c) need separate owners. Owner: **`WP-instruction-basename-currency`**, whose required verification is a **dated inventory** rather than a longer list (its stub; cause in Table E's retirement paragraph). This is NOT the residual accepted at ruling time ("an *unknown* tool's instruction file passes"): these are current, documented conventions. **`.cursor/rules.md` is NOT in this row** — its basename is merely `rules.md`, so only the dot rule reaches it and it belongs wholly to (b). **RETIRED VERDICTS:** this row read MOOTED until round 1, whose evidence tested dot paths only at the vault ROOT, where clause (a) rejects them for being out-of-tier — the probe moved two variables and attributed the refusal to the wrong one. Round 1's replacement then read **(a) MOOTED** on the words "the four current names", which round 2 falsified: the probe enumerated exactly the names the code enumerates, so it could not have failed | V1 |
| D2 | **M9** — git control state inside the write fence | the validator runs `git add`/`git commit` in the vault repo, parent privileges, **unfiltered env**, no `--no-verify`, no neutral hooks path | (a) `validate.js` has no `add`/`commit`; the run never invokes `git commit`; nine pinned shapes carry none of `add commit clean reset status stash`. (b) with an inherited `GIT_DIR`, the pinned `hash-object -w --stdin` wrote its object into the **redirected** repository and not the vault; `commit-tree` + `update-ref` under the same env **advanced the other repository's HEAD** | **SPLIT — (a) MOOTED, (b) OPEN** | (a) retired by `commitNamedSet`: private index + `commit-tree` + `update-ref`, so `--no-verify` has nothing to suppress — the pre-commit/commit-msg path is **structurally absent**, not disabled. (b) the ruled mechanism **names the unfiltered env**, and `commitNamedSet` spreads `process.env` into every call; a scheduled run gets run-job's clean env, a manual `wienerdog dream` inherits the shell. Owner: **`WP-dream-git-env-pinning`** — Draft, **needs an owner product decision and has not landed**. **The requirement now lives in THAT WP's own done-contract** (its dated 2026-09-02 amendment, landed on `main` at commit `93072b1d`, not a Deliverable of this WP) — because E2's pointer trusts each successor's own green, and a requirement recorded only here would not reach it. What that amendment obliges: its canonical table must **enumerate every inherited write-target and config channel the pinned shapes honour** — at least `GIT_DIR`, `GIT_WORK_TREE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_CONFIG_*`, `GIT_NAMESPACE`, and `GIT_INDEX_FILE` (already ours) — so that *pin*, *pin-with-exceptions* and *don't-pin* each name their channel set. **Measured, and this is why the enumeration is the requirement:** with `GIT_DIR` unset, an inherited `GIT_OBJECT_DIRECTORY` alone redirected the pinned `hash-object -w --stdin` write out of the vault — so a `GIT_DIR`-only pin would report success while the mechanism stayed live. **Neither this row nor the amendment asserts an outcome:** *don't-pin* is a legitimate ruling in which the residual is accepted and named, not retired — the amendment adds an obligation, not a verdict. **RETIRED VERDICT:** this row read MOOTED until the round-1 gate, on the reasoning that the env half was "already owned"; **a registered future decision is not a retiring cause**, and that is the general rule this row now carries. **NOT reopened:** the `reference-transaction` hook residual, ruled out of scope by the owner on 2026-08-31 (`WP-dream-promote-in-workspace` Table W row W1, which also rejects `core.hooksPath` suppression by name). **Not a residual:** `assertGitRepo` is a read-only `rev-parse --git-dir` and writes no control state | V2 |
| D3 | **M10** — the gitignored/invisible region | `git status … -uall` without `--ignored` classifies; `git clean -fd` (not `-x`) cleans; a dream-written `.gitignore` blinds both | `delta.js` requires only `node:fs`, `node:path`, `../errors` — no route to a process spawner. `assertCleanTree` and `restoreVaultToHead` have no `src/` consumer | **MOOTED** | Retired by the **git-free classifier**: `computeDelta` is a filesystem walk that never consults git, so an ignore file has nothing to blind — **absent, not defeated**, and unaffected by D1's open halves (neither a dot-segment nor an unenumerated-instruction write restores a git dependency the classifier no longer has). **Standing-discipline note:** `restoreVaultToHead`'s `clean -fd` still exists, exported for fixtures and unreachable from `src/`; a future WP that re-wires it re-opens M10's `-fd`-not-`-x` question and must re-run V3 and V4 | V3, V4 |
| D4 | **C2** — the git seam | ruling item 4: give the seam its own third-party-independent defense — `--no-verify` and a neutralized hooks path | follows D2 exactly | **SPLIT — own-defense half VOID, env half OPEN** | The `--no-verify`/hooks-path half is void by construction: there is no `git commit` to harden. The environment half is D2 (b), OPEN, owned by `WP-dream-git-env-pinning`. **RETIRED VERDICT:** this row read MOOTED with *"nothing new is owed"*; that sentence is **withdrawn** — the seam still owes an independent, constructed environment | V2 |
| D5 | **C3** — layout | ruling item 3: reject dot-prefixed layout values in `isSafeRelativePath`, so the item-1 write rule is unconditional | `readVaultLayout` returns `projects_dir: .git` unchanged and `makeAdmit` on that layout admits `.git/hooks/note.md`; the **copied** `layout-infer.js` validator has the same gap, and `inferLayout` on a vault holding `.projects/` produced `projects_dir: ".projects"` | **OPEN** | Owner: **`WP-dot-segment-denial`** — the same WP as D1 (b), because item 3 exists to make item 1 unconditional and half-landing either leaves the class open. **Widened at round 1:** the finding is not one condition at one site — it is two validators, one of which (`layout-infer.js`, reached by `adopt --yes`) is a **producer**, so the dot value is not solely the user's | V5 |

## Table E's retired-mechanism paragraph (reproduced from the spec, verbatim, because this lesson outlives this WP)

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

**Also carried forward here, verbatim, because it is not reopened:** the
`reference-transaction` hook residual was ruled out of scope by the owner on
2026-08-31 (`WP-dream-promote-in-workspace` Table W row W1, which also rejects
`core.hooksPath` suppression by name) — that ruling is **not reopened** by
this disposition.

## 3. Verification output — V1 through V5, run on `5c90419c`

### V1 — D1, all three halves

```
(a) mooted: 16 ENUMERATED-basename paths refused at every depth
(b) OPEN: 5/5 dot-segment paths admitted beneath a tier; writeIntoVault written=true
(c) OPEN: 6/6 documented instruction paths admitted (incl. mixed-case Gemini.md); production write of QWEN.md written=true; enumerated ClAuDe.md refused=true
```
rc=0

### V2 (a) — D2's mooted half

```
(a) pinned set = 9 shapes, none of: add commit clean reset status stash
```
rc=0

### V2 (b) — D2's OPEN half

```
(b) OPEN: pinned hash-object wrote into the redirected repo, not the vault (47d05ff6403c8e6c3cf635ea6eb9263738432773)
```
rc=0

### V3 — D3, the classifier has no route to a process spawner

```
src/core/dream/delta.js: requires node:fs, node:path, ../errors — no route to a spawner
```
rc=0

### V4 — D3, no `src/` consumer of the retired git path

```
OK: no src/ consumer outside validate.js
```
rc=0

### V5 — D5's OPEN half, both validators

```
reader   readVaultLayout -> projects_dir=".git"; .git/hooks/note.md admitted=true
producer inferLayout     -> projects_dir=".projects"
```
rc=0

All five measurements agree with Table D above; none disagreed with the table,
so none is reported as a spec bug.

## 4. Dispatch precondition's severity ruling, quoted verbatim, dated 2026-09-02

From `docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md` (PR #201
branch `docs/owner-rulings-2026-09-02`, not yet on `main` at the time this
entry is written), item 3:

> ## 3. `WP-audit-c-close-disposition` (PR #199) — severity call
>
> Question: are Table D row D1's open halves (dot-prefixed segments beneath
> admitted tiers are promotable; the instruction-file basename list is a stale
> enumeration of four) a queued work package, option (i), or an incident with a
> hotfix, option (ii)? The spec recommended (i).
>
> ```text
> 3) go with your recommendation
> ```
>
> **Ruled: option (i), QUEUED.** `WP-instruction-basename-currency` joins the
> queue first and `WP-dot-segment-denial` immediately after it, in the normal
> order; no incident entry is filed; no hotfix jumps the queue. Group C's
> disposition stays **Open — residuals** as Table D records. The third live
> mechanism (inherited `GIT_DIR` / `GIT_OBJECT_DIRECTORY` redirecting the run's
> writes) stays with Draft `WP-dream-git-env-pinning`, whose product decision is
> still open and is not ruled here.

The disposition this entry records is a finding of fact, not the closure this
spec's earlier drafts carried: group C is **Open — residuals** (Table E row
E1, `RULING=E1`). The severity call above governs only the two successors'
place in the queue and files no incident entry and no hotfix.

## 5. Table E — the group C row, and why E2 is a pointer, not an assertion

**E1 is the recorded state.** With D1 (b), D1 (c), D2 (b) and D5 open, "group C
closes" is not an honest cell.

**E2 is a pointer to a later disposition act, not a pre-written closed-state
assertion.** Group C closes by a later disposition act, taken when every
successor named in Table D above is Done and that successor's own verification
is green. This entry pre-writes no closed-state assertion and acquires none:
where a successor's done-contract was narrower than the residual it owns, the
fix is to amend that contract rather than assert the proof here — which is why
`WP-dream-git-env-pinning` carries its dated 2026-09-02 channel-set amendment,
landed on `main` at commit `93072b1d` ahead of dispatch, rather than left as
work for this WP's implementer.

## 6. Why the currency and dot-segment residuals are two work packages, not one (Table D row D1 (c))

A dot-segment rule does not refuse `01-Projects/example/GEMINI.md` (measured —
no dot segment), and a basename list does not refuse `.husky/pre-commit.md`. A
class rule closes; an enumeration never closes. `WP-dot-segment-denial` owns
D1 (b) and D5, the class rule across both enforcement points (segment-level
admission and both layout validators), where half-landing either leaves the
class open. `WP-instruction-basename-currency` owns D1 (c), a dated inventory
with a maintenance obligation — GEMINI.md, QWEN.md, WARP.md and tier-local
copilot-instructions.md are documented, current conventions the enumerated
four-name list has fallen behind, and the fix is not the dot rule's to make.
Merging them would put an unclosable item (the basename list, which never
closes) inside a closable WP (the class rule, which can).

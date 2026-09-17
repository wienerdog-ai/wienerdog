---
date: 2026-09-17
title: "Design-gate rounds: WP-dream-digest-omits-own-job-alerts"
related_wps: [WP-dream-digest-omits-own-job-alerts, WP-dream-lock-stale-owner-loud]
---

# Design-gate rounds — WP-dream-digest-omits-own-job-alerts

Round zero (the architect's own re-derivation, coherence pass and both-directions
gate proofs) and the clean-context template-conformance result are in
`2026-09-17-dream-digest-omits-own-job-alerts-round-zero.md`. This file carries
the external adversarial rounds.

## Round 1 — independent design gate

| Field | Value |
|-------|-------|
| Tip reviewed | `a2bc4afe55817bd24db6bfe197d3cf755eb27ab9` |
| Base | `047a202c1ada70ab44bd24a21157854441d987a2` |
| Raw output | `docs/specs/logbook/2026-09-17-dream-digest-omits-design-r1-raw.json`, committed in **`a86b09d8`** before adjudication |
| Focus / meta | `…-design-r1-focus.txt`, `…-design-r1-meta.txt`, same commit |
| Verdict | `needs-attention`, 3 findings (2 high, 1 medium) |
| Read-only check | `git status --porcelain` identical before and after (meta) |
| Tests executed by the reviewer | **none** — the reviewer's own `not_executed` field says the verdict is document/source tracing plus lint and static checks. Recorded here because a verdict whose tests did not run is a reading and must say so |

The raw file was committed before anyone read or judged it, and this record cites
the commit that introduced it, per `docs/runbooks/codex-review.md`.

### Findings, bands, weight, dispositions

Bands grade CONSEQUENCE (A: silent wrong behaviour with a data-loss or security
consequence; B: caught downstream; C: hygiene). LIGHT/HEAVY grades whether the
FIX changes what the implementer builds in the product. The two are orthogonal.

| # | Band | Weight | Finding | Disposition | Rationale and what changed |
|---|------|--------|---------|-------------|----------------------------|
| R1-F2 | **A** | **HEAVY** | The shared filter hides an unresolved prior failure before this run is known to succeed: render site 1 (`src/cli/dream.js:724`) precedes the no-complete-session throw (`:737-742`), the step-8b containment halt and every brain failure, so filtering there deletes a genuine warning from a run that then fails. AC5 as written REQUIRED that unsafe early filtering, and AC7 checked only `alerts.jsonl` | **FIX** | The defect is real and is the worst class this WP could ship: a true failure turned invisible in the surface every session reads. Table A gains **THE PRINCIPLE** (*when in doubt the stale callout is shown; a genuine one is never hidden*), **When it may omit** (only at the final render, the first point at which this process's work has succeeded), a rewritten **Where applied** (the closure takes a per-call flag whose DEFAULT IS UNFILTERED; exactly one site passes the filtering value), **Late in-process failure** (exactly one unfiltered re-render before the error propagates; if that re-render throws, the ORIGINAL error wins) and **Out-of-process failure (B1/B2)** as the one named narrowing. Old AC5 is deleted; AC6a-AC6d assert DIGEST CONTENT together with `alerts.jsonl` on the four paths the finding names; AC7 asserts the recovery render |
| R1-F1 | **A** | **HEAVY** | The config cross-check establishes that a job NAME is plausible, not that this process is the child whose success will resolve the alert: an inherited `WIENERDOG_JOB=dream` passes whenever the normal dream job exists, with no hostile actor required | **NARROW + named residual** | Investigated the existing supervisor-issued per-run channel and **adopted it**: `WIENERDOG_DREAM_RUN_TOKEN` is now a required second conjunct. It costs zero new surface (see "Does the run token fit?" below). It does **not** close the finding — possession is not parentage — so O1 carries the remainder as an explicit, unresolved residual with the post-F2 blast radius stated, and O1's overrule cost is rewritten. New **AC5** is the reviewer's requested test: a valid `WIENERDOG_JOB` with no valid token still renders the callout |
| R1-F3 | **B** | **LIGHT** | The `dream-digest-filter-unconditional` declaration claimed to prove the cross-check but named AC3, which runs with `WIENERDOG_JOB` absent — a wrong implementation that filters whenever the variable is set passes AC3 and fails AC4, so the gate proved a different property than it claimed | **FIX** | Verification machinery only. Table C is rebuilt on **one rule per mutation**: `…-ignores-config` breaks ONLY the `findJob`/`run` conjunct and must redden **AC4** exactly; `…-always-on` breaks both environment conditionals and reddens AC3; `…-ignores-run-token` breaks only the token conjunct (AC5); `…-at-early-render` breaks only the placement rule (AC6a); `…-no-recovery-render` breaks only the recovery render (AC7); `…-removed` stays on AC1. Six declarations, each guarding one product behaviour this round identified — the surface grew only where a behaviour needed guarding |

**Weighted closure.** R1-F1 and R1-F2 are HEAVY, so a full fresh external round
is owed on the revised tip. R1-F3 is LIGHT and verified mechanically (V6 re-run
below, mirror walk completed in the same commit). No finding was dropped and none
was accepted as a residual without being written into the spec.

### Does the run token fit? Measured at both ends

| Question | Answer |
|----------|--------|
| Where is it minted? | `src/cli/run-job.js` l.934-938, inside `runJob`, onto the same `env` object `buildCleanEnv` returned at l.917 — the object `spawn` (l.1036) hands the child. `WIENERDOG_JOB` and the token therefore arrive together |
| Is it set under `--catch-up`? | **Yes.** `catchUp` (l.1340) runs due jobs through `const doRun = opts.runJob \|\| runJob;` (l.1398) → `await doRun(paths, job, opts)` (l.1411). Same `runJob`, same mint. There is no catch-up-only path that skips it |
| Is it set on every platform? | **No.** l.934's guard is `job.run === 'builtin:dream' && platform !== 'win32'`, a deliberate A10 scope limit whose own comment defers the rest to `WP-a10-windows-reap`. **No token on win32 → the omission never engages there**, leaving today's behaviour. Safe direction, and stated in Table A rather than discovered later |
| What validation does dream already apply? | `src/cli/dream.js` l.827-828: `typeof rawToken === 'string' && /^[a-f0-9]{16}$/.test(rawToken)`, anything else treated as absent. Table A **re-applies** that predicate at the render; it does not re-invent one, and the l.827-828 read is not moved |
| Does it prove parentage? | **No, and the spec says so.** Dream holds no prior copy of the token, and the hand-up pidfile named after it does not exist yet at render time, so the check is shape-and-presence — possession. A process inheriting both variables still passes. That is O1's residual (a) |

**Verdict: it fits, and it is adopted.** Zero new surface, strictly narrower than
round 1's design, fail-safe in every refusing direction, and never inert on the
supervised POSIX path.

### Mechanical re-verification after the fixes

V6's `want` array is the literal mirror of Table C's id column, so it was re-run
in all three states after the column changed:

| State | Expected | Observed |
|-------|----------|----------|
| compliant (six ids, correct suite) | rc 0 | **rc 0**, ids printed in sorted order |
| violating (one id renamed to `dream-digest-filter-gone`) | rc 1 | **rc 1** |
| absent (declaration file missing) | non-zero | **rc 1** |

V3, V4 and V5 are unchanged by this round and their round-zero both-directions
results still stand. `npm run lint` passes; `git diff --check` is clean.

### Mirror walk (ADR-0031, same commit)

Every registered mirror was updated in the commit that changed the tables, and
two new mirrors were registered on the spot: **(j)** Table B's *Replacement*
sentence, which describes when dream.js drops records and now says "at its FINAL
render only … has just established"; and **(k)** the Context section's closing
paragraph, which argues the fix from the step-19 comment and therefore asserts
*When it may omit* — it gained a new paragraph stating that the same sentence
BOUNDS the fix to one render. The operative-prose bullet went from nine steps to
eleven. Deliverables' `dream.js` cell, the Current-state run-token bullet, the
acceptance criteria, V6, the Security checklist's items 1 and 3, O1 and the
Implementation-notes residual were all updated in the same pass.

**Nothing in this round was ruled on by the owner.** O1 and O2 remain open; the
only ruling on record is still the 2026-09-10 maintainer ruling about the
managed-policy-warning follow-up's ordering.

## Round 2 — independent design gate

| Field | Value |
|-------|-------|
| Tip reviewed | `d7d50c0f3d8b4188bd81a337a0912753d6902564` |
| Base | `047a202c1ada70ab44bd24a21157854441d987a2` |
| Raw output | `docs/specs/logbook/2026-09-17-dream-digest-omits-design-r2-raw.json`, committed in **`ce5180c7`** (now `2eeba955` after the rebase onto `545df8bd`) before adjudication |
| Focus / meta | `…-design-r2-focus.txt`, `…-design-r2-meta.txt`, same commit |
| Verdict | `needs-attention`, 2 new findings (1 high, 1 medium) |
| Round-1 findings | **all three confirmed substantively fixed** by the reviewer: AC5 covers inherited `WIENERDOG_JOB` without a valid token, catch-up uses the token-minting `runJob` path, Windows is explicitly left unchanged, only step 19 filters, AC6a-d assert digest content, and the config-removal mutation targets AC4 |
| Tests executed by the reviewer | **none** — its own `not_executed` field says the tip is document-only and the conclusions are source/control-flow tracing. Recorded because a verdict whose tests did not run is a reading |

### Findings, bands, weight, dispositions

| # | Band | Weight | Finding | Disposition | Rationale and what changed |
|---|------|--------|---------|-------------|----------------------------|
| R2-1 | **A** | **HEAVY** | The B1/B2-only narrowing omits ordinary job failures and has no finite bound. `run-job` records a normal dream-body failure only after the child exits (l.1251 watermark → l.1257 `failLoud` → l.1269 throw), so a failing run makes no render that could show the fresh record; and the advertised recovery bound is not finite, because l.724 is conditional on `newlyQuarantined`, `sync` is attended-only, and every later successful step-19 render filters the job again | **FIX THE CLAIM; no new mechanism** | The trace is correct and was re-verified here against `run-job.js` l.1226-1269 and `failLoud`'s append at l.715. What it describes is a **pre-existing property of the product**, not something this WP introduces — and the display it removes is the after-the-fact one the 2026-09-10 bug report was filed about. Round 1's two claims (B1/B2 are the sole narrowing; the exposure is bounded by "the next unfiltered render") are **WITHDRAWN in the text**, and replaced by a new Table A row, *What reaches the digest for the dream's OWN failures*, plus a rewritten *Out-of-process failures are ONE class* row. THE PRINCIPLE row was re-scoped to what a `dream.js` render can govern. New Current-state facts: the ordinary failure path's three line cites, and the measured fact that **`doctor` reads no alerts**. New **AC6e** pins the end-to-end behaviour from a clean digest. New owner item **O3** puts the acceptability question to the owner with recommendation and overrule cost. No mechanism was added — the reviewer's alternative (a supervisor-side render) is rejected alternative A, prohibited by WP-041 |
| R2-2 | **B** | LIGHT→**HEAVY** | A failed recovery render is swallowed and leaves no diagnostic: the atomic writer preserves the previous FILTERED digest, run-job then appends the genuine failure, and the user gets neither the callout nor any sign that restoration failed | **FIX** | Graded HEAVY because the fix changes observable product output (a new stderr line), even though it originates as a diagnostic gap. Table A's *Late in-process failure* row now requires: original exception still propagates; the recovery exception reported separately as **exactly ONE fixed-text stderr line** with **no interpolation** of exception, record, config or path bytes (this WP opens no new channel for untrusted bytes to a user-facing surface); plain language per CLAUDE.md. The inability to restore is named as its own residual. **AC7 split into AC7a/AC7b**, where AC7b injects a recovery-render failure and asserts all three: original error wins, diagnostic printed, digest unchanged in its filtered state |

**Weighted closure.** Both fixes touch what the implementer builds, so a further
fresh external round is owed on the revised tip. No finding was dropped; neither
was accepted as a residual without being written into the spec.

### Citation corrections the reviewer measured

Both were in Table A's *Supervisor correlate* row only; the Current-state bullet
was already correct.

| Was | Is | Checked |
|-----|----|---------|
| `buildCleanEnv` returned at l.916 | **l.917** | `const env = buildCleanEnv(paths, name, platform);` — note a second `buildCleanEnv` call exists at l.577, which is why the number matters |
| token minted at l.936 | **l.934-938**, with `crypto.randomBytes(8).toString('hex')` at **l.935** and the export at **l.936** | both ends of the range re-checked: l.934 is the `if`, l.938 its closing `}` |

### Mechanical re-verification after the fixes

| Gate | absent | violating | compliant |
|------|--------|-----------|-----------|
| V3 (comment-only diff shape) | guarded by `test -f` | **rc 1** (synthetic diff with an executable line) | **rc 0** (empty diff, and synthetic comment-only diff) |
| V4a (narrowed claim present once) | — | **rc 1** on the untouched file | **rc 0** on the `sed` copy |
| V4b (old universal gone) | **rc 1** | **rc 1** | **rc 0** |
| V5 (`digest.js` unmoved) | — | — | **rc 0** (empty numstat vs `545df8bd`) |
| V6 (declaration ids) | **rc 1** | **rc 1** (one id renamed) | **rc 0** |

V6's `want` array is unchanged this round: Table C's id column did not move, only
one row's `criterion` (`7` → `7a`) and its must-redden text. `npm run lint`
passes; `git diff --check` clean.

### Mirror walk (ADR-0031, same commit)

THE PRINCIPLE row, the two rewritten/added Table A rows, Table C's
`dream-digest-no-recovery-render` row and its `expectRed` note, the acceptance
criteria (AC6 count four→five, AC6e added, AC7 split), the Mirrored Surface
Checklist's acceptance-criteria / Current-state / operative-prose (e) /
owner-items bullets, both Implementation-notes residuals, the owner-items
preamble (two→three) and the new O3 were all updated in this one commit. No new
mirror class was discovered; the operative-prose enumeration stays at eleven
items, with (e) now naming two residual bullets instead of one.

**Nothing in this round was ruled on by the owner.** O1, O2 and now O3 are open.
The only ruling on record remains the 2026-09-10 maintainer ruling about the
managed-policy-warning follow-up's ordering.

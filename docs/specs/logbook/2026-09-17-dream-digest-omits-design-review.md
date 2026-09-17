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

## Round 3 — independent design gate: APPROVE, and the loop closes

| Field | Value |
|-------|-------|
| Tip reviewed | `ed1abe9bd62c190d089e41f02d32ff896e9db889` |
| Base | `545df8bd33ccd3dc5f2ecb9031d2fdcb0c9cf81c` |
| Raw output | `docs/specs/logbook/2026-09-17-dream-digest-omits-design-r3-raw.json`, committed in **`6c96471c`** before adjudication |
| Focus / meta | `…-design-r3-focus.txt`, `…-design-r3-meta.txt`, same commit |
| Verdict | **`approve`**, **`findings: []`** |
| Read-only check | `git status --porcelain` identical before and after (meta); the reviewer's own run reports the worktree clean |

**Verbatim verdict:** *"Ship the design to implementation. R2-1 is substantively
closed: source tracing confirms ordinary dream failures are appended only after
the child exits, doctor does not expose alerts, the lack of a finite
digest-refresh bound is explicit, and AC6e pins the resulting
record-present/callout-absent state. R2-2 is also closed: the recovery failure
gets one fixed, non-interpolating stderr diagnostic, the original error remains
authoritative, and AC7a/AC7b cover successful and failed recovery renders. No
material product or verification-machinery findings remain, and the inspected
file:line citations resolve on this tree."*

### What the round EXECUTED, and what it did not

| Command | Exit | Result |
|---------|------|--------|
| `git status --short --branch`; `git rev-parse HEAD`; `git merge-base 545df8bd… HEAD`; restricted `git diff 545df8bd…HEAD` | **0** | HEAD `ed1abe9b`, merge base `545df8bd`, worktree clean |
| `nl`, `sed`, `rg`, `wc` and targeted source/control-flow citation checks | **0** | the cited dream, run-job, sync, scheduler, alerts, digest, lock and test locations resolve and support the revised claims |
| `grep -ci alert src/cli/doctor.js` | **1** | printed `0`; exit 1 is grep's expected no-match status, **independently confirming the `doctor` measurement this spec relies on** |
| `git diff --check 545df8bd…HEAD` | **0** | — |
| `npm run lint` | **0** | markdownlint, shellcheck, PSScriptAnalyzer and frontmatter checks passed |

**`npm test` and the focused unit tests were NOT run**, and the reviewer says so
in its own `not_executed` field: the reviewed tip changes design documents only,
so its runtime conclusions are source and control-flow tracing. Recorded here
because a verdict whose tests did not run is a reading, and the runbook requires
that to be stated rather than inferred. It costs this round nothing — there is no
`src/` change on this tip for a suite to exercise — and the suite is the
implementation PR's gate, not this one's.

### Closure

**The loop is DONE at round 3 by the runbook's own rule** — *"The loop is DONE
when a round finds nothing about the product"* (`docs/runbooks/codex-review.md`,
"Weighted closure"). Round 3 found nothing at all: no product finding and no
machinery finding, so there is not even a residual to carry. The arc was
**3 → 2 → 0 findings**, which is the shrinking series the frozen-surface rule
predicts: verification machinery grew exactly twice across the loop, each time to
guard a product behaviour a round had just identified (round 1 added three RED
declarations and the per-site placement criteria; round 2 added AC6e and split
AC7), and never to guard the machinery itself.

Every finding across all three rounds carries a disposition; **none was dropped**
and **none was accepted as a residual without being written into the spec**. Each
round's raw output was committed before anyone read or judged it —
**`d86e1616`** (round 1), **`2eeba955`** (round 2), **`6c96471c`** (round 3) —
so the record is intact and after-the-fact adjudication is possible.

`WP-dream-digest-omits-own-job-alerts` moves to **`Ready`** in the same commit as
this entry. Owner items **O1, O2, O3** are recorded under the standing process in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, each as a
recommendation adopted under standing authorization — **not a direct ruling** —
with its overrule cost, reversible by dated amendment. The owner has ruled on
none of the three.

## Round 4 — a CONFIRMING round by a different reviewer RE-OPENS the gate

**This round ran after the loop had closed and the spec had gone `Ready` and
merged (PR #248), and after an implementation had been dispatched.** It is the
reason `WP-dream-digest-omits-own-job-alerts` is back to `Draft` and the
implementer is paused.

| Field | Value |
|-------|-------|
| Backend / model | **Codex plugin 1.0.6 adversarial-review, `gpt-6-astra`** — a DIFFERENT reviewer from rounds 1-3 |
| Tip reviewed | `ebcdda001b83ed042db463f41b9b98153f91e5c4` (the `Ready` tip) |
| Base | `545df8bd33ccd3dc5f2ecb9031d2fdcb0c9cf81c` |
| Raw output | `docs/specs/logbook/2026-09-17-dream-digest-omits-design-r4-astra-raw.json`, committed in **`31bd9377`** before adjudication |
| Focus / meta | `…-design-r4-astra-focus.txt`, `…-design-r4-astra-meta.txt`, same commit |
| Verdict | `needs-attention`, 2 product findings + 1 machinery finding |
| Read-only check | `porcelain: IDENTICAL before/after`; the reviewer reports no files changed |
| What it EXECUTED | restricted `git diff`/`status`/`diff --check`, citation checks, and — **the load-bearing part** — **in-memory executions of the production function bodies with mocked I/O**. No unit suite, no lint, no RED proofs |

### Findings, bands, weight, dispositions

| # | Band | Weight | Finding | Disposition | Rationale and what changed |
|---|------|--------|---------|-------------|----------------------------|
| A-1 | **A** | **HEAVY** | Timeout survivors invalidate the post-exit-only residual. The watchdog rejects independently of the child's close event (`run-job.js` l.1086, raced at l.1090), so `failLoud` (l.1257) can append **while the child is still alive** — reproduced by in-memory execution. That survivor holds a legitimately minted token and can reach step 19, hiding a failure its supervisor will never clear. Second case: `settleReaps` (l.362) examines only the current run's groups/token, so a later success does not prove a PRIOR run's surviving group is gone | **FIX case 1; PRICE case 2** | Re-verified here against the tree. **Fix:** a THIRD conjunct, **per RECORD not per run** — omit an own-job record only if its `at` is **strictly earlier** than this process's start instant, captured once at the top of `run()` (l.557), with missing/unparseable/equal-`at` all SHOWN. The supervisor's record is dated after this process started, so it survives the filter. New Table A rows *Record date*, *Clock movement*, *Every writer that can append under the dream's own name*; new **AC6f**; new RED declaration `dream-digest-filter-ignores-record-date`. **Price:** case 2 is not fixable with `{job, at, reason, log_hint}` — no reason class, no run token, and matching free-text `reason` is brittle and out of bounds. **Both the "post-exit-only" claim and every "an omitted callout describes a resolved failure" claim are WITHDRAWN**, and O3 now states what success actually establishes: *this run's dream body succeeded*, and nothing more |
| A-2 | **B** | **HEAVY** | Recovery assumes a thrown writer could not have published. `writeFilePrivate` renames at `private-fs.js` l.360 and only then verifies destination identity, throwing `WD_F10_POST_RENAME` at l.372 — **after publication** — reproduced in-memory. So round 2's "a failed recovery leaves the previous filtered bytes intact" is false, and arming recovery only after `regenerateDigest` returns misses a filtered write that publishes and then throws | **FIX** | **Recovery is armed BEFORE the filtered render is attempted**, so an exception thrown during that attempt also triggers the single unfiltered re-render. Original-error precedence and the one fixed-text, non-interpolating stderr line are unchanged. The universal preservation statement is **replaced** by two named boundaries — pre-publication (destination unchanged) and post-rename verification (destination **may already hold** the new bytes) — and the honest summary: after a failed recovery the destination's contents are **not guaranteed by this WP either way**. **AC7 may no longer encode preservation** |
| A-3 | **B** | LIGHT (machinery) | AC7 established neither finalizer coverage nor exactly-once recovery: a catch around steps 20-21 that excludes `destroyWorkspace` and `cleanScratch` satisfies it and the no-recovery declaration, and two successful recovery renders satisfy a content-only assertion | **FIX** | AC7 split into **AC7a-AC7e** with separate failure injections in the post-render body, **workspace teardown** (`destroyWorkspace`, `dream.js` l.1211 inside the `finally` at l.1206-1212), **scratch cleanup** (`cleanScratch`, l.1220 inside the outer `finally` at l.1213-1222), **the filtered render itself**, and **the recovery render itself at both boundaries**. Every sub-criterion observes actual digest **WRITES** and asserts **exactly one** unfiltered recovery attempt, including when that attempt fails |

**No finding was dropped**, and neither product finding was accepted as a
residual without being written into the spec. Both are HEAVY, so a fresh round is
owed on the revised tip before this spec returns to `Ready`.

### Measured facts folded in from the paused implementation

From branch `wp/dream-digest-omits-own-job-alerts` @ **`9d1282cf`** (suite 2767
pass / 2755 / 0 fail / 12 skipped, lint clean), each re-verified here:

- **The record shape makes the date conjunct implementable with no schema
  change**, and rules out the alternatives: `sanitizeAlert` (`alerts.js` l.46)
  coerces to exactly four string fields and drops unknown keys; `readAlerts`
  (l.151) returns **file order, not parsed order**; `clearAlerts` (l.222) matches
  on `job` alone; `failLoud`'s `opts.outcome` never reaches the file.
- **Three writers can append under the dream's own name** and the date rule
  treats them differently — enumerated in Table A. The one that loses its banner
  is `run-job.js` l.953's managed-policy warning (dated before this run's start),
  which is the loss the **2026-09-10 maintainer ruling** already defers to a
  follow-up WP; it is stated as a consequence and **not** fixed here.
- **A spec-internal conflict the implementation surfaced:** Table C claimed AC8
  was in no `expectRed` set, but removing the config conjunct **necessarily**
  reddens AC8 as written. Table C now carries the **measured** sets —
  `ignores-config` → AC4 **and** AC8; `always-on` → AC3 **and** AC5;
  `filtered-at-early-render` → AC6a **and** AC6b; `no-recovery` → AC7a **and**
  AC7b — because a measurement beats the text that predicted otherwise.
- **The finalizer topology** (`dream.js`): `try A` l.608 with `finally A`
  l.1213-1222; `try B` l.815 with `finally B` l.1206-1212; **no `catch A` exists
  today**. A throw from `finally A` is invisible to `catch A`, so recovery needs
  **two sites** of which **at most one** runs.
- **The current arming order is exactly the defective one** —
  `regenerateDigest({omitOwnJobAlerts:true}); restoreAfterStepNineteen = regenerateDigest;`
  — so the spec now says the two statements swap, in those terms.
- **Seams and one trap:** `identityApprovals.readRegistry` / `.approvalsMap`
  bracket the render; `createWorkspace` calls `destroyWorkspace` on its own
  failure arms, so an `fs.rmSync` probe keyed on the workspace dirname fires
  before step 19 unless gated on "a render has happened".

The revision is written so the implementer **resumes from `9d1282cf`** rather
than starting over: Implementation notes carry a numbered delta against what
Table A said at `2d5e2465`.

### Mechanical re-verification

| Gate | absent | violating | compliant |
|------|--------|-----------|-----------|
| V3 (comment-only diff shape) | guarded by `test -f` | **rc 1** | **rc 0** |
| V4a / V4b | **rc 1** (V4b, missing path) | **rc 1** | **rc 0** |
| V5 (`digest.js` unmoved) | — | — | **rc 0** (empty numstat vs `31bd9377`) |
| V6 (declaration ids, now **seven**) | **rc 1** | **rc 1** (renamed id) **and rc 1** on the stale six-id file | **rc 0** |

The stale-six-id run is the one worth noting: V6 reddens on the *previous*
round's own declaration file, which is what a mirror gate is for.

### The lesson — and it is about the process, not this package

**Three rounds of one model approved a design whose two load-bearing assumptions
a second model falsified by EXECUTING the production function bodies. Reading is
not evidence.** Rounds 1-3 read `run-job.js` and `private-fs.js` repeatedly and
cited them accurately; what they never did was *run* them. A-1 and A-2 were both
found by in-memory execution with mocked I/O, and both were invisible to
citation-checking. The repo's own runbook already says a claim about how a tool
behaves is a claim to be RUN, not read — round 4 shows the same rule applies to
claims about how the PRODUCT behaves, including claims a spec makes about code it
does not touch. Two further consequences worth carrying: a single reviewer's
repeated approval is not independence, and **`Ready` is not a terminal state** —
this gate re-opened after merge and after dispatch, and the cost of that was one
paused implementation rather than a shipped false negative.

**Nothing in this round was ruled on by the owner.** O1, O2 and O3 remain open,
and **O3's premise changed materially** — the rulings record
(`2026-09-17-owner-rulings-felho-integration-3.md`) carries the pre-round-4
wording and was deliberately not edited by this pass, so the spec's O3 is the
current text and the two differ by design.

## Round 5 — the mechanism is replaced, not patched again

| Field | Value |
|-------|-------|
| Backend / model | Codex plugin 1.0.6 adversarial-review, **`gpt-6-astra`** (same reviewer as round 4) |
| Tip reviewed | `7bee5394d0f8e23ff8dc7076694c03ea68d05646` |
| Base | `2d5e24654c501b182d61eb28518ca572712712b6` |
| Raw output | `docs/specs/logbook/2026-09-17-dream-digest-omits-design-r5-astra-raw.json`, committed in **`c359a502`** before adjudication |
| Verdict | `needs-attention`, 2 product + 1 machinery |
| Confirmed fixed | the ordinary post-start timeout case (A-1's first half) and A-2's publication boundary; key source citations resolve |
| What it EXECUTED | production `runJob`, `settleReaps`, `failLoud`, `clearAlerts`, `readAlerts`, `regenerateDigest`, `formatAlerts` and `writeFilePrivate` bodies with mocked I/O; timestamp predicates; **and a recovery mutant wrapped around the production finalizer bodies**. No implementation-branch review, unit suite, lint or RED proofs; no files changed |

### THE DESIGN DECISION — Option L, and why the recovery mechanism is gone

**Two of round 5's three findings, and most of rounds 2-5, were about ONE
mechanism: the unfiltered recovery re-render introduced by round 1's F2
disposition.** Its cost over four rounds: two call sites, an exactly-once
guarantee spanning them, arming before the render, a fixed-text stderr
diagnostic, a withdrawn preservation guarantee, compound-failure handling, and
finally a conservative alert-set fallback — because R5-1 showed the recovery
render itself can **publish an alert-free digest and erase other jobs' callouts**
when `readAlerts` fails silently. A mechanism that grows its own surface every
round is the treadmill condition `docs/runbooks/codex-review.md` names, and its
repeat-kind rule says the next step is a design question, not another patch.

**The replacement is Option L: the filtered render becomes the LAST STATEMENT of
`run()`.** Step 19 reverts to `main`'s unfiltered call; a single filtered call is
added after the outer `try`/`finally` closes.

**I verified the topology by reading the whole of `run()` rather than accepting
it**, and the result is stronger than the option required — **no guard is
needed**. Complete exit inventory on this tree: `throw` l.573 and l.596 and
`return` l.602 all sit **before** `try A` opens at l.608; inside it there are
exactly three explicit exits — `throw` l.742, `return` l.756, `return` l.767 —
plus throws from deeper code. A `return` inside a `try` runs the `finally` and
returns from the function; **it does not resume after the block**. And the last
statement of `try A`'s body is the inner `try`/`finally`, whose own last
statement is step 21's summary. So reaching the end of `try A` **is** full
success, and a statement placed after `finally A` (l.1222) and before `run()`'s
brace (l.1223) is reached on that path and no other. A success boolean would be
redundant.

**The one real obstacle is scope, not control flow**, and it is worth recording
because it is the only reason L is not a one-line change: `regenerateDigest`
(l.641) and `ledger` (l.618) are both declared **inside** `try A`, so the final
statement cannot see them. One hoisted binding fixes it. `paths`, `vaultDir` and
`layout` are already outside (l.564, l.581, l.582).

**Option D** — keep the single filtered render at step 19 and simply delete the
recovery, accepting that a post-step-19 failure leaves the digest without its
pre-start own-job callouts — **was not needed**: L is implementable inside the
existing Deliverables with one hoisted binding and one new call, and it is
strictly better, because under D a run that fails in `destroyWorkspace` or
`cleanScratch` still ships a filtered digest.

**The reversal, recorded honestly.** Round 1's F2 disposition explicitly asked
for the recovery re-render, and I specified it. Rounds 2, 4 and 5 each found a
further defect in it. Five rounds of evidence say the mechanism was the wrong
shape from the start: the right question in round 1 was not "how do we undo the
filtered render when the run later fails?" but "why is the filtered render
happening before we know the run succeeded?" — and the answer to the second
question deletes the first. That is the repeat-kind rule working as intended,
two rounds later than it should have fired.

### Findings, bands, weight, dispositions

| # | Band | Weight | Finding | Disposition | Rationale and what changed |
|---|------|--------|---------|-------------|----------------------------|
| R5-1 | **A** | **HEAVY** | Recovery can silently erase unrelated job alerts: `readAlerts` returns `[]` on open/fstat/read errors (`alerts.js` l.157, l.200), so after a successful filtered render a late failure plus a transient read error makes recovery publish an **alert-free** digest — no throw, no diagnostic — losing another job's unresolved callout while both records remain stored. Reproduced by executing the production reader, the regeneration closure and `formatAlerts` | **FIXED BY REMOVAL** | The reviewer's own recommendation was to add a conservative pre-filter alert-set fallback and merge fresh records safely — i.e. **more machinery on the mechanism that keeps needing machinery**. Option L deletes the recovery render, and with it this entire failure mode. The **underlying** property — `readAlerts` fails open on every render, today included — is **pre-existing, stated in Table A, and routed under Discovered** with a note that fixing it changes `readAlerts`' contract and every caller, which is a different WP |
| R5-2 | **B** | **HEAVY** (it is O3's substance) | O3 priced the survivor residual on a mitigation that does not exist: a later successful supervisor calls `clearAlerts` (`run-job.js` l.1204), deleting **every** record for the job regardless of whether a prior run's group survives (`alerts.js` l.222 filters on `job` alone); and the fail-loud email is best-effort (`failLoud` l.729 inside its own `try`/`catch` at l.728-732). Reproduced by executing `runJob`, `settleReaps` and `clearAlerts` | **FIX THE CLAIM** | O3 now says plainly that for the survivor case **the callout is removed by this WP and the record is removed by the existing supervisor moments later**, and that the email is not guaranteed. It also separates what is pre-existing, which is most of it: the deletion is today's behaviour, and the callout's disappearance is today's behaviour one render later — today the survivor's callout renders at step 19, `clearAlerts` deletes the record, and the next render drops the callout anyway. **What this WP changes is one render's worth of display**, not whether the record survives. The residual is real, smaller than the old wording implied, and it was the *mitigation* that was wrong rather than the risk |
| R5-3 | **B** | LIGHT (machinery) | Isolated AC7 injections do not prove the two recovery sites cooperate: a mutant with independent recovery in `catch A` and `finally A` satisfies each isolated case but recovers **twice** on a body+scratch compound failure and propagates the scratch error instead of the body's. Reproduced around the production finalizer bodies | **MOOT under L, replaced** | There is no second site to disagree with, so the class is gone by construction rather than by assertion. AC7a-AC7e and the `dream-digest-no-recovery-render` declaration are deleted. The replacement AC7a-AC7f proves the filtered render is **not reached** when the body throws, when `destroyWorkspace` throws, when `cleanScratch`/`releaseLock` throws, and on the idle / dry-run / declined-lock returns; **is reached exactly once** on full success with step 19's write byte-identical to `main`'s; and **AC7f keeps the compound case** the reviewer built the mutant for, because "no second site" is a claim that should be proven, not asserted. The new declaration `dream-digest-filter-at-step-nineteen` mutates the placement at the other end |

### The writer inventory, completed as the reviewer asked

Round 4's inventory had four writers; the reviewer named three more. All seven
are now in Table A with shown/omitted **and** with the distinction that matters:
a record appended *after* the final render is not filtered because it does not
exist yet, which is different from being omitted. Added: **`run-job.js` l.911**
(TCC / protected-folder refusal — omitted at a later dream's render, and deleted
by that same success's `clearAlerts`), **l.1194 (B1)** (appended after the child
exits, therefore after the final render — not present, not filtered), and
**l.1384 / l.1386 / l.1388** (the three named catch-up authorization refusals —
same shape as the TCC case). **B2 (l.1204) deliberately skips the append**, so it
contributes no record.

### Mechanical re-verification

| Gate | absent | violating | compliant |
|------|--------|-----------|-----------|
| V3 (comment-only diff shape) | guarded by `test -f` | **rc 1** | **rc 0** |
| V4a / V4b | **rc 1** (V4b, missing path) | **rc 1** | **rc 0** |
| V5 (`digest.js` unmoved) | — | — | **rc 0** |
| V6 (declaration ids, still **seven**, one swapped) | **rc 1** | **rc 1** (renamed id) **and rc 1** on the round-4 id list | **rc 0** |

V6's red against the *round-4* list is the useful one: the swap of
`dream-digest-no-recovery-render` for `dream-digest-filter-at-step-nineteen` is
exactly the kind of change a mirror gate exists to catch, and it caught it.

### Lesson, carried forward from round 4 and sharpened

Round 4's lesson was *reading is not evidence*. Round 5 adds the other half:
**when a mechanism generates a finding every round, the finding is the
mechanism.** Four rounds of correct, well-dispositioned patches to the recovery
render produced a mechanism with two sites, an exactly-once guarantee, a
diagnostic, a withdrawn guarantee and a required fallback — and a simpler design
that had been available since round 1 removed all of it. The runbook's
repeat-kind rule is written for exactly this and would have saved three rounds if
it had been applied at round 2 rather than round 5.

**Nothing in this round was ruled on by the owner.** O1, O2 and O3 remain open;
O3's text changed again and the rulings record still carries the pre-round-4
wording, deliberately unedited.

---
title: Round 3 — external adversarial review (raw), the promote split pair
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. The reviewer's own
     bold pseudo-headings trip MD036; the repo's standing device for verbatim
     evidence is to disable the linter for the file rather than edit the text. -->

# Round 3 — external adversarial review (raw)

Reviewer: gptsol (Codex side), external, FRESH agent. Vendored
`docs/runbooks/review-prompts/adversarial.md`, unedited. Targets: both specs,
**whole settled text** at `33f414a`, base `main` @ `36c2ce5`. Authorised by the
owner under the runbook's HEAVY rule.

**Committed BEFORE adjudication, verbatim.** Dispositions live in the round
record. `&lt;` `&gt;` `&amp;` are transport escaping from the agent channel.

**Read-only, verified independently by this author**: `git status --porcelain`
empty before dispatch and after.

## Raw output

# External adversarial design review — round 3

Target: the promote split pair, whole settled text at `33f414a`
Base: `main` at `36c2ce5`

## PRIOR-FINDINGS VERDICT TABLE

| Prior finding | Verdict | Current evidence |
|---|---|---|
| **R2-1** | **Genuinely fixed.** | Table G now assigns the post-commit skill-registration obligation to G10, derives newness from delta status `added`, derives `id` and `created` from decided bytes, and calls `recordSkills` only after commit success: `WP-dream-promote-in-workspace.md:262`. The production-shaped positive and negative cases are required at `:430-439`; `skill-registry.js` is explicitly called but not modified at `:514-516`. |
| **R2-2** | **Genuinely fixed.** | The exact `promote()` return is now a discriminated report union: published arms require `bytes`, while the refused arm has no bytes at `WP-dream-promote-module.md:213-225`. Table S makes this a shape rule at `:393`, and the per-outcome acceptance criterion is at `:641-647`. |
| **R1-1** | **Genuinely fixed.** | `promoted` and `redacted` now both carry required `{rel, bytes}` entries at `WP-dream-promote-module.md:213-215`; Table S repeats the shape rule canonically at `:393`. |
| **Z1** | **Genuinely fixed.** | The pipeline now quantifies over entry points, not modules, and explicitly names the existing `brain.js → workspace.js` and `workspace.js → delta.js` requirers at `WP-dream-promote-in-workspace.md:33-41`. |
| **Z2** | **Genuinely fixed.** | The module explicitly distinguishes the naming order C, D, E, R from the document order C, D, R, E and states why at `WP-dream-promote-module.md:242-246`. |
| **Z3** | **Genuinely fixed.** | The consumed-by-nothing comparison is now scoped to each dependency's own merge and names the consumer `delta.js` later gained at `WP-dream-promote-module.md:36-40`. |

The claimed fixes are not merely reworded versions of the same defects. All six prior findings are genuinely fixed.

## VERDICT

`needs-attention`

## SHIP / NO-SHIP

**NO-SHIP.** Table S substantially fixes the decided-bytes seam, but the pair still leaves three product obligations without complete ownership: the pipeline never consumes `report.record` when report publication fails; Table D does not define the non-content evidence required to preserve the skill and ledger gates; and the validator's Step 1 scratch-write enforcement disappears from Table G.

## FINDINGS

### Finding 1 — A refused report can still lose the complete enforcement record at the package seam

- **Materiality band:** B
- **Affected file:** `WP-dream-promote-in-workspace.md`
- **line_start:** 249
- **line_end:** 262
- **Confidence:** 0.99

**What can go wrong**

When the report's fallback write is refused—for example because the user changes the report during the read-to-publish window or because the report target is a symlink—`promote()` returns the complete enforcement record in `report.record`, but the pipeline has no rule requiring it to consume that field or deliver it through the run's log and output. The vault correctly remains untouched, but the only remaining copy of this run's enforcement record can be silently dropped.

**Why vulnerable**

The module's exact contract explicitly assigns delivery to its caller at `WP-dream-promote-module.md:226-229`. Table R repeats that `report.record` must go to the caller's log and output at `:347`, and the module criterion proves only that the record is returned at `:635-640`.

The pipeline is that caller, but Table G has no `report.record`, enforcement-record, log-delivery, or output-delivery obligation in G1–G10. Its acceptance criteria likewise contain no refused-report delivery case. G8 owns committing published report bytes; it does not own the refused arm, which has no bytes to commit.

This means each package can satisfy its own stated positive behavior while the cross-package fallback loses the record Table R exists to preserve.

**Likely impact**

A suspicious report target or concurrent user edit can make the run's policy decisions unavailable both in the vault and in operational output. This is a missing product build likely to be caught during implementation or a PR gate, so it is band B.

**Concrete recommendation**

Add an explicit Table G obligation for the refused report arm:

1. consume `report.record` whenever `report.outcome === 'refused'`;
2. deliver the complete record and refusal reason through the run log and user-visible output;
3. do not stage or commit a report on that arm;
4. add a pipeline-level acceptance criterion covering both an `expect` conflict and a symlink refusal, proving that the vault remains unchanged and the complete record appears in both required delivery channels.

---

### Finding 2 — Table D does not define enough input to preserve the skill and ledger gates

- **Materiality band:** B
- **Affected file:** `WP-dream-promote-module.md`
- **line_start:** 316
- **line_end:** 321
- **Confidence:** 0.96

**What can go wrong**

The extracted skill-body and ledger gates can preserve their simple content checks while silently dropping authorization and provenance checks that depend on data other than the candidate file's bytes. A forged ledger could then count a session that did not invoke the skill, or a skill revision could be judged without its ownership-registry identity and committed baseline.

**Why vulnerable**

The exact contract says Table D owns each gate's input at `WP-dream-promote-module.md:201-209`. Table D then assigns:

- the merged candidate plus "baseline ledger" to the skill-body guard;
- only the merged candidate bytes to ledger validation;
- only the merged candidate bytes to the Tier-3 floor.

The shipped implementations require materially more evidence:

- `skillBodyViolation` consults the ownership registry, run date, committed skill bytes, and committed ledger bytes at `src/core/dream/validate.js:320-412`;
- `ledgerViolation` consults the ownership registry, sibling `SKILL.md`, committed ledger bytes, and `extractsBySession` at `src/core/dream/validate.js:516-612`;
- the session-binding check specifically rejects a new Claude session absent from this run's extracts or one that did not invoke the parent skill at `:589-606`.

Those current `git show` and vault reads cannot simply survive extraction because G7 requires the new gates to consult no git and to judge the input Table D assigns. The replacement sources—constructed baseline bytes, registry snapshot, run extracts, and date—are not fully assigned by Table D or the opaque `gates` type.

The pipeline acceptance criterion at `WP-dream-promote-in-workspace.md:412-418` says "same verdict for the same content," but these verdicts are not functions of content alone. Identical ledger bytes must produce different verdicts depending on whether the named session exists in `extractsBySession` and invoked the skill.

**Likely impact**

An implementer must invent an undocumented gate-input shape or can accidentally weaken ADR-0020's ownership, history, and invocation-binding controls while still satisfying the explicitly listed byte-routing cases. That is a wrong or missing build likely to be caught downstream, so it is band B.

**Concrete recommendation**

Make Table D and the `gates` contract enumerate the complete decision evidence per gate, without prescribing code structure:

- **Skill-body guard:** candidate skill bytes, baseline skill bytes, baseline ledger bytes, ownership-registry snapshot, relative path, layout, and run date.
- **Ledger validation:** candidate ledger bytes, baseline ledger bytes, the corresponding candidate-or-baseline skill bytes selected by the pair decision, ownership-registry snapshot, this run's extracts keyed by session, relative path, and layout.
- **Tier-3 floor:** candidate bytes and enough path/layout information to establish whether the gate applies.
- State explicitly that no gate may replace any of those values with a vault re-read or git query.

Add acceptance cases where identical candidate bytes receive different verdicts solely because the registry or invocation evidence differs, and a paired skill-plus-ledger change is judged from the pair's candidate/baseline bytes rather than the live vault.

---

### Finding 3 — The rewiring acknowledges validator Step 1 but assigns its scratch-write enforcement to no Table G row

- **Materiality band:** B
- **Affected file:** `WP-dream-promote-in-workspace.md`
- **line_start:** 301
- **line_end:** 304
- **Confidence:** 0.98

**What can go wrong**

A brain can write an unexpected file into the supposedly read-only scratch directory, and the rewired pipeline will no longer record that policy violation in the enforcement report or success summary. Final scratch cleanup may delete the artifact, leaving the run looking normal and erasing the evidence.

**Why vulnerable**

The spec inventories validator Step 1 as "scratch integrity" at `WP-dream-promote-in-workspace.md:148-152`, then claims its Step-1-to-Step-6 enumeration has a Table G row inheriting each step at `:301-304`. In reality, G1–G10 assign Step 6 through G10 but assign no row to Step 1.

The current Step 1:

- scans every scratch file;
- deletes files outside `expectedScratch`;
- deletes modified expected extracts;
- records each violation in `outOfVaultDetailed`;
- includes those records in the report and returns `outOfVault`.

That behavior is at `src/core/dream/validate.js:1107-1142`, `:1385-1386`, and `:1450-1457`.

The pipeline's existing `scratchIntact` abort is not equivalent. It checks only whether expected extracts still exist and match their hashes at `src/cli/dream.js:57-78`; an additional `EVIL.json` does not make it fail. The current focused validator test confirms the distinct behavior: an unexpected scratch file is deleted and counted as out-of-vault.

Table G's abort criterion covers a changed expected extract, but no criterion covers an unexpected scratch write or its enforcement record.

**Likely impact**

A sandbox-policy breach is silently downgraded into routine teardown. The content does not reach the vault, but the user loses the current security observability and accounting. This is a missing inherited behavior likely to be caught during implementation or a downstream review, so it is band B.

**Concrete recommendation**

Assign Step 1 explicitly in Table G:

1. after verified reap and before promotion, enumerate scratch against `expectedScratch` and its baseline;
2. delete and record unexpected scratch files;
3. keep the existing fail-loud abort for missing or changed expected inputs;
4. include unexpected-write records in the enforcement section, run output, and summary;
5. add a production-shaped criterion proving an unexpected scratch file is removed and reported even though all expected extracts remain intact.

If dropping this behavior is intentional, record it as an owner-accepted product change rather than claiming every validator step has an inheriting row.

---

### Finding 4 — Table S's closed consumer list excludes the report's internal second write

- **Materiality band:** C
- **Affected file:** `WP-dream-promote-module.md`
- **line_start:** 392
- **line_end:** 396
- **Confidence:** 0.94

**What can go wrong**

Table S cannot currently serve as the closed, mechanically reviewable universal it claims to be. A future reader following S5 will conclude that only G8 and G10 consume returned published bytes, while the same spec explicitly requires the report's second write to consume the first report publish's returned buffer as its `expect` premise.

**Why vulnerable**

S1 quantifies over "any path this module PUBLISHES," S4 over "EVERY fact a consumer derives," and S5 says there are exactly two consumers, both in the pipeline. But the report row at `WP-dream-promote-module.md:324` requires an internal second `writeIntoVault` call whose `expect` is the buffer returned by the first report publish. That is a consumer needing bytes of a path this module just published, and it is not G8 or G10.

The operative report row already states the safe behavior, so this is currently cross-surface contract hygiene rather than a missing product behavior. It nevertheless disproves S5's advertised completeness and weakens the circuit-breaker extraction's purpose.

**Likely impact**

The closed-list review mechanism can miss drift in the report's compare-to-second-publish handoff. The present report row still guards the behavior, making this band C.

**Concrete recommendation**

Choose one precise scope and state it canonically:

- either narrow Table S to consumers of the **final published outcomes returned by `promote()`**, explicitly excluding internal primitive-result consumption and citing the report row as its separate owner;
- or include the report's internal first-publish-to-second-write handoff in S5 and register the report row as its mirror.

Do not retain "any path this module publishes" alongside a list limited to downstream `promote()` consumers.

## SCOPE OBJECTIONS

None.

The review does not challenge the owner-ruled seam, the consumed-by-nothing first package, the module size, cross-package citation style, or the named residuals.

## EXECUTION REPORT

### Commands run as checks

All commands were run from the checkout root.

| Command | Exit | Result |
|---|---:|---|
| `git rev-parse HEAD && git rev-parse main && git status --porcelain` | 0 | HEAD `33f414aefc3eb3927bc929293d6d21570ab766c2`; main `36c2ce51562aadb3eea83ccfe51a40bc728d9680`; initial status empty. |
| `git diff --check main...HEAD && git diff --name-only main...HEAD && git status --porcelain` | 0 | No whitespace errors; changed-file list inspected; status empty. |
| Python assertions checking G10, the report discriminated union, Table S S2, ordinary promoted bytes, Z1, Z2, and Z3 | 0 | Every claimed prior-finding fix evaluated true. |
| Python assertions comparing `report.record`, Table G, the pipeline acceptance criteria, validator Step 1, and current gate dependencies | 0 | Confirmed `report.record` has no Table G/criterion consumer; Step 1 has no Table G owner; current gates depend on registry, extracts, and committed baseline evidence beyond the Table D rows. |
| `npm test -- --test-name-pattern '<three focused dream-validate names>'` | 0 | 110 test/file subtests passed, 0 failed. The focused validator behaviors reproduced successfully. |
| `npm run lint` | 0 | Markdownlint: 0 errors; frontmatter: 231 specs passed. Shellcheck and PSScriptAnalyzer were skipped because their local binaries are absent. |
| Final `git status --porcelain` | 0 | Empty. |

### Content read through Bash

Read-only `cat`, `sed -n`, `nl -ba`, `grep`, and `wc -l` over: the vendored adversarial prompt; both target specs in full, re-read with line numbers across Tables C, D, E, R, S, G, exact contracts, acceptance criteria and out-of-scope; `_TEMPLATE.md`, `spec-authoring.md`, `README.md`, `CLAUDE.md`, `codex-review.md`; every `2026-08-28-promote-split*.md` record; the shipped workspace, vault-write, baseline-delta and skill-registry specs; `validate.js`, `dream.js`, `vault-write.js`, `delta.js`, `skill-registry.js`, `reap.js`, `safety-profile.js`; relevant validator and integration tests and the fake-brain fixture.

### Not run

- Full unfiltered `npm test`.
- The target specs' implementation verification commands, because `promote.js` and the new test deliverables do not exist yet and this was a read-only design review.
- Any command that created, edited, deleted, staged, committed, checked out, or reset a file.

No file in the checkout was created, edited, deleted, staged, or committed.

## LESSONS / GOTCHAS

- `WP-dream-promote-in-workspace`: returning a fallback enforcement record is not delivery; the caller must explicitly own its log/output consumption.
- `WP-dream-promote-in-workspace`: enumerating all six legacy validator steps does not preserve them; each durable or security-visible outcome needs an operative Table G owner.
- `WP-dream-promote-module`: a gate's verdict is not always a function of candidate bytes; ownership registries, baseline sibling files, invocation extracts, and the run date are contract inputs too.
- `WP-dream-promote-module`: a closed consumer list must distinguish downstream consumers of `promote()` from internal consumers of `writeIntoVault` results.

## FINAL READ-ONLY PROOF

`git status --porcelain` — exit 0, output empty.

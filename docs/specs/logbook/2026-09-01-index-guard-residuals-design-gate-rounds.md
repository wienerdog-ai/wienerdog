---
title: Design-gate round record — WP-index-guard-residuals
date: 2026-09-01
related_wps: [WP-index-guard-residuals]
---

# 2026-09-01 — design-gate rounds, WP-index-guard-residuals

Doc under review: `docs/specs/WP-index-guard-residuals.md`, matured from the
2026-08-31 handover stub (HANDOVER queue item 2) by wd-architect on
`docs/wp-index-guard-residuals` (base `fc506110`), tip `374728a2` at round
zero. Predecessor: `WP-show-slot-own-value-kind` (Done 2026-09-01), whose
round record is `2026-09-01-show-slot-design-gate-rounds.md`.

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material product finding on either channel; machinery or
wording findings at that point are fixed within the frozen surface or accepted
as named residuals. **Escalations, pinned in advance:** (i) two consecutive
rounds landing findings of the same kind → a design question per ADR-0031,
never a third textual patch; (ii) a finding whose only honest fix is a
contract change to row W1(c) — a fifth failure mode, a tenth shape, a third
placeholder kind, a widened slot — is PARKED as an owner ruling in the spec's
Dispatch precondition with a recommendation, never folded. The spec currently
parks no owner question; if one appears it blocks dispatch, not the loop.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, focus text in this record's first round entry); shadow =
herdr-spawned hermetic Codex (`CODEX_HOME=~/.codex-review-home`, `-s
read-only`, detached worktree at the round's tip, fresh thread per round via
`/new`; hermeticity probe at start: no hooks, no identity or vault content —
only the worktree's own `AGENTS.md`). Raw outputs are committed BEFORE
adjudication, one file per channel per round
(`2026-09-01-index-guard-gate-raw-round<N>-<channel>.txt`).

## Round zero (`374728a2` → fixes in `7fe16406`)

Template conformance (clean-context executor, sonnet): **CONFORMANT** — every
template section present, the one conditional item carries its `N/A — reason`,
no glossary synonyms, no ungated universal. Coherence pass (second
clean-context executor, sonnet; the orchestrator re-measured the load-bearing
claims independently): every `file:line` citation, every quoted fragment,
every count (`PRODUCING` 1 / `**PRODUCING**` 0 on line 541, `produces: true`
×4, `| W1 |` one line), the sweep baseline, both git-frame experiments (the
relative index lands at the WORKTREE TOP under `-C <repo>/sub`, git 2.39.5)
and the `getPaths({HOME:'relhome'})` claim reproduced; the four
untouched-tree verification commands behaved as the spec predicts (pair
check red 0/4, negated grep red, module gate green, sweep = baseline).
**5 findings (1 B, 4 C), all FIX, applied in `7fe16406`:**

1. **B** — the Mirrored Surface Checklist omitted the template's
   acceptance-criteria and verification-command mirror categories
   (`_TEMPLATE.md:93-97`) for all three tables; registered with criterion
   numbers and block headers as locators, the preamble split into sweep-found
   tree surfaces and in-spec surfaces the sweep cannot reach.
2. **C** — two divergent copies of the "unchanged" invariant (Deliverables
   cell vs criterion 4); the cell is the owner, criterion 4 and 7 cite it.
3. **C** — `paths.js:21-33` → `:21-31`. 4. **C** — the W1(c) foreclosure
   quoted with its actual double quotes. 5. **C** — `:1039` is the property
   `stateDir: paths.state,`, not an assignment.
   The architect's whole-spec re-read caught one self-inflicted falsification
   (a checklist entry describing criterion 7 by its pre-fix wording).

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|

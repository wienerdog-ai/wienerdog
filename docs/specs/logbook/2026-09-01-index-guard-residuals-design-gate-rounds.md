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
| 1 (`49b54eaa`) | needs-attention / needs-attention | `…round1-codex-plugin.txt` (`b87af11c`), `…round1-herdr-shadow.txt` (`7b77eb3e`) | Plugin 4 B, shadow 5 B, zero scope objections, three converged; every load-bearing claim reproduced by the orchestrator before adjudication. **Converged (R1-A, HEAVY):** Table A's "never more permissive" guarantee is FALSE — reproduced on git 2.39.5 with `top/link → top/inner` and `top/sub/link → <outside>`: `GIT_INDEX_FILE=link/index git -C top/sub read-tree HEAD` writes INSIDE the worktree while a guard based at the `-C` directory resolves it OUTSIDE and admits; the frame was measured on `read-tree` only and generalised; criterion 3 let a `process.cwd()` fallback survive → FIX: resolve against git's actual frame (worktree top, obtained out of band) or constrain to the nine shapes and fail closed on an omitted/non-top frame; all three private shapes measured; reverse-direction and omitted-frame evidence required. **Converged (R1-C):** PRODUCING identity unchecked — the shadow executed a virtual row marking (1),(3),(4),(6): `row=4 mod=4`, "AGREES" → FIX: shape-by-shape identity check + same-count SWAP mutation RED. **Converged + shadow extension (R1-D):** the sweep is exact-wording; the shadow found the same false universal INSIDE W1(c) clause (a) — *"every one of them through the seam of (c)"* — which Table C omitted and the sweep cannot reach → FIX: the sentence joins Table C (in-boundary, row W1(c)); the sweep's reach restated honestly; concept-level positive checks added. **Plugin-only (R1-B):** the ordering paragraph *"computed by an EARLIER pinned read"* survives Table B and is false twice (the head is read from the user's ref; three producers are not reads) and uses the shorthand the predecessor BANNED from W1(c) → FIX, joins Table B. **Shadow-only (R1-E):** criterion 5's no-count claim unsatisfiable in-boundary (`known-calls.js:68-70` "Its four members", untouchable; recorder comment `test.js:226-238`, registered do-not-edit) → FIX: narrowed to W1(c)'s own rule (row + prose surfaces; code is exemption (i)). **Shadow-only (R1-F):** the test-title non-move's three reasons do not hold (`--test-name-pattern` is a substring match, so a rename preserving the `claim-2b-pipeline` token breaks nothing; CLAIM 2b ownership does not license the overstatement; `:1454` does not select `claim-2b-merge-cwd`) → FIX: token-preserving rename recommended to the architect. Channel notes: the plugin's sandbox denied `mkdtemp`, so its runtime GREEN is a reading (disclosed); the shadow was granted ONE approval (the guard-file suite outside the sandbox → 44 pass) and declined a lint-with-network request; the shadow report was captured via an approved scratch-file write because the herdr client was 45 columns wide. All FIX, applied in `f0b1f6ae`. R1-A and R1-D(ii) are HEAVY → full fresh round 2. |

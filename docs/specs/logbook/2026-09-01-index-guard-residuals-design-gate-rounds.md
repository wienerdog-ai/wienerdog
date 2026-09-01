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
| 2 (`f6a99c6b`) | needs-attention / needs-attention | `…round2-codex-plugin.txt` (`8d651b14`), `…round2-herdr-shadow.txt` (`750bdaec`) | Both channels verified R1-B, R1-F and the fail-closed rule genuinely fixed. Plugin 1 A + 3 B + 1 C, shadow 3 B + 1 C, zero scope objections, three converged. **CIRCUIT-BREAKER (pinned criterion (i)) — the FRAME took findings two rounds running:** round 1 broke the `-C` frame (symlinks), round 2 the worktree-top frame (plugin, A: `GIT_DIR=<repo>/.git GIT_WORK_TREE=/tmp GIT_INDEX_FILE=../inside.idx` — `--show-toplevel` says `/private/tmp` while git writes `/private/inside.idx`; reproduced by the orchestrator). Git's resolution frame is an alien grammar (symlinks, `..`, `GIT_DIR`, `GIT_WORK_TREE`) — the retired verb resolver one level down. **Design question put to the architect with both closable designs MEASURED by the orchestrator:** (A) ask git for the EFFECTIVE index path out of band (`rev-parse --git-path index` under the invocation's env — relative to the `-C` directory when the value is relative; agreed with `read-tree`'s actual write in every vector incl. symlink and `GIT_DIR`; index-safe on a stale-stat index) vs (B) REFUSE TO JUDGE a non-absolute private `GIT_INDEX_FILE` as a harness error — no frame, nothing to model, the run's own value is absolute under every supported configuration. **Recommendation (B), the fixed point; adopted as embodied design with (A) recorded, and its "not a fifth failure mode" reading PARKED for owner ratification in a new Dispatch precondition** (criterion (ii)). **Converged (R2-B):** the ordinal identity check trusts textual `**(n)**` labels — plugin swapped two labels, shadow inserted a `**(2)** DECOY — **PRODUCING**` — both `IDENTICAL` → FIX as PROPERTIES (nine unique ordered entries; marker bound to its entry between citation and period) with label-swap and decoy REDs. **Converged (R2-C):** per-file citation counts pass with both citations at one site; the concept regex misses two rewordings and FLAGS a correct scoped statement (executed on both channels) → FIX: site-local citation evidence; concept regex demoted from gate to discovery aid. **Plugin (R2-D):** the W1(c) replacement would leave two false statements (non-producibility overstated — relative `HOME`; "nothing asks git" vs a locator) → FIX (qualified; under (B) the second stays true). **Converged (R2-E, shadow B / plugin C):** 613 lines prescribing fixtures, exact node/shell implementations and mutation recipes — both wrong-green mechanisms of this round lived in that embedded machinery → PRUNE to properties + required evidence, measurements to one provenance line. **Shadow (R2-F):** R1-E not genuinely fixed — this spec states present-tense counts/mappings itself → FIX via pruning + explicit exclusion of dated provenance lines from criterion 5a. All FIX, applied in `4c8d7c01`. Design change → full round 3. |
| 3 (`5de0a63c`) | needs-attention / needs-attention | `…round3-codex-plugin.txt` (`50078215`), `…round3-herdr-shadow.txt` (`e19ed3b0`) | **FULL CONVERGENCE — both channels returned the same four findings (3 B, 1 C), zero scope objections, no product finding, and neither re-argued design (B).** (The first plugin job of this round died with an orchestrator background-task kill at 21:39Z and was re-run fresh; disclosed in the raw's header.) **R3-1 (B):** criterion 4's three REDs can be satisfied by a checker that hard-codes the WRONG mapping `[1,5,7,8]` — both channels executed it: wrong baseline green, all three mutations red → FIX: evidence must derive shape identities and PRODUCING state independently from BOTH surfaces (the module, read; the row's physical entries, parsed) and compare shape by shape, plus a module-side producer-property mutation RED proving the verifier reads the module. **R3-2 (B):** design (B)'s refusal error, raised inside the frozen `classify(args, env)`, cannot carry the `cwd` W1(c)'s *"EVERY RED CARRIES ITS INVOCATION"* universal requires → FIX: the refusal moves to the seam wrapper (which holds args, cwd, env) so `classify` stays frozen and the error carries the full invocation with an explicit "unjudged: non-absolute" state; W1(c)'s diagnostic sentence is scoped to verdicts and the refusal's diagnostics defined beside it. **R3-3 (B):** the owner's "no" branch is not executable — alternative (A) omits the other W1(c) live sentences it contradicts, how cwd reaches a locator, locator-failure semantics and replacement evidence → FIX: the Dispatch precondition states honestly that "no" returns the WP to design with (A) as the starting point and lists what (A) must cover; it does not claim a pre-written branch. **R3-4 (C):** the worked marker example names real shape (2) — a live producer mapping in prose → FIX: schematic placeholder. All FIX, applied in `b743baf3`. Machinery-only round → round 4 runs as the closing confirmation. |

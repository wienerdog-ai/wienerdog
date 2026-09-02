---
title: Design-gate round record — WP-criterion-red-harness
date: 2026-09-02
related_wps: [WP-criterion-red-harness]
---

# 2026-09-02 — design-gate rounds, WP-criterion-red-harness

Docs under review: `docs/specs/WP-criterion-red-harness.md` (Draft; flips to
Ready at loop close) and `docs/adr/0042-machine-run-red-proofs.md` (Proposed,
unsigned — the WP does not depend on the signature), matured from the
2026-08-31 handover stub (HANDOVER queue item 5) by wd-architect on
`docs/wp-criterion-red-harness` (base `49d3d467`), tip `56c5a99e` at round
zero.

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material design finding on either channel — a way the runner
can report PROVEN for a proof whose mutation was not applied, was applied to
the working tree, or whose red was not the named assertion's; a vacuity guard
that can pass on nothing; a production seam borrowed by the runner; or a
Table C reach claim that over-states — and machinery/wording findings at that
point are fixed within the frozen surface or accepted as named residuals.
**Escalations:** (i) two consecutive rounds landing findings of the same
kind → a design question per ADR-0031; (ii) a finding whose only honest fix
puts ADR-0042's doctrine in force ahead of its signature (a spec-template
rule, a blocking CI job) is PARKED, never folded — those are named
successors. The one owner item (ratify ADR-0042) blocks the successors, not
this WP's dispatch.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from this worktree); shadow = herdr-spawned hermetic Codex
(`CODEX_HOME=~/.codex-review-home`, `-s read-only`, detached worktree at the
round's tip, fresh thread per round). Raw outputs committed BEFORE
adjudication (`2026-09-02-red-harness-gate-raw-round<N>-<channel>.txt`).

## Round zero (`56c5a99e` → fixes in `cc3128c3`)

Template conformance (clean-context executor, sonnet): **CONFORMANT** — all
sections, all five checklist categories plus the ADR as a sixth, no ungated
universal, no glossary synonym (the spec's own prose obeys its `harness` rule).
Coherence (second executor, sonnet): every citation, count and measured claim
reproduced — `tests/run.js`/`with-temp-root.js` shapes, the boundary-check
admit list, the 20 MB tree, `mirror-walk --scope criterion-red` = 6 entries,
the three `row G8` tests and their canaries, the adopted suite at 44 tests
(14.35 s this run vs the pinned 14.6 s — within variance; the pinned figure
stays as taken), the ADR index row. **4 findings, all C, all FIX (3 by the
architect in `cc3128c3`, 1 by the orchestrator in `c69c33c9`):** the three
successor ids marked "proposed id; not yet filed"; the fixtures Deliverables
row restated as Tables A/D's structural requirements on any `--root` (mirror
updated in the same pass); the ADR README status cell made to mirror the
file's full string; the ADR status string's second copy registered as a
mirror the owner's signature moves. `size: M` gut-checked and kept: the
runner plus its one real-code adoption are the honest unit.

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| 1 (`8b0296d9`) | needs-attention / needs-attention | `…round1-codex-plugin.txt` (`44e3a036`), `…round1-herdr-shadow.txt` (`f0301277`) | Plugin 2 A + 3 B, shadow 3 A + 2 B, zero scope objections (neither treated the unsigned ADR-0042 doctrine as in force), FOUR converged. **Converged (A):** declarations are executable CommonJS and LOAD precedes SANDBOX — a `.proofs.js` can `process.exit(0)` before anything is counted or write into the checkout before confinement → FIX: inert JSON declarations (recommended). **Converged (A):** a proof may mutate its own assertion's host suite with an empty `signal` and read PROVEN while production behaviour never changed (executed against `dream-pipeline.test.js:1601-1607`); the shadow named the legitimate adoption mutation (`read-tree` slot RUN_VALUE → ANY in the pinned module, one layout) → FIX: `file ≠ suite`, no runner/declaration self-mutation, mutation targets the observed input, non-empty `signal`, criterion 9 verifies the mutation-to-canary relationship. **Converged (A/B):** TAP identity is a bare name compared as a SET — duplicates, SKIP/TODO, nested/file-level nodes, hook failures and a lazy-load `SyntaxError` all satisfy "the named test failed" (the executed no-match probe: inner `1..0` under an outer file-level `ok`, exit 0) → FIX: hierarchical identity, exactly one baseline PASS per identity, assertion-type failure required, infrastructure failures are ERRORs. **Converged (B):** "no path outside the sandbox is written" is unsatisfiable for the adopted suite (its `os.tmpdir()` scratch lands in the outer run root; `node_modules` link outside) → FIX: two explicit boundaries (runner mutations inside the copy; suite scratch inside the wrapper root), criterion 7 narrowed, attempted-escape test. **Shadow (B):** `--proof` selection lets a `(wp, criterion)` roll up PROVEN with one of two proofs unrun → PARTIAL/FILTERED. **Shadow (B):** APPLY's occurrence semantics undefined (overlap, empty `find`, partial replacement) → non-overlapping left-to-right, expected bytes computed and matched. **Plugin (B):** ADR-0042 decision 4 derives attribution from import hygiene alone → narrowed before signature. All FIX, applied in `131778ca`. Contract shape changes → full round 2. |
| 2 (`c490b5e0`) | needs-attention / needs-attention | `…round2-codex-plugin.txt` (`b3741aa0`), `…round2-herdr-shadow.txt` (`04a00c8e`) | Both channels verified R1-A/B/E/F/G genuinely fixed; R1-C works on Node 25.9. Plugin 1 A + 1 B, shadow 1 A + 2 B, zero scope objections, two converged. **Converged (A) — CIRCUIT-BREAKER (criterion (i)): containment took findings two rounds running** (round 1: the boundary was unsatisfiable as stated; round 2: a check/use race on the mechanism). SANDBOX canonicalises the mutation path once, but BASELINE runs arbitrary suite code before APPLY — the suite can swap the target (or a parent) for a symlink into the real checkout, and APPLY/RESTORE then write through it while criterion 7's `git status` compare stays clean; the three required escape cases exercise only pre-existing paths. **Design move put to the architect:** never write into a tree in which untrusted suite code has already run — a fresh copy per phase (BASELINE copy runs and is discarded; APPLY's copy is mutated BEFORE any suite code runs in it, then RED runs; RESTORE is a green run on a fresh copy or the shared baseline), so no revalidation step exists to get wrong; the revalidate-at-every-write alternative recorded. **Converged (B):** `--test-reporter=tap` was added in Node 18.15.0 (`--test-name-pattern` in 18.11.0) while `package.json` declares `>=18` → the lane's floor is stated (the runner refuses with a plain message below 18.15) rather than the repo floor raised silently — raising `engines` is the owner's. **Shadow (B):** a nested assertion failure emits the child (`ERR_ASSERTION`) AND its parent (`failureType: subtestsFailed`), so failing-set EQUALITY over names rejects a valid nested assertion → equality defined over own-body terminal failures with mechanically attributable `subtestsFailed` ancestors permitted; the `--test-name-pattern` child-only zero-run behaviour named. All FIX, applied in `54667da9`. Structural change → round 3. |

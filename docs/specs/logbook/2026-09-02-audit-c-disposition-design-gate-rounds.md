---
title: Design-gate round record — WP-audit-c-close-disposition
date: 2026-09-02
related_wps: [WP-audit-c-close-disposition]
---

# 2026-09-02 — design-gate rounds, WP-audit-c-close-disposition

Doc under review: `docs/specs/WP-audit-c-close-disposition.md`, matured from
the 2026-08-31 handover stub (HANDOVER queue item 4) by wd-architect on
`docs/wp-audit-c-close-disposition` (base `49d3d467`), tip `39e52659` at round
zero. A DISPOSITION pass: the architect measured M7/M9/M10 on the current tree
and wrote the measurements into Current state so the implementer re-runs and
records; C3 (layout dot-prefix) is measurably OPEN and gets its own Draft
stub as a Deliverable.

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material finding against a DISPOSITION (a mooted finding
whose mechanism still exists, or an open finding wrongly closed) on either
channel; machinery or wording findings at that point are fixed within the
frozen surface or accepted as named residuals. **Escalations:** (i) two
consecutive rounds landing findings of the same kind → a design question per
ADR-0031; (ii) any finding whose honest fix is a product change (a fix inside
this WP) is routed to a new Draft stub, never folded — this WP writes no
`src/` or `tests/`. The closure of group C is PARKED as the owner's
ratification (Dispatch precondition; Table E pre-writes both Status-cell
texts) — it blocks dispatch, not the loop.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from this worktree); shadow = herdr-spawned hermetic Codex
(`CODEX_HOME=~/.codex-review-home`, `-s read-only`, detached worktree at the
round's tip, fresh thread per round). Raw outputs committed BEFORE
adjudication (`2026-09-02-audit-c-gate-raw-round<N>-<channel>.txt`).

## Round zero (`39e52659` → fixes in `5bdaf755`)

Template conformance (clean-context executor, sonnet): **CONFORMANT**.
Coherence (second executor, sonnet): every citation, quoted fragment and count
reproduced; V1–V5 green as stated and every RED variant observed; V6 red on the
absent state; one stale range. **10 findings (4 B, 6 C), all FIX, applied in
`5bdaf755`:** V6 had no RED variant (now six, observed) and no E1/E2 distinction
(now a `RULING` switch); AC4's Table W row W1 and AC5's harness-refusal
patterns were unchecked (added — AC5's check is asymmetric, since the logbook
MUST carry the honesty paragraph); `isSafeRelativePath` is `:65-71`; AC6
aligned with V6; a judgment sentence moved out of the report-only Current
state into Table D; the "only tracking doc" universal gated by an exit-coded
uniqueness grep; the C3 stub's ADR-0004 tag earned in its body; the N/A
checkbox form restored. The architect's re-read caught a Deliverables cell
that presumed ruling E1.

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| 1 (`1e1e2b88`) | needs-attention / needs-attention | `…round1-codex-plugin.txt` (`0c26486a`), `…round1-herdr-shadow.txt` (`5398c558`) | Plugin 1 A + 3 B, shadow 2 A + 2 B, three converged; **two Table D verdicts measured WRONG** — the material finding class this loop exists for. **Shadow (A), reproduced by the orchestrator:** M7 is NOT mooted beneath admitted tiers — `makeAdmit` enumerates dot names only at the vault root, so `01-Projects/example/.github/copilot-instructions.md`, `…/.husky/…` and `…/.git/hooks/note.md` are ADMITTED and a full `promote()` with real gates promoted and WROTE the copilot-instructions file; the harvested ruling required rejecting any dot-prefixed SEGMENT; V1 tested dot paths only at the root → FIX: D1 split (mooted at root / OPEN beneath tiers) with a successor owning path-level dot-segment rejection; V1 exercises dot directories and the instruction basenames BENEATH tiers and once through the full promotion path. **Converged (A), confirmed by the orchestrator:** M9/C2's ENVIRONMENT half is live — `commitNamedSet` spreads `process.env` into every git call; an inherited `GIT_DIR` redirected the pinned `hash-object -w --stdin` object write out of the vault and the same env reaches `commit-tree`/`update-ref` (a manual `wienerdog dream` inherits the shell; scheduled jobs get run-job's clean env) → FIX: D2 split (hook/`git commit` half MOOTED; env half OPEN, owned by `WP-dream-git-env-pinning`, which needs the owner's product decision); D4's "nothing new is owed" withdrawn. **Converged (B):** the C3 stub's "one site, the user's own value" is false — `layout-infer.js:34-46` carries a copied validator and `adopt --yes` writes the inferred layout (a vault with `.projects/` inferred `projects_dir: .projects`) → stub names producer and reader. **Converged (B):** V6 does not enforce the Status-cell-only edit (`diff --stat` only prints; prefix grep; citation anywhere) → exact-row + `numstat 1 1` assertions. **Plugin (B):** D1's "nothing bypasses row C9" false as a writer model (`refreshWarnings`/`admitWarningsPath`; the commit adds `WARNINGS_REL`) → both authorities described. **Shadow scope notes (C):** the ADR-0029 rationale not grounded in the ADR's text; Current state/checklist duplicate Table D; RED recipes prescribe test design → ground or park; prune. **Consequence:** with two findings OPEN, "group C closes" is no longer the honest recommendation — Table E and the Dispatch precondition re-cut toward OPEN-WITH-RESIDUALS. All FIX, applied in `e63c4773`. Two verdicts flipped → full round 2. |
| 2 (`70da1e79`) | needs-attention / needs-attention | `…round2-codex-plugin.txt` (`32ae4e2b`), `…round2-herdr-shadow.txt` (`42e620da`) | Both channels verified the round-1 splits and the successor contract factually sound. Plugin 1 A + 1 B, shadow 1 A. **Plugin (A):** E2's mechanical closure trigger is a DEFECT-PRESENCE conjunction — V1(b) and V5 go red when any ONE of `makeAdmit`, the layout reader or the producer changes, so a partial fix (executed: `makeAdmit` only, reader still keeping `.git`, producer still emitting `.projects`) satisfies "all red" while D5 stays live → FIX: E2 requires explicit POST-FIX assertions per residual (every dotted path and the real write refused; the reader rejects/falls back; the producer never emits), not an arbitrary red. **Shadow (A), reproduced through the production write path:** D1(a)'s "four current names" is false — `GEMINI.md` is Gemini CLI's official hierarchical instruction file and `makeAdmit` admits `01-Projects/example/GEMINI.md` (written: true); tier-local `copilot-instructions.md` and `.cursor/rules.md` likewise → FIX: D1(a) is scoped to the ENUMERATED names in `INSTRUCTION_BASENAMES`; current unknown-tool instruction files are a further OPEN half with a Draft owner and a production-write probe; E1's residual count updated; E2 requires that probe red too. **Plugin (B):** V6 invokes `boundary-check.js` with no arguments (exits 1 with usage) → the spec path and the changed-file list. All FIX, applied in `d196498a`. Verdict changes → round 3. |

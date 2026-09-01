---
title: Design-gate round record — WP-preservation-abort-widening
date: 2026-09-01
related_wps: [WP-preservation-abort-widening]
---

# 2026-09-01 — design-gate rounds, WP-preservation-abort-widening

Doc under review: `docs/specs/WP-preservation-abort-widening.md`, matured from
the 2026-08-31 handover stub (HANDOVER queue item 3a) by wd-architect on
`docs/wp-preservation-abort-widening` (base `fc506110`), tip `ade024b0` at
round zero. Runs in parallel with the `WP-index-guard-residuals` loop (its own
record, same date); the two touch disjoint files.

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material product finding on either channel; machinery or
wording findings at that point are fixed within the frozen surface or accepted
as named residuals. **Escalations, pinned in advance:** (i) two consecutive
rounds landing findings of the same kind → a design question per ADR-0031,
never a third textual patch; (ii) a finding whose only honest fix changes a
shipped canonical row's CONTRACT beyond Table P's stated amendments (Q4's
invariant, Q18's other three fields, G5 beyond its only-copy sentence) is
PARKED as an owner ruling in the spec's Dispatch precondition, never folded.
**The spec already parks ONE owner question** (blast radius: whole-run
fail-loud on the two new arms vs refuse-and-continue; recommendation:
fail-loud) — it blocks dispatch, not the loop.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from this worktree); shadow = herdr-spawned hermetic Codex
(`CODEX_HOME=~/.codex-review-home`, `-s read-only`, detached worktree at the
round's tip, fresh thread per round via `/new`). Raw outputs are committed
BEFORE adjudication, one file per channel per round
(`2026-09-01-preservation-abort-gate-raw-round<N>-<channel>.txt`).

## Round zero (`ade024b0` → fixes in `220de093`)

Template conformance (clean-context executor, sonnet): **CONFORMANT**.
Coherence pass (second clean-context executor, sonnet): every citation,
quoted fragment and count reproduced, the three-arm A/B/C measurement
re-driven byte-for-byte, V2/V3/V4 red on the untouched tree as predicted,
`npm test` 2444/0, lint green, the 209-test selection green; V5's mutations
COULD-NOT-RUN pre-implementation (they target code the WP adds). **8 findings
(2 B, 6 C), all FIX, applied in `220de093`:**

1. **B** — the "Discovered issues" claim that row V1 contradicts row G12 is
   FALSE on the current tree (V1 `:506` already states G12 keeps half (b)
   fail-loud and cites the fixing round; code agrees) — dropped, no
   replacement; G12's own cell re-read: no defect.
2. **B** — checklist shorthand `G5 → P5` (G5 cites Table P, the class, not
   row P5) and the P5 criterion bundling the two Done-spec amendment clauses
   — fixed and split.
3. **C** — `dream.js:947-963` → `:940-963` (catch at `:953`). 4. **C** — a
   backticked catch "literal" that exists nowhere → structural description
   with real lines. 5. **C** — Dispatch precondition moved after the title
   (four precedents). 6. **C** — `depends_on` gains the two amended Done
   specs; ADR-0012 dropped as partly superseded. 7. **C** — logbook citation
   `:83` → `:79-83`. 8. **C** — checklist category renamed to say every item
   is inside the Deliverables boundary.
   The architect's post-move re-read fixed three sentences the move
   falsified ("three code sites" → the gate, the module, the pipeline's
   record).

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| 1 (`798f8617`) | needs-attention / needs-attention | `…round1-codex-plugin.txt` (`3e24bb64`), `…round1-herdr-shadow.txt` (`e538be49`) | Plugin 1 A + 2 B, shadow 1 A + 2 B + 1 C, zero scope objections (neither re-argued fail-loud), two converged. **Converged (R1-A, A, HEAVY):** a CLASS MEMBER the spec missed — `quarantinePreserve` returns the INPUT buffer without reading the artifact back (`validate.js:667-670`); both reviewers fault-injected a write that stored different bytes: the redact arm returned a non-empty record over a non-identical file, and the recoverable escape compared against the in-memory alias, so a corrupt artifact counted as recovery; P0 and P4 accept the record and teardown destroys the sole correct copy → FIX: Table P gains the "reported success, artifact missing or not byte-identical" member; success is established from the artifact (read-back after rename); the escape uses the verified result; P4's reach against an injected gate stated honestly. **Shadow (R1-B):** the frozen `secretGateAbortMessage(rel, redactedName, identity)` signature cannot express Table P — P1/P2 and P3-both-failed arrive with identical inputs and must produce different values → FIX: a closed discriminant in the helper contract. **Shadow (R1-C):** Q4 names row B3b of the secret-fence spec as the abort CONDITION's owner and B3b still scopes it to the fall-through arm; Q18's "all three arms" universals go false under an append-only value → FIX: B3b joins the amendment boundary; byte-exact pointer-only Q18 text delegating the taxonomy to Table P. **Converged (R1-D, B/C):** V2–V5 certify the wrong change — `grep -Fc` counts lines; V4's `ROW G5` anchor is satisfied with the catch comment deleted (executed); phrase-shaped where the criterion is claim-shaped; V5's name pattern skips a legitimately named test → FIX. **Converged (R1-E):** over-prescription (fixture, "one added branch", helper as mirror, exact mutations) → PRUNE. Channel notes: the plugin's sandbox denied `mkdtemp` (runtime reading, disclosed; degraded drive with `stateDir=/dev/null` reproduced A/B/C); the shadow was granted two temp-dir reproductions and one `npm test` (2444/2432/0). All FIX, applied in `e95632fb`. R1-A is HEAVY → full round 2. |

---
title: Round 4 — external adversarial review (raw), the promote split pair
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. -->

# Round 4 — external adversarial review (raw)

Reviewer: gptsol (Codex side), external, FRESH agent. Vendored
`docs/runbooks/review-prompts/adversarial.md`, unedited. Targets: both specs,
**whole settled text** at `91bc773`, base `main` @ `36c2ce5`.

**UNDIRECTED DISPATCH, owner-ruled**: the family was not named, `validateAndCommit`
was not named, and no walk was prescribed. Table V was handed over only as "the
newest text, attack it". The reading was pinned before the round in the round
record. `&lt;` `&gt;` `&amp;` are transport escaping.

**Read-only, verified independently**: `git status --porcelain` empty before and after.

## Raw output

# External adversarial design review — round 4

## Verdict

`needs-attention`

## Ship / no-ship summary

**NO-SHIP.** The prior fixes mostly hold, but the new inheritance ledger exposes two unresolved seam defects:

1. Scratch-integrity records cannot reach the report through the specified interfaces.
2. Table V does not inherit the full EP2 redaction lifecycle, including preservation-failure behavior, retention, and the recovery metadata required in the report.

Both are contract gaps in the settled text, not missing implementation.

## Prior-findings verdict table

| Prior finding | Verdict | Current evidence |
|---|---|---|
| **R3-1** — no consumer for `report.record` | **Genuinely fixed.** | G11 explicitly owns delivery through the run log and user-visible output at `WP-dream-promote-in-workspace.md:268`; the acceptance criterion proves the refused-report path against a pipeline that ignores `report.record` at lines 480–487. |
| **R3-2** — gate evidence understated as candidate bytes | **Genuinely fixed.** | The three post-merge gate rows enumerate their additional evidence at `WP-dream-promote-module.md:319-321`; line 322 forbids vault rereads and git substitution. The discriminating acceptance cases are at lines 643–649. Finding F2 below concerns outputs and side effects of EP2, not this repaired input-evidence contract. |
| **R3-3** — scratch delete-and-record behavior had no owner | **Re-worded but still defective.** | G12 now names the delete-and-record behavior at `WP-dream-promote-in-workspace.md:269`, but it also requires the record to appear in the report at lines 488–495. The report is composed inside `promote()`, whose complete input at `WP-dream-promote-module.md:188-219` has no field for external records. The pipeline package may not modify `promote.js` (`WP-dream-promote-in-workspace.md:198-201`). The row therefore assigns the behavior without supplying a realizable seam. See F1. |
| **R3-4** — Table S consumer list conflicted with its scope | **Genuinely fixed.** | S5 now limits the table to bytes returned to downstream callers and explicitly excludes the one internal report handoff at `WP-dream-promote-module.md:397`; S6 names the two decided-byte consumers at line 398. |
| **R2-1** — skill ownership registration assigned to nobody | **Genuinely fixed.** | G10 assigns newness, decided-byte parsing, post-commit ordering, and the `recordSkills` call at `WP-dream-promote-in-workspace.md:267`; lines 470–479 provide positive and negative acceptance cases, including a RED case where the pipeline omits `recordSkills`. |
| **R2-2** — `report.bytes` optional across success and refusal | **Genuinely fixed.** | The exact return contract uses a discriminated union at `WP-dream-promote-module.md:213-225`; Table S repeats the shape rule at lines 394–395. |
| **R1-1** — paths returned without published bytes | **Genuinely fixed.** | `promoted[]` and `redacted[]` require `{rel, bytes}`, and published report arms require `bytes`, at `WP-dream-promote-module.md:213-225`. Table S defines those bytes at lines 393–395, with per-outcome acceptance coverage at lines 650–656. |
| **Z1** — false claim that all consumed modules had no consumers | **Genuinely fixed.** | The pipeline spec now quantifies over entry points and names the existing module-level requirers at `WP-dream-promote-in-workspace.md:33-41`. Tree construction confirms `brain.js` requires `workspace.js`, `workspace.js` requires `delta.js`, and no production source requires `vault-write.js` or `promote.js`. |
| **Z2** — table naming order disagreed with reading order | **Genuinely fixed.** | The explicit reading-order note distinguishes the seam-ruling order C/D/E/R from document order C/D/R/E and explains why at `WP-dream-promote-module.md:242-246`. |
| **Z3** — stale comparison to `delta.js` being consumed by nothing | **Genuinely fixed.** | The package note now says `delta.js` and `vault-write.js` each shipped unconsumed at their own merge, then names `workspace.js:63` as the later `delta.js` consumer and limits the current no-caller claim to `computeDelta` at `WP-dream-promote-module.md:37-43`. |

## Findings

### F1 — Scratch violations have no interface into the report

- **Materiality:** **B** — wrong or missing build, likely caught downstream
- **Affected file:** `WP-dream-promote-in-workspace.md`
- **line_start:** 269
- **line_end:** 269
- **Confidence:** 0.99

**What can go wrong**

An unexpected scratch write can be deleted and shown in terminal/log output, but omitted from the dream report's enforcement section even though G12 and its acceptance criterion require it there.

**Why vulnerable**

G12 runs in the pipeline before promotion and produces the scratch-violation record. The report is composed and published inside `promote()`. The complete `promote(o)` input at `WP-dream-promote-module.md:188-219` accepts no external accounting records. G11 runs at the pipeline output layer; it can print a record after `promote()` returns, but it cannot retroactively add that record to the already-composed report. The integration package also explicitly consumes rather than modifies `promote.js` at `WP-dream-promote-in-workspace.md:198-201`.

The acceptance criterion at lines 488–495 requires the violation in both user output **and the report**, so the implementation has no contract-conforming route to satisfy it.

**Likely impact**

A sandbox-policy breach can disappear from the durable vault report when transient logs or terminal output are unavailable. This recreates the security-observability loss R3-3 was intended to close.

**Concrete recommendation**

Add a canonical cross-package input for code-owned pre-promotion records to `promote(o)` and require Table D/Table R report composition to include those records. G12 should pass its scratch records through that input. Register the new field in the module's exact contract, the integration handoff, and the existing G12 acceptance criterion. Do not leave G11 as the report transport: it is downstream of report publication.

### F2 — Table V drops EP2's durable redaction lifecycle

- **Materiality:** **B** — wrong or missing build, likely caught downstream
- **Affected file:** `WP-dream-promote-in-workspace.md`
- **line_start:** 294
- **line_end:** 294
- **Confidence:** 0.98

**What can go wrong**

A conforming extraction can preserve the redact/withhold verdict while losing one or more of these shipped behaviors:

- preservation of the unredacted original;
- the preservation-failure abort that prevents destruction when no byte-identical durable copy exists;
- once-per-run retention pruning of `state/quarantine/redacted/`;
- the redaction report metadata that identifies the exact retained copy.

That can leave a false-positive redaction without its required recovery pointer, allow the private artifact directory to grow without its bound, or discard the only raw copy after a preservation failure.

**Why vulnerable**

Table V claims to enumerate what the replaced validator consumes and durably produces. V3 lists only dispositions and the revert/re-stage/index-drop machinery. The current Step 3 also:

- writes private quarantine artifacts;
- carries the actual collision-resolved artifact basename;
- protects the preservation-failure path with a byte-identity abort;
- accumulates per-run retention state and prunes once after the loop;
- produces line count, labels, and artifact basename consumed by the report.

Those are visible in the current implementation at `src/core/dream/validate.js:1276-1290`, `1298-1323`, `1365-1366`, and `1398-1408`. The binding canonical contract also requires the redaction artifact plus report section at `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1563-1568`.

G7 says the gate semantics remain unchanged, but the gate return described by the module carries only `{redact, sanitizedBytes}` at `WP-dream-promote-module.md:201-212`. It carries none of the metadata needed to render the shipped recovery line. No Table G row owns retention or a post-gate-run finalization point, and no acceptance criterion pins either the exact redaction recovery line or the retention behavior.

**Likely impact**

The pipeline can report that a note was redacted without telling the user where its unredacted original is stored. Because `redacted/` deliberately has no digest banner, the report is its discovery path. Preservation-failure and retention behavior can also regress while all newly stated pipeline criteria remain green.

**Concrete recommendation**

Expand V3 to enumerate the full surviving EP2 lifecycle and assign each output explicitly:

1. gate disposition and sanitized bytes;
2. durable artifact result, including actual basename;
3. preservation-failure/byte-identity abort behavior;
4. per-run retention finalization;
5. redaction-report metadata: path, line count, labels, and returned basename.

Define a typed return or run-scoped gate context that carries this metadata to `promote()` and provides an explicit once-per-run finalization point. Add acceptance criteria for the exact recovery line, collision-resolved basename, preservation-failure abort, and once-per-run retention. Merely preserving the verdict is insufficient.

## Scope objections

None. No finding challenges the owner-ruled package seam, the module's consumed-by-nothing landing, package size, or the use of cross-package citations.

## Execution report

All commands run were read-only and exited status 0: `git rev-parse`/`git status --porcelain` before and after; `wc -l`, `cat`, `nl -ba | sed -n` and `grep` over both target specs in full, the vendored prompt, the permitted shipped specs and ADR context, `src/core/dream/validate.js`, `src/cli/dream.js`, relevant unit-test sections, and the promote-split logbook entries; plus `git diff main...HEAD` over the two specs and a `require(...)` construction check across `src`.

**Not run:** unit tests, integration tests, lint, installer, dream run, mutation, or any implementation command. No file was created, edited, deleted, staged, committed, or checked out.

The checkout began at `HEAD=91bc7730418b386a7bdb5dbae33dca4a5a964158`, `main=36c2ce51562aadb3eea83ccfe51a40bc728d9680`. Both status checks were empty.

## Author's note on the execution report

This round is a READING, and the reviewer says so plainly: it ran no tests and no
lint. Under the runbook's rule that a verdict whose tests did not run must
disclose it, this one does. Its two findings are nonetheless grounded in
`file:line` evidence, and both were reproduced by this author on the tree before
adjudication.

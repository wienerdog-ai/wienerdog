---
title: Round zero — the promote split pair (template conformance + internal coherence)
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

# Round zero — the promote split pair

Specs under review: `docs/specs/WP-dream-promote-module.md` and
`docs/specs/WP-dream-promote-in-workspace.md` at `dcc98d8`. Base tree: `main` @
`36c2ce5`. Both disciplines per `docs/runbooks/codex-review.md`. **Every command
below was RUN, not read.**

## 1. Baseline, before any round-zero edit

```
npm test     → tests 2143, pass 2133, fail 1, skipped 9
npm run lint → markdownlint 0 errors (539 files); frontmatter 231 specs   exit 0
```

The one failure is pre-existing and unrelated: `tests/integration/adopt-e2e.test.js:72`,
a real `claude` resolving beside `node` in the fnm bin dir, so the pinned-command
check refuses the spawn. Documented in PR #23. The split's diff touches no code.
`shellcheck` and PSScriptAnalyzer skipped locally (binaries absent; CI runs them).

## 2. Template conformance — clean context, two independent readers

Run per the runbook: an executor that took no part in drafting, given exactly two
inputs (the spec and `docs/specs/_TEMPLATE.md`). One reader per spec, neither
told about the other.

**Result: no section is silently absent in either spec.** Every template section
is present; the three conditional branches are each taken visibly in both specs
(Contract reference — FIRED, with the 2-of-7 activation enumerated; Security
checklist — KEPT; the idempotence acceptance item — `N/A —` with a stated
reason and a stated replacement). Frontmatter: all required fields present in
both, no extras, field order matching the template.

**The two readers DISAGREED on one question, and the disagreement is the
interesting result.** On `### Contract table(s)`:

| Reader | Spec | Verdict |
|---|---|---|
| A | module half (**four** named tables: C, D, R, E) | **SILENTLY ABSENT** — the literal heading is not there |
| B | pipeline half (**one** named table: G) | **PRESENT (renamed instance)** — "one canonical table per dense contract, which is the template's stated shape" |

**Disposition: no change, in both.** The template's own comment under that
heading reads "One canonical table per dense contract", so per-contract named
headings are the shape it asks for, not a deviation from it. The pre-split spec
and both `Done` siblings do exactly this, and the PR-review gate verified
template-section presence on all three. **Recorded rather than fixed** because
the split verdict shows the check is sensitive to table COUNT, not to
conformance: a reader seeing one table calls it the section, a reader seeing four
calls the section missing. That is a property of the check, not of the specs.

## 3. Internal coherence

### 3a. Citations — every one resolved mechanically, ranges at both ends

Ten `file:line` citations across the pair, extracted by script and resolved
against the tree: **zero missing files, zero out-of-range, zero ranges whose end
falls outside its construct.** This is on top of the re-pinning already recorded
in `2026-08-28-promote-split.md` (`validate.js` byte-identical to the pre-split
pin; `cli/dream.js` +14).

Two prose measurements re-run rather than trusted:

| Claim | Measured | Verdict |
|---|---|---|
| `validate.js` exports exactly seven names, none of them a gate | `validateAndCommit parseFrontmatter assertGitRepo assertCleanTree precommitSessionEdits restoreVaultToHead scrubAddedLines` | OK |
| `runBrainWithWatchdog` has no `return` in `cli/dream.js:139-296` | `awk` over that range: zero matches | OK |

### 3b. Every verification step RUN, on the pinned base

| Step | Spec | exit | Reading |
|---|---|---|---|
| `test -f tests/unit/dream-promote.test.js && npm test -- …"dream-promote"` | module | 1 | RED — deliverable absent; the guard is doing its job |
| `… --test-name-pattern "claim-2b-merge-cwd"` | module | 1 | RED — same |
| `! grep -rqn "require(.*promote" src/ --include='*.js' --exclude='promote.js'` | module | 0 | GREEN — and separately proven RED with a planted require |
| `grep -q "\*\*promotion\*\*" docs/GLOSSARY.md` | module | 1 | RED — the name is the deliverable |
| `test -f tests/unit/dream-pipeline.test.js && npm test -- …"dream-pipeline"` | pipeline | 1 | RED — deliverable absent |
| `… "claim-1-pipeline"` / `… "claim-2b-pipeline"` | pipeline | 1 / 1 | RED — same |
| `npm test -- --test-name-pattern "dream-validate"` | pipeline | 0 | GREEN — 190 tests, 0 fail; the file exists today |
| `! grep -q "precommitSessionEdits" src/cli/dream.js` | pipeline | 1 | RED — row G6 is the work |
| `grep -q "assertCleanTree" src/cli/dream.js` | pipeline | 0 | GREEN — presence check only, and the spec says so |
| `grep -qi "promot" docs/adr/0012-dream-run-lifecycle.md` | pipeline | 1 | RED — the ADR mentions neither "promot" nor "workspace" today |

**No step is vacuously green.** Every assertion that must become true is red now,
and the two that describe the tree as it stands are green for a stated reason.
The acceptance criteria themselves are not runnable on this base — they are about
`promote.js`, which does not exist — which is the expected state for a spec that
has not been implemented, not a round-zero finding.

### 3c. Counts against their lists

Checked mechanically: the ADR-0031 activation counts (five / four) against their
enumerated items; "the four gates", "the seven `LAYOUT_KEYS`", "two
brain-influenceable values", "none of those four is itself a condition"
(C9 + M1–M3), "the three modules", "the seven re-target sites". All agree with
what they count except the one finding below.

**One count disagreement between this pass and a template reader, resolved by
measurement:** reader B reported 16 acceptance criteria for the pipeline half;
the mechanical count (`- [ ]` items under `## Acceptance criteria`) is **15**.
The mechanical count is what the split record and the pinned tripwire use, and
it is reproducible. Recorded so the number does not come back.

## 4. Findings and dispositions

| # | Band | Finding | Disposition |
|---|---|---|---|
| Z1 | **B** | The pipeline half's Context said "the three modules it consumes all shipped consumed by nothing". **FALSE as stated, measured:** `brain.js:18` requires `workspace.js` for `isAtOrBeneath`, and `workspace.js:63` requires `delta.js` for `captureBaseline`. The ENTRY POINTS have no caller; the modules do. Same family as the withdrawn universals this arc already collected — a claim about what does not happen, stated one level broader than what was measured | **FIXED.** The sentence now quantifies over entry points (`createWorkspace`, `destroyWorkspace`, `computeDelta`, `writeIntoVault`, `promote`) and names both existing module-level requirers in place |
| Z2 | C | The module half orders its tables C, D, R, E while every naming surface says "C, D, E and R" | **FIXED, additively.** A one-sentence reading note under `## Contract reference` states both orders and why they differ (Table E's accounting row refers to the outcome Table R defines). The tables are NOT moved — a 40-line block move to fix a navigation nit is exactly the surface growth the frozen-surface rule warns about |
| Z3 | C | The module half's package note said it ships consumed by nothing "exactly as `delta.js` and `vault-write.js` did before it" — `delta.js` has since gained a consumer | **FIXED.** Now "each did at their own merge", naming `workspace.js:63` as the consumer `delta.js` gained and `computeDelta` as the half that still has none |
| Z4 | C | `### Contract table(s)`: one clean-context reader called it silently absent, the other present | **NO CHANGE**, reasoned above. Recorded as a property of the check |
| Z5 | C | Acceptance-criteria count reported as 16 vs the mechanical 15 | **NO CHANGE to the spec**; the mechanical count stands and is recorded here |

**Band summary: one B, four C. Zero A.** Under the standing reporting rule
(A/B/C per finding, counts alone are not decision-grade), and under the weighted
closure rule, Z1 is the only finding that would change what an implementer
builds — and it is a Context sentence, not a contract row, so it lands and is
verified mechanically rather than reopening anything.

## 5. Post-fix state

```
npm run lint → exit 0
```

The tripwire baseline is unmoved by round zero: module half **24** acceptance
criteria (six of them the report's), **3** deliverables; pipeline half **15** and
**6**. No condition in `2026-08-28-promote-split-owner-ruling.md` fires.

**Round zero is CLOSED. One external round follows, in the usual order.**

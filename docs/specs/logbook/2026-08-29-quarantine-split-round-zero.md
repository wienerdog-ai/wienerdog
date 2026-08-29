---
title: Round zero — the quarantine surface split (template conformance + internal coherence)
date: 2026-08-29
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# Round zero — the quarantine surface split

Specs under review: `docs/specs/WP-quarantine-warnings-file.md`,
`WP-doctor-quarantine-counts.md`, `WP-quarantine-banner-decay.md`,
`WP-dream-report-run-skips.md`, plus ADR-0023 **Amendment 2** (only), at
`77a41f9`. Base tree: `main` @ `dcd5777` (= `origin/main`; the branch's `src/`
is byte-identical to it). Both disciplines per `docs/runbooks/codex-review.md`.
**Every command below was RUN, not read.** Raw executor report:
`2026-08-29-quarantine-split-round-zero-raw.md`, committed before adjudication
(the SHA is cited in the review-rounds record).

## 1. Baseline, before any round-zero edit

```
npm test     → tests 2143, pass 2133, fail 1, skipped 9
npm run lint → markdownlint 0 errors; frontmatter 236 specs, 4 agents   exit 0
```

The one failure is pre-existing and unrelated: `tests/integration/adopt-e2e.test.js`,
a real `claude` resolving beside `node` in the fnm bin dir, so the pinned-command
check refuses the spawn — the same environmental failure documented in PR #23 and
the promote round zero. The split's diff touches no code. `shellcheck` ran in the
lint pipeline; PSScriptAnalyzer skipped locally (pwsh absent; CI runs it).

## 2. Template conformance — clean context, four independent readers

Run per the runbook: four executors that took no part in drafting, one per spec,
none told about the others, each given exactly two inputs (the spec and
`docs/specs/_TEMPLATE.md`).

**Result: no section is silently absent in any of the four specs.** All four
frontmatters conformant (required fields, template order, `epic:
quarantine-surface` as the template's stated optional usage, no extras). The
recurring verdicts match the promote precedent: `### Contract table(s)` is
PRESENT AS RENAMED INSTANCE everywhere (per-contract named tables — the
template's own "one canonical table per dense contract" shape); the
`Contract reference` / `Security checklist` headings drop the template's
authoring parenthetical once the section is activated, with the condition
resolved visibly in the body (activation enumerated; N/A items inline with
reasons). Two additive structures flagged for completeness, neither a template
deviation: the dispatch-precondition item `0.` prepended to every Definition of
done (the ADR-signature gate), and the dream-report spec's
"READ THIS BEFORE ANYTHING ELSE" provisional-notice block (the promote-family
re-derivation warning).

## 3. Internal coherence

One clean-context executor, strictly read-only (`git status --porcelain`
byte-identical before and after; tip unchanged at `77a41f9`).

### 3a. Citations — every one resolved mechanically, ranges at both ends

Roughly ninety `file:line` citations across the five docs resolved against the
tree. **Six are off by one line or one range end** (findings 2–6 below, plus
the misattributed quote, finding 7); everything else exact, including every
byte-quoted snippet and both ends of every other range. The dream-report spec's
PROVISIONAL bucket: **every provisional citation is true on today's tree** —
the re-derivation precondition stands for the dispatch window, not because any
is stale now.

### 3b. Every verification step RUN, on the pinned base

Full per-step table in the raw file. Summary: **every gate that must go red on
the deliverable-absent tree is red today, and every green is green for a stated
reason** (pre-existing tests, negative invariants that discriminate, the golden
no-change gate against a verified `main` = `dcd5777`) — with one exception:
the warnings spec's `npm test -- --test-name-pattern "warnings"` step is
vacuously green today (node --test exits 0 on zero name-pattern matches),
finding 11.

### 3c. Counts against their lists

Worked-example arithmetic exact (50.0 MB / 49.0 MB renderings, run-log deltas,
doctor's 191+1 example vs Table A row order, the banner's N=1 sentence under
its 400-byte bound); ADR-0031 activation counts all ≥ 2-of-7 against their
enumerated conditions; "the last N are NEW steps" counts all match. One count
wrong: the doctor spec's "Nine are inline; three use the helper-loop idiom"
(finding 1 — it is eight and four).

## 4. Findings and dispositions

Sixteen findings, fifteen LIGHT and one HEAVY (14). Full text in the raw file.
Dispositions below are the relay's PROPOSALS per the runbook ("the relay
PROPOSES a disposition for every finding"); the owner rules before the revision
pass, and this record is finalized with the ruling:

| # | One-line summary | Class | Proposed disposition |
|---|---|---|---|
| 1 | doctor spec: inline/helper-loop group count is 8/4, not 9/3 | LIGHT | fix |
| 2 | doctor spec: `doctor.test.js:44` → `:45` | LIGHT | fix |
| 3 | doctor spec: `doctor.js:344` → `:345` for the `const vaultPath` statement | LIGHT | fix |
| 4 | warnings spec: Step 3 is `validate.js:1211`/`:1223`, not `:1222` | LIGHT | fix |
| 5 | warnings spec: Step-5 ranges `:1410-1429` → `:1411-1429`, Table D `:1426-1428` → `:1427-1429` | LIGHT | fix |
| 6 | banner spec: `ledger.js:292` → `:293` for the `updated_at` write | LIGHT | fix |
| 7 | warnings spec: writeIntoVault quote lives at `vault-write.js:169`, not `:6-11` | LIGHT | fix |
| 8 | Two→Three writers GLOSSARY fix leaves `vault-write.js:7` header as an unnamed stale twin | LIGHT | fix (spec names it; implementer files it under Discovered issues) |
| 9 | doctor spec: "73% of the digest budget" conflates digest (73%) with budget (51%) | LIGHT | fix |
| 10 | warnings spec: duplicated phrase "dream console lines and dream console lines" | LIGHT | fix |
| 11 | warnings spec: `--test-name-pattern "warnings"` step vacuously green on zero matches | LIGHT | fix (make the step discriminate or drop it for the node gates) |
| 12 | banner spec: "Amendment 2 is already on `main`" false until this branch merges | LIGHT | fix (tense) |
| 13 | warnings spec: activation (vi) credits the banner WP with the path contract the doctor WP inherits | LIGHT | fix |
| 14 | doctor's missing-file warn "the next dream run writes it" is false for a fully idle run | **HEAVY** | fix — see below |
| 15 | Amendment 2's restated invariant says "after the quarantine set changes"; the mechanism is per-record freshness (a shrink-only change starts no window) | LIGHT | fix (align the ADR sentence to the mechanism) |
| 16 | doctor retype gate misses a backtick template-literal `reports/warnings.md` | LIGHT | fix (regex) |

**Finding 14 proposed resolution (contract change — the owner's act, ruling
pending).** The warnings file gains a third refresh trigger:
**write-if-absent** — a dream run that ends with ≥1 active quarantine in the
ledger and no `reports/warnings.md` on disk writes the file, even when the run
consumed nothing and the quarantine set did not change. This keeps doctor's
promised sentence literally true (any dream run heals the missing file),
preserves the churn property (an *existing* file is still rewritten only when
the set changes — write-if-absent fires at most once, on the first run after
the file went missing), and closes the upgrade scenario (pre-existing
quarantines, idle nights, no file yet). The alternative — hedging doctor's
message text to a weaker promise — is the relay's non-preferred option: it
trades a user-facing property away to avoid a one-condition mechanism.

Per weighted closure, finding 14 changes what the implementer builds; since no
external round has run yet, the fix lands in the revision pass and **round 1 is
the fresh external round that follows it** — no extra round is spent.

## 5. Round-zero outcome

- Template conformance: PASS, four of four, nothing silently absent.
- Internal coherence: 16 findings (15 LIGHT mechanical, 1 HEAVY contract
  question routed to the owner), every proposed disposition **fix**; zero
  residuals, zero drops proposed.
- Owner ruling pending on the batch and on finding 14's resolution; once
  ruled, the revision pass (wd-architect) applies the fixes, the mirror walk
  on the six citation fixes and the re-run of the two touched gates (11, 16)
  verify the LIGHT class mechanically, and finding 14's fix is verified by
  round 1 (the first external round, fresh after the HEAVY fix by ordering).

# WP-temp-root-wrapper — review round record

Spec: `docs/specs/WP-temp-root-wrapper.md`, Draft, authored 2026-08-20.
Pinned base for round zero: spec commit `7f051be` (bytes verified unchanged
through `78eb84f` by the coherence pass itself).

## Stop criterion (pinned before round 1, per the runbook rule)

- Round 1 (external) **closes the loop** if it lands zero HEAVY findings —
  HEAVY meaning the fix changes what the implementer builds (wrapper behavior,
  the package.json contract, anything a consuming run observes). LIGHT
  findings (spec wording, verification machinery, mirror bookkeeping) are
  fixed and verified mechanically, or accepted as named residuals; they do
  not extend the loop.
- A HEAVY finding **escalates**: fix lands, then one full fresh external
  round, this criterion re-stated in that round's row.
- Two consecutive rounds landing findings of the same kind → the next step is
  a design question put to the owner, never another textual patch
  (ADR-0031 circuit breaker).

## Rounds

| Round | What | Raw file | Raw committed as | Result |
|---|---|---|---|---|
| 0a | Template conformance (clean context, spec+template only) | `2026-08-20-temp-root-wrapper-r0-template-conformance-raw.md` | `a7f4f15` | PASS — 0 blocking, 3 non-blocking deviations |
| 0b | Internal coherence + runnable claims (78 checked, full suite ×3 under isolated temp root) | `2026-08-20-temp-root-wrapper-r0-internal-coherence-raw.md` | `78eb84f` | 7 coherence findings, 2 measured-claim failures, 4 corrections; mechanism and filesystem facts hold |
| 0c | Fix wave `38f7823` (the twelve accepted fixes) + mechanical re-verification | `2026-08-20-temp-root-wrapper-r0-fixverify-raw.md` | `279c7d9` | all twelve hold (A1's old hole demonstrably closed: five wrapper variants, each red attributable); three residual items N1–N3 below |
| 1 | External adversarial round | — | — | pending; runs after round-zero dispositions land |

## Round-zero dispositions

Owner ruled 2026-08-20: batch accepted as proposed — every finding LIGHT, twelve
fixes, one named-residual group. Value line for the wave: each fix protects the
spec's evidentiary reliability (numbers a reviewer can re-measure, verification
steps that discriminate); the residuals are conformance cosmetics whose fixing
would protect nothing.

| # | Finding (short) | Weight | Disposition |
|---|---|---|---|
| A1 | Verification step 8 tests only one of the two must-not-inject variables, and its `VAR=` form passes on present-but-empty | LIGHT | FIX — step 8 asserts BOTH variables, in a truly-unset env |
| A2 | "same pass/skip counts" AC cites a skip count the spec never records (measured: 9) | LIGHT | FIX — record 2028 pass / 0 fail / 9 skip in Current state |
| A3 | Mirrored Surface Checklist claims literal-text mirroring of the `//` note in three places; all three check presence + substring only | LIGHT | FIX — checklist claim weakened to presence + wrapper substring |
| A4 | The "guard cases demonstrated by a real red run" AC has no deliberate-red entry | LIGHT | FIX — the two guard-case reds join the deliberate-red list |
| A5 | Table A "exits with exactly that status" contradicts its own `status == null → 1` branch | LIGHT | FIX — row split: non-zero propagates exactly; null → 1 |
| A6 | Table B never states the six + two exclusions exhaust the scripts object | LIGHT | FIX — one clause: six + two exclusions + the `//` note exhaust the scripts object |
| A7 | Frontmatter `adrs:` omits ADR-0031 while the body activates it | LIGHT | FIX — ADR-0031 added to frontmatter adrs |
| B7 | "~90 distinct wd-* prefixes" measured false (257 distinct; 92 recurring) | LIGHT | FIX — 257 distinct / 92 recurring |
| B20 | "~39-second suite" does not reproduce (45.1–45.9 s ×3); the ratio drawn from it still holds | LIGHT | FIX — reworded as a machine-dependent approximation |
| B6 | 1,677 dirs incl. Node's `node-compile-cache`; 1,676 test-created (1,670 `wd-*` + 6 `gen-agents-md-*`) — the prose's pronoun over-covers | LIGHT | FIX — one clarifying sentence |
| B39 | `tests/unit/exec-identity.test.js:229` hardcodes `/tmp`, outside the wrapper's redirection and step 2's count; self-cleans | LIGHT | FIX — one naming sentence; no code change |
| B3/B23 | Minor: three comment lines not "two comments"; `run-scenarios.js` also sets `process.exitCode = 0`, so the two guard descriptions don't distinguish the files | LIGHT | FIX — factual corrections |
| T1–T3 | Template deviations: missing author-facing scaffolding bullet; contract tables renamed Table A/B; H1 reworded vs `title` | LIGHT | NO ACTION — named residuals |

All dispositions LIGHT → per the pinned stop criterion, fixes are verified
mechanically (re-measurement of the corrected claims) and round 1 follows
without a fresh round being triggered by this wave.

## Fix-verification residuals (from round 0c)

| # | Finding (short) | Weight | Disposition |
|---|---|---|---|
| N1 | Step 5's declared deliberate-red cannot fire: skip-mode runs create zero temp entries, so the count is 0→0 with or without injection (measured both ways) | LIGHT | FIX — step 5 leaves that deliberate-red entry (owner ruled 2026-08-20) |
| N2 | The extended AC says "Table A's three exit-status rows"; there are four — it omits "teardown never overrides a failure" | LIGHT | FIX — count corrected, fourth row named (owner ruled 2026-08-20) |
| N3 | The AC promises `null` status → `1` but nothing exercises it; a conforming wrapper was measured to do the right thing (signal-killed child → exit 1), so step 7 needs one added line | LIGHT | FIX — signal case added to step 7 (owner ruled 2026-08-20); closes the null-branch gap flagged at the fix wave |

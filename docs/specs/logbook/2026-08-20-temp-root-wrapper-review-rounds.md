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
| 1 | External adversarial round | — | — | pending; runs after round-zero dispositions land |

## Round-zero dispositions

Recorded after the owner's ruling; proposals relayed 2026-08-20.

| # | Finding (short) | Weight | Disposition |
|---|---|---|---|
| A1 | Verification step 8 tests only one of the two must-not-inject variables, and its `VAR=` form passes on present-but-empty | LIGHT | (pending) |
| A2 | "same pass/skip counts" AC cites a skip count the spec never records (measured: 9) | LIGHT | (pending) |
| A3 | Mirrored Surface Checklist claims literal-text mirroring of the `//` note in three places; all three check presence + substring only | LIGHT | (pending) |
| A4 | The "guard cases demonstrated by a real red run" AC has no deliberate-red entry | LIGHT | (pending) |
| A5 | Table A "exits with exactly that status" contradicts its own `status == null → 1` branch | LIGHT | (pending) |
| A6 | Table B never states the six + two exclusions exhaust the scripts object | LIGHT | (pending) |
| A7 | Frontmatter `adrs:` omits ADR-0031 while the body activates it | LIGHT | (pending) |
| B7 | "~90 distinct wd-* prefixes" measured false (257 distinct; 92 recurring) | LIGHT | (pending) |
| B20 | "~39-second suite" does not reproduce (45.1–45.9 s ×3); the ratio drawn from it still holds | LIGHT | (pending) |
| B6 | 1,677 dirs incl. Node's `node-compile-cache`; 1,676 test-created (1,670 `wd-*` + 6 `gen-agents-md-*`) — the prose's pronoun over-covers | LIGHT | (pending) |
| B39 | `tests/unit/exec-identity.test.js:229` hardcodes `/tmp`, outside the wrapper's redirection and step 2's count; self-cleans | LIGHT | (pending) |
| B3/B23 | Minor: three comment lines not "two comments"; `run-scenarios.js` also sets `process.exitCode = 0`, so the two guard descriptions don't distinguish the files | LIGHT | (pending) |
| T1–T3 | Template deviations: missing author-facing scaffolding bullet; contract tables renamed Table A/B; H1 reworded vs `title` | LIGHT | (pending) |

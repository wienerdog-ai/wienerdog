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
| 0d | N-wave: fixes `aea64e2` + re-verification (appended to fixverify raw) + N1 umbrella completion `d928a81` (relay grep-verified) | `2026-08-20-temp-root-wrapper-r0-fixverify-raw.md` (append) | `99f649d` | N2, N3 hold exactly (both reds discriminating); N1 holds after the umbrella completion. **Round zero closed.** |
| 1 | External adversarial round (backend: gptsol, vendored `adversarial.md`; read-only verified; suite not run — disclosed) | `2026-08-20-temp-root-wrapper-round-1-raw.md` | `12fc563` | needs-attention, 5 findings; citations relay-verified against the spec at `5eaa897`; dispositions below |

## Round-1 dispositions

Owner ruled 2026-08-20: batch accepted as proposed. Zero HEAVY — none of the
dispositions changes what the implementer builds; per the pinned stop
criterion the loop closes after these fixes land and are mechanically
verified. Value line: F1/F2 make the spec's claims exactly as strong as the
mechanism (no over-claim survives); F3–F5 give three Table A product rows a
discriminating guard each, in the smallest form.

| # | Finding (short) | Weight | Disposition |
|---|---|---|---|
| F1 | Wrapper's own signal death skips `finally` (measured); child can outlive the wrapper | LIGHT | RESIDUAL re-affirmed (owner ruling of the earlier walkthrough, decision 6) + wording fix: the accepted-gap text absorbs both measured facts. An async-lifecycle fix was offered and declined as HEAVY/out-of-size |
| F2 | lstat-then-chmod is a TOCTOU race; a live descendant could swap dir→symlink and the walk would chmod outside the root | LIGHT | FIX — narrow the security claim to the real threat model (leftover artifacts of trusted test code, not concurrent hostile writers; a surviving writer is itself a bug the hard fail surfaces). No mechanism change |
| F3 | Env passthrough (Table A row) has no verification: a var-deleting wrapper passes step 8 | LIGHT | FIX — add a passthrough assert: caller-supplied distinct values must reach the child byte-exact |
| F4 | Step 4's forwarding commands pass even if the wrapper drops every argument | LIGHT | FIX — synthetic argv-echo child, byte-exact assert on forwarded args |
| F5 | The one-session verification block can mask an intermediate red (no fail-fast; cleanup exits 0) | LIGHT | FIX — fail-closed block: `set -e` + EXIT-trap cleanup + explicit carve-outs where non-zero is expected |

## Round-1 fix wave and closure

| Round | What | Raw file | Raw committed as | Result |
|---|---|---|---|---|
| 1-fix | Fix wave `1f3a723` (five fixes + Mirrored Surface Checklist walk, which caught four extra stale mirrors) + mechanical re-verification | `2026-08-20-temp-root-wrapper-r0-fixverify-raw.md` (append) | `c224e1c` | F1–F5 all hold (each machinery fix proved discriminating both directions; pipefail measured load-bearing); all gates green; three LIGHT residuals R1-a/b/c below |

Per the pinned stop criterion, round 1 landed **zero HEAVY** findings and its
LIGHT fixes are mechanically verified: **the loop is closed.** Machinery
findings at closure are fixed or named residuals and do not extend the loop.

| # | Residual (short) | Weight | Disposition |
|---|---|---|---|
| R1-a | The split env criteria contradict each other in prose (criterion 1 absolute, criterion 2 scoped); Table A and steps 8a/8b already implement the scoped reading | LIGHT | FIX — criterion 1 scoped to the caller-lacks case; the two criteria now partition the input space (owner ruled 2026-08-20) |
| R1-b | The env-passthrough checklist item says "the same acceptance criterion" where that half now has its own | LIGHT | FIX — "its acceptance criterion" (owner ruled 2026-08-20) |
| R1-c | The both-sides umbrella demands a red for every step except 5, but the red list has no step-9 entry (trivially producible) | LIGHT | FIX — step-9 red added; red-list coverage now mechanically diffed against the umbrella's NEW set, complete (owner ruled 2026-08-20) |

R1 fixes landed as `03d1ad8` and were relay grep-verified (scoping clause
present and "sees neither" occurs only inside it; old phrasing gone; step-9
red at its place in step order). The author's mirror walk found nothing new —
the first clean walk of this spec. **Loop closed.** Owner sign-off received 2026-08-20 (summary-based, with the
one undiscussed frontmatter decision — `model: sonnet` — surfaced explicitly
and ratified); `Draft → Ready` flipped in the same commit as this line.

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

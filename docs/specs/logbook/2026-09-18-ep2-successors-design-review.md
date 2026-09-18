---
date: 2026-09-18
title: "Design gate for the ep2 successors — round dispositions"
related_wps: [WP-ep2-n2-rehome, WP-ep2-prune-once-per-run-test, WP-secret-fence-ep2-redact-arm, WP-ep2-retention-prune-timing-test]
---

# Design gate — `WP-ep2-n2-rehome` and `WP-ep2-prune-once-per-run-test`

One row per finding, per round. **Band** is the reviewer's own severity; **weight**
is the runbook's LIGHT/HEAVY classification of the fix; **disposition** is what the
architect did, and every finding has one — fixed or explicitly declined, never
silently dropped.

## Round 1 — Astra, medium, adversarial

- **Raw:** `docs/specs/logbook/2026-09-18-ep2-successors-design-r1-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-ep2-successors-design-r1-astra-focus.txt`
- **Committed at:** `6b9e515d`
- **Reviewed tip:** `1e13759a`, branch diff against `08de2bc3`
- **Verdict:** `needs-attention`, one finding

| # | finding | band | weight | disposition |
|---|---------|------|--------|-------------|
| **R1-1** | **The detector misses the regression N2 exists for.** `WP-ep2-prune-once-per-run-test.md:240-243`: with **49** seeded files, per-redaction pruning and correct once-per-run pruning both attempt **one** intercepted delete (the first call sees 50, returns at the cap; the second sees 51 and deletes once), so only the duplicate-at-the-end mutation separates. Astra executed the helper against simulated entries to confirm | **B** (medium) | **LIGHT** — verification machinery, no contract rule changes. *Recorded as LIGHT and flagged anyway: it is the whole content of the package, which is why a confirming round follows* | **FIXED as recommended.** Seed count **49 → 50**, so the directory ends **two** over the cap and every schedule separates. Table P rows **P-4, P-6, P-7, P-8, P-9, P-10** rewritten; the RED declaration now carries **two** proofs, one per single-file schedule; **V-2** rewritten to validate both and proven both ways; Mirrored Surface Checklist gains the seed-count/expected-count pairing; Implementation notes gain the seed-count rule. **All three schedules re-measured by hand** — see below |
| **R1-2** | **Round zero, cite:** `src/cli/dream.js:33-38` for the require-time destructure is off at both ends; the statement is `:34-39`. Appears in the rehome Current state and in the test WP's `S-1` and Current state | — | **LIGHT** | **FIXED.** Both specs now cite `:34-39` and name the two boundary lines |
| **R1-3** | **Round zero, count:** the rehome Current state says `grep -rn 'pruneRedacted' src/` returns four hits; it returns **five** — `validate.js:1174` matches because `pruneRedactedOriginals` contains the string. The one-call-site claim stands | — | **LIGHT** | **FIXED.** The bullet now enumerates all five and states which one is the invocation, deferring to N2R-5 for the claim |
| **R1-4** | **Round zero, enrichment:** the `S-2` three-reads chain is exact; the two non-prune reads reach `private-fs.js:393` through `regenerateDigest`, which a successful run calls twice (`dream.js:1300`, `:1341`) | — | **LIGHT** | **FIXED.** `S-2` now names the outer callers as well as the inner chain |

Everything else Astra checked was verified exact: Table M's sixteen rows and their
verdict tally, the eight-occurrence routed-slug count across seven lines, and every
locus at both ends.

## Round 2 — Astra, confirming

- **Raw:** `docs/specs/logbook/2026-09-18-ep2-successors-design-r2-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-ep2-successors-design-r2-astra-focus.txt`
- **Committed at:** `5ced42cd`
- **Reviewed tip:** `02ad7838`
- **Verdict:** `approve`, **no findings**

| # | finding | band | weight | disposition |
|---|---------|------|--------|-------------|
| — | none | — | — | **R1-1 confirmed closed by execution**: Astra ran the real prune helper against mocked directory entries and reproduced the revised counts (control 2, (a) 4, (b) 5, (c) 3) and the zero-redaction guard. Its own scope note is recorded rather than smoothed over — *"Full pipeline tests were not run"* — which is exactly why P-10's numbers stay the hand-measured whole-suite runs below and P-11 keeps the unfiltered `npm run red-proofs` as the implementer's evidence |

## Gate closed

**The design gate is CLOSED at round 2, 2026-09-18** — round 1 LIGHT by the
runbook's classification but load-bearing (it was the package's whole contract),
so a confirming round was run; round 2 approved with no findings. Both specs move
to `status: Ready`.

**This is a review gate and nothing more.** It is not owner approval and grants
nothing the owner has not been asked for. **Owner item O-1** — whether
`WP-ep2-n2-rehome` may change the routed-WP slug inside ADR-0036 row A3, which is
`Accepted, OWNER-SIGNED 2026-07-28` — **remains OPEN**, in the standing form under
that spec's "Dispatch precondition — owner items", with its recommendation and its
overrule cost. It must be answered before that package is dispatched.

### The three regression schedules, re-measured by hand at `08de2bc3`

Each mutation applied to a worktree carrying the candidate test, the **whole** suite
run each time, then reverted. **Every mutated run gives
`tests 2905, pass 2892, fail 1, skipped 12`, the single failure being the new test
and nothing else in the repository reddening.**

| schedule | mutation | files | declared? | delete-path count |
|----------|----------|-------|-----------|-------------------|
| control | — | — | — | **2** — `tests 2905, pass 2893, fail 0, skipped 12` |
| **(a) duplicate at the call site** | a second `gates.pruneRedacted();` beside `src/cli/dream.js:1102` | 1 | **yes** — proof `ep2-prune-runs-once-per-run` | **4** |
| **(b) per-redaction, added** | `pruneRedactedOriginals(stateDir, redactedCreated);` after `completedRedactions += 1;` (`validate.js:1418`), end call left in place | 1 | **yes** — proof `ep2-prune-not-once-per-redaction` | **5** |
| **(c) per-redaction, moved** | (b) with the `dream.js:1102` call removed — a true move | 2 | **no** — a RED proof mutates one file; hand-measured provenance only | **3** |

**Under the 49-seed fixture the finding reproduces exactly as stated:** the earlier
measurement of (a) reported **2** deletes against a control of **1**, and (b) and
(c) would both have produced **1** — indistinguishable from the control. The
schedule Astra named is the one M-48 itself describes, so the defect was a detector
that missed its own contract row's historical mutation.

### Note on M-48

`WP-ep2-n2-rehome` re-keys M-48 to schedule **(a)** only, byte-for-byte with proof
(a). ADR-0036 row A3 permits exactly one mutation per row, so schedules (b) and (c)
get no row in the `Done` ep2 spec; they belong to the successor's declaration and to
this entry.

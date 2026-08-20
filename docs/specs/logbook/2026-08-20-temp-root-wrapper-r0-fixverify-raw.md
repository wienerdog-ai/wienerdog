---
date: 2026-08-20
title: "WP-temp-root-wrapper — mechanical re-verification of the round-zero fix wave, raw output"
related_wps: [WP-temp-root-wrapper]
---

# Round-zero fix wave — mechanical re-verification (raw)

**Spec commit:** `38f7823` (`docs(specs): apply the twelve round-zero fixes
(WP-temp-root-wrapper)`)
**HEAD verified:** yes — `git log --oneline -1` → `38f7823`;
`git merge-base --is-ancestor 38f7823 HEAD` → exit 0. Diff touches only
`docs/specs/WP-temp-root-wrapper.md` (+82 / −33).
**Date:** 2026-08-20
**Scope:** mechanical re-verification of the fix wave, not a fresh round. Only
what a fix touched was re-measured; everything else is trusted from the
committed r0 raw
(`2026-08-20-temp-root-wrapper-r0-internal-coherence-raw.md`).
**T1–T3 template deviations:** ruled named residuals, untouched, not re-checked.
**Reviewer:** same round-zero reviewer; took no part in the fix.
**Full suite runs this wave:** **0** — none was needed.

**Safety posture.** `WIENERDOG_RUN_SCENARIOS` was never set to `1`; the five
scenario scripts were exercised in skip mode only, with
`WIENERDOG_TEST_NO_REAL_SCHEDULER=1` set on every one. No `bin/wienerdog.js`
verb was run. Every counted step ran under a fresh `mktemp -d` root with
`TMPDIR`/`TMP`/`TEMP` exported to it, torn down with `chmod -R u+rwx` then
`rm -rf` (residue verified empty). The one place a guard variable was
deliberately *removed* is the A1 probe, where `env -u` is the behavior under
test and the child is a two-line environment probe, not a test invocation — no
Wienerdog code is loaded by it.

**Stand-in wrapper.** `tests/with-temp-root.js` must not exist yet, so the
executable checks below run against
`/tmp/wd-r0-fixverify/wrapper-variant.js` — a stand-in implementing Table A's
env-injection, teardown and exit-status rows, with switchable breakages
(`no-inject`, `no-walk`, `always0`, `guard-empty`, `guard-one`, `scen-empty`,
`scen-one`). Driver scripts: `/tmp/wd-r0-fixverify/step8.sh`, `step5.sh`,
`step67.sh`. Nothing was written inside the repo except this logbook entry.

---

## Per-finding verdicts

| Finding | What was re-checked | Command / observation | Verdict |
|---|---|---|---|
| **A1** — must-not-inject mirror carried only half the contract | The rewritten verification step 8 run **verbatim** against five wrapper variants, plus the old form as a control | `bash /tmp/wd-r0-fixverify/step8.sh` → `correct` **GREEN**; `guard-empty` **RED** (`…SCHEDULER=""`); `guard-one` **RED** (`…="1"`); `scen-empty` **RED** (`…RUN_SCENARIOS=""`); `scen-one` **RED** (`…="1"`). Old form control: `guard-empty` → **GREEN**, i.e. the exact hole A1 named, now closed | **holds** — both variables discriminated independently, and unset is now distinguished from present-but-empty |
| **A1 (AC tightening)** | The extended AC ("sees neither … — not even as a present-but-empty value — unless the caller's own environment had them") against Table A's cell and against step 5, which deliberately *does* set the guard in the caller env | Read `docs/specs/WP-temp-root-wrapper.md` Table A "What it must NOT inject" vs AC vs step 5; step 8 uses `env -u`, so the caller's env genuinely lacks both | **holds** — no new contradiction. The pass-through case (caller's own env) stays permitted and step 5 still relies on it. The Mirrored Surface Checklist item claiming "all three move together" is now **true** |
| **A2** — AC cited a skip baseline the spec did not record | The new AC text vs Current state vs the r0 measurement | Spec now records `2028 pass / 0 fail / 9 skipped`, 2037 tests, "reproduced three times"; r0 measured exactly `tests 2037 / pass 2028 / fail 0 / skipped 9`, three times. AC also now says `tests/run.js` byte-identity is against the copy "Current state inlines in full" (r0 byte-compare: identical) | **holds** |
| **A3** — `"//"` literal text had no mirror carrying it | Rewritten checklist item vs each of the three named mirrors | Checklist `:301-306` now says Table B is the only literal holder and the three mirror it as presence + substring, deliberately. Confirmed: Deliverables cell `:221` (no literal), AC `:381-384` ("present and names `tests/with-temp-root.js`"), step 10 `:520` (`.includes("tests/with-temp-root.js")`), Table B `:282` (literal) | **holds** — the checklist now describes what the mirrors actually do |
| **A4** — no deliberate red for the guard test | (a) the two new guard-test reds; (b) per the brief, whether **every** entry in the red list is discriminating | (a) Red list `:551-556` now requires `tests/unit/tmpdir-leak-guard.test.js` red twice — once with env injection removed, once with the permission-restore walk removed — and states why the shell steps cannot stand in. Consistent with the guard-cases AC `:408-410`. (b) swept mechanically, see the table below | **holds for the fix**; the sweep surfaced **N1** (below) |
| **A5** — "exits with exactly that status" contradicted its own null branch | (i) the split row set for internal consistency; (ii) the row set against `tests/run.js`; (iii) the extended AC for new contradictions | (i) Table A `:265-268` now has four rows: numeric → exactly that number; `null` → `1` ("There is no status to propagate in this branch"); teardown never overrides; child passed. No branch is claimed twice and none is unmade. (ii) `tests/run.js` really does contain `r.status == null ? 1 : r.status` (r0 byte-compare) — the cited convention is real. (iii) mechanically, a conforming wrapper returns `1` for a SIGKILL-ed child: `bash /tmp/wd-r0-fixverify/step67.sh` → `signal-killed child -> wrapper exit=1` | **holds for the row set itself**; the AC extension introduced **N2** and **N3** (below) |
| **A6** — Table B never stated the six/two partition was exhaustive | The new "The partition is exhaustive today" row against `package.json` | `node -e` over `require("./package.json").scripts` → **count: 8** — `test, lint, gen:agents, scenarios, scenarios:negative, broker:selfcheck, scenarios:broker-e2e, scenarios:a7-integrity`. Six routed + two excluded = eight, exactly as the row claims. The row also carries the honest caveat about a future seventh script | **holds** |
| **A7** — frontmatter omitted the ADR the body activates | `adrs:` line | `sed -n '1,10p'` → `adrs: [ADR-0004, ADR-0031]` | **holds** |
| **B7** — "~90 distinct `wd-*` prefixes" | The replaced numbers against the r0 measurement | Spec now reads "**257 distinct prefixes** (stripping `mkdtempSync`'s six random characters), of which **92 occur more than once**". r0 measured 257 distinct; 165 seen exactly once → 257 − 165 = **92** seen more than once. The parenthetical also names the counting rule, so the number is now reproducible | **holds** (exact) |
| **B20** — "~39-second suite" | The replaced timing prose | Spec now reads "against a suite that runs in well under a minute (measured between 39 s and 46 s across sessions — a load- and machine-dependent number, so treat the ratio, not the seconds, as the point)". r0 measured 45.2 s, 45.9 s and `duration_ms 45056`; the author's original prototype figure was 39 s. The stated range covers both and the claim is now framed as a ratio | **holds** |
| **B6** — 1,676 vs 1,677 entries | The rewritten "Scale of the leak" paragraph and prototype measurement 1 | Spec now reads "**1,677 entries** … all directories, zero files. Of those, **1,676 are test-created** (1,670 `wd-*` plus 6 `gen-agents-md-*`); the remaining one is `node-compile-cache`, Node's own artifact". Arithmetic: 1,670 + 6 = 1,676; +1 = 1,677 ✓, and it matches r0's `lstat` sweep exactly. Prototype measurement 1 updated in step ("1,677 entries … the 1,676 test-created ones plus Node's `node-compile-cache`"). The added sentence "Every per-run figure below counts the 1,670 `wd-*` directories" is consistent with the producer counts (145+143+80+70+66 all fall inside the 1,670) | **holds** |
| **B39** — one `mkdtempSync` site the redirection cannot reach | The new "One call site the redirection cannot reach" paragraph, incl. both line citations | "301 of the 302 … resolve through `os.tmpdir()`" matches r0's classification exactly. `grep -n` on `tests/unit/exec-identity.test.js`: `:229` is `const tmpDir = fs.mkdtempSync('/tmp/wd-execid-out-');` ✓; `:235` is `} finally {` ✓ (the `rmSync` itself is one line later at `:236`). The paragraph's macOS reasoning — the site lands outside step 2's counting window because ambient temp is `/var/folders/…` — matches the r0 `mktemp`/`os.tmpdir()` measurements | **holds** — the cited construct is at the cited line; the cleanup call sits at `:236`, one line below the `finally` the spec points at |
| **B3** — "two comments" vs three comment lines | The rewritten sentence and all three citations | Spec now reads "three comment lines across two files (`tests/unit/scheduler-leak-guard.test.js:475` and `:755`, `tests/unit/scheduler-guard.test.js:14`)". Opened each: `:475` = "(WIENERDOG_TEST_NO_REAL_SCHEDULER=1 from tests/run.js) is not disturbed."; `:755` = "disable its own detector — and tests/run.js sets the second one for the"; `scheduler-guard.test.js:14` = "from tests/run.js) is not disturbed for other tests." `grep -rn "tests/run\.js" tests/` returns exactly 3 lines | **holds** (exact) |
| **B23** — the two `main()` guards described as if different | The rewritten bullets and the `:284` citation | Spec now reads `run-scenarios.js:282` — "prints, sets `process.exitCode = 0` (`:284`) and returns" and `run-negative.js:457` — "identical shape". Opened both: `run-scenarios.js` `:282` guard, `:283` log, **`:284` `process.exitCode = 0;`**, `:285` `return;`; `run-negative.js` `:457` guard, `:458` log, `:459` `process.exitCode = 0;`, `:460` `return;` — genuinely identical shape | **holds** (exact) |

### Deliberate-red discriminating-power sweep (per the A4 brief)

Each entry was run against a correct stand-in wrapper and against the wrapper
broken exactly as the list describes. A red that fires only in the broken case
discriminates.

| Red-list entry | Correct wrapper | Broken as described | Discriminating? |
|---|---|---|---|
| step 2 — three temp variables removed | not run (full suite; r0 measured 1,670 `wd-*` leaked with no redirection, so `BEFORE ≠ AFTER` by construction) | — | yes, by construction |
| **step 5 — three temp variables removed** | `before=0 after=0` → **GREEN** | `before=0 after=0` → **GREEN** | **NO — see N1** |
| step 6 — three temp variables removed | `before=0 after=0` → GREEN | `before=0 after=2` → **RED** | yes |
| step 6 — permission-restore walk removed | `before=0 after=0` → GREEN | `before=0 after=1`, wrapper exit 1 → **RED** | yes |
| step 7 — exit rule always `0` | `propagated=7` → GREEN | `propagated=0` → **RED** | yes |
| step 8 — `WIENERDOG_TEST_NO_REAL_SCHEDULER: '1'` injected | GREEN | **RED** | yes |
| step 8 — `WIENERDOG_RUN_SCENARIOS: '1'` injected | GREEN | **RED** | yes (and independently of the other variable) |
| step 10 — `"//"` key removed | — | `node -e …` on today's key-less `package.json` → `note: <missing>`, **exit 1** | yes |
| guard test — env injection removed | — | not runnable (deliverable absent); the guard test's injection case is required by the "injects only TMPDIR/TMP/TEMP" AC, so a removal must fail it | yes, in principle |
| guard test — permission-restore walk removed | — | not runnable (deliverable absent); the mode-`0o000` AC requires the guard test to construct that case itself, so a removal must fail it | yes, in principle |

Commands: `bash /tmp/wd-r0-fixverify/step5.sh`, `bash
/tmp/wd-r0-fixverify/step67.sh`, `bash /tmp/wd-r0-fixverify/step8.sh`, and the
step-10 `node -e` line verbatim from the spec.

---

## New findings introduced or surfaced by this wave

### N1 — verification step 5's deliberate red cannot fire

The red list still says "steps 2, **5** and 6: with the three temp variables
removed from the wrapper's env". Step 5's assertion is a `wd-*` count taken
around five **skip-mode** scenario runs — and skip-mode runs create **nothing**
in the temp directory at all. Measured twice (r0 and again this wave): all five
scripts exit 0 having created zero entries. So the count is `0 → 0` whether the
wrapper injects the temp variables or not:

```text
wrapper=correct    before=0 after=0 -> GREEN (assertion passes)
wrapper=no-inject  before=0 after=0 -> GREEN (assertion passes)
```

The declared red is therefore unfirable, and the spec-authoring runbook's
both-sides rule ("so a check that can never fail is caught") is not satisfied
for step 5. Step 5 remains valuable as a *positive* check — that the five
scripts still exit 0 in skip mode through the extra hop — but it cannot serve as
evidence that env injection works. Pre-existing (this entry was in the original
list); surfaced now because the A4 disposition asked for the whole list to be
swept for discriminating power. Smallest honest fix: drop `5` from that red
list entry, or replace step 5's count assertion with one that can fail.

### N2 — the extended exit-status AC miscounts Table A's rows

The new AC reads:

> Exit status follows Table A's **three** exit-status rows: a non-zero numeric
> child status reaches the caller unchanged, a `null` status (signal death /
> spawn failure) becomes `1`, and a passing child exits 0.

Table A now carries **four** rows whose name begins `Exit status —` (lines
265–268): *child failed with a numeric status*, *child died on a signal or
failed to spawn*, *teardown never overrides a failure*, *child passed*. The AC
enumerates three behaviors, matching rows 1, 2 and 4, and silently omits row 3.
`grep -c "^| Exit status" docs/specs/WP-temp-root-wrapper.md` → **4**. A count
that does not match its list — the same defect class the A5 disposition was
meant to remove, reintroduced one line away from the fix.

### N3 — the extended AC adds a behavior no verification step exercises

The AC now requires that "a `null` status (signal death / spawn failure) becomes
`1`". Verification step 7 tests only `process.exit(7)`, and the red list's step-7
entry ("with the exit rule changed to always exit `0`") is likewise numeric-only.
Nothing in the verification block runs a child that dies on a signal or fails to
spawn, so the newly-promoted branch has no green side and no red side.

Mechanically, the branch is cheap to cover — a conforming implementation already
behaves correctly:

```text
signal-killed child -> wrapper exit=1 (Table A row 2 requires 1)
```

Before the fix, Table A's muddled single row meant nobody was promised this
behavior; now the AC promises it and no step checks it. Smallest honest fix: add
one line to step 7 spawning a self-`SIGKILL`ing child and asserting `RC` is `1`.

---

## Conformance gates

| Gate | Command | Exit | Verdict |
|---|---|---|---|
| Frontmatter schema | `node scripts/check-frontmatter.js` | **0** — "frontmatter check passed: 221 spec(s), 4 agent(s)" | passes |
| Markdownlint (repo config) | `npx --no-install markdownlint-cli2 --config package.json --configPointer /markdownlint-cli2 "docs/specs/WP-temp-root-wrapper.md"` | **0** — "Summary: 0 error(s)" | passes |
| Boundary check, positive | `node scripts/boundary-check.js docs/specs/WP-temp-root-wrapper.md tests/with-temp-root.js tests/unit/tmpdir-leak-guard.test.js package.json` | **0** | passes |
| Boundary check, negative control | `node scripts/boundary-check.js docs/specs/WP-temp-root-wrapper.md tests/run.js` | **1** — "Files outside the spec's Deliverables table: tests/run.js" | passes (correctly rejected) |

---

## Summary

**Every one of the twelve fixes holds.** All thirteen round-zero findings
(A1–A7, B7, B20, B6, B39, B3/B23) are correctly and accurately addressed
against measured reality; every line number the fixes newly cite was opened and
confirmed exact.

**Three items remain**, all small and all in the exit-status / deliberate-red
area: **N2** and **N3** were introduced by the A5 acceptance-criterion
extension (a four-row table described as three rows; a promoted `null`-status
behavior with no verification step), and **N1** is a pre-existing unfirable red
for step 5 that the A4 discriminating-power sweep surfaced.

---

# N-wave re-verification, spec commit `aea64e2`

*Appended 2026-08-20. Everything above this heading is the earlier, committed
`38f7823` evidence and is left unchanged.*

**Spec commit:** `aea64e2` (`docs(specs): apply the three fix-verification
residual fixes (WP-temp-root-wrapper)`)
**HEAD verified:** yes — `git log --oneline -1` → `aea64e2`;
`git merge-base --is-ancestor aea64e2 HEAD` → exit 0. Diff touches only
`docs/specs/WP-temp-root-wrapper.md` (+24 / −7).
**Scope:** N1, N2, N3 only, plus the four conformance gates. Nothing else
re-measured.
**Full suite runs this wave:** **0**.
**Safety:** `WIENERDOG_RUN_SCENARIOS` never set; no scenario script and no
`bin/wienerdog.js` verb run at all this wave; the step-7 children are two
one-line scripts. The counted work ran under a fresh `mktemp -d` root with
`TMPDIR`/`TMP`/`TEMP` exported to it, removed afterwards (verified).
**Stand-in wrapper:** `/tmp/wd-r0-fixverify/wrapper-variant.js`, extended this
wave with a `null-zero` variant (numeric statuses still propagate, the `null`
branch maps to `0`). Driver: `/tmp/wd-r0-fixverify/step7-nwave.sh`.

## N1 — step 5 removed from the deliberate-red list

**What was re-checked.** (a) the rewritten red-list entry; (b) whether any other
list, count or range in the spec still places step 5 on the must-go-red side.

**Observed.** The entry at `:549-553` now reads "steps 2 **and 6**" and adds the
reason: step 5's "count is taken around skip-mode runs, which create nothing in
the temp directory at all, so it reads `0 → 0` with or without injection
(measured both ways) and cannot go red. It earns its place in the block as a
regression check that the five entry points still exit 0 through the wrapper,
not as a discriminating count." That matches this reviewer's measurement exactly
(`wrapper=correct before=0 after=0 GREEN` / `wrapper=no-inject before=0 after=0
GREEN`).

Sweep for other claims — `grep -n "step 5\|steps 2\|Steps 2\|skip-mode loop"`:

| Line | Text | Claims a step-5 red? |
|---|---|---|
| `:293` | Mirrored Surface Checklist — "the skip-mode loop" | no |
| `:512` | step 8's comment — "would turn step 5's skip-mode runs into live … ones" | no |
| `:549` | the rewritten red-list entry | no — states the opposite, correctly |
| **`:540-543`** | "**Steps 2 and 5–10** are NEW, and each is an assertion that exits non-zero on failure … Per `docs/runbooks/spec-authoring.md`, **each must be observed on both sides — paste a real green on the finished state AND a real red from a deliberately broken state.**" | **YES** |

**Verdict: does not fully hold.** The red-list entry itself is fixed, accurate
and well-reasoned. But the umbrella sentence at `:540-543` still sweeps step 5
into the range `5–10` and demands, for every step in that range, exactly the
"real red from a deliberately broken state" that the new list entry nine lines
later says step 5 cannot produce. The two passages now contradict each other
directly. Smallest honest fix: change the range to "Steps 2 and 6–10" and let
step 5 keep the green-only role the new list entry gives it (or add "except step
5, which is green-only — see the red list below" to the umbrella sentence).

## N2 — the exit-status row count

**What was re-checked.** The AC's stated count and its enumeration against Table
A's actual rows.

**Observed.** `grep -c "^| Exit status" docs/specs/WP-temp-root-wrapper.md` →
**4**. The four rows (`:265-268`) and the AC's four clauses (`:403-406`) map one
to one:

| Table A row | AC clause |
|---|---|
| `:265` child failed with a numeric status → exits exactly that number | "a non-zero numeric child status reaches the caller unchanged" |
| `:266` child died on a signal or failed to spawn → exits `1` | "a `null` status (signal death / spawn failure) becomes `1`" |
| `:267` teardown never overrides a failure | "a teardown problem never overrides either failure" |
| `:268` child passed → `0`, or `1` if the root survived | "a passing child exits 0 (or 1 if the root survived)" |

The AC now reads "all **four** of Table A's exit-status rows". The previously
omitted row `:267` is present, and the fourth clause also picked up the
root-survived half of `:268` that the old wording dropped.

**Verdict: holds** (exact — count matches the list, and every row has a clause).

## N3 — the `null` branch now has a verification step

**What was re-checked.** The new step-7 lines run **verbatim** against a
conforming stand-in, plus both deliberate reds the author declares for the step.

**Command.** `bash /tmp/wd-r0-fixverify/step7-nwave.sh` (the spec's step-7 block
copied unchanged; only the wrapper path substituted).

```text
=== conforming wrapper (expect both GREEN) ===
  signal-killed child produced wrapper exit 1
  child status propagated as 7
  => signal assertion: GREEN | numeric assertion: GREEN
=== red 1: exit rule always 0 (author claims BOTH assertions go red) ===
  signal-killed child produced wrapper exit 0
  child status propagated as 0
  => signal assertion: RED   | numeric assertion: RED
=== red 2: only the null branch mapped to 0 (author claims ONLY the signal assertion fires) ===
  signal-killed child produced wrapper exit 0
  child status propagated as 7
  => signal assertion: RED   | numeric assertion: GREEN
```

Every claim the author makes about this step is confirmed:

- the signal line asserts `test "$RC_SIG" -eq 1` and a conforming wrapper
  produces exactly `1` — green side observed;
- the "always exit `0`" red fires **both** assertions, as the list says;
- the "only the `null` branch mapped to `0`" red fires **only** the signal
  assertion while the numeric one stays green — which is precisely what proves
  the new line carries its own weight rather than riding on the numeric one.

The measured form also matches this reviewer's own r0-fixverify probe
(`signal-killed child -> wrapper exit=1`), and the step's `2>/dev/null` keeps
the shell's own SIGKILL notice out of the pasted output without hiding the
status.

**Verdict: holds** (exact, on both sides, for both declared reds).

## Conformance gates (re-run at `aea64e2`)

| Gate | Command | Exit | Verdict |
|---|---|---|---|
| Frontmatter schema | `node scripts/check-frontmatter.js` | **0** — "frontmatter check passed: 221 spec(s), 4 agent(s)" | passes |
| Markdownlint (repo config) | `npx --no-install markdownlint-cli2 --config package.json --configPointer /markdownlint-cli2 "docs/specs/WP-temp-root-wrapper.md"` | **0** — "Summary: 0 error(s)" | passes |
| Boundary check, positive | `node scripts/boundary-check.js docs/specs/WP-temp-root-wrapper.md tests/with-temp-root.js tests/unit/tmpdir-leak-guard.test.js package.json` | **0** | passes |
| Boundary check, negative control | `node scripts/boundary-check.js docs/specs/WP-temp-root-wrapper.md tests/run.js` | **1** — "Files outside the spec's Deliverables table: tests/run.js" | passes (correctly rejected) |

## N-wave summary

N2 and N3 hold exactly. N1's substance is fixed — the red list is now correct
and says why — but the change did not reach the umbrella "both sides" sentence
at `:540-543`, which still ranges over `5–10` and so still demands a red for
step 5. One sentence, one range, and the wave is clean.

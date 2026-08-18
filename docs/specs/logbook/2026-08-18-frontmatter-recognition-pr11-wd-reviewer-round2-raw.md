---
date: 2026-08-18
title: "WP-frontmatter-recognition-failopen PR #11 round 2 — wd-reviewer spec-fidelity gate, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# PR #11 round 2 — wd-reviewer spec-fidelity gate (raw)

**Gate:** `wd-reviewer`. Asked to verify each of its own seven round-1
findings is genuinely fixed rather than re-worded, and to attack the new
surface the fixes introduced.
**Diff reviewed:** `4f0ad0d...0526e1f`, HEAD `0526e1f`.
**Read-only property:** verified byte-identical, across both round-2 gates
running concurrently.
**Committed BEFORE adjudication.**

Everything inside the fence is the reviewer's final message, byte-verbatim.
It is fenced rather than inlined because its mutation table contains `||`
inside inline code, which markdown parses as column separators — fencing
preserves the bytes exactly instead of editing them to satisfy the linter.

---

`````markdown
## APPROVE

The PR is fit to merge on spec fidelity. I re-ran every acceptance criterion and every mutation myself rather than reading the diff or trusting the disposition comment. **All seven round-1 findings are genuinely fixed, not re-worded** — I confirmed each by execution or instrumentation, not by inspecting the new text. Boundary is clean, all five ACs are discharged, contracts byte-match, conventions hold. The three items below are text-only nits in always-allowed paths; none can change behaviour or the meaning of any contract, and none warrants another round.

### What I executed (from `/Users/felho/dev/repos-to-learn-from/wienerdog`, HEAD `0526e1f`)

| Command | Result |
|---|---|
| `node scripts/boundary-check.js <spec> <21 changed files>` | exit 0 |
| `node --test tests/unit/digest.test.js` | exit 0 — 78 pass, 0 fail, **0 skipped** |
| `npm test` | 2030 tests, 2021 pass, 0 fail, 9 skipped |
| `npm run lint` | passed (markdownlint 0 errors; shellcheck/pwsh absent locally; frontmatter 219 specs) |
| `git diff --stat 4f0ad0d...HEAD -- tests/golden/` | empty |
| `gh pr checks 11 --repo felho/wienerdog` | all 7 pass |

`git status --porcelain` byte-identical before and after (both empty, `cmp` verified). Scratch work in `/tmp/wd-r2`, deleted.

**Mutation and instrumentation runs** (scratch copy of `0526e1f`):

| Experiment | Result |
|---|---|
| **Mutation D** — `|| r.exclusion === 'absent'` | **1 red** (row 3). Was **0 red** in round 1 → finding 1 genuinely closed |
| Probe inside `readNoteBounded` | `PROBE readNoteBounded called on …/07-Daily/2026-07-01.md` — the chmod fixture reaches it |
| Revert the whole push / `malformed` alone / `untrusted-invalid` alone | 7 / 6 / 1 red — reproduces the disposition's numbers exactly |
| Mutate `lineBudget = MAX_LINES - prefixLineCount` → `MAX_LINES` (Table B row 1) | **AC4 cap test red** → the line half is non-vacuous |
| Mutate `bodyByteBudget = MAX_BYTES - prefixBytes - markerBytes` → drop `prefixBytes` (Table B row 2) | **entire 2030-test suite green** → see finding 3 |
| Probes in `extractSection` return branches | no-section → line 344 `return null`; empty-section → line 341 `text || null` with `text=""` — **different branches** |
| Forced `t.skip` | reports `﹣ … # root can open a 0o000 file`, exit 0, `skipped 1` — correct node:test usage |

---

### Findings

**1. `[contract]` — new mirror drift introduced by the round-1 fix itself.** `docs/specs/WP-frontmatter-recognition-failopen.md:326-328`. The count was corrected to "all eleven rounds" but the co-located pointer beside it was not: the glob still reads `2026-08-1{6,7}-frontmatter-recognition-*`, which resolves to 14 of the 18 logbook files. Measured — it misses exactly the four dated `2026-08-18`, including **rounds 10 and 11**, the two rounds the corrected count was added for:

```
docs/specs/logbook/2026-08-18-frontmatter-recognition-round-10-raw.md
docs/specs/logbook/2026-08-18-frontmatter-recognition-round-11-raw.md
docs/specs/logbook/2026-08-18-frontmatter-recognition-pr11-external-raw.md
docs/specs/logbook/2026-08-18-frontmatter-recognition-pr11-wd-reviewer-raw.md
```

Fix: `2026-08-1{6,7,8}-` or `2026-08-*-`. One character. Spec file is always-allowed, so it rides on this PR.

**2. `[convention]` — the PR body was never updated; the correction the disposition ordered was not applied.** PR #11 body, "Decisions made", still reads *"Row 3 (`absent`) is tested by making the daily path a directory, so `fs.openSync` throws … This was the only portable way to reach that class without mocking."* The disposition comment explicitly says *"Replace the row-3 bullet in the PR body with: row 3 is tested two ways — a real daily note `chmod 0o000`'d …"*, and that edit was never made. The pasted verification block is likewise from the previous HEAD (`75 tests` / `6` red); the shipped state is `78` / `7`. CLAUDE.md's Definition of done items 1 and 3 name the PR body as the evidence artifact. I independently re-ran and reproduced the true numbers, so the *claim* is correct — only the artifact is stale. Body edit, no code change, no new CI round.

**3. `[quality]` — AC4's byte-cap assertion is present but never under pressure; Table B row 2 is unpinned.** `tests/unit/digest.test.js:1334-1337`. Measured on the shipped fixture: `lines=121 bytes=2359 marker=true`, against `MAX_LINES=120 / MAX_BYTES=32768`. So the **line** cap binds at exactly the assertion boundary (121 ≤ `MAX_LINES + 1`) and is tight — the mutation above proves it. The **byte** cap sits at 7% of its ceiling, so `Buffer.byteLength(digest) <= MAX_BYTES` is trivially satisfied. Consequence, measured: deleting `- prefixBytes` from `digest.js:599` — Table B row 2's stated fact — leaves all 2030 tests green.

This is **not** a blocker and I am not treating it as one. AC4 as written asks for "a line-cap and a byte-cap assertion"; both exist, and my round-1 finding 2 asked for exactly these three assertions, which the implementer delivered literally. `capDigest` is byte-untouched by this diff, which is stronger evidence of "the cap is unchanged" than any test. The byte-budget hole is pre-existing coverage debt in `capDigest`, neither introduced nor worsened here. Worth a line in the successor charter or the lessons inbox, not a fix in this WP.

**4. `[quality]` — a test comment states a mechanism I measured to be false.** `tests/unit/digest.test.js:1191` — *"a directory is never openable as a file, so `fs.openSync` throws"*. Measured on darwin: `fs.openSync(dir, 'r')` **succeeds** (fd=11); it is `fs.readSync` that throws `EISDIR`. POSIX gives the same on Linux (`open(2)` with `O_RDONLY` on a directory is permitted; `read(2)` returns `EISDIR`). The assertion is still correct — `readNoteBounded`'s `try` wraps both the open and the read (`src/core/digest.js:250-262`), so `absent` comes back either way, and it is uid-independent, which is what makes this half survive on a root runner. Only the stated reason is wrong. Suggested: *"a directory cannot be read as a file — `openSync` may succeed but `readSync` throws `EISDIR`, and `readNoteBounded`'s try covers both."* Note the irony: this is the same class of false-mechanism claim as round-1 finding 1. (The `chmod 0o000` half's comment is correct — I measured `openSync` → `EACCES`.)

---

### Verification of each round-1 finding

1. **AC1 row 3 — genuinely fixed.** The probe shows `readNoteBounded` is now called with the real daily-note path, and mutation D flips 0 red → 1 red. **On the root guard: it is the right call, and it is not hiding anything on this project's CI.** The `test` matrix is `[ubuntu-latest, macos-latest]` with no `container:`; both run as non-root. I pulled both job logs and the test **executed**, not skipped: `ok 481 - Table A row 3 …` with no `# SKIP`, and `# skipped 9` on both — unchanged from local. On a hypothetically permissive platform the test fails **loud, not silent**: the fixture is a valid note whose `## Summary` would then be emitted, tripping the first assertion. Windows (where `chmod` only toggles read-only) is not in the test matrix, and `process.getuid?.()` degrades correctly there anyway. The residual is narrow and unreachable here: on a root runner the end-to-end half skips, so mutation D would go green — but the direct `readNoteBounded` assertion still runs and is uid-independent (`EISDIR`, not `EACCES`), so the class itself stays pinned.
2. **AC4 cap — reaches real cap pressure.** Not vacuous: `marker=true` requires truncation to have occurred, so raising `MAX_LINES` above the fixture's natural size turns the test into a red canary rather than a silent pass. It pins Table B row 1 under mutation. And it **reproduces Table B's measurement exactly** — I instrumented it: 83 goals body lines without the daily entry, 81 with, **displaced = 2, marker retained**, matching the spec's "dropped two previously emitted identity body lines, truncation marker retained" verbatim. Deterministic: 5/5 runs gave byte-identical `lines=121 bytes=2359`. Caveat in finding 3.
3. **"four of the six" — no surviving mirror.** Grepped the whole file: the only remaining occurrence is inside the retraction itself (`:408`), which is correct, since the retraction must quote what it retracts. `:71-74` now matches the canonical table at `:397-411`, and the fix went further than I asked by registering the mirror inline — *"(the canonical table is in successor charter B; this sentence is its mirror and must not diverge from it)"*. The table was not reopened. Correct handling.
4. **Stale counts — right against what the branch carries,** except finding 1's glob. `:19` "Eleven … narrowed it three times" (three narrowing commits: `330bf54`, `788077b`, `e733423`), `:26` "eleven rounds, two round-zero passes and one aborted attempt" (18 logbook files: rounds 1-11, two r0, `round-5-aborted`, reference-classifier, review-rounds, two PR-gate raws — coherent, since round 5 was aborted then re-run), `:326` "all eleven rounds". The "guard and the push" instruction is gone; `:236-240` now reads "each of its two branches reverted on its own … There is no second artifact to revert: round 10 narrowed this package to the push alone" — which matches the shipped single-artifact design, and I reproduced both branch reverts (6 and 1 red).
5. **JSDoc — accurate, and does not overstate.** `src/core/digest.js:610-615`. It scopes "ANOMALOUS exclusion" to exactly the two classes the daily path banners (malformed block; non-exact-boolean `derived_from_untrusted`), and explicitly excludes both silent cases — "An exact `true` is normal policy and stays silent, as is a daily note that cannot be opened." It does **not** claim the daily path banners the hash-gate class (`:682`) or anything else; that sentence never covered those classes, before or after. No overstatement.
6. **Row 7's empty half — a different branch, not a second spelling.** Proven by probe, not by reading: the no-section test reaches the terminal `return null` (`digest.js:344`), the empty-section test reaches `return text || null` with `text === ""` (`:341`). Note that a behavioural mutation (`return text` instead of `text || null`) is *not* caught, because `if (summary)` treats `''` and `null` alike — but that is branch equivalence in the consumer, not a defect in the test, and the spec's contract is the outcome, not the return value.
7. **"absent" disambiguation — correct, introduces no new inconsistency.** `:105-113`. "A **missing `derived_from_untrusted` key**" is the accurate name for the sense that was previously called "an absent flag", and the added clause correctly identifies Table A row 3's `absent` as "the exclusion class meaning *the file could not be opened*". Both are silent, for the stated different reasons. One observation, not a finding: the collision still lives in the **code** at `src/core/digest.js:197` — `// undefined (absent) or exactly false → trusted → render` uses the missing-key sense — but that line is pre-existing, untouched by this diff, and the new inline comment at `:753-754` uses the row-3 sense correctly.

### New surface — attacked

- **Filesystem hazard: none.** The `chmod 0o000` file lives inside its own `mkdtemp` dir. I verified `rm -rf` over a tree containing a `0o000` file succeeds (unlink needs write on the parent directory, not the file). `tmpVault` has never cleaned up — that is suite-wide pre-existing practice, not something this test introduces. Each test gets its own `mkdtemp`, so no cross-test interference under concurrent execution.
- **CI parity:** identical behaviour local (uid 501) and on both runners, verified from the job logs, not inferred.
- **`t.skip`:** correct for this runner — `return t.skip(msg)` yields `﹣ … # msg`, `skipped 1`, exit 0, and the assertions after it do not run.
- **Table A / Table B:** nothing in the round-1 fixes contradicts either. Table A rows 1, 3-7, 9 all have assertions matching their stated Summary-block and Banner-entry columns; the three AC2 overlap inputs are intact and each still non-vacuous. Table B's measurement reproduces exactly.

### Contract-density / closed-contract drift check

The round-1 fixes did **not** reinterpret a settled contract or promote a mirror to primary. Finding 3's fix is a textbook correct resolution: the canonical push-site table at `:397-411` and its retraction were already settled, and the prose mirror at `:71-74` was edited to match them — the table was not reopened — with the mirror explicitly registered against its canonical source in the same sentence. The `## Current state` remedy-accuracy paragraph now agrees with charter B in both degrees ("all six offered at least one invalid remedy; three offered none valid"). No canonical table is missing and no other mirror has drifted, so **no routing to wd-architect is needed**. The one exception is finding 1: a pointer that fell out of agreement with the count it sits beside — a co-located-fact drift, one character, not a contract question. The Mirrored Surface Checklist's six entries all hold. I also note for the record that my round-1 escalation trigger ("if round 2 lands on the same 'the assertion does not reach the thing the AC names' family, route to wd-architect for an AC→assertion mapping table") did **not** fire: finding 3 above is adjacent to that family but is a pre-existing `capDigest` coverage gap, not a failure of this spec's ACs to be discharged.

Relevant paths:
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/digest.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/digest.test.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md`
`````

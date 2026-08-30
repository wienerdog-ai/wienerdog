---
date: 2026-08-18
title: "WP-frontmatter-recognition-failopen PR #11 — wd-reviewer spec-fidelity gate, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# PR #11 — wd-reviewer spec-fidelity gate (raw)

**Gate:** `wd-reviewer`, the merge gate for spec fidelity. Reviewed the diff
strictly against the spec's Deliverables table, acceptance criteria and
CLAUDE.md conventions.
**Diff reviewed:** `4f0ad0d...48e7da7`, HEAD `48e7da7`.
**Read-only property:** verified byte-identical before and after, across both
gates running concurrently.
**Committed BEFORE adjudication.** Nothing below was judged, paraphrased,
softened or acted on before this file's commit existed.

Everything below the line is the reviewer's final message, verbatim.

---

## REQUEST-CHANGES

The implementation itself is correct and minimal — the code change realizes Table A's ordering faithfully and I could not break it with the mutations I tried. What blocks merge is test coverage: **two of the five acceptance criteria are not actually discharged**, and one of them is provably vacuous (a mutation that violates Table A row 3 passes the whole suite). Plus one spec self-contradiction that needs wd-architect, not the implementer.

### What I executed (all from `/Users/felho/dev/repos-to-learn-from/wienerdog`, HEAD `48e7da7`)

| Command | Exit |
|---|---|
| `node scripts/boundary-check.js docs/specs/WP-frontmatter-recognition-failopen.md <19 changed files>` | 0 |
| `node --test tests/unit/digest.test.js` | 0 — 75/75 pass |
| `npm test` | 0 — 2027 tests, 2018 pass, 0 fail, 9 skipped |
| `npm run lint` | 0 — markdownlint 0 errors; shellcheck/pwsh absent locally (CI has them); frontmatter 219 specs OK |
| `git diff --stat 4f0ad0d...HEAD -- tests/golden/` | 0, empty output |
| `gh pr checks 11` | all 7 checks pass |
| Revert experiment in `/tmp/wd-scratch` (scratch copy from `git archive`, deleted afterwards) | see below |

`git status --porcelain` was empty before and after; verified byte-identical. Nothing in the repo was created, modified or deleted.

**Revert verification (I did not trust the PR body).** Removing the whole 5-line push block from the scratch copy: **6 fail / 69 pass**, and the six names match the PR body exactly. I also ran five targeted mutations:

| Mutation | Result |
|---|---|
| drop only the `untrusted-invalid` branch | 1 red (row 5) — correct |
| drop only the `malformed` branch | 5 red — correct |
| also push on `untrusted-exact` | 2 red (row 6 + a pre-existing framing test) — correct |
| **also push on `absent`** | **0 red — all 75 pass** ← finding 1 |
| swap the two reason strings | 4 red — correct |
| append `daily.path` to the reason (note-derived content) | 4 red incl. AC3 — correct |

---

### Findings

**1. `[criteria]` AC1 row 3 is undischarged — the test never reaches row 3.** `tests/unit/digest.test.js:1186-1193`. The fixture creates a *directory* named `2026-07-01.md`, but `newestDaily` (`src/core/digest.js:441-445`) recurses into directories and only collects entries where `entry.isFile()` is true. I instrumented a scratch copy: with this fixture `newestDaily` returns `null`, so `readNoteBounded` is never called and the daily branch is never entered. The test is a duplicate of the row-1 test wearing a row-3 name. Proof that it does not constrain anything: mutating the guard to `r.exclusion === 'malformed' || r.exclusion === 'absent'` — a direct violation of Table A row 3 and of the `absent` half of the code comment at `digest.js:753-754` — leaves all 75 tests green.

The PR body's "Decisions made" bullet ("Row 3 (`absent`) is tested by making the daily path a directory, so `fs.openSync` throws and `readNoteBounded` returns `absent`") is therefore false as written and must be corrected along with the test.

Fix, no new deliverables needed — `readNoteBounded` is already exported (`src/core/digest.js:868`), and I verified both legs work on this machine:
- end-to-end: write a real `07-Daily/2026-07-01.md`, then `fs.chmodSync(f, 0o000)` so `newestDaily` finds it and `fs.openSync` throws (measured: `exclusion === 'absent'`, uid 501). Guard with `if (process.getuid?.() === 0) return;` so a root container skips rather than silently inverting.
- plus a direct assertion that pins the class regardless of platform: `assert.equal(readNoteBounded(<a directory path>, 4096).exclusion, 'absent')` (measured: `'absent'`), followed by the renderDigest silence assertion.

Re-run mutation D (`|| r.exclusion === 'absent'`) after fixing — it must go red.

**2. `[criteria]` AC4 is partially undischarged — no byte-cap assertion, no truncation-marker assertion, and no cap-pressure scenario.** `tests/unit/digest.test.js:1281-1294`. AC4 (spec line ~215) requires that body displacement "is pinned by a **line-cap and a byte-cap assertion** rather than denied," and that the truncation marker is unchanged. The test asserts `assert.equal(DigestCaps.MAX_LINES, 120)` — that is a constant-equality check on an imported value, not an assertion that the cap holds when a daily banner entry is present, and there is no `MAX_BYTES` assertion and no `TRUNCATION_MARKER` assertion at all. The nearest pre-existing cap-under-banners test (`tests/unit/digest.test.js:532-554`) never produces a daily exclusion entry, so it does not cover the new prefix line either.

Fix: extend the AC4 test (or add one beside it) that drives the digest over the cap *with* a `daily-summary` entry in the prefix and asserts all three: `lines.length <= DigestCaps.MAX_LINES + 1`, `Buffer.byteLength(digest,'utf8') <= DigestCaps.MAX_BYTES`, and `digest.includes(DigestCaps.TRUNCATION_MARKER)`. That is exactly what Table B says was measured (two identity body lines dropped, marker retained) and it is currently the one measured claim in the spec with nothing pinning it.

**3. `[contract]` — spec self-contradiction, route to wd-architect (do not ask the implementer to guess).** `docs/specs/WP-frontmatter-recognition-failopen.md:70-71` states "The remedy is therefore wrong for **four of the six** classes before this WP." `docs/specs/WP-frontmatter-recognition-failopen.md:397-400`, in the same file, explicitly retracts that number: "an earlier draft said 'wrong for four of six' without stating its unit, and **no reading of the table produced four**," and the canonical push-site table at `:383-392` says all six are wrong in two degrees. This is textbook mirror drift: the canonical table and its retraction landed, the prose mirror in `## Current state` did not get updated with it. Per the closed-contract drift check, the fix is to edit the mirror to match the settled table (all six inaccurate; three of them offered no valid remedy at all), not to reopen the table. Owner/architect call, one-line edit to the spec — which is an always-allowed path, so it can ride on this PR.

**4. `[contract]` — two stale mirrors in the spec's own disclosures (minor, spec-side).** All in `docs/specs/WP-frontmatter-recognition-failopen.md`:
- `:19` "Nine design-review rounds narrowed it twice" and `:25` "ten rounds of logbook record" — the branch carries rounds 1–11 plus two r0 passes and an aborted round 5 (17 logbook files), and the narrowing commits are three: `330bf54`, `788077b`, `e733423`. `:317` likewise says "all seven rounds."
- `:231` "red with **the guard and the push** reverted separately" — there is no guard in the shipped design; round 10 narrowed it to the push alone. The instruction asks for two separate reverts when only one artifact exists, which is why the PR body could only paste one. Either drop the "guard" clause or make it "each of the two branches reverted separately" (I ran both; each is individually non-vacuous — 1 red and 5 red respectively).

These are counts inside disclosure text, so they are not a merge blocker on behavior, but the whole point of the header block is that its counts are the evidence.

**5. `[quality]` `src/core/digest.js:605-614` — `renderDigest`'s JSDoc was not updated.** It still says only "An ANOMALOUS **identity** exclusion (malformed frontmatter block, or a `derived_from_untrusted` value that is not an exact boolean) is omitted fail-closed AND surfaced via a fixed warning banner." As of this diff the daily path contributes to that same banner for the same two classes, and the doc comment is the only place a reader of the public surface would learn it. One clause. (The inline comment at `:748-754` is good — accurate, in the file's idiom, and correct that `absent` means an unreadable file.)

**6. `[quality]` `tests/unit/digest.test.js:1219-1225` — Table A row 7's second clause is untested.** The row reads "`extractSection` finds no `## Summary`, **or an empty one**"; the fixture only covers the "no section" half. Optional — same row, same outcome — but AC1 says each row produces exactly the stated outcome, and the empty-section path is a different branch of `extractSection`.

**7. `[contract]` terminology collision, non-blocking, note only.** `docs/specs/WP-frontmatter-recognition-failopen.md:104-106` ("an **absent flag** stay silent" = the `derived_from_untrusted` key is missing → note is admitted) uses "absent" in a different sense than Table A row 3's `absent` (`exclusion === 'absent'` = the file could not be opened → note omitted). Both are silent, so nothing diverges functionally, and the code comment at `digest.js:753-754` picks the right sense. Worth one disambiguating word if the spec is being edited anyway for findings 3 and 4.

---

### What I checked and found clean

- **Boundary.** 19 changed files: `src/core/digest.js`, `tests/unit/digest.test.js`, the spec itself, and 15 files under `docs/specs/logbook/`. The two code files are exactly the Deliverables table's two rows; the rest are in the always-allowed set declared at spec `:82-84`. `boundary-check.js` exits 0 independently of CI.
- **Contract fidelity, Table A.** The order is realized correctly and structurally, not incidentally. `parseNoteResult` (`src/core/digest.js:190-200`) resolves `malformed` before `untrusted-*`, `readNoteBounded` (`:249-266`) short-circuits to `absent` on open failure, and the new block at `:755-759` sits inside the `isCapabilityAllowed` branch and *before* `extractSection` at `:760`. So row 2 beats row 4, row 4 beats rows 7 and 8, and rows 6/`absent` fall through both branches. Labels and reason strings byte-match the Exact contracts paragraph: `'daily-summary'`, `'malformed frontmatter'`, `'unclear derived_from_untrusted value'`. The three AC2 overlap inputs are present and each is non-vacuous under mutation.
- **Table B / cap.** The diff touches nothing in `capDigest` (`src/core/digest.js:576-601`) — constants, line-budget and byte-budget algorithm, `TRUNCATION_MARKER`, and the `identityExclusions` push order are all untouched. The banner template at `:796` is byte-unchanged. (The *assertions* covering this are the gap in finding 2; the code is clean.)
- **AC5.** `tests/golden/` diff is empty and `npm test` + `npm run lint` are green, matching "with an empty exclusion list the digest bytes are unchanged."
- **Conventions.** No dependency added; plain Node; JSDoc only on both new test helpers (`tests/unit/digest.test.js:1162`, `:1167`); no build step; nothing starts a process (ADR-0004 holds — the change is five lines of array push). Commit subjects are conventional and carry the WP id; PR title matches the spec's Definition of done string byte-for-byte. Spec status is flipped to `In-Review` in the same PR. Unchecked `[ ]` boxes are this repo's convention — I verified against `docs/specs/done/*.md`, where Done specs also carry zero `[x]`, so that is not a finding.
- **The three disclosed non-goals.** `src/core/frontmatter.js` and `src/core/dream/validate.js` are untouched, and the banner template is byte-unchanged — the diff contradicts none of the three disclosures, and none of them overstates what shipped. The one thing the banner *does* now say that is arguably new ("some **identity** notes were left out" for a daily note) is pre-existing: the `:766` secret push already put `daily-summary` in that list, and Table A explicitly puts the banner's noun out of contract.

### Recommended routing

Findings 1, 2, 5 and 6 go back to the implementer — all four land in `tests/unit/digest.test.js` and `src/core/digest.js`, both already in the Deliverables table, so no scope change and no re-spec. Finding 3 (and optionally 4 and 7) is a spec edit and should go to **wd-architect**: `## Current state` is carrying a claim the spec itself retracts 330 lines later, and an implementer should not be the one deciding which of the two the contract means.

This is review round 1 for this WP, so the two-failed-rounds escalation rule is not yet in play. Worth noting for the next round though: findings 1 and 2 are both "the assertion named in an AC does not reach the thing the AC names," which is the same failure family the AC2 clause was written to prevent for the rows. If round 2 lands on that family again, that is the signal that the acceptance criteria need a canonical mapping table (AC → the specific assertion that discharges it) rather than prose, and it goes to wd-architect.

Relevant paths:
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/digest.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/digest.test.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md`

---
title: Round zero — internal coherence (raw), WP-dream-write-fence-control-files
date: 2026-08-20
---

# Round zero — internal coherence (raw)

Spec under review: `docs/specs/WP-dream-write-fence-control-files.md` at commit
`b009e34`. Base tree: `main` @ `1d4c092`. Measurements only; dispositions live in
the round record. Every command below was RUN, not read.

## 1. Baseline, before any edit

```
npm test   → tests 2037, pass 2028, fail 0, skipped 9      (exit 0)
npm run lint → markdownlint 0 errors; frontmatter 220 specs (exit 0)
```

shellcheck and PSScriptAnalyzer skipped locally (binaries absent; CI runs them).

## 2. The spec's own citations, re-run against the tree

| Spec claim | Measured | Verdict |
|---|---|---|
| `validate.js` 1469 lines | 1469 | OK |
| `layout.js` 174 lines | 174 | OK |
| `git()` at `:68-75` | `function git` at `:67`, closes `:84`; spawn args `:68-73`; `env: process.env` `:70` | **STALE** |
| `precommitSessionEdits` `:122-137` | `:122`–`:137` | OK |
| `restoreVaultToHead` `:146-149`, clean comment `:141-143` | same | OK |
| `revertPath` `:660-667`, `checkout` `:665` | same | OK |
| `changedPaths` `:1020-1021` | same | OK |
| `isTier3` `:1087-1090` | same | OK |
| loop `:1145-1209`, containment `:1148`, ledger `:1154`, Tier-3 `:1170`, keep `:1208` | same | OK |
| `reverted[]` `:1100-1101`; enforcement render `:1384-1391` | same | OK |
| `git add` `:125`, `:1223`, `:1331`, `:1412`; `commit` `:131`, `:1437`; `hash-object` `:874` | same | OK |
| `layout.js` defaults `:33-42`, `isSafeRelativePath` `:65-71`, fallback `:115-118` | same | OK |
| `layout-infer.js` copy `:40-46`, validation loop `:129-132` | same | OK |
| `layout-infer.js` `topLevelDirs` `:21-30` | `:21`–`:31` | **STALE** |
| `adopt-git.js:15-21` | same | OK |
| `runtime-profile.js:58`, `:81` | same | OK |
| `dream.js:144-146`, `:493`, `:510`, `:558`, `:578`, `:617` | same | OK |
| `brain.js:187-189`, `:198` | same | OK |
| audit `:676` (M7), `:841` (M9), `:931` (M10), `:1008` (fourth addendum) | same headings | OK |
| "`--no-verify` and `core.hooksPath` appear nowhere in `src/`" | `grep -rn` → 0 hits for both (one unrelated `hooksPath` local in `src/adapters/codex.js` is a Codex `hooks.json` path, not git config) | OK |
| "zero `.git` handling in validate.js/brain.js" | 0 hits | OK |

## 3. Table B's measured behaviour, re-run on today's git

`git version 2.50.1 (Apple Git-155)`, throwaway `mktemp -d` repositories.

```
baseline (no flags):            HOOK_RAN present, FILTER_RAN present
-c core.hooksPath=/dev/null
  + --no-verify on commit:      HOOK not run;  FILTER still ran;  exit=0
git hash-object -w --path,
  both flags:                   CLEAN filter ran
git checkout HEAD -- <rel>,
  both flags:                   SMUDGE filter ran
-c core.hooksPath=./no/such/dir: HOOK not run  (nonexistent-path case = the Windows answer)
```

## 4. Table C's behaviour, on a hand-built finished tree

Full `src/` copy with the dot condition added to both `isSafeRelativePath` sites:

```
defaults round-trip identical:   true
nested daily_filename kept:      YYYY/MM/YYYY-MM-DD.md
dot rejected ->  05-Skills | 06-Identity | YYYY-MM-DD.md | kept: 00-Inbox
inferLayout skills_dir:          05-Skills
```

At `1d4c092`, unmodified, the same two probes returned `skills_dir: ".skills"`
from `inferLayout` and `skills_dir: .skills` from `readVaultLayout`.

## 5. The spec's verification steps, run as written (draft `b009e34`)

`npm test -- --test-name-pattern "dream|layout"` → tests 322, pass 322, fail 0
(exit 0). Runnable and selective.

The four proposed NEW assertions, run from a script against three trees — the
untouched base, and two hand-built finished states that differ only in
implementation shape (A: flag inline at both commit sites, dot rule as
`s.startsWith('.')`; B: flag in one shared constant used at both sites, dot rule
as `/^\./.test(s)`). Both A and B are correct implementations of Tables B and C.

| Assertion | base (want FAIL) | finished A (want PASS) | finished B (want PASS) |
|---|---|---|---|
| V1 `grep -q -- 'core.hooksPath=/dev/null'` | FAIL | PASS | PASS |
| V2 `grep -c -- '--no-verify' == 2` | FAIL | PASS | **FAIL** |
| V3 `grep -q "startsWith('.')"` layout.js | **PASS** | PASS | PASS |
| V4 `grep -q "startsWith('.')"` layout-infer.js | FAIL | PASS | **FAIL** |

V3's base PASS is a false green: the pattern is unquoted for grep, so `.` is a
wildcard and it matched the pre-existing `trimmed.startsWith('#')` at
`layout.js:108`. V2 and V4 are over-strict — red against a correct answer.

## 6. The revised assertions, re-run in both directions

```
RED   base tree           : G1 FAIL, G2 FAIL   exit=1
GREEN finished shape A    : G1 PASS, G2 PASS   exit=0
GREEN finished shape B    : G1 PASS, G2 PASS   exit=0
RED   broken finished (--no-verify removed): G1 PASS, G2 FAIL   exit=1
```

where `G1 = grep -qF -- 'core.hooksPath=/dev/null'` and
`G2 = grep -qF -- '--no-verify'`, both against `src/core/dream/validate.js`.

## 7. Structural findings from the end-to-end read

- The template's authoring-rules bullet under the H1 was absent with no `N/A` line
  (also the conformance pass's single BLOCKING item).
- The idempotence criterion as drafted ("with no accumulated state") states no
  binary outcome and cannot discriminate.
- `isSafeRelativePath` exists in two copies. The spec listed both as Deliverables
  but did not register the pair as a mirror, and did not record why the obvious
  de-duplication (export from `layout.js`) is not taken.

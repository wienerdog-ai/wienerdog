---
date: 2026-08-20
title: "WP-temp-root-wrapper round 0 — internal coherence + runnable-claim pass, raw output"
related_wps: [WP-temp-root-wrapper]
---

# Round 0 — internal coherence and runnable claims (raw)

**Spec reviewed:** `docs/specs/WP-temp-root-wrapper.md`
**Spec commit:** `7f051be` (`docs(specs): add Draft spec (WP-temp-root-wrapper)`)
**HEAD verified:** yes — `git log --oneline -1` → `7f051be`, working tree clean at start.
HEAD advanced to `a7f4f15` mid-pass (a parallel session committed
`2026-08-20-temp-root-wrapper-r0-template-conformance-raw.md`); confirmed with
`git diff --exit-code 7f051be HEAD -- docs/specs/WP-temp-root-wrapper.md` → 0,
so the reviewed spec bytes are unchanged and every measurement below still
applies to `7f051be`.
**Date:** 2026-08-20
**Worktree:** `.claude/worktrees/test-leftovers`
**Reviewer context:** fresh, took no part in drafting.
**Environment:** macOS (darwin 25.5.0), Node `v24.18.0`, npm `11.16.0`.

**Safety posture actually applied to every execution below.**
`WIENERDOG_TEST_NO_REAL_SCHEDULER=1` was set in the environment of every test
invocation by every route. `WIENERDOG_RUN_SCENARIOS` was explicitly *deleted*
from every child environment — never set — so the five scenario scripts were
exercised in skip mode only. No `bin/wienerdog.js` verb was run with any verb.
Every counted or full-suite invocation ran under a fresh `mkdtemp` root with
`TMPDIR`/`TMP`/`TEMP` all pointed at it, and each root was torn down with a
`chmod`-before-`readdir` walk followed by `rmSync` (verified removed).

**Deliverables state:** `tests/with-temp-root.js` and
`tests/unit/tmpdir-leak-guard.test.js` do **not** exist (confirmed by `ls`).
This is pre-implementation, so every criterion or verification step that needs
the wrapper is recorded as *not runnable pre-implementation* rather than failed.

**Probe scripts** used for the measurements live outside the repo, under
`/tmp/wd-r0-probe/` (`resolution.js`, `enotempty.js`, `fullrun.js`,
`fullrun2.js`, `teardown.js`, `hop.js`, `skipmode.js`, `tmpdirshape.js`,
`npmnote/`). No repo file was edited other than this logbook entry.

---

## Part A — internal coherence findings

**7 findings.** Findings only; no design critique, no style notes.

### A1 — the must-not-inject rule's named mirror carries only half the contract

The Mirrored Surface Checklist states:

> The **must-not-inject** rule, which appears in Table A, in the Acceptance
> criteria and in verification step 8 — all three move together

Table A's cell names **two** variables (`WIENERDOG_TEST_NO_REAL_SCHEDULER`
**and** `WIENERDOG_RUN_SCENARIOS`), and the acceptance criterion mirrors both
("a child run through it does not see `WIENERDOG_TEST_NO_REAL_SCHEDULER` or
`WIENERDOG_RUN_SCENARIOS`"). Verification step 8 exercises only
`WIENERDOG_TEST_NO_REAL_SCHEDULER`; the deliberate-red control for step 8
("with `WIENERDOG_TEST_NO_REAL_SCHEDULER: '1'` added") likewise covers only
that variable. The third named mirror therefore cannot move with the other two,
and a wrapper that injected `WIENERDOG_RUN_SCENARIOS` would pass the whole
verification block — the one variable whose accidental injection would turn the
five skip-mode steps into live, quota-spending runs.

Secondary, measured: step 8's construct
`WIENERDOG_TEST_NO_REAL_SCHEDULER= node …` sets the variable to the **empty
string** rather than unsetting it. Measured:
`"WIENERDOG_TEST_NO_REAL_SCHEDULER" in process.env` → `true`, value `""`, and
the probe's `env.X || '<unset>'` prints `<unset>`. The assertion therefore also
passes if the wrapper injects the variable with an empty value. It does still
distinguish the declared red (`'1'`).

### A2 — an acceptance criterion cites a baseline the spec does not record

> The suite still passes with the **same pass/skip counts** as before the
> change …

Current state records only `2028 pass / 0 fail`. No skip count appears anywhere
in the spec, so half of this criterion has no baseline to compare against.
(Measured today, three times: `tests 2037 / pass 2028 / fail 0 / skipped 9`.)
The other half of the criterion — `tests/run.js` byte-identical — *does* have
its baseline, because Current state inlines the whole 12-line file.

### A3 — the `"//"` note's literal text has no mirror that actually carries it

The Mirrored Surface Checklist states:

> The `"//"` convention note's **literal text**, which Table B decides and which
> the Deliverables cell, one acceptance criterion and verification step 10 all
> mirror

None of the three named mirrors contains the literal text. The Deliverables
cell says "add the `//` convention note … per Table B"; the acceptance criterion
requires only that the note "is present and names `tests/with-temp-root.js`";
verification step 10 asserts only `n.includes("tests/with-temp-root.js")`.
Table B's literal string is the *only* occurrence, so changing it moves nothing
and no surface can drift out of step with it. Either the checklist item
overstates what is mirrored, or the mirrors under-check what Table B decides.

### A4 — an acceptance criterion demands a red the deliberate-red list never produces

> The **guard cases** fail if the env injection is removed from the wrapper, and
> fail if the permission-restore step is removed. Both are demonstrated by a
> **real red run**, not asserted.

The deliberate-red list at the end of the verification block names verification
steps 2, 5, 6, 7, 8 and 10 — shell-level count and status assertions. The guard
test (`tests/unit/tmpdir-leak-guard.test.js`) is never named as a thing that
must be observed red. The criterion's "demonstrated by a real red run" has no
corresponding instruction anywhere in the block.

### A5 — Table A's "child failed" row contradicts the case its own parenthetical admits

> **Exit status — child failed** | when the child's status is non-zero, **or the
> child died on a signal / failed to spawn (`status == null` → `1`)**, the
> wrapper exits with **exactly that status**.

In the `status == null` branch there is no "that status" to exit with; the row's
own parenthetical already supplies the answer (`1`). The closing clause is
unmade by the case it just admitted. (The mirroring acceptance criterion —
"a failing child's non-zero status reaches the caller unchanged" — silently
drops the null branch, and verification step 7 tests only `process.exit(7)`, so
no surface pins the signal/spawn-failure case.)

### A6 — Table B's "Not routed through the wrapper" list omits the *reason* the boundary is stable (low)

Table B: "Not routed through the wrapper | `lint` and `gen:agents` — they create
no temp directories." The claim about the two scripts is **true** (verified —
neither `scripts/lint.js` nor `scripts/gen-agents-md.js` contains `mkdtempSync`
or `tmpdir`). But the "Which scripts change" row says "exactly the six in
Current state's entry-point table" while `package.json` today holds exactly
eight scripts; nothing in either row states 6 + 2 = 8, i.e. that the two named
exclusions are *all* the remaining scripts. A seventh non-test script added
later is neither routed nor listed, and the convention note (which Table B
itself calls "a convention, not an enforcement mechanism") is the only thing
between it and silent drift. Cross-checked: the eight scripts are `test`,
`lint`, `gen:agents`, `scenarios`, `scenarios:negative`, `broker:selfcheck`,
`scenarios:broker-e2e`, `scenarios:a7-integrity` — so the partition is in fact
complete today, but the spec never says so.

### A7 — frontmatter `adrs:` omits the ADR the body activates (low)

Frontmatter is `adrs: [ADR-0004]`. The "Contract reference" section turns the
discipline on under **ADR-0031**'s activation test and cites its criteria (iv)
and (vii) by number; Tables A and B exist because of that ADR. Repo practice is
mixed — `WP-dev-descriptor-no-tree-hash.md` and
`done/WP-attended-alert-acknowledgement.md` list `ADR-0031`;
`WP-secret-sink-wiring-probes.md` and `WP-ep2-retention-prune-timing-test.md`
cite it in the body without listing it — so this is a cross-reference
inconsistency inside the document rather than a convention breach.

### Also noted, deliberately NOT raised as findings

- Verification step 3 ("run step 2 again; same result (idempotence)") is prose
  with no command inside a block the preamble says to run "top to bottom", and
  is excluded from both the "steps 2 and 5–10 are NEW … each is an assertion"
  sentence and the deliberate-red list. Read as an instruction to repeat step 2
  verbatim, it is coherent.
- Table A's "Diagnostics on failure" row has no acceptance criterion and no
  verification step. The checklist only claims each *criterion* maps to a row,
  not that each row has a criterion, so this is not a contradiction.
- Current state describes `run-scenarios.js:282` as "prints and returns" and
  `run-negative.js:457` as "sets `process.exitCode = 0` and returns". Measured:
  **both** set `process.exitCode = 0` and return. The differing descriptions do
  not distinguish anything, but neither is false. Recorded in Part B (B23).

---

## Part B — every runnable claim, executed

### B.1 — "Current state" and command-citing claims

| # | Claim as written in the spec | How checked (command / probe) | Exit status — observed vs stated | Verdict |
|---|---|---|---|---|
| B1 | Measured on macOS, Node `v24.18.0`, at commit `1d4c092` | `node --version`; `git log --oneline -2` | 0 — `v24.18.0`, darwin; `7f051be` sits directly on `1d4c092` | holds |
| B2 | The six entry points and their exact `package.json` bodies (`test`→`node tests/run.js`, plus the five scenario scripts) | `node -e` dump of `require("./package.json").scripts` | 0 — all six names and bodies byte-match the table | holds |
| B3 | Nothing else in the repo invokes `tests/run.js`: only `package.json`, plus **two comments** in `scheduler-leak-guard.test.js` and `scheduler-guard.test.js` | `/usr/bin/grep -rn "tests/run\.js" .` (excluding `.git`, `node_modules`, `docs/specs/`, `memory/`) | 0 — `package.json:22` plus **three** comment lines in the two named files (`scheduler-leak-guard.test.js:475`, `:755`, `scheduler-guard.test.js:14`) | holds, with correction — the load-bearing part (no other invocation) is exact; the count is 3 comment lines across the 2 named files, not 2 |
| B4 | `tests/run.js` is 12 lines and is the inlined block | `wc -l`; Python byte-compare of the fenced block against the file | 0 — `identical: True`, 12 lines | holds |
| B5 | One full green run: `2028 pass / 0 fail` | `/tmp/wd-r0-probe/fullrun.js`, `fullrun2.js`, `teardown.js` — three independent full `npm test` runs under redirected `TMPDIR`/`TMP`/`TEMP` | 0 each — `tests 2037 / pass 2028 / fail 0 / skipped 9`, three times | holds |
| B6 | That run "left **1,676 directories** behind in it, and **zero files**" | `fullrun.js` — `lstat` over every top-level entry of the redirected root | 0 — **1,677** entries, all directories, **0 files**. Of these: 1,670 `wd-*`, 6 `gen-agents-md-*`, 1 `node-compile-cache` (Node's own artifact, not a test leak) | holds, with correction — 1,676 is exactly the test-created count; the stated total is short by Node's `node-compile-cache` |
| B7 | "They span **~90 distinct `wd-*` prefixes**" | `fullrun2.js` — counted five ways over the 1,670 `wd-*` names | 0 — **257** distinct prefixes (strip `mkdtempSync`'s 6 random chars); **109** grouping by the first two dash segments; 165 prefixes occur exactly once, so **92** occur two or more times | **does not hold** — no grouping yields ~90 distinct prefixes. The likely origin of "~90" is the 92 prefixes seen more than once (or the neighbouring "88 files" figure), but the sentence as written is wrong by ~3x |
| B8 | Largest producers: `wd-validate-` 145, `wd-manifest-` 143, `wd-sched-` 80, `wd-digest-` 70, `wd-runjob-` 66 | `fullrun.js` — per-prefix histogram | 0 — 145 / 143 / 80 / 70 / 66, and these are exactly the top five | holds (exact) |
| B9 | 88 files under `tests/` call `mkdtempSync` across **302** call sites | `/usr/bin/grep -rl`, `grep -rc`, plus a Python regex count | 0 — 88 files, 302 sites | holds (exact) |
| B10 | 64 of them have fewer `rmSync`/`rmdirSync`/`rimraf` calls than `mkdtempSync` calls, for **229** unmatched sites | Python per-file count over `tests/` | 0 — 64 files, 229 unmatched | holds (exact) |
| B11 | `private-fs.test.js`: 50 `mkdtempSync` vs 1 removal, and that one "targets a file, not a root" | Python count; `sed -n '874,882p' tests/unit/private-fs.test.js` | 0 — `(50, 1)`; the single call is `fs.rmSync(t, { force: true })` at `:879`, on a temp **file** inside a `renameSync` seam | holds (exact) |
| B12 | The suite is temp-directory-agnostic: the redirected run (all three variables set together) was fully green | three full runs, `TMPDIR`+`TMP`+`TEMP` all pointed at a fresh empty root | 0 each — `npm test` exit 0, `fail 0` | holds |
| B13 | That run left **exactly one** unreadable directory, `wd-privfs-XXXXXX/wd/secrets`, mode `000` | `fullrun.js` — recursive mode scan of the root | 0 — exactly 1 directory without owner `rwx`: `wd-privfs-OwyEkX/wd/secrets`, mode `0` | holds (exact) |
| B14 | On it, `rm -rf` fails: `Permission denied`, then `Directory not empty` for each ancestor | `enotempty.js` case (a) — `/bin/rm -rf` on a rebuilt mode-000 tree | 1 — `rm: …/wd/secrets: Permission denied`, `rm: …/wd: Directory not empty`, `rm: …: Directory not empty`; root survives | holds (exact, including the message text) |
| B15 | `fs.rmSync(root, { recursive: true, force: true })` **throws `ENOTEMPTY`** and leaves the tree in place | `enotempty.js` case (b); also `fullrun.js` at full-suite scale | threw — `code=ENOTEMPTY`, `ENOTEMPTY, Directory not empty: …`; root still exists. Reproduced at full-suite scale too | holds (exact) |
| B16 | A recursive walk that `chmod`s each directory to owner-rwx **before** reading it, then the same `rmSync`, removes the tree cleanly | `enotempty.js` case (c); `teardown.js` at full-suite scale | 0 — error `null`, root gone; at full-suite scale 14,952 directories restored then removed with no error | holds |
| B17 | POSIX resolution order: `TMPDIR` → `TMP` → `TEMP` → `/tmp` | `resolution.js` — four spawned children with the variables selectively unset | 0 — all four cases matched (`OK` ×4) | holds (exact) |
| B18 | win32 order `TEMP` → `TMP` → `SystemRoot`/`windir` + `\temp`, read from `require('node:os').tmpdir.toString()` | `node -e 'console.log(require("node:os").tmpdir.toString())'` | 0 — source shows `process.env.TEMP \|\| process.env.TMP \|\| (process.env.SystemRoot \|\| process.env.windir) + '\\temp'` | holds (exact) |
| B19 | Prototype measurement 1: full sequence against the full suite → `2028 pass / 0 fail`, 1,676 entries in the root, root fully removed, **teardown 2.9 seconds**, exit 0, on the real long `/var/folders/.../T` path | `teardown.js` — create root / inject three vars / full `npm test` / restore-walk / `rmSync` in `finally`, teardown timed alone | 0 — `pass 2028 / fail 0`; 1,677 entries (see B6); **teardown 2.88 s** (chmod-walk 0.76 s over 14,952 dirs + `rmSync` 2.12 s); root fully removed; root was `/var/folders/3r/…/T/wd-testrun-VUo9cO` | holds — 2.88 s vs the stated 2.9 s |
| B20 | "…against a **~39-second** suite in the prototype" (Implementation notes) | wall clock across three full runs | 0 — **45.2 s**, **45.9 s**, and `duration_ms 45056` reported by the runner | **does not reproduce** — ~45–46 s observed, not ~39 s. Load/machine-dependent timing figure; the *ratio* the note draws (teardown is small against the suite) still holds |
| B21 | Prototype measurement 2: with the three variables redirected, `node tests/run.js <a temp test file>` reports `CHILD_TMPDIR=<the redirected root>` and `CHILD_GUARD=1` from inside the `node --test` grandchild, through an unmodified `tests/run.js` | `hop.js` — `WIENERDOG_TEST_NO_REAL_SCHEDULER` deliberately deleted from the parent env to prove `tests/run.js` supplies it | 0 — `CHILD_TMPDIR=<root>`, `CHILD_GUARD=1`, and also `CHILD_TMP`/`CHILD_TEMP=<root>`; `pass 1 / fail 0` | holds (exact) |
| B22 | All five scenario entry points refuse without the env var; each prints its **own distinct** skip line and exits 0 | `skipmode.js` — five direct `node <entry>` runs, `WIENERDOG_RUN_SCENARIOS` **deleted**, `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` set | 0 for all five — 5 distinct skip lines out of 5; each line matches the spec's description; **0 temp entries created** by the five skip runs | holds (exact) |
| B23 | Guard locations and shapes: `run-scenarios.js:282` (in `main()`, prints and returns); `run-negative.js:457` (in `main()`, sets `process.exitCode = 0` and returns); `lifecycle-selfcheck.js:28-30`, `run-broker-e2e.js:44-46`, `run-a7-integrity.js:31-33` (module top level, `process.exit(0)`) | `/usr/bin/grep -n WIENERDOG_RUN_SCENARIOS` on all five + `sed` on each guard body | 0 — every line number is exact and every described shape matches | holds, with correction — `run-scenarios.js` **also** sets `process.exitCode = 0` (line 284), identical to `run-negative.js`; the two descriptions do not actually distinguish the files |
| B24 | `.github/workflows/scenarios.yml` is dormant by its own header comment; the real scenario run is a manual local run | `sed -n '1,25p' .github/workflows/scenarios.yml` | 0 — header reads "DORMANT under ADR-0009 …"; trigger is `workflow_dispatch: {}` only | holds |
| B25 | Under `tests/scenarios`: 7 files, 13 `mkdtempSync` sites — the five entry files plus `a7-integrity/fixtures/cases.js` and `fixtures/build.js`; only two deficits, `fixtures/build.js` (5 vs 1) and `run-a7-integrity.js` (3 vs 2) | Python per-file count over `tests/scenarios` | 0 — 7 files, 13 sites, exactly the named files; deficits exactly `build.js` 5 vs 1 and `run-a7-integrity.js` 3 vs 2 | holds (exact) |
| B26 | `memory/lessons/inbox.md:142` is the WP-073 lesson (the pattern flag does not scope the run) | `/usr/bin/grep -n "WP-073" memory/lessons/inbox.md` | 0 — line 142 is exactly that lesson | holds (exact) |
| B27 | `tests/unit/scheduler-leak-guard.test.js` is an existing meta-guard whose header records the fixed-prefix / "a name pattern that matches nothing passes vacuously" trap | `sed -n '1,40p'` on the file | 0 — header lines 10–13 state exactly that | holds (exact) |
| B28 | `src/` has exactly two `mkdtempSync` sites — `tarball.js:213` (removed at `:244`) and `dream/containment-probe.js:163` (removed at `:277`) — both inside `finally` blocks | `/usr/bin/grep -rn mkdtempSync src/`; `grep -n rmSync` on both; `sed` on the contexts | 0 — exactly two sites at 213 and 163; removals at 244 and 277; both under `} finally {` | holds (exact) |
| B29 | `.github/workflows/ci.yml` calls `npm test`; `scenarios.yml` calls `npm run scenarios` | `/usr/bin/grep -n` on both workflows | 0 — `ci.yml:58` `npm test` (and `:21` `npm run lint`); `scenarios.yml:32` `npm run scenarios` | holds |
| B30 | Deliverables comment: `boundary-check.js` always allows the spec file, `package-lock.json`, `memory/lessons/inbox.md`, `docs/specs/logbook/` | `sed -n '40,60p' scripts/boundary-check.js` | 0 — exactly those four `allowed.add` entries, no others | holds (exact) |
| B31 | Table B: `lint` and `gen:agents` "create no temp directories" | `/usr/bin/grep -n "mkdtempSync\|tmpdir"` on `scripts/lint.js` and `scripts/gen-agents-md.js`; traced the 6 `gen-agents-md-*` dirs seen in the run | 0 — neither script contains either token; the leaked dirs come from `tests/unit/gen-agents-md.test.js:28`, i.e. from the **test**, not the script | holds |
| B32 | Table B: npm treats `//` as a comment key — measured that `npm run test` is unaffected and `npm run` prints the note in its script listing | scratch package at `/tmp/wd-r0-probe/npmnote/` carrying the exact literal note from Table B; `npm --prefix … run test` and `npm --prefix … run` | 0 and 0 — `npm run test` executed normally; `npm run` printed the note verbatim under "available via `npm run`:" alongside `//` | holds (npm 11.16.0, Node v24.18.0) |
| B33 | Verification step 2 comment: "macOS `mktemp -d` was observed NOT to honor an exported TMPDIR" | `export TMPDIR=/tmp/wd-r0-probe; mktemp -d` | 0 — returned `/var/folders/3r/…/T/tmp.sm3B6YoY98`, i.e. ignored the exported `TMPDIR` | holds (exact) |
| B34 | Deliverables: `CHANGELOG.md` "is written at release time (`chore(release): …`), never per work package" | `git log --oneline -20 -- CHANGELOG.md` | 0 — 19 of 20 are `chore(release): <version>`; the one exception is `docs(changelog): 0.7.1 entry — docs-only release`, still a release entry, never a per-WP edit | holds |
| B35 | Security checklist item 1 refers to "the template's untrusted-identifier item" | `/usr/bin/grep -n untrusted -A2 docs/specs/_TEMPLATE.md` | 0 — `_TEMPLATE.md:108` is exactly that item, under a "Security checklist" heading at `:106` | holds (the cited input exists) |
| B36 | Contract reference: ADR-0031 activation is **2-of-7**, with (iv) precedence/error behavior and (vii) multiple mirrored surfaces | `sed -n '100,125p' docs/adr/0031-contract-reference-tables-single-source.md` | 0 — "when **two or more** of the following are true"; (iv) and (vii) read exactly as the spec cites them | holds (exact) |
| B37 | Verification block: "Per `docs/runbooks/spec-authoring.md`, each must be observed on **both** sides" | `/usr/bin/grep -n "both sides" docs/runbooks/spec-authoring.md` | 0 — lines 29–30 state the green-and-real-red rule | holds |
| B38 | Definition of done 5 cites `docs/runbooks/codex-review.md` | `ls docs/runbooks/` | 0 — file present | holds |
| B39 | Context: test files create scratch dirs with `fs.mkdtempSync(path.join(os.tmpdir(), 'wd-<name>-'))` — the premise that redirecting `TMPDIR` captures them all | `tmpdirshape.js` — classified all 302 `mkdtempSync` lines under `tests/` | 0 — 301 of 302 resolve through `os.tmpdir()`. **One exception:** `tests/unit/exec-identity.test.js:229` — `fs.mkdtempSync('/tmp/wd-execid-out-')`, a hardcoded `/tmp` path the wrapper's redirection cannot capture | holds, with correction — the exception self-cleans in a `finally` (`:235`), so it leaks nothing, but it is outside the run root and outside verification step 2's counting window on macOS (where ambient temp is `/var/folders/…`, not `/tmp`). The spec does not name it |
| B40 | Table A: "Some tests deliberately create links pointing outside their own root" — the justification for `lstat` + never following symlinks | `/usr/bin/grep -rn symlinkSync tests/unit/`; read `exec-identity.test.js:225-240` | 0 — 105 `symlinkSync` sites; `exec-identity.test.js:233` links `<installDir>/bin/claude` → `/tmp/wd-execid-out-*/evil`, genuinely outside the run root | holds — a concrete instance exists |
| B41 | Discovered issues: 16 real OS-scheduler mutations = 12 × `bootout` + 4 `bootstrap` | arithmetic check only | n/a — 12 + 4 = 16, internally consistent | not re-run — reproducing it requires the full suite **without** `WIENERDOG_TEST_NO_REAL_SCHEDULER`, which the round-zero safety rules forbid |
| B42 | Context: the periodic purge "did not reclaim them … most likely because the purge skips non-empty directories" | — | — | not runnable — explicitly hedged conjecture about the maintainer's historic machine, outside the "measured" Current-state set |
| B43 | Context: 567,710 entries in `$TMPDIR`, Finder at 84% CPU / 3.5 GB RSS, load average 7.37 | — | — | not runnable — historic incident anecdote, not reproducible |

### B.2 — conformance gates

| # | Gate | Command | Exit status / observed | Verdict |
|---|---|---|---|---|
| B44 | Frontmatter schema | `node scripts/check-frontmatter.js` | **0** — "frontmatter check passed: 221 spec(s), 4 agent(s)" | holds |
| B45 | Markdownlint on the spec | `npx markdownlint-cli2 "docs/specs/WP-temp-root-wrapper.md"` | **1** — 56 errors, **all** MD013 (line-length), MD025 (multiple H1) and MD060 (table column style) | see B46 — the bare invocation does not load the repo's config |
| B46 | Markdownlint on the spec, repo config | `npx --no-install markdownlint-cli2 --config package.json --configPointer /markdownlint-cli2 "docs/specs/WP-temp-root-wrapper.md"` | **0** — "Summary: 0 error(s)". The repo config (inline in `package.json`) sets `MD013: false`, `MD025: false`, `MD060: false` — exactly the three rules B45 flagged | holds — the real gate is green |
| B47 | Full lint pipeline | `npm run lint` | **0** — markdownlint 485 files / 0 errors; frontmatter passed. (shellcheck and PSScriptAnalyzer skipped locally: binaries absent) | holds |
| B48 | Boundary check, positive | `node scripts/boundary-check.js docs/specs/WP-temp-root-wrapper.md tests/with-temp-root.js tests/unit/tmpdir-leak-guard.test.js package.json` | **0** — all three accepted | holds |
| B49 | Boundary check, negative control | `node scripts/boundary-check.js docs/specs/WP-temp-root-wrapper.md tests/run.js` | **1** — "Files outside the spec's Deliverables table: tests/run.js" | holds — `tests/run.js` is correctly rejected |

### B.3 — acceptance criteria

| # | Criterion | How checked | Status | Verdict |
|---|---|---|---|---|
| C1 | Full `npm test` leaves the ambient temp dir's `wd-*` count unchanged | requires `tests/with-temp-root.js` | — | not runnable pre-implementation |
| C2 | Same pass/skip counts as before; `tests/run.js` byte-identical | baseline established: `pass 2028 / fail 0 / skipped 9` (×3 runs); `tests/run.js` byte-compared to the spec's inlined block | baseline holds | post-change half not runnable pre-implementation; see finding **A2** (no skip baseline recorded in the spec) |
| C3 | All six scripts routed through the wrapper, names kept | requires the wrapper and the guard test | — | not runnable pre-implementation |
| C4 | `"//"` note present, names the wrapper, `npm test` still runs | mechanism proven in a scratch package (B32); the repo's own `package.json` has no `//` key today | — | not runnable pre-implementation (mechanism holds) |
| C5 | Argument forwarding survives the hop | requires the wrapper | — | not runnable pre-implementation |
| C6 | Wrapper injects only `TMPDIR`/`TMP`/`TEMP` | requires the wrapper | — | not runnable pre-implementation; see finding **A1** |
| C7 | The unit suite still receives `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` from the untouched `tests/run.js` | `hop.js` — proven today with the variable deleted from the parent env (B21) | 0 — `CHILD_GUARD=1` | baseline holds |
| C8 | Five scenario scripts still exit 0 in skip mode with their existing lines | `skipmode.js` (B22) | 0 ×5, 5 distinct lines | baseline holds |
| C9 | Teardown removes a tree containing a mode-`0o000` directory | `enotempty.js` case (c) and `teardown.js` (B16) | 0 | mechanism holds; the guard test itself is not runnable pre-implementation |
| C10 | Teardown does not follow a symlink out of the root | requires the wrapper | — | not runnable pre-implementation (the real-world case exists — B40) |
| C11 | Exit status follows Table A in both directions | requires the wrapper | — | not runnable pre-implementation; see finding **A5** |
| C12 | No argument → non-zero + usage | requires the wrapper | — | not runnable pre-implementation |
| C13 | Guard cases go red when env injection or the permission walk is removed | requires the wrapper and the guard test | — | not runnable pre-implementation; see finding **A4** |
| C14 | Every test name in the new file carries a fixed shared prefix | requires the guard test (precedent verified — B27) | — | not runnable pre-implementation |
| C15 | Idempotence: two consecutive `npm test` runs each leave the count unchanged | two independent full runs into fresh roots (`fullrun.js`, `fullrun2.js`) | 0 and 0 — both produced 1,677 entries in their own fresh root and both roots were fully removed | baseline holds (the leak is deterministic run to run); the post-change assertion is not runnable pre-implementation |
| C16 | `npm run lint` passes | `npm run lint` (B47) | 0 | holds today |

### B.4 — verification steps

| # | Step | How checked | Status | Verdict |
|---|---|---|---|---|
| V0 | Preamble — isolated `mktemp -d` root with all three variables exported | applied to every counted run in this pass; `mktemp` behavior confirmed (B33) | 0 | holds |
| V1 | `npm test` green through the wrapper | ran `npm test` under redirected temp (pre-wrapper) ×3 | 0 ×3 | not runnable pre-implementation as written; pre-change baseline green |
| V2 | Ambient `wd-*` count unchanged across a full run | requires the wrapper (today the count goes 0 → 1,670 by construction) | — | not runnable pre-implementation |
| V3 | Repeat step 2 (idempotence) | see C15 | — | not runnable pre-implementation; see the "also noted" entry on step 3 having no command |
| V4 | Argument forwarding (`npm test -- <file>`, `-- --test-name-pattern`) | requires the wrapper; the WP-073 caveat it cites was verified (B26) | — | not runnable pre-implementation |
| V5 | Five scenario scripts in skip mode, counts unchanged | `skipmode.js` ran all five in skip mode via `node <entry>` (not `npm run`, which would need the wrapper); measured 0 temp entries created | 0 ×5 | mechanism holds; the `npm run` form is not runnable pre-implementation |
| V6 | Synthetic leaky child, including a mode-000 subtree | the *filesystem* half was reproduced independently (`enotempty.js`, B14–B16); the wrapper half is missing | — | not runnable pre-implementation |
| V7 | Exit status, red side (`process.exit(7)`) | requires the wrapper | — | not runnable pre-implementation |
| V8 | Wrapper injects nothing beyond the three temp variables | requires the wrapper; the step's empty-assignment semantics were measured | — | not runnable pre-implementation; see finding **A1** |
| V9 | No argument → usage, not silent success | requires the wrapper | — | not runnable pre-implementation |
| V10 | `"//"` note present and names the wrapper | the exact `node -e` line was run against today's `package.json` | **1** — `note: <missing>` (expected: the key does not exist yet) | correctly red pre-implementation — the step is a working assertion |
| V11 | `npm run lint` | ran (B47) | 0 | holds |
| V12 | Teardown of the isolated root (`chmod -R u+rwx` then `rm -rf`) | the equivalent was applied after every counted run in this pass, including after runs that left a mode-000 subtree | 0 — every root verified gone | holds |

---

## Counts

- **Part A findings: 7** (A1–A5 substantive, A6–A7 low), plus 3 items
  deliberately examined and not raised.
- **Part B claims/criteria checked: 78** (43 current-state / command-citing,
  6 conformance gates, 16 acceptance criteria, 13 verification steps).
- **Part B failures: 2** — B7 (`~90 distinct wd-* prefixes` → 257 measured) and
  B20 (`~39-second suite` → ~45–46 s measured).
- **Part B "holds, with correction": 4** — B3 (2 vs 3 comment lines), B6
  (1,676 vs 1,677 entries), B23 (`run-scenarios.js` also sets `exitCode = 0`),
  B39 (301/302 sites use `os.tmpdir()`; one hardcodes `/tmp`).
- Everything else in Part B either holds as written or is marked *not runnable
  pre-implementation*.

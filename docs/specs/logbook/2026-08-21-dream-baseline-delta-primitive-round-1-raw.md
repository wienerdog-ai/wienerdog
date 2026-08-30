---
title: Round 1 — external adversarial design review (raw), WP-dream-baseline-delta-primitive
date: 2026-08-21
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. The reviewer's empty-output
     fences are rendered as the word (empty); nothing else was altered. -->

# Round 1 — external adversarial design review (raw)

Backend: `gptsol`, English-pinned. Reviewer instructions:
`docs/runbooks/review-prompts/adversarial.md`, verbatim, placeholders filled.
Spec at commit `8743144` (275 lines). Base: `main` @ `e648284`.

The dispatch carried the scope rule with four routed classes, the both-ends citation
check, and TWO focus targets: the git-equivalence obligation (Table C, especially the
binary predicate) and the completeness claim. It also stated the **category-error
guard before the vendored prompt**: a finding that this package lacks locking,
re-validation or a generation invariant is not a finding against it, because it has no
consumer by ruling — such an objection must be filed in Routed as a scope objection and
must not count toward the verdict. Read-only verified both sides.

## Verbatim reviewer output

---

NO-SHIP — four material contract defects remain: the filter cannot be preserved across calls, the conservative-binary exception contradicts the line-equivalence obligation, Git attributes invalidate the binary corpus, and the no-follow guarantee is not race-safe.

## Finding 1 — The caller-supplied scope cannot be preserved across capture and delta

- **Affected file:** `docs/specs/WP-dream-baseline-delta-primitive.md`
- **line_start:** 95
- **line_end:** 120
- **confidence:** 1.0

1. **What can go wrong?**
   An existing file excluded by `include` can later be reported as `added`, falsely attributing pre-existing content to the machine. Alternatively, an implementation that only revisits baseline paths cannot detect genuinely new files that would have passed `include`.

2. **Why is this code path vulnerable?**
   `captureBaseline(rootDir, include)` accepts the filter, but `computeDelta(rootDir, baseline)` does not. Table A restricts `Baseline` to `{files, anomalies}` and explicitly says "Nothing else." Once capture returns, there is therefore no information from which `computeDelta` can decide whether a path absent from `baseline.files` was:
   - excluded by the caller's filter, or
   - genuinely absent at capture and newly added.

   This is an information-loss defect, not a disagreement about which files should matter.

3. **What is the likely impact?**
   The primitive can produce exactly the false accusation that the completeness rule is intended to prevent. A successor cannot safely use filtering without adding an out-of-contract side channel or changing the API.

4. **What concrete change would reduce the risk?**
   Preserve the scope predicate across both walks. For example, require the same `include` argument on `computeDelta`, or make the baseline carry a reusable declarative scope. Add acceptance cases for a pre-existing excluded file, a newly created excluded file, and a newly created included file.

## Finding 2 — The permitted conservative-binary result contradicts the exact line-equivalence obligation

- **Affected file:** `docs/specs/WP-dream-baseline-delta-primitive.md`
- **line_start:** 136
- **line_end:** 175
- **confidence:** 1.0

1. **What can go wrong?**
   An implementation can take the explicitly permitted fail-closed path for the mandatory "NUL beyond Git's prefix window" fixture, but then cannot satisfy the same spec's `addedLineNumbers` and derived-scan-text obligations.

2. **Why is this code path vulnerable?**
   The live Git 2.50.1 reproduction showed that an added 10,000-byte file with a NUL at byte 9000 is text according to Git:

   ```text
   numstat: 1<TAB>0<TAB>nul-9000.bin
   git diff --cached -U0: one added-line hunk
   ```

   Lines 170-175 explicitly permit a whole-file-NUL predicate to classify this fixture conservatively as `binary: true`. But Table B then requires `addedLineNumbers: []`, while Table C unconditionally requires equality with Git's hunk-derived line numbers and byte-identical derived scan text. Git supplies an added line; the permitted conservative result supplies neither that line number nor its text.

3. **What is the likely impact?**
   The differential cannot simultaneously prove all advertised contracts when the implementation uses the exception the spec explicitly allows. A test or implementer must silently weaken either binary conservatism or line equivalence.

4. **What concrete change would reduce the risk?**
   Choose one coherent contract: require exact reproduction of Git's bounded-prefix predicate and remove the conservative exception; or retain conservative binary classification, but explicitly condition the exact `addedLineNumbers` and scan-text obligations on `binary === false`, with conservative-binary records exempt because consumers withhold them.

## Finding 3 — The Git-binary corpus omits repository attributes that override the byte heuristic

- **Affected file:** `docs/specs/WP-dream-baseline-delta-primitive.md`
- **line_start:** 136
- **line_end:** 151
- **confidence:** 0.99

1. **What can go wrong?**
   The required differential can pass while the primitive disagrees with Git in the unsafe direction on a real repository: returning `binary: false` for bytes Git treats as binary.

2. **Why is this code path vulnerable?**
   Git's `--numstat` signal is not determined only by the bounded byte prefix. The executed fixture used:

   ```gitattributes
   *.forced-binary binary
   *.forced-text diff
   ```

   Git 2.50.1 produced:

   ```text
   plain.forced-binary: diff unset
   numstat: -<TAB>-<TAB>plain.forced-binary

   nul.forced-text: diff set
   numstat: 1<TAB>0<TAB>nul.forced-text
   ```

   Thus plain ASCII can be binary, and an early-NUL file can be text. Table B defines `binary` in terms of `afterBytes`, but Table C compares it with Git's repository-sensitive signal. The mandatory corpus includes neither attribute override. It therefore does not prove the stated equivalence or expose the less-conservative plain-text divergence.

3. **What is the likely impact?**
   A successor workspace containing `.gitattributes` can receive a different scan/withhold decision from the validator evidence this primitive claims to replace. In the plain-text-forced-binary case, unscannable-by-policy content can be treated as scannable.

4. **What concrete change would reduce the risk?**
   Either add forced-binary and forced-text attribute cases to the differential and define how a Git-free implementation obtains equivalent attribute semantics; or explicitly narrow the primitive's contract to Git's default content heuristic and make the successor prove that repository attributes cannot alter relevant paths.

## Finding 4 — Static symlink tests do not enforce "never followed" during the classify/read gap

- **Affected file:** `docs/specs/WP-dream-baseline-delta-primitive.md`
- **line_start:** 121
- **line_end:** 124
- **confidence:** 0.98

1. **What can go wrong?**
   A path classified as a regular file can be replaced with a symlink before its bytes are read. A normal pathname read then follows the symlink and captures bytes outside `rootDir`, violating both the containment and anomaly contracts.

2. **Why is this code path vulnerable?**
   The acceptance criteria only exercise symlinks that already exist when the walk encounters them. They do not discriminate a common implementation shaped as `lstatSync(path)` followed by `readFileSync(path)`.

   The executed reproduction classified a path as regular, replaced it with a symlink, then read it:

   ```json
   {
     "lstatWasRegular": true,
     "ordinary": { "ok": true, "bytes": "outside\n" },
     "nofollow": { "ok": false, "code": "ELOOP" }
   }
   ```

   This is not a demand for consumer locking or delta freshness. It is a direct violation of the primitive's own universal "never followed" read guarantee.

3. **What is the likely impact?**
   The baseline can silently contain external bytes under an internal relative path. That makes the baseline wrong and crosses the filesystem containment boundary the security checklist claims to enforce.

4. **What concrete change would reduce the risk?**
   Require the classification and read to be bound to the same opened object — for example, open with `O_NOFOLLOW`, verify the opened descriptor with `fstat`, and read from that descriptor. Add a discriminator that substitutes a symlink between classification and open/read and requires a throw or anomaly, never external bytes.

## Citation verification

All seven source range citations were checked at both endpoints against commit
`874314467ed7553eb6e47431999c0a99d6e86ef8`: `dream.js:44-55`, `dream.js:66-78`,
`private-fs.js:619-669`, `validate.js:1020-1034`, `validate.js:752-764`,
`validate.js:1258-1262`, `validate.js:1245-1246` — all correct at both ends.
**No surviving citation-range drift was found.**

## Routed (out of this package's scope)

Empty. I did not count consumer wiring, freshness, locking, generation invariants, gate policy, promotion policy, or file-selection policy toward the verdict.

## What I executed

- Initial and final `git status --porcelain` capture and byte comparison — exit 0.
- `nl -ba` over the spec, all round-zero records, and all four cited source files; focused `sed -n` on every cited range at both endpoints — exit 0.
- Python extraction of all file/line citations from the spec — exit 0.
- Git binary-prefix repository fixture with NUL at bytes 100 and 9000 — exit 0.
- Git `.gitattributes` forced-binary/forced-text reproduction — exit 0.
- `lstat`/symlink-substitution/read reproduction — exit 0.
- Git added-line corpus covering empty files, no trailing newline, CRLF, becomes-empty, pure deletion, append, interior replacement, and mode-only changes — exit 0.
- macOS non-UTF-8 filename probe — exit 0; both invalid-byte filename creations failed with `EILSEQ`, so no Linux behaviour was inferred from it.
- Docker availability probe for a Linux filename experiment — exit 1; Docker installed but unavailable, so that experiment was **not claimed**.
- Invalid-UTF-8 staged-diff reproduction and raw-byte parse — exit 0.
- `npm test` — exit 0: tests 2048, passed 2039, failed 0, skipped 9.
- `npm run lint` — exit 0: markdownlint 0 issues; frontmatter 223 specs, 4 agents; shellcheck and PSScriptAnalyzer skipped, binaries unavailable.
- I did **not** run `npm test -- --test-name-pattern "dream-delta"`: this was a design-spec review and the proposed module and test file do not yet exist. The full existing suite did run.

## Before/after `git status --porcelain` proof

Before — exit 0, 0 bytes, (empty). After — exit 0, 0 bytes, (empty). Byte-identical.
Scratch removal and scratch-absent check both exit 0.

---

## Orchestrator spot-check (not the reviewer's words)

Per `docs/runbooks/codex-review.md` → Rules, every load-bearing claim was re-run
against the tree before anything was acted on. **All four CONFIRMED**, two of them by
independent reproduction rather than by reading the reviewer's.

| Reviewer claim | Measured | Verdict |
|---|---|---|
| F1: `computeDelta` cannot tell "excluded" from "newly added" | `computeDelta(rootDir, baseline)` takes no filter (spec `:105`); Table A `:118` limits the baseline to `{files, anomalies}` with "Nothing else"; `:120` makes scope caller-supplied. The information is genuinely absent | **CONFIRMED** |
| F2: the tables contradict each other on the mandated NUL-9000 fixture | Table B `:137` forces `addedLineNumbers: []` when `binary` is true; Table B `:136` permits a conservative `binary: true`; Table C `:148` demands equality with git's hunk-derived numbers unconditionally. Reproduced independently: git reports `1\t0` for a NUL at byte 9000 — one added line | **CONFIRMED** |
| F3: `.gitattributes` overrides the byte heuristic | Reproduced independently on git 2.50.1, **both directions**: plain ASCII marked `binary` → `-\t-`; an early-NUL file marked `diff` → `1\t0`. Git's signal is repository-configuration-sensitive, so a git-free module cannot reproduce it from bytes alone | **CONFIRMED — and it makes Table C's obligation unachievable as written** |
| F4: `lstat`-then-read follows a substituted symlink | Reproduced independently: `lstatWasRegular: true`, ordinary read returned the OUTSIDE file's bytes, `O_NOFOLLOW` open refused with `ELOOP` | **CONFIRMED** |
| Citations: no surviving drift | spot-checked; the round-zero corrections held | **CONFIRMED** |

**The category-error guard worked.** The Routed section came back explicitly empty
and the reviewer stated it had not counted freshness, locking or generation
invariants toward the verdict. Pre-empting that confusion before the vendored prompt,
rather than routing it afterwards, cost nothing and saved a round.

---
title: Round 2 — external adversarial design review (raw), WP-dream-baseline-delta-primitive
date: 2026-08-21
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE. TWO declared deviations: empty-output fences
     are rendered as the word (empty), and the 25-item execution list is condensed to
     its load-bearing entries with every result preserved (the full list is in the
     agent transcript). The findings themselves are byte-verbatim. -->

# Round 2 — external adversarial design review (raw)

Backend: `gptsol`, English-pinned. Reviewer instructions:
`docs/runbooks/review-prompts/adversarial.md`, verbatim, placeholders filled.
Spec at commit `2b6123f` (350 lines). Reviewed tree `e648284`.

Round ≥ 2 dispatch: PART A verified each round-1 finding as genuinely fixed or merely
re-worded; PART B ran a full fresh round with two focus areas — the reference
judgment's isolation set (the dispatch told the reviewer this program's record at
enumerating hidden-influence channels is 0 for 3, and to treat the list as probably
incomplete) and the completeness claim. The category-error guard again preceded the
vendored prompt. Read-only verified both sides.

## Verbatim reviewer output

---

# NO-SHIP — the round-1 fixes close some leaf cases, but the reference judgment remains environment-sensitive, Git's binary predicate is specified against the wrong byte set, and the filesystem/scope guarantees remain bypassable.

## PART A — Round-1 findings

| # | Status | Evidence |
|---|---|---|
| 1. Scope predicate lost between calls | **PARTIAL** | The same callback now travels in `{files, anomalies, include}` and `computeDelta` has no separate filter parameter (`:93-121`). That prevents accidentally passing a different callback argument. It does not make scope mismatch structurally impossible: the contract accepts any JavaScript function and imposes no purity or stability requirement. I executed one callback whose closure returned `false` during capture and `true` during delta while retaining the same function identity. A pre-existing excluded path can therefore become eligible and be reported `added`. The baseline object itself is also structurally mutable unless the implementation freezes or validates it, despite the "immutable baseline" claim. |
| 2. Conservative binary versus unconditional line equivalence | **FIXED** | Table C now conditions both exact line obligations on `binary === false`, and explicitly exempts binary records (`:170-173`). Table B consistently fixes their line numbers to `[]` (`:140-141`). The original contradiction no longer exists. A different before-side binary defect remains and is reported below. |
| 3. Repository-sensitive Git judgment | **NOT FIXED** | Neutral CWD, `/dev/null` global config, disabled system config, and `--no-ext-diff` (`:150-166`) block the channels named in round 1, but they do not make Git a pure function over the supplied bytes. I reproduced plain ASCII changing from `1<TAB>1` to `-<TAB>-` under the exact stated switches through both `XDG_CONFIG_HOME/git/attributes` and `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0=core.attributesFile`. |
| 4. Race-safe no-follow behavior | **PARTIAL** | Opening the leaf with `O_NOFOLLOW`, checking the descriptor, and reading that descriptor (`:124-126`) fixes a leaf replacement. It does not protect intermediate directory components: I replaced the parent directory with a symlink before `openSync`. `O_NOFOLLOW` still opened the outside regular leaf, `fstat` accepted it, and the read returned `"outside\n"`. The acceptance criterion at `:269-273` does not explicitly require an intermediate-component substitution and therefore permits a test that validates only the leaf fix. |

## PART B — Fresh findings

### Finding 1 — The reference judgment still reads user attributes and command-scope configuration

**line_start:** 150 · **line_end:** 174 · **confidence:** 1.0

1. **What can go wrong?** The differential can classify identical supplied bytes differently on two developer or CI machines. A correct byte-only implementation can fail, or an incorrect implementation can be ratified against a contaminated oracle.

2. **Why is this vulnerable?** The isolation set only disables system and global configuration files and external diff execution. Git also reads per-user attributes independently of `GIT_CONFIG_GLOBAL`, and command-scope configuration can be injected directly through the environment. Under the specified switches, the control returned text (`1<TAB>1`). Setting only `XDG_CONFIG_HOME` to a directory containing `git/attributes` with `*.dat binary` changed it to `-<TAB>-`. The same change occurred with `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=core.attributesFile`, `GIT_CONFIG_VALUE_0=<hostile attributes file>`, while retaining `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, neutral CWD, `--no-ext-diff`, and `--no-index`.

3. **What is the likely impact?** Table C's central assertion that the reference is "a pure function over bytes" is false. The mandatory test becomes host-dependent at exactly the security classification boundary it is intended to establish.

4. **What concrete change would reduce the risk?** Define a complete sanitized environment for both Git invocations. At minimum, isolate `HOME` and `XDG_CONFIG_HOME` in empty temporary directories, set `GIT_ATTR_NOSYSTEM=1`, clear inherited `GIT_CONFIG_*`, `GIT_DIR`, and `GIT_WORK_TREE` variables, and explicitly set `GIT_CONFIG_COUNT=0`. Add a hostile-environment control proving that user attributes and command-scope config cannot change the judgment.

### Finding 2 — `binary` is defined from `afterBytes`, but Git's signal examines both sides

**line_start:** 137 · **line_end:** 174 · **confidence:** 1.0

1. **What can go wrong?** A modified path with binary baseline bytes and plain-text current bytes must be `binary: false` under Table B but binary under the required Git reference. Deleted binary paths have the same conflict.

2. **Why is this vulnerable?** Table B defines `binary` as whether `afterBytes` is unscannable (`:140`). Git's `--numstat` judgment is pairwise. I supplied an early-NUL before file and a plain-text after file; Git returned `-<TAB>-`. Reversing the operands also returned `-<TAB>-`. Deleting the binary file by comparing it with `/dev/null` likewise returned `-<TAB>-`. Therefore, checking only `afterBytes` cannot equal the reference judgment for the mandatory modified and deleted categories.

3. **What is the likely impact?** The implementation cannot satisfy Tables B and C simultaneously. Depending on which table it follows, the differential either fails or the primitive misstates its advertised meaning of `binary`.

4. **What concrete change would reduce the risk?** Define `binary` over the before/after pair exactly as the reference does, including additions and deletions. If the desired product meaning is specifically "current bytes cannot be scanned," give that fact a different field and stop claiming that it equals pairwise `--numstat`.

### Finding 3 — Leaf-only `O_NOFOLLOW` does not establish containment

**line_start:** 124 · **line_end:** 126 · **confidence:** 0.99

1. **What can go wrong?** An intermediate directory can be replaced by a symlink after enumeration. The final leaf remains a regular file, so `O_NOFOLLOW` and `fstat` both succeed while the module reads bytes outside `rootDir`.

2. **Why is this vulnerable?** `O_NOFOLLOW` applies only to the final path component. The spec requires only that the final descriptor be a regular file. My reproduction classified `root/inside/probe.txt`, renamed `inside`, replaced it with a symlink to an outside directory, and then opened the original pathname with `O_NOFOLLOW`. The result was `{"classifiedRegular":true,"openedRegular":true,"bytes":"outside\n"}`. The cited precedent itself warns about this distinction and uses expected `(dev, ino)` revalidation at `src/core/private-fs.js:687-751`, especially `:694-698` and `:734-736`. The new contract does not carry equivalent directory ancestry or expected-object validation.

3. **What is the likely impact?** The baseline can silently contain external content under an internal relative path. This violates both the "never followed" and containment contracts and crosses the stated untrusted-path boundary.

4. **What concrete change would reduce the risk?** Extend the contract and discriminator to intermediate-component replacement, not just leaf substitution. Require a traversal mechanism that binds each directory component to verified directory objects, or narrow the advertised containment guarantee if portable Node APIs cannot provide that guarantee.

### Finding 4 — Carrying an executable predicate does not preserve its meaning

**line_start:** 93 · **line_end:** 123 · **confidence:** 0.98

1. **What can go wrong?** A path excluded during capture can be included during delta and reported `added`, even though `computeDelta` reuses the exact callback object stored in the baseline.

2. **Why is this vulnerable?** JavaScript callbacks can depend on mutable closure state, environment variables, time, external files, invocation count, or arbitrary side effects. The contract accepts any `(rel) => boolean` and claims carrying it makes mismatched scope "structurally impossible." I executed the same function object twice: `{"sameFunction":true,"capture":false}` then `{"sameFunction":true,"delta":true}`. No API misuse or replacement callback is required.

3. **What is the likely impact?** The false-attribution failure that motivated the round-1 change remains possible, and the acceptance cases using a pure predicate will not detect it.

4. **What concrete change would reduce the risk?** Replace the executable callback with an immutable declarative scope that can be evaluated identically on both walks. If callbacks must remain, remove the "structurally impossible" and completeness claims and state an explicit stable-predicate caller invariant; add a stateful-predicate test showing the chosen failure behavior.

### Finding 5 — The binary-prefix boundary is neither specified nor exhaustively tested

**line_start:** 163 · **line_end:** 207 · **confidence:** 0.96

1. **What can go wrong?** An implementation can use the wrong bounded prefix and pass the mandatory corpus. For example, a 4096-byte cutoff passes an early-NUL fixture and the named `NUL@9000` fixture but incorrectly classifies a NUL at byte 5000 as text.

2. **Why is this vulnerable?** The product is described as a NUL check "within git's bounded prefix window," but the window size is never part of the contract. The minimum corpus requires only one NUL beyond the window, so it does not pin either side of the actual boundary. With Git 2.50.1, I measured `NUL@7999 -> -<TAB>-`, `NUL@8000 -> 1<TAB>0`, `NUL@9000 -> 1<TAB>0`. A single far-beyond fixture does not distinguish 8000 from many incorrect smaller cutoffs.

3. **What is the likely impact?** Product classification can diverge in the unsafe direction for files containing a NUL between the implementation's shorter cutoff and Git's real cutoff, while all required tests remain green.

4. **What concrete change would reduce the risk?** Make the boundary explicit for the pinned Git behavior and require boundary-adjacent fixtures — at least NUL at bytes 7999 and 8000. Alternatively, require a generated differential across every relevant prefix position so the exact boundary is established by the test rather than prose.

## Citation verification

All seven source range citations resolve and end with the cited construct
(`dream.js:44-55`, `:66-78`; `private-fs.js:619-669`, `:687-751`;
`validate.js:752-764`, `:1020-1034`, `:1245-1246` and `:1258-1262`).
**No citation-range drift was found at either endpoint.**

## Routed (out of this package's scope)

- A concurrent creation after a directory has been enumerated can be absent from the returned baseline and later appear `added`; a concurrent removal can prevent the walk from representing one coherent directory state. Eliminating those cases requires locking, generation tracking, or re-enumeration/revalidation. Per the binding scope rule, this is a **scope objection**, not counted toward the verdict.
- Consumer freshness, gate wiring, EP2 enforcement, promotion policy, Git execution seam, layout dot-rule, and existing policy values were not counted.

## What I executed (condensed; every result preserved)

Read the complete spec, all four logbook records, the predecessor banner, all cited
source files and the three process documents; verified `HEAD` `2b6123f` and base
`e648284`; checked both endpoints of every citation — all exit 0. Reproductions, each
exit 0 with git's expected exit 1 on differing operands: hostile
`GIT_CONFIG_COUNT`/`core.attributesFile`; hostile `XDG_CONFIG_HOME/git/attributes`; an
explicit `GIT_DIR`/`GIT_WORK_TREE` probe (did NOT alter the judgment, so no claim rests
on it); binary-before/text-after, text-before/binary-after and binary-deletion;
intermediate-directory symlink substitution under `O_NOFOLLOW` (outside bytes read);
stateful `include` predicate; git binary boundary at bytes 100, 1000, 7999, 8000, 9000.
`git --version` → 2.50.1 (Apple Git-155). `npm test` → exit 0, 2048 tests, 2039 passed,
0 failed, 9 skipped. `npm run lint` → exit 0. `npm test -- --test-name-pattern
"dream-delta"` was **not run**: both deliverables are absent, as expected for a Draft
design review. Scratch removed and absence verified. One wrapper exited 1 because zsh
reserves `status` as read-only; it made no repository changes and the corrected wrapper
exited 0.

## Before/after `git status --porcelain` proof

Before: exit 0, 0 bytes, (empty). After: exit 0, 0 bytes, (empty). Byte-identical.

## Lessons/gotchas

- WP-dream-baseline-delta-primitive: disabling Git configuration files does not disable per-user attributes or command-scope configuration from the environment.

---

## Orchestrator spot-check (not the reviewer's words)

Every load-bearing claim re-run independently before anything was folded. **All five
CONFIRMED — and finding 1 is WORSE than reported.**

| Reviewer claim | Measured independently | Verdict |
|---|---|---|
| The ruled isolation set does not isolate | Under the EXACT ruled switches: control `1\t1`; `+XDG_CONFIG_HOME/git/attributes` → `-\t-`; `+GIT_CONFIG_COUNT/core.attributesFile` → `-\t-` | **CONFIRMED** |
| The reviewer's own remedy list closes it | **REFUTED.** `GIT_ATTR_NOSYSTEM=1` added to the XDG case → still `-\t-`. Overriding `HOME` added to the XDG case → still `-\t-`. Neither closes the channel it was recommended for | **The remedy as stated is also incomplete** |
| A complete sanitation exists | Yes: `XDG_CONFIG_HOME` + `HOME` at empty dirs, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_COUNT=0`, `GIT_ATTR_NOSYSTEM=1` → `1\t1` with BOTH channels armed. **But** point the sanitized `XDG_CONFIG_HOME` at a hostile directory and it flips back to `-\t-` — the guarantee is not the flag, it is where the flag points | **CONFIRMED, and it argues for a control rather than a list** |
| `binary` is pairwise | binary→text `-\t-`; text→binary `-\t-`; binary deletion vs `/dev/null` `-\t-` | **CONFIRMED** |
| Leaf-only `O_NOFOLLOW` is bypassable via an intermediate directory | `{"openedRegular":true,"bytes":"outside\n","devInoMatches":false}` — and the `(dev, ino)` mismatch is what catches it, exactly the precedent's discipline the contract failed to carry | **CONFIRMED** |
| A stateful predicate defeats the carried callback | logic-verified against the spec text; no API misuse required | **CONFIRMED** |
| The prefix window is 8000 | `NUL@7999` → `-\t-`, `NUL@8000` → `1\t0`, `NUL@8001` → `1\t0`. Boundary is exactly 8000 on git 2.50.1 | **CONFIRMED** |

**The channel count is now 0 for 4** (self-hiding `.gitignore`, fake `.git` marker,
`diff.external`, and now user attributes + command-scope config). Since the reviewer's
own remedy was ALSO incomplete when measured, the fix folded here is a change of
SHAPE, not a longer list: the corpus gains a mandatory hostile-environment control,
proven in both directions.

The Routed section came back a correctly-filed scope objection rather than a
miscounted finding — the category-error guard, now a repo rule, held for the second
consecutive round.

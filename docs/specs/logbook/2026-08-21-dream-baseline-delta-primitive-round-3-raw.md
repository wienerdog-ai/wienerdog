---
title: Round 3 — external adversarial design review (raw), WP-dream-baseline-delta-primitive
date: 2026-08-21
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE. Declared deviations: empty-output fences are
     rendered as the word (empty), and the execution list is condensed with every
     result preserved (full list in the agent transcript). Findings are verbatim. -->

# Round 3 — external adversarial design review (raw)

Backend: `gptsol`, English-pinned. Reviewer instructions:
`docs/runbooks/review-prompts/adversarial.md`, verbatim. Spec at `a6f87f4` (407 lines).
Branch based on `e648284`; `main` had advanced to `a1b473c` (docs-only landing, touches
no cited file), and the dispatch said so rather than asserting `main == origin/main`.

Dispatch focus: attack the constructed-environment claim hardest, specifically hunting
a channel that is **neither an environment variable nor a file under a controlled
root**; plus genuine-versus-reworded verdicts on all five round-2 findings, with inode
reuse and case-insensitive filesystems named against the `(dev, ino)` discipline. The
category-error guard again preceded the vendored prompt.

## Verbatim reviewer output

---

# NO-SHIP — four material defects remain: the constructed reference can execute a PATH-selected impostor, `(dev, ino)` does not close same-inode ancestor relocation, a regular-file-to-FIFO race can hang capture, and the advertised baseline is not immutable.

## PART A — Round-2 findings

| # | Round-2 finding | Verdict | Evidence |
|---|---|---|---|
| 1 | Reference judgment was environment-sensitive | **PARTIAL** | Building the child environment from nothing closes inherited `XDG_CONFIG_HOME` and `GIT_CONFIG_COUNT` injection. Empty `HOME`/XDG roots plus the system/global switches also resisted the operand repository experiment: an operand directory containing both `.git` and `*.dat binary` still returned `1\t1`. However, the contract never fixes how the `git` executable is selected. A constructed environment with a PATH entry containing a hostile `git` returned a forged `-\t-` result while satisfying the stated empty-root construction. The mandatory hostile control arms only the two previously known environment/config channels, so it does not catch this. |
| 2 | `binary` defined from `afterBytes` although Git judges the pair | **FIXED** | Table B defines `binary` over the pair (`:142`); Table C requires the pairwise `--numstat` signal (`:211`); acceptance covers a binary before side with a text after side (`:329-337`). Added, modified and deleted records are coherent; deleted binary records correctly receive `addedLineNumbers: []`. No surviving after-only requirement. |
| 3 | Leaf-only `O_NOFOLLOW` did not establish containment | **NOT FIXED** | The leaf `(dev, ino)` comparison catches an ancestor swap only when the redirected leaf has a different identity. Moving the already-classified directory outside the root and replacing its old location with a symlink to that same directory preserves the leaf's `(dev, ino)`. `O_NOFOLLOW`, `fstat` and identity comparison all succeed, yet the read resolves outside the root. |
| 4 | Carrying the callback did not preserve its meaning | **FIXED** | The spec no longer claims structural enforcement; it states the caller precondition and names false attribution as the consequence (`:123`), with the violation behaviour pinned at `:319-321`. A purity precondition is an adequate interface contract for an arbitrary caller-supplied function; the implementation cannot generally prove closure purity. |
| 5 | Binary-prefix boundary unspecified | **FIXED** | Fixtures must dynamically locate the transition and test adjacent offsets on both sides (`:216`, `:326-328`). I executed a doubling-plus-binary search against the constructed reference; it located last-binary 7999 and first-text 8000. The criterion also requires a shorter implementation cutoff to fail. |

## PART B — Fresh findings

### Finding 1 — The constructed environment does not construct the executable identity

**line_start:** 160 · **line_end:** 202 · **confidence:** 0.99

1. **What can go wrong?** The differential can classify arbitrary text as binary or vice versa because the process selected as `git` can be controlled through the PATH value placed in the otherwise constructed environment.

2. **Why is this vulnerable?** The text universally claims the two constructed halves close every channel arriving through the environment or a config/attribute file. It specifies empty configuration roots but does not require an absolute, trusted Git executable or a constructed trusted PATH. The hostile control at `:217` and `:322-325` arms only XDG attributes and `GIT_CONFIG_COUNT`, so it can be green while executable selection remains contaminated. Executed: trusted executable → `1\t1`; constructed environment with a hostile PATH → forged `-\t-`. The second invocation used `env -i`, empty `HOME` and `XDG_CONFIG_HOME`, `GIT_CONFIG_NOSYSTEM=1` and `GIT_ATTR_NOSYSTEM=1`, with a temporary directory containing an executable named `git` first on PATH.

3. **What is the likely impact?** The test can establish equivalence against a wrapper rather than Git. Because `binary` controls whether content is scanned or withheld, this invalidates the package's central safety classification proof. It also disproves the "channels nobody enumerated are closed" claim.

4. **What concrete change would reduce the risk?** Require the reference helper to invoke a verified absolute Git executable, not resolve `git` through a potentially supplied PATH. Add a hostile-PATH control that places a forged `git` first and must remain unable to alter the result.

### Finding 2 — Leaf identity does not prove that the path remains under the root

**line_start:** 127 · **line_end:** 128 · **confidence:** 1.0

1. **What can go wrong?** Capture or delta can return bytes reached through an ancestor symlink outside `rootDir`, despite the descriptor's `(dev, ino)` exactly matching the identity captured at enumeration.

2. **Why is this vulnerable?** The contract revalidates only the leaf identity. A directory can be moved outside the root and the original pathname replaced by a symlink to the moved directory. The leaf remains the same object, so the identity check succeeds. `O_NOFOLLOW` checks only the final component, so it also succeeds. Executed after classifying `root/dir/note.md`, moving `dir` to `outside/moved`, symlinking `root/dir` to it, and opening the original path: `{"devInoMatches": true, "resolvedPath": ".../outside/moved/note.md", "rootReal": ".../root", "bytes": "outside-after\n"}`. **This requires no inode reuse, bind mount, hard-linked directory, or case-insensitive filesystem. It is an ordinary rename plus symlink.**

3. **What is the likely impact?** External content can enter a baseline that claims to describe only `rootDir`. This breaks containment and can corrupt completeness attribution.

4. **What concrete change would reduce the risk?** Traverse from an opened root directory descriptor and open each path component relative to its already-verified parent, refusing symlinks at every component. If portable Node APIs cannot provide that guarantee, withdraw the universal containment claim and define an implementable platform-specific mechanism. Comparing only the final leaf identity is insufficient.

### Finding 3 — Opening before classifying can block forever on a substituted FIFO

**line_start:** 126 · **line_end:** 131 · **confidence:** 0.99

1. **What can go wrong?** A path classified as a regular file can be replaced by a FIFO before `openSync`. Opening it with `O_RDONLY | O_NOFOLLOW` can block indefinitely, so neither `fstat` nor the required throw/anomaly path is reached.

2. **Why is this vulnerable?** `O_NOFOLLOW` only refuses a final symlink. It neither rejects a FIFO nor makes its open nonblocking. The contract requires opening first and classifying the descriptor second, but does not require `O_NONBLOCK`. Executed: `{'enumerated_kind': 'regular file', 'replacement_kind': 'FIFO', 'outcome': 'timed out before fstat', 'timeout_seconds': 1}`.

3. **What is the likely impact?** A steered writer can hang the dream operation rather than producing a complete baseline or a loud failure. This contradicts the stated rule that non-regular entries become anomalies and that capture failures throw.

4. **What concrete change would reduce the risk?** Require `O_NONBLOCK` when opening an untrusted leaf, then `fstat` and reject anything non-regular before reading. Add a classify/read-gap test that replaces a regular file with a FIFO and proves bounded completion.

### Finding 4 — The public baseline representation cannot satisfy the immutable-baseline promise

**line_start:** 95 · **line_end:** 123 · **confidence:** 0.97

1. **What can go wrong?** A caller can mutate the returned file bytes or file map between capture and delta. `computeDelta` then compares against caller-modified state rather than the bytes captured from disk, producing missed changes, fabricated changes, or false `added`/`deleted` attribution.

2. **Why is this vulnerable?** The signature promises an "immutable baseline", while Table A exposes `{files, anomalies, include}` and defines `files` as path-to-bytes. Node Buffers are mutable and cannot be frozen when non-empty. Freezing a JavaScript `Map` also does not prevent `set`. Executed: `freeze=TypeError: Cannot freeze array buffer views with elements`, `bytes=Xriginal`, `frozen-map-size=2`. The acceptance criteria require repeatable capture but contain no attempt to mutate the returned baseline before calling `computeDelta`.

3. **What is the likely impact?** The completeness guarantee can be defeated without any filesystem race. An accidental consumer mutation can rewrite the historical evidence used to attribute content to the machine.

4. **What concrete change would reduce the risk?** Define an actually immutable representation, or withdraw "immutable" and make non-mutation an explicit caller invariant with a failing mutation acceptance test. A shallow `Object.freeze` is not sufficient.

## Routed (out of this package's scope)

None. I did not count absent locking, freshness revalidation, a generation invariant, consumer wiring, validator-gate changes, promotion policy, repository-attribute policy, the Git-execution seam, or the layout dot-rule toward the verdict.

## Citation verification

All nine `file:line` citations checked at both ends and correct: `dream.js:44-55`,
`:66-78`; `private-fs.js:619-669`, `:687-751`, `:713-751`; `validate.js:752-764`,
`:1020-1034`, `:1245-1246`, `:1258-1262`. **No citation drift survived.**

## What I executed (condensed; every result preserved)

Read the full spec, all round-0/1/2 records, four cited sources and four process docs —
exit 0. `git --version` 2.50.1; target `a6f87f4`; local main `a1b473c`; origin/main
`e648284`. Reproductions, exit 0: operand-repository influence under a constructed
environment (a `.git` and `*.dat binary` beside the operands did NOT affect the
no-index result); hostile-PATH constructed environment (trusted `1\t1`, wrapper forged
`-\t-`); same-inode ancestor relocation (identity matched, resolved path and bytes
outside the root); Buffer/Map immutability; regular-file-to-FIFO gap (child failed to
reach `fstat` within one second); bounded doubling-plus-binary boundary search
(7999/8000, both adjacent results verified). `npm test` exit 0: 2048 tests, 2039
passed, 0 failed, 9 skipped. `npm run lint` exit 0. Three first attempts failed for
environment reasons and were re-run successfully: a zsh quoting split (exit 2, produced
no evidence), a missing `/usr/bin/node` (exit 1), and zsh's read-only `status` variable
(exit 1). Scratch under `/tmp` only; final sweep for `wienerdog-r3-*` returned empty.

## Before/after `git status --porcelain` proof

Before: exit 0, (empty). After: exit 0, (empty). Byte-identical.

---

## Orchestrator spot-check (not the reviewer's words)

All four re-run independently before folding. **All four CONFIRMED**, and finding 3 is
worse than reported.

| Reviewer claim | Measured independently | Verdict |
|---|---|---|
| A forged `git` on PATH defeats the constructed environment | trusted absolute binary → `1\t1`; `env -i` + empty `HOME`/`XDG_CONFIG_HOME` + `GIT_CONFIG_NOSYSTEM=1` + hostile PATH, bare `git` → `-\t-` | **CONFIRMED** |
| `(dev, ino)` does not close same-inode ancestor relocation | `{"openedRegular":true,"devInoMatches":true,"resolvedInsideRoot":false}` — an ordinary rename plus symlink | **CONFIRMED** |
| A realpath containment check would catch it | `realpathSync` on the leaf resolves outside the root (`insideRoot: false`) — racy, but it does catch the demonstrated attack | **CONFIRMED** (material for the parked recommendation) |
| A FIFO blocks the specified open | **WORSE than reported.** With `O_NONBLOCK`: returns, `isFIFO: true`. WITHOUT it: the open never returned and hung the measuring shell for the full two-minute command timeout — it does not merely miss a one-second deadline, it never completes, and a synchronous `openSync` blocks the event loop so an in-process watchdog cannot fire either | **CONFIRMED** |
| The baseline cannot be made immutable | `Object.freeze(Buffer)` → `TypeError: Cannot freeze array buffer views with elements`; bytes still writable (`Xriginal`); frozen `Map` still accepted `set` | **CONFIRMED** |

**The Routed section came back empty for the third consecutive round**, with the
reviewer explicitly listing what it declined to count. Three data points now for the
category-error guard, which is a repo rule as of this arc.

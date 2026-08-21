---
title: Round 4 — external adversarial design review (raw), WP-dream-baseline-delta-primitive
date: 2026-08-21
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE. Declared: empty-output fences rendered as
     (empty); the execution list condensed with every result preserved. -->

# Round 4 — external adversarial design review (raw), the CLOSING round

Backend: `gptsol`, English-pinned. Spec at `28fb719` (446 lines). Branch based on
`e648284`.

This round existed because the weighted-closure rule requires a full fresh round after
round 3's HEAVY fixes. The dispatch carried two BINDING constraints — the frozen
verification surface (a recommendation adding a gate or corpus case must name the
product behaviour it guards) and REPEAT-KIND (a third containment-family finding is a
design question, to be said so explicitly rather than patched) — plus a **required
per-finding classification**, the owner's audit test applied prospectively: does the
finding change what an ATTACKER CAN DO, or only what we CLAIM IS PROVEN?

## Verbatim reviewer output

---

# NO-SHIP — the round-3 fixes are mostly genuine, but containment is universally re-asserted in a mirror, executable construction still proves less than claimed, and nested-directory read failure remains ambiguous at the completeness boundary.

## PART A — Are the round-3 fixes genuine?

| # | Round-3 fix | Verdict | Classification | Evidence |
|---|---|---|---|---|
| 1 | Forged `git` first on PATH | **PARTIAL** | **(b)** | Requiring an absolute executable genuinely prevents PATH selection at invocation; the hostile-PATH arm is present at `:231` and `:341-346`. However `:189-210` say the executable is one of three "constructed things" whose contents are known by construction. The cited `spawnPinnedSync` discipline does not establish that: an executable replaced in place at the same verified absolute path was accepted and emitted forged output. No fourth influence class was found; the remaining hole is inside the claimed executable class itself. The citation `src/core/dream/validate.js:67` is also one line early: the `spawnPinnedSync` call is at line 68. |
| 2 | FIFO substituted during classify/open gap | **FIXED** | **(a)** | Table A requires `O_NONBLOCK` before `fstat`, and acceptance requires bounded completion without relying on a timeout. Executed probes: FIFO and character-device opens return and are rejected as non-regular; a directory opens and is rejected; a final symlink fails `ELOOP`; a Unix socket open fails promptly on this platform. No other admitted non-regular kind or blocking open path was reproduced. |
| 3 | Unachievable immutable baseline | **FIXED** | **(b)** | The signature no longer promises an immutable representation. `:95-96` and `:123` make non-mutation a caller invariant, explain the representation cannot enforce it, name false attribution as the consequence, and `:350-351` require the violation behaviour to be pinned. "Immutable" survives only in the explicitly qualified "caller-immutable by CONTRACT, not by construction". |
| 4 | Containment over-claim | **PARTIAL** | **(b)** | The canonical containment row at `:130` honestly names same-inode ancestor relocation, says realpath only narrows the race, and explicitly denies closure; acceptance `:326-337` and Out of scope `:406-419` preserve the residual. But `:128` still universally says symlinks are "never followed", and the security checklist at `:296-299` again summarises containment as a "no-follow rule". An ancestor symlink IS followed in the owner-accepted residual. This is the third containment-family issue and is therefore a **design question under REPEAT-KIND**, not grounds for another narrow leaf patch. |

### Citation verification

Nine range citations checked at both endpoints and correct. **One newly added
single-line citation drifted:** `src/core/dream/validate.js:67` opens the local `git()`
wrapper; its `spawnPinnedSync` call is at line 68.

## PART B — Fresh findings

### Finding 1 — The withdrawn containment universal is re-asserted by the symlink and security mirrors
**`:128-131` · confidence 1.0 · (b) changes only what we claim is proven · REPEAT-KIND: third containment-family finding, a design question, not a third narrow patch**

1. An implementer or successor can rely on "symlinks are never followed", even though the same contract accepts a race in which an ancestor symlink is followed and external bytes are read.
2. `:128` gives an unqualified guarantee; `:130` then demonstrates that moving an ancestor directory outside the root and replacing its original path with a symlink passes leaf `O_NOFOLLOW`, `(dev, ino)` and the racy realpath check. The security checklist at `:296-299` again describes containment as the "no-follow rule" without the ancestor exception.
3. The product mechanism is unchanged — the residual is owner-accepted — but the public contract still promises stronger containment than the implementation delivers, so a successor may treat the primitive as providing all-component no-follow.
4. Resolve at design level rather than adding another leaf defense: either the public invariant is explicitly **leaf no-follow plus a named ancestor-relocation residual EVERYWHERE**, or it is true all-component no-follow and needs a different platform mechanism / dependency ruling. The canonical table, symlink row, security checklist, acceptance criteria and successor handoff must all express the selected design.

### Finding 2 — "Constructed executable" overstates what absolute-path verification establishes
**`:166-210` · confidence 0.98 · (b)**

1. The reference judgment can run altered executable content from the same absolute path after that path has been verified, while the spec claims executable-class influences are closed by construction.
2. Absolute invocation closes PATH selection but does not construct or freeze executable bytes. The cited precedent is intentionally structural and its own source states that same-user in-place substitution at an unchanged path is not detected. Executed against that precedent: `spawnPinnedSync` first returned trusted output, then accepted rewritten content at the same absolute path and returned forged output.
3. This package's product module never executes git, so no new product attack primitive — but the differential evidence proves less than claimed: the oracle is protected from PATH-selected impostors, not from all executable-identity influence.
4. **Do not add another hostile-control case.** The smallest frozen-surface correction is to narrow the proof claim.

### Finding 3 — Nested-directory enumeration failure is not explicitly fail-closed
**`:127-134` · confidence 0.94 · (a) changes what an attacker can do**

1. A recursive walk can fail to enumerate a nested directory, omit every regular file beneath it from the baseline, and later report those pre-existing files as `added` after the directory becomes readable.
2. The signature and acceptance criterion name an unreadable **root** and unreadable **file**, but not an unreadable nested directory. Table A broadly forbids a partial baseline, creating an ambiguity precisely where the cited `listPrivateEntries` idiom catches `readdirSync` failures and returns an empty list. Executed as the current user, `readdirSync` on a mode-`000` nested directory failed `EACCES`.
3. An implementation following the cited walk shape can silently omit multiple files, and a later delta attributes existing user content to the machine — the central failure this package exists to prevent.
4. Define directory-enumeration failure at any recursion depth as a capture read failure that throws `WienerdogError`. **Extend the existing unreadable-capture acceptance case** to include a nested directory; this guards the completeness product behaviour without adding a new gate.

## Routed

- A regular file that races to a symlink/anomaly during capture and becomes regular again before delta can be absent from the baseline and later appear `added`. Closing that class requires a coherent-snapshot, locking, generation or freshness mechanism — routed, not counted.
- The actual exposure of the accepted ancestor-relocation residual under the successor's tool capabilities and capture ordering remains routed to the successor, as the spec already requires.
- Validator gates, EP2 enforcement, promotion policy, git-execution seam, layout dot-rule and existing policy values were not counted.

## What I executed (condensed; every result preserved)

Read the spec, all round-0..3 records, four process docs and four cited sources; inspected `a6f87f4..28fb719` to isolate the round-3 fixes — exit 0. Both-end citation check via Python — exit 0, nine ranges pass; the new `:67` claim grep exit 1, actual line 68 grep exit 0. Behaviour reproductions — exit 0: absolute `/usr/bin/git` normal `1\t1`; FIFO and character device open nonblocking and identified non-regular; directory opens and is identified non-regular; final symlink `ELOOP`; socket open fails promptly. `spawnPinnedSync` hostile-PATH — exit 0, fail-closed `WienerdogError`. `spawnPinnedSync` same-path replacement — exit 0, rewritten content ACCEPTED, forged output. Nested mode-`000` `readdirSync` — exit 0, `EACCES`. Anomaly/attribution illustration — exit 0, omitted path then `deltaStatus: "added"`, treated as Routed. `npm test` — exit 0: 2048 tests, 2039 passed, 0 failed, 9 skipped. `npm run lint` — exit 0. Deliverable-absence check — exit 0, so the `dream-delta` pattern run was not attempted. Three first attempts failed for environment reasons (zsh range-tuple splitting; `/usr/bin/node` absent; an invalid fixture `printf`) and no conclusion rests on them. Scratch removed and absence verified.

## Before/after `git status --porcelain` proof

Before: exit 0, 0 bytes, (empty). After: exit 0, 0 bytes, (empty). `cmp` exit 0, byte-identical.

---

## Orchestrator spot-check (not the reviewer's words)

All three findings and the citation drift re-run independently. **All CONFIRMED.**

| Reviewer claim | Measured | Verdict |
|---|---|---|
| `validate.js:67` is one line early | `:67` is `function git(...)`; `:68` is the `spawnPinnedSync` call | **CONFIRMED** — and it is a line I added in round 3 |
| `:128` still asserts the withdrawn universal, and the security checklist too | `:128` read "never followed and never captured" unqualified; the checklist summarised containment as "Table A's no-follow rule" | **CONFIRMED** |
| The mirrors were never registered | the Mirrored Surface Checklist contained **zero** containment entries | **CONFIRMED — and this is the actual defect.** The canonical row was honest; nothing bound the mirrors to it |
| The spec never names an unenumerable nested directory | "unreadable root or file" at `:101`, `:133` and `:320`; no directory case anywhere | **CONFIRMED** |
| The cited precedent swallows readdir failures | `listNames` (`src/core/private-fs.js:382-390`) catches and `return []` | **CONFIRMED.** This is the SECOND time citing `private-fs.js` has imported a defect — first the half-carried `applyModeSecure`, now this |

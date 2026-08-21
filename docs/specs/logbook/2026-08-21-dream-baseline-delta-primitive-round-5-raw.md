---
title: Round 5 — external adversarial design review (raw), WP-dream-baseline-delta-primitive
date: 2026-08-21
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE. Declared: empty-output fences rendered as
     (empty); the execution list condensed with every result preserved. -->

# Round 5 — external adversarial design review (raw)

Backend: `gptsol`, English-pinned. Spec at `ed7c039` (470 lines). Reviewed tree
`e648284`. Dispatch carried the frozen-surface and REPEAT-KIND constraints, the
required (a)/(b) classification, and one addition: **four rounds had produced eleven
findings, ten (b) and one (a), so the reviewer was told that if it could not construct
a type (a) finding it must say so plainly in one sentence rather than pad with weak
(b)s.** It constructed one.

## Verbatim reviewer output

---

# NO-SHIP — all four round-4 fixes are genuine, but one cross-platform leaf-containment defect changes what an attacker can do, and one byte-decoding gap overstates what the differential proves.

## PART A — Are the round-4 fixes genuine?

| # | Round-4 fix | Verdict | Evidence |
|---|---|---|---|
| 1 | Fail closed on an unenumerable directory at any depth | **FIXED** | The signature throws for an unenumerable directory at any depth (`:100-102`), Table A rejects nested enumeration failure and explains the false-attribution consequence (`:134`), and the existing unreadable-capture criterion was extended rather than supplemented (`:340-343`). The cited counter-precedent is accurate: `listNames` catches `readdirSync` failure and returns `[]` at `src/core/private-fs.js:382-390`. I found no second silent-omission path that does not depend on concurrent mutation or freshness; those require consumer-side coherence and are out of scope. |
| 2 | Narrow "constructed executable" to absolute-path selection | **FIXED** | The text says absolute verified invocation prevents PATH selection but neither constructs nor freezes executable bytes (`:204-220`). No mirror claims the executable's bytes are closed by construction. The hostile-PATH control at `:240` tests only PATH selection, consistent with the narrowed claim. |
| 3 | Remove containment universals and register every mirror | **FIXED** | Table A's symlink row says leaf-only no-follow and points to the ancestor residual (`:129`); the canonical row names the residual and calls realpath racy defense in depth (`:131`); the walk-construction row is leaf-qualified (`:132`); the checklist registers all four mirrors (`:252-258`); and the security checklist, acceptance criterion and successor handoff preserve the same residual (`:309-319`, `:348-359`, `:428-442`). **No unqualified whole-path containment claim survives.** |
| 4 | Correct `validate.js:67` to `:68` and re-check citations at both ends | **FIXED** | `:68` is exactly the `spawnPinnedSync` call. A mechanical check passed all ten point/range citations at both ends. The cited source files have no diff from the authoring base `e648284` to `HEAD`. |

## PART B — Fresh findings

### Finding 1 — The unconditional leaf no-follow contract is not implementable on Windows by the specified mechanism
**`:127-131` · confidence 0.94 · (a) It changes what an ATTACKER CAN DO · REPEAT-KIND: fourth containment-family finding, therefore a design question, not another narrow patch**

1. On a platform without `O_NOFOLLOW`, an attacker can replace a classified leaf with a symlink or reparse-point path before the open. The open can then follow it and capture external bytes under an internal relative path, despite the unconditional leaf no-follow guarantee.
2. The package supports plain Node ≥ 18 without a platform restriction (`:263`), and path behaviour is explicitly cross-platform (`:127`), but leaf containment relies unconditionally on `O_NOFOLLOW` (`:129-131`). The repository's existing cross-platform implementation documents that Windows has no `O_NOFOLLOW` and that its zero-valued fallback follows a symlink introduced after `lstat` (`src/core/vault-snapshot.js:50-55`). I executed the same missing-flag mechanism: the real `O_NOFOLLOW` open failed with `ELOOP`, while the zero-valued fallback read `outside-bytes`.
3. On the unsupported mechanism path, a steered writer can make the primitive ingest content outside `rootDir`. **This is a real capability change, not merely an over-stated proof.**
4. Resolve the platform design explicitly: either restrict this primitive's containment contract to platforms where leaf no-follow can be enforced, or define and demonstrate a Windows construction that refuses leaf reparse-point replacement. Extend the existing classify/read-gap criterion rather than adding a new gate.

### Finding 2 — The differential can silently replace invalid UTF-8 bytes while claiming byte identity
**`:146-240` · confidence 0.97 · (b) It changes only what we CLAIM IS PROVEN**

1. A regular file containing invalid UTF-8 but no NUL can be classified as text by the reference judgment. If the test helper decodes git output as UTF-8, the invalid bytes become replacement characters, yet the differential can still claim derived scan text is byte-identical.
2. Table B and Table C require byte identity for non-binary records (`:146-147`, `:235-236`), but neither the reference recipe nor the mandatory corpus requires byte-preserving git output or an invalid-UTF-8 text fixture (`:156-240`). The cited production helper already requests `encoding: 'utf8'` at `src/core/dream/validate.js:68-73`, making that an especially plausible implementation shape. I executed an added file containing `prefix-<FF>-secret`: git's `--numstat` returned text (`1\t0`), raw git diff bytes retained `ff`, while UTF-8 decode/re-encode changed it to `efbfbd`.
3. The product module may still retain correct `afterBytes`, so this does not itself grant a new capability. It does let the differential overstate equivalence for an admitted regular-file byte sequence and can hide lossy scan-text derivation.
4. Extend the existing Table C corpus with one non-NUL invalid-UTF-8 text member and keep reference diff output as bytes through comparison — the smallest extension of an existing criterion.

## Routed

**Empty.** I did not count locking, revalidation, coherent-snapshot, generation, consumer wiring, gate policy, promotion, or repository-attribute questions against this package.

## What I executed (condensed; every result preserved)

Initial status/branch/HEAD/line-count — exit 0 (`HEAD` `ed7c039`, 470 lines). Read the spec, all round-0..4 records and dispositions, four cited sources, the template, both runbooks and `CLAUDE.md` — exit 0. Inspected the complete `28fb719..ed7c039` patch; `git diff --check` — exit 0. Swept the spec for containment, symlink, executable, completeness, anomaly, include, binary and reference-judgment mirrors with `/usr/bin/grep -a` — exit 0. Cited-source drift `e648284..HEAD` — exit 0, none changed. Corrected mechanical citation check — exit 0, all ten pass at both ends (a first attempt exited 1 on my own checker's truncated literal, not a citation failure). Missing-`O_NOFOLLOW` probe — exit 0: real flag `ELOOP`, zero-valued fallback read `outside-bytes`. Invalid-UTF-8 differential probe — exit 0: `ff` survived raw output, became `efbfbd` after decode/re-encode. Invalid-byte filename experiment on macOS — exit 1 `EILSEQ`; no finding relies on it. Docker client present but `docker info` exit 1, no daemon; no finding relies on it. `npm test` — exit 0: 2048 tests, 2039 passed, 0 failed, 9 skipped. `npm run lint` — exit 0. Confirmed `src/core/dream/delta.js` absent, as expected pre-implementation. All scratch outside the repository, deleted and absence-checked.

## Before/after `git status --porcelain` proof

Before: exit 0, empty. After: exit 0, empty. Byte-identical.

---

## Orchestrator spot-check (not the reviewer's words)

Both findings re-run independently. **Both CONFIRMED, and finding 1 is stronger than
reported: the repo had already ruled the question and this spec cited the wrong side.**

| Reviewer claim | Measured | Verdict |
|---|---|---|
| win32 has no `O_NOFOLLOW`; the fallback follows a post-`lstat` symlink | `src/core/vault-snapshot.js:48-57` states it verbatim AND rejects the `fs.constants.X || 0` idiom by name, calling the loss "a named residual, not an accident" | **CONFIRMED — and already ruled here** |
| the `|| 0` idiom is in use | `private-fs.js:683` and `manifest.js:746` both use it — the repo disagrees with itself, and this spec cited `private-fs.js` | **CONFIRMED** |
| invalid UTF-8 without a NUL is text, and decoding loses it | `git diff --no-index --numstat` → `1\t0`; raw output retains `0xff`; the `utf8`-decoded output contains U+FFFD | **CONFIRMED** |
| the production helper decodes as `utf8` | `validate.js:68-73`, `encoding: 'utf8'` | **CONFIRMED** |

Routed empty for the fourth consecutive round. The reviewer was explicitly permitted to
report that no type (a) could be constructed; it constructed one instead, which is the
result that matters for closing.

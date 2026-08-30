---
title: Round zero — internal coherence (raw), WP-dream-control-file-fence
date: 2026-08-20
---

# Round zero — internal coherence (raw), C1

Spec: `docs/specs/WP-dream-control-file-fence.md` at commit `e33d34e`. Base: `main`
@ `1d4c092`. Measurements only; dispositions live in the round record. Every command
below was RUN.

## 1. The spec's citations, re-run against the tree

| Spec claim | Measured | Verdict |
|---|---|---|
| `validate.js` 1469 lines | 1469 | OK |
| `tests/unit/dream-validate.test.js` 2798 lines | 2798 | OK |
| `dream.js:493` precommit, `:510` brain, `:558` validate | `precommitSessionEdits(vaultDir);` / `await runBrainWithWatchdog({` / `const res = validateAndCommit({` | OK |
| `dream.js:578` deferral keys on `secretReverts` | `const reverts = res.secretReverts;` | OK |
| `dream.js:617` CLI summary counts `reverted` | `` `${res.reverted.length} reverted, …` `` | OK |
| `validate.js:1147` containment | `const { inside } = resolveContainment(...)` | OK |
| `validate.js:125`, `:1223`, `:1331`, `:1412` are the `add` sites | `:1331` = `git(vaultDir, ['add', '-A', '--', rel]);`, others as cited | OK |
| `validate.js:703-738` `quarantinePreserve`, collision suffix `:721-730` | as cited | OK |
| `validate.js:1296-1312` EP2 refuses to destroy without a copy | as cited | OK |
| `tests/unit/dream-validate.test.js:2322-2368` pins the race window | `test('EP2 RP-1: a save landing after the last check and before the revert is lost, and nothing claims otherwise', …)` | OK |
| `src/adapters/codex.js:50` / `claude.js:39` install into `AGENTS.md` / `CLAUDE.md` | `const agentsMd = path.join(paths.codexDir, 'AGENTS.md');` / `const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md');` | OK |
| audit `:676` M7, `:931` M10 | both headings match | OK |
| `restoreVaultToHead` `:146-149`, comment `:141-143`; `adopt-git.js:15-21`; `runtime-profile.js:58`, `:81`; `isTier3` `:1087-1090`; loop `:1145-1209`; `changedPaths` `:1020-1021`; `revertPath` `:660-667` | all as cited | OK |

No stale citation.

## 2. The spec's verification steps, run as written (draft `e33d34e`)

`npm test -- --test-name-pattern "dream"` and `npm run lint` both runnable; the full
suite stands at 2037 tests / 2028 pass / 9 skipped / 0 fail and lint passes.

### The proposed NEW assertion — RED direction, on the untouched tree

```
grep -qF -- 'git diff --cached' validate.js || grep -qF -- "'diff', '--cached'" validate.js
  -> PASS on the untouched tree   ***VACUOUS***
```

Cause: the validator already reads `git diff --cached` at `:1232`, `:1245`, `:1257`
and `:1413`. A gate that passes before the work exists cannot discriminate.

### The replacement candidate — reason-string literals, both directions

Literals placed in a file and matched with `grep -F -f` (quoted once, per the
runbook's "run a gate from a script" rule), against four trees: the untouched base,
two hand-built finished states differing only in JS quoting style, and one
deliberately broken finished state.

| Tree | distinct reason bases found |
|---|---|
| untouched base | 0 / 2 |
| finished shape A — single-quoted JS constants | **0 / 2** |
| finished shape B — double-quoted keys in a frozen object | **1 / 2** |
| broken finished state (one base reworded) | 0 / 2 |

Both finished shapes are correct implementations, and both fail. Cause, read out of
the constructed sources:

```
shape A: 'control-file fence: … outside the dream\'s writable surface'
shape B: "control-file fence: a path segment starting with \".\" is outside …"
```

The bases contain BOTH an apostrophe and a double quote, so JavaScript stores one or
the other escaped depending on the quoting style the implementer chooses. A
fixed-string search of the SOURCE therefore cannot match every correct
implementation.

**Generalisation recorded in the spec:** a source-text grep is not a sound way to
assert a contract string. These strings are observable in the dream report, so they
are asserted in behaviour by the implementer's tests instead.

## 3. Structural findings from the end-to-end read

- The Verification-steps section proposed one new assertion; both it and its
  replacement candidate were measured defective, so the section now carries none, with
  the measurement and an explicit "do not re-add a source grep" recorded in its place.
- No contradiction found between the Context's three measured facts, Tables A/B/C,
  the acceptance criteria, and the Out-of-scope list.
- The Mirrored Surface Checklist's entry for the reason literals ("their deliberate
  absence of a filename, which Table B's pairing row depends on") holds: the suffixes
  name no filename and Table B routes the pairing to the residue index.

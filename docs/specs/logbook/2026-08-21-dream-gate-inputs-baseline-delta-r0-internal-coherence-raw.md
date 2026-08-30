---
title: Round zero — internal coherence (raw), WP-dream-gate-inputs-baseline-delta
date: 2026-08-21
---

# Round zero — internal coherence (raw)

Spec under review: `docs/specs/WP-dream-gate-inputs-baseline-delta.md` at commit
`36d3ac2`. Base tree: `main` @ `e648284` (= `origin/main`). Measurements only;
dispositions live in the round record. **Every command below was RUN, not read.**

## 1. Baseline, before any edit

```
npm test     → tests 2048, pass 2039, fail 0, skipped 9, duration 54.5s   (exit 0)
npm run lint → markdownlint 0 issues over 490 files; frontmatter 222 specs (exit 0)
```

shellcheck and PSScriptAnalyzer skipped locally (binaries absent; CI runs them).

## 2. The spec's own citations, re-run against the tree

Sizes: `validate.js` 1469 ✓ · `tests/unit/dream-validate.test.js` 2798 ✓ ·
`tests/integration/dream.test.js` 1495 ✓.

Negative claims, all re-run and all confirmed: zero `log` / `rev-list` /
`merge-base` / `blame` in `validate.js`; `changedPaths` absent from
`module.exports`; zero `--ignored`; zero `git(` calls inside `tier3Decision`
(`:208`–`:238`); `git()` (`:67`) spawns through `spawnPinnedSync` with an argv
array — no shell.

| Spec claim | Measured | Verdict |
|---|---|---|
| `tier3Decision` reads the worktree file at `:210` | the read is at `:211` (`:210` is `try {`) | **STALE → fixed** |
| skill-body guard worktree bytes `:348` | the read is at `:350` (`:348` is `let curText;`) | **STALE → fixed** |
| registry keyed by rel at `:521` | `registry.skills[skillRel]` is `:522` | **STALE → fixed** |
| ledger's sibling `SKILL.md` read `:524` | the read is at `:526` | **STALE → fixed** |
| ledger `change.untracked` gate `:553` | `if (!change.untracked) {` is `:554` | **STALE → fixed** |
| containment check `:1146-1153` | `resolveContainment` call is `:1147` | **STALE → fixed** |
| A0 identity freeze `:1174-1184` | the `if` is `:1175` | **STALE → fixed** |
| "ordering behind the skill-body guard" `:1191-1193` | the ordering comment is `:1185-1186`, the call `:1187`; `:1191-1193` is the *previous* branch's tail | **STALE, wrong location → fixed to `:1185-1187`** |
| EP2 abort path `:1302-1323` | the block opens at `:1298` | **STALE → fixed** |
| `addedLineNumbersFromDiff` `:752-765` | `:752`–`:764` | **STALE → fixed** |
| extracts map `:1136-1143` | `:1136`–`:1142` | **STALE → fixed** |
| both revert shapes `:1325`, `:1329-1331` | the untracked `rmSync` is `:1327` | **STALE → fixed** |
| `precommitSessionEdits` + `assertCleanTree` at `dream.js:493-494` | same | OK |
| `hashScratch` `dream.js:44`, baseline `:489`, brain step `:496`, `validateAndCommit` `:558` | same | OK |
| `changedPaths` `:1020-1021`, single caller `:1145` | same | OK |
| `git show HEAD:` at `:340`, `:398`, `:555` | same, and exactly three occurrences file-wide | OK |
| EP2 decision inputs `:1232`, `:1245`, `:1257`; `+`-line join `:1258-1262` | same | OK |
| enforcement `:1223`, `:1296`, `:1325`, `:867`, `:874`, `:878`; `scrubAddedLines` `:821-903` | same | OK |
| `revertPath` `:660`, checkout `:665`; case (c) keep `:1208` | same | OK |
| `SKILL.md:352-353` prior-dreams authorization rule | same | OK |
| test harness `tempVault`/`writeVault` `:39-63`, `run` `:468-469` | same | OK |

**Substantive finding (not a citation drift):**

| Spec claim | Measured | Verdict |
|---|---|---|
| "**no real brain is spawned by any test**" | `npm test` is `node --test` over `*.test.js` (`tests/run.js`) and spawns none — but `tests/scenarios/rubric.js`, `tests/scenarios/negative/run-negative.js` and the two broker harnesses DO spawn a real `claude`, under the separate `npm run scenarios` script | **UNGATED UNIVERSAL, false as written → narrowed to `npm test`, with the scenario harnesses named as the exception set** |

## 3. Runnable criteria and verification steps, executed on the pinned base

Each new assertion must discriminate. Run on the **unimplemented** base, the two
substitution gates must be RED and the preservation gate GREEN; the preservation
gate was additionally proven RED against a deliberately broken state (one
character changed inside the `hash-object` call, then reverted).

```
G1  test "$(grep -c 'show..*HEAD:' src/core/dream/validate.js)" = 0
      → RED, 3 occurrences (:340, :398, :555)                    [discriminates]
G2  ! grep -q 'of changedPaths(' src/core/dream/validate.js
      → RED, 1 caller at :1145                                   [discriminates]
G3  ! git diff main -- src/core/dream/validate.js \
      | grep -qE '^[-+].*(hash-object|update-index|ls-files --stage)'
      → GREEN on the untouched base; RED under a deliberate
        one-character edit inside the hash-object call           [discriminates]
npm test / npm run lint → green (§1)
```

G2's first draft was `test "$(grep -c 'changedPaths(vaultDir)' …)" -le 1`, which
passes when the *definition* is deleted and the *caller* is left in place. Replaced
before this record with the caller-specific form above and re-run.

## 4. Contradiction sweep (end-to-end read)

One found: the Deliverables rows permitted modifying the two test files while an
acceptance criterion requires that "no existing assertion is edited". Threading the
new `vaultBaseline` option through the existing `run()` helper is wiring, not an
assertion edit — both Deliverables notes now say so explicitly, so the two surfaces
agree. No other claim was made in one place and unmade in another; the three
contract tables and their seven mirrors were walked and agree.

## 5. Post-fix re-measurement

All thirteen fixes re-run against the tree and confirmed (`:211`, `:350`, `:522`,
`:526`, `:554`, `:1147`, `:1175`, `:1185-1187`, `:1298`, `:1327`, `:764`, `:1142`,
and the narrowed `npm test` claim). `npm run lint` green after the edits. Spec 357
lines.

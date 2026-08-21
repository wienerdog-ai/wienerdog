---
title: Round zero — internal coherence (raw), WP-dream-baseline-delta-primitive
date: 2026-08-21
---

# Round zero — internal coherence (raw)

Spec under review: `docs/specs/WP-dream-baseline-delta-primitive.md` at commit
`b2cde6f`. Base: `main` @ `e648284`. Measurements only. **Every command below was
RUN, not read.**

## 1. Baseline

```
npm test     → tests 2048, pass 2039, fail 0, skipped 9   (exit 0, measured this session)
npm run lint → markdownlint 0 issues; frontmatter 223 specs (exit 0)
```

## 2. Citations, re-run — and this time BOTH ENDS

The predecessor's citation defect recurred three times across rounds 0-2, always the
same shape: a range whose first line resolves while its last line belongs to
something else. The owner recorded "check range ends mechanically" as a round-zero
improvement, and this spec's dispatch precondition now demands it. Applying it here
immediately found three more — in this spec's own first draft.

| Spec claim | Measured | Verdict |
|---|---|---|
| `hashScratch` `dream.js:44-56` | closes at `:55`; `:56` is blank | **STALE → `:44-55`** |
| `changedPaths` `validate.js:1020-1033` | `:1033` is `return out;`, the closing brace is `:1034` | **STALE → `:1020-1034`** |
| `private-fs.js:620-668` returns `{dirs, files, anomalies}` | the function is `listPrivateEntries`, `:619-669`; `:620` is a comment inside it and `:668` is the `return`, not the close | **STALE → `listPrivateEntries` (`:619-669`)** |
| `scratchIntact` `dream.js:66-78` | `:78` is its closing brace | OK |
| `addedLineNumbersFromDiff` `validate.js:752-764` | `:764` is its closing brace | OK |
| `+`-line join `validate.js:1258-1262` | `:1258` opens it, `:1262` is `.join('\n')` | OK |
| `--numstat` / `isBinary` `validate.js:1245-1246` | same | OK |

Five of seven ranges were right; the check earns its place on the two it caught plus
the one wrong at both ends.

## 3. Runnable verification steps, executed

```
GATE 1 (as first drafted)  ! grep -qE "child_process|…" src/core/dream/delta.js
   on the MISSING deliverable → GREEN.     ***FALSE GREEN***
   grep exits 2 on a nonexistent file and `!` turns that into success, so the
   assertion passes hardest exactly when the deliverable was never written.

GATE 1 (hardened)  test -f <file> && ! grep -qE …
   deliverable absent                    → RED     (correct)
   clean stand-in outside the repo       → GREEN
   stand-in with require('node:child_process') → RED
                                          [discriminates in both directions]

GATE 2  test "$(git diff --name-only --diff-filter=M main -- src tests | wc -l)" -eq 0
   as-is                                  → GREEN
   after appending one byte to src/core/dream/validate.js (then reverted)
                                          → RED     [discriminates]
```

The working tree was restored and re-verified clean after the gate-2 red proof.

## 4. Contradiction sweep (end-to-end read)

One found: `captureBaseline` was typed `@returns {Baseline}` while Table A said
non-regular entries "are reported in `anomalies`" — but only `computeDelta` returned
an `anomalies` list, so a symlink met at capture had nowhere to be reported and would
have been dropped silently. Resolved by making the baseline itself carry
`{files, anomalies}` and stating that both walks return the anomalies they saw.

No other claim was made in one place and unmade in another; the three tables and
their seven mirrors were walked and agree.

## 5. Post-fix re-measurement

All four fixes re-run and confirmed (`:44-55`, `:1020-1034`,
`listPrivateEntries` `:619-669`, and the hardened gate 1). `npm run lint` green after
the edits. Spec 275 lines.

---
date: 2026-09-18
title: "AC7: the admitted-count measurement for WP-dream-primary-dialogue-collection"
related_wps: [WP-dream-primary-dialogue-collection]
---

# 2026-09-18 — AC7: the admitted-count measurement (WP-dream-primary-dialogue-collection)

AC7 of `docs/specs/WP-dream-primary-dialogue-collection.md`: run the base
commit's collector and this package's collector over the **same** backlog and
record, for **both** runs, the regime each ended in, the admitted count and
list, the total scratch bytes, and the corpus and configuration.

## What was measured, and what was NOT

**The backlog is SYNTHETIC and was generated for this measurement.** Nothing
under `~/.wienerdog` was read or written, no real transcript was opened, no real
vault was touched and no scheduled run was involved. The home directory, the
transcript ledger (a fresh empty one) and the state directory were temporary
directories created for the run and deleted on exit.

**This is therefore not a measurement of the maintainer's real backlog**, and it
is not reported as one. It is a measurement over a corpus built to resemble a
real backlog's *mix* — tool-heavy agent sessions whose original timelines are
mostly tool output, plus Codex rollouts carrying developer-authored material —
at a size (360 files, 10.28 MB) large enough that both regimes are reachable.
What it can establish is exactly the two things AC7 asks for: that the admitted
lists are IDENTICAL when neither run defers on the deadline, and the size and
direction of the difference when they do.

## Method

- `src/core/dream/scratch.js` from `b46a384398a6ff3fa44a463ceb7773b3fd986179`
  (the spec's base commit) was checked out with `git show` into a copy of the
  working tree's `src/`, so the "BASE" column is the real base-commit collector
  rather than a re-implementation of it. Everything else — the transcript
  parser, the ledger, the paths — is the same code on both sides.
- Each run got its OWN freshly generated copy of the identical corpus, so
  neither run's scratch writes or ledger could influence the other's.
- The regime is read off the result: `deadlineDeferred` non-empty →
  *preprocessing deadline*; else `deferred` non-empty → *capacity stop*; else
  *candidates exhausted*.

## Regime 1 — the byte dimension (capacity stop in BOTH runs)

- corpus: 360 transcript files, 10,278,150 bytes
- `dream_max_input_bytes`: 2,000,000 · `dream_preprocess_timeout_seconds`: 60

| | regime | admitted | scratch bytes |
|---|---|---|---|
| BASE | capacity stop | 81 | 2,017,890 |
| PROJECTED | capacity stop | 81 | 65,331 |

- **Admitted lists identical: yes** — compared element for element, 81 ids on
  each side, in the same newest-first order. **The list itself is not
  reproducible from this entry — see the correction below.**
- Arms identical on both sides: `deferred` 279, `deadlineDeferred` 0,
  `oversized` 0, `readDeferred` 0, `newlyQuarantined` 0.

> **Correction, 2026-09-18 (filing `WP-dream-primary-dialogue-collection` as
> Done).** The bullet above originally rendered the admitted list as
> `claude:synthetic-0000` … `claude:synthetic-0066`. That notation spans **67**
> ids against a measured admitted count of **81**, so it cannot be the list.
> The corpus is mixed — Regime 2 below names `codex:rollout-*` ids from the same
> newest-first order — so the admitted 81 plainly interleaves `claude:synthetic-*`
> and `codex:rollout-*` ids, and a contiguous `claude:synthetic-*` range was
> never the right shape for it. **The actual list cannot be reconstructed from
> what this entry records:** the entry does not carry the corpus composition (how
> many files of each harness, or their mtimes), and the two regimes' terminal ids
> cannot be reconciled into one ordering from the figures given — Regime 1's
> first 81 would have to hold 67 `claude:synthetic-*` ids, while Regime 2's first
> 50 end at `codex:rollout-0040`. Rather than guess at the missing 14 ids, the
> rendering is withdrawn. **What is unaffected:** every measured number in this
> entry — the admitted counts (81/81, 50/44), the scratch-byte totals, the arm
> counts, the corpus size and the configuration — and the element-for-element
> identity finding itself, which was asserted on the two lists as the runs
> produced them, not on this rendering. **What a future AC7 entry must record so
> its list is reproducible:** the corpus composition per harness, and either the
> admitted list in full or its ordered head and tail with the count.

Neither run deferred on the deadline, which is the condition row C1a states, so
row C1's guarantee applies and the lists must be identical. They are.

**This package's value claim, measured:** the same 81 sessions reach the model
as **65,331** bytes of primary dialogue instead of **2,017,890** bytes of mixed
transcript — 3.2% of the previous volume on this corpus. The bytes X was
measured against are unchanged, which is why the admitted set is unchanged.

## Regime 2 — the deadline binding (row C1a)

Same corpus, `dream_max_input_bytes` raised to 200,000,000 so that only the
deadline can stop the loop, and `dream_preprocess_timeout_seconds` set to 0.06
against the REAL wall clock (no mocked timing).

| | regime | admitted | scratch bytes |
|---|---|---|---|
| BASE | preprocessing deadline | 50 | 1,230,680 |
| PROJECTED | preprocessing deadline | 44 | 35,936 |

- **Admitted lists identical: no.** 6 sessions admitted by BASE only; 0 admitted
  by PROJECTED only. BASE ran to `codex:rollout-0040`, PROJECTED to
  `codex:rollout-0035` — the projected run visited a shorter prefix of the same
  newest-first order.
- `deadlineDeferred`: BASE 310, PROJECTED 316. `deferred`, `oversized`,
  `readDeferred`, `newlyQuarantined` are 0 on both sides, so **no byte verdict
  moved**: every session either run visited was admitted, exactly as the base
  commit would have. Only the visited set moved.

**How to read it.** Both runs ended on the deadline, so a difference is row
C1a's expected behaviour rather than a violation of row C1. Its size and
direction on this machine and this corpus: **6 fewer sessions admitted under
projection, −12%**, i.e. classifying two policies in one pass cost more here
than the smaller serialization saved. Row C1a says in terms that the direction
is the sign of (added classification cost − saved write cost) on that machine
and is not predictable from the document; this single measurement is one
machine's sign, not a general claim. On an install where the sign is the other
way, *more* sessions are admitted per night and every one of them is marked
processed whether or not the consolidation agent read it — the F1 consequence
owner item 3 prices.

## Configuration recorded for both runs

| | Regime 1 | Regime 2 |
|---|---|---|
| corpus files | 360 | 360 |
| corpus bytes | 10,278,150 | 10,278,150 |
| `dream_max_input_bytes` | 2,000,000 | 200,000,000 |
| `dream_preprocess_timeout_seconds` | 60 | 0.06 |

No transcript content was copied into this repository.

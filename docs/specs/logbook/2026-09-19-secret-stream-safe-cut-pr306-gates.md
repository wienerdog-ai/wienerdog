---
title: PR #306 review gates — WP-secret-stream-safe-cut-redactor
date: 2026-09-19
kind: logbook
---

# PR #306 review gates — `WP-secret-stream-safe-cut-redactor`

The raw output of both PR review gates for every round on PR #306, committed as
posted so the adjudications can be read against what they adjudicated. The
DESIGN gate for this spec is a separate thing and remains closed at round 3
(`docs/specs/logbook/2026-09-18-secret-sink-fix-design-review.md`); everything
below is the PR gate, which runs on a diff.

Rounds 4 and 5 carry architect rulings. **An architect ruling and a closed
review gate are review events, not owner approval**: nothing here records the
owner approving, accepting or ratifying anything.

## Gate round 1 on tip `d8385c0b` — both gates REQUEST CHANGES; CI 7/7; back to the implementer

**Codex plugin `review`, `gpt-6-astra` (orchestrator-run, detached worktree, porcelain identical), verbatim:**

> All 41 detector tests pass, but two additional reproductions expose secrets that whole-input scanning redacts. Although the new API has no production callers yet, its cut predicate does not satisfy the promised safety contract.
>
> - [P1] Check overlapping sensitive-value openers before accepting a cut — `src/core/secret-scan.js:442-445`. For malformed JSON-like log text, a closing quote can also begin another sensitive key. For example, pushing `'"token":"x"client_secret": "abc\n'` followed by `'defghijkl"\n'` returns the entire secret unchanged, whereas `redactOnly` on their concatenation redacts it. Advancing past the first closing quote skips the `"client_secret"` opener, incorrectly allowing a cut inside its value. Check overlapping opener positions rather than assuming these fragments form non-overlapping JSON values; Table S3 requires detecting any open sensitive value.
> - [P2] Preserve safe cuts when the whitespace budget is exhausted — `src/core/secret-scan.js:428-432`. Rejecting cuts after 1024 whitespace characters is not always fail-closed: it can force a later cut through a secret despite an available safe boundary. Reproduce with `'"client_secret":"' + '\n'.repeat(32730) + '"\n'`, followed by `'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF\n'` in one push. The completed JSON value provides a safe cut at offset 32749, but this check rejects it and forces a cut at 32768, returning the entire Anthropic key unredacted. Track binder state or otherwise preserve the exact predicate without this blanket rejection; the region contract permits forced cuts only when no accepted cut exists.

**wd-reviewer (spec fidelity, executed in a detached worktree): REQUEST-CHANGES.** Clean: `npm test` 2919/2907/0/12, lint 0, boundary exact, spec script 21 `ok:` lines, all four RED declarations reproduce exactly as declared (D1 narrowing byte-confirmed: `split across two pushes` also selects D4's name), seven leak shapes byte-equal to the spec block, 30 000-case fuzz `streamThrough(parts) === redactOnly(whole)` with 0 mismatches, no owner claim in the diff. Findings: (1) the `CUT_BINDER_SPACE_MAX` comment attributes an 8660 ms stall to `yes ''`, but measured the unbounded walk takes **2 ms** on pure blank lines (accepted at the first candidate) and ~2.1 s only on `keyword + 32 KiB whitespace`; the bound makes plain blank lines **220× slower** (≈3.4 s/MiB of blocking CPU in a `'data'` handler). (2) The bound is a deviation from Table S row S2 ("any number of blank lines back"), an unregistered second bound beside Table B's one constant — a scope change, not an ambiguity. (3) `ScanLimits` JSDoc "Values OWNER-APPROVED" now covers `STREAM_REGION_MAX`, which is ADR-0043's under standing authorization. (4) The bait test is one region wide against a 5 s combined budget and cannot observe the per-byte cost. (5) Module-level `g` regexes share `lastIndex` across instances (safe by convention only).

**Adjudication (orchestrator).** Astra's [P2] settles the Decision-7 question the fidelity reviewer left open: refusing a cut is *not* fail-closed in this design, because the fallback to a refused cut is the **forced cut**, and a forced cut can land inside a secret that an accepted cut would have kept whole. So the whitespace bound is both a contract deviation and a leak, and it goes. Row S2 stays as written; the fix is technique, not contract — S2 is evaluable in linear time without any bound (see the implementer brief). [P1] is an implementation defect in S3 (`lastIndex = close + 1` skips an opener that begins at the closing quote). Both are HEAVY: after the fix, a fresh Astra round and a fidelity round run on the new tip.

**Required changes** (sent to the implementer; spec untouched): remove `CUT_BINDER_SPACE_MAX` and the refusal; evaluate S2 exactly per Table S in linear time; fix S3's overlap; add both Astra reproductions and a fuzz equivalence test against a naive reference S2 as regression tests; correct every measurement claim in comments to what is reproducible; narrow the `ScanLimits` JSDoc; size at least one bait ≥ 256 KiB and assert a per-byte rate; comment or drop the shared `g` regexes; re-run the unfiltered `npm run red-proofs`.

**Errata for the done-flip** (spec-side): `:99` "24 files" (27 after this PR); `:77` "325 lines" (562); Table D D1 `testNamePattern` as written can never satisfy observed-equals-declared (selects D4 too — fix the cell to the narrowed form); Table B adversarial row should name `keyword + long whitespace run` as a priced shape once the linear S2 lands (then it is ~free); `docs/adr/0043-safe-cut-stream-redaction.md:3` Status line says `owner-signed 2026-09-18` while its block quote seven lines down says nothing records owner acceptance — the block quote is the stale half (the signature landed in #296) and needs a maintainer edit on main, outside this PR's boundary.

CI on `d8385c0b`: seven checks pass.

## Gate round 2 on tip `ab46c2ff` — both gates REQUEST CHANGES (one leak, rest calibration/perf); CI 7/7; back to the implementer

**Codex plugin `review`, `gpt-6-astra` (orchestrator-run, detached worktree, porcelain identical), verbatim:**

> All 44 targeted tests pass, but an overlapping JSON opener still causes an unsafe cut and exposes a secret. Small-chunk delivery also incurs substantial quadratic scanning overhead.
>
> - [P1] Check overlapping JSON openers before accepting a cut — `src/core/secret-scan.js:492-495`. For malformed log text, a value's opening quote can also begin another sensitive key. Pushing `'"token":"token": "abc\n'` followed by `'defghijkl"\n'` returns the entire secret unchanged, whereas `redactOnly` on the concatenation redacts `abc\ndefghijkl`. Advancing directly to `close` skips the second `"token"` opener and incorrectly accepts the newline. Check overlapping openers too, as required by Table S, S3, and add this split-input regression.
> - [P2] Avoid rebuilding the full character index on every push — `src/core/secret-scan.js:558-561`. When a long line arrives in small chunks, this loop rescans the entire accumulated buffer despite the `rejected` watermark. Feeding 32,768 individual `'a'` pushes took approximately 3.35 seconds locally (8,192 took 135 ms and 16,384 took 644 ms), demonstrating quadratic work within each region. This synchronous overhead makes small-chunk streams substantially slower; the performance test misses it because it only uses 4,096-character chunks. Maintain the non-whitespace index incrementally, or defer building it until a new newline candidate exists, and test small-chunk delivery.

**wd-reviewer (spec fidelity, round 2, executed): REQUEST-CHANGES, narrowly.** Round-1 HEAVY findings confirmed closed: `CUT_BINDER_SPACE_MAX` gone; the closure-under-collapse argument re-derived and attacked four ways without breaking (`isCutWhitespace` vs `/\s/` over all 65 536 BMP code units, 0 mismatches; independent S2 fuzz 60 014 prefix positions, 0 disagreements); both round-1 Astra reproductions red at `d8385c0b` and green on the tip; all four RED declarations re-anchored and re-measured; 30 000-case differential leak fuzz 0 divergences; spec script 21 `ok:`; boundary exact; no owner claim. Findings: (1) the new per-byte bait test **failed one of two full `npm test` runs** (`every line ends in an open binder, 256 KiB: 1.179 us/char exceeds 1 us/char`) — the comment claims a ~20× margin, the measured margin is 2.3×; (2) the baits do not price the Table B shapes they are named for — the never-closed-quoted-value bait has zero newlines (S3 never evaluated at a candidate) and the PEM bait dilutes candidates 16:1; at realistic density (PEM opener + blank lines) a single 32 KiB region costs 143 ms = **4.36 µs/char**, because `isAcceptedCut` slices the prefix and re-runs S3/S4 over it at every candidate (O(region²)); (3) the PR body carries the refuted round-1 lesson ("bounding S2 … keeps the predicate fail-closed") which would be persisted to `memory/lessons/inbox.md`; (4) `ScanLimits` JSDoc attributes `STREAM_REGION_MAX` to ADR-0043, which never mentions it — it is Table B's; (5) AC4's ceiling assertion checks the residue, not the peak (`push` appends before cutting).

**Adjudication.** Astra [P1] is HEAVY and real — the S3 fix in round 2 covered an opener starting at a *closing* quote but not one starting at a value's *opening* quote; S3 must consider every opener position, overlapping included. Astra [P2] and fidelity (2) are the same defect family (per-push / per-candidate rescans that are quadratic inside a region) and are fixed together by prefix-determined state computed in one forward pass plus a no-new-candidate fast path. Round 3 runs both gates on the new tip.

**Errata for the done-flip** (spec-side): Table B's adversarial row now disagrees with measurement in both directions and needs re-pricing against the round-3 numbers; Table B memory row — a `push` transiently holds the appended chunk on top of the steady-state ceiling; `:99` 24→27 files; `:77` 325→~624 lines; D1 `testNamePattern` cell; AC9's `git diff main...` trusts a local `main`; Dispatch-precondition "nothing records the owner approving either" is stale for owner item 1 (ADR-0043 owner-signed in `a8ea9dab`); ADR-0043's block quote still says nothing records owner acceptance — maintainer edit on main.

## Gate round 3 on tip `d8b53658` — no leak, no contract violation; both gates REQUEST CHANGES on cost; CI 7/7; round 4 with an architect ruling on cost

**Codex plugin `review`, `gpt-6-astra` (orchestrator-run, detached worktree, porcelain identical), verbatim:**

> All 47 targeted tests pass, but two reproducible performance defects remain outside their coverage. Small blocked-newline chunks repeatedly rebuild prefix state, while large pushes repeatedly scan beyond the region bound.
>
> - [P2] Reuse prefix state when blocked newlines arrive in small chunks — `src/core/secret-scan.js:644-648`. After `push('password:')`, sending 32 KiB of newlines one character per push takes approximately 4.1 seconds synchronously. Every newline bypasses the fast path and rebuilds `solid` and `cutBlockedState` over the entire accumulated prefix; `rejected` only skips the subsequent candidate loop. This leaves quadratic work within each region despite the small-chunk optimization. Retain incremental prefix state and add a blocked-newline small-chunk performance test; the existing one-character test covers only input without newlines.
> - [P2] Bound regex searches to the current region — `src/core/secret-scan.js:492-493`. `re.exec(buffer)` searches the entire remaining input before `m.index >= limit` is checked. For a large push without any openers or closers, each of the three searches traverses the whole remaining suffix again after every 32 KiB cut, making processing quadratic in the push size. A single 16 MiB inert string took approximately 3.4 seconds, versus 0.73 seconds delivered in 4 KiB chunks. Restrict the regex subject to the bounded prefix and test large single pushes, preserving the bounded-work requirement in Table B.

**wd-reviewer (spec fidelity, round 3, executed): REQUEST-CHANGES, narrowly — no leak.** Clean: `npm test` twice (2925 / 0 fail), lint, boundary exact, spec script 21 `ok:`, all four RED declarations hand-applied with observed = declared (D1 non-vacuous, re-anchored on the S1 predicate body), seven leak shapes byte-equal, 17 hand-invented overlap shapes (nested/chained openers, PEM inside quoted value and vice versa, adjacent closers, CRLF) at seven chunkings and every split offset all equal `redactOnly(whole)`, independent S3/S4 exactness fuzz 24 997 candidates 0 mismatches, 30 000-case differential leak fuzz 0 divergences, the fast path skips only through `cutS1EndsWithNewline` and under the ceiling, AC4 measures the between-calls peak, refuted lesson gone, no owner claim. Findings: (1) the same per-push rebuild Astra names — a BLOCKED buffer receiving newline chunks rebuilds `solid`/`cutBlockedState` over the whole prefix every push: PEM opener + 32 700 blank lines at chunk=1 → 3.69 s = 112 µs/char, 22.5× over the suite's own ceiling, invisible to the suite because every bait runs at chunk=4096 and the only 1-char test is newline-free; (2) the S1 declaration's `why` says this WP's contract "exists to close" the `WD-SINK-CHUNK` leak, against the Security checklist's "nothing here is described as fixing any `WD-SINK-*` defect"; (3) two faithful but unregistered `src/` mirrors of Tables B and S; (4) the cold-module figure in the tripwire comment is ~0.74 not ~0.61.

**Adjudication.** No product leak in three rounds of adversarial input — the cut predicate is exact. The remaining findings are all in one dimension, **cost**, which the spec never pinned: Table B prices memory and says "bounded work" without a number or a chunk-size envelope, so rounds 1–3 each landed a cost finding with nothing in the contract to check against. That is the ADR-0031 signal, and the fix is a contract row, not another judgement call: **architect ruling (design gate round 4, PR #306 review) — Table B gains a cost row**, recorded in the spec on this branch, with the bait test as its acceptance criterion. Product changes for round 4: incremental prefix state carried across pushes within a region (prefix-determined, the same fact the `rejected` watermark rests on) and regex subjects bounded to the region. Round 4 runs both gates.

**Errata for the done-flip** (spec-side): Table B memory row omits the transient chunk (source comment is the accurate half); Table B adversarial row re-priced against round-4 numbers at stated chunk sizes; `:99` 24→27; `:77` 325→~734 lines, exports move; D1 `testNamePattern` cell; AC9 `main...`; Dispatch-precondition stale for owner item 1; ADR-0043 block quote (third report — maintainer edit on main).

## Gate round 4 on tip `e68fae6a` — no leak; decomposition exact; both gates REQUEST CHANGES on Table B + one retention defect; CI 7/7 — round 5 is the freeze

**Codex plugin `review`, `gpt-6-astra` (orchestrator-run, detached worktree, porcelain identical), verbatim:**

> All 48 secret-scan unit tests pass, but the retained substring can keep an arbitrarily large input allocation alive between calls, defeating the redactor's memory bound.
>
> - [P2] Detach the retained tail from large input strings — `src/core/secret-scan.js:731`. When a large push leaves a partial region, V8's `slice()` retains the entire input's backing string, violating the bounded-memory guarantee in Table B. With `--expose-gc`, pushing `'a'.repeat(32 * 1024 * 1024 + 100)` retains approximately 32 MiB after garbage collection despite buffering only 100 characters; releasing the tail with `end()` frees it. Copy the final bounded remainder into independent storage before returning, so an idle stream cannot retain an arbitrarily large previous chunk.

**wd-reviewer (spec fidelity, round 4, executed): REQUEST-CHANGES — no behaviour defect.** The hand-decomposed S2/S3/S4 predicates agree with an independent naive reference built from the detector's own rule regexes at **100 088 candidate positions, 0 mismatches**, with two-sided coverage on every row and the fuzzer's non-vacuity proven by five mutations; the running-maxima reduction is proven exact (newest opener decides; closer-before-opener-end and adjacency at 8–11 dashes handled; head placement provably unique); 30 000-case leak fuzz and 17 overlap shapes clean; D1 non-vacuous through the fast path (measured raw emission under the mutation); cold rate table reproduced (slowest 2.07 µs/char at chunk=1, ceiling 24 = 11.6×; 16 MiB push 1.11× chunked); spec edit minimal; S1 `why` fixed; no owner claim. Findings, all contract/mirror or quality: (1) the round-4 cost row says "rows S3/S4's blocked ranges" but the code it pins uses four running maxima — contradiction written in the same commit; (2) Table B's memory row ("at most 4 × 32768 characters") is falsified by round 4's per-instance state — measured ~1 067 KiB for four instances vs 256 KiB accounted; (3) the cost row's suite-side mirrors (`MAX_MICROS_PER_CHAR`, the six bait names, `[1, 64, 4096]`, the 16 MiB push) are unregistered, DoD 1(b) still says the design gate closed at round 3, and round 4 has no logbook raw; (4) the cut constants are a second spelling of the JSON-value and private-key rules — a rule *modified* later fails open (6 100 mismatches when the JSON separator is mutated), Accepted residual 3 covers only a rule *added*, and `CUT_PEM_OPEN.source.split('[A-Z ]*')[1]` would be `undefined` at load if the filler class ever changed, throwing out of `push`; (5) the `MAX_MICROS_PER_CHAR` JSDoc's stated 4096 range (0.018–0.045) is falsified by its own open-binder bait (0.405–0.59); (6) two of the six cost-row shapes are byte-identical fixtures; (7) a dead value and a third hand-written JSON-opener spelling in the test helpers.

**Adjudication.** Four rounds, no leak, predicate exact; every remaining finding is Table B not stating the resource dimension the implementation just changed, three rounds in a row. Per the convergence rule this closes by freezing: **round 5 = one architect Table B pass** (memory row, cost row wording and shape list, adversarial row re-priced, all mirrors registered, DoD 1(b), residual 3, logbook raw for rounds 1–5) plus the retention fix and the quality items, then both gates once more. If round 5 returns only prose, it is dispositioned to the done-flip errata and the PR merges.

**Errata for the done-flip** (spec-side, beyond the round-5 pass): `:99` 24→27 files; `:77` 325→755 lines, exports `:747`; D1 `testNamePattern` cell narrowed form; AC9 `main...`; Dispatch-precondition/`:606-607` stale for owner item 1 (ADR-0043 owner-signed); ADR-0043 block quote (fourth report — maintainer edit on main).

## Round 5 — the freeze

Tip: the head of `wp/secret-stream-safe-cut-redactor` at round 5 — the commit
this file is committed in. A commit cannot name its own hash, so the exact tip
is in the PR body and in this round's gate comment; the round-5 gate output is
appended below once both gates have run on it.

Round 5 is the convergence freeze ruled at round 4: one architect Table B pass
(memory row, cost-row wording and shape list, adversarial row re-priced, the
suite-side mirrors registered, Definition of done 1(b), Accepted residual 3,
and this logbook), plus the retention fix and the quality items. Both gates run
once more on the tip above; if round 5 returns only prose, it is dispositioned
to the done-flip errata and the PR merges.

Product changes in round 5:

- **Retention (Astra P2).** `buffer.slice(cut)` is a view in V8 and kept the
  whole previous input alive: a redactor idling on a 100-character remainder
  pinned the 32 MiB push it was cut from, measured at 32.16 MiB after
  `global.gc()`. The bounded remainder is now copied into storage of its own
  after a cut, and so is each emitted region and `end()`'s residue. Measured
  0.16 MiB; a `--expose-gc` child-process test holds it.
- **Load-time guard.** The private-key patterns are split at their filler class;
  a change to that class would have left `PEM_TAIL` `undefined` and thrown out
  of `push`, which must never throw. It now throws at module load, naming the
  rule.
- **Quality.** The `MAX_MICROS_PER_CHAR` JSDoc's chunk=4096 range now includes
  the open-binder bait (0.017-0.45); the three JSON-opener spellings in the test
  helpers are one, derived from the JSON value RULE's own pattern rather than
  from the cut layer; the private-key oracle is derived from the private-key
  RULE split at its lazy body. Both rule-modification mutations (separator group
  widened, filler class widened) now redden the exactness fuzz, which is what
  Accepted residual 3 claims.

## Round 5b — the LIGHT mechanical fix

Round 5's external gates, on tip `4512b736`:

**Codex plugin `review`, `gpt-6-astra`, verbatim:** *"No actionable defects were
found. All 49 targeted tests passed, and an additional 30,000-case differential
check found no mismatches between chunked and whole-input redaction."*

**wd-reviewer (spec fidelity, round 5): REQUEST-CHANGES on one item**; no leak,
no behaviour defect, no boundary or owner-claim violation. The blocker was
mechanical and self-inflicted by the round-5 architect pass: the cost row was
changed to define `keyword + whitespace run` as "a run of spaces and tabs, no
line breaks", but the bait it pins was left as `password:${blanks(size)}`, which
is byte-identical to the open-binder bait — so five shapes were priced rather
than six, and Table B's triple for that shape was the duplicate's numbers.

Fixed in round 5b, adjudicated LIGHT (verified mechanically, no fresh external
round, then merge):

- the fixture is now a spaces-and-tabs run, newline-terminated so the predicate
  is reached, and a one-line assertion holds the six baits pairwise distinct;
- Table B's triple for that shape re-priced from a cold measurement of the new
  fixture: **0.12 / 0.02 / 0.02** µs/char at chunk 1 / 64 / 4096 (it was
  carrying 0.73 / 0.07 / 0.04, the duplicate's);
- the cost row's "candidate-dense form" clause reworded so "no line breaks" and
  "newline-terminated" are no longer incompatible for that shape;
- Table S's obligation sentence and `isAcceptedCut`'s JSDoc gain "or modified in"
  to match Accepted residual 3; AC4's prose gains "between calls".

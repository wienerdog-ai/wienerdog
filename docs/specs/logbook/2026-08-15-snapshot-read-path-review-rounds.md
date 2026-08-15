---
date: 2026-08-15
title: "WP-snapshot-read-path-hardening review rounds — the record, with each round's raw-output commit"
related_wps: [WP-snapshot-read-path-hardening]
---

# WP-snapshot-read-path-hardening review rounds (2026-08-15)

Each round's raw final output is committed alongside this entry, one file per
round, and each row below cites that file's path AND the SHA of the commit that
introduced it — the rule at `docs/runbooks/codex-review.md` ("Rules"), landed in
`79ba77f`, which this package is the first to run under.

## The rounds

| # | Round | Backend | Result | Findings | Raw file | Raw commit |
|---|---|---|---|---|---|---|
| 0a | Template conformance | internal, clean context (spec + template only) | CONFORMANT | — | `2026-08-15-snapshot-read-path-r0-template-conformance-raw.md` | `a74fd99` |
| 0b | Internal coherence | internal, fresh context | 20 findings | 6 heavy / 14 light | `2026-08-15-snapshot-read-path-r0-internal-coherence-raw.md` | `a74fd99` |
| 1 | Adversarial design review | gptsol | NEEDS-ATTENTION | 3, all heavy | `2026-08-15-snapshot-read-path-codex-round-1-raw.md` | `a82de32` |

## When each raw output was committed — the part that is not recoverable later

**Round 1: committed BEFORE adjudication**, as the rule requires. Nothing in it
was judged, paraphrased or shaped before `a82de32` existed. One transport
artifact was decoded on the way in (`&amp;&amp;` → `&&` inside one `executed`
string) and is disclosed in that file's header; no finding text, verdict,
confidence or line number was altered.

**Rounds 0a and 0b: committed AFTER adjudication**, retrospectively, in
`a74fd99`. The text is verbatim, but the ordering property the rule buys was not
in force for those two — it is either done at the time or it is not, and for
round zero it was not. Anyone weighing those findings later should know it. The
same defect is recorded for the predecessor package
(`2026-08-14-vault-snapshot-review-rounds.md`), which is why the rule was
tightened; this entry is the first place the tightened form applies, and it
caught its own gap in the same session.

## Dispositions

### Round 0b — 18 fixed, 2 dropped

Applied in `7e012a9`. The heavy six: a Deliverables row that permitted a repair
its acceptance criterion forbade; a table row citing a test comment as "still
holds" while abolishing half of it; a descriptor exit-path enumeration that
omitted a throw; an open-failure contract no criterion asserted; a claim that
the snapshot's symlink posture lived in exactly one place, when the user-visible
skip reason is a second; and a platform table that generalized a darwin
measurement to POSIX and asserted an unmeasured win32 fact. The twelve light
ones were counts, citations, unregistered mirrors and duplicated statements.

**Two findings were dropped after the orchestrator re-ran them**, and the raw
file keeps them as written — the record is the reviewer's, not the
adjudicator's:

- Finding 9 claimed `SCAN_MAX_BYTES` sits at `src/core/secret-scan.js:23`. It is
  at `:22`, as the spec cited.
- Finding 4 claimed no test covers the mode-000 `unreadable` case. The test
  exists at `tests/unit/vault-snapshot.test.js:310-321`. The grep that "proved"
  its absence was a false negative: that test file holds raw high bytes in its
  fixtures, so `file` reports `data` and this environment's `grep` shim (ugrep
  with `-I`) silently skips it. **The finding's remaining half stood** — no
  acceptance criterion asserted the open-failure mapping — and that half was
  fixed.

Also dropped as machinery, on the finding's own evidence: both drafted
verification greps. Neither guarded its stated behaviour and each would have
gone red on a correct implementation, because the spec itself orders comments
that must name the very idioms the greps forbid.

### Round 1 — 3 fixed, 0 residual, 0 dropped

Applied in `b0f18a0`. All three reproduced on the orchestrator's machine before
being acted on, per the spot-check rule.

1. **The descriptor scope was wrong at its START.** A directory OPENS
   successfully under the contract's flags and is then refused by the `fstat`
   type check having read nothing, so a `finally` around the read alone never
   runs and the descriptor leaks. The scope now begins immediately after a
   successful `open`. A new close-posture row states what is promised (one close
   per successful open, on every path) and what is not (darwin documents `EINTR`
   on `close(2)`, so "no descriptor is ever left open" was unguaranteeable).
2. **The bounded-read criterion did not discriminate.** `readFileSync` of the
   120,965,360-byte node binary succeeds in ~10 ms, so slurp-then-compare-length
   returns the same per-file cap reason while keeping the resource-exhaustion
   defect. The criterion now states the bound at the READ PRIMITIVE. This also
   corrects the round-zero note that dropped the greps: its stated fallback
   guard did not hold either.
3. **The socket criterion was unrealizable.** A socket's open fails before any
   descriptor exists, so it can never reach `fstat`. Refusals are now ordered by
   the first operation that fails.

## What follows

All three round-1 findings are HEAVY — each changes what the implementer builds
— so weighted closure requires a **full fresh external round**, not a mechanical
re-check. Round 2 runs on `b0f18a0`.

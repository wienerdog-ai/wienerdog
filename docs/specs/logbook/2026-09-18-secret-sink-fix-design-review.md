---
date: 2026-09-18
related_wps: [WP-secret-sink-redact-before-truncate, WP-secret-stream-safe-cut-redactor, WP-secret-sink-chunk-fix]
---

# Secret-sink fix chain — design gate round 1 (2026-09-18)

Design review of PR #280 at tip `e81ec9dc`. Raw reviewer output and focus text
were committed **before** adjudication at `efd7d619`:

- `docs/specs/logbook/2026-09-18-secret-sink-fix-design-r1-astra-raw.json`
- `docs/specs/logbook/2026-09-18-secret-sink-fix-design-r1-astra-focus.txt`

Reviewer verdict: `needs-attention` — *"the accepted-cut predicate permits
credential leaks, and the flush wiring introduces a timeout-path regression."*
Both HEAVY findings were executed by the reviewer and independently re-measured
here before any edit. **Both are accepted in full; nothing was dispositioned
away.**

## Dispositions

| Round | Finding | Band | Weight | Disposition |
|-------|---------|------|--------|-------------|
| R1 | **S2 does not preserve incomplete multiline matches** (`WP-secret-stream-safe-cut-redactor.md:180-182`). S1 makes the prefix end in `\n`, so a "final line" predicate always sees the empty string and permits every cut; read as "the preceding line" it still loses `password:`⏎⏎ and `password`⏎`:`⏎, and it never tracked the JSON rule's newline-bearing quoted value. | A | HEAVY | **ACCEPTED, fixed.** Table S is redefined over **incomplete-match state on the whole buffered prefix**, never its last line, and grows from three conditions to four: S1 line-terminated, S2 no open key binder at the end of `P` (whitespace spanning CR/LF, separator optional), S3 no open sensitive quoted value anywhere in `P`, S4 no open private-key block. Table D grows to four declarations (D3 is new, for S3). New **AC3a** requires all seven measured shapes below as regression cases. Mirrored into ADR-0043 decision 2, and into the Deliverables cells, the mirror checklist and the verification block. |
| R1 | **Flush buffered output before the watchdog closes the log** (`WP-secret-sink-chunk-fix.md:196-202`). "Pipe end always precedes log closure" is false: `runBrainWithWatchdog` rejects at `dream.js:457` while a surviving child holds the pipe, and `dream.js:958` then ends the log. A partial line buffered before the timeout is lost, and the later pipe-end writes into an ended stream with no `'error'` listener. Today that line is written immediately, so this would be a regression, not a residual. | A/B | HEAVY | **ACCEPTED, fixed.** "Exact contracts" gains an explicit **shutdown step**: `spawnBrain` returns `{ child, done, shutdown }`; `shutdown()` is synchronous and idempotent, flushes every redactor through its `emit`, then **latches closed** so every later `emit` writes nothing. Deliverables widened by **`src/cli/dream.js`**, bounded to two edits (capture `shutdown` at `:402`, call it first in the existing `finally` at `:479`) with a churn gate in the verification block. run-job latches in its outer `finally` before the `:1120` write. New **AC2a** requires the regression scenario for both sinks. Mirrored into ADR-0043 as new decision 7. |
| R0 | Table V row V2's "byte-exact" REMOVE block does not match `src/cli/run-job.js:1050-1051` — the real lines also carry `attacker-influenceable.` and `The tee`, so a literal find/replace cannot locate it. | B | LIGHT | **ACCEPTED, fixed.** V2's REMOVE block is now the **whole five-line comment** `:1048-1052`, verified byte-exact, and the cell says why a two-line removal cannot be located. |
| R0 | `WP-secret-sink-chunk-fix.md:137-138` says 23 `*.proofs.json` files after the dependencies land; 24 − 2 + 2 + 1 = 25. | B | LIGHT | **ACCEPTED, fixed.** The bullet now shows the arithmetic and reads 25, with 27 after this WP's two. |
| R0 | The oversized marker is 56 characters, not 55 — repeated 5×. | B | LIGHT | **ACCEPTED, fixed** at all five sites (`WP-secret-sink-redact-before-truncate.md:26`, `:127`, `:325`; `WP-secret-stream-safe-cut-redactor.md:32`; this logbook family's measurements entry `:33`). Re-measured: `'[wienerdog: oversized content withheld from secret scan]'.length === 56`. |
| R0 | `WP-secret-stream-safe-cut-redactor.md:77` says `src/core/secret-scan.js` is 326 lines; it is 325. | B | LIGHT | **ACCEPTED, fixed.** `wc -l` → 325. |
| R0 | Everything else reproduced exactly: all probe names, ids and line cites; the Table A and Table W literal blocks; the five design measurements; the `ScanLimits` arithmetic; `boundary-check` against all three Deliverables tables. | — | — | **No action.** |

## HEAVY 1 — the seven measured shapes

Re-measured here on `main` at `08de2bc3` through the shipped detector, with `V`
= `hunter2hunter2hunter2`. For each: `redactOnly` **redacts it when it scans the
whole text**, and the concatenation of `redactOnly` over the pieces split at
every `\n` **leaks** — which is exactly the cut a last-line-only predicate
permits. All seven are far below `STREAM_REGION_MAX`, so the forced-cut bound
never comes into it.

```text
# L1
password:
  V
# L2
password:

V
# L3
password
:
V
# L4
password
: V
# L5
"client_secret":
  "abc
defghijkl"
# L6
"client_secret"
: "abcdefghijkl"
# L7 = L2 with CRLF line endings throughout
```

The corrected predicate was then validated against the same prefixes: each of
`password:\n`, `password\n`, `password:\r\n`, `password\n:\n`,
`"client_secret"\n` is refused by S2, and `"client_secret":\n  "abc\n` by S3,
while ordinary log lines (`ordinary log line\n`, `the password was wrong\n`,
`boom sk-ant-…\n`) are accepted. `a token\n` is also refused — S2's optional
separator makes it conservative, which costs one line of buffering and is
recorded in Table S.

## HEAVY 2 — why a pipe `'end'` is not a sufficient trigger

`src/cli/dream.js` `runBrainWithWatchdog` (`:376-541`) races `done` against a
timeout (`:462`); the timeout branch reaps and rejects (`:456-457`), and the
pidfile hand-up throws at `:414-445`. Both unwind through the `finally`
(`:479-540`) and out, after which `:958` calls `logStream.end()` — **unawaited,
on a stream with no `'error'` listener**. The reap may legitimately return
`{ reaped: false }` (`:508-509`), so a surviving group member still holds the
inherited stdio and the pipes need not have emitted `'end'` by then. The fix is
an explicit, idempotent shutdown called from that same `finally`, before the
log is closed, which both preserves the buffered diagnostics and stops any later
handler from writing.

## Next

A fresh adversarial round runs against the revised tip. `status:` stays `Draft`
on all three specs until the gate closes.

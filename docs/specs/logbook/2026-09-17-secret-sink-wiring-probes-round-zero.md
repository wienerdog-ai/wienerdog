---
title: Round zero for WP-secret-sink-wiring-probes — nine call sites measured, and the chunk leak is whole, not partial
date: 2026-09-17
related_wps: [WP-secret-sink-wiring-probes, WP-124-durable-output-sanitizing, WP-122-shared-secret-detector]
---

# Round zero for WP-secret-sink-wiring-probes

`WP-secret-sink-wiring-probes` was drafted against a tree that has since moved.
PR #245 rewrote `src/cli/dream.js`, `src/core/dream/*` and
`src/core/transcripts/*`; PR #253 added a lock gate to `dream.js`'s teardown;
PR #252 changed `src/scheduler/descriptor.js`. Every executable claim in the draft
was re-derived against `242c37b8` and every sink was **measured** with a throwaway
node probe driving the sink's real public entry point and reading the artifact
back off disk. Nothing was fixed; the WP stays diagnostic.

Base: `242c37b8cbffc9f9b67528332474333ff05f4740`. Node `v25.9.0`, darwin.

## 1. The probe string, re-verified against the shipped detector

The draft's constants survive unchanged. `src/core/secret-scan.js:88` is
`simpleRule(/sk-ant-[A-Za-z0-9\-_]{20,}/g, 'anthropic-key', SEVERITY.QUARANTINE)`.
Measured with `scanAndRedact`:

| Input | `.text` | `.findings` |
|---|---|---|
| `sk-ant-api03-PROBE-aaaa-bbbb-cccc-dddd-eeee-ffff` (48 ch) | `[REDACTED:anthropic-key]` | `[{anthropic-key, quarantine, 1}]` |
| `sk-ant-api03-PROBE-aaaa-` (`PROBE_HEAD`, 24 ch, 17 after `sk-ant-`) | unchanged | `[]` |
| `bbbb-cccc-dddd-eeee-ffff` (`PROBE_TAIL`, 24 ch) | unchanged | `[]` |
| `'F'.repeat(1976) + PROBE`, sliced to 2000 | unchanged | `[]` |

So both halves and the truncated prefix trip no rule, under the shipped
detector, exactly as the draft claimed. **The draft's inline comment calling the
rule `severity redact` is wrong — it is `QUARANTINE`.** Harmless for
`redactOnly` (which returns `.text` regardless) and corrected in the spec.

The draft also claimed the halves were re-verified against "the detector proposed
in `WP-secret-fence-shape-and-context`". That spec is `status: Superseded`, in
`docs/specs/done/`, and was **never implemented**
(`docs/specs/done/WP-secret-allowlist-exact-value-store.md:72-78`). There is no
second detector. All four references were rewritten to say so.

## 2. The inventory is nine call sites in five sinks, not eight

`grep -rn redactOnly src bin scripts skills` over `242c37b8`, minus the detector's
own file:

| Sink | `redactOnly` call sites (measured line numbers) | Artifact on disk | Draft said |
|---|---|---|---|
| alerts | `src/core/alerts.js:48` (`sanitizeAlert`'s `scrub`; `MAX_FIELD_CHARS = 2000` at `:29`) | `state/alerts.jsonl` | `:47`, `:28` |
| run evidence | `src/core/run-evidence.js:64` (`sanitizeArgv`), `:78` (`sanitizeRecord`'s `scrub`) | `state/run-evidence.jsonl` | same — unchanged |
| transcript extracts | `src/core/transcripts/index.js:67` (inside `redact`, which `capMessage` calls at `:103`) | `state/dream-scratch/<harness>-<session_id>.json`, written at `src/core/dream/scratch.js:129` | `:67` "inside `capMessage`"; write at `scratch.js:215` |
| brain logs | `src/core/dream/brain.js:517` (stderr), `:545` (stdout) | `logs/dream/<YYYY-MM-DD>.log` | `:287`, `:315` |
| routine logs | `src/cli/run-job.js:1055` (stdout), `:1060` (stderr), **`:1120` (failure message)** | `logs/<job>/<YYYY-MM-DD>.log` | `:867`, `:872` — **`:1120` was missing entirely** |

`run-job.js:1120` is a durable-log `redactOnly` call site the draft did not know
about: `logStream.write(redactOnly('\nwienerdog: job failed to run: ' + …))` in
the `finally` block, for a non-`WienerdogError` failure. It is a whole-string
redaction with no cap and no chunking, and it measures SAFE — but a completeness
claim over "every call site" was false without it, which is the whole point of a
diagnostic WP. The spec now carries sixteen probes, not fifteen.

Other `redactOnly` callers, inventoried and **excluded with a reason**, so the
list is closed rather than merely short:

- `src/core/dream/promote.js:621` and `src/cli/dream.js:320` — `neutralise()`,
  `WP-dream-promote-report` Table N's redact-then-sanitise transformation.
  `promote.js` is not ungated: the composed record is refused fail-loud at
  `promote.js:770` (`if (redactOnly(text) !== text) throw`), which puts it in the
  EP2/EP4 gate class, not the sink class. `dream.js:320` feeds `console.log`
  (`:1145`, `:1148`, `:1214`); on the scheduled path that stdout is teed into the
  routine log by the sink already inventoried above, and on the interactive path
  it is not a durable artifact at all.
- `src/core/digest.js:146` — a comment, not a call.

The two gates moved too: EP2 is `src/core/dream/validate.js:1402`
(`if (findings.length === 0) return { ok: true };`), not `:934`; EP4 is
`src/core/digest.js:713`, `:738-739`, `:780`, not `:506,521,543`.

## 3. Measured behaviour, sink by sink

Each row drove the sink's real public entry point and read the artifact back off
disk. `safe` is the spec's invariant: `artifact.includes(MARKER) &&
!artifact.includes(PROBE_HEAD)`.

| Probe | Feed | `safe` | MARKER | `PROBE_HEAD` in file | whole `PROBE` in file |
|---|---|---|---|---|---|
| alerts `reason`, `appendAlert` | WHOLE | **true** | yes | no | no |
| alerts `reason`, `appendAlert` | STRADDLE-TRUNCATE | **false** | no | **yes** | no |
| run-evidence argv, `recordRunEvidence` | WHOLE | **true** | yes | no | no |
| run-evidence argv | STRADDLE-TRUNCATE | **false** | no | **yes** | no |
| run-evidence `job`, `recordRunEvidence` | WHOLE | **true** | yes | no | no |
| run-evidence `job` | STRADDLE-TRUNCATE | **false** | no | **yes** | no |
| transcripts, `collectExtracts` | WHOLE | **true** | yes | no | no |
| brain stdout, `spawnBrain` | WHOLE | **true** | yes | no | no |
| brain stderr, `spawnBrain` | WHOLE | **true** | yes | no | no |
| brain stdout | STRADDLE-CHUNK | **false** | no | **yes** | **yes** |
| brain stderr | STRADDLE-CHUNK | **false** | no | **yes** | **yes** |
| routine stdout, `runjob.run` | WHOLE | **true** | yes | no | no |
| routine stderr, `runjob.run` | WHOLE | **true** | yes | no | no |
| routine stdout | STRADDLE-CHUNK | **false** | no | **yes** | **yes** |
| routine stderr | STRADDLE-CHUNK | **false** | no | **yes** | **yes** |
| routine failure message, `runjob.run` | WHOLE | **true** | yes | no | no |

Literal artifacts, for the record:

- alerts, truncate feed — the line ends
  `…FFFFFFFFsk-ant-api03-PROBE-aaaa-","log_hint":"h"}`.
- brain log, stdout chunk-straddle — the file is exactly
  `sk-ant-api03-PROBE-aaaa-bbbb-cccc-dddd-eeee-ffff\n`.
- routine log, failure-message site — the file is
  `\nwienerdog: job failed to run: spawn /…/no-such-[REDACTED:anthropic-key] ENOENT\n`.

## 4. The chunk leak is WHOLE, and the code says otherwise

`src/core/dream/brain.js:504-508` documents the chunk-boundary case as a
**known limitation, OWNER-APPROVED 2026-07-17**, in these words: *"a secret split
across a chunk boundary may be only partially redacted"*. `src/cli/run-job.js:1048-1052`
carries the same claim by reference (*"a boundary-split secret may be partially
redacted (accepted residual, see brain.js)"*).

**Measured, nothing is partially redacted.** When the two halves land in separate
chunks, neither half matches any rule, so neither call redacts anything, and the
two writes land contiguously: the complete 48-character credential is present
byte-for-byte in `logs/dream/<date>.log` and in `logs/<job>/<date>.log`. The
approved residual is real; the sentence describing it understates it, and the
understatement is what would let a reader conclude the artifact holds a fragment.

This is recorded, not fixed. It is routed in the spec under "Discovered issues /
routed" and is not this WP's work. The four log files are mode 0600 under
`logs/<job>/` created 0700 (`createLogStreamPrivate` / `mkdirPrivate`), so the
exposure is same-user, which is the boundary the threat model already draws — but
"same-user durable plaintext credential" is a materially different fact from
"partial fragment", and the two sentences above should be corrected by whichever
WP takes the fix.

## 5. The chunk-straddle fixture is timing-dependent, and a control proves it

A **control** was run: the same two writes with no delay between them.

| Fixture | Result |
|---|---|
| `printf HEAD; sleep 0.3; printf TAIL` | log is the raw whole credential — the defect reproduces |
| `printf HEAD; printf TAIL` (no delay) | log is `[REDACTED:anthropic-key]` — **safe** |

The shell flushes both writes before the parent's reader runs, the parent reads
one chunk, and `redactOnly` sees the whole credential. So a chunk-straddle probe
written without a forced boundary is not a weaker probe — it is the *opposite*
probe, and it would go red against a sink that is behaving exactly as measured.
The spec now states the requirement (the fixture must force a real chunk
boundary) and records the residual (a parent stalled longer than the delay
coalesces the reads and reddens the probe spuriously — a loud red, never a silent
green).

That same control is what makes the four chunk-defect probes *relevant* without a
declared ADR-0042 mutation: whole-in-one-chunk and split-across-two differ only in
the boundary, at the same handler, with the same bytes.

## 6. Test-harness facts the spec depends on

- `tests/unit/dream-collect.test.js`: `tempPaths()` at **:19**, `emptyLedger()` at
  **:31**, `writeClaude(...)` at **:37** (draft said 18 / 30 / 36).
- `collectExtracts` is now `(paths, ledger, maxInputBytes, {preprocessTimeoutMs,
  now} = {})` — a fourth options parameter arrived with PR #245
  (`src/core/dream/scratch.js:46-49`). The three-argument call the probe needs is
  still valid.
- `cleanScratch` is `src/core/dream/scratch.js:163-164`; `src/cli/dream.js` calls
  it at **:1240**, and since PR #253 only **inside `if (ownsLock(paths.state))`**
  (`dream.js:1239-1241`). The draft cited `dream.js:595` and
  `scratch.js:245` and described the teardown as unconditional.
- `tests/unit/dream-brain.test.js` already drives `spawnBrain` with a real
  `logStream` and a pinned fake brain (`pinFakeBrain` at :157, the EP3 test at
  :345). `tests/unit/scheduler-runjob.test.js` drives the log tee through
  `withRun(... fakeResolve(script) ...)` (helpers at :33, :92, :102, :125; the EP3
  test at :796). Both harnesses were reused verbatim for the measurements above,
  so the spec's "drivable from the existing test file" claim is measured, not
  assumed.

## 7. What changed in the spec as a result

- Inventory: eight call sites → **nine**; fifteen probes → **sixteen** (P16, the
  `run-job.js:1120` failure-message site).
- Every `file:line` cite re-derived; eleven were wrong.
- The dead `WP-secret-fence-shape-and-context` references withdrawn.
- Defect probes gained a **positive-presence** assertion. `assert.equal(safe,
  false)` alone passes against an *empty* artifact, which is exactly the vacuity
  class ADR-0042 exists for; the truncate probes now also assert `PROBE_HEAD` is
  present and the chunk probes that the whole `PROBE` is present.
- RED evidence: the spec now requires it per ADR-0042, states the two mutation
  families that produce it by single exact-substring replacement, and names the
  four probes that are exempt because per-chunk redaction cannot be made
  whole-stream by one substring.
- The transcript sink's transience is restated against the lock gate.

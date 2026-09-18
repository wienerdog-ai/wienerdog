---
id: WP-secret-sink-chunk-fix
title: Close the whole-credential chunk-boundary leak at the four durable-log stream sinks
status: Draft
model: opus
size: M
depends_on: [WP-secret-sink-redact-before-truncate, WP-secret-stream-safe-cut-redactor]
adrs: [ADR-0004, ADR-0024, ADR-0031, ADR-0042, ADR-0043]
epic: secret-lifecycle
---

# WP-secret-sink-chunk-fix: wire the stream redactor into `brain.js` and `run-job.js`

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog spawns two kinds of short-lived child process and tees their output to
a durable log on the user's disk: the **dream brain** (`spawnBrain`,
`src/core/dream/brain.js`), whose stdout and stderr are teed to
`~/.wienerdog/logs/dream/<YYYY-MM-DD>.log`, and a **routine** job
(`src/cli/run-job.js`), whose stdout and stderr are teed to
`~/.wienerdog/logs/<job>/<YYYY-MM-DD>.log`. Both children are fully
attacker-influenceable, so ADR-0024's enforcement point **EP3** requires their
output to pass a bounded sanitizing transform before it reaches the file.

Today that transform is **one `redactOnly` call per stream chunk**, at four call
sites. `WP-secret-sink-wiring-probes` (Done, PR #261) measured — and design
review reproduced through real subprocess pipes — that a credential whose two
halves land in separate chunks is redacted by **neither** call and the two writes
land **contiguous**: the complete 48-character key is in the durable log,
byte-for-byte. Four committed tests assert that leak is positively present, named
`… (KNOWN DEFECT <id>)` for `WD-SINK-CHUNK-BRAIN-STDOUT`,
`WD-SINK-CHUNK-BRAIN-STDERR`, `WD-SINK-CHUNK-RUNJOB-STDOUT` and
`WD-SINK-CHUNK-RUNJOB-STDERR`. Exposure is same-user (0600 files under 0700
directories), which is the boundary the threat model already draws.

The code calls this a known limitation and attributes it to a 2026-07-17 owner
approval — *"a secret split across a chunk boundary may be only partially
redacted — deliberately NOT buffered across chunks, because unbounded reassembly
would reopen the WP-118 OOM/DoS surface"* (`src/core/dream/brain.js:504-508`,
echoed by reference at `src/cli/run-job.js:1048-1052`). **That record exists
nowhere else in the repo — no ADR carries it** — what it approves is *not
buffering*, and its description of the consequence is measurably wrong. ADR-0043
decides the replacement: buffer, but bound it, and cut only where no detector
rule can match across. `WP-secret-stream-safe-cut-redactor` (this WP's dependency)
ships that transform as `createStreamRedactor()` in `src/core/secret-scan.js`.

**This WP wires it in, converts the four probes, and corrects both comments.** It
is the last of the three packages that close the seven sink defects the probes
pinned; it therefore also carries the one dated errata block that records all
seven as closed in the predecessor's Done record.

**IRON RULE (ADR-0004): Wienerdog is just files.** The transform is a plain
synchronous function. This WP starts no process, opens no descriptor, registers
no timer, and adds no dependency. It adds two `'end'` listeners per sink on
streams that already exist.

## Current state

Measured on `main` at **`08de2bc3`**, plus what the two dependencies add. Line
numbers disambiguate; grep for the cited construct, which is what authenticates
it.

- `src/core/secret-scan.js` exports `createStreamRedactor()` (added by
  `WP-secret-stream-safe-cut-redactor`) returning `{ push(text) -> string,
  end() -> string }`, plus `ScanLimits.STREAM_REGION_MAX`. Its contract: the
  concatenated return values of every `push` followed by `end` equal
  `redactOnly` applied, in order, to a contiguous partition of the whole input;
  `push` may return `''`; `end()` is idempotent; neither throws; both are
  synchronous and hold no descriptor, timer or process. **This WP does not modify
  it.**
- The four sites are **Table W**. Their pre-fix bodies are the three `W<n> CURRENT`
  blocks Table W publishes: W1's and W2's occur once each in
  `src/core/dream/brain.js`, and W3's and W4's are the same one line, occurring
  exactly twice in `src/cli/run-job.js` (once per handler).
- **`src/core/dream/brain.js`** — `spawnBrain` spans `:384-571` and returns
  `{ child, done }` (`:570`). `child` is the sanitized facade from
  `src/core/exec-identity.js:579-609`, whose `on`/`once` accept **only** `'exit'`
  and `'error'`; `child.stdout` and `child.stderr` are the raw streams. The
  facade emits its constructed `'exit'` off the real child's **`'close'`**
  (`exec-identity.js:582-584`), so `done` settles only after both pipes have
  closed. `done` resolves
  `{ code, durationMs, stderrTail, sawUnknownCommand }` (`:558-566`). Three
  accumulators feed that object and are **closure-local**:
  - `stderrTail` (`:514`), grown as `(stderrTail + redacted).slice(-STDERR_TAIL_MAX)`
    (`:518`; `STDERR_TAIL_MAX = 4096`, `:21`). Read at `:561` and surfaced by
    `src/cli/dream.js:463-465` into the `dream brain exited N` message — **the
    only place a redacted chunk's text is re-emitted outside the log file**.
  - `stdoutHead` (`:541`) and `stdoutTotalLen` (`:542`), grown at `:546-547`
    (`STDOUT_HEAD_MAX = 4096`, `:24`). Both are read only at `:562-565`, the
    `sawUnknownCommand` discriminator: `stdoutTotalLen <= STDOUT_HEAD_MAX &&
    (isBareUnknownCommand(stdoutHead) || (stdoutHead stripped of ANSI trims to
    '' && isBareUnknownCommand(stderrTail)))`. `stdoutTotalLen` counts
    **post-redaction characters**.
  - `logStream` is created by the caller at `src/cli/dream.js:922`
    (`createLogStreamPrivate`, `flags: 'a'`), passed in at `:941`/`:402`, and
    ended **unawaited** at `src/cli/dream.js:958`. **It carries no `'error'`
    listener.**
- **`src/cli/run-job.js`** — `logStream` is declared at `:1015`, opened at
  `:1025` (`createLogStreamPrivate`, default `flags: 'w'`), given an error
  absorber at `:1031-1034` that sets `logStreamFailed` / `logStreamErrCode`
  (read at `:1180` and `:1240`), and closed by `await endStream(logStream)` at
  `:1125` inside the outer `finally` (`:1111-1127`). The promise resolves on the
  **raw child's `'close'`** (`:1064-1067`). There are exactly three
  `logStream.write(` calls: `:1055`, `:1060` and `:1120` — the last is the
  non-`WienerdogError` failure message, written in that same `finally`
  **after** the child has settled and **before** `endStream`.
- **There is no `'end'` wiring anywhere in `src/`** (`grep -rn "on('end')\|\.pipe(" src/`
  returns nothing), and neither sink uses `.pipe()`.
- **Nothing reads either log while its writer is alive.** There is no
  `wienerdog logs` command (`bin/wienerdog.js:50-65` has no such verb), no
  `fs.watch`/`watchFile`, no follow flag, and no `createReadStream` on a log. The
  only in-flight reader of the log directory is `rotateLogs(logDir)`
  (`run-job.js:1138`), after the run. `log_hint` in an alert record is a
  code-owned string naming the path; nothing opens it.
- Probes and their controls, all measured at `08de2bc3`:
  `tests/unit/dream-brain.test.js` — P7 `:554`, P8 `:561`, P10 `:583`, P11
  `:590`, with the shared fixture block at `:500-521` and the harness
  `runProbeBrain` at `:526-551` (plain `fs.createWriteStream`, `await done`, then
  `await new Promise((r) => logStream.end(r))`, then read the file).
  `tests/unit/scheduler-runjob.test.js` — P12 `:3165`, P13 `:3176`, P14 `:3203`,
  P15 `:3214`, P16 `:3239`, fixture block `:3131-3152`, harness `readJobLog`
  `:3156-3162`. All four defect probes force a real chunk boundary with
  `printf` + `sleep 0.3` + `printf`.
- Other tests that read these logs' **content**, which must keep passing
  unchanged: `tests/unit/dream-brain.test.js:345` (asserts the on-disk log **and**
  that `stderrTail` still contains the non-secret context `OPENAI_API_KEY=`),
  `:227`, and the seven `sawUnknownCommand` tests at `:287`–`:342` (`:330` pins
  the `>STDOUT_HEAD_MAX` accepted residual, i.e. that `stdoutTotalLen` counts
  post-redaction characters); `tests/unit/scheduler-runjob.test.js:796`,
  `:2059` (pins the `:1120` failure message in the file) and `:772` (the
  fail-loud email body carries no raw log tail — one of the four compensating
  controls the comment this WP rewrites names); `tests/integration/dream.test.js:1328`
  (pins the dream log's append semantics via `startsWith('legacy line\n')`).
- `tests/red-proofs/` holds **23** `*.proofs.json` files once the two
  dependencies have landed (`WP-secret-sink-redact-before-truncate` deletes two
  and creates two; `WP-secret-stream-safe-cut-redactor` creates one). Count, do
  not assume. This WP adds two.
- `npm test` is `node tests/run.js`; `npm run lint` is `node scripts/lint.js`;
  `npm run red-proofs` is `node tests/with-temp-root.js scripts/red-proofs.js`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/brain.js | sites W1 and W2 per Table W, plus the flush wiring of Table W's `Flush` row and the comment correction of Table V row V1 |
| modify | src/cli/run-job.js | sites W3 and W4 per Table W, plus the flush wiring and the comment correction of Table V row V2 |
| modify | tests/unit/dream-brain.test.js | convert probes P8 and P11 per Table X; add `LEAK_MSG`; delete `DEFECT_MSG` once unused; add the AC5 ordering test |
| modify | tests/unit/scheduler-runjob.test.js | convert probes P13 and P15 per Table X; add `LEAK_MSG`; delete `DEFECT_MSG` once unused |
| create | tests/red-proofs/secret-sink-chunk-fix-dream-brain.proofs.json | Table Y rows Y1 and Y2 only; `suite` is `tests/unit/dream-brain.test.js` |
| create | tests/red-proofs/secret-sink-chunk-fix-scheduler-runjob.proofs.json | Table Y rows Y3 and Y4 only; `suite` is `tests/unit/scheduler-runjob.test.js` |
| modify | docs/specs/done/WP-secret-sink-wiring-probes.md | insert the one dated block of Table Z, byte-exact, at Table Z's anchor. Zero deletions, zero edits to any existing line, including Table P and Table S |

Add nothing else to those files. Do not edit any other existing test.

Per `docs/specs/_TEMPLATE.md` lines 33-35 and `scripts/boundary-check.js`, this
spec file, `package-lock.json`, `memory/lessons/inbox.md` and anything under
`docs/specs/logbook/` are exempt from every Deliverables table and are therefore
not listed, while remaining permitted in the verification whitelist below.

### Exact contracts

**One redactor per stream.** Each of Table W's four sites gets its **own**
`createStreamRedactor()` instance, created where the handler is attached. Four
instances exist per process at most; they share no state. Two streams feeding the
same `logStream` must not share one — they are separate interleavings and
separate defect ids.

**One emit step per stream.** Every site keeps its existing per-stream accounting
exactly as it is today, moved behind a single step that both `push` and `end`
feed. For a stream whose accounting today is `f(redacted)`, the new shape is:

- on `'data'`: `emit(redactor.push(chunk.toString('utf8')))`
- on `'end'`: `emit(redactor.end())`
- where `emit(text)` runs the site's existing accounting on `text` and writes it,
  **skipping entirely when `text` is `''`**.

Table W's `Accounting` column fixes what `emit` must do at each site, and it is
unchanged from today's body. The `chunk.toString('utf8')` conversion is
unchanged.

**The redactor is flushed twice, idempotently, and never later than the value it
feeds is read.** `end()` returning `''` on a second call is what makes this safe:

- **brain.js** — flush each stream on its `'end'` event, **and again inside the
  `child.on('exit', …)` handler before the resolved object is constructed**. The
  second flush is the guarantee: `stderrTail`, `stdoutHead` and `stdoutTotalLen`
  must be complete at `:561-565`, and a stream that never emits `'end'` (a
  spawn that fails before the pipe opens) must not strand buffered text.
- **run-job.js** — flush each stream on its `'end'` event, **and again in the
  outer `finally` immediately before the `:1120` failure-message write**, so the
  log's byte order is unchanged: teed output first, the failure line last.

**What `emit` must never do.** It must not write when `text` is `''`, and on the
brain path it keeps today's `if (logStream)` guard. The dream `logStream` has no
`'error'` listener and is ended unawaited, so a write after end is an unhandled
`'error'` that takes the process down; today's `'data'` handler has that same
exposure on the watchdog-timeout-with-surviving-child path. **Do not widen it** —
after this change the handler writes strictly less often, and the `'end'` flush
fires when the pipe closes, which is before `logStream.end()` on every path.

**The converted probes get a fixed failure message** so that a red probe no
longer prints the probe value into CI output. Define it once per test file:

```js
const LEAK_MSG = (id) =>
  `${id}: a secret split across two stream chunks must be redacted before it ` +
  'reaches the durable log. See ADR-0043 and Table W of WP-secret-sink-chunk-fix; ' +
  'do not weaken or delete this test.';
```

## Contract reference

Activation (ADR-0031, 4 of 7): (iv) the fallback behaviour at a bound and the
flush/ordering behaviour change; (v) the task crosses an authority boundary — the
detector emits sanitized bytes but two other modules own the artifacts and the
accumulators those bytes feed; (vi) the predecessor's Done record and two
declaration files inherit the contract; (vii) the same four-site inventory
appears in Deliverables, the acceptance criteria and the verification greps.

Canonical tables: **W** (the four sites and their wiring), **V** (the two comment
corrections), **X** (the probe conversions), **Y** (the RED declarations), **Z**
(the predecessor's errata block).

### Table W — canonical: the four per-chunk sites and their wiring

| # | Old id | File | Stream | Current body | Accounting `emit(text)` must do, unchanged from today |
|---|--------|------|--------|--------------|--------------------------------------------------------|
| W1 | S5 | `src/core/dream/brain.js` (`:516-520`) | brain **stderr** | the `W1 CURRENT` block below | `stderrTail = (stderrTail + text).slice(-STDERR_TAIL_MAX);` then `if (logStream) logStream.write(text);` |
| W2 | S6 | `src/core/dream/brain.js` (`:544-548`) | brain **stdout** | the `W2 CURRENT` block below | `stdoutTotalLen += text.length;` then `stdoutHead = (stdoutHead + text).slice(0, STDOUT_HEAD_MAX);` then `if (logStream) logStream.write(text);` |
| W3 | S7 | `src/cli/run-job.js` (`:1054-1056`) | routine **stdout** | the `W3 CURRENT` block below | `logStream.write(text);` |
| W4 | S8 | `src/cli/run-job.js` (`:1059-1061`) | routine **stderr** | the `W4 CURRENT` block below (identical text to W3, one occurrence each) | `logStream.write(text);` |

**The four handler bodies as they stand, byte-exact, leading indentation
included.** They live in a fenced block rather than in table cells because the
indentation is load-bearing for the `grep -cF` gate below, and a markdown code
span cannot carry a leading space. Measured at `08de2bc3`; the `# W<n> …` lines
are labels and are not part of any string. `W3 CURRENT` and `W4 CURRENT` are the
same text and it occurs exactly twice in `src/cli/run-job.js`, once per handler.

```text
# W1 CURRENT
      const redacted = redactOnly(chunk.toString('utf8'));
      stderrTail = (stderrTail + redacted).slice(-STDERR_TAIL_MAX);
      if (logStream) logStream.write(redacted);
# W2 CURRENT
      const redacted = redactOnly(chunk.toString('utf8'));
      stdoutTotalLen += redacted.length;
      stdoutHead = (stdoutHead + redacted).slice(0, STDOUT_HEAD_MAX);
      if (logStream) logStream.write(redacted);
# W3 CURRENT and W4 CURRENT
        logStream.write(redactOnly(chunk.toString('utf8')));
```

Additional rows that are contract, not sites:

| Fact / rule | Value |
|-------------|-------|
| Flush, brain | each redactor is flushed on its own stream's `'end'` event **and** again inside `child.on('exit', …)` before the resolved object at `src/core/dream/brain.js:558-566` is constructed |
| Flush, run-job | each redactor is flushed on its own stream's `'end'` event **and** again in the outer `finally` immediately before the `:1120` failure-message write |
| Per-stream order | **is a contract.** Within one stream, every byte reaches the log in input order, exactly once, and every byte passes through `redactOnly` as part of a region |
| Cross-stream order | **is NOT a contract, and this is the row that says so.** stdout and stderr write into the same `logStream`; today they interleave at chunk arrival, after this change at region arrival. No test pins it today and none is added. A reader must not infer causality from the relative position of a stdout line and a stderr line in either log |
| Live readability | **is not a property today and none is created.** Nothing in the repo reads either log while its writer is alive (Current state). Complete lines now appear slightly later than partial ones did; the file after the run is byte-identical in every non-secret respect |
| `logStream` lifecycle | unchanged: same `createLogStreamPrivate` call, same `flags`, same `endStream` / `logStream.end()` call sites, same error absorber on the run-job path and the same absence of one on the dream path |
| `redactOnly` direct calls remaining in these two files | exactly one, `src/cli/run-job.js:1120` (the failure message, whole string, no cap). It is site S9 of the predecessor's Table S, it is CORRECT, probe P16 guards it, and it is **not** changed |
| Imports | `src/core/dream/brain.js:8` (`const { redactOnly } = require('../secret-scan');`) loses its only two callers, so it becomes `createStreamRedactor` — leaving an unused `redactOnly` binding there is an orphan this WP's own change created and must clean up. `src/cli/run-job.js:13` keeps `redactOnly` for `:1120` **and** gains `createStreamRedactor` |

`WP-secret-stream-safe-cut-redactor`'s Table B bounds the buffer at
`ScanLimits.STREAM_REGION_MAX` = 32768 characters per instance, so this WP holds
at most 4 × 32768 characters of unwritten child output.

### Table V — canonical: the two comment corrections

Both comments describe the residual this WP removes, and both describe it in
words that were measured wrong. Replace the sentences named below; change no
other prose in either block.

| # | File | Sentence to remove | What the replacement must say |
|---|------|--------------------|-------------------------------|
| V1 | `src/core/dream/brain.js` (`:504-508`) | the `V1 REMOVE` block below | that per-chunk redaction was withdrawn by ADR-0043 because a split secret landed **whole and contiguous** in the durable log, not partially redacted; that the transform now buffers to an accepted cut point, bounded by `ScanLimits.STREAM_REGION_MAX`, which is what answers the WP-118 OOM/DoS surface; and that the remaining residual is a forced cut inside a single logical line longer than that bound. It must **not** claim any owner approval, acceptance or ratification of anything |
| V2 | `src/cli/run-job.js` (`:1048-1052`) | the `V2 REMOVE` block below | the same, by reference to ADR-0043 rather than by restating it. The surrounding EP3 attribution (`audit A5 / ADR-0024 / WP-124`) and the `{ end:false }` note stay |

The two blocks, byte-exact as they stand at `08de2bc3`; the `# V<n> …` lines are
labels and are not part of any string:

```text
# V1 REMOVE
  // Known limitation (OWNER-APPROVED 2026-07-17): a secret split across a
  // chunk boundary may be only partially redacted — deliberately NOT buffered
  // across chunks, because unbounded reassembly would reopen the WP-118
  // OOM/DoS surface. The other A5 layers (EP2 whole-file scan, EP4 digest
  // scan, WP-126 0600 log modes, no log content in email) cover the residual.
# V2 REMOVE
    // Bounded per-chunk scan; a boundary-split secret
    // may be partially redacted (accepted residual, see brain.js).
```

The four compensating controls the V1 sentence lists (EP2 whole-file scan, EP4
digest scan, WP-126 0600 log modes, no log content in email) are all still true
and still independent — do not delete that claim, and note that
`tests/unit/scheduler-runjob.test.js:772` is the test for the last of them.

### Table X — canonical: the four probe conversions

Each probe keeps its file, its feed (including the forced chunk boundary), its
entry point and its `safeOf` invariant — `artifact.includes(MARKER) &&
!artifact.includes(PROBE_HEAD)`, computed against the artifact **read from
disk**. What changes is the name, the assertion and the message. The regression
id is kept so the trail from the defect to its fix stays greppable.

| # | File | Old test name (delete this name) | New test name (exact) | New assertion (verbatim, one line) |
|---|------|----------------------------------|-----------------------|-------------------------------------|
| X1 | `tests/unit/dream-brain.test.js` | `sink-probe: brain — a labelled secret straddling two stdout chunks is NOT redacted in the brain log (KNOWN DEFECT WD-SINK-CHUNK-BRAIN-STDOUT)` | `sink-probe: brain — a labelled secret straddling two stdout chunks is redacted in the brain log` | `assert.equal(safe, true, LEAK_MSG('WD-SINK-CHUNK-BRAIN-STDOUT'));` |
| X2 | `tests/unit/dream-brain.test.js` | `sink-probe: brain — a labelled secret straddling two stderr chunks is NOT redacted in the brain log (KNOWN DEFECT WD-SINK-CHUNK-BRAIN-STDERR)` | `sink-probe: brain — a labelled secret straddling two stderr chunks is redacted in the brain log` | `assert.equal(safe, true, LEAK_MSG('WD-SINK-CHUNK-BRAIN-STDERR'));` |
| X3 | `tests/unit/scheduler-runjob.test.js` | `sink-probe: routine-log — a labelled secret straddling two stdout chunks is NOT redacted in the job log (KNOWN DEFECT WD-SINK-CHUNK-RUNJOB-STDOUT)` | `sink-probe: routine-log — a labelled secret straddling two stdout chunks is redacted in the job log` | `assert.equal(safe, true, LEAK_MSG('WD-SINK-CHUNK-RUNJOB-STDOUT'));` |
| X4 | `tests/unit/scheduler-runjob.test.js` | `sink-probe: routine-log — a labelled secret straddling two stderr chunks is NOT redacted in the job log (KNOWN DEFECT WD-SINK-CHUNK-RUNJOB-STDERR)` | `sink-probe: routine-log — a labelled secret straddling two stderr chunks is redacted in the job log` | `assert.equal(safe, true, LEAK_MSG('WD-SINK-CHUNK-RUNJOB-STDERR'));` |

Each converted probe drops its second, positive-presence assertion
(`assert.equal(artifact.includes(PROBE), true, …)`) — it asserted the leak was
there. The `safeOf` invariant carries the non-vacuity that remains available from
the assertion alone: it requires `MARKER` to be **present**, which an empty
artifact cannot satisfy.

**The vacuity that conversion introduces, and what answers it.** Before this WP,
P8 differed from its control P7 by *asserting the opposite thing*; after it, the
two assert the same thing and differ only in whether a chunk boundary actually
forms. If the fixture's `sleep 0.3` fails to split the writes on some machine,
the converted probe silently degrades into a second copy of its control and
proves nothing. **That is exactly the inference ADR-0042 exists to replace**, and
it is why Table Y's four declarations are load-bearing rather than decorative:
reverting a handler to the per-chunk call reddens its probe **only if** the
boundary genuinely formed in that run. Do not drop a declaration, and do not
change the fixtures' boundary mechanism.

Probes P7, P10, P12, P14 and P16 keep their current names, assertions and
messages. `PROBE_TAIL`, declared and unused in both fixture blocks, stays as it
is — removing it is not this WP's business.

### Table Y — canonical: the declared RED proofs (ADR-0042)

Each declaration reverts **one** handler to a per-chunk `redactOnly` call and
requires that handler's converted probe, and only it, to fail.

| # | File | Suite | Reverts | `testNamePattern` | Must redden |
|---|------|-------|---------|-------------------|-------------|
| Y1 | `tests/red-proofs/secret-sink-chunk-fix-dream-brain.proofs.json` | `tests/unit/dream-brain.test.js` | site W2 (brain stdout) | `straddling two stdout chunks` | X1 |
| Y2 | same file as Y1 | `tests/unit/dream-brain.test.js` | site W1 (brain stderr) | `straddling two stderr chunks` | X2 |
| Y3 | `tests/red-proofs/secret-sink-chunk-fix-scheduler-runjob.proofs.json` | `tests/unit/scheduler-runjob.test.js` | site W4 (routine stderr) | `straddling two stderr chunks` | X4 |
| Y4 | same file as Y3 | `tests/unit/scheduler-runjob.test.js` | site W3 (routine stdout) | `straddling two stdout chunks` | X3 |

**Which fields this spec fixes and which the implementer fills.** The code these
declarations mutate is written by this WP, so:

| Field | Fixed by |
|-------|----------|
| `suite`, `file`, `wp`, `criterion` (`AC4`) | this spec — Deliverables and Table Y |
| `expectRed[].test` | this spec — Table X's `New test name` cell, verbatim, one-element array |
| `expectRed[].signal` | this spec — a substring of `LEAK_MSG('<id>')` from "Exact contracts"; use `<id>: a secret split across two stream chunks must be redacted`. **It must contain no part of `PROBE`** |
| `testNamePattern` | this spec — Table Y's cell; the implementer **may narrow** it |
| `id` | this spec — `brain-stdout-per-chunk`, `brain-stderr-per-chunk`, `runjob-stdout-per-chunk`, `runjob-stderr-per-chunk`; kebab, unique across the whole declaration directory |
| `find`, `replace`, `marker`, `occurrences`, `why` | **the implementer**, against the code this WP writes |

**This constrains the implementation, and deliberately so:** each revert must be
**one exact-substring replacement** — which is why Table W puts one `emit(…)`
call per handler. If a revert cannot be written that way, restructure the handler
until it can. Do not weaken a mutation to make it fit. Runner rules: `replace`
must differ from `find` and must contain `marker`; `file` may not be the suite or
anything under `tests/`; the observed own-body failing set must **equal** the
declared set (narrow `testNamePattern`, or declare the extras and say so — never
weaken the mutation); **the gate is the bare unfiltered `npm run red-proofs`**, a
`--wp`-filtered run being non-zero by construction. Do not pin a repo-wide
declaration total.

### Table Z — canonical: the predecessor's errata block

| Fact / rule | Value |
|-------------|-------|
| File | `docs/specs/done/WP-secret-sink-wiring-probes.md` |
| Anchor | the line whose entire content is `<!-- errata above; the spec as it shipped follows -->`. The block is inserted **immediately before** it, after the existing 2026-09-17 errata block, followed by one blank line |
| Inserted text | the fenced block published in full below, byte-exact |
| Diff constraint | **zero deletions and zero modified lines in that file.** Table P's rows, Table S's rows and Table R keep their shipped text: the file is the record of what shipped, and the inserted block is what says which of its facts are now superseded |
| Why it lands here and not earlier | it records all **seven** defects as closed, which is only true once this WP merges; `WP-secret-sink-redact-before-truncate` records its three flips in a `docs/specs/logbook/` entry, which this block cites |

The block, byte-exact:

```markdown
> **Post-fix record, 2026-09-18 — all seven KNOWN DEFECTS are CLOSED, and the
> facts below are superseded.** Nothing in the spec text is edited; this block is
> the pointer.
>
> - **The three truncation defects** — `WD-SINK-TRUNC-ALERTS`,
>   `WD-SINK-TRUNC-RUNEV-ARGV`, `WD-SINK-TRUNC-RUNEV-FIELD` — were closed by
>   `WP-secret-sink-redact-before-truncate`, which swapped the cut and the scan at
>   Table S rows S1, S2 and S3. Probes P2, P4 and P6 are converted to the safe
>   form and renamed; **that spec's Table B is canonical for their names**, and
>   Table R's two declaration files were replaced by its Table C.
> - **The four chunk defects** — `WD-SINK-CHUNK-BRAIN-STDOUT`,
>   `WD-SINK-CHUNK-BRAIN-STDERR`, `WD-SINK-CHUNK-RUNJOB-STDOUT`,
>   `WD-SINK-CHUNK-RUNJOB-STDERR` — were closed by `WP-secret-sink-chunk-fix` per
>   **ADR-0043**, which withdrew per-chunk redaction in favour of a bounded
>   transform that cuts only where no detector rule can match across. Probes P8,
>   P11, P13 and P15 are converted and renamed; **that spec's Table X is
>   canonical for their names.**
> - **Superseded here:** Table P's `Status` column for P2, P4, P6, P8, P11, P13
>   and P15 (all seven are now CORRECT); Table S's `Pattern` cells for rows
>   S1–S3 (`truncate-then-redact`) and S5–S8 (`per-chunk`); the "nine CORRECT and
>   seven DEFECT" count; "Accepted residuals" items 1 and 2; and owner item 2's
>   open question, which ADR-0043 answers.
> - **Not superseded:** Table S's inventory of nine call sites and its closure
>   claim, the nine CORRECT probes' behaviour, and this spec's 2026-09-17 errata.
```

### Mirrored Surface Checklist

For each canonical table above, every surface in this spec that mirrors it, so a
review finding updates the table and all its mirrors **in the same commit**
(update-all-mirrors), and a new mirror found in review is added here on the spot
(register-new-mirrors):

- [ ] **Deliverables-table cells** — the `brain.js` and `run-job.js` rows' site
      lists (W1, W2 / W3, W4) and comment-correction pointers (V1 / V2); the two
      test rows' probe lists (X1, X2 / X3, X4); the two declaration rows' row
      assignments (Table Y); the `done/` row's anchor and zero-deletion rule
      (Table Z).
- [ ] **Acceptance criteria** — AC1 (no `redactOnly` chunk call survives), AC2
      (one redactor per stream, both flushes), AC3 (the four converted names and
      assertions), AC4 (the declarations), AC5 (per-stream order and the
      accumulators), AC6 (the comment corrections), AC7 (the errata block, zero
      deletions).
- [ ] **Verification commands / greps** — the three `W<n> CURRENT` counter-greps
      and the `redactOnly(` census in the two files (Table W); the four new test
      names and the four old names counted at zero (Table X); the
      declaration-shape check and `npm run red-proofs` (Table Y); the V1/V2
      removed-sentence greps (Table V); the `git diff --numstat` zero-deletion
      check on the `done/` file (Table Z); the permission-boundary whitelist.
- [ ] **Current-state description** — the accumulator bullets and their readers,
      the facade's `'exit'`-off-`'close'` wiring, the `logStream` lifecycles and
      the dream path's missing `'error'` listener, the probe and harness line
      numbers, the other-tests list, and the `tests/red-proofs/` count.
- [ ] **Operative prose steps** — the Context paragraph on the 2026-07-17 record;
      the whole of "Exact contracts" (one redactor per stream, one emit step, the
      double flush, what `emit` must never do, the `LEAK_MSG` literal); Table X's
      vacuity paragraph; Table V's compensating-controls note; "Accepted
      residuals"; "Discovered issues / routed"; the "Out of scope" list.
- [ ] **Frontmatter** — `adrs` (must list ADR-0043 and, while Table Y is
      non-empty, ADR-0042) and `depends_on` (both dependencies are load-bearing:
      one supplies `createStreamRedactor`, the other frees the Table Z block to
      claim all seven).

## Implementation notes & constraints

- **Do not change what the accumulators mean.** `stdoutTotalLen` still counts
  post-redaction characters, `stdoutHead` is still the first `STDOUT_HEAD_MAX` of
  them and `stderrTail` still the last `STDERR_TAIL_MAX`. The only change is that
  they are fed region text instead of chunk text; by the time `:562-565` reads
  them, every byte has arrived. `tests/unit/dream-brain.test.js:330` pins the
  `>STDOUT_HEAD_MAX` residual and must keep passing untouched.
- **Do not reorder the log.** Per-stream order is a contract (Table W); the
  run-job failure message at `:1120` must still be the last thing in the file,
  which is why the second flush precedes it.
- **Do not add an `'error'` listener to the dream `logStream`, and do not remove
  the run-job one.** The asymmetry is pre-existing, it is recorded under
  "Discovered issues / routed", and closing it is a different package's job.
- **Do not touch `src/core/secret-scan.js`.** If the transform's contract does
  not fit a site, that is a spec bug — say so in the PR rather than widening
  either module.
- **The four probe fixtures keep their boundary mechanism** — a `printf`, then
  `sleep 0.3`, then a second `printf`. Changing it invalidates Table Y's
  declarations.
- No new npm dependencies; both files stay zero-runtime-dependency plain Node.
  The two new declaration files are inert JSON, never executed.
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT expand scope to resolve ambiguity.

### Accepted residuals

1. **A forced cut can still split a secret.** It needs a single logical line, an
   open private-key block, or an unbroken run of binder-terminated lines longer
   than `ScanLimits.STREAM_REGION_MAX` (32768 characters) on one stream. This is
   ADR-0043 decision 5's residual, and it replaces one that fired at every chunk
   boundary. Same-user exposure, unchanged.
2. **The four converted probes are timing-dependent in a way that now fails
   silently rather than loudly.** Before the fix, a fixture whose two writes
   coalesced turned the probe red; after it, the probe passes for the control's
   reason. Table Y's declarations are what detect that, and they run only in the
   opt-in ADR-0042 lane, not in `npm test`.
3. **Cross-stream interleaving in both logs changes and nothing pins it** (Table
   W). No consumer reads it and no test asserts it; the contract row records the
   decision rather than adding a test for a property we do not want to promise.

## Discovered issues / routed

Neither is fixed here and neither widens this WP.

1. **The dream `logStream` has no `'error'` listener** (`src/cli/dream.js:922`,
   ended unawaited at `:958`), while the run-job one does
   (`src/cli/run-job.js:1031-1034`). On the watchdog-timeout path a surviving
   brain-group member still holds the inherited pipe, so a write after
   `logStream.end()` becomes an unhandled `'error'` and takes the process down.
   Pre-existing at the `'data'` handler; this WP writes strictly less often and
   adds no write after the pipe closes.
2. **A multi-byte character split across two chunks already becomes U+FFFD** at
   all four sites (`chunk.toString('utf8')` on a Buffer that may end
   mid-codepoint). A fidelity defect only — every detector rule's alphabet is
   ASCII — and out of scope for this WP and its dependency.

## Security checklist

- [ ] **No byte reaches either log without passing through `redactOnly` as part
      of a region.** Every `logStream.write` in both files takes either an
      `emit(…)` argument or, at `run-job.js:1120`, the existing whole-string
      `redactOnly(…)` call.
- [ ] Each of the four streams has its **own** redactor instance; no instance is
      shared between stdout and stderr or between two children.
- [ ] Every redactor is flushed before the value it feeds is read (Table W's two
      `Flush` rows), so no buffered child output is stranded on any settle path —
      clean exit, non-zero exit, spawn error or watchdog timeout.
- [ ] The buffer is bounded by `ScanLimits.STREAM_REGION_MAX` per instance, so an
      attacker-influenceable child cannot grow Wienerdog's memory (the WP-118
      OOM/DoS surface the old comment named, now answered by the bound).
- [ ] Every converted probe still reads the artifact **from disk**, still drives
      the sink through its public entry point, and never calls `redactOnly` or
      `createStreamRedactor` directly.
- [ ] Neither new declaration file, and no committed artifact other than the two
      test sources and this spec, contains `PROBE`, `PROBE_HEAD` or `PROBE_TAIL`;
      `signal` is a substring of `LEAK_MSG`.
- [ ] Every probe writes into a temp root it creates itself, so nothing
      secret-shaped lands in the repo, in `~/.wienerdog`, or anywhere that
      survives the run.
- [ ] No untrusted identifier flows into a filesystem path or a shell command;
      the log path, its `0600` mode and its `0700` directory are unchanged, and
      `createLogStreamPrivate` is still the only opener.
- [ ] The four compensating controls the old comment named (EP2 whole-file scan,
      EP4 digest scan, WP-126 0600 log modes, no log content in email) are
      untouched and still independent; `tests/unit/scheduler-runjob.test.js:772`
      still passes.
- [ ] Neither corrected comment claims that the owner approved, accepted or
      ratified anything.

## Acceptance criteria

- [ ] **AC1** — None of Table W's three `W<n> CURRENT` blocks survives anywhere
      under `src/`, and the only `redactOnly(` call remaining in
      `src/core/dream/brain.js` and `src/cli/run-job.js` is the one at
      `run-job.js:1120`.
- [ ] **AC2** — Each of the four streams is fed by its own
      `createStreamRedactor()` instance; each redactor is flushed on its stream's
      `'end'` event and again at Table W's second flush point; a flush that has
      nothing buffered writes nothing.
- [ ] **AC3** — Each of Table X's four rows exists under its `New test name` with
      its `New assertion` verbatim; none of the four `Old test name` strings
      survives anywhere in the repo except this spec and the predecessor's
      shipped text; `DEFECT_MSG` no longer appears in either test file.
- [ ] **AC4** — Table Y's two declaration files exist with exactly the rows that
      table assigns them, and the bare unfiltered `npm run red-proofs` reports
      `PROVEN` for this WP's criterion and exits 0.
- [ ] **AC5** — Per-stream order and the accumulators hold, proven by a new test
      in `tests/unit/dream-brain.test.js`: a brain writing several lines across
      forced chunk boundaries, at least one of them split mid-line, produces a
      log whose content equals `redactOnly` applied to the whole output when that
      output contains no secret, in input order with nothing duplicated or
      dropped; and `result.stderrTail` still ends with the last bytes written.
- [ ] **AC6** — Neither sentence of Table V survives in its file, and each
      replacement says what Table V's last column requires, including the
      `ScanLimits.STREAM_REGION_MAX` bound and the ADR-0043 citation.
- [ ] **AC7** — `docs/specs/done/WP-secret-sink-wiring-probes.md` gained exactly
      Table Z's block at Table Z's anchor, and `git diff --numstat` reports
      **zero deleted lines** for that file.
- [ ] **AC8** — `npm test` passes and exits 0. Specifically: the four converted
      probes pass; their five controls (P7, P10, P12, P14, P16) pass unchanged;
      and `tests/unit/dream-brain.test.js:227`, `:287`–`:342` and `:345`,
      `tests/unit/scheduler-runjob.test.js:772`, `:796` and `:2059`, and
      `tests/integration/dream.test.js:1328` pass **without being edited**.
- [ ] **AC9** — `npm run lint` passes.
- [ ] **AC10** — No file outside the seven in Deliverables is modified,
      **except** this spec file (status flip), `package-lock.json`,
      `memory/lessons/inbox.md` and `docs/specs/logbook/`.
- [ ] **AC11** — Idempotency: `N/A — this WP rewires four in-process stream
      handlers. It ships no command and writes nothing outside the repo.`

## Verification steps (run these; paste output in the PR)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

need() { # need <actual> <expected> <what>
  [ "$1" -eq "$2" ] || { echo "GATE FAIL: $3 — got $1, expected $2"; exit 1; }
  echo "ok: $3 = $1"
}

# AC1 — the per-chunk call is gone from both files, and exactly one redactOnly
# call remains (run-job.js:1120). `test -f` first: a counted grep over a MISSING
# file reads greenest exactly where the work was never done.
test -f src/core/dream/brain.js && test -f src/cli/run-job.js
need "$(grep -cF "redactOnly(chunk.toString('utf8'))" src/core/dream/brain.js || true)" 0 "no per-chunk call in brain.js"
need "$(grep -cF "redactOnly(chunk.toString('utf8'))" src/cli/run-job.js    || true)" 0 "no per-chunk call in run-job.js"
need "$(grep -c  'redactOnly('                        src/core/dream/brain.js || true)" 0 "no redactOnly call left in brain.js"
need "$(grep -c  'redactOnly('                        src/cli/run-job.js    || true)" 1 "exactly one redactOnly call in run-job.js (the :1120 failure message)"
need "$(grep -cF 'wienerdog: job failed to run: '     src/cli/run-job.js    || true)" 1 "the surviving call is the failure message"

# AC2 — four redactor instances, four 'end' flushes, and the two second flushes.
need "$(grep -c 'createStreamRedactor()' src/core/dream/brain.js || true)" 2 "two redactors in brain.js"
need "$(grep -c 'createStreamRedactor()' src/cli/run-job.js      || true)" 2 "two redactors in run-job.js"
need "$(grep -c "on('end'" src/core/dream/brain.js || true)" 2 "two 'end' flushes in brain.js"
need "$(grep -c "on('end'" src/cli/run-job.js      || true)" 2 "two 'end' flushes in run-job.js"

# AC6 — neither Table V sentence survives.
need "$(grep -cF 'may be only partially redacted' src/core/dream/brain.js || true)" 0 "V1 sentence removed"
need "$(grep -cF 'may be partially redacted'      src/cli/run-job.js      || true)" 0 "V2 sentence removed"
need "$(grep -cF 'OWNER-APPROVED 2026-07-17'      src/core/dream/brain.js || true)" 0 "the mis-describing owner attribution removed"
need "$(grep -cF 'STREAM_REGION_MAX'              src/core/dream/brain.js || true)" 1 "V1 replacement names the bound"
need "$(grep -cF 'ADR-0043' src/core/dream/brain.js || true)" 1 "V1 replacement cites ADR-0043"
need "$(grep -cF 'ADR-0043' src/cli/run-job.js    || true)" 1 "V2 replacement cites ADR-0043"

# AC3/AC8 — the four converted probes and their five controls, by exact name.
TAP="$(mktemp)"
for f in dream-brain scheduler-runjob; do
  node --test --test-reporter=tap "tests/unit/$f.test.js" >>"$TAP" 2>&1 || true
done
while IFS= read -r n; do
  LINE="$(grep -F -- "- $n" "$TAP" || true)"
  need "$(printf '%s\n' "$LINE" | grep -c . || true)" 1 "probe present exactly once: $n"
  need "$(printf '%s\n' "$LINE" | grep -c '^not ok' || true)" 0 "probe passes: $n"
done <<'NAMES'
sink-probe: brain — a labelled secret straddling two stdout chunks is redacted in the brain log
sink-probe: brain — a labelled secret straddling two stderr chunks is redacted in the brain log
sink-probe: routine-log — a labelled secret straddling two stdout chunks is redacted in the job log
sink-probe: routine-log — a labelled secret straddling two stderr chunks is redacted in the job log
sink-probe: brain — a labelled secret in one stdout chunk is redacted in the brain log
sink-probe: brain — a labelled secret in one stderr chunk is redacted in the brain log
sink-probe: routine-log — a labelled secret in one stdout chunk is redacted in the job log
sink-probe: routine-log — a labelled secret in one stderr chunk is redacted in the job log
sink-probe: routine-log — a labelled secret in a job failure message is redacted in the job log
NAMES
need "$(grep -cE '^not ok ' "$TAP" || true)" 0 "failing tests in the two files"
need "$(grep -rcF 'KNOWN DEFECT WD-SINK-CHUNK-' tests/ src/ | grep -v ':0$' | wc -l | tr -d ' ')" 0 "old chunk-defect probe names gone from tests/ and src/"
need "$(grep -cF 'DEFECT_MSG' tests/unit/dream-brain.test.js tests/unit/scheduler-runjob.test.js | grep -v ':0$' | wc -l | tr -d ' ')" 0 "DEFECT_MSG removed from both files"
for id in WD-SINK-CHUNK-BRAIN-STDOUT WD-SINK-CHUNK-BRAIN-STDERR WD-SINK-CHUNK-RUNJOB-STDOUT WD-SINK-CHUNK-RUNJOB-STDERR; do
  need "$(grep -rcF "LEAK_MSG('$id')" tests/unit/ | grep -v ':0$' | wc -l | tr -d ' ')" 1 "$id kept as a regression id"
done

# AC8 — the untouched tests really are untouched.
need "$(git diff --unified=0 main... -- tests/unit/dream-brain.test.js tests/unit/scheduler-runjob.test.js \
        tests/integration/dream.test.js | grep -cE '^[-+].*(OPENAI_API_KEY=|sawUnknownCommand|legacy line|raw log tail)' || true)" 0 \
     "no edit to the pinned pre-existing assertions"

# AC7 — the predecessor's record gained the block and lost nothing.
need "$(git diff --numstat main... -- docs/specs/done/WP-secret-sink-wiring-probes.md | awk '{print $2}' || true)" 0 \
     "zero deleted lines in the predecessor's Done record"
need "$(grep -cF 'Post-fix record, 2026-09-18 — all seven KNOWN DEFECTS are CLOSED' docs/specs/done/WP-secret-sink-wiring-probes.md || true)" 1 \
     "Table Z block inserted once"

# AC4 — the two declaration files: present, shaped, mirroring Table X, no probe bytes.
node - <<'JS'
const fs = require("node:fs");
const NAMES = {
  "brain-stdout-per-chunk": "sink-probe: brain — a labelled secret straddling two stdout chunks is redacted in the brain log",
  "brain-stderr-per-chunk": "sink-probe: brain — a labelled secret straddling two stderr chunks is redacted in the brain log",
  "runjob-stdout-per-chunk": "sink-probe: routine-log — a labelled secret straddling two stdout chunks is redacted in the job log",
  "runjob-stderr-per-chunk": "sink-probe: routine-log — a labelled secret straddling two stderr chunks is redacted in the job log",
};
const want = {
  "secret-sink-chunk-fix-dream-brain": { suite: "tests/unit/dream-brain.test.js", file: "src/core/dream/brain.js" },
  "secret-sink-chunk-fix-scheduler-runjob": { suite: "tests/unit/scheduler-runjob.test.js", file: "src/cli/run-job.js" },
};
let bad = 0, seen = 0;
for (const [name, w] of Object.entries(want)) {
  const p = `tests/red-proofs/${name}.proofs.json`;
  if (!fs.existsSync(p)) { console.log(`GATE FAIL: missing ${p}`); bad++; continue; }
  const raw = fs.readFileSync(p, "utf8");
  if (raw.includes("sk-ant-")) { console.log(`GATE FAIL: ${p} carries probe bytes`); bad++; }
  const d = JSON.parse(raw);
  if (d.suite !== w.suite) { console.log(`GATE FAIL: ${p} suite ${d.suite}`); bad++; }
  if (!Array.isArray(d.proofs) || d.proofs.length !== 2) { console.log(`GATE FAIL: ${p} expected 2 proofs`); bad++; }
  for (const pr of d.proofs || []) {
    seen++;
    if (pr.wp !== "WP-secret-sink-chunk-fix") { console.log(`GATE FAIL: ${pr.id} wp=${pr.wp}`); bad++; }
    if (pr.file !== w.file) { console.log(`GATE FAIL: ${pr.id} file=${pr.file}`); bad++; }
    if (pr.replace === pr.find) { console.log(`GATE FAIL: ${pr.id} replace === find`); bad++; }
    if (!pr.replace.includes(pr.marker)) { console.log(`GATE FAIL: ${pr.id} replace lacks marker`); bad++; }
    if (!(pr.id in NAMES)) { console.log(`GATE FAIL: ${pr.id} is not a Table Y id`); bad++; }
    else if (pr.expectRed[0].test[0] !== NAMES[pr.id]) { console.log(`GATE FAIL: ${pr.id} expectRed name is not Table X verbatim`); bad++; }
    if (!fs.readFileSync(pr.file, "utf8").includes(pr.find)) { console.log(`GATE FAIL: ${pr.id} find does not occur in ${pr.file}`); bad++; }
  }
}
if (seen !== 4) { console.log(`GATE FAIL: ${seen} proofs across the two files, expected 4`); bad++; }
console.log(bad ? "" : "ok: 4 proofs across 2 files, all mirroring Table X");
process.exit(bad ? 1 : 0);
JS

# AC10 — permission boundary.
need "$(git diff --name-only main... | grep -cvE '^(src/core/dream/brain\.js|src/cli/run-job\.js|tests/unit/(dream-brain|scheduler-runjob)\.test\.js|tests/red-proofs/secret-sink-chunk-fix-(dream-brain|scheduler-runjob)\.proofs\.json|docs/specs/done/WP-secret-sink-wiring-probes\.md|docs/specs/WP-secret-sink-chunk-fix\.md|docs/specs/logbook/.+\.md|package-lock\.json|memory/lessons/inbox\.md)$' || true)" 0 \
     "files outside the permission boundary"

npm run red-proofs    # AC4 — the bare unfiltered run; must exit 0
npm test              # AC5, AC8
npm run lint          # AC9
echo "ALL GATES PASSED"
```

Both-sides evidence, per `docs/runbooks/spec-authoring.md`, is required for every
check above and pasted into the PR. Y1–Y4 supply it mechanically for the four
converted probes. For AC5's new ordering test and every grep added here, observe
and paste all three states: **absent** (the file or construct missing → red),
**compliant** (→ green) and **violating** (→ red). The `grep -c 'redactOnly('`
census in particular must be shown red against a tree where one per-chunk call
was restored.

## Out of scope (do NOT do these)

- Any change to `src/core/secret-scan.js`, including `createStreamRedactor`,
  `ScanLimits.STREAM_REGION_MAX`, the rule list or the entropy pass.
- Fixing, touching or renaming the three truncation sites or probes P2, P4, P6 —
  `WP-secret-sink-redact-before-truncate` owns them.
- Changing `src/cli/run-job.js:1120` (site S9) or probe P16.
- Adding an `'error'` listener to the dream `logStream`, awaiting
  `logStream.end()` in `src/cli/dream.js`, or otherwise touching
  `src/cli/dream.js` at all.
- Fixing the multi-byte-split defect under "Discovered issues / routed".
- Changing the four probe fixtures' boundary mechanism, their feeds, or the
  `safeOf` invariant.
- Editing any line of `docs/specs/done/WP-secret-sink-wiring-probes.md` other
  than inserting Table Z's block — including Table P's `Status` cells, Table S's
  `Pattern` cells and the 2026-09-17 errata.
- Adding a test that pins cross-stream interleaving, or a `Transform` stream, or
  a shared helper module across `brain.js` and `run-job.js`.
- Changing `docs/GLOSSARY.md`, `docs/HANDOVER.md` or `docs/specs/MILESTONES.md`.

## Dispatch precondition — owner items

One item. **It was not ruled on directly.** It is **a recommendation adopted
under standing authorization, not a direct ruling** — the standing process is
recorded in `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`
("Owner items inside those packages"), carried forward from
`2026-09-05-owner-rulings-git-env-pinning-queue.md`: the architect records a
recommendation with the cost of overruling it, the session may dispatch under it,
and **the owner reverses it by dated amendment.** Nothing in this repo records
the owner approving, accepting or ratifying it, and this spec asserts no such
acceptance. `WP-secret-stream-safe-cut-redactor` carries the companion item on
ADR-0043's own standing-authorization status; it is not restated here.

1. **May a `done/` spec's record be annotated after merge?**
   *Recommendation: yes, by insertion only.* The predecessor's four converted
   probes carry a failure message instructing the fixer to *"move its row in
   Table P to Status CORRECT"*, and Table P lives in a `done/` file. A reader who
   follows that instruction and finds Table P still saying DEFECT has been sent
   to a stale surface. Table Z answers it with one dated pointer block and **zero
   deletions**, so the record of what shipped stays byte-intact.
   *Cost of overruling toward "never touch a `done/` file":* the seven defect ids
   keep pointing at a table that contradicts the code, and the only correction
   lives in a logbook entry that nothing links to from the probe's own failure
   message.

## Definition of done

1. **DISPATCH PRECONDITION.** (a) The owner item above travels with this package
   as a **recommendation adopted under standing authorization**; a reversal is
   applied by a committed revision of this spec, never by a dispatch message,
   because `scripts/boundary-check.js` reads the Deliverables table in this file.
   (b) The design gate is closed per `docs/runbooks/codex-review.md`.
   (c) **BOTH DEPENDENCIES MUST BE `Done`** — `createStreamRedactor` and
   `ScanLimits.STREAM_REGION_MAX` do not exist without
   `WP-secret-stream-safe-cut-redactor`, and Table Z's "all seven" claim is false
   without `WP-secret-sink-redact-before-truncate`.
   (d) **THE DISPATCHER RE-DERIVES EVERY CITATION.** They are pinned to `main` at
   **`08de2bc3`** plus the two dependencies. `src/core/dream/brain.js`,
   `src/cli/run-job.js`, `tests/unit/dream-brain.test.js` and
   `tests/unit/scheduler-runjob.test.js` are files sibling packages land in, so
   Table W's `W<n> CURRENT` blocks and Table V's `V<n> REMOVE` blocks must be re-confirmed
   by grepping for the construct, not by the number. Re-derive into a committed
   revision of this spec, never into a dispatch message.
   (e) Branch `wp/secret-sink-chunk-fix`.
2. All verification steps pass locally; output pasted into the PR body, including
   the bare unfiltered `npm run red-proofs`, `npm test` and `npm run lint`, and
   the both-sides evidence named above.
3. Conventional commits; PR titled
   `fix(secret-scan): redact stream output across chunk boundaries at the four durable-log sinks (WP-secret-sink-chunk-fix)`.
4. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. "Discovered issues" repeats both routed items above. The body
   states plainly that all four `WD-SINK-CHUNK-*` defects are closed, names
   Accepted residual 1 (a forced cut can still split a secret in a single line
   longer than 32768 characters), and does **not** claim any owner approval of
   ADR-0043.
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.

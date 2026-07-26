---
id: WP-secret-sink-wiring-probes
title: Pin what each durable-output sink actually does with a labelled secret
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0024]
epic: secret-lifecycle
---

# WP-secret-sink-wiring-probes: characterization tests for the five `redactOnly` sinks

> **This WP is DIAGNOSTIC. It fixes nothing.**
> It writes tests that make the current behaviour of five durable-output sinks
> visible in the suite. Four of those sinks have real defects; **this WP closes
> none of them** and changes no shipped behaviour. Nothing here makes any byte
> safer. Merging it must never be cited as evidence that the sinks are sound —
> in particular, `WP-secret-fence-shape-and-context` deliberately does **not**
> depend on this WP, because a dependency that implies protection it does not
> provide is worse than no dependency.
>
> **A green suite after this WP means the seven known defects are still open.**
> That is a real cost of the design and it is disclosed under "Accepted
> residuals" rather than papered over.

## Context (read this, nothing else)

Wienerdog has **one** shared secret detector, `src/core/secret-scan.js` (audit
A5, ADR-0024). It exports two entry points:

- `scanAndRedact(text) -> { text, findings }` — sanitized copy plus
  metadata-only findings (`{label, severity, count}`; the matched bytes are never
  stored on a finding).
- `redactOnly(text) -> string` — back-compat wrapper, defined as
  `scanAndRedact(text).text`.

Two **gates** consume `findings` and withhold a whole artifact when
`findings.length > 0`: ADR-0024's **EP2 staged-output gate**
(`src/core/dream/validate.js:934`, reverts a staged vault note) and **EP4**
(`src/core/digest.js:506,521,543`, omits a digest section). Those two are well
covered by tests.

The other **five** consumers do not gate on findings at all. They pipe bytes
through `redactOnly` on their way to a file on the user's disk. Table P is
canonical for this list; the column below is a mirror of it.

| Sink | Module and `redactOnly` call sites | Artifact on disk | Lifetime |
|------|-----------------------------------|------------------|----------|
| alerts | `src/core/alerts.js:47` (`sanitizeAlert`'s `scrub`) | `~/.wienerdog/state/alerts.jsonl` | durable |
| run evidence | `src/core/run-evidence.js:64` (`sanitizeArgv`, per argv element) **and** `:78` (`sanitizeRecord`'s `scrub`, per scalar field) | `~/.wienerdog/state/run-evidence.jsonl` | durable |
| transcript extracts | `src/core/transcripts/index.js:67` (inside `capMessage`) | `~/.wienerdog/state/dream-scratch/<harness>-<session_id>.json`, written by `collectExtracts` at `src/core/dream/scratch.js:215` | **transient** — see below |
| brain logs | `src/core/dream/brain.js:287` (**stderr** handler) **and** `:315` (**stdout** handler) | `~/.wienerdog/logs/dream/<YYYY-MM-DD>.log` | durable |
| routine logs | `src/cli/run-job.js:867` (**stdout** handler) **and** `:872` (**stderr** handler) | `~/.wienerdog/logs/<job>/<YYYY-MM-DD>.log` | durable |

**Eight call sites, not five.** Round-2 review found that an earlier draft probed
one path per module and then attached a module-wide defect id to it. That is
worse than not probing: a fix to `brain.js`'s stdout handler alone would make the
probe pass and invite removal of a marker while split-boundary credentials still
leaked through the stderr handler four lines away. Every probe in Table P is
therefore scoped to **one call site**, and every defect id names **one call
site**.

**The transcript artifact is transient, and the spec says so.** `collectExtracts`
writes the scratch JSON to disk, but `src/cli/dream.js:595` calls
`cleanScratch(paths.state)` inside a `finally` block, and `cleanScratch`
(`src/core/dream/scratch.js:245`) is `fs.rmSync(scratchDirOf(stateDir),
{recursive: true, force: true})`. So the file exists on disk during the run and
is removed at teardown. Probe P9 therefore proves **transient on-disk staging**,
not a retained artifact. An earlier draft claimed all five artifacts outlive the
run; that claim was false for this one and has been withdrawn. The probe is still
worth having — bytes on disk are bytes on disk, and a crash between the write and
the `finally` leaves them there — but it must not be described as durable.

Reading the call sites shows two preprocessing patterns that defeat the helper
regardless of how good the detector is:

1. **Truncate-then-redact**, at three sites. `alerts.js:47` is
   `redactOnly(String(v ?? '').slice(0, MAX_FIELD_CHARS))` with
   `MAX_FIELD_CHARS = 2000` (`alerts.js:28`); `run-evidence.js:64` is
   `redactOnly(a.slice(0, 2000))` on each argv element; `run-evidence.js:78` is a
   separate `redactOnly(String(v == null ? '' : v).slice(0, 2000))` on each scalar
   field. The value is cut **before** the scan, so a credential straddling the cut
   loses the tail its rule needs and the surviving head is written raw.
2. **Per-chunk redaction of a stream**, at four sites. `brain.js:287,315` and
   `run-job.js:867,872` each call `redactOnly(chunk.toString('utf8'))` once per
   stream chunk, on stdout and stderr independently. A credential that straddles
   a chunk boundary is never seen whole by any call, and both halves are written
   raw.

The transcript sink is the one that gets the order right — `capMessage` redacts
**before** applying the per-message char cap
(`src/core/transcripts/index.js:60-70`) — which is exactly why it is worth
pinning: it is the counter-example that shows the other four are a choice, not a
constraint.

**How the seven defects are recorded.** Two earlier designs were wrong and both
are recorded so neither is re-proposed:

- *"Assert the observed result."* That makes green CI mean "the leak is still
  there" **and** is not an assertion at all — it pins nothing.
- *Node's `{ todo: '<id>' }` expected-failure marker.* Verified directly on
  Node v25.9.0: a `todo` test that **unexpectedly passes** is reported as
  `ok N - <name> # TODO <id>`, counted under `# todo`, and the process **exits
  0**. `# pass 1 # fail 0 # todo 2` with exit code 0 for a file containing one
  passing todo, one failing todo and one plain test. So the claim that "a probe
  which starts passing will fail the ongoing gate" was **false** for `npm test`;
  the only check that caught it lived in this WP's one-time verification block,
  which nobody reruns. `npm test` is `node tests/run.js`, which spawns
  `node --test` with `stdio: 'inherit'` and exits on its status, so no
  repository-level TAP inspection exists to bolt an unexpected-pass check onto
  without rewriting the shared test entry point — which is out of scope for a
  diagnostic S-sized WP.

**What this WP does instead.** No `todo` markers anywhere. Each defect probe is a
plain test whose assertion is `safe === false`, with a failure message naming the
defect id and telling the reader what to do. It therefore **genuinely exits
non-zero the moment a sink is fixed**, which is the behaviour the earlier design
only claimed. The price — green means "still leaking" — is paid explicitly: every
defect probe's name ends in `(KNOWN DEFECT <id>)`, so the suite output names the
defect on every run.

Why a labelled secret and not a high-entropy blob: the labelled rules
(`sk-ant-…`, `AKIA…`, private-key blocks, and 15 more) are **unchanged** by any
current or planned work, so a labelled probe isolates the *wiring* question — "do
these bytes reach the helper at all?" — from any question about detector tuning.
The probe string below is additionally shaped so that **no half and no truncated
prefix of it trips any other rule**, under either the shipped detector or the one
proposed in `WP-secret-fence-shape-and-context`. That isolation is load-bearing:
it is what keeps these probes' outcomes independent of that WP, and it was
re-verified against both detectors on 2026-07-25.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP adds tests only. It
starts no process and changes no shipped behaviour.

## Current state

- `src/core/secret-scan.js` — the shared detector. **Not modified by this WP.**
- The five sink modules listed above. **None is modified by this WP.** Their
  public entry points are `appendAlert(paths, record)` (`alerts.js`),
  `recordRunEvidence(paths, rec)` (`run-evidence.js`),
  `collectExtracts(paths, ledger, maxInputBytes)` (`dream/scratch.js`),
  `spawnBrain(...)` (`dream/brain.js`) and `runJob(...)` (`cli/run-job.js`).
- `tests/unit/alerts.test.js`, `tests/unit/run-evidence.test.js`,
  `tests/unit/dream-brain.test.js`, `tests/unit/scheduler-runjob.test.js` —
  existing test files for four of the five modules. Each already builds whatever
  temp directory / fixture its module needs; **reuse the file's existing setup
  helpers**, do not invent new ones.
- `tests/unit/dream-collect.test.js` — the test file for the transcript sink's
  real on-disk path. It already has `tempPaths()` (line 18, `mkdtemp` +
  `getPaths`), `emptyLedger()` (line 30) and `writeClaude(paths, sessionId,
  msgCount, msgLen, when)` (line 36), and ~20 existing `collectExtracts` tests.
  `writeClaude` hardcodes its message body as `'x'.repeat(msgLen)`, so probe P9
  writes its own one-line JSONL fixture inline — see Table P. **Do not modify
  `writeClaude`.**
- `tests/unit/transcripts.test.js` — **not touched by this WP.** An earlier draft
  put the transcript probe here, driving the `parse`/`extract` function and
  calling its return value an artifact. It is not one: nothing on that path
  writes to disk. The disk write happens in `collectExtracts`.
- `npm test` is `node tests/run.js`; `npm run lint` is `node scripts/lint.js`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/alerts.test.js | add exactly the **2** probes named `sink-probe: alerts …` in Table P |
| modify | tests/unit/run-evidence.test.js | add exactly the **4** probes named `sink-probe: run-evidence …` in Table P — two per call site |
| modify | tests/unit/dream-collect.test.js | add exactly the **1** probe named `sink-probe: transcripts …` in Table P |
| modify | tests/unit/dream-brain.test.js | add exactly the **4** probes named `sink-probe: brain …` in Table P — two per stream |
| modify | tests/unit/scheduler-runjob.test.js | add exactly the **4** probes named `sink-probe: routine-log …` in Table P — two per stream |

Add nothing else to those files. Do not edit any existing test.

Per `docs/specs/_TEMPLATE.md` lines 30-31, this spec file and
`package-lock.json` are exempt from every Deliverables table and are therefore
not listed here, while remaining permitted in the verification whitelist below.

### Exact contracts

Every probe uses this one literal credential, and nothing else:

```js
// A labelled-rule match: the `anthropic-key` rule is
// /sk-ant-[A-Za-z0-9\-_]{20,}/g -> [REDACTED:anthropic-key], severity redact.
// 48 characters. Shaped so that PROBE_HEAD and PROBE_TAIL each trip NO rule:
// PROBE_HEAD has only 17 characters after `sk-ant-` (the rule needs 20), and
// every delimiter-separated segment of both halves is word-shaped, so the
// entropy pass suppresses them under the shipped detector and under the one
// proposed in WP-secret-fence-shape-and-context. Verified against both,
// 2026-07-25: scanAndRedact(PROBE_HEAD).text === PROBE_HEAD and
// scanAndRedact(PROBE_TAIL).text === PROBE_TAIL under each.
const PROBE = 'sk-ant-api03-PROBE-aaaa-bbbb-cccc-dddd-eeee-ffff';
const PROBE_HEAD = PROBE.slice(0, 24); // 'sk-ant-api03-PROBE-aaaa-'
const PROBE_TAIL = PROBE.slice(24); //    'bbbb-cccc-dddd-eeee-ffff'
const MARKER = '[REDACTED:anthropic-key]';
```

**Every probe computes the same safe invariant** against the artifact the sink
writes:

```js
// `artifact` is the file's text, read from disk after the sink ran.
const safe = artifact.includes(MARKER) && !artifact.includes(PROBE_HEAD);
```

`!artifact.includes(PROBE)` on its own is **vacuous** for the truncation probes —
truncation removes the probe's tail whether or not anything scanned it — so the
invariant is written in terms of `PROBE_HEAD`, the exact 24 characters that do
survive, and of `MARKER`, whose presence is the only positive evidence that
`redactOnly` saw the value.

The **eight safe probes** assert it holds:

```js
assert.equal(safe, true, artifact);
```

The **seven defect probes** assert it does not, and say why:

```js
assert.equal(
  safe,
  false,
  'WD-SINK-…: this probe pins a KNOWN-OPEN defect and it now appears FIXED. ' +
    'Do not delete this test to make the suite green. Convert it to the safe ' +
    'form (assert.equal(safe, true, artifact)), move its row in Table P out of ' +
    'the defect column, and say so in the PR.',
);
```

No probe uses `{ todo: … }`, `t.skip`, `t.todo` or any other soft marker. All
fifteen are plain tests, all fifteen pass today, and any sink fix turns exactly
one of them red with the message above.

Each probe drives the sink through its **public entry point** (never by calling
`redactOnly` or `scanAndRedact` directly) and reads the **artifact from disk**.

## Contract reference

Activation (ADR-0031, 2 of 7): (v) the task crosses an authority boundary — the
detector emits sanitized bytes but five other modules own the artifacts those
bytes land in; (vi) multiple downstream consumers inherit the contract.
Canonical table: **P**.

### Table P — canonical: the probes

Feed shapes:

- `WHOLE` — `PROBE` is supplied as a single value / single chunk.
- `STRADDLE-TRUNCATE` — the value is `'F'.repeat(2000 - 24) + PROBE`, so that
  after the sink's own `slice(0, 2000)` exactly `PROBE_HEAD` survives. Verified
  against both detectors: the truncated text contains `PROBE_HEAD` and does not
  contain `MARKER`.
- `STRADDLE-CHUNK` — `PROBE_HEAD` and `PROBE_TAIL` are written as two consecutive
  stream chunks on the **same** stream.

Every row computes the identical `safe` expression from "Exact contracts". The
`Defect id` column is the only thing that differs: a row with one asserts
`safe === false`, a row without asserts `safe === true`.

| # | Test name (exact) | Call site probed | Entry point | Feed | Defect id | What its failure would demonstrate |
|---|-------------------|------------------|-------------|------|-----------|-------------------------------------|
| P1 | `sink-probe: alerts — a labelled secret in an alert field is redacted in alerts.jsonl` | `alerts.js:47` | `appendAlert(paths, record)` | WHOLE, in the `reason` field | — | — |
| P2 | `sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is NOT redacted in alerts.jsonl (KNOWN DEFECT WD-SINK-TRUNC-ALERTS)` | `alerts.js:47` | same | STRADDLE-TRUNCATE, in the `reason` field | `WD-SINK-TRUNC-ALERTS` | `sanitizeAlert`'s `scrub` slices to `MAX_FIELD_CHARS` **before** `redactOnly`, so `PROBE_HEAD` — 24 characters of the credential — reaches `alerts.jsonl` verbatim and `MARKER` never appears |
| P3 | `sink-probe: run-evidence — a labelled secret in an argv entry is redacted in run-evidence.jsonl` | `run-evidence.js:64` | `recordRunEvidence(paths, rec)` with the probe as one `argv` element | WHOLE | — | — |
| P4 | `sink-probe: run-evidence — a labelled secret straddling the argv cap is NOT redacted in run-evidence.jsonl (KNOWN DEFECT WD-SINK-TRUNC-RUNEV-ARGV)` | `run-evidence.js:64` | same | STRADDLE-TRUNCATE, as one `argv` element | `WD-SINK-TRUNC-RUNEV-ARGV` | `sanitizeArgv` slices each element to 2000 **before** `redactOnly`; same consequence as P2 |
| P5 | `sink-probe: run-evidence — a labelled secret in a scalar field is redacted in run-evidence.jsonl` | `run-evidence.js:78` | `recordRunEvidence(paths, rec)` with the probe as the `job` field | WHOLE | — | — |
| P6 | `sink-probe: run-evidence — a labelled secret straddling the scalar-field cap is NOT redacted in run-evidence.jsonl (KNOWN DEFECT WD-SINK-TRUNC-RUNEV-FIELD)` | `run-evidence.js:78` | same | STRADDLE-TRUNCATE, as the `job` field | `WD-SINK-TRUNC-RUNEV-FIELD` | `sanitizeRecord`'s `scrub` is a **separate** truncate-then-redact from `sanitizeArgv`'s. Fixing the argv path alone would leave this one open, which is why it has its own id |
| P7 | `sink-probe: brain — a labelled secret in one stdout chunk is redacted in the brain log` | `brain.js:315` | `spawnBrain`, child stdout stubbed | WHOLE in one chunk | — | — |
| P8 | `sink-probe: brain — a labelled secret straddling two stdout chunks is NOT redacted in the brain log (KNOWN DEFECT WD-SINK-CHUNK-BRAIN-STDOUT)` | `brain.js:315` | same | STRADDLE-CHUNK on stdout | `WD-SINK-CHUNK-BRAIN-STDOUT` | the stdout handler redacts per chunk, so neither half matches; `PROBE_HEAD` then `PROBE_TAIL` both land in `logs/dream/<date>.log` in order and the credential is trivially reconstructible |
| P9 | `sink-probe: transcripts — a labelled secret in a transcript reaches dream-scratch redacted` | `transcripts/index.js:67` | `collectExtracts(paths, ledger, maxInputBytes)`, driven with this file's `tempPaths()` and `emptyLedger()` | WHOLE, as the `message.content` of a one-line JSONL fixture written inline (mirror `writeClaude`'s record shape but with `content: 'boom ' + PROBE`) | — | — |
| P10 | `sink-probe: brain — a labelled secret in one stderr chunk is redacted in the brain log` | `brain.js:287` | `spawnBrain`, child stderr stubbed | WHOLE in one chunk | — | — |
| P11 | `sink-probe: brain — a labelled secret straddling two stderr chunks is NOT redacted in the brain log (KNOWN DEFECT WD-SINK-CHUNK-BRAIN-STDERR)` | `brain.js:287` | same | STRADDLE-CHUNK on stderr | `WD-SINK-CHUNK-BRAIN-STDERR` | a **separate handler** from P8's, four lines earlier in the file. A stdout-only fix leaves this open |
| P12 | `sink-probe: routine-log — a labelled secret in one stdout chunk is redacted in the job log` | `run-job.js:867` | `runJob`, child stdout stubbed | WHOLE in one chunk | — | — |
| P13 | `sink-probe: routine-log — a labelled secret straddling two stdout chunks is NOT redacted in the job log (KNOWN DEFECT WD-SINK-CHUNK-RUNJOB-STDOUT)` | `run-job.js:867` | same | STRADDLE-CHUNK on stdout | `WD-SINK-CHUNK-RUNJOB-STDOUT` | per-chunk redaction; same consequence as P8 |
| P14 | `sink-probe: routine-log — a labelled secret in one stderr chunk is redacted in the job log` | `run-job.js:872` | `runJob`, child stderr stubbed | WHOLE in one chunk | — | — |
| P15 | `sink-probe: routine-log — a labelled secret straddling two stderr chunks is NOT redacted in the job log (KNOWN DEFECT WD-SINK-CHUNK-RUNJOB-STDERR)` | `run-job.js:872` | same | STRADDLE-CHUNK on stderr | `WD-SINK-CHUNK-RUNJOB-STDERR` | a **separate handler** from P13's |

**Fifteen probes across five files: eight safe (P1, P3, P5, P7, P9, P10, P12,
P14) and seven defect (P2, P4, P6, P8, P11, P13, P15).** Every one of the eight
`redactOnly` call sites in the five sinks is exercised by at least one probe, and
every defect id names exactly one call site.

P9's artifact is the scratch file: after `collectExtracts` returns, read the
single `*.json` under `path.join(paths.state, 'dream-scratch')` and assert against
its whole text. `collectExtracts` returns the written paths in its `wrote` array;
using that array to locate the file is fine — the assertion must still be made
against the **file's contents on disk**, never against the returned object. P9 is
the one probe whose artifact does **not** outlive the run (see Context); it proves
transient on-disk staging.

If a sink's entry point cannot be driven from its existing test file without
adding a new harness module, **stop and say so in the PR** — do not build one.

### Mirrored Surface Checklist

Every surface below restates a fact owned by Table P. A review finding updates
Table P **and** every mirror below in one pass; a new mirror found in review is
registered here on the spot.

- [ ] Deliverables-table `Notes` cells (mirror Table P's per-file probe counts: 2 / 4 / 1 / 4 / 4)
- [ ] The `PROBE` / `PROBE_HEAD` / `PROBE_TAIL` / `MARKER` constants, the `safe`
      expression and the two assertion forms under "Exact contracts"
- [ ] Current-state sink table (mirrors Table P's call-site and artifact columns,
      including the eight call sites and the transient lifetime of the scratch file)
- [ ] The Context bullet list of the two preprocessing patterns (must say "three
      sites" and "four sites", matching Table P's defect rows)
- [ ] The Context paragraph on why `{ todo }` was dropped
- [ ] Acceptance criteria (mirror Table P's rows and its 8/7 split)
- [ ] Verification-step counts: 15 total, 15 passing, 0 `# TODO`, 7 defect ids
- [ ] The seven defect ids, each appearing exactly once in Table P, once in the
      gate loop and once in Definition-of-done item 3
- [ ] The `epic` / `depends_on` frontmatter (both WPs are independent)

## Implementation notes & constraints

- **No production code changes.** If a probe shows a sink is wrong, that is the
  point — record it under "Discovered issues" in the PR body and leave it.
- **Do not "fix" a defect probe by weakening it, and do not delete one.** Its
  assertion is the deliverable. If it goes red because a sink was fixed, follow
  the instruction in its own failure message.
- Reuse each test file's existing temp-directory / fixture helpers. Add no new
  helper module and no new fixture file. P9's inline JSONL write is the one
  exception and is specified in Table P.
- For the four STRADDLE-CHUNK probes, the two chunks must be delivered to the
  **same** handler in order (`PROBE_HEAD` first). Emitting them on different
  streams would test nothing, because those are different call sites with
  different defect ids.
- The probe string is a *fake* key shaped to match the `anthropic-key` rule. It
  is not a credential and must never be replaced with a real one.
- No new npm dependencies.
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT expand scope to resolve ambiguity.

### Accepted residuals

Three, all stated rather than mitigated.

1. **A green suite does not mean the sinks are safe — it means the seven defects
   are still open.** This is the unavoidable consequence of using an assertion
   that genuinely fails when a defect is fixed. It is mitigated only by naming:
   every defect probe's test name ends in `(KNOWN DEFECT <id>)`, so `npm test`
   output carries the seven ids on every run, and Definition-of-done item 3
   requires the PR body to list them.
2. **Nothing executably pins the *exact current* leak**, so a change in
   truncation length or chunk size would not be detected as long as some leak
   remains. Pinning today's leak byte-for-byte would require asserting the
   attacker's view, which is worse.
3. **Round-3 review recommended adding this spec file to the Deliverables table
   and removing `package-lock.json` from the verification whitelist. Both are
   declined**, and the reason is a repo convention rather than a judgment call:
   `docs/specs/_TEMPLATE.md` lines 30-31 explicitly exempt the spec file itself
   and `package-lock.json` from every Deliverables table, and the whitelist
   correctly follows that convention.

## Security checklist

- [ ] Every probe reads the **artifact from disk** (the file the sink actually
      writes), not the sink's return value — a sink that redacts its return value
      but writes raw bytes must fail the probe.
- [ ] No probe calls `redactOnly` or `scanAndRedact` directly; that would test
      the helper again instead of the wiring.
- [ ] The safe invariant is computed in its non-vacuous form: `MARKER` present
      **and** `PROBE_HEAD` absent. A probe that only asserts the full `PROBE` is
      absent would pass under truncation without anything having scanned.
- [ ] **Every one of the eight `redactOnly` call sites in the five sinks is
      exercised**, and no defect id covers more than one call site. A fix to one
      handler cannot make another handler's probe pass.
- [ ] No probe uses `{ todo }`, `t.todo` or `t.skip`. A fixed sink turns its
      probe **red**, with exit code non-zero from `npm test`.
- [ ] The probe string never appears in a committed artifact other than the test
      sources.
- [ ] No untrusted identifier flows into a filesystem path or shell command —
      these tests construct their own temp paths.
- [ ] Nothing in this WP is described as fixing, mitigating or reducing any
      defect. All seven remain fully open at merge.

## Acceptance criteria

- [ ] Exactly the fifteen probes of Table P exist, with the exact test names in
      the table's "Test name" column.
- [ ] **All fifteen** compute the identical `safe` expression from "Exact
      contracts" — `artifact.includes(MARKER) && !artifact.includes(PROBE_HEAD)`
      — against the artifact read from disk.
- [ ] P1, P3, P5, P7, P9, P10, P12 and P14 assert `safe === true`.
- [ ] P2, P4, P6, P8, P11, P13 and P15 assert `safe === false`, each with a
      failure message naming its Table P defect id and instructing the reader to
      convert the probe rather than delete it.
- [ ] No probe carries `{ todo: … }` and no `# TODO` appears in the TAP output of
      the five files.
- [ ] All fifteen pass today, and `npm test` exits 0.
- [ ] Every one of the eight `redactOnly` call sites in Table P's second column is
      exercised by at least one probe.
- [ ] No file outside the five in Deliverables is modified, **except** this spec
      file (status flip, per Definition of done item 4) and `package-lock.json`,
      both of which `docs/specs/_TEMPLATE.md` lines 30-31 exempt.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
TAP=$(mktemp)

need() { # need <actual> <expected> <what>
  [ "$1" -eq "$2" ] || { echo "GATE FAIL: $3 — got $1, expected $2"; exit 1; }
  echo "ok: $3 = $1"
}

for f in alerts run-evidence dream-collect dream-brain scheduler-runjob; do
  node --test --test-reporter=tap "tests/unit/$f.test.js" >>"$TAP" 2>&1 || true
done

# 15 probes, all plain, all passing.
need "$(grep -cE '^(not )?ok [0-9]+ - sink-probe: ' "$TAP" || true)" 15 "sink probes present"
need "$(grep -cE '^ok [0-9]+ - sink-probe: '        "$TAP" || true)" 15 "sink probes passing"
need "$(grep -cE '^not ok '                          "$TAP" || true)"  0 "failing tests in the five files"

# No soft markers anywhere. Node reports a PASSING todo as `ok … # TODO`, exit
# code 0, so a todo marker would silently stop gating (round-2 finding P-1).
need "$(grep -cF '# TODO' "$TAP" || true)" 0 "no TODO markers in the five files"
need "$(git diff --unified=0 main... -- tests/unit/ | grep -cE '^\+.*\{ *todo *:' || true)" 0 \
     "no todo option added to any test"

# Each defect id appears exactly once, in a PASSING probe (the defect is open).
for id in WD-SINK-TRUNC-ALERTS WD-SINK-TRUNC-RUNEV-ARGV WD-SINK-TRUNC-RUNEV-FIELD \
          WD-SINK-CHUNK-BRAIN-STDOUT WD-SINK-CHUNK-BRAIN-STDERR \
          WD-SINK-CHUNK-RUNJOB-STDOUT WD-SINK-CHUNK-RUNJOB-STDERR; do
  need "$(grep -cE "^ok [0-9]+ - sink-probe: .*KNOWN DEFECT $id\)\$" "$TAP" || true)" 1 \
       "$id probe present and still red-on-fix"
done

# Every one of the eight call sites is named by exactly one probe's source.
need "$(git diff --unified=0 main... -- tests/unit/ | grep -cE '^\+.*(alerts\.js:47|run-evidence\.js:64|run-evidence\.js:78|brain\.js:287|brain\.js:315|run-job\.js:867|run-job\.js:872|transcripts/index\.js:67)' || true)" 8 \
     "all eight distinct call-site references appear in the added comments"

need "$(git diff --name-only main... | grep -cvE '^(tests/unit/(alerts|run-evidence|dream-collect|dream-brain|scheduler-runjob)\.test\.js|docs/specs/WP-secret-sink-wiring-probes\.md|package-lock\.json)$' || true)" 0 \
     "files outside the permission boundary"

npm test
npm run lint
echo "ALL GATES PASSED"
```

The call-site grep expects **8** distinct references, one per `redactOnly` call
site: `alerts.js:47`; `run-evidence.js:64` and `:78`; `transcripts/index.js:67`;
`brain.js:287` and `:315`; `run-job.js:867` and `:872`. Put each reference in the
comment above the probe it belongs to.

**This gate is not enforced by CI.** It is a script an implementer runs locally
and pastes into the PR body. What *is* continuously enforced is the part that
matters: the fifteen probes are plain tests in files `npm test` already runs, so
a sink fix breaks the suite for everyone, not only for someone who reruns this
block.

## Out of scope (do NOT do these)

- Fixing truncate-then-redact or per-chunk redaction. All seven are real; all are
  separate work. Record them under "Discovered issues".
- Making a defect probe pass-by-construction, deleting one, or weakening its
  assertion.
- Adding `{ todo }`, `t.todo` or `t.skip` to any probe.
- Changing `tests/run.js`, `package.json` or `.github/workflows/` to add a
  repository-level TAP inspection. It would be the right fix for a different WP;
  it is not this one.
- Any change to `src/core/secret-scan.js`, including the high-entropy pass — that
  is `WP-secret-fence-shape-and-context`, which is independent of this WP in both
  directions.
- Any change to the EP2 / EP4 gates or their `findings.length > 0` condition.
- Adding a sixth sink or a new test harness module.
- Modifying `writeClaude` in `tests/unit/dream-collect.test.js`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   the seven `ok … (KNOWN DEFECT WD-SINK-…)` lines.
2. Conventional commits; PR titled
   `test(secret-scan): characterization probes for the eight redactOnly call sites (WP-secret-sink-wiring-probes)`.
3. PR template filled. "Discovered issues" must list all seven defect ids —
   `WD-SINK-TRUNC-ALERTS`, `WD-SINK-TRUNC-RUNEV-ARGV`,
   `WD-SINK-TRUNC-RUNEV-FIELD`, `WD-SINK-CHUNK-BRAIN-STDOUT`,
   `WD-SINK-CHUNK-BRAIN-STDERR`, `WD-SINK-CHUNK-RUNJOB-STDOUT`,
   `WD-SINK-CHUNK-RUNJOB-STDERR` — and state plainly that this WP does not fix
   them and that a green suite means they are all still open.
4. This spec's `status:` flipped to `In-Review` in the same PR.

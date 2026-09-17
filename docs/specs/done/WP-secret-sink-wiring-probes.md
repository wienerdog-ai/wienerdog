---
id: WP-secret-sink-wiring-probes
title: Pin what each durable-output sink actually does with a labelled secret
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0024, ADR-0031, ADR-0042]
epic: secret-lifecycle
---

# WP-secret-sink-wiring-probes: characterization tests for the nine `redactOnly` call sites

> **Errata, 2026-09-17 (post-merge) — two stale spec-prose facts. Neither is a
> defect in what shipped.**
>
> Implemented in PR #261 (merge `c94e0e66`, 2026-09-17), tip `d3d44633`.
> Diagnostic and tests-only: no file under `src/` was touched. Both PR gates
> on that tip: wd-reviewer **APPROVE** with every claim executed
> (boundary-check; the five test files 16/16 probes passing; the
> **UNFILTERED** `npm run red-proofs` → `RUN: PROVEN` with all three ids;
> `npm test` 2799 tests / 0 fail; lint; both-sides replays in a throwaway
> clone — removing `redactOnly` at S1, S4 and S9 each reddened exactly one
> probe, and a simulated buffer-then-redact-once fix at S6 and S7 each
> reddened exactly one defect probe; flakiness 10 runs each on the four chunk
> probes: 40/40 passes); Codex plugin `review` on `gpt-6-astra` clean, no
> findings (it disclosed that runtime tests could not be executed in its
> read-only environment). CI seven checks pass on macOS and Ubuntu.
>
> **Erratum 1 — "holds 16 `*.proofs.json` declaration files today" undercounts:
> 17 at the spec's own pinned base.** *What is wrong:* the Current state bullet
> (~l.167) claims 16 declaration files existed before this WP's two were added.
> *What is true:* **17** files existed at the spec's pinned base `a47f2546`
> (measured: `git ls-tree --name-only a47f2546 tests/red-proofs/ | grep -c
> proofs.json` → 17), so the count is **17 before this package, 19 after**, not
> 16/18. *Found:* wd-reviewer, PR #261 gate. *Routing:* corrected in place below
> and recorded here. **Class: a stale count nothing depends on — no gate reads
> it.**
>
> **Erratum 2 — Table P row P2's descriptive artifact cell shows a placeholder
> `log_hint`, not the mandated helper's actual value.** *What is wrong:* the
> cell (~l.411) ends `…"log_hint":"h"}`. *What is true:* the spec's own
> mandated `rec()` helper (`tests/unit/alerts.test.js:31`) writes `log_hint:
> `~/.wienerdog/logs/${job}/`` — for P2's `rec('dream', …)` call that is
> `log_hint: '~/.wienerdog/logs/dream/'`. *Found:* wd-reviewer, PR #261 gate.
> *Routing:* corrected in place below and recorded here. **Class: a descriptive
> example cell no assertion reads.**
>
> **Recorded, not errata:** (i) **ALL SEVEN defect ids are OPEN at filing** —
> `WD-SINK-TRUNC-ALERTS`, `WD-SINK-TRUNC-RUNEV-ARGV`, `WD-SINK-TRUNC-RUNEV-FIELD`,
> `WD-SINK-CHUNK-BRAIN-STDOUT`, `WD-SINK-CHUNK-BRAIN-STDERR`,
> `WD-SINK-CHUNK-RUNJOB-STDOUT`, `WD-SINK-CHUNK-RUNJOB-STDERR` — a green suite
> does not mean the sinks are safe, and no fix is specced yet. (ii) The comments
> at `src/core/dream/brain.js:504-508` and `src/cli/run-job.js:1048-1052`
> describe the chunk residual (OWNER-APPROVED 2026-07-17) as "may be only
> partially redacted", whereas the measured behaviour — reproduced independently
> by the design reviewer through real subprocess pipes — is that the **whole**
> credential lands contiguous in the durable log; same-user exposure
> (0600/0700); the comments are to be corrected by whichever package takes the
> fix. (iii) `PROBE_TAIL` is declared and unused in
> `tests/unit/alerts.test.js:414` and `tests/unit/run-evidence.test.js:133`
> (copied verbatim from the spec's Exact-contracts block). (iv) The four chunk
> probes force a boundary with `sleep 0.3`; their failure mode is loud red on a
> healthy sink, never silent green. (v) `mkdtemp` roots are never removed,
> matching the existing helpers the spec mandates reusing, so the SYNTHETIC
> probe value persists under the temp dir.

<!-- errata above; the spec as it shipped follows -->

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **This WP is DIAGNOSTIC. It fixes nothing.**
> It writes tests that make the **measured** current behaviour of five
> durable-output sinks visible in the suite. Seven of the sixteen probes pin a
> **defect**; **this WP closes none of them** and changes no shipped behaviour.
> Nothing here makes any byte safer. Merging it must never be cited as evidence
> that the sinks are sound.
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
  `scanAndRedact(text).text` (`src/core/secret-scan.js:314-316`).

Two **gates** consume `findings` and withhold a whole artifact when
`findings.length > 0`: ADR-0024's **EP2 staged-output gate**
(`src/core/dream/validate.js:1402`, reverts a staged vault note) and **EP4**
(`src/core/digest.js:713`, `:738-739`, `:780`, omits a digest section). Those two
are well covered by tests and are **out of scope here**.

Five other consumers — the **sinks** this WP probes — do not gate on findings at
all. They pipe bytes through `redactOnly` on their way to a file on the user's
disk. **Table S is canonical** for which sinks and which call sites those are,
and it also names the two remaining `redactOnly` callers in the tree that are
deliberately *not* sinks, so "five" is a closed claim rather than a short one.
Every other mention of a call site in this spec defers to Table S.

**Nine call sites, not five, and not eight.** Round-2 review had already found
that probing one path per module and attaching a module-wide defect id to it is
worse than not probing: a fix to `brain.js`'s stdout handler alone would make the
probe pass and invite removal of a marker while split-boundary credentials still
leaked through the stderr handler a few lines away. Round zero (2026-09-17,
`docs/specs/logbook/2026-09-17-secret-sink-wiring-probes-round-zero.md`) then
found the draft's own inventory short by one: `src/cli/run-job.js:1120` writes a
`redactOnly`-scrubbed failure message into the same durable job log and was not
listed. Every probe in Table P is scoped to **one call site**, and every defect
id names **one call site**.

**The transcript artifact is transient, and the spec says so.**
`collectExtracts` writes the scratch JSON to disk (`src/core/dream/scratch.js:129`),
but `src/cli/dream.js:1328` calls `cleanScratch(paths.state)` inside a `finally`
block, and `cleanScratch` (`src/core/dream/scratch.js:163-164`) is
`fs.rmSync(scratchDirOf(stateDir), {recursive: true, force: true})`. Since
PR #253 that teardown runs only inside `if (ownsLock(paths.state))`
(`src/cli/dream.js:1327-1329`) — a run that lost its lock to a stale-lock steal
leaves the cleanup to the stealer. So the file exists on disk during the run and
is removed at teardown on the ordinary path. Probe P9 therefore proves **transient
on-disk staging**, not a retained artifact — bytes on disk are bytes on disk, and
a crash between the write and the `finally` leaves them there.

Reading the call sites shows two preprocessing patterns that defeat the helper
regardless of how good the detector is. Table S's `Pattern` column is canonical
for which site has which:

1. **Truncate-then-redact**, at three sites. The value is cut **before** the
   scan, so a credential straddling the cut loses the tail its rule needs and the
   surviving head is written raw.
2. **Per-chunk redaction of a stream**, at four sites. Each call redacts one
   stream chunk, on stdout and stderr independently. A credential that straddles
   a chunk boundary is never seen whole by any call, and **measured, both halves
   are written raw and land contiguously** — the complete credential is in the
   log file byte-for-byte.

The two remaining sites get the order right: the transcript sink redacts
**before** applying the per-message char cap (`capMessage`,
`src/core/transcripts/index.js:102-110`, calling `redact` at `:103`), and the
job-log failure-message site redacts a whole composed string with no cap at all.
They are worth pinning because they are the counter-examples that show the other
seven are a choice, not a constraint.

**How the seven defects are recorded.** Two earlier designs were wrong and both
are kept here so neither is re-proposed:

- *"Assert the observed result."* Rejected in the sense of an assertion that
  cannot fail — e.g. comparing the artifact to itself. It pins nothing. (An
  assertion that the leak is *present* is a different thing and is what this WP
  now uses; see "Exact contracts".)
- *Node's `{ todo: '<id>' }` expected-failure marker.* Verified directly on
  Node v25.9.0: a `todo` test that **unexpectedly passes** is reported as
  `ok N - <name> # TODO <id>`, counted under `# todo`, and the process **exits
  0**. So the claim that "a probe which starts passing will fail the ongoing
  gate" was **false** for `npm test`. `npm test` is `node tests/run.js`, which
  spawns `node --test` with `stdio: 'inherit'` and exits on its status, so no
  repository-level TAP inspection exists to bolt an unexpected-pass check onto
  without rewriting the shared test entry point — out of scope for a diagnostic
  S-sized WP.

**What this WP does instead.** No `todo` markers anywhere. Each defect probe is a
plain test that asserts the leak is **positively present** in the artifact, so it
**genuinely exits non-zero the moment a sink is fixed**. The price — green means
"still leaking" — is paid explicitly: every defect probe's name ends in
`(KNOWN DEFECT <id>)`, so the suite output names the defect on every run.

Why a labelled secret and not a high-entropy blob: the `anthropic-key` rule
(`src/core/secret-scan.js:88`, `/sk-ant-[A-Za-z0-9\-_]{20,}/g`, severity
`QUARANTINE`) is stable, so a labelled probe isolates the *wiring* question —
"do these bytes reach the helper at all?" — from any question about detector
tuning. The probe string in "Exact contracts" is additionally shaped so that **no
half and no truncated prefix of it trips any other rule**; that was re-measured
against the shipped detector on 2026-09-17 (round-zero logbook §1). An earlier
draft claimed the same isolation "against the detector proposed in
`WP-secret-fence-shape-and-context`" — **that spec is `Superseded`, was never
implemented, and no second detector exists or will**
(`docs/specs/done/WP-secret-allowlist-exact-value-store.md:72-78`). The claim is
withdrawn; there is exactly one detector to be isolated from.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP adds tests and two
inert JSON declaration files only. It starts no process and changes no shipped
behaviour.

## Current state

- `src/core/secret-scan.js` — the shared detector. **Not modified by this WP.**
- The five sink modules and their nine `redactOnly` call sites: **Table S**.
  **None is modified by this WP.** Their public entry points are, in Table S's
  row order: `appendAlert(paths, record)`, `recordRunEvidence(paths, rec)`,
  `collectExtracts(paths, ledger, maxInputBytes, options)` (the fourth options
  parameter arrived with PR #245, `src/core/dream/scratch.js:46-49`; the
  three-argument call remains valid), `spawnBrain(o)`, and `runJob` reached via
  `runjob.run(argv, opts)`.
- `tests/unit/alerts.test.js`, `tests/unit/run-evidence.test.js`,
  `tests/unit/dream-brain.test.js`, `tests/unit/scheduler-runjob.test.js` —
  existing test files for four of the five sinks. Each already builds whatever
  temp directory / fixture its module needs; **reuse the file's existing setup
  helpers**, do not invent new ones. The two stream sinks already have a working
  harness for exactly this shape: `tests/unit/dream-brain.test.js:157`
  (`pinFakeBrain`) driving `spawnBrain` with a real `logStream` at `:345`, and
  `tests/unit/scheduler-runjob.test.js` `setup()` at `:33`, `writeScript()` at
  `:92`, `withRun()` at `:102`, `fakeResolve` at `:125`, used together at `:796`.
  All sixteen probes were measured through these harnesses in round zero, so
  "drivable from the existing file" is measured, not assumed.
- `tests/unit/dream-collect.test.js` — the test file for the transcript sink's
  real on-disk path. It already has `tempPaths()` (`:19`, `mkdtemp` +
  `getPaths`), `emptyLedger()` (`:31`) and `writeClaude(paths, sessionId,
  msgCount, msgLen, when)` (`:37`), plus many existing `collectExtracts` tests.
  `writeClaude` hardcodes its message body as `'x'.repeat(msgLen)`, so probe P9
  writes its own one-line JSONL fixture inline — see Table P. **Do not modify
  `writeClaude`.**
- `tests/unit/transcripts.test.js` — **not touched by this WP.** An earlier draft
  put the transcript probe here, driving the `parse`/`extract` function and
  calling its return value an artifact. It is not one: nothing on that path
  writes to disk. The disk write happens in `collectExtracts`.
- `tests/red-proofs/` holds **17** `*.proofs.json` declaration files today
  *(corrected post-merge, see Erratum 1 — the Ready text said 16)*
  (count, do not assume — a different total means the tree moved). This WP adds
  two, bringing the total to **19**; **Table R** is canonical for their contents.
- `npm test` is `node tests/run.js`; `npm run lint` is `node scripts/lint.js`;
  `npm run red-proofs` is `node tests/with-temp-root.js scripts/red-proofs.js`
  (`package.json:24`).

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/alerts.test.js | add exactly the **2** probes whose Table P `Test file` cell names it |
| modify | tests/unit/run-evidence.test.js | add exactly the **4** probes whose Table P `Test file` cell names it |
| modify | tests/unit/dream-collect.test.js | add exactly the **1** probe whose Table P `Test file` cell names it |
| modify | tests/unit/dream-brain.test.js | add exactly the **4** probes whose Table P `Test file` cell names it |
| modify | tests/unit/scheduler-runjob.test.js | add exactly the **5** probes whose Table P `Test file` cell names it |
| create | tests/red-proofs/secret-sink-wiring-probes-alerts.proofs.json | Table R row R1 only; `suite` is `tests/unit/alerts.test.js` |
| create | tests/red-proofs/secret-sink-wiring-probes-run-evidence.proofs.json | Table R rows R2 and R3 only; `suite` is `tests/unit/run-evidence.test.js` |

Add nothing else to those files. Do not edit any existing test.

Per `docs/specs/_TEMPLATE.md` lines 33-35, this spec file, `package-lock.json`,
`memory/lessons/inbox.md` and anything under `docs/specs/logbook/` are exempt
from every Deliverables table and are therefore not listed here, while remaining
permitted in the verification whitelist below.

### Exact contracts

Every probe uses this one literal credential, and nothing else:

```js
// A labelled-rule match: the `anthropic-key` rule is
// /sk-ant-[A-Za-z0-9\-_]{20,}/g -> [REDACTED:anthropic-key], severity
// QUARANTINE (src/core/secret-scan.js:88). 48 characters. Shaped so that
// PROBE_HEAD and PROBE_TAIL each trip NO rule: PROBE_HEAD has only 17
// characters after `sk-ant-` (the rule needs 20), and every
// delimiter-separated segment of both halves is word-shaped, so the entropy
// pass suppresses them. Measured against the shipped detector 2026-09-17:
// scanAndRedact(PROBE_HEAD).text === PROBE_HEAD, findings [];
// scanAndRedact(PROBE_TAIL).text === PROBE_TAIL, findings [].
const PROBE = 'sk-ant-api03-PROBE-aaaa-bbbb-cccc-dddd-eeee-ffff';
const PROBE_HEAD = PROBE.slice(0, 24); // 'sk-ant-api03-PROBE-aaaa-'
const PROBE_TAIL = PROBE.slice(24); //    'bbbb-cccc-dddd-eeee-ffff'
const MARKER = '[REDACTED:anthropic-key]';
```

**Every probe computes the same safe invariant** against the artifact the sink
writes. Each of the five test files defines it **once**, as this exact line, and
every probe in that file calls it (`const safe = safeOf(artifact);`) — one
definition per file is what makes the invariant greppable and therefore
checkable:

```js
// `artifact` is the file's text, read from disk after the sink ran.
const safeOf = (artifact) => artifact.includes(MARKER) && !artifact.includes(PROBE_HEAD);
```

`!artifact.includes(PROBE)` on its own is **vacuous** for the truncation probes —
truncation removes the probe's tail whether or not anything scanned it — so the
invariant is written in terms of `PROBE_HEAD`, the exact 24 characters that do
survive, and of `MARKER`, whose presence is the only positive evidence that
`redactOnly` saw the value.

There are three assertion forms, written **verbatim** as below (the verification
block counts these exact strings). Table P's `Assertion` column says which each
probe uses; `<id>` is that probe's Table P defect id.

**`SAFE`** — the sink redacted. Nine probes, one line each:

```js
assert.equal(safe, true, artifact);
```

**`LEAK-HEAD`** — a truncation defect; the 24-character head of the credential
persists. Three probes, two lines each:

```js
assert.equal(safe, false, DEFECT_MSG('<id>'));
// Non-vacuity: `safe === false` is ALSO satisfied by an EMPTY artifact, which is
// exactly how a probe passes without the sink ever running. Assert the leak is
// POSITIVELY there.
assert.equal(artifact.includes(PROBE_HEAD), true, DEFECT_MSG('<id>'));
```

**`LEAK-WHOLE`** — a chunk-boundary defect; the complete credential persists.
Four probes, two lines each:

```js
assert.equal(safe, false, DEFECT_MSG('<id>'));
assert.equal(artifact.includes(PROBE), true, DEFECT_MSG('<id>'));
```

`DEFECT_MSG` is one local helper, defined once in each of the **four** test files
that host a defect probe (`dream-collect` has none), taking the defect id:

```js
const DEFECT_MSG = (id) =>
  `${id}: this probe pins a KNOWN-OPEN defect and it now appears FIXED. ` +
  'Do not delete this test to make the suite green. Convert it to the safe ' +
  'form (assert.equal(safe, true, artifact)), move its row in Table P to ' +
  'Status CORRECT, and say so in the PR.';
```

No probe uses `{ todo: … }`, `t.skip`, `t.todo` or any other soft marker. All
sixteen are plain tests; round zero measured each sink's behaviour on `242c37b8`
through the same public entry points, and every one of the sixteen assertions
holds against what was measured (round-zero logbook §3), so all sixteen are
expected to pass on the first run. Any sink fix turns at least one of them red
with the message above.

Each probe drives the sink through its **public entry point** (never by calling
`redactOnly` or `scanAndRedact` directly) and reads the **artifact from disk**.

**Feed shapes** (Table P's `Feed` column selects one):

- `WHOLE` — `PROBE` is supplied as a single value / single chunk.
- `STRADDLE-TRUNCATE` — the value is `'F'.repeat(CAP - PROBE_HEAD.length) + PROBE`, so that
  after the sink's own `slice(0, CAP)` exactly `PROBE_HEAD` survives. `CAP` is
  the imported `MAX_FIELD_CHARS` for the alerts sink and the literal `2000` for
  the two run-evidence sites, which do not export their cap (Table S,
  `Cap` column). Measured: the truncated text contains `PROBE_HEAD` and does not
  contain `MARKER`.
- `STRADDLE-CHUNK` — `PROBE_HEAD` and `PROBE_TAIL` are written as two
  consecutive stream writes on the **same** stream, **with a real chunk boundary
  forced between them**. This is load-bearing and was measured in both
  directions (round-zero logbook §5): two adjacent writes with no delay are read
  by the parent as **one** chunk, the sink then sees the whole credential and
  redacts it, and the probe would be the *opposite* probe — red against a sink
  behaving exactly as measured. A 300 ms delay between the two writes was
  measured sufficient on darwin/Node v25.9.0. The implementer chooses the
  mechanism; the requirement is that the boundary is forced, not that it is
  forced this way.

#### The literal declaration file, in full

The Deliverables table CREATES two files. Here is the smaller one,
`tests/red-proofs/secret-sink-wiring-probes-alerts.proofs.json` (Table R row
R1), **byte-for-byte as the runner accepts it**. It was validated on 2026-09-17
by loading it through `scripts/red-proofs.js`'s own exported
`loadDeclarations(root)` — not a restatement of the schema — and the mutation
was measured to flip `safe` to `true`, which is what reddens P2 (round-zero
logbook §8).

```json
{
  "suite": "tests/unit/alerts.test.js",
  "proofs": [
    {
      "id": "alerts-redact-before-truncate",
      "wp": "WP-secret-sink-wiring-probes",
      "criterion": "AC4",
      "why": "P2 pins Table S row S1's truncate-then-redact order. Its pass is also what you would see if the site did no redaction at all, and only the paired CORRECT probe P1 rules that out — an inference, which is what ADR-0042 exists to replace. Swapping the cut and the scan makes the whole value reach the detector, so PROBE_HEAD no longer survives and MARKER appears: exactly the condition P2 asserts is absent. testNamePattern scopes the phase to P2, because the mutation also changes what every other capped field in this suite is scanned as, and none of those is this criterion's concern.",
      "file": "src/core/alerts.js",
      "find": "  const scrub = (v) => redactOnly(String(v == null ? '' : v).slice(0, MAX_FIELD_CHARS));",
      "replace": "  const scrub = (v) => redactOnly(String(v == null ? '' : v)).slice(0, MAX_FIELD_CHARS); // RP_MUT_ALERTS_REDACT_BEFORE_TRUNCATE",
      "marker": "RP_MUT_ALERTS_REDACT_BEFORE_TRUNCATE",
      "occurrences": 1,
      "testNamePattern": "straddling MAX_FIELD_CHARS",
      "expectRed": [
        {
          "test": [
            "sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is NOT redacted in alerts.jsonl (KNOWN DEFECT WD-SINK-TRUNC-ALERTS)"
          ],
          "signal": "WD-SINK-TRUNC-ALERTS: this probe pins a KNOWN-OPEN defect"
        }
      ]
    }
  ]
}
```

**Which fields this spec fixes, and which the implementer fills.** Nothing above
depends on code that does not exist yet, so the file is committed as written —
but the distinction matters when a review round moves something:

| Field | Fixed by | Note |
|-------|----------|------|
| `suite`, `file`, `wp`, `criterion` | this spec | Table R row R1, Deliverables, AC4 |
| `find` | the **current tree** | the exact text of `src/core/alerts.js:48`; measured to occur **once**, which is why `occurrences` is 1. If an unrelated change edits that line, `find` stops matching and the lane fails loud — that is the intended behaviour (ADR-0042, Consequences) |
| `replace`, `marker` | this spec | the order swap plus the `RP_MUT_` marker the runner greps for after writing |
| `expectRed[].test` | this spec | **Table P's P2 name, verbatim** — no test name is invented here, because Table P already fixes all sixteen |
| `expectRed[].signal` | this spec | a substring of `DEFECT_MSG('WD-SINK-TRUNC-ALERTS')` from "Exact contracts". Under the mutation the FIRST assertion to fail is `assert.equal(safe, false, …)`, so that message is the diagnostic |
| `testNamePattern` | **the implementer may widen it** | the one field not fully determined: it scopes the phase to P2, and if the implementer's probe placement makes the mutation redden a test beyond P2, the runner's set-equality rule fires and they either narrow this pattern or declare the extra test (Table R constraints) |

`tests/red-proofs/secret-sink-wiring-probes-run-evidence.proofs.json` has the
**same shape** with `"suite": "tests/unit/run-evidence.test.js"` and a two-element
`proofs` array carrying Table R rows **R2** and **R3** — the same order swap
applied to `sanitizeArgv`'s element and to `sanitizeRecord`'s `scrub`, reddening
P4 and P6 respectively, with ids unique across the whole declaration directory.

## Contract reference (optional — mark N/A if this WP is not contract-dense)

Activation (ADR-0031, 3 of 7): (v) the task crosses an authority boundary — the
detector emits sanitized bytes but five other modules own the artifacts those
bytes land in; (vi) multiple downstream consumers inherit the contract; (vii) the
same call-site inventory must appear in Context, Current state, Table P, the
acceptance criteria and the verification greps.

Canonical tables: **S** (the sinks and their call sites), **P** (the probes),
**R** (the RED declarations).

### Contract table(s)

#### Table S — canonical: the five sinks and their nine `redactOnly` call sites

Line numbers are as measured on `242c37b8` (round-zero logbook §2). When
following a citation, grep for the cited text; the number disambiguates, it does
not authenticate.

| # | Sink | `redactOnly` call site | Enclosing function | Pattern | Cap | Artifact on disk | Lifetime |
|---|------|------------------------|--------------------|---------|-----|------------------|----------|
| S1 | alerts | `src/core/alerts.js:48` | `sanitizeAlert`'s `scrub` | truncate-then-redact | `MAX_FIELD_CHARS` = 2000, `alerts.js:29`, **exported** | `~/.wienerdog/state/alerts.jsonl` | durable |
| S2 | run evidence | `src/core/run-evidence.js:64` | `sanitizeArgv`, per argv element | truncate-then-redact | literal `2000`, not exported | `~/.wienerdog/state/run-evidence.jsonl` | durable |
| S3 | run evidence | `src/core/run-evidence.js:78` | `sanitizeRecord`'s `scrub`, per scalar field | truncate-then-redact | literal `2000`, not exported | `~/.wienerdog/state/run-evidence.jsonl` | durable |
| S4 | transcript extracts | `src/core/transcripts/index.js:67` | `redact`, called by `capMessage` at `:103` | redact-then-cap | `MAX_MSG_CHARS` = 4000, applied after | `~/.wienerdog/state/dream-scratch/<harness>-<session_id>.json`, written at `src/core/dream/scratch.js:129` | **transient** — see Context |
| S5 | brain logs | `src/core/dream/brain.js:517` | child **stderr** `data` handler | per-chunk | none | `~/.wienerdog/logs/dream/<YYYY-MM-DD>.log` | durable |
| S6 | brain logs | `src/core/dream/brain.js:545` | child **stdout** `data` handler | per-chunk | none | `~/.wienerdog/logs/dream/<YYYY-MM-DD>.log` | durable |
| S7 | routine logs | `src/cli/run-job.js:1055` | child **stdout** `data` handler | per-chunk | none | `~/.wienerdog/logs/<job>/<YYYY-MM-DD>.log` | durable |
| S8 | routine logs | `src/cli/run-job.js:1060` | child **stderr** `data` handler | per-chunk | none | `~/.wienerdog/logs/<job>/<YYYY-MM-DD>.log` | durable |
| S9 | routine logs | `src/cli/run-job.js:1120` | the `finally` block's non-`WienerdogError` failure message | whole string | none | `~/.wienerdog/logs/<job>/<YYYY-MM-DD>.log` | durable |

**The list is closed, and these are the two `redactOnly` callers deliberately
left out of it**, so "nine" is a checkable claim rather than a short one:

- `src/core/dream/promote.js:621` and `src/cli/dream.js:321` — `neutralise()`,
  `WP-dream-promote-report` Table N's redact-then-sanitise transformation.
  `promote.js` is **not ungated**: the composed record is refused fail-loud at
  `promote.js:770` (`if (redactOnly(text) !== text) throw`), which puts it in the
  EP2/EP4 gate class this WP excludes. `dream.js:321` feeds `console.log`
  (`:1222`, `:1225`, `:1291`); on the scheduled path that stdout is teed into the
  routine log by S7/S8, and on the interactive path it reaches no durable file.
- `src/core/digest.js:146` — a comment, not a call.

#### Table P — canonical: the probes

Every row computes the `safe` expression from "Exact contracts" against the
artifact its Table S row names, read from disk. `Status` is this WP's belief
about the behaviour being pinned: **CORRECT** means the sink is doing the right
thing and the probe guards it; **DEFECT** means the probe records a leak for a
later fix, and turning that probe red is the **intended** outcome of that fix.

| # | Test file | Test name (exact) | Site | Entry point | Feed | Assertion | Status | Measured artifact fact |
|---|-----------|-------------------|------|-------------|------|-----------|--------|------------------------|
| P1 | alerts | `sink-probe: alerts — a labelled secret in an alert field is redacted in alerts.jsonl` | S1 | `appendAlert(paths, record)`, probe in the `reason` field | WHOLE | SAFE | CORRECT | `MARKER` present, no `PROBE_HEAD` |
| P2 | alerts | `sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is NOT redacted in alerts.jsonl (KNOWN DEFECT WD-SINK-TRUNC-ALERTS)` | S1 | same | STRADDLE-TRUNCATE | LEAK-HEAD | DEFECT `WD-SINK-TRUNC-ALERTS` | the line ends `…FFFFsk-ant-api03-PROBE-aaaa-","log_hint":"~/.wienerdog/logs/dream/"}` *(corrected post-merge, see Erratum 2 — the Ready text showed `"log_hint":"h"`)*; no `MARKER` |
| P3 | run-evidence | `sink-probe: run-evidence — a labelled secret in an argv entry is redacted in run-evidence.jsonl` | S2 | `recordRunEvidence(paths, rec)`, probe as one `argv` element | WHOLE | SAFE | CORRECT | `MARKER` present, no `PROBE_HEAD` |
| P4 | run-evidence | `sink-probe: run-evidence — a labelled secret straddling the argv cap is NOT redacted in run-evidence.jsonl (KNOWN DEFECT WD-SINK-TRUNC-RUNEV-ARGV)` | S2 | same | STRADDLE-TRUNCATE | LEAK-HEAD | DEFECT `WD-SINK-TRUNC-RUNEV-ARGV` | `PROBE_HEAD` inside the `argv` array; no `MARKER` |
| P5 | run-evidence | `sink-probe: run-evidence — a labelled secret in a scalar field is redacted in run-evidence.jsonl` | S3 | `recordRunEvidence(paths, rec)`, probe as the `job` field | WHOLE | SAFE | CORRECT | `MARKER` present, no `PROBE_HEAD` |
| P6 | run-evidence | `sink-probe: run-evidence — a labelled secret straddling the scalar-field cap is NOT redacted in run-evidence.jsonl (KNOWN DEFECT WD-SINK-TRUNC-RUNEV-FIELD)` | S3 | same | STRADDLE-TRUNCATE | LEAK-HEAD | DEFECT `WD-SINK-TRUNC-RUNEV-FIELD` | `PROBE_HEAD` in the `job` value; no `MARKER`. S3's `scrub` is a **separate** truncate-then-redact from S2's — fixing S2 alone leaves this open, which is why it has its own id |
| P7 | dream-brain | `sink-probe: brain — a labelled secret in one stdout chunk is redacted in the brain log` | S6 | `spawnBrain`, fake brain writing to stdout | WHOLE | SAFE | CORRECT | log is `boom [REDACTED:anthropic-key] end\n`. **This is P8's control**: same handler, same bytes, one chunk instead of two |
| P8 | dream-brain | `sink-probe: brain — a labelled secret straddling two stdout chunks is NOT redacted in the brain log (KNOWN DEFECT WD-SINK-CHUNK-BRAIN-STDOUT)` | S6 | same | STRADDLE-CHUNK | LEAK-WHOLE | DEFECT `WD-SINK-CHUNK-BRAIN-STDOUT` | log is exactly `sk-ant-api03-PROBE-aaaa-bbbb-cccc-dddd-eeee-ffff\n` — the **complete** credential, contiguous, not a fragment |
| P9 | dream-collect | `sink-probe: transcripts — a labelled secret in a transcript reaches dream-scratch redacted` | S4 | `collectExtracts(paths, ledger, maxInputBytes)` with this file's `tempPaths()` and `emptyLedger()` | WHOLE, as the `message.content` of a one-line JSONL fixture written inline (mirror `writeClaude`'s record shape but with `content: 'boom ' + PROBE`) | SAFE | CORRECT | `MARKER` present in the scratch JSON, no `PROBE_HEAD` |
| P10 | dream-brain | `sink-probe: brain — a labelled secret in one stderr chunk is redacted in the brain log` | S5 | `spawnBrain`, fake brain writing to stderr | WHOLE | SAFE | CORRECT | as P7. **This is P11's control** |
| P11 | dream-brain | `sink-probe: brain — a labelled secret straddling two stderr chunks is NOT redacted in the brain log (KNOWN DEFECT WD-SINK-CHUNK-BRAIN-STDERR)` | S5 | same | STRADDLE-CHUNK | LEAK-WHOLE | DEFECT `WD-SINK-CHUNK-BRAIN-STDERR` | as P8. A **separate handler** from P8's — a stdout-only fix leaves this open |
| P12 | scheduler-runjob | `sink-probe: routine-log — a labelled secret in one stdout chunk is redacted in the job log` | S7 | `runjob.run` via this file's `withRun` + `fakeResolve` | WHOLE | SAFE | CORRECT | as P7. **This is P13's control** |
| P13 | scheduler-runjob | `sink-probe: routine-log — a labelled secret straddling two stdout chunks is NOT redacted in the job log (KNOWN DEFECT WD-SINK-CHUNK-RUNJOB-STDOUT)` | S7 | same | STRADDLE-CHUNK | LEAK-WHOLE | DEFECT `WD-SINK-CHUNK-RUNJOB-STDOUT` | as P8 |
| P14 | scheduler-runjob | `sink-probe: routine-log — a labelled secret in one stderr chunk is redacted in the job log` | S8 | same | WHOLE | SAFE | CORRECT | as P7. **This is P15's control** |
| P15 | scheduler-runjob | `sink-probe: routine-log — a labelled secret straddling two stderr chunks is NOT redacted in the job log (KNOWN DEFECT WD-SINK-CHUNK-RUNJOB-STDERR)` | S8 | same | STRADDLE-CHUNK | LEAK-WHOLE | DEFECT `WD-SINK-CHUNK-RUNJOB-STDERR` | as P8. A **separate handler** from P13's |
| P16 | scheduler-runjob | `sink-probe: routine-log — a labelled secret in a job failure message is redacted in the job log` | S9 | `runjob.run` with an `opts.resolveCommand` naming a nonexistent command whose path contains `PROBE`, so the spawn `error` carries it | WHOLE | SAFE | CORRECT | log is `\nwienerdog: job failed to run: spawn /…/no-such-[REDACTED:anthropic-key] ENOENT\n` |

**Sixteen probes across five files: nine CORRECT (P1, P3, P5, P7, P9, P10, P12,
P14, P16) and seven DEFECT (P2, P4, P6, P8, P11, P13, P15).** Every one of Table
S's nine call sites is exercised by at least one probe, and every defect id names
exactly one call site.

**Each probe carries a comment naming its Table S row**, in the exact form
`Table S row S<n> — <module path>`, with **no line number** (AC7). That comment
is what the verification loop counts, and it is why the loop is stable: an edit
to a sink moves the line, not the row id.

P9's artifact is the scratch file: after `collectExtracts` returns, read the
single `*.json` under `path.join(paths.state, 'dream-scratch')`. `collectExtracts`
returns the written paths in its `wrote` array; using that array to locate the
file is fine — the assertion must still be made against the **file's contents on
disk**, never against the returned object.

If a sink's entry point cannot be driven from its existing test file without
adding a new harness module, **stop and say so in the PR** — do not build one.
Round zero drove all sixteen through the existing helpers, so this should not
happen.

#### Table R — canonical: the declared RED proofs (ADR-0042)

**Which probes owe a declared proof, and why only these three.** A probe's pass
is self-proving when the only producer of what it asserts is the behaviour it
names:

- The nine CORRECT probes assert `MARKER` is **present** in a file read from
  disk. Nothing but a real `redactOnly` call on the real value produces that
  string there.
- The four `LEAK-WHOLE` probes assert the whole `PROBE` is **present**. Their
  discriminator is in the suite already: P7/P10/P12/P14 are the same handler,
  the same bytes, one chunk instead of two. No declared proof is possible anyway
  — making per-chunk redaction whole-stream needs cross-chunk buffering, which is
  not a single exact-substring replacement and is forbidden here.
- The three `LEAK-HEAD` probes are the exception. `PROBE_HEAD` present and
  `MARKER` absent is *also* what you would see if the site did no redaction at
  all; the reader rules that out by noticing the paired CORRECT probe is green.
  **ADR-0042 exists because that kind of inference has repeatedly been wrong.**
  A declared mutation replaces it with a measurement.

Each declaration swaps the cut and the scan at one site, so the whole value is
scanned and the head no longer survives.

| # | File | Suite | Mutates | Mutation | Must redden |
|---|------|-------|---------|----------|-------------|
| R1 | `tests/red-proofs/secret-sink-wiring-probes-alerts.proofs.json` | `tests/unit/alerts.test.js` | `src/core/alerts.js` (site S1) | move the `.slice(0, MAX_FIELD_CHARS)` from inside the `redactOnly(…)` argument to outside its result, so the scan sees the whole value | P2 |
| R2 | `tests/red-proofs/secret-sink-wiring-probes-run-evidence.proofs.json` | `tests/unit/run-evidence.test.js` | `src/core/run-evidence.js` (site S2) | same swap on `sanitizeArgv`'s element | P4 |
| R3 | same file as R2 | `tests/unit/run-evidence.test.js` | `src/core/run-evidence.js` (site S3) | same swap on `sanitizeRecord`'s `scrub` | P6 |

Constraints `scripts/red-proofs.js` enforces, which have burned earlier packages:

- `id` is a kebab slug, unique across the **whole** declaration directory.
- `replace` must differ from `find` and must contain `marker`.
- `file` may not be the suite, the runner, `tests/run.js`, or anything under
  `tests/red-proofs/`.
- `expectRed[].test` is an array of full test names, outermost first; `signal` is
  a non-empty substring of the expected diagnostic.
- The observed own-body failing set must **equal** the declared set. If a
  mutation reddens a test beyond its Table R `Must redden` cell, scope the
  declaration with `testNamePattern` to the probe's own name; if it still
  reddens more, declare those too and say so in the PR — do not widen or weaken
  the mutation.
- **The gate is the bare unfiltered `npm run red-proofs`.** A `--wp`-filtered run
  exits non-zero by construction (every other declaration is reported
  `FILTERED`), so it is a reading, never a pass. Do not pin a repo-wide
  "N declared proofs" total.

**Both-sides evidence is still required for all sixteen probes**, per
`docs/runbooks/spec-authoring.md`: a real green on the compliant tree and a real
red against a deliberately broken one. R1–R3 supply it mechanically for P2, P4
and P6. For the other thirteen it is produced by hand and pasted into the PR
body — the break for a CORRECT probe is removing the `redactOnly(…)` wrapper at
its Table S site; the break for a `LEAK-WHOLE` probe is making that handler
accumulate across chunks and redact once. Neither break is committed.

### Mirrored Surface Checklist

For each canonical table above, name **every surface in this spec that mirrors
it**, so a review finding updates the table and all its mirrors in one pass
**and in the same commit** (update-all-mirrors), and any new mirror found in
review is added here on the spot (register-new-mirrors):

- [ ] **Deliverables-table cells that restate a path or rule** — the five
      `tests/unit/*.test.js` rows' per-file probe counts (2 / 4 / 1 / 4 / 5,
      mirroring Table P's `Test file` column) and the two
      `tests/red-proofs/*.proofs.json` rows' `suite` and row assignments
      (mirroring Table R).
- [ ] **Acceptance criteria that assert its facts** — AC1 (sixteen probes, exact
      names), AC2 (the `safe` expression), AC3/AC4 (the 9/7 CORRECT/DEFECT split
      and the assertion form per class), AC5 (no soft markers), AC7 (every one of
      Table S's nine rows cited by id), AC9 (Table R's declarations).
- [ ] **Verification commands / greps** — the probe counts 16/16; the `# TODO`
      count 0; the assertion-form counts (5 `safeOf` definitions, 9 SAFE, 7
      DEFECT, 3 `LEAK-HEAD`, 4 `LEAK-WHOLE`, mirroring Table P's `Assertion` and
      `Status` columns); the seven defect-id greps (TAP name once, `DEFECT_MSG`
      twice); the nine `Table S row S<n>` greps (one per row); the
      permission-boundary whitelist; the `npm run red-proofs` and
      proofs-JSON-shape steps derived from Table R; and the R1-drift comparison,
      whose four expected values are copied from the literal declaration file
      published under "Exact contracts".
- [ ] **Current-state description** — the sink-module bullet (defers to Table S
      rather than restating the call sites), the public entry points listed in
      Table S's row order, the `tests/red-proofs/` file count, and the test-file
      helper line numbers the probes reuse.
- [ ] **Operative prose steps that apply it** — the Context paragraph "Nine call
      sites, not five, and not eight"; the two preprocessing patterns (which must
      say "three sites" and "four sites", matching Table S's `Pattern` column and
      Table P's DEFECT rows); the Context paragraph on the transcript sink's
      transience; the Context paragraph on why `{ todo }` was dropped; the
      "Exact contracts" `PROBE`/`PROBE_HEAD`/`PROBE_TAIL`/`MARKER` constants, the
      `safe` expression, the three assertion forms and the three feed shapes;
      **the literal declaration file published in full under "Exact contracts"**,
      which mirrors Table R row R1 (`suite`, `file`, `criterion`), Table P row P2
      (`expectRed[].test`), Table S row S1 (`find`) and `DEFECT_MSG`
      (`signal`) — four tables in one JSON block, so a change to any of them
      edits it too; the "Accepted residuals" list; "Discovered issues / routed";
      and the Definition-of-done item that lists the seven defect ids.
- [ ] **Frontmatter** — `adrs` (must list ADR-0042 while Table R is non-empty)
      and `depends_on` / `epic`.

## Implementation notes & constraints

- **No production code changes.** If a probe shows a sink is wrong, that is the
  point — it is already recorded under "Discovered issues / routed"; add nothing
  new there unless you found something this spec does not name.
- **Do not "fix" a defect probe by weakening it, and do not delete one.** Its
  assertion is the deliverable. If it goes red because a sink was fixed, follow
  the instruction in its own failure message.
- Reuse each test file's existing temp-directory / fixture helpers. Add no new
  helper module and no new fixture file. P9's inline JSONL write is the one
  exception and is specified in Table P.
- **`tests/unit/scheduler-runjob.test.js` now ends with
  `WP-dream-digest-omits-own-job-alerts`'s three `OWNJOB-AC6*` tests** (PR #257
  appended them; the file is 3125 lines at base `a47f2546`, the last test
  starting at `:3105`). This WP's five probes append **after** them. The helpers
  the probes reuse — `setup()` `:33`, `writeScript()` `:92`, `withRun()` `:102`,
  `fakeResolve` `:125` — are near the top and were unaffected by that append;
  re-confirmed on `a47f2546`.
- For the four STRADDLE-CHUNK probes, the two writes must reach the **same**
  handler in order (`PROBE_HEAD` first) with a real chunk boundary between them
  (see "Exact contracts"). Emitting them on different streams would test nothing,
  because those are different call sites with different defect ids.
- The probe string is a *fake* key shaped to match the `anthropic-key` rule. It
  is not a credential and must never be replaced with a real one.
- **A failing probe prints the artifact, and the artifact contains the probe
  value.** The `SAFE` form passes `artifact` as its assertion message, so a red
  probe puts the synthetic credential-shaped string into `npm test` output and
  from there into CI logs. That is acceptable **only** because the value is
  synthetic and code-owned (design review round 1, 2026-09-17). It is what makes
  the rule above load-bearing rather than decorative: a fixture fed anything but
  the repo's own synthetic patterns would publish it. Never widen a fixture to
  an environment variable, a file the developer supplies, or a value read from
  the machine.
- No new npm dependencies. The two new files are inert JSON, never executed
  (ADR-0042 decision 1).
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT expand scope to resolve ambiguity.

### Accepted residuals

Four, all stated rather than mitigated.

1. **A green suite does not mean the sinks are safe — it means the seven defects
   are still open.** This is the unavoidable consequence of an assertion that
   genuinely fails when a defect is fixed. It is mitigated only by naming: every
   defect probe's test name ends in `(KNOWN DEFECT <id>)`, so `npm test` output
   carries the seven ids on every run, and Definition-of-done item 3 requires the
   PR body to list them.
2. **Nothing executably pins the *exact current* leak size**, so a change in
   truncation length that still leaked *something* would not be detected.
   `LEAK-HEAD` pins that `PROBE_HEAD` survives and `LEAK-WHOLE` that the whole
   `PROBE` survives; neither pins a byte count. Pinning today's leak
   byte-for-byte would require asserting the attacker's view, which is worse.
3. **The four STRADDLE-CHUNK probes are timing-dependent.** They force a chunk
   boundary with a delay; a parent process stalled longer than that delay would
   read both writes as one chunk, the sink would redact, and the probe would go
   red. The failure mode is a **loud red on a healthy sink**, never a silent
   green on a broken one, and re-running is the diagnosis. Removing the
   dependency would need a synchronisation channel between the fixture and the
   parent, which is more machinery than the property it guards
   (`docs/runbooks/codex-review.md`, "The loop converges by freezing surface").
4. **Round-3 review recommended adding this spec file to the Deliverables table
   and removing `package-lock.json` from the verification whitelist. Both are
   declined**, and the reason is a repo convention rather than a judgment call:
   `docs/specs/_TEMPLATE.md` lines 33-35 and `scripts/boundary-check.js`
   explicitly exempt the spec file itself, `package-lock.json`,
   `memory/lessons/inbox.md` and `docs/specs/logbook/` from every Deliverables
   table, and the whitelist correctly follows that convention.

## Discovered issues / routed

Recorded by round zero's measurements. **None is fixed by this WP and none
widens it.**

1. **SECURITY — the chunk-boundary leak is a whole plaintext credential in a
   durable log, and the code says it is a fragment.** Measured at all four
   per-chunk sites (S5–S8): when the two halves land in separate chunks neither
   call redacts anything and the two writes land contiguously, so the complete
   48-character credential is present byte-for-byte in
   `~/.wienerdog/logs/dream/<date>.log` and `~/.wienerdog/logs/<job>/<date>.log`.
   `src/core/dream/brain.js:504-508` documents this as a known limitation,
   **OWNER-APPROVED 2026-07-17**, in the words *"a secret split across a chunk
   boundary may be only partially redacted"*, and `src/cli/run-job.js:1048-1052`
   carries the same claim by reference. The residual is real and approved; the
   sentence describing it understates it. Exposure is same-user (the logs are
   0600 under a 0700 directory), which is the boundary the threat model already
   draws — but "same-user durable plaintext credential" is a materially different
   fact from "partial fragment", and both comments should be corrected by
   whichever WP takes the fix. **Not this one.** Evidence:
   `docs/specs/logbook/2026-09-17-secret-sink-wiring-probes-round-zero.md` §4.
2. **Three truncate-then-redact sites persist a 24-character credential head**
   (S1, S2, S3) into `state/alerts.jsonl` and `state/run-evidence.jsonl`. Partial,
   not whole. Recorded as `WD-SINK-TRUNC-ALERTS`, `WD-SINK-TRUNC-RUNEV-ARGV`,
   `WD-SINK-TRUNC-RUNEV-FIELD`.
3. **A ninth `redactOnly` call site existed with no probe and no mention**
   (`src/cli/run-job.js:1120`). It measures safe. Recorded because an inventory
   that was short once can be short again: the closure check in Table S ("the
   list is closed, and these are the two callers left out") is what this WP adds
   to stop it recurring.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] Every probe reads the **artifact from disk** (the file the sink actually
      writes), not the sink's return value — a sink that redacts its return value
      but writes raw bytes must fail the probe.
- [ ] No probe calls `redactOnly` or `scanAndRedact` directly; that would test
      the helper again instead of the wiring.
- [ ] The safe invariant is computed in its non-vacuous form: `MARKER` present
      **and** `PROBE_HEAD` absent. A probe that only asserts the full `PROBE` is
      absent would pass under truncation without anything having scanned.
- [ ] Every DEFECT probe additionally asserts the leak is **positively present**
      (`LEAK-HEAD` / `LEAK-WHOLE`, "Exact contracts"). `assert.equal(safe, false)`
      alone passes against an **empty** artifact, which is exactly how a probe
      passes without the sink ever running.
- [ ] **Every one of Table S's nine call sites is exercised**, and no defect id
      covers more than one call site. A fix to one handler cannot make another
      handler's probe pass.
- [ ] No probe uses `{ todo }`, `t.todo` or `t.skip`. A fixed sink turns its
      probe **red**, with exit code non-zero from `npm test`.
- [ ] The probe string never appears in a committed artifact other than the test
      sources, this spec, and the round-zero logbook entry that measured it. It
      is never written into a fixture file, a golden file or a proofs
      declaration.
- [ ] **A failing probe prints the probe value into test output, and therefore
      into CI logs** (the `SAFE` form's assertion message is `artifact`). Every
      fixture is fed **only** the repo's own synthetic secret-shaped patterns —
      never an environment variable, a developer-supplied file, or any value
      read from the machine — because a red probe publishes whatever it was fed.
      Raised by design review round 1 (2026-09-17) and accepted on exactly that
      condition.
- [ ] Every probe writes into a temp root it creates itself (`mkdtemp`), so
      nothing secret-shaped lands in the repo, in `~/.wienerdog`, or anywhere
      that survives the run.
- [ ] No untrusted identifier flows into a filesystem path or shell command —
      these tests construct their own temp paths. P16's fixture puts `PROBE` into
      a **nonexistent** path it builds itself under its own temp root, and never
      into a shell (`shell: false`).
- [ ] Nothing in this WP is described as fixing, mitigating or reducing any
      defect. All seven remain fully open at merge.

## Acceptance criteria

- [ ] **AC1** — Exactly the sixteen probes of Table P exist, with the exact test
      names in the table's `Test name` column, each in the file its `Test file`
      cell names.
- [ ] **AC2** — All sixteen compute the identical `safe` expression from "Exact
      contracts" — `artifact.includes(MARKER) && !artifact.includes(PROBE_HEAD)`
      — against the artifact read from disk, via a `safeOf` helper defined once
      per test file (5 definitions).
- [ ] **AC3** — The nine probes whose Table P `Status` is CORRECT use the `SAFE`
      assertion form, verbatim (9 occurrences).
- [ ] **AC4** — The seven probes whose Table P `Status` is DEFECT use the
      `LEAK-HEAD` or `LEAK-WHOLE` form as their `Assertion` cell says (7 + 3 + 4
      occurrences), each with a failure message naming its Table P defect id
      twice and instructing the reader to convert the probe rather than delete
      it.
- [ ] **AC5** — No probe carries `{ todo: … }` and no `# TODO` appears in the TAP
      output of the five files.
- [ ] **AC6** — All sixteen pass, and `npm test` exits 0.
- [ ] **AC7** — Every one of Table S's nine rows is cited in an added comment
      above the probe that exercises it, in the exact form
      `Table S row S<n> — <module path>` and **without a line number**. Line
      numbers drift with every edit to the sink; the repo's own citation rule
      treats them as disambiguators, not authentication
      (`docs/runbooks/codex-review.md`, "Internal coherence pass"), and Table S
      is where they live.
- [ ] **AC8** — No file outside the seven in Deliverables is modified, **except**
      this spec file (status flip, per Definition of done item 4),
      `package-lock.json`, `memory/lessons/inbox.md` and `docs/specs/logbook/`,
      all of which `docs/specs/_TEMPLATE.md` lines 33-35 exempt.
- [ ] **AC9** — The two declaration files of Table R exist with exactly the rows
      that table assigns them; the committed R1 file's `file`, `find`, `marker`
      and `expectRed[0].test[0]` match the literal published under "Exact
      contracts"; and the bare unfiltered `npm run red-proofs` reports `PROVEN`
      for this WP's criteria and exits 0.
- [ ] **AC10** — `npm test` and `npm run lint` pass.
- [ ] **AC11** — Idempotency: `N/A — this WP ships unit tests and two inert JSON
      declaration files. It adds no command and writes nothing outside the repo.`

## Verification steps (run these; paste output in the PR)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
TAP="$(mktemp)"

need() { # need <actual> <expected> <what>
  [ "$1" -eq "$2" ] || { echo "GATE FAIL: $3 — got $1, expected $2"; exit 1; }
  echo "ok: $3 = $1"
}

for f in alerts run-evidence dream-collect dream-brain scheduler-runjob; do
  node --test --test-reporter=tap "tests/unit/$f.test.js" >>"$TAP" 2>&1 || true
done

# AC1/AC6: 16 probes, all plain, all passing.
need "$(grep -cE '^(not )?ok [0-9]+ - sink-probe: ' "$TAP" || true)" 16 "sink probes present"
need "$(grep -cE '^ok [0-9]+ - sink-probe: '        "$TAP" || true)" 16 "sink probes passing"
need "$(grep -cE '^not ok '                          "$TAP" || true)"  0 "failing tests in the five files"

# AC5: no soft markers anywhere. Node reports a PASSING todo as `ok … # TODO`,
# exit code 0, so a todo marker would silently stop gating (round-2 finding P-1).
need "$(grep -cF '# TODO' "$TAP" || true)" 0 "no TODO markers in the five files"
need "$(git diff --unified=0 main... -- tests/unit/ | grep -cE '^\+.*\{ *todo *:' || true)" 0 \
     "no todo option added to any test"

# AC2/AC3/AC4: the invariant and the three assertion forms, counted as exact
# strings over the ADDED lines. This is what stops a probe from quietly using a
# weaker invariant than Table P's.
ADDED="$(git diff --unified=0 main... -- tests/unit/ | grep '^+' || true)"  # added lines only
need "$(printf '%s\n' "$ADDED" | grep -cF 'const safeOf = (artifact) => artifact.includes(MARKER) && !artifact.includes(PROBE_HEAD);' || true)" 5 \
     "safeOf defined once per test file"
need "$(printf '%s\n' "$ADDED" | grep -cF 'assert.equal(safe, true, artifact);' || true)" 9 \
     "SAFE assertions (one per CORRECT probe)"
need "$(printf '%s\n' "$ADDED" | grep -cF 'assert.equal(safe, false, DEFECT_MSG(' || true)" 7 \
     "DEFECT assertions (one per DEFECT probe)"
need "$(printf '%s\n' "$ADDED" | grep -cF 'assert.equal(artifact.includes(PROBE_HEAD), true, DEFECT_MSG(' || true)" 3 \
     "LEAK-HEAD non-vacuity assertions"
need "$(printf '%s\n' "$ADDED" | grep -cF 'assert.equal(artifact.includes(PROBE), true, DEFECT_MSG(' || true)" 4 \
     "LEAK-WHOLE non-vacuity assertions"

# AC4: each defect id appears exactly once, in a PASSING probe (the defect is
# open), and is named twice in that probe's own failure messages.
for id in WD-SINK-TRUNC-ALERTS WD-SINK-TRUNC-RUNEV-ARGV WD-SINK-TRUNC-RUNEV-FIELD \
          WD-SINK-CHUNK-BRAIN-STDOUT WD-SINK-CHUNK-BRAIN-STDERR \
          WD-SINK-CHUNK-RUNJOB-STDOUT WD-SINK-CHUNK-RUNJOB-STDERR; do
  need "$(grep -cE "^ok [0-9]+ - sink-probe: .*KNOWN DEFECT $id\)\$" "$TAP" || true)" 1 \
       "$id probe present and still red-on-fix"
  need "$(printf '%s\n' "$ADDED" | grep -cF "DEFECT_MSG('$id')" || true)" 2 \
       "$id named in both of its probe's failure messages"
done

# AC7: each of Table S's NINE rows is cited at least once in an added comment.
# Counted per row, not as one grep over an alternation: one comment line naming
# two rows would otherwise satisfy both. Row ids, not line numbers — a line
# number in a test comment goes stale the next time the sink is edited.
for n in 1 2 3 4 5 6 7 8 9; do
  c="$(git diff --unified=0 main... -- tests/unit/ | grep -cE "^\+.*Table S row S$n" || true)"
  [ "$c" -ge 1 ] || { echo "GATE FAIL: no added comment cites Table S row S$n"; exit 1; }
  echo "ok: Table S row S$n cited $c time(s)"
done

# AC8: permission boundary.
need "$(git diff --name-only main... | grep -cvE '^(tests/unit/(alerts|run-evidence|dream-collect|dream-brain|scheduler-runjob)\.test\.js|tests/red-proofs/secret-sink-wiring-probes-(alerts|run-evidence)\.proofs\.json|docs/specs/WP-secret-sink-wiring-probes\.md|docs/specs/logbook/.+\.md|package-lock\.json|memory/lessons/inbox\.md)$' || true)" 0 \
     "files outside the permission boundary"

# AC9: the two declaration files exist, are parseable JSON, name the right suite
# and carry the rows Table R assigns them.
node - <<'JS'
const fs = require("node:fs");
const want = {
  "secret-sink-wiring-probes-alerts": { suite: "tests/unit/alerts.test.js", n: 1 },
  "secret-sink-wiring-probes-run-evidence": { suite: "tests/unit/run-evidence.test.js", n: 2 },
};
let bad = 0;
for (const [name, w] of Object.entries(want)) {
  const p = `tests/red-proofs/${name}.proofs.json`;
  if (!fs.existsSync(p)) { console.log(`GATE FAIL: missing ${p}`); bad++; continue; }
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  if (d.suite !== w.suite) { console.log(`GATE FAIL: ${p} suite ${d.suite} !== ${w.suite}`); bad++; }
  if (!Array.isArray(d.proofs) || d.proofs.length !== w.n) {
    console.log(`GATE FAIL: ${p} has ${d.proofs && d.proofs.length} proofs, expected ${w.n}`); bad++;
  }
  for (const pr of d.proofs || []) {
    if (pr.wp !== "WP-secret-sink-wiring-probes") { console.log(`GATE FAIL: ${p}/${pr.id} wp=${pr.wp}`); bad++; }
    if (pr.replace === pr.find) { console.log(`GATE FAIL: ${p}/${pr.id} replace === find`); bad++; }
    if (!pr.replace.includes(pr.marker)) { console.log(`GATE FAIL: ${p}/${pr.id} replace lacks marker`); bad++; }
    if (pr.file.startsWith("tests/")) { console.log(`GATE FAIL: ${p}/${pr.id} mutates a test path`); bad++; }
  }
  console.log(`ok: ${p} — suite ${d.suite}, ${d.proofs.length} proof(s)`);
}
// R1 is published literally and in full under "Exact contracts". These four
// fields are the ones that literal fixes; they are compared here so the
// committed file cannot drift from the spec that validated it.
const r1Path = "tests/red-proofs/secret-sink-wiring-probes-alerts.proofs.json";
const r1 = fs.existsSync(r1Path) ? JSON.parse(fs.readFileSync(r1Path, "utf8")).proofs[0] : null;
if (r1 === null) { console.log("GATE FAIL: R1 absent — nothing to compare against the spec literal"); process.exit(1); }
const fixed = {
  file: "src/core/alerts.js",
  find: "  const scrub = (v) => redactOnly(String(v == null ? '' : v).slice(0, MAX_FIELD_CHARS));",
  marker: "RP_MUT_ALERTS_REDACT_BEFORE_TRUNCATE",
};
for (const [k, v] of Object.entries(fixed)) {
  if (r1[k] !== v) { console.log(`GATE FAIL: R1.${k} drifted from the spec literal`); bad++; }
  else console.log(`ok: R1.${k} matches the spec literal`);
}
if (r1.expectRed[0].test[0] !== "sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is NOT redacted in alerts.jsonl (KNOWN DEFECT WD-SINK-TRUNC-ALERTS)") {
  console.log("GATE FAIL: R1.expectRed[0].test[0] is not Table P row P2 verbatim"); bad++;
} else console.log("ok: R1.expectRed[0].test[0] is Table P row P2 verbatim");
process.exit(bad ? 1 : 0);
JS

npm run red-proofs    # AC9 — the bare unfiltered run; must exit 0
npm test              # AC6, AC10
npm run lint          # AC10
echo "ALL GATES PASSED"
```

**This gate is not enforced by CI.** It is a script an implementer runs locally
and pastes into the PR body. What *is* continuously enforced is the part that
matters: the sixteen probes are plain tests in files `npm test` already runs, so
a sink fix breaks the suite for everyone, not only for someone who reruns this
block — and the two declarations are enforced by the ADR-0042 lane.

## Out of scope (do NOT do these)

- Fixing truncate-then-redact or per-chunk redaction. All seven are real; all are
  separate work, routed under "Discovered issues / routed".
- Correcting the two code comments named in "Discovered issues / routed" item 1.
  They are wrong, they are in `src/`, and this WP touches no `src/` file.
- Making a defect probe pass-by-construction, deleting one, or weakening its
  assertion.
- Adding `{ todo }`, `t.todo` or `t.skip` to any probe.
- Changing `tests/run.js`, `package.json` or `.github/workflows/` to add a
  repository-level TAP inspection. It would be the right fix for a different WP;
  it is not this one.
- Any change to `src/core/secret-scan.js`, including the high-entropy pass.
- Any change to the EP2 / EP4 gates or their `findings.length > 0` condition.
- Any probe of the two excluded `redactOnly` callers named under Table S
  (`promote.js:621`, `dream.js:321`) — they are gated or non-durable, and
  probing them is a different WP.
- Adding a sixth sink, a tenth call site, or a new test harness module.
- Modifying `writeClaude` in `tests/unit/dream-collect.test.js`.

## Dispatch precondition — owner items

Two items. **Neither was ruled on directly.** Each is **a recommendation adopted
under standing authorization, not a direct ruling** — the standing process is
recorded in `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`
("Owner items inside those packages"), carried forward from
`2026-09-05-owner-rulings-git-env-pinning-queue.md`: the architect records a
recommendation with the cost of overruling it, the session may dispatch under
that recommendation, and **the owner reverses either of them by dated
amendment.** Nothing in this repo records the owner approving, accepting or
ratifying either, and this spec asserts no such acceptance. Design review round 1
(2026-09-17, approve) raised no third item; its two caveats are engineering
conditions, folded into the Security checklist, Implementation notes and
Definition of done rather than left for the owner.

1. **Does a diagnostic WP get to commit seven tests that are green precisely
   because the product is broken?**
   *Recommendation: yes, in the form specified here — a plain assertion that the
   leak is positively present, named `(KNOWN DEFECT <id>)`, so a fix turns it red
   and the fixer is told in the failure message to convert rather than delete
   it.* The alternative is to ship only the nine CORRECT probes and leave the
   seven leaks with no executable surface at all.
   *Cost of overruling:* the nine-probe version cannot detect a regression in
   which a sink stops leaking *and* stops redacting (both probes would need to
   move together), and the seven leaks go back to being findable only by reading
   the code — which is how they survived since 2026-07-17. The sixteen-probe
   version's cost is residual 1: green means still leaking.
2. **Is the whole-credential chunk leak still within the residual recorded as
   OWNER-APPROVED 2026-07-17?**
   *Recommendation: treat it as approved-but-mis-described, not as a new
   approval.* **The only record of that approval is the code comment itself** —
   `src/core/dream/brain.js:504-508`, *"Known limitation (OWNER-APPROVED
   2026-07-17): a secret split across a chunk boundary may be only partially
   redacted — deliberately NOT buffered across chunks"*, echoed by reference at
   `src/cli/run-job.js:1048-1052`. It is cited here as that record and nothing
   more. What it approves is the **decision not to buffer across chunks**, and
   that decision is unchanged by this WP. What round zero measured is that the
   same sentence's description of the consequence — *"may be only partially
   redacted"* — **understates it: the whole credential lands contiguous in the
   durable log, not a fragment** (round-zero logbook §4; independently
   reproduced through actual subprocess pipes by design review round 1). This WP
   records that discrepancy, routes it, and fixes nothing. **No new approval is
   asserted, and nothing in this repo records the owner approving, accepting or
   ratifying the measured whole-credential behaviour.**
   *Cost of overruling toward "this is a new, unapproved exposure":* the four
   `LEAK-WHOLE` probes would have to be held out of this WP until a fix lands,
   which leaves the largest of the seven leaks as the only one with no test —
   the inverse of what a diagnostic package is for.

## Definition of done

0. **DISPATCH PRECONDITION.** (a) The two owner items above travel with this
   package as **recommendations adopted under standing authorization**; any the
   owner reverses by dated amendment is applied to this spec by a committed
   revision — never by a dispatch message, because `scripts/boundary-check.js`
   reads the Deliverables table in this file and nothing a message says changes
   what CI sees. (b) **The design gate is CLOSED at round 1 (approve)**, which is
   what makes this spec `Ready` (`docs/runbooks/codex-review.md`): round zero's
   template-conformance and internal-coherence findings are dispositioned, and
   the round-1 raw was preserved before adjudication at `ddc8e653`
   (`docs/specs/logbook/2026-09-17-secret-sink-wiring-probes-design-r1-astra-raw.json`),
   with the record in
   `docs/specs/logbook/2026-09-17-secret-sink-wiring-probes-round-zero.md` §9.
   Its two caveats are folded in — the synthetic-value-in-CI condition into the
   Security checklist and Implementation notes, the real-temp-file requirement
   into item 1 below. (c) **THE DISPATCHER RE-DERIVES EVERY `file:NNN`
   CITATION.** They are pinned to the base this spec was verified against —
   `main` at **`a47f2546`**, where all 43 distinct citations were re-confirmed
   resolving by a mechanical extractor whose output is pasted in the round-zero
   logbook §10 — and `src/cli/dream.js` and `tests/unit/scheduler-runjob.test.js`
   are files sibling packages land in. Table S is where the numbers live, so what
   a later landing moves is line numbers, not facts; re-derive them into a
   committed revision of this spec rather than into a dispatch message.
   (d) Branch `wp/secret-sink-wiring-probes`.

   **Dated re-pin, 2026-09-17 (a47f2546).** PR #257 landed
   `WP-dream-digest-omits-own-job-alerts`, moving six `src/cli/dream.js` line
   numbers and appending to `tests/unit/scheduler-runjob.test.js`. Every cited
   construct was re-derived **by grepping for the construct**, and every one of
   them still exists, unchanged, at a new line. **Nothing but line numbers
   moved: no construct disappeared, no behaviour changed, no contract in this
   spec is affected — so this is a mechanical re-pin and no new design round is
   owed.** The gate stays CLOSED at round 1 and the status stays `Ready`.

1. All verification steps pass locally; output pasted into the PR body, including
   the seven `ok … (KNOWN DEFECT WD-SINK-…)` lines. **All sixteen probes must be
   run against real temporary files** — each one drives the sink's public entry
   point and reads the artifact back off a real path under its own `mkdtemp`
   root. Intercepted or captured write payloads do NOT satisfy this WP: the
   probes exist to pin what reaches **disk**, and a stubbed writer proves the
   argument, not the file. (Design review round 1 could not reproduce on disk in
   its sandbox and named this as the step implementation owes.) The PR body
   carries the unfiltered results of all three gates, each run bare:
   `npm run red-proofs`, `npm test`, `npm run lint`.
2. Conventional commits; PR titled
   `test(secret-scan): characterization probes for the nine redactOnly call sites (WP-secret-sink-wiring-probes)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. "Discovered issues" must list all seven defect ids —
   `WD-SINK-TRUNC-ALERTS`, `WD-SINK-TRUNC-RUNEV-ARGV`,
   `WD-SINK-TRUNC-RUNEV-FIELD`, `WD-SINK-CHUNK-BRAIN-STDOUT`,
   `WD-SINK-CHUNK-BRAIN-STDERR`, `WD-SINK-CHUNK-RUNJOB-STDOUT`,
   `WD-SINK-CHUNK-RUNJOB-STDERR` — and state plainly that this WP does not fix
   them and that a green suite means they are all still open. The by-hand
   both-sides evidence for the thirteen probes without a Table R declaration is
   pasted here too.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.

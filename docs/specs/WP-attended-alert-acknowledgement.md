---
id: WP-attended-alert-acknowledgement
title: Let the user silence an already-seen alert in the session digest, at a real terminal, without changing what any job verifies
status: In-Review
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004, ADR-0028, ADR-0031]
epic: audit-a7
---

# WP-attended-alert-acknowledgement: the digest banner gets an attended mute

> **The one sentence that governs every decision in this spec:** this WP changes
> **what is rendered**, never **what is verified**. No job refuses differently, no
> exit code changes, no record stops being written, and no code in this WP reads
> the production/dev stance, `.git`, `WIENERDOG_DEV`, or any other signal about
> what kind of install this is.

## Context (read this, nothing else)

Wienerdog is a one-line install that writes configuration files — `CLAUDE.md` /
`AGENTS.md` managed blocks, a markdown memory **vault**, skills, hooks, and
OS-native schedule entries — into a user's Claude Code / Codex CLI setup.
**IRON RULE (ADR-0004): Wienerdog is just files.** No daemons, no servers, no
background process that outlives its job, no telemetry. This WP adds a state
file, a CLI subcommand, and a filter. It starts nothing.

**How a scheduled job runs, and how a failure reaches the user.** The OS
scheduler (launchd / systemd user timers / Task Scheduler) never invokes the app
directly. It invokes the **independent launcher** vendored at
`<core>/launcher/launch.js`, *outside* the mutable app tree at
`<core>/app/current`. Before spawning anything the launcher verifies (ADR-0028):
that `app/current` resolves inside `<core>/app` and is user-owned; that the live
app tree content-addresses to the digest recorded in the job's authorization
**job descriptor**; that the descriptor's production/dev **stance** matches what
is live; and that the re-derived descriptor digest equals the digest bound into
the OS entry. Any mismatch ⇒ a durable alert appended to
`<core>/state/alerts.jsonl`, one line on stderr, exit 1, and **zero** spawn.
`wienerdog sync` and the nightly dream both re-render the **digest** — the
pre-rendered session-context file `~/.wienerdog/state/digest.md` injected at
SessionStart — and any alert on file becomes a `> [!warning]` banner line at the
top of it. That banner is how the user actually finds out a scheduled job failed.

**The problem this WP fixes, with the numbers measured on the maintainer's own
install on 2026-08-01.** `state/alerts.jsonl` holds **119** records, **all** for
the pseudo-job `--catch-up`, and they collapse to exactly **two** distinct
`(job, reason)` pairs (one legacy record from 2026-07-25T19:12:34.322Z, and
**118** identical records from 2026-07-27T13:53:42.303Z through
2026-08-01T10:00:05.159Z — one per hour). The refusal is **correct and by
design**: on that machine `<core>/app/current` is a symlink to the live checkout,
so it legitimately resolves outside `<core>/app`, containment fails, and the
catch-up path refuses. ADR-0028's 2026-07-25 amendment (owner-signed) rules that
this refusal **stands** and that no dev branch may be added to it. What is wrong
is not the refusal — it is that the same permanent, already-understood failure
re-renders as a fresh, incident-shaped warning at the top of **every** session,
carrying advice ("Do not run `wienerdog sync` … Reinstall Wienerdog from a
trusted source, then investigate.") that is right in general and wrong here.

**Why the fix is an attended acknowledgement and not anything cleverer.** The two
obvious repairs both key on the install's stance, and ADR-0028's durable rule
(2026-07-25 amendment §3) forbids exactly that: *no mechanism may choose between
the enforced and the reduced verification path on the basis of a signal an
A7-scoped write can produce — at mint time as well as at fire time.* Making the
refusal text dev-aware would let an attacker who repoints one symlink on a
**production** install downgrade the advice from "reinstall" to "this is just a
dev install"; not registering catch-up on a dev install puts the missed-job
safety net behind the same forgeable oracle, and — decisively — would not remove
one of the 119 records that are already on file, because nothing ever clears
alerts for `--catch-up` (`clearAlerts` runs when a job *succeeds*, and that
pseudo-job never reports success). An **attended acknowledgement** keys on
nothing about the install at all. It is a typed confirmation at a real terminal,
which is not a file write and therefore not the adversary A7 defends against; it
is the same boundary `wienerdog grant` and `wienerdog memory approve` already
use. The full rejection argument is recorded in ADR-0028's **2026-08-01
amendment** and summarized under Implementation notes — you do not need to read
the ADR to implement this.

## Current state

Everything below was read out of this repository at this branch's HEAD. Nothing
here is aspirational.

### 1. The durable alert store — `src/core/alerts.js`

One JSON object per line in `<core>/state/alerts.jsonl`. Every field is coerced
to a string and capped at `MAX_FIELD_CHARS = 2000`, then secret-scrubbed; unknown
keys are **dropped**. The record shape is exactly:

```js
{ job: string, at: string, reason: string, log_hint: string }
```

The three exported functions this WP interacts with:

```js
/** @param {WienerdogPaths} paths @param {{job,at,reason,log_hint}} record */
function appendAlert(paths, record)          // atomic append + compaction to MAX_ALERTS=200 / 512 KiB

/** @param {WienerdogPaths} paths
 *  @returns {Array<{job:string, at:string, reason:string, log_hint:string}>} oldest first */
function readAlerts(paths)                   // missing/unreadable file → []

/** Remove all alerts for `job` (called when that job next succeeds).
 *  @param {WienerdogPaths} paths @param {string} job */
function clearAlerts(paths, job)
```

`clearAlerts` today, verbatim (`src/core/alerts.js:197-207`):

```js
function clearAlerts(paths, job) {
  const remaining = readAlerts(paths).filter((a) => a.job !== job);
  const file = alertsPath(paths);
  if (remaining.length === 0) {
    fs.rmSync(file, { force: true });
    return;
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, remaining.map((a) => JSON.stringify(a)).join('\n') + '\n');
  fs.renameSync(tmp, file);
}
```

Its module exports today:

```js
module.exports = { appendAlert, readAlerts, clearAlerts, ALERTS_FILE, MAX_ALERTS, MAX_FIELD_CHARS, MAX_FILE_BYTES };
```

`clearAlerts` has exactly one production caller: `src/cli/run-job.js:981`
(`clearAlerts(paths, name);` on a successful job run).

### 2. How an alert becomes a banner — `src/core/digest.js:288-309`

```js
function formatAlerts(alerts) {
  if (!alerts || alerts.length === 0) return '';
  /** @type {Map<string, {count:number, first:string, lastReason:string, hint:string}>} */
  const byJob = new Map();
  for (const a of alerts) {
    const cur = byJob.get(a.job) || { count: 0, first: a.at, lastReason: a.reason, hint: a.log_hint };
    cur.count += 1;
    if (a.at < cur.first) cur.first = a.at;
    cur.lastReason = a.reason; // alerts are oldest-first → last wins
    cur.hint = a.log_hint;
    byJob.set(a.job, cur);
  }
  const lines = [];
  for (const [job, s] of byJob) {
    const times = s.count === 1 ? 'has failed' : `has failed ${s.count} times since ${s.first}`;
    lines.push(
      `> [!warning] Wienerdog: the "${job}" job ${times}. Latest error: ${s.lastReason}. ` +
        `Details in ${s.hint}. This note clears automatically when the job next succeeds.`
    );
  }
  return lines.join('\n');
}
```

**`formatAlerts` is NOT a Deliverable and must not be touched.** It renders
whatever array it is handed; the fix is to hand it a filtered array. When the
array is empty it returns `''` and the digest bytes are unchanged — which is why
this WP cannot move any golden fixture.

### 3. The only two places that feed `formatAlerts` its array

Executed: `grep -rn "readAlerts" src bin` returns nine lines — five inside
`src/core/alerts.js` itself (its own definition, its own internal use, two
comments, and the export) and **four** outside it: one `require` plus one call
site in each of `src/cli/dream.js` and `src/cli/sync.js`. So there are exactly
**two** call sites outside the module, and both pass the result straight into
`renderDigest`'s `alerts` option.

`src/cli/sync.js:11` and `:277`:

```js
const { readAlerts } = require('../core/alerts');
// …
    const digest = renderDigest(vaultPath, layout, {
      alerts: readAlerts(paths),
```

`src/cli/dream.js:22` and `:378` (inside the `regenerateDigest` closure):

```js
const { readAlerts } = require('../core/alerts');
// …
      const digest = renderDigest(vaultDir, layout, {
        alerts: readAlerts(paths),
```

There is no third feeder.

### 4. The attended-confirmation mechanism that already ships

`src/cli/grant.js` exports a terminal-only prompt and **`src/cli/memory.js`
already reuses it** — so requiring it from a second CLI module is the
established pattern here, not a new one.

`src/cli/grant.js:205`:

```js
module.exports = { run, defaultPrompt };
```

`src/cli/memory.js:11` and `:63` and `:146`:

```js
const { defaultPrompt } = require('./grant');
// …
  const promptFn = opts.promptFn || defaultPrompt;
// …
  const answer = await promptFn(`Type the word "approve" to confirm ${noun} (anything else cancels): `);
```

`defaultPrompt(question, opts)` returns a `Promise<string>`: it reads from
`process.stdin` when that is a TTY, otherwise it opens the controlling terminal
`/dev/tty`; on any unreachable-terminal case it prints a refusal to stderr and
resolves to `''` (which can never equal a confirmation word). **There is no
environment override, and `--yes` is never honored** — that is the security
boundary (ADR-0007), and this WP inherits it unchanged.

### 5. Private-mode coverage — `src/core/private-fs.js:115-121`

```js
/** The A5-scoped private FILES directly under state/ (0600). */
const A5_PRIVATE_FILE_BASENAMES = [
  'digest.md',
  'alerts.jsonl',
  'transcript-ledger.json',
  'identity-approvals.json',
];
```

`scanPrivateModes` / `repairPrivateModes` walk this list; a file absent from disk
is simply skipped. `writeFilePrivate(dest, data)` (`private-fs.js:279`) writes
0600 atomically (temp + rename), creates the parent 0700, and **refuses** a
pre-existing symlink at `dest`.

### 6. The CLI dispatch table — `bin/wienerdog.js:49-64`

```js
  /** @type {Record<string, () => {run: (argv: string[]) => Promise<void>}>} */
  const commands = {
    init: () => require('../src/cli/init'),
    adopt: () => require('../src/cli/adopt'),
    sync: () => require('../src/cli/sync'),
    update: () => require('../src/cli/update'),
    dream: () => require('../src/cli/dream'),
    schedule: () => require('../src/cli/schedule'),
    'run-job': () => require('../src/cli/run-job'),
    doctor: () => require('../src/cli/doctor'),
    uninstall: () => require('../src/cli/uninstall'),
    gws: () => require('../src/gws/index'),
    grant: () => require('../src/cli/grant'),
    memory: () => require('../src/cli/memory'),
    safety: () => require('../src/cli/safety'),
  };
```

The `USAGE` template literal above it (`bin/wienerdog.js:6-28`) lists one line per
command, two spaces of indent, the name padded to a 12-character column. No test
and no golden fixture asserts the `USAGE` text (executed:
`grep -rn "Commands:" tests docs README.md` returns nothing).

`main()` calls `await loader().run(rest)` and the top-level catch turns a
`WienerdogError` (`src/core/errors.js`) into `wienerdog: <message>` on stderr with
exit 1.

### 7. The unit-test harness shape you will copy — `tests/unit/alerts.test.js:20-32`

```js
/** Isolated temp core; state/ is created lazily by appendAlert. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-alerts-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  return { root, paths };
}

/** @param {string} job */
function rec(job, at, reason) {
  return { job, at, reason, log_hint: `~/.wienerdog/logs/${job}/` };
}
```

### 8. What does NOT exist yet

There is no `alerts` CLI command, no acknowledgement store, and no filtering of
any kind between `readAlerts` and `formatAlerts`. `state/alerts-ack.json` does
not exist and no code references it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

Nine files. New non-test source is ≈ 200 lines across two new modules plus four
small edits (two one-line call-site changes, one array entry, one dispatch entry
plus one usage line, one two-line hook in `clearAlerts`, and one appended
glossary bullet).

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/alert-ack.js | **D1** — the acknowledgement store. Exports exactly `{ ACK_FILE, MAX_ACKS, ackPath, ackKey, readAcks, addAcks, pruneAcksForJob, unacknowledgedAlerts }` and nothing else. Every fact about the file, its schema, its key, its caps and its failure modes comes from **Table A**; every fact about what suppression means comes from **Table B**. Requires only `node:fs`, `node:path`, `node:crypto` and `./private-fs`. **Must not require `./alerts`** (that direction would be a cycle). |
| create | src/cli/alerts.js | **D2** — `wienerdog alerts` (list) and `wienerdog alerts ack`. Exports `{ run }`. The attended-act contract is **Table C**; the exact output strings are in Exact contracts. Reuses `require('./grant').defaultPrompt` — do **not** write a second TTY prompt. |
| modify | bin/wienerdog.js | **D3** — add `alerts: () => require('../src/cli/alerts'),` to the `commands` map (alphabetically first, immediately above `init`) and one `USAGE` line immediately **after** the `doctor` line, matching the existing two-space indent and 12-character name column. Nothing else in this file. |
| modify | src/core/alerts.js | **D4** — `clearAlerts` gains **two** lines: a top-level `const { pruneAcksForJob } = require('./alert-ack');` and a `pruneAcksForJob(paths, job);` call as the **first statement of the function body**, before the `readAlerts` line. Table A's lifecycle row is the contract. **Nothing else in this file changes** — not `appendAlert`, not `readAlerts`, not `sanitizeAlert`, not the caps, not `module.exports`. |
| modify | src/cli/sync.js | **D5** — the single expression at `:277`, `alerts: readAlerts(paths),`, becomes `alerts: unacknowledgedAlerts(paths, readAlerts(paths)),`, plus the import. No other line. |
| modify | src/cli/dream.js | **D6** — the single expression at `:378`, `alerts: readAlerts(paths),`, becomes `alerts: unacknowledgedAlerts(paths, readAlerts(paths)),`, plus the import. No other line. |
| modify | src/core/private-fs.js | **D7** — add the single string `'alerts-ack.json',` to `A5_PRIVATE_FILE_BASENAMES` (`:116-121`), after `'alerts.jsonl',`. No other line in this file. |
| modify | docs/GLOSSARY.md | **D8** — insert the **acknowledged alert** bullet (verbatim block **G1** under Exact contracts) as a new line immediately after the existing `- **fail-loud** …` bullet and immediately before the existing `- **catch-up** …` bullet. Change no existing bullet. |
| create | tests/unit/alert-ack.test.js | **D9** — tests **A1–A13** (Test index). New file; copy the `setup()` helper from `tests/unit/alerts.test.js:20-26`. |

Not Deliverables, deliberately — see "Out of scope" for the reason on each:
`src/scheduler/launcher.js`, `src/core/digest.js`, `src/cli/run-job.js`,
`src/cli/doctor.js`, `src/cli/grant.js`, `src/cli/memory.js`,
`tests/unit/alerts.test.js`, `tests/golden/**`, `README.md`,
`docs/runbooks/scheduler-and-executable-integrity.md`, `docs/THREAT-MODEL.md`,
`docs/adr/0028-scheduler-app-executable-integrity.md`, and
`memory/lessons/inbox.md`.

### Exact contracts

```js
// src/core/alert-ack.js — the complete public surface. Every value below is
// decided by Table A; this block is a MIRROR of it. If a fact here and a fact in
// Table A ever disagree, TABLE A WINS — report it as a spec bug in the PR body.

/** Basename of the acknowledgement store under state/. */
const ACK_FILE = 'alerts-ack.json';
/** Hard cap on stored acknowledgements; a write keeps the NEWEST this many. */
const MAX_ACKS = 100;

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function ackPath(paths)

/** The acknowledgement key for one alert: lowercase hex sha256 over the
 *  canonical JSON of the [job, reason] PAIR. The job is inside the hash, so an
 *  acknowledgement for one job can never suppress another job's alert, and a
 *  single byte of change in `reason` produces a different key (Table B).
 *  @param {string} job @param {string} reason @returns {string} 64 lowercase hex chars */
function ackKey(job, reason)

/** Every VALID acknowledgement record on file, in stored order (oldest first).
 *  FAILS OPEN: a missing, unreadable, non-JSON, wrong-schema or wrong-shaped
 *  file yields [] — which suppresses nothing (Table A). Invalid individual
 *  records are ignored, never repaired and never written back.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @returns {Array<{job:string, key:string, at:string}>} */
function readAcks(paths)

/** Acknowledge every distinct (job, reason) pair in `alerts`. Keys already on
 *  file are NOT re-added and their `at` is left alone, so calling this twice with
 *  the same input is a no-op on the second call. Writes 0600 via
 *  writeFilePrivate. Returns how many NEW records were stored.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {Array<{job:string, reason:string}>} alerts
 *  @returns {{added:number}} */
function addAcks(paths, alerts)

/** Drop every acknowledgement whose `job` equals `job`; delete the file when
 *  none remain. Called by clearAlerts when that job next succeeds, so an
 *  acknowledgement never outlives the alert it silenced (Table A).
 *  Best-effort: never throws out of this function.
 *  @param {import('./paths').WienerdogPaths} paths @param {string} job */
function pruneAcksForJob(paths, job)

/** `alerts` minus every entry whose (job, reason) is acknowledged. Pure: reads
 *  the store, allocates a new array, mutates nothing. A non-array `alerts`
 *  returns []. This is the ONLY suppression point (Table B).
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {Array<{job:string, at:string, reason:string, log_hint:string}>} alerts
 *  @returns {Array<{job:string, at:string, reason:string, log_hint:string}>} */
function unacknowledgedAlerts(paths, alerts)

module.exports = { ACK_FILE, MAX_ACKS, ackPath, ackKey, readAcks, addAcks, pruneAcksForJob, unacknowledgedAlerts };
```

The on-disk file, in full, after acknowledging the two pairs that exist on the
maintainer's install (line-wrapped here for readability; write it with
`JSON.stringify(obj, null, 2)` plus a trailing newline):

```json
{
  "schema": 1,
  "acked": [
    { "job": "--catch-up", "key": "3f0c…64 lowercase hex…9ab1", "at": "2026-08-01T12:04:11.207Z" },
    { "job": "--catch-up", "key": "c7d2…64 lowercase hex…40fe", "at": "2026-08-01T12:04:11.207Z" }
  ]
}
```

```js
// src/core/alerts.js — D4, the ONLY change to this file.
const { pruneAcksForJob } = require('./alert-ack');   // NEW top-level require

function clearAlerts(paths, job) {
  pruneAcksForJob(paths, job);   // NEW: an acknowledgement never outlives its alert (Table A)
  const remaining = readAlerts(paths).filter((a) => a.job !== job);
  // …the rest of the function is UNCHANGED…
}
```

```js
// src/cli/sync.js — D5.  src/cli/dream.js — D6.  Same two edits in each file.
const { unacknowledgedAlerts } = require('../core/alert-ack');   // NEW, next to the existing readAlerts import
// …
      alerts: unacknowledgedAlerts(paths, readAlerts(paths)),    // was: alerts: readAlerts(paths),
```

```js
// src/cli/alerts.js — the complete public surface.
/** `wienerdog alerts` / `wienerdog alerts ack` (Table C).
 *  @param {string[]} argv  the tail after the command word
 *  @param {{promptFn?:(q:string)=>Promise<string>,
 *           paths?:import('../core/paths').WienerdogPaths}} [opts]
 *    code-level test seams only (the grant.js/memory.js model); production
 *    passes none, and `--yes` is never honored.
 *  @returns {Promise<void>} */
async function run(argv, opts = {})

module.exports = { run };
```

Resolve paths exactly as the two shipped attended commands do — `const paths =
opts.paths || getPaths();` with **no argument**, matching `src/cli/memory.js:64`
and `src/cli/grant.js:137`. Do not pass `process.env` and do not read any
environment variable in either new file (verification V8 asserts this).

Subcommand dispatch:

| `argv[0]` | Behaviour |
|-----------|-----------|
| absent, or `'list'` | list; exit 0 |
| `'ack'` | acknowledge; exit 0 whether confirmed or cancelled |
| anything else | throw a `WienerdogError` whose message is block **E1** below, with `<value>` replaced by `argv[0]` |

E1 — the unknown-subcommand message (verbatim; it contains backticks, so it is
given as a fenced block):

```text
unknown alerts subcommand "<value>" — use `wienerdog alerts` or `wienerdog alerts ack`.
```

`bin/wienerdog.js` prefixes a `WienerdogError` message with the literal
`wienerdog:` plus one space and exits 1, so the user sees that prefix followed by
E1.

Unknown flags (including `--yes`) are **ignored**, exactly as `src/cli/grant.js`
`parseArgs` ignores them. There are no flags on this command.

**Grouping.** Both subcommands group `readAlerts(paths)` by the distinct
`(job, reason)` pair, preserving first-seen order, and record for each group:
`count`, the earliest `at`, the latest `at`, and whether its `ackKey` is on file.

Literal `wienerdog alerts` output with nothing on record:

```text
wienerdog: no alerts on record.
```

Literal `wienerdog alerts` output on the maintainer's install (reason text
truncated here with `…` only for this spec — print it in full):

```text
wienerdog: 2 distinct alert(s) on record.

[shown in your digest]  job "--catch-up" — 1 time, 2026-07-25T19:12:34.322Z
  wienerdog: refusing to run "--catch-up" — app/current does not resolve inside …

[shown in your digest]  job "--catch-up" — 118 times, 2026-07-27T13:53:42.303Z to 2026-08-01T10:00:05.159Z
  wienerdog: refusing to run "--catch-up" — app/current does not resolve inside …

Run `wienerdog alerts ack` to stop showing the ones you have already seen in your session digest.
The jobs keep refusing and the records stay on file either way.
```

An acknowledged group prints `[acknowledged]` in place of `[shown in your
digest]`. A group seen once prints `— 1 time, <at>`; a group seen more than once
prints `— <n> times, <first> to <last>`.

`wienerdog alerts ack` with nothing left to acknowledge:

```text
wienerdog: nothing new to acknowledge.
```

`wienerdog alerts ack` otherwise prints the **unacknowledged** groups in the
format above, then asks (via `promptFn`) with exactly this question string:

```text
Type the word "ack" to stop showing the alert(s) above in your session digest (anything else cancels): 
```

(note the single trailing space, which the fence preserves). On any answer other
than the exact string `ack` after trimming:

```text
wienerdog: nothing was acknowledged.
```

On the exact answer `ack`:

```text
wienerdog: acknowledged 2 alert(s). They will not appear in your session digest again unless the wording of the failure changes.
wienerdog: the jobs keep refusing and the records stay on file — run `wienerdog alerts` to see them at any time.
wienerdog: run `wienerdog sync` to re-render your session digest now.
```

The count in the first line is the number of groups that were just acknowledged
(`addAcks(...).added`).

G1 — the glossary bullet (D8), verbatim; it is one source line:

```text
- **acknowledged alert** — a durable alert (one record in `~/.wienerdog/state/alerts.jsonl`) that the user has silenced **in the session digest only**, by running `wienerdog alerts ack` at a real terminal with a typed confirmation. It is keyed on the exact `(job, reason)` pair, so a single byte of change in the failure wording surfaces it again. It changes nothing else: the job still refuses, still exits non-zero, still spawns nothing, and still writes its record; `wienerdog alerts` always lists acknowledged alerts. Acknowledgements for a job are dropped when that job next succeeds. (Not: "dismissed", "muted", "snoozed" — say acknowledged alert.)
```

The `USAGE` line (D3), verbatim; it is one source line inside the template
literal:

```text
  alerts      List job alerts and silence ones you have already seen (typed confirmation)
```

## Contract reference

**Activation trigger — 5 of ADR-0031's 7 fire**, so the discipline is on:
(i) a result **shape** is introduced (the acknowledgement record and the store
schema); (iii) structured **input parsing / schema acceptance** is introduced
(reading a JSON store whose every malformed shape must fail in a stated
direction); (iv) **fallback** behaviour is defined (what a corrupt store does);
(v) an **authority boundary** is crossed — the CLI mints acknowledgements,
`src/core/alerts.js` owns their lifecycle, and the two digest feeders interpret
them; (vii) the **same contract appears in multiple mirrored surfaces** (two new
modules, two call sites, the glossary, the Deliverables table, the acceptance
criteria and the verification greps).

Three canonical tables. **Table A** is the single place the store's facts are
decided. **Table B** is the single place the meaning of suppression is decided.
**Table C** is the single place the attended act is decided. Operative prose
elsewhere in this spec cites them; it does not restate them. If any other surface
in this spec disagrees with its table, **the table wins** — report it as a spec
bug in the PR body rather than following the mirror.

### Table A — the acknowledgement store (canonical)

| Fact | Value |
|------|-------|
| **Path** | `path.join(paths.state, 'alerts-ack.json')`, i.e. `<core>/state/alerts-ack.json` |
| **Written by** | `addAcks` and `pruneAcksForJob` — and nothing else, ever. No scheduled job, no launcher, no `sync`, no `dream`, no model-driven path writes it |
| **Write mechanics** | `writeFilePrivate(ackPath(paths), JSON.stringify(obj, null, 2) + '\n')` — 0600, atomic temp+rename, parent 0700, refuses a pre-existing symlink at the destination |
| **Schema** | `{ "schema": 1, "acked": Array<{job: string, key: string, at: string}> }` — no other top-level key is written and any other key found on read is ignored |
| **`key`** | `ackKey(job, reason)` = `crypto.createHash('sha256').update(JSON.stringify([job, reason])).digest('hex')`. Lowercase hex, 64 chars. `reason` is the exact string stored in `alerts.jsonl` (already length-capped and secret-scrubbed by `sanitizeAlert`) |
| **`at`** | `new Date().toISOString()` at the moment of acknowledgement. Informational only — no code compares it |
| **Order** | stored order is append order (oldest first) |
| **Cap** | `MAX_ACKS = 100`. On write, keep the **newest** 100 (`slice(-MAX_ACKS)`) |
| **Duplicate key** | a `key` already on file is **not** re-added and its existing `at` is **not** rewritten. `addAcks` counts it as not-added |
| **Whole-file parse failure** — missing, unreadable, invalid JSON, not an object, `schema !== 1`, or `acked` not an array | `readAcks` returns `[]` ⇒ **nothing is suppressed**. This is the FAIL-OPEN direction and it is the required one: a corrupt store must never hide a warning |
| **Per-record validation** | a record counts only when `typeof job === 'string'` **and** `/^[0-9a-f]{64}$/.test(key)` **and** `typeof at === 'string'`. Any other record is ignored on read, is not repaired, and is not written back |
| **Lifecycle** | `clearAlerts(paths, job)` calls `pruneAcksForJob(paths, job)` **first**, so an acknowledgement never outlives the alert it silenced. When no records remain the file is removed (`fs.rmSync(file, {force:true})`) |
| **Robustness** | `readAcks` and `pruneAcksForJob` never throw. `addAcks` may throw only what `writeFilePrivate` throws (a symlinked or unwritable destination) — that surfaces at an attended terminal, which is the right place for it |
| **Mode coverage** | `'alerts-ack.json'` is a member of `A5_PRIVATE_FILE_BASENAMES`, so `wienerdog doctor` / `sync` report and repair a loosened mode on it exactly as they do for `alerts.jsonl` |
| **Uninstall** | no manifest entry — like `alerts.jsonl`, it is runtime state created under `state/` and removed with the core. Do not add a manifest entry |

### Table B — what suppression means (canonical)

| Question | Answer |
|----------|--------|
| **What is suppressed** | ONE thing: the presence of a matching alert in the array handed to `renderDigest`'s `alerts` option, i.e. whether it becomes a `> [!warning]` line in `state/digest.md` |
| **What is NEVER suppressed** | the launcher's verification; its refusal; its zero spawn; its non-zero exit; its stderr line; the record it appends to `alerts.jsonl`; `wienerdog alerts` output; anything `wienerdog doctor` reports |
| **Match predicate** | alert `a` is suppressed **iff** `ackKey(a.job, a.reason)` equals the `key` of a **valid** record on file |
| **Reason sensitivity** | the reason string is inside the hash, so one changed byte ⇒ a different key ⇒ the alert renders. There is no prefix match, no substring match, no normalization, no trimming, and no regex |
| **Job sensitivity** | the job name is inside the hash, so an acknowledgement for job A never suppresses job B — including when the two share a reason string |
| **Where applied** | exactly two call sites: `src/cli/sync.js` and `src/cli/dream.js`. `formatAlerts` itself is never changed and never learns about acknowledgements |
| **Failure direction** | any doubt renders the alert. A corrupt store, an unreadable store, a malformed record, or a non-array `alerts` input all end with the alert visible (or nothing at all), never with a hidden warning |
| **Effect when the store is absent** | byte-identical digest output to today. This is why no golden fixture moves |

### Table C — the attended act (canonical)

| Fact | Value |
|------|-------|
| **Command** | `wienerdog alerts ack`. There is no other way to create an acknowledgement |
| **Terminal requirement** | the confirmation is read by `defaultPrompt` imported from `src/cli/grant.js`: `process.stdin` when it is a TTY, otherwise the controlling terminal `/dev/tty`; on an unreachable terminal it prints a refusal and resolves to `''` |
| **Environment override** | none. Do not add one, in any form |
| **Typed word** | the exact string `ack` after `String(answer).trim()`. Any other answer (including `y`, `yes`, `ACK`, `''`) cancels and writes nothing |
| **`--yes`** | ignored — it must never bypass the prompt, exactly as in `wienerdog grant` and `wienerdog memory approve` |
| **What may be acknowledged** | only `(job, reason)` pairs present in `alerts.jsonl` at the moment the command runs, and only after they have been printed in full on stdout. There is no way to acknowledge a pair that has not been shown |
| **Test seams** | `run(argv, opts)` with `opts.promptFn` and `opts.paths` — code-level only, never read from the environment (the `src/cli/memory.js:63` model) |
| **Cancel path** | prints `wienerdog: nothing was acknowledged.` and exits 0. No file is created |

### Mirrored Surface Checklist

Every surface in this spec that mirrors a table above. A finding against a table
updates the table **and every surface listed here** in one pass; a new mirror
found in review is added to this list in the same pass.

Table A (store) mirrors:
- [ ] Deliverables rows D1, D4, D7 (the export list, the `clearAlerts` hook, the private-mode entry)
- [ ] the `src/core/alert-ack.js` JSDoc block under Exact contracts
- [ ] the literal `alerts-ack.json` example under Exact contracts
- [ ] acceptance criteria AC2, AC3, AC4, AC8, AC9
- [ ] verification commands V4, V6, V7
- [ ] Current state §5 (the `A5_PRIVATE_FILE_BASENAMES` excerpt)

Table B (suppression) mirrors:
- [ ] Deliverables rows D5, D6
- [ ] the `unacknowledgedAlerts` JSDoc and the two call-site diffs under Exact contracts
- [ ] the glossary bullet **G1** (restates Table B's meaning in user-facing words)
- [ ] acceptance criteria AC1, AC5, AC6, AC7, AC10
- [ ] verification commands V3, V5
- [ ] Current state §2 and §3 (what `formatAlerts` does and who feeds it)
- [ ] the governing sentence in the blockquote at the top of this spec

Table C (attended act) mirrors:
- [ ] Deliverables row D2
- [ ] the subcommand dispatch table and every literal output block under Exact contracts
- [ ] the glossary bullet **G1** (the phrase "at a real terminal with a typed confirmation")
- [ ] acceptance criteria AC11, AC12
- [ ] verification command V8
- [ ] Current state §4 (the `defaultPrompt` description)

## Implementation notes & constraints

- **Zero new npm dependencies.** Plain Node ≥ 18, no TypeScript in `src/`, JSDoc
  annotations only, no build step (CLAUDE.md).
- **Require direction.** `src/core/alerts.js` requires `./alert-ack`;
  `src/core/alert-ack.js` must **not** require `./alerts`. Introducing that edge
  makes a cycle and is a review-blocking defect.
- **Do not change `formatAlerts`, and do not add an "N suppressed" line to the
  digest.** The whole point is that the digest goes quiet. Discoverability is
  `wienerdog alerts` plus the `USAGE` line, both of which this WP adds.
- **The two rejected designs, and why you must not "improve" this into one of
  them.** ADR-0028's 2026-07-25 amendment §3 (owner-signed) states the durable
  rule: *no mechanism may choose between the enforced (prod) and reduced (dev)
  verification paths on the basis of a signal an A7-scoped write can produce —
  at mint time as well as at fire time.* (1) Making the refusal text
  dev-aware would key on the live containment observation, and an attacker who
  repoints the single symlink `<core>/app/current` on a **production** install
  produces exactly that observation with a scoped write — the banner would then
  reassure the user ("this is just a dev install") at the precise moment a
  repoint attack is in progress. (2) Skipping the catch-up registration on a
  dev-stance install reads the same forgeable oracle at attended `sync`, and
  would silently disable the missed-job safety net on a forged prod install with
  no refusal ever firing. **This WP keys on nothing about the install.** If you
  find yourself adding an `isDev`, a stance check, a `.git` probe, a
  `WIENERDOG_DEV` read, or a special case for the job name `--catch-up`, stop —
  that is out of scope and it is the thing the ADR forbids.
- **Honest boundary, stated so nobody has to claim more than is true.**
  `state/alerts-ack.json` sits at the same write surface as `state/alerts.jsonl`.
  An attacker who can forge an acknowledgement record can already truncate or
  delete `alerts.jsonl` outright — and the launcher's own `appendRefuseAlert`
  documents itself as best-effort (*"the alert is best-effort — the refusal
  (non-zero exit, zero spawn) stands regardless"*). So the acknowledgement adds
  **no capability** to that adversary, and the security guarantee of a refusal
  (zero spawn, non-zero exit) is untouched. Do not write any sentence anywhere
  claiming the acknowledgement store is tamper-proof.
- **Ordering inside `clearAlerts` matters.** `pruneAcksForJob` runs **before**
  the `readAlerts` line, so a throw from the alerts rewrite cannot leave a
  cleared alert with a live acknowledgement behind it.
- **`docs/GLOSSARY.md` is also touched by the Draft spec
  `WP-dev-descriptor-no-tree-hash`**, which edits one parenthetical inside the
  **job descriptor** bullet. That is a different bullet in a different region of
  the file; your insertion point is between **fail-loud** and **catch-up**. Do
  not touch the job-descriptor bullet and the two changes will not conflict.
- **Grouping preserves first-seen order** so the printed list is stable across
  runs. Use a `Map` keyed on `ackKey(job, reason)`; `Map` iteration order is
  insertion order.
- When uncertain: choose the simpler option and record it in the PR body under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] No untrusted identifier flows into a filesystem path. The only path this WP
      constructs is `path.join(paths.state, 'alerts-ack.json')` from a **constant**
      basename — the job name and the reason string never touch a path, a shell,
      or a filename. Do not introduce a per-job acknowledgement file.
- [ ] The job name and reason string are used only as **hash input** and as
      already-sanitized text on stdout. They are never used as an object key, a
      regex, or a lookup index — `readAcks` builds its lookup from the stored
      64-hex `key`, which is pattern-validated before use, so no
      `__proto__`/`constructor`-shaped value can reach a property access.
- [ ] The store fails **open** on every malformed input (Table A) — a suppression
      path that fails closed would hide security warnings, which is the wrong
      direction for this file.
- [ ] The acknowledgement is created **only** through the terminal-only typed
      confirmation of Table C. No environment variable, no flag, and no
      `--yes` may reach it, so no skill, hook, dream, or headless job can mint one.
- [ ] The store is written 0600 through `writeFilePrivate`, which refuses a
      pre-existing symlink at the destination, and is registered in
      `A5_PRIVATE_FILE_BASENAMES` so a loosened mode is reported and repaired.

## Acceptance criteria

- [ ] **AC1** — With no `alerts-ack.json` on disk, `unacknowledgedAlerts(paths, a)`
      returns an array deep-equal to `a`, and the rendered digest is
      **byte-identical** to the digest rendered from `readAlerts(paths)` directly.
- [ ] **AC2** — `addAcks` writes `<core>/state/alerts-ack.json` with
      `schema: 1`, one record per distinct `(job, reason)` pair, each `key`
      matching `/^[0-9a-f]{64}$/`, and mode `0600` on POSIX.
- [ ] **AC3** — Calling `addAcks` twice with the same alerts returns
      `{added: 0}` the second time, and the file's bytes are unchanged (idempotent).
- [ ] **AC4** — `ackKey('a','r') !== ackKey('b','r')` and
      `ackKey('a','r') !== ackKey('a','r ')` (job and reason are both inside the hash).
- [ ] **AC5** — After acknowledging, `unacknowledgedAlerts` drops exactly the
      acknowledged pairs and keeps every other alert, including another job's
      alert whose `reason` is identical.
- [ ] **AC6** — Appending a **new** alert for the same job with a reason that
      differs by one byte makes it visible again through `unacknowledgedAlerts`.
- [ ] **AC7** — A corrupt store fails **open**: for each of `not JSON`,
      `{"schema":2,…}`, `{"schema":1,"acked":"x"}`, and a record whose `key` is
      `"__proto__"`, `unacknowledgedAlerts` returns every alert and throws nothing.
- [ ] **AC8** — `clearAlerts(paths, 'dream')` removes both the `dream` alerts and
      the `dream` acknowledgements, and leaves another job's acknowledgements in
      place; when none remain the ack file is gone from disk.
- [ ] **AC9** — `'alerts-ack.json'` is a member of
      `require('../../src/core/private-fs').A5_PRIVATE_FILE_BASENAMES`.
- [ ] **AC10** — Both digest feeders route through the filter: neither
      `src/cli/sync.js` nor `src/cli/dream.js` still contains the bare expression
      `alerts: readAlerts(paths),`.
- [ ] **AC11** — `wienerdog alerts ack` with a `promptFn` that resolves to
      `'yes'`, `'y'`, `'ACK'` or `''` writes **no** file and prints
      `wienerdog: nothing was acknowledged.`; with `'ack'` it writes the store.
- [ ] **AC12** — `run(['ack'], {promptFn, paths})` passes the exact question
      string of Exact contracts to `promptFn`, and `run(['ack', '--yes'], …)`
      still calls `promptFn` exactly once.
- [ ] **AC13** — `run(['bogus'], {paths})` rejects with a `WienerdogError`; `run([])`
      and `run(['list'])` both resolve and print without creating any file.
- [ ] **AC14** — Running the whole flow twice is idempotent: a second
      `wienerdog alerts ack` on an unchanged `alerts.jsonl` prints
      `wienerdog: nothing new to acknowledge.` and leaves the store byte-identical.

### Test index (all in `tests/unit/alert-ack.test.js`)

| id | `node:test` name (must contain this substring) | proves |
|----|-----------------------------------------------|--------|
| A1 | `alert-ack: no store renders every alert unchanged` | AC1 |
| A2 | `alert-ack: addAcks writes a 0600 schema-1 store` | AC2 |
| A3 | `alert-ack: addAcks is idempotent` | AC3, AC14 |
| A4 | `alert-ack: the key covers both job and reason` | AC4 |
| A5 | `alert-ack: acknowledged pairs are dropped and only those` | AC5 |
| A6 | `alert-ack: a changed reason surfaces again` | AC6 |
| A7 | `alert-ack: a corrupt store fails open` | AC7 |
| A8 | `alert-ack: clearAlerts prunes that job's acknowledgements` | AC8 |
| A9 | `alert-ack: the store is private-mode covered` | AC9 |
| A10 | `alert-ack: the digest is byte-identical with an empty store` | AC1 |
| A11 | `alerts cli: only the typed word ack acknowledges` | AC11 |
| A12 | `alerts cli: --yes does not bypass the prompt` | AC12 |
| A13 | `alerts cli: list and unknown subcommand` | AC13 |

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the whole suite, including every existing test unmodified
npm test

# V2 — lint (markdownlint + shellcheck + shfmt + frontmatter schema)
npm run lint

# V3 — this WP's tests alone (all 13 must appear and pass)
npm test -- tests/unit/alert-ack.test.js

# V4 — the store is written from exactly one module (expect: only src/core/alert-ack.js)
grep -rn "alerts-ack" src bin tests

# V5 — both digest feeders filter, and neither still passes the raw array
grep -n "unacknowledgedAlerts" src/cli/sync.js src/cli/dream.js
grep -n "alerts: readAlerts(paths)" src/cli/sync.js src/cli/dream.js   # expect: NO output, exit 1

# V6 — the lifecycle hook is present and is the first statement of clearAlerts
grep -n "pruneAcksForJob" src/core/alerts.js src/core/alert-ack.js

# V7 — private-mode coverage
node -e "console.log(require('./src/core/private-fs').A5_PRIVATE_FILE_BASENAMES.join(','))"

# V8 — the attended act reuses the shipped TTY prompt and adds no environment override.
# Expect the first grep to show the import + the single call, and the second to print
# NOTHING (exit 1): paths come from `getPaths()` with no argument, and neither new file
# reads an environment variable.
grep -n "defaultPrompt" src/cli/alerts.js
grep -n "process.env" src/cli/alerts.js src/core/alert-ack.js   # expect: NO output, exit 1

# V9 — nothing this WP touches reads the install stance
grep -rn "isDev\|WIENERDOG_DEV\|stance\|\.git" src/cli/alerts.js src/core/alert-ack.js   # expect: NO output, exit 1

# V10 — the launcher and the digest renderer are untouched
git diff --stat -- src/scheduler/launcher.js src/core/digest.js tests/golden   # expect: NO output

# V11 — the new command is reachable
node bin/wienerdog.js alerts
node bin/wienerdog.js help | grep alerts
```

## Out of scope (do NOT do these)

- **Any stance-dependent behaviour, anywhere.** No dev branch in
  `verifyCatchup`, no stance-shaped refusal text, no skipping the catch-up
  registration on a dev install, no `isDevCheckout`, no `.git` probe, no
  `WIENERDOG_DEV` read, and no special case for the job name `--catch-up`.
  Rejected on security grounds in ADR-0028's 2026-07-25 amendment §2/§3
  (owner-signed) and again in its 2026-08-01 amendment; see Implementation notes
  for the argument in full.
- **`src/scheduler/launcher.js`, in any form.** Its refusal text and its remedy
  classes belong to `WP-refusal-remedy-discriminator` (Done). Do not open it and
  do not edit it.
- **Bounding, collapsing or de-duplicating records in `alerts.jsonl`.** This WP
  treats the log exactly as it finds it. There is a real, separate defect here —
  the launcher's own `appendRefuseAlert` (`src/scheduler/launcher.js:172-204`) is
  the **one** writer of `alerts.jsonl` that applies **no** bound, so the file
  grows without limit on the launcher path (≈ 480 bytes/record × 24 records/day
  on an hourly catch-up refusal), and when an app-side `appendAlert` does run, its
  newest-200 compaction lets a repeating refusal crowd **older** alerts for other
  jobs out of the history. It is deliberately **not** fixed here, and the obvious
  fix is deliberately **not** the one to reach for: collapsing consecutive
  identical records to one would make `formatAlerts` report *"has failed"* for a
  job that has genuinely failed on 118 consecutive occasions, understating a real
  recurring failure — a worse defect than the one it cures. A correct fix either
  gives the launcher the same record/byte bound the app-side writer already has,
  or extends the record schema with a count; both need their own WP and their own
  review. Note it under "Discovered issues" in the PR body; do not fix it.
- **Changing `formatAlerts` or any digest text**, including adding a "some alerts
  are hidden" line. A digest golden fixture moving is a defect in this WP.
- **`wienerdog doctor` reporting acknowledged alerts.** Worth doing; a separate,
  later WP. `wienerdog alerts` is this WP's discovery surface.
- **README, runbook and threat-model prose about the new command.** A `wd-docs`
  follow-up, deliberately not bundled so this can ship today. Do not edit
  `README.md`, `docs/runbooks/scheduler-and-executable-integrity.md` or
  `docs/THREAT-MODEL.md`.
- **An "unacknowledge" / "clear" subcommand, expiry, per-index selection, or
  flags of any kind.** `wienerdog alerts ack` acknowledges everything it just
  printed. Anything more is speculative configurability.
- **Editing `memory/lessons/inbox.md`** — report lessons as bullets in the PR
  body instead (CLAUDE.md).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(alerts): attended acknowledgement for already-seen alerts (WP-attended-alert-acknowledgement)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

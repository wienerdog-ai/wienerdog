---
id: WP-a9-private-modes-repair
title: Extend the private-modes predicate to the whole mechanics root — secrets/, grants, tokens, client JSON, exec pins — so a permissive-umask install and a legacy 0755/0644 upgrade both end private
status: In-Review
model: opus
size: M
depends_on: [WP-154]
adrs: [ADR-0004, ADR-0024]
epic: audit-a9
---

# WP-a9-private-modes-repair: Full-root private modes + upgrade repair (audit A9, code part)

## Context (read this, nothing else)

Wienerdog's **canonical core** is `~/.wienerdog/` — config, state, secrets,
logs, and the install manifest. **IRON RULE (ADR-0004): Wienerdog is just
files.** Everything it writes to a user's machine must be private to the owner:
directories `0700`, sensitive files `0600`, **independent of the user's umask**
(a permissive `umask 022` or `000` must not leak a token as world-readable), and
**repairable** — a machine that predates a hardening must be fixed on the next
`sync`/`doctor`, not left insecure.

The 2026-07-15 audit action **A5** (ADR-0024) shipped the private-modes
machinery in `src/core/private-fs.js`: `0700` dirs / `0600` files via an explicit
`chmod` that defeats a permissive umask, plus a single read-only predicate
(`insecureEntries`) that three surfaces share so they can never disagree —
`doctor` WARNs, `sync --dry-run`'s would-repair count, and the digest's
insecure-modes banner. But A5 was **deliberately scoped narrow**: its own module
header records that it covers **only** an explicit set (core, state, logs, dream
scratch, quarantine; and the files `digest.md`, `alerts.jsonl`,
`transcript-ledger.json`, `identity-approvals.json`) and **"never walks into
`secrets/`, GWS token/grant/client files, config.yaml, the manifest, or scheduler
state — those are audit action A9's scope."**

This WP closes that A9 scope. Audit action **A9** (P1) requires:

> - "Make the whole Wienerdog mechanics root private by default where compatible;
>   explicitly protect state, logs, digest, alerts, scratch, **grants, tokens,
>   and client JSON**."
> - "Repair existing modes on doctor/sync rather than relying on `mkdir(mode)`
>   for pre-existing directories."
>
> A9 acceptance (this WP's half): "Fresh install under permissive umask **and**
> an upgrade from 0755/0644 state both end with the declared private modes."

**Gap analysis (verified against the live code — do this, don't rediscover it).**
The **write** paths for the *credential* artifacts are already umask-independent
`0600`: GWS tokens/client JSON via `src/gws/client.js`'s temp+rename+chmod-`0600`
writer; the broker grant store, the executable pins (WP-154), and run evidence
via `private-fs.writeFilePrivate` (`0600`). So the **fresh-install-under-
permissive-umask** half is already satisfied *for those files at write time*.

Three gaps remain, and this WP closes all three:

1. **The shared predicate/repair set does not enumerate the A9 artifacts.**
   `insecureEntries` / `repairPrivateModes` / `scanPrivateModes` do **not** list
   `secrets/`, the tokens/client JSON, or the grants/pins — so a machine
   installed **before** those writers were `0600` (a legacy `0644` token, a
   `0755` `secrets/`, a legacy grant store) is **never detected by doctor, never
   repaired by sync, never bannered in the digest**. The **upgrade-repair** half
   of the acceptance is unmet for the entire `secrets/` + grants/pins set.
2. **The per-run log writers — file AND directory — are NOT umask-independent
   (Codex round-1 + round-2 findings).** Two sub-gaps, same class:
   - **The log FILE stream is opened with a bare `fs.createWriteStream` (no
     `mode`)**, so under a permissive umask it lands world-readable
     (`0666 & ~umask`): `src/cli/run-job.js:552` (`fs.createWriteStream(logFile)`)
     and `src/cli/dream.js:340` (`fs.createWriteStream(<date>.log, { flags: 'a' })`).
   - **The log DIRECTORY is created with a bare `fs.mkdirSync(…, {recursive:true})`
     (no `mode`)**, so under `umask 000` the `logs/<job>` dir lands `0777`:
     `src/cli/run-job.js:550` (`fs.mkdirSync(logDir, { recursive: true })`) and
     `src/cli/dream.js:339` (`fs.mkdirSync(logDir, { recursive: true })`).
   Logs **are** a declared private artifact (they are in the A5 dir/`*.log`
   walk), so the A9 acceptance "fresh install under permissive umask ends with the
   declared private modes" is **violated for logs at write time** — the earlier
   "no writer changes" framing was wrong for logs. This WP fixes **both** writers:
   the directory via `mkdirPrivate(logDir)` (`0700`) and the file via a shared
   **fail-closed** private log-stream helper (`0600`) — so a fresh install is
   private the instant the log dir/file is opened, not only after the next `sync`
   repairs it.
3. **The shared predicate only catches *loosened* modes, not *over-tight* /
   invalid ones (Codex round-2 finding).** `insecureEntries` tests
   `(mode & 0o077) !== 0` — it flags a group/world bit but treats a
   traversal-broken `0600` or `000` `secrets/` dir as "clean." A `0600` `secrets/`
   (no owner-execute → cannot be traversed) or a `000` `secrets/` is a
   **non-functional credential store**, yet doctor/`sync --dry-run` report it as
   fine and repair never fixes it. This WP switches the predicate to
   **expected-mode equality** — the enumerator carries each entry's expected mode
   (dirs `0700`, files `0600`) and the predicate flags the full
   `(mode & 0o777) !== expectedMode` deviation — so over-tight and invalid modes
   are detected and repaired too, and the doctor message stops speaking only of
   "readable by other users."

This WP therefore (a) extends the shared predicate to cover the A9 set — the same
three surfaces that already handle the A5 set now repair, warn, and banner the A9
set for free — (b) makes the log **directory and file** private at write time
(fail-closed), and (c) hardens the predicate to expected-mode equality so
over-tight modes cannot masquerade as clean.

**Iron-rule/no-scope-creep note.** The core directory is *already* `0700` (it is
in the A5 dir set), so every file under it is protected from **other users** by
directory traversal today; this WP adds the explicit per-file `0600` guarantee
and its **repair** for the credential-bearing files, which is defense-in-depth
and the literal A9 requirement, not the whole-disk privacy claim.

## Current state

**`src/core/private-fs.js`** (the A5 module). Key shapes to extend:

```js
const A5_PRIVATE_DIRS = (paths) => [
  paths.core, paths.state, paths.logs,
  path.join(paths.state, 'dream-scratch'),
  path.join(paths.state, 'quarantine'),
];
const A5_PRIVATE_FILE_BASENAMES = [
  'digest.md', 'alerts.jsonl', 'transcript-ledger.json', 'identity-approvals.json',
];

// internal, NOT exported — the single enumerator behind all three surfaces:
function listA5Entries(paths) { /* returns {dirs, files}; walks logs/<job>/*.log,
  dream-scratch/*.json, quarantine/*; NEVER walks secrets/ */ }

function repairPrivateModes(paths) { /* dirs→0700, files→0600 for the enumerated
  set; returns {changed} */ }
function insecureEntries(paths) { /* READ-ONLY list of enumerated entries with
  (mode & 0o077) !== 0; win32→[]; the shared predicate */ }
function scanPrivateModes(paths) { /* {insecure: insecureEntries().length} */ }

module.exports = { mkdirPrivate, writeFilePrivate, repairPrivateModes,
  scanPrivateModes, insecureEntries, A5_PRIVATE_DIRS, A5_PRIVATE_FILE_BASENAMES };
```
`chmodIfNeeded(p, mode)` (best-effort, win32 no-op, returns true iff changed),
`listFiles(dir, keep)`, and the `WIN32` const already exist in the module.

**Where the A9-scoped artifacts live** (verified):
- `paths.secrets` = `<core>/secrets/` — created `0700` by `src/cli/init.js`
  (mkdir+chmod) and by `src/gws/client.js` `ensureSecretsDir` (`mkdir …mode
  0o700`). Files inside (all written `0600` at write time):
  - `google-token-read.json`, `google-token-draft.json`, `google-token-send.json`,
    `google-token-calendar.json`, `google-token.json` (**tokens**),
  - `google-client.json` (**client JSON**).
- `paths.state` = `<core>/state/`. Sensitive files there **not** in the A5 set:
  - `broker-grants.json` (**grants**; written `0600` via `writeFilePrivate` —
    `src/gws/broker/grant-store.js`),
  - `exec-pins.json` (**executable pins**; written `0600` via `writeFilePrivate`
    — `src/core/exec-identity.js`, **introduced by WP-154**),
  - `run-evidence.jsonl` (written `0600` via `writeFilePrivate`).
- The four **metadata** files — `paths.config` (`<core>/config.yaml`),
  `paths.manifest` (`<core>/install-manifest.json`), `state/schedule.json`, and
  `state/watermarks.json` — are **not** credential-bearing (vault path / model /
  file list / processing markers), but per the Codex round-1 owner decision they
  are now **in** the predicate/repair/scan set (doctor detects, sync repairs to
  `0600`) while their **writers stay unchanged**; see the dated decision in
  Implementation notes. `config.yaml` and `install-manifest.json` live at the
  **core root**; `schedule.json`/`watermarks.json` live under `state/`.

**The per-run log writers (round-1 + round-2 findings).** Each site creates the
log **directory** and the log **stream** with a bare, mode-less call, so a
permissive umask leaks both the dir (`0777`) and the file (`0666`):
- `src/cli/run-job.js:550` — `fs.mkdirSync(logDir, { recursive: true });`
  (`logDir` = `logs/<name>/`) and `:552` — `const logStream =
  fs.createWriteStream(logFile);` (`logFile` = `logs/<name>/<runStamp>.log`).
- `src/cli/dream.js:339` — `fs.mkdirSync(logDir, { recursive: true });`
  (`logDir` = `logs/dream/`) and `:340` — `const logStream =
  fs.createWriteStream(path.join(logDir, \`${date}.log\`), { flags: 'a' });`
  (append — a **pre-existing** log file keeps its old mode unless explicitly
  re-chmodded).

`mkdirPrivate(dir)` already exists and is exported (creates recursive with
`0700` + a defeat-the-umask chmod); the dir fix is a one-call swap. The file fix
needs the new fail-closed `createLogStreamPrivate` (below).

**`src/core/private-fs.js` internals available to reuse:** `chmodIfNeeded(p,
mode)` (best-effort, win32 no-op, returns true iff changed) and the module-level
`WIN32` const already exist (they are **not** currently exported).

**`src/cli/sync.js`** already calls `scanPrivateModes(paths)` and
`repairPrivateModes(paths)` on a real (non-dry-run) sync, and reports
`insecureModes: scanPrivateModes(paths).insecure` — extending the predicate flows
through this **unchanged**.

**`src/cli/dream.js`** already reports `insecureModes: scanPrivateModes(paths)
.insecure` in the digest render — the banner extends **unchanged**.

**`src/cli/doctor.js`** has TWO relevant blocks:
1. A **dedicated `secrets/` directory check** (POSIX): warns if
   `fs.statSync(paths.secrets).mode & 0o777 !== 0o700`, and a hard `fail` if the
   dir is missing. It does **not** check the token/client **files** inside.
2. The **shared A5 predicate loop**: `for (const p of insecureEntries(paths))
   check('warn', \`${p} is readable by other users — run 'wienerdog sync' …\`)`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/private-fs.js | (a) Extend the single internal enumerator to the union of the A5 set **and** the A9 set: `secrets/` dir (`0700`), every regular file directly under `secrets/` (`0600`), the sensitive `state/` files `broker-grants.json`/`exec-pins.json`/`run-evidence.jsonl` (`0600`), **each existing `logs/<job>` subdirectory (`0700`)**, **and** the four metadata files `config.yaml`/`install-manifest.json` (core root) + `state/schedule.json`/`state/watermarks.json` (`0600`, repair-only per the dated decision below). The enumerator carries each entry's **expected mode** (dirs `0700`, files `0600`). Add the A9 constants and export them alongside the A5 ones. `repairPrivateModes` is **fixed-point directory repair then a single file pass** (round-3 + Codex G1): it repairs every discoverable private **dir** to `0700` and **re-enumerates**, looping until the discoverable dir set stops growing (a single enumeration — or a fixed pass count — cannot see a `0644` file trapped inside a `000` `secrets/`, nor one nested under `logs/`=000 → `logs/<job>`=000, because `readdirSync` fails while a parent is unreadable and returns `[]`); only after the dir set reaches its fixed point does ONE file pass chmod **files** to `0600`, so a token trapped under any nesting depth is reached in the single call (bounded by a defensive cap that aborts fail-closed, never a silent partial repair). `insecureEntries`/`scanPrivateModes` flag the full `(mode & 0o777) !== expectedMode` deviation (over-tight included) — names/signatures unchanged, now over the union. (b) Add and export the **fail-closed** `createLogStreamPrivate(file, opts)` — the shared `0600` log-stream helper the two log writers call (aborts the write if it cannot secure the fd; contract below). |
| modify | src/cli/run-job.js | The two log sites **plus the minimal structural move that routes a log-open failure through run-job's EXISTING fail-loud branch (R4-A, round-4)** — no new alerting plumbing. (i) Swap line 550's `fs.mkdirSync(logDir, {recursive:true})` → `mkdirPrivate(logDir)` (dir `0700`) and line 552's `fs.createWriteStream(logFile)` → `createLogStreamPrivate(logFile)` (file `0600`). (ii) **Move that `mkdirPrivate(logDir)` + `createLogStreamPrivate(logFile)` pair INSIDE the existing `try` block** (the one that currently starts at ~line 560 and whose `catch (err) { failure = err }` feeds the step-7 error-watermark + `failLoud` + `throw` branch at ~:664–672). Today the open sits OUTSIDE/BEFORE that `try` (:548–552), so a throw from `createLogStreamPrivate`/`mkdirPrivate` escapes uncaught — in a normal run it writes **no** error watermark and fires **no** alert, and in catch-up it is swallowed by `catchUp`'s `catch` (~:710) under a now-false "runJob already failed loud" comment. Moving the open inside the `try` makes the throw hit the existing failure branch. (iii) Declare `let logStream = null;` **before** the `try` and guard the `finally`'s close as `if (logStream) await endStream(logStream);` (the open may now throw before `logStream` is assigned). `rotateLogs` (best-effort — returns on a missing/!dir logDir) and the skill-evidence block (already `try`-wrapped) tolerate the failure path unchanged. Touch nothing else in this file. |
| modify | src/cli/dream.js | **ONLY** the two log sites: line 339's `fs.mkdirSync(logDir, {recursive:true})` → `mkdirPrivate(logDir)`, and line 340's `fs.createWriteStream(<date>.log, { flags: 'a' })` → `createLogStreamPrivate(<date>.log, { flags: 'a' })`. Touch nothing else in this file. |
| modify | src/cli/doctor.js | Fold the dedicated `secrets/`-dir `0700` check into the shared predicate: the `insecureEntries` loop now covers the `secrets/` dir **and** its files (and flags an over-tight `secrets/` too), so remove the redundant mode-comparison warn (keep the **"secrets directory missing"** hard `fail`). Update the shared-loop warn message so it no longer speaks only of "readable by other users" — it now covers wrong permissions in either direction (expected `0700`/`0600`). Single predicate, three surfaces — the module's stated invariant. |
| modify | tests/unit/private-fs.test.js | Add the A9 cases below (secrets dir+files, grants/pins repair, the four metadata files repaired, **each `logs/<job>` dir repaired to `0700`**, **over-tight `0600` and `000` `secrets/` flagged + repaired to `0700`**, **the COMBINED cases: a `000` `secrets/` containing a `0644` token/client file, AND two nested unreadable levels (Codex G1: `logs/`=000 → `logs/<job>`=000 → `0644` log; `core/`=000 → `secrets/`=000 → `0644` token) → a SINGLE `repairPrivateModes` call chmods BOTH the dir(s) to `0700` and the trapped file(s) to `0600` (fixed-point dir repair), and a follow-up `scanPrivateModes` returns `{insecure: 0}`**, permissive-umask, upgrade from 0755/0644, win32 no-op) **and** `createLogStreamPrivate` cases: fresh file under `umask 000` → `0600`; a pre-existing `0666` append target → `0600`; **fchmod-fails → helper throws and ZERO log bytes are written**; win32 no-op (plain stream). |
| modify | tests/unit/scheduler-runjob.test.js | (a) Under a permissive umask, assert the per-run log **dir** (`0700`) **and** file (`0600`) written by run-job's real writer path (fresh-install acceptance runs the **actual** writer, not just the predicate). (b) **R4-A wiring tests (round-4):** force a log-open failure through the **real** run-job path — via a real filesystem condition, **no new run-job seam** (e.g. pre-create a regular **file** at the `logs/<job>` path so `mkdirPrivate(logDir)` throws, or otherwise make the private open fail) — and assert, with an injected `opts.sendAlert` stub, that (i) **`runJob` writes the `last_status:'error'` watermark** (`readScheduleState`) **and fires the alert** (the stub is called), then rejects; and (ii) **`catchUp`** over that same overdue job likewise leaves the error watermark **and** the alert (proving `runJob` failed loud **before** `catchUp`'s `catch` swallows the throw) and still returns, marking the job failed. |
| modify | tests/integration/dream.test.js | Under a permissive umask, assert the dream's log **dir** (`0700`) **and** `<date>.log` (`0600`) written by dream's real writer path, including the append-into-a-legacy-`0666`-file case. |
| modify | tests/unit/doctor.test.js | Assert a group/other-readable **or over-tight** `secrets/` dir, token file, or metadata file is WARNed via the unified predicate; assert the missing-secrets `fail` still fires. |
| modify | tests/unit/init.test.js | **Fix-pass addition (2026-07-20):** the "pre-existing `secrets/` left at its own mode" test encoded the *pre-A9* boundary (init's embedded `sync` never re-permissioned `secrets/`). Widening the shared repair predicate makes that embedded `sync` correctly repair a legacy `0755` `secrets/` → `0700`, so the test must expect the repaired mode. Minimal amendment only — flip the mode expectation (`0755`→`0700`) with an explanatory comment; the manifest-ownership assertion is unchanged. This file was omitted from the original table because the spec did not account for init's embedded sync exercising the extended repair (a predicate-widening WP leaks into every flow that transitively runs `sync`). |

### Exact contracts

**`src/core/private-fs.js` — the extension.** Keep the A5 exports and the
single-predicate architecture; add the A9 set and union it into the one internal
enumerator (rename it if you like — it is not exported — but keep it the sole
source for all three surfaces so they can never disagree):

```js
/** A9-scoped private DIRECTORIES (0700): the credential store. `secrets/` is
 *  where GWS OAuth tokens + client JSON live (A9). Repaired, never created here.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
const A9_PRIVATE_DIRS = (paths) => [paths.secrets];

/** A9-scoped private FILES directly under state/ (0600): grants, exec pins, run
 *  evidence, plus the two metadata files schedule.json/watermarks.json
 *  (repair-only, see the dated decision — their writers are NOT changed).
 *  (Tokens/client JSON are matched by walking secrets/ for every regular file —
 *  no fixed basename list, so a new google-token-*.json is covered
 *  automatically.) */
const A9_PRIVATE_STATE_FILES = [
  'broker-grants.json',
  'exec-pins.json',
  'run-evidence.jsonl',
  'schedule.json',
  'watermarks.json',
];

/** A9-scoped private FILES at the CORE ROOT (0600): the two non-credential
 *  metadata files (repair-only — writers unchanged). Their absolute paths are
 *  `paths.config` and `paths.manifest`; enumerate by those, not by joining a
 *  basename onto state/. */
const A9_PRIVATE_CORE_FILES = (paths) => [paths.config, paths.manifest];
```

The enumerator, extended, returns the **union** of the A5 and A9 sets, and now
**carries each entry's expected mode** (dirs `0700`, files `0600`) so the
predicate can flag over-tight modes (finding 7). Whether you return
`{dirs, files}` (dirs implicitly expect `0700`, files `0600`) or a flat
`[{path, expectedMode}]` list is the implementer's call — the invariant is that
**one** enumerator feeds all three surfaces and every entry has a known expected
mode. The union is:
- dirs (expected `0700`): the A5 dirs **plus** every existing `A9_PRIVATE_DIRS`
  entry (`secrets/`) **plus every existing `logs/<job>` subdirectory** (finding 8
  — matched by reading `paths.logs` for its subdirectories, the same one-level
  layer whose `*.log` files the A5 walk already covers);
- files (expected `0600`): the A5 files **plus** every existing
  `A9_PRIVATE_STATE_FILES` file under `state/` **plus** every existing
  `A9_PRIVATE_CORE_FILES` entry (`config.yaml`, `install-manifest.json` at the
  core root) **plus every regular file directly under `secrets/`** (one level,
  matched by `listFiles(paths.secrets, () => true)` — this is how the tokens +
  client JSON are covered without hard-coding their names).

Export the A9 constants (`A9_PRIVATE_DIRS`, `A9_PRIVATE_STATE_FILES`,
`A9_PRIVATE_CORE_FILES`) alongside the A5 ones. (Naming is the implementer's
call; keep the single-enumerator invariant.)

**Predicate = expected-mode equality (finding 7).** `insecureEntries` must flag
`(fs.statSync(p).mode & 0o777) !== expectedMode` for each entry — **not** the old
`(mode & 0o077) !== 0`. This catches a loosened mode (`0755` dir, `0644` file)
**and** an over-tight/invalid one (a `0600` or `000` `secrets/` that cannot be
traversed — a broken store). `repairPrivateModes` chmods each flagged entry to
its **expected** mode (not a fixed 0700/0600 by guess). `win32 → []` unchanged.

**Repair is TWO-PHASE (round-3 finding).** A single up-front enumeration cannot
see a `0644` credential file **trapped inside a `000` (or otherwise
non-executable) `secrets/`**: the enumerator walks `secrets/` with
`listFiles(paths.secrets, …)`, whose `fs.readdirSync` **fails while the dir is
unreadable and returns `[]`** (verified — `private-fs.js` `listFiles` catches and
returns `[]`), so the file inside is never enumerated. A one-pass repair would
then chmod the **dir** to `0700` but never touch the `0644` file — leaving a
world-readable token until the **next** sync, breaking the single-sync `0600`
guarantee. So `repairPrivateModes` MUST:
1. **Phase 1 — dirs first.** Chmod every enumerated private directory (the A5
   dirs, `secrets/`, every `logs/<job>`) to its expected `0700`. This makes a
   `000`/`0644` `secrets/` traversable again.
2. **Phase 2 — re-enumerate, then files.** **Re-run the file enumeration** (so the
   now-`0700` `secrets/` yields its contents) and chmod every enumerated file to
   its expected `0600`.
Both phases count their changes into the returned `{changed}`. The result: a
**single** `repairPrivateModes` call over a `000` `secrets/` containing a `0644`
token fixes **both** the dir and the file, and a follow-up `scanPrivateModes`
returns `{insecure: 0}`. (Keep the single-enumerator invariant: phase 2 re-calls
the same enumerator — or its file-only half — that feeds all three surfaces; do
not introduce a second, parallel secrets walk.)

**AMENDED 2026-07-20 (Codex G1) — the directory repair is a FIXED-POINT LOOP,
not two fixed phases.** Two phases close exactly ONE level of unreadable
directory. They are **insufficient for two (or N) nested unreadable levels**:
`logs/`=000 hiding `logs/<job>/`=000 hiding a `0644` log (and, at the core root,
`core/`=000 hiding `secrets/`=000 hiding a `0644` token) — phase 1 opens only
the outer dir, phase 2 discovers the inner dir but computes its file list while
it is *still* `000` (→ `[]`) and then chmods it, so the trapped file stays
`0644` until the next sync: a **fail-open in a security guard**. The fix is
structural, not a hardcoded third pass: **repair every discoverable private dir
to `0700` and RE-ENUMERATE, repeating until the discoverable dir set stops
growing** (the set is monotonic — a chmod only reveals more — and bounded by the
finite, shallow tree, so it converges; a defensive iteration cap guards a
pathological spin and, if ever hit, ABORTS fail-closed rather than reporting a
partial repair). Only **after** the directory set reaches its fixed point does
**one** fresh file-enumeration pass chmod files to `0600`. So a token trapped
under **any** nesting depth is reached in the single `repairPrivateModes` call.
The single-enumerator invariant holds — the dir loop and the file pass both
derive from the same `listPrivateDirs`/`listPrivateEntries` that feed the three
read surfaces (this also removes the redundant per-iteration `secrets/` file
walk the old phase-1 full enumeration incurred).

**The shared private log-stream helper `createLogStreamPrivate` — FAIL-CLOSED
(round-2 finding 6).** The two log writers must open their stream `0600`
regardless of umask, including when appending into a **pre-existing** file (whose
mode a fresh `createWriteStream(mode)` would not change). Crucially, if the mode
cannot be secured, the helper must **abort the write** — it must **never** fall
back to writing into a world-readable file. The POSIX path therefore opens the fd
synchronously, `fchmodSync`es **that fd** (so there is no path-based TOCTOU and
the stream uses the already-verified fd), and on any chmod/fchmod failure closes
the fd and **throws** (the job fails loudly and surfaces through run-job's
existing error path — see the rationale note below):

```js
const { WienerdogError } = require('../core/errors'); // add this import

/** Open a per-run log stream that is ALWAYS owner-only (0600), independent of
 *  umask and of a pre-existing file's mode — or FAIL: it never returns a stream
 *  onto a file it could not secure to 0600.
 *  POSIX: openSync(file, flags, 0o600) → fchmodSync(fd, 0o600) (covers the
 *    append-into-a-legacy-0666 case, on the fd not the path); on fchmod failure
 *    closeSync(fd) and THROW (never write into a world-readable file). The
 *    returned stream is built on the ALREADY-VERIFIED fd.
 *  win32: no mode/chmod semantics — plain stream (POSIX-only guarantee, matching
 *    the rest of this module).
 *  @param {string} file  absolute log path (its dir already exists — mkdir is
 *    the caller's job, now mkdirPrivate)
 *  @param {{flags?: string, openSync?, fchmodSync?, closeSync?}} [opts]
 *    the *Sync seams are test injection only (to force an fchmod failure)
 *  @returns {import('fs').WriteStream}
 *  @throws {WienerdogError} if the fd cannot be secured to 0600 (POSIX) */
function createLogStreamPrivate(file, opts = {}) {
  const flags = opts.flags || 'w';
  if (WIN32) return fs.createWriteStream(file, { flags });
  const openSync = opts.openSync || fs.openSync;
  const fchmodSync = opts.fchmodSync || fs.fchmodSync;
  const closeSync = opts.closeSync || fs.closeSync;
  const fd = openSync(file, flags, 0o600); // atomic create-with-0600
  try {
    fchmodSync(fd, 0o600); // enforce 0600 even on a pre-existing append target
  } catch (e) {
    try { closeSync(fd); } catch { /* best-effort close */ }
    throw new WienerdogError(
      `refusing to write log ${file}: could not secure it to 0600 (${e && e.message})`,
    );
  }
  return fs.createWriteStream(file, { fd }); // stream on the verified fd
}
```

`run-job.js` becomes `fs.mkdirSync(logDir, {recursive:true})` →
`mkdirPrivate(logDir)` and `const logStream = fs.createWriteStream(logFile)` →
`const logStream = createLogStreamPrivate(logFile)`; `dream.js` the analogous two
swaps with `{ flags: 'a' }` on the stream. In `run-job.js` **the open pair must
also move inside the existing `try`** (R4-A) so its throw reaches the fail-loud
branch — declare `let logStream = null;` before the `try`, do the
`mkdirPrivate`+`createLogStreamPrivate` at the top of the `try`, and guard the
`finally` close with `if (logStream) …`. Nothing else in those two files changes.

**Why the move is required (R4-A, round-4 — supersedes the earlier "surfaces
through run-job's existing fail-loud path, no new handling" claim).** That earlier
claim was **wrong about the current code**: the log stream is opened at
`run-job.js:552`, **before** the `try` block that starts at `:560`. A throw from
`createLogStreamPrivate` (or `mkdirPrivate`) at that point is **not** caught by the
`catch (err) { failure = err }` at `:605`, so it never reaches the
`writeScheduleState({last_status:'error'})` + `failLoud` branch at `:664–672`:
**a normal run leaves no error watermark and fires no alert**, and in **catch-up**
mode the `catch` at `~:710` swallows it under the comment "runJob already failed
loud" — which is false, because runJob did **not** fail loud (it threw before the
loud path). Moving the open inside the `try` is what makes the round-2 fail-loud
guarantee actually hold. This is **not** new alerting plumbing — it reuses the
existing error branch; the only structural change is the try-boundary move plus the
`logStream` null-guard.

**Rationale for fail-closed (owner, round-2, corrected round-4).** The trigger — a
foreign-owned or un-chmoddable file sitting in your private `<core>/logs/` — is
rare and itself alarming; a loud failure that stops the job is correct and its
availability cost is ~nil. The thrown `WienerdogError` **must reach** run-job's
existing fail-loud error surfacing (the `writeScheduleState` error watermark +
`failLoud`) — but per R4-A that only happens once the log-open is moved **inside**
the existing `try` (it currently sits before it, so today the throw escapes and
neither the watermark nor the alert fires; catch-up silently swallows it). This WP
therefore makes the small structural move above; it still adds **no** new alerting
plumbing (it reuses the existing branch). Two tests prove it: the isolated helper
negative test injects a throwing `fchmodSync` seam and asserts the helper throws
**and** the file has zero bytes; **and** the wiring tests (below) force a log-open
failure through the **real** `runJob` and `catchUp` paths and assert the persisted
`last_status:'error'` watermark **and** an alert fire — not just the helper in
isolation.

Every entry is best-effort and existence-guarded exactly like the A5 set (a
missing `secrets/` or a missing pin file is simply skipped — this WP **repairs**,
it never **creates**; `init.js`/`gws/client.js` own creation). `win32` stays a
no-op (POSIX-only guarantee, owner-approved). Deduplicate if a path could appear
in both sets (it cannot today, but the union must not double-report).

Resulting behavior (all three surfaces, for free):
- `repairPrivateModes(paths)` → chmods a legacy `0755` `secrets/`→`0700`, a
  legacy `0644` token/grant/pin/metadata file→`0600`, a legacy `0777`
  `logs/<job>` dir→`0700`, **and an over-tight `0600`/`000` `secrets/`→`0700`**,
  counting each change — **fixed-point dir repair then a single file pass, so a
  `0644` token trapped inside a `000` `secrets/` (or nested under a `000` parent)
  is reached in the same call** (every private dir is opened to `0700` before the
  file enumeration runs).
- `insecureEntries(paths)` / `scanPrivateModes(paths)` → now report a
  wrong-moded `secrets/` dir (loosened **or** over-tight), token/grant/pin/
  metadata file, or `logs/<job>` dir (the four metadata files included per the
  dated decision below).

**`src/cli/doctor.js` — fold the secrets check + fix the message.** After the
extension, `insecureEntries` already covers `secrets/` and its files (and flags an
over-tight `secrets/`), so the dedicated `mode === 0o700 ? ok : warn` comparison
is redundant with (and would double-report against) the shared loop. Remove that
comparison; **keep** the `dirExists(paths.secrets)` → `fail` "secrets directory
missing" check and the win32 skip. Update the shared-loop warn text so it no
longer says only "readable by other users" — an over-tight entry is not
other-readable — but names wrong permissions in either direction (e.g. "… has
wrong permissions (expected 0700/0600) — run 'wienerdog sync' to repair"). The
shared `insecureEntries` loop remains the single warn source.

### Example (POSIX)

```
# legacy machine, permissive umask, pre-hardening modes:
secrets/                       0755   secrets/google-token-read.json   0644
state/broker-grants.json       0644   state/exec-pins.json             0644
config.yaml                    0644   state/watermarks.json            0644
logs/dream/                    0777

wienerdog doctor      # WARNs each as wrong-permissions (secrets dir + files
                      #   + grants/pins + config.yaml + watermarks.json + log dir)
wienerdog sync        # repairPrivateModes → secrets/ & logs/dream/ 0700, files 0600
wienerdog doctor      # clean; scanPrivateModes → {insecure: 0}

# an OVER-TIGHT secrets/ is now caught too (broken store, not "clean"):
chmod 000 secrets/    ; wienerdog doctor   # WARNs secrets/ (expected 0700)
                        wienerdog sync      # repairs 000 → 0700

# separately, a FRESH log under a permissive umask is private at write time —
# BOTH the dir and the file:
umask 000; wienerdog run-job dream   # logs/dream/ is 0700 and <stamp>.log is 0600
```

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only; no build step.
- **DATED OWNER DECISION (2026-07-19, Codex round-1 middle path) — the four
  metadata files are IN the predicate/repair/scan set, but their WRITERS are NOT
  changed.** `config.yaml`, `install-manifest.json`, `state/schedule.json`, and
  `state/watermarks.json` carry no credential (vault path / model / file list /
  processing markers), so an earlier draft left them entirely out of scope. The
  owner's ruling: **include them in the shared enumerator** so `doctor` detects a
  group/other-readable one and `sync` repairs it to `0600` — this closes WP-126's
  explicit "left to A9 on purpose" deferral and ADR-0024's "full mechanics-root
  policy" hand-off. But **do not touch their writers** (`jobs.js`/`watermarks.js`
  atomic-rename writers, `config`/`manifest` writers): for these non-credential
  metadata files, **fresh-write privacy relies on the `0700` parent dirs +
  sync-time repair — an explicitly accepted residual.** (Contrast the *credential*
  writers, which are already `0600` at write time, and the *log* writers, which
  this WP DOES fix — logs are attacker-influenceable content, metadata is not.)
  Do not expand scope to their writers; if a reviewer argues a metadata writer
  should also be `0600` at write time, that is a separate WP — note it under
  "Discovered issues".
- **This WP does NOT modify `src/cli/sync.js`.** Verified: sync already calls
  `repairPrivateModes`/`scanPrivateModes` by their unchanged names, so the
  extension flows through with no sync edit. The `depends_on: [WP-154]` is
  because the A9 set includes `exec-pins.json`, which **WP-154 introduces** —
  enumerating a not-yet-existing artifact before WP-154 lands would be premature
  — and because WP-154 concurrently edits the private-modes/sync surface (do not
  race it). (The 2026-07-19 migration logbook anticipated a shared `sync.js`
  edit; gap analysis shows the shared predicate makes it unnecessary — verify the
  live `sync.js` before assuming otherwise.)
- **Repair, never create.** `repairPrivateModes` must not `mkdir` `secrets/` or
  `touch` a token — a machine with no Google setup has no `secrets/` and that is
  correct (existence-guarded skip). Creation stays with `init.js` /
  `gws/client.js`.
- **Keep the single-predicate invariant.** All three surfaces (doctor warn, sync
  repair/scan, digest banner) must read the **same** enumerator — do not add a
  parallel secrets scan anywhere. The whole point of the A5 design is that the
  three surfaces cannot disagree; the A9 extension must preserve that.
- **Shared-surface coordination with the A10 WPs.** `WP-a10-reap-mechanism` also
  edits `src/cli/run-job.js` and `src/cli/dream.js` (the watchdog/reap wiring).
  In `dream.js` this WP is the **two-line swap at the log site**
  (`mkdirSync`→`mkdirPrivate` `:339`, `createWriteStream`→`createLogStreamPrivate`
  `:340`). In `run-job.js` it is the same two swaps (`:550` / `:552`) **plus the
  R4-A structural move** of that open into the existing `try` and the `logStream`
  null-guard on the `finally` — so this WP now touches the **top of the `try`
  block and the `finally`**, which is closer to A10's reap wiring on the settle /
  `'close'` / failure paths (`~:601–672`). The two WPs still edit largely disjoint
  regions (log-open vs. reap-on-exit), but the overlap is real now — they **must
  not** land on the same branch. Rebase on whichever merges first and re-verify by
  **locating** the `fs.mkdirSync(logDir…)` / `fs.createWriteStream` log calls and
  the enclosing `try`/`catch`/`finally` (do **not** assume 550/552/339/340 or the
  try-boundary line are unchanged).
- `never mock process.platform` — inject `platform` where a test needs a specific
  OS (the module already gates on the module-level `WIN32`; for tests that must
  assert win32 behavior, follow the module's existing pattern).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] After the extension, a wrong-moded (loosened **or** over-tight) `secrets/`
      directory, a `google-token-*.json`, `google-client.json`,
      `broker-grants.json`, `exec-pins.json`, `config.yaml`,
      `install-manifest.json`, `schedule.json`, `watermarks.json`, or a
      `logs/<job>` directory is (a) reported by `insecureEntries`/
      `scanPrivateModes`, (b) WARNed by `doctor`, (c) counted by the digest
      banner, and (d) repaired to its **expected** `0700`/`0600` by
      `repairPrivateModes` — all from the one shared enumerator.
- [ ] The predicate uses **expected-mode equality** (`(mode & 0o777) !==
      expectedMode`), so a `0600` or `000` `secrets/` (traversal-broken store) is
      flagged, not passed as clean.
- [ ] `repairPrivateModes` is **fixed-point dir repair then a single file pass**
      (Codex G1): a **single** call over a `000` `secrets/` containing a `0644`
      token — **and over two nested unreadable levels** (`logs/`=000 → `logs/<job>`
      =000 → `0644` log; `core/`=000 → `secrets/`=000 → `0644` token) — fixes
      **both** the dir(s) and the trapped file, and a follow-up `scanPrivateModes`
      returns `{insecure: 0}` — a fixed-pass repair that misses a file inside a
      still-unreadable deeper dir is rejected.
- [ ] A **freshly-created** per-run log (both `run-job` and `dream` writer paths)
      under `umask 000` ends with its **directory `0700`** and its **file `0600`**
      — not `0777`/`0666` — and a `dream` append into a pre-existing `0666` log
      ends `0600` (the `createLogStreamPrivate` fchmod).
- [ ] `createLogStreamPrivate` is **fail-closed**: if it cannot secure the fd to
      `0600` it throws and writes **zero** bytes — it never returns a stream onto
      a world-readable file (negative test with an injected throwing `fchmodSync`).
- [ ] **[R4-A]** A log-open failure inside `run-job` is routed through the
      **existing** fail-loud branch: the log-dir/log-stream open is **inside** the
      `try`, so a throw sets the `last_status:'error'` watermark **and** fires the
      alert (`failLoud`) in a normal run, and in `catchUp` the throw is only
      swallowed **after** `runJob` has already failed loud — asserted by the
      real-path `runJob` **and** `catchUp` wiring tests, not just the helper's
      isolated unit test.
- [ ] `repairPrivateModes` never creates `secrets/` or any file; a machine with
      no Google setup produces zero changes and zero warnings for the A9 set.
- [ ] The private-modes guarantee stays `0700`/`0600` under a permissive umask
      (fresh write) and is repaired from legacy `0755`/`0644` (upgrade).
- [ ] `win32` remains a no-op for the A9 set and for `createLogStreamPrivate`'s
      chmod (POSIX-only, owner-approved posture).

## Acceptance criteria (mapped to the A9 acceptance bullet)

- [ ] **[A9 — "Fresh install under permissive umask … ends with the declared
      private modes."]** Under a permissive umask, a freshly-written token
      (`gws/client.js`) and grant/pin (`writeFilePrivate`) are `0600` and
      `secrets/` is `0700`; **and a freshly-written per-run log dir is `0700` and
      its file `0600`** — asserted by tests that set a permissive umask and (i)
      inspect the credential writers' resulting modes and (ii) run the **actual**
      `run-job` and `dream` log-writer paths (not just the predicate) and inspect
      the log **dir and file** modes.
- [ ] **[A9 — "… an upgrade from 0755/0644 state ends with the declared private
      modes."]** Given a pre-seeded `secrets/` at `0755` with a `0644` token, a
      `0644` `broker-grants.json`, a `0644` `exec-pins.json`, a `0644`
      `config.yaml`/`watermarks.json`, and a `0777` `logs/<job>` dir,
      `repairPrivateModes` changes each to its expected `0700`/`0600` and returns
      the correct `{changed}` count; a second call returns `{changed: 0}`
      (idempotent). A `0600` and a `000` `secrets/` are **also** repaired to
      `0700` in the same pass; and a `000` `secrets/` **containing a `0644`
      token/client file** — and a file trapped under **two nested** `000` dirs —
      has **both** the dir(s) and the trapped file repaired by a **single**
      `repairPrivateModes` call (fixed-point dir repair), with a follow-up
      `scanPrivateModes` returning `{insecure: 0}`.
- [ ] `insecureEntries`/`scanPrivateModes` report exactly those insecure A9
      entries (secrets — loosened and over-tight — + grants/pins + the four
      metadata files + log dirs) before repair and none after; `doctor` WARNs them
      via the unified loop (no duplicate secrets warn) with a message covering
      wrong permissions in either direction, and still `fail`s when `secrets/` is
      missing.
- [ ] The A5 set's behavior is unchanged (existing `private-fs`/`doctor` tests
      still pass).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "private-fs|doctor|scheduler-runjob|dream"
npm test
npm run lint
# the predicate now names the A9 artifacts + metadata files + the log helper,
# uses expected-mode equality, and is fail-closed on the log helper:
grep -nE "secrets|broker-grants|exec-pins|schedule\.json|watermarks|A9_PRIVATE|createLogStreamPrivate|expectedMode|fchmodSync" src/core/private-fs.js
# the two log writers call BOTH private helpers (no bare createWriteStream/mkdirSync
# remains at the log sites):
grep -nE "mkdirPrivate|createLogStreamPrivate" src/cli/run-job.js src/cli/dream.js
# R4-A: run-job's wiring tests force a log-open failure and assert the error
# watermark + alert on BOTH the runJob and catchUp paths:
grep -nE "sendAlert|last_status|catchUp|catch-up" tests/unit/scheduler-runjob.test.js
```

## Out of scope (do NOT do these)

- The **incident-drill runbook** — **WP-a9-incident-runbook** (docs).
- The **alert-body raw-tail exclusion** (A9 logging item) — belongs to WP-151,
  not here (per the A9 gap analysis).
- **Log bounding/rotation** — already shipped (`rotateLogs`, WP-038) and the
  self-email tail exclusion (WP-124/EP3); do not re-implement (this WP only
  changes the log **dir/file mode**, not the log content or rotation).
- **Adding NEW alerting plumbing to `run-job`** for the fail-closed log throw —
  out of scope. This WP makes the throw reach run-job's **existing** fail-loud
  branch by moving the log-open inside the current `try` (R4-A) and reusing that
  branch — it adds no new alert path. A **dedicated** log-open alert (distinct
  message/sink) is a separate WP (note under "Discovered issues" if a reviewer
  wants one).
- Changing the **metadata writers** (`config`/`manifest` writers, `jobs.js`
  `schedule.json`, `watermarks.js`) to write `0600` at write time — the dated
  decision keeps them repair-only (predicate + sync repair), writers unchanged.
- Changing any **credential writer** (`gws/client.js`, `grant-store.js`,
  `exec-identity.js`) — they already write `0600`; this WP only extends the
  **predicate/repair** set for them. (The two **log** writers ARE changed — that
  is this WP's round-1 fix — the dir/stream-open swap at each log site, plus in
  `run-job` the R4-A move of that open inside the existing `try`; nothing else.)
- Creating `secrets/` or seeding tokens — creation stays with `init`/`gws`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(security): extend private-modes repair to secrets/grants/tokens/pins (WP-a9-private-modes-repair)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

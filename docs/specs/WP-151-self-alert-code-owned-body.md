---
id: WP-151
title: Build the fail-loud alert and self-email body from code-owned status fields, never a free-form failure string
status: Ready
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0012, ADR-0024]
branch: wp/151-self-alert-code-owned-body
---

# WP-151: Self-alert body from code-owned status fields (audit A13)

## Context (read this, nothing else)

When a scheduled job fails, `wienerdog run-job` "fails loud": it appends a
durable record to `state/alerts.jsonl` (re-rendered into the session digest until
the job next succeeds — ADR-0012) and best-effort emails the user's OWN account
(`gws _alert`). That email **leaves the machine** and is stored by the mail
provider, so its body is the most sensitive sink in the failure path. **IRON
RULE (ADR-0004): Wienerdog is just files** — and the durable/emailed body must be
built from **bounded, code-owned status fields**, not from an arbitrary failure
string that could carry attacker-influenced or unbounded text.

Audit finding **A13** (self-alert content): "generate the alert body from bounded
code-owned status fields rather than arbitrary caller prose." Today the alert
`reason` is mostly code-owned already (`alerts.sanitizeAlert` length-caps and
secret-scrubs every field — WP-124), BUT one path interpolates a **non-Wienerdog
error's `failure.message`** (a raw Node error string) straight into the durable
`reason` and the email body. This WP closes that last free-form hole: the
alert/email carry a code-owned rendering; the raw detail goes ONLY to the local
private per-run log.

## Current state

**Re-verification record.** Every executable claim below was re-run first-hand
against the working tree at commit **`e7c845e`** on **2026-08-01**. Line numbers
are `e7c845e`'s. **Three claims were stale and are corrected here**; the cause
was `WP-a10-reap-mechanism` (now `Done`), which rewrote exactly the
failure-path region this spec quotes. See §7. Baseline:
`node tests/run.js tests/unit/scheduler-runjob.test.js` → **63 tests, 63 pass,
0 fail**.

### 1. `failLoud` — `src/cli/run-job.js:561-584`

**Rendered for readability, not byte-exact**: the `appendAlert` call below is
one-lined (it spans `:565-570` in the file) and the two inner `try`/`catch`
blocks are collapsed. This matters because this quote is the source of a
do-not-change pin — read `sed -n '561,584p' src/cli/run-job.js` for the bytes.

```js
async function failLoud(paths, name, reason, opts = {}) {
  let persisted = false;
  try {
    const logHint = `${tilde(paths.home, path.join(paths.logs, name))}/`;
    appendAlert(paths, { job: name, at: nowIso(), reason, log_hint: logHint });
    persisted = true; // the durable append returned without throwing
    const send = opts.sendAlert || defaultSendAlert;
    const subject = `job ${name} failed`;
    const body = `${reason}\n\nDetails: ${logHint}`.trim();
    try { send(paths, name, subject, body); } catch { /* email best-effort */ }
  } catch {
    // Fail-loud is best-effort; never mask the original failure.
  }
  return persisted;
}
```

Two facts an earlier revision of this spec did not state, both load-bearing:
**it returns a boolean** (`persisted`, the WP-a10 G2 signal), and **the body
template ends in `.trim()`**. Neither is changed by this WP, and neither may be
dropped.

### 2. The failure `reason` — `src/cli/run-job.js:1001-1010`, THREE branches now

```js
  let reason = failure
    ? failure instanceof WienerdogError
      ? failure.message                                 // code-owned (timeout, resolveCommand, guard)
      : `job "${name}" failed: ${failure.message}`      // ← free-form Node error string (THE HOLE)
    : code !== 0
      ? `job "${name}" exited ${code}`                  // code-owned
      : `job "${name}" ${reapFailure.reason}`;          // code-owned (R8-1, WP-a10-reap-mechanism)
  if (reapFailure && (failure || code !== 0)) {
    reason += ` — and it ${reapFailure.reason}`;        // code-owned (R8-1)
  }
```

followed by `manifest`-unrelated failure plumbing at `:1014-1027`:

```js
  jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
  const alertPersisted = await failLoud(paths, name, reason, opts);
  if (reapFailure && alertPersisted) {
    for (const f of reapFailure.files) rmPidfile(f);   // G2 pidfile release
  }
  throw new WienerdogError(reason);
```

**Only line `:1004` is the hole.** Every other branch is a code-owned template.
`reapFailure.reason` is built at `src/cli/run-job.js:376-383` and interpolates
only `survivors.join(' and ')` — a list of PGIDs the reaper itself collected, so
it is code-owned and bounded. `reapFailure` is `null` or that object
(`settleReaps` at `:331`, assigned at `:918`, POSIX only).

### 3. The other two alert sites — already bounded, DO NOT TOUCH

- **TCC refusal**, `src/cli/run-job.js:742-744` (an earlier revision of this spec
  said "line ~496"): a code-owned template with `g.offending` (the user's own
  vault path) + `g.prefix` (a code-owned protected-folder name).
- **Policy hooks**, `src/cli/run-job.js:788-797` (earlier: "~523"): a fully
  code-owned template whose only interpolation is
  `policyHooks.sources.join(', ') || 'unknown source'` at `:793`.

### 4. The per-run log — there is NO `logFile` variable

`grep -n "logFile" src/cli/run-job.js` at `e7c845e` returns **nothing**. What
exists:

```text
:829  const logDir = path.join(paths.logs, name);          // declared before the try
:838  let logStream = null;
:845  mkdirPrivate(logDir, { core: paths.core });          // inside the try
:846  logStream = createLogStreamPrivate(path.join(logDir, `${runStamp()}.log`), { core: paths.core });
:867  logStream.write(redactOnly(chunk.toString('utf8'))); // stdout tee
:872  logStream.write(redactOnly(chunk.toString('utf8'))); // stderr tee
:925  if (logStream) await endStream(logStream);           // in the outer `finally`
```

The log path is **computed inline at `:846` and never stored**, and
`createLogStreamPrivate` (`src/core/private-fs.js:951`) opens it with
`O_NOFOLLOW` and secures the fd to `0600` or throws. `private-fs` exports **no
append-private helper** (`mkdirPrivate`, `writeFilePrivate`,
`createLogStreamPrivate`, … — `src/core/private-fs.js:1009-1022`).

**Consequence for this WP, and it changes the design:** the stream is closed at
`:925`, long before the reason is built at `:1001`, so nothing at `:1001` can
write to the log without re-opening it by pathname. The fix is to write the
detail *before* the close instead — see Exact contracts D2.

`endStream` (`:514-516`) is `new Promise((resolve) => stream.end(resolve))`, so a
write queued immediately before it is flushed by `end()`.

### 4a. When `logStream` is `null` — the correct causal analysis

An earlier revision of this spec blamed `createLogStreamPrivate` for the
`logStream === null` case. **That was wrong**, and the error mattered because the
whole no-log design rested on it. Corrected here from the source at `e7c845e`:

- **`createLogStreamPrivate` (`src/core/private-fs.js:951-987`) always throws a
  `WienerdogError`** — both of its failure arms wrap the cause
  (`:969-971` *"refusing to write log … could not open it privately without
  following a symlink (…)"*, and `:982-984` *"refusing to write log … could not
  secure it to 0600 (…)"*). A `WienerdogError` takes **D1's first arm**, so its
  message — already Wienerdog-authored and already naming the file and the errno
  — is what the user sees. **That path was never lossy.**
- **`mkdirPrivate` (`src/core/private-fs.js:239-253`) is the lossy one.** Its
  two guarded arms throw `WienerdogError` too (`assertInCoreAncestry` at `:240`
  → `:200-203`; the symlink/non-directory refusal at `:244-247`), but
  **`fs.mkdirSync(dir, { recursive: true, mode: 0o700 })` at `:250` is bare**. An
  `EACCES`, `ENOSPC` or `EROFS` there raises a **raw Node `Error`**, which:
  1. is **not** a `WienerdogError`, so it takes D1's non-Wienerdog arm; and
  2. leaves `logStream === null` (`:846` never ran), so D2 writes nothing.
- **The consequence, before this WP's Table R:** the durable alert and the
  self-email would say *"failed to run — see the log for details"* while **no log
  file exists**. That narrows the owner-ratified promise (*"the user can still
  debug from the log"*) to nothing on exactly the path where debugging matters
  most.

`chmodIfNeeded` (`:156-165`) swallows its own errors and is not a source.

**This is what Table R rows 2–3 exist for**, and the owner ruled on it — see
[No-log failure path](#no-log-failure-path--owner-ruled-2026-08-01).

### 5. `failure` and where it comes from

`failure` is assigned only at `:922` (`catch (err) { failure = err; }`) around
the spawn/watchdog block, so at the `finally` at `:923-926` it is **already
set**. Its two sources are `child.on('error', reject)` (spawn errors such as
`ENOENT`) and the watchdog's `WienerdogError` (`:898`,
`job "<name>" timed out after <n> min`). The brain's own stdout/stderr are teed
to the log (`:867`, `:872`), never into `reason`.

### 6. `src/core/alerts.js` — unchanged by this WP

`sanitizeAlert` (`alerts.js:46-50`) restricts a record to exactly
`{job, at, reason, log_hint}`, each `String(...).slice(0, MAX_FIELD_CHARS)` then
`redactOnly`, with `MAX_FIELD_CHARS = 2000` (`alerts.js:29`). That
bounded-field guarantee stays; this WP removes the free-form **input** at the
caller.

### 7. What re-verification found stale

`WP-a10-reap-mechanism` (`Done`) rewrote the failure-path region this spec
quotes. **PR #127 is NOT implicated** — it only added `pruneAcksForJob` to
`clearAlerts`; `sanitizeAlert`'s contract is untouched.

| # | The stale claim | Reality at `e7c845e` | Why it mattered |
|---|-----------------|----------------------|-----------------|
| 1 | `const reason = failure ? … : \`job "${name}" exited ${code}\`` — a **two**-branch expression ending in the exit-code case | `let reason` with **three** branches (`:1001-1007`) plus a `reason +=` mutation appending the R8-1 suffix (`:1008-1010`) | The old Exact contract's `else { reason = … exited ${code} }` would have **clobbered the R8-1 rendering** — a clean exit 0 whose group could not be reaped would have been reported as `exited 0`, i.e. as a success-shaped message on the fail-loud path. |
| 2 | *"`logFile` (the per-run log path) … in scope"*, and a contract calling `fs.appendFileSync(logFile, …)` | **No such variable exists.** Zero grep matches. Only `logDir` (`:829`) and `logStream` (`:838`), and the stream is already closed at `:925` | The contract as written **does not compile**. An implementer would have had to invent a path, and the obvious invention (`path.join(logDir, \`${runStamp()}.log\`)` re-evaluated at `:1001`) yields a **different** filename whenever the run crosses a second boundary, silently creating a second, world-readable log file. |
| 3 | TCC reason at "line ~496"; policy-hooks `appendAlert` at "line ~523"; test deliverable `tests/unit/run-job...` | `:742-744` and `:788-797`; the test file is **`tests/unit/scheduler-runjob.test.js`** — no file matches `tests/unit/run-job*` | The Deliverables table is the **CI-enforced permission boundary** (`boundary-check`), so a path that does not exist is a guaranteed red PR. |

Nothing else moved: the hole at `:1004` is still exactly
`` `job "${name}" failed: ${failure.message}` ``, `sanitizeAlert`'s contract is
unchanged, `failLoud`'s body template is unchanged apart from the `.trim()` and
the boolean return noted in §1, and `depends_on: []` is still correct.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed.
     (Corrected 2026-08-01: this comment used to also list docs/specs/ROADMAP.md,
     which WP-roadmap-retirement removed — it does not exist at e7c845e.) -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | **D1** — replace the free-form branch at `:1004` with `noLogReason(...)` per **Table R**, plus the module-private `noLogReason` helper and its `TOKEN_OK` pattern; change **no other branch** of the three-branch `reason` and **not** the `reason +=` mutation. **D2** — write the raw (redacted) cause into the per-run log **through the still-open `logStream`**, inside the existing `finally` at `:923-926`, before `endStream`. **D3** — make `endStream` (`:514-516`) error-absorbing so an async stream `'error'` cannot escape the `finally` and skip `failLoud` (Codex [high]). |
| modify | tests/unit/scheduler-runjob.test.js | **T1, T2, T5's suffix half, T7 and T8** (Test index below). **T3 and T4 are already covered and are NOT new work** — do not add tests for them. This is the real path — verified at `e7c845e`; **no file matches `tests/unit/run-job*`**, and the Deliverables table is the CI-enforced boundary. |

### Exact contracts

**The three code blocks below are dedented for readability and carry trailing
`// UNCHANGED` / `// ←` annotations that do NOT exist in the file.** They are the
*shape* to write, not a byte-image. The byte-image of what is there today is in
Current state §2 and §4; read the file itself with
`sed -n '1001,1010p' src/cli/run-job.js` and `sed -n '923,926p' src/cli/run-job.js`.

**D1 — the reason branch (`src/cli/run-job.js:1001-1010`).** Change **only** the
`:1004` arm. The surrounding structure, including the R8-1 clean-exit arm and the
`reason +=` mutation, stays byte-for-byte:

```js
  let reason = failure
    ? failure instanceof WienerdogError
      ? failure.message                                 // UNCHANGED — Wienerdog-authored
      : noLogReason(name, failure, logStream)           // ← THE ONLY CHANGED LINE (Table R)
    : code !== 0
      ? `job "${name}" exited ${code}`                  // UNCHANGED
      : `job "${name}" ${reapFailure.reason}`;          // UNCHANGED — R8-1
  if (reapFailure && (failure || code !== 0)) {
    reason += ` — and it ${reapFailure.reason}`;        // UNCHANGED — R8-1
  }
```

`noLogReason` is a **module-private pure helper** (add it near `runStamp`, no
export) implementing **Table R** below. It is a named function rather than an
inline ternary because it carries the errno-token validation, which must be
readable and testable on its own.

### Table R — the non-WienerdogError reason (canonical)

Conditions in order; the first that holds decides. `S` is `logStream` at the
moment the reason is built (`null` iff the private log open failed — Current
state §4). `C` is `failure.code`.

| # | Condition | Reason rendered | Why |
|---|-----------|-----------------|-----|
| 1 | `S !== null` (a log exists) | `` `job "${name}" failed to run — see the log for details` `` | The raw cause is in the log (D2). The alert needs no detail, so it carries none. |
| 2 | `S === null` **and** `C` passes `TOKEN_OK` | `` `job "${name}" failed to run (${C}) — no log could be written` `` | **There is no log to point at**, so the alert must carry enough to act on. One validated errno token is the whole of that detail. |
| 3 | `S === null` **and** `C` fails `TOKEN_OK` (absent, non-string, or wrong shape) | `` `job "${name}" failed to run (UNKNOWN) — no log could be written` `` | Fixed literal. Never fall back to `failure.message`, never omit the parenthetical (a caller must not have to distinguish "no token" from "no row 2"). |

**`TOKEN_OK` is the whole security surface of this WP** and is stated as a
literal, not described:

```js
const TOKEN_OK = /^[A-Z][A-Z0-9]{1,15}$/;   // fully anchored, no `m` flag
```

- **Fully anchored, and `String.prototype.match` semantics.** In JS, `^`/`$`
  without the `m` flag cannot match at an interior newline, so a multi-line value
  is rejected outright. Do **not** add `m`. Do **not** use `.test()` on a
  `RegExp` carrying `g` (lastIndex state); this pattern has no flags.
- **Bounded to 16 characters** — every real POSIX/libuv errno is far shorter
  (`EACCES`, `ENOSPC`, `EROFS`, `ENAMETOOLONG` is 12).
- **Uppercase alphanumeric only**, first character a letter. No `_`, no `-`, no
  spaces, no punctuation, no lower case.
- **Applied to `C` only after `typeof C === 'string'`.** A number, `undefined`,
  `null`, or an object with a hostile `toString` never reaches the regex — do not
  `String(C)` first, because that is exactly how a crafted `.code` would smuggle
  prose in.
- **Rejection is silent and total** — row 3's fixed literal, never a truncation
  of the offending value, never a "code: <n>" rendering.

**Why a token at all, when D1's whole point is a code-owned body.** Because a
token from a fixed, machine-generated vocabulary that has been validated against
an anchored 16-character pattern is *not* caller prose — it is a small enum whose
membership the code checks. The invariant "no non-Wienerdog-authored string
reaches the alert or the email" holds: what reaches them is either a Wienerdog
template, or ≤16 bytes that the code has proven match `[A-Z][A-Z0-9]{1,15}`.

**D2 — preserve the raw cause in the log, through the OPEN fd, with error-aware
finalization (`src/cli/run-job.js:923-926`).** `failure` is already assigned at
`:922`, so the `finally` can see it while `logStream` is still open:

```js
  } finally {
    // The open may have thrown before logStream was assigned (R4-A).
    if (logStream) {
      // A13/WP-151: a non-Wienerdog error's raw message never reaches the durable
      // alert or the self-email. Preserve it for the user HERE — redacted, through
      // the SAME already-private fd, before it closes. Best-effort: a logging
      // failure must never mask the original failure.
      if (failure && !(failure instanceof WienerdogError)) {
        try {
          logStream.write(redactOnly(`\nwienerdog: job failed to run: ${failure && failure.message}\n`));
        } catch { /* best-effort */ }
      }
      await endStream(logStream);   // MUST be the error-absorbing form — see below
    }
  }
```

**`endStream` must absorb stream errors, and today it does not.** At `e7c845e`
(`run-job.js:514-516`):

```js
function endStream(stream) {
  return new Promise((resolve) => stream.end(resolve));
}
```

There is **no `error` listener**. A synchronous `write()` throw is caught by the
`try` above, but an **asynchronous** `error` event — `EIO`, `ENOSPC`, a disk
filling between the last tee write and this one — is emitted on a stream with no
handler, which Node treats as an unhandled `'error'` and **throws out of the
`finally`**, i.e. before `writeScheduleState`, before `failLoud`, and before the
`throw new WienerdogError(reason)`. **The job then fails with no watermark, no
durable alert and no email** — the exact opposite of "fail loud", and a direct
contradiction of this contract's own *"a logging failure must never mask the
original failure"*. Found by the Codex leg of gate round 1, citation-verified.

**Corrected contract for `endStream`** (this is a **D3**, a third change to
`run-job.js`):

```js
/** Close a write stream and wait for its flush. Resolves even when the stream
 *  errors: this runs on the failure path, and a logging failure must never mask
 *  the original failure (WP-151). Never rejects, never throws. */
function endStream(stream) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    stream.on('error', finish);   // absorb EIO/ENOSPC — the ONLY listener that must exist
    try {
      stream.end(finish);
    } catch {
      finish();
    }
  });
}
```

Three properties the implementer must preserve, each of which a plausible
simplification breaks:

- **The `error` listener is attached BEFORE `end()`**, because `end()` can emit
  synchronously.
- **`finish` is idempotent** (`done`), because `error` and the `end` callback can
  both fire.
- **It never rejects.** Do not "improve" it into `reject(err)` — the caller
  `await`s it inside a `finally` and a rejection there is the very failure this
  fixes.

`endStream` has exactly one other caller shape to consider: it is called only at
`:925`. Making it error-absorbing therefore changes no other path.

**Why through the stream and not `fs.appendFileSync`** (recorded so it is not
re-litigated — the previous revision of this contract specified an append to a
variable that does not exist, Current state §7 finding 2):

- **There is no log path to append to.** It is computed inline at `:846` and
  never stored (Current state §4). Re-deriving it at `:1001` calls `runStamp()` a
  second time and yields a *different* filename across a second boundary.
- **The fd is already private.** `createLogStreamPrivate` opened it `O_NOFOLLOW`
  at `0600` under a `0700` dir, inside the core. A pathname re-open would discard
  that proof, could create a fresh **0644** file, and would re-introduce a
  symlink-swap window that the original open exists to close.
- **It matches the file's own idiom.** `:867` and `:872` already do exactly
  `logStream.write(redactOnly(...))`.
- **Ordering is safe.** `endStream` resolves after the flush, and the write is
  queued before `end()`.
- **The `if (logStream)` guard already exists** and is the correct gate. What
  happens when it is `null` is **Table R row 2/3**, not silence — see the causal
  analysis in Current state §4a.

**The `failure && failure.message` null-guard is deliberate.** A caller that
throws a bare string (`throw 'boom'`) has no `.message`; the base revision's
defensive form is kept so the log line renders `undefined` rather than throwing
inside the failure path. This matches what `:1004` does today.

**Do not change, and each is named because a nearby edit is tempting:**

- The TCC-refusal reason (`:742-744`) and the policy-hooks alert (`:788-797`) —
  both already code-owned (Current state §3).
- `failLoud`'s signature, its `return persisted`, or its body template
  `` `${reason}\n\nDetails: ${logHint}`.trim() `` (`:574`). Once `reason` is
  code-owned, the whole body is.
- `const alertPersisted = await failLoud(…)` (`:1015`) and the G2 pidfile release
  at `:1024-1026`. They consume `failLoud`'s boolean; this WP does not touch it.
- `throw new WienerdogError(reason)` at `:1027` stays — it now throws the
  code-owned `reason` too, so a non-Wienerdog error's raw message no longer
  reaches the process's error line either. It lives only in the log.
- `src/core/alerts.js` (Current state §6).

**Imports:** `redactOnly` is already imported at `src/cli/run-job.js:13` and
already used at `:867`/`:872`. `fs` is at `:3` but D2 does not need it. **Add no
new import.**

### Test index

All live in `tests/unit/scheduler-runjob.test.js`. **Only T1, T2, T7 and T8 are
new work**; T3, T4 and T5's clean-exit half are **existing guards that must keep
passing**, listed so the implementer does not rewrite what already covers them.

| # | New? | What it asserts | Drives |
|---|------|-----------------|--------|
| T1 | **NEW** | **The regression, red-first.** A `runJob` whose child emits an `error` with message `weird ENOENT /x` fails loud with alert `reason` **exactly** `job "<name>" failed to run — see the log for details`, and `weird ENOENT /x` appears **nowhere** in the alert record **or** in the body handed to the injected `opts.sendAlert` stub. Genuinely new: `grep -n 'failed: ' tests/unit/scheduler-runjob.test.js` returns nothing at `e7c845e`. | Table R row 1 |
| T2 | **NEW** | The same run's per-run log file **does** contain the redacted raw cause (`wienerdog: job failed to run: weird ENOENT /x`). | D2 |
| T3 | existing | A timeout still surfaces `job "<name>" timed out after <n> min`. **Already covered** — `/timed out/` at `:844` and `:930`. Do not add a test; keep these green and unmodified. | D1, unchanged arm |
| T4 | existing | A non-zero exit still surfaces `job "<name>" exited <code>`. **Already covered** — `/exited 3/` at `:762`, `:785`, and `:789` which asserts the **email body** specifically. Do not add a test; keep these green and unmodified. | D1, unchanged arm |
| T5 | **half NEW** | **R8-1 is not clobbered** (POSIX only). Its **clean-exit half is already covered**: `:993-1021` (`R9-1/R8-1 — a clean close whose group-A reap stays { reaped: false } … FAILS LOUD`) rejects on `/live process group\|could not be reaped/` at `:1011` and asserts `assert.match(durable[0].reason, /could not be reaped to quiescence/)` at `:1019` — a two-branch rewrite fails it. **Add only the suffix half**: a *failed* run with an un-reapable group still gets the `— and it left a live process group behind: …` suffix, which has **zero** existing coverage. | D1, R8-1 arms |
| T7 | **NEW** | **Table R rows 2–3, the no-log path.** Drive `mkdirPrivate` to raise a raw `Error` with `code: 'EACCES'` (a read-only or non-writable `paths.logs`, or the injected-seam equivalent) so `logStream === null`. Assert the alert `reason` is **exactly** `job "<name>" failed to run (EACCES) — no log could be written`. Then repeat with a hostile `.code`: a value failing `TOKEN_OK` (e.g. `'not an errno: ' + secret`, a number, `undefined`) must render **exactly** `job "<name>" failed to run (UNKNOWN) — no log could be written`, with the hostile value appearing nowhere in the alert record or the email body. | Table R rows 2, 3 |
| T8 | **NEW** | **Codex [high]: a stream error must not mask the failure.** Inject a `logStream` whose `write()` succeeds but which emits an asynchronous `'error'` (e.g. `EIO`) before/while `end()` runs. Assert the run still reaches its normal failure outcome: `last_status: 'error'` watermark written, **one** durable `alerts.jsonl` record, the `sendAlert` stub called, and `runJob` rejecting with the code-owned `reason` — **not** with the stream's error. **Red-before-work is mandatory here**: against `e7c845e`'s `endStream` this test must fail, because the unhandled `'error'` escapes the `finally` before `failLoud` runs. | D3 |

**Prove T1 in both directions** (`docs/runbooks/codex-review.md`): run it against
the untouched `:1004` (expect **red** — the raw message reaches the alert) and
against the finished one (expect **green**). **T8 must be proved the same way**,
and it is the one that matters most: a T8 that is green against the untouched
`endStream` is not testing what it claims.

**Owner walkthrough (2026-07-18): Ready.** No open fork. Owner ratified reducing a
non-WienerdogError failure to the fixed code-owned sentence in the durable
alert/email and writing the raw (redacted) cause to the local per-run log only —
so the machine-leaving email carries no free-form/attacker-influenced text while
the user can still debug from the log. WienerdogError reasons stay as-is (already
code-owned).

### No-log failure path — owner-ruled (2026-08-01)

> **OWNER-DECIDED IN SESSION — 2026-08-01 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered in conversation; this record was written by the
> orchestrator, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one, and **no gate keys on
> it**. Verbatim: *"shoot for the bounded errno-token discriminator in the
> reason."*

**The question that was put.** Gate round 1 found that the 2026-07-18
walkthrough's promise — *"the user can still debug from the log"* — is **false on
one reachable path**: when `mkdirPrivate`'s bare `fs.mkdirSync` raises a raw
`EACCES`/`ENOSPC`/`EROFS` (Current state §4a), the failure is a
non-`WienerdogError` **and** `logStream === null`, so the alert would have said
*"see the log for details"* while no log exists. Two dispositions were offered:

- **(A) Accept and document.** Keep one fixed sentence; state in the spec and the
  docs that this path exists and loses the cause. Zero code, zero new surface —
  but it hands the user a message that points at a file that is not there.
- **(B) A bounded, code-owned errno-token discriminator.** Add the errno to the
  reason as a **validated token from a machine-generated vocabulary**, never the
  message text.

**The ruling: (B).** Implemented as **Table R** in Exact contracts. The shape of
the guarantee, stated so it is auditable: what reaches the durable alert and the
outbound email is either a Wienerdog-authored template, or **≤16 bytes that the
code has proven match `/^[A-Z][A-Z0-9]{1,15}$/`** — fully anchored, no `m` flag,
applied only after a `typeof === 'string'` test, with any failure collapsing to
the fixed literal `UNKNOWN`. **A crafted `.code` cannot smuggle prose through
it**, which is the whole reason the validation is specified as a literal pattern
rather than described.

**What was NOT ruled, and stays out of scope.** Making `mkdirPrivate` wrap its
`fs.mkdirSync` in a `WienerdogError` would remove this path at the source and is
arguably the better fix. It is **not done here**: `src/core/private-fs.js` is not
in this WP's Deliverables, every other caller of `mkdirPrivate` would inherit the
change, and it needs its own review. Routed as `WP-mkdir-private-errno-wrap`;
reported, not fixed.

**Ordering, re-checked 2026-08-01 across BOTH deliverable paths.** An earlier
revision scanned only `src/cli/run-job.js`, which made its conclusion true by
luck rather than by survey; the sentence is corrected here.

`WP-141-broker-runjob-wiring` is `Done` (`docs/specs/done/`), so the old
"sequence after WP-141" note is discharged. `WP-a10-reap-mechanism` is also
`Done` — and it is the WP that moved this region underneath this spec (Current
state §7).

**Open specs listing `src/cli/run-job.js`:** `WP-a10-windows-reap` (`Draft`,
win32 settle path only) and `WP-broker-e2e-terminal-auth` (`Ready`, and only
"ONLY if approach 3 (discouraged)"). Neither touches `:1004`, `endStream`, the
`finally` at `:923-926`, or `failLoud`.

**Open specs listing `tests/unit/scheduler-runjob.test.js`:**
`WP-secret-sink-wiring-probes` (`Draft`) — its Deliverables cell
(`:170`) adds *"exactly the 4 probes named `sink-probe: routine-log …` in
Table P"*, i.e. rows **P12–P15**, which anchor on `run-job.js:867` and `:872`
(`:274-277`). **That is the same `logStream.write(redactOnly(...))` idiom D2
extends**, so the overlap is real and worth naming rather than glossing.

**It is benign, for two reasons.** (1) The two specs add **disjoint test bodies**
— P12–P15 assert secret redaction in the *tee* handlers on the success path;
T1/T2/T7/T8 assert the *reason* and the failure-path diagnostic write. Neither
edits the other's assertions. (2) Both are **additive** to the same file, so the
only risk is a textual merge conflict, which is a rebase, not a design
dependency. `depends_on` therefore stays `[]` — but whichever lands second
re-runs `node tests/run.js tests/unit/scheduler-runjob.test.js` before opening
its PR.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- This is defense-in-depth consistent with ADR-0012 (durable alerts) and ADR-0024
  / WP-124 (secret lifecycle: the alert body carries no raw log tail). It does NOT
  introduce a new architectural decision — no new ADR (flagged to the owner in
  case they prefer one; see the WP report open questions).
- Keep the local log the single place the raw cause lives; the digest/email get
  only the code-owned sentence. `log_hint` already points the user at that log.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No non-Wienerdog-authored string is interpolated into the durable alert
      `reason` or the self-email body. What may reach those sinks is exhaustively:
      a Wienerdog-authored template, code-owned fields (job name, exit code,
      timeout, guard prefix, `reapFailure.reason`), and **one errno token of at
      most 16 bytes that the code has proven matches `/^[A-Z][A-Z0-9]{1,15}$/`**
      (Table R).
- [ ] **`TOKEN_OK` is fully anchored with no `m` flag**, so a multi-line
      `failure.code` cannot match on one interior line. It is applied **only**
      after `typeof failure.code === 'string'` — the value is never coerced with
      `String(...)` first, because coercion is exactly how a crafted `.code` with
      a hostile `toString` would smuggle prose in. A rejected value collapses to
      the literal `UNKNOWN`, never to a truncation of itself.
- [ ] The raw failure detail is preserved for the user only in the LOCAL private
      per-run log, redacted via `redactOnly`, never emailed.
- [ ] `alerts.sanitizeAlert`'s cap + scrub is unchanged (belt-and-suspenders).
- [ ] The raw cause is written **through the already-open private fd**, never by
      re-opening a pathname — so no code path can create a log file outside
      `createLogStreamPrivate`'s `O_NOFOLLOW` + `0600` guarantee, and no new
      symlink-swap window is opened (Exact contracts D2).
- [ ] **A logging failure never masks the original failure**, synchronously **or
      asynchronously**: the diagnostic `write()` is inside a `try`, and
      `endStream` absorbs an `'error'` event and resolves (D3). The watermark,
      the durable alert, the email and the `throw` all still happen.

## Acceptance criteria

- [ ] **AC1** — T1: alert `reason` is exactly
      `job "<name>" failed to run — see the log for details`, and `weird ENOENT /x`
      appears NOWHERE in the alert record or the email body passed to the injected
      `sendAlert` stub. Red against the untouched `:1004`, green after; both runs
      pasted.
- [ ] **AC2** — T2: the raw failure detail is present, redacted, in the per-run
      log file.
- [ ] **AC3** — T3/T4 are **existing** guards and still pass **unmodified**:
      `/timed out/` at `:844`/`:930` and `/exited 3/` at `:762`/`:785`/`:789`.
      No new test is added for either.
- [ ] **AC4** — T5: the R8-1 renderings are untouched. The clean-exit arm is
      already guarded by `:993-1021` (specifically `:1019`) and must still pass
      unmodified; the **`— and it …` suffix half is the new assertion**.
- [ ] **AC5** — `failLoud` still returns its boolean and its body still ends in
      `.trim()`; `alertPersisted` and the G2 pidfile release still work
      (V3 below).
- [ ] **AC6** — T7: with `logStream === null` and `failure.code === 'EACCES'`,
      the reason is exactly
      `job "<name>" failed to run (EACCES) — no log could be written`; with a
      `.code` failing `TOKEN_OK`, it is exactly
      `job "<name>" failed to run (UNKNOWN) — no log could be written` and the
      hostile value appears nowhere in the alert or the email.
- [ ] **AC7** — T8: an asynchronous stream `'error'` during finalization does
      **not** prevent the watermark, the durable alert, the email or the
      code-owned `throw`. **Red against `e7c845e`'s `endStream`, green after;
      both runs pasted.**
- [ ] **AC8** — `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the suite this WP touches. Baseline at e7c845e: 63 tests, 63 pass, 0 fail.
node tests/run.js tests/unit/scheduler-runjob.test.js

# V2 (AC1) — the free-form hole is gone. Expect: no output, exit 1.
grep -n 'failed: \${failure.message}' src/cli/run-job.js

# V3 (AC4, AC5) — the R8-1 arms, the boolean return and the .trim() survived.
# Expect all five lines.
grep -nE "reapFailure\.reason|const alertPersisted = await failLoud|return persisted;|\}\`\.trim\(\)" src/cli/run-job.js

# V4 (D2) — the detail goes through the stream, not a re-opened pathname.
# Expect a logStream.write near the finally, and NO appendFileSync anywhere.
grep -n "logStream.write" src/cli/run-job.js
grep -n "appendFileSync" src/cli/run-job.js

# V5 (D3, AC7) — endStream absorbs stream errors. Expect an 'error' listener
# inside the endStream body, and NO reject anywhere in it.
sed -n "/^function endStream/,/^}/p" src/cli/run-job.js

# V6 (Table R, AC6) — the token pattern is present, fully anchored, no `m` flag.
# Expect exactly one line, matching the literal in Exact contracts.
grep -n "\^\[A-Z\]\[A-Z0-9\]{1,15}\\\$/" src/cli/run-job.js

# V7 — full gates.
npm test
npm run lint
```

**Baseline on the untouched tree at `e7c845e`**, so the implementer can tell a
regression from a pre-existing state: V2 prints the hole at `:1004` (exit 0);
V3 prints its five lines (`574`, `583`, `1007`, `1009`, `1015`); V4's first grep
prints `:867` and `:872` and its second prints nothing (exit 1); **V5 prints the
three-line `new Promise((resolve) => stream.end(resolve));` body with no `error`
listener** (that absence is the D3 defect); **V6 prints nothing, exit 1**.

## Out of scope (do NOT do these)

- Any change to `src/core/alerts.js` (its bounded-field + scrub contract is
  already correct — WP-124).
- Changing the TCC-refusal (`:742-744`) or policy-hooks (`:788-797`) alert
  wording — already code-owned.
- Changing `gws _alert` / `gws/alert.js` (the recipient is already fixed to self).
- **Anything belonging to `WP-a10-reap-mechanism`**: the three-branch `reason`
  structure, the `reason +=` mutation, `settleReaps`, `reapFailure`,
  `alertPersisted`, `rmPidfile`, or the win32 exclusion. This WP changes exactly
  one arm of that expression and adds one guarded write.
- Introducing an `appendFilePrivate` helper in `src/core/private-fs.js`. D2 needs
  no new helper; adding one is a different WP with its own review.
- **Any change to `src/core/private-fs.js`**, including the obvious one: wrapping
  `mkdirPrivate`'s bare `fs.mkdirSync` (`:250`) in a `WienerdogError` so this
  whole lossy path disappears at the source. That file is not in this WP's
  Deliverables, every other `mkdirPrivate` caller would inherit the change, and
  it needs its own review. Routed as `WP-mkdir-private-errno-wrap`. Report it in
  the PR under "Discovered issues"; do not fix it.
- **Widening the errno token.** No allowlist of known errnos, no mapping table,
  no human-readable expansion (`EACCES` must not become "permission denied"), no
  second token. Table R's three rows are the whole vocabulary.
- The win32 settle path — `WP-a10-windows-reap` (`Draft`).
- The **P12–P15 secret-sink probes** in the same test file — those are
  `WP-secret-sink-wiring-probes` (`Draft`). Additive and disjoint; see "Ordering".

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **both** directions of T1 (AC1) **and both directions of T8 (AC7)**.
2. Branch `wp/151-self-alert-code-owned-body`; conventional commits;
   PR titled `fix(run-job): build fail-loud alert/email body from code-owned fields only (WP-151)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. The PR body's "Discovered issues" names `WP-mkdir-private-errno-wrap` (the
   bare `fs.mkdirSync` at `private-fs.js:250`) — reported, not fixed.

> **Provenance.** Audit A13 (self-alert content). Owner walkthrough 2026-07-18
> ratified the design; spec reached `Ready` then.
>
> **2026-08-01 — architect re-verification pass, tested SHA `e7c845e`.** Every
> executable Current-state claim was re-run first-hand. Result: **three stale
> claims**, all caused by `WP-a10-reap-mechanism` (now `Done`) rewriting the
> failure-path region this spec quotes — **not** by PR #127, which only added
> `pruneAcksForJob` to `clearAlerts` and left `sanitizeAlert` untouched. The three
> are tabulated in Current state §7: (1) the `reason` expression is now
> three-branch with an R8-1 clean-exit arm and a `+=` mutation, so the old
> contract would have clobbered a real outcome; (2) the contract referenced a
> `logFile` variable that **does not exist**, making it uncompilable — the design
> moved to writing through the already-open `logStream`, which is also strictly
> safer; (3) two line anchors had drifted (`~496`→`742-744`, `~523`→`788-797`) and
> the test deliverable path `tests/unit/run-job...` matched no file — corrected to
> `tests/unit/scheduler-runjob.test.js`, which matters because the Deliverables
> table is the CI-enforced boundary. Also recorded, though the spec did not
> contradict them: `failLoud` now returns a boolean (`persisted`, G2) and its body
> template ends in `.trim()`. **Status stays `Ready`**: the design decision the
> owner ratified is unchanged; only the code snapshot it lands on had drifted, and
> the one design consequence (D2's mechanism) is recorded above with its reason.
>
> **2026-08-01 — gate round 1 corrections (verdict: REQUEST CHANGES).**
>
> - **(a) Codex [high], citation-verified — async stream error masks the
>   failure.** D2's `try` covers only the *synchronous* `write()`; `endStream`
>   (`:514-516`) has **no `'error'` listener**, so an `EIO`/`ENOSPC` emitted
>   asynchronously throws out of the `finally` **before** the watermark, before
>   `failLoud` and before the code-owned `throw` — the exact opposite of failing
>   loud, and a contradiction of this contract's own words. Closed by **D3**
>   (error-absorbing `endStream`) and **T8**, which is mandatory-red-before-work.
> - **(a) OWNER — the no-log information-loss path, with a MISDIAGNOSED cause.**
>   The spec blamed `createLogStreamPrivate`; that helper always throws a
>   `WienerdogError` and was never lossy. The real source is `mkdirPrivate`'s
>   **bare** `fs.mkdirSync` (`private-fs.js:250`). Causal analysis corrected in
>   Current state §4a; the disposition went to Gyula and he ruled for the bounded
>   errno-token discriminator — see
>   [No-log failure path](#no-log-failure-path--owner-ruled-2026-08-01) and
>   **Table R**. The source-level fix is routed as `WP-mkdir-private-errno-wrap`
>   and deliberately not taken here.
> - **(a) T5's "only detector" claim was false.**
>   `tests/unit/scheduler-runjob.test.js:993-1021` already fails a two-branch
>   rewrite (`:1011`, `:1019`). T5 is restated as a targeted regression guard
>   citing that test, and **only its suffix half is new work**.
> - **(b) T3/T4 were overstated as new work** — `/timed out/` at `:844`/`:930`
>   and `/exited 3/` at `:762`/`:785`/`:789` already cover them. Relabelled as
>   existing guards that must pass unmodified. **T1 is genuinely new**
>   (`grep -n 'failed: '` over the test file returns nothing).
> - **(b) The D1/D2 code blocks were called "byte-for-byte" while carrying
>   annotations the file does not have.** They are now marked as dedented,
>   annotated shape — the byte-image lives in Current state and in the file.
> - **(b) The ordering note scanned only one of two deliverable paths.**
>   `tests/unit/scheduler-runjob.test.js` is also delivered by
>   `WP-secret-sink-wiring-probes` (rows P12–P15, anchored on the same
>   `logStream.write` idiom). Survey extended; the `depends_on: []` conclusion
>   stands, now for a stated reason.
> - **(adv, taken)** §1's `failLoud` quote is a one-lined rendering of
>   `:565-570` — it is the source of a do-not-change pin, so it is labelled.
>   D2 keeps the `failure && failure.message` null-guard. New verification steps
>   V5 and V6 make D3 and `TOKEN_OK` executable, both red-verified at `e7c845e`.

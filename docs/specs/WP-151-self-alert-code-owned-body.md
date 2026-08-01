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
| modify | src/cli/run-job.js | **D1** — replace the free-form branch at `:1004` with a fixed code-owned sentence, changing **no other branch** of the three-branch `reason` and **not** the `reason +=` mutation. **D2** — write the raw (redacted) cause into the per-run log **through the still-open `logStream`**, inside the existing `finally` at `:923-926`, before `endStream`. |
| modify | tests/unit/scheduler-runjob.test.js | **T1–T5** (Test index below). This is the real path — verified at `e7c845e`; **no file matches `tests/unit/run-job*`**, and the Deliverables table is the CI-enforced boundary. |

### Exact contracts

**D1 — the reason branch (`src/cli/run-job.js:1001-1010`).** Change **only** the
`:1004` arm. The surrounding structure, including the R8-1 clean-exit arm and the
`reason +=` mutation, stays byte-for-byte:

```js
  let reason = failure
    ? failure instanceof WienerdogError
      ? failure.message                                 // UNCHANGED — Wienerdog-authored
      : `job "${name}" failed to run — see the log for details`   // ← THE ONLY CHANGED LINE
    : code !== 0
      ? `job "${name}" exited ${code}`                  // UNCHANGED
      : `job "${name}" ${reapFailure.reason}`;          // UNCHANGED — R8-1
  if (reapFailure && (failure || code !== 0)) {
    reason += ` — and it ${reapFailure.reason}`;        // UNCHANGED — R8-1
  }
```

**D2 — preserve the raw cause in the log, through the OPEN fd
(`src/cli/run-job.js:923-926`).** `failure` is already assigned at `:922`, so the
`finally` can see it while `logStream` is still open:

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
          logStream.write(redactOnly(`\nwienerdog: job failed to run: ${failure.message}\n`));
        } catch { /* best-effort */ }
      }
      await endStream(logStream);
    }
  }
```

**Why through the stream and not `fs.appendFileSync`** (recorded so it is not
re-litigated — the previous revision of this contract specified an append to a
variable that does not exist, Current state §7 finding 2):

- **There is no log path to append to.** It is computed inline at `:846` and
  never stored (Current state §4). Re-deriving it at `:1001` calls `runStamp()` a
  second time and yields a *different* filename across a second boundary.
- **The fd is already private.** `createLogStreamPrivate` opened it `O_NOFOLLOW`
  at `0600` under a `0700` dir, inside the core. A pathname re-open would discard
  that proof, could create a fresh **0644** file when the private open had failed
  (`logStream === null`), and would re-introduce a symlink-swap window that the
  original open exists to close.
- **It matches the file's own idiom.** `:867` and `:872` already do exactly
  `logStream.write(redactOnly(...))`.
- **Ordering is safe.** `endStream` is `stream.end(resolve)` (`:514-516`), so a
  write queued immediately before is flushed by `end()`.
- **The `if (logStream)` guard already exists** and is the correct gate: when the
  private open failed there is no log, the detail is simply not preserved, and
  the job still fails loud with the code-owned reason. Losing a debug line on a
  path that is already failing is the right trade against creating an unprotected
  file.

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

All five live in `tests/unit/scheduler-runjob.test.js`.

| # | What it asserts | Drives |
|---|-----------------|--------|
| T1 | **The regression, red-first.** A `runJob` whose child emits an `error` with message `weird ENOENT /x` fails loud with alert `reason` **exactly** `job "<name>" failed to run — see the log for details`, and `weird ENOENT /x` appears **nowhere** in the alert record **or** in the body handed to the injected `opts.sendAlert` stub. | D1 |
| T2 | The same run's per-run log file **does** contain the redacted raw cause (`wienerdog: job failed to run: weird ENOENT /x`). | D2 |
| T3 | A timeout still surfaces the untouched code-owned `job "<name>" timed out after <n> min`. | D1, unchanged arm |
| T4 | A non-zero exit still surfaces `job "<name>" exited <code>`. | D1, unchanged arm |
| T5 | **R8-1 is not clobbered** (POSIX only). A clean exit `0` with an un-reapable group still renders `job "<name>" left a live process group behind: …`, and a *failed* run with an un-reapable group still gets the `— and it left a live process group behind: …` suffix. **This is the only detector for the stale-contract defect described in Current state §7 finding 1**; without it, an implementer who rewrote the ternary as a two-branch `if/else` would ship green. | D1, R8-1 arms |

**Prove T1 in both directions** (`docs/runbooks/codex-review.md`): run it against
the untouched `:1004` (expect **red** — the raw message reaches the alert) and
against the finished one (expect **green**).

**Owner walkthrough (2026-07-18): Ready.** No open fork. Owner ratified reducing a
non-WienerdogError failure to the fixed code-owned sentence in the durable
alert/email and writing the raw (redacted) cause to the local per-run log only —
so the machine-leaving email carries no free-form/attacker-influenced text while
the user can still debug from the log. WienerdogError reasons stay as-is (already
code-owned).

**Ordering, re-checked 2026-08-01.** The old note said "sequence WP-151 after
WP-141 lands"; **`WP-141-broker-runjob-wiring` is `Done`**
(`docs/specs/done/`), so that constraint is discharged. `WP-a10-reap-mechanism`
is also `Done` — and it is the WP that moved this region underneath this spec
(Current state §7). Two **open** specs still list `src/cli/run-job.js` in their
Deliverables: `WP-a10-windows-reap` (`Draft`, win32 settle path only) and
`WP-broker-e2e-terminal-auth` (`Ready`, and only "ONLY if approach 3
(discouraged)"). Neither touches `:1004`, the `finally` at `:923-926`, or
`failLoud`, so there is no file-collision ordering and `depends_on` stays `[]`.

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
      `reason` or the self-email body; only a fixed sentence + code-owned fields
      (job name, exit code, timeout, guard prefix) reach those sinks.
- [ ] The raw failure detail is preserved for the user only in the LOCAL private
      per-run log, redacted via `redactOnly`, never emailed.
- [ ] `alerts.sanitizeAlert`'s cap + scrub is unchanged (belt-and-suspenders).
- [ ] The raw cause is written **through the already-open private fd**, never by
      re-opening a pathname — so no code path can create a log file outside
      `createLogStreamPrivate`'s `O_NOFOLLOW` + `0600` guarantee, and no new
      symlink-swap window is opened (Exact contracts D2).

## Acceptance criteria

- [ ] **AC1** — T1: alert `reason` is exactly
      `job "<name>" failed to run — see the log for details`, and `weird ENOENT /x`
      appears NOWHERE in the alert record or the email body passed to the injected
      `sendAlert` stub. Red against the untouched `:1004`, green after; both runs
      pasted.
- [ ] **AC2** — T2: the raw failure detail is present, redacted, in the per-run
      log file.
- [ ] **AC3** — T3/T4: a timeout still surfaces
      `job "<name>" timed out after <n> min`; a non-zero exit still surfaces
      `job "<name>" exited <code>`.
- [ ] **AC4** — T5: the R8-1 renderings are untouched — the clean-exit
      un-reapable-group arm and the `— and it …` suffix both still appear.
- [ ] **AC5** — `failLoud` still returns its boolean and its body still ends in
      `.trim()`; `alertPersisted` and the G2 pidfile release still work
      (V3 below).
- [ ] **AC6** — `npm test` and `npm run lint` are green.

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

# V5 — full gates.
npm test
npm run lint
```

**Baseline on the untouched tree at `e7c845e`**, so the implementer can tell a
regression from a pre-existing state: V2 prints the hole at `:1004` (exit 0);
V3 prints its five lines; V4's first grep prints `:867` and `:872` and its
second prints nothing (exit 1).

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
- The win32 settle path — `WP-a10-windows-reap` (`Draft`).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **both** directions of T1 (AC1).
2. Branch `wp/151-self-alert-code-owned-body`; conventional commits;
   PR titled `fix(run-job): build fail-loud alert/email body from code-owned fields only (WP-151)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

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
> template ends in `.trim()`. The ordering note was re-checked — `WP-141` is
> `Done`, and no open spec collides. **Status stays `Ready`**: the design decision
> the owner ratified is unchanged; only the code snapshot it lands on had drifted,
> and the one design consequence (D2's mechanism) is recorded above with its
> reason.

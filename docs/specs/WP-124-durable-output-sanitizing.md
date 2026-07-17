---
id: WP-124
title: Durable output sanitizing — bounded secret-scrub of brain stdout/stderr, logs, alerts, and alert email (audit A5)
status: Draft
model: opus
size: M
depends_on: [WP-122]
adrs: [ADR-0004, ADR-0024]
branch: wp/124-durable-output-sanitizing
---

# WP-124: Durable output sanitizing — bounded secret-scrub of brain stdout/stderr, logs, alerts, and alert email (audit A5)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills, hooks,
scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no servers,
no telemetry. Plain Node ≥ 18, **zero runtime deps**, JSDoc types only, no build step.

The nightly **dreaming** brain (Claude/Codex) is spawned with its stdout/stderr piped. Those
bytes are **fully attacker-influenceable** (the brain echoes attacker-influenced transcript
content) and they flow to **three durable/injected sinks**:

1. `src/core/dream/brain.js` **tees the brain's stdout+stderr verbatim** into a per-run
   **log file** under `~/.wienerdog/logs/` (`spawnBrain`'s `logStream.pipe`), and keeps a
   4 KB **stderr tail** (`STDERR_TAIL_MAX`) that surfaces into the "dream brain exited N:
   `<tail>`" error message.
2. That error message becomes the `reason` of a durable **alert** in `state/alerts.jsonl`
   (`src/core/alerts.js` `appendAlert`), which `renderDigest`'s `formatAlerts` prints into the
   **injected digest** every session until the job next succeeds.
3. `src/cli/run-job.js` `failLoud` builds a fail-loud **email body** as
   `` `${reason}\n\n${logTail}` `` — where `logTail` is the last 2 KB of the raw run log
   (`readLogTail`) — and sends it via `gws _alert`.

A 2026-07-15 security audit (action **A5**, deep-dive `05-secret-lifecycle.md`, item 4
point 3 and item 7) found that **none of these three sinks re-checks for a secret**. A key the brain
printed to stderr lands raw in the log (durable, `0644` today), in `alerts.jsonl`, in the
digest banner, in the managed block, **and is emailed to the user's inbox as a raw log tail**.

This WP adds the **third A5 enforcement point (EP3): a bounded sanitizing transform on the
durable stdout/stderr/log/alert path**, and removes the **raw log tail from the alert email**
(audit A5 item 7). It touches `brain.js`, `alerts.js`, and `run-job.js` and their tests. This
is one of the four persistence gates of **ADR-0024**.

**A5 opens NO capability gate.** `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

**`src/core/dream/brain.js`** `spawnBrain(o)` (WP-008/039):

```js
const STDERR_TAIL_MAX = 4096;
// …
let stderrTail = '';
if (child.stderr) {
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_MAX);   // ← raw
  });
}
if (logStream) {                                    // ← raw tee to the durable log
  if (child.stdout) child.stdout.pipe(logStream, { end: false });
  if (child.stderr) child.stderr.pipe(logStream, { end: false });
}
// done resolves { code, durationMs, stderrTail }
```

The `stderrTail` is returned on `done` and dream.js puts it into
`new WienerdogError('dream brain exited ${code}: ${tail}')` → becomes the alert `reason`.
`run-job.js` uses a similar `child.stdout/stderr.pipe(logStream)` in `runJob`.

**`src/core/alerts.js`** `sanitizeAlert(r)` caps each string field to `MAX_FIELD_CHARS`
(2000) but does **not** scan for secrets. `appendAlert` writes the sanitized record to
`state/alerts.jsonl`. `readAlerts` returns sanitized records to `formatAlerts` (digest).

**`src/cli/run-job.js`**: `readLogTail(file)` returns the last `LOG_TAIL_BYTES` (2048) of the
run log; `failLoud(paths, name, reason, logTail, opts)` appends the durable alert
(`{job, at, reason, log_hint}` — `log_hint` is a path, not content) AND calls
`defaultSendAlert(paths, name, subject, body)` where the email `body =
`${reason}\n\n${logTail}`.trim()`. `runJob` calls `failLoud(..., readLogTail(logFile), opts)`.

WP-122 shipped `src/core/secret-scan.js` exporting `scanAndRedact(text) → {text, findings}`
(bounded, total, fail-closed — an oversized/failed scan returns a fixed withheld marker, never
raw text) and `redactOnly(text)` (== `.text`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/brain.js | sanitize each stdout/stderr chunk before it is teed to the log AND before it accumulates into `stderrTail` (bounded transform) |
| modify | src/core/alerts.js | `sanitizeAlert` runs each field through `redactOnly` (defense-in-depth: no secret persists to alerts.jsonl / digest) |
| modify | src/cli/run-job.js | sanitize the run-job child's teed stdout/stderr; drop the **raw log tail** from the fail-loud email body (code-owned reason + log_hint pointer only) |
| modify | tests/unit/dream-brain.test.js | a stderr chunk carrying a secret is redacted in both the teed log and `stderrTail` |
| modify | tests/unit/alerts.test.js | an alert whose `reason` contains a secret is stored redacted; existing field-cap/compaction behavior preserved |
| modify | tests/unit/scheduler-runjob.test.js | the alert email body carries no raw log tail; the run-job log tee is sanitized; exit codes/watermark behavior unchanged |

### Exact contracts

**1. `brain.js` — bounded sanitizing transform on the brain's output.** The brain's
stdout/stderr must pass through `scanAndRedact` before reaching the durable log or the stderr
tail. Because the streams are chunked, scan **per chunk** (a bounded string — each chunk is at
most the OS pipe buffer, and `scanAndRedact` further bounds at `SCAN_MAX_BYTES`). Concretely:

- Replace the raw `child.stdout/stderr.pipe(logStream)` tee with a per-chunk handler that
  writes `redactOnly(chunk.toString('utf8'))` to `logStream` (keep `{ end:false }` semantics —
  the caller owns the stream). Do the SAME for stdout and stderr.
- Build `stderrTail` from the **redacted** chunk text, keeping the existing
  `.slice(-STDERR_TAIL_MAX)` bound: `stderrTail = (stderrTail + redactOnly(chunk.toString('utf8'))).slice(-STDERR_TAIL_MAX)`.

  > A per-chunk scan can split a secret across a chunk boundary (half in chunk A, half in B),
  > so redaction is best-effort at the boundary — that is acceptable here because (a) EP2/EP4
  > and the private-mode `0600` log (WP-126) are the other layers, and (b) A5's residual
  > explicitly states a scanner is never airtight. Do NOT try to buffer across chunks to catch
  > boundary-split secrets — an unbounded reassembly buffer would reintroduce the OOM/DoS
  > surface WP-118 closed. Note this boundary limitation in a code comment.

Nothing else in `spawnBrain` changes: `done` still resolves `{ code, durationMs, stderrTail }`
(now redacted); the argv builders, watchdog contract, and env are untouched.

**2. `alerts.js` — scrub alert fields before they persist.** In `sanitizeAlert`, after the
existing length-cap, run each of the four string fields through `redactOnly`:
`{ job: red(cap(o.job)), at: red(cap(o.at)), reason: red(cap(o.reason)), log_hint: red(cap(o.log_hint)) }`
(cap first so the scan input is already bounded; `at`/`job`/`log_hint` are code-owned and
should be no-ops, but scanning uniformly is the fail-closed choice). This guarantees that even
if a secret reached a `reason` from some other caller, `alerts.jsonl` and the digest never
carry it. The `MAX_ALERTS`/`MAX_FILE_BYTES` compaction, the separator guard, the empty-read
guard, and `clearAlerts` are **unchanged** — do not alter the file-bounding logic.

**3. `run-job.js` — sanitize the tee + drop the raw log tail from the email.**
- In `runJob`, replace the raw `child.stdout/stderr.pipe(logStream)` with the same per-chunk
  `redactOnly` tee as brain.js (the run-job child is a routine brain too). Keep `{ end:false }`.
- **Remove the raw log tail from the fail-loud EMAIL body** (audit A5 item 7). `failLoud`'s
  email `body` must be built from **code-owned status fields only** — the `reason` (already a
  code-owned message; it may embed a redacted `stderrTail`, which is now sanitized at source in
  brain.js) plus the `log_hint` pointer — and MUST NOT include `readLogTail(...)` content. Two
  options — pick the simpler and record it:
  - **(recommended)** Stop passing `logTail` into the email: change the email `body` to
    `` `${reason}\n\nDetails: ${logHint}` `` (the durable alert already carries `log_hint`;
    the user opens the local `0600` log to see the tail). Keep `readLogTail` if still used by
    the durable alert path — **it is not** (the durable alert stores `log_hint`, not the tail),
    so `readLogTail`'s only consumer is the email; if you remove that consumer, remove
    `readLogTail` too (and its test) OR leave it unused and note it. Prefer removing the raw
    tail from the email over sanitizing it — the audit says the email must contain **no raw log
    tail**, and a code-owned body is strictly safer than a scanned one.
  - The durable `appendAlert` record is unchanged (it never held tail content — `log_hint` is a
    path). `runJob` still calls `failLoud(paths, name, reason, <tail-or-''>, opts)`; adjust the
    `failLoud` signature/usage so the email no longer embeds a raw tail. If you keep the
    `logTail` parameter for signature stability, ignore it in the body and note it.

### Worked example (assert across the three tests)

```
Brain stderr emits: 'Traceback… OPENAI_API_KEY=sk-proj-ABCDEF0123456789abcdef …'
→ the per-run log file contains '[REDACTED:' , NOT 'sk-proj-ABCDEF…'
→ done.stderrTail contains '[REDACTED:' , NOT the key
→ the resulting alert reason (dream: 'dream brain exited 1: …[REDACTED:…]…') stored in
  alerts.jsonl carries no key; the digest banner (formatAlerts) carries no key
→ the fail-loud email body is the code-owned reason + 'Details: ~/.wienerdog/logs/dream/' ,
  with NO raw log tail (assert the body does not contain the 2 KB tail nor the key)
```

## OWNER-APPROVED (2026-07-17) — DECISION NEEDED, resolve in the walkthrough

- **OWNER-APPROVED (2026-07-17) — email body: code-owned only.** The fail-loud email body is
  built from the `reason` string (whose embedded stderr tail is now redacted at source in
  brain.js) + a `log_hint` pointer to the local log — the raw log tail is dropped entirely,
  not sanitized-and-kept. Email is the one sink that leaves the machine (durably stored and
  indexed by the mail provider; `0600` modes cannot protect it), so a detector miss there is
  unrecoverable — a code-owned body is strictly safer than a scanned one (aligns with A13
  "generate the alert body from bounded code-owned status fields"). Diagnostic cost accepted:
  the user opens the local private log for the tail.
- **OWNER-APPROVED (2026-07-17) — chunk-boundary limitation accepted; no cross-chunk
  reassembly.** A secret split across two stream chunks may be partially redacted at the
  boundary. Buffering chunks to rescan would reintroduce the unbounded-accumulation DoS/OOM
  surface WP-118 closed (a hostile stream can simply never present a scannable boundary).
  The gap is covered by the other layers: WP-123 (staged files scanned whole), WP-125
  (digest sections scanned whole), WP-126 (`0600` log stays local), and the email carries no
  log content at all (ruling above). Documented in a code comment and in the WP-127 docs —
  the A5 residual posture, not a silent limitation.

## Implementation notes & constraints

- **This is EP3 of ADR-0024.** Reference it where the tees/email change.
- **Bounded, never buffer unboundedly.** Scan per chunk; `scanAndRedact` self-bounds at
  `SCAN_MAX_BYTES`; keep the existing `STDERR_TAIL_MAX`/`LOG_TAIL_BYTES`/`MAX_FIELD_CHARS`
  bounds. Never accumulate the full brain output to scan it whole (that reopens the WP-118 OOM
  surface).
- **No happy-path behavior change.** A clean brain run produces byte-identical logs/alerts
  (redaction is a no-op on non-secret text) and the same exit codes/watermark/`clearAlerts`
  behavior. Only secret-bearing output and the email body change.
- **Preserve the injection-safe encoders.** `alerts.js` still `JSON.stringify`s each record;
  `formatAlerts` is unchanged. The redaction is applied to field VALUES, not the JSON framing.
- **Fail-closed source.** Because `redactOnly` is total (WP-122), a scan error yields the
  withheld marker, never the raw chunk — the log/alert/email degrade to "content withheld,"
  never "raw secret."
- Reuse `redactOnly`/`scanAndRedact` from `secret-scan`. Zero deps, JSDoc only. When uncertain,
  choose simpler + record it.

## Security checklist

- [ ] Brain (and run-job child) stdout/stderr is redacted per chunk before it reaches the
      durable log or the stderr tail; alert fields are redacted before they persist to
      `alerts.jsonl`; the fail-loud **email carries no raw log tail** (code-owned reason +
      log_hint pointer only). All bounds (`STDERR_TAIL_MAX`, `LOG_TAIL_BYTES`,
      `MAX_FIELD_CHARS`, `SCAN_MAX_BYTES`) are preserved so a hostile output stream cannot
      unbounded-buffer the scan. Redaction is fail-closed (a scan error withholds content). No
      untrusted value is interpolated into a shell command; `gws _alert` args stay an array.

## Acceptance criteria

- [ ] A secret in the brain's stderr is redacted in BOTH the teed per-run log AND
      `done.stderrTail` (assert neither contains the raw token).
- [ ] An alert whose `reason` contains a secret is stored in `alerts.jsonl` redacted, and the
      digest banner rendered from it carries no secret; the alerts file-bounding
      (MAX_ALERTS/MAX_FILE_BYTES/compaction/separator/empty-read guards) is unchanged.
- [ ] The fail-loud email body contains **no raw log tail** and no secret — only the code-owned
      reason and a log-location pointer (assert the body excludes the planted tail bytes).
- [ ] A clean dream run yields byte-identical logs/alerts vs before (redaction no-op on
      non-secret text) and unchanged exit codes / watermark / `clearAlerts`.
- [ ] `wienerdog safety` shows all five gates BLOCKED; `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "brain"
npm test -- --test-name-pattern "alert"
npm test -- --test-name-pattern "run-job"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
```

## Out of scope (do NOT do these)

- The shared detector — **WP-122**. The staged-commit gate — **WP-123**. The digest section
  gate — **WP-125**.
- **Log rotation/bounding policy** and `secrets/`/token/grant modes — **A9** (this WP only
  sanitizes content and drops the email tail; it does not change log rotation or file modes —
  the `0600` log mode is **WP-126**).
- Any change to the watchdog, argv builders, `clearAlerts`, or the alerts file-bounding logic.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/124-durable-output-sanitizing`; conventional commits; PR titled
   `feat(dream): sanitize brain output to logs/alerts + drop raw log tail from email (WP-124)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per WORKING-NOTES.md; `branch:`/PR fields are
> kept for template/upstream-porting fidelity.

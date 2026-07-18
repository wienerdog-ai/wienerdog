---
id: WP-151
title: Build the fail-loud alert and self-email body from code-owned status fields, never a free-form failure string
status: Draft
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

`src/cli/run-job.js`:
- `failLoud(paths, name, reason, opts)` appends the alert and sends the email
  `body = ${reason}\n\nDetails: ${logHint}`. Its JSDoc already asserts the body
  is "code-owned status fields ONLY" — this WP makes that true for every path.
- The failure `reason` is built at the end of `runJob`:
```js
const reason = failure
  ? failure instanceof WienerdogError
    ? failure.message                                   // code-owned (timeout, resolveCommand errors, …)
    : `job "${name}" failed: ${failure.message}`        // ← free-form Node error string (the hole)
  : `job "${name}" exited ${code}`;                     // code-owned
jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
await failLoud(paths, name, reason, opts);
throw new WienerdogError(reason);
```
- The TCC-refusal `reason` (line ~496) is a code-owned template with `g.offending`
  (the user's own vault path) + `g.prefix` (a code-owned protected-folder name) —
  already bounded; leave it.
- The policy-hooks `appendAlert` (line ~523) uses a fully code-owned template with
  a bounded `policyHooks.sources` list — already bounded; leave it.
- `failure` is set from `child.on('error', reject)` (spawn errors like ENOENT) or
  the watchdog's `WienerdogError` (timeout). The brain's own stderr is teed to the
  per-run log, NOT into `reason`. `logFile` (the per-run log path) and
  `redactOnly` (from `secret-scan`) are in scope; the `logStream` is already
  closed (`endStream`) before `reason` is built.
- `src/core/alerts.js` `sanitizeAlert` already restricts a record to
  `{job, at, reason, log_hint}`, each length-capped (`MAX_FIELD_CHARS`) and
  secret-scrubbed. This WP does NOT change alerts.js — the bounded-field guarantee
  there stays; this WP removes the free-form INPUT at the caller.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | Replace the free-form `job "<name>" failed: <message>` branch with a code-owned reason; append the raw (redacted) failure detail to the per-run LOG only. |
| modify | tests/unit/run-job... | Add/extend the run-job unit test file that covers `runJob` failure/fail-loud (see Verification for the pattern); assert the alert `reason` for a spawn-error failure is the code-owned string and contains none of the raw Node message. |

### Exact contracts

Replace the `reason` construction with a closed set of code-owned renderings:
```js
// Code-owned failure renderings ONLY — the alert is durable and the email leaves
// the machine, so no free-form/attacker-influenced string may enter here. A
// WienerdogError message is Wienerdog-authored (timeout, resolveCommand, guard);
// a non-WienerdogError (e.g. a spawn ENOENT) is reduced to a fixed sentence and
// its raw detail is written to the local private log instead (audit A13).
let reason;
if (failure) {
  if (failure instanceof WienerdogError) {
    reason = failure.message; // Wienerdog-authored, bounded
  } else {
    reason = `job "${name}" failed to run — see the log for details`;
    // Preserve the raw cause for the user WITHOUT emailing it: append it, redacted,
    // to the per-run log. Best-effort; never let logging failure mask the alert.
    try {
      fs.appendFileSync(logFile, redactOnly(`\nwienerdog: job failed to run: ${failure && failure.message}\n`));
    } catch { /* best-effort */ }
  }
} else {
  reason = `job "${name}" exited ${code}`; // code-owned
}
```
- The `throw new WienerdogError(reason)` at the end stays — it now throws the
  code-owned `reason` too (a non-WienerdogError's raw message is no longer
  surfaced in the process's error line either; it lives in the log).
- Do NOT change the TCC-refusal reason or the policy-hooks alert — both are
  already code-owned/bounded.
- Do NOT change `failLoud`'s body template (`${reason}\n\nDetails: ${logHint}`) —
  once `reason` is code-owned, the whole body is.
- `fs`, `logFile`, and `redactOnly` are already in scope in `runJob`; no new
  imports.

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

## Acceptance criteria

- [ ] A `runJob` whose child emits an `error` (non-WienerdogError, e.g. a spawn
      failure with message `weird ENOENT /x`) fails loud with an alert `reason` of
      exactly `job "<name>" failed to run — see the log for details`; the raw
      `weird ENOENT /x` appears NOWHERE in the alert record or the email body
      passed to the injected `sendAlert` stub.
- [ ] A timeout still surfaces the code-owned `job "<name>" timed out after <n> min`.
- [ ] A non-zero exit still surfaces `job "<name>" exited <code>`.
- [ ] The raw failure detail is present (redacted) in the per-run log file.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "run-job|runJob|fail"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any change to `src/core/alerts.js` (its bounded-field + scrub contract is
  already correct — WP-124).
- Changing the TCC-refusal or policy-hooks alert wording (already code-owned).
- Changing `gws _alert` / `gws/alert.js` (the recipient is already fixed to self).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/151-self-alert-code-owned-body`; conventional commits;
   PR titled `fix(run-job): build fail-loud alert/email body from code-owned fields only (WP-151)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

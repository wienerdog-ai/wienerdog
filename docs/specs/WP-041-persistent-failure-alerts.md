---
id: WP-041
title: Persistent failure alerts (alerts.jsonl) rendered into the digest
status: Ready
model: opus
size: M
depends_on: [WP-039]
adrs: [ADR-0004]
branch: wp/041-persistent-failure-alerts
---

# WP-041: Persistent failure alerts (alerts.jsonl) rendered into the digest

## Context (read this, nothing else)

When a scheduled job fails, Wienerdog **fails loud** (GLOSSARY): it must never
fail silently. `run-job` today tries an email alert (`gws _alert`, works only
when Google is configured) and, on any failure, falls back to prepending a
warning banner to the injected session **digest** (`~/.wienerdog/state/digest.md`,
copied into the user's CLAUDE.md/AGENTS.md managed block and read at every session
start). **Iron rule (ADR-0004): Wienerdog is just files — no telemetry, no
process. This WP writes one append-only state file and reads it at render time;
it starts nothing.**

Production defect (2026-07-04): **the banner is transient.** `renderDigest`
regenerates `digest.md` from scratch on every dream and every `sync`, so the next
regeneration erased the banner. Across the incident, 8 dream failures over 10
hours were discoverable **only** by reading `~/.wienerdog/logs/dream/`. The
transient banner was an accepted WP-020 tradeoff that production has now
falsified.

**The design is decided; encode it exactly.** Replace the transient banner with a
durable, append-only alert log that is re-rendered into the digest on *every*
regeneration, so a failure stays visible until it is resolved:

- **`state/alerts.jsonl`** — `run-job` **appends** one JSON line per failure
  (any fail-loud path). Its entries are all "unresolved" by construction.
- **Cleared on success** — when a job next runs successfully, `run-job` **removes
  that job's lines** from `alerts.jsonl`.
- **Rendered at digest-render time** — `renderDigest` prepends a plain-language
  alert block whenever unresolved alerts exist. Because both `dream.js` and
  `sync.js` re-read `alerts.jsonl` and pass it to `renderDigest` on every
  regeneration, the block **survives digest regeneration** — the exact property
  the transient banner lacked.

Threat-model note (inline; THREAT-MODEL.md update is a separate follow-up):
`alerts.jsonl` lives under `state/` (mechanics, not vault knowledge) and holds
only Wienerdog-authored job-status facts — no transcript or tool-result content.
It is rendered as plain declarative text with **no instruction-following
framing** (it never tells the model to do anything), so it adds no injection
surface even though it lands in the injected digest.

## Current state

### `src/cli/run-job.js` — fail-loud + banner (to replace) and success (to extend)

```js
const LOG_TAIL_BYTES = 2048;

// Prepend a TRANSIENT banner to digest.md (this is what regeneration erases):
function writeDigestBanner(paths, name, reason) {
  const banner = `> [!warning] Wienerdog job "${name}" failed at ${nowIso()} — ${reason}. See ${logHint}.`;
  // … atomic temp+rename into paths.state/digest.md …
}

async function failLoud(paths, name, reason, logTail, opts = {}) {
  // try opts.sendAlert || defaultSendAlert (email); on failure → writeDigestBanner. Never throws.
}

// runJob success path (step 6):
if (!failure && code === 0) {
  jobsLib.writeScheduleState(paths, name, { last_success: nowIso(), last_status: 'ok' });
  // … darwin ensureCatchup … stdout "ok" …
  return;
}
// runJob failure path (step 7):
jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
await failLoud(paths, name, reason, readLogTail(logFile), opts);
throw new WienerdogError(reason);
```

`failLoud` is also called from the TCC-guard refusal path. `nowIso()` returns an
ISO timestamp. `tilde(home, p)` renders an abs path under home as `~/…`.
`paths.state` is `<core>/state`; `paths.logs` is `<core>/logs`. `writeDigestBanner`
is currently in `module.exports`.

### `src/core/digest.js` — `renderDigest` (to extend)

```js
function renderDigest(vaultDir, layout = defaultLayout()) {
  // builds `parts` (identity, projects, latest daily) then:
  return `${parts.join('\n\n')}\n`;
}
module.exports = { renderDigest };
```

Callers: `src/cli/dream.js:191` `renderDigest(vaultDir, layout)` and
`src/cli/sync.js:152` `renderDigest(vaultPath, layout)`. **Both already have a
resolved `paths` in scope** (`dream.js` `const paths = getPaths()`; `sync.js`
`const paths = getPaths()` at line 125). A golden test asserts
`renderDigest(FIXTURE)` equals `tests/golden/digest-default.md` byte-for-byte —
so the new alert block MUST NOT change output when no alerts are passed.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/alerts.js | `appendAlert`, `readAlerts`, `clearAlerts`, `ALERTS_FILE` |
| modify | src/core/digest.js | `renderDigest` gains `opts.alerts`; prepends a plain-text block |
| modify | src/cli/run-job.js | fail-loud appends an alert; success clears it; remove `writeDigestBanner` |
| modify | src/cli/dream.js | read alerts, pass to `renderDigest` at digest regen |
| modify | src/cli/sync.js | read alerts, pass to `renderDigest` |
| create | tests/unit/alerts.test.js | alerts module + digest alert-block render |
| modify | tests/unit/scheduler-runjob.test.js | alert append-on-failure / clear-on-success; replace banner test |

### Exact contracts

**`src/core/alerts.js`** — append-only alert log under `state/alerts.jsonl`. One
JSON object per line; the record shape is frozen:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ALERTS_FILE = 'alerts.jsonl';

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function alertsPath(paths) { return path.join(paths.state, ALERTS_FILE); }

/** Append one unresolved failure alert (atomic append; creates state/ if needed).
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {{job:string, at:string, reason:string, log_hint:string}} record */
function appendAlert(paths, record) {
  fs.mkdirSync(paths.state, { recursive: true });
  fs.appendFileSync(alertsPath(paths), `${JSON.stringify(record)}\n`);
}

/** All unresolved alerts, oldest first. Missing file → []; malformed lines skipped.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @returns {Array<{job:string, at:string, reason:string, log_hint:string}>} */
function readAlerts(paths) {
  let text;
  try { text = fs.readFileSync(alertsPath(paths), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

/** Remove all alerts for `job` (called when that job next succeeds). Atomic
 *  temp+rename. Removes the file when no alerts remain.
 *  @param {import('./paths').WienerdogPaths} paths @param {string} job */
function clearAlerts(paths, job) {
  const remaining = readAlerts(paths).filter((a) => a.job !== job);
  const file = alertsPath(paths);
  if (remaining.length === 0) { fs.rmSync(file, { force: true }); return; }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, remaining.map((a) => JSON.stringify(a)).join('\n') + '\n');
  fs.renameSync(tmp, file);
}

module.exports = { appendAlert, readAlerts, clearAlerts, ALERTS_FILE };
```

**`src/core/digest.js` — `renderDigest` gains an alerts block.** New signature and
behavior (golden output unchanged when `opts.alerts` is empty/absent):

```js
/** @param {string} vaultDir
 *  @param {import('./layout').VaultLayout} [layout]
 *  @param {{alerts?: Array<{job:string,at:string,reason:string,log_hint:string}>}} [opts]
 *  @returns {string} */
function renderDigest(vaultDir, layout = defaultLayout(), opts = {}) {
  const body = /* … existing render: `${parts.join('\n\n')}\n` … */;
  const alertBlock = formatAlerts(opts.alerts || []);
  return alertBlock ? `${alertBlock}\n\n${body}` : body;
}
```

`formatAlerts(alerts)` — pure helper in `digest.js`, returns `''` for an empty
list, else one plain-text callout line per failing job (group by `job`; count;
earliest `at`; latest `reason`). Declarative only — no imperative to the model:

```js
function formatAlerts(alerts) {
  if (!alerts || alerts.length === 0) return '';
  const byJob = new Map(); // job → {count, first, lastReason, hint}
  for (const a of alerts) {
    const cur = byJob.get(a.job) || { count: 0, first: a.at, lastReason: a.reason, hint: a.log_hint };
    cur.count += 1;
    if (a.at < cur.first) cur.first = a.at;
    cur.lastReason = a.reason;   // alerts are oldest-first → last wins
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

**`src/cli/run-job.js` changes.**

- Import `const { appendAlert, clearAlerts } = require('../core/alerts');`.
- In `failLoud`, ALWAYS append a durable alert (the durable record is independent
  of whether the best-effort email is delivered), then attempt the email exactly
  as today, and **remove the `writeDigestBanner` fallback entirely**:

  ```js
  async function failLoud(paths, name, reason, logTail, opts = {}) {
    try {
      appendAlert(paths, {
        job: name,
        at: nowIso(),
        reason,
        log_hint: `${tilde(paths.home, path.join(paths.logs, name))}/`,
      });
      const send = opts.sendAlert || defaultSendAlert;
      const subject = `job ${name} failed`;
      const body = `${reason}\n\n${logTail || ''}`.trim();
      try { send(paths, name, subject, body); } catch { /* email best-effort */ }
    } catch {
      // Fail-loud is best-effort; never mask the original failure.
    }
  }
  ```

  Remove `writeDigestBanner` (function + its `module.exports` entry). It has no
  other callers.

- In `runJob`'s success path (step 6), after `writeScheduleState(... last_status:
  'ok')`, clear this job's alerts:

  ```js
  jobsLib.writeScheduleState(paths, name, { last_success: nowIso(), last_status: 'ok' });
  clearAlerts(paths, name);
  ```

**`src/cli/dream.js` — pass alerts at digest regen (step 10).** Import
`const { readAlerts } = require('../core/alerts');` and change the regen call:

```js
const digest = renderDigest(vaultDir, layout, { alerts: readAlerts(paths) });
```

**`src/cli/sync.js` — pass alerts (line ~152).** Import
`const { readAlerts } = require('../core/alerts');` and change:

```js
const digest = renderDigest(vaultPath, layout, { alerts: readAlerts(paths) });
```

(`paths` is already resolved at `sync.js:125`.)

### Example (evidence-shaped)

After the incident's 8 dream failures, `state/alerts.jsonl` holds 8 lines like:

```json
{"job":"dream","at":"2026-07-04T01:30:05.551Z","reason":"job \"dream\" exited 1","log_hint":"~/.wienerdog/logs/dream/"}
```

and `renderDigest(vault, layout, { alerts })` prepends:

```
> [!warning] Wienerdog: the "dream" job has failed 8 times since 2026-07-04T01:30:05.551Z. Latest error: job "dream" exited 1. Details in ~/.wienerdog/logs/dream/. This note clears automatically when the job next succeeds.
```

The next successful dream calls `clearAlerts(paths, 'dream')`; the following
regeneration drops the block.

## Implementation notes & constraints

- No new npm dependencies; plain Node ≥ 18; JSDoc types only (CLAUDE.md).
- **Known one-regeneration lag (accept it, record it):** when a dream succeeds,
  `dream.js` regenerates `digest.md` *before* `run-job` clears the alert (the
  clear happens after the child exits). So the just-written digest may still show
  a stale block; the next `sync`/dream regeneration drops it. This is strictly
  better than the status quo (the block now persists across regenerations until
  resolved, instead of vanishing on the first). Do NOT couple `run-job` to the
  digest renderer to shave this lag.
- `formatAlerts` output must remain declarative status text — never phrase an
  alert as an instruction (threat-model: it lands in the injected digest).
- The golden test `renderDigest(FIXTURE)` (no alerts) must stay byte-for-byte
  identical — `formatAlerts([])` returns `''` and the body is unchanged.
- Append is line-atomic (`appendFileSync`); clear is temp+rename. No locking is
  required (jobs are short-lived and serialized by the scheduler; concurrent
  writers are not a v1 concern — note if you find otherwise).

## Acceptance criteria

- [ ] `appendAlert` creates `state/alerts.jsonl` and appends one line;
      `readAlerts` returns the parsed records oldest-first and skips malformed
      lines; `clearAlerts(job)` removes only that job's lines and deletes the file
      when empty.
- [ ] `renderDigest(vault, layout, { alerts: [] })` and `renderDigest(vault,
      layout)` both equal the pre-existing output; the golden test passes unchanged.
- [ ] `renderDigest(vault, layout, { alerts })` with alerts for a job prepends a
      single plain-text `> [!warning]` line naming the job, the failure count +
      earliest timestamp, the latest reason, and the log hint.
- [ ] A failing `run-job` appends exactly one alert to `alerts.jsonl` (and still
      fails loud + throws); a subsequent successful run of the same job clears it.
- [ ] `writeDigestBanner` is removed and no longer exported; no caller references it.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'alerts'
npm test -- --test-name-pattern 'scheduler-runjob'
npm test -- --test-name-pattern 'renderDigest'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Run-job clean-env / rotation / `spawnBrain` stderr — **WP-038**.
- Dream pre-commit / crash recovery — **WP-039** (this WP depends on it).
- Note-update provenance in the dream skill — **WP-040**.
- A macOS user notification channel for alerts (a possible future channel;
  `alerts.jsonl` + digest is the v1 mechanism).
- Authoring the THREAT-MODEL.md entry for `alerts.jsonl` — flag it in the PR.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/041-persistent-failure-alerts`; conventional commits;
   PR titled `feat(run-job): persistent failure alerts in the digest (WP-041)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

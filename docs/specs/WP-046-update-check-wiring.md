---
id: WP-046
title: Wire the update check into run-job + render it into digest/doctor; threat model
status: Ready
model: opus
size: M
depends_on: [WP-045]
adrs: [ADR-0015, ADR-0004]
branch: wp/046-update-check-wiring
---

# WP-046: Wire the update check into run-job + render it into digest/doctor; threat model

## Context (read this, nothing else)

WP-045 built `src/core/update-check.js` — a bounded, opt-out version check that
caches the latest version in `~/.wienerdog/state/update-check.json` and renders a
fixed-template "update available" line from that cache (never from the network).
This WP wires it in, per ADR-0015:

- **Refresh only on scheduled `run-job`.** The refresh (`maybeRefresh`, ≤3s,
  once/24h, silent on failure) runs at the start of `wienerdog run-job`. Because
  the nightly dream is scheduled by default (WP-044/ADR-0014), the cache
  populates automatically each night. **Decision (recorded here):** v1 refreshes
  only on `run-job`, not on interactive commands — ADR-0015 permits interactive
  refresh ("may") but the simpler choice is scheduled-only; every read path
  renders from the cache. Interactive refresh is a trivial future addition.
- **Render from cache everywhere** (no network on these paths):
  - the injected **digest** (`renderDigest` gains `opts.updateLine`), so the
    SessionStart hook — which only reads `state/digest.md` and must never network
    (<200 ms) — surfaces it;
  - **`doctor`** prints a plain info line.
- **The SessionStart hook never networks** — it already just reads
  `state/digest.md`; putting the line INTO the digest at render time is what makes
  it appear with zero hook network.
- **Injection safety (WP-041 rule):** the update line is fixed-template
  declarative control-plane text; the validated semver is the only variable, and
  no registry-supplied prose flows into the digest. Same property as
  `state/alerts.jsonl`. The THREAT-MODEL gains an honest entry (T7) and the
  deferred `alerts.jsonl` note is folded in.

Iron rule (ADR-0004) holds: no new process; the check piggybacks on the already-
running `run-job`.

## Current state

### `src/core/digest.js` — `renderDigest` (extended by WP-041)

```js
function renderDigest(vaultDir, layout = defaultLayout(), opts = {}) {
  // …builds `parts`…
  const body = `${parts.join('\n\n')}\n`;
  const alertBlock = formatAlerts(opts.alerts || []);
  return alertBlock ? `${alertBlock}\n\n${body}` : body;
}
```

A golden test asserts `renderDigest(FIXTURE)` (no opts) equals
`tests/golden/digest-default.md` byte-for-byte — the new `updateLine` MUST default
to `''` and leave that output unchanged.

### `src/cli/run-job.js` — `run(argv, opts = {})`

The entry dispatches `--catch-up` vs a single job. You add a best-effort
`maybeRefresh` at the very start, threading an injectable fetch seam.

### `src/cli/sync.js` and `src/cli/dream.js` — digest regeneration

Both already call `renderDigest(vault, layout, { alerts: readAlerts(paths) })`.
You add `updateLine: renderUpdateLine(paths)` to each call. Both already have
`paths` in scope.

### `src/cli/doctor.js` — `run(_argv)` prints `[ok]/[warn]/[fail]` check lines

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/digest.js | `renderDigest` gains `opts.updateLine`; prefix order = alerts, updateLine, body |
| modify | src/cli/run-job.js | best-effort `maybeRefresh` at start of `run(argv, opts)` |
| modify | src/cli/sync.js | pass `updateLine: renderUpdateLine(paths)` to `renderDigest` |
| modify | src/cli/dream.js | pass `updateLine: renderUpdateLine(paths)` to `renderDigest` |
| modify | src/cli/doctor.js | print a cache-only "update available" info line |
| modify | docs/THREAT-MODEL.md | add T7 (update check) + fold in the deferred `alerts.jsonl` note |
| modify | tests/unit/digest.test.js | `updateLine` render case; golden unchanged when empty |
| modify | tests/unit/scheduler-runjob.test.js | `setup()` sets `update_check: false`; one wiring test enables it + injects fetch |
| modify | tests/unit/doctor.test.js | seeded cache → doctor prints the update line; no network |

### Exact contracts

**`src/core/digest.js` — `renderDigest`.** Add `updateLine` to `opts` and compose
the prefix so byte output is unchanged when both alerts and updateLine are empty:

```js
/** @param {{alerts?: Array<…>, updateLine?: string}} [opts] */
function renderDigest(vaultDir, layout = defaultLayout(), opts = {}) {
  // …unchanged up to `body`…
  const body = `${parts.join('\n\n')}\n`;
  const prefix = [formatAlerts(opts.alerts || []), opts.updateLine || '']
    .filter((s) => s !== '')
    .join('\n\n');
  return prefix ? `${prefix}\n\n${body}` : body;
}
```

(Alerts come first — failures are more urgent than an available update.)

**`src/cli/run-job.js` — refresh at start.** Import
`const { maybeRefresh } = require('../core/update-check');`. As the FIRST thing in
`run(argv, opts = {})` (before `--catch-up`/single-job dispatch), best-effort:

```js
const paths = getPaths();
// Bounded, once/24h, opt-out, silent on failure (ADR-0015). Never blocks/fails
// the job. Fetch seam is injectable for hermetic tests.
try { await maybeRefresh(paths, { fetchLatest: opts.fetchLatest }); } catch { /* never affects the job */ }
```

(Keep the existing `const paths = getPaths();` — do not resolve it twice; place
the refresh right after it.)

**`src/cli/sync.js`** — import `const { renderUpdateLine } = require('../core/update-check');`
and change the digest call:

```js
const digest = renderDigest(vaultPath, layout, { alerts: readAlerts(paths), updateLine: renderUpdateLine(paths) });
```

**`src/cli/dream.js`** — same import; change the regen call:

```js
const digest = renderDigest(vaultDir, layout, { alerts: readAlerts(paths), updateLine: renderUpdateLine(paths) });
```

**`src/cli/doctor.js`** — import `const { getUpdateNotice } = require('../core/update-check');`.
After the existing checks (and before the `if (failed)` line), print a cache-only
info line (does NOT affect pass/fail; does NOT network):

```js
const upd = getUpdateNotice(paths);
if (upd.available) {
  console.log(`[info] a newer Wienerdog is available (${upd.current} → ${upd.latest}) — update: npx wienerdog@latest sync`);
}
```

**`docs/THREAT-MODEL.md`.** (1) Add a new section **T7** after T6:

```
## T7 — Update-availability check (outbound registry call)

**Hazard**: a files-only, no-telemetry tool making an outbound network call
could look like telemetry; and a malicious/compromised registry response could
try to inject content into the injected digest.

**Mitigations (ADR-0015)**: the check piggybacks on already-running scheduled
`run-job` invocations — no new process (ADR-0004). It performs a single HTTPS
GET to `registry.npmjs.org` for the package's `latest` dist-tag, at most once per
24h, with a bounded timeout; failure is a silent skip that never blocks or fails
the job. It sends no user data beyond a standard HTTPS request — no identifiers,
no vault content. It is opt-out (`update_check: false` in config.yaml; default
on), documented in plain language. The response is untrusted: the version string
is validated as semver-shaped before storage, and only a fixed-template
declarative line is rendered (no registry-supplied text reaches the digest
verbatim). Wienerdog never auto-updates — it only prints the exact command
(`npx wienerdog@latest sync`). This is disclosed here as a named, opt-out
exception to "no network except what you configured"; it is not telemetry.
```

(2) Fold in the deferred `alerts.jsonl` note by adding this bullet to **T1**'s
Mitigations list:

```
- **Non-vault sources rendered into the digest carry no injection surface**:
  the only content injected into `state/digest.md` beyond vault notes is the
  durable-alerts block (`state/alerts.jsonl`) and the update-available line —
  both are fixed-template, declarative control-plane text computed by code from
  Wienerdog-authored facts (job status; a validated semver). Neither ever
  contains transcript/tool-result text or instruction-following framing, so
  neither widens the injection surface despite landing in the injected digest.
```

### Example (evidence-shaped)

With `state/update-check.json` holding `latest: "0.3.0"` and this build `0.2.1`,
a `sync`/dream regeneration prepends to `state/digest.md`:

```
> [!note] A newer Wienerdog is available (0.2.1 → 0.3.0). Update with: npx wienerdog@latest sync
```

and `wienerdog doctor` prints:

```
[info] a newer Wienerdog is available (0.2.1 → 0.3.0) — update: npx wienerdog@latest sync
```

## Implementation notes & constraints

- No new npm dependencies; JSDoc only.
- **Golden digest is byte-frozen** when no alerts and no update line
  (`renderDigest(FIXTURE)` unchanged) — the `digest.test.js` golden case must
  still pass. Add a NEW case for `updateLine` rather than editing the golden.
- **Hermeticity — no live registry, ever (institutional rule):**
  - `scheduler-runjob.test.js`: add `update_check: false` to the `setup()` config
    so every existing run-job test skips the refresh (no network). Add ONE new
    test that writes a config with `update_check: true`, runs
    `runjob.run(['--catch-up'], { fetchLatest: async () => '9.9.9' })` in the
    temp core, and asserts `state/update-check.json` now holds `latest: "9.9.9"`.
    Never rely on the default network fetch.
  - `doctor.test.js`: seed `state/update-check.json` with a greater `latest`
    (write the file directly), run `doctor`, assert stdout contains the info
    line. doctor reads cache only — no fetch seam needed.
  - `digest.test.js`: assert `renderDigest(vault, layout, { updateLine: '> [!note] …' })`
    prepends the line, and `renderDigest(vault, layout)` is byte-identical to the
    golden.
- `maybeRefresh` already never throws (WP-045); the `try/catch` in run-job is
  belt-and-suspenders and must never alter the job's exit code.
- Order the digest prefix as alerts → updateLine → body; verify empty→empty
  byte-equality.
- When uncertain: choose the simpler option and record it in the PR.

## Acceptance criteria

- [ ] `renderDigest` with `opts.updateLine` prepends it (after any alert block);
      with no alerts and no update line it equals the golden byte-for-byte.
- [ ] `run-job` calls `maybeRefresh` once at start with the injectable fetch
      seam; a failing/rejecting refresh never changes the job's outcome or exit
      code; every existing run-job test is hermetic (no network).
- [ ] `sync` and `dream` render the cached update line into `state/digest.md`
      (empty cache → digest unchanged from prior behavior).
- [ ] `doctor` prints the cache-only info line when a newer version is cached,
      and never networks.
- [ ] THREAT-MODEL has a T7 section and the folded-in `alerts.jsonl`/update-line
      T1 bullet.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'digest'
npm test -- --test-name-pattern 'scheduler-runjob'
npm test -- --test-name-pattern 'doctor'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Refreshing on interactive commands (`sync`/`doctor` render from cache only in
  v1 — recorded decision above).
- Auto-updating anything.
- Changing the update-check core module (`src/core/update-check.js`) — WP-045
  owns it; only consume its exports here.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/046-update-check-wiring`; conventional commits; PR titled
   `feat(update-check): render update notices in the digest + doctor; refresh on run-job (WP-046)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

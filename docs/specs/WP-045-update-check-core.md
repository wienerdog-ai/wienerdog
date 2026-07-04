---
id: WP-045
title: Update-availability check — core module + config opt-out
status: Ready
model: sonnet
size: M
depends_on: [WP-044]
adrs: [ADR-0015, ADR-0004]
branch: wp/045-update-check-core
---

# WP-045: Update-availability check — core module + config opt-out

## Context (read this, nothing else)

Wienerdog ships often, and users who installed via `curl … | bash` have no
ambient signal that a newer version exists. **The owner has decided (ADR-0015):
Wienerdog performs a bounded, opt-out version check and later renders a
cache-only "update available" line — but NEVER auto-updates, NEVER starts a
process (ADR-0004: just files), and NEVER lets untrusted registry text reach the
injected digest.**

This WP builds the pure mechanism; **the wiring into run-job / digest / doctor is
WP-046.** Binding rules you must encode here:

- **At most once per 24h.** A refresh does a single HTTPS GET to the npm registry
  for the package's `latest` dist-tag, with a bounded timeout, and writes
  `~/.wienerdog/state/update-check.json`. The `last_check` timestamp is stamped
  on every *attempt* (success or failure) so a transient failure cannot cause a
  retry storm. Failure is a **silent skip** — `maybeRefresh` never throws.
- **Opt-out, default on.** `update_check: false` in `config.yaml` disables the
  refresh (default: on).
- **Untrusted response, validated.** The registry version string is validated as
  **semver-shaped** before it is stored or rendered. The rendered line is a
  **fixed template** — no registry-supplied text flows through verbatim.
- **Never auto-update.** The rendered line quotes the exact command verbatim:
  `npx wienerdog@latest sync` (the update command, ADR-0013).
- **Tests must NEVER touch the real registry.** The fetch is behind an
  injectable `opts.fetchLatest` seam AND an env seam `WIENERDOG_UPDATE_FETCH_CMD`
  (a single-token executable whose stdout is the version — mirrors the existing
  `WIENERDOG_RUNJOB_CMD`/`WIENERDOG_DREAM_CMD` idiom).

## Current state

### `src/cli/init.js` — `renderConfig` (to extend)

```js
function renderConfig(harnesses) {
  return `# Wienerdog configuration — …
version: 1
vault: null            # set by /wienerdog-setup or \`wienerdog adopt\`
harnesses:
  claude: ${harnesses.claude.present}        # set true by init when detected
  codex: ${harnesses.codex.present}
memory_mode: standard  # conservative | standard | eager
`;
}
```

Add one line so new installs carry the flag (default on). Config is a flat-YAML
subset read with per-key regexes elsewhere (`readVaultPath` in `sync.js`/`init.js`).

### `src/core/paths.js` — `paths.state` is `<core>/state`

### `package.json` — `version` (e.g. `0.2.1`) is this build's current version

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/update-check.js | state I/O, semver validation, `maybeRefresh`, `getUpdateNotice`, `renderUpdateLine` |
| modify | src/cli/init.js | `renderConfig` adds `update_check: true` line |
| modify | tests/unit/init.test.js | assert config contains `update_check: true` |
| create | tests/unit/update-check.test.js | fully hermetic; injected fetch; semver validation; TTL; render |

### Exact contracts

**`src/core/update-check.js`** — implement exactly this shape:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const UPDATE_CHECK_FILE = 'update-check.json';
const TTL_MS = 24 * 60 * 60 * 1000;   // refresh at most once per 24h
const TIMEOUT_MS = 3000;              // bounded network timeout
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/wienerdog/dist-tags';

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function updateCheckPath(paths) { return path.join(paths.state, UPDATE_CHECK_FILE); }

/** This build's version (the running package.json). @returns {string} */
function currentVersion() { return require('../../package.json').version; }

/** Strict semver shape (rejects anything shell-injectable). Length-guarded.
 *  @param {unknown} v @returns {boolean} */
function isSemver(v) {
  return typeof v === 'string' && v.length <= 256 &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v);
}

/** Compare release cores (major.minor.patch); prerelease/build ignored.
 *  @param {string} a @param {string} b @returns {number} -1|0|1 */
function cmpRelease(a, b) {
  const pa = a.split('+')[0].split('-')[0].split('.').map(Number);
  const pb = b.split('+')[0].split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

/** Read config.yaml `update_check:` (default true; absent/unset → true).
 *  @param {import('./paths').WienerdogPaths} paths @returns {boolean} */
function isEnabled(paths) {
  let text;
  try { text = fs.readFileSync(paths.config, 'utf8'); } catch { return true; }
  const m = text.match(/^update_check:[ \t]*(.*)$/m);
  if (!m) return true;
  return m[1].split('#')[0].trim() !== 'false';
}

/** Read state/update-check.json. Missing/corrupt → {}.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @returns {{last_check?:string, current?:string, latest?:string}} */
function readState(paths) {
  try { return JSON.parse(fs.readFileSync(updateCheckPath(paths), 'utf8')); } catch { return {}; }
}

/** Write state/update-check.json atomically (temp+rename; creates state/).
 *  @param {import('./paths').WienerdogPaths} paths @param {object} state */
function writeState(paths, state) {
  fs.mkdirSync(paths.state, { recursive: true });
  const file = updateCheckPath(paths);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/** Default fetch of the `latest` dist-tag. Env seam: WIENERDOG_UPDATE_FETCH_CMD
 *  (single-token exec whose stdout is the version) short-circuits the network so
 *  tests never hit the registry. Bounded timeout; throws on any failure.
 *  @param {number} timeoutMs @returns {Promise<string>} */
function defaultFetchLatest(timeoutMs) {
  const cmd = process.env.WIENERDOG_UPDATE_FETCH_CMD;
  if (cmd) {
    const r = spawnSync(cmd, [], { timeout: timeoutMs, encoding: 'utf8' });
    if (r.status !== 0 || r.error) throw new Error('update fetch cmd failed');
    return Promise.resolve((r.stdout || '').trim());
  }
  return new Promise((resolve, reject) => {
    const req = https.get(DIST_TAGS_URL, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`status ${res.statusCode}`)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 65536) req.destroy(); });
      res.on('end', () => {
        try { resolve(String(JSON.parse(body).latest)); } catch { reject(new Error('bad body')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/**
 * At most once per 24h, refresh the cached latest version. No-op when disabled or
 * fresh. Stamps last_check on every attempt (bounds retries). Stores `latest`
 * only when the response is a valid semver. NEVER throws; never blocks beyond the
 * bounded timeout. ADR-0015.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{fetchLatest?: (t:number)=>Promise<string>, now?: number}} [opts]
 * @returns {Promise<{skipped?:string, refreshed?:boolean, latest?:string}>}
 */
async function maybeRefresh(paths, opts = {}) {
  if (!isEnabled(paths)) return { skipped: 'disabled' };
  const now = opts.now || Date.now();
  const state = readState(paths);
  if (state.last_check && now - Date.parse(state.last_check) < TTL_MS) return { skipped: 'fresh' };
  const nowIso = new Date(now).toISOString();
  const current = currentVersion();
  writeState(paths, { ...state, last_check: nowIso, current }); // stamp the attempt
  try {
    const latest = await (opts.fetchLatest || defaultFetchLatest)(TIMEOUT_MS);
    if (isSemver(latest)) { writeState(paths, { last_check: nowIso, current, latest }); return { refreshed: true, latest }; }
    return { skipped: 'invalid' };
  } catch {
    return { skipped: 'error' };
  }
}

/** Cache-only notice (no network). @param {import('./paths').WienerdogPaths} paths
 *  @param {string} [current] @returns {{available:boolean, current:string, latest:string|null}} */
function getUpdateNotice(paths, current = currentVersion()) {
  const { latest } = readState(paths);
  const available = isSemver(latest) && isSemver(current) && cmpRelease(latest, current) > 0;
  return { available, current, latest: available ? latest : null };
}

/** Fixed-template digest callout, or '' when no newer version is cached.
 *  Declarative control-plane text only (never an instruction) — ADR-0015 / WP-041.
 *  @param {import('./paths').WienerdogPaths} paths @param {string} [current] @returns {string} */
function renderUpdateLine(paths, current = currentVersion()) {
  const n = getUpdateNotice(paths, current);
  if (!n.available) return '';
  return `> [!note] A newer Wienerdog is available (${n.current} → ${n.latest}). ` +
    `Update with: npx wienerdog@latest sync`;
}

module.exports = {
  UPDATE_CHECK_FILE, updateCheckPath, currentVersion, isSemver, cmpRelease,
  isEnabled, readState, writeState, defaultFetchLatest, maybeRefresh,
  getUpdateNotice, renderUpdateLine,
};
```

**`src/cli/init.js` — `renderConfig`.** Add one line after `memory_mode`:

```
memory_mode: standard  # conservative | standard | eager
update_check: true     # check npm for new versions (set false to disable)
```

### Example (evidence-shaped)

After a scheduled refresh (WP-046 wires it), `state/update-check.json`:

```json
{
  "last_check": "2026-07-04T03:30:07.101Z",
  "current": "0.2.1",
  "latest": "0.3.0"
}
```

`renderUpdateLine(paths)` →

```
> [!note] A newer Wienerdog is available (0.2.1 → 0.3.0). Update with: npx wienerdog@latest sync
```

When cached `latest` ≤ `current`, `renderUpdateLine` returns `''`.

## Implementation notes & constraints

- No new npm dependencies (`node:https` is built in); JSDoc only.
- **The `→` in the template renders as the arrow `→`.** Emit that character.
- **Hermeticity (binding — the institutional rule is "no live npm registry in
  tests ever"):** `update-check.test.js` MUST NOT call `defaultFetchLatest`'s
  network path. Test `maybeRefresh` by injecting `opts.fetchLatest`
  (returns a version, or throws). Test the env seam by setting
  `WIENERDOG_UPDATE_FETCH_CMD` to a temp script the test writes (e.g. one that
  `echo`es `0.9.9`) and asserting the stored `latest`. Run entirely in a temp
  `WIENERDOG_HOME`.
- **`maybeRefresh` must never throw** — every failure path returns a `{skipped}`
  object. Prove it with a test whose injected `fetchLatest` rejects.
- **Untrusted-input tests (required):** feed `fetchLatest` a non-semver /
  injection-shaped string (`'1.2.3; rm -rf ~'`, `'latest'`, `''`, an object) and
  assert nothing is stored as `latest` and `renderUpdateLine` returns `''`.
- `isEnabled` reads config directly; `update_check: false` disables refresh (also
  test this: with the flag false, `maybeRefresh` returns `{skipped:'disabled'}`
  and does not write state).
- When uncertain: choose the simpler option and record it in the PR.

## Acceptance criteria

- [ ] `isSemver` accepts `0.3.0`, `1.2.3-rc.1`, `1.0.0+build`; rejects `latest`,
      `1.2`, `''`, `'1.2.3; rm -rf'`, non-strings.
- [ ] `maybeRefresh` with an injected fetch stores a valid `latest`, stamps
      `last_check`, and is a no-op within the 24h TTL; a second call inside TTL
      returns `{skipped:'fresh'}` and does not re-fetch.
- [ ] `maybeRefresh` stamps `last_check` even when the fetch rejects, and returns
      `{skipped:'error'}`; it never throws.
- [ ] `maybeRefresh` returns `{skipped:'disabled'}` and writes nothing when
      `update_check: false`.
- [ ] An invalid/injection-shaped fetch result is never stored as `latest`;
      `renderUpdateLine` returns `''` unless a strictly-greater semver is cached.
- [ ] `renderUpdateLine` emits the fixed template quoting `npx wienerdog@latest sync`.
- [ ] New installs' `config.yaml` contains `update_check: true`.
- [ ] `npm test` and `npm run lint` pass; no test performs real network I/O.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'update-check'
npm test -- --test-name-pattern 'init'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Wiring `maybeRefresh` into run-job, or rendering the line into the digest /
  doctor / sync — **WP-046**.
- The THREAT-MODEL entry for the update check — **WP-046**.
- Interactive-command refresh; auto-update of any kind.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/045-update-check-core`; conventional commits; PR titled
   `feat(update-check): bounded, opt-out version-check core module (WP-045)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

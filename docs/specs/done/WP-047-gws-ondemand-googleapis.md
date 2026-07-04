---
id: WP-047
title: On-demand googleapis in a core deps dir; gws require-seam + clean setup error
status: Done
model: opus
size: M
depends_on: [WP-042]
adrs: [ADR-0013, ADR-0011, ADR-0004]
branch: wp/047-gws-ondemand-googleapis
---

# WP-047: On-demand googleapis in a core deps dir; gws require-seam + clean setup error

## Context (read this, nothing else)

`googleapis` is Wienerdog's single runtime dependency (ADR-0003) and it is heavy.
WP-042 vendors the package into `~/.wienerdog/app/<version>/` with **no
`node_modules`**, so a `require('googleapis')` from the vendored copy (which is
what the shim, the scheduler, and `run-job` all execute) throws
`MODULE_NOT_FOUND`. Bundling `googleapis` into every vendored tree would bloat
every install — including the majority who never connect Google.

**The decided design (ADR-0013): install `googleapis` on demand, once, with
consent, into a per-install deps dir that survives version updates; resolve it
from there; and when it is absent, fail with a plain-language "run
/wienerdog-google-setup" message instead of a raw module error.**

Concretely:

- **Deps dir**: `~/.wienerdog/app/deps/`. NOT under `app/<version>/`, so version
  bumps (which only add `app/<version>/` and repoint `app/current`) never remove
  it. `uninstall` already removes all of `app/` recursively (WP-042's
  `vendored-tree` manifest entry), so the deps dir is cleaned on uninstall with
  no extra manifest bookkeeping.
- **Consented install** (ADR-0011 posture): the Google-setup entry
  (`wienerdog gws auth`) installs `googleapis@<pinned-major>` into the deps dir,
  showing the exact `npm install --ignore-scripts --prefix …` command first,
  defaulting to yes, and printing the command as a fallback on decline/failure.
- **Require-seam**: a shared `loadGoogleapis(paths)` resolves `googleapis` from
  the deps dir via `createRequire`; on failure it throws the plain "Google isn't
  set up yet — run /wienerdog-google-setup" `WienerdogError`. The existing
  test-injection seams (`opts.googleapis`, `opts.factory`, `opts.oauthClient`)
  take precedence, so all current gws unit tests (which use those seams) never
  touch real `googleapis`.

Iron rule (ADR-0004): the install runs `npm` synchronously and exits; nothing is
kept alive. This WP only affects Google users; it can land in parallel with
WP-043→046 (it shares no files with them).

## Current state

### `require('googleapis')` sites (to route through the seam)

- `src/gws/client.js` `getServices(paths, opts)` line ~140:
  `const { google } = opts.googleapis || require('googleapis');` — `paths` is in
  scope; the `opts.factory` seam already returns before this line in tests.
- `src/gws/auth.js` `run(paths, opts)` line ~58:
  `new (opts.googleapis || require('googleapis')).google.auth.OAuth2(…)` — `paths`
  in scope; tests inject `opts.oauthClient` and never reach this.
- `src/gws/auth.js` `fetchEmail(oauth, opts)` line ~102:
  `const { google } = opts.googleapis || require('googleapis');` — no `paths`
  here; thread `paths` in from `run` (pass it into `fetchEmail`).

No test in the repo injects `opts.googleapis` (verified) — gws tests use
`opts.factory` (client) and `opts.oauthClient` (auth). So replacing the bare
`require('googleapis')` with `loadGoogleapis(paths)` behind those seams is
test-safe.

### `wienerdog gws auth` entry

`src/gws/index.js` `DISPATCH['auth']` calls `require('./auth').run(paths, {clientPath})`.
`auth.run` validates the client JSON, then builds the OAuth2 client. Insert the
consented `ensureGoogleapis(paths, …)` call right after the client JSON is
validated and before the OAuth2 client is built.

### Skill prose

`skills/wienerdog-google-setup/SKILL.md` walks the user through
`wienerdog gws auth --client "<path>"`. It must mention that the first `auth` run
installs Google's library (with consent) and what the plain error means.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/gws/deps.js | `depsDir`, `isInstalled`, `loadGoogleapis`, `ensureGoogleapis`, `GOOGLEAPIS_SPEC` |
| modify | src/gws/client.js | `getServices` resolves googleapis via `loadGoogleapis(paths)` behind existing seams |
| modify | src/gws/auth.js | `run` calls `ensureGoogleapis`; both `require('googleapis')` sites route through `loadGoogleapis(paths)` |
| modify | skills/wienerdog-google-setup/SKILL.md | note the consented install + the "Google isn't set up yet" error |
| create | tests/unit/gws-deps.test.js | hermetic: injected installer + fake resolve; consent decline → throw; clean error |

### Exact contracts

**`src/gws/deps.js`** — implement exactly this shape:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { WienerdogError } = require('../core/errors');
const { confirm } = require('../core/prompt');

// Pinned major — MUST track package.json's googleapis range. Moving the pin is a
// normal release change; re-running `wienerdog gws auth` re-installs (ADR-0013).
const GOOGLEAPIS_SPEC = 'googleapis@^173';

/** @param {import('../core/paths').WienerdogPaths} paths @returns {string} <core>/app/deps */
function depsDir(paths) { return path.join(paths.core, 'app', 'deps'); }

/** Resolve googleapis strictly from within the deps dir. `createRequire` anchors
 *  resolution at app/deps but Node then walks EVERY ancestor node_modules, so a
 *  copy planted outside the deps dir (e.g. ~/node_modules) could otherwise
 *  satisfy the lookup — silently bypassing the consented, pinned install
 *  (ADR-0011/ADR-0013). A resolution outside the deps dir is treated exactly as
 *  absent.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {{req:NodeRequire, resolved:string}|null} */
function resolveFromDeps(paths) {
  const dir = depsDir(paths);
  const req = createRequire(path.join(dir, 'noop.js'));
  const resolved = req.resolve('googleapis');
  // req.resolve returns a canonical (symlink-resolved) path; canonicalize the
  // deps dir the same way so a symlinked ancestor (e.g. macOS /var ->
  // /private/var) does not defeat the containment check.
  let real = dir;
  try { real = fs.realpathSync(dir); }
  catch { /* deps dir absent — resolved can't be inside it; fall through */ }
  if (!resolved.startsWith(real + path.sep)) return null;
  return { req, resolved };
}

/** @param {import('../core/paths').WienerdogPaths} paths @returns {boolean} */
function isInstalled(paths) {
  try { return resolveFromDeps(paths) !== null; }
  catch { return false; }
}

/** Resolve googleapis from the deps dir (containment-guarded). Throws a plain
 *  setup error when absent or when resolution lands outside the deps dir.
 *  @param {import('../core/paths').WienerdogPaths} paths @returns {object} */
function loadGoogleapis(paths) {
  try {
    const hit = resolveFromDeps(paths);
    if (hit) return hit.req(hit.resolved);
  } catch { /* treated as absent */ }
  throw new WienerdogError(
    "Google isn't set up yet — run /wienerdog-google-setup to connect Gmail, Calendar, and Drive."
  );
}

/** Default installer: `npm install --ignore-scripts --prefix <deps>
 *  googleapis@<major>` (inherit stdio). `--ignore-scripts` because googleapis is
 *  pure JS; disabling lifecycle scripts removes a residual supply-chain surface.
 *  @param {string} dir @param {string} spec @returns {{status:number}} */
function defaultRunInstall(dir, spec) {
  const r = spawnSync('npm', ['install', '--ignore-scripts', '--prefix', dir, spec], { stdio: 'inherit' });
  return { status: r.status == null ? 1 : r.status };
}

/**
 * Ensure googleapis is installed in the deps dir, once, with consent (ADR-0011
 * posture: show the exact command, default yes, fail-to-print on decline/failure).
 * No-op when already present. Seams: opts.confirm, opts.runInstall, opts.yes.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{yes?:boolean, confirm?:(q:string)=>Promise<boolean>,
 *          runInstall?:(dir:string,spec:string)=>{status:number}}} [opts]
 * @returns {Promise<{installed:boolean, already?:boolean}>}
 */
async function ensureGoogleapis(paths, opts = {}) {
  if (isInstalled(paths)) return { installed: false, already: true };
  const dir = depsDir(paths);
  const cmd = `npm install --ignore-scripts --prefix ${dir} ${GOOGLEAPIS_SPEC}`;
  process.stdout.write(`\nWienerdog needs Google's client library. It will run:\n  ${cmd}\n`);
  const ask = opts.confirm || confirm;
  const ok = opts.yes || (await ask('Install it now? [Y/n] '));
  if (!ok) throw new WienerdogError(`declined — run this yourself, then retry:\n  ${cmd}`);
  fs.mkdirSync(dir, { recursive: true });
  const run = opts.runInstall || defaultRunInstall;
  const r = run(dir, GOOGLEAPIS_SPEC);
  if (r.status !== 0) throw new WienerdogError(`install failed — run it yourself, then retry:\n  ${cmd}`);
  return { installed: true };
}

module.exports = { GOOGLEAPIS_SPEC, depsDir, isInstalled, loadGoogleapis, ensureGoogleapis, defaultRunInstall };
```

**`src/gws/client.js` — `getServices`.** Keep the `opts.factory` early return and
`opts.googleapis` precedence; only change the fallback source:

```js
const { loadGoogleapis } = require('./deps');
// …inside getServices, after the opts.factory early return:
const { google } = opts.googleapis || loadGoogleapis(paths);
```

**`src/gws/auth.js`.** Import `const { loadGoogleapis, ensureGoogleapis } = require('./deps');`.

- In `run(paths, opts)`, after the client JSON is validated
  (`persistClientJson(paths, clientJson)`) and before `startLoopback()`, ensure
  the library (consent seams pass through from `opts`):
  `await ensureGoogleapis(paths, { yes: opts.yes, confirm: opts.confirm, runInstall: opts.runInstall });`
- Replace the two `require('googleapis')` fallbacks with
  `opts.googleapis || loadGoogleapis(paths)`. `fetchEmail` has no `paths` — pass
  `paths` into it from `run` (`fetchEmail(oauth, opts, paths)`).

**`skills/wienerdog-google-setup/SKILL.md`.** Add a short plain-language note near
the first `wienerdog gws auth` step: the first `auth` run installs Google's
library (it will show the exact `npm install` command and ask; say yes), and that
any later "Google isn't set up yet — run /wienerdog-google-setup" message means
the library or token is missing — re-run this setup.

### Example (evidence-shaped)

```
$ wienerdog gws auth --client ~/Downloads/client.json

Wienerdog needs Google's client library. It will run:
  npm install --ignore-scripts --prefix /Users/ada/.wienerdog/app/deps googleapis@^173
Install it now? [Y/n] y
… (npm output) …
Open this URL in your browser to authorize Wienerdog: …
```

A later `wienerdog gws cal list` with no library/token installed prints:

```
wienerdog: Google isn't set up yet — run /wienerdog-google-setup to connect Gmail, Calendar, and Drive.
```

## Implementation notes & constraints

- No new npm *package* dependencies (googleapis is installed at runtime into the
  deps dir, not added to `package.json`'s dependency that ships in the tree — it
  is already the declared dep; the deps dir is a runtime install target). JSDoc
  only.
- **Hermeticity (binding — no real `npm install`, no real network, ever):**
  `gws-deps.test.js` runs in a temp `WIENERDOG_HOME` and MUST inject
  `opts.runInstall` (a stub returning `{status:0}` that writes a fake
  `node_modules/googleapis/package.json` + `index.js` so `isInstalled`/`loadGoogleapis`
  resolve) and `opts.confirm`. Never call `defaultRunInstall`. Cover: already-
  installed → no-op; consent yes → install runs; consent no → throws with the
  printed command; `loadGoogleapis` on an empty deps dir throws the plain setup
  error (assert the message, not a `MODULE_NOT_FOUND`).
- Do NOT change `package.json`, the vendoring, or the manifest — the deps dir is
  removed by WP-042's recursive `app/` uninstall; no new manifest entry.
- Do NOT touch `src/gws/gmail.js`/`calendar.js`/`drive.js`/`alert.js`/`grant.js`
  or `index.js` — the seam lives in `client.js`/`auth.js`; those verbs get their
  services through `getServices`, which now routes through `loadGoogleapis`.
- Keep `opts.googleapis`/`opts.factory`/`opts.oauthClient` precedence intact so
  every existing gws unit test stays hermetic (run the full gws suite to confirm).
- When uncertain: choose the simpler option and record it in the PR.

## Acceptance criteria

- [ ] `depsDir(paths)` is `<core>/app/deps`; `isInstalled` reflects whether
      googleapis resolves there.
- [ ] `ensureGoogleapis`: no-op when installed; on consent-yes runs the injected
      installer and reports `{installed:true}`; on consent-no throws an error
      whose message contains the exact `npm install --ignore-scripts --prefix …`
      command.
- [ ] `loadGoogleapis` on a missing library throws the plain "Google isn't set up
      yet — run /wienerdog-google-setup" message (never a raw module error).
- [ ] Containment guard: with the deps dir absent/empty and a decoy `googleapis`
      reachable in an ancestor `node_modules`, `isInstalled` is false and
      `loadGoogleapis` raises the setup error; with the deps dir populated, the
      deps-dir copy is loaded even when a decoy exists.
- [ ] `getServices`/`auth.run` resolve googleapis via the deps dir behind the
      existing injection seams; all existing gws unit tests pass unchanged and
      touch no real googleapis.
- [ ] `wienerdog gws auth` triggers the consented install before the OAuth flow.
- [ ] The google-setup skill documents the consented install + the setup error.
- [ ] `npm test` and `npm run lint` pass; no test runs a real `npm install`.

## Verification steps (run these; paste output in the PR)

```bash
node --test tests/unit/gws-deps.test.js
npm test -- --test-name-pattern 'gws'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Vendoring, the shim, the manifest, `package.json` — **WP-042** owns those.
- Scheduling, update checks — WP-043→046.
- Adding a second nested `curl|bash`; auto-upgrading the deps dir; moving the
  pinned major (a future release change).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/047-gws-ondemand-googleapis`; conventional commits; PR titled
   `feat(gws): install googleapis on demand into a core deps dir with a clean setup error (WP-047)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

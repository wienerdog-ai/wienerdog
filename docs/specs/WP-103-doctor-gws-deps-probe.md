---
id: WP-103
title: doctor probe — connected Google account with a missing client library
status: Ready
model: sonnet
size: S
depends_on: [WP-102]
adrs: [ADR-0004]
branch: wp/103-doctor-gws-deps-probe
---

# WP-103: doctor probe — connected Google account with a missing client library

## Context (read this, nothing else)

`wienerdog doctor` (`src/cli/doctor.js`) prints one `[ok]`/`[warn]`/`[fail]` line
per health check and exits 1 (via `process.exitCode`) only if some check
**fails**; warnings never fail. It already checks the core dir, manifest parse,
config, vault, secrets permissions, a harness-detection summary, scheduler-load
health, and Codex skill links.

**Why this WP exists.** `userreports/BUG-gws-deps-missing-after-upgrade.md`
documents a dead-end: a user who connected Google **before** the on-demand
`googleapis` deps-dir scheme (WP-047) has a **valid token** in
`~/.wienerdog/secrets/google-token.json` but an **absent**
`~/.wienerdog/app/deps/`, so every `gws` read fails. `doctor` today has **no
probe** for this state — it reports all-green while every gws read is broken.
WP-102 makes reads **self-heal** (install on first read, with consent) and fixes
the misleading error; this WP adds the matching **visibility**: `doctor` reports
the connected-but-library-missing state and its one-line remedy, so a user (or an
operator debugging a headless routine that can't prompt) sees it explicitly
instead of discovering it only when a routine fails.

**Scope discipline.** This is a **read-only** check — `doctor` never mutates. The
connected-but-missing state is a **warn** (actionable), never a fail. When Google
is **not** connected (no token), the check emits **nothing** — that is the normal
state for the majority who never connected Google (mirrors how the existing Codex
skill check stays silent when Codex is absent). This WP adds one focused check and
its tests; it changes no adapter, no `sync`, no `gws` code, no manifest.

**Product invariant.** Wienerdog is just files; it never starts a process that
outlives its job (ADR-0004). This WP only reads the filesystem and prints lines.

**Dependency on WP-102.** WP-103 depends on WP-102 for **coherence of the remedy
wording**, not for code: the warn line tells the user the next `gws` read will
offer to install the library (WP-102's self-heal), so WP-102 must land first for
that sentence to be true. The APIs this probe calls (`deps.isInstalled`,
`deps.depsDir`, `deps.GOOGLEAPIS_SPEC`, `client.tokenPath`) all exist on main
today.

## Current state

**`src/cli/doctor.js`** — `run(_argv)` builds a `check(status, msg)` closure and,
near the end, runs the scheduler and Codex checks in loops, then a trailing
update-notice block:

```js
const harnesses = detectHarnesses();
check('ok', `AI tools — Claude Code: ${...}, Codex CLI: ${...}`);

const { doctorSchedulerChecks } = require('../scheduler/status');
for (const c of doctorSchedulerChecks(paths)) check(c.status, c.msg);

// Codex skill-link health ...
for (const c of codexSkillChecks(paths, harnesses)) check(c.status, c.msg);

// Cache-only update notice (no network; does not affect pass/fail). ADR-0015.
const upd = getUpdateNotice(paths);
if (upd.available) { console.log(`[info] ...`); }

if (failed) process.exitCode = 1;
```

`doctor.js` already imports `fs` and `path` at the top. It does **not** import
`../gws/deps` or `../gws/client` yet; the pattern for pulling in a helper module
lazily inside `run` already exists (`require('../scheduler/status')`).

**gws helpers this probe uses (all exported on main today):**
- `require('../gws/deps').isInstalled(paths)` → `boolean` — whether `googleapis`
  resolves from inside `<core>/app/deps` (containment-guarded).
- `require('../gws/deps').depsDir(paths)` → `<core>/app/deps`.
- `require('../gws/deps').GOOGLEAPIS_SPEC` → `'googleapis@^173'`.
- `require('../gws/client').tokenPath(paths)` → `path.join(paths.secrets,
  'google-token.json')` — the canonical token path.

**`tests/unit/doctor.test.js`** drives `doctor` as a subprocess
(`node bin/wienerdog.js doctor`) against an isolated temp `HOME`/`WIENERDOG_HOME`
(helper `tempEnv()`), then asserts on stdout / exit code. It runs `init --yes`
first to create the core (which creates `secrets/` but no token and no
`app/deps`). To exercise a "connected" core a test writes a token file into
`<core>/secrets/google-token.json`; to exercise "library installed" a test plants
a fake `googleapis` under `<core>/app/deps/node_modules/googleapis` (same shape as
`tests/unit/gws-deps.test.js`'s `fakeInstall`/`plantGoogleapis`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/doctor.js | add a read-only `googleReadinessChecks(paths)` helper returning `{status,msg}[]`; call it in `run`, one `check(...)` per line, after the Codex-skill loop and before the update-notice block. |
| modify | tests/unit/doctor.test.js | add three cases: not-connected → no Google line; connected + library missing → `[warn]`, exit 0; connected + library present → `[ok]`. |

### Exact contracts

**1. `googleReadinessChecks(paths)` — new helper in `doctor.js`.** Pure and
read-only; returns `{status:'ok'|'warn', msg:string}[]` (never `'fail'`). Lazy-
require the gws helpers inside the function (mirrors the scheduler-status require
pattern), so `doctor` doesn't load gws for a run that never reaches this check.

```js
/** Report Google client-library readiness for a CONNECTED account. Read-only;
 *  never fails (a missing library is actionable, so a WARN). Emits NOTHING when
 *  Google is not connected (no token) — the normal state. WP-103 / BUG-gws-deps-missing.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function googleReadinessChecks(paths) {
  const { tokenPath } = require('../gws/client');
  const deps = require('../gws/deps');
  if (!fileExists(tokenPath(paths))) return []; // Google not connected — nothing to check (normal)
  if (deps.isInstalled(paths)) {
    return [{ status: 'ok', msg: 'Google connected and its client library is installed' }];
  }
  const cmd = `npm install --ignore-scripts --prefix ${deps.depsDir(paths)} ${deps.GOOGLEAPIS_SPEC}`;
  return [
    {
      status: 'warn',
      msg:
        'Google is connected but its client library is missing — the next `wienerdog gws` ' +
        'command will offer to install it, or run `wienerdog gws auth`, or: ' + cmd,
    },
  ];
}
```

Use the file's existing `fileExists(p)` helper (already defined in `doctor.js`)
for the token check. Return **one** line (not one per state); keep `doctor`
output compact and consistent with the scheduler/Codex checks.

**2. Wire into `run`.** Immediately **after** the `codexSkillChecks` loop and
**before** the update-notice block, add:

```js
for (const c of googleReadinessChecks(paths)) check(c.status, c.msg);
```

`paths` is already in scope. No other change to `run`.

**3. Tests (`tests/unit/doctor.test.js`).** Add a small plant helper and three
cases using the existing `run`/`tempEnv` helpers. Plant a token by writing
`<core>/secrets/google-token.json`; plant the library the same way
`gws-deps.test.js` does:

```js
/** Plant a fake googleapis under <core>/app/deps so isInstalled() is true (no network). */
function plantDeps(core) {
  const pkgDir = path.join(core, 'app', 'deps', 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = { google: {} };\n');
}
/** Plant a valid-looking token so the core reads as "connected". */
function plantToken(core) {
  const secrets = path.join(core, 'secrets');
  fs.mkdirSync(secrets, { recursive: true });
  fs.writeFileSync(path.join(secrets, 'google-token.json'),
    JSON.stringify({ access_token: 'a', refresh_token: 'r' }));
}
```

- **Google not connected → no Google-readiness line.** Default `tempEnv()`;
  `run(['init','--yes'], env)` then `run(['doctor'], env)`. Assert
  `r.stdout` does **not** match `/Google connected|Google is connected but/` and
  `r.status === 0`.
- **Connected + library missing → `[warn]`, exit 0.** `init`; `plantToken(core)`
  (no `plantDeps`); `doctor`. Assert `r.stdout` matches `/\[warn\] Google is
  connected but its client library is missing/` and `r.status === 0` (warn, not
  fail).
- **Connected + library present → `[ok]`.** `init`; `plantToken(core)`;
  `plantDeps(core)`; `doctor`. Assert `r.stdout` matches `/\[ok\] Google connected
  and its client library is installed/` and `r.status === 0`.

(Whichever of `tempEnv`'s return fields exposes the core dir — e.g. `core` — pass
it to `plantToken`/`plantDeps`. Read the helper at the top of the file.)

## Implementation notes & constraints

- **Read-only, warn-not-fail.** `doctor` must never create, install, or repair
  anything. A missing library is a `warn`; the printed remedies are the WP-102
  self-heal (next `gws` command), `wienerdog gws auth`, or the exact npm command.
- **Silent when unconnected.** Drive the check off token presence: no token →
  empty array → no line. This keeps `doctor` clean for the majority of users.
- **The `isInstalled` probe respects the containment guard** — it returns true
  only when `googleapis` resolves from **inside** `<core>/app/deps` (WP-047), so a
  stray `googleapis` elsewhere on the machine does not read as installed. The
  planted-under-`app/deps` test fixture satisfies the guard; do not plant it
  anywhere else.
- Zero new dependencies; no build step. Do not touch `gws`, adapters, `sync`,
  `detect`, or the manifest.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted input. The token path comes from `client.tokenPath(paths)`
      (env-derived core, already trusted); the check only `stat`s it and prints
      strings. The npm command in the warn message is the pre-existing pinned
      `deps.depsDir`/`deps.GOOGLEAPIS_SPEC` constant — no user value is
      interpolated. No value flows into a shell command or a mutation.

## Acceptance criteria

- [ ] When Google is connected (token present) and `googleapis` resolves from
      `<core>/app/deps`, `doctor` prints one `[ok] Google connected and its client
      library is installed` line and exits 0.
- [ ] When Google is connected but `googleapis` does not resolve from
      `<core>/app/deps`, `doctor` prints one `[warn] Google is connected but its
      client library is missing …` line with the remedy and **still exits 0**.
- [ ] When Google is not connected (no token), `doctor` prints **no** Google line.
- [ ] `doctor` performs no filesystem mutation in any of these paths.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern doctor
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The read-path self-heal + disambiguated error — that is **WP-102** (this WP
  depends on it for the remedy wording).
- Any auto-repair from `doctor` (remediation is the next `gws` command's
  self-heal, or `gws auth`).
- Surfacing this in the session digest — a separate concern (the digest's
  cache-then-render split), not scoped here.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/103-doctor-gws-deps-probe`; conventional commits; PR titled
   `feat(doctor): flag a connected Google account with a missing client library (WP-103)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

---
id: WP-102
title: gws read-path self-heal + disambiguated deps error (fix the post-upgrade dead-end)
status: Ready
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0011, ADR-0013]
branch: wp/102-gws-deps-self-heal
---

# WP-102: gws read-path self-heal + disambiguated deps error

## Context (read this, nothing else)

**gws** is the `wienerdog gws` Google Workspace CLI (gmail / cal / drive). It is
read-first and draft-first. To talk to Google it needs Google's heavy
`googleapis` client library, which Wienerdog does **not** bundle: per ADR-0013,
the vendored app copy carries no `node_modules`, so `googleapis` is installed
**on demand, once, with consent** into a per-install deps dir
`~/.wienerdog/app/deps/` (NOT under `app/<version>/`, so version bumps never
remove it). This was WP-047. A **containment guard** (`resolveFromDeps` in
`src/gws/deps.js`) then resolves `googleapis` strictly from inside that deps dir
and treats any copy resolving outside it as absent — a deliberate supply-chain
guard. **Keep that guard exactly as-is.**

**The bug this WP fixes (`userreports/BUG-gws-deps-missing-after-upgrade.md`).**
The library-presence check and the installer live on **different code paths, and
only `auth` installs**:

- Read commands reach `loadGoogleapis(paths)` (`src/gws/deps.js`), which
  **throws** a setup error when `googleapis` can't be resolved from the deps dir
  — it **never installs**.
- The installer `ensureGoogleapis(paths, opts)` is called from **exactly one
  place**: `src/gws/auth.js` (during `gws auth`). So the deps dir is only ever
  populated by running `gws auth`.

Consequence: a user who connected Google **before** the WP-047 deps-dir scheme
existed (before 2026-07-04) has a **complete, valid token** in
`~/.wienerdog/secrets/google-token.json` but an **absent** `app/deps`. After they
`wienerdog update` across that boundary, **every** gws read command fails with:

> `Google isn't set up yet — run /wienerdog-google-setup to connect Gmail, Calendar, and Drive.`

The message is **wrong** (Google *is* connected) and the only remedy that works
is re-running `gws auth` (a needless OAuth round-trip that reinstalls deps as a
side effect). Nothing on the read path ever backfills `app/deps`, so the state is
a **permanent dead-end**. Headless routines (morning digest, inbox triage) hit
the same misleading error and cannot self-heal (they can't run interactive
`gws auth`). This must be fixed before the next npm publish.

**This WP does two things** (the report's fixes 1 + 2 + 5):

1. **Self-heal on read.** When a read command finds the deps dir absent **and** a
   valid token exists, lazily run the same **consented** `ensureGoogleapis`
   install — exactly like first auth. Interactive: a consent prompt. Headless /
   non-TTY: fail with the accurate, browser-free `npm install` remedy (no worse
   than today). An **unauthed** user (no token) is untouched — they still get the
   existing "connect Google" flow.
2. **Disambiguate the error.** `loadGoogleapis` (the sole emit site of the
   misleading string) branches on token presence: no token → the current
   connect-Google message (unchanged); token present → an accurate "Google is
   connected, but its client library needs a one-time install" message naming the
   concrete remedy. This is the defensive backstop for any caller that reaches
   `loadGoogleapis` without going through the self-heal wrapper.

**Product invariants that bound this WP.** Wienerdog is just files (ADR-0004): the
self-heal runs `npm install` synchronously and returns; it starts nothing that
outlives the command. The on-demand install is **consented** (ADR-0011/0013):
show the exact command, prompt (default yes), fail-to-print on decline. Zero new
runtime dependencies; plain Node ≥ 18; JSDoc types only (CLAUDE.md).

**Out of scope by explicit decision:** an `update`-time migration/backfill
(report fix 3). Once self-heal-on-read exists it is redundant, and adding a
consent/network dependency to the `update` path buys no extra coverage. Recorded
under "Out of scope" below. The `doctor` probe (report fix 4) is a **separate**
WP (WP-103) because it touches a different surface (`src/cli/doctor.js`).

## Current state

**`src/gws/deps.js`** — the pieces you extend (verified against main @ d8ef87c):

```js
const GOOGLEAPIS_SPEC = 'googleapis@^173';

/** <core>/app/deps */
function depsDir(paths) { return path.join(paths.core, 'app', 'deps'); }

/** Resolve googleapis strictly from within the deps dir (containment-guarded);
 *  a copy resolving outside the deps dir is treated as absent. Returns
 *  {req, resolved} | null. DO NOT CHANGE. */
function resolveFromDeps(paths) { /* ... */ }

/** Whether googleapis resolves from within the deps dir. */
function isInstalled(paths) {
  try { return resolveFromDeps(paths) !== null; } catch { return false; }
}

/** Resolve googleapis from the deps dir; throws a plain setup error when absent.
 *  THIS is the sole emit site of the misleading "isn't set up yet" string. */
function loadGoogleapis(paths) {
  try {
    const hit = resolveFromDeps(paths);
    if (hit) return hit.req(hit.resolved);
  } catch { /* treated as absent */ }
  throw new WienerdogError(
    "Google isn't set up yet — run /wienerdog-google-setup to connect Gmail, Calendar, and Drive."
  );
}

/** Ensure googleapis is installed in the deps dir, once, with consent (ADR-0011:
 *  show the exact command, default yes, fail-to-print on decline/failure).
 *  No-op when already present. Seams: opts.confirm, opts.runInstall, opts.yes.
 *  On decline: throws `declined — run this yourself, then retry:\n  <cmd>`
 *  where <cmd> = `npm install --ignore-scripts --prefix <deps> googleapis@^173`.
 *  On install failure (status !== 0): throws `install failed — run it yourself,
 *  then retry:\n  <cmd>`. */
async function ensureGoogleapis(paths, opts = {}) { /* ... */ }

module.exports = {
  GOOGLEAPIS_SPEC, depsDir, isInstalled, loadGoogleapis, ensureGoogleapis,
  defaultRunInstall,
};
```

`deps.js` already `require`s `node:fs` at the top. It does **not** require
`./client` at load time (important — see the load-order note below).

**`src/gws/client.js`** — `getServices(paths, opts)` (the read entry) loads the
token and client JSON **before** googleapis, in this order:

```js
function getServices(paths, opts = {}) {
  const token = loadToken(paths);      // throws "no Google sign-in found — run `wienerdog gws auth` first" if absent
  const client = loadClientJson(paths);
  if (opts.factory) return opts.factory(token);   // unit-test seam
  const { google } = opts.googleapis || loadGoogleapis(paths);  // throws the misleading msg in case B
  // ... builds gmail/calendar/drive ...
}
```

`tokenPath(paths)` in `client.js` returns
`path.join(paths.secrets, 'google-token.json')` — the canonical token path.
Because `getServices` calls `loadToken` **first**, on the read path
`loadGoogleapis` is only ever reached when a **token already exists** — i.e.
`loadGoogleapis`'s failure on the read path is **always** the token-present case
(B). That is precisely why its unconditional message is wrong there.

**`src/gws/index.js`** — `run(argv)` dispatches `<group> <verb>`. It builds a
`key` (`'auth'`, `'gmail search'`, `'cal'`, `'drive'`, `'_alert'`, …), looks up a
handler, then builds a **lazy** services accessor so `auth` (which needs no
token) never loads one:

```js
async function run(argv) {
  const group = argv[0];
  let key; let rest;
  if (group === 'gmail') { key = `gmail ${argv[1]}`; rest = argv.slice(2); }
  else { key = group; rest = argv.slice(1); }

  const handler = DISPATCH[key];
  if (!handler) throw new WienerdogError(`unknown gws command: ${argv.slice(0, 2).join(' ').trim()}`);

  const flags = parseFlags(rest);
  const paths = getPaths();
  // Build services lazily so `auth` (which needs no token) never loads one.
  let cached;
  const services = () => (cached || (cached = getServices(paths)));

  const result = await handler({ paths, flags, services });
  render(key, result, flags.json);
}
```

Every non-`auth` handler (`gmail *`, `cal`, `drive`, `_alert`) calls `services()`
and thus needs `googleapis`; only `auth` does not. `run` is already `async`.

**`tests/unit/gws-deps.test.js`** already has the fixtures you reuse:
`tempPaths()` (fresh isolated temp core, no `app/deps`), `fakeInstall(dir)`
(plants a fake `<dir>/node_modules/googleapis` and returns `{status:0}` — a
stand-in for the real `npm install`), `plantGoogleapis(base, which)`. The
existing tests at lines ~101–110 (loadGoogleapis throws the setup error when
absent) and ~205–230 (containment-guard child-process probes) are **no-token**
cases — see "Do NOT modify these" below.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/deps.js | (a) make `loadGoogleapis` token-aware per the Exact contract; (b) add + export `ensureGoogleReady(paths, opts)`; (c) add an internal `hasToken(paths)` helper (lazy `require('./client')`). |
| modify | src/gws/index.js | import `ensureGoogleReady` from `./deps`; call `await ensureGoogleReady(paths)` for every non-`auth` command, before services are built. |
| modify | tests/unit/gws-deps.test.js | add a `plantToken(paths)` helper + the six new cases below. Do NOT modify the existing no-token assertions. |

### Exact contracts

**1. `hasToken(paths)` — new internal helper in `deps.js`.** Lazy-require
`./client` to avoid a load-time cycle (`client.js` requires `deps.js` at top
level; `deps.js` must NOT top-level-require `client.js`). At call time both
modules are fully loaded, so a lazy require inside the function body is safe.

```js
/**
 * Whether a Google sign-in token exists on disk. Lazy require avoids a
 * load-time cycle with client.js (which requires this module at top level).
 * @param {WienerdogPaths} paths
 * @returns {boolean}
 */
function hasToken(paths) {
  const { tokenPath } = require('./client');
  return fs.existsSync(tokenPath(paths));
}
```

**2. `loadGoogleapis(paths)` — branch on token presence.** Keep the resolve
attempt and the no-token message byte-for-byte; add the token-present branch:

```js
function loadGoogleapis(paths) {
  try {
    const hit = resolveFromDeps(paths);
    if (hit) return hit.req(hit.resolved);
  } catch {
    /* treated as absent */
  }
  // Disambiguate the two states that share this failure (BUG-gws-deps-missing):
  // a CONNECTED account (token present) needs only the client library, NOT a
  // reconnect; an unauthed user needs the full connect flow.
  if (hasToken(paths)) {
    const cmd = `npm install --ignore-scripts --prefix ${depsDir(paths)} ${GOOGLEAPIS_SPEC}`;
    throw new WienerdogError(
      'Google is connected, but its client library needs a one-time install. ' +
        'Run `wienerdog gws auth` to finish setup (no browser needed if your sign-in is still valid), or run:\n  ' +
        cmd
    );
  }
  throw new WienerdogError(
    "Google isn't set up yet — run /wienerdog-google-setup to connect Gmail, Calendar, and Drive."
  );
}
```

The token-present message MUST contain the literal substring `Google is
connected, but its client library needs a one-time install` AND the exact
`npm install --ignore-scripts --prefix <deps> googleapis@^173` command, and MUST
NOT contain `/wienerdog-google-setup`. The no-token branch is unchanged.

**3. `ensureGoogleReady(paths, opts)` — new, exported.** The read-path self-heal.

```js
/**
 * Self-heal the on-demand googleapis install on the READ path. When a Google
 * sign-in token exists but the client library is absent (the post-WP-047-upgrade
 * dead-end, BUG-gws-deps-missing), install it once — with consent, exactly like
 * first auth (ADR-0011/ADR-0013). No-op when already installed, or when no token
 * exists (an unauthed user; getServices()'s loadToken then surfaces the
 * connect-Google flow unchanged). Consent seams pass straight through to
 * ensureGoogleapis: interactive → a [Y/n] prompt; non-TTY/headless →
 * ensureGoogleapis throws the accurate, browser-free npm-install remedy.
 * @param {WienerdogPaths} paths
 * @param {{yes?:boolean, confirm?:(q:string)=>Promise<boolean>,
 *          runInstall?:(dir:string,spec:string)=>{status:number}}} [opts]
 * @returns {Promise<void>}
 */
async function ensureGoogleReady(paths, opts = {}) {
  if (isInstalled(paths)) return;   // already present — nothing to do
  if (!hasToken(paths)) return;     // unauthed — do not install; let loadToken surface the connect flow
  await ensureGoogleapis(paths, opts);
}
```

Add `ensureGoogleReady` to `module.exports` (keep the existing exports).

**4. `src/gws/index.js` wiring.** Add the import near the existing requires:

```js
const { ensureGoogleReady } = require('./deps');
```

In `run`, immediately **after** `const paths = getPaths();` (after the
handler-exists check, before the `services` accessor), add:

```js
  // Self-heal the on-demand googleapis install (BUG-gws-deps-missing): a user who
  // connected Google before WP-047's deps-dir scheme has a valid token but no
  // app/deps, so every read dead-ends. Install it once, with consent, on first
  // read — never for `auth` (it installs deps itself), and a no-op for unauthed
  // users (getServices then surfaces the connect-Google flow). WP-102.
  if (key !== 'auth') await ensureGoogleReady(paths);
```

Pass **no** `opts` — production defaults apply (`ensureGoogleapis` falls back to
the real `confirm` from `src/core/prompt.js` and the real npm installer, exactly
as `auth.js` already wires it). The self-heal **logic** is unit-tested directly
against `ensureGoogleReady` (§5); the index wiring is this thin call.

`key !== 'auth'` is the exact gate: `auth` is the only gws command that does not
build services. If a future gws verb is added that needs no services, it must be
excluded from this gate too (note it then).

**5. Tests (`tests/unit/gws-deps.test.js`).** Add a helper and six cases. Reuse
the existing `tempPaths()`, `fakeInstall`, `WienerdogError`, `path`, `fs`.

```js
/** Write a valid-looking Google token so hasToken()/self-heal see a connected core. */
function plantToken(paths) {
  fs.mkdirSync(paths.secrets, { recursive: true });
  fs.writeFileSync(
    path.join(paths.secrets, 'google-token.json'),
    JSON.stringify({ access_token: 'a', refresh_token: 'r' })
  );
}
```

- **(a) loadGoogleapis — token present + deps absent → the "client library"
  message.** `plantToken(paths)` on a fresh `tempPaths()`; assert `loadGoogleapis`
  throws a `WienerdogError` whose message matches `/Google is connected, but its
  client library needs a one-time install/`, **includes** `npm install
  --ignore-scripts --prefix ${deps.depsDir(paths)} ${deps.GOOGLEAPIS_SPEC}`, does
  **not** match `/\/wienerdog-google-setup/`, and does **not** match
  `/MODULE_NOT_FOUND/`.
- **(b) ensureGoogleReady — token present + deps absent + consent-yes →
  installs.** `plantToken`; `await ensureGoogleReady(paths, {confirm: async () =>
  true, runInstall: (dir, spec) => fakeInstall(dir, spec)})`; assert the injected
  `runInstall` ran (spy a boolean) and `deps.isInstalled(paths) === true`
  afterward.
- **(c) ensureGoogleReady — token present + deps absent + consent-no → throws the
  npm command, no install.** `plantToken`; call `ensureGoogleReady(paths, ...)`
  with `confirm: async () => false` and a spying `runInstall` (sets `ran = true`).
  Assert via `assert.rejects` that it throws a `WienerdogError` whose message
  includes the exact `npm install --ignore-scripts --prefix <depsDir>
  googleapis@^173` command (build the expectation from `deps.depsDir(paths)` and
  `deps.GOOGLEAPIS_SPEC`); then assert `ran === false` and
  `deps.isInstalled(paths) === false`. (This is the headless-equivalent: the real
  `confirm` returns false on a non-TTY, so the same throw fires.)
- **(d) ensureGoogleReady — NO token → no-op (unauthed path unchanged).** No
  `plantToken`. `const res = await ensureGoogleReady(paths, {confirm: async () =>
  true, runInstall: () => {ran = true; return {status:0};}})`. Assert `res ===
  undefined`, `ran === false` (the consent seam was never consulted), and
  `deps.isInstalled(paths) === false`.
- **(e) ensureGoogleReady — already installed → no-op.** `plantToken` **and**
  `fakeInstall(deps.depsDir(paths))`; `await ensureGoogleReady(paths, {confirm:
  async () => true, runInstall: () => {ran = true; return {status:0};}})`; assert
  `ran === false` (installer must not run when already present).
- **(f) ensureGoogleReady with opts.yes — token present + deps absent → installs
  without prompting.** `plantToken`; `await ensureGoogleReady(paths, {yes: true,
  confirm: async () => {asked = true; return false;}, runInstall: fakeInstall})`;
  assert `asked === false` and `deps.isInstalled(paths) === true`.

### Do NOT modify these existing tests (answer to the report's fix-5 question)

The existing assertions at `tests/unit/gws-deps.test.js` ~lines **101–110**
(`loadGoogleapis` throws the setup error when absent) and ~lines **205–230** (the
containment-guard child-process probes) are all **no-token** cases. With this WP,
the no-token branch of `loadGoogleapis` still emits the identical
`/wienerdog-google-setup` message, so those tests remain valid and **must stay
unchanged**. Do not touch them.

## Implementation notes & constraints

- **Zero new dependencies.** No new require beyond the lazy `require('./client')`
  inside `hasToken`. `node:fs` is already required in `deps.js`.
- **Load-order / cycle safety.** `client.js` top-level-requires `deps.js`;
  `deps.js` must reference `./client` **only** lazily (inside `hasToken`, at call
  time). Do not add a top-level `require('./client')` to `deps.js` — it would
  create a load-time cycle and `tokenPath` could be `undefined`.
- **Keep the containment guard (`resolveFromDeps`) unchanged** — it is a
  deliberate supply-chain control locked by the existing tests. Self-heal
  populates the deps dir *through* the guard's install path; it never bypasses
  the guard.
- **`_alert` is included in the self-heal gate** (`key !== 'auth'` covers it).
  `_alert` is internal and headless-only in practice: with deps absent it fails
  today too (via `loadGoogleapis`), and run-job's fail-loud already falls back to
  `state/alerts.jsonl` (ADR-0012). Self-heal here is no worse — on a non-TTY it
  aborts to the accurate npm remedy without attempting an install. This is an
  accepted, deliberate behavior; do not add special-casing for it.
- **Headless framing.** On a non-TTY, `ensureGoogleapis` (via the shared
  `confirm`) prints the no-terminal notice and throws the `declined — run this
  yourself, then retry:\n  <npm cmd>` message. That message is accurate and
  browser-free — strictly better than today's misleading "isn't set up yet". The
  fix-2 "Google is connected, but…" wording is delivered by `loadGoogleapis` for
  any caller that reaches it directly (the defensive backstop); the two messages
  are consistent (both name the connected-account remedy).
- When uncertain: choose the simpler option and record it under "Decisions made".
  Do NOT expand scope (no update-time backfill — see Out of scope; no keyring; no
  changes to token/client persistence, scopes, or the containment guard).

## Security checklist

- [ ] No untrusted input flows into a path or shell command. `hasToken` builds
      the token path via `client.tokenPath(paths)` (env-derived core, already
      trusted) and only `fs.existsSync`es it. The self-heal install command is the
      pre-existing, pinned `ensureGoogleapis` command (`--ignore-scripts`,
      constant `GOOGLEAPIS_SPEC`) — no user value is interpolated into it.
- [ ] Consent is preserved (ADR-0011): the self-heal install still shows the
      exact command and prompts (default yes); a decline or a non-TTY fails to a
      printed remedy and installs nothing.
- [ ] No process outlives the command (ADR-0004): `ensureGoogleapis` runs
      `npm install` synchronously and returns.

## Acceptance criteria

- [ ] A read command run interactively with a valid token but no `app/deps`
      prompts to install `googleapis` and, on consent, succeeds using the existing
      token — no re-auth, no browser (self-heal).
- [ ] The same on a non-TTY fails with the accurate npm-install remedy (naming the
      exact command), never the misleading "isn't set up yet".
- [ ] `loadGoogleapis` with a token present + deps absent throws the "Google is
      connected, but its client library needs a one-time install" message with the
      npm command, not `/wienerdog-google-setup`.
- [ ] An **unauthed** user (no token) is unaffected: `ensureGoogleReady` is a
      no-op and the existing "no Google sign-in found — run `wienerdog gws auth`
      first" / connect flow is unchanged.
- [ ] `ensureGoogleReady` is a no-op when `googleapis` is already installed.
- [ ] Running a read twice after a successful self-heal is idempotent (second run:
      `isInstalled` true → no install attempted).
- [ ] The existing no-token assertions in `gws-deps.test.js` are unchanged and
      still pass. `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "gws-deps|ensureGoogleReady|loadGoogleapis|dispatch"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- **Update-time migration/backfill (report fix 3) — deliberately skipped.** Once
  self-heal-on-read exists, an install during `wienerdog update` adds a
  consent/network dependency to the update path for **no extra coverage** (the
  first read heals it anyway). Do not add any `app/deps` creation to
  `src/cli/update.js` or `src/core/vendor.js`.
- **The `doctor` probe (report fix 4)** — that is **WP-103**
  (`src/cli/doctor.js` plus its test), a separate surface.
- Any change to the containment guard `resolveFromDeps`, to `GOOGLEAPIS_SPEC`, or
  to token/client persistence, scopes, or the OAuth flow.
- The `gws drive search` bare-term query papercut — separate backlog WP-104.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/102-gws-deps-self-heal`; conventional commits; PR titled
   `fix(gws): self-heal googleapis on read + disambiguate the deps error (WP-102)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

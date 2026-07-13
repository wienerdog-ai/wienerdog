---
id: WP-102
title: gws read-path self-heal + disambiguated deps error (fix the post-upgrade dead-end)
status: In-Review
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
   misleading string) branches on token presence and then on resolvability: no
   token → the current connect-Google message (unchanged); token present + library
   **absent** → "needs a one-time install … the next `wienerdog gws` command will
   offer to install it"; token present + library **resolvable-but-unloadable**
   (corrupt) → "broken (installed but not loadable) — delete the folder `<depsDir>`,
   then reinstall it", with no offer claim (the self-heal cannot fire on a
   resolvable install, and a bare `npm install` can no-op on a corrupt tree — see
   round-4 below). Both name the concrete npm remedy. This is the defensive backstop
   for any caller that reaches `loadGoogleapis` without going through the self-heal
   wrapper, and it mirrors WP-103's doctor split exactly.

**Product invariants that bound this WP.** Wienerdog is just files (ADR-0004): the
self-heal runs `npm install` synchronously and returns; it starts nothing that
outlives the command. The on-demand install is **consented** (ADR-0011/0013):
show the exact command, prompt (default yes), fail-to-print on decline. Zero new
runtime dependencies; plain Node ≥ 18; JSDoc types only (CLAUDE.md).

**Not in this WP (separate WPs):** the `doctor` probe (report fix 4) is **WP-103**
(a different surface, `src/cli/doctor.js`); the interactive `sync`/`update`-time
**backfill** (report fix 3) is **WP-105** (`src/cli/sync.js`). Fix 3 is NOT
skipped — after the Codex review it was reinstated for headless-only users; see
"Out of scope" below for the corrected rationale.

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

**2. `loadGoogleapis(paths)` — branch on token presence, then on resolvability.**
Keep the resolve attempt and the no-token message byte-for-byte; add the
token-present branch, split into **absent** vs **broken** exactly as WP-103's
doctor probe does (Codex round-3 Finding). Capture resolvability from the resolve
attempt already made — `resolveFromDeps` returns non-null iff `googleapis` resolves
from **inside** the deps dir (== `isInstalled`), and the require can still throw
afterward for a corrupt install — so a single `resolvable` flag set **before** the
require distinguishes the two failure modes without a second resolve:

```js
function loadGoogleapis(paths) {
  let resolvable = false;
  try {
    const hit = resolveFromDeps(paths);
    if (hit) {
      resolvable = true;              // resolves from inside the deps dir (== isInstalled)...
      return hit.req(hit.resolved);   // ...but a corrupt/partial install can still throw on require
    }
  } catch {
    /* resolve failed (absent), OR require threw (corrupt); `resolvable` tells them apart */
  }
  // Disambiguate the states that share this failure (BUG-gws-deps-missing):
  if (hasToken(paths)) {
    const dir = depsDir(paths);
    const cmd = `npm install --ignore-scripts --prefix ${dir} ${GOOGLEAPIS_SPEC}`;
    if (resolvable) {
      // CONNECTED but the library is installed-yet-unloadable (corrupt/partial):
      // the read-path self-heal NO-OPs here (isInstalled is true), so promising an
      // "offer to install" would make the user loop on a contradictory message.
      // A plain reinstall can NO-OP too: npm compares tree metadata (recorded
      // version/integrity), NOT file contents, so a corrupt-but-resolvable tree
      // reads as "up to date" and stays broken (round-4 Finding). The corrupt tree
      // must be REMOVED first. The deps dir is single-purpose (it exists solely to
      // hold the consented googleapis tree), so deleting it wholesale is safe.
      // Platform-neutral prose (not a per-OS rm/Remove-Item one-liner) — plain
      // language for knowledge workers, CLAUDE.md.
      throw new WienerdogError(
        'Google is connected, but its client library is broken (installed but not loadable). ' +
          `To repair it, delete the folder ${dir}, then reinstall it:\n  ${cmd}`
      );
    }
    // CONNECTED and the library is ABSENT: the next gws read WILL self-heal.
    throw new WienerdogError(
      'Google is connected, but its client library needs a one-time install. ' +
        'The next `wienerdog gws` command will offer to install it, or run:\n  ' +
        cmd
    );
  }
  throw new WienerdogError(
    "Google isn't set up yet — run /wienerdog-google-setup to connect Gmail, Calendar, and Drive."
  );
}
```

Message contract (parity with WP-103's two warns):
- **Absent** (token present, not resolvable): MUST contain `Google is connected,
  but its client library needs a one-time install` AND `The next \`wienerdog gws\`
  command will offer to install it` AND the exact npm command.
- **Broken** (token present, resolvable but the require threw): MUST contain
  `Google is connected, but its client library is broken (installed but not
  loadable)` AND `delete the folder <depsDir>` AND the exact npm command, and MUST
  **NOT** contain `will offer to install` (the self-heal cannot fire —
  `isInstalled` is true). The **delete-first** instruction is load-bearing: a bare
  `npm install` over a corrupt-but-resolvable tree can no-op (npm compares tree
  metadata, not file contents), leaving the user looping (round-4 Finding).
- **Both** branches MUST NOT contain `/wienerdog-google-setup`, `gws auth`, or any
  "no browser" claim (Codex Finding 3: recommending `wienerdog gws auth` here is
  factually wrong — `auth.run` throws without `--client <path>` and always opens
  the full browser OAuth loopback with it; the accurate remedies are the self-heal
  / the npm one-liner).
- The **no-token** branch is unchanged (byte-for-byte the same
  `/wienerdog-google-setup` message).

`resolvable` is captured from the resolve attempt already performed (cheaper than
and equivalent to a second `isInstalled(paths)` call, since both mean
"`resolveFromDeps` returned non-null"); keep the predicate explicit as shown.

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

**5. Tests (`tests/unit/gws-deps.test.js`).** Add two helpers and seven cases.
Reuse the existing `tempPaths()`, `fakeInstall`, `deps`, `WienerdogError`, `path`,
`fs`.

```js
/** Write a valid-looking Google token so hasToken()/self-heal see a connected core. */
function plantToken(paths) {
  fs.mkdirSync(paths.secrets, { recursive: true });
  fs.writeFileSync(
    path.join(paths.secrets, 'google-token.json'),
    JSON.stringify({ access_token: 'a', refresh_token: 'r' })
  );
}
/** Plant a CORRUPT googleapis in the deps dir: it RESOLVES (containment guard
 *  passes) but its entry point THROWS on require — the corrupt/partial-install
 *  state (WP-102 broken branch). */
function plantCorruptDeps(paths) {
  const pkgDir = path.join(deps.depsDir(paths), 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  fs.writeFileSync(path.join(pkgDir, 'index.js'), "throw new Error('corrupt googleapis entry point');\n");
}
```

- **(a) loadGoogleapis — token present + deps ABSENT → the "needs a one-time
  install" message with the self-heal offer.** `plantToken(paths)` on a fresh
  `tempPaths()`; assert `loadGoogleapis` throws a `WienerdogError` whose message
  matches `/Google is connected, but its client library needs a one-time install/`,
  matches `/will offer to install it/`, **includes** `npm install --ignore-scripts
  --prefix ${deps.depsDir(paths)} ${deps.GOOGLEAPIS_SPEC}`, does **not** match
  `/\/wienerdog-google-setup/`, does **not** match `/gws auth/`, does **not** match
  `/no browser/i` (Finding 3), and does **not** match `/MODULE_NOT_FOUND/`.
- **(a2) loadGoogleapis — token present + deps RESOLVABLE-BUT-BROKEN → the
  "delete + reinstall" message, NO offer claim (round-3 + round-4 Findings), and
  the prescribed repair actually works.** `plantToken(paths)` **and**
  `plantCorruptDeps(paths)` on a fresh `tempPaths()`. First assert `loadGoogleapis`
  throws a `WienerdogError` whose message matches `/Google is connected, but its
  client library is broken \(installed but not loadable\)/`, matches `/delete the
  folder/` and **includes** the literal `deps.depsDir(paths)` path, **includes** the
  exact npm command (as in (a)), does **NOT** match `/will offer to install/`, does
  **not** match `/\/wienerdog-google-setup/`, and does **not** match `/gws auth/`.
  Then **execute the prescribed repair flow** and assert it succeeds: `fs.rmSync(
  deps.depsDir(paths), {recursive:true, force:true}); fakeInstall(deps.depsDir(
  paths)); const g = deps.loadGoogleapis(paths); assert.equal(g.google.FAKE, true);`
  — proving delete-then-reinstall makes the library loadable (whereas a reinstall
  over the un-deleted corrupt tree is what round-4 flagged as a possible no-op).
  (Node does not cache a module that throws at load, and the deps-dir path is
  identical before/after the repair, so run this in-process like (a) — no child
  process needed. **Note honestly in the test:** the fake install seam proves the
  *flow shape* (remove → reinstall → loadable); real npm's metadata-vs-content
  no-op behavior is out of unit-test reach — the delete-first instruction exists
  precisely to defeat it.)
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
- **Accepted residual — self-heal SKIPS the corrupt state (Codex Finding 1b;
  narrowed in round-3).** `ensureGoogleReady` gates on `isInstalled`, which only
  *resolves* `googleapis` (via `resolveFromDeps`), it does not *load* it. So a
  **corrupt/partial** install (interrupted `npm`, missing transitive dep, broken
  entry point) that still resolves reads as installed → self-heal no-ops. Keeping
  the resolve-only check on the read path is deliberate (loading the heavy
  `googleapis` on every read to detect corruption is not worth it). **The residual
  is now ONLY that self-heal does not auto-repair a corrupt install — the MESSAGE
  is no longer misleading:** since round-3, `loadGoogleapis` detects this exact
  state (resolvable + require threw) and emits the **broken** message, which makes
  no self-heal promise and points to the repair that actually fixes it. Since
  round-4 that repair is **delete the folder `<depsDir>`, then reinstall** — a bare
  `npm install` can no-op over a corrupt-but-resolvable tree (npm compares tree
  metadata, not file contents), so the corrupt tree must be removed first (the deps
  dir is single-purpose). So a user in this state gets an accurate, actionable
  message and never loops. The `doctor` probe (WP-103) surfaces the same state with
  the same delete-then-reinstall remedy. Do NOT change the read-path `isInstalled`
  check to a load probe here — the accurate message, not auto-repair, is what
  closes the loop.
- **`hasToken` stays existence-only (Codex Finding 4 asymmetry).** `hasToken`
  checks only that `google-token.json` *exists*, not that it is valid JSON with a
  `refresh_token`. This asymmetry with `doctor`'s minimal token validation
  (WP-103) is deliberate: on the read/self-heal path the worst case of a
  zero-byte/damaged token is a **benign consented install offer** (the user is
  prompted to install `googleapis`; the damaged token then surfaces its own error
  downstream in `getServices` → `loadToken`), whereas `doctor` is a diagnostic
  surface where a damaged token must not read as healthy. Do not add token
  parsing to `hasToken`.
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
- [ ] `loadGoogleapis` with a token present + deps **absent** throws the "Google is
      connected, but its client library needs a one-time install … will offer to
      install it" message with the npm command, not `/wienerdog-google-setup`.
- [ ] `loadGoogleapis` with a token present + a **resolvable-but-unloadable**
      (corrupt) install throws the "broken (installed but not loadable) — delete the
      folder `<depsDir>`, then reinstall it" message naming the deps folder and the
      npm command, with **no** "will offer to install" claim; and the prescribed
      delete-then-reinstall flow makes the library loadable again (verified with the
      test seams).
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

- **Update/sync-time backfill (report fix 3) — moved to a SEPARATE WP (WP-105),
  not skipped.** The original "no extra coverage" rationale was **wrong for
  headless-only (routines-only) users** (Codex Finding 2, owner disposition ADD
  BACKFILL): such a user never reaches an *interactive* read to self-heal (a
  non-TTY read declines the consented install by design), so their `app/deps` is
  never populated by this WP alone. **WP-105** reinstates a **consented,
  interactive-only** backfill in the `sync` flow (which `wienerdog update` hands
  off to). This WP still adds **no** `app/deps` creation to `src/cli/update.js`
  or `src/core/vendor.js` — the backfill lives in `src/cli/sync.js` and belongs to
  WP-105, not here.
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

## Revision log

- **2026-07-13 — Codex round-1 review + owner dispositions.** Applied after the
  implementer had already coded this spec verbatim (PR #105); the deltas below are
  surgical patches to the same branch.
  - **Finding 3 (MUST FIX).** The `loadGoogleapis` token-present message told users
    to run `wienerdog gws auth` "(no browser needed if your sign-in is still
    valid)" — factually false (`auth.run` throws without `--client <path>` and
    always runs the full browser OAuth loopback with it). Message rewritten to lead
    with the accurate remedies (self-heal + the npm one-liner) and drop the bare
    `gws auth` suggestion and the browser-free claim. Test (a) gained
    `!/gws auth/` and `!/no browser/i` negative assertions. Kept consistent with
    WP-103's doctor message.
  - **Finding 1 (owner: TARGETED).** The read-path `isInstalled` (resolve-only)
    check is **kept**; the corrupt-but-resolvable case is recorded as an accepted
    residual (the token-present `loadGoogleapis` message still delivers the working
    npm remedy). The active detection of that state is WP-103's load probe.
  - **Finding 2 (owner: ADD BACKFILL).** The fix-3 "skip" was reversed: the
    "Out of scope" rationale is corrected and the interactive backfill is spec'd as
    the new **WP-105** (`src/cli/sync.js`), not folded here (WP-102 is already
    implemented; its Deliverables stay honest).
  - **Finding 4 (owner: MINIMAL VALIDATION).** No change to `hasToken` (stays
    existence-only); the deliberate asymmetry with WP-103's token validation is now
    documented in Implementation notes.
- **2026-07-13 — Codex round-3 review (one finding, WP-102 only — the mirror of
  round-2 Finding 2).** The token-present `loadGoogleapis` message was still a
  single string claiming "The next `wienerdog gws` command will offer to install
  it" for BOTH the absent and the corrupt-but-resolvable case — but for the corrupt
  case the read-path self-heal has just no-op'd (accepted residual), so the offer
  can never occur and the user loops on a contradictory message (while WP-103's
  broken warn correctly says reinstall-only). Fix: the token-present branch is now
  **state-aware** (same split as WP-103), keyed on a `resolvable` flag captured from
  the resolve attempt already made (== `isInstalled`, no second resolve): **absent**
  (`resolvable` false) keeps the "needs a one-time install … will offer to install
  it" message; **broken** (`resolvable` true, require threw) emits "broken
  (installed but not loadable) — reinstall it: <npm>", with no offer claim. Added
  test (a2): plant a corrupt googleapis in the deps dir (throws on require) + a
  token, assert the broken message includes the exact npm command and does NOT match
  `/will offer to install/` or `/wienerdog-google-setup/`. The Finding-1(b) residual
  note was narrowed — the residual is now ONLY that self-heal skips the corrupt
  state; the message is accurate. No-token branch and all previously pinned
  assertions untouched.
- **2026-07-13 — Codex round-4 review (one finding, WP-102 + WP-103 mirror).** The
  broken-state remedy `npm install --prefix <deps> …` can **no-op** on a corrupt
  install: npm/arborist compares tree metadata (recorded version/integrity), not
  installed file contents, so a resolvable-but-corrupt `googleapis` reads as "up to
  date" and stays unloadable — the user loops. Fix (broken state only): the remedy
  now prescribes a **clean reinstall** — delete the single-purpose deps dir first,
  then install. Wording is **platform-neutral prose** ("To repair it, delete the
  folder `<depsDir>`, then reinstall it:\n  `<npm cmd>`") rather than a per-OS
  `rm -rf`/`Remove-Item` matrix — matching the codebase convention of plain-language
  remedies (CLAUDE.md); recorded as the chosen option. Test (a2) extended: after the
  message assertions, execute the prescribed repair with the seams
  (`fs.rmSync(depsDir)` + `fakeInstall`) and assert `loadGoogleapis` then succeeds —
  proving the flow shape end-to-end (real npm metadata-vs-content no-op behavior is
  out of unit-test reach, noted honestly). Absent-state message, self-heal contract,
  `ensureGoogleapis`/`ensureGoogleReady` logic, no-token branch all unchanged.

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
guard. **This WP rewrites that guard** (contract §0, owner-approved 2026-07-13) to
close a `Module._pathCache` cache-poisoning P2 — its accept/reject semantics are
**preserved-or-strengthened** (ancestor copies never considered; symlink defense
kept); it is not weakened.

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
   misleading string) branches on token presence and then on **physical presence**
   of the deps tree (`depsPresent`): no token → the current connect-Google message
   (unchanged); token present + **no deps tree** → "needs a one-time install … the
   next `wienerdog gws` command will offer to install it"; token present + a **deps
   tree present but not usable** (corrupt entry, missing/malformed main, no
   `.google`, or symlink-out) → "broken (installed but not loadable) — delete the
   folder `<depsDir>`, then reinstall it", with no offer claim (the self-heal cannot
   fire on a present tree, and a bare `npm install` can no-op on a corrupt tree — see
   round-4/round-6 below). Both name the concrete npm remedy. This is the defensive
   backstop for any caller that reaches `loadGoogleapis` without going through the self-heal
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

/** CURRENT (ancestor-walk) implementation — BEING REPLACED by contract §0 (the
 *  cache-poisoning fix). Shown so you know what you are replacing. Resolves the
 *  BARE `googleapis` request, which walks EVERY ancestor node_modules, then
 *  rejects out-of-dir hits — but Node caches that successful ancestor resolution
 *  in Module._pathCache, which is the P2 §0 fixes. */
function resolveFromDeps(paths) {
  const dir = depsDir(paths);
  const req = createRequire(path.join(dir, 'noop.js'));
  const resolved = req.resolve('googleapis');   // <-- ancestor-walk; cache-poisoning source
  let real = dir;
  try { real = fs.realpathSync(dir); } catch { /* deps dir absent */ }
  if (!resolved.startsWith(real + path.sep)) return null;
  return { req, resolved };
}

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
| modify | src/gws/deps.js | (0) **rewrite `resolveFromDeps` to direct-path construction** + add & export **`depsPresent`** (§0, cache-poisoning + presence-key); (a) `loadGoogleapis` token-aware + **presence-keyed** absent/broken split + shape-check (§2); (b) add + export `ensureGoogleReady`, **gated on `depsPresent`** (§3); (c) internal `hasToken` (lazy `require('./client')`) (§1); (d) `ensureGoogleapis` — quote `--prefix` (P2-A), `{defaultYes:true}` confirm (P2-B), notice+prompt → **stderr** (P1), + a present-but-broken **fail-to-print** guard (round-6 P2); (e) `defaultRunInstall` stdio → `['inherit', 2, 2]` (npm output → stderr, P1). Per contract §0/§2/§3/§3b. |
| modify | src/gws/index.js | import `ensureGoogleReady` from `./deps`; call `await ensureGoogleReady(paths)` for every non-`auth` command, before services are built. (No P1/P2 change — chatter routing is entirely in deps.js/prompt.js.) |
| modify | src/core/prompt.js | add `opts.output` to `confirm` (mode-1 prompt output stream; default `process.stdout`), per §3c. Backward-compatible; mode 2/3 unchanged. |
| modify | tests/unit/gws-deps.test.js | add the `plantToken`/`plantCorruptDeps`/`plantShapelessDeps`/`plantMainlessDeps` helpers + the new cases below (incl. §0 cache-regression **(a4)**, §2 missing-main **(a5)**, ensureGoogleReady present-no-op **(h)**, ensureGoogleapis present-broken throw **(i)**, stdout-hygiene **(j)**). Do NOT modify the existing no-token / containment assertions (they stay byte-identical). |
| modify | tests/unit/prompt.test.js | add one case: mode-1 `opts.output` routes the prompt to the given stream (keeps `process.stdout` clean); existing cases unchanged. |

### Exact contracts

**0. Rewrite `resolveFromDeps(paths)` — direct-path construction (owner-approved
guard change; land this first).** This reverses the guard's former "DO NOT CHANGE"
status. **Owner sign-off recorded 2026-07-13.**

*The defect (PR-gate P2).* The current guard resolves the **bare** `googleapis`
request via `createRequire(depsDir/noop.js).resolve('googleapis')`, which walks
**every** ancestor `node_modules`. When an ancestor has `googleapis` and the deps
dir is empty, `isInstalled()` resolves the ancestor and correctly rejects it — but
Node caches that **successful** resolution in `Module._pathCache` (keyed by
request + lookup-path list). The consented self-heal then installs into the deps dir, and
`loadGoogleapis()` **in the same process** re-resolves the bare request → gets the
**cached ancestor path** → rejects again → throws "needs a one-time install"
*immediately after* the user consented and `npm` succeeded. It self-corrects next
process, but that is a first-run UX failure in exactly the environment the guard
exists for (a machine with a global/ancestor `googleapis`).

*The fix — no ancestor walk at all.* Construct the deps-dir path directly and
resolve it absolutely:

```js
/** Whether a googleapis tree is PHYSICALLY present in the deps dir (its own
 *  package.json exists). This — NOT resolvability — is the absent/broken key and
 *  the self-heal gate (see §2 and §3/§3b + round-6 P2): a present-but-unresolvable
 *  tree (missing/malformed main, or a symlink pointing outside) must read BROKEN,
 *  and self-heal must NOT `npm` over it (arborist can no-op). `existsSync` follows
 *  symlinks, so a symlinked-inside copy counts as present and is then rejected as
 *  broken by resolveFromDeps's containment check. Exported (doctor/WP-103 uses it). */
function depsPresent(paths) {
  return fs.existsSync(path.join(depsDir(paths), 'node_modules', 'googleapis', 'package.json'));
}

function resolveFromDeps(paths) {
  const dir = depsDir(paths);
  // (1) Absent unless the deps-dir copy is physically present (its own package.json
  //     exists). Pure existence check — no resolution, so nothing is looked up in
  //     ancestors or cached.
  if (!depsPresent(paths)) return null;
  const candidate = path.join(dir, 'node_modules', 'googleapis');
  // (2) Resolve the ABSOLUTE candidate path (never the bare 'googleapis' request),
  //     so resolution targets exactly this dir, never walks ancestors, and is not
  //     served from Module._pathCache (the bare-request cache key is never used).
  //     NOTE: this can THROW when the tree is present but its main is missing/
  //     malformed — callers treat a throw as "present but broken" (§2/§3b), never
  //     as absent.
  const req = createRequire(path.join(dir, 'noop.js'));
  const resolved = req.resolve(candidate);
  // (3) RETAIN the realpath containment check — the resolved entry must live inside
  //     realpath(depsDir). `req.resolve` returns a symlink-resolved path, so a
  //     planted symlink deps/node_modules/googleapis -> elsewhere resolves OUTSIDE
  //     and is still rejected exactly as today (symlink defense preserved).
  let real = dir;
  try { real = fs.realpathSync(dir); } catch { /* deps dir absent — handled at (1) */ }
  if (!resolved.startsWith(real + path.sep)) return null;
  return { req, resolved };
}
```

*Threat posture: preserved-or-strengthened.* Containment is **strictly stronger** —
an ancestor/global `googleapis` is now never even considered (step 1 gates on the
deps-dir copy's own `package.json`; step 2 resolves only the absolute in-dir path).
The **symlink defense is unchanged**: step 3's realpath containment still rejects a
symlinked-inside copy that points outside the deps dir. The walk had to go because
it was the source of the `Module._pathCache` poisoning above; direct-path
resolution is simpler and cache-immune. `isInstalled` is **unchanged** (still
`resolveFromDeps(paths) !== null`); `loadGoogleapis`, `ensureGoogleReady`, and
`ensureGoogleapis` are re-keyed onto `depsPresent` (physical presence) rather than
resolvability — see §2 / §3 / §3b (round-6 P2): a present-but-unresolvable tree
(missing/malformed main, or a symlink-out) must classify **broken**, and self-heal
must never `npm`-install over a present tree.

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

**2. `loadGoogleapis(paths)` — branch on token presence, then on PHYSICAL
PRESENCE (`depsPresent`), not resolvability.** Keep the no-token message
byte-for-byte; the token-present branch splits **absent** vs **broken** on
`depsPresent(paths)` (round-6 P2). **Why presence, not resolvability:** a tree
whose `package.json` exists but whose main is missing/malformed makes
`resolveFromDeps` *throw* (→ `null`/absent under the old resolvable key), which
would mis-classify it ABSENT → self-heal would `npm`-over-corrupt → arborist can
no-op → permanent loop. Keying on physical presence makes **every** present-yet-
unusable state — resolve-throw (bad main), require-throw (corrupt entry point),
shape-fail (no `.google`), and symlink-out (containment reject) — classify BROKEN:

```js
function loadGoogleapis(paths) {
  const present = depsPresent(paths);   // physical presence — the classification key (round-6 P2)
  if (present) {
    try {
      const hit = resolveFromDeps(paths);   // may THROW (bad main) or return null (symlink-out)
      if (hit) {
        const mod = hit.req(hit.resolved);   // may THROW (corrupt entry point)
        // SHAPE check: a zero-byte / stub `index.js` requires to `{}` without
        // throwing but has no `.google`, so getServices would later crash with a
        // raw TypeError at `new google.auth.OAuth2`. Require a truthy `.google`.
        if (mod && typeof mod.google === 'object' && mod.google) return mod;   // healthy
      }
      // hit === null (symlink-out) or shape-fail → present-but-broken; fall through.
    } catch {
      /* resolve-throw (bad main) or require-throw (corrupt) — present-but-broken */
    }
  }
  // Disambiguate the states that share this failure (BUG-gws-deps-missing):
  if (hasToken(paths)) {
    const dir = depsDir(paths);
    // Quote the prefix (P2-A): a home path with spaces (e.g. Windows
    // C:\Users\John Smith\...) would otherwise split the argument when the user
    // pastes the command. Double quotes work in POSIX shells, cmd, and PowerShell.
    const cmd = `npm install --ignore-scripts --prefix "${dir}" ${GOOGLEAPIS_SPEC}`;
    if (present) {
      // CONNECTED but a deps tree is physically present yet not usable
      // (bad main / corrupt entry / no `.google` / symlink-out): the read-path
      // self-heal NO-OPs here (depsPresent is true), and a plain reinstall can
      // NO-OP too — npm compares tree metadata (recorded version/integrity), NOT
      // file contents (round-4 Finding). The tree must be REMOVED first. The deps
      // dir is single-purpose, so deleting it wholesale is safe. Platform-neutral
      // prose (not a per-OS rm/Remove-Item one-liner) — CLAUDE.md.
      throw new WienerdogError(
        'Google is connected, but its client library is broken (installed but not loadable). ' +
          `To repair it, delete the folder ${dir}, then reinstall it:\n  ${cmd}`
      );
    }
    // CONNECTED and the library is ABSENT (no deps tree): the next gws read WILL self-heal.
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

The exact npm command in every message is the **quoted-prefix** form
`npm install --ignore-scripts --prefix "<depsDir>" googleapis@^173` (P2-A — see
below).

Message contract (parity with WP-103's two warns):
- **Absent** (token present, `depsPresent === false` — no deps tree): MUST contain
  `Google is connected, but its client library needs a one-time install` AND `The
  next \`wienerdog gws\` command will offer to install it` AND the exact
  quoted-prefix npm command.
- **Broken** (token present, `depsPresent === true` but the tree is not usable —
  bad main resolve-throw, corrupt entry require-throw, shape-fail with no truthy
  `.google`, or symlink-out): MUST contain `Google is connected, but its client
  library is broken (installed but not loadable)` AND `delete the folder <depsDir>`
  AND the exact quoted-prefix npm command, and MUST **NOT** contain `will offer to
  install` (the self-heal cannot fire — `depsPresent` is true). The **delete-first**
  instruction is load-bearing: a bare `npm install` over a present-but-corrupt tree
  can no-op (npm compares tree metadata, not file contents), leaving the user
  looping (round-4 Finding). Both the shape-broken (`{}`) and the missing-main
  (resolve-throw) trees route here, so they yield this friendly message rather than
  a raw TypeError (PR-gate) or a mis-classified "will offer to install" loop
  (round-6 P2).
- **Both** branches MUST NOT contain `/wienerdog-google-setup`, `gws auth`, or any
  "no browser" claim (Codex Finding 3: recommending `wienerdog gws auth` here is
  factually wrong — `auth.run` throws without `--client <path>` and always opens
  the full browser OAuth loopback with it; the accurate remedies are the self-heal
  / the npm one-liner).
- The **no-token** branch is unchanged (byte-for-byte the same
  `/wienerdog-google-setup` message).

`present` is the single classification key. It is `depsPresent(paths)` — physical
presence of the deps-dir `googleapis/package.json` — evaluated ONCE, before any
resolve. Every present-yet-unusable sub-state (resolve-throw, require-throw,
shape-fail, symlink-out) falls through to the **broken** classification; only a
truly absent tree (`present === false`) is **absent**. Do NOT re-key this on
`isInstalled`/resolvability (that reintroduces the round-6 mis-classification of a
missing-main tree as absent → `npm`-over-corrupt loop).

**3. `ensureGoogleReady(paths, opts)` — new, exported.** The read-path self-heal.
**Gate on `depsPresent`, not `isInstalled`** (round-6 P2): if any deps tree is
physically present — healthy OR broken — self-heal must NOT run (it must never
`npm`-install over a present tree; `loadGoogleapis` surfaces broken-vs-healthy).

```js
/**
 * Self-heal the on-demand googleapis install on the READ path. When a Google
 * sign-in token exists but NO deps tree is present (the post-WP-047-upgrade
 * dead-end, BUG-gws-deps-missing), install it once — with consent, exactly like
 * first auth (ADR-0011/ADR-0013). No-op when a deps tree is already PRESENT
 * (healthy or broken — never install over it), or when no token exists (an
 * unauthed user; getServices()'s loadToken then surfaces the connect-Google flow
 * unchanged). Consent seams pass straight through to ensureGoogleapis: interactive
 * → a [Y/n] prompt (on stderr); non-TTY/headless → ensureGoogleapis throws the
 * accurate, browser-free npm-install remedy.
 * @param {WienerdogPaths} paths
 * @param {{yes?:boolean, confirm?:(q:string)=>Promise<boolean>,
 *          runInstall?:(dir:string,spec:string)=>{status:number}}} [opts]
 * @returns {Promise<void>}
 */
async function ensureGoogleReady(paths, opts = {}) {
  if (depsPresent(paths)) return;   // a deps tree is present (healthy or broken) — never install over it
  if (!hasToken(paths)) return;     // unauthed — do not install; let loadToken surface the connect flow
  await ensureGoogleapis(paths, opts);
}
```

Add `ensureGoogleReady` and `depsPresent` to `module.exports` (keep the existing
exports).

**3b. `ensureGoogleapis` + `defaultRunInstall` — changes (PR-gate P2-A/P2-B + the
round-6 P1 stdout-hygiene + P2 present-but-broken fixes).** The target
`ensureGoogleapis` body:

```js
async function ensureGoogleapis(paths, opts = {}) {
  if (isInstalled(paths)) return { installed: false, already: true };   // healthy → no-op
  const dir = depsDir(paths);
  // P2-A: quote the prefix (space-safe home paths); same form as loadGoogleapis.
  const cmd = `npm install --ignore-scripts --prefix "${dir}" ${GOOGLEAPIS_SPEC}`;
  // round-6 P2 (auth path): a deps tree is physically present but NOT usable
  // (isInstalled false, e.g. bad main / symlink-out). A plain reinstall may no-op
  // over it (arborist metadata compare), so fail to the HONEST delete-then-reinstall
  // remedy instead of npm-over-corrupt — never auto-repair (owner disposition).
  if (depsPresent(paths)) {
    throw new WienerdogError(
      `Google's client library is installed but not loadable. Delete the folder ${dir}, then reinstall it:\n  ${cmd}`
    );
  }
  // Truly absent → consented install. round-6 P1: ALL chatter goes to STDERR so a
  // piped read (`gws … --json | jq`) keeps clean stdout.
  process.stderr.write(`\nWienerdog needs Google's client library. It will run:\n  ${cmd}\n`);
  const ask = opts.confirm || confirm;
  // P2-B: {defaultYes:true} so Enter ACCEPTS. round-6 P1: output:process.stderr so
  // the prompt question is visible (and not written into a piped stdout).
  const ok = opts.yes || (await ask('Install it now? [Y/n] ', { defaultYes: true, output: process.stderr }));
  if (!ok) throw new WienerdogError(`declined — run this yourself, then retry:\n  ${cmd}`);
  fs.mkdirSync(dir, { recursive: true });
  const run = opts.runInstall || defaultRunInstall;
  const r = run(dir, GOOGLEAPIS_SPEC);
  if (r.status !== 0) throw new WienerdogError(`install failed — run it yourself, then retry:\n  ${cmd}`);
  return { installed: true };
}
```

Change summary versus the WP-047 body:
- **P2-A** — quote `--prefix "${dir}"` in `cmd` (space-safe home paths).
- **P2-B** — `{ defaultYes: true }` on the confirm call so Enter ACCEPTS. Do **NOT**
  use `opts.yes` (that bypasses consent). Injected `(q)=>Promise<boolean>` seams
  ignore the 2nd arg harmlessly.
- **round-6 P1 (stdout hygiene)** — the "Wienerdog needs Google's client library…"
  notice moves from `process.stdout.write` to **`process.stderr.write`**, and the
  confirm call passes **`output: process.stderr`** so the prompt renders on stderr.
  Rationale: a connected user running `gws gmail search --json | jq` (stdout piped,
  stdin a TTY) must NOT get the notice/prompt/npm output mixed into the JSON on
  stdout — today it corrupts every piped consumer, and the prompt question is even
  written *into the pipe* (invisible) while it waits.
- **round-6 P2 (auth path)** — the new `if (depsPresent(paths)) throw …` guard: for
  a present-but-broken tree, fail to the honest delete-then-reinstall remedy instead
  of `npm`-installing over it. Only reachable via `auth.js` (ensureGoogleReady gates
  on `depsPresent` and returns before calling here); healthy trees still no-op via
  `isInstalled`. auth's own meaningful stdout (the authorization URL) is written by
  `auth.js`, not here, and is unchanged.

**`defaultRunInstall` — route npm's output to stderr (round-6 P1).**
- OLD: `spawnSync('npm', [...], { stdio: 'inherit' })`
- NEW: `spawnSync('npm', [...], { stdio: ['inherit', 2, 2] })` — child stdin inherits
  from the parent; child stdout AND stderr both go to the parent's **stderr** (fd 2),
  so npm's progress never lands on the piped stdout. The argv array is otherwise
  unchanged (no shell — the prefix needs no quoting here; only the human-facing
  command STRINGS are quoted).

**If any existing test pins the `ensureGoogleapis` notice/prompt on stdout**, move
that assertion to stderr. (None do today — the current gws-deps ensureGoogleapis
tests assert on return values / thrown messages, not captured stdout.)

**3c. `src/core/prompt.js` — add `opts.output` to `confirm` (round-6 P1;
backward-compatible).** Today the mode-1 (stdin-is-a-TTY) branch renders the
prompt to a hardcoded `process.stdout`; the mode-2 (`/dev/tty`) branch already
uses `process.stderr`. Add an `opts.output` that overrides the **mode-1** output
stream (default stays `process.stdout`), so `ensureGoogleapis` can route the
consent prompt to stderr:

- OLD (mode-1 branch): `ask(process.stdin, process.stdout, question, () => {}, () => resolve(false), defaultYes)`
- NEW: `const output = (opts && opts.output) || process.stdout;` then
  `ask(process.stdin, output, question, () => {}, () => resolve(false), defaultYes)`

Constraints:
- **Mode 2 and mode 3 are unchanged** (mode 2 already prompts on `process.stderr`;
  mode 3 aborts). `opts.output` affects only the mode-1 default-stdout path.
- **Backward-compatible**: every existing caller (no `opts.output`) still renders
  on `process.stdout` in mode 1. `defaultYes` handling is unchanged.
- Update `confirm`'s JSDoc `@param opts` to document `output?: NodeJS.WritableStream`
  ("mode-1 prompt output stream; default process.stdout").

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

**5. Tests (`tests/unit/gws-deps.test.js`).** Add four helpers and fourteen cases
(a, a2, a3, a4, a5, b–j). Reuse the existing `tempPaths()`, `fakeInstall`,
`plantGoogleapis(base, which)` (already in the file — used by (a4) for the ancestor
copy), `deps`, `WienerdogError`, `path`, `fs`.

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
/** Plant a SHAPE-BROKEN googleapis: it resolves AND requires cleanly, but exports
 *  no `.google` (a zero-byte / stub index.js → `{}`). The canonical false-[ok]
 *  case the load-probe shape check must catch (PR-gate P2). */
function plantShapelessDeps(paths) {
  const pkgDir = path.join(deps.depsDir(paths), 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = {};\n');
}
/** Plant a MAINLESS googleapis: package.json present (main: index.js) but NO
 *  index.js — present (package.json exists) yet req.resolve THROWS. The round-6 P2
 *  case that must classify BROKEN, not absent. */
function plantMainlessDeps(paths) {
  const pkgDir = path.join(deps.depsDir(paths), 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  // deliberately NO index.js — req.resolve(candidate) throws (main missing)
}
```

- **(a) loadGoogleapis — token present + deps ABSENT → the "needs a one-time
  install" message with the self-heal offer.** `plantToken(paths)` on a fresh
  `tempPaths()`; assert `loadGoogleapis` throws a `WienerdogError` whose message
  matches `/Google is connected, but its client library needs a one-time install/`,
  matches `/will offer to install it/`, **includes** the quoted-prefix command
  `npm install --ignore-scripts --prefix "${deps.depsDir(paths)}" ${deps.GOOGLEAPIS_SPEC}`
  (note the double quotes around the prefix — P2-A), does **not** match
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
- **(a3) loadGoogleapis — token present + deps SHAPE-BROKEN (loads to `{}`) → the
  broken message, NOT a TypeError (PR-gate P2).** `plantToken(paths)` **and**
  `plantShapelessDeps(paths)` on a fresh `tempPaths()`; assert `loadGoogleapis`
  throws — and that the thrown value **`instanceof WienerdogError`** (proving the
  shape check fired, not a raw `TypeError`) — whose message matches `/Google is
  connected, but its client library is broken \(installed but not loadable\)/`,
  matches `/delete the folder/`, does **NOT** match `/will offer to install/`, and
  does **not** match `/\/wienerdog-google-setup/`. This is the canonical false-`[ok]`
  case: a zero-byte/stub entry point requires cleanly but has no `.google`, so
  without the shape check `getServices` would later crash at `new
  google.auth.OAuth2`.
- **(a4) `resolveFromDeps` is cache-immune — an ANCESTOR googleapis never
  satisfies the guard, and a deps-dir install loads in the SAME process (§0
  regression).** On a fresh `tempPaths()`, plant an ancestor copy
  `plantGoogleapis(paths.home, 'ancestor')` (`paths.home` is an ancestor of
  `<core>/app/deps`, so the OLD ancestor walk would find it) and
  `plantToken(paths)`. **Ancestor-alone → absent, end-to-end:** assert
  `deps.isInstalled(paths) === false`, and `loadGoogleapis` throws a
  `WienerdogError` matching `/needs a one-time install/` (the ABSENT message — deps
  dir empty), NOT `/broken/`. **Then install into the deps dir and re-check in the
  SAME process:** `fakeInstall(deps.depsDir(paths)); assert.equal(deps.isInstalled(
  paths), true); const g = deps.loadGoogleapis(paths); assert.equal(g.google.WHICH,
  'deps');` — it loads the deps-dir copy, not the ancestor. **This case FAILS on the
  old ancestor-walk implementation** (the first `isInstalled`/`loadGoogleapis`
  caches the ancestor resolution in `Module._pathCache`, so the post-install
  `loadGoogleapis` cache-hits the ancestor and throws "needs a one-time install")
  **and passes on the §0 direct-path guard.** Run **in-process** (the whole point is
  the intra-process cache) — do NOT use `probeInChild` here.
- **(a5) loadGoogleapis — token present + MAINLESS tree (package.json but no main)
  → BROKEN, not absent (round-6 P2).** `plantToken(paths)` **and**
  `plantMainlessDeps(paths)` on a fresh `tempPaths()`; assert `loadGoogleapis`
  throws a `WienerdogError` matching `/broken \(installed but not loadable\)/` and
  `/delete the folder/`, and does **NOT** match `/needs a one-time install/`, NOT
  `/will offer to install/`, NOT `/\/wienerdog-google-setup/`. Also assert
  `deps.depsPresent(paths) === true` and `deps.isInstalled(paths) === false` (the
  exact state that mis-classified as absent under the old resolvable key).
- **(b) ensureGoogleReady — token present + deps absent + consent-yes →
  installs.** `plantToken`; `await ensureGoogleReady(paths, {confirm: async () =>
  true, runInstall: (dir, spec) => fakeInstall(dir, spec)})`; assert the injected
  `runInstall` ran (spy a boolean) and `deps.isInstalled(paths) === true`
  afterward.
- **(c) ensureGoogleReady — token present + deps absent + consent-no → throws the
  npm command, no install.** `plantToken`; call `ensureGoogleReady(paths, ...)`
  with `confirm: async () => false` and a spying `runInstall` (sets `ran = true`).
  Assert via `assert.rejects` that it throws a `WienerdogError` whose message
  includes the exact quoted-prefix command `npm install --ignore-scripts --prefix
  "<depsDir>" googleapis@^173` (build the expectation as
  `` `npm install --ignore-scripts --prefix "${deps.depsDir(paths)}" ${deps.GOOGLEAPIS_SPEC}` ``,
  with the double quotes — P2-A); then assert `ran === false` and
  `deps.isInstalled(paths) === false`. (This is the headless-equivalent: the real
  `confirm` returns false on a non-TTY, so the same throw fires.)
- **(d) ensureGoogleReady — NO token → no-op (unauthed path unchanged).** No
  `plantToken`. `const res = await ensureGoogleReady(paths, {confirm: async () =>
  true, runInstall: () => {ran = true; return {status:0};}})`. Assert `res ===
  undefined`, `ran === false` (the consent seam was never consulted), and
  `deps.isInstalled(paths) === false`.
- **(e) ensureGoogleReady — a PRESENT (healthy) tree → no-op.** `plantToken` **and**
  `fakeInstall(deps.depsDir(paths))`; `await ensureGoogleReady(paths, {confirm:
  async () => true, runInstall: () => {ran = true; return {status:0};}})`; assert
  `ran === false` (installer must not run when a tree is present; now via the
  `depsPresent` gate).
- **(f) ensureGoogleReady with opts.yes — token present + deps absent → installs
  without prompting.** `plantToken`; `await ensureGoogleReady(paths, {yes: true,
  confirm: async () => {asked = true; return false;}, runInstall: fakeInstall})`;
  assert `asked === false` and `deps.isInstalled(paths) === true`.
- **(g) ensureGoogleapis passes `{ defaultYes: true, output: process.stderr }` to
  confirm (P2-B + P1 — locks the default-yes AND the stderr routing).** On a fresh
  `tempPaths()` (deps absent, so the prompt/install path runs), `let seenQ,
  seenOpts; await deps.ensureGoogleapis(paths, {confirm: async (q, opts) => { seenQ
  = q; seenOpts = opts; return true; }, runInstall: fakeInstall});` then
  `assert.equal(seenQ, 'Install it now? [Y/n] '); assert.equal(seenOpts.defaultYes,
  true); assert.equal(seenOpts.output, process.stderr);` (identity check on the
  stream, not `deepEqual` — a stream is not structurally comparable).
- **(h) ensureGoogleReady — a PRESENT-but-BROKEN tree → NO-OP, seams never
  consulted (round-6 P2).** `plantToken(paths)` **and** `plantMainlessDeps(paths)`;
  `let ran = false; const res = await deps.ensureGoogleReady(paths, {confirm: async
  () => { ran = true; return true; }, runInstall: () => { ran = true; return
  {status:0}; }});` assert `res === undefined` and `ran === false` (self-heal must
  NOT `npm` over a present-but-broken tree — it returns via the `depsPresent` gate).
- **(i) ensureGoogleapis — a PRESENT-but-BROKEN tree → throws the delete-then-
  reinstall remedy, no install (round-6 P2, auth path).** `plantMainlessDeps(paths)`
  on a fresh `tempPaths()`; `let ran = false; await assert.rejects(() =>
  deps.ensureGoogleapis(paths, {confirm: async () => true, runInstall: () => { ran =
  true; return {status:0}; }}), (e) => e instanceof WienerdogError && /Delete the
  folder/.test(e.message) && e.message.includes(\`npm install --ignore-scripts
  --prefix "${deps.depsDir(paths)}" ${deps.GOOGLEAPIS_SPEC}\`)); assert.equal(ran,
  false);` (never `npm`-over-corrupt; fail to the honest remedy).
- **(j) ensureGoogleapis writes NOTHING to stdout on the yes-path; the notice goes
  to stderr (round-6 P1).** On a fresh `tempPaths()` (deps absent), capture
  `process.stdout.write` and `process.stderr.write` around `await
  deps.ensureGoogleapis(paths, {confirm: async () => true, runInstall:
  fakeInstall})`; assert the captured **stdout is empty** and the captured
  **stderr contains** `Wienerdog needs Google's client library`. (The injected
  `confirm` seam does not touch streams, so this asserts the notice routing; the
  prompt-stream routing is covered by the prompt.test.js case. Restore both
  `write`s in a `finally`.)

### Update these existing `ensureGoogleapis` assertions to the quoted command (P2-A)

Two pre-existing WP-047 tests pin the **unquoted** command and MUST be updated to
the quoted-prefix form (same file, a WP-102 deliverable): the consent-**decline**
test (`ensureGoogleapis on consent-no throws with the exact npm install command`,
~lines 167–187) and the installer-**failure** test (`ensureGoogleapis surfaces a
non-zero installer status with the command`, ~lines 189–203). In both, change the
pinned `` `npm install --ignore-scripts --prefix ${deps.depsDir(paths)}
${deps.GOOGLEAPIS_SPEC}` `` expectation to `` `npm install --ignore-scripts
--prefix "${deps.depsDir(paths)}" ${deps.GOOGLEAPIS_SPEC}` `` (add the double
quotes). No other change to those tests.

### Do NOT modify these existing tests (answer to the report's fix-5 question)

The existing assertions at `tests/unit/gws-deps.test.js` ~lines **101–110**
(`loadGoogleapis` throws the setup error when absent) and ~lines **205–230** (the
containment-guard child-process probes) are all **no-token** cases. With this WP,
the no-token branch of `loadGoogleapis` still emits the identical
`/wienerdog-google-setup` message, so those tests remain valid and **must stay
unchanged**. Do not touch them.

**The §0 `resolveFromDeps` rewrite keeps these byte-identical** — its external
behavior is unchanged: an ancestor/out-of-dir `googleapis` still classifies as
**absent** (`null`) — now by construction (step 1's `package.json` gate) rather
than by resolve-then-reject — and a deps-dir copy (real or symlinked-inside) is
handled exactly as before (loaded if inside `realpath(depsDir)`, rejected if the
symlink points outside). So the `probeInChild` ancestor-decoy cases (:205–230)
still pass verbatim; only the NEW in-process case (a4) distinguishes old from new.

**5b. Test (`tests/unit/prompt.test.js`) — mode-1 `opts.output` routes the prompt
(round-6 P1).** Reuse the file's existing `withFakeTTYStdin` helper (it installs a
fake TTY `PassThrough` as `process.stdin`). Add:

```js
test('mode 1: opts.output routes the prompt to the given stream (keeps stdout clean)', async () => {
  await withFakeTTYStdin(async (fake) => {
    const out = new PassThrough();          // PassThrough is already imported in this file
    let written = '';
    out.on('data', (c) => { written += c.toString(); });
    const p = confirm('Install it now? [Y/n] ', { defaultYes: true, output: out });
    fake.write('\n');                        // bare Enter → true (defaultYes)
    assert.equal(await p, true);
    assert.match(written, /Install it now\?/);   // the prompt went to opts.output, not stdout
  });
});
```

Do NOT change the existing prompt cases — they pass no `opts.output`, so mode 1
still renders on `process.stdout` (backward-compat).

## Implementation notes & constraints

- **Zero new dependencies.** No new require beyond the lazy `require('./client')`
  inside `hasToken`. `node:fs` is already required in `deps.js`.
- **Load-order / cycle safety.** `client.js` top-level-requires `deps.js`;
  `deps.js` must reference `./client` **only** lazily (inside `hasToken`, at call
  time). Do not add a top-level `require('./client')` to `deps.js` — it would
  create a load-time cycle and `tokenPath` could be `undefined`.
- **The containment guard (`resolveFromDeps`) is rewritten, not bypassed
  (contract §0, owner-approved).** It stays a deliberate supply-chain control —
  the rewrite makes it **stricter** (ancestor copies never considered) and
  cache-immune while preserving the symlink defense. Self-heal still populates the
  deps dir *through* the guard's install path and never bypasses it. Do not
  reintroduce the bare-`googleapis` ancestor walk.
- **Accepted residual — self-heal SKIPS the present-but-broken state (Codex
  Finding 1b; narrowed round-3; re-keyed round-6).** `ensureGoogleReady` gates on
  `depsPresent` — physical presence of the deps tree — and no-ops whenever a tree is
  present, healthy OR broken. So a **corrupt/partial** install (interrupted `npm`,
  missing transitive dep, missing/malformed main, broken entry point, symlink-out)
  is never auto-repaired. Keeping self-heal to the truly-absent case is deliberate
  (owner disposition: no auto-repair of a present tree; a plain reinstall can no-op
  anyway). **The residual is ONLY that self-heal does not auto-repair — the MESSAGE
  is accurate:** `loadGoogleapis` keys the same `depsPresent` split, so a
  present-but-broken tree emits the **broken** message (delete the folder
  `<depsDir>`, then reinstall — round-4), never a "will offer to install" loop
  (round-6 P2 closed the missing-main mis-classification). The `doctor` probe
  (WP-103) surfaces the same state with the same remedy. Do NOT re-key the read gate
  onto `isInstalled`/resolvability — that reopens the missing-main-tree loop.
- **The shape check is minimal (PR-gate P2).** `loadGoogleapis` validates only that
  the required module exposes a truthy `.google` object — enough to catch the
  canonical shape-broken case (a zero-byte / stub `index.js` → `{}`) and convert it
  from a raw downstream `TypeError` into the friendly broken message. It is **not** a
  full API-surface validation: a module with `.google` present but internally
  corrupt (e.g. missing `google.auth.OAuth2`) still surfaces at call time. That
  deeper corruption is an **accepted residual** — validating the full surface on
  every load is not worth it, and the remedy (delete + reinstall) is identical.
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
- **Consent stays intact under the P2-B default-yes fix.** The self-heal prompt
  now honors ADR-0011's default-yes (Enter accepts) via `{ defaultYes: true }` on
  the `confirm` call — NOT via `opts.yes`, which would skip the prompt entirely and
  break consent. A non-TTY still aborts (mode 3 in `src/core/prompt.js` ignores
  `defaultYes` and returns false), so headless installs are never silently
  performed. Every user-facing command string is quoted (`--prefix "<dir>"`, P2-A);
  `defaultRunInstall`'s argv array is untouched (no shell).
- **stdout hygiene (round-6 P1).** ALL self-heal chatter goes to **stderr**: the
  "Wienerdog needs Google's client library…" notice (`process.stderr.write`), the
  consent prompt (confirm `output: process.stderr`, via the mode-1 `opts.output`
  seam in `prompt.js`), and npm's own output (`defaultRunInstall` `stdio:
  ['inherit', 2, 2]`). So a connected user's `gws … --json | jq` keeps a clean
  stdout even when the first read triggers a consented install. `index.js` needs no
  change — the routing lives entirely in `deps.js` + `prompt.js`.
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
- [ ] The §0 guard rewrite does not weaken the supply-chain control: `googleapis`
      is still loaded ONLY from inside `realpath(<core>/app/deps)`; an
      ancestor/global copy is now rejected **by construction** (never resolved), and
      a symlinked-inside copy pointing outside the deps dir is still rejected by the
      retained realpath check.

## Acceptance criteria

- [ ] A read command run interactively with a valid token but no `app/deps`
      prompts to install `googleapis` and, on consent, succeeds using the existing
      token — no re-auth, no browser (self-heal).
- [ ] The same on a non-TTY fails with the accurate npm-install remedy (naming the
      exact command), never the misleading "isn't set up yet".
- [ ] `loadGoogleapis` with a token present + deps **absent** throws the "Google is
      connected, but its client library needs a one-time install … will offer to
      install it" message with the npm command, not `/wienerdog-google-setup`.
- [ ] `loadGoogleapis` with a token present + a **present-but-unusable** deps tree
      (corrupt entry, or missing-main) throws the "broken (installed but not
      loadable) — delete the folder `<depsDir>`, then reinstall it" message naming the
      deps folder and the npm command, with **no** "will offer to install" claim; and
      the prescribed delete-then-reinstall flow makes the library loadable again
      (verified with the test seams, case a2).
- [ ] An **unauthed** user (no token) is unaffected: `ensureGoogleReady` is a
      no-op and the existing "no Google sign-in found — run `wienerdog gws auth`
      first" / connect flow is unchanged.
- [ ] `ensureGoogleReady` is a no-op when `googleapis` is already installed.
- [ ] Every user-facing npm command string quotes the prefix (`--prefix
      "<depsDir>"`) in `loadGoogleapis` (both branches) and `ensureGoogleapis`
      (prompt line + decline + install-failed) so a home path with spaces is not
      split when pasted (P2-A).
- [ ] The self-heal prompt honors default-yes: pressing Enter at `Install it now?
      [Y/n]` ACCEPTS (`{ defaultYes: true }` on the production confirm), while a
      non-TTY still aborts and installs nothing (P2-B).
- [ ] Running a read twice after a successful self-heal is idempotent (second run:
      `depsPresent` true → `ensureGoogleReady` no-ops, no install attempted).
- [ ] `resolveFromDeps` uses direct-path construction (no ancestor walk): on a
      machine with an ancestor/global `googleapis`, a consented self-heal in the
      **same process** succeeds — the post-install read loads the deps-dir copy, not
      the cached ancestor (§0; case (a4)). Ancestor-only stays classified absent;
      a symlinked-inside copy pointing outside the deps dir stays rejected.
- [ ] A **present-but-broken** deps tree (package.json but missing/malformed main)
      classifies **broken**, not absent: `loadGoogleapis` throws the delete-then-
      reinstall message (case a5), `ensureGoogleReady` no-ops (case h), and
      `ensureGoogleapis` fails to the honest remedy instead of `npm`-over-corrupt
      (case i) — no permanent loop (round-6 P2).
- [ ] Self-heal chatter never lands on stdout: `ensureGoogleapis`'s notice + prompt
      go to stderr and npm's output is routed to stderr, so `gws … --json | jq`
      keeps clean stdout after a consented install (round-6 P1; cases g, j, and the
      prompt.test.js `opts.output` case).
- [ ] The existing no-token AND containment (:205–230) assertions in
      `gws-deps.test.js` are byte-unchanged and still pass; existing `prompt.test.js`
      cases are unchanged. `npm test` and `npm run lint` are green.

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
- Beyond the §0 direct-path rewrite, any *behavioral* change to the containment
  guard `resolveFromDeps` (its accept/reject semantics stay identical), and any
  change to `GOOGLEAPIS_SPEC`, token/client persistence, scopes, or the OAuth flow.
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
- **2026-07-13 — PR-gate review (Codex PR review; two P2s, WP-102).**
  - **P2-A (also WP-103).** Every emitted npm command interpolated the deps dir
    **unquoted** (`--prefix ${dir}`), so a home path with spaces (common on Windows:
    `C:\Users\John Smith\…`) splits the argument when pasted. Quoted the prefix in
    every user-facing command STRING — `loadGoogleapis`'s two token-present messages
    AND `ensureGoogleapis`'s prompt line + decline + install-failed messages (same
    `cmd` template; leaving those unquoted would break parity). `defaultRunInstall`'s
    `spawnSync` argv array is unchanged (no shell). Updated the pinned assertions in
    new cases (a)/(a2)/(c) and the two pre-existing `ensureGoogleapis`
    decline/failure tests.
  - **P2-B (WP-102).** `ensureGoogleapis`'s prompt advertises default-yes
    (`[Y/n]`, its doc comment, ADR-0011) but called the production `confirm`
    WITHOUT `{ defaultYes: true }` — `src/core/prompt.js` defaults it false, so
    pressing Enter *declined*. A latent WP-047 defect made in-scope because WP-102's
    self-heal makes this prompt the primary recovery path (and `deps.js` is a WP-102
    deliverable). Fixed the one line to `await ask('Install it now? [Y/n] ',
    { defaultYes: true })` (NOT `opts.yes`, which would bypass consent). Added
    test (g): a confirm seam captures its 2nd arg and asserts it deep-equals
    `{ defaultYes: true }`. Existing accept/decline consent tests unchanged.
- **2026-07-13 — closing PR-gate (Codex PR review; one P2, WP-102 fix serves
  WP-103 too).** The load probe treated **any** successfully-required module as
  usable, so a shape-broken install whose `index.js` requires to `{}` (canonical:
  zero-byte entry point) passed `loadGoogleapis` → `doctor` reported `[ok]` and the
  next gws read crashed with a raw `TypeError` at `new google.auth.OAuth2` in
  `getServices`. Fix (single point in `loadGoogleapis`): after a successful require,
  validate the module shape — `if (mod && typeof mod.google === 'object' &&
  mod.google) return mod;` else fall through to the existing classification. A
  shape-fail implies `resolvable === true` (it resolved and loaded), so it is
  classified **broken** automatically — the read path gets the friendly broken
  message, and `doctor` inherits the fix (its probe calls `loadGoogleapis`).
  `ensureGoogleReady`/`isInstalled` unchanged (owner's targeted disposition: the
  resolve-only read gate stays; a shape-broken install is manual-remedy). Added test
  (a3): `plantShapelessDeps` (`module.exports = {}`) → `loadGoogleapis` throws a
  `WienerdogError` (asserted `instanceof`, NOT a `TypeError`) with the broken
  message and no offer claim. Recorded the accepted residual: the check is minimal
  (presence of a truthy `.google`), not a full API-surface validation — deeper
  corruption still surfaces at call time.
- **2026-07-13 — post-approval containment-guard rewrite (owner sign-off recorded
  2026-07-13; reverses the guard's former DO-NOT-CHANGE status).** The closing
  Codex review found a real P2 in the self-heal flow: `resolveFromDeps` resolved the
  **bare** `googleapis` request (ancestor walk), so on a machine with an
  ancestor/global `googleapis` + empty deps dir, `isInstalled()` resolved+rejected
  the ancestor but Node cached that resolution in `Module._pathCache`; the consented
  self-heal then installed into the deps dir, and same-process `loadGoogleapis()`
  re-resolved to the **cached ancestor** → rejected → threw "needs a one-time
  install" right after the user consented and `npm` succeeded (first-run UX failure
  in exactly the environment the guard exists for). Fix (contract §0): rewrite
  `resolveFromDeps` to **direct-path construction** — gate on the deps-dir copy's
  own `package.json` (existence, no resolution), resolve the **absolute** in-dir
  candidate (never the bare request, so no ancestor walk and no `_pathCache`
  poisoning), and **retain** the realpath containment check (symlink defense
  preserved). Net: strictly stronger containment (ancestor copies never considered),
  simpler, cache-immune. `isInstalled`/`loadGoogleapis`/`ensureGoogleReady`/
  `ensureGoogleapis` above the resolver unchanged. Containment tests (:205–230) stay
  byte-identical (behavior unchanged); NEW in-process case (a4) plants an ancestor
  copy, asserts `isInstalled === false`, then `fakeInstall`s the deps dir and asserts
  same-process `loadGoogleapis` loads the deps copy — FAILS on the old walk, passes
  on the rewrite. Documented the preserved-or-strengthened threat posture and why
  the walk had to go.
- **2026-07-13 — closing Codex PR pass, round-6 (two findings; deps.js +
  prompt.js + doctor.js/WP-103).**
  - **P1 (high user-visibility — stdout hygiene).** The self-heal wrote its notice,
    consent prompt, and npm output to STDOUT, so a connected user's `gws … --json |
    jq` got invalid JSON (and, with stdout piped + a TTY stdin, the prompt question
    was written into the pipe, invisible, while it waited). Routed ALL chatter to
    stderr: the notice → `process.stderr.write`; npm → `defaultRunInstall` `stdio:
    ['inherit', 2, 2]`; the prompt → a new backward-compatible `opts.output` on
    `confirm` (mode-1 output stream, default `process.stdout`) that `ensureGoogleapis`
    sets to `process.stderr`. Grew Deliverables by `src/core/prompt.js` + its test.
    `index.js` unchanged. auth's meaningful stdout (the authorization URL) is
    separate and unchanged.
  - **P2 (classification gap the §0 rewrite opened).** A tree whose `package.json`
    exists but is unresolvable (missing/malformed main) made `resolveFromDeps` throw
    → `isInstalled` false → classified ABSENT → self-heal `npm`-over-corrupt →
    arborist no-op → permanent loop. Re-keyed the absent/broken split AND the
    self-heal gate onto **physical presence** (`depsPresent`, the §0 step-1 existence
    check, now extracted + exported): `loadGoogleapis` sets `present` before any
    resolve so resolve-throw/require-throw/shape-fail/symlink-out all classify
    BROKEN; `ensureGoogleReady` gates on `depsPresent` (never install over a present
    tree); and `ensureGoogleapis` gained a `if (depsPresent(paths)) throw <delete-
    then-reinstall remedy>` guard so the **auth** path fails honestly instead of
    `npm`-over-corrupt (owner's no-auto-repair disposition). WP-103's doctor probe
    swaps its broken-vs-missing key from `isInstalled` to `depsPresent`. New tests:
    a5 (missing-main → broken), h (ensureGoogleReady no-op on present), i
    (ensureGoogleapis present-broken throw), j (no stdout on yes-path); a2/a3/a4 and
    the containment probes stay green.

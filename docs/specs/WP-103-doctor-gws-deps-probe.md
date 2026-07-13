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
wording**, not for code: the warn line tells the user the next `gws` command will
offer to install the library (WP-102's self-heal), so WP-102 must land first for
that sentence to be true. The APIs this probe calls (`deps.loadGoogleapis`,
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
- `require('../gws/deps').loadGoogleapis(paths)` → the loaded `googleapis` module,
  or **throws** a `WienerdogError`. It resolves via the containment guard AND
  `require`s the module inside its own `try/catch`, so it is a full **LOAD** probe
  — a corrupt/partial install that resolves but fails to `require` throws here.
  Use this (in a `try/catch`) as the primary usability check (Codex Finding 1a).
- `require('../gws/deps').isInstalled(paths)` → `boolean` (resolve-only). Used
  **only after a failed load** to distinguish ABSENT (`false` → self-heal will
  fire) from BROKEN (`true` → resolvable-but-un-loadable, self-heal no-ops), so the
  two get distinct remedies (round-2 Finding 2).
- `require('../gws/deps').depsDir(paths)` → `<core>/app/deps` (for the remedy).
- `require('../gws/deps').GOOGLEAPIS_SPEC` → `'googleapis@^173'` (for the remedy).
- `require('../gws/client').tokenPath(paths)` → `path.join(paths.secrets,
  'google-token.json')` — the canonical token path. The probe reads + JSON-parses
  it (read-only) and requires a **non-empty string** `refresh_token`, so a
  zero-byte / malformed / incomplete / wrong-type / whitespace-only token warns as
  "damaged" and never reads `[ok]` (Codex Finding 4 + round-2 Finding 3).

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
 *  never fails (WARN, not fail). Emits NOTHING when Google is not connected (no
 *  token). A damaged token warns separately (never [ok]). Uses a containment-
 *  guarded LOAD probe (not just resolve) so a corrupt/partial install warns.
 *  WP-103 / BUG-gws-deps-missing.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function googleReadinessChecks(paths) {
  const { tokenPath } = require('../gws/client');
  const deps = require('../gws/deps');
  const tp = tokenPath(paths);
  if (!fileExists(tp)) return []; // Google not connected — nothing to check (normal)

  // Finding 4 + round-2 Finding 3 — minimal, read-only token validation: a
  // zero-byte / malformed / incomplete token must never read as a healthy [ok].
  // Require valid JSON with a NON-EMPTY STRING refresh_token (a truthiness-only
  // check would let {"refresh_token":true} or a whitespace value pass). Anything
  // else is a separate "damaged" warn.
  let token = null;
  try { token = JSON.parse(fs.readFileSync(tp, 'utf8')); } catch { token = null; }
  if (!token || typeof token !== 'object' ||
      typeof token.refresh_token !== 'string' || token.refresh_token.trim() === '') {
    return [{ status: 'warn', msg: 'Google sign-in file looks damaged — reconnect with /wienerdog-google-setup' }];
  }

  // Finding 1(a) — containment-guarded LOAD probe: actually require the resolved
  // module so a resolvable-but-unloadable (corrupt/partial) install warns instead
  // of falsely reading [ok]. loadGoogleapis resolves via the containment guard
  // AND requires the module inside its try/catch, so a broken entry point throws a
  // WienerdogError we catch here. doctor runs rarely, so the load cost is fine.
  let usable = false;
  try { deps.loadGoogleapis(paths); usable = true; } catch { usable = false; }
  if (usable) {
    return [{ status: 'ok', msg: 'Google connected and its client library is installed' }];
  }
  // Round-2 Finding 2 — DISTINGUISH the two failed-load states, because the
  // self-heal promise is only true for one of them:
  //   isInstalled false → ABSENT: the next read WILL self-heal (WP-102).
  //   isInstalled true  → BROKEN (resolves but won't load): self-heal NO-OPs
  //                        (WP-102's isInstalled gate is true), so promising an
  //                        offer would be false — require a manual reinstall.
  // Same npm command repairs both (install over the corrupt dir overwrites it).
  const cmd = `npm install --ignore-scripts --prefix ${deps.depsDir(paths)} ${deps.GOOGLEAPIS_SPEC}`;
  if (deps.isInstalled(paths)) {
    return [
      {
        status: 'warn',
        msg:
          'Google is connected but its client library is broken (installed but not loadable) — reinstall it: ' + cmd,
      },
    ];
  }
  return [
    {
      status: 'warn',
      msg:
        'Google is connected but its client library is missing — the next `wienerdog gws` ' +
        'command will offer to install it, or run: ' + cmd,
    },
  ];
}
```

Use the file's existing `fileExists(p)` helper and its top-level `fs` for the
token read. Both warn branches drop the `wienerdog gws auth` suggestion (Codex
Finding 3). Two distinct messages (round-2 Finding 2): the **absent** message
keeps the self-heal promise + npm command; the **broken** (resolvable-but-
un-loadable) message must NOT claim the next-command offer — WP-102's self-heal
no-ops on a resolvable install — and points only to the npm reinstall (the same
command repairs it). Consistent with WP-102's `loadGoogleapis` message, whose
single string is an error (not a status) and always carries the npm one-liner. The
`npm install` one-liner is the universal remedy
for both.

**2. Wire into `run`.** Immediately **after** the `codexSkillChecks` loop and
**before** the update-notice block, add:

```js
for (const c of googleReadinessChecks(paths)) check(c.status, c.msg);
```

`paths` is already in scope. No other change to `run`.

**3. Tests (`tests/unit/doctor.test.js`).** Add the plant helpers and the cases
below using the existing `run`/`tempEnv` helpers. Plant a token by writing
`<core>/secrets/google-token.json`; plant the library under `<core>/app/deps`
(the containment-guarded location — do NOT plant it elsewhere):

```js
/** Plant a WORKING fake googleapis under <core>/app/deps (resolves AND loads). */
function plantDeps(core) {
  const pkgDir = path.join(core, 'app', 'deps', 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = { google: {} };\n');
}
/** Plant a CORRUPT fake googleapis: resolves fine, but its entry point throws on require. */
function plantCorruptDeps(core) {
  const pkgDir = path.join(core, 'app', 'deps', 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  fs.writeFileSync(path.join(pkgDir, 'index.js'), "throw new Error('corrupt googleapis entry point');\n");
}
/** Plant a VALID token (JSON + refresh_token) so the core reads as "connected". */
function plantToken(core) {
  const secrets = path.join(core, 'secrets');
  fs.mkdirSync(secrets, { recursive: true });
  fs.writeFileSync(path.join(secrets, 'google-token.json'),
    JSON.stringify({ access_token: 'a', refresh_token: 'r' }));
}
/** Plant a DAMAGED token file (malformed / missing refresh_token). */
function plantDamagedToken(core, content) {
  const secrets = path.join(core, 'secrets');
  fs.mkdirSync(secrets, { recursive: true });
  fs.writeFileSync(path.join(secrets, 'google-token.json'), content);
}
```

- **Google not connected → no Google-readiness line.** Default `tempEnv()`;
  `run(['init','--yes'], env)` then `run(['doctor'], env)`. Assert `r.stdout` does
  **not** match `/Google connected|Google is connected but|Google sign-in file/`
  and `r.status === 0`.
- **Damaged token → `[warn]` "looks damaged", never `[ok]` (Finding 4 + round-2
  Finding 3).** For **each** of these damaged variants, `init`;
  `plantDamagedToken(core, <content>)`; `doctor`; assert `r.stdout` matches
  `/\[warn\] Google sign-in file looks damaged/`, does **not** match `/\[ok\]
  Google connected/`, and `r.status === 0`:
  - malformed JSON: `'not json'`
  - missing `refresh_token`: `JSON.stringify({access_token:'a'})`
  - **wrong-type** `refresh_token` (round-2 Finding 3): `JSON.stringify({refresh_token:true})`
  - **whitespace-only** `refresh_token` (round-2 Finding 3): `JSON.stringify({refresh_token:'   '})`
  - zero-byte: `''`
- **Connected + library ABSENT → `[warn]` "missing", exit 0.** `init`;
  `plantToken(core)` (no deps planted); `doctor`. Assert `r.stdout` matches
  `/\[warn\] Google is connected but its client library is missing — the next .?wienerdog gws.? command will offer to install it/`,
  does **not** match `/gws auth/` (Finding 3), and `r.status === 0` (warn, not fail).
- **Connected + library BROKEN (resolvable but throws on load) → `[warn]`
  "broken", exit 0 (Finding 1a + round-2 Finding 2).** `init`; `plantToken(core)`;
  `plantCorruptDeps(core)`; `doctor`. Assert `r.stdout` matches `/\[warn\] Google
  is connected but its client library is broken \(installed but not loadable\)/`,
  **does NOT match** `/will offer to install/` (the broken state does not
  self-heal — round-2 Finding 2), does **not** match `/\[ok\] Google connected/`,
  and `r.status === 0`. (This is the case a resolve-only check would falsely pass,
  and the case whose remedy must not promise the next-command offer.)
- **Connected + library present and loadable → `[ok]`.** `init`;
  `plantToken(core)`; `plantDeps(core)`; `doctor`. Assert `r.stdout` matches
  `/\[ok\] Google connected and its client library is installed/` and
  `r.status === 0`.

(Whichever of `tempEnv`'s return fields exposes the core dir — e.g. `core` — pass
it to the plant helpers. Read the helper at the top of the file.)

## Implementation notes & constraints

- **Read-only, warn-not-fail.** `doctor` must never create, install, or repair
  anything. A missing/broken library is a `warn`; the printed remedies are the
  WP-102 self-heal (the next `gws` command) and the exact npm one-liner. Do **not**
  print a `wienerdog gws auth` suggestion (Codex Finding 3 — it cannot fix this
  without re-opening browser consent).
- **Silent when unconnected.** Drive the check off token presence: no token →
  empty array → no line. This keeps `doctor` clean for the majority of users.
- **The LOAD probe respects the containment guard** — `loadGoogleapis` resolves
  `googleapis` only from **inside** `<core>/app/deps` (WP-047) and then requires
  it, so a stray or corrupt copy does not read as usable. The
  planted-under-`app/deps` test fixtures satisfy the guard; do not plant them
  anywhere else.
- Zero new dependencies; no build step. Do not touch `gws`, adapters, `sync`,
  `detect`, or the manifest.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted input. The token path comes from `client.tokenPath(paths)`
      (env-derived core, already trusted); the check reads + JSON-parses it and
      prints strings. The **load probe** `require`s `googleapis` only from inside
      the containment-guarded `<core>/app/deps` (via `loadGoogleapis`) — the same
      copy, from the same guarded location, that every `gws` command already loads,
      so it introduces no new code-execution surface. The npm command in the warn
      message is the pre-existing pinned `deps.depsDir`/`deps.GOOGLEAPIS_SPEC`
      constant — no user value is interpolated. No value flows into a shell command
      or a mutation.

## Acceptance criteria

- [ ] When Google is connected (valid token) and `googleapis` **loads** from
      `<core>/app/deps`, `doctor` prints one `[ok] Google connected and its client
      library is installed` line and exits 0.
- [ ] When Google is connected but `googleapis` is **absent** (not resolvable),
      `doctor` prints one `[warn] … client library is missing — the next \`wienerdog
      gws\` command will offer to install it …` line and exits 0.
- [ ] When Google is connected but `googleapis` is **resolvable-but-un-loadable**
      (corrupt), `doctor` prints one `[warn] … client library is broken (installed
      but not loadable) — reinstall it: <npm>` line that does **NOT** claim the
      next-command offer, and exits 0. Neither warn suggests `gws auth`.
- [ ] When the token file is present but damaged (zero-byte / malformed JSON /
      missing / wrong-type / whitespace-only `refresh_token`), `doctor` prints one
      `[warn] Google sign-in file looks damaged …` line and never `[ok]`; exit 0.
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
  self-heal, or the printed npm one-liner).
- Surfacing this in the session digest — a separate concern (the digest's
  cache-then-render split), not scoped here.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/103-doctor-gws-deps-probe`; conventional commits; PR titled
   `feat(doctor): flag a connected Google account with a missing client library (WP-103)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Revision log

- **2026-07-13 — Codex round-1 review + owner dispositions.** Applied after the
  implementer had already coded this spec verbatim (PR #104); the deltas below are
  surgical patches to the same branch.
  - **Finding 1 (owner: TARGETED).** The probe now uses a containment-guarded
    **LOAD** probe (`deps.loadGoogleapis` in a `try/catch`) instead of the
    resolve-only `deps.isInstalled`, so a corrupt/partial install that resolves but
    fails to `require` warns (not `[ok]`). Warn wording became "missing **or
    broken**"; a `plantCorruptDeps` fixture (entry point throws on require) was
    added.
  - **Finding 3 (MUST FIX).** The warn message dropped the `wienerdog gws auth`
    suggestion (it cannot fix this without re-opening browser consent), leaving the
    self-heal + the exact npm one-liner — kept consistent with WP-102's message. A
    `!/gws auth/` negative assertion was added to the missing-library test.
  - **Finding 4 (owner: MINIMAL VALIDATION).** The probe now JSON-parses the token
    (read-only) and requires a `refresh_token`; a zero-byte / malformed / incomplete
    token yields a separate `[warn] Google sign-in file looks damaged …` and never
    `[ok]`. Damaged-token fixtures/cases were added. (WP-102's `hasToken` stays
    existence-only by design — the documented asymmetry.)
- **2026-07-13 — Codex round-2 review.** Two correctness deltas on the round-1
  material:
  - **Round-2 Finding 2 (medium).** The single "missing **or** broken" warn falsely
    promised the next `wienerdog gws` command "will offer to install it" for the
    **broken** (resolvable-but-un-loadable) case — WP-102's self-heal no-ops there
    (`isInstalled` true). The probe now splits the two failed-load states via
    `deps.isInstalled`: **absent** (`false`) keeps the self-heal promise; **broken**
    (`true`) gets a distinct message ("broken (installed but not loadable) —
    reinstall it: <npm>") that makes no offer claim. Same npm command repairs both.
    The `plantCorruptDeps` case now asserts the broken message and `!/will offer to
    install/`.
  - **Round-2 Finding 3 (medium).** `refresh_token` validation was truthiness-only,
    so `{"refresh_token":true}` or a whitespace value passed → possible false
    `[ok]`. Tightened to `typeof … === 'string' && .trim() !== ''`; added
    wrong-type and whitespace-only damaged-token fixtures.

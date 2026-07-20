---
id: WP-154
title: Pin Claude/Git/Codex by command path + install dir at sync; verify structurally; spawn absolute; fail safe on drift
status: In-Review
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0009, ADR-0028]
branch: wp/154-executable-identity-pinning
---

# WP-154: Executable identity — pin Claude/Git/Codex, spawn absolute, fail safe on drift (audit A7, part 1 of 6)

## Context (read this, nothing else)

Wienerdog runs a nightly "dream" (memory consolidation) as a short-lived,
scheduled job. That job spawns real external executables — `claude` (the
model brain), `git` (the vault commit), and later `codex` — **by bare name**,
resolved through a clean `PATH` that Wienerdog itself builds. **IRON RULE
(ADR-0004): Wienerdog is just files** — no daemons; a job's children never
outlive it. This WP starts A7 ("scheduler, vendored app, and executable
integrity"), the P1 hardening required before unattended use.

The clean job `PATH` (`src/cli/run-job.js` `buildCleanEnv`) front-loads
`~/.local/bin` **ahead of every system directory** (deliberate — it makes a
native `curl | bash` Claude install authoritative for the subscription auth
ADR-0009 relies on). But `~/.local/bin` is a commonly user/agent-writable
directory, and it is the very dir Wienerdog writes its own shim into. Audit
finding **F4**: an attacker who plants a malicious `claude` or `git` there wins
`PATH` resolution for **every** nightly job — persistent execution as the user,
needing only one file write and no scheduler access.

This WP resolves `claude`/`git`/`codex` at install/sync time and records a
**structural pin** in a code-owned store: the PATH-resolved **command path**
(e.g. `~/.local/bin/claude`) plus the **install dir** — the parent directory of
the command's resolved realpath (e.g. `~/.local/share/claude/versions`). Every
nightly spawn re-resolves the executable live and requires: (a) the command
path is unchanged; (b) the live realpath still resolves into the pinned install
dir; (c) the live target passes structural verification (regular file, exec
bit, correct owner, no group/other-writable ancestor dirs). Only then does it
spawn — using the **live verified absolute realpath**. Any check failing
**fails safe**: the job refuses to spawn and tells the user to re-pin via
`wienerdog sync` after confirming the change is legitimate. `node` itself is
`process.execPath` (already absolute, the running interpreter) and is not pinned.

**No content hash — RESOLVED (OWNER-APPROVED 2026-07-18, A7 walkthrough):
structural pin, not a content/size/exact-realpath gate.**
Claude Code self-updates several times a day by writing a NEW version-named
file and repointing the command symlink (observed live: `~/.local/bin/claude →
~/.local/share/claude/versions/2.1.214`; four version files appeared in three
days). A size/sha256 (or exact-realpath) gate would alarm on every legitimate
auto-update, training the user to ignore or disable the check. The structural
pin stays **silent across auto-updates** (new file, same install dir) while
still refusing the F4 plant (different command path, or a target outside the
pinned install dir). This supersedes the ACTION-LIST A7 wording
("version/hash … legitimate executable updates fail safe and require an
explicit repin") for auto-updating executables; an install-*method* change
(e.g. native → Homebrew, or a versioned Cellar dir move on `brew upgrade`)
still fails safe and requires an explicit `wienerdog sync`.

**Honest boundary (state this; do not overclaim).** Same-user control of BOTH
the core and the OS scheduler can still replace both anchors. A7 protects
**scoped core writes** (e.g. a limited file-write primitive or an agent session
that can write `~/.local/bin` or `~/.wienerdog` but not re-register the OS
scheduler) and **detects drift**; it is **NOT** a claim against arbitrary
same-user native malware — that is A12's territory. This WP's protection holds
because the pin, captured from the legitimate install environment, records the
real executable's command path + install dir; a later-planted fake sits at a
different command path or resolves outside the pinned install dir and is
refused. **In-place substitution** — overwriting the real, user-owned target
file at its unchanged path — is NOT detected (no content hash, see above); an
attacker with that write power could equally rewrite the pin store itself, so a
hash would add alarm noise, not protection. That attacker class is A12's.

> **ADR note:** `ADR-0028` records the A7 architectural decision — a **new ADR**
> (owner-assigned 2026-07-18), distinct from ADR-0027 (A8's re-derived scheduler
> *unload*). The ADR-0028 file is written as the A7 spec walkthrough concludes;
> until then this spec set is the design-of-record.

**SPEC-GAP AMENDMENT (2026-07-18, A7 walkthrough).** This WP's security
checklist mandates that `claude`/`git`/`codex` are spawned by verified absolute
realpath, never bare name — but the original Deliverables covered only
`brain.js`/`validate.js`/`sync.js` and **missed one bare-name spawn**:
`src/core/dream/containment-probe.js` (~L136) falls back to bare `'claude'` for
its pre-dream probe spawn. That is an **F4** surface identical to the one this WP
closes: a fake `claude` earlier on the job PATH wins the probe spawn. This
amendment brings the probe spawn under the pin (Deliverables + wiring +
checklist + acceptance below). **Boundary with WP-155:** this WP replaces **only**
the bare-`'claude'` final fallback with the pinned resolve; it **must not**
remove the `WIENERDOG_CONTAINMENT_PROBE_CMD` env fallback that sits before it —
deleting that env seam is WP-155's job. See Implementation notes → "Probe-spawn
pinning boundary with WP-155".

## Current state

**`src/cli/run-job.js` `buildCleanEnv(paths, name, platform)`** builds the job
child `PATH` as (POSIX) `node-dir : ~/.local/bin : /opt/homebrew/bin :
/usr/local/bin : /usr/bin : /bin : /usr/sbin : /sbin`, i.e. `~/.local/bin`
precedes all system dirs. It passes through only a small env allowlist.

**`src/core/dream/brain.js` `spawnBrain(o)`** (~L142) resolves the brain command
by **bare name**:
```js
} else if (harness === 'codex') {
  command = 'codex';
  ...
} else {
  command = 'claude';
  ...
}
const child = spawn(command, args, { cwd, detached: true, ... , env: childEnv });
```
It also version-probes the real claude with `spawnSync(command, ['--version'], …)`
(~L203) for the run-evidence record. `run-evidence.js` explicitly records the
resolved **path, never a content hash** — "executable integrity is A7's
boundary" (D-EVIDENCE). There is a test seam `WIENERDOG_DREAM_CMD` (the
`fakeCmd` branch) that runs an arbitrary command instead of claude/codex; this
WP leaves that seam in place for **WP-155 to remove** (WP-155 deletes both
test-exec env seams outright), and must not break it in the meantime.

**`src/core/dream/validate.js` `git(vaultDir, args, opts)`** (~L60) spawns git
by bare name: `spawnSync('git', ['-C', vaultDir, ...args], { encoding: 'utf8' })`,
throwing `WienerdogError` on `ENOENT`/non-zero.

**`src/core/dream/containment-probe.js` `runContainmentProbe(paths, opts)`** (~L133)
chooses the probe command at ~L136:
```js
const command = opts.probeCmd || env.WIENERDOG_CONTAINMENT_PROBE_CMD || 'claude';
```
and spawns it (`captureVersion(command, …)` ~L177, `spawn(command, args, …)`
~L179) — a **bare `'claude'`** on the production fallback. `opts.probeCmd` is the
existing unit-test injection seam (`tests/unit/containment-probe.test.js` passes
it on every call). `WIENERDOG_CONTAINMENT_PROBE_CMD` is a test env seam WP-155
removes. The probe promises to **never throw** (file header): the whole spawn is
wrapped in a `try` (~L144) whose `catch` returns an `'inconclusive'` ProbeResult,
and its caller (`dream.js`) fails the dream closed on any non-`pass` outcome.

**`src/cli/sync.js` `run(argv, opts)`** is the compiler pass (also invoked by
`init`). After `vendorSelf` + `writeShim` it does private-mode repair, digest
render, skill staging, and adapter application. It records artifacts in the
install manifest via `recordOnce(manifest, {kind, path})` and saves the manifest
at the end. **This is the natural install/sync hook for pin creation.**

**`src/core/paths.js`** exposes `home`, `core`, `state` (`<core>/state`),
`claudeDir`, `codexDir`. Manifest `file` entries are recorded via
`manifestMod.record`. (WP-144, a separately-Ready A8 WP, adds a per-kind schema +
root-bounded uninstall deletes; a `file` entry needs only `{kind, path}` and
resolves inside `<core>` — the pin store below is in-bounds and needs no manifest
schema change, so **this WP does not depend on WP-144/145** — see Implementation
notes.)

Nothing today resolves, verifies, or pins these executables.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/exec-identity.js | The pin module: resolve → realpath → verify → pin (command path + install dir); load/verify; fail-safe absolute resolve for spawning. |
| modify | src/cli/sync.js | After `vendorSelf`/`writeShim`, call `createPins(paths, {manifest})` (idempotent repin on every sync). Print a one-line notice on unresolved/verify-failed execs. Dry-run makes no writes. |
| modify | src/core/dream/brain.js | Spawn the **verified pinned absolute path** for `claude`/`codex` (not bare name); version-probe the pinned path. Leave the `WIENERDOG_DREAM_CMD` fake branch in place for WP-155 to remove. |
| modify | src/core/dream/validate.js | Spawn the **verified pinned absolute** `git` (not bare `'git'`); fail safe with the repin message on pin drift. |
| modify | src/core/dream/containment-probe.js | Replace **only** the bare `'claude'` final fallback (~L136) with an encapsulated **`spawnPinnedSync('claude', paths, {env, platform, args})`** call ([R13] — never `resolvePinnedSpawn`, which is module-internal), ordered as `opts.probeCmd \|\| env.WIENERDOG_CONTAINMENT_PROBE_CMD \|\| <spawnPinnedSync call>`. Keep the `opts.probeCmd` and `WIENERDOG_CONTAINMENT_PROBE_CMD` terms untouched (WP-155 removes the env one). Move the spawn **inside** the existing `try` so a fail-safe throw becomes an `'inconclusive'` ProbeResult (preserve never-throws). Add `platform` to the `opts` typedef (default `process.platform`). |
| create | tests/unit/exec-identity.test.js | Unit cases for resolve/verify/pin/verifyPin/fail-safe below. |
| modify | tests/unit/dream-brain.test.js | Assert the brain spawns the pinned absolute path and fails safe on drift; the fake seam still works. |
| modify | tests/unit/dream-validate.test.js | Assert git uses the pinned absolute path and fails safe on drift. |
| modify | tests/unit/containment-probe.test.js | Add a case: with a valid pin for a fake `claude` and **no** `opts.probeCmd`, the probe spawns the **pinned absolute path**; a second fake `claude` planted earlier on `PATH` never gets probe-spawned (drift ⇒ the resolve throws ⇒ `'inconclusive'`, never a spawn of the fake). Inject `platform` per the no-mock rule. |
| modify | src/cli/adopt.js | **[R8:#3/R9:#2]** transactional pin preflight at the START of `adopt.run` — dry `createPins({dryRun:true})` resolves+verifies claude **and** git without writing; if either fails, ABORT before adopt's first mutation (no Git snapshot/config/scaffold; prior `exec-pins.json` byte-identical); only if both resolve, atomically commit the complete pin store, then proceed to adoption. See A5. |
| modify | tests/integration/adopt-e2e.test.js | **[R9:#2]** failure test: pre-WP-154 install with claude unresolvable ⇒ `adopt` aborts with vault/config/manifest/prior-pin-store all byte-identical. |
| modify | src/cli/run-job.js | **[R12/R13]** route `captureClaudeVersion` (~L256, called ~L633) through **`spawnPinnedSync('claude', …, ['--version'])`** (never a raw path) — node-shebang ⇒ runs via `process.execPath`; native ⇒ direct; PATH-resolving non-node ⇒ `'unknown'` without executing. Keep the raw claude path ONLY for the `basename==='claude'` label check. `defaultSendAlert` (~L318, `gen.nodePath()`=`process.execPath`) is already safe. |
| create | tests/unit/pinned-exec-canary.test.js | **[R13/R15]** execution-only encapsulation-boundary guard: (a) `exec-identity.js` public exports equal the EXACT path-free, seam-free list `{createPins, loadPins, spawnPinnedSync, spawnPinned, EXEC_PINS_PATH}`; (b) no module outside `exec-identity.js` imports any internal exec-path helper (`resolvePinnedSpawn`/`bindInterpreter`/`resolveExecutable`/`verifyExecutable`/`verifyPin`/`buildPin`/`probeVersion`); (c) no module feeds a `loadPins`/`createPins` pin-state field (`.commandPath`/`.installDir`/`.realpath`) into a `spawn*`/`exec*` call; (d) **no public exec-surface function accepts a spawn/exec callback param** (`spawnPinnedSync`/`spawnPinned`/`createPins` signatures have no `spawnSync`/`spawn`/`exec` option); (e) `spawnPinned*` returns carry no `spawnfile`/`spawnargs`; (f) **[R16] the async facade proxies no raw child event — its `error` payload exposes no `path`/`spawnargs`/`spawnfile`/`syscall`/`cause`** (forced via an invalid `cwd`/ENOENT target). |

### Exact contracts

**Pin store** — `<core>/state/exec-pins.json`, mode **0600**, recorded once as a
`{kind:'file', path}` manifest entry. Shape:
```jsonc
{
  "schema": 1,
  "pins": {
    "claude": {
      "commandPath": "/Users/me/.local/bin/claude",        // first PATH hit at pin time (pre-realpath)
      "installDir": "/Users/me/.local/share/claude/versions", // dirname of the resolved realpath at pin time
      "version": "1.2.3 (Claude Code)",  // probeVersion() output, bounded 200 chars; INFORMATIONAL — never compared
      "pinnedAt": "2026-07-18T…Z"
    },
    "git": { … },
    "codex": { … }                                 // present only if resolvable
  }
}
```

**`src/core/exec-identity.js` — pure/`fs`-only, zero deps, JSDoc types:**

```js
/** Resolve a bare exec name against a PATH, left-to-right, to its realpath.
 *  @param {string} name  'claude' | 'git' | 'codex'
 *  @param {NodeJS.ProcessEnv} env  uses env.PATH (the job clean PATH)
 *  @param {NodeJS.Platform} platform  never mock process.platform — inject it
 *  @returns {{name:string, path:string, realpath:string}|null}  first executable
 *    hit (win32: honor PATHEXT), fs.realpathSync-canonicalized; null if not found. */
function resolveExecutable(name, env, platform) {}

/** Verify a realpath is a safe executable to spawn.
 *  @param {string} realpath  absolute, already realpath-canonical
 *  @param {NodeJS.Platform} platform
 *  @param {{uid?:number}} [ctx]  defaults to process.getuid?.()
 *  @returns {{ok:true}|{ok:false, why:string}}  POSIX checks: (a) regular file;
 *    (b) an execute mode bit is set; (c) owner uid ∈ {current uid, 0}; (d) NO
 *    ancestor dir from the file up to '/' is group- or other-writable unless it
 *    is owned by root (0). win32: (a) regular file only, with a documented
 *    reduced guarantee (no POSIX mode/owner semantics). */
function verifyExecutable(realpath, platform, ctx) {}

/** [R11/R13] THE single interpreter-binding helper — internal (NOT exported);
 *  the ONE source of truth for the four-case contract. Reads the shebang (bounded
 *  512 bytes) and classifies:
 *   - no shebang (native binary) ⇒ {command: realpath, args: []}
 *   - node shebang (`env node` | `env -S node` | `<abs>/node`) ⇒
 *       {command: process.execPath, args: [realpath]}   // never PATH-resolve node
 *   - absolute non-node interpreter (`#!/abs/interp`) ⇒ verifyExecutable(abs), and
 *       [R13] the interpreter must itself be NATIVE — **fail closed if `abs` has
 *       its OWN shebang** (a script interpreter would recursively PATH-resolve its
 *       own `#!/usr/bin/env x`). Then {command: abs, args: [realpath]}, else THROW.
 *       (Equivalent sound alternative: recurse with a strict depth/cycle limit,
 *       refusing any PATH-resolving shebang at any depth. Fail-closed-if-shebang is
 *       simplest.)
 *   - PATH-resolving non-node env shebang (`#!/usr/bin/env <non-node>`) ⇒ THROW
 *       (fail closed — never resolve `<non-node>` through the job PATH)
 *  @returns {{command:string, args:string[]}} @throws {WienerdogError} */
function bindInterpreter(realpath, env, platform) {}

/** [R13/R15/R16] THE ONLY public API to EXECUTE a pinned target. Resolves →
 *  verifies → bindInterpreter → spawns. **SANITIZED-BY-CONSTRUCTION return:** no
 *  raw child, event, or error ever reaches the caller — the realpath never leaves
 *  exec-identity. Returns `{status, signal, stdout:Buffer, stderr:Buffer}` only:
 *  **no `spawnfile`/`spawnargs`**, and on failure `error` is a **freshly
 *  constructed** value with only an approved code/kind (e.g. 'ENOENT'/'spawn-failed')
 *  and a message referring to the exec by its logical `name` — **no `.path`,
 *  `.spawnargs`, `.spawnfile`, `.syscall`, `.cmd`, `.cause`, or path-bearing text.**
 *  @param {string} name 'claude'|'git'|'codex'
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {{args?:string[], env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform,
 *           cwd?:string, timeout?:number, …safeSpawnOpts}} [opts]
 *    **[R15] NO spawn/exec callback param** (real spawn is module-private; a callback
 *    would receive the bound command+args and leak the path). Passthrough opts like
 *    `cwd` are accepted, but a resulting spawn error is sanitized (below) so an
 *    invalid `cwd` cannot surface the realpath. Tests exercise it via marker
 *    executables or a NON-exported factory (never on the public signature).
 *  @returns {{status:number|null, signal:string|null, stdout:Buffer, stderr:Buffer}}
 *    @throws on drift/tamper/unsupported-interpreter (fail closed, no spawn). */
function spawnPinnedSync(name, paths, opts) {}

/** [R13/R15/R16] Async variant (detached/streamed child, e.g. the dream brain).
 *  **SANITIZED-BY-CONSTRUCTION facade — it NEVER forwards a raw Node child object,
 *  native emitter, event, or error.** It returns
 *  `{ stdout, stderr, stdin, pid, kill(signal?), on/once(evt, cb) }` where
 *  `stdout`/`stderr` are byte streams (no path metadata), and `on`/`once` accept
 *  ONLY these **re-emitted, freshly-constructed** events:
 *    - `exit` ⇒ `{ code, signal }`
 *    - `error` ⇒ a NEW `Error` with only an approved code/kind and a message that
 *      names the exec by its logical `name` — **NO `.path`, `.spawnargs`,
 *      `.spawnfile`, `.syscall`, `.cmd`, `.cause`, nested error, or path text.**
 *  The raw `ChildProcess` and its native `error` (whose `.path`/`.spawnargs[0]`
 *  carry the pinned realpath — acute for node-shebang targets) are never returned
 *  or proxied. Same `opts` as `spawnPinnedSync`; **NO spawn/exec callback param**. */
function spawnPinned(name, paths, opts) {}

/** [INTERNAL — not exported] `<exe> --version`, bounded (10s), best-effort. MUST
 *  execute via the internal `bindInterpreter` (node-shebang probe runs
 *  `process.execPath <script> --version`), NEVER `spawnSync(realpath, …)` directly.
 *  A THROW from `bindInterpreter` (unsupported PATH-resolving interpreter)
 *  propagates — not swallowed as 'unknown'. The spawn is module-private; any test
 *  seam here is internal (never on a public signature). @returns {string} 'unknown'
 *  on a benign probe failure. */
function probeVersion(realpath, env, platform) {}

/** [INTERNAL — not exported] Build one pin (resolve+verify+bindInterpreter+probe):
 *  {commandPath, installDir, version, pinnedAt}. Call `bindInterpreter` BEFORE
 *  `probeVersion`; an unsupported PATH-resolving non-node shebang ⇒ THROWS and the
 *  exec is REFUSED (returned as {name, error}) **without ever executing the target**.
 *  @returns {object|{name, error:string}}. */
function buildPin(name, env, platform) {}

/** Resolve+verify+pin claude, git, and (if resolvable) codex; write the 0600 store
 *  and record the manifest file entry (once). Idempotent: same inputs ⇒ same bytes.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, manifest?:object,
 *           dryRun?:boolean}} [opts]
 *    **[R15] NO spawn/exec callback param** (the version probe's spawn is
 *    module-private). @returns {{pins:object, notices:string[]}}  notices:
 *    unresolved/verify-failed execs. */
function createPins(paths, opts) {}

/** Load the pin store. Missing/corrupt ⇒ {}. @returns {object}. */
function loadPins(paths) {}

/** Verify the CURRENT PATH resolution of `name` still matches its pin.
 *  Re-resolves live, then requires: (a) live command path === pin.commandPath;
 *  (b) dirname(live realpath) === pin.installDir (exact string equality);
 *  (c) verifyExecutable(live realpath) passes. `version` is informational and
 *  NEVER compared.
 *  @returns {{ok:true, path:string}|{ok:false, why:string, drift:boolean}}
 *    ok.path is the LIVE verified realpath. drift:true when a pin EXISTS but a
 *    check fails (⇒ caller must fail safe); drift:false when NO pin exists
 *    (first-run/upgrade). */
function verifyPin(name, paths, opts) {}

/** The spawn accessor. Returns the ABSOLUTE path to spawn, or throws.
 *  - Pin exists + verifyPin ok ⇒ return the LIVE verified realpath (never a
 *    stored path — the target moves on every auto-update; the pin authorizes
 *    the LOCATION, the live resolve supplies the file).
 *  - Pin exists but drifted ⇒ THROW WienerdogError (fail safe; message names the
 *    exec, the change, and "run `wienerdog sync` to re-pin after confirming the
 *    update is legitimate").
 *  - No pin (never pinned) ⇒ resolveExecutable + verifyExecutable live; return the
 *    realpath on success, THROW on failure. (Self-heals the pre-first-sync window.)
 *  @returns {string} absolute realpath @throws {WienerdogError} */
function resolvePinnedSpawn(name, paths, env, platform) {}

// [R13/R15] EXECUTION-ONLY ENCAPSULATION. Public exec surface = the EXACT path-free
// list below. spawnPinnedSync/spawnPinned are the only way to EXECUTE a pinned
// target. loadPins/createPins return path-bearing pin state as DATA (for the
// descriptor digest + doctor/status) that is NEVER spawned by a consumer.
// resolvePinnedSpawn, bindInterpreter, resolveExecutable, verifyExecutable,
// verifyPin, buildPin, probeVersion are MODULE-INTERNAL (NOT exported) — they are
// exec-path helpers with no external consumers (verified: only exec-identity uses
// them), so internalizing them removes every way to obtain-then-spawn a raw path.
module.exports = { createPins, loadPins, spawnPinnedSync, spawnPinned, EXEC_PINS_PATH };
```

**Wiring.**
- `sync.js` (non-dry-run, after `vendorSelf`/`writeShim`): `const { createPins } =
  require('../core/exec-identity'); const r = createPins(paths, { manifest });`
  then print each `r.notices` line as `wienerdog: <notice>` (e.g. `git not found
  on the job PATH — nightly commit will fail until it is installed and you re-run
  sync`). Dry-run: report the count only, write nothing.
> **[R13] Call-site rule (encapsulation):** consumer sites call
> **`spawnPinnedSync`/`spawnPinned`** (the only public exec API) — never
> `resolvePinnedSpawn`/`bindInterpreter` (module-internal). The bullets below are
> written to the encapsulated API.
- `brain.js`: replace the `command = 'codex'`/`command = 'claude'` + `spawn(...)`
  with a single `spawnPinned('codex'|'claude', getPaths(baseEnv), { args, cwd,
  detached:true, env: childEnv, platform: o.platform || process.platform })` call
  (async, detached — it never receives a path). A thrown fail-safe error must
  propagate (dream fails loud — the run-job watchdog handles it). The `--version`
  probe uses `spawnPinnedSync('claude'|'codex', getPaths(baseEnv), { args:
  ['--version'], … })`. The `WIENERDOG_DREAM_CMD` fake branch is unchanged here
  (WP-155 removes it) and MUST bypass pinning until WP-155 lands.
- `validate.js` `git(...)`: `spawnPinnedSync('git', getPaths(), { args: ['-C',
  vaultDir, ...args], env: process.env, platform: process.platform })` (never a raw
  path). A thrown fail-safe error is surfaced (same `WienerdogError` path the
  ENOENT hint uses today).
- `containment-probe.js` `runContainmentProbe(paths, opts)`: the probe's `'claude'`
  fallback becomes a **`spawnPinnedSync('claude', paths, { env: opts.env ||
  process.env, platform: opts.platform || process.platform, args })`** call — `paths`
  is the function's first arg. Keep the `opts.probeCmd` and
  `WIENERDOG_CONTAINMENT_PROBE_CMD` terms **ahead** of the pinned call (both stay
  this WP; WP-155 removes the env one). Because `spawnPinnedSync` **throws** on
  drift/unsupported-interpreter and the probe must never throw, move the
  `const command = …`/spawn **inside** the `try` (before `captureVersion`); the
  existing `catch` then maps a drifted/
  unresolvable pin to `{ outcome:'inconclusive', reason:'probe error: …' }`, which
  the caller already treats as fail-closed. The unit tests inject `opts.probeCmd`
  and so never reach the pinned resolve — the new pinned-path case (no `probeCmd`)
  is the only one that exercises it.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only; no build step.
- **No dependency on WP-144/145.** This WP touches none of `manifest.js`, the
  `scheduler-entry` kind, `schedule.js`, or `generators.js`. The pin store is a
  plain `file` manifest entry under `<core>/state` (in-bounds for WP-144's future
  root-bounded uninstall, valid under its `file` schema `{path}`), so no manifest
  code or schema change is needed and no ordering dependency exists.
- `never mock process.platform` — inject `platform` (WP-038/049/051 rule).
- The ancestor-writable walk must stop at `'/'` and treat a root-owned writable
  dir (e.g. `/usr/local/bin` owned by root but group-writable on some Homebrew
  setups) per the exact rule above; record any judgment call under "Decisions
  made".
- **Fail-safe vs self-heal distinction is load-bearing:** a *drifted* pin refuses
  (tamper/legit-update indistinguishable ⇒ require explicit repin); a *missing*
  pin resolves live (benign first-run/upgrade). Do not collapse these.
- `codex` is optional (M4, not yet reachable): unresolvable ⇒ notice + no pin, not
  an error. Only pin it when resolvable.
- **`installDir` is the exact dirname** of the pin-time realpath, compared by
  string equality — no prefix walk, no per-installer special cases. Known
  consequence (pre-made decision): Homebrew keeps binaries in version-named
  Cellar dirs, so a `brew upgrade git` moves `installDir` ⇒ next dream fails
  safe until `wienerdog sync`. Acceptable: brew upgrades are explicit user
  actions (unlike claude's silent multi-daily auto-update, which keeps a stable
  `versions/` dir and passes silently).
- Idempotence: a second `sync` with an unchanged environment rewrites
  `exec-pins.json` to byte-identical content (stable key order; re-use the prior
  `pinnedAt` when commandPath+installDir are unchanged — `version` may advance
  on auto-update without churning `pinnedAt`).
- **Probe-spawn pinning boundary with WP-155.** `containment-probe.js` is edited by
  **both** WPs and they must not collide. **This WP (lands first):** replace ONLY
  the bare `'claude'` final fallback with the encapsulated `spawnPinnedSync(...)`
  call ([R13]); **leave the `WIENERDOG_CONTAINMENT_PROBE_CMD` env fallback in
  place** — it is still the probe test path until WP-155 lands. **WP-155 (lands
  second):** deletes that env term, leaving `opts.probeCmd || <spawnPinnedSync
  call>`. If you find yourself wanting to remove the env seam here, STOP — that is
  out of scope for this WP.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] `claude`, `git`, and (when present) `codex` are spawned by their **verified
      absolute realpath**, never by bare name; a fake earlier on `PATH` cannot win.
      This includes the **containment-probe** `claude` spawn
      (`src/core/dream/containment-probe.js`) — `grep -n "'claude'" src/core/dream/containment-probe.js`
      shows no bare-name spawn fallback (the fallback is the `spawnPinnedSync` call).
- [ ] A live resolution that no longer matches the pinned command path or
      install dir, or whose target fails owner/mode/ancestor-writable
      verification, **stops the spawn pre-flight** with a clear repin message —
      no fallback to the changed binary.
- [ ] The pin store is written **0600**; the resolve/verify path never spawns a
      binary that failed `verifyExecutable`.
- [ ] The `WIENERDOG_DREAM_CMD` fake seam still bypasses pinning for tests and is
      untouched by this WP (its production **removal** is WP-155).

## Acceptance criteria (mapped to the A7 acceptance bullets)

- [ ] **[A7 bullet 4 — "Fake claude/git/codex earlier on PATH never executes."]**
      With a valid pin for the real claude, planting an executable named `claude`
      earlier on the job `PATH` causes `spawnPinnedSync('claude', …)` to
      **throw** (its internal resolve/verify detects drift: live command path ≠
      pinned command path) — the fake never spawns.
- [ ] **[A7 bullet 5, restated per the no-hash decision]** Repointing the
      command symlink to a target OUTSIDE the pinned install dir (e.g.
      `/tmp/evil` — root-owned-sticky `/tmp` passes the ancestor rule, the
      install-dir check refuses it), changing the target's owner, clearing its
      execute bit, or making an ancestor dir group/other-writable each makes
      `spawnPinnedSync` fail before any spawn (its internal `verifyPin`/resolve
      refuses). (In-place byte mutation of the user-owned target is NOT detected —
      honest boundary above.)
- [ ] **[A7 bullet 6, restated per the no-hash decision]** A legitimate
      auto-update that swaps in a new version file under the SAME install dir
      (new realpath, same dirname) passes `verifyPin` **silently** — no
      fail-safe, no repin prompt. An install-method change that MOVES the
      install dir makes the next dream fail safe with the repin message; running
      `sync` re-pins and the next dream succeeds against the new location.
- [ ] **[spec-gap amendment]** The pre-dream containment probe spawns the **pinned
      absolute** `claude`: with a valid pin, a fake `claude` planted earlier on the
      job `PATH` makes `runContainmentProbe` return `'inconclusive'` (the
      `spawnPinnedSync` call throws drift; the never-throws wrapper maps it) — the fake is **never
      probe-spawned**, and the dream fails closed. Covered by a
      `tests/unit/containment-probe.test.js` case (no `opts.probeCmd`).
- [ ] The pin resolve/verify/build logic has coverage **through the public API**
      (`createPins` + `spawnPinnedSync`/`spawnPinned` + `loadPins`) with temp-dir
      fake executables and injected `platform` — the internal `resolveExecutable`/
      `verifyExecutable`/`verifyPin`/`buildPin` are exercised via those entry points
      ([R15]: they are module-internal and the boundary canary forbids importing
      them from a test module).
- [ ] `createPins` is idempotent (second sync ⇒ byte-identical `exec-pins.json`).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "exec-identity|dream-brain|dream-validate|containment-probe"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Removing the `WIENERDOG_RUNJOB_CMD` / `WIENERDOG_DREAM_CMD` / `WIENERDOG_CONTAINMENT_PROBE_CMD`
  test seams and dropping `shell:true` — **WP-155** (depends on this WP; do not
  change the fake branches' activation, and leave the probe's
  `WIENERDOG_CONTAINMENT_PROBE_CMD` env fallback in place — you only replace the
  bare-`'claude'` fallback here).
- The canonical job descriptor, its digest binding, and the out-of-tree launcher —
  **WP-156 / WP-157**.
- Pinning the routine (`skill:`) claude invocation in `routine-runtime.js` — external
  routines are frozen (A0/A1); folded into the routine runtime later. Note it in the PR.
- Any change to `buildCleanEnv`'s `PATH` ordering (ADR-0009 keeps `~/.local/bin`
  first for subscription auth; the pin, not a `PATH` reorder, is the fix).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/154-executable-identity-pinning`; conventional commits; PR titled
   `feat(security): pin claude/git/codex to verified absolute paths + fail safe on drift (WP-154)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.

## Fix-pass amendments (2026-07-19)

Adversarial review (wd-reviewer + Codex) found the In-Review implementation
fails OPEN. These amendments correct the contract. Full implementer contract +
tests: `FIX-PLAN.md` cluster **C1**. No new files — all edits are within the
existing Deliverables.

### A1 — pin store is fail-CLOSED on tamper (was fail-open) [Codex HIGH]

`loadPins` collapsed ENOENT, EACCES, JSON-parse error, and foreign schema all to
`{}`, and `verifyPin`/`resolvePinnedSpawn` treated every one as "no pin ⇒
self-heal via live PATH resolve" — so deleting or corrupting `exec-pins.json`
silently downgraded a pinned install to unpinned. **Corrected contract:**
distinguish three states via an internal `readPinStore(paths)` →
`{state:'ok'|'absent'|'tampered', pins}`:
- ENOENT → `absent`; EACCES/EISDIR/other read error, JSON-parse error, or
  wrong/foreign schema → `tampered`; valid `schema===1` → `ok`.
- `verifyPin`: `tampered` ⇒ `{ok:false, why:'pin store unreadable or corrupt',
  drift:true}` (fail closed). `absent` + no pin for the name ⇒ `drift:false`
  (genuine first-run self-heal). **`ok` (a store EXISTS) + no pin for the
  REQUESTED name ⇒ `{ok:false, drift:true}` (fail closed) — [R2:F1], see A1b.**
- `resolvePinnedSpawn`: `drift:true` (incl. `tampered` **and a present store
  missing the requested pin**) ⇒ **THROW**. `absent` ⇒ the existing live
  self-heal (genuine pre-first-sync **only**).

**A1b — partial store must fail closed; dream binding requires claude AND git
[R2:F1, Codex HIGH].** The first draft let `ok` + no named pin fall to
`drift:false` → live resolve. But `createPins` writes a valid **partial** store
when a command is briefly unresolved at sync (git pinned, claude absent → the
descriptor binds an `exec` map WITHOUT claude), so a later-planted
`~/.local/bin/claude` **digest-matches** (nothing to drift) and the no-pin path
live-resolves the plant — the bare-PATH bypass survives without touching the
store. **Corrected:** (i) once a store exists, a missing pin for the **requested**
command is drift ⇒ THROW (live self-heal only when the whole store is `absent`);
(ii) `buildDescriptor`/the sync bind step for `builtin:dream` **requires both
`claude` and `git` pins present** — a non-empty `exec` map is not sufficient; if
either is missing, refuse to bind/register the dream job (surface a hard notice)
rather than binding a bypassing partial. `codex` stays optional until a codex job
is authorized. Test: a partial store (git only) makes `spawnPinnedSync('claude', …)`
throw (never live-resolve a plant), and one sync with claude unresolved does not
bind a partial dream descriptor.
- `loadPins(paths)` (used by `descriptor.buildDescriptor`) keeps returning
  `.pins` (tampered ⇒ `{}` ⇒ empty `exec` ⇒ launcher digest mismatch — fail
  closed on the scheduled path).

**Honest boundary (state in Context; do not overclaim).** An in-scope attacker
can still *delete* the store (→ `absent` → self-heal on the **attended** manual
path). Deletion-after-sync is caught on the **unattended** path by the
descriptor digest **bound into the OS entry** (the pins are folded into that
digest; a deleted store ⇒ empty `exec` ⇒ re-derived digest ≠ bound digest ⇒
WP-157 refuses) — provided `exec` was non-empty at bind time (the WP-156 ordering
fix) and the launcher path is not bypassed (the WP-157 dev/catch-up fixes).
`resolvePinnedSpawn`'s `absent`→self-heal therefore remains only for genuine
first-run and attended dream; it is backstopped on the scheduled path by the
launcher. Do **not** claim `resolvePinnedSpawn` alone closes deletion.

### A2 — verify the interpreter, not just the script [Codex HIGH]

`verifyExecutable` performs no shebang handling, and `resolvePinnedSpawn`
returned a bare realpath string that callers `spawn`ed directly. A pinned node
script (`#!/usr/bin/env node` — the confirmed shape of `claude`/`codex`) makes
the kernel re-resolve `node` via `env` from the job PATH; a planted `node`/`env`
earlier on PATH runs (the front-loaded node-dir masks this only incidentally, and
not on the interactive path). **Corrected contract** (this classification is the
`bindInterpreter` helper; **[R13]** `bindInterpreter` and `resolvePinnedSpawn` are
now module-INTERNAL and callers invoke `spawnPinnedSync`/`spawnPinned` — see the
terminal-design amendment below). The internal spawn spec is `{command:string,
args:string[]}`:
- native binary (no shebang, e.g. `git`) ⇒ `{command: realpath, args:[]}`;
- node shebang (`env node`, `env -S node …`, `<abs>/node`) ⇒
  `{command: process.execPath, args:[realpath]}` — the verified, absolute,
  already-running node; no PATH interpreter resolution;
- absolute non-node interpreter (`#!/abs/interp`) ⇒ `verifyExecutable(abs)` **and
  [R13] require `abs` to be NATIVE — fail closed if it has its own shebang** (a
  script interpreter would recursively PATH-resolve its own `#!/usr/bin/env x`);
  then `{command: abs, args:[realpath]}`; unverified/has-shebang ⇒ THROW;
- **[R10] PATH-resolving non-node env shebang (`#!/usr/bin/env <non-node>`) ⇒
  THROW / fail closed.** Do **NOT** resolve the interpreter through the job PATH.
  Rationale (safe-direction tie-break): the job PATH front-loads attacker-writable
  `~/.local/bin`, and `verifyExecutable` passes any current-user-owned executable
  in a non-group-writable dir — so "resolve the interpreter through the job PATH +
  structural verify" (the earlier clause) re-introduces the **static** F4 PATH
  hijack (a statically planted fake `<non-node>` there is executed by the scheduled
  job — no scheduler mutation, no concurrent writer, no A12). claude/codex are
  node and git is native, so this branch is **not exercised today**; failing closed
  costs nothing now and removes the hijack surface if an upstream wrapper ever
  changes to a PATH-resolving non-node interpreter. Message: "the pinned executable
  uses an unsupported PATH-resolving interpreter — investigate or re-pin."
**[R11→R13] TERMINAL DESIGN — encapsulate pinned execution so no caller ever holds
a raw path.** Round 10 gated only fire; R11/R12 chased pin-creation +
`captureClaudeVersion` by enumeration; a static scan still can't cover future
modules or evasions (`const run = spawnSync; run(rawPath)`, `cp.spawnSync`
property calls, a pinned spawn from a module outside a fixed list). The sound
closure is **encapsulation, not enumeration**:

- **`spawnPinnedSync(name, paths, opts)`** (and async `spawnPinned`) is the **ONLY
  public API** to EXECUTE a pinned target. It internally resolves → verifies →
  `bindInterpreter` → spawns. **[R15] Its RETURN must not leak a spawnable path:**
  the sync form returns `{status, signal, stdout, stderr}` (no `spawnfile`/
  `spawnargs`; path-bearing error text sanitized to the exec `name`), and
  `spawnPinned` returns a **restricted child facade** (`stdout`/`stderr`/`stdin`/
  `pid`/`on`/`once`/`kill` — NOT `spawnfile`/`spawnargs`). A raw `ChildProcess`
  would expose the realpath via `spawnfile`/`spawnargs`, so it is never returned.
- **[R15] The exec-path helpers are module-INTERNAL (not exported):**
  `resolvePinnedSpawn`, `bindInterpreter`, `resolveExecutable`, `verifyExecutable`,
  `verifyPin`, `buildPin`, `probeVersion` — verified to have **no external
  importers** (only `exec-identity.js` uses them). `loadPins`/`createPins` stay
  exported because they return pin state as **DATA** the descriptor digest +
  doctor/status legitimately consume — never spawned.
- **[R15] Honest invariant — EXECUTION-only encapsulation** (not "no function
  returns a path"): *a pinned target is EXECUTED only via `spawnPinned*`.*
  `loadPins` returns path-bearing data as authorization/status DATA that no
  consumer feeds into a spawn.
- **All five pinned-exec sites call `spawnPinnedSync`/`spawnPinned`:** the brain
  `claude`/`codex` (async `spawnPinned` — detached), the vault-commit `git`
  (`spawnPinnedSync`), the containment-probe `claude`, `run-job.js`
  `captureClaudeVersion` (the run-evidence `--version`; it keeps the raw path only
  for its `basename==='claude'` label check but EXECUTES via `spawnPinnedSync`),
  and `buildPin`/`probeVersion` at pin creation (`createPins`, its `dryRun`, adopt
  preflight). The **launcher** spawns `process.execPath`+run-job (not a pinned
  external) — unchanged. `gen.nodePath()`=`process.execPath`, so
  `defaultSendAlert` (~run-job.js:318) is already safe.
- **[R13] Recursive interpreter hijack closed:** the absolute-non-node-interpreter
  branch of `bindInterpreter` must require the interpreter to be **NATIVE — fail
  closed if `abs` has its OWN shebang** (else spawning `/trusted/interp` that is
  itself `#!/usr/bin/env x` recursively PATH-resolves `x`, running a planted
  `~/.local/bin/x`; the old canary stayed green because the command WAS a
  `bindInterpreter` result). (Sound alternative: recurse with a strict depth/cycle
  limit, refusing any PATH-resolving shebang at any depth.)

Add `readShebang(realpath)` (bounded 512-byte first-line read) as the helper's
input.

**[R15] Canary — the SOUND, execution-only boundary guard** (defense-in-depth, not
a whole-codebase execution scan). `tests/unit/pinned-exec-canary.test.js` asserts:
(a) `exec-identity.js`'s public exports equal the **EXACT path-free list**
`{createPins, loadPins, spawnPinnedSync, spawnPinned, EXEC_PINS_PATH}` (the
exec-path helpers are not exported); (b) **no module outside `exec-identity.js`
imports** any internal exec-path helper (`resolvePinnedSpawn`, `bindInterpreter`,
`resolveExecutable`, `verifyExecutable`, `verifyPin`, `buildPin`, `probeVersion`);
(c) **no module feeds a `loadPins`/`createPins` pin-state return (`.commandPath`/
`.installDir`/`.realpath`) into a `spawn*`/`exec*` call** — pin state is data, never
a spawn argument; (d) **[R15] no public exec-surface function accepts a spawn/exec
callback param** — `spawnPinnedSync`/`spawnPinned`/`createPins` signatures carry no
`spawnSync`/`spawn`/`exec` option (an injected callback would receive the bound
command+args and leak the path; this is the WP-155 "test seam in the public API"
class — the real spawn stays module-private, tests use marker executables or a
non-exported factory); (e) `spawnPinned*` returns carry no `spawnfile`/`spawnargs`;
(f) **[R16] the async facade proxies no raw child event and its `error` payload
exposes no `path`/`spawnargs`/`spawnfile`/`syscall`/`cause`** (nor path-bearing
message text) — SANITIZED-BY-CONSTRUCTION (see the facade contract above). No raw
child, event, or error — sync or async — reaches a caller; a pinned target's
realpath never leaves `exec-identity.js`. The guarantee is **execution-only
encapsulation**: a pinned
target is executed only through `spawnPinned*`, whose returns don't leak a
spawnable path. The canary does NOT claim "no function ever returns a path"
(`loadPins` legitimately does, as data).

### A3 — sync ordering: pins before descriptors [wd P1, shared with WP-156]

`src/cli/sync.js` calls `repointSchedules` (which writes + digest-binds
descriptors, reading pins via `loadPins`) **before** `createPins`, so the first
descriptor on a fresh install binds `exec:{}` and drifts once pins land.
**Corrected contract:** in `sync.run`, move the WP-154 `createPins(paths, {…,
manifest})` call **above** `repointSchedules`. (`sync.js` is this WP's file; the
*reason* is WP-156's descriptor — recorded in both. See WP-156 amendment for the
real-sync exec test.)

### A4 — manual-dream PATH provenance [wd P2]

`validate.js`/`containment-probe.js`/`brain.js` resolve on `process.env.PATH`;
attended `wienerdog dream` uses the interactive PATH → false drift + an
unbreakable refuse loop. **Corrected contract (minimal):** on the attended dream
path, resolve pins against a clean job PATH derived like pinning does
(`buildCleanEnv(paths,'dream').PATH`, threaded as the `env` arg). Do not change
`buildCleanEnv` ordering (ADR-0009). If more than a few lines, downgrade to a
documented residual and record it in the PR.

### A5 — adopt needs a TRANSACTIONAL pin preflight [Codex HIGH, R8:#3 → R9:#2]

`src/cli/adopt.js` (`adopt.js:370`) calls `ensureDreamSchedule` but runs **no**
`createPins` and does not call `sync`, so a legacy/pre-WP-154 install (config.yaml
but no `exec-pins.json`) reaches descriptor binding with **no pins** — violating
A1b's "dream binding requires claude+git pins."

**[R9:#2] The naive "createPins then register" is non-transactional:** `createPins`
**writes** `exec-pins.json` (and can write a valid **partial** store) before
returning, and adopt mutates the Git repo/config/scaffold **before**
`ensureDreamSchedule` — so a create-then-validate ordering can overwrite a good
store, leave a partial one, or half-adopt. **Corrected contract — a transactional
preflight at the very START of `adopt.run`, before adopt's first mutation:**
1. **Dry preflight (no writes):** `createPins(paths, {dryRun:true, …})` resolves +
   `verifyExecutable`s each name and returns what it *would* pin without touching
   disk; require BOTH `claude` AND `git` to resolve+verify (codex optional).
2. **Abort-before-mutate:** if either fails, ABORT **before** adopt's first
   mutation — no Git snapshot, no config, no scaffold — leaving vault/config/
   manifest and any prior `exec-pins.json` **byte-identical** (fail-closed, never
   half-adopt).
3. **Atomic commit:** only if both resolve, **atomically** write the complete pin
   store (temp+rename; never a partial), THEN proceed with adoption +
   `ensureDreamSchedule`.
Place this at the top of `adopt.run`, before the Git/snapshot mutation — NOT near
`ensureDreamSchedule`. **Deliverables:** `src/cli/adopt.js` (added to the table
above) for the pin preflight/commit (this WP owns `createPins`); the descriptor/
map binding on the same file is WP-catchup-per-job-authorization's (serialized: WP-154 preflight first,
WP-catchup-per-job-authorization mint after). This requires `createPins` to support a **`dryRun`** that
resolves+verifies per name without writing — extend its `opts` (already typed
`{dryRun?:boolean}` in the exec-identity contract). **Test:** pre-WP-154 install,
claude unresolvable ⇒ adopt aborts with vault/config/manifest/prior-pin-store all
byte-identical; both resolvable ⇒ complete store committed atomically, then a
valid descriptor binds.

### Deliverables / acceptance additions
- **[R8:#3]** Add `src/cli/adopt.js` (pin bootstrap before register) — see A5.
- Acceptance: add — a corrupt/unreadable/foreign `exec-pins.json` makes
  `spawnPinnedSync` **throw** (never live-resolve); a node-shebang pin spawns
  via `process.execPath` and a planted `node` earlier on PATH is irrelevant; each
  proven by a unit test that fails if the fix is reverted.
- **[R10] Acceptance:** a pinned executable with a **non-node
  `#!/usr/bin/env <x>`** shebang, with a fake `<x>` planted FIRST on the job PATH,
  makes `spawnPinnedSync` **THROW** — the plant is **never** executed. Mutation:
  revert this branch to "resolve `<x>` through the job PATH + structural verify" ⇒
  the plant runs ⇒ the test fails. (`exec-identity.test.js`; the harness — WP-158 —
  mirrors it as an end-to-end negative.)
- **[R11] Acceptance — pin-creation exec sites too:** with the same non-node
  `#!/usr/bin/env <x>` pin + a fake `<x>` planted FIRST on the job PATH, each of
  (a) `createPins`, (b) `createPins({dryRun:true})`, and (c) adopt's preflight
  records **ZERO executions** of the plant (spy / marker-file assertion) and
  **refuses** that exec (unsupported-interpreter notice/failure), never a partial
  that already ran it. The node-shebang probe executes `process.execPath <script>
  --version` (never the raw realpath). Mutation: revert **any** exec site to a
  direct `spawnSync(realpath)` ⇒ the plant executes ⇒ the zero-execution assertion
  fails. Keep the R10 `spawnPinnedSync` regression.
- **[R12→R13] Acceptance — `captureClaudeVersion` + the encapsulation-boundary
  canary:** (a) `captureClaudeVersion` (now via `spawnPinnedSync('claude', …,
  ['--version'])`) with a node-shebang claude + a fake `node` planted FIRST on the
  job PATH runs `process.execPath <script> --version` — the planted `node` records
  ZERO executions; a non-node PATH-resolving claude ⇒ returns `'unknown'` without
  executing. (b) The **[R15] execution-only boundary canary**
  (`tests/unit/pinned-exec-canary.test.js`): (i) `exec-identity.js` public exports
  equal the EXACT path-free list `{createPins, loadPins, spawnPinnedSync,
  spawnPinned, EXEC_PINS_PATH}`; (ii) no module outside `exec-identity.js` imports
  any internal exec-path helper; (iii) no module feeds a `loadPins`/`createPins`
  pin-state field into a `spawn*`/`exec*`; (iv) **no public exec-surface function
  accepts a spawn/exec callback param** (`spawnPinnedSync`/`spawnPinned`/`createPins`
  have no `spawnSync`/`spawn`/`exec` option). (c) **[R15] no path leak in the exec
  return:** `spawnPinnedSync`'s return has no `spawnfile`/`spawnargs` (and any
  path-bearing error text is sanitized to the exec `name`); `spawnPinned` returns
  the restricted facade (no `spawnfile`/`spawnargs`). (d) **[R16] facade
  error-channel regression:** force a spawn failure (invalid `cwd` and/or an ENOENT
  target) on `spawnPinned` ⇒ the emitted `error` event payload contains **NO**
  bound command/args/path — no `.path`/`.spawnargs`/`.spawnfile`/`.syscall`/`.cause`
  and no path-bearing message text — only the logical `name` + a generic code.
  **Mutation:** revert `captureClaudeVersion` to a raw `spawnSync(rawResolvedPath,
  …)` ⇒ its planted-node zero-execution test fails; export an internal exec-path
  helper, import one externally, add a `spawnSync` param to a public signature,
  return a raw `ChildProcess`/`spawnfile`, or **proxy the raw child `error`** ⇒ the
  boundary/leak/facade-error canary fails.

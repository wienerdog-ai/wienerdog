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
| modify | src/core/dream/containment-probe.js | Replace **only** the bare `'claude'` final fallback (~L136) with the pinned absolute resolve: `opts.probeCmd \|\| env.WIENERDOG_CONTAINMENT_PROBE_CMD \|\| resolvePinnedSpawn('claude', paths, env, opts.platform \|\| process.platform)`. Keep the `opts.probeCmd` and `WIENERDOG_CONTAINMENT_PROBE_CMD` terms untouched (WP-155 removes the env one). Move the `const command = …` resolution **inside** the existing `try` so a fail-safe throw becomes an `'inconclusive'` ProbeResult (preserve never-throws). Add `platform` to the `opts` typedef (default `process.platform`). |
| create | tests/unit/exec-identity.test.js | Unit cases for resolve/verify/pin/verifyPin/fail-safe below. |
| modify | tests/unit/dream-brain.test.js | Assert the brain spawns the pinned absolute path and fails safe on drift; the fake seam still works. |
| modify | tests/unit/dream-validate.test.js | Assert git uses the pinned absolute path and fails safe on drift. |
| modify | tests/unit/containment-probe.test.js | Add a case: with a valid pin for a fake `claude` and **no** `opts.probeCmd`, the probe spawns the **pinned absolute path**; a second fake `claude` planted earlier on `PATH` never gets probe-spawned (drift ⇒ the resolve throws ⇒ `'inconclusive'`, never a spawn of the fake). Inject `platform` per the no-mock rule. |

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

/** `<exe> --version`, bounded (10s), best-effort. @returns {string} 'unknown' on any failure. */
function probeVersion(realpath, env, spawnSyncFn) {}

/** Build one pin (resolve+verify+probe): {commandPath, installDir, version,
 *  pinnedAt} where commandPath = resolveExecutable().path and installDir =
 *  dirname(resolveExecutable().realpath). @returns {object|{name, error:string}}. */
function buildPin(name, env, platform, seams) {}

/** Resolve+verify+pin claude, git, and (if resolvable) codex; write the 0600 store
 *  and record the manifest file entry (once). Idempotent: same inputs ⇒ same bytes.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, manifest?:object,
 *           dryRun?:boolean, spawnSync?:Function}} [opts]
 *  @returns {{pins:object, notices:string[]}}  notices: unresolved/verify-failed execs. */
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

module.exports = { resolveExecutable, verifyExecutable, probeVersion,
  buildPin, createPins, loadPins, verifyPin, resolvePinnedSpawn, EXEC_PINS_PATH };
```

**Wiring.**
- `sync.js` (non-dry-run, after `vendorSelf`/`writeShim`): `const { createPins } =
  require('../core/exec-identity'); const r = createPins(paths, { manifest });`
  then print each `r.notices` line as `wienerdog: <notice>` (e.g. `git not found
  on the job PATH — nightly commit will fail until it is installed and you re-run
  sync`). Dry-run: report the count only, write nothing.
- `brain.js`: replace `command = 'codex'` / `command = 'claude'` with
  `command = resolvePinnedSpawn('codex'|'claude', getPaths(baseEnv), baseEnv,
  o.platform || process.platform)`. A thrown fail-safe error must propagate
  (dream fails loud — the existing run-job watchdog/fail-loud handles it). The
  `--version` probe uses the same `command`. The `WIENERDOG_DREAM_CMD` fake
  branch (`fakeCmd`) is unchanged here (WP-155 removes it) and MUST bypass pinning
  until WP-155 lands.
- `validate.js` `git(...)`: resolve once via `resolvePinnedSpawn('git',
  getPaths(), process.env, process.platform)` and spawn that absolute path
  (`spawnSync(gitPath, ['-C', vaultDir, ...args], …)`). A thrown fail-safe error
  is surfaced (same `WienerdogError` path the ENOENT hint uses today).
- `containment-probe.js` `runContainmentProbe(paths, opts)`: the probe's `'claude'`
  fallback becomes `resolvePinnedSpawn('claude', paths, env, opts.platform ||
  process.platform)` — `paths` is the function's first arg, `env` is
  `opts.env || process.env`. Keep the `opts.probeCmd` and
  `WIENERDOG_CONTAINMENT_PROBE_CMD` terms **ahead** of the pinned resolve (both stay
  this WP; WP-155 removes the env one). Because `resolvePinnedSpawn` **throws** on
  drift and the probe must never throw, move the `const command = …` line **inside**
  the `try` (before `captureVersion`); the existing `catch` then maps a drifted/
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
  the bare `'claude'` final fallback with `resolvePinnedSpawn(...)`; **leave the
  `WIENERDOG_CONTAINMENT_PROBE_CMD` env fallback in place** — it is still the probe
  test path until WP-155 lands. **WP-155 (lands second):** deletes that env term,
  leaving `opts.probeCmd || resolvePinnedSpawn(...)`. If you find yourself wanting
  to remove the env seam here, STOP — that is out of scope for this WP.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] `claude`, `git`, and (when present) `codex` are spawned by their **verified
      absolute realpath**, never by bare name; a fake earlier on `PATH` cannot win.
      This includes the **containment-probe** `claude` spawn
      (`src/core/dream/containment-probe.js`) — `grep -n "'claude'" src/core/dream/containment-probe.js`
      shows no bare-name spawn fallback (the fallback is `resolvePinnedSpawn`).
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
      earlier on the job `PATH` causes `resolvePinnedSpawn('claude', …)` to
      **throw** (drift: live command path ≠ pinned command path) — the fake never
      spawns.
- [ ] **[A7 bullet 5, restated per the no-hash decision]** Repointing the
      command symlink to a target OUTSIDE the pinned install dir (e.g.
      `/tmp/evil` — root-owned-sticky `/tmp` passes the ancestor rule, the
      install-dir check refuses it), changing the target's owner, clearing its
      execute bit, or making an ancestor dir group/other-writable each makes
      `verifyPin`/`resolvePinnedSpawn` fail before any spawn. (In-place byte
      mutation of the user-owned target is NOT detected — honest boundary above.)
- [ ] **[A7 bullet 6, restated per the no-hash decision]** A legitimate
      auto-update that swaps in a new version file under the SAME install dir
      (new realpath, same dirname) passes `verifyPin` **silently** — no
      fail-safe, no repin prompt. An install-method change that MOVES the
      install dir makes the next dream fail safe with the repin message; running
      `sync` re-pins and the next dream succeeds against the new location.
- [ ] **[spec-gap amendment]** The pre-dream containment probe spawns the **pinned
      absolute** `claude`: with a valid pin, a fake `claude` planted earlier on the
      job `PATH` makes `runContainmentProbe` return `'inconclusive'` (the pinned
      resolve throws drift; the never-throws wrapper maps it) — the fake is **never
      probe-spawned**, and the dream fails closed. Covered by a
      `tests/unit/containment-probe.test.js` case (no `opts.probeCmd`).
- [ ] `resolveExecutable`/`verifyExecutable`/`createPins`/`verifyPin`
      have direct unit coverage (temp-dir fake executables; injected `platform`).
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

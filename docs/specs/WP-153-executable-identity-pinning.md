---
id: WP-153
title: Resolve, verify, and pin Claude/Git/Codex to absolute realpaths at sync; spawn absolute; fail safe on drift
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0009, ADR-0028]
branch: wp/153-executable-identity-pinning
---

# WP-153: Executable identity — pin Claude/Git/Codex, spawn absolute, fail safe on drift (audit A7, part 1 of 6)

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

This WP resolves `claude`/`git`/`codex` to **absolute realpaths** at
install/sync time, verifies each is a regular, correctly-owned, non-writable-
ancestor executable, records a **pin** (realpath + version + size + content
hash) in a code-owned store, and makes every nightly spawn use the **verified
absolute path**. A pinned executable that later changes (moved, replaced,
mutated) **fails safe** — the job refuses to spawn and tells the user to re-pin
via `wienerdog sync` after confirming the update is legitimate. `node` itself is
`process.execPath` (already absolute, the running interpreter) and is not pinned.

**Honest boundary (state this; do not overclaim).** Same-user control of BOTH
the core and the OS scheduler can still replace both anchors. A7 protects
**scoped core writes** (e.g. a limited file-write primitive or an agent session
that can write `~/.local/bin` or `~/.wienerdog` but not re-register the OS
scheduler) and **detects drift**; it is **NOT** a claim against arbitrary
same-user native malware — that is A12's territory. This WP's protection holds
because the pin, captured from the legitimate install environment, records the
real executable's realpath+hash; a later-planted fake has a different
realpath/hash and is refused.

> **ADR note:** `ADR-0028` records the A7 architectural decision — a **new ADR**
> (owner-assigned 2026-07-18), distinct from ADR-0027 (A8's re-derived scheduler
> *unload*). The ADR-0028 file is written as the A7 spec walkthrough concludes;
> until then this spec set is the design-of-record.

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
WP leaves that seam's *gating* to WP-154 but must not break it.

**`src/core/dream/validate.js` `git(vaultDir, args, opts)`** (~L60) spawns git
by bare name: `spawnSync('git', ['-C', vaultDir, ...args], { encoding: 'utf8' })`,
throwing `WienerdogError` on `ENOENT`/non-zero.

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

Nothing today resolves, verifies, hashes, or pins these executables.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/exec-identity.js | The pin module: resolve → realpath → verify → hash → pin; load/verify; fail-safe absolute resolve for spawning. |
| modify | src/cli/sync.js | After `vendorSelf`/`writeShim`, call `createPins(paths, {manifest})` (idempotent repin on every sync). Print a one-line notice on unresolved/verify-failed execs. Dry-run makes no writes. |
| modify | src/core/dream/brain.js | Spawn the **verified pinned absolute path** for `claude`/`codex` (not bare name); version-probe the pinned path. Leave the `WIENERDOG_DREAM_CMD` fake branch behavior for WP-154. |
| modify | src/core/dream/validate.js | Spawn the **verified pinned absolute** `git` (not bare `'git'`); fail safe with the repin message on pin drift. |
| create | tests/unit/exec-identity.test.js | Unit cases for resolve/verify/hash/pin/verifyPin/fail-safe below. |
| modify | tests/unit/dream-brain.test.js | Assert the brain spawns the pinned absolute path and fails safe on drift; the fake seam still works. |
| modify | tests/unit/dream-validate.test.js | Assert git uses the pinned absolute path and fails safe on drift. |

### Exact contracts

**Pin store** — `<core>/state/exec-pins.json`, mode **0600**, recorded once as a
`{kind:'file', path}` manifest entry. Shape:
```jsonc
{
  "schema": 1,
  "pins": {
    "claude": {
      "realpath": "/opt/homebrew/bin/claude",   // absolute, fs.realpathSync-canonical
      "version": "1.2.3 (Claude Code)",           // probeVersion() output, bounded 200 chars
      "sizeBytes": 481234,
      "sha256": "…",                              // or null when file > cap (see hashFile)
      "hashReason": "size-cap",                    // present only when sha256 is null
      "mode": 493,                                  // fs.Stats.mode (decimal); informational
      "owner": 501,                                 // POSIX uid; -1 on win32
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

/** sha256 of the file bytes, capped. @param {string} realpath @param {number} [capBytes=67108864]
 *  @returns {{sha256:string}|{sha256:null, reason:string}}  reason 'size-cap' | 'read-error'. */
function hashFile(realpath, capBytes) {}

/** Build one pin (resolve+verify+probe+hash). @returns {object|{name, error:string}}. */
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

/** Verify the CURRENT on-disk exec still matches its pin.
 *  @returns {{ok:true, path:string}|{ok:false, why:string, drift:boolean}}
 *    drift:true when a pin EXISTS but the live realpath/size/sha256/verify differs
 *    (⇒ caller must fail safe); drift:false when NO pin exists (first-run/upgrade). */
function verifyPin(name, paths, opts) {}

/** The spawn accessor. Returns the ABSOLUTE path to spawn, or throws.
 *  - Pin exists + verifies ⇒ return pin.realpath.
 *  - Pin exists but drifted ⇒ THROW WienerdogError (fail safe; message names the
 *    exec, the change, and "run `wienerdog sync` to re-pin after confirming the
 *    update is legitimate").
 *  - No pin (never pinned) ⇒ resolveExecutable + verifyExecutable live; return the
 *    realpath on success, THROW on failure. (Self-heals the pre-first-sync window.)
 *  @returns {string} absolute realpath @throws {WienerdogError} */
function resolvePinnedSpawn(name, paths, env, platform) {}

module.exports = { resolveExecutable, verifyExecutable, probeVersion, hashFile,
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
  branch (`fakeCmd`) is unchanged here (WP-154 gates it) and MUST bypass pinning.
- `validate.js` `git(...)`: resolve once via `resolvePinnedSpawn('git',
  getPaths(), process.env, process.platform)` and spawn that absolute path
  (`spawnSync(gitPath, ['-C', vaultDir, ...args], …)`). A thrown fail-safe error
  is surfaced (same `WienerdogError` path the ENOENT hint uses today).

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
- Idempotence: a second `sync` with an unchanged environment rewrites
  `exec-pins.json` to byte-identical content (stable key order, stable `pinnedAt`
  only when a pin's identity actually changed — re-use the prior `pinnedAt` when
  realpath+size+sha256+version are unchanged, so the file does not churn).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] `claude`, `git`, and (when present) `codex` are spawned by their **verified
      absolute realpath**, never by bare name; a fake earlier on `PATH` cannot win.
- [ ] A pin that no longer matches the live realpath/size/sha256, or whose
      executable fails owner/mode/ancestor-writable verification, **stops the spawn
      pre-flight** with a clear repin message — no fallback to the changed binary.
- [ ] The pin store is written **0600**; the resolve/verify path never spawns a
      binary that failed `verifyExecutable`.
- [ ] The `WIENERDOG_DREAM_CMD` fake seam still bypasses pinning for tests and is
      untouched by this WP (its production inertness is WP-154).

## Acceptance criteria (mapped to the A7 acceptance bullets)

- [ ] **[A7 bullet 4 — "Fake claude/git/codex earlier on PATH never executes."]**
      With a valid pin for the real claude, planting an executable named `claude`
      earlier on the job `PATH` causes `resolvePinnedSpawn('claude', …)` to
      **throw** (drift: re-resolved realpath ≠ pinned realpath) — the fake never
      spawns.
- [ ] **[A7 bullet 5 — "Pinned executable mutation/owner/mode/ancestor failure
      stops pre-spawn."]** Mutating the pinned file's bytes (sha256/size change),
      changing its owner, clearing its execute bit, or making an ancestor dir
      group/other-writable each makes `verifyPin`/`resolvePinnedSpawn` fail before
      any spawn.
- [ ] **[A7 bullet 6 — executable-update half]** A legitimate update that changes
      the pinned binary makes the next dream **fail safe** (clear "run `wienerdog
      sync` to re-pin" message); running `sync` re-pins and the next dream
      succeeds against the new verified path.
- [ ] `resolveExecutable`/`verifyExecutable`/`hashFile`/`createPins`/`verifyPin`
      have direct unit coverage (temp-dir fake executables; injected `platform`).
- [ ] `createPins` is idempotent (second sync ⇒ byte-identical `exec-pins.json`).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "exec-identity|dream-brain|dream-validate"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Gating the `WIENERDOG_RUNJOB_CMD` / `WIENERDOG_DREAM_CMD` test seams and dropping
  `shell:true` — **WP-154** (depends on this WP; do not change the fake branches'
  activation here).
- The canonical job descriptor, its digest binding, and the out-of-tree launcher —
  **WP-155 / WP-156**.
- Pinning the routine (`skill:`) claude invocation in `routine-runtime.js` — external
  routines are frozen (A0/A1); folded into the routine runtime later. Note it in the PR.
- Any change to `buildCleanEnv`'s `PATH` ordering (ADR-0009 keeps `~/.local/bin`
  first for subscription auth; the pin, not a `PATH` reorder, is the fix).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/153-executable-identity-pinning`; conventional commits; PR titled
   `feat(security): pin claude/git/codex to verified absolute paths + fail safe on drift (WP-153)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.

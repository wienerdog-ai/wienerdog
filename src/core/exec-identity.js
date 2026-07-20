'use strict';

/**
 * Executable identity pinning (audit A7 finding F4, ADR-0028, WP-154).
 *
 * The nightly job PATH front-loads ~/.local/bin (deliberate — ADR-0009), a
 * user/agent-writable dir; a malicious `claude`/`git` planted there would win
 * bare-name resolution for every job. This module records a STRUCTURAL pin at
 * install/sync time — the PATH-resolved command path plus the install dir
 * (dirname of the resolved realpath) — and every spawn re-resolves live,
 * requiring the command path and install dir to be unchanged and the live
 * target to pass structural verification. The spawn then uses the LIVE
 * verified absolute realpath — never a bare name, never a stored path (the
 * target moves on every Claude auto-update; the pin authorizes the LOCATION,
 * the live resolve supplies the file).
 *
 * Deliberately NO content hash (OWNER-APPROVED 2026-07-18): Claude self-updates
 * several times a day by writing a new version file under a stable install dir
 * and repointing the command symlink — a hash/exact-realpath gate would alarm
 * on every legitimate update and train the user to ignore the check. The
 * structural pin stays silent across auto-updates while refusing the F4 plant.
 * Honest boundary: in-place substitution of the user-owned target at its
 * unchanged path is NOT detected — that attacker could equally rewrite this
 * pin store; same-user native malware is A12's territory, not A7's.
 *
 * ── Fix-pass (2026-07-19, ADR-0028 amendments 1 & 2, FIX-PLAN C1) ──────────
 * The In-Review design failed OPEN. This module is now fail-CLOSED on tamper
 * and encapsulates execution:
 *
 *  - FAIL-CLOSED STORE STATE MACHINE. `readPinStore` distinguishes `absent`
 *    (ENOENT — genuine first-run self-heal) from `tampered` (unreadable / bad
 *    JSON / foreign schema — REFUSE). A store that EXISTS but lacks the
 *    requested pin also fails closed (a valid partial store must not let a
 *    later-planted binary live-resolve). [A1/A1b]
 *  - INTERPRETER BINDING. A pinned `#!/usr/bin/env node` script (the shape of
 *    claude/codex) re-resolves `node` via `env` from the job PATH; a planted
 *    `node`/`env` would run. `bindInterpreter` is the single source of truth:
 *    native → direct; node shebang → `process.execPath <script>`; absolute
 *    NATIVE non-node interpreter → that interpreter; a PATH-resolving non-node
 *    env shebang → THROW (never PATH-resolve an interpreter). [A2/R10/R13]
 *  - EXECUTION-ONLY ENCAPSULATION. `spawnPinnedSync` / `spawnPinned` are the
 *    ONLY public way to EXECUTE a pinned target; they resolve → verify → bind →
 *    spawn and NEVER hand back a spawnable path or a raw child/event/error. The
 *    exec-path helpers (resolveExecutable/verifyExecutable/readShebang/
 *    bindInterpreter/verifyPin/resolvePinnedSpawn/buildPin/probeVersion) are
 *    module-internal. `loadPins`/`createPins` stay exported because they return
 *    pin state as DATA (descriptor digest + doctor/status) that no consumer
 *    spawns. [R13/R15/R16]
 */

const fs = require('node:fs');
const path = require('node:path');
const EventEmitter = require('node:events');
const { spawn, spawnSync } = require('node:child_process');

const { WienerdogError } = require('./errors');
const { writeFilePrivate } = require('./private-fs');
const manifestMod = require('./manifest');

/** Pin-store basename under `<core>/state/` (mode 0600). */
const EXEC_PINS_PATH = 'exec-pins.json';

/** The executables the nightly jobs spawn. codex is optional (M4). */
const PIN_NAMES = ['claude', 'git', 'codex'];

/** Bounded first-line read for shebang classification. */
const SHEBANG_READ_BYTES = 512;

/** Best-effort version-probe bound. */
const PROBE_TIMEOUT_MS = 10_000;

/** Spawn error codes we surface verbatim (never path-bearing); anything else
 *  collapses to a generic kind so no OS-detail leaks. */
const APPROVED_ERROR_CODES = new Set(['ENOENT', 'EACCES', 'ETIMEDOUT', 'EAGAIN', 'ENOMEM', 'E2BIG', 'ENOEXEC']);

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function storePath(paths) {
  return path.join(paths.state, EXEC_PINS_PATH);
}

// ── Resolution + structural verification (module-internal) ──────────────────

/**
 * Resolve a bare exec name against a PATH, left-to-right, to its realpath —
 * mimicking execvp: the first regular file with an execute bit wins (win32:
 * PATHEXT candidates, no mode semantics).
 * @param {string} name  'claude' | 'git' | 'codex'
 * @param {NodeJS.ProcessEnv} env  uses env.PATH (the job clean PATH)
 * @param {NodeJS.Platform} platform  never mock process.platform — inject it
 * @returns {{name:string, path:string, realpath:string}|null}  first executable
 *   hit, fs.realpathSync-canonicalized; null if not found
 */
function resolveExecutable(name, env, platform) {
  const delim = platform === 'win32' ? ';' : ':';
  const dirs = String(env.PATH || '')
    .split(delim)
    .filter((d) => d !== '');
  const candidatesIn = (dir) => {
    if (platform !== 'win32') return [path.join(dir, name)];
    const exts = String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
    // A name that already carries an extension is tried as-is first.
    const base = name.includes('.') ? [path.join(dir, name)] : [];
    return [...base, ...exts.map((e) => path.join(dir, name + e))];
  };
  for (const dir of dirs) {
    for (const candidate of candidatesIn(dir)) {
      try {
        const st = fs.statSync(candidate);
        if (!st.isFile()) continue;
        if (platform !== 'win32' && (st.mode & 0o111) === 0) continue; // not executable — PATH walks past it
        return { name, path: candidate, realpath: fs.realpathSync(candidate) };
      } catch {
        continue; // absent / unreadable / dangling symlink — keep walking
      }
    }
  }
  return null;
}

/**
 * Verify a realpath is a safe executable to spawn.
 * @param {string} realpath  absolute, already realpath-canonical
 * @param {NodeJS.Platform} platform
 * @param {{uid?:number}} [ctx]  defaults to process.getuid?.()
 * @returns {{ok:true}|{ok:false, why:string}}  POSIX checks: (a) regular file;
 *   (b) an execute mode bit is set; (c) owner uid ∈ {current uid, 0}; (d) NO
 *   ancestor dir from the file up to '/' is group- or other-writable unless it
 *   is owned by root (covers root-sticky /tmp and root-owned group-writable
 *   Homebrew dirs). win32: (a) regular file only — a documented reduced
 *   guarantee (no POSIX mode/owner semantics on NTFS ACLs).
 */
function verifyExecutable(realpath, platform, ctx) {
  let st;
  try {
    st = fs.statSync(realpath);
  } catch (err) {
    return { ok: false, why: `cannot stat ${realpath}: ${err.message}` };
  }
  if (!st.isFile()) return { ok: false, why: `${realpath} is not a regular file` };
  if (platform === 'win32') return { ok: true };

  if ((st.mode & 0o111) === 0) return { ok: false, why: `${realpath} has no execute bit` };
  const uid = ctx && ctx.uid !== undefined ? ctx.uid : process.getuid ? process.getuid() : 0;
  if (st.uid !== uid && st.uid !== 0) {
    return { ok: false, why: `${realpath} is owned by uid ${st.uid}, not the current user (${uid}) or root` };
  }
  // Ancestor walk: a group/other-writable dir on the way to '/' lets any
  // co-writer swap a path component; root-owned writable dirs (sticky /tmp,
  // some Homebrew setups) are the OS's own layout and pass.
  let dir = path.dirname(realpath);
  for (;;) {
    let ds;
    try {
      ds = fs.statSync(dir);
    } catch (err) {
      return { ok: false, why: `cannot stat ancestor ${dir}: ${err.message}` };
    }
    if ((ds.mode & 0o022) !== 0 && ds.uid !== 0) {
      return { ok: false, why: `ancestor directory ${dir} is group/other-writable and not root-owned` };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached '/'
    dir = parent;
  }
  return { ok: true };
}

// ── Interpreter binding (module-internal) ───────────────────────────────────

/**
 * The first line of `realpath` if it begins with `#!`, else null. Bounded to a
 * 512-byte first-line read so a huge/binary file cannot be slurped.
 * @param {string} realpath @returns {string|null}
 */
function readShebang(realpath) {
  let fd;
  try {
    fd = fs.openSync(realpath, 'r');
    const buf = Buffer.alloc(SHEBANG_READ_BYTES);
    const n = fs.readSync(fd, buf, 0, SHEBANG_READ_BYTES, 0);
    if (n < 2 || buf[0] !== 0x23 /* # */ || buf[1] !== 0x21 /* ! */) return null;
    const firstLine = buf.slice(0, n).toString('utf8').split('\n')[0];
    return firstLine.replace(/\r$/, '');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* best-effort close */
      }
    }
  }
}

/**
 * [R11/R13] THE single interpreter-binding helper — the one source of truth for
 * the four-case contract. Classify a verified realpath into a spawn spec so no
 * caller ever PATH-resolves an interpreter:
 *   - native binary (no shebang) ⇒ {command: realpath, args: []}
 *   - node shebang (`env node` | `env -S node …` | `<abs>/node`) ⇒
 *       {command: process.execPath, args: [realpath]}  (never PATH-resolve node)
 *   - absolute NON-node interpreter (`#!/abs/interp`) ⇒ verifyExecutable(abs),
 *       and the interpreter must itself be NATIVE (fail closed if it has its own
 *       shebang — a script interpreter would recursively PATH-resolve its own
 *       `#!/usr/bin/env x`); then {command: abs, args: [realpath]}, else THROW
 *   - PATH-resolving non-node env shebang (`#!/usr/bin/env <non-node>`) or any
 *       bare/relative interpreter ⇒ THROW (fail closed — never resolve `<x>`
 *       through the job PATH, which front-loads attacker-writable ~/.local/bin)
 * @param {string} realpath  absolute, already realpath-canonical + verified
 * @param {NodeJS.ProcessEnv} env
 * @param {NodeJS.Platform} platform
 * @returns {{command:string, args:string[]}}
 * @throws {WienerdogError} on an unsupported / recursive / PATH-resolving interpreter
 */
function bindInterpreter(realpath, env, platform) {
  const shebang = readShebang(realpath);
  if (!shebang) return { command: realpath, args: [] }; // native binary

  const spec = shebang.slice(2).trim(); // strip '#!'
  const tokens = spec.split(/\s+/).filter(Boolean);
  const interp = tokens[0] || '';
  const interpBase = path.basename(interp);

  const unsupported = () =>
    new WienerdogError(
      'refusing to run the pinned executable: it uses an unsupported PATH-resolving interpreter — ' +
        'investigate, or run `wienerdog sync` to re-pin after confirming the change is legitimate.'
    );

  if (interpBase === 'env') {
    // `#!/usr/bin/env [-S] <prog> …` — find the program env would exec.
    let prog = null;
    for (let i = 1; i < tokens.length; i++) {
      let t = tokens[i];
      if (t === '-S') continue;
      if (t.startsWith('-S')) {
        t = t.slice(2).trim();
        if (t === '') continue;
      }
      if (t.startsWith('-')) continue; // other env options
      if (t.includes('=')) continue; // VAR=val assignment
      prog = t;
      break;
    }
    if (prog === 'node') return { command: process.execPath, args: [realpath] };
    throw unsupported(); // PATH-resolving non-node env shebang
  }

  if (path.isAbsolute(interp)) {
    if (interpBase === 'node') return { command: process.execPath, args: [realpath] };
    // Absolute non-node interpreter: verify it AND require it to be native.
    const v = verifyExecutable(interp, platform);
    if (!v.ok) {
      throw new WienerdogError(
        `refusing to run the pinned executable: its interpreter failed verification (${v.why}).`
      );
    }
    if (readShebang(interp) !== null) {
      // A script interpreter would recursively PATH-resolve its own shebang.
      throw new WienerdogError(
        'refusing to run the pinned executable: its interpreter is itself a script (recursive interpreter) — unsupported.'
      );
    }
    return { command: interp, args: [realpath] };
  }

  throw unsupported(); // bare/relative interpreter (e.g. `#!node`)
}

// ── Version probe + pin building (module-internal) ──────────────────────────

/**
 * `<exe> --version`, bounded, best-effort — INFORMATIONAL only, never compared
 * (the structural pin, not the version, is the gate). MUST execute via
 * `bindInterpreter` (a node-shebang probe runs `process.execPath <script>
 * --version`), never `spawnSync(realpath)` directly. A THROW from
 * `bindInterpreter` (unsupported PATH-resolving interpreter) PROPAGATES — it is
 * not swallowed as 'unknown'; the caller (`buildPin`) refuses the exec.
 * @param {string} realpath @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform
 * @returns {string} 'unknown' on a benign probe failure
 * @throws {WienerdogError} on an unsupported interpreter (from bindInterpreter)
 */
function probeVersion(realpath, env, platform) {
  const { command, args } = bindInterpreter(realpath, env, platform); // THROW propagates
  try {
    const r = spawnSync(command, [...args, '--version'], { env, timeout: PROBE_TIMEOUT_MS, encoding: 'utf8' });
    const out = (r.stdout || '').trim().split('\n')[0].slice(0, 200);
    return r.status === 0 && out ? out : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Build one pin (resolve + verify + bindInterpreter + probe). Calls
 * `bindInterpreter` (via `probeVersion`) BEFORE recording — an unsupported
 * PATH-resolving interpreter ⇒ the exec is REFUSED ({name, error}) WITHOUT ever
 * executing the target.
 * @param {string} name @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform
 * @returns {{commandPath:string, installDir:string, version:string, pinnedAt:string}
 *          |{name:string, error:string}}
 */
function buildPin(name, env, platform) {
  const hit = resolveExecutable(name, env, platform);
  if (!hit) return { name, error: `${name} not found on the job PATH` };
  const v = verifyExecutable(hit.realpath, platform);
  if (!v.ok) return { name, error: `${name} failed verification: ${v.why}` };
  let version;
  try {
    version = probeVersion(hit.realpath, env, platform);
  } catch (err) {
    if (err instanceof WienerdogError) {
      return { name, error: `${name} uses an unsupported interpreter — not pinned` };
    }
    throw err;
  }
  return {
    commandPath: hit.path,
    installDir: path.dirname(hit.realpath),
    version,
    pinnedAt: new Date().toISOString(),
  };
}

// ── Pin store (fail-closed state machine) ───────────────────────────────────

/**
 * Read the pin store into a three-state result. ENOENT ⇒ `absent` (genuine
 * first-run self-heal); an unreadable file / JSON-parse error / wrong-or-foreign
 * schema ⇒ `tampered` (fail closed); a valid `schema===1` ⇒ `ok`.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {{state:'ok'|'absent'|'tampered', pins:object}}
 */
function readPinStore(paths) {
  let raw;
  try {
    raw = fs.readFileSync(storePath(paths), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return { state: 'absent', pins: {} };
    return { state: 'tampered', pins: {} }; // EACCES / EISDIR / other read error
  }
  let store;
  try {
    store = JSON.parse(raw);
  } catch {
    return { state: 'tampered', pins: {} };
  }
  if (store && store.schema === 1 && store.pins && typeof store.pins === 'object') {
    return { state: 'ok', pins: store.pins };
  }
  return { state: 'tampered', pins: {} }; // foreign / wrong schema
}

/**
 * Load the pin store's pins map, for DATA consumers (descriptor digest +
 * doctor/status) that never spawn it. Missing/corrupt/foreign ⇒ {} (a tampered
 * store yields an empty `exec` map ⇒ the launcher digest mismatches ⇒ fail
 * closed on the scheduled path).
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {object}
 */
function loadPins(paths) {
  return readPinStore(paths).pins;
}

/**
 * Resolve + verify + pin claude, git, and (if resolvable) codex; write the 0600
 * store and record the manifest file entry (once). Idempotent: an unchanged
 * environment rewrites byte-identical content — stable key order, and the prior
 * `pinnedAt` is kept when commandPath+installDir are unchanged (`version` may
 * advance on auto-update without churning `pinnedAt`).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, manifest?:object,
 *          dryRun?:boolean}} [opts]
 *   NO spawn/exec callback param — the version probe's spawn is module-private.
 * @returns {{pins:object, notices:string[]}}  notices: unresolved/verify-failed execs
 */
function createPins(paths, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const prior = loadPins(paths);

  /** @type {Record<string, object>} */
  const pins = {};
  /** @type {string[]} */
  const notices = [];
  for (const name of PIN_NAMES) {
    const built = buildPin(name, env, platform);
    if ('error' in built) {
      // git/claude are required nightly; codex is optional until M4. All three
      // degrade to a notice — sync never fails over a missing executable.
      notices.push(
        name === 'git'
          ? 'git not found on the job PATH — nightly commit will fail until it is installed and you re-run sync'
          : `${built.error}${name === 'codex' ? ' (optional until Codex support lands)' : ''}`
      );
      continue;
    }
    const old = prior[name];
    if (old && old.commandPath === built.commandPath && old.installDir === built.installDir) {
      built.pinnedAt = old.pinnedAt; // unchanged location ⇒ no pinnedAt churn
    }
    pins[name] = built;
  }

  if (!opts.dryRun) {
    const store = { schema: 1, pins };
    writeFilePrivate(storePath(paths), `${JSON.stringify(store, null, 2)}\n`); // atomic (temp + rename)
    if (opts.manifest) {
      const entry = { kind: 'file', path: storePath(paths) };
      const exists = opts.manifest.entries.some((e) => e.kind === entry.kind && e.path === entry.path);
      if (!exists) manifestMod.record(opts.manifest, entry);
    }
  }
  return { pins, notices };
}

/**
 * Verify the CURRENT PATH resolution of `name` still matches its pin, over the
 * fail-closed store state machine.
 *   - `tampered` store ⇒ {ok:false, drift:true} (fail closed).
 *   - `absent` store + no pin for name ⇒ {ok:false, drift:false} (genuine
 *     first-run self-heal — the ONLY live-resolve path).
 *   - `ok` store missing the requested pin ⇒ {ok:false, drift:true} (a valid
 *     partial store must not let a later-planted binary live-resolve). [R2:F1]
 *   - pin present ⇒ require (a) live command path === pin.commandPath;
 *     (b) dirname(live realpath) === pin.installDir; (c) verifyExecutable passes.
 * `version` is informational and NEVER compared.
 * @param {string} name @param {import('./paths').WienerdogPaths} paths
 * @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, uid?:number}} [opts]
 * @returns {{ok:true, path:string}|{ok:false, why:string, drift:boolean}}
 *   ok.path is the LIVE verified realpath.
 */
function verifyPin(name, paths, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const { state, pins } = readPinStore(paths);

  if (state === 'tampered') {
    return { ok: false, why: 'the pin store is unreadable or corrupt', drift: true };
  }
  const pin = pins[name];
  if (!pin) {
    if (state === 'absent') return { ok: false, why: `no pin recorded for ${name}`, drift: false };
    // A store EXISTS but has no pin for the requested name — fail closed.
    return { ok: false, why: `${name} is not pinned in the existing pin store`, drift: true };
  }

  const live = resolveExecutable(name, env, platform);
  if (!live) {
    return { ok: false, why: `${name} no longer resolves on the job PATH (pinned at ${pin.commandPath})`, drift: true };
  }
  if (live.path !== pin.commandPath) {
    return {
      ok: false,
      why: `${name} now resolves to ${live.path}, but the pinned command path is ${pin.commandPath}`,
      drift: true,
    };
  }
  const liveDir = path.dirname(live.realpath);
  if (liveDir !== pin.installDir) {
    return {
      ok: false,
      why: `${name} now points into ${liveDir}, outside its pinned install dir ${pin.installDir}`,
      drift: true,
    };
  }
  const v = verifyExecutable(live.realpath, platform, opts.uid !== undefined ? { uid: opts.uid } : undefined);
  if (!v.ok) return { ok: false, why: `${name} failed verification: ${v.why}`, drift: true };
  return { ok: true, path: live.realpath };
}

/**
 * The internal spawn accessor: resolve + verify + bind, yielding the spawn spec
 * `{command, args}` (never a bare path a caller could spawn arbitrarily).
 *   - pin ok ⇒ bindInterpreter(LIVE verified realpath) (never a stored path).
 *   - drifted / tampered / present-but-missing-pin ⇒ THROW (fail safe).
 *   - absent store (never pinned) ⇒ live resolve + verify + bind (self-heals the
 *     pre-first-sync window only).
 * @param {string} name @param {import('./paths').WienerdogPaths} paths
 * @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform
 * @returns {{command:string, args:string[]}} @throws {WienerdogError}
 */
function resolvePinnedSpawn(name, paths, env, platform) {
  const res = verifyPin(name, paths, { env, platform });
  if (res.ok) return bindInterpreter(res.path, env, platform);
  if (res.drift) {
    throw new WienerdogError(
      `refusing to run ${name}: ${res.why}. If this change is legitimate (e.g. you reinstalled or ` +
        `switched install method), run \`wienerdog sync\` to re-pin it; otherwise investigate — ` +
        `a planted executable on the job PATH looks exactly like this.`
    );
  }
  // No store at all (never pinned) — resolve + verify + bind live, once, now.
  const live = resolveExecutable(name, env, platform);
  if (!live) {
    throw new WienerdogError(`${name} was not found on the job PATH — install it, then run \`wienerdog sync\`.`);
  }
  const v = verifyExecutable(live.realpath, platform);
  if (!v.ok) {
    throw new WienerdogError(`refusing to run ${name}: ${v.why}. Fix the installation, then run \`wienerdog sync\`.`);
  }
  return bindInterpreter(live.realpath, env, platform);
}

// ── Sanitized-by-construction execution facade (public) ─────────────────────

/**
 * Freshly-construct an approved-code error that names the exec by its LOGICAL
 * `name` only — no `.path`/`.spawnargs`/`.spawnfile`/`.syscall`/`.cmd`/`.cause`
 * and no path-bearing text (the raw child error's `.path`/`spawnargs[0]` carry
 * the pinned realpath — acute for node-shebang targets).
 * @param {Error & {code?:string}} rawErr @param {string} name @returns {Error & {code:string}}
 */
function sanitizeSpawnError(rawErr, name) {
  const code = rawErr && APPROVED_ERROR_CODES.has(rawErr.code) ? rawErr.code : 'spawn-failed';
  const e = /** @type {Error & {code:string}} */ (new Error(`${name} could not run (${code})`));
  e.code = code;
  return e;
}

/** Passthrough opts the sync spawn accepts (never `spawnfile`/`spawnargs`, never
 *  a spawn/exec callback). */
const SAFE_SYNC_OPTS = ['cwd', 'timeout', 'encoding', 'maxBuffer', 'input', 'killSignal', 'uid', 'gid'];
/** Passthrough opts the async spawn accepts. */
const SAFE_ASYNC_OPTS = ['cwd', 'detached', 'stdio', 'timeout', 'killSignal', 'uid', 'gid'];

/** @param {object} opts @param {string[]} allow @param {NodeJS.ProcessEnv} env @returns {object} */
function passthroughSpawnOpts(opts, allow, env) {
  const out = { env };
  for (const k of allow) if (opts[k] !== undefined) out[k] = opts[k];
  return out;
}

/**
 * [R13/R15/R16] THE ONLY public API to EXECUTE a pinned target SYNCHRONOUSLY.
 * Resolves → verifies → bindInterpreter → spawns. SANITIZED-BY-CONSTRUCTION
 * return: `{status, signal, stdout, stderr}` (no `spawnfile`/`spawnargs`/`pid`);
 * a spawn error is surfaced as a fresh, sanitized `error` (approved code +
 * `name`-only message), never the raw one.
 * @param {string} name  'claude'|'git'|'codex'
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{args?:string[], env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform,
 *          cwd?:string, timeout?:number, encoding?:BufferEncoding,
 *          maxBuffer?:number, input?:string|Buffer}} [opts]
 *   NO spawn/exec callback param (real spawn is module-private).
 * @returns {{status:number|null, signal:string|null, stdout:(string|Buffer),
 *            stderr:(string|Buffer), error?:Error}}
 * @throws {WienerdogError} on drift/tamper/unsupported-interpreter (no spawn)
 */
function spawnPinnedSync(name, paths, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const { command, args } = resolvePinnedSpawn(name, paths, env, platform);
  const jobArgs = Array.isArray(opts.args) ? opts.args : [];
  const raw = spawnSync(command, [...args, ...jobArgs], passthroughSpawnOpts(opts, SAFE_SYNC_OPTS, env));
  /** @type {{status:number|null, signal:string|null, stdout:any, stderr:any, error?:Error}} */
  const result = {
    status: raw.status == null ? null : raw.status,
    signal: raw.signal == null ? null : raw.signal,
    stdout: raw.stdout,
    stderr: raw.stderr,
  };
  if (raw.error) result.error = sanitizeSpawnError(raw.error, name);
  return result;
}

/**
 * A restricted child facade that NEVER forwards a raw Node child, native
 * emitter, event, or error. `stdout`/`stderr`/`stdin` are the child's byte
 * streams; `on`/`once` re-emit ONLY freshly-constructed `exit`→{code,signal}
 * and `error`→a sanitized new Error. `pid`/`kill` support the run-job watchdog.
 * @param {import('child_process').ChildProcess} child @param {string} name
 * @returns {{stdout:any, stderr:any, stdin:any, pid:number|undefined,
 *            kill:(signal?:NodeJS.Signals|number)=>boolean,
 *            on:Function, once:Function}}
 */
function makeChildFacade(child, name) {
  const emitter = new EventEmitter();
  // Trigger the constructed `exit` off the child's `close` (stdio flushed) so a
  // consumer reading the stderr tail sees a complete stream.
  child.on('close', (code, signal) => emitter.emit('exit', { code: code == null ? null : code, signal: signal == null ? null : signal }));
  child.on('error', (err) => emitter.emit('error', sanitizeSpawnError(err, name)));
  const facade = {
    stdout: child.stdout,
    stderr: child.stderr,
    stdin: child.stdin,
    get pid() {
      return child.pid;
    },
    /** @param {NodeJS.Signals|number} [signal] */
    kill(signal) {
      return child.kill(signal);
    },
    /** @param {string} evt @param {Function} cb */
    on(evt, cb) {
      if (evt === 'exit' || evt === 'error') emitter.on(evt, cb);
      return facade; // silently ignore any other (raw) event name
    },
    /** @param {string} evt @param {Function} cb */
    once(evt, cb) {
      if (evt === 'exit' || evt === 'error') emitter.once(evt, cb);
      return facade;
    },
  };
  return facade;
}

/**
 * [R13/R15/R16] Async variant (detached/streamed child, e.g. the dream brain).
 * SANITIZED-BY-CONSTRUCTION facade — see `makeChildFacade`. Same `opts` as
 * `spawnPinnedSync`; NO spawn/exec callback param. A drift/tamper/unsupported
 * throw propagates (fail loud) BEFORE any spawn.
 * @param {string} name @param {import('./paths').WienerdogPaths} paths
 * @param {{args?:string[], env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform,
 *          cwd?:string, detached?:boolean, stdio?:any, timeout?:number}} [opts]
 * @returns {ReturnType<typeof makeChildFacade>} @throws {WienerdogError}
 */
function spawnPinned(name, paths, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const { command, args } = resolvePinnedSpawn(name, paths, env, platform);
  const jobArgs = Array.isArray(opts.args) ? opts.args : [];
  const child = spawn(command, [...args, ...jobArgs], passthroughSpawnOpts(opts, SAFE_ASYNC_OPTS, env));
  return makeChildFacade(child, name);
}

// [R13/R15] EXECUTION-ONLY ENCAPSULATION. Public exec surface = the EXACT
// path-free, seam-free list below. spawnPinnedSync/spawnPinned are the ONLY way
// to EXECUTE a pinned target. loadPins/createPins return path-bearing pin state
// as DATA (descriptor digest + doctor/status) that no consumer spawns. The
// exec-path helpers (resolvePinnedSpawn, bindInterpreter, resolveExecutable,
// verifyExecutable, readShebang, verifyPin, buildPin, probeVersion) are
// MODULE-INTERNAL (verified: no external importers), so there is no way to
// obtain-then-spawn a raw path.
module.exports = { createPins, loadPins, spawnPinnedSync, spawnPinned, EXEC_PINS_PATH };

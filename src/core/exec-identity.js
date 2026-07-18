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
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { WienerdogError } = require('./errors');
const { writeFilePrivate } = require('./private-fs');
const manifestMod = require('./manifest');

/** Pin-store basename under `<core>/state/` (mode 0600). */
const EXEC_PINS_PATH = 'exec-pins.json';

/** The executables the nightly jobs spawn. codex is optional (M4). */
const PIN_NAMES = ['claude', 'git', 'codex'];

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function storePath(paths) {
  return path.join(paths.state, EXEC_PINS_PATH);
}

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

/**
 * `<exe> --version`, bounded (10s), best-effort — INFORMATIONAL only, never
 * compared (the structural pin, not the version, is the gate).
 * @param {string} realpath @param {NodeJS.ProcessEnv} env
 * @param {typeof spawnSync} [spawnSyncFn]  test seam
 * @returns {string} 'unknown' on any failure
 */
function probeVersion(realpath, env, spawnSyncFn) {
  const fn = spawnSyncFn || spawnSync;
  try {
    const r = fn(realpath, ['--version'], { env, timeout: 10_000, encoding: 'utf8' });
    const out = (r.stdout || '').trim().split('\n')[0].slice(0, 200);
    return r.status === 0 && out ? out : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Build one pin (resolve + verify + probe).
 * @param {string} name @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform
 * @param {{spawnSync?:typeof spawnSync}} [seams]
 * @returns {{commandPath:string, installDir:string, version:string, pinnedAt:string}
 *          |{name:string, error:string}}
 */
function buildPin(name, env, platform, seams = {}) {
  const hit = resolveExecutable(name, env, platform);
  if (!hit) return { name, error: `${name} not found on the job PATH` };
  const v = verifyExecutable(hit.realpath, platform);
  if (!v.ok) return { name, error: `${name} failed verification: ${v.why}` };
  return {
    commandPath: hit.path,
    installDir: path.dirname(hit.realpath),
    version: probeVersion(hit.realpath, env, seams.spawnSync),
    pinnedAt: new Date().toISOString(),
  };
}

/**
 * Resolve + verify + pin claude, git, and (if resolvable) codex; write the 0600
 * store and record the manifest file entry (once). Idempotent: an unchanged
 * environment rewrites byte-identical content — stable key order, and the prior
 * `pinnedAt` is kept when commandPath+installDir are unchanged (`version` may
 * advance on auto-update without churning `pinnedAt`).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, manifest?:object,
 *          dryRun?:boolean, spawnSync?:Function}} [opts]
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
    const built = buildPin(name, env, platform, { spawnSync: opts.spawnSync });
    if ('error' in built) {
      // git/claude are required nightly; codex is optional until M4. All three
      // degrade to a notice — sync never fails over a missing executable.
      notices.push(
        name === 'git'
          ? 'git not found on the job PATH — nightly commit will fail until it is installed and you re-run sync'
          : `${built.error} — not pinned${name === 'codex' ? ' (optional until Codex support lands)' : ''}`
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
    writeFilePrivate(storePath(paths), `${JSON.stringify(store, null, 2)}\n`);
    if (opts.manifest) {
      const entry = { kind: 'file', path: storePath(paths) };
      const exists = opts.manifest.entries.some((e) => e.kind === entry.kind && e.path === entry.path);
      if (!exists) manifestMod.record(opts.manifest, entry);
    }
  }
  return { pins, notices };
}

/**
 * Load the pin store's pins map. Missing/corrupt/foreign-schema ⇒ {}.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {object}
 */
function loadPins(paths) {
  try {
    const store = JSON.parse(fs.readFileSync(storePath(paths), 'utf8'));
    return store && store.schema === 1 && store.pins && typeof store.pins === 'object' ? store.pins : {};
  } catch {
    return {};
  }
}

/**
 * Verify the CURRENT PATH resolution of `name` still matches its pin.
 * Re-resolves live, then requires: (a) live command path === pin.commandPath;
 * (b) dirname(live realpath) === pin.installDir (exact string equality — a
 * `brew upgrade` that moves a versioned Cellar dir fails safe by design);
 * (c) verifyExecutable(live realpath) passes. `version` is informational and
 * NEVER compared.
 * @param {string} name @param {import('./paths').WienerdogPaths} paths
 * @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, uid?:number}} [opts]
 * @returns {{ok:true, path:string}|{ok:false, why:string, drift:boolean}}
 *   ok.path is the LIVE verified realpath. drift:true when a pin EXISTS but a
 *   check fails (⇒ caller must fail safe); drift:false when NO pin exists
 *   (first-run/upgrade — caller may self-heal with a live resolve).
 */
function verifyPin(name, paths, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const pin = loadPins(paths)[name];
  if (!pin) return { ok: false, why: `no pin recorded for ${name}`, drift: false };

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
 * The spawn accessor: the ABSOLUTE path to spawn, or a fail-safe throw.
 * - Pin exists + verifyPin ok ⇒ the LIVE verified realpath (never a stored
 *   path — the target moves on every auto-update; the pin authorizes the
 *   LOCATION, the live resolve supplies the file).
 * - Pin exists but drifted ⇒ THROW (fail safe — tamper and legit install-method
 *   change are indistinguishable here; the user must confirm and re-pin).
 * - No pin (never pinned) ⇒ live resolve + verify; the realpath on success,
 *   THROW on failure. (Self-heals the pre-first-sync window.)
 * @param {string} name @param {import('./paths').WienerdogPaths} paths
 * @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform
 * @returns {string} absolute realpath @throws {WienerdogError}
 */
function resolvePinnedSpawn(name, paths, env, platform) {
  const res = verifyPin(name, paths, { env, platform });
  if (res.ok) return res.path;
  if (res.drift) {
    throw new WienerdogError(
      `refusing to run ${name}: ${res.why}. If this change is legitimate (e.g. you reinstalled or ` +
        `switched install method), run \`wienerdog sync\` to re-pin it; otherwise investigate — ` +
        `a planted executable on the job PATH looks exactly like this.`
    );
  }
  // No pin yet — resolve and verify live, once, right now.
  const live = resolveExecutable(name, env, platform);
  if (!live) {
    throw new WienerdogError(`${name} was not found on the job PATH — install it, then run \`wienerdog sync\`.`);
  }
  const v = verifyExecutable(live.realpath, platform);
  if (!v.ok) {
    throw new WienerdogError(`refusing to run ${name}: ${v.why}. Fix the installation, then run \`wienerdog sync\`.`);
  }
  return live.realpath;
}

module.exports = {
  resolveExecutable,
  verifyExecutable,
  probeVersion,
  buildPin,
  createPins,
  loadPins,
  verifyPin,
  resolvePinnedSpawn,
  EXEC_PINS_PATH,
};

'use strict';

/**
 * Out-of-tree launcher (audit A7 findings F1/F2/F3, ADR-0028, WP-157).
 *
 * The OS scheduler entries invoke THIS file — placed by vendor.writeLauncher at
 * `<core>/launcher/launch.js`, OUTSIDE the mutable `app/current` tree — instead
 * of the vendored bin directly. Before it spawns Node or the model it verifies:
 *   1. current containment + user ownership (prod);
 *   2. the live app tree content-addresses to the descriptor's treeDigest;
 *   3. prod/dev stance matches (no planted `.git` downgrade of a prod install);
 *   4. the re-derived descriptor digest equals the digest bound into the OS
 *      entry (`--expect-digest`) — the independent anchor that catches a scoped
 *      `config.yaml` `run`/`model`/`timeout`/pin edit made without `sync`.
 * ANY mismatch ⇒ a fixed durable alert + non-zero exit + ZERO app/model spawn.
 *
 * SELF-CONTAINMENT (the load-bearing design point). This file's ONLY top-level
 * requires are Node builtins. The root-of-trust primitives — path resolution,
 * containment, the app-tree content hash, the dev-stance probe, and a minimal
 * alert append — are INLINED here (a deliberate, small duplication of
 * paths/vendor/descriptor/alerts logic), because requiring them FROM the app
 * tree it is about to verify would defeat the purpose. Only AFTER the tree's
 * treeDigest is verified does it lazy-require `deriveDescriptorDigest`/`getPaths`
 * from the now-verified tree (step 4). The inlined appTreeDigest MUST stay
 * byte-compatible with src/scheduler/descriptor.js's — a cross-check test pins
 * that.
 *
 * RESIDUAL (flagged per spec): step 3 compares the live tree hash to the
 * DESCRIPTOR FILE's treeDigest, so a scoped attacker who rewrites BOTH the app
 * tree AND the descriptor file's treeDigest passes step 3 and reaches the
 * lazy-require of step 4. That, and any write reaching THIS launcher file, are
 * A12's territory (arbitrary same-user writes under <core>), not A7's — see the
 * WP-157 boundary section and the deferred "2b" bootstrap-digest hardening.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

/** @param {Buffer|string} b @returns {string} hex sha256 */
function sha256(b) {
  return crypto.createHash('sha256').update(b).digest('hex');
}

/** Minimal path resolution — enough for containment / tree hash / descriptor
 *  read WITHOUT requiring src/core/paths.js from the (unverified) app tree.
 *  @param {NodeJS.ProcessEnv} env @returns {{core:string, state:string, appDir:string, appCurrent:string}} */
function resolveCorePaths(env) {
  const home = env.HOME || os.homedir();
  const core = env.WIENERDOG_HOME && env.WIENERDOG_HOME !== '' ? env.WIENERDOG_HOME : path.join(home, '.wienerdog');
  return {
    core,
    state: path.join(core, 'state'),
    appDir: path.join(core, 'app'),
    appCurrent: path.join(core, 'app', 'current'),
  };
}

/** True iff `inner` realpath-resolves to `outer` or inside it (both canonical).
 *  @param {string} outer @param {string} inner @returns {boolean} */
function containedIn(outer, inner) {
  let o;
  let i;
  try {
    o = fs.realpathSync(outer);
    i = fs.realpathSync(inner);
  } catch {
    return false;
  }
  const rel = path.relative(o, i);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Verify app/current resolves INSIDE <core>/app and is user-owned (POSIX; win32
 *  reduced to containment only — no reliable uid on NTFS ACLs here).
 *  @param {{appDir:string, appCurrent:string}} p @param {NodeJS.Platform} platform
 *  @returns {{ok:true, target:string}|{ok:false, why:string}} */
function verifyContainment(p, platform) {
  if (!containedIn(p.appDir, p.appCurrent)) {
    return { ok: false, why: `app/current does not resolve inside ${p.appDir}` };
  }
  let target;
  try {
    target = fs.realpathSync(p.appCurrent);
  } catch (err) {
    return { ok: false, why: `cannot resolve app/current: ${err.message}` };
  }
  if (platform !== 'win32') {
    const uid = process.getuid ? process.getuid() : 0;
    let st;
    try {
      st = fs.statSync(target);
    } catch (err) {
      return { ok: false, why: `cannot stat app/current target: ${err.message}` };
    }
    if (st.uid !== uid && st.uid !== 0) {
      return { ok: false, why: `app/current is owned by uid ${st.uid}, not the current user (${uid}) or root` };
    }
  }
  return { ok: true, target };
}

/** Content-address a resolved tree: sha256 over the sorted
 *  `${posixRelpath}\n${sha256(bytes)}\n` list of every regular file (symlinks/
 *  dirs excluded). MUST match src/scheduler/descriptor.js appTreeDigest exactly.
 *  @param {string} root  already-realpath-resolved dir @returns {string} 'sha256:…' */
function appTreeDigestOf(root) {
  /** @type {string[]} */
  const lines = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) walk(full, childRel);
      else if (e.isFile()) lines.push(`${childRel}\n${sha256(fs.readFileSync(full))}\n`);
    }
  };
  walk(root, '');
  lines.sort();
  return `sha256:${sha256(lines.join(''))}`;
}

/** Dev checkout? A `.git` dir at `root`, or WIENERDOG_DEV=1 — matches
 *  vendor.isDevCheckout. @param {string} root @param {NodeJS.ProcessEnv} env @returns {boolean} */
function isDev(root, env) {
  if (env.WIENERDOG_DEV === '1') return true;
  try {
    return fs.statSync(path.join(root, '.git')).isDirectory();
  } catch {
    return false;
  }
}

/** Minimal durable alert append (fixed, code-owned reason — no secrets, so no
 *  redaction/compaction machinery from src/core/alerts.js is needed; this must
 *  work even when the app tree is the thing being refused).
 *  @param {{state:string}} p @param {string} job @param {string} reason */
function appendRefuseAlert(p, job, reason) {
  try {
    fs.mkdirSync(p.state, { recursive: true, mode: 0o700 });
    const file = path.join(p.state, 'alerts.jsonl');
    let sep = '';
    try {
      const st = fs.statSync(file);
      if (st.size > 0) {
        const fd = fs.openSync(file, 'r');
        try {
          const last = Buffer.alloc(1);
          const n = fs.readSync(fd, last, 0, 1, st.size - 1);
          if (n === 1 && last[0] !== 0x0a) sep = '\n';
        } finally {
          fs.closeSync(fd);
        }
      }
    } catch {
      /* no existing file */
    }
    const record = { job, at: new Date().toISOString(), reason, log_hint: '' };
    fs.appendFileSync(file, `${sep}${JSON.stringify(record)}\n`);
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(file, 0o600);
      } catch {
        /* best-effort */
      }
    }
  } catch {
    /* the alert is best-effort — the refusal (non-zero exit, zero spawn) stands regardless */
  }
}

/** Read + JSON-parse the descriptor file. @param {string} descriptorPath
 *  @returns {object|null} null on missing/corrupt */
function readDescriptorFile(descriptorPath) {
  try {
    const d = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
}

/**
 * Pure verifier — reads live state, performs NO spawn.
 * @param {{core:string, state:string, appDir:string, appCurrent:string}} p  inlined core paths
 * @param {string} name  job name (never the '--catch-up' sentinel — main handles that)
 * @param {{descriptorPath:string, expectDigest:string, env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform}} o
 * @returns {{ok:true, command:string, args:string[]}|{ok:false, reason:string}}
 */
function verifyAndResolve(p, name, o) {
  const env = o.env || process.env;
  const platform = o.platform || process.platform;

  const descriptor = readDescriptorFile(o.descriptorPath);
  if (!descriptor) return { ok: false, reason: `descriptor ${o.descriptorPath} is missing or unreadable` };
  const stance = descriptor.appRelease && descriptor.appRelease.stance;

  let target;
  try {
    target = fs.realpathSync(p.appCurrent);
  } catch (err) {
    return { ok: false, reason: `cannot resolve app/current: ${err.message}` };
  }
  const liveDev = isDev(target, env);

  // Stance must match: a prod entry over a dev-looking tree (planted .git) or a
  // dev entry over a prod tree is refused — never a silent downgrade.
  if (stance === 'dev') {
    if (!liveDev) return { ok: false, reason: 'descriptor stance is dev but the live app is not a dev checkout' };
    // Dev checkouts are live-edited — a treeDigest over an edited tree is not
    // stable, so integrity is not enforceable; the stance match is the guard.
    return { ok: true, command: process.execPath, args: [path.join(target, 'bin', 'wienerdog.js'), 'run-job', name] };
  }
  if (stance !== 'prod') return { ok: false, reason: `descriptor stance ${JSON.stringify(stance)} is not prod or dev` };
  if (liveDev) return { ok: false, reason: 'descriptor stance is prod but the live app looks like a dev checkout (.git present)' };

  // PROD verification.
  const contain = verifyContainment(p, platform);
  if (!contain.ok) return { ok: false, reason: contain.why };

  const liveTree = appTreeDigestOf(target);
  const expectTree = descriptor.appRelease && descriptor.appRelease.treeDigest;
  if (liveTree !== expectTree) {
    return { ok: false, reason: 'the live app tree does not match the descriptor (app files changed since sync)' };
  }

  // Tree verified byte-identical to the descriptor ⇒ it is now SAFE to require
  // the descriptor-derivation code from the verified tree. deriveDescriptorDigest
  // re-derives from LIVE config/pins/app and must equal the entry-bound digest —
  // catching a config.yaml run/model/timeout/pin edit made without `sync`.
  let derived;
  try {
    const getPaths = require(path.join(target, 'src', 'core', 'paths')).getPaths;
    const { findJob } = require(path.join(target, 'src', 'scheduler', 'jobs'));
    const { deriveDescriptorDigest } = require(path.join(target, 'src', 'scheduler', 'descriptor'));
    const fullPaths = getPaths(env);
    const job = findJob(fullPaths, name);
    if (!job) return { ok: false, reason: `no job named "${name}" in config — nothing authorized to run` };
    derived = deriveDescriptorDigest(fullPaths, job, { platform, env });
  } catch (err) {
    return { ok: false, reason: `could not re-derive the descriptor digest: ${err.message}` };
  }
  if (derived !== o.expectDigest) {
    return { ok: false, reason: 'the job descriptor changed since it was scheduled (run/model/timeout/pin/app drift) — a `wienerdog sync` is required to re-authorize it' };
  }

  return { ok: true, command: process.execPath, args: [path.join(target, 'bin', 'wienerdog.js'), 'run-job', name] };
}

/**
 * Verify + resolve the catch-up spawn. No per-job descriptor: verify containment
 * (prod) + the live app tree hash equals the entry-bound `--expect-digest`; a
 * dev install skips the (unstable) tree hash, mirroring the per-job dev path.
 * @param {{appDir:string, appCurrent:string}} p @param {string} expectDigest
 * @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform
 * @returns {{ok:true, command:string, args:string[]}|{ok:false, reason:string}}
 */
function verifyCatchup(p, expectDigest, env, platform) {
  let target;
  try {
    target = fs.realpathSync(p.appCurrent);
  } catch (err) {
    return { ok: false, reason: `cannot resolve app/current: ${err.message}` };
  }
  const runArgs = [path.join(target, 'bin', 'wienerdog.js'), 'run-job', '--catch-up'];
  if (isDev(target, env)) return { ok: true, command: process.execPath, args: runArgs };
  const contain = verifyContainment(p, platform);
  if (!contain.ok) return { ok: false, reason: contain.why };
  if (appTreeDigestOf(target) !== expectDigest) {
    return { ok: false, reason: 'the live app tree does not match the scheduled digest (app files changed since sync)' };
  }
  return { ok: true, command: process.execPath, args: runArgs };
}

/** Parse `--flag value` pairs out of argv, returning {positionals, flags}.
 *  @param {string[]} argv @returns {{positionals:string[], flags:Record<string,string>}} */
function parseArgv(argv) {
  const positionals = [];
  /** @type {Record<string,string>} */ const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      flags[a.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

/**
 * CLI entry the OS scheduler invokes:
 *   node <core>/launcher/launch.js <name> --descriptor <p> --expect-digest <d>
 *   node <core>/launcher/launch.js --catch-up --expect-digest <d>
 * ok ⇒ spawn `node <currentBin> run-job <name|--catch-up>` (inherit stdio; exit
 * with the child's code) — the ONLY place a model/app spawn happens. refuse ⇒
 * append a fixed durable alert, write the reason to stderr, exit NON-ZERO,
 * spawn NOTHING.
 * @param {string[]} argv  process.argv.slice(2)
 * @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, spawn?:typeof spawnSync,
 *          exit?:(code:number)=>void}} [opts]  test seams; production passes none
 * @returns {number} the exit code (also passed to opts.exit / process.exit)
 */
function main(argv, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const spawn = opts.spawn || spawnSync;
  const exit = opts.exit || ((code) => process.exit(code));
  const p = resolveCorePaths(env);
  const { positionals, flags } = parseArgv(argv);
  const isCatchup = positionals[0] === '--catch-up' || flags['catch-up'] !== undefined || positionals.includes('--catch-up');
  const name = isCatchup ? '--catch-up' : positionals[0];

  const verdict = isCatchup
    ? verifyCatchup(p, flags['expect-digest'], env, platform)
    : verifyAndResolve(p, name, {
        descriptorPath: flags.descriptor,
        expectDigest: flags['expect-digest'],
        env,
        platform,
      });

  if (!verdict.ok) {
    const reason = `wienerdog: refusing to run "${name}" — ${verdict.reason} (integrity mismatch); no job was run. Run \`wienerdog doctor\`.`;
    appendRefuseAlert(p, name, reason);
    process.stderr.write(`${reason}\n`);
    exit(1);
    return 1;
  }

  const r = spawn(verdict.command, verdict.args, { stdio: 'inherit', env });
  const code = r && typeof r.status === 'number' ? r.status : 1;
  exit(code);
  return code;
}

module.exports = { verifyAndResolve, verifyCatchup, appTreeDigestOf, verifyContainment, main };

// When the vendored copy at <core>/launcher/launch.js is executed by the OS
// scheduler, run main with the real argv.
if (require.main === module) {
  main(process.argv.slice(2));
}

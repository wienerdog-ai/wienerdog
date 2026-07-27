'use strict';

/**
 * Out-of-tree launcher (audit A7 findings F1/F2/F3, ADR-0028, WP-157).
 *
 * The OS scheduler entries invoke THIS file — placed by vendor.writeLauncher at
 * `<core>/launcher/launch.js`, OUTSIDE the mutable `app/current` tree — instead
 * of the vendored bin directly. Before it spawns Node or the model it verifies:
 *   1. current containment + user ownership (prod);
 *   2. the live app tree content-addresses to the descriptor's treeDigest;
 *   3. prod/dev stance matches, where the LIVE stance is decided by CONTAINMENT
 *      alone — an install is dev only when `app/current` resolves OUTSIDE
 *      `<core>/app` — so no signal an A7-scoped data write into the app tree can
 *      produce (a planted `.git`, `WIENERDOG_DEV`) selects the reduced path, and
 *      a bound/live disagreement refuses in EITHER direction
 *      (WP-stance-authority-containment, Table A/Table B);
 *   4. the re-derived descriptor digest equals the digest bound into the OS
 *      entry (`--expect-digest`) — the independent anchor that catches a scoped
 *      `config.yaml` `run`/`model`/`timeout`/pin edit made without `sync`.
 * ANY mismatch ⇒ a code-owned durable alert + non-zero exit + ZERO app/model spawn.
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
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

/** @param {Buffer|string} b @returns {string} hex sha256 */
function sha256(b) {
  return crypto.createHash('sha256').update(b).digest('hex');
}

/**
 * The ANCHORED core — the launcher's OWN on-disk location, not ambient
 * `WIENERDOG_HOME` (A7 hardening pass, ADR-0028). The launcher is vendored at
 * `<core>/launcher/launch.js` and the OS entry invokes it by absolute path, so
 * `path.dirname(path.dirname(<launcher file>))` is the registration-time core an
 * attacker cannot relocate with an `environment.d`/`launchctl setenv`
 * `WIENERDOG_HOME` write. The OS entry ALSO binds `WIENERDOG_HOME=<core>` (so the
 * child's `getPaths` agrees), but the launcher does not TRUST that env value —
 * it re-derives the core from its own path and re-asserts it into the child env.
 * @param {string} launcherFile  the launcher's absolute path (default __filename)
 * @returns {string} the anchored core dir
 */
function anchoredCore(launcherFile = __filename) {
  return path.dirname(path.dirname(launcherFile));
}

/** Build the inlined core paths from an ALREADY-ANCHORED core — verification,
 *  the app tree, and the durable refuse-alert state dir all hang off it, never an
 *  ambient-`WIENERDOG_HOME`-derived one.
 *  @param {string} core @returns {{core:string, state:string, appDir:string, appCurrent:string}} */
function corePathsFrom(core) {
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

/** Content-address a resolved tree INJECTIVELY: sha256 over the canonical JSON
 *  of the `[posixRelpath, sha256(bytes)]` pairs, sorted by relpath, for every
 *  regular file (symlinks/dirs excluded). JSON.stringify escapes `\n`/`"` so no
 *  filename can forge a record boundary. MUST match src/scheduler/descriptor.js
 *  appTreeDigestOf EXACTLY (both copies move together — WP-156 F6/A3).
 *  @param {string} root  already-realpath-resolved dir @returns {string} 'sha256:…' */
function appTreeDigestOf(root) {
  /** @type {Array<[string, string]>} */
  const pairs = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) walk(full, childRel);
      else if (e.isFile()) pairs.push([childRel, sha256(fs.readFileSync(full))]);
    }
  };
  walk(root, '');
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return `sha256:${sha256(JSON.stringify(pairs))}`;
}

/** Fire-time LIVE stance, decided by CONTAINMENT of `app/current` inside
 *  `<core>/app` — the one property an A7-scoped DATA write into the app tree
 *  cannot forge (ADR-0028 amendment §3/§4, WP-stance-authority-containment
 *  Table A). Consults NO signal inside the tree: not `.git`, not
 *  `env.WIENERDOG_DEV`, not any file under `app/current`. Fails CLOSED: an
 *  unresolvable `<core>/app` or `app/current` ⇒ 'prod', the ENFORCED path —
 *  `containedIn` alone returns false there, which as a stance would be the
 *  fail-OPEN direction, so the resolution is guarded explicitly.
 *  A deliberate self-contained duplicate of vendor.installStance (this file
 *  cannot require code from the tree it is verifying); a cross-implementation
 *  test pins the two together.
 *  @param {{appDir:string, appCurrent:string}} p @returns {'prod'|'dev'} */
function liveStance(p) {
  try {
    fs.realpathSync(p.appDir);
    fs.realpathSync(p.appCurrent);
  } catch {
    return 'prod';
  }
  return containedIn(p.appDir, p.appCurrent) ? 'prod' : 'dev';
}

/** Minimal durable alert append (code-owned reason — no secrets, so no
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

/** Build the env used to RE-DERIVE the descriptor digest at fire time. Binds the
 *  ANCHORED core into WIENERDOG_HOME (A7 hardening pass) so the re-derivation reads
 *  config/pins from the registration-time core, never an ambient-WIENERDOG_HOME-
 *  relocated one. Binds the authorized home (digest-covered, WP-157 R4/A10) so a
 *  hostile ambient HOME cannot relocate the credential/config root without drifting
 *  the digest, and drops WIENERDOG_DEV — now purely DEFENCE IN DEPTH against
 *  reintroduction, since no code under `src/` reads that variable any more: the
 *  stance is decided by containment at both mint and fire time
 *  (WP-stance-authority-containment, Table D). Code-loading vars are irrelevant
 *  to a pure digest re-derivation but are dropped for cleanliness (F8).
 *  @param {NodeJS.ProcessEnv} env @param {string|undefined} boundHome
 *  @param {string} boundCore  the anchored core → WIENERDOG_HOME
 *  @returns {NodeJS.ProcessEnv} */
function derivationEnv(env, boundHome, boundCore) {
  const e = { ...env };
  delete e.WIENERDOG_DEV;
  delete e.NODE_OPTIONS;
  delete e.NODE_PATH;
  delete e.CLAUDE_CONFIG_DIR;
  delete e.CODEX_HOME;
  delete e.ANTHROPIC_API_KEY;
  if (boundCore !== undefined) e.WIENERDOG_HOME = boundCore;
  if (boundHome !== undefined) {
    e.HOME = boundHome;
    e.USERPROFILE = boundHome;
  }
  return e;
}

/** Re-derive the descriptor digest from the LIVE inputs, requiring the derivation
 *  code from the (already integrity-verified, or dev) app tree. Returns undefined
 *  when no job of that name exists. THROWS on any require/derivation error — the
 *  caller's try/catch converts it to a durable-alert refusal (F13).
 *  @param {string} target realpath of app/current @param {string} name
 *  @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform
 *  @returns {string|undefined} */
function reDeriveDigest(target, name, env, platform) {
  const getPaths = require(path.join(target, 'src', 'core', 'paths')).getPaths;
  const { findJob } = require(path.join(target, 'src', 'scheduler', 'jobs'));
  const { deriveDescriptorDigest } = require(path.join(target, 'src', 'scheduler', 'descriptor'));
  const fullPaths = getPaths(env);
  const job = findJob(fullPaths, name);
  if (!job) return undefined;
  return deriveDescriptorDigest(fullPaths, job, { platform, env });
}

/**
 * Pure verifier — reads live state, performs NO spawn. The ENTIRE verdict
 * computation is wrapped so ANY exception (unreadable/renamed file mid-walk,
 * a failed lazy require) becomes a fixed refusal the caller turns into a durable
 * alert — never a bare throw that looks like a missed job (F13).
 * @param {{core:string, state:string, appDir:string, appCurrent:string}} p  inlined core paths
 * @param {string} name  job name (never the '--catch-up' sentinel — main handles that)
 * @param {{descriptorPath:string, expectDigest:string, env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform}} o
 * @returns {{ok:true, command:string, args:string[], home?:string}|{ok:false, remedy:'sync'|'reinstall', reason:string}}
 */
function verifyAndResolve(p, name, o) {
  const env = o.env || process.env;
  const platform = o.platform || process.platform;
  /** Has the tie-back check (dev: bound-root identity; prod: content address)
   *  already EXECUTED AND PASSED on the path we are on? Block R-P. */
  let tied = false;
  try {
    const descriptor = readDescriptorFile(o.descriptorPath);
    if (!descriptor) return { ok: false, remedy: 'reinstall', reason: `descriptor ${o.descriptorPath} is missing or unreadable` };
    const stance = descriptor.appRelease && descriptor.appRelease.stance;
    const boundHome = typeof descriptor.home === 'string' ? descriptor.home : undefined;

    let target;
    try {
      target = fs.realpathSync(p.appCurrent);
    } catch (err) {
      return { ok: false, remedy: 'reinstall', reason: `cannot resolve app/current: ${err.message}` };
    }
    // Computed BEFORE any require from the app tree (the dev arm's
    // reDeriveDigest is the first thing that loads code from it).
    const live = liveStance(p);
    const derivEnv = derivationEnv(env, boundHome, p.core);
    const runArgs = [path.join(target, 'bin', 'wienerdog.js'), 'run-job', name];

    // Stance must match, in EITHER direction, and the live observation is
    // containment — not a `.git` an A7-scoped write can plant (Table A/Table B).
    // A prod entry over a non-contained tree is refused by verifyContainment
    // below (reason C2); a dev entry over a contained tree is refused here (C1).
    if (stance === 'dev') {
      if (live !== 'dev') {
        return { ok: false, remedy: 'reinstall', reason: `the descriptor was authorized for a dev checkout but app/current now resolves inside ${p.appDir}` };
      }
      // Dev containment: the live app/current must resolve to EXACTLY the bound
      // checkout root (dev vendors the checkout itself, OUTSIDE <core>/app, so the
      // prod containment invariant does not apply — but a repoint off the bound
      // root is still caught).
      const boundRoot = descriptor.appRelease && descriptor.appRelease.root;
      if (!boundRoot || path.resolve(target) !== path.resolve(boundRoot)) {
        return { ok: false, remedy: 'reinstall', reason: 'the dev app/current does not resolve to the authorized checkout root (repointed since sync)' };
      }
      tied = true; // dev arm: app/current proven to BE the authorized checkout root
      // Dev digest: the reduction excludes only treeDigest+version, so a tracked-
      // source edit stays runnable but ANY config-field edit (run/model/schedule/
      // home/…) drifts and refuses.
      const dd = reDeriveDigest(target, name, derivEnv, platform);
      if (dd === undefined) return { ok: false, remedy: 'sync', reason: `no job named "${name}" in config — nothing authorized to run` };
      if (dd !== o.expectDigest) {
        return { ok: false, remedy: 'sync', reason: 'the job descriptor changed since it was scheduled (run/model/timeout/schedule/home/pin drift) — a `wienerdog sync` is required to re-authorize it' };
      }
      return { ok: true, command: process.execPath, args: runArgs, home: boundHome };
    }
    if (stance !== 'prod') return { ok: false, remedy: 'reinstall', reason: `descriptor stance ${JSON.stringify(stance)} is not prod or dev` };

    // PROD verification. (No dedicated live-stance pre-check here: a prod
    // descriptor over a `live === 'dev'` tree is exactly a non-contained
    // `app/current`, which verifyContainment refuses on the next line with
    // reason C2 — one branch is better than two.)
    const contain = verifyContainment(p, platform);
    if (!contain.ok) return { ok: false, remedy: 'reinstall', reason: contain.why };

    const liveTree = appTreeDigestOf(target);
    const expectTree = descriptor.appRelease && descriptor.appRelease.treeDigest;
    if (liveTree !== expectTree) {
      return { ok: false, remedy: 'reinstall', reason: 'the live app tree does not match the descriptor (app files changed since sync)' };
    }
    tied = true; // prod arm: the live tree proven byte-identical to the descriptor

    // Tree verified byte-identical to the descriptor ⇒ it is now SAFE to require
    // the descriptor-derivation code from the verified tree. deriveDescriptorDigest
    // re-derives from LIVE config/pins/app and must equal the entry-bound digest —
    // catching a config.yaml run/model/timeout/schedule/home/pin edit made without
    // `sync`.
    const derived = reDeriveDigest(target, name, derivEnv, platform);
    if (derived === undefined) return { ok: false, remedy: 'sync', reason: `no job named "${name}" in config — nothing authorized to run` };
    if (derived !== o.expectDigest) {
      return { ok: false, remedy: 'sync', reason: 'the job descriptor changed since it was scheduled (run/model/timeout/schedule/home/pin/app drift) — a `wienerdog sync` is required to re-authorize it' };
    }

    return { ok: true, command: process.execPath, args: runArgs, home: boundHome };
  } catch (err) {
    // Table S row 12 — the ONLY site whose class is not a literal.
    return { ok: false, remedy: tied ? 'sync' : 'reinstall', reason: `integrity check errored: ${err.message}` };
  }
}

/**
 * Verify + resolve the catch-up spawn. WP-157 ships catch-up as an explicitly-
 * INCOMPLETE intermediate: it enforces containment + the app-tree hash against the
 * entry-bound `--expect-digest`, but NOT per-job descriptor authorization (that is
 * WP-catchup-per-job-authorization). There is deliberately NO dev early-return: an inherited env or a
 * planted `.git` can no longer skip the tree-hash check (F10). A dev install
 * (whose `current` legitimately resolves OUTSIDE `<core>/app`) fails containment
 * and refuses here — fail-closed for the catch-up path, acceptable for the
 * intermediate (the per-job dev fire path still runs). The whole computation is
 * wrapped so any fs error becomes a refusal, never a bare throw (F13).
 * WP-catchup-per-job-authorization: the loaded catch-up registration also binds a per-job digest MAP
 * (`--job-digests <base64url>`, macOS + Windows). The launcher treats it as an
 * OPAQUE token — it NEVER decodes/validates the map and NEVER reads a per-job entry
 * file to obtain a digest; it merely FORWARDS the loaded token into the catch-up
 * runner argv, where the bounded decoder + union-authorization live. `jobDigests` is
 * the LAST param so WP-157's 4-arg callers stay byte-compatible.
 * @param {{appDir:string, appCurrent:string}} p @param {string} expectDigest
 * @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform
 * @param {string} [jobDigests]  opaque base64url map token from the loaded entry
 * @returns {{ok:true, command:string, args:string[]}|{ok:false, remedy:'sync'|'reinstall', reason:string}}
 */
function verifyCatchup(p, expectDigest, env, platform, jobDigests) {
  try {
    let target;
    try {
      target = fs.realpathSync(p.appCurrent);
    } catch (err) {
      return { ok: false, remedy: 'reinstall', reason: `cannot resolve app/current: ${err.message}` };
    }
    const runArgs = [path.join(target, 'bin', 'wienerdog.js'), 'run-job', '--catch-up'];
    if (typeof jobDigests === 'string' && jobDigests !== '') runArgs.push('--job-digests', jobDigests);
    const contain = verifyContainment(p, platform);
    if (!contain.ok) return { ok: false, remedy: 'reinstall', reason: contain.why };
    if (appTreeDigestOf(target) !== expectDigest) {
      return { ok: false, remedy: 'reinstall', reason: 'the live app tree does not match the scheduled digest (app files changed since sync)' };
    }
    return { ok: true, command: process.execPath, args: runArgs };
  } catch (err) {
    return { ok: false, remedy: 'reinstall', reason: `integrity check errored: ${err.message}` };
  }
}

/** Boolean flags (present ⇒ true, consume NO following token). */
const BOOL_FLAGS = new Set(['catch-up']);
/** Value-taking flags (consume argv[i+1]). `--job-digests` (WP-catchup-per-job-authorization) carries
 *  the opaque base64url per-job digest map bound into the catch-up registration. */
const VALUE_FLAGS = new Set(['descriptor', 'expect-digest', 'job-digests']);

/** Schema-aware argv parse (WP-157 F11). `--catch-up` is boolean; `--descriptor`
 *  and `--expect-digest` take a value; ANY unknown `--flag` fails closed (returns
 *  an `error`). This fixes the bug where the old value-taking `--catch-up` ate the
 *  following `--expect-digest`, making every prod catch-up refuse.
 *  @param {string[]} argv
 *  @returns {{positionals:string[], flags:Record<string,string|boolean>, error?:string}} */
function parseArgv(argv) {
  const positionals = [];
  /** @type {Record<string,string|boolean>} */ const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (BOOL_FLAGS.has(key)) {
        flags[key] = true;
      } else if (VALUE_FLAGS.has(key)) {
        flags[key] = argv[++i];
      } else {
        return { positionals, flags, error: `unknown flag ${a}` };
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

/** The two refusal remedy classes and the sentence each one ends the banner with
 *  (WP-refusal-remedy-discriminator, Table R). The class is chosen by the
 *  verifier from WHERE in the verification flow it refused (Table S) — never by
 *  matching the human-readable reason text.
 *  @type {{sync: string, reinstall: string}} */
const REMEDY_TAIL = {
  sync: 'If the change was intentional, run `wienerdog sync`; otherwise investigate.',
  reinstall:
    'Do not run `wienerdog sync` — this check could not confirm the app files are ' +
    'the ones you installed, so syncing is not the safe next step. ' +
    'Reinstall Wienerdog from a trusted source, then investigate.',
};

/** The full refusal banner. FAILS CLOSED on the remedy: only the exact string
 *  'sync' selects the permissive tail, so an absent, empty, unknown or
 *  object-key-shaped value ('__proto__', 'constructor', …) gets the conservative
 *  'reinstall' tail. Normalizes BEFORE indexing, so no caller-supplied string is
 *  ever used as a lookup key.
 *  @param {string} jobName @param {string} why @param {string} [remedy]
 *  @returns {string} */
function refusalText(jobName, why, remedy) {
  const tail = REMEDY_TAIL[remedy === 'sync' ? 'sync' : 'reinstall'];
  return (
    `wienerdog: refusing to run "${jobName}" — ${why} (integrity mismatch); no job was run. ` +
    `This alert will appear in your next digest. ${tail}`
  );
}

/** The remedy a verdict ASKS for — read only if the verdict OWNS the field.
 *  A refusal return site that forgets to set `remedy` must not INHERIT one:
 *  `verdict.remedy` alone resolves through the prototype chain, so a single
 *  `Object.prototype.remedy = 'sync'` anywhere in the process would silently
 *  turn every unclassified future refusal into a `sync` recommendation. The
 *  ownership check is what makes refusalText's fail-closed default actually
 *  reachable. @param {object} verdict @returns {string|undefined} */
function remedyOf(verdict) {
  return verdict && Object.hasOwn(verdict, 'remedy') ? verdict.remedy : undefined;
}

/**
 * CLI entry the OS scheduler invokes:
 *   node <core>/launcher/launch.js <name> --descriptor <p> --expect-digest <d>
 *   node <core>/launcher/launch.js --catch-up --expect-digest <d> [--job-digests <b64>]
 * ok ⇒ spawn `node <currentBin> run-job <name|--catch-up>` (inherit stdio; exit
 * with the child's code) — the ONLY place a model/app spawn happens. refuse ⇒
 * append a code-owned durable alert, write the reason to stderr, exit NON-ZERO,
 * spawn NOTHING.
 * @param {string[]} argv  process.argv.slice(2)
 * @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, spawn?:typeof spawnSync,
 *          exit?:(code:number)=>void, core?:string, launcherFile?:string}} [opts]
 *   test seams; production passes none. `core`/`launcherFile` let a unit test
 *   pin the anchored core (production derives it from the launcher's own path).
 * @returns {number} the exit code (also passed to opts.exit / process.exit)
 */
function main(argv, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const spawn = opts.spawn || spawnSync;
  const exit = opts.exit || ((code) => process.exit(code));
  // The core is ANCHORED to the launcher's own on-disk location (A7 hardening
  // pass) — an ambient/`environment.d` WIENERDOG_HOME cannot relocate verification
  // state or the durable refuse alert. The OS entry also binds WIENERDOG_HOME, but
  // the launcher does not trust that env value for its own paths.
  const core = opts.core || anchoredCore(opts.launcherFile);
  const p = corePathsFrom(core);
  const { positionals, flags, error } = parseArgv(argv);
  const isCatchup = flags['catch-up'] === true;
  const name = isCatchup ? '--catch-up' : positionals[0];

  /** Refuse: durable alert (never a bare throw — F13) pointing at the real surface
   *  (the next digest banner) plus the remedy for THIS refusal's class, chosen from
   *  the verdict's structured `remedy` field, never from the reason text
   *  (WP-refusal-remedy-discriminator, Table R). `wienerdog doctor` is still never
   *  named — it reads no A7 state (F27). Zero spawn, non-zero exit. */
  const refuse = (jobName, why, remedy) => {
    const reason = refusalText(jobName, why, remedy);
    appendRefuseAlert(p, jobName, reason);
    process.stderr.write(`${reason}\n`);
    exit(1);
    return 1;
  };

  if (error) return refuse(name || 'unknown', error, 'reinstall');

  const verdict = isCatchup
    ? verifyCatchup(p, flags['expect-digest'], env, platform, flags['job-digests'])
    : verifyAndResolve(p, name, {
        descriptorPath: flags.descriptor,
        expectDigest: flags['expect-digest'],
        env,
        platform,
      });

  if (!verdict.ok) return refuse(name, verdict.reason, remedyOf(verdict));

  // Child spawn env (defense-in-depth, F8 + A10/R4 + A7 hardening pass): scrub the
  // code-loading Node vars (they run attacker code in a child node before its own
  // main) and the ambient credential/config roots (reconstructed deterministically
  // by run-job's buildCleanEnv); re-assert the ANCHORED core into WIENERDOG_HOME so
  // an ambient value (or a copied byte-identical tree) cannot make the child
  // relocate its state/locks/logs; and re-assert the digest-bound authorized home
  // so an ambient HOME/USERPROFILE cannot move the credential/config account.
  // (Catch-up has no per-job descriptor, so verdict.home is undefined and the child
  // keeps the OS-entry-bound HOME — the intentional WP-157-review asymmetry.)
  const childEnv = { ...env };
  delete childEnv.NODE_OPTIONS;
  delete childEnv.NODE_PATH;
  delete childEnv.CLAUDE_CONFIG_DIR;
  delete childEnv.CODEX_HOME;
  delete childEnv.ANTHROPIC_API_KEY;
  childEnv.WIENERDOG_HOME = core;
  if (verdict.home !== undefined) {
    childEnv.HOME = verdict.home;
    if (platform === 'win32') childEnv.USERPROFILE = verdict.home;
  }

  const r = spawn(verdict.command, verdict.args, { stdio: 'inherit', env: childEnv });
  const code = r && typeof r.status === 'number' ? r.status : 1;
  exit(code);
  return code;
}

module.exports = { verifyAndResolve, verifyCatchup, appTreeDigestOf, verifyContainment, liveStance, parseArgv, refusalText, remedyOf, main };

// When the vendored copy at <core>/launcher/launch.js is executed by the OS
// scheduler, run main with the real argv.
if (require.main === module) {
  main(process.argv.slice(2));
}

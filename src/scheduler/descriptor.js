'use strict';

/**
 * Canonical digest-bound job descriptor (audit A7 finding F1, ADR-0028, WP-156).
 *
 * A scheduled OS entry is static (`node <bin> run-job <name>`); what the fire
 * actually does is resolved at run time from mutable inputs (config.yaml's
 * `run` action + whatever sits under app/current). The descriptor is the
 * code-owned, deterministic record of exactly what a job was AUTHORIZED to run
 * when it was scheduled/synced: run action, capability profile, prompt/skill
 * content hash, the EFFECTIVE dream timeout, the configured model, vault root,
 * the WP-154 pinned executable identities, and a content address of the
 * vendored app tree. It is serialized canonically, reduced to a sha256
 * descriptor digest, and re-derivable from live inputs — so a later scoped
 * config/app edit yields a DIFFERENT digest than the one captured at
 * authorization time. WP-157 (the out-of-tree launcher) enforces the digest at
 * fire time: any mismatch ⇒ durable alert + zero model spawn; the single
 * remedy is an explicit `wienerdog sync`.
 *
 * Deliberately EXCLUDED from the descriptor: pin `version`/realpaths (they
 * change on every Claude auto-update and would turn legitimate updates into
 * fire-time alarms — the pin's structural verification still runs at spawn).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { WienerdogError } = require('../core/errors');
const { writeFilePrivate } = require('../core/private-fs');
const { readDreamConfig } = require('../core/dream/config');

/** @param {Buffer|string} bytes @returns {string} hex sha256 */
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Content-address a resolved tree INJECTIVELY (audit A7 F6/A3): sha256 over the
 * canonical JSON of the `[relpath, sha256(file bytes)]` pairs, sorted by relpath,
 * for every regular file under `root` (symlinks/dirs excluded; relpaths
 * POSIX-normalized). `JSON.stringify` escapes `\n`/`"`, so no filename can forge
 * a record boundary the old `${relpath}\n${hash}\n` concat allowed. MUST stay
 * byte-identical to `src/scheduler/launcher.js appTreeDigestOf` — the launcher
 * has its own self-contained copy it compares against at fire time.
 * @param {string} root  already-realpath-resolved dir @returns {string} 'sha256:…'
 */
function appTreeDigestOf(root) {
  /** @type {Array<[string, string]>} */
  const pairs = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const childRel = rel === '' ? e.name : `${rel}/${e.name}`; // POSIX separators, always
      if (e.isDirectory()) walk(full, childRel);
      else if (e.isFile()) pairs.push([childRel, sha256(fs.readFileSync(full))]);
      // symlinks / specials excluded — content, not link topology, is addressed
    }
  };
  walk(root, '');
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return `sha256:${sha256(JSON.stringify(pairs))}`;
}

/**
 * Content-address the vendored app tree under the resolved target of
 * `<core>/app/current`. Deterministic across machines for identical bytes.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @returns {string} 'sha256:…'
 * @throws {WienerdogError} when app/current is missing/unresolvable
 */
function appTreeDigest(paths) {
  const { currentLink } = require('../core/vendor');
  let root;
  try {
    root = fs.realpathSync(currentLink(paths));
  } catch (err) {
    throw new WienerdogError(`cannot resolve the vendored app at ${currentLink(paths)}: ${err.message}`);
  }
  return appTreeDigestOf(root);
}

/**
 * The job's capability profile id + verified prompt/skill content hash.
 * builtin:dream → profile 'dream'; promptHash combines the DREAM_PROMPT
 * template (rendered with fixed placeholder tokens — a pure template capture)
 * with the integrity-checked vendored dream-skill body. skill:<id> → the
 * profile whose skillId matches, and the WP-131 verified skill-body hash.
 * Unknown run actions THROW (fail closed — nothing unprofiled is describable).
 * @param {string} run
 * @returns {{profileId:string, promptHash:string}}
 */
function profileAndPromptHash(run) {
  const sep = run.indexOf(':');
  const kind = sep === -1 ? run : run.slice(0, sep);
  const rest = sep === -1 ? '' : run.slice(sep + 1);
  const { loadVendoredSkill } = require('../core/runtime-settings');
  if (kind === 'builtin') {
    if (rest !== 'dream') throw new WienerdogError(`unknown builtin job: ${rest}`);
    const { DREAM_PROMPT } = require('../core/dream/brain');
    const templateHash = sha256(DREAM_PROMPT('<scratch>', '<vault>', '<date>'));
    const skillHash = sha256(loadVendoredSkill('wienerdog-dream')); // throws on tamper (fail closed)
    return { profileId: 'dream', promptHash: `sha256:${sha256(templateHash + skillHash)}` };
  }
  if (kind === 'skill') {
    const { PROFILES } = require('../core/runtime-profile');
    const profileId = Object.keys(PROFILES).find((id) => PROFILES[id].skillId === rest);
    if (!profileId) throw new WienerdogError(`no capability profile maps to skill "${rest}" — refusing to describe it`);
    return { profileId, promptHash: `sha256:${sha256(loadVendoredSkill(rest))}` };
  }
  throw new WienerdogError(`unknown job run kind in "${run}"`);
}

/**
 * Build the descriptor for a job from LIVE inputs (config run/model/timeout,
 * pins, app tree, prompt/skill body).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{name:string, run:string, at?:string, timeoutMinutes?:number}} job
 * @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, vaultRoot?:string,
 *          model?:string|null, timeoutMs?:number, maxInputBytes?:number,
 *          outerTimeoutMs?:number, vaultLayout?:object, home?:string,
 *          timezone?:string}} [opts]
 *   `vaultRoot`, `model`, `timeoutMs`, and `maxInputBytes` all come from the same
 *   `readDreamConfig(paths.config)` read: vaultRoot=cfg.vault, model=cfg.model
 *   (`dream_model`, null when unset), timeoutMs=cfg.timeoutMs — the EFFECTIVE
 *   INNER dream watchdog + lock-deadline timeout (`dream_timeout_minutes`,
 *   default 20 min ⇒ 1_200_000 ms). NOT `job.timeoutMinutes`. `outerTimeoutMs`
 *   is the EFFECTIVE run-job OUTER watchdog (resolved from job.timeoutMinutes,
 *   default 15 min). `vaultLayout`=readVaultLayout(config). `home`=the bound
 *   authorized home (paths.home). Passing any in `opts` is a test override.
 * @returns {object} the descriptor (canonicalize sorts keys — field order here
 *   is readability only)
 */
function buildDescriptor(paths, job, opts = {}) {
  const env = opts.env || process.env;
  const cfgNeeded =
    opts.vaultRoot === undefined ||
    opts.timeoutMs === undefined ||
    opts.model === undefined ||
    opts.maxInputBytes === undefined;
  const cfg = cfgNeeded ? readDreamConfig(paths.config) : null;
  const { profileId, promptHash } = profileAndPromptHash(job.run);

  // WP-154 pins: STABLE identity fields only — version/pinnedAt deliberately
  // excluded (they advance on every Claude auto-update and would drift the
  // digest, turning legitimate updates into WP-157 fire-time alarms).
  const { loadPins } = require('../core/exec-identity');
  const pins = loadPins(paths);
  /** @type {Record<string, {commandPath:string, installDir:string}>} */
  const exec = {};
  for (const name of Object.keys(pins)) {
    exec[name] = { commandPath: pins[name].commandPath, installDir: pins[name].installDir };
  }

  // [R2:F1 / A1b] REFUSE to bind a partial exec map for the dream job. A valid
  // partial store (git pinned, claude briefly absent) must NOT be authorized:
  // the launcher's honest-boundary backstop relies on `exec` being NON-EMPTY
  // (claude + git) at bind time, so a later-planted `~/.local/bin/claude` would
  // digest-match an exec map that has no claude entry to drift. codex is optional
  // until a codex job is authorized. This gates BOTH the write (writeDescriptor)
  // and the entry's expect-digest (jobLaunchBinding → deriveDescriptorDigest),
  // so an unpinned install fails closed at fire time rather than binding a
  // bypassing partial.
  if (job.run === 'builtin:dream') {
    for (const req of ['claude', 'git']) {
      if (!exec[req]) {
        throw new WienerdogError(
          `refusing to authorize the dream job: ${req} is not pinned — install ${req} and run ` +
            '`wienerdog sync` so its identity is recorded before the job is bound.'
        );
      }
    }
  }

  const { currentLink, readVersion, isDevCheckout } = require('../core/vendor');
  let appRoot;
  try {
    appRoot = fs.realpathSync(currentLink(paths));
  } catch (err) {
    throw new WienerdogError(`cannot resolve the vendored app at ${currentLink(paths)}: ${err.message}`);
  }

  const outerMin = job.timeoutMinutes > 0 ? job.timeoutMinutes : 15;
  const vaultLayout =
    opts.vaultLayout !== undefined ? opts.vaultLayout : require('../core/layout').readVaultLayout(paths.config);
  const stance = isDevCheckout(appRoot, env) ? 'dev' : 'prod';

  return {
    schema: 1,
    job: job.name,
    run: job.run,
    profileId,
    promptHash,
    // Inner brain watchdog + lock deadline (dream_timeout_minutes).
    timeoutMs: opts.timeoutMs !== undefined ? opts.timeoutMs : cfg.timeoutMs,
    // Outer run-job watchdog (job.timeoutMinutes resolved; F5/R2:F5).
    outerTimeoutMs: opts.outerTimeoutMs !== undefined ? opts.outerTimeoutMs : outerMin * 60_000,
    // Corpus size fed to the model (dream_max_input_bytes; F5/R2:F5).
    maxInputBytes: opts.maxInputBytes !== undefined ? opts.maxInputBytes : cfg.maxInputBytes,
    model: opts.model !== undefined ? opts.model : cfg.model,
    // Effective vault layout — shapes DREAM_PROMPT + the model's write locations
    // (F5/A2). Canonicalize sorts its keys, so it folds deterministically.
    vaultLayout,
    vaultRoot: opts.vaultRoot !== undefined ? opts.vaultRoot : cfg.vault,
    // The BOUND authorized home — its parent reconstructs the cred/config roots
    // (A7/R4:#2); a hostile HOME must drift the digest.
    home: opts.home !== undefined ? opts.home : paths.home,
    // Effective schedule + timezone semantics (A6/R3:#3) — an `at` rewrite drifts.
    schedule: { at: job.at !== undefined ? job.at : null, timezone: opts.timezone || 'local' },
    node: process.execPath,
    exec,
    appRelease:
      stance === 'dev'
        ? // Dev checkouts are live-edited: the digest reduces appRelease to
          // {stance, root} (excludes treeDigest+version) so a tracked-source edit
          // stays runnable; every OTHER field is retained + digest-covered.
          { version: readVersion(appRoot), treeDigest: appTreeDigest(paths), stance: 'dev', root: appRoot }
        : { version: readVersion(appRoot), treeDigest: appTreeDigest(paths), stance: 'prod' },
  };
}

/**
 * Stable serialization: recursively key-sorted JSON with no insignificant
 * whitespace/locale/number variance — the digest input.
 * @param {object} d @returns {string}
 */
function canonicalize(d) {
  const sortValue = (v) => {
    if (Array.isArray(v)) return v.map(sortValue);
    if (v && typeof v === 'object') {
      /** @type {Record<string, any>} */
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sortValue(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sortValue(d));
}

/**
 * Apply the DEV-STANCE reduction before digesting: for a dev descriptor the
 * digest reduces `appRelease` to `{stance:'dev', root}` (excludes the unstable
 * `treeDigest`+`version`), so a tracked-source edit does NOT drift the digest but
 * EVERY other field (run/model/vaultLayout/schedule/home/…) still does. A prod
 * descriptor is digested whole. [R2:F10/A5/R15]
 * @param {object} d @returns {object}
 */
function reduceForDigest(d) {
  if (d && d.appRelease && d.appRelease.stance === 'dev') {
    return { ...d, appRelease: { stance: 'dev', root: d.appRelease.root } };
  }
  return d;
}

/** @param {object} d @returns {string} 'sha256:' + sha256(canonicalize(reduced d)) */
function descriptorDigest(d) {
  return `sha256:${sha256(canonicalize(reduceForDigest(d)))}`;
}

/**
 * Absolute path of a job's descriptor file.
 * @param {import('../core/paths').WienerdogPaths} paths @param {string} name
 * @returns {string} `<core>/state/descriptors/<name>.json`
 */
function descriptorPath(paths, name) {
  return path.join(paths.state, 'descriptors', `${name}.json`);
}

/**
 * Build + write the descriptor 0600 (atomic temp+rename via writeFilePrivate).
 * Idempotent: unchanged inputs ⇒ byte-identical file (equality short-circuit,
 * changed:false). The caller (schedule.js) records the `file` manifest entry —
 * this module never touches the manifest (no scheduler↔core import cycle).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{name:string, run:string, timeoutMinutes?:number}} job
 * @param {object} [opts]  forwarded to buildDescriptor
 * @returns {{path:string, digest:string, changed:boolean}}
 */
function writeDescriptor(paths, job, opts = {}) {
  const d = buildDescriptor(paths, job, opts);
  const digest = descriptorDigest(d);
  const dest = descriptorPath(paths, job.name);
  const bytes = `${canonicalize(d)}\n`;
  let same = false;
  try {
    same = fs.readFileSync(dest, 'utf8') === bytes;
  } catch {
    same = false;
  }
  if (!same) writeFilePrivate(dest, bytes);
  return { path: dest, digest, changed: !same };
}

/**
 * Re-derive the digest from live inputs (buildDescriptor → descriptorDigest)
 * WITHOUT reading the stored file — the drift-comparison primitive WP-157
 * uses: a scoped config/app edit since authorization yields a different value.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{name:string, run:string, timeoutMinutes?:number}} job
 * @param {object} [opts]
 * @returns {string} 'sha256:…'
 */
function deriveDescriptorDigest(paths, job, opts = {}) {
  return descriptorDigest(buildDescriptor(paths, job, opts));
}

module.exports = {
  appTreeDigest,
  appTreeDigestOf,
  buildDescriptor,
  canonicalize,
  descriptorDigest,
  descriptorPath,
  writeDescriptor,
  deriveDescriptorDigest,
};

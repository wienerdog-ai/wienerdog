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
 * Content-address the vendored app tree: sha256 over the sorted list of
 * `${relpath}\n${sha256(file bytes)}\n` for every regular file under the
 * resolved target of `<core>/app/current` (symlinks/dirs excluded; relpaths
 * POSIX-normalized and sorted). Deterministic across machines for identical
 * bytes.
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
  /** @type {string[]} */
  const entries = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const childRel = rel === '' ? e.name : `${rel}/${e.name}`; // POSIX separators, always
      if (e.isDirectory()) walk(full, childRel);
      else if (e.isFile()) entries.push(`${childRel}\n${sha256(fs.readFileSync(full))}\n`);
      // symlinks / specials excluded — content, not link topology, is addressed
    }
  };
  walk(root, '');
  entries.sort();
  return `sha256:${sha256(entries.join(''))}`;
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
 * @param {{name:string, run:string, timeoutMinutes?:number}} job
 * @param {{env?:NodeJS.ProcessEnv, platform?:NodeJS.Platform, vaultRoot?:string,
 *          model?:string|null, timeoutMs?:number}} [opts]
 *   `vaultRoot`, `model`, and `timeoutMs` all come from the same
 *   `readDreamConfig(paths.config)` read: vaultRoot=cfg.vault, model=cfg.model
 *   (`dream_model`, null when unset), timeoutMs=cfg.timeoutMs — the EFFECTIVE
 *   dream watchdog + lock-deadline timeout (`dream_timeout_minutes`, default
 *   20 min ⇒ 1_200_000 ms). NOT `job.timeoutMinutes` (that governs only the
 *   run-job OUTER watchdog). Passing them in `opts` is a test override;
 *   production reads them from config.
 * @returns {object} the descriptor (canonicalize sorts keys — field order here
 *   is readability only)
 */
function buildDescriptor(paths, job, opts = {}) {
  const env = opts.env || process.env;
  const cfgNeeded = opts.vaultRoot === undefined || opts.timeoutMs === undefined || opts.model === undefined;
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

  const { currentLink, readVersion, isDevCheckout } = require('../core/vendor');
  let appRoot;
  try {
    appRoot = fs.realpathSync(currentLink(paths));
  } catch (err) {
    throw new WienerdogError(`cannot resolve the vendored app at ${currentLink(paths)}: ${err.message}`);
  }

  return {
    schema: 1,
    job: job.name,
    run: job.run,
    profileId,
    promptHash,
    timeoutMs: opts.timeoutMs !== undefined ? opts.timeoutMs : cfg.timeoutMs,
    model: opts.model !== undefined ? opts.model : cfg.model,
    vaultRoot: opts.vaultRoot !== undefined ? opts.vaultRoot : cfg.vault,
    node: process.execPath,
    exec,
    appRelease: {
      version: readVersion(appRoot),
      treeDigest: appTreeDigest(paths),
      // Dev checkouts are live-edited trees: the digest is computed but not
      // stable — WP-157 enforces integrity only for "prod"; record truthfully.
      stance: isDevCheckout(appRoot, env) ? 'dev' : 'prod',
    },
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

/** @param {object} d @returns {string} 'sha256:' + sha256(canonicalize(d)) */
function descriptorDigest(d) {
  return `sha256:${sha256(canonicalize(d))}`;
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
  buildDescriptor,
  canonicalize,
  descriptorDigest,
  descriptorPath,
  writeDescriptor,
  deriveDescriptorDigest,
};

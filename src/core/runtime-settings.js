'use strict';

/**
 * Hook-free settings profile + vendored-skill integrity for hermetic runs
 * (ADR-0025, audit A1 points 2 and 4, WP-129). Supplies two inputs the spawn
 * WPs (WP-130 dream, WP-131 routine) feed to WP-128's composeClaudeArgs:
 * the `settingsPath` (a Wienerdog-owned, inert settings.json) and the
 * `appendSystemPrompt` (the integrity-checked vendored skill body,
 * D-SKILL-LOAD).
 *
 * Reads shipped skill files and writes the settings asset; no network, no
 * child_process.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WienerdogError } = require('./errors');
const { mkdirPrivate, writeFilePrivate } = require('./private-fs');

/** The PACKAGED skill sources shipped with this release (NOT the mutable
 *  core/harness copies) — integrity is anchored against these bytes. */
const PKG_SKILLS_ROOT = path.resolve(__dirname, '..', '..', 'skills');

/**
 * The checked-in integrity anchor: skillId → sha256 hex of the canonical
 * skill body (the raw `skills/<skillId>/SKILL.md` bytes, no newline or
 * encoding normalization). Regenerated in the same PR whenever a vendored
 * operating skill legitimately changes. Covers exactly the 4 fixed operating
 * skills (dream + 3 catalog routines) — never mutable vault skills
 * (OWNER-APPROVED 2026-07-18).
 * @type {Record<string,string>}
 */
const SKILL_DIGESTS = require('./runtime-skill-digests.json');

/**
 * Wienerdog-owned runtime-profile asset dir under the core. 0700.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {string}
 */
function RUNTIME_DIR(paths) {
  return path.join(paths.core, 'runtime');
}

/**
 * The hook-free settings profile object. FROZEN, code-owned. Whatever a
 * future release adds, it NEVER re-enables hooks or names an ambient source.
 * `disableAllHooks` is defense-in-depth behind WP-128's ambient-source
 * exclusion (`--setting-sources ""`): a hook is never loaded, and any that
 * slipped in cannot fire.
 */
const HOOK_FREE_SETTINGS = Object.freeze({
  disableAllHooks: true,
  // No hooks, no plugins, no MCP servers, no permission grants — an empty,
  // inert settings profile whose ONLY job is to be the explicit --settings
  // input so no ambient user/project/local settings file is consulted
  // (audit A1 point 4).
});

/**
 * Idempotently write the hook-free settings profile to
 * core/runtime/settings.json at 0600 (umask-independent, atomic
 * temp+rename+chmod via writeFilePrivate). Running twice writes identical
 * bytes → zero changes.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {string} absolute settings-file path
 */
function ensureSettingsProfile(paths) {
  const dir = RUNTIME_DIR(paths);
  mkdirPrivate(dir);
  const dest = path.join(dir, 'settings.json');
  writeFilePrivate(dest, JSON.stringify(HOOK_FREE_SETTINGS, null, 2) + '\n');
  return dest;
}

/**
 * sha256 hex of a settings file's bytes (for the WP-132 run-evidence digest).
 * Returns the fixed 'missing' marker if the file cannot be read (fail-closed,
 * never throws).
 * @param {string} settingsPath
 * @returns {string}
 */
function settingsDigest(settingsPath) {
  let bytes;
  try {
    bytes = fs.readFileSync(settingsPath);
  } catch {
    return 'missing';
  }
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Load and integrity-check a vendored operating-skill body by skillId. The
 * CANONICAL body is the shipped `skills/<skillId>/SKILL.md` bytes; it is
 * sha256-hashed and compared to the checked-in digest — a mismatch throws
 * (fail closed): the job runs the exact reviewed text this release shipped,
 * or it does not run.
 * @param {string} skillId  e.g. 'wienerdog-dream'
 * @param {{skillsRoot?:string, digests?:Record<string,string>}} [o]  test seams
 * @returns {string} the verified skill body (D-SKILL-LOAD: fed to --append-system-prompt)
 * @throws {WienerdogError} on a missing skill, a missing digest entry, or a byte mismatch
 */
function loadVendoredSkill(skillId, o = {}) {
  const digests = o.digests || SKILL_DIGESTS;
  const expected = Object.prototype.hasOwnProperty.call(digests, skillId) ? digests[skillId] : null;
  if (!expected) {
    throw new WienerdogError(
      `no integrity digest for skill "${skillId}" — only the vendored operating skills can run, refusing`
    );
  }
  const skillPath = path.join(o.skillsRoot || PKG_SKILLS_ROOT, skillId, 'SKILL.md');
  let bytes;
  try {
    bytes = fs.readFileSync(skillPath);
  } catch {
    throw new WienerdogError(`vendored skill "${skillId}" is missing at ${skillPath} — refusing to run`);
  }
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    throw new WienerdogError(
      `vendored skill "${skillId}" does not match its reviewed digest (expected ${expected}, got ${actual}) — refusing to run tampered skill text`
    );
  }
  return bytes.toString('utf8');
}

/**
 * True iff the shipped skill's bytes match the checked-in digest.
 * Non-throwing form for doctor/preflight.
 * @param {string} skillId
 * @param {{skillsRoot?:string, digests?:Record<string,string>}} [o]  test seams
 * @returns {boolean}
 */
function verifySkillIntegrity(skillId, o = {}) {
  try {
    loadVendoredSkill(skillId, o);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  RUNTIME_DIR,
  HOOK_FREE_SETTINGS,
  ensureSettingsProfile,
  settingsDigest,
  loadVendoredSkill,
  verifySkillIntegrity,
};

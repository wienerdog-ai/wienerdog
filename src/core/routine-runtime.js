'use strict';

/**
 * Hermetic routine runtime (ADR-0025, audit A1 R1, WP-131). Maps a scheduled
 * `skill:<id>` job to its code-owned routine profile (WP-128) and composes the
 * hermetic run: minimal explicit tool allowlist, hook-free settings (WP-129),
 * integrity-checked vendored skill body, a fresh staging dir as the ONLY
 * writable root, and at most one broker MCP (the A2 seam). No spawn here — it
 * returns command+args+cwd for run-job.js to spawn (mirroring resolveCommand).
 *
 * This module does NOT check the capability gate: run-job.js calls
 * requireCapability(EXTERNAL_CONTENT_ROUTINE) FIRST (the A0 freeze), so in
 * production a routine still fails closed before any composition happens.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getProfile, composeClaudeArgs, RuntimeProfileError } = require('./runtime-profile');
const { RUNTIME_DIR, ensureSettingsProfile, loadVendoredSkill } = require('./runtime-settings');
const { mkdirPrivate } = require('./private-fs');

/**
 * Code-owned skill-id → routine-profile-id map. The ONLY bridge from a config
 * `skill:<id>` to a profile; an unmapped id fails closed (no arbitrary
 * `skill:<string>` dispatch — audit A1 point 1).
 */
const SKILL_TO_PROFILE = Object.freeze({
  'wienerdog-daily-digest': 'daily-digest',
  'wienerdog-inbox-triage': 'inbox-triage',
  'wienerdog-weekly-review': 'weekly-review',
});

/**
 * Resolve a skill id to its routine profile id against the frozen code-owned
 * map. Fails closed: an unmapped skill throws — a hand-edited config.yaml job
 * with a novel skill name cannot compose an argv, let alone spawn.
 * @param {string} skillId
 * @returns {string} routine profile id
 * @throws {RuntimeProfileError} on an unmapped skill
 */
function profileIdForSkill(skillId) {
  if (typeof skillId === 'string' && Object.prototype.hasOwnProperty.call(SKILL_TO_PROFILE, skillId)) {
    return SKILL_TO_PROFILE[skillId];
  }
  throw new RuntimeProfileError(
    `unknown routine skill "${String(skillId)}" — no code-owned routine profile maps to it, refusing to run`
  );
}

/**
 * Fresh, empty, 0700 staging dir for ONE routine run: the routine's cwd AND
 * its only writable output channel. Wiped+recreated per run (no cross-run
 * leakage). Under the core (disposable by uninstall, WP-068/ADR-0019).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {string} routineId  a code-owned profile id (never config-supplied)
 * @returns {string} absolute staging dir
 */
function ensureRoutineStaging(paths, routineId) {
  const dir = path.join(paths.state, 'routine-run', routineId);
  fs.rmSync(dir, { recursive: true, force: true });
  mkdirPrivate(dir);
  return dir;
}

/**
 * Absolute path to the routine's single broker MCP config, or null when the
 * profile is mcp:'empty' — or when the broker config does not exist yet.
 * THE A2 SEAM: A2 writes the credential-holding local stdio broker's MCP
 * config at core/runtime/broker-mcp.json. Until then the seam file is absent,
 * so this returns null and a broker-requiring routine fails closed in
 * composeClaudeArgs (RuntimeProfileError) — contained AND inert until A2
 * (D-BROKER-SEAM, OWNER-APPROVED 2026-07-18).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {import('./runtime-profile').RuntimeProfile} profile
 * @returns {string|null}
 */
function brokerMcpConfigPath(paths, profile) {
  if (profile.mcp !== 'broker') return null;
  const seam = path.join(RUNTIME_DIR(paths), 'broker-mcp.json');
  return fs.existsSync(seam) ? seam : null;
}

/**
 * Compose a routine's hermetic run (command + argv + cwd). Does NOT check the
 * capability gate — run-job.js does that FIRST (the A0 freeze). Fail closed on
 * an unmapped skill or a broker-requiring routine with no broker config (A2
 * not yet wired).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{name:string, run:string}} job   run == 'skill:<skillId>'
 * @returns {{command:string, args:string[], cwd:string, shell:false}}
 * @throws {RuntimeProfileError|import('./errors').WienerdogError}
 */
function composeRoutineRun(paths, job) {
  const skillId = job.run.slice(job.run.indexOf(':') + 1);
  const profile = getProfile(profileIdForSkill(skillId)); // fail closed on unknown
  const settingsPath = ensureSettingsProfile(paths);
  const cwd = ensureRoutineStaging(paths, profile.id);
  const args = composeClaudeArgs(profile, {
    prompt: `/${skillId}`, // the routine trigger
    addDirs: [cwd], // ONLY the staging dir is writable — no vault/home/secrets (D-ROUTINE-VAULT-READ)
    settingsPath,
    mcpConfigPath: brokerMcpConfigPath(paths, profile), // broker (A2) or null → fail closed if required
    model: null,
    appendSystemPrompt: loadVendoredSkill(skillId), // integrity-checked body (D-SKILL-LOAD)
  });
  return { command: 'claude', args, cwd, shell: false };
}

module.exports = {
  SKILL_TO_PROFILE,
  profileIdForSkill,
  ensureRoutineStaging,
  brokerMcpConfigPath,
  composeRoutineRun,
};

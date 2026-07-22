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
const { mkdirPrivate, writeFilePrivate } = require('./private-fs');
const { makeVaultSnapshot } = require('./vault-snapshot');
const { BROKER_SERVER_NAME } = require('../gws/broker/constants');

/** Per-server MCP timeout for the broker child. The run-job supervisor stays
 *  the single run-level timeout authority (CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0
 *  disables the client's auto-backgrounding); this bounds one hung tool call. */
const BROKER_MCP_TIMEOUT_MS = 120000;

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
 * Write the routine's single broker MCP config and return its absolute path
 * (null for a mcp:'empty' profile). THE A2 SEAM, FILLED (WP-141): the config
 * is regenerated per run at a PER-ROUTINE filename (D-BROKER-CONFIG-PATH —
 * two concurrent routines can never race each other into the wrong identity)
 * and embeds the routine id in the broker's spawn ARGV — the trusted launch
 * descriptor. The broker learns "I am daily-digest" from Wienerdog's code,
 * never from model input and never from env (closes audit F5;
 * SPIKE-env-inheritance is irrelevant to identity integrity).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {import('./runtime-profile').RuntimeProfile} profile
 * @returns {string|null}
 */
function ensureBrokerMcpConfig(paths, profile) {
  if (profile.mcp !== 'broker') return null;
  const gen = require('../scheduler/generators');
  const dest = path.join(RUNTIME_DIR(paths), `broker-mcp-${profile.id}.json`);
  const config = {
    mcpServers: {
      [BROKER_SERVER_NAME]: {
        command: gen.nodePath(),
        args: [gen.wienerdogBin(paths), 'gws', '_broker', '--routine', profile.id],
        // Identity is argv, credentials are files; env only re-asserts the
        // core location and keeps the run-job supervisor the single timeout
        // authority (no client-side auto-backgrounding).
        env: { WIENERDOG_HOME: paths.core, CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0' },
        timeout: BROKER_MCP_TIMEOUT_MS,
      },
    },
  };
  writeFilePrivate(dest, `${JSON.stringify(config, null, 2)}\n`);
  return dest;
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
  // Bounded read-only vault snapshot (D-VAULT-SNAPSHOT): the routine Reads a
  // copy inside its staging dir; the LIVE vault is never in --add-dir. Skips
  // are surfaced on stderr (→ the job log) — visible, never silent, never
  // fatal.
  const snapshot = makeVaultSnapshot(paths, profile.id, cwd);
  for (const s of snapshot.skipped) {
    process.stderr.write(`wienerdog: vault snapshot skipped ${s.file} (${s.reason})\n`);
  }
  const addDirs = [cwd]; // staging stays the SOLE writable target
  if (snapshot.snapshotDir) addDirs.push(snapshot.snapshotDir); // read intent only
  const args = composeClaudeArgs(profile, {
    // Plain-text trigger — NOT a bare `/${skillId}` slash command. Claude Code
    // ≥2.1.216 parses a prompt that is *only* a slash command as a command
    // lookup and hard-errors "Unknown command" on an unregistered one (the
    // hermetic `--setting-sources ''` run registers no skills), so the routine
    // brain never ran. The skill's instructions are delivered via
    // --append-system-prompt below; this line just tells the brain to start.
    prompt: `Run the ${skillId} routine now. Follow the instructions in your system prompt and use only your available tools.`,
    addDirs,
    settingsPath,
    mcpConfigPath: ensureBrokerMcpConfig(paths, profile), // the filled A2 seam (or null for mcp:'empty')
    model: null,
    appendSystemPrompt: loadVendoredSkill(skillId), // integrity-checked body (D-SKILL-LOAD)
  });
  return { command: 'claude', args, cwd, shell: false, snapshotSkipped: snapshot.skipped };
}

module.exports = {
  SKILL_TO_PROFILE,
  profileIdForSkill,
  ensureRoutineStaging,
  ensureBrokerMcpConfig,
  composeRoutineRun,
};

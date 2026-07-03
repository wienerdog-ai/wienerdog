'use strict';

const os = require('node:os');
const path = require('node:path');

/**
 * @typedef {Object} WienerdogPaths
 * @property {string} home       User home directory.
 * @property {string} core       Canonical core dir ($WIENERDOG_HOME || ~/.wienerdog).
 * @property {string} config     config.yaml inside the core.
 * @property {string} state      state/ dir inside the core.
 * @property {string} secrets    secrets/ dir inside the core (mode 0700).
 * @property {string} logs       logs/ dir inside the core.
 * @property {string} manifest   install-manifest.json inside the core.
 * @property {string} claudeDir  Claude Code config dir ($CLAUDE_CONFIG_DIR || ~/.claude).
 * @property {string} codexDir   Codex CLI config dir ($CODEX_HOME || ~/.codex).
 * @property {string} vault      The vault dir ($WIENERDOG_VAULT || ~/wienerdog).
 */

/**
 * All filesystem locations, computed from env for testability.
 * core = $WIENERDOG_HOME || ~/.wienerdog.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {WienerdogPaths}
 */
function getPaths(env = process.env) {
  const home = env.HOME || os.homedir();
  const core = env.WIENERDOG_HOME || path.join(home, '.wienerdog');
  // WIENERDOG_CLAUDE_DIR (wienerdog-internal; the scenario harness sets it to a
  // fixtures dir) takes precedence so transcript discovery can be redirected WITHOUT
  // touching CLAUDE_CONFIG_DIR — which the spawned `claude -p` brain needs for its
  // real subscription credentials (ADR-0009). Unset in production → identical behavior.
  const claudeDir = env.WIENERDOG_CLAUDE_DIR || env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const codexDir = env.CODEX_HOME || path.join(home, '.codex');
  const vault = env.WIENERDOG_VAULT || path.join(home, 'wienerdog');
  return {
    home,
    core,
    config: path.join(core, 'config.yaml'),
    state: path.join(core, 'state'),
    secrets: path.join(core, 'secrets'),
    logs: path.join(core, 'logs'),
    manifest: path.join(core, 'install-manifest.json'),
    claudeDir,
    codexDir,
    vault,
  };
}

module.exports = { getPaths };

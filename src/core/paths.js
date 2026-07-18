'use strict';

const os = require('node:os');
const path = require('node:path');
const { WienerdogError } = require('./errors');

/** The env vars whose value becomes a destructive/write root and must be a safe
 *  absolute path. HOME is intentionally NOT included — it is the OS-standard home
 *  and validating it would reject exotic-but-valid setups; the DERIVED roots below
 *  are what Wienerdog deletes/writes. */
const OVERRIDE_VARS = ['WIENERDOG_HOME', 'WIENERDOG_VAULT', 'WIENERDOG_CLAUDE_DIR', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'];

/**
 * Fail closed on an unsafe path-defining override. A SET value MUST be an absolute
 * path with no `.` or `..` segment (containment ambiguity). Unset → caller uses the
 * default (not validated). Cross-platform: uses path.isAbsolute + a segment scan on
 * BOTH separators so a Windows value is checked too.
 * @param {string} name @param {string|undefined} value
 * @returns {string|undefined} the value unchanged when safe/unset; throws otherwise
 */
function assertSafeOverride(name, value) {
  if (value === undefined || value === '') return value;
  const segs = value.split(/[\\/]+/);
  if (!path.isAbsolute(value) || segs.includes('..') || segs.includes('.')) {
    throw new WienerdogError(
      `${name} must be an absolute path with no '..' segment (got ${JSON.stringify(value)}) — ` +
      'this variable defines where Wienerdog reads and (on uninstall) recursively removes files.'
    );
  }
  return value;
}

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
  const core = assertSafeOverride('WIENERDOG_HOME', env.WIENERDOG_HOME) || path.join(home, '.wienerdog');
  // WIENERDOG_CLAUDE_DIR (wienerdog-internal; the scenario harness sets it to a
  // fixtures dir) takes precedence so transcript discovery can be redirected WITHOUT
  // touching CLAUDE_CONFIG_DIR — which the spawned `claude -p` brain needs for its
  // real subscription credentials (ADR-0009). Unset in production → identical behavior.
  const claudeDir = assertSafeOverride('WIENERDOG_CLAUDE_DIR', env.WIENERDOG_CLAUDE_DIR)
    || assertSafeOverride('CLAUDE_CONFIG_DIR', env.CLAUDE_CONFIG_DIR) || path.join(home, '.claude');
  const codexDir = assertSafeOverride('CODEX_HOME', env.CODEX_HOME) || path.join(home, '.codex');
  const vault = assertSafeOverride('WIENERDOG_VAULT', env.WIENERDOG_VAULT) || path.join(home, 'wienerdog');
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

module.exports = { getPaths, assertSafeOverride, OVERRIDE_VARS };

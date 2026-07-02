'use strict';

const fs = require('node:fs');
const { getPaths } = require('./paths');

/**
 * @param {string} p
 * @returns {boolean} true if p exists and is a directory.
 */
function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Detect which AI harnesses (Claude Code, Codex CLI) are present.
 * claude.present = dir ~/.claude exists; codex.present = ~/.codex exists.
 * Respects $CLAUDE_CONFIG_DIR and $CODEX_HOME overrides when set.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{claude: {present: boolean, dir: string},
 *            codex:  {present: boolean, dir: string}}}
 */
function detectHarnesses(env = process.env) {
  const { claudeDir, codexDir } = getPaths(env);
  return {
    claude: { present: dirExists(claudeDir), dir: claudeDir },
    codex: { present: dirExists(codexDir), dir: codexDir },
  };
}

module.exports = { detectHarnesses };

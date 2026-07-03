'use strict';

const fs = require('node:fs');
const { getPaths } = require('../core/paths');
const { detectHarnesses } = require('../core/detect');
const manifestLib = require('../core/manifest');

/** @param {string} p @returns {boolean} */
function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} p @returns {boolean} */
function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** @param {string} configPath @returns {string|null} configured vault path, or null. */
function readVaultPath(configPath) {
  let content;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
  const m = content.match(/^vault:[ \t]*(.*)$/m);
  if (!m) return null;
  const value = m[1].split('#')[0].trim();
  return value === '' || value === 'null' ? null : value;
}

/**
 * Report on an existing install. Prints one `ok`/`warn`/`fail` line per check;
 * exits 1 (via process.exitCode) if any check fails.
 * @param {string[]} _argv
 */
async function run(_argv) {
  const paths = getPaths();
  let failed = false;

  /** @param {'ok'|'warn'|'fail'} status @param {string} msg */
  const check = (status, msg) => {
    console.log(`[${status}] ${msg}`);
    if (status === 'fail') failed = true;
  };

  // Core directory.
  if (dirExists(paths.core)) check('ok', `core directory exists (${paths.core})`);
  else check('fail', `core directory missing (${paths.core}) — run 'wienerdog init'`);

  // Install manifest parses.
  if (!fileExists(paths.manifest)) {
    check('fail', `install manifest missing (${paths.manifest})`);
  } else {
    try {
      manifestLib.load(paths);
      check('ok', 'install manifest parses');
    } catch {
      check('fail', `install manifest is corrupted (${paths.manifest})`);
    }
  }

  // config.yaml exists and is non-empty (content parsing is a later WP).
  if (fileExists(paths.config) && fs.statSync(paths.config).size > 0) {
    check('ok', 'config.yaml exists and is non-empty');
  } else {
    check('fail', `config.yaml missing or empty (${paths.config})`);
  }

  // Memory vault — unset is a valid just-installed state (warn, not fail).
  const vaultPath = readVaultPath(paths.config);
  if (vaultPath === null) {
    check('warn', 'no memory vault yet — run /wienerdog-setup to create or choose one (this is normal right after install)');
  } else if (dirExists(vaultPath)) {
    check('ok', `vault ready (${vaultPath})`);
  } else {
    check('fail', `vault is set to ${vaultPath} but that folder is missing — run /wienerdog-setup, or 'wienerdog init --fresh-vault' for the default`);
  }

  // secrets directory permissions (skip on Windows).
  if (process.platform === 'win32') {
    check('ok', 'secrets permission check skipped (Windows)');
  } else if (!dirExists(paths.secrets)) {
    check('fail', `secrets directory missing (${paths.secrets})`);
  } else {
    const mode = fs.statSync(paths.secrets).mode & 0o777;
    if (mode === 0o700) check('ok', 'secrets directory permissions are 0700');
    else check('warn', `secrets directory permissions are ${mode.toString(8)} (expected 700)`);
  }

  // Harness detection summary (informational).
  const harnesses = detectHarnesses();
  check(
    'ok',
    `AI tools — Claude Code: ${harnesses.claude.present ? 'found' : 'not found'}, ` +
      `Codex CLI: ${harnesses.codex.present ? 'found' : 'not found'}`
  );

  if (failed) process.exitCode = 1;
}

module.exports = { run };

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('../core/paths');
const { detectHarnesses } = require('../core/detect');
const { getUpdateNotice, updateCommand } = require('../core/update-check');
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

/** Verify each shipped wienerdog-* skill is registered under <codexDir>/skills/
 *  (a symlink OR a copied dir — both count; WP-050). Read-only; a missing/broken
 *  link is a WARN (remediation: 'wienerdog sync'), never a fail. Empty array when
 *  Codex is not detected. Codex's own <codexDir>/skills/.system/ is ignored.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{codex:{present:boolean}}} harnesses
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function codexSkillChecks(paths, harnesses) {
  if (!harnesses.codex.present) return [];

  const coreSkillsDir = path.join(paths.core, 'skills');
  let entries;
  try {
    entries = fs.readdirSync(coreSkillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries
    .filter((e) => e.name.startsWith('wienerdog-') && (e.isDirectory() || e.isSymbolicLink()))
    .map((e) => e.name);
  if (names.length === 0) return [];

  const codexSkillsDir = path.join(paths.codexDir, 'skills');
  const missing = names.filter((name) => !fs.existsSync(path.join(codexSkillsDir, name)));

  if (missing.length === 0) {
    return [{ status: 'ok', msg: `Codex skills registered (${names.length}) under ${codexSkillsDir}` }];
  }
  return [
    {
      status: 'warn',
      msg: `Codex skills NOT registered under ${codexSkillsDir}: ${missing.join(', ')} — run 'wienerdog sync' to (re)link them`,
    },
  ];
}

/** Report Google client-library readiness for a CONNECTED account. Read-only;
 *  never fails (a missing library is actionable, so a WARN). Emits NOTHING when
 *  Google is not connected (no token) — the normal state. WP-103 / BUG-gws-deps-missing.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function googleReadinessChecks(paths) {
  const { tokenPath } = require('../gws/client');
  const deps = require('../gws/deps');
  if (!fileExists(tokenPath(paths))) return []; // Google not connected — nothing to check (normal)
  if (deps.isInstalled(paths)) {
    return [{ status: 'ok', msg: 'Google connected and its client library is installed' }];
  }
  const cmd = `npm install --ignore-scripts --prefix ${deps.depsDir(paths)} ${deps.GOOGLEAPIS_SPEC}`;
  return [
    {
      status: 'warn',
      msg:
        'Google is connected but its client library is missing — the next `wienerdog gws` ' +
        'command will offer to install it, or run `wienerdog gws auth`, or: ' + cmd,
    },
  ];
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

  // Scheduler-load health: one line per registered entry via a LIVE read-only
  // probe (authoritative — catches even the all-jobs-unloaded case). A missing
  // entry is a warn (actionable), never a hard fail; doctor never mutates.
  const { doctorSchedulerChecks } = require('../scheduler/status');
  for (const c of doctorSchedulerChecks(paths)) check(c.status, c.msg);

  // Codex skill-link health: shipped skills registered under $CODEX_HOME/skills/.
  // Read-only; missing links are a warn (remediation: 'wienerdog sync').
  for (const c of codexSkillChecks(paths, harnesses)) check(c.status, c.msg);

  // Google client-library readiness for a connected account (WP-103).
  // Read-only; silent when Google is not connected; a missing library is a warn.
  for (const c of googleReadinessChecks(paths)) check(c.status, c.msg);

  // Cache-only update notice (no network; does not affect pass/fail). ADR-0015.
  const upd = getUpdateNotice(paths);
  if (upd.available) {
    console.log(`[info] a newer Wienerdog is available (${upd.current} → ${upd.latest}) — update: ${updateCommand(process.env)}`);
  }

  if (failed) process.exitCode = 1;
}

module.exports = { run };

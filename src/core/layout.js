'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * @typedef {Object} VaultLayout
 * @property {string} identity_dir    identity notes dir      (default '06-Identity')
 * @property {string} daily_dir       daily-log dir           (default '07-Daily')
 * @property {string} daily_filename  daily filename pattern relative to daily_dir;
 *                                     may nest (default 'YYYY-MM-DD.md';
 *                                     power-user 'YYYY/MM/YYYY-MM-DD.md')
 * @property {string} projects_dir    project MOC dirs live under here (default '01-Projects')
 * @property {string} skills_dir      synthesized skills dir  (default '05-Skills')
 * @property {string} reports_dir     dream reports dir       (default 'reports/dreams')
 * @property {string} inbox_dir       capture-staging dir     (default '00-Inbox')
 */

/** The seven layout keys that are honored; any other nested key is ignored. */
const LAYOUT_KEYS = [
  'identity_dir',
  'daily_dir',
  'daily_filename',
  'projects_dir',
  'skills_dir',
  'reports_dir',
  'inbox_dir',
];

/** @returns {VaultLayout} the built-in defaults (== today's hardcoded paths). */
function defaultLayout() {
  return {
    identity_dir: '06-Identity',
    daily_dir: '07-Daily',
    daily_filename: 'YYYY-MM-DD.md',
    projects_dir: '01-Projects',
    skills_dir: '05-Skills',
    reports_dir: 'reports/dreams',
    inbox_dir: '00-Inbox',
  };
}

/**
 * Strip an inline comment (unquoted only) and one layer of surrounding quotes
 * from a scalar value — same rules as dream/config.js readScalar.
 * @param {string} raw
 * @returns {string}
 */
function cleanValue(raw) {
  let value = raw.trim();
  // Drop an inline comment on unquoted values (a space followed by `#`).
  if (value !== '' && value[0] !== '"' && value[0] !== "'") {
    const hash = value.indexOf(' #');
    if (hash !== -1) value = value.slice(0, hash).trim();
  }
  if (
    value.length >= 2 &&
    ((value[0] === '"' && value[value.length - 1] === '"') ||
      (value[0] === "'" && value[value.length - 1] === "'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

/**
 * True when a cleaned value is a safe vault-relative path. Layout values are
 * joined under the vault root (digest render today; dream tier boundaries in
 * WP-024, adopt in WP-026), so a traversal or absolute value would let a
 * config edit read files OUTSIDE the vault into the injected session digest
 * (confused-deputy; PR #24 review). Rejected: empty, absolute, any `..`
 * segment (split on '/'), or a backslash anywhere.
 * @param {string} value  output of cleanValue
 * @returns {boolean}
 */
function isSafeRelativePath(value) {
  if (value === '') return false;
  if (path.isAbsolute(value) || value[0] === '/') return false;
  if (value.includes('\\')) return false;
  if (value.split('/').includes('..')) return false;
  return true;
}

/**
 * Read the optional `vault_layout:` block from a config.yaml file. Missing file,
 * missing block, or missing keys → the corresponding defaults. Only the seven keys
 * above are honored; unknown nested keys are ignored. Values are treated as trimmed
 * strings (one layer of surrounding quotes stripped; inline ` #` comment dropped on
 * unquoted values — same rules as dream/config.js readScalar). A value that is
 * not a safe vault-relative path (see isSafeRelativePath) is rejected per-key:
 * the built-in default for that key is used and the rest of the block still
 * applies.
 * @param {string} configFile  absolute path to config.yaml
 * @returns {VaultLayout}
 */
function readVaultLayout(configFile) {
  const layout = defaultLayout();

  let body;
  try {
    body = fs.readFileSync(configFile, 'utf8');
  } catch {
    return layout;
  }

  const lines = body.split('\n');
  let i = 0;
  // Find the exact top-level `vault_layout:` line (a trailing comment is allowed).
  for (; i < lines.length; i++) {
    if (/^vault_layout:[ \t]*(#.*)?$/.test(lines[i])) break;
  }
  if (i >= lines.length) return layout;

  // Consume the following indented lines of the form `<key>: <value>`.
  for (i += 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Blank lines and comment lines inside the block are skipped, not stops.
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    // A non-indented, non-blank line is a dedent → the block is over.
    if (!/^\s/.test(line)) break;
    const match = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    if (!LAYOUT_KEYS.includes(match[1])) continue;
    const value = cleanValue(match[2]);
    // Traversal-safety contract: an unsafe value falls back to the built-in
    // default for that key, silently; the rest of the block still applies.
    if (!isSafeRelativePath(value)) continue;
    layout[match[1]] = value;
  }

  return layout;
}

/**
 * The vault-relative path of the daily log for a given date, substituting into
 * daily_filename and joining under daily_dir. Tokens: 'YYYY'→year, 'MM'→month,
 * 'DD'→day, taken from a 'YYYY-MM-DD' date string.
 * resolveDailyPath(default, '2026-07-03')      === '07-Daily/2026-07-03.md'
 * resolveDailyPath(powerUser, '2026-07-03')    === '05-Daily/2026/07/2026-07-03.md'
 * @param {VaultLayout} layout
 * @param {string} date  'YYYY-MM-DD'
 * @returns {string} vault-relative POSIX-style path
 */
function resolveDailyPath(layout, date) {
  const [year, month, day] = date.split('-');
  const filename = layout.daily_filename
    .replace(/YYYY/g, year)
    .replace(/MM/g, month)
    .replace(/DD/g, day);
  return path.posix.join(layout.daily_dir, filename);
}

/**
 * Human-readable lines describing the layout for the dream brain's prompt (WP-024
 * consumes this). Returns an array of plain-language lines mapping each tier to its
 * directory, plus the concrete daily-log path for `date`.
 * @param {VaultLayout} layout
 * @param {string} date  'YYYY-MM-DD'
 * @returns {string[]}
 */
function layoutPromptLines(layout, date) {
  return [
    `Identity notes directory: ${layout.identity_dir}`,
    `Skills directory: ${layout.skills_dir}`,
    `Daily log file for today: ${resolveDailyPath(layout, date)}`,
    `Projects directory: ${layout.projects_dir}`,
    `Inbox directory: ${layout.inbox_dir}`,
    `Reports directory: ${layout.reports_dir}`,
  ];
}

module.exports = { defaultLayout, readVaultLayout, resolveDailyPath, layoutPromptLines };

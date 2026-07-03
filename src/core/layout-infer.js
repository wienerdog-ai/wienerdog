'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { defaultLayout } = require('./layout');

/** @param {string} p @returns {boolean} */
function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * List the immediate subdirectory names of dir (sorted). Missing/unreadable → [].
 * @param {string} dir
 * @returns {string[]}
 */
function topLevelDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/**
 * True when a value is a safe vault-relative path. Copied from layout.js's
 * private isSafeRelativePath (not exported; layout.js may not be modified) —
 * same rules: rejects empty, absolute, any `..` segment, or a backslash.
 * @param {string} value
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
 * First top-level dir name whose lowercased form contains keyword (trimmed),
 * else fallback. Trimming keeps the proposal in the same domain readVaultLayout
 * round-trips through (its parser trims values), so config and scaffold agree
 * on ONE directory even for a folder named with surrounding whitespace.
 * @param {string[]} dirs   top-level dir names
 * @param {string} keyword  lowercase substring to match
 * @param {string} fallback default when nothing matches
 * @returns {string}
 */
function pick(dirs, keyword, fallback) {
  const hit = dirs.find((d) => d.toLowerCase().includes(keyword));
  return hit ? hit.trim() : fallback;
}

/**
 * Probe a daily dir for its filename pattern. Direct `YYYY-MM-DD.md` files →
 * flat; a `\d{4}/\d{2}/YYYY-MM-DD.md` nesting → nested; else flat default.
 * @param {string} dailyAbs  absolute path to the chosen daily dir
 * @returns {string} 'YYYY-MM-DD.md' | 'YYYY/MM/YYYY-MM-DD.md'
 */
function probeDailyFilename(dailyAbs) {
  const flat = 'YYYY-MM-DD.md';
  const nested = 'YYYY/MM/YYYY-MM-DD.md';
  if (!dirExists(dailyAbs)) return flat;

  const dateFile = /^\d{4}-\d{2}-\d{2}\.md$/;
  const entries = fs.readdirSync(dailyAbs, { withFileTypes: true });

  // Flat: a YYYY-MM-DD.md sitting directly in the daily dir.
  if (entries.some((e) => e.isFile() && dateFile.test(e.name))) return flat;

  // Nested: <YYYY>/<MM>/YYYY-MM-DD.md.
  const yearDirs = entries.filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name));
  for (const y of yearDirs) {
    const yAbs = path.join(dailyAbs, y.name);
    for (const m of fs.readdirSync(yAbs, { withFileTypes: true })) {
      if (!m.isDirectory() || !/^\d{2}$/.test(m.name)) continue;
      const mAbs = path.join(yAbs, m.name);
      const hasDate = fs
        .readdirSync(mAbs, { withFileTypes: true })
        .some((f) => f.isFile() && dateFile.test(f.name));
      if (hasDate) return nested;
    }
  }
  return flat;
}

/**
 * Infer a vault_layout from an existing vault's real structure. Pure, read-only,
 * deterministic. For each slot, pick the first EXISTING top-level directory whose
 * name contains the keyword (case-insensitive); otherwise the default. Detect daily
 * nesting by probing the chosen daily dir. All returned paths use POSIX `/`.
 * @param {string} vaultDir
 * @returns {import('./layout').VaultLayout}
 */
function inferLayout(vaultDir) {
  const layout = defaultLayout();
  const dirs = topLevelDirs(vaultDir);

  layout.identity_dir = pick(dirs, 'identity', layout.identity_dir);
  layout.projects_dir = pick(dirs, 'projects', layout.projects_dir);
  layout.skills_dir = pick(dirs, 'skills', layout.skills_dir);
  layout.inbox_dir = pick(dirs, 'inbox', layout.inbox_dir);
  layout.daily_dir = pick(dirs, 'daily', layout.daily_dir);

  layout.daily_filename = probeDailyFilename(path.join(vaultDir, layout.daily_dir));

  // reports_dir: prefer an existing reports/dreams; else <top-level *reports*>/dreams.
  if (dirExists(path.join(vaultDir, 'reports', 'dreams'))) {
    layout.reports_dir = 'reports/dreams';
  } else {
    const reportsTop = dirs.find((d) => d.toLowerCase().includes('reports'));
    layout.reports_dir = reportsTop ? path.posix.join(reportsTop.trim(), 'dreams') : 'reports/dreams';
  }

  // inferLayout hygiene (spec, binding): every emitted proposal is trim()ed and
  // explicitly validated with isSafeRelativePath — validation, not
  // safety-by-construction. An unsafe proposal falls back to the built-in
  // default for that key (same per-key rule readVaultLayout applies on read).
  const defaults = defaultLayout();
  for (const key of Object.keys(defaults)) {
    const value = String(layout[key]).trim();
    layout[key] = isSafeRelativePath(value) ? value : defaults[key];
  }

  return layout;
}

module.exports = { inferLayout };

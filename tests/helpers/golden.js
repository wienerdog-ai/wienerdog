'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @param {string} dir @returns {string[]} relative file paths under dir, recursively, sorted. Ignores .git/. */
function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(dir, full));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

/**
 * Recursively byte-compare two directory trees, ignoring .git/.
 * @param {string} actualDir
 * @param {string} goldenDir
 * @returns {{equal: boolean, diffs: string[]}}
 */
function compareTrees(actualDir, goldenDir) {
  const actualFiles = new Set(listFiles(actualDir));
  const goldenFiles = new Set(listFiles(goldenDir));
  /** @type {string[]} */
  const diffs = [];

  for (const rel of actualFiles) {
    if (!goldenFiles.has(rel)) diffs.push(`only-in-actual: ${rel}`);
  }
  for (const rel of goldenFiles) {
    if (!actualFiles.has(rel)) diffs.push(`only-in-golden: ${rel}`);
  }
  for (const rel of actualFiles) {
    if (!goldenFiles.has(rel)) continue;
    const a = fs.readFileSync(path.join(actualDir, rel));
    const g = fs.readFileSync(path.join(goldenDir, rel));
    if (!a.equals(g)) diffs.push(`differs: ${rel}`);
  }

  return { equal: diffs.length === 0, diffs: diffs.sort() };
}

module.exports = { compareTrees };

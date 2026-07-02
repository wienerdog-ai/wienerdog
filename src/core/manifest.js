'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * install-manifest.json shape:
 *   { version: 1, createdAt: ISO, entries: [
 *       {kind: 'dir'|'file', path: string, hash?: string}   // created by us
 *   ] }
 * hash (files only) is the sha256 of the content we wrote, used to detect
 * user modifications on uninstall.
 *
 * @typedef {{kind: 'dir'|'file', path: string, hash?: string}} ManifestEntry
 * @typedef {{version: number, createdAt: string, entries: ManifestEntry[]}} Manifest
 */

/** @param {string} p @returns {boolean} */
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** @param {string} p @returns {boolean} */
function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} p @returns {string} sha256 hex of the file's current content. */
function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/**
 * Load the install manifest. Returns a fresh empty manifest if none exists.
 * Throws (SyntaxError) if the file exists but is not valid JSON — callers that
 * need to distinguish "missing" from "corrupt" should check existence first.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {Manifest}
 */
function load(paths) {
  let raw;
  try {
    raw = fs.readFileSync(paths.manifest, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { version: 1, createdAt: new Date().toISOString(), entries: [] };
    }
    throw err;
  }
  return JSON.parse(raw);
}

/**
 * Append an entry to the manifest (mutates and returns it).
 * @param {Manifest} manifest
 * @param {ManifestEntry} entry
 * @returns {Manifest}
 */
function record(manifest, entry) {
  manifest.entries.push(entry);
  return manifest;
}

/**
 * Persist the manifest to disk.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {Manifest} manifest
 */
function save(paths, manifest) {
  fs.writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Reverse the manifest: remove files we created (kind 'file'), then dirs (kind
 * 'dir', only if empty), in reverse order. Files that changed since install are
 * still ours to remove EXCEPT config.yaml, which is kept with a notice when it
 * was modified after install (recorded hash mismatch). Unknown kinds are
 * skipped with a warning (forward compat for later WPs). The manifest file
 * itself is removed as bookkeeping.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {Manifest} manifest
 * @param {{dryRun?: boolean}} [opts]
 * @returns {{removed: string[], skipped: string[]}}
 */
function reverse(paths, manifest, { dryRun = false } = {}) {
  /** @type {string[]} */ const removed = [];
  /** @type {string[]} */ const skipped = [];
  // The manifest file is our own bookkeeping: treat it as (virtually) removed
  // so the core dir counts as empty, and delete it for real on a live run.
  const removedSet = new Set([paths.manifest]);
  if (!dryRun) {
    try {
      fs.rmSync(paths.manifest, { force: true });
    } catch {
      /* ignore — already gone */
    }
  }

  for (const entry of [...manifest.entries].reverse()) {
    if (entry.kind === 'file') {
      if (!isFile(entry.path)) {
        skipped.push(entry.path);
        continue;
      }
      if (
        entry.path === paths.config &&
        entry.hash &&
        sha256File(entry.path) !== entry.hash
      ) {
        process.stderr.write(`wienerdog: keeping ${entry.path} — modified since install\n`);
        skipped.push(entry.path);
        continue;
      }
      if (!dryRun) fs.rmSync(entry.path, { force: true });
      removedSet.add(entry.path);
      removed.push(entry.path);
    } else if (entry.kind === 'dir') {
      if (!isDir(entry.path)) {
        skipped.push(entry.path);
        continue;
      }
      const remaining = fs
        .readdirSync(entry.path)
        .map((child) => path.join(entry.path, child))
        .filter((child) => !removedSet.has(child));
      if (remaining.length > 0) {
        skipped.push(entry.path);
        continue;
      }
      if (!dryRun) fs.rmdirSync(entry.path);
      removedSet.add(entry.path);
      removed.push(entry.path);
    } else {
      process.stderr.write(
        `wienerdog: skipping unknown manifest entry kind '${entry.kind}' (${entry.path})\n`
      );
      skipped.push(entry.path);
    }
  }

  return { removed, skipped };
}

module.exports = { load, record, save, reverse };

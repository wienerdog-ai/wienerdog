'use strict';

// Bounded, read-only vault snapshot for routine runs (WP-141,
// D-VAULT-SNAPSHOT). A routine never sees the live vault: it gets a bounded
// COPY of a fixed per-routine slice inside its own staging dir. A hijacked
// routine can read the snapshot but never the live memory notes — and the
// caps bound what a poisoned run can exfiltrate-summarize in one go.
//
// Exceed behavior (owner-mandated): an over-cap file is skipped VISIBLY —
// returned in `skipped`, surfaced by the caller — never silently, and never
// failing the whole run for one oversized file.

const fs = require('node:fs');
const path = require('node:path');
const { mkdirPrivate } = require('./private-fs');

/** Hard caps (WP-118 transcript-intake style; ~100× above realistic sizes). */
const MAX_FILES = 32;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024;

/**
 * Fixed source slices per routine profile (D-VAULT-SNAPSHOT). `newest` files
 * are picked by filename descending — daily notes and dream reports are
 * YYYY-MM-DD-named, so lexicographic order IS date order (deterministic,
 * mtime-independent).
 */
const SNAPSHOT_PLANS = Object.freeze({
  'daily-digest': Object.freeze([Object.freeze({ dir: 'reports/dreams', newest: 1 })]),
  'weekly-review': Object.freeze([
    Object.freeze({ dir: '07-Daily', newest: 7 }),
    Object.freeze({ dir: 'reports/dreams', newest: 7 }),
  ]),
  'inbox-triage': Object.freeze([]),
});

/**
 * Copy a BOUNDED, read-only slice of the vault into `<stagingDir>/vault-snapshot`
 * for a routine to Read. 0700 dirs / 0600 files, layout mirrored
 * (`reports/dreams/x.md` → `vault-snapshot/reports/dreams/x.md`). Symlink-safe:
 * every source is lstat-checked and only regular files are copied (a symlink is
 * skipped visibly, never followed). An absent source dir is normal (skipped
 * quietly); an over-cap file is skipped VISIBLY via `skipped`.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {string} routineId  a code-owned profile id (never config-supplied)
 * @param {string} stagingDir the run's staging dir (the only writable root)
 * @returns {{snapshotDir: string|null, skipped: Array<{file:string, reason:string}>}}
 *   snapshotDir is null when the routine's plan has no sources at all.
 */
function makeVaultSnapshot(paths, routineId, stagingDir) {
  const plan = SNAPSHOT_PLANS[routineId] || [];
  /** @type {Array<{file:string, reason:string}>} */
  const skipped = [];
  if (plan.length === 0) return { snapshotDir: null, skipped };

  const snapshotDir = path.join(stagingDir, 'vault-snapshot');
  mkdirPrivate(snapshotDir);

  let totalBytes = 0;
  let fileCount = 0;

  for (const spec of plan) {
    const srcDir = path.join(paths.vault, spec.dir);
    let names;
    try {
      names = fs.readdirSync(srcDir);
    } catch {
      continue; // absent source dir — normal for a young vault
    }
    const picked = names
      .filter((n) => n.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, spec.newest);

    for (const name of picked) {
      const rel = `${spec.dir}/${name}`;
      const src = path.join(srcDir, name);
      let st;
      try {
        st = fs.lstatSync(src);
      } catch {
        skipped.push({ file: rel, reason: 'unreadable' });
        continue;
      }
      if (!st.isFile()) {
        skipped.push({ file: rel, reason: 'not a regular file (symlinks are never followed)' });
        continue;
      }
      if (st.size > MAX_FILE_BYTES) {
        skipped.push({ file: rel, reason: `exceeds the ${MAX_FILE_BYTES}-byte per-file cap` });
        continue;
      }
      if (fileCount + 1 > MAX_FILES) {
        skipped.push({ file: rel, reason: `exceeds the ${MAX_FILES}-file cap` });
        continue;
      }
      if (totalBytes + st.size > MAX_TOTAL_BYTES) {
        skipped.push({ file: rel, reason: `exceeds the ${MAX_TOTAL_BYTES}-byte total cap` });
        continue;
      }
      const dest = path.join(snapshotDir, spec.dir, name);
      mkdirPrivate(path.dirname(dest));
      fs.writeFileSync(dest, fs.readFileSync(src), { mode: 0o600 });
      fileCount += 1;
      totalBytes += st.size;
    }
  }

  return { snapshotDir, skipped };
}

module.exports = { makeVaultSnapshot, SNAPSHOT_PLANS, MAX_FILES, MAX_TOTAL_BYTES, MAX_FILE_BYTES };

'use strict';

// Bounded, read-only vault snapshot for routine runs (WP-141,
// D-VAULT-SNAPSHOT). A routine never sees the live vault: it gets a bounded
// COPY of a fixed per-routine slice inside its own staging dir. A hijacked
// routine can read the snapshot but never the live memory notes — and the
// caps bound what a poisoned run can exfiltrate-summarize in one go.
//
// Exceed behavior (owner-mandated): an over-cap file is skipped VISIBLY —
// returned in `skipped`, surfaced by the caller — never silently, and never
// failing the whole run for one oversized file. The content gates below extend
// that same behavior to what a file CONTAINS (WP-gate-vault-snapshot, audit
// finding M3): until then the snapshot copied files by name, date order and
// size only, so attacker-steerable text reached a capability-holding routine
// having passed no gate at all.
//
// Every file the snapshot mounts is untrusted-by-default (owner ruling
// 2026-08-14). These gates therefore classify nothing as trusted: they only
// decide whether a file is copied, and the routine's prompt frames whatever
// survives as data (src/core/routine-runtime.js).

const fs = require('node:fs');
const path = require('node:path');
const { mkdirPrivate } = require('./private-fs');
const { parseNoteResult } = require('./digest');
const secretScan = require('./secret-scan');

/** Hard caps (WP-118 transcript-intake style; ~100× above realistic sizes). */
const MAX_FILES = 32;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024;

/**
 * Fixed source slices per routine profile (D-VAULT-SNAPSHOT). `newest` files
 * are picked by filename descending — daily notes and dream reports are
 * YYYY-MM-DD-named, so lexicographic order IS date order (deterministic,
 * mtime-independent).
 *
 * `provenanceGated` marks the NOTES slice — the one slice the frontmatter
 * provenance gate runs on. The decision lives HERE, where slices are declared,
 * rather than in a directory-name match down at the gate.
 *
 * The reports slices deliberately do NOT carry it, and not because the flag is
 * unwritable there: the dream model authors report bodies and can write any
 * frontmatter it likes. That is precisely the reason. A flag on a report would
 * be a MODEL-declared classification, and the 2026-08-14 ruling took
 * model-declared classification off this path — every mounted file is untrusted
 * regardless, so there is no trusted class for such a flag to move a file out
 * of, and honouring it would let a hijacked dream suppress its own report. What
 * would remain is the `malformed` branch, which no writer intends and which
 * would put `daily-digest`'s ONLY input at the mercy of a report body that
 * happens to open with `---`.
 */
const SNAPSHOT_PLANS = Object.freeze({
  'daily-digest': Object.freeze([Object.freeze({ dir: 'reports/dreams', newest: 1 })]),
  'weekly-review': Object.freeze([
    Object.freeze({ dir: '07-Daily', newest: 7, provenanceGated: true }),
    Object.freeze({ dir: 'reports/dreams', newest: 7 }),
  ]),
  'inbox-triage': Object.freeze([]),
});

/**
 * The per-file content gate chain, on ALREADY-READ bytes. Pure: no fs, no
 * writes, no throw of its own.
 *
 * Order is FIXED and a file is rejected by the FIRST gate that fires, so every
 * reason string is deterministic:
 *  1. decodability — the other two gates decide on TEXT, so bytes a `utf8`
 *     decode does not represent faithfully cannot be gated on their text at
 *     all. This gate is new work, not a port: the digest never needs it because
 *     it renders bounded reads as text, whereas the snapshot copies raw bytes.
 *  2. provenance (notes slice only) — the digest's OWN exported gate, never a
 *     second implementation of the three exclusion classes. Note what it
 *     actually decides on: PARSER-RECOGNIZED leading frontmatter. `parse`
 *     recognizes a block only when the first line is byte-for-byte `---`, so a
 *     leading BOM, blank line or space makes a note carrying an explicit
 *     `derived_from_untrusted: true` parse as unfenced — trusted — and it is
 *     copied. That is fail-open and pre-existing (`renderDigest` runs the same
 *     function on the daily note), inherited here by reusing the shared parser
 *     rather than diverging from it.
 *  3. secret scan — ANY finding of EITHER severity rejects the WHOLE file, and
 *     the redacted `.text` is DISCARDED, never copied: the digest's
 *     section-level rule applied to a file. `scanAndRedact` is total (WP-122),
 *     so a degraded scan yields a scan-error finding → a skip, never a throw.
 *
 * Provenance runs before the scan for the same reason it does in the digest,
 * where the scan is the LAST filter before content is admitted.
 * @param {Buffer} buf  the bytes that will be copied verbatim if this returns null
 * @param {boolean} provenanceGated  true for the notes slice only
 * @returns {string|null} a skip reason, or null when the file may be copied
 */
function gateReason(buf, provenanceGated) {
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) return 'not valid UTF-8 text';
  if (provenanceGated) {
    const { exclusion } = parseNoteResult(text);
    if (exclusion !== null) return `provenance gate: ${exclusion}`;
  }
  if (secretScan.scanAndRedact(text).findings.length > 0) return 'appears to contain a secret';
  return null;
}

/**
 * Copy a BOUNDED, read-only slice of the vault into `<stagingDir>/vault-snapshot`
 * for a routine to Read. 0700 dirs / 0600 files, layout mirrored
 * (`reports/dreams/x.md` → `vault-snapshot/reports/dreams/x.md`). Symlink-safe:
 * every source is lstat-checked and only regular files are copied (a symlink is
 * skipped visibly, never followed). An absent source dir is normal (skipped
 * quietly); an over-cap file is skipped VISIBLY via `skipped`, and so is a file
 * any content gate rejects (see {@link gateReason}). A gated-out file consumes
 * NEITHER budget, so it can never displace a later file from the snapshot.
 *
 * When every candidate is gated out the result is a non-null `snapshotDir`
 * pointing at an EMPTY directory, with `skipped` explaining every absence —
 * the same shape a young vault already produces. There is deliberately no
 * fallback that copies an ungated file to avoid an empty snapshot: that would
 * defeat the gate on exactly the run it fired.
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
      // Read ONCE, AFTER the caps: the bytes the gates decide on are exactly
      // the bytes copied (the reason digest.js gates an already-read buffer
      // rather than re-reading). A read failure degrades to the existing
      // visible skip instead of killing the whole routine composition — a
      // mode-000 file used to throw EACCES straight out of this function.
      let buf;
      try {
        buf = fs.readFileSync(src);
      } catch {
        skipped.push({ file: rel, reason: 'unreadable' });
        continue;
      }
      const gated = gateReason(buf, spec.provenanceGated === true);
      if (gated) {
        skipped.push({ file: rel, reason: gated });
        continue;
      }
      const dest = path.join(snapshotDir, spec.dir, name);
      mkdirPrivate(path.dirname(dest));
      fs.writeFileSync(dest, buf, { mode: 0o600 }); // the ORIGINAL bytes; no gate rewrites a copy
      fileCount += 1;
      totalBytes += st.size;
    }
  }

  return { snapshotDir, skipped };
}

module.exports = { makeVaultSnapshot, SNAPSHOT_PLANS, MAX_FILES, MAX_TOTAL_BYTES, MAX_FILE_BYTES };

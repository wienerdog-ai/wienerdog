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
/**
 * The per-file cap — and it is COUPLED to `ScanLimits.SCAN_MAX_BYTES`
 * (`./secret-scan`), which happens to be the same number. The coupling is
 * load-bearing, so it is written down rather than left to coincidence: every
 * file that reaches the secret scan passed this cap ON THE BYTES ACTUALLY READ,
 * so while `MAX_FILE_BYTES <= SCAN_MAX_BYTES` the scanner's oversized bail is
 * unreachable from this path. Raise this above `SCAN_MAX_BYTES` and
 * legitimately-sized files start being withheld WHOLE under the reason
 * `appears to contain a secret`, which does not describe what happened. A test
 * asserts the relation, so raising one without the other fails loudly.
 */
const MAX_FILE_BYTES = 256 * 1024;

/**
 * Flags for the ONE open per candidate. `O_NOFOLLOW` makes the open FAIL when
 * the final path component is a symlink — that is what closes the window
 * between the type check and the open — and `O_NONBLOCK` keeps a FIFO from
 * blocking the open indefinitely while it waits for a writer.
 *
 * NEITHER CONSTANT EXISTS EVERYWHERE (win32 has no `O_NOFOLLOW`). The fallback
 * is an explicit branch that NAMES what is lost, deliberately not the
 * `fs.constants.X || 0` idiom, which makes a missing flag look like a present
 * one: where `O_NOFOLLOW` is absent the leaf-symlink refusal is the pre-open
 * `lstat` alone, so a symlink swapped in after that check IS followed — a named
 * residual, not an accident. Where `O_NONBLOCK` is absent, the hazard it guards
 * is a POSIX one.
 */
const OPEN_FLAGS =
  fs.constants.O_RDONLY |
  (typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0) |
  (typeof fs.constants.O_NONBLOCK === 'number' ? fs.constants.O_NONBLOCK : 0);

/**
 * Read at most `MAX_FILE_BYTES + 1` bytes from `fd`, to EOF. THREE things are
 * bounded here and the third does not follow from the first two: the bytes
 * REQUESTED, the bytes ACCUMULATED, and the ALLOCATION itself — the buffer is
 * sized at the bound, never at what the source or `fstat` reports, and what is
 * returned is a COPY of the filled prefix rather than a view onto it, so
 * nothing downstream keeps a larger allocation alive.
 *
 * The `+ 1` is what makes "it grew past the cap" observable instead of
 * silently truncated: a completely full buffer means there was more.
 * @param {number} fd  a descriptor this function neither opens nor closes
 * @returns {Buffer} exactly the bytes read
 */
function readBounded(fd) {
  const buf = Buffer.alloc(MAX_FILE_BYTES + 1);
  let filled = 0;
  while (filled < buf.length) {
    const got = fs.readSync(fd, buf, filled, buf.length - filled, null);
    if (got === 0) break; // EOF
    filled += got;
  }
  return Buffer.from(buf.subarray(0, filled));
}

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
 * (`reports/dreams/x.md` → `vault-snapshot/reports/dreams/x.md`).
 *
 * The symlink posture is FILE-LEVEL, and saying so precisely matters: a
 * candidate FILE that is a symlink is skipped visibly and never followed, both
 * at the pre-open check and — where `O_NOFOLLOW` exists — at the open, which is
 * what stops a symlink swapped in between the two. A symlinked SOURCE DIRECTORY
 * is a different thing and is FOLLOWED by design: `readdirSync` resolves it, so
 * a user who symlinks `07-Daily` in from a cloud-synced folder keeps their
 * routine's input. That is the owner's ruling of 2026-08-15, accepted because
 * planting such a symlink needs write access to the vault on the user's own
 * machine — outside the threat model's remote attacker. An absent source dir is normal (skipped
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
      // The pre-open `lstat` decides exactly ONE thing: the non-regular-file
      // refusal and its reason. It decides no cap — the size it reports is
      // trusted by nothing below — and it is advisory by construction, because
      // anything swapped in after it is caught at the open or at the `fstat`.
      // It cannot be dropped: an `O_NOFOLLOW` open reports only that it failed,
      // and this reason string is a preserved contract.
      let ls;
      try {
        ls = fs.lstatSync(src);
      } catch {
        skipped.push({ file: rel, reason: 'unreadable' });
        continue;
      }
      if (!ls.isFile()) {
        skipped.push({ file: rel, reason: 'not a regular file (symlinks are never followed)' });
        continue;
      }

      // From here every decision is made on the DESCRIPTOR, never by resolving
      // the path a second time — that second resolution was the whole defect.
      let fd;
      try {
        fd = fs.openSync(src, OPEN_FLAGS);
      } catch {
        // ANY open failure, one reason: a symlink refused by `O_NOFOLLOW`, an
        // unreadable file, a socket that cannot yield a descriptor at all. The
        // contract deliberately does not depend on which errno a platform
        // reports, so it does not branch on one.
        skipped.push({ file: rel, reason: 'unreadable' });
        continue;
      }
      // The descriptor's scope opens HERE, before the `fstat` — not around the
      // read alone. A directory swapped in after the `lstat` opens fine and is
      // then refused by the type check having read nothing, and a scope that
      // started at the read would leak the descriptor on exactly that path.
      let buf;
      let reason = null;
      try {
        if (!fs.fstatSync(fd).isFile()) {
          reason = 'not a regular file (symlinks are never followed)';
        } else {
          buf = readBounded(fd);
        }
      } catch {
        reason = 'unreadable';
      } finally {
        // One close per successful open, on every path. That is the promise;
        // that the kernel never retains a descriptor is not, so a failing close
        // is swallowed rather than turning a completed copy into a skip.
        try {
          fs.closeSync(fd);
        } catch {
          /* deliberately ignored — see above */
        }
      }
      if (reason !== null) {
        skipped.push({ file: rel, reason });
        continue;
      }

      // All three caps decide on the bytes ACTUALLY READ, in the order and with
      // the reason strings they have always had. A file that grew after its
      // type check is refused by the cap it exceeds instead of being copied
      // past it, and a partially-read file is never copied as if it were whole.
      if (buf.length > MAX_FILE_BYTES) {
        skipped.push({ file: rel, reason: `exceeds the ${MAX_FILE_BYTES}-byte per-file cap` });
        continue;
      }
      if (fileCount + 1 > MAX_FILES) {
        skipped.push({ file: rel, reason: `exceeds the ${MAX_FILES}-file cap` });
        continue;
      }
      if (totalBytes + buf.length > MAX_TOTAL_BYTES) {
        skipped.push({ file: rel, reason: `exceeds the ${MAX_TOTAL_BYTES}-byte total cap` });
        continue;
      }
      // ONE read, whose bytes feed BOTH the gate decision and the copy: no
      // second read, so the bytes gated are always the bytes written.
      const gated = gateReason(buf, spec.provenanceGated === true);
      if (gated) {
        skipped.push({ file: rel, reason: gated });
        continue;
      }
      const dest = path.join(snapshotDir, spec.dir, name);
      mkdirPrivate(path.dirname(dest));
      fs.writeFileSync(dest, buf, { mode: 0o600 }); // the ORIGINAL bytes; no gate rewrites a copy
      fileCount += 1;
      totalBytes += buf.length;
    }
  }

  return { snapshotDir, skipped };
}

module.exports = { makeVaultSnapshot, SNAPSHOT_PLANS, MAX_FILES, MAX_TOTAL_BYTES, MAX_FILE_BYTES };

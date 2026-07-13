'use strict';

const path = require('node:path');

/**
 * macOS TCC (Transparency, Consent, and Control) protects a handful of
 * home-relative folders behind an interactive permission prompt. An unattended
 * launchd job that reads one of them blocks forever on a prompt no one can
 * answer (the "4-hour hang"). `run-job` refuses such jobs up front — a loud
 * failure beats an invisible hang.
 */

/** macOS TCC-protected home-relative prefixes that hang unattended jobs.
 *  Exported so tests and doctor can reference the same list. */
const TCC_PREFIXES = ['Desktop', 'Documents', 'Downloads', 'Library/Mobile Documents']; // last = iCloud Drive root

/** APFS Data-volume firmlink prefix. On macOS the user-data top-level dirs (`/Users`,
 *  `/private`, `/Applications`, …) are FIRMLINKS onto the Data volume, and `lstat`/
 *  `realpath` surface BOTH spellings: `/Users/x` and `/System/Volumes/Data/Users/x`
 *  name the same inode. Stripping this leading prefix collapses the two into one domain
 *  for the comparison. */
const DATA_VOLUME_PREFIX = '/System/Volumes/Data';

/** Normalize a path for the TCC containment/prefix DECISION only (NEVER for access).
 *  Firmlink spelling, Unicode normal form (NFC vs NFD), and case are the THREE ways
 *  macOS/APFS can spell the SAME on-disk directory differently; a naive byte compare
 *  treats each variant as a distinct path and lets it evade the guard while the OS still
 *  resolves and accesses the real protected dir. Folding all three at this one choke
 *  point closes every such vector uniformly.
 *
 *  ORDER IS LOAD-BEARING — each step must see a FULLY normalized input, so case/Unicode
 *  fold BEFORE the firmlink strip:
 *    1. `.normalize('NFC')`   — compose combining sequences (NFD `José` → NFC `José`)
 *    2. `.toLowerCase()`      — fold case across the WHOLE path, firmlink prefix included
 *    3. strip the leading firmlink prefix, matched against the LOWERCASED constant
 *  If the strip ran before lowercasing (the round-6 bug), a case-variant firmlink
 *  spelling like `/system/volumes/data/Users/x` would not match the exact-case constant,
 *  would not be stripped, and would then land outside the lowercased home → evade the
 *  guard while the OS still hits the real protected dir. Lowercasing first makes the
 *  strip case-insensitive too, so `/System/Volumes/Data`, `/system/volumes/data`, and
 *  every mixed-case spelling collapse identically.
 *  The real lstat/access elsewhere still uses the ORIGINAL-case, original-spelling path —
 *  only the DECISION is normalized.
 *  @param {string} p @returns {string} */
function normalizeForCompare(p) {
  // toLowerCase (NOT full Unicode case-folding) — exotic folds (ς≡σ, ß≡ss, Turkish ı)
  // stay distinct; accepted residual (zero-dep, ADR-0004) — see WP-095 spec.
  const s = p.normalize('NFC').toLowerCase(); // case + Unicode FIRST, whole path
  const fw = DATA_VOLUME_PREFIX.toLowerCase(); // '/system/volumes/data' — match the folded input
  if (s === fw) return '/';
  if (s.startsWith(`${fw}/`)) return s.slice(fw.length);
  return s;
}

/** Is `p` inside a TCC-protected location (macOS only)?
 *  @param {string} p           an absolute path (realpath-resolved by caller if a symlink)
 *  @param {string} home        the user's home dir
 *  @param {NodeJS.Platform} [platform=process.platform]
 *  @returns {{protected:boolean, prefix:string|null}}
 *  Non-darwin platforms are never protected → {protected:false, prefix:null}.
 *  On darwin: protected iff `p` equals or is under home/<one of TCC_PREFIXES>
 *  (compare on path segments, not string prefix — 'Documents' must not match
 *  'DocumentsArchive'). The ENTIRE comparison is NORMALIZED at one choke point
 *  (`normalizeForCompare`, canonical order: Unicode NFC → case-fold → firmlink strip),
 *  applied to BOTH the home-containment test (`path.relative`) AND the protected-prefix
 *  match. macOS/APFS can spell the SAME on-disk dir three ways — firmlink
 *  (`/System/Volumes/Data/Users/x` == `/Users/x`), Unicode form (NFC `José` == NFD
 *  `José`), and case (`/users/x` == `/Users/x` on the default case-insensitive volume).
 *  A symlink target using any variant of a HOME component would otherwise make
 *  `path.relative` return a `..`-prefixed relative → `p` classified OUTSIDE home →
 *  passes → the resolver then `lstat`s the real protected dir → the exact TCC hang this
 *  guard prevents. Normalizing all three closes every such vector. Over-refusing on a
 *  rare volume where a variant is genuinely a distinct dir is FAIL-SAFE: refusing a job
 *  is acceptable; an unattended TCC prompt hang is not. */
function checkPath(p, home, platform = process.platform) {
  if (platform !== 'darwin') return { protected: false, prefix: null };
  // Normalize BOTH sides for the containment + prefix DECISION (comparison only).
  const rel = path.relative(normalizeForCompare(home), normalizeForCompare(p));
  // rel === '' → p is home itself; a '..' prefix or absolute rel → p is outside home.
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return { protected: false, prefix: null };
  }
  const segs = rel.split(path.sep); // already firmlink/NFC/case-normalized via the folded inputs
  for (const prefix of TCC_PREFIXES) {
    const pSegs = prefix.toLowerCase().split('/'); // TCC prefixes are ASCII → lowercase suffices
    if (segs.length >= pSegs.length && pSegs.every((s, i) => s === segs[i])) {
      return { protected: true, prefix };
    }
  }
  return { protected: false, prefix: null };
}

/** Guard a set of paths a job will touch. Returns the first offender or ok.
 *  @param {string[]} paths @param {string} home @param {NodeJS.Platform} [platform]
 *  @returns {{ok:boolean, offending:string|null, prefix:string|null}} */
function guard(paths, home, platform = process.platform) {
  for (const p of paths) {
    const c = checkPath(p, home, platform);
    if (c.protected) return { ok: false, offending: p, prefix: c.prefix };
  }
  return { ok: true, offending: null, prefix: null };
}

module.exports = { TCC_PREFIXES, checkPath, guard };

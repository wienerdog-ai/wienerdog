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

/** Is `p` inside a TCC-protected location (macOS only)?
 *  @param {string} p           an absolute path (realpath-resolved by caller if a symlink)
 *  @param {string} home        the user's home dir
 *  @param {NodeJS.Platform} [platform=process.platform]
 *  @returns {{protected:boolean, prefix:string|null}}
 *  Non-darwin platforms are never protected → {protected:false, prefix:null}.
 *  On darwin: protected iff `p` equals or is under home/<one of TCC_PREFIXES>
 *  (compare on path segments, not string prefix — 'Documents' must not match
 *  'DocumentsArchive'). */
function checkPath(p, home, platform = process.platform) {
  if (platform !== 'darwin') return { protected: false, prefix: null };
  const rel = path.relative(home, p);
  // rel === '' → p is home itself; a '..' prefix or absolute rel → p is outside home.
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return { protected: false, prefix: null };
  }
  const segs = rel.split(path.sep);
  for (const prefix of TCC_PREFIXES) {
    const pSegs = prefix.split('/');
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

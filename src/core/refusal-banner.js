'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * App-side reader/clearer for the launcher's refusal banner (WP-launcher-refusal-banner,
 * ADR-0039 §5, Table B).
 *
 * The banner is a code-owned, fixed-shape markdown file at `<core>/state/refusal-banner.md`
 * that the LAUNCHER writes when it refuses to run a scheduled job. It exists only for the
 * case where the app tree is broken: a refusing launcher never reaches `renderDigest`, so
 * the refusal's promise of "your next digest" cannot be kept through the normal channel.
 *
 * DIRECTION OF THE DEPENDENCY (Table B row B9). The launcher must never require code from
 * the tree it is verifying, so it carries its OWN self-contained writer
 * (`writeRefusalBanner` in `src/scheduler/launcher.js`). This module is the app-side half:
 * it only ever READS and CLEARS. It is not — and must not become — the launcher's writer.
 */

/** Basename of the refusal banner inside <core>/state. */
const REFUSAL_BANNER_FILE = 'refusal-banner.md';

/** Absolute path to the banner. @param {import('./paths').WienerdogPaths} paths
 *  @returns {string} */
function refusalBannerPath(paths) {
  return path.join(paths.state, REFUSAL_BANNER_FILE);
}

/** The banner text, or '' when absent/unreadable/empty. NEVER throws — a missing
 *  banner is the normal case. Trailing newline trimmed.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function readRefusalBanner(paths) {
  try {
    return fs.readFileSync(refusalBannerPath(paths), 'utf8').replace(/\n+$/, '');
  } catch {
    return ''; // absent is the normal case, unreadable is not worth a throw
  }
}

/** Remove the banner. Idempotent; never throws (a missing file is success).
 *  @param {import('./paths').WienerdogPaths} paths @returns {void} */
function clearRefusalBanner(paths) {
  try {
    fs.rmSync(refusalBannerPath(paths), { force: true });
  } catch {
    /* clearing is best-effort — a stale banner must never fail a successful job or sync */
  }
}

module.exports = { REFUSAL_BANNER_FILE, refusalBannerPath, readRefusalBanner, clearRefusalBanner };

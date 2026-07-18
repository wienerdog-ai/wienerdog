'use strict';

/**
 * The codex-cli version the Codex transcript parser (src/core/transcripts/codex.js)
 * was last VERIFIED against — a maintainer record, NOT a production gate. A
 * deployed user never rebuilds the repo and codex-cli updates independently, so a
 * runtime version comparison would be noise; the security property is the parser's
 * fail-closed role classification (WP-100), which holds regardless of version.
 * This constant is the single source of truth the re-verify runbook
 * (docs/runbooks/codex-pin-bump.md) and the parser comments reference.
 * Pure: no fs, no child_process, no env.
 */

/** Maintainer-set at the last full Codex-parser verification; advisory only. */
const SUPPORTED_CODEX = '0.144.1';

/**
 * Parse the leading dotted-numeric version from raw `codex --version` output
 * (e.g. "codex-cli 0.144.1" → "0.144.1"). Returns null when no version is found.
 * @param {string} raw
 * @returns {string|null}
 */
function parseCodexVersion(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

/**
 * Advisory compare of the installed codex version to the last-verified one.
 * Nothing in production consumes it; the runbook (human) and tests do.
 * @param {string} actual  raw `codex --version` output
 * @returns {{ok:boolean, actual:string, supported:string, parsed:string|null}}
 *   ok === true iff the parsed installed version equals SUPPORTED_CODEX.
 */
function checkCodexVersion(actual) {
  const parsed = parseCodexVersion(actual);
  return {
    ok: parsed === SUPPORTED_CODEX,
    actual: typeof actual === 'string' ? actual.trim() : String(actual),
    supported: SUPPORTED_CODEX,
    parsed,
  };
}

module.exports = { SUPPORTED_CODEX, checkCodexVersion, parseCodexVersion };

'use strict';

/**
 * The Claude Code version this WP-133 negative-containment harness's
 * comprehensive proof was last run against — a DEV-TIME record the harness
 * prints, NOT a production gate (WP-135's pre-dream self-check owns runtime
 * safety; ADR-0025 Amendment 2, D-CLAUDE-PIN resolved 2026-07-18).
 *
 * Rationale for record-not-gate: a deployed user never rebuilds the repo and
 * Claude Code auto-updates fast (measured 2.1.212 → 2.1.214 within a day), so
 * a repo-pinned constant goes stale immediately — comparing to it in
 * production would be noise, not a check. The maintainer bumps this when they
 * re-run the full proof; `checkClaudeVersion` is advisory for the harness's
 * own "you're testing a newer version than last certified — re-run me" notice.
 *
 * Pure: no fs, no child_process, no env.
 */

/** Maintainer-set at the last full-proof run; advisory only. */
const SUPPORTED_CLAUDE = '2.1.214';

/**
 * Parse the leading dotted-numeric version out of raw `claude --version`
 * output (e.g. "2.1.214 (Claude Code)" → "2.1.214"). Returns null when no
 * version is found.
 * @param {string} raw
 * @returns {string|null}
 */
function parseClaudeVersion(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

/**
 * Compare the installed Claude version to the last-certified one. Advisory —
 * the harness prints the result; nothing in production consumes it.
 * @param {string} actual  raw `claude --version` output
 * @returns {{ok:boolean, actual:string, supported:string, parsed:string|null}}
 *   ok === true iff the parsed installed version equals SUPPORTED_CLAUDE.
 */
function checkClaudeVersion(actual) {
  const parsed = parseClaudeVersion(actual);
  return {
    ok: parsed === SUPPORTED_CLAUDE,
    actual: typeof actual === 'string' ? actual.trim() : String(actual),
    supported: SUPPORTED_CLAUDE,
    parsed,
  };
}

module.exports = { SUPPORTED_CLAUDE, checkClaudeVersion, parseClaudeVersion };

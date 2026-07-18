'use strict';

// Per-run broker limits (WP-137). One `limitsState` lives for one broker
// process (= one routine run): per-verb call caps bound a hijacked routine's
// blast radius — it cannot issue thousands of reads, drafts, or sends before
// the run ends. Byte caps bound what a single read returns to the model.

const { WienerdogError } = require('../../core/errors');

/** Fresh per-run counter state. @returns {{counts: Map<string, number>}} */
function createLimitsState() {
  return { counts: new Map() };
}

/**
 * Count one call of `verbName` against its per-run cap; throw fail-closed when
 * the cap is exhausted (the call must NOT proceed — zero API calls past cap).
 * @param {{counts: Map<string, number>}} state
 * @param {string} verbName
 * @param {{maxCallsPerRun: number}} limits
 */
function checkAndCount(state, verbName, limits) {
  const used = state.counts.get(verbName) || 0;
  if (used >= limits.maxCallsPerRun) {
    throw new WienerdogError(`per-run call limit reached for ${verbName}`);
  }
  state.counts.set(verbName, used + 1);
}

/**
 * Cap a string at `maxBytes` of UTF-8 (never split a code point): bounds what
 * a read verb returns to the model regardless of the remote payload size.
 * @param {string} text
 * @param {number} maxBytes
 * @returns {string}
 */
function capBytes(text, maxBytes) {
  const s = String(text);
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  const buf = Buffer.from(s, 'utf8').subarray(0, maxBytes);
  // Drop a trailing partial code point left by the byte cut.
  return buf.toString('utf8').replace(/�+$/, '');
}

module.exports = { createLimitsState, checkAndCount, capBytes };

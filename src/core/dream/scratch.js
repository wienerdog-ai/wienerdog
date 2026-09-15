'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { version: appVersion } = require('../../../package.json');

const transcripts = require('../transcripts');
const { mkdirPrivate, writeFilePrivate } = require('../private-fs');
const ledgerLib = require('./ledger');

/** @param {string} stateDir @returns {string} */
function scratchDirOf(stateDir) {
  return path.join(stateDir, 'dream-scratch');
}

/** Make a session_id safe to use as a filename. @param {string} id @returns {string} */
function sanitize(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_');
}

/** A deferral names the discovery basename, never unread transcript content.
 *  `bytes` remains raw discovery size, not a claim about an unmeasured extract.
 *  @param {{harness:'claude'|'codex', path:string, size:number}} d
 *  @returns {{harness:'claude'|'codex', session_id:string, bytes:number}} */
function deferralOf(d) {
  return { harness: d.harness, session_id: path.basename(d.path).replace(/\.[^.]+$/, ''), bytes: d.size };
}

/** Classify an unvisited suffix without an argument-count limit or extra slice.
 *  @param {Array<object>} candidates @param {number} start @param {Array<object>} target */
function deferRemaining(candidates, start, target) {
  for (let i = start; i < candidates.length; i++) target.push(deferralOf(candidates[i]));
}

/**
 * Admit complete filtered extracts newest-first under a compact JSON byte cap.
 * Parse and write one session at a time; corpus metadata alone stays resident.
 * Capacity, elapsed preprocessing time and incomplete reads are separate causes.
 * Only selected inputs become candidates for the successful-dream processed gate.
 * @param {ReturnType<import('../paths').getPaths>} paths
 * @param {import('./ledger').Ledger} ledger
 * @param {number} maxInputBytes
 * @param {{preprocessTimeoutMs?:number, now?:()=>number}} [options]
 */
function collectExtracts(paths, ledger, maxInputBytes, {
  preprocessTimeoutMs = 60_000,
  now = () => performance.now(),
} = {}) {
  const startedAt = now();
  // Discover all files: the ledger alone decides eligibility, including baselines
  // and the sticky secret-revert exception. A memo never overrides this decision.
  const discovered = transcripts.discover(paths, { since: null });
  const candidates = discovered.filter((d) => ledgerLib.selectState(ledger, d) === 'select');
  const newlyQuarantined = [];
  const underCeiling = [];
  for (const d of candidates) {
    if (d.size > transcripts.Limits.PRE_READ_CEILING_BYTES) newlyQuarantined.push({ ...d, reason: 'over-ceiling' });
    else underCeiling.push(d);
  }
  underCeiling.sort((a, b) => b.mtimeMs - a.mtimeMs); // stable on equal mtimes

  // Prune without parsing: changed, absent and ledger-ineligible paths cannot
  // retain size evidence. Valid unvisited records survive either admission stop,
  // even if a larger X would require parsing when the session is finally visited.
  const priorMemos = ledgerLib.normalizeOversizedExtracts(ledger && ledger.oversizedExtracts);
  const oversizedExtracts = {};
  for (const d of underCeiling) {
    const key = ledgerLib.foldKey(d.path);
    const memo = priorMemos[key];
    if (memo && memo.fingerprint === ledgerLib.fingerprint(d) && memo.appVersion === appVersion) {
      oversizedExtracts[key] = memo;
    }
  }

  const scratchDir = scratchDirOf(paths.state);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  mkdirPrivate(scratchDir); // 0700 independent of umask

  const entries = [];
  const wrote = [];
  const processed = [];
  const deferred = [];
  const deadlineDeferred = [];
  const readDeferred = [];
  const oversized = [];
  let remaining = maxInputBytes;
  for (let i = 0; i < underCeiling.length; i++) {
    // Capacity takes precedence when a completed admission filled X exactly.
    // Stops classify the entire unvisited remainder without asserting its size.
    if (remaining === 0) {
      deferRemaining(underCeiling, i, deferred);
      break;
    }
    if (now() - startedAt >= preprocessTimeoutMs) {
      deferRemaining(underCeiling, i, deadlineDeferred);
      break;
    }
    const d = underCeiling[i];
    const key = ledgerLib.foldKey(d.path);
    const memo = oversizedExtracts[key];
    if (memo && memo.extractBytes > maxInputBytes) {
      oversized.push({ ...d, extractBytes: memo.extractBytes, cached: true });
      continue;
    }
    // Each session has its own finite emergency read-work allowance. A complete
    // session already started is measured/admitted even if the clock expires.
    delete oversizedExtracts[key];
    const { extract, parse } = transcripts.parseWithOutcome(d, transcripts.newRunBudget());
    if (parse.outcome !== 'ok') {
      newlyQuarantined.push({ ...d, reason: parse.outcome });
      continue;
    }
    if (parse.runExhausted) {
      readDeferred.push(deferralOf(d)); // discard partial content, then try older inputs
      continue;
    }
    const extractBytes = Buffer.byteLength(JSON.stringify(extract));
    if (extractBytes > maxInputBytes) {
      oversizedExtracts[key] = { fingerprint: ledgerLib.fingerprint(d), appVersion, extractBytes };
      oversized.push({ ...d, extractBytes, cached: false });
      continue;
    }
    if (extractBytes > remaining) {
      deferRemaining(underCeiling, i, deferred);
      break;
    }
    const scratchFile = path.join(scratchDir, `${d.harness}-${sanitize(extract.session_id)}.json`);
    writeFilePrivate(scratchFile, JSON.stringify(extract, null, 2)); // 0600, no trailing newline
    entries.push({
      harness: d.harness,
      session_id: extract.session_id,
      mtimeMs: d.mtimeMs,
      scratchFile,
      truncatedToFit: false,
    });
    wrote.push(scratchFile);
    processed.push(d);
    remaining -= extractBytes;
  }

  return {
    entries,
    scratchDir,
    processed,
    newlyQuarantined,
    deferred,
    droppedForSize: deferred.length,
    dropped: deferred,
    truncated: [],
    wrote,
    deadlineDeferred,
    readDeferred,
    oversized,
    oversizedExtracts,
  };
}

/**
 * rm -rf the scratch dir. WP-017 calls this in a finally block — always.
 * @param {string} stateDir
 */
function cleanScratch(stateDir) {
  fs.rmSync(scratchDirOf(stateDir), { recursive: true, force: true });
}

module.exports = { collectExtracts, cleanScratch };

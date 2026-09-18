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

/** The width bound on a sanitized session_id (WP-dream-collect-parse-throw-quarantine,
 *  Table B row B6). The derived name `<harness>-<id>.json` is then at most 139
 *  bytes, far inside every supported filesystem's 255-byte limit, so a long
 *  session_id can no longer reach `writeFilePrivate` as an ENAMETOOLONG — which
 *  is what makes every REMAINING write failure environmental. 128 is generous
 *  against both harnesses' real ids (UUIDs, 36 characters). */
const SCRATCH_ID_MAX_CHARS = 128;

/** Make a session_id safe to use as a filename. The slice is applied AFTER the
 *  replace, so a long id cannot be truncated into something the character
 *  allowlist never saw. @param {string} id @returns {string} */
function sanitize(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, SCRATCH_ID_MAX_CHARS);
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
 * What is MEASURED and what is WRITTEN are two different extracts
 * (WP-dream-primary-dialogue-collection, Table C rows C1 and C2). `X` is
 * measured against `intakeBytes` — the compact JSON length of the RAW capped
 * extract, byte-identical to what this loop computed before that package — so
 * every byte-based admission decision is the one the previous collector made on
 * the same input. What reaches scratch, and therefore the model, is the smaller
 * PRIMARY DIALOGUE projection. The guarantee is byte-policy equivalence, not
 * admitted-set identity: the soft preprocessing deadline below is wall-clock, and
 * projection changes preprocessing cost in both directions, so a deadline-bound
 * run can visit a different set of sessions (row C1a).
 * @param {ReturnType<import('../paths').getPaths>} paths
 * @param {import('./ledger').Ledger} ledger
 * @param {number} maxInputBytes
 * @param {{preprocessTimeoutMs?:number, now?:()=>number}} [options]
 * @returns {{entries:Array<object>, scratchDir:string, processed:Array<object>,
 *            newlyQuarantined:Array<{harness:'claude'|'codex', path:string, mtimeMs:number,
 *                                    size:number, dev:number, ino:number,
 *                                    reason:'over-ceiling'|'too-many-lines'|'read-error'|'parse-threw'}>,
 *            skippedQuarantined:number,
 *            deferred:Array<object>, droppedForSize:number, dropped:Array<object>,
 *            truncated:Array<object>, wrote:Array<string>,
 *            deadlineDeferred:Array<object>, readDeferred:Array<object>,
 *            oversized:Array<object>, oversizedExtracts:Record<string, object>,
 *            gateExtracts:Map<string, import('../transcripts').GateExtract>,
 *            intakeBytesTotal:number}}
 */
function collectExtracts(paths, ledger, maxInputBytes, {
  preprocessTimeoutMs = 60_000,
  now = () => performance.now(),
} = {}) {
  const startedAt = now();
  // Discover all files: the ledger alone decides eligibility, including baselines
  // and the sticky secret-revert exception. A memo never overrides this decision.
  const discovered = transcripts.discover(paths, { since: null });
  // The same single selectState call also counts the files this run ACTUALLY
  // skipped for an existing quarantine — a count the filter used to discard and
  // nothing outside it could recover. 'skip-processed' is not a skip and is not
  // counted; a consolidated transcript is not missing from the run.
  const candidates = [];
  let skippedQuarantined = 0;
  for (const d of discovered) {
    const state = ledgerLib.selectState(ledger, d);
    if (state === 'select') candidates.push(d);
    else if (state === 'skip-quarantined') skippedQuarantined++;
  }
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
  // Row C4: the text-free gate projections of the sessions this run WROTE,
  // keyed `<harness>:<session_id>` in write order. It lives in memory for the
  // run only — never written to any file, never placed anywhere a model can
  // read, never handed to a model. `gateKeyByFile` is what implements the
  // EVICTION: two session ids can sanitize to one scratch filename (row C4a),
  // and on disk the later write overwrites the earlier one, so the map must
  // hold exactly one session per distinct filename — the last one written.
  /** @type {Map<string, import('../transcripts').GateExtract>} */
  const gateExtracts = new Map();
  /** @type {Map<string, string>} scratch filename -> the key it last wrote */
  const gateKeyByFile = new Map();
  let intakeBytesTotal = 0;
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
    /** @type {any} */ let extract;
    /** @type {any} */ let gateExtract;
    /** @type {any} */ let parse;
    let intakeBytes = 0;
    let extractBytes = 0;
    let scratchFile = '';
    let payload = '';
    // THE PER-CANDIDATE FAULT BOUNDARY (WP-dream-collect-parse-throw-quarantine,
    // Table B). Inside it are exactly the CONTENT-DERIVED steps of this
    // iteration's preparation, in their existing order; `writeFilePrivate` and
    // everything after it — the gate-map writes, the pushes and the two
    // accumulators — stay OUTSIDE, because a write failure is environmental (a
    // full disk, a revoked permission) and must keep ending the run loudly.
    // Transcript content is fully attacker-influenceable and is not our grammar:
    // the guarantee is stated as our own good — one candidate's preparation
    // either completes or that candidate is set aside — rather than as a list of
    // the expressions that can throw, which could never be closed (row B7).
    try {
      ({ extract, gateExtract, intakeBytes, parse } =
        transcripts.parsePrimaryWithOutcome(d, transcripts.newRunBudget()));
      if (parse.outcome !== 'ok') {
        newlyQuarantined.push({ ...d, reason: parse.outcome });
        continue;
      }
      if (parse.runExhausted) {
        readDeferred.push(deferralOf(d)); // discard partial content, then try older inputs
        continue;
      }
      // Row C1: X is measured against the TRANSCRIPT INTAKE, never against the
      // projection. `intakeBytes` is the compact JSON length of the raw capped
      // extract — the exact number this line computed before this package — so
      // the capacity stop, the individually-oversized skip and the memo it writes
      // all keep the verdicts they had.
      extractBytes = intakeBytes;
      if (extractBytes > maxInputBytes) {
        oversizedExtracts[key] = { fingerprint: ledgerLib.fingerprint(d), appVersion, extractBytes };
        oversized.push({ ...d, extractBytes, cached: false });
        continue;
      }
      if (extractBytes > remaining) {
        deferRemaining(underCeiling, i, deferred);
        break;
      }
      scratchFile = path.join(scratchDir, `${d.harness}-${sanitize(extract.session_id)}.json`);
      // Row C2: the PROJECTION is what reaches disk — an extract whose projection
      // retained no messages is still written, with its identity and an empty
      // `messages` array.
      payload = JSON.stringify(extract, null, 2);
    } catch {
      // The caught value is DISCARDED UNBOUND: no message, name, stack or code
      // derived from attacker-influenceable bytes reaches the ledger, the
      // console, reports/warnings.md, the dream report or the scratch directory
      // (Table A row A5). The reason is a code-owned literal, written here and
      // nowhere else (row A1). A set-aside candidate consumes nothing: no
      // scratch file, no capacity, no gate-map entry (row B3).
      newlyQuarantined.push({ ...d, reason: 'parse-threw' });
      continue;
    }
    writeFilePrivate(scratchFile, payload); // 0600, no trailing newline
    const gateKey = `${d.harness}:${extract.session_id}`;
    const evicted = gateKeyByFile.get(scratchFile);
    if (evicted !== undefined) gateExtracts.delete(evicted); // row C4's eviction
    gateExtracts.set(gateKey, gateExtract);
    gateKeyByFile.set(scratchFile, gateKey);
    entries.push({
      harness: d.harness,
      session_id: extract.session_id,
      mtimeMs: d.mtimeMs,
      scratchFile,
      truncatedToFit: false,
    });
    wrote.push(scratchFile);
    processed.push(d);
    intakeBytesTotal += intakeBytes;
    remaining -= extractBytes;
  }

  return {
    entries,
    scratchDir,
    processed,
    newlyQuarantined,
    skippedQuarantined,
    deferred,
    droppedForSize: deferred.length,
    dropped: deferred,
    truncated: [],
    wrote,
    deadlineDeferred,
    readDeferred,
    oversized,
    oversizedExtracts,
    gateExtracts,
    intakeBytesTotal,
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

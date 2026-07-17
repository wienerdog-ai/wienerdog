'use strict';

const fs = require('node:fs');
const path = require('node:path');

const transcripts = require('../transcripts');
const ledgerLib = require('./ledger');

/** Minimum bytes a *truncated* extract must be granted to be worth feeding. A
 *  session that cannot be given at least this much is dropped whole (and retried
 *  next run) rather than fed a sub-useful sliver. FIXED. Whole-fit sessions
 *  smaller than this are unaffected — the floor gates truncation size, not
 *  whole-session size. With the 8 MB default budget the newest session is always
 *  either kept whole or truncated to >= this floor, so the dream never wedges. */
const MIN_TRUNCATE_BYTES = 32_768;

/** @param {string} stateDir @returns {string} */
function scratchDirOf(stateDir) {
  return path.join(stateDir, 'dream-scratch');
}

/** Make a session_id safe to use as a filename. @param {string} id @returns {string} */
function sanitize(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_');
}

/** Keep the NEWEST messages of `extract` whose serialized form fits `targetBytes`
 *  (drop oldest). Sets truncated=true and recomputes `started` to the new first
 *  (oldest-remaining) message. Binary-searches the largest newest-message suffix
 *  that fits — byteLength is monotonic in suffix length. Redaction already ran in
 *  parse(), so no re-redaction is needed here.
 *  @param {import('../transcripts').Extract} extract
 *  @param {number} targetBytes  guaranteed >= MIN_TRUNCATE_BYTES by the caller
 *  @returns {import('../transcripts').Extract} */
function truncateExtractToFit(extract, targetBytes) {
  const msgs = extract.messages;
  const build = (k) => {
    const keptMsgs = k === 0 ? [] : msgs.slice(msgs.length - k);
    const dropped = msgs.length - keptMsgs.length; // leading messages removed
    const out = { ...extract, truncated: true, started: keptMsgs.length ? keptMsgs[0].ts : null, messages: keptMsgs };
    if (Array.isArray(extract.skill_invocations)) {
      // Front-truncation: subtract the dropped-leading count from index/resultIndex
      // and drop any invocation whose window fell into the removed prefix. Same
      // helper WP-080 uses under the message COUNT cap — keeping the two truncation
      // paths consistent so security-load-bearing indices always match `messages`.
      // Then apply the SAME right-edge (upper-bound) filter the count-cap path uses
      // at transcripts/index.js:135-136: a trailing invocation whose raw index ===
      // messages.length rebases to keptMsgs.length (one past the end) and must be
      // dropped — rebaseInvocations only checks the lower bound (>= 0).
      out.skill_invocations = transcripts
        .rebaseInvocations(extract.skill_invocations, dropped)
        .filter(
          (si) => si.index < keptMsgs.length && (si.resultIndex === null || si.resultIndex < keptMsgs.length),
        );
    }
    return out;
  };
  let lo = 0,
    hi = msgs.length,
    best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Buffer.byteLength(JSON.stringify(build(mid))) <= targetBytes) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return build(best);
}

/** A capacity-deferral entry for a file that was never (fully) parsed: the id is
 *  derived from the basename (extension stripped), NOT from content — the file
 *  may never have been opened. Console-surface only.
 *  @param {{harness:'claude'|'codex', path:string, size:number}} d
 *  @returns {{harness:'claude'|'codex', session_id:string, bytes:number}} */
function deferralOf(d) {
  return { harness: d.harness, session_id: path.basename(d.path).replace(/\.[^.]+$/, ''), bytes: d.size };
}

/**
 * Select the transcripts to dream over (per-file quarantine ledger + a TOTAL
 * input cap — audit A6, ADR-0023) and write redacted extracts to scratch,
 * materializing ONE file at a time (the F1 fix: no point holds every parsed
 * extract in memory).
 * @param {ReturnType<import('../paths').getPaths>} paths
 * @param {import('./ledger').Ledger} ledger
 * @param {number} maxInputBytes
 * @returns {{ entries: Array<{harness:'claude'|'codex', session_id:string, mtimeMs:number, scratchFile:string, truncatedToFit:boolean}>,
 *             scratchDir:string,
 *             processed:Array<{harness:'claude'|'codex', path:string, mtimeMs:number, size:number, dev:number, ino:number}>,
 *             newlyQuarantined:Array<{harness:'claude'|'codex', path:string, mtimeMs:number, size:number, dev:number, ino:number, reason:string}>,
 *             deferred:Array<{harness:'claude'|'codex', session_id:string, bytes:number}>,
 *             droppedForSize:number,
 *             dropped:Array<{harness:'claude'|'codex', session_id:string, bytes:number}>,
 *             truncated:Array<{harness:'claude'|'codex', session_id:string, originalBytes:number, keptBytes:number}>,
 *             wrote:string[] }}
 *   processed        = every session WRITTEN to scratch (dream.js records these on commit).
 *   newlyQuarantined = quarantined this run (dream.js records + banners).
 *   deferred         = capacity-deferred; recorded NOWHERE → retried next run.
 *   dropped          = back-compat alias of deferred; droppedForSize === deferred.length.
 */
function collectExtracts(paths, ledger, maxInputBytes) {
  // 1. Discover ALL files (`since: null`): the ledger, not a coarse `since`, is
  //    the sole authority on eligibility; discovery is cheap stats (ADR-0023).
  const discovered = transcripts.discover(paths, { since: null });

  // 2. Partition by ledger state; only 'select' proceeds (skip-processed and
  //    skip-quarantined are ignored — an unchanged quarantine is never retried).
  const candidates = discovered.filter((d) => ledgerLib.selectState(ledger, d) === 'select');

  // 3. Pre-read ceiling → quarantine WITHOUT parsing (the file is never opened);
  //    it never enters the byte budget.
  /** @type {Array<{harness:'claude'|'codex', path:string, mtimeMs:number, size:number, dev:number, ino:number, reason:string}>} */
  const newlyQuarantined = [];
  /** @type {typeof candidates} */
  const underCeiling = [];
  for (const d of candidates) {
    if (d.size > transcripts.Limits.PRE_READ_CEILING_BYTES) newlyQuarantined.push({ ...d, reason: 'over-ceiling' });
    else underCeiling.push(d);
  }

  // 4. TOTAL byte budget via water-filling, allocated from the discovery `size`
  //    (an over-estimate of the serialized extract, so the grant is conservative).
  //    Sessions whose file fits their equal share are kept whole; boundary
  //    sessions get a truncation share (>= the floor) or are capacity-deferred
  //    whole (sub-floor) — deferred is NOT quarantined, NOT recorded.
  underCeiling.sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
  const sizes = underCeiling.map((d) => d.size);

  let active = underCeiling.map((_, i) => i); // indices, newest-first
  let remaining = maxInputBytes;
  /** @type {Map<number, number>} idx -> bytes granted (absent = deferred whole) */
  const alloc = new Map();
  /** @type {Array<{harness:'claude'|'codex', session_id:string, bytes:number}>} */
  const deferred = [];

  while (active.length > 0) {
    const share = Math.floor(remaining / active.length);
    const satisfied = active.filter((i) => sizes[i] <= share);
    if (satisfied.length > 0) {
      const set = new Set(satisfied);
      for (const i of satisfied) {
        alloc.set(i, sizes[i]);
        remaining -= sizes[i];
      }
      active = active.filter((i) => !set.has(i));
      continue;
    }
    if (share >= MIN_TRUNCATE_BYTES) {
      for (const i of active) alloc.set(i, share); // all get an equal, useful share
      active = [];
      break;
    }
    // Share too small to be useful → defer the OLDEST active session, retry.
    deferred.push(deferralOf(underCeiling[active[active.length - 1]])); // active preserves newest-first
    active = active.slice(0, -1);
  }

  // 5. (Re)create an empty scratch dir BEFORE the parse/write loop.
  const scratchDir = scratchDirOf(paths.state);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  fs.mkdirSync(scratchDir, { recursive: true });

  // 6. Parse + materialize ONE file at a time, newest-first grant order, under
  //    ONE shared run budget: parse → (maybe truncate) → write → drop the
  //    extract object. A runExhausted parse is a partial read: per ADR-0023 the
  //    partial extract is DISCARDED and the file capacity-deferred (recording it
  //    processed would silently lose its unread tail — the WP-048/069 class);
  //    once the run budget is drained, every later candidate is likewise
  //    deferred (amended 2026-07-17).
  const sizeOf = (extract) => Buffer.byteLength(JSON.stringify(extract));
  const budget = transcripts.newRunBudget();
  let runExhausted = false;
  const entries = [];
  const wrote = [];
  /** @type {typeof underCeiling} */
  const processed = [];
  /** @type {Array<{harness:'claude'|'codex', session_id:string, originalBytes:number, keptBytes:number}>} */
  const truncated = [];
  for (let i = 0; i < underCeiling.length; i++) {
    if (!alloc.has(i)) continue; // capacity-deferred whole (already listed)
    const d = underCeiling[i];
    if (runExhausted) {
      deferred.push(deferralOf(d));
      continue;
    }
    const grant = alloc.get(i);
    const { extract: parsedExtract, parse } = transcripts.parseWithOutcome(d, budget);
    if (parse.outcome !== 'ok') {
      newlyQuarantined.push({ ...d, reason: parse.outcome });
      continue; // no scratch file for a quarantined parse
    }
    if (parse.runExhausted) {
      runExhausted = true; // discard the partial extract; defer, record nothing
      deferred.push(deferralOf(d));
      continue;
    }
    let extract = parsedExtract;
    let truncatedToFit = false;
    const serialized = sizeOf(extract);
    // A whole-file grant (grant === d.size) is kept whole; an under-granted
    // share still enforces the exact serialized grant, as today.
    if (grant < d.size && serialized > grant) {
      extract = truncateExtractToFit(extract, grant);
      truncatedToFit = true;
      truncated.push({
        harness: d.harness,
        session_id: extract.session_id,
        originalBytes: serialized,
        keptBytes: sizeOf(extract),
      });
    }
    const scratchFile = path.join(scratchDir, `${d.harness}-${sanitize(extract.session_id)}.json`);
    fs.writeFileSync(scratchFile, JSON.stringify(extract, null, 2));
    entries.push({
      harness: d.harness,
      session_id: extract.session_id,
      mtimeMs: d.mtimeMs,
      scratchFile,
      truncatedToFit,
    });
    wrote.push(scratchFile);
    processed.push(d);
    // `extract`/`parsedExtract` go out of scope here — never all resident at once.
  }

  return {
    entries,
    scratchDir,
    processed,
    newlyQuarantined,
    deferred,
    droppedForSize: deferred.length,
    dropped: deferred, // back-compat alias (the capacity-wedge message reads it)
    truncated,
    wrote,
  };
}

/**
 * rm -rf the scratch dir. WP-017 calls this in a finally block — always.
 * @param {string} stateDir
 */
function cleanScratch(stateDir) {
  fs.rmSync(scratchDirOf(stateDir), { recursive: true, force: true });
}

module.exports = { collectExtracts, cleanScratch, MIN_TRUNCATE_BYTES };

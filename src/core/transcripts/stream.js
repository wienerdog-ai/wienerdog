'use strict';

// Bounded synchronous transcript line reader — the intake half of ADR-0023
// (2026-07-15 security audit action A6, findings F1/F6). Transcript content is
// fully attacker-influenceable, so every read here is bounded: a pre-read file
// ceiling, a per-line byte cap, a per-file line-count cap, and a shared per-run
// aggregate byte budget. The whole file is NEVER held in memory.
// Pure except for one fs file handle; no env, no argv, no network.

const fs = require('node:fs');

/**
 * Bounded-intake limits (audit A6, ADR-0023). All values OWNER-APPROVED 2026-07-17
 * — see the spec's OWNER-APPROVED block. Keep them here as named
 * constants so the ledger (WP-119) and the tests import ONE definition.
 */
const Limits = {
  PRE_READ_CEILING_BYTES: 50 * 1024 * 1024, // a file larger than this is NOT opened → quarantined
  MAX_LINE_BYTES: 1 * 1024 * 1024, // a single line over this → oversized-record marker
  MAX_LINES: 500_000, // per-file line-count cap → quarantine when exceeded
  MAX_RUN_BYTES: 200 * 1024 * 1024, // aggregate bytes read across ALL files in one run
  READ_CHUNK_BYTES: 64 * 1024, // fixed read buffer size
  MAX_JSON_DEPTH: 64, // nesting-depth pre-check before JSON.parse
};

/**
 * A shared run-scoped byte budget so MAX_RUN_BYTES bounds the WHOLE run, not each file.
 * The caller creates one per collectExtracts run and threads it through every streamLines
 * call. When the run budget is exhausted mid-file, streaming stops and the file is
 * reported truncated-by-run (its already-emitted lines are kept; it is NOT quarantined —
 * it is capacity-deferred, retried next run).
 * @returns {{remaining: number}}
 */
function newRunBudget() {
  return { remaining: Limits.MAX_RUN_BYTES };
}

/** The fixed, code-owned marker a caller emits in place of an over-cap line's text.
 *  It is a COMPLETE, valid standalone token — NOT valid JSON — so a parser that
 *  JSON.parses it fails and skips it (an oversized JSON record contributes no message);
 *  a parser that treats a line as already-extracted text substitutes this literal. */
const OVERSIZED_RECORD_MARKER = '[wienerdog: oversized record omitted]';

/**
 * @typedef {'ok'|'over-ceiling'|'too-many-lines'|'read-error'} StreamOutcome
 *   ok            — file streamed within all per-file caps (some lines may be marked).
 *   over-ceiling  — file size > PRE_READ_CEILING_BYTES; NOT opened; zero lines delivered.
 *   too-many-lines— MAX_LINES exceeded; streaming stopped; file is quarantine-worthy.
 *   read-error    — open/read threw after the ceiling check (I/O error); quarantine-worthy.
 * @typedef {{outcome: StreamOutcome, lines: number, oversizedRecords: number,
 *            runExhausted: boolean}} StreamResult
 */

/**
 * Stream `filePath` line by line, calling `onLine(text)` for each complete line within
 * MAX_LINE_BYTES. NEVER reads the whole file into memory: a fixed READ_CHUNK_BYTES buffer
 * accumulates bytes until a newline. Enforces, in order:
 *  - size > PRE_READ_CEILING_BYTES  → return { outcome:'over-ceiling' } WITHOUT opening.
 *  - a line whose byte length would exceed MAX_LINE_BYTES → the overflow bytes are
 *    discarded up to the next newline (never buffered); `onLine(OVERSIZED_RECORD_MARKER)`
 *    is called exactly once for that line; oversizedRecords++ . The session keeps going.
 *  - lines delivered/skipped count toward `lines`; when `lines` would exceed MAX_LINES →
 *    stop and return { outcome:'too-many-lines' }.
 *  - each chunk's bytes are subtracted from `budget.remaining` (reads are clamped to the
 *    remaining budget); when it reaches 0 mid-file, stop, set runExhausted:true, return
 *    { outcome:'ok', runExhausted:true } (deferred).
 * A trailing line with no final newline is delivered. `\r\n` is handled (the `\r` is left
 * on the line; callers already `JSON.parse`/`trim`). Bytes are decoded as UTF-8 per line
 * with `Buffer.toString('utf8')` (invalid sequences → U+FFFD, never a throw).
 * @param {string} filePath
 * @param {number} sizeBytes  the discovery-recorded fs size (avoids a second stat)
 * @param {{remaining:number}} budget  shared run budget from newRunBudget()
 * @param {(text:string)=>void} onLine
 * @returns {StreamResult}
 */
function streamLines(filePath, sizeBytes, budget, onLine) {
  const result = { outcome: 'ok', lines: 0, oversizedRecords: 0, runExhausted: false };

  if (sizeBytes > Limits.PRE_READ_CEILING_BYTES) {
    result.outcome = 'over-ceiling';
    return result;
  }

  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    result.outcome = 'read-error';
    return result;
  }

  const chunk = Buffer.allocUnsafe(Limits.READ_CHUNK_BYTES);
  /** @type {Buffer[]} buffered segments of the current (incomplete) line */
  let pending = [];
  let pendingBytes = 0;
  let overflowing = false; // current line exceeded MAX_LINE_BYTES; discard until newline

  /**
   * Deliver one completed line (or the marker). Returns false when delivering
   * would exceed MAX_LINES — the caller must stop with too-many-lines.
   * @param {string} text @param {boolean} oversized @returns {boolean}
   */
  function deliver(text, oversized) {
    if (result.lines >= Limits.MAX_LINES) return false;
    result.lines += 1;
    if (oversized) result.oversizedRecords += 1;
    onLine(text);
    return true;
  }

  /** Finish the line buffered in `pending`/`overflowing`. @returns {boolean} */
  function finishLine() {
    if (overflowing) {
      overflowing = false;
      pending = [];
      pendingBytes = 0;
      return deliver(OVERSIZED_RECORD_MARKER, true);
    }
    const text = pendingBytes === 0 ? '' : Buffer.concat(pending, pendingBytes).toString('utf8');
    pending = [];
    pendingBytes = 0;
    return deliver(text, false);
  }

  let bytesConsumed = 0; // cumulative bytes read from THIS file

  try {
    for (;;) {
      if (budget.remaining <= 0) {
        // A binding budget always lands exactly on 0 (reads are clamped to the
        // remaining budget), so budget-zero can coincide with EOF. Exhaustion
        // is only real when unread bytes remain; at exact-EOF this is a normal
        // full read — fall through to deliver the trailing no-newline line.
        if (bytesConsumed < sizeBytes) {
          result.runExhausted = true;
          return result;
        }
        break; // file fully read; not exhaustion
      }
      let bytesRead;
      try {
        bytesRead = fs.readSync(fd, chunk, 0, Math.min(Limits.READ_CHUNK_BYTES, budget.remaining), null);
      } catch {
        result.outcome = 'read-error';
        return result;
      }
      if (bytesRead === 0) break; // EOF
      bytesConsumed += bytesRead;
      budget.remaining -= bytesRead;

      let start = 0;
      while (start < bytesRead) {
        let nl = chunk.indexOf(0x0a, start);
        if (nl >= bytesRead) nl = -1; // stale byte beyond this read's valid region
        const end = nl === -1 ? bytesRead : nl;
        const segLen = end - start;
        if (!overflowing && segLen > 0) {
          if (pendingBytes + segLen > Limits.MAX_LINE_BYTES) {
            // Over the per-line cap: drop what was buffered and discard the
            // rest of this line — overflow bytes are never buffered.
            overflowing = true;
            pending = [];
            pendingBytes = 0;
          } else {
            pending.push(Buffer.from(chunk.subarray(start, end)));
            pendingBytes += segLen;
          }
        }
        if (nl === -1) {
          start = bytesRead;
        } else {
          if (!finishLine()) {
            result.outcome = 'too-many-lines';
            return result;
          }
          start = nl + 1;
        }
      }
    }

    // EOF: a trailing line with no final newline is delivered.
    if (overflowing || pendingBytes > 0) {
      if (!finishLine()) result.outcome = 'too-many-lines';
    }
    return result;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // fd close failure is not actionable
    }
  }
}

/** Cheap structural nesting-depth check WITHOUT parsing: scan the string counting the
 *  running depth of `{`/`[` minus `}`/`]`, ignoring bracket chars inside a JSON string
 *  (track an in-string flag + `\`-escape). Returns the max depth seen. A caller rejects
 *  the line (skips JSON.parse) when this exceeds MAX_JSON_DEPTH, so a pathologically deep
 *  line never reaches V8's recursive parser (which would throw RangeError anyway, but the
 *  guard makes the bound explicit and cheap).
 *  @param {string} line @returns {number} */
function maxJsonDepth(line) {
  let depth = 0;
  let max = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{' || c === '[') {
      depth += 1;
      if (depth > max) max = depth;
    } else if (c === '}' || c === ']') {
      depth -= 1;
    }
  }
  return max;
}

module.exports = { Limits, newRunBudget, streamLines, maxJsonDepth, OVERSIZED_RECORD_MARKER };

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverClaude, parseClaudeTranscript } = require('./claude');
const { discoverCodex, parseCodexTranscript } = require('./codex');
const { redactOnly } = require('../secret-scan');
const { Limits, newRunBudget, OVERSIZED_RECORD_MARKER } = require('./stream');

/** @typedef {Object} Extract
 *  @property {'claude'|'codex'} harness
 *  @property {string}      session_id
 *  @property {string|null} started      // ISO ts of the first message, or null
 *  @property {string|null} cwd
 *  @property {string}      source_path  // absolute path of the transcript file
 *  @property {boolean}     truncated    // true if any size cap was applied
 *  @property {Array<{role:'user'|'assistant'|'tool_result', text:string, ts:string|null}>} messages
 *  @property {Array<{skill:string, index:number, resultIndex:number|null, errored:boolean}>} [skill_invocations]  // Claude only; each Skill tool_use: name, timeline index, its paired result's index (null if uncaptured), whether it errored
 *
 *  NOTE (WP-118): `size`/`dev`/`ino` are NOT on the extract — they ride the
 *  discovery record (see `discover`), so the quarantine ledger (WP-119) can
 *  fingerprint a file and enforce the pre-read ceiling before opening it.
 */

/** @typedef {import('./stream').StreamOutcome} ParseOutcome
 *  Mirrors StreamOutcome: 'ok' | 'over-ceiling' | 'too-many-lines' | 'read-error'.
 *  Non-'ok' values are the per-file quarantine signal WP-119 consumes; a
 *  runExhausted 'ok' is capacity-deferred (retried next run), NOT quarantined. */

const MAX_MSG_CHARS = 4000;
const MAX_MESSAGES = 2000;
const MAX_EXTRACT_PATH_CHARS = 160;

/**
 * Bound an extract metadata path before it reaches scratch/brain (audit A5,
 * WP-122 OWNER-APPROVED): pseudonymize the home prefix to `~` so the username
 * and absolute home structure are never exposed to the brain, then cap the
 * result at MAX_EXTRACT_PATH_CHARS (a `…` marks the cut). Non-string values
 * (a null cwd) pass through untouched.
 * @param {string|null|undefined} value
 * @returns {string|null|undefined}
 */
function boundExtractPath(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  const home = os.homedir();
  let bounded = value;
  if (home && (value === home || value.startsWith(home + path.sep))) {
    bounded = `~${value.slice(home.length)}`;
  }
  if (bounded.length > MAX_EXTRACT_PATH_CHARS) {
    bounded = `${bounded.slice(0, MAX_EXTRACT_PATH_CHARS)}…`;
  }
  return bounded;
}

/**
 * Redact secret-looking substrings. Exported so the dream orchestrator
 * (WP-008) reuses the SAME pass instead of re-implementing it. Since WP-122
 * this delegates to the ONE shared detector (`src/core/secret-scan.js`,
 * ADR-0024) — byte-compatible for everything the old local list covered,
 * with the A5 upgraded coverage and fail-closed semantics on top.
 * @param {string} text
 * @returns {string}
 */
function redact(text) {
  return redactOnly(text);
}

/**
 * Discover across both harnesses. size/dev/ino ride the discovery record for
 * the quarantine ledger (WP-119) and the pre-read ceiling (ADR-0023).
 * @param {ReturnType<import('../paths').getPaths>} paths
 * @param {{since:number|null}} opts
 * @returns {Array<{harness:'claude'|'codex', path:string, mtimeMs:number, size:number, dev:number, ino:number}>}
 */
function discover(paths, opts) {
  const claudeEntries = discoverClaude(path.join(paths.claudeDir, 'projects'), opts).map((e) => ({
    harness: 'claude',
    path: e.path,
    mtimeMs: e.mtimeMs,
    size: e.size,
    dev: e.dev,
    ino: e.ino,
  }));
  const codexEntries = discoverCodex(path.join(paths.codexDir, 'sessions'), opts).map((e) => ({
    harness: 'codex',
    path: e.path,
    mtimeMs: e.mtimeMs,
    size: e.size,
    dev: e.dev,
    ino: e.ino,
  }));
  return [...claudeEntries, ...codexEntries].sort((a, b) => a.mtimeMs - b.mtimeMs);
}

/**
 * Apply the per-message char cap. Redact before truncating.
 * @param {{role:string, text:string, ts:string|null}} message
 * @returns {{message:{role:string, text:string, ts:string|null}, capped:boolean}}
 */
function capMessage(message) {
  const redacted = redact(message.text);
  if (redacted.length <= MAX_MSG_CHARS) {
    return { message: { ...message, text: redacted }, capped: false };
  }
  const overflow = redacted.length - MAX_MSG_CHARS;
  const truncatedText = `${redacted.slice(0, MAX_MSG_CHARS)}\n…[truncated ${overflow} chars]`;
  return { message: { ...message, text: truncatedText }, capped: true };
}

/**
 * Rebase skill_invocations after `dropped` leading messages were removed: subtract
 * `dropped` from index and resultIndex, and DROP any invocation whose window is no
 * longer fully retained (its index fell below 0; a non-null result fell below 0).
 * @param {Array<{skill:string,index:number,resultIndex:number|null,errored:boolean}>} invocations
 * @param {number} dropped
 * @returns {typeof invocations}
 */
function rebaseInvocations(invocations, dropped) {
  return invocations
    .map((si) => ({ ...si, index: si.index - dropped, resultIndex: si.resultIndex == null ? null : si.resultIndex - dropped }))
    .filter((si) => si.index >= 0 && (si.resultIndex === null || si.resultIndex >= 0));
}

/**
 * Parse + redact + size-cap one discovered entry, reporting the streaming
 * outcome. This is the export the quarantine ledger (WP-119) consumes: the
 * shared run `budget` bounds aggregate intake I/O across the whole run, and
 * `parse.outcome` carries the per-file quarantine signal.
 * @param {{harness:'claude'|'codex', path:string, size?:number}} entry
 * @param {{remaining:number}} budget  shared run budget from newRunBudget()
 * @returns {{extract: Extract, parse: {outcome: ParseOutcome, oversizedRecords: number, runExhausted: boolean}}}
 */
function parseWithOutcome(entry, budget) {
  let sizeBytes = entry.size;
  if (typeof sizeBytes !== 'number') {
    // Back-compat seam for pre-WP-118 callers whose entries lack `size`
    // (discover now records it). A failed stat falls through to the parser,
    // whose open fails the same way → 'read-error' quarantine signal.
    try {
      sizeBytes = fs.statSync(entry.path).size;
    } catch {
      sizeBytes = 0;
    }
  }
  const { extract: raw, parse: outcome } =
    entry.harness === 'codex'
      ? parseCodexTranscript(entry.path, sizeBytes, budget)
      : parseClaudeTranscript(entry.path, sizeBytes, budget);

  let truncated = raw.truncated;
  let messages = raw.messages.map((message) => {
    const { message: capped, capped: wasCapped } = capMessage(message);
    if (wasCapped) truncated = true;
    return capped;
  });

  // Capping invariant: after capping, every emitted index/resultIndex refers to
  // the exact `messages` array written to the extract; front-truncation
  // subtracts the dropped-leading count from both, and any invocation whose
  // window (invocation through its paired result) is not fully retained is
  // dropped.
  let rebased; // set only when the count cap fires
  if (messages.length > MAX_MESSAGES) {
    const dropped = messages.length - MAX_MESSAGES;
    messages = messages.slice(dropped);
    truncated = true;
    if (Array.isArray(raw.skill_invocations)) {
      // Right-edge guard: a trailing Skill tool_use with no later emitted
      // message has raw index === raw messages length; after rebasing it
      // would equal the retained count — outside the emitted array. Drop it
      // (and, defensively, any out-of-range resultIndex) so the capping
      // invariant holds on both edges.
      rebased = rebaseInvocations(raw.skill_invocations, dropped).filter(
        (si) => si.index < messages.length && (si.resultIndex === null || si.resultIndex < messages.length),
      );
    }
  }

  const out = { ...raw, truncated, messages };
  if (rebased !== undefined) out.skill_invocations = rebased; // else `...raw` carries the untouched array (or none for Codex)
  // Bound metadata paths before the extract reaches scratch/brain (audit A5):
  // home prefix → `~`, remainder capped. `session_id` is left alone — it is
  // already filename-sanitized downstream (scratch.js).
  out.source_path = boundExtractPath(out.source_path);
  out.cwd = boundExtractPath(out.cwd);
  return { extract: out, parse: outcome };
}

/**
 * Parse + redact + size-cap one discovered entry. BACKWARD-COMPATIBLE wrapper
 * (scratch.js and pre-WP-118 callers): bare Extract, fresh per-call run budget.
 * `parse(entry)` === `parseWithOutcome(entry, newRunBudget()).extract`.
 * @param {{harness:'claude'|'codex', path:string, size?:number}} entry
 * @returns {Extract}
 */
function parse(entry) {
  return parseWithOutcome(entry, newRunBudget()).extract;
}

module.exports = {
  discover,
  parse,
  parseWithOutcome,
  redact,
  rebaseInvocations,
  MAX_MSG_CHARS,
  MAX_MESSAGES,
  Limits,
  newRunBudget,
  OVERSIZED_RECORD_MARKER,
};

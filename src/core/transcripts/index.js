'use strict';

const path = require('node:path');
const { discoverClaude, parseClaudeTranscript } = require('./claude');
const { discoverCodex, parseCodexTranscript } = require('./codex');

/** @typedef {Object} Extract
 *  @property {'claude'|'codex'} harness
 *  @property {string}      session_id
 *  @property {string|null} started      // ISO ts of the first message, or null
 *  @property {string|null} cwd
 *  @property {string}      source_path  // absolute path of the transcript file
 *  @property {boolean}     truncated    // true if any size cap was applied
 *  @property {Array<{role:'user'|'assistant'|'tool_result', text:string, ts:string|null}>} messages
 *  @property {Array<{skill:string, index:number, resultIndex:number|null, errored:boolean}>} [skill_invocations]  // Claude only; each Skill tool_use: name, timeline index, its paired result's index (null if uncaptured), whether it errored
 */

const MAX_MSG_CHARS = 4000;
const MAX_MESSAGES = 2000;

// Redact secret-looking substrings. Applied in order; each replacement is
// literal `[REDACTED:<label>]` unless a function is shown.
const REDACTIONS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED:private-key]'],
  [/\bsk-ant-[A-Za-z0-9\-_]{20,}\b/g, '[REDACTED:anthropic-key]'],
  [/\bsk-[A-Za-z0-9]{20,}\b/g, '[REDACTED:openai-key]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED:aws-key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, '[REDACTED:github-token]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED:slack-token]'],
  [/\bya29\.[A-Za-z0-9\-_]+/g, '[REDACTED:google-oauth]'],
  [/\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, '[REDACTED:jwt]'],
  // HTTP auth headers: "Authorization: Bearer <token>" (space-separated form)
  [/\b(bearer)\s+([A-Za-z0-9_\-.~+/]{12,}=*)/gi, (_m, kw) => `${kw} [REDACTED:bearer-token]`],
  // sensitive key=value / key: value assignments (keeps the key, redacts the value)
  [
    /\b(api[_-]?key|secret|token|password|passwd|bearer)(["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-]{12,}/gi,
    (_m, key, sep) => `${key}${sep}[REDACTED:generic-secret]`,
  ],
];

/**
 * Redact secret-looking substrings. Exported so the dream orchestrator
 * (WP-008) reuses the SAME pass instead of re-implementing it.
 * @param {string} text
 * @returns {string}
 */
function redact(text) {
  let result = text;
  for (const [pattern, replacement] of REDACTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Discover across both harnesses.
 * @param {ReturnType<import('../paths').getPaths>} paths
 * @param {{since:number|null}} opts
 * @returns {Array<{harness:'claude'|'codex', path:string, mtimeMs:number}>}
 */
function discover(paths, opts) {
  const claudeEntries = discoverClaude(path.join(paths.claudeDir, 'projects'), opts).map((e) => ({
    harness: 'claude',
    path: e.path,
    mtimeMs: e.mtimeMs,
  }));
  const codexEntries = discoverCodex(path.join(paths.codexDir, 'sessions'), opts).map((e) => ({
    harness: 'codex',
    path: e.path,
    mtimeMs: e.mtimeMs,
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
 * Parse + redact + size-cap one discovered entry.
 * @param {{harness:'claude'|'codex', path:string}} entry
 * @returns {Extract}
 */
function parse(entry) {
  const raw = entry.harness === 'codex' ? parseCodexTranscript(entry.path) : parseClaudeTranscript(entry.path);

  let truncated = false;
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
  return out;
}

module.exports = { discover, parse, redact, rebaseInvocations, MAX_MSG_CHARS, MAX_MESSAGES };

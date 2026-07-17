'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Limits, streamLines, maxJsonDepth, OVERSIZED_RECORD_MARKER } = require('./stream');

/**
 * Discover Codex rollout files modified after `since`.
 * Layout: sessionsDir/YYYY/MM/DD/rollout-*.jsonl (recurse; match rollout-*.jsonl).
 * Missing sessionsDir → []. Sorted ascending by mtimeMs. Never throws on IO.
 * Records size/dev/ino so the quarantine ledger (WP-119/120) can fingerprint a
 * file and enforce the pre-read ceiling before opening it (ADR-0023).
 * @param {string} sessionsDir
 * @param {{since:number|null}} opts
 * @returns {Array<{path:string,mtimeMs:number,size:number,dev:number,ino:number}>}
 */
function discoverCodex(sessionsDir, opts) {
  const since = opts && opts.since != null ? opts.since : null;
  const results = [];

  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
        let stat;
        try {
          stat = fs.statSync(entryPath);
        } catch {
          continue;
        }
        if (since != null && stat.mtimeMs <= since) continue;
        results.push({ path: entryPath, mtimeMs: stat.mtimeMs, size: stat.size, dev: stat.dev, ino: stat.ino });
      }
    }
  }

  walk(sessionsDir);
  results.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return results;
}

// Trusted `message` roles — EXACTLY {user, developer}. `user` = the user's own
// prompts; `developer` = Codex-authored control/sandbox scaffolding (confirmed in
// real codex-cli 0.144.1 rollout data — NOT tool-derived). FAIL CLOSED: any other
// role — INCLUDING `system` — is DROPPED, never defaulted to trusted `user`,
// because the upstream Message.role is an untyped String with no schema
// enforcement. `system` is harness/control-plane instruction text, not
// user-authored memory content the dream needs; dropping it loses nothing
// valuable and avoids an unevidenced trust decision.
// (memo memory/research/2026-07-13-codex-transcript-role-provenance.md)
const TRUSTED_MESSAGE_ROLES = new Set(['user', 'developer']);

// Tool/external-output item types → UNTRUSTED (role 'tool_result'). Primary on
// codex-cli 0.144.x: custom_tool_call_output. Legacy/alternate variants:
// function_call_output, local_shell_call, web_search_call, tool_search_output.
// Each is a distinct response_item `type`, never a `message`.
const TOOL_OUTPUT_TYPES = new Set([
  'custom_tool_call_output',
  'function_call_output',
  'local_shell_call',
  'web_search_call',
  'tool_search_output',
]);

/** Join a message item's input_text/output_text content blocks. */
function extractMessageText(payload) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .filter((block) => block && (block.type === 'input_text' || block.type === 'output_text'))
    .map((block) => block.text)
    .join('\n');
}

/** Best-effort text from a tool-output item across the known shapes. Returns ''
 *  when no known field is present — the item is STILL emitted as tool_result
 *  (untrusted), never dropped or trusted. */
function extractToolOutputText(payload) {
  if (typeof payload.output === 'string') return payload.output;                    // legacy function_call_output
  if (payload.output && typeof payload.output.content === 'string') return payload.output.content; // FunctionCallOutputPayload struct
  if (Array.isArray(payload.content)) {                                             // observed custom_tool_call_output 0.144.x
    return payload.content
      .filter((block) => block && (block.type === 'input_text' || block.type === 'output_text'))
      .map((block) => block.text)
      .join('\n');
  }
  return ''; // unverified variant field shape — tagged tool_result regardless
}

/**
 * Map one response_item payload to a message, or null if it produces none.
 * Verified against codex-cli 0.144.1 + upstream openai/codex source
 * (memo memory/research/2026-07-13-codex-transcript-role-provenance.md).
 * @param {Object} payload
 * @returns {{role:'user'|'assistant'|'tool_result', text:string, ts:null}|null}
 */
function mapCodexItem(payload) {
  if (!payload) return null;
  if (payload.type === 'message') {
    if (payload.role === 'assistant') {
      return { role: 'assistant', text: extractMessageText(payload), ts: null };
    }
    if (TRUSTED_MESSAGE_ROLES.has(payload.role)) {
      return { role: 'user', text: extractMessageText(payload), ts: null };
    }
    return null; // FAIL CLOSED: unknown/absent role → drop, never trust
  }
  if (TOOL_OUTPUT_TYPES.has(payload.type)) {
    return { role: 'tool_result', text: extractToolOutputText(payload), ts: null };
  }
  return null;
}

/** A valid but EMPTY extract for quarantine outcomes (over-ceiling /
 *  too-many-lines / read-error): no messages, basename session id, truncated.
 *  @param {string} filePath @returns {import('./index').Extract} */
function emptyCodexExtract(filePath) {
  return {
    harness: 'codex',
    session_id: path.basename(filePath, '.jsonl'),
    started: null,
    cwd: null,
    source_path: path.resolve(filePath),
    truncated: true,
    messages: [],
  };
}

/**
 * Parse one Codex rollout file into a RAW Extract, per the Codex rules, via
 * the bounded streaming reader (audit A6, ADR-0023) — never reads the whole
 * file into memory, and a file over the pre-read ceiling is never opened.
 * UNVERIFIED against live Codex CLI — re-verify at M4 (WP-010).
 * @param {string} filePath
 * @param {number} sizeBytes  discovery-recorded fs size
 * @param {{remaining:number}} budget  shared run budget from newRunBudget()
 * @returns {{extract: import('./index').Extract,
 *            parse: {outcome: import('./stream').StreamOutcome, oversizedRecords: number, runExhausted: boolean}}}
 */
function parseCodexTranscript(filePath, sizeBytes, budget) {
  const messages = [];
  let sessionId = null;
  let cwd = null;
  let started = null;
  let truncated = false;

  /** Exactly the old per-line loop body; an oversized record emits no message.
   *  @param {string} line */
  const onLine = (line) => {
    if (line === OVERSIZED_RECORD_MARKER) {
      truncated = true; // a real item was dropped — skip mapCodexItem
      return;
    }
    if (line.trim() === '') return;
    if (maxJsonDepth(line) > Limits.MAX_JSON_DEPTH) return; // nesting bomb → skip
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }

    if (obj.type === 'session_meta') {
      const payload = obj.payload || {};
      if (sessionId === null) sessionId = payload.id || null;
      if (started === null) started = payload.timestamp || null;
      if (cwd === null) cwd = payload.cwd || null;
      return;
    }

    if (obj.type !== 'response_item') return;

    const mapped = mapCodexItem(obj.payload);
    if (mapped) messages.push(mapped);
  };

  const streamed = streamLines(filePath, sizeBytes, budget, onLine);
  const parseOutcome = {
    outcome: streamed.outcome,
    oversizedRecords: streamed.oversizedRecords,
    runExhausted: streamed.runExhausted,
  };

  if (streamed.outcome !== 'ok') {
    return { extract: emptyCodexExtract(filePath), parse: parseOutcome };
  }
  if (streamed.runExhausted) truncated = true; // file cut mid-way (deferred, not quarantined)

  if (sessionId === null) {
    sessionId = path.basename(filePath, '.jsonl');
  }

  return {
    extract: {
      harness: 'codex',
      session_id: sessionId,
      started,
      cwd,
      source_path: path.resolve(filePath),
      truncated,
      messages,
    },
    parse: parseOutcome,
  };
}

module.exports = { discoverCodex, parseCodexTranscript, mapCodexItem };

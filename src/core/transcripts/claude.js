'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Limits, streamLines, maxJsonDepth, OVERSIZED_RECORD_MARKER } = require('./stream');

/**
 * Discover Claude session files modified after `since`.
 * Layout: projectsDir/<sanitized>/<uuid>.jsonl (one dir level, then files).
 * Missing projectsDir → []. Non-.jsonl files ignored. Never throws on IO.
 * Records size/dev/ino so the quarantine ledger (WP-119/120) can fingerprint a
 * file and enforce the pre-read ceiling before opening it (ADR-0023).
 * @param {string} projectsDir
 * @param {{since: number|null}} opts   epoch ms; null = all files
 * @returns {Array<{path:string, mtimeMs:number, size:number, dev:number, ino:number}>}  sorted ascending by mtimeMs
 */
function discoverClaude(projectsDir, opts) {
  const since = opts && opts.since != null ? opts.since : null;
  const results = [];
  let sessionDirs;
  try {
    sessionDirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const dirEntry of sessionDirs) {
    if (!dirEntry.isDirectory()) continue;
    const dirPath = path.join(projectsDir, dirEntry.name);
    let files;
    try {
      files = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const fileEntry of files) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith('.jsonl')) continue;
      const filePath = path.join(dirPath, fileEntry.name);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      if (since != null && stat.mtimeMs <= since) continue;
      results.push({ path: filePath, mtimeMs: stat.mtimeMs, size: stat.size, dev: stat.dev, ino: stat.ino });
    }
  }
  results.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return results;
}

/**
 * Flatten a tool_result block's content into a string.
 * @param {string|Array<{type:string, text?:string}>} content
 * @returns {string}
 */
function flattenToolResultContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block && block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }
  return '';
}

// Strict control-plane identifier grammar for skill names (fully anchored,
// JS `$` needs no `m` flag): lowercase kebab, 1-64 chars. Verified against a
// live Claude Code transcript (~/.claude/projects/…): a Skill invocation is
// an assistant tool_use block `{"name":"Skill","input":{"skill":"<name>"}}`,
// and its paired user-message tool_result carries `tool_use_id` + `is_error`.
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** A valid but EMPTY extract for quarantine outcomes (over-ceiling /
 *  too-many-lines / read-error): no messages, basename session id, truncated.
 *  @param {string} filePath @returns {import('./index').Extract} */
function emptyClaudeExtract(filePath) {
  return {
    harness: 'claude',
    session_id: path.basename(filePath, '.jsonl'),
    started: null,
    cwd: null,
    source_path: path.resolve(filePath),
    truncated: true,
    messages: [],
    skill_invocations: [],
  };
}

/**
 * Parse one Claude JSONL file into a RAW (un-redacted, un-capped) Extract via
 * the bounded streaming reader (audit A6, ADR-0023) — never reads the whole
 * file into memory, and a file over the pre-read ceiling is never opened.
 * @param {string} filePath
 * @param {number} sizeBytes  discovery-recorded fs size
 * @param {{remaining:number}} budget  shared run budget from newRunBudget()
 * @returns {{extract: import('./index').Extract,
 *            parse: {outcome: import('./stream').StreamOutcome, oversizedRecords: number, runExhausted: boolean}}}
 */
function parseClaudeTranscript(filePath, sizeBytes, budget) {
  const messages = [];
  const skillInvocations = [];
  const pendingByToolUseId = new Map(); // tool_use_id -> index in skillInvocations
  let sessionId = null;
  let cwd = null;
  let truncated = false;

  /** Exactly the old per-line loop body; an oversized record emits no message
   *  (just as a JSON.parse failure does), so the skill-invocation index /
   *  resultIndex alignment to `messages` is unchanged (WP-080/084/087).
   *  @param {string} line */
  const onLine = (line) => {
    if (line === OVERSIZED_RECORD_MARKER) {
      truncated = true; // a real message was dropped
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

    if (obj.type !== 'user' && obj.type !== 'assistant') return;

    if (sessionId === null && obj.sessionId) sessionId = obj.sessionId;
    if (cwd === null && obj.cwd) cwd = obj.cwd;

    if (obj.type === 'user') {
      if (obj.isMeta === true) return;
      const content = obj.message && obj.message.content;
      if (typeof content === 'string') {
        messages.push({ role: 'user', text: content, ts: obj.timestamp || null });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block && block.type === 'tool_result') {
            messages.push({
              role: 'tool_result',
              text: flattenToolResultContent(block.content),
              ts: obj.timestamp || null,
            });
            const pos = pendingByToolUseId.get(block.tool_use_id);
            if (pos !== undefined) {
              // The paired result's OWN message index (just pushed) — WP-084
              // excludes exactly this message from window-taint. Id-pairing,
              // not position, is authoritative.
              skillInvocations[pos].resultIndex = messages.length - 1;
              if (block.is_error === true) skillInvocations[pos].errored = true;
            }
          }
        }
      }
    } else if (obj.type === 'assistant') {
      const content = obj.message && obj.message.content;
      if (Array.isArray(content)) {
        const text = content
          .filter((block) => block && block.type === 'text')
          .map((block) => block.text)
          .join('\n\n');
        if (text !== '') {
          messages.push({ role: 'assistant', text, ts: obj.timestamp || null });
        }
        for (const block of content) {
          if (block && block.type === 'tool_use' && block.name === 'Skill') {
            const input = block.input || {};
            // Emit ONLY a grammar-conforming input.skill. No input.command
            // fallback, no "unknown" placeholder — a bad/absent name means no
            // entry for this block.
            if (typeof input.skill !== 'string' || !SKILL_NAME_RE.test(input.skill)) continue;
            // index = the invocation's place in the message timeline (0-based
            // position of the first message emitted after this assistant
            // turn). resultIndex is filled in above, when the paired
            // tool_result is pushed.
            const pos =
              skillInvocations.push({ skill: input.skill, index: messages.length, resultIndex: null, errored: false }) - 1;
            if (block.id) pendingByToolUseId.set(block.id, pos);
          }
        }
      }
    }
  };

  const streamed = streamLines(filePath, sizeBytes, budget, onLine);
  const parseOutcome = {
    outcome: streamed.outcome,
    oversizedRecords: streamed.oversizedRecords,
    runExhausted: streamed.runExhausted,
  };

  if (streamed.outcome !== 'ok') {
    return { extract: emptyClaudeExtract(filePath), parse: parseOutcome };
  }
  if (streamed.runExhausted) truncated = true; // file cut mid-way (deferred, not quarantined)

  if (sessionId === null) {
    sessionId = path.basename(filePath, '.jsonl');
  }

  const started = messages.length > 0 ? messages[0].ts : null;

  return {
    extract: {
      harness: 'claude',
      session_id: sessionId,
      started,
      cwd,
      source_path: path.resolve(filePath),
      truncated,
      messages,
      skill_invocations: skillInvocations,
    },
    parse: parseOutcome,
  };
}

module.exports = { discoverClaude, parseClaudeTranscript };

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Discover Codex rollout files modified after `since`.
 * Layout: sessionsDir/YYYY/MM/DD/rollout-*.jsonl (recurse; match rollout-*.jsonl).
 * Missing sessionsDir → []. Sorted ascending by mtimeMs. Never throws on IO.
 * @param {string} sessionsDir
 * @param {{since:number|null}} opts
 * @returns {Array<{path:string,mtimeMs:number}>}
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
        results.push({ path: entryPath, mtimeMs: stat.mtimeMs });
      }
    }
  }

  walk(sessionsDir);
  results.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return results;
}

/**
 * Map one response_item payload to a message, or null if it produces none.
 * Isolated so M4 (WP-010) can correct field names cheaply against a live
 * Codex CLI machine — this shape is UNVERIFIED against real output.
 * @param {Object} payload
 * @returns {{role:'user'|'assistant'|'tool_result', text:string, ts:null}|null}
 */
function mapCodexItem(payload) {
  if (!payload) return null;
  if (payload.type === 'message') {
    const role = payload.role === 'assistant' ? 'assistant' : 'user';
    const content = Array.isArray(payload.content) ? payload.content : [];
    const text = content
      .filter((block) => block && (block.type === 'input_text' || block.type === 'output_text'))
      .map((block) => block.text)
      .join('\n');
    return { role, text, ts: null };
  }
  if (payload.type === 'function_call_output') {
    return { role: 'tool_result', text: payload.output, ts: null };
  }
  return null;
}

/**
 * Parse one Codex rollout file into a RAW Extract, per the Codex rules.
 * UNVERIFIED against live Codex CLI — re-verify at M4 (WP-010).
 * @param {string} filePath
 * @returns {import('./index').Extract}
 */
function parseCodexTranscript(filePath) {
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    raw = '';
  }

  const lines = raw.split('\n');
  const messages = [];
  let sessionId = null;
  let cwd = null;
  let started = null;

  for (const line of lines) {
    if (line.trim() === '') continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.type === 'session_meta') {
      const payload = obj.payload || {};
      if (sessionId === null) sessionId = payload.id || null;
      if (started === null) started = payload.timestamp || null;
      if (cwd === null) cwd = payload.cwd || null;
      continue;
    }

    if (obj.type !== 'response_item') continue;

    const mapped = mapCodexItem(obj.payload);
    if (mapped) messages.push(mapped);
  }

  if (sessionId === null) {
    sessionId = path.basename(filePath, '.jsonl');
  }

  return {
    harness: 'codex',
    session_id: sessionId,
    started,
    cwd,
    source_path: path.resolve(filePath),
    truncated: false,
    messages,
  };
}

module.exports = { discoverCodex, parseCodexTranscript, mapCodexItem };

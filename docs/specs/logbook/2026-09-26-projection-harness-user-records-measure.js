#!/usr/bin/env node
'use strict';
// RE-MEASUREMENT for WP-dream-projection-harness-user-records — COUNTS ONLY.
//
//   node docs/specs/logbook/2026-09-26-projection-harness-user-records-measure.js [--days N] [--projects DIR]
//
// Runs THIS TREE's Claude parser and primary-dialogue projection over the local
// Claude transcripts (default: ~/.claude/projects, every file modified in the
// last N days; N defaults to 5; --days 0 means every file) — the same
// one-directory-level layout `discoverClaude` reads. For every Claude `user`
// record it reports, by class, how many the projection ACCEPTS as a user
// message and how many characters that is, plus the structural fields the
// work package's Table H reads.
//
// PRIVACY: it prints no transcript text, no path, no session id. A record's
// class is decided by a fixed prefix test and printed only as one of the fixed
// labels below. A field value is printed only if it matches /^[a-z_-]{1,32}$/
// (a harness enum); anything else prints as "(other)". The assistant sequence
// is printed only as a count, a character total and a SHA-256 digest, so two
// runs (before and after a change) can be compared without reading any of it.
//
// EXIT STATUS: 1 when any file is in Table G row G1's state — it projects at
// least one assistant reply and no user message, while its raw timeline holds
// a user-role record (a `user` record with string content and no `isMeta`) —
// the state a harness field change puts every session in, and the one the
// collector sets aside as `no-request` (revision 2 of the design round);
// else 0. The last line says which.
//
// It is inert: no dependency, no network, no write; neither `npm test` nor
// `npm run lint` collects it. Its class labels are a MEASUREMENT device over
// text prefixes; the product rule (Table H) never reads text.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const repo = path.resolve(__dirname, '..', '..', '..');
const { parseClaudeTranscript } = require(path.join(repo, 'src/core/transcripts/claude.js'));
const { newRunBudget } = require(path.join(repo, 'src/core/transcripts/stream.js'));
const { createPrimaryProjection } = require(path.join(repo, 'src/core/transcripts/primary-dialogue.js'));

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const days = Number(opt('--days', '5'));
const projectsDir = opt('--projects', path.join(os.homedir(), '.claude', 'projects'));
const since = days > 0 ? Date.now() - days * 864e5 : null;

/** @param {string} text @returns {string} one fixed label */
function classOf(text) {
  if (text.startsWith('<task-notification')) return 'notification';
  if (/^<(command-name|command-message|local-command-stdout|local-command-caveat)/.test(text)) return 'command-echo';
  if (/^<bash-(input|stdout|stderr)/.test(text)) return 'bash-mode';
  if (/^<[a-z]/.test(text)) return 'other-tag';
  return 'untagged';
}
/** @param {*} v @returns {string} */
const enumOf = (v) => (v === undefined ? 'ABSENT' : typeof v === 'string' && /^[a-z_-]{1,32}$/.test(v) ? v : '(other)');

const files = [];
let dirs = [];
try { dirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { /* none */ }
for (const d of dirs) {
  if (!d.isDirectory()) continue;
  let entries = [];
  try { entries = fs.readdirSync(path.join(projectsDir, d.name), { withFileTypes: true }); } catch { continue; }
  for (const f of entries) {
    if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
    const p = path.join(projectsDir, d.name, f.name);
    const st = fs.statSync(p);
    if (since === null || st.mtimeMs > since) files.push({ p, size: st.size });
  }
}

const rows = new Map(); // key -> {accepted, chars}
const bump = (key, chars) => {
  const r = rows.get(key) || { accepted: 0, chars: 0 };
  r.accepted += 1;
  r.chars += chars;
  rows.set(key, r);
};
const versions = new Set();
let userRecords = 0;
let assistantCount = 0;
let assistantChars = 0;
let filesWithReplies = 0;
let repliesWithoutRequests = 0;
let setAside = 0;
const digest = crypto.createHash('sha256');

for (const { p, size } of files) {
  const proj = createPrimaryProjection('claude');
  let rawUser = 0;
  const observer = {
    lost: () => proj.lost(),
    record: (obj) => {
      const before = proj.messages.length;
      const taintBefore = proj.tainted();
      proj.record(obj);
      const isUser = obj && typeof obj === 'object' && obj.type === 'user';
      if (isUser) {
        userRecords += 1;
        if (obj.isMeta !== true && obj.message && typeof obj.message.content === 'string') rawUser += 1;
        if (typeof obj.version === 'string' && /^\d+\.\d+\.\d+$/.test(obj.version)) versions.add(obj.version);
      }
      if (proj.messages.length === before) return;
      const m = proj.messages[proj.messages.length - 1];
      if (m.role === 'assistant') {
        assistantCount += 1;
        assistantChars += m.text.length;
        digest.update(`${m.derived_from_untrusted}\u0000${m.text}\u0001`);
        return;
      }
      const origin = obj.origin === undefined ? 'ABSENT'
        : obj.origin && typeof obj.origin === 'object' && !Array.isArray(obj.origin) ? `kind=${enumOf(obj.origin.kind)}` : '(other)';
      bump([classOf(m.text), `promptSource=${enumOf(obj.promptSource)}`, `origin=${origin}`,
        `taintBefore=${taintBefore}`].join(' | '), m.text.length);
    },
  };
  parseClaudeTranscript(p, size, newRunBudget(), observer);
  if (proj.messages.some((m) => m.role === 'assistant')) {
    filesWithReplies += 1;
    if (!proj.messages.some((m) => m.role === 'user')) {
      repliesWithoutRequests += 1;
      if (rawUser > 0) setAside += 1;
    }
  }
}

const sortedVersions = [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
console.log(`files ${files.length} | user records ${userRecords} | harness versions ${sortedVersions[0] || '-'} .. ${sortedVersions[sortedVersions.length - 1] || '-'}`);
console.log('ACCEPTED user messages, by class | promptSource | origin | taint state before the record:');
for (const key of [...rows.keys()].sort()) {
  const r = rows.get(key);
  console.log(`${String(r.accepted).padStart(6)} msgs ${String(r.chars).padStart(9)} chars  ${key}`);
}
const byClass = new Map();
for (const [key, r] of rows) {
  const c = key.split(' | ')[0];
  const t = byClass.get(c) || { accepted: 0, chars: 0 };
  t.accepted += r.accepted;
  t.chars += r.chars;
  byClass.set(c, t);
}
console.log('ACCEPTED user messages, by class:');
for (const c of ['notification', 'command-echo', 'bash-mode', 'other-tag', 'untagged']) {
  const t = byClass.get(c) || { accepted: 0, chars: 0 };
  console.log(`${String(t.accepted).padStart(6)} msgs ${String(t.chars).padStart(9)} chars  ${c}`);
}
console.log(`assistant messages ${assistantCount} | chars ${assistantChars} | sha256 ${digest.digest('hex').slice(0, 16)}`);
console.log(`files with replies ${filesWithReplies} | of them with no user message ${repliesWithoutRequests} | of those the collector would set aside ${setAside}`);
if (setAside > 0) {
  console.log('SET ASIDE AS no-request: at least one file gives assistant replies and none of the person\'s messages');
  process.exitCode = 1;
} else {
  console.log('no file would be set aside as no-request');
}
